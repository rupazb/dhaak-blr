// node tests/backend.test.js - runs google_apps_script.gs against an in-memory mock of SpreadsheetApp & friends
const fs = require('fs'), crypto = require('crypto'), assert = require('assert');
const sheets = {};
function mkSheet(name) {
  const data = [];
  const sh = {
    getLastRow: () => data.length,
    appendRow: r => data.push(r.slice()),
    getDataRange: () => ({ getValues: () => data.map(r => r.slice()) }),
    getRange: (row, col, nr, nc) => { const rg = {
      setValues: v => { v.forEach((r, i) => { data[row - 1 + i] = data[row - 1 + i] || []; r.forEach((x, j) => data[row - 1 + i][col - 1 + j] = x); }); return rg; },
      setFontWeight: () => rg, clearContent: () => { for (let i = 0; i < nr; i++) data[row - 1 + i] = Array(nc).fill(''); return rg; },
    }; return rg; },
    setFrozenRows: () => {}, _data: data,
  };
  return sh;
}
const props = { ADMIN_KEY: 'secret' };
const ctx = {
  SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: n => sheets[n] || null, insertSheet: n => (sheets[n] = mkSheet(n)),
    setSpreadsheetTimeZone() {}, getSpreadsheetTimeZone: () => 'Asia/Kolkata' }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] }) },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  CacheService: { getScriptCache: () => ({ get: () => null, put() {}, remove() {} }) },
  ContentService: { createTextOutput: s => ({ s, setMimeType() { return this; } }), MimeType: { JSON: 'json' } },
  Utilities: { formatDate: (d, tz, f) => { const x = new Date(d.getTime() + 330 * 60e3).toISOString(); return f === 'yyyy-MM-dd' ? x.slice(0, 10) : x.slice(11, 16); }, DigestAlgorithm: { SHA_256: 1 }, computeDigest: (_, s) => [...crypto.createHash('sha256').update(s).digest()].map(b => b > 127 ? b - 256 : b) },
  DriveApp: {},
};
const code = fs.readFileSync('backend/google_apps_script.gs', 'utf8');
const api = new Function(...Object.keys(ctx), code + '\nreturn { setup, doGet, doPost, addCommittee };')(...Object.values(ctx));
const post = b => JSON.parse(api.doPost({ postData: { contents: JSON.stringify(b) } }).s);
const get = p => JSON.parse(api.doGet({ parameter: p }).s);

api.setup();
global.window = {}; require('../data/seed.js'); const seed = window.DHAAK_SEED;
assert.strictEqual(post({ action: 'admin_bulk_upsert', admin_key: 'nope', pandals: [] }).ok, false);
let r = post({ action: 'admin_bulk_upsert', admin_key: 'secret', pandals: seed.pandals, events: seed.events });
assert.ok(r.ok && r.pandals_upserted === 71, JSON.stringify(r));
// upsert twice must not duplicate, and must not blank a filled photo_url
sheets.Pandals._data[1][22] = 'https://example.org/p.jpg';
post({ action: 'admin_bulk_upsert', admin_key: 'secret', pandals: seed.pandals, events: seed.events });
assert.strictEqual(sheets.Pandals._data.length, 72); assert.strictEqual(sheets.Pandals._data[1][22], 'https://example.org/p.jpg');
console.log('✓ admin upsert: auth, idempotent, preserves Sheet edits');

const sarathi = seed.pandals.find(p => p.id === 'BLR007');
r = post({ action: 'checkin', pandal_id: 'BLR007', crowd: 4, wait_min: 20, note: '=HYPERLINK("x")', lat: sarathi.latitude + 0.001, lng: sarathi.longitude, device: 'dev1' });
assert.ok(r.ok && r.verified && r.dist_m < 400, JSON.stringify(r));
assert.strictEqual(post({ action: 'checkin', pandal_id: 'BLR007', crowd: 3, device: 'dev1' }).ok, false);   // cooldown
r = post({ action: 'checkin', pandal_id: 'BLR001', crowd: 2, device: 'dev1', lat: 13.2, lng: 77.7 });
assert.ok(r.ok && !r.verified);
const row = sheets.CheckIns._data[1];
assert.ok(String(row[4]).startsWith("'="), 'formula injection neutralised'); assert.strictEqual(row[6], ''); // reporter coords not stored
console.log('✓ check-ins: GPS verification, cooldown, formula-injection guard, no reporter coords stored');

assert.ok(post({ action: 'rate', pandal_id: 'BLR007', scores: { idol: 5, bhog: 4 }, device: 'dev1' }).ok);
assert.ok(post({ action: 'rate', pandal_id: 'BLR007', scores: { idol: 3, bhog: 4 }, device: 'dev1' }).updated);
assert.ok(post({ action: 'rate', pandal_id: 'BLR007', scores: { idol: 5 }, device: 'dev2' }).ok);
api.addCommittee('BLR007', '4821', 'test');
assert.strictEqual(post({ action: 'committee_update', pandal_id: 'BLR007', pin: '0000', kind: 'bhog_open', message: 'x' }).ok, false);
assert.ok(post({ action: 'committee_update', pandal_id: 'BLR007', pin: '4821', kind: 'bhog_open', message: 'Bhog open now' }).ok);
assert.ok(post({ action: 'suggest_pandal', name: 'Test Pujo', area: 'Hennur', device: 'dev3' }).ok);
assert.ok(post({ action: 'correction', pandal_id: 'BLR007', field: 'location', lat: 12.93, lng: 77.61, device: 'dev3' }).ok);

// simulate Sheets auto-converting an event's date/time cells into Date objects (IST midnight / 1899 time)
sheets.Events._data[5][1] = new Date('2026-10-18T18:30:00Z'); sheets.Events._data[5][2] = new Date('1899-12-30T13:30:00Z');
const b = get({ action: 'bootstrap' });
assert.strictEqual(b.events[4].date, '2026-10-19'); assert.strictEqual(b.events[4].start, '19:00');
assert.ok(b.ok && b.pandals.length === 71 && b.events.length === 22 && b.checkins.length === 2 && b.updates.length === 1);
assert.ok(!('device' in b.checkins[0]), 'device ids never leave the server');
const agg = b.ratings.find(x => x.pandal_id === 'BLR007');
assert.strictEqual(agg.n, 2); assert.strictEqual(agg.idol, 4);
const pulse = get({ action: 'pulse', since: new Date(Date.now() - 60e3).toISOString() });
assert.ok(pulse.ok && pulse.checkins.length === 2);
console.log('✓ Date-typed cells come back as IST yyyy-MM-dd / HH:mm');
console.log('✓ ratings (one per device/year, aggregated), committee PIN, suggestions, corrections, bootstrap & pulse');
console.log('\nAll backend tests passed.');
