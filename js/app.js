/* Dhaak: Bengaluru Pujo Live. Front end (vanilla JS + Leaflet). */
(function () {
'use strict';

/* =====================================================================
   CONFIG - the only things you need to edit to go live
   ===================================================================== */
const CONFIG = {
  // Apps Script Web App /exec URL (backend/google_apps_script.gs). Empty = demo mode on the bundled seed.
  APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbxd2FWcl5RhfPnq-M8jz2ebjMFvtV26i4vZQbLCt1jo_iiKfrC6evZ9h3CG1isPpbtcYw/exec',
  // Routing: 'osrm' (free public server, no key, free-flow times) or 'ors' (OpenRouteService, needs key - same as Niram)
  ROUTER: 'osrm',
  OSRM_URL: 'https://router.project-osrm.org',
  ORS_API_KEY: 'eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6ImMzZjlkN2QwOGY0ZDQwMWY5YmQxYTA3YzgyNmYxNjliIiwiaCI6Im11cm11cjY0In0=',
  POLL_SECONDS: 45,
  MAX_STOPS: 25,
  BANGALORE: [12.9716, 77.5946],
  // Map tiles: CARTO Voyager (light) / Dark Matter (dark) with a free non-commercial key; OSM is the automatic fallback.
  CARTO_KEY: 'cb1_4k1z_1_1b52b81a3778fc18a2d58d55',
  OSM_URL: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  DEFAULT_MAP_STYLE: 'voyager',   // 'voyager' | 'positron' (lightest) | 'dark' - visitors can switch with the Map button
};

const E = window.DhaakEngine;
const MIN = 60e3, HOUR = 3600e3;

/* =====================================================================
   STATE + UTILITIES
   ===================================================================== */
const S = {
  demo: !CONFIG.APPS_SCRIPT_URL,
  pandals: [], byId: {}, events: [], sources: {},
  checkins: [], updates: [], ratings: [],
  clockOffset: 0, lastServerTime: null,
  selected: [], userLoc: null, start: null, end: null,
  zone: 'All', filters: new Set(), interests: new Set(['landmark', 'open']),
  planMode: 'pick', heatOn: true, labelsOn: false, pickMode: null, addKind: 'new', addLoc: null,
  lastPlan: null, matrixCache: new Map(), feedSeen: new Set(),
};
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const now = () => Date.now() + S.clockOffset;
const store = {
  get(k, d) { try { const v = localStorage.getItem('dhaak:' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('dhaak:' + k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
};
const deviceId = (() => {
  let id = store.get('device');
  if (!id) { id = 'd' + Math.random().toString(36).slice(2) + Date.now().toString(36); store.set('device', id); }
  return id;
})();
function status(el, msg, kind) { const n = typeof el === 'string' ? $(el) : el; n.textContent = msg || ''; n.className = 'status' + (kind ? ' ' + kind : ''); }
function ago(ms) {
  const m = Math.round((now() - ms) / MIN);
  if (m < 1) return 'just now'; if (m < 60) return m + ' min ago';
  const h = Math.floor(m / 60); return h + 'h ' + (m % 60) + 'm ago';
}
function fmtDur(min) { min = Math.round(min); const h = Math.floor(min / 60), m = min % 60; return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m} min`; }
function hashStr(s) { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }
function rng(seed) { let x = seed || 1; return () => (x = Math.imul(x ^ (x >>> 15), 2246822507) ^ Math.imul(x ^ (x >>> 13), 3266489909), ((x ^= x >>> 16) >>> 0) / 4294967296); }
const levelOf = l => Math.max(1, Math.min(5, Math.round(l)));
const crowdChip = (c, extra) => `<span class="crowd l${levelOf(c.level)} ${c.source === 'model' ? 'model' : ''}" title="${c.source === 'live' ? 'From live reports' : 'Typical for this time (model)'}">${E.CROWD_LABELS[levelOf(c.level)]}${c.source === 'live' ? ' · live' : ''}${extra || ''}</span>`;

/* =====================================================================
   DATA
   ===================================================================== */
function normalisePandal(r) {
  const lat = parseFloat(r.latitude), lng = parseFloat(r.longitude);
  const sinceNum = parseInt(String(r.since_year || '').replace(/[^0-9]/g, '').slice(0, 4), 10);
  return {
    id: String(r.id), name: r.name, short: r.short_name || r.name, area: r.area || '', zone: r.zone || 'Other',
    venue: r.venue || '', lat: isFinite(lat) ? lat : null, lng: isFinite(lng) ? lng : null,
    conf: r.coord_confidence || 'low', since: r.since_year || '', sinceNum: isFinite(sinceNum) ? sinceNum : null,
    edition: r.edition_2026 || '', type: r.type || '', entry: r.entry || 'Unknown', knownFor: r.known_for || '',
    theme: r.theme_2026 || '', highlights: r.highlights_2026 || '', metro: r.nearest_metro || '', bhog: r.bhog || '',
    pet: r.pet_friendly || '', parking: r.parking || '', tier: Number(r.buzz_tier) || 1, status: r.status_2026 || '',
    photo: r.photo_url || '', website: r.website || '', sources: String(r.sources || '').split(',').map(s => s.trim()).filter(Boolean),
  };
}
const hasPin = p => p.lat !== null && p.lng !== null;
const pinTrusted = p => ['high', 'medium', 'geocoded-venue', 'verified'].includes(p.conf);
const checkinsFor = id => S.checkins.filter(c => c.pandal_id === id);
const crowdNow = p => E.crowdAt(p, now(), now(), checkinsFor(p.id));

async function loadData() {
  if (!S.demo) {
    try {
      const r = await fetch(CONFIG.APPS_SCRIPT_URL + '?action=bootstrap');
      const d = await r.json();
      if (!d.ok) throw new Error(d.error || 'backend error');
      ingest(d.pandals, d.events, {});
      S.checkins = d.checkins.map(c => ({ ...c, ts: Date.parse(c.ts) }));
      S.updates = d.updates.map(u => ({ ...u, ts: Date.parse(u.ts) }));
      S.ratings = d.ratings || [];
      S.lastServerTime = d.server_time;
      store.set('last-bootstrap', { ...d, savedAt: Date.now() });
      return;
    } catch (err) {
      // No signal (common inside a packed pandal): use the last data this phone saw, if any
      const last = store.get('last-bootstrap');
      if (last && last.pandals) {
        console.warn('Backend unreachable, using saved data from', new Date(last.savedAt));
        ingest(last.pandals, last.events, {});
        S.checkins = (last.checkins || []).map(c => ({ ...c, ts: Date.parse(c.ts) }));
        S.updates = (last.updates || []).map(u => ({ ...u, ts: Date.parse(u.ts) }));
        S.ratings = last.ratings || []; S.lastServerTime = last.server_time; S.savedAt = last.savedAt;
        return;
      }
      console.warn('Backend unreachable, falling back to bundled seed:', err);
      S.demo = true;
    }
  }
  const seed = window.DHAAK_SEED;
  ingest(seed.pandals, seed.events, seed.sources);
  S.checkins = store.get('local-checkins', []);
  S.ratings = store.get('local-ratings', []);
}
function ingest(pandals, events, sources) {
  S.pandals = pandals.map(normalisePandal);
  S.byId = Object.fromEntries(S.pandals.map(p => [p.id, p]));
  S.events = (events || []).map(e => ({ ...e, startMs: E.istToMs(String(e.date).slice(0, 10), String(e.start).slice(0, 5)),
    endMs: E.istToMs(String(e.date).slice(0, 10), String(e.end).slice(0, 5)), confirmed: String(e.time_confirmed).toUpperCase() !== 'FALSE' }));
  S.sources = sources || {};
}

/* ---------- demo pulse: simulated reports from the crowd model, clearly labelled ---------- */
const DEMO_NOTES = ['', '', '', 'Smooth entry right now', 'Long queue at the main gate', 'Bhog counter open', 'Parking full, use the side road',
  'Dhunuchi starting soon', 'Idol is stunning this year', 'Food stalls packed', 'Kids corner open', 'Cultural programme on stage'];
function generateDemoPulse() {
  const t = now(), bucket = Math.floor(t / (10 * MIN));
  const local = store.get('local-checkins', []);
  const sim = [];
  S.pandals.filter(hasPin).forEach(p => {
    const r = rng(hashStr(p.id) ^ bucket);
    const prior = E.priorCrowd(p.tier, t);
    const day = E.pujaDayFor(t);
    const n = Math.round((day ? 1 : 0.15) * (prior - 1) * p.tier * 0.9 * r() * 1.6);
    for (let i = 0; i < n; i++) {
      const crowd = Math.max(1, Math.min(5, Math.round(prior + (r() - 0.45) * 1.6)));
      sim.push({ ts: t - r() * 85 * MIN, pandal_id: p.id, crowd, wait_min: Math.round(E.expectedWaitMin(crowd, p.tier) * (0.6 + r() * 0.8)),
                 note: DEMO_NOTES[Math.floor(r() * DEMO_NOTES.length)], verified: r() < 0.7, demo: true });
    }
  });
  S.checkins = sim.concat(local).sort((a, b) => b.ts - a.ts);
  const u = [];
  const busy = S.pandals.filter(p => p.tier === 3 && hasPin(p));
  const r = rng(bucket);
  if (E.pujaDayFor(t)) for (let i = 0; i < 3; i++) {
    const p = busy[Math.floor(r() * busy.length)];
    const kinds = [['bhog_open', 'Bhog counter open, follow the volunteers'], ['queue', 'Queue moving fast at gate 1'], ['event_now', 'Evening aarti starting']];
    const [kind, message] = kinds[Math.floor(r() * kinds.length)];
    u.push({ ts: t - r() * 120 * MIN, pandal_id: p.id, kind, message, posted_by: 'committee', demo: true });
  }
  S.updates = u.concat(store.get('local-updates', []));
}

/* =====================================================================
   MAP
   ===================================================================== */
// CARTO raster styles: base without labels + labels-only overlay (see initMap)
const MAP_STYLES = {
  voyager:  { name: 'Voyager',  base: 'rastertiles/voyager_nolabels', labels: 'rastertiles/voyager_only_labels' },
  positron: { name: 'Positron', base: 'light_nolabels',                labels: 'light_only_labels' },
  dark:     { name: 'Dark',     base: 'dark_nolabels',                 labels: 'dark_only_labels' },
};
let baseTiles, labelTiles;
function setMapStyleButton(style) { const b = $('#btn-style'); if (b) { b.textContent = 'Map: ' + MAP_STYLES[style].name; b.dataset.style = style; } }
function cycleMapStyle() {
  if (S.osmFallback || !CONFIG.CARTO_KEY) return;
  const order = Object.keys(MAP_STYLES);
  const next = order[(order.indexOf($('#btn-style').dataset.style) + 1) % order.length];
  baseTiles.setUrl(window.__cartoUrl(MAP_STYLES[next].base));
  if (labelTiles) labelTiles.setUrl(window.__cartoUrl(MAP_STYLES[next].labels));
  store.set('mapstyle', next); setMapStyleButton(next);
}
let map, markerLayer, heatLayer, routeLayer, stopLayer, startMarker, endMarker, pickMarker;
const markers = {};
function initMap() {
  map = L.map('map', { zoomControl: false, preferCanvas: false }).setView(CONFIG.BANGALORE, 11);
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  // Basemap: CARTO (key) split into two layers - the base without labels under everything, and a
  // labels-only layer in its own pane ABOVE the crowd heat but BELOW the pins, so street and
  // area names stay readable through the heat. Style is user-selectable (Voyager default).
  // If CARTO fails repeatedly (bad key / quota / outage) we fall back to OpenStreetMap.
  map.createPane('labels');
  map.getPane('labels').style.zIndex = 450;            // overlayPane (heat) = 400, markerPane = 600
  map.getPane('labels').style.pointerEvents = 'none';
  const osmAttr = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
  const cartoAttr = osmAttr + ', &copy; <a href="https://carto.com/attributions">CARTO</a>';
  const key = encodeURIComponent(CONFIG.CARTO_KEY || '');
  const cartoUrl = path => `https://{s}.basemaps.cartocdn.com/${path}/{z}/{x}/{y}{r}.png?key=${key}`;
  let style = store.get('mapstyle', CONFIG.DEFAULT_MAP_STYLE);
  if (!MAP_STYLES[style]) style = 'voyager';
  const useCarto = !!CONFIG.CARTO_KEY;
  baseTiles = L.tileLayer(useCarto ? cartoUrl(MAP_STYLES[style].base) : CONFIG.OSM_URL,
    { attribution: useCarto ? cartoAttr : osmAttr, subdomains: 'abcd', maxZoom: 19, crossOrigin: true }).addTo(map);
  if (useCarto) labelTiles = L.tileLayer(cartoUrl(MAP_STYLES[style].labels), { pane: 'labels', subdomains: 'abcd', maxZoom: 19, crossOrigin: true }).addTo(map);
  else map.getContainer().classList.add('tiles-osm');
  setMapStyleButton(style);
  let tileErrors = 0;
  baseTiles.on('tileerror', () => {
    if (++tileErrors === 6 && useCarto && !S.osmFallback) {
      console.warn('CARTO tiles failing - switching to OpenStreetMap');
      S.osmFallback = true;
      if (labelTiles) { labelTiles.remove(); labelTiles = null; }
      map.attributionControl.removeAttribution(cartoAttr); map.attributionControl.addAttribution(osmAttr);
      baseTiles.options.attribution = osmAttr;
      baseTiles.setUrl(CONFIG.OSM_URL);
      map.getContainer().classList.add('tiles-osm');
      $('#btn-style').hidden = true;
    }
  });
  window.__cartoUrl = cartoUrl;
  markerLayer = L.layerGroup().addTo(map);
  routeLayer = L.layerGroup().addTo(map);
  stopLayer = L.layerGroup().addTo(map);
  if (L.heatLayer) heatLayer = L.heatLayer([], { radius: 38, blur: 30, maxZoom: 13, minOpacity: 0.25,
    gradient: { 0.2: '#3A9D6B', 0.45: '#EDB508', 0.7: '#EE7A1A', 1.0: '#D7263D' } }).addTo(map);
  map.on('zoomend', () => map.getContainer().classList.toggle('show-landmarks', map.getZoom() >= 12));
  map.on('click', onMapClick);
  map.getContainer().addEventListener('click', e => {
    const b = e.target.closest('[data-pop]'); if (!b) return;
    const id = b.dataset.id;
    if (b.dataset.pop === 'detail') openDetail(id);
    if (b.dataset.pop === 'plan') { toggleSelect(id); map.closePopup(); }
  });
}

function renderMarkers() {
  markerLayer.clearLayers();
  const heat = [];
  S.pandals.filter(hasPin).forEach(p => {
    const c = crowdNow(p), lvl = levelOf(c.level);
    const size = p.tier === 3 ? 22 : p.tier === 2 ? 16 : 12;
    const live = c.source === 'live';
    const sel = S.selected.includes(p.id);
    const icon = L.divIcon({ className: '', iconSize: [size, size], iconAnchor: [size / 2, size / 2],
      html: `<div class="pin l${lvl} ${live ? 'live' : ''} ${pinTrusted(p) ? '' : 'unverified'} ${sel ? 'sel' : ''}"><span class="pin-label ${p.tier === 3 ? 'always' : ''}">${esc(p.short)}</span></div>` });
    const m = L.marker([p.lat, p.lng], { icon, riseOnHover: true, zIndexOffset: p.tier * 100 });
    m.bindPopup(() => popupHtml(p), { maxWidth: 260 });
    m.addTo(markerLayer); markers[p.id] = m;
    const w = live ? (c.level / 5) * Math.min(1, c.reports / 3) : (c.level / 5) * 0.45 * (p.tier / 3);
    heat.push([p.lat, p.lng, w]);
  });
  if (heatLayer) heatLayer.setLatLngs(S.heatOn ? heat : []);
}
function popupHtml(p) {
  const c = crowdNow(p);
  const wait = Math.round(E.expectedWaitMin(c.level, p.tier));
  return `<b>${esc(p.short)}</b><br><span class="muted small">${esc(p.area)}${p.since ? ' · since ' + esc(p.since) : ''}</span>
    <div style="margin-top:6px">${crowdChip(c)} <span class="small muted">~${wait} min queue</span></div>
    ${p.entry !== 'Open to all' ? `<div class="small" style="margin-top:4px;color:var(--c5)">${esc(p.entry)}</div>` : ''}
    <div class="pop-actions"><button data-pop="detail" data-id="${p.id}">Details</button>
    <button data-pop="plan" data-id="${p.id}" class="${S.selected.includes(p.id) ? '' : 'fill'}">${S.selected.includes(p.id) ? 'Remove from plan' : '+ Add to plan'}</button></div>`;
}
function setHint(msg) { const h = $('#map-hint'); h.hidden = !msg; h.textContent = msg || ''; }
function onMapClick(e) {
  if (!S.pickMode) return;
  const ll = { lat: e.latlng.lat, lng: e.latlng.lng };
  if (S.pickMode === 'start') { S.start = ll; setStartNote('Pinned on map'); drawEndpoints(); }
  if (S.pickMode === 'end') { S.end = ll; drawEndpoints(); }
  if (S.pickMode === 'add') {
    S.addLoc = ll; $('#ad-loc').textContent = `${ll.lat.toFixed(5)}, ${ll.lng.toFixed(5)}`;
    if (pickMarker) pickMarker.remove();
    pickMarker = L.marker([ll.lat, ll.lng], { draggable: true }).addTo(map);
    pickMarker.on('dragend', () => { const q = pickMarker.getLatLng(); S.addLoc = { lat: q.lat, lng: q.lng }; $('#ad-loc').textContent = `${q.lat.toFixed(5)}, ${q.lng.toFixed(5)}`; });
  }
  S.pickMode = null; setHint(null);
  if (isMobile()) setSheet('half');
}
function drawEndpoints() {
  if (startMarker) startMarker.remove(); if (endMarker) endMarker.remove();
  if (S.start) startMarker = L.marker([S.start.lat, S.start.lng], { icon: L.divIcon({ className: '', html: '<div class="startpin"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }) }).bindTooltip('Start').addTo(map);
  if (S.end && $('#end-src').value === 'map') endMarker = L.marker([S.end.lat, S.end.lng], { icon: L.divIcon({ className: '', html: '<div class="stopnum">⚑</div>', iconSize: [24, 24], iconAnchor: [12, 12] }) }).bindTooltip('Finish').addTo(map);
}

/* =====================================================================
   HEADER: day strip, live pill, time travel
   ===================================================================== */
function renderHeader() {
  const today = E.istParts(now()).dateStr;
  $('#daystrip').innerHTML = E.PUJA_DAYS.filter(d => d.key !== 'saptami-eve').map(d => {
    const dd = d.date.slice(8);
    return `<div class="day ${d.date === today ? 'today' : d.date < today ? 'past' : ''}"><b>${d.bn}</b><small>${d.en} ${Number(dd)} Oct</small></div>`;
  }).join('');
  const hour = S.checkins.filter(c => now() - c.ts < HOUR && c.ts <= now());
  const pill = $('#livepill');
  pill.classList.toggle('demo', S.demo);
  const offline = !navigator.onLine;
  pill.classList.toggle('offline', offline);
  $('#livepill-text').textContent = offline ? 'Offline · saved data' : (S.demo ? 'Demo · ' : 'Live · ') + hour.length + ' reports/hr';
}
function initTimeTravel() {
  const sel = $('#timetravel');
  if (!S.demo) return;
  const opts = [['', 'Now (real time)'], ['2026-10-15 19:00', 'Panchami 7 pm'], ['2026-10-16 20:00', 'Shashthi 8 pm'],
    ['2026-10-18 19:30', 'Saptami 7:30 pm'], ['2026-10-19 10:15', 'Ashtami 10:15 am (Anjali)'], ['2026-10-19 15:00', 'Ashtami 3 pm'],
    ['2026-10-19 20:30', 'Ashtami 8:30 pm'], ['2026-10-20 21:00', 'Navami 9 pm'], ['2026-10-21 12:30', 'Dashami 12:30 pm (Sindoor)']];
  sel.innerHTML = opts.map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
  sel.hidden = false;
  const realDay = E.pujaDayFor(Date.now());
  const def = realDay ? '' : '2026-10-18 19:30';            // before the puja starts, preview Saptami evening
  sel.value = def; applyTimeTravel(def);
  sel.addEventListener('change', () => { applyTimeTravel(sel.value); refreshAll(); });
}
function applyTimeTravel(v) {
  if (!v) { S.clockOffset = 0; } else { const [d, t] = v.split(' '); S.clockOffset = E.istToMs(d, t) - Date.now(); }
  generateDemoPulse();
}

/* =====================================================================
   LIVE TAB
   ===================================================================== */
function renderLive() {
  const t = now(), day = E.pujaDayFor(t);
  const first = E.istToMs(E.PUJA_DAYS[1].date, '00:00'), last = E.istToMs('2026-10-22', '00:00');
  const hourReports = S.checkins.filter(c => t - c.ts < HOUR && c.ts <= t);
  const reporting = new Set(hourReports.map(c => c.pandal_id));
  const zoneHeat = {};
  S.pandals.filter(hasPin).forEach(p => { const c = crowdNow(p); zoneHeat[p.zone] = (zoneHeat[p.zone] || 0) + c.level * p.tier; });
  const hotZone = Object.entries(zoneHeat).sort((a, b) => b[1] - a[1])[0];
  let title, sub;
  if (t < first) { const days = Math.ceil((first - t) / (24 * HOUR)); title = `Pujo in ${days} day${days > 1 ? 's' : ''}`; sub = 'Shashthi is Fri 16 Oct · Anandamelas on Panchami (15 Oct)'; }
  else if (t >= last) { title = 'আসছে বছর আবার হবে'; sub = 'See you next year. Your ratings are saved for 2027.'; }
  else { title = `${day ? day.en : ''} · ${E.fmtTime(t)}`; sub = day ? `${day.bn} · ${S.pandals.filter(hasPin).length} pujos on the map` : ''; }
  $('#live-hero').innerHTML = `<h2>${esc(title)}</h2><p>${esc(sub)}</p>
    <div class="hero-stats"><div><b>${hourReports.length}</b><span>reports, last hr</span></div>
    <div><b>${reporting.size}</b><span>pujos reporting</span></div><div><b>${hotZone ? esc(hotZone[0]) : 'None yet'}</b><span>busiest zone</span></div></div>
    <div class="hero-actions"><button class="hero-btn" data-here>I'm here: report the crowd</button>${installButtonHtml()}</div>
    ${S.savedAt && !navigator.onLine ? `<p class="small" style="margin-top:8px;opacity:.85">No signal. Showing data saved ${ago(S.savedAt)}.</p>` : ''}`;

  const scored = S.pandals.filter(hasPin).map(p => ({ p, c: crowdNow(p) }));
  const hot = scored.filter(x => x.c.source === 'live').sort((a, b) => (b.c.level * b.p.tier + (b.c.reports || 0) * 0.3) - (a.c.level * a.p.tier + (a.c.reports || 0) * 0.3)).slice(0, 6);
  $('#hot-note').textContent = hot.length ? 'from crowd reports' : 'no live reports yet, showing model';
  const hotList = hot.length ? hot : scored.sort((a, b) => b.c.level * b.p.tier - a.c.level * a.p.tier).slice(0, 5);
  $('#hot-list').innerHTML = hotList.map(miniRow).join('') || '<div class="muted small">Nothing yet.</div>';
  const calm = scored.filter(x => x.p.tier >= 2 && x.p.entry === 'Open to all').sort((a, b) => (a.c.level - a.p.tier * 0.4) - (b.c.level - b.p.tier * 0.4)).slice(0, 5);
  $('#calm-list').innerHTML = calm.map(miniRow).join('');

  // must-catch moments: today's if during puja, else the next puja day's
  const dateStr = day ? day.date : (t < first ? E.PUJA_DAYS[0].date : null);
  const evs = S.events.filter(e => String(e.date).slice(0, 10) === dateStr && e.endMs > t - 30 * MIN).sort((a, b) => a.startMs - b.startMs);
  $('#moments-title').textContent = dateStr ? `Must-catch moments · ${E.PUJA_DAYS.find(d => d.date === dateStr).en}` : 'Must-catch moments';
  $('#moments').innerHTML = evs.map(e => {
    const p = S.byId[e.pandal_id];
    const live = e.startMs <= t && e.endMs >= t;
    return `<div class="moment ${live ? 'now' : ''}"><div><time>${E.fmtTime(e.startMs)}</time>${e.confirmed ? '' : '<div class="tbc">time TBC</div>'}</div>
      <div><b>${esc(e.title)}</b>${live ? ' <span class="badge o">NOW</span>' : ''}<br><span class="muted">${p ? `<a href="#" data-detail="${p.id}">${esc(p.short)}</a>` : 'All pujos'}</span></div></div>`;
  }).join('') || '<div class="muted small">No scheduled moments listed for today yet. Committees can add them.</div>';

  renderFeed();
}
function miniRow({ p, c }) {
  const wait = Math.round(c.source === 'live' ? (E.liveCrowd(checkinsFor(p.id), now()) || {}).wait || 0 : E.expectedWaitMin(c.level, p.tier));
  return `<div class="mini" data-detail="${p.id}"><div class="nm"><b>${esc(p.short)}</b><span>${esc(p.area)} · ~${wait} min queue${c.reports ? ` · ${c.reports} reports` : ''}</span></div>${crowdChip(c)}</div>`;
}
function renderFeed() {
  const t = now();
  const items = [
    ...S.checkins.filter(c => c.ts <= t && t - c.ts < 6 * HOUR).map(c => ({ ...c, type: 'checkin' })),
    ...S.updates.filter(u => u.ts <= t && t - u.ts < 18 * HOUR).map(u => ({ ...u, type: 'update' })),
  ].sort((a, b) => b.ts - a.ts).slice(0, 40);
  $('#feed-updated').textContent = 'updated ' + E.fmtTime(t);
  $('#feed').innerHTML = items.map(it => {
    const p = S.byId[it.pandal_id]; if (!p) return '';
    const key = it.type + it.pandal_id + it.ts;
    const fresh = !S.feedSeen.has(key); S.feedSeen.add(key);
    if (it.type === 'update') return `<div class="feed-item ${fresh ? 'new' : ''}"><div class="feed-ico" style="background:var(--sindoor)">✓</div>
      <div><b data-detail="${p.id}">${esc(p.short)}</b> <span class="badge o">Committee</span>${it.demo ? '<span class="badge d">demo</span>' : ''}<br>${esc(it.message)}<div class="meta">${ago(it.ts)}</div></div></div>`;
    return `<div class="feed-item ${fresh ? 'new' : ''}"><div class="feed-ico" style="background:var(--c${it.crowd})">${it.crowd}</div>
      <div><b data-detail="${p.id}">${esc(p.short)}</b> is <b>${E.CROWD_LABELS[it.crowd].toLowerCase()}</b>${it.wait_min ? ` · ~${it.wait_min} min queue` : ''}
      ${it.verified ? '<span class="badge v">at venue</span>' : ''}${it.demo ? '<span class="badge d">demo</span>' : ''}${it.local ? '<span class="badge d">you</span>' : ''}
      ${it.note ? `<br>“${esc(it.note)}”` : ''}${it.photo_url ? `<img src="${esc(it.photo_url)}" alt="" loading="lazy">` : ''}<div class="meta">${ago(it.ts)}</div></div></div>`;
  }).join('') || '<div class="muted small">No reports yet. Be the first: tap I\'m here.</div>';
}

/* =====================================================================
   EXPLORE TAB
   ===================================================================== */
const FILTERS = [
  ['open', 'Open to all', p => p.entry === 'Open to all'],
  ['bhog', 'Bhog', p => /yes|free|pass|donation/i.test(p.bhog)],
  ['metro', 'Near metro', p => /\((purple|green|yellow|pink)/i.test(p.metro) && !/if open/i.test(p.metro)],
  ['theme', 'Theme 2026', p => !!p.theme],
  ['heritage', 'Heritage (pre-2000)', p => p.sinceNum && p.sinceNum < 2000],
  ['pet', 'Pet-friendly', p => /yes/i.test(p.pet)],
  ['confirmed', 'Confirmed 2026', p => /confirmed/i.test(p.status) && !/unconfirmed/i.test(p.status)],
  ['nopin', 'Needs a pin', p => !hasPin(p)],
];
function renderExploreChips() {
  const zones = ['All', 'Central', 'North', 'South', 'East', 'West'];
  $('#zone-chips').innerHTML = zones.map(z => `<button class="chip ${S.zone === z ? 'on' : ''}" data-zone="${z}">${z}</button>`).join('');
  $('#filter-chips').innerHTML = FILTERS.map(([k, l]) => `<button class="chip ${S.filters.has(k) ? 'on' : ''}" data-filter="${k}">${l}</button>`).join('');
}
function renderExplore() {
  const q = $('#search').value.trim().toLowerCase();
  let list = S.pandals.filter(p => (S.zone === 'All' || p.zone === S.zone)
    && [...S.filters].every(k => FILTERS.find(f => f[0] === k)[2](p))
    && (!q || [p.name, p.short, p.area, p.venue, p.knownFor, p.theme].join(' ').toLowerCase().includes(q)));
  const sort = $('#sort').value, ref = S.userLoc || S.start;
  const withC = list.map(p => ({ p, c: hasPin(p) ? crowdNow(p) : { level: 0, source: 'none' }, d: ref && hasPin(p) ? E.haversineKm(ref, p) : null }));
  if (sort === 'buzz') withC.sort((a, b) => b.p.tier - a.p.tier || b.p.sources.length - a.p.sources.length);
  if (sort === 'near') withC.sort((a, b) => (a.d ?? 1e9) - (b.d ?? 1e9));
  if (sort === 'calm') withC.sort((a, b) => (a.c.level || 9) - (b.c.level || 9) || b.p.tier - a.p.tier);
  if (sort === 'old') withC.sort((a, b) => (a.p.sinceNum || 9999) - (b.p.sinceNum || 9999));
  if (sort === 'name') withC.sort((a, b) => a.p.short.localeCompare(b.p.short));
  $('#explore-count').textContent = `${withC.length} of ${S.pandals.length} pujos${sort === 'near' && !ref ? '. Allow location to sort by distance' : ''}`;
  $('#pandal-list').innerHTML = withC.map(({ p, c, d }) => {
    const sel = S.selected.includes(p.id);
    const tags = [
      hasPin(p) ? crowdChip(c) : '<span class="tag warn">No pin yet. Help add it</span>',
      p.entry !== 'Open to all' ? `<span class="tag warn">${esc(p.entry)}</span>` : '',
      p.theme ? `<span class="tag gold">Theme: ${esc(p.theme)}</span>` : '',
      /yes|free|pass|donation/i.test(p.bhog) ? `<span class="tag">Bhog: ${esc(p.bhog)}</span>` : '',
      p.metro && !/^none/i.test(p.metro) ? `<span class="tag">Metro: ${esc(p.metro)}</span>` : '',
      /unconfirmed/i.test(p.status) ? '<span class="tag warn">2026 unconfirmed</span>' : '',
      hasPin(p) && !pinTrusted(p) ? '<span class="tag">Approx. pin</span>' : '',
    ].join('');
    return `<div class="card" data-detail="${p.id}"><h4>${esc(p.short)}</h4>
      ${hasPin(p) ? `<button class="addbtn ${sel ? 'in' : ''}" data-add="${p.id}">${sel ? '✓ In plan' : '+ Plan'}</button>` : '<span></span>'}
      <div class="sub">${esc(p.area)}${p.since ? ' · since ' + esc(p.since) : ''}${p.edition ? ' · ' + esc(p.edition) + ' year' : ''}${d !== null ? ' · ' + d.toFixed(1) + ' km' : ''}</div>
      <div class="tags">${tags}</div></div>`;
  }).join('');
}

/* =====================================================================
   DETAIL DRAWER
   ===================================================================== */
function openDetail(id) {
  const p = S.byId[id]; if (!p) return;
  const t = now();
  const c = hasPin(p) ? crowdNow(p) : null;
  const photos = [p.photo, ...S.checkins.filter(x => x.pandal_id === id && x.photo_url).map(x => x.photo_url)].filter(Boolean);
  const evs = S.events.filter(e => e.pandal_id === id).sort((a, b) => a.startMs - b.startMs);
  const ups = S.updates.filter(u => u.pandal_id === id).sort((a, b) => b.ts - a.ts).slice(0, 3);
  const rat = S.ratings.filter(r => r.pandal_id === id).sort((a, b) => b.year - a.year);
  const planDate = $('#plan-day').value || (E.pujaDayFor(t) || E.PUJA_DAYS[4]).date;
  const srcHtml = p.sources.map(s => S.sources[s] ? (/^https?:/.test(S.sources[s]) ? `<a href="${esc(S.sources[s])}" target="_blank" rel="noopener">${esc(s)}</a>` : `<span title="${esc(S.sources[s])}">${esc(s)}</span>`) : esc(s)).join(' · ');
  const sel = S.selected.includes(id);
  const d = $('#detail');
  d.innerHTML = `
    <button class="detail-close" id="detail-close" aria-label="Close">←</button>
    <div class="detail-hero ${photos.length ? 'has-img' : ''}" ${photos.length ? `style="background-image:url('${esc(photos[0])}')"` : ''}>
      
      <div><h2>${esc(p.name)}</h2><div class="sub">${esc(p.area)} · ${esc(p.zone)} Bengaluru</div></div>
    </div>
    <div class="detail-body">
      ${c ? `<div class="row" style="flex-wrap:wrap">${crowdChip(c)} <span class="small muted">~${Math.round(E.expectedWaitMin(c.level, p.tier))} min queue expected now</span></div>` : '<div class="tag warn">This pujo has no map pin yet. Know where it is? Contribute → Add / fix.</div>'}
      <div class="actions">
        ${hasPin(p) ? `<button data-add="${id}">${sel ? '✓ In plan' : '+ Add to plan'}</button>
        <a href="https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}&travelmode=driving" target="_blank" rel="noopener">Directions</a>` : ''}
        <button data-share="${id}">Share</button>
        <button data-contrib="checkin" data-id="${id}">Check in</button>
        <button data-contrib="rate" data-id="${id}">Rate</button>
        <button data-contrib="fix" data-id="${id}">Fix pin / venue</button>
      </div>
      ${ups.length ? `<h3>Committee updates</h3>${ups.map(u => `<div class="small"><span class="badge o">✓</span> ${esc(u.message)} <span class="muted">· ${ago(u.ts)}</span></div>`).join('')}` : ''}
      <dl class="facts">
        <dt>Venue</dt><dd>${esc(p.venue) || 'Not listed'}</dd>
        ${p.since ? `<dt>Since</dt><dd>${esc(p.since)}${p.edition ? ` (${esc(p.edition)} year in 2026)` : ''}</dd>` : ''}
        <dt>Type</dt><dd>${esc(p.type)}</dd>
        <dt>Entry</dt><dd>${esc(p.entry)}</dd>
        ${p.knownFor ? `<dt>Known for</dt><dd>${esc(p.knownFor)}</dd>` : ''}
        ${p.theme ? `<dt>2026 theme</dt><dd>${esc(p.theme)}</dd>` : ''}
        ${p.highlights ? `<dt>2026</dt><dd>${esc(p.highlights)}</dd>` : ''}
        ${p.bhog ? `<dt>Bhog</dt><dd>${esc(p.bhog)}</dd>` : ''}
        ${p.metro ? `<dt>Metro</dt><dd>${esc(p.metro)}</dd>` : ''}
        ${p.parking ? `<dt>Parking</dt><dd>${esc(p.parking)}</dd>` : ''}
        <dt>Pin</dt><dd>${hasPin(p) ? (pinTrusted(p) ? 'Checked' : 'Approximate. Confirm the venue before you drive') : 'Missing'}</dd>
        <dt>2026 status</dt><dd>${esc(p.status) || 'Not listed'}</dd>
      </dl>
      ${hasPin(p) ? `<h3>Typical crowd on ${esc((E.PUJA_DAYS.find(x => x.date === planDate) || {}).en || planDate)}</h3>${sparkline(p, planDate)}` : ''}
      ${evs.length ? `<h3>Scheduled moments</h3>${evs.map(e => `<div class="moment"><div><time>${Number(String(e.date).slice(8, 10))} Oct</time><div class="tbc">${E.fmtTime(e.startMs)}${e.confirmed ? '' : ' (TBC)'}</div></div><div>${esc(e.title)}</div></div>`).join('')}` : ''}
      <h3>Ratings by year</h3>${rat.length ? rat.map(ratingBlock).join('') : '<div class="small muted">No ratings yet. Rate it after you visit. Dhaak keeps every year, so this becomes the pujo\'s track record.</div>'}
      ${photos.length > 1 ? `<h3>Photos from visitors</h3><div class="photos">${photos.slice(0, 9).map(u => `<img src="${esc(u)}" alt="" loading="lazy">`).join('')}</div>` : ''}
      <h3>Sources</h3><div class="sources">${srcHtml || 'None listed'} · last checked 14 Oct 2026</div>
    </div>`;
  d.hidden = false; d.scrollTop = 0;
  $('#detail-close').onclick = () => { d.hidden = true; };
  if (hasPin(p)) { map.flyTo([p.lat, p.lng], Math.max(map.getZoom(), 14), { duration: 0.6 }); }
  if (isMobile()) setSheet('half');
}
function sparkline(p, dateStr) {
  const W = 360, H = 70, pts = [];
  for (let h = 6; h <= 24; h += 0.5) { const ms = E.istToMs(dateStr, '00:00') + h * HOUR; pts.push([h, E.priorCrowd(p.tier, ms)]); }
  const x = h => (h - 6) / 18 * (W - 20) + 10, y = l => H - 14 - (l - 1) / 4 * (H - 24);
  const path = pts.map(([h, l], i) => `${i ? 'L' : 'M'}${x(h).toFixed(1)},${y(l).toFixed(1)}`).join('');
  const t = now(), tp = E.istParts(t);
  const nowMark = tp.dateStr === dateStr ? `<line x1="${x(tp.hourFloat)}" x2="${x(tp.hourFloat)}" y1="4" y2="${H - 14}" stroke="var(--sindoor)" stroke-dasharray="3 3"/>` : '';
  const live = tp.dateStr === dateStr ? E.liveCrowd(checkinsFor(p.id), t) : null;
  const liveDot = live ? `<circle cx="${x(tp.hourFloat)}" cy="${y(live.level)}" r="5" fill="var(--sindoor)"/>` : '';
  const ticks = [6, 9, 12, 15, 18, 21, 24].map(h => `<text x="${x(h)}" y="${H - 2}" font-size="9" text-anchor="middle" fill="var(--muted)">${h === 24 ? '12a' : h > 12 ? (h - 12) + 'p' : h === 12 ? '12p' : h + 'a'}</text>`).join('');
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Typical crowd through the day">
    <path d="${path} L${x(24)},${H - 14} L${x(6)},${H - 14} Z" fill="var(--marigold-soft)"/><path d="${path}" fill="none" stroke="var(--marigold)" stroke-width="2"/>
    ${nowMark}${liveDot}${ticks}</svg><div class="small muted">Model of a typical ${p.tier === 3 ? 'landmark' : p.tier === 2 ? 'popular' : 'neighbourhood'} pujo; red dot = live reports. Plan big pujos for the dips.</div>`;
}
function ratingBlock(r) {
  const row = (k, l) => `<div class="ratingbar"><span>${l}</span><div><i style="width:${(r[k] || 0) / 5 * 100}%"></i></div><b>${r[k] || '–'}</b></div>`;
  return `<div style="margin-bottom:8px"><b>${r.year}</b> <span class="small muted">${r.n} rating${r.n > 1 ? 's' : ''}</span>
    ${row('idol', 'Pratima')}${row('pandal', 'Pandal/theme')}${row('bhog', 'Bhog/food')}${row('culture', 'Culture')}${row('management', 'Crowd mgmt')}</div>`;
}

/* =====================================================================
   PLAN TAB
   ===================================================================== */
function toggleSelect(id) {
  const i = S.selected.indexOf(id);
  if (i >= 0) S.selected.splice(i, 1);
  else { if (S.selected.length >= CONFIG.MAX_STOPS) { alertPlan(`Max ${CONFIG.MAX_STOPS} stops.`); return; } S.selected.push(id); }
  store.set('selected', S.selected);
  renderSelected(); renderMarkers(); renderExplore();
  const btn = $('#detail').hidden ? null : $('#detail [data-add]');
  if (btn) btn.textContent = S.selected.includes(id) ? '✓ In plan' : '+ Add to plan';
}
function alertPlan(m) { status('#plan-status', m, 'err'); }
function renderSelected() {
  $('#plan-count').hidden = !S.selected.length; $('#plan-count').textContent = S.selected.length;
  $('#nav-plan-count').hidden = !S.selected.length; $('#nav-plan-count').textContent = S.selected.length;
  $('#selected-chips').innerHTML = S.selected.map(id => `<span class="selchip">${esc(S.byId[id].short)}<button data-unsel="${id}" aria-label="Remove">×</button></span>`).join('')
    || '<span class="muted small">Nothing picked yet.</span>';
}
const INTERESTS = [['landmark', 'Landmark pujos'], ['heritage', 'Heritage (oldest)'], ['theme', 'Theme pandals'], ['bhog', 'Bhog'],
  ['culture', 'Cultural nights'], ['open', 'Open to all only'], ['calm', 'Skip the crowds']];
function renderInterestChips() {
  $('#interest-chips').innerHTML = INTERESTS.map(([k, l]) => `<button class="chip ${S.interests.has(k) ? 'on' : ''}" data-interest="${k}">${l}</button>`).join('');
}
function initPlanForm() {
  const daySel = $('#plan-day');
  daySel.innerHTML = E.PUJA_DAYS.map(d => `<option value="${d.date}">${d.en === 'Sat 17' ? 'Sat 17 Oct (Saptami for some)' : `${d.en} · ${Number(d.date.slice(8))} Oct`}</option>`).join('');
  const today = E.pujaDayFor(now());
  daySel.value = today ? today.date : E.PUJA_DAYS[3].date;
  if (today) { const p = E.istParts(now() + 15 * MIN); $('#plan-time').value = `${String(p.h).padStart(2, '0')}:${String(Math.floor(p.min / 15) * 15).padStart(2, '0')}`; }
  S.selected = store.get('selected', []).filter(id => S.byId[id] && hasPin(S.byId[id]));
  renderSelected(); renderInterestChips();
}
function setStartNote(t) { $('#start-note').textContent = t; }
function locate() {
  return new Promise(resolve => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(pos => {
      S.userLoc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      resolve(S.userLoc);
    }, () => resolve(null), { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 });
  });
}
async function resolveStart() {
  if ($('#start-src').value === 'map') return S.start;
  const loc = S.userLoc || await locate();
  if (loc && E.haversineKm(loc, { lat: 12.97, lng: 77.6 }) < 60) { S.start = loc; setStartNote('Using your location'); }
  else if (!S.start) { S.start = { lat: CONFIG.BANGALORE[0], lng: CONFIG.BANGALORE[1] }; setStartNote(loc ? 'You seem outside Bengaluru, so starting from MG Road' : 'Location off, so starting from MG Road'); }
  drawEndpoints();
  return S.start;
}

async function getMatrix(points) {
  const key = points.map(p => p.lat.toFixed(5) + ',' + p.lng.toFixed(5)).join(';');
  if (S.matrixCache.has(key)) return S.matrixCache.get(key);
  let m = null;
  try {
    if (CONFIG.ROUTER === 'ors' && CONFIG.ORS_API_KEY) {
      const r = await fetch('https://api.openrouteservice.org/v2/matrix/driving-car', { method: 'POST',
        headers: { Authorization: CONFIG.ORS_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ locations: points.map(p => [p.lng, p.lat]), metrics: ['duration', 'distance'] }) });
      const d = await r.json();
      if (d.durations) m = { durations: d.durations, distances: d.distances, source: 'openrouteservice' };
    } else {
      const coords = points.map(p => `${p.lng.toFixed(5)},${p.lat.toFixed(5)}`).join(';');
      const r = await fetch(`${CONFIG.OSRM_URL}/table/v1/driving/${coords}?annotations=duration,distance`);
      const d = await r.json();
      if (d.code === 'Ok') m = { durations: d.durations, distances: d.distances, source: 'OSRM road network' };
    }
  } catch (err) { console.warn('Routing matrix failed, using estimate', err); }
  const est = E.haversineMatrix(points);
  if (!m) m = est;
  else for (let i = 0; i < points.length; i++) for (let j = 0; j < points.length; j++) {     // patch unroutable cells
    if (m.durations[i][j] == null) m.durations[i][j] = est.durations[i][j];
    if (m.distances[i][j] == null) m.distances[i][j] = est.distances[i][j];
  }
  S.matrixCache.set(key, m);
  return m;
}
async function drawRouteGeometry(points) {
  routeLayer.clearLayers();
  let geo = null;
  try {
    if (CONFIG.ROUTER === 'ors' && CONFIG.ORS_API_KEY) {
      const r = await fetch('https://api.openrouteservice.org/v2/directions/driving-car/geojson', { method: 'POST',
        headers: { Authorization: CONFIG.ORS_API_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ coordinates: points.map(p => [p.lng, p.lat]) }) });
      const d = await r.json(); geo = d.features && d.features[0].geometry;
    } else {
      const coords = points.map(p => `${p.lng.toFixed(5)},${p.lat.toFixed(5)}`).join(';');
      const r = await fetch(`${CONFIG.OSRM_URL}/route/v1/driving/${coords}?overview=full&geometries=geojson`);
      const d = await r.json(); geo = d.routes && d.routes[0].geometry;
    }
  } catch (err) { console.warn('Route geometry failed', err); }
  const latlngs = geo ? geo.coordinates.map(c => [c[1], c[0]]) : points.map(p => [p.lat, p.lng]);
  L.polyline(latlngs, { color: '#fff', weight: 8, opacity: 0.9 }).addTo(routeLayer);
  L.polyline(latlngs, { color: '#A4161A', weight: 4.5, opacity: 0.95, dashArray: geo ? null : '6 8' }).addTo(routeLayer);
  map.fitBounds(L.latLngBounds(latlngs).pad(0.15), { paddingTopLeft: isMobile() ? [0, 0] : [20, 20] });
}

function eventWindowFor(p, dateStr, fromMs) {
  const ev = S.events.filter(e => e.pandal_id === p.id && String(e.date).slice(0, 10) === dateStr && e.endMs > fromMs + 20 * MIN).sort((a, b) => a.startMs - b.startMs)[0];
  return ev ? { startMs: ev.startMs, endMs: ev.endMs, title: ev.title, confirmed: ev.confirmed } : null;
}
function scoreFor(p, dateStr, startMs, budgetMin) {
  let s = p.tier * 10 + Math.min(4, p.sources.length);
  if (S.interests.has('landmark')) s += p.tier === 3 ? 12 : 0;
  if (S.interests.has('heritage') && p.sinceNum) s += p.sinceNum < 1980 ? 12 : p.sinceNum < 2000 ? 7 : 0;
  if (S.interests.has('theme') && (p.theme || /theme/i.test(p.knownFor))) s += 9;
  if (S.interests.has('bhog') && /yes|free|pass|donation/i.test(p.bhog)) s += 8;
  if (S.interests.has('culture') && S.events.some(e => e.pandal_id === p.id && String(e.date).slice(0, 10) === dateStr && e.startMs < startMs + budgetMin * MIN)) s += 12;
  const live = E.liveCrowd(checkinsFor(p.id), now());
  if (live) s += Math.min(5, live.reports);                      // a bit of FOMO for buzzing pujos
  if (/unconfirmed/i.test(p.status)) s *= 0.4;
  if (!pinTrusted(p)) s *= 0.9;
  return s;
}

async function runOptimise() {
  const btn = $('#optimise-btn');
  btn.disabled = true; status('#plan-status', 'Finding where you are…');
  try {
    const start = await resolveStart();
    const endMode = $('#end-src').value;
    const end = endMode === 'start' ? start : endMode === 'map' ? S.end : null;
    if (endMode === 'map' && !S.end) { alertPlan('Tap "Finish → Pick on map" and choose a point first.'); return; }
    const dateStr = $('#plan-day').value, startMs = E.istToMs(dateStr, $('#plan-time').value || '17:30');
    const dwell = Number($('#dwell').value), vehicle = $('#vehicle').value;
    const avoid = $('#avoid-crowds').checked || S.interests.has('calm') && S.planMode === 'auto' ? 1 : 0;
    const nowMs = Math.min(now(), startMs);

    let cands;
    if (S.planMode === 'pick') {
      cands = S.selected.map(id => S.byId[id]).filter(hasPin);
      if (cands.length < 1) { alertPlan('Pick at least one pandal (Explore tab or map pins).'); return; }
    } else {
      const radius = Number($('#radius').value), budget = Number($('#budget').value);
      cands = S.pandals.filter(p => hasPin(p) && p.entry !== 'Restricted' && E.haversineKm(start, p) <= radius
        && (!S.interests.has('open') || p.entry === 'Open to all'));
      cands = cands.map(p => ({ p, s: scoreFor(p, dateStr, startMs, budget) })).sort((a, b) => b.s - a.s).slice(0, 30).map(x => x.p);
      if (!cands.length) { alertPlan('No pujos match within that distance. Widen "Stay within".'); return; }
    }
    status('#plan-status', `Getting road times for ${cands.length} pujos…`);
    const points = [start, ...cands, ...(end ? [end] : [])];
    const matrix = await getMatrix(points);
    const stops = cands.map(p => ({ id: p.id, tier: p.tier, dwellMin: dwell, checkins: checkinsFor(p.id),
      window: eventWindowFor(p, dateStr, startMs), score: scoreFor(p, dateStr, startMs, 480) }));
    const closeDay = E.istParts(startMs).h < 4 ? E.istParts(startMs - 6 * HOUR).dateStr : dateStr;  // after-midnight starts belong to the previous night
    const P = { stops, matrix, hasEnd: !!end, startMs, nowMs, vehicle, avoidCrowds: avoid, catchEvents: $('#catch-events').checked,
                closeMs: E.istToMs(closeDay, E.CLOSING) + (E.istToMs(closeDay, E.CLOSING) < startMs ? 24 * HOUR : 0) };
    status('#plan-status', 'Optimising…');
    await new Promise(r => setTimeout(r, 20));
    let result, sub = P;
    if (S.planMode === 'pick') result = E.optimise(P);
    else {
      const out = E.planWithinBudget(P, Number($('#budget').value), 12);
      if (!out.chosen.length) { alertPlan('Nothing fits in that time from here. Try more hours or a later start.'); return; }
      result = out.result; sub = out.sub;
    }
    const ordered = result.order.map(k => S.byId[sub.stops[k].id]);
    S.lastPlan = { result, sub, ordered, start, end, dateStr, matrixSource: matrix.source };
    status('#plan-status', '');
    renderPlan();
    drawPlanOnMap();
    await drawRouteGeometry([start, ...ordered, ...(end ? [end] : [])]);
  } catch (err) {
    console.error(err); alertPlan('Something went wrong: ' + err.message);
  } finally { btn.disabled = false; }
}

function drawPlanOnMap() {
  stopLayer.clearLayers();
  const { ordered } = S.lastPlan;
  ordered.forEach((p, i) => L.marker([p.lat, p.lng], { zIndexOffset: 2000, icon: L.divIcon({ className: '', html: `<div class="stopnum">${i + 1}</div>`, iconSize: [24, 24], iconAnchor: [12, 30] }) })
    .on('click', () => openDetail(p.id)).addTo(stopLayer));
}
function renderPlan() {
  const { result, sub, ordered, start, end, dateStr, matrixSource } = S.lastPlan;
  const day = E.PUJA_DAYS.find(d => d.date === dateStr);
  const late = result.legs.filter(l => l.late);
  const caught = result.legs.filter(l => sub.stops[l.stop].window && !l.late);
  const saving = result.baseline && S.planMode === 'pick' && ordered.length >= 3 ? result.baseline.totalMin - result.totalMin : 0;
  const legsHtml = result.legs.map((l, i) => {
    const p = ordered[i], st = sub.stops[l.stop], w = st.window;
    const warn = [
      l.late && w ? `Misses “${esc(w.title)}” (${E.fmtTime(w.startMs)}–${E.fmtTime(w.endMs)}): not worth the detour on this route` : '',
      l.closed ? 'Arrives after ~11:30 pm, when the pandal may be winding down. Start earlier or drop a stop.' : '',
      p.entry !== 'Open to all' ? esc(p.entry) : '',
      !pinTrusted(p) ? 'Pin is approximate. Check the venue name in Maps' : '',
    ].filter(Boolean);
    const uber = `https://m.uber.com/ul/?action=setPickup&pickup=my_location&dropoff[latitude]=${p.lat}&dropoff[longitude]=${p.lng}&dropoff[nickname]=${encodeURIComponent(p.short)}`;
    return `<li class="tl"><div class="num">${i + 1}</div><div>
      <div class="drive">${Math.round(l.driveMin)} min drive · ${l.distKm.toFixed(1)} km · park ~${Math.round(l.parkMin)} min</div>
      <div class="stop" data-detail="${p.id}"><b>${esc(p.short)}</b> <span class="small muted">${esc(p.area)}</span>
        <div class="when"><b>${E.fmtTime(l.start)}</b>–${E.fmtTime(l.finish)} ${crowdChip(l.crowd)} <span class="small muted">~${Math.round(l.queueMin)} min queue</span>
        ${w && !l.late ? `<span class="badge o">${esc(w.title)}${w.confirmed ? '' : ' (time TBC)'}</span>` : ''}
        ${l.waitedForEventMin > 1 ? `<span class="small muted">(waits ${Math.round(l.waitedForEventMin)} min for it)</span>` : ''}
        <a class="uber" href="${uber}" target="_blank" rel="noopener">Cab here ↗</a></div>
        ${warn.map(x => `<div class="warn">${x}</div>`).join('')}</div></div></li>`;
  }).join('');
  const endHtml = result.endLeg ? `<li class="tl end"><div class="num">END</div><div><div class="drive">${Math.round(result.endLeg.driveMin)} min drive · ${result.endLeg.distKm.toFixed(1)} km</div>
    <div class="stop"><b>${$('#end-src').value === 'start' ? 'Back home' : 'Finish'}</b> · ${E.fmtTime(result.endLeg.arriveMs)}</div></div></li>` : '';
  $('#plan-result').innerHTML = `
    <div class="summary">
      <div class="summary-top">
        <div><b>${ordered.length}</b><span>pujos</span></div>
        <div><b>${fmtDur(result.totalMin)}</b><span>total</span></div>
        <div><b>${fmtDur(result.driveMin)}</b><span>on the road</span></div>
        <div><b>${E.fmtTime(result.endMs)}</b><span>done by</span></div>
      </div>
      ${saving > 5 ? `<div class="saving">Saves <b>${fmtDur(saving)}</b> compared with going in the order you picked them.</div>` : ''}
      ${caught.length ? `<div class="saving">Catches: ${caught.map(l => esc(sub.stops[l.stop].window.title) + ' at ' + esc(S.byId[sub.stops[l.stop].id].short)).join('; ')}</div>` : ''}
      ${late.length && sub.catchEvents ? `<div class="saving">Skips ${late.length} scheduled moment${late.length > 1 ? 's' : ''} that would cost more than ~${E.EVENT_VALUE} min of detour.</div>` : ''}
      ${result.legs.some(l => l.closed) ? `<div class="saving" style="color:var(--c5)">Too many stops for one evening: some arrive after closing. Drop a few or leave earlier.</div>` : ''}
      <div class="small muted" style="margin-top:8px">${day ? day.en : ''} · leave ${E.fmtTime(sub.startMs)} · ~${fmtDur(result.queueMin)} queueing · ${result.distKm.toFixed(0)} km.
        Road times: ${esc(matrixSource)} × Bengaluru evening traffic model. ${result.method === 'exact' ? 'Order is the proven optimum for this model.' : 'Order found by local search (near-optimal).'}</div>
      <div class="actions">${mapsLinks(start, ordered, S.lastPlan.end)}<button id="share-wa">Share plan</button></div>
    </div>
    <ol class="timeline"><li class="tl start"><div class="num">GO</div><div><div class="stop"><b>Start</b> · ${E.fmtTime(sub.startMs)}</div></div></li>${legsHtml}${endHtml}</ol>`;
  $('#share-wa').onclick = shareWhatsApp;
}
function mapsLinks(start, ordered, end) {
  const pts = [start, ...ordered, ...(end ? [end] : [])].map(p => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`);
  const links = [];
  for (let i = 0; i < pts.length - 1; i += 10) {                 // Google Maps allows 9 waypoints per link
    const chunk = pts.slice(i, i + 11);
    const url = `https://www.google.com/maps/dir/?api=1&origin=${chunk[0]}&destination=${chunk[chunk.length - 1]}&travelmode=driving${chunk.length > 2 ? '&waypoints=' + encodeURIComponent(chunk.slice(1, -1).join('|')) : ''}`;
    links.push(url);
  }
  return links.map((u, i) => `<a href="${u}" target="_blank" rel="noopener">Open in Google Maps${links.length > 1 ? ` (part ${i + 1})` : ''}</a>`).join('');
}
function shareWhatsApp() {
  const { result, ordered, dateStr } = S.lastPlan;
  const day = E.PUJA_DAYS.find(d => d.date === dateStr);
  const lines = result.legs.map((l, i) => `${i + 1}. ${E.fmtTime(l.start)}: ${ordered[i].short} (${ordered[i].area})`);
  const url = appUrl();
  const text = `My pandal-hopping plan for ${day ? day.en : dateStr}: ${ordered.length} pujos, done by ${E.fmtTime(result.endMs)}:\n${lines.join('\n')}\n\nPlanned with Dhaak`;
  shareText('My pujo plan', text, url);
}

const appUrl = (params) => location.origin + location.pathname + (params ? '?' + new URLSearchParams(params) : '');
/** Phone share sheet (WhatsApp, Instagram, Telegram…) when available, WhatsApp link otherwise. */
function shareText(title, text, url) {
  if (navigator.share) { navigator.share({ title, text, url }).catch(() => {}); return; }
  window.open('https://wa.me/?text=' + encodeURIComponent(text + '\n' + url), '_blank', 'noopener');
}
function sharePandal(id) {
  const p = S.byId[id]; if (!p) return;
  const c = hasPin(p) ? crowdNow(p) : null;
  shareText(p.short, `${p.short} (${p.area})${c ? ' is ' + E.CROWD_LABELS[levelOf(c.level)].toLowerCase() + ' right now' : ''}. See it live on Dhaak`, appUrl({ p: id }));
}

/* =====================================================================
   CONTRIBUTE  (with an offline outbox: no signal in a packed pandal is normal)
   ===================================================================== */
async function post(payload) {
  if (S.demo) return { ok: true, demo: true };
  const body = { ...payload, device: deviceId, client_ts: new Date().toISOString() };
  try {
    const r = await fetch(CONFIG.APPS_SCRIPT_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) });
    return await r.json();
  } catch (err) {
    enqueue(body);
    return { ok: true, queued: true };
  }
}
function enqueue(body) {
  const box = store.get('outbox', []);
  box.push({ body, at: Date.now() });
  store.set('outbox', box.slice(-20));
  if (store.get('outbox', []).length < Math.min(box.length, 20)) {        // storage full (photos) - keep the report, drop the photo
    store.set('outbox', box.slice(-20).map(x => ({ ...x, body: { ...x.body, photo_b64: '' } })));
  }
}
let flushing = false;
async function flushOutbox() {
  if (S.demo || flushing || !navigator.onLine) return;
  const box = store.get('outbox', []); if (!box.length) return;
  flushing = true;
  const keep = [];
  for (const item of box) {
    // a crowd report older than 30 min describes a crowd that has moved on - drop it rather than mislead
    if (item.body.action === 'checkin' && Date.now() - item.at > 30 * MIN) continue;
    try {
      await fetch(CONFIG.APPS_SCRIPT_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(item.body) });
    } catch (err) { keep.push(item); }
  }
  store.set('outbox', keep);
  flushing = false;
  if (box.length > keep.length) toast(`Sent ${box.length - keep.length} saved report${box.length - keep.length > 1 ? 's' : ''}.`);
}
function toast(msg, ms) {
  const t = $('#toast'); t.innerHTML = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, ms || 3500);
}

/* ---------- One-tap "I'm here": GPS picks the pandal, one tap on a crowd level sends ---------- */
const QC = { pandal: null, wait: null, photo: '', dist: null, loc: null };
async function openHere() {
  const qc = $('#qc'); qc.hidden = false;
  Object.assign(QC, { pandal: null, wait: null, photo: '', dist: null, loc: null });
  $$('#qc-wait button').forEach(b => b.classList.remove('sel'));
  $('#qc-photo-note').textContent = ''; status('#qc-status', '');
  $('#qc-title').textContent = 'Finding the pujo you\'re at…'; $('#qc-sub').textContent = 'Using your location'; $('#qc-pandal').hidden = true;
  setQcEnabled(false);
  const loc = await locate();
  QC.loc = loc;
  const pinned = S.pandals.filter(hasPin);
  const near = loc ? pinned.map(p => ({ p, d: E.haversineKm(loc, p) * 1000 })).sort((a, b) => a.d - b.d) : [];
  const sel = $('#qc-pandal');
  sel.innerHTML = (near.length ? near.map(x => x.p) : [...S.pandals].sort((a, b) => a.short.localeCompare(b.short)))
    .map(p => `<option value="${p.id}">${esc(p.short)}, ${esc(p.area)}</option>`).join('');
  if (near.length && near[0].d <= 600) {
    QC.pandal = near[0].p.id; QC.dist = near[0].d;
    $('#qc-title').textContent = near[0].p.short;
    $('#qc-sub').innerHTML = `You're ${Math.round(near[0].d)} m away · ${esc(near[0].p.area)} <a href="#" id="qc-change">Not here?</a>`;
  } else {
    $('#qc-title').textContent = 'Which pujo are you at?';
    $('#qc-sub').textContent = loc ? `Nearest pinned pujo is ${near[0].p.short}, ${(near[0].d / 1000).toFixed(1)} km away. Pick yours (pins are approximate).`
                                   : 'Location is off. Pick your pujo. Reports from the venue count more.';
    sel.hidden = false; QC.pandal = sel.value;
  }
  setQcEnabled(true);
}
function setQcEnabled(on) { $$('#qc-crowd button').forEach(b => b.disabled = !on); }
async function sendHere(level) {
  if (!QC.pandal) return;
  setQcEnabled(false); status('#qc-status', 'Sending…');
  const p = S.byId[QC.pandal];
  const dist = QC.loc && hasPin(p) ? E.haversineKm(QC.loc, p) * 1000 : null;
  const wait = QC.wait ?? Math.round(E.expectedWaitMin(level, p.tier) / 5) * 5;
  const r = await post({ action: 'checkin', pandal_id: p.id, crowd: level, wait_min: wait, note: '',
                         lat: QC.loc ? QC.loc.lat : null, lng: QC.loc ? QC.loc.lng : null, photo_b64: QC.photo });
  if (!r.ok) { status('#qc-status', r.error || 'Could not send', 'err'); setQcEnabled(true); return; }
  const verified = r.demo || r.queued ? dist !== null && dist <= 400 : r.verified;
  const entry = { ts: now(), pandal_id: p.id, crowd: level, wait_min: wait, note: '', verified, photo_url: r.photo_url || '', local: true };
  S.checkins.unshift(entry);
  if (S.demo) { const l = store.get('local-checkins', []); l.unshift(entry); store.set('local-checkins', l.slice(0, 50)); }
  $('#qc').hidden = true;
  toast(r.queued ? 'No signal. Saved on your phone; it sends automatically when you\'re back online.'
                 : `Thanks! ${p.short} marked <b>${E.CROWD_LABELS[level].toLowerCase()}</b>${verified ? ' · verified at venue' : ''}.`);
  refreshAll();
}
function initHere() {
  $('#qc-crowd').innerHTML = [1, 2, 3, 4, 5].map(l => `<button type="button" data-qc="${l}" style="background:var(--c${l})${l === 3 ? ';color:#3a2a00' : ''}"><b>${l}</b>${E.CROWD_LABELS[l]}</button>`).join('');
  $('#qc-crowd').addEventListener('click', e => { const b = e.target.closest('[data-qc]'); if (b) sendHere(+b.dataset.qc); });
  $('#qc-wait').addEventListener('click', e => { const b = e.target.closest('[data-wait]'); if (!b) return;
    QC.wait = +b.dataset.wait; $$('#qc-wait button').forEach(x => x.classList.toggle('sel', x === b)); });
  $('#qc-pandal').addEventListener('change', e => { QC.pandal = e.target.value; });
  $('#qc-sub').addEventListener('click', e => { if (e.target.id === 'qc-change') { e.preventDefault(); $('#qc-pandal').hidden = false; $('#qc-pandal').value = QC.pandal; } });
  $('#qc-close').addEventListener('click', () => { $('#qc').hidden = true; });
  $('#qc').addEventListener('click', e => { if (e.target.id === 'qc') $('#qc').hidden = true; });
  $('#qc-photo').addEventListener('change', async e => { const f = e.target.files[0]; if (!f) return;
    $('#qc-photo-note').textContent = 'Preparing photo…'; QC.photo = await resizeImage(f, 1024); $('#qc-photo-note').textContent = 'Photo attached ✓'; });
}

/* ---------- Install (PWA) ---------- */
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
function installButtonHtml() {
  if (isStandalone()) return '';
  if (S.installPrompt) return '<button class="hero-btn ghosted" data-install>Install app</button>';
  if (isIOS()) return '<button class="hero-btn ghosted" data-install-ios>Add to Home Screen</button>';
  return '';
}
function initPWA() {
  if ('serviceWorker' in navigator && /^https?:/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch(err => console.warn('Service worker not registered', err));
  }
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); S.installPrompt = e; renderLive(); });
  window.addEventListener('appinstalled', () => { S.installPrompt = null; renderLive(); toast('Dhaak is on your home screen. শুভ শারদীয়া!'); });
  window.addEventListener('online', () => { renderHeader(); flushOutbox(); poll(); toast('Back online.'); });
  window.addEventListener('offline', () => { renderHeader(); toast('No signal. Showing saved data; check-ins will be saved and sent later.', 5000); });
}
function fillPandalSelects() {
  const ref = S.userLoc;
  const list = [...S.pandals].sort((a, b) => ref && hasPin(a) && hasPin(b) ? E.haversineKm(ref, a) - E.haversineKm(ref, b) : a.short.localeCompare(b.short));
  const opts = list.map(p => `<option value="${p.id}">${esc(p.short)}, ${esc(p.area)}${ref && hasPin(p) ? ` (${E.haversineKm(ref, p).toFixed(1)} km)` : ''}</option>`).join('');
  ['#ci-pandal', '#rt-pandal', '#cm-pandal', '#fx-pandal'].forEach(s => { const v = $(s).value; $(s).innerHTML = opts; if (v) $(s).value = v; });
}
let ciCrowd = 0;
function initContribute() {
  $('#ci-crowd').innerHTML = [1, 2, 3, 4, 5].map(l => `<button type="button" data-crowd="${l}" style="background:var(--c${l})${l === 3 ? ';color:#3a2a00' : ''}"><b>${l}</b>${E.CROWD_LABELS[l]}</button>`).join('');
  $('#rt-stars').innerHTML = [['idol', 'Pratima (idol)'], ['pandal', 'Pandal / theme'], ['bhog', 'Bhog / food'], ['culture', 'Cultural programme'], ['management', 'Crowd management']]
    .map(([k, l]) => `<div class="stars" data-cat="${k}"><b>${l}</b><span>${[1, 2, 3, 4, 5].map(n => `<button type="button" data-star="${n}">★</button>`).join('')}</span></div>`).join('');
  $('#ci-crowd').addEventListener('click', e => { const b = e.target.closest('[data-crowd]'); if (!b) return; ciCrowd = +b.dataset.crowd; $$('#ci-crowd button').forEach(x => x.classList.toggle('sel', x === b)); });
  $('#rt-stars').addEventListener('click', e => {
    const b = e.target.closest('[data-star]'); if (!b) return;
    const row = b.closest('.stars'), n = +b.dataset.star; row.dataset.val = n;
    [...row.querySelectorAll('button')].forEach(x => x.classList.toggle('on', +x.dataset.star <= n));
  });

  $('#form-checkin').addEventListener('submit', async e => {
    e.preventDefault();
    if (!ciCrowd) return status('#ci-status', 'How crowded is it? Tap 1–5.', 'err');
    status('#ci-status', 'Checking your location…');
    const loc = await locate();
    const p = S.byId[$('#ci-pandal').value];
    const file = $('#ci-photo').files[0];
    const photo = file ? await resizeImage(file, 1024) : '';
    const payload = { action: 'checkin', pandal_id: p.id, crowd: ciCrowd, wait_min: +$('#ci-wait').value, note: $('#ci-note').value,
                      lat: loc ? loc.lat : null, lng: loc ? loc.lng : null, photo_b64: photo };
    try {
      const r = await post(payload);
      if (!r.ok) return status('#ci-status', r.error || 'Could not save', 'err');
      const dist = loc && hasPin(p) ? E.haversineKm(loc, p) * 1000 : null;
      const verified = r.demo || r.queued ? dist !== null && dist <= 400 : r.verified;
      const entry = { ts: now(), pandal_id: p.id, crowd: ciCrowd, wait_min: payload.wait_min, note: payload.note, verified,
                      photo_url: r.photo_url || (r.demo ? photo : ''), local: true };
      S.checkins.unshift(entry);
      if (S.demo) { const l = store.get('local-checkins', []); l.unshift({ ...entry, photo_url: '' }); store.set('local-checkins', l.slice(0, 50)); }
      status('#ci-status', r.queued ? 'No signal. Saved on your phone; it sends automatically when you\'re back online.'
        : `Thanks! ${verified ? 'Verified at the venue.' : 'Posted (not at the venue, so it counts a little less).'}${r.demo ? ' Demo mode: saved on this phone only.' : ''}`, 'ok');
      $('#form-checkin').reset(); ciCrowd = 0; $$('#ci-crowd button').forEach(x => x.classList.remove('sel'));
      refreshAll();
    } catch (err) { status('#ci-status', 'Network error. Try again.', 'err'); }
  });

  $('#form-rate').addEventListener('submit', async e => {
    e.preventDefault();
    const scores = Object.fromEntries($$('#rt-stars .stars').map(r => [r.dataset.cat, +r.dataset.val || null]));
    if (!Object.values(scores).some(Boolean)) return status('#rt-status', 'Tap a few stars first.', 'err');
    const id = $('#rt-pandal').value;
    try {
      const r = await post({ action: 'rate', pandal_id: id, scores });
      if (!r.ok) return status('#rt-status', r.error || 'Could not save', 'err');
      if (S.demo) {
        const year = E.istParts(now()).y;
        const l = store.get('local-ratings', []).filter(x => !(x.pandal_id === id && x.year === year));
        l.push({ pandal_id: id, year, n: 1, ...Object.fromEntries(Object.entries(scores).map(([k, v]) => [k, v || 0])) });
        store.set('local-ratings', l); S.ratings = l;
      }
      status('#rt-status', r.queued ? 'No signal. Saved; it sends when you\'re back online.' : 'Saved. ' + (S.demo ? '(Demo: on this phone only.)' : ''), 'ok');
    } catch (err) { status('#rt-status', 'Network error. Try again.', 'err'); }
  });

  $('#add-kind').addEventListener('click', e => {
    const b = e.target.closest('[data-kind]'); if (!b) return;
    S.addKind = b.dataset.kind; $$('#add-kind button').forEach(x => x.classList.toggle('active', x === b));
    $('#fx-pandal-wrap').hidden = S.addKind !== 'fix'; $('#ad-name-wrap').hidden = S.addKind === 'fix';
  });
  $('#ad-pick').addEventListener('click', () => { S.pickMode = 'add'; setHint('Tap the exact venue on the map'); if (isMobile()) setSheet('peek'); });
  $('#form-add').addEventListener('submit', async e => {
    e.preventDefault();
    const base = { area: $('#ad-area').value, venue: $('#ad-venue').value, lat: S.addLoc ? S.addLoc.lat : '', lng: S.addLoc ? S.addLoc.lng : '', notes: $('#ad-notes').value };
    const payload = S.addKind === 'fix'
      ? { action: 'correction', pandal_id: $('#fx-pandal').value, field: S.addLoc ? 'location' : 'venue', value: base.venue, lat: base.lat, lng: base.lng, note: [base.area, base.notes].filter(Boolean).join(' · ') }
      : { action: 'suggest_pandal', name: $('#ad-name').value, ...base };
    if (payload.action === 'suggest_pandal' && !payload.name) return status('#ad-status', 'Name is required.', 'err');
    try {
      const r = await post(payload);
      status('#ad-status', r.ok ? 'Thank you! Sent for review.' + (S.demo ? ' (Demo: not actually sent.)' : '') : (r.error || 'Could not save'), r.ok ? 'ok' : 'err');
      if (r.ok) { $('#form-add').reset(); S.addLoc = null; $('#ad-loc').textContent = 'no pin yet'; if (pickMarker) pickMarker.remove(); }
    } catch (err) { status('#ad-status', 'Network error. Try again.', 'err'); }
  });

  $('#form-committee').addEventListener('submit', async e => {
    e.preventDefault();
    const payload = { action: 'committee_update', pandal_id: $('#cm-pandal').value, kind: $('#cm-kind').value, message: $('#cm-msg').value, pin: $('#cm-pin').value };
    try {
      const r = await post(payload);
      if (!r.ok) return status('#cm-status', r.error || 'Could not post', 'err');
      const u = { ts: now(), pandal_id: payload.pandal_id, kind: payload.kind, message: payload.message, posted_by: 'committee', demo: S.demo };
      S.updates.unshift(u);
      if (S.demo) { const l = store.get('local-updates', []); l.unshift(u); store.set('local-updates', l.slice(0, 20)); }
      status('#cm-status', 'Posted to the live feed.' + (S.demo ? ' (Demo: any PIN works, saved on this phone only.)' : ''), 'ok');
      $('#cm-msg').value = ''; refreshAll();
    } catch (err) { status('#cm-status', 'Network error. Try again.', 'err'); }
  });
}
function resizeImage(file, max) {
  return new Promise(resolve => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = () => resolve('');
    img.src = url;
  });
}
function openContribute(mode, id) {
  switchTab('contribute');
  const map_ = { checkin: 'checkin', rate: 'rate', fix: 'add' };
  setContribMode(map_[mode]);
  if (mode === 'fix') { $('#add-kind [data-kind="fix"]').click(); $('#fx-pandal').value = id; }
  if (mode === 'checkin') $('#ci-pandal').value = id;
  if (mode === 'rate') $('#rt-pandal').value = id;
  $('#detail').hidden = true;
}
function setContribMode(m) {
  $$('#contrib-mode button').forEach(b => b.classList.toggle('active', b.dataset.mode === m));
  ['checkin', 'rate', 'add', 'committee'].forEach(k => $('#form-' + k).hidden = k !== m);
}

/* =====================================================================
   SHELL: tabs, mobile sheet, events, polling
   ===================================================================== */
const isMobile = () => window.innerWidth <= 860;
function switchTab(name) {
  $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  $$('#bottomnav [data-nav]').forEach(b => b.classList.toggle('active', b.dataset.nav === name));
  $$('.tabpane').forEach(p => p.classList.toggle('active', p.id === 'tab-' + name));
  $('#detail').hidden = true;
  if (isMobile()) setSheet('half');
}
function setSheet(state) {
  if (!isMobile()) return;
  const panel = $('#panel'), h = panel.offsetHeight || window.innerHeight * 0.8;
  const off = state === 'full' ? 0 : state === 'half' ? h * 0.42 : h - 92;
  panel.style.setProperty('--sheet-offset', off + 'px'); panel.dataset.sheet = state;
  setTimeout(() => map && map.invalidateSize(), 260);
}
function initSheetDrag() {
  const panel = $('#panel'), handle = $('#sheet-handle');
  let y0 = null, off0 = 0;
  const cur = () => parseFloat(getComputedStyle(panel).getPropertyValue('--sheet-offset')) || 0;
  handle.addEventListener('pointerdown', e => { y0 = e.clientY; off0 = cur(); panel.classList.add('dragging'); handle.setPointerCapture(e.pointerId); });
  handle.addEventListener('pointermove', e => { if (y0 === null) return; panel.style.setProperty('--sheet-offset', Math.max(0, off0 + e.clientY - y0) + 'px'); });
  handle.addEventListener('pointerup', e => {
    if (y0 === null) return; panel.classList.remove('dragging');
    const moved = e.clientY - y0, h = panel.offsetHeight; y0 = null;
    if (Math.abs(moved) < 6) return setSheet(panel.dataset.sheet === 'full' ? 'half' : 'full');
    const o = cur(); setSheet(o < h * 0.22 ? 'full' : o < h * 0.7 ? 'half' : 'peek');
  });
  window.addEventListener('resize', () => { if (isMobile()) setSheet(panel.dataset.sheet || 'half'); else panel.style.removeProperty('--sheet-offset'); });
  setSheet('half');
}
function wireEvents() {
  $$('.tab').forEach(t => t.addEventListener('click', () => switchTab(t.dataset.tab)));
  document.addEventListener('click', e => {
    const add = e.target.closest('[data-add]'); if (add) { e.stopPropagation(); toggleSelect(add.dataset.add); return; }
    const un = e.target.closest('[data-unsel]'); if (un) { toggleSelect(un.dataset.unsel); return; }
    const c = e.target.closest('[data-contrib]'); if (c) { openContribute(c.dataset.contrib, c.dataset.id); return; }
    const d = e.target.closest('[data-detail]'); if (d && !e.target.closest('.uber')) { e.preventDefault(); openDetail(d.dataset.detail); return; }
    const g = e.target.closest('[data-goto]'); if (g) { e.preventDefault(); switchTab(g.dataset.goto); return; }
    const sh = e.target.closest('[data-share]'); if (sh) { sharePandal(sh.dataset.share); return; }
    if (e.target.closest('[data-here]')) { openHere(); return; }
    if (e.target.closest('[data-install]') && S.installPrompt) { S.installPrompt.prompt(); S.installPrompt.userChoice.finally(() => { S.installPrompt = null; renderLive(); }); return; }
    if (e.target.closest('[data-install-ios]')) { toast('Tap the <b>Share</b> button in Safari, then <b>Add to Home Screen</b>.', 6000); return; }
  });
  $('#bottomnav').addEventListener('click', e => {
    const b = e.target.closest('[data-nav]'); if (!b) return;
    if (b.dataset.nav === 'here') { openHere(); return; }
    const already = b.classList.contains('active') && $('#panel').dataset.sheet !== 'peek';
    switchTab(b.dataset.nav);
    if (b.dataset.nav === 'contribute') setContribMode('checkin');
    if (already) setSheet($('#panel').dataset.sheet === 'full' ? 'half' : 'full');   // tap again to expand
  });
  $('#search').addEventListener('input', renderExplore);
  $('#sort').addEventListener('change', async () => { if ($('#sort').value === 'near' && !S.userLoc) await locate(); renderExplore(); });
  $('#zone-chips').addEventListener('click', e => { const b = e.target.closest('[data-zone]'); if (!b) return; S.zone = b.dataset.zone; renderExploreChips(); renderExplore(); });
  $('#filter-chips').addEventListener('click', e => { const b = e.target.closest('[data-filter]'); if (!b) return; const k = b.dataset.filter; S.filters.has(k) ? S.filters.delete(k) : S.filters.add(k); renderExploreChips(); renderExplore(); });
  $('#interest-chips').addEventListener('click', e => { const b = e.target.closest('[data-interest]'); if (!b) return; const k = b.dataset.interest; S.interests.has(k) ? S.interests.delete(k) : S.interests.add(k); renderInterestChips(); });
  $('#plan-mode').addEventListener('click', e => { const b = e.target.closest('[data-mode]'); if (!b) return; S.planMode = b.dataset.mode;
    $$('#plan-mode button').forEach(x => x.classList.toggle('active', x === b)); $('#pick-pane').hidden = S.planMode !== 'pick'; $('#auto-pane').hidden = S.planMode !== 'auto';
    $('#optimise-btn').textContent = S.planMode === 'pick' ? 'Optimise my route' : 'Plan my evening'; });
  $('#contrib-mode').addEventListener('click', e => { const b = e.target.closest('[data-mode]'); if (b) setContribMode(b.dataset.mode); });
  $('#start-src').addEventListener('change', async () => {
    if ($('#start-src').value === 'map') { S.pickMode = 'start'; setHint('Tap where you\'re starting from'); if (isMobile()) setSheet('peek'); }
    else { S.start = null; await resolveStart(); }
  });
  $('#end-src').addEventListener('change', () => { if ($('#end-src').value === 'map') { S.pickMode = 'end'; setHint('Tap where you want to finish'); if (isMobile()) setSheet('peek'); } drawEndpoints(); });
  $('#optimise-btn').addEventListener('click', runOptimise);
  $('#btn-style').addEventListener('click', cycleMapStyle);
  $('#btn-heat').addEventListener('click', e => { S.heatOn = !S.heatOn; e.target.classList.toggle('on', S.heatOn); renderMarkers(); });
  $('#btn-labels').addEventListener('click', e => { S.labelsOn = !S.labelsOn; e.target.classList.toggle('on', S.labelsOn); map.getContainer().classList.toggle('show-labels', S.labelsOn); });
  $('#btn-locate').addEventListener('click', async () => { const l = await locate(); if (l) { map.flyTo([l.lat, l.lng], 14); L.circleMarker([l.lat, l.lng], { radius: 7, color: '#fff', weight: 3, fillColor: '#1D4ED8', fillOpacity: 1 }).addTo(map); fillPandalSelects(); } });
  $('#demo-banner-close').addEventListener('click', () => { $('#demo-banner').hidden = true; document.body.classList.remove('has-banner'); setTimeout(() => map.invalidateSize(), 50); });
}
function refreshAll() { renderHeader(); renderMarkers(); renderLive(); renderExplore(); }
async function poll() {
  flushOutbox();
  if (S.demo) { if (!$('#timetravel').value) generateDemoPulse(); refreshAll(); return; }
  try {
    const r = await fetch(`${CONFIG.APPS_SCRIPT_URL}?action=pulse&since=${encodeURIComponent(S.lastServerTime || '')}`);
    const d = await r.json(); if (!d.ok) return;
    S.lastServerTime = d.server_time;
    const ck = new Set(S.checkins.map(c => c.pandal_id + c.ts));
    d.checkins.forEach(c => { const x = { ...c, ts: Date.parse(c.ts) }; if (!ck.has(x.pandal_id + x.ts)) S.checkins.unshift(x); });
    d.updates.forEach(u => S.updates.unshift({ ...u, ts: Date.parse(u.ts) }));
    S.checkins = S.checkins.filter(c => now() - c.ts < 6 * HOUR);
    S.savedAt = null;
    refreshAll();
  } catch (err) { /* offline: keep showing what we have */ }
}

async function boot() {
  if (!window.L || !window.DhaakEngine) {           // a script failed to load (e.g. vendor/ folder missing from the deploy)
    const missing = [!window.L && 'vendor/leaflet/leaflet.js', !window.DhaakEngine && 'js/engine.js'].filter(Boolean).join(', ');
    $('#livepill-text').textContent = 'Error';
    $('#live-hero').innerHTML = `<h2>Couldn't start</h2><p>A required file didn't load: ${missing}. If you just deployed, check that the whole folder was uploaded, then refresh.</p>`;
    console.error('Dhaak: missing', missing);
    return;
  }
  initMap();
  await loadData();
  if (S.demo) { $('#demo-banner').hidden = false; document.body.classList.add('has-banner'); initTimeTravel(); }
  setTimeout(() => map.invalidateSize(), 50);
  initPlanForm(); renderExploreChips(); initContribute(); initHere(); fillPandalSelects(); wireEvents(); initSheetDrag(); initPWA();
  refreshAll();
  flushOutbox();
  // deep links: ?p=BLR007 (shared pujo), ?action=here (home-screen shortcut), ?tab=plan
  const q = new URLSearchParams(location.search);
  if (q.get('tab')) switchTab(q.get('tab'));
  if (q.get('p') && S.byId[q.get('p')]) openDetail(q.get('p'));
  if (q.get('action') === 'here') openHere();
  map.getContainer().classList.toggle('show-landmarks', map.getZoom() >= 12);
  setInterval(poll, CONFIG.POLL_SECONDS * 1000);
  locate().then(l => { if (l) { fillPandalSelects(); if ($('#sort').value === 'near') renderExplore(); } });
  window.Dhaak = { S, E, runOptimise, openDetail, toggleSelect };   // handy for debugging in the console
}
boot();
})();
