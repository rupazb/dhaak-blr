/*
 * Dhaak engine - crowd model + time-dependent route optimiser.
 * Pure functions, no DOM, so it runs in the browser and in Node (tests).
 *
 * Why not just Google Maps' "optimise waypoints"?
 *   1. Travel time depends on WHEN you drive (Bengaluru 6–9 pm ≠ 2 pm), so legs use
 *      free-flow road time × an hour-of-day traffic multiplier.
 *   2. Time AT a pandal is not constant: queue time depends on how crowded that
 *      pandal is at your arrival time (live reports if fresh, otherwise a model by
 *      puja day × hour × popularity). The optimiser therefore prefers to hit the
 *      big pujos at off-peak moments.
 *   3. Must-catch moments (Sandhi Puja, bhog, a singer's set) are time windows:
 *      you wait if early, and lateness is heavily penalised.
 *   Exact (Held–Karp dynamic programming) up to EXACT_LIMIT stops; above that,
 *   nearest-neighbour + 2-opt + or-opt local search on the full simulation.
 */
(function (root) {
  'use strict';

  const MIN = 60e3, HOUR = 3600e3;
  const EXACT_LIMIT = 12;
  const EVENT_VALUE = 45;       // minutes of extra travel a must-catch moment is worth
  const EVENT_MAX_WAIT = 60;    // won't idle more than this for a moment to start
  const CLOSING = '23:30';      // most pandals wind down by ~11:30 pm

  // ---------------------------------------------------------------- calendar (IST)
  const PUJA_DAYS = [
    { date: '2026-10-15', key: 'panchami', en: 'Panchami', bn: 'পঞ্চমী', factor: 0.35 },
    { date: '2026-10-16', key: 'shashthi', en: 'Shashthi', bn: 'ষষ্ঠী', factor: 0.55 },
    { date: '2026-10-17', key: 'saptami-eve', en: 'Sat 17', bn: 'শনিবার', factor: 0.65 },
    { date: '2026-10-18', key: 'saptami', en: 'Saptami', bn: 'সপ্তমী', factor: 0.85 },
    { date: '2026-10-19', key: 'ashtami', en: 'Ashtami', bn: 'অষ্টমী', factor: 1.0 },
    { date: '2026-10-20', key: 'navami', en: 'Navami', bn: 'নবমী', factor: 0.95 },
    { date: '2026-10-21', key: 'dashami', en: 'Dashami', bn: 'দশমী', factor: 0.55 },
  ];

  // Bengaluru is UTC+5:30 with no DST; do all clock maths in IST regardless of the device's zone.
  const IST_OFFSET = 330 * MIN;
  function istParts(ms) {
    const d = new Date(ms + IST_OFFSET);
    return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), min: d.getUTCMinutes(),
             dateStr: d.toISOString().slice(0, 10), hourFloat: d.getUTCHours() + d.getUTCMinutes() / 60 };
  }
  function istToMs(dateStr, hhmm) {               // '2026-10-19', '18:30' -> epoch ms
    const [h, m] = (hhmm || '00:00').split(':').map(Number);
    return Date.parse(dateStr + 'T00:00:00Z') - IST_OFFSET + (h * 60 + m) * MIN;
  }
  function fmtTime(ms) {
    const p = istParts(ms); const h12 = ((p.h + 11) % 12) + 1;
    return h12 + ':' + String(p.min).padStart(2, '0') + (p.h < 12 ? ' am' : ' pm');
  }
  function pujaDayFor(ms) { const ds = istParts(ms).dateStr; return PUJA_DAYS.find(d => d.date === ds) || null; }

  // ---------------------------------------------------------------- traffic model
  // Multiplier on free-flow (OSRM) drive time, by IST hour. Tuned to typical Bengaluru
  // peaks; festival evenings stay heavy late. Deliberately simple and editable.
  const TRAFFIC_BY_HOUR = [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.1, 1.3, 1.6, 1.8, 1.6, 1.4,
                           1.4, 1.4, 1.4, 1.45, 1.55, 1.8, 2.0, 2.0, 1.85, 1.55, 1.3, 1.15];
  const VEHICLES = {
    car:  { label: 'Car / cab',   speed: 1.0,  trafficSensitivity: 1.0, parkMin: 8 },
    bike: { label: 'Two-wheeler', speed: 0.85, trafficSensitivity: 0.6, parkMin: 3 },
  };
  function trafficMultiplier(ms, vehicle) {
    const v = VEHICLES[vehicle] || VEHICLES.car;
    const p = istParts(ms);
    const a = TRAFFIC_BY_HOUR[p.h], b = TRAFFIC_BY_HOUR[(p.h + 1) % 24];
    const m = a + (b - a) * (p.min / 60);                      // smooth between hours (keeps FIFO-ish)
    return v.speed * (1 + (m - 1) * v.trafficSensitivity);
  }

  // ---------------------------------------------------------------- crowd model
  // Typical crowd 0..1 by IST hour on a puja day (morning anjali bump, evening peak).
  const HOUR_CURVE = [0.05, 0.03, 0.02, 0.02, 0.02, 0.05, 0.12, 0.22, 0.38, 0.52, 0.55, 0.45,
                      0.4, 0.35, 0.3, 0.3, 0.4, 0.55, 0.75, 0.95, 1.0, 0.9, 0.7, 0.4];
  const TIER_FACTOR = { 3: 1.0, 2: 0.7, 1: 0.45 };
  const WAIT_BY_LEVEL = [0, 0, 3, 10, 22, 40];                  // minutes of queue at a landmark pujo
  const WAIT_TIER_SCALE = { 3: 1.0, 2: 0.6, 1: 0.3 };
  const CROWD_LABELS = ['', 'Empty', 'Easy', 'Busy', 'Packed', 'Jam-packed'];

  function priorCrowd(tier, ms) {
    const day = pujaDayFor(ms);
    const dayF = day ? day.factor : 0.15;
    const p = istParts(ms);
    const a = HOUR_CURVE[p.h], b = HOUR_CURVE[(p.h + 1) % 24];
    let x = (a + (b - a) * p.min / 60) * dayF * (TIER_FACTOR[tier] || 0.45);
    if (day && day.key === 'ashtami' && p.hourFloat >= 7.5 && p.hourFloat <= 11.5) x = Math.max(x, 0.8 * (TIER_FACTOR[tier] || 0.45));
    if (day && day.key === 'dashami' && p.hourFloat >= 10 && p.hourFloat <= 15) x = Math.max(x, 0.7 * (TIER_FACTOR[tier] || 0.45));
    return Math.max(1, Math.min(5, 1 + 4 * x));                  // continuous level 1..5
  }

  /** Live signal from check-ins: exponentially-decayed weighted mean (half-life 30 min, window 90 min). */
  function liveCrowd(checkins, nowMs) {
    let w = 0, s = 0, waitS = 0, n = 0, last = 0;
    for (const c of checkins || []) {
      const t = typeof c.ts === 'number' ? c.ts : Date.parse(c.ts);
      const age = (nowMs - t) / MIN;
      if (age < -5 || age > 90) continue;
      const wi = Math.pow(0.5, Math.max(0, age) / 30) * (c.verified ? 1 : 0.4);
      w += wi; s += wi * Number(c.crowd); waitS += wi * (Number(c.wait_min) || 0); n++; last = Math.max(last, t);
    }
    if (w < 0.5) return null;
    return { level: s / w, wait: waitS / w, weight: w, reports: n, lastMs: last };
  }

  /** Best estimate of crowd level at time `atMs`, given what we know at `nowMs`. */
  function crowdAt(pandal, atMs, nowMs, checkins) {
    const prior = priorCrowd(pandal.tier, atMs);
    const live = liveCrowd(checkins, nowMs);
    if (!live) return { level: prior, source: 'model' };
    const horizon = (atMs - nowMs) / MIN;                       // live data fades out over the next 90 min
    const trust = Math.max(0, Math.min(1, live.weight / 2)) * Math.max(0, 1 - Math.max(0, horizon) / 90);
    if (trust <= 0.05) return { level: prior, source: 'model' };
    // the live reading tells us how this pandal compares to its model *now*; carry the ratio forward
    const ratio = live.level / priorCrowd(pandal.tier, nowMs);
    const projected = Math.max(1, Math.min(5, prior * (1 + (ratio - 1) * trust)));
    return { level: horizon <= 10 ? live.level * trust + prior * (1 - trust) : projected, source: 'live', reports: live.reports };
  }

  function expectedWaitMin(level, tier) {
    const lo = Math.floor(level), hi = Math.min(5, lo + 1), f = level - lo;
    const base = WAIT_BY_LEVEL[lo] + (WAIT_BY_LEVEL[hi] - WAIT_BY_LEVEL[lo]) * f;
    return base * (WAIT_TIER_SCALE[tier] || 0.3);
  }

  // ---------------------------------------------------------------- distances
  function haversineKm(a, b) {
    const R = 6371, r = Math.PI / 180;
    const h = Math.sin((b.lat - a.lat) * r / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin((b.lng - a.lng) * r / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  /** Fallback matrix when no routing service is reachable: road ≈ 1.35× straight line at 28 km/h free-flow. */
  function haversineMatrix(points) {
    const n = points.length, dur = [], dist = [];
    for (let i = 0; i < n; i++) {
      dur.push([]); dist.push([]);
      for (let j = 0; j < n; j++) {
        const km = i === j ? 0 : haversineKm(points[i], points[j]) * 1.35;
        dist[i].push(km * 1000); dur[i].push(km / 28 * 3600);
      }
    }
    return { durations: dur, distances: dist, source: 'estimate' };
  }

  // ---------------------------------------------------------------- simulation
  /**
   * problem = {
   *   stops: [{ id, tier, dwellMin, window:{startMs,endMs}|null, checkins:[] }],   // pandals (matrix idx 1..n)
   *   matrix: { durations, distances },   // seconds/metres, index 0 = start, 1..n = stops, n+1 = end (if hasEnd)
   *   hasEnd, startMs, nowMs, vehicle, avoidCrowds (0..1)
   * }
   */
  function legSeconds(P, i, j, departMs) {
    return P.matrix.durations[i][j] * trafficMultiplier(departMs, P.vehicle);
  }

  function visit(P, k, arriveMs) {                  // k = stop index (0-based)
    const s = P.stops[k];
    const park = (VEHICLES[P.vehicle] || VEHICLES.car).parkMin * MIN * (s.tier === 3 ? 1.5 : 1);
    let t = arriveMs + park, penalty = 0, waitedForEvent = 0, late = false, closed = false;
    if (s.window && P.catchEvents !== false) {
      // a scheduled moment is a *preference*: worth up to EVENT_VALUE minutes of detour, never more
      const latest = s.window.endMs - 10 * MIN;
      if (t < s.window.startMs && s.window.startMs - t <= EVENT_MAX_WAIT * MIN) { waitedForEvent = s.window.startMs - t; t = s.window.startMs; }
      else if (t > latest || t < s.window.startMs) { late = true; penalty += EVENT_VALUE; }
    }
    if (P.closeMs && t > P.closeMs) { closed = true; penalty += 300 + (t - P.closeMs) / MIN * 10; }
    const crowd = crowdAt(s, t, P.nowMs, s.checkins);
    const queue = expectedWaitMin(crowd.level, s.tier) * (1 + (P.avoidCrowds || 0));
    const finish = t + (s.dwellMin + queue) * MIN;
    return { start: t, finish, queueMin: queue, crowd, parkMin: park / MIN, waitedForEventMin: waitedForEvent / MIN, late, closed, penalty };
  }

  function simulate(P, order) {
    let t = P.startMs, prev = 0, penalty = 0, driveS = 0, distM = 0, queueMin = 0;
    const legs = [];
    for (const k of order) {
      const node = k + 1;
      const d = legSeconds(P, prev, node, t);
      driveS += d; distM += P.matrix.distances[prev][node];
      const arrive = t + d * 1000;
      const v = visit(P, k, arrive);
      penalty += v.penalty; queueMin += v.queueMin;
      legs.push({ stop: k, driveMin: d / 60, distKm: P.matrix.distances[prev][node] / 1000, arriveMs: arrive, ...v });
      t = v.finish; prev = node;
    }
    let endLeg = null;
    if (P.hasEnd) {
      const endIdx = P.stops.length + 1;
      const d = legSeconds(P, prev, endIdx, t);
      driveS += d; distM += P.matrix.distances[prev][endIdx];
      endLeg = { driveMin: d / 60, distKm: P.matrix.distances[prev][endIdx] / 1000, arriveMs: t + d * 1000 };
      t += d * 1000;
    }
    return { order, legs, endLeg, endMs: t, totalMin: (t - P.startMs) / MIN, driveMin: driveS / 60, distKm: distM / 1000,
             queueMin, penalty, cost: (t - P.startMs) / MIN + penalty };
  }

  // ---------------------------------------------------------------- exact solver (Held–Karp over time)
  function solveExact(P) {
    const n = P.stops.length;
    const FULL = 1 << n;
    const cost = new Float64Array(FULL * n).fill(Infinity);
    const time = new Float64Array(FULL * n);
    const pen = new Float64Array(FULL * n);
    const parent = new Int16Array(FULL * n).fill(-1);
    for (let k = 0; k < n; k++) {
      const d = legSeconds(P, 0, k + 1, P.startMs);
      const v = visit(P, k, P.startMs + d * 1000);
      const idx = (1 << k) * n + k;
      time[idx] = v.finish; pen[idx] = v.penalty; cost[idx] = (v.finish - P.startMs) / MIN + v.penalty;
    }
    for (let mask = 1; mask < FULL; mask++) {
      for (let j = 0; j < n; j++) {
        const idx = mask * n + j;
        if (!(mask & (1 << j)) || cost[idx] === Infinity) continue;
        for (let k = 0; k < n; k++) {
          if (mask & (1 << k)) continue;
          const d = legSeconds(P, j + 1, k + 1, time[idx]);
          const v = visit(P, k, time[idx] + d * 1000);
          const nm = mask | (1 << k), nIdx = nm * n + k;
          const c = (v.finish - P.startMs) / MIN + pen[idx] + v.penalty;
          if (c < cost[nIdx]) { cost[nIdx] = c; time[nIdx] = v.finish; pen[nIdx] = pen[idx] + v.penalty; parent[nIdx] = j; }
        }
      }
    }
    const full = FULL - 1;
    let best = -1, bestC = Infinity;
    for (let j = 0; j < n; j++) {
      const idx = full * n + j;
      let c = cost[idx];
      if (P.hasEnd) c += legSeconds(P, j + 1, n + 1, time[idx]) / 60;
      if (c < bestC) { bestC = c; best = j; }
    }
    const order = []; let mask = full, j = best;
    while (j >= 0) { order.push(j); const pj = parent[mask * n + j]; mask &= ~(1 << j); j = pj; }
    return order.reverse();
  }

  // ---------------------------------------------------------------- heuristic solver
  function solveHeuristic(P) {
    const n = P.stops.length;
    // nearest neighbour on simulated time
    let order = [], left = new Set([...Array(n).keys()]);
    while (left.size) {
      let bestK = -1, bestC = Infinity;
      for (const k of left) { const c = simulate(P, order.concat(k)).cost; if (c < bestC) { bestC = c; bestK = k; } }
      order.push(bestK); left.delete(bestK);
    }
    let best = simulate(P, order), improved = true, guard = 0;
    while (improved && guard++ < 60) {
      improved = false;
      for (let i = 0; i < n - 1 && !improved; i++) {            // 2-opt
        for (let j = i + 1; j < n && !improved; j++) {
          const cand = order.slice(0, i).concat(order.slice(i, j + 1).reverse(), order.slice(j + 1));
          const s = simulate(P, cand);
          if (s.cost < best.cost - 0.01) { order = cand; best = s; improved = true; }
        }
      }
      for (let i = 0; i < n && !improved; i++) {                // or-opt (move one stop)
        for (let j = 0; j < n && !improved; j++) {
          if (i === j) continue;
          const cand = order.slice(); const [x] = cand.splice(i, 1); cand.splice(j, 0, x);
          const s = simulate(P, cand);
          if (s.cost < best.cost - 0.01) { order = cand; best = s; improved = true; }
        }
      }
    }
    return order;
  }

  function optimise(P) {
    const n = P.stops.length;
    if (n === 0) return simulate(P, []);
    const order = n <= EXACT_LIMIT ? solveExact(P) : solveHeuristic(P);
    const result = simulate(P, order);
    result.method = n <= EXACT_LIMIT ? 'exact' : 'heuristic';
    result.baseline = simulate(P, [...Array(n).keys()]);        // "as you picked them"
    return result;
  }

  // ---------------------------------------------------------------- "plan my evening" (orienteering)
  /**
   * Choose which pandals to visit inside a time budget, then order them optimally.
   * candidates carry a `score` (buzz, interests, live energy, events in window).
   * Greedy insertion by score / added-minutes, then exact re-ordering.
   */
  function planWithinBudget(P, budgetMin, maxStops) {
    const n = P.stops.length;
    let chosen = [];
    const used = new Set();
    let current = simulate(P, chosen);
    while (chosen.length < (maxStops || 12)) {
      let best = null;
      for (let k = 0; k < n; k++) {
        if (used.has(k)) continue;
        for (let pos = 0; pos <= chosen.length; pos++) {
          const cand = chosen.slice(); cand.splice(pos, 0, k);
          const s = simulate(P, cand);
          if (s.totalMin > budgetMin || s.penalty > 0) continue;
          const added = Math.max(1, s.totalMin - current.totalMin);
          const ratio = (P.stops[k].score || 1) / added;
          if (!best || ratio > best.ratio) best = { k, cand, s, ratio };
        }
      }
      if (!best) break;
      chosen = best.cand; used.add(best.k); current = best.s;
    }
    if (!chosen.length) return { chosen: [], result: simulate(P, []) };
    const sub = subProblem(P, chosen);
    const r = optimise(sub);
    return { chosen, result: r, sub };
  }

  /** Restrict a problem to a subset of stops (re-indexing the matrix). */
  function subProblem(P, keep) {
    const map = [0, ...keep.map(k => k + 1)];
    if (P.hasEnd) map.push(P.stops.length + 1);
    const pick = M => map.map(i => map.map(j => M[i][j]));
    return { ...P, stops: keep.map(k => P.stops[k]), matrix: { durations: pick(P.matrix.durations), distances: pick(P.matrix.distances) } };
  }

  const api = { CLOSING, EVENT_VALUE, PUJA_DAYS, VEHICLES, CROWD_LABELS, EXACT_LIMIT, istParts, istToMs, fmtTime, pujaDayFor, trafficMultiplier,
                priorCrowd, liveCrowd, crowdAt, expectedWaitMin, haversineKm, haversineMatrix, simulate, solveExact,
                solveHeuristic, optimise, planWithinBudget, subProblem };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.DhaakEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
