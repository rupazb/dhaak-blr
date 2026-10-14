/* Dhaak service worker - makes the app installable and usable with bad or no signal.
 *
 *  App shell (html/css/js/data/icons) ... stale-while-revalidate (instant load, refreshes in background)
 *  index.html (navigations) ............. network-first, cached copy when offline
 *  Map tiles (CARTO / OSM) .............. cache-first, capped (recently viewed areas work offline)
 *  Apps Script bootstrap (pujo list) .... network-first, cached copy when offline
 *  Live pulse / routing / POSTs ......... network only (the app handles failures itself)
 *
 * Bump VERSION whenever you deploy changed files so phones pick them up.
 */
const VERSION = 'dhaak-v1.2.1';
const SHELL = `${VERSION}-shell`, TILES = 'dhaak-tiles', DATA = 'dhaak-data', MEDIA = 'dhaak-media';
const SHELL_FILES = [
  './', './index.html', './css/dhaak.css', './js/app.js', './js/engine.js', './data/seed.js',
  './vendor/leaflet/leaflet.js', './vendor/leaflet/leaflet.css', './vendor/leaflet/leaflet-heat.js',
  './manifest.webmanifest', './brand/dhaak-mark.svg', './icons/icon-192.png', './icons/icon-512.png', './icons/favicon-32.png',
];
const MAX_TILES = 800, MAX_MEDIA = 120;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keep = [SHELL, TILES, DATA, MEDIA];
    for (const k of await caches.keys()) if (!keep.includes(k)) await caches.delete(k);
    await self.clients.claim();
  })());
});

async function trim(cacheName, max) {
  const c = await caches.open(cacheName);
  const keys = await c.keys();
  for (let i = 0; i < keys.length - max; i++) await c.delete(keys[i]);   // oldest first
}

async function cacheFirst(req, cacheName, max) {
  const c = await caches.open(cacheName);
  const hit = await c.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') { c.put(req, res.clone()); trim(cacheName, max); }
  return res;
}

async function networkFirst(req, cacheName, key) {
  const c = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res.ok) c.put(key || req, res.clone());
    return res;
  } catch (err) {
    const hit = await c.match(key || req, { ignoreSearch: !key });
    if (hit) return hit;
    throw err;
  }
}

async function staleWhileRevalidate(req) {
  const c = await caches.open(SHELL);
  const hit = await c.match(req, { ignoreSearch: true });
  const fresh = fetch(req).then(res => { if (res.ok) c.put(req, res.clone()); return res; }).catch(() => hit);
  return hit || fresh;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;                                   // POSTs go straight to the network
  const url = new URL(req.url);

  if (req.mode === 'navigate') { e.respondWith(networkFirst(req, SHELL, './index.html')); return; }
  if (url.origin === location.origin) { e.respondWith(staleWhileRevalidate(req)); return; }

  if (/basemaps\.cartocdn\.com$|tile\.openstreetmap\.(org|fr)$/.test(url.hostname)) {
    e.respondWith(cacheFirst(req, TILES, MAX_TILES)); return;
  }
  if (url.hostname === 'script.google.com' && url.searchParams.get('action') === 'bootstrap') {
    e.respondWith(networkFirst(req, DATA, 'dhaak-bootstrap')); return;
  }
  if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname) || url.hostname === 'drive.google.com') {
    e.respondWith(cacheFirst(req, MEDIA, MAX_MEDIA)); return;
  }
  // everything else (live pulse, OSRM/ORS routing, Uber/Maps links) - default network behaviour
});
