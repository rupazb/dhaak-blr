#!/usr/bin/env python3
"""
build_seed.py - Dhaak's equivalent of Niram's prepare_patient_routes.py.

  1. Loads the pandal list from either
       - the live Google Sheet (CSV export link, --sheet-csv URL), or
       - the research seed in data/seed_pandals.py (default)
  2. Cleans/normalises it (zones, entry policy, buzz tier from source count)
  3. Optionally re-geocodes low-confidence pins via OpenStreetMap Nominatim (--geocode)
     - run this on your own machine; it respects Nominatim's 1 req/sec policy
  4. Writes:
       data/pandals.csv        -> paste/import into the Sheet's "Pandals" tab
       data/events.csv         -> the "Events" tab
       data/pandals.geojson    -> offline snapshot / QGIS
       data/seed.js            -> what index.html loads in demo/offline mode
  5. Optionally pushes everything to the Sheet through the Apps Script Web App (--push)

Usage:
  python scripts/build_seed.py
  python scripts/build_seed.py --geocode
  python scripts/build_seed.py --push https://script.google.com/macros/s/XXXX/exec --admin-key YOUR_KEY
  python scripts/build_seed.py --sheet-csv "https://docs.google.com/spreadsheets/d/<id>/export?format=csv&gid=0"
"""
import argparse, csv, io, json, math, os, sys, time, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
sys.path.insert(0, DATA)

COLUMNS = ["id", "name", "short_name", "area", "zone", "venue", "latitude", "longitude", "coord_confidence",
           "since_year", "edition_2026", "type", "entry", "known_for", "theme_2026", "highlights_2026",
           "nearest_metro", "bhog", "pet_friendly", "parking", "buzz_tier", "status_2026", "photo_url",
           "website", "sources", "last_verified", "verified_by"]
EVENT_COLUMNS = ["pandal_id", "date", "start", "end", "title", "kind", "time_confirmed", "source"]

BLR_BBOX = (12.70, 77.35, 13.25, 77.90)  # rough Bengaluru urban extent, used to sanity-check geocodes
NOMINATIM = "https://nominatim.openstreetmap.org/search"
UA = "dhaak-pujo-map/0.1 (open-source Durga Puja map for Bengaluru)"


def haversine_km(a, b):
    R = 6371.0
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))


def buzz_tier(sources):
    """How widely the pujo is covered by guides/reels - a transparent proxy, NOT a rating."""
    n = len([s for s in str(sources).split(",") if s.strip()])
    return 3 if n >= 6 else 2 if n >= 3 else 1


def normalise_entry(raw):
    r = (raw or "").lower()
    if "restricted" in r or "defence" in r:
        return "Restricted"
    if "resident" in r or "member" in r:
        return "Residents first"
    if "unclear" in r or not r:
        return "Unknown"
    return "Open to all"


def load_seed():
    from seed_pandals import P, SOURCES
    from seed_events import E
    return [dict(p) for p in P], [dict(e) for e in E], SOURCES


def load_sheet_csv(url):
    with urllib.request.urlopen(url, timeout=30) as r:
        text = r.read().decode("utf-8")
    return list(csv.DictReader(io.StringIO(text)))


def geocode(query):
    params = urllib.parse.urlencode({"q": query, "format": "json", "limit": 1, "countrycodes": "in",
                                     "viewbox": "77.35,13.25,77.90,12.70", "bounded": 1})
    req = urllib.request.Request(f"{NOMINATIM}?{params}", headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=20) as r:
        res = json.loads(r.read().decode("utf-8"))
    return (float(res[0]["lat"]), float(res[0]["lon"]), res[0]["display_name"]) if res else None


def refine_coordinates(rows, max_shift_km=6.0):
    """Try venue+area, then area alone. Accept a hit only if it is inside Bengaluru and,
    when we already had an estimate, within max_shift_km of it (guards against a
    same-named hall in another part of the city)."""
    for p in rows:
        if p.get("coord_confidence") == "high":
            continue
        venue = str(p.get("venue", "")).split("(")[0].strip()
        queries = [f"{venue}, {p['area']}, Bengaluru", f"{p['area']}, Bengaluru"]
        for i, q in enumerate(queries):
            try:
                hit = geocode(q)
            except Exception as e:  # network hiccup: keep the estimate
                print(f"  ! {p['id']} geocode failed: {e}")
                hit = None
            time.sleep(1.1)  # Nominatim usage policy
            if not hit:
                continue
            lat, lng, label = hit
            if not (BLR_BBOX[0] <= lat <= BLR_BBOX[2] and BLR_BBOX[1] <= lng <= BLR_BBOX[3]):
                continue
            if p.get("latitude") not in ("", None):
                shift = haversine_km((float(p["latitude"]), float(p["longitude"])), (lat, lng))
                if shift > max_shift_km:
                    print(f"  ~ {p['id']} rejected hit {shift:.1f} km away: {label[:70]}")
                    continue
            p["latitude"], p["longitude"] = round(lat, 6), round(lng, 6)
            p["coord_confidence"] = "geocoded-venue" if i == 0 else "geocoded-area"
            print(f"  + {p['id']} -> {p['coord_confidence']}: {label[:70]}")
            break
    return rows


def clean(rows):
    out = []
    for p in rows:
        r = {c: p.get(c, "") for c in COLUMNS}
        r["entry"] = normalise_entry(r["entry"])
        r["buzz_tier"] = r["buzz_tier"] or buzz_tier(r["sources"])
        for k in ("latitude", "longitude"):
            r[k] = "" if r[k] in ("", None) else round(float(r[k]), 6)
        r["last_verified"] = r["last_verified"] or "2026-10-14"
        r["verified_by"] = r["verified_by"] or "seed-research"
        out.append(r)
    return out


def write_outputs(pandals, events, sources):
    with open(os.path.join(DATA, "pandals.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=COLUMNS); w.writeheader(); w.writerows(pandals)
    with open(os.path.join(DATA, "events.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=EVENT_COLUMNS); w.writeheader(); w.writerows(events)
    fc = {"type": "FeatureCollection", "features": [
        {"type": "Feature", "geometry": {"type": "Point", "coordinates": [p["longitude"], p["latitude"]]},
         "properties": {k: v for k, v in p.items() if k not in ("latitude", "longitude")}}
        for p in pandals if p["latitude"] != ""]}
    with open(os.path.join(DATA, "pandals.geojson"), "w", encoding="utf-8") as f:
        json.dump(fc, f, ensure_ascii=False, indent=1)
    seed = {"generated": time.strftime("%Y-%m-%dT%H:%M:%S"), "pandals": pandals, "events": events, "sources": sources}
    with open(os.path.join(DATA, "seed.js"), "w", encoding="utf-8") as f:
        f.write("// Auto-generated by scripts/build_seed.py - do not edit by hand; edit the Sheet or data/seed_*.py\n")
        f.write("window.DHAAK_SEED = " + json.dumps(seed, ensure_ascii=False) + ";\n")


def push(url, admin_key, pandals, events):
    body = json.dumps({"action": "admin_bulk_upsert", "admin_key": admin_key,
                       "pandals": pandals, "events": events}).encode("utf-8")
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "text/plain;charset=utf-8"})
    with urllib.request.urlopen(req, timeout=60) as r:
        print("  Sheet responded:", r.read().decode("utf-8")[:300])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sheet-csv", help="Published CSV export URL of the Pandals tab (read from the live Sheet)")
    ap.add_argument("--geocode", action="store_true", help="Refine low-confidence pins with Nominatim")
    ap.add_argument("--push", help="Apps Script Web App URL to write the cleaned data into the Sheet")
    ap.add_argument("--admin-key", default=os.environ.get("DHAAK_ADMIN_KEY", ""))
    a = ap.parse_args()

    seed_pandals, events, sources = load_seed()
    rows = load_sheet_csv(a.sheet_csv) if a.sheet_csv else seed_pandals
    print(f"Loaded {len(rows)} pandals from {'Sheet' if a.sheet_csv else 'seed'}")
    if a.geocode:
        rows = refine_coordinates(rows)
    pandals = clean(rows)
    write_outputs(pandals, events, sources)

    located = [p for p in pandals if p["latitude"] != ""]
    by_zone = {}
    for p in pandals:
        by_zone[p["zone"]] = by_zone.get(p["zone"], 0) + 1
    print(f"Wrote data/ outputs: {len(pandals)} pandals ({len(located)} on map, {len(pandals)-len(located)} need a pin), {len(events)} events")
    print("  by zone:", ", ".join(f"{k} {v}" for k, v in sorted(by_zone.items())))
    print("  buzz tiers:", {t: sum(1 for p in pandals if int(p['buzz_tier']) == t) for t in (3, 2, 1)})
    print("  coord confidence:", {c: sum(1 for p in pandals if p['coord_confidence'] == c) for c in sorted({p['coord_confidence'] for p in pandals})})
    if a.push:
        if not a.admin_key:
            sys.exit("--push needs --admin-key (or DHAAK_ADMIN_KEY) matching ADMIN_KEY in the Apps Script")
        push(a.push, a.admin_key, pandals, events)


if __name__ == "__main__":
    main()
