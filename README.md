# Dhaak — Bengaluru Pujo Live (ঢাক)

An open-source live map of Durga Pujas in Bengaluru for Prabashi Bengalis:

- **Directory**: 71 pujos with venue, history, entry rules, bhog, metro, parking and sources. 59 have map pins; 12 still need one.
- **Live pulse**: a Rapido/Uber-style map that shows which pandals are busy right now. It is built from GPS-verified crowd check-ins, committee updates and photos.
- **Route planner** that knows about crowds: give it N pandals and it finds the fastest order. Unlike Google Maps, it accounts for the time of day, how long the queue at each pandal will be when you arrive, and scheduled moments like Sandhi Puja or a cultural night.
- **"Plan my evening"**: tell it how many hours you have and what you like, and it picks the pujos and the order.

It uses the same architecture as the Niram route planner: a Google Sheet is the database, an Apps Script Web App is the API, and the front end is a static Leaflet page.

---

## 1. Architecture

```
            Google Sheet  (single source of truth)
   Pandals | Events | CheckIns | Ratings | Updates | Committees | Corrections | Submissions
        |  read (GET ?action=bootstrap / ?action=pulse, cached 30 s)     ^ write (POST, text/plain JSON)
        v                                                                 |
   index.html  ──────────────────────────────────────────────────────────┘
   (Leaflet map + heat layer, Live / Explore / Plan / Contribute tabs,
    polls the pulse every 45 s)
        |                         \
        | road times              \ crowd model + optimiser run in the browser
        v                          v
   OSRM table/route  (free, no key)    js/engine.js  (Held–Karp exact ≤12 stops, local search ≤25)
   or OpenRouteService (key — as in Niram)

   scripts/build_seed.py ── seed / Sheet CSV ──> clean, (geocode), data/pandals.csv, events.csv, seed.js, pandals.geojson
                                             └─> --push to the Sheet through the Apps Script (admin key)
```

**What changed compared with Niram**

| | Niram | Dhaak |
|---|---|---|
| Reads | Sheets API with an API key | The Apps Script `doGet` returns JSON, so no key is exposed. The Sheet stays private |
| Writes | Apps Script, `no-cors`, so success messages were assumed | Apps Script with a `text/plain` POST. The browser **can read the reply**, so it gets real confirmations |
| Routing | ORS `/optimization` (VROOM) + `/directions` | In-browser optimiser that takes time of day into account. Road times come from the OSRM table (or the ORS matrix). Geometry comes from OSRM/ORS |
| Depot | Hospital, fixed start and end | Your GPS position or a pin. You can end anywhere, back at the start, or at a pin |
| Offline step | `prepare_patient_routes.py` assigns weekdays | `build_seed.py` cleans the data, optionally geocodes it, and pushes it to the Sheet |

## 2. Files

| File | Role |
|---|---|
| `index.html`, `css/dhaak.css` | Page shell and styling (lal-paar sari palette, light and dark themes, mobile bottom sheet) |
| `js/app.js` | All UI: map, live feed, explore, detail, planner, contribute forms, polling, demo mode |
| `js/engine.js` | Pure logic shared by the browser and Node: IST calendar, traffic model, crowd model, route simulation, exact and heuristic solvers, "plan within budget" |
| `backend/google_apps_script.gs` | The API. Deployment steps are in its header |
| `scripts/build_seed.py` | Builds and validates the data, can geocode it, and can push it to the Sheet |
| `data/seed_pandals.py`, `data/seed_events.py` | Research snapshot with a source cited for every row |
| `data/pandals.csv`, `data/events.csv` | Import these into the Sheet tabs |
| `data/seed.js`, `data/pandals.geojson` | Offline/demo data and a GIS snapshot |
| `tests/engine.test.js`, `tests/backend.test.js` | `node tests/engine.test.js` checks the optimiser against brute force, time windows, the crowd model, live override and budget. `node tests/backend.test.js` runs the Apps Script against a mocked Sheet (auth, check-in verification, cooldown, formula injection, ratings, date cells) |
| `vendor/leaflet/` | Leaflet 1.9.4 + leaflet.heat bundled locally, so there is no dependency on a CDN |

## 3. Running it

**Demo (no setup):** serve the folder (`python -m http.server`) and open `http://localhost:8000`, or push it to GitHub Pages.
- In demo mode the pandal data is real, but the crowd pulse is simulated from the model. It is clearly labelled as such.
- The time menu in the header lets you preview Saptami/Ashtami nights before the puja starts.

**Live:**
1. Create a Google Sheet. Paste `backend/google_apps_script.gs` into Extensions → Apps Script, then run `setup()`.
2. Under Script properties, set `ADMIN_KEY`. Optionally set `PHOTO_FOLDER_ID`, a Drive folder for check-in photos.
3. Deploy it as a Web App (Execute as: Me; Who has access: Anyone), and copy the `/exec` URL.
4. `python scripts/build_seed.py --push <exec URL> --admin-key <ADMIN_KEY>`. This seeds Pandals and Events.
5. Paste the URL into `CONFIG.APPS_SCRIPT_URL` at the top of `js/app.js`, then deploy the folder (GitHub Pages, Netlify or Vercel).
6. Give committees posting rights. In the Apps Script editor run `addCommittee('BLR007', '<pin>', '<contact>')`; only a hash of the PIN is stored.
7. Fix the pins. Run `python scripts/build_seed.py --geocode` on your laptop to snap pins to OpenStreetMap, then work through the **Corrections** tab as users submit fixes.

## 4. How the optimiser beats a plain "optimise waypoints"

For each candidate order, `engine.simulate()` steps through the evening:

```
drive(i→j) = free-flow road time × traffic(hour of departure, vehicle)      // 2.0× at 6–8 pm, 1.4× midday
arrive  → + parking (8 min by car, 3 by two-wheeler; ×1.5 at landmark pujos)
        → if this pujo has a must-catch moment: wait if it hasn't started (≤60 min); if you'd miss it, add a 45-min-equivalent penalty
        → queue = f(crowd level at arrival, popularity tier)
               crowd level = model(puja day × hour × tier), blended with live check-ins if arrival is within ~90 min
        → + time inside the pandal (15 / 25 / 45 min)
        → arriving after 11:30 pm is heavily penalised (pandals wind down)
```

- **≤12 stops:** a Held–Karp dynamic programme over (visited set, last stop). Because waiting at a stop is allowed, the result is the proven optimum for this model. It takes about 20 ms. Tests check it against brute force.
- **13–25 stops:** nearest-neighbour, then 2-opt and or-opt on the full simulation. On 11-stop tests it lands within about 0–1.3% of the exact answer.
- **Plan my evening** is an orienteering problem. It inserts stops greedily by score ÷ extra minutes until the time budget runs out, then orders them exactly. The score combines popularity tier, your interests (landmark, heritage, theme, bhog, cultural night, open to all), live buzz, and a discount for unconfirmed pujos or approximate pins.
- The result shows the time saved compared with "the order you picked", Google Maps links (split into chunks of 9 waypoints), a cab deep link for each stop, and a WhatsApp share.

The traffic multipliers (`TRAFFIC_BY_HOUR`) and the crowd curve (`HOUR_CURVE`, the day factors) are **hand-set first guesses**, kept at the top of `engine.js` so they're easy to tune. After the first puja nights, refit them from real check-ins: average reported crowd by pujo × hour gives `HOUR_CURVE` directly.

## 5. Data notes (please read)

- **Sources:** two 2026 guides (mytravellingstilettos.com, updated 12 Oct; pujo.newzchain.com, 8 Oct), Asianet's 2026 guide, 2025 listicles, older lists that give founding years, organiser sites, and **four Instagram reels shared by Rupaz (R1–R4)**. Every row lists its source keys.
- **Coordinates are estimates.** Only Sanskritik's pin is high confidence (decoded from a plus code); 6 more are medium. Pins are drawn with a dashed border until they're verified. Run `--geocode` and collect corrections from users.
- **Venues move every year.** BARSHA moved to E-City and BDPC appears at Manpho, Nagavara, and possibly also at Palace Ground. KARBA is at Elaan Convention Centre. The app shows the latest venue and a note on any conflict.
- **"Buzz tier"** counts how many guides or reels mention a pujo. It is *not* a quality rating. Real ratings start this year, and Ratings keeps one row per year, so a track record builds up.
- **Rejected source:** the reel "20 Durga Puja Pandals to Visit in Bengaluru" (@miles_over_map). It lists famous **Kolkata** pujos (Ekdalia Evergreen, Naktala Udayan Sangha, Jodhpur Park, Tridhara, Deshapriya Park, Santoshpur Lake Pally, Salt Lake…) placed in Bangalore neighbourhoods. None of them can be found in any Bangalore source, so it looks AI-generated, and none were added.
- **Dates (2026):**
  - Panchami 15 Oct, Shashthi 16, Saptami 18, Ashtami 19, Navami 20, Dashami 21. Some pujos following the Gupta Press panjika treat 17 as Saptami.
  - Sandhi Puja is 10:28–11:16 am on 19 Oct (Belur Math timing).
  - Events marked "time TBC" have a confirmed date but an approximate time.

## 6. Known limitations / next steps

- **Apps Script quotas:** a Web App handles about 30 concurrent executions. The 30-second bootstrap cache and the 45-second poll keep it comfortable up to a few thousand users. Beyond that, move CheckIns to Supabase or Firebase and keep the Sheet for the directory, which committees and volunteers can still edit.
- **Free-flow road times:** OSRM has no live traffic, so the hour-of-day multiplier is a heuristic. The public OSRM demo server is rate-limited. For real launch traffic, set `ROUTER: 'ors'` with your ORS key, or self-host OSRM.
- **Abuse:** check-ins have a per-device cooldown and a daily cap, and verified reports get more weight. Device IDs are anonymous and spoofable. Add reCAPTCHA or OTP if spam appears.
- **Privacy:** the backend never stores a reporter's coordinates, only the distance to the pandal and a verified flag. Device IDs are never returned by the API.
- **No metro-leg routing yet.** Nearest-metro is shown for each pujo, but routes assume car or two-wheeler. See STRATEGY.md for multimodal routing.

## 7. Phone app (PWA)

Dhaak is a **progressive web app**: same code, but installable and usable with poor signal.

- **Install:** Android Chrome shows an "Install app" button in the Live card. On iPhone, the button explains Safari's Share → Add to Home Screen. Once installed it opens full-screen with the ঢাক icon, and long-pressing the icon gives shortcuts for "I'm here" and "Plan".
- **Offline:** `sw.js` caches the app, the last pujo list from the Sheet, and map tiles you've already viewed. If there's no signal in a packed pandal, the app still opens and shows saved data.
- **Outbox:** check-ins and ratings made with no signal are saved on the phone and sent automatically when it reconnects. Crowd reports older than 30 minutes are dropped instead of sent, because they'd be misleading.
- **"I'm here":** the centre button in the bottom bar uses GPS to pick the pujo you're at (within 600 m). One tap on a crowd level sends the report; queue time and photo are optional.
- **Share:** pujo and plan sharing use the phone's own share sheet. Shared links like `?p=BLR007` open straight to that pujo.
- **Deploying updates:** bump `VERSION` at the top of `sw.js` whenever you change files, so phones that already have the app pick up the new version.

Code: MIT. Data (`data/`): CC BY 4.0. Credit "Dhaak contributors" and the original sources.
