/**
 * Dhaak: Bengaluru Pujo Live : Google Apps Script backend
 * --------------------------------------------------------
 * Same pattern as Niram: the Google Sheet is the database, and this script,
 * deployed as a Web App bound to that Sheet, is the API.
 *
 * Unlike Niram, the dashboard does NOT need a Sheets API key: GET requests
 * to this Web App return JSON for everything (pandals, events, live pulse,
 * rating aggregates), so one URL is all the front end needs.
 *
 * TABS (created by setup()):
 *   Pandals: the directory (one row per pujo). Edit freely; it's the source of truth.
 *   Events: must-catch moments (bhog, anjali, sandhi, cultural nights). pandal_id "*" = citywide.
 *   CheckIns: live crowd reports from visitors (GPS-verified if within VERIFY_RADIUS_M).
 *   Ratings: one row per device × pandal × year (re-rating overwrites).
 *   Updates: official status posts from committees (bhog open, gates closed, queue…). PIN-protected.
 *   Committees: pandal_id, pin_sha256, contact. Give each committee its PIN privately.
 *   Corrections: "fix this pin / venue" suggestions from users, for moderation.
 *   Submissions: "add a missing pujo" suggestions, for moderation (copy approved rows into Pandals).
 *
 * DEPLOY
 *   1. Create a Google Sheet. Extensions → Apps Script → paste this file.
 *   2. Run setup() once (authorise). It creates the tabs with headers.
 *   3. Project Settings → Script properties:
 *        ADMIN_KEY        = a long random string (used by scripts/build_seed.py --push)
 *        PHOTO_FOLDER_ID  = (optional) Drive folder id for check-in photos
 *   4. Deploy → New deployment → Web app → Execute as: Me, Who has access: Anyone.
 *   5. Paste the /exec URL into APPS_SCRIPT_URL at the top of index.html.
 *   6. Seed the data:  python scripts/build_seed.py --push <exec URL> --admin-key <ADMIN_KEY>
 *      (or File → Import data/pandals.csv into the Pandals tab and data/events.csv into Events).
 *   7. To give a committee posting rights: run addCommittee('BLR007', '4821', 'name/phone')
 *      from the editor. Only the SHA-256 of the PIN is stored.
 */

const TABS = {
  Pandals: ['id','name','short_name','area','zone','venue','latitude','longitude','coord_confidence',
            'since_year','edition_2026','type','entry','known_for','theme_2026','highlights_2026',
            'nearest_metro','bhog','pet_friendly','parking','buzz_tier','status_2026','photo_url',
            'website','sources','last_verified','verified_by'],
  Events: ['pandal_id','date','start','end','title','kind','time_confirmed','source'],
  CheckIns: ['ts','pandal_id','crowd','wait_min','note','photo_url','lat','lng','dist_m','verified','device'],
  Ratings: ['ts','pandal_id','year','idol','pandal','bhog','culture','management','device'],
  Updates: ['ts','pandal_id','kind','message','posted_by'],
  Committees: ['pandal_id','pin_sha256','contact'],
  Corrections: ['ts','pandal_id','field','value','lat','lng','note','device','status'],
  Submissions: ['ts','name','area','venue','lat','lng','since_year','notes','contact','device','status'],
};

const VERIFY_RADIUS_M = 400;        // check-in counts as "at the pandal" within this distance
const CHECKIN_COOLDOWN_MIN = 20;    // same device can't re-report the same pandal within this window
const DEVICE_DAILY_CAP = 40;        // max check-ins per device per day
const LIVE_WINDOW_HOURS = 6;        // how far back bootstrap returns check-ins
const UPDATES_WINDOW_HOURS = 18;

/* ------------------------------------------------------------------ setup */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.setSpreadsheetTimeZone('Asia/Kolkata');   // event dates/times are IST
  Object.keys(TABS).forEach(name => {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    if (sh.getLastRow() === 0) {
      sh.getRange(1, 1, 1, TABS[name].length).setValues([TABS[name]]).setFontWeight('bold');
      sh.setFrozenRows(1);
    }
  });
}

function addCommittee(pandalId, pin, contact) {
  sheet_('Committees').appendRow([pandalId, sha256_(String(pin)), contact || '']);
}

/* ------------------------------------------------------------------ HTTP */
function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || 'bootstrap';
  try {
    if (action === 'bootstrap') return json_(cached_('bootstrap', 30, bootstrap_));
    if (action === 'pulse') return json_(pulse_(e.parameter.since));
    if (action === 'ratings') return json_({ ratings: ratingAggregates_() });
    return json_({ ok: false, error: 'unknown action' });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'bad json' }); }
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    switch (body.action) {
      case 'checkin': return json_(checkin_(body));
      case 'rate': return json_(rate_(body));
      case 'committee_update': return json_(committeeUpdate_(body));
      case 'correction': return json_(correction_(body));
      case 'suggest_pandal': return json_(suggest_(body));
      case 'admin_bulk_upsert': return json_(bulkUpsert_(body));
      default: return json_({ ok: false, error: 'unknown action' });
    }
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
    CacheService.getScriptCache().remove('bootstrap');
  }
}

/* ------------------------------------------------------------------ reads */
function bootstrap_() {
  const pandals = rows_('Pandals').filter(p => p.id && String(p.status_2026).toLowerCase() !== 'hidden');
  return {
    ok: true,
    server_time: new Date().toISOString(),
    pandals: pandals,
    events: rows_('Events'),
    checkins: recent_('CheckIns', LIVE_WINDOW_HOURS).map(publicCheckin_),
    updates: recent_('Updates', UPDATES_WINDOW_HOURS),
    ratings: ratingAggregates_(),
  };
}

function pulse_(since) {
  const t = since ? new Date(since) : new Date(Date.now() - 3600e3);
  const after = r => new Date(r.ts) > t;
  return {
    ok: true,
    server_time: new Date().toISOString(),
    checkins: recent_('CheckIns', LIVE_WINDOW_HOURS).filter(after).map(publicCheckin_),
    updates: recent_('Updates', UPDATES_WINDOW_HOURS).filter(after),
  };
}

function publicCheckin_(c) {  // never expose device ids or exact reporter coordinates
  return { ts: c.ts, pandal_id: c.pandal_id, crowd: Number(c.crowd), wait_min: Number(c.wait_min) || 0,
           note: c.note, photo_url: c.photo_url, verified: String(c.verified) === 'TRUE' || c.verified === true };
}

function ratingAggregates_() {
  const agg = {};
  rows_('Ratings').forEach(r => {
    const k = r.pandal_id + '|' + r.year;
    const a = agg[k] || (agg[k] = { pandal_id: r.pandal_id, year: Number(r.year), n: 0,
      idol: 0, pandal: 0, bhog: 0, culture: 0, management: 0 });
    a.n++;
    ['idol','pandal','bhog','culture','management'].forEach(f => a[f] += Number(r[f]) || 0);
  });
  return Object.keys(agg).map(k => {
    const a = agg[k];
    ['idol','pandal','bhog','culture','management'].forEach(f => a[f] = Math.round(a[f] / a.n * 10) / 10);
    return a;
  });
}

/* ------------------------------------------------------------------ writes */
function checkin_(b) {
  const p = findPandal_(b.pandal_id);
  if (!p) return { ok: false, error: 'unknown pandal' };
  const device = clean_(b.device, 64);
  const crowd = clampInt_(b.crowd, 1, 5);
  if (!device || !crowd) return { ok: false, error: 'missing fields' };

  const now = new Date();
  const mine = rows_('CheckIns').filter(r => r.device === device);
  const today = mine.filter(r => sameDay_(new Date(r.ts), now));
  if (today.length >= DEVICE_DAILY_CAP) return { ok: false, error: 'daily limit reached' };
  if (mine.some(r => r.pandal_id === p.id && now - new Date(r.ts) < CHECKIN_COOLDOWN_MIN * 60e3))
    return { ok: false, error: 'you already reported this pandal recently' };

  let dist = '', verified = false;
  if (isFinite(b.lat) && isFinite(b.lng) && p.latitude !== '') {
    dist = Math.round(haversineM_(Number(b.lat), Number(b.lng), Number(p.latitude), Number(p.longitude)));
    verified = dist <= VERIFY_RADIUS_M;
  }
  const photoUrl = b.photo_b64 ? savePhoto_(b.photo_b64, p.id) : '';
  sheet_('CheckIns').appendRow([now.toISOString(), p.id, crowd, clampInt_(b.wait_min, 0, 240) || 0,
    clean_(b.note, 200), photoUrl, '', '', dist, verified, device]);   // reporter lat/lng deliberately not stored
  return { ok: true, verified: verified, dist_m: dist, photo_url: photoUrl };
}

function rate_(b) {
  const p = findPandal_(b.pandal_id);
  const device = clean_(b.device, 64);
  if (!p || !device) return { ok: false, error: 'missing fields' };
  const year = new Date().getFullYear();
  const s = b.scores || {};
  const row = [new Date().toISOString(), p.id, year,
    clampInt_(s.idol, 1, 5) || '', clampInt_(s.pandal, 1, 5) || '', clampInt_(s.bhog, 1, 5) || '',
    clampInt_(s.culture, 1, 5) || '', clampInt_(s.management, 1, 5) || '', device];
  const sh = sheet_('Ratings');
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][1] === p.id && Number(data[i][2]) === year && data[i][8] === device) {
      sh.getRange(i + 1, 1, 1, row.length).setValues([row]);
      return { ok: true, updated: true };
    }
  }
  sh.appendRow(row);
  return { ok: true };
}

function committeeUpdate_(b) {
  const p = findPandal_(b.pandal_id);
  if (!p) return { ok: false, error: 'unknown pandal' };
  const hash = sha256_(String(b.pin || ''));
  const ok = rows_('Committees').some(c => c.pandal_id === p.id && c.pin_sha256 === hash);
  if (!ok) return { ok: false, error: 'invalid committee PIN' };
  const kinds = ['bhog_open','bhog_closed','gates_closed','gates_open','queue','event_now','venue','notice'];
  const kind = kinds.indexOf(b.kind) >= 0 ? b.kind : 'notice';
  sheet_('Updates').appendRow([new Date().toISOString(), p.id, kind, clean_(b.message, 240), 'committee']);
  return { ok: true };
}

function correction_(b) {
  sheet_('Corrections').appendRow([new Date().toISOString(), clean_(b.pandal_id, 12), clean_(b.field, 40),
    clean_(b.value, 300), num_(b.lat), num_(b.lng), clean_(b.note, 300), clean_(b.device, 64), 'pending']);
  return { ok: true };
}

function suggest_(b) {
  if (!clean_(b.name, 120)) return { ok: false, error: 'name required' };
  sheet_('Submissions').appendRow([new Date().toISOString(), clean_(b.name, 120), clean_(b.area, 80),
    clean_(b.venue, 160), num_(b.lat), num_(b.lng), clean_(b.since_year, 12), clean_(b.notes, 400),
    clean_(b.contact, 80), clean_(b.device, 64), 'pending']);
  return { ok: true };
}

function bulkUpsert_(b) {
  const key = PropertiesService.getScriptProperties().getProperty('ADMIN_KEY');
  if (!key || b.admin_key !== key) return { ok: false, error: 'unauthorised' };
  const n = upsert_('Pandals', 'id', b.pandals || []);
  if (b.events) replaceAll_('Events', b.events);
  return { ok: true, pandals_upserted: n, events: (b.events || []).length };
}

/* ------------------------------------------------------------------ helpers */
function sheet_(name) { return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name); }

function rows_(name) {
  const sh = sheet_(name);
  if (!sh || sh.getLastRow() < 2) return [];
  const [head, ...data] = sh.getDataRange().getValues();
  const tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  // Sheets silently turns '2026-10-19' and '19:00' into Date cells - format them back in the Sheet's zone
  const fmt = (h, v) => !(v instanceof Date) ? v
    : h === 'date' ? Utilities.formatDate(v, tz, 'yyyy-MM-dd')
    : (h === 'start' || h === 'end') ? Utilities.formatDate(v, tz, 'HH:mm')
    : v.toISOString();
  return data.filter(r => r.some(v => v !== '' && v !== null)).map(r => {
    const o = {};
    head.forEach((h, i) => o[h] = fmt(h, r[i]));
    return o;
  });
}

function recent_(name, hours) {
  const cutoff = Date.now() - hours * 3600e3;
  return rows_(name).filter(r => new Date(r.ts).getTime() >= cutoff);
}

function upsert_(name, keyCol, items) {
  const sh = sheet_(name);
  const head = TABS[name];
  const data = sh.getDataRange().getValues();
  const idx = {};
  for (let i = 1; i < data.length; i++) idx[data[i][head.indexOf(keyCol)]] = i + 1;
  items.forEach(it => {
    const existingRow = idx[it[keyCol]];
    const prev = existingRow ? data[existingRow - 1] : null;
    // never blank out a value someone filled in the Sheet (e.g. photo_url) with an empty seed value
    const row = head.map((h, i) => (it[h] === '' || it[h] === undefined) && prev ? prev[i] : (it[h] === undefined ? '' : it[h]));
    if (existingRow) sh.getRange(existingRow, 1, 1, head.length).setValues([row]);
    else sh.appendRow(row);
  });
  return items.length;
}

function replaceAll_(name, items) {
  const sh = sheet_(name);
  const head = TABS[name];
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, head.length).clearContent();
  if (items.length) sh.getRange(2, 1, items.length, head.length).setValues(items.map(it => head.map(h => it[h] === undefined ? '' : it[h])));
}

function findPandal_(id) { return rows_('Pandals').find(p => p.id === id); }

function savePhoto_(b64, pandalId) {
  const folderId = PropertiesService.getScriptProperties().getProperty('PHOTO_FOLDER_ID');
  if (!folderId) return '';
  const m = String(b64).match(/^data:(image\/(jpeg|png|webp));base64,(.+)$/);
  if (!m) return '';
  const bytes = Utilities.base64Decode(m[3]);
  if (bytes.length > 1.5 * 1024 * 1024) return '';         // client resizes to ~1024px; reject anything huge
  const blob = Utilities.newBlob(bytes, m[1], pandalId + '_' + Date.now() + '.' + m[2]);
  const file = DriveApp.getFolderById(folderId).createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return 'https://drive.google.com/thumbnail?id=' + file.getId() + '&sz=w800';
}

function clean_(v, max) {
  let s = String(v === undefined || v === null ? '' : v).trim().slice(0, max);
  if (/^[=+\-@]/.test(s)) s = "'" + s;                      // block spreadsheet formula injection
  return s;
}
function num_(v) { const n = Number(v); return isFinite(n) && v !== '' && v !== null ? n : ''; }
function clampInt_(v, lo, hi) { const n = Math.round(Number(v)); return isFinite(n) && n >= lo && n <= hi ? n : null; }
function sameDay_(a, b) { return a.toDateString() === b.toDateString(); }
function haversineM_(la1, lo1, la2, lo2) {
  const R = 6371000, r = Math.PI / 180;
  const h = Math.pow(Math.sin((la2 - la1) * r / 2), 2) + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.pow(Math.sin((lo2 - lo1) * r / 2), 2);
  return 2 * R * Math.asin(Math.sqrt(h));
}
function sha256_(s) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s)
    .map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
}
function cached_(key, seconds, fn) {
  const cache = CacheService.getScriptCache();
  const hit = cache.get(key);
  if (hit) return JSON.parse(hit);
  const val = fn();
  const s = JSON.stringify(val);
  if (s.length < 95000) cache.put(key, s, seconds);
  return val;
}
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
