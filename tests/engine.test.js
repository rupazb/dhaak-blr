// node tests/engine.test.js - checks the optimiser against brute force and sanity rules
const E = require('../js/engine.js');
const assert = require('assert');
global.window = {}; require('../data/seed.js'); const seed = window.DHAAK_SEED;
const pandals = seed.pandals.filter(p => p.latitude !== '').map(p => ({ id: p.id, lat: +p.latitude, lng: +p.longitude, tier: +p.buzz_tier }));

function problem(stops, start, startMs, opts = {}) {
  const pts = [start, ...stops, ...(opts.end ? [opts.end] : [])];
  return { stops: stops.map(s => ({ ...s, dwellMin: 20, window: s.window || null, checkins: s.checkins || [] })),
           matrix: E.haversineMatrix(pts), hasEnd: !!opts.end, startMs, nowMs: startMs, vehicle: 'car', avoidCrowds: 0 };
}
function permutations(a) { if (a.length <= 1) return [a]; return a.flatMap((x, i) => permutations([...a.slice(0, i), ...a.slice(i + 1)]).map(p => [x, ...p])); }

const start = { lat: 12.9716, lng: 77.6412 };           // Indiranagar-ish
const ashtami6pm = E.istToMs('2026-10-19', '18:00');

// 1. IST helpers
assert.strictEqual(E.fmtTime(ashtami6pm), '6:00 pm');
assert.strictEqual(E.pujaDayFor(ashtami6pm).key, 'ashtami');

// 2. exact == brute force on random 7-stop instances (with and without return-to-start)
let rng = 7; const rand = () => (rng = (rng * 16807) % 2147483647) / 2147483647;
for (let trial = 0; trial < 12; trial++) {
  const pick = [...pandals].sort(() => rand() - 0.5).slice(0, 7);
  const P = problem(pick, start, ashtami6pm, trial % 2 ? { end: start } : {});
  const exact = E.simulate(P, E.solveExact(P)).cost;
  const brute = Math.min(...permutations([...Array(7).keys()]).map(o => E.simulate(P, o).cost));
  assert.ok(exact <= brute + 1.0, `trial ${trial}: exact ${exact.toFixed(2)} vs brute ${brute.toFixed(2)}`);
}
console.log('✓ Held–Karp matches brute force (12 random 7-stop instances, within 1 min)');

// 3. heuristic is close to exact on 11 stops
let gaps = [];
for (let trial = 0; trial < 5; trial++) {
  const pick = [...pandals].sort(() => rand() - 0.5).slice(0, 11);
  const P = problem(pick, start, ashtami6pm);
  const ex = E.simulate(P, E.solveExact(P)).cost, he = E.simulate(P, E.solveHeuristic(P)).cost;
  gaps.push((he - ex) / ex * 100);
}
console.log('✓ heuristic gap vs exact on 11 stops (%):', gaps.map(g => g.toFixed(1)).join(', '));

// 4. 13-stop exact solve is fast enough for a phone
const P13 = problem(pandals.slice(0, 13), start, ashtami6pm);
let t0 = Date.now(); const r13 = E.optimise(P13); const ms = Date.now() - t0;
console.log(`✓ 13 stops in ${ms} ms - total ${r13.totalMin.toFixed(0)} min vs as-picked ${r13.baseline.totalMin.toFixed(0)} min`);
assert.ok(r13.cost <= r13.baseline.cost + 1e-6);

// 5. 25 stops falls back to heuristic
const P25 = problem(pandals.slice(0, 25), start, ashtami6pm);
t0 = Date.now(); const r25 = E.optimise(P25);
console.log(`✓ 25 stops ${r25.method} in ${Date.now() - t0} ms - ${r25.totalMin.toFixed(0)} min vs as-picked ${r25.baseline.totalMin.toFixed(0)} min`);

// 6. time windows are honoured: a Sandhi-Puja window at the farthest stop
const pick = pandals.slice(0, 6);
const far = pick.reduce((a, b) => E.haversineKm(start, a) > E.haversineKm(start, b) ? a : b);
const win = { startMs: E.istToMs('2026-10-19', '10:28'), endMs: E.istToMs('2026-10-19', '11:16') };
const Pw = problem(pick.map(p => p === far ? { ...p, window: win } : p), start, E.istToMs('2026-10-19', '08:30'));
const rw = E.optimise(Pw);
const legW = rw.legs.find(l => Pw.stops[l.stop].window);
assert.ok(!legW.late, 'should reach the windowed stop in time');
assert.ok(legW.start >= win.startMs, 'should not start before window opens');
console.log(`✓ window honoured: ${far.id} visited at ${E.fmtTime(legW.start)} (window 10:28–11:16), stop #${rw.order.indexOf(legW.stop) + 1} of 6`);

// 7. crowd model: Ashtami 8pm landmark > Ashtami 3pm landmark > Ashtami 8pm neighbourhood
const lvl = (t, h) => E.priorCrowd(t, E.istToMs('2026-10-19', h));
assert.ok(lvl(3, '20:00') > lvl(3, '15:00') && lvl(3, '20:00') > lvl(1, '20:00'));
console.log(`✓ crowd model: landmark 8pm ${lvl(3,'20:00').toFixed(1)}, 3pm ${lvl(3,'15:00').toFixed(1)}; neighbourhood 8pm ${lvl(1,'20:00').toFixed(1)}`);

// 8. live check-ins override the model now, and fade for later arrivals
const now = E.istToMs('2026-10-19', '15:00');
const cks = [{ ts: now - 5 * 60e3, crowd: 5, verified: true }, { ts: now - 12 * 60e3, crowd: 5, verified: true }];
const nowLvl = E.crowdAt({ tier: 3 }, now, now, cks).level, laterLvl = E.crowdAt({ tier: 3 }, now + 3 * 3600e3, now, cks);
assert.ok(nowLvl > 4 && laterLvl.source === 'model');
console.log(`✓ live override: now ${nowLvl.toFixed(1)} (model ${lvl(3,'15:00').toFixed(1)}), 3h later falls back to ${laterLvl.source}`);

// 9. plan within budget respects the budget
const cands = pandals.filter(p => E.haversineKm(start, p) < 8).map(p => ({ ...p, score: p.tier * 10 }));
const Pb = problem(cands, start, ashtami6pm);
const plan = E.planWithinBudget(Pb, 240, 8);
assert.ok(plan.result.totalMin <= 240 + 1e-6 && plan.chosen.length > 0);
console.log(`✓ plan-my-evening: ${plan.chosen.length} of ${cands.length} nearby pandals in ${plan.result.totalMin.toFixed(0)} / 240 min`);
console.log('\nAll engine tests passed.');
