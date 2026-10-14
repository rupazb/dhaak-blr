# Dhaak: what exists, where the moat is, and the plan

Research snapshot as of 14 Oct 2026. Puja runs 15–21 Oct, so launch is about 48 hours away.

## 1. What already exists

**Bangalore is still at the directory stage.** No Bangalore tool has live crowd data, ratings, user photos or route optimisation.

| Product | Coverage | What it does | Live crowd |
|---|---|---|---|
| pujo.newzchain.com | 50 Bangalore pujos (37 mapped) | OSM map, filters (near metro, bhog, pet-friendly), 4 fixed "trails", a verified/claimed badge, sells sponsorships | No |
| Bong Tales guide (guide.bongtales.in) | "50+" pujos | Pujos grouped by distance from Namma Metro, filters for bhog/pushpanjali, has a title sponsor and sells merch | No |
| Pujor Poth (pujorpoth.in) | 8 cities, 70 in Bengaluru | List and map, "most liked", organisers edit their own listings | No |
| Editorial lists and reels | 20–67 pujos | Static. Quality varies a lot: one viral 2026 reel lists Kolkata pujos as if they were in Bangalore | No |

**Kolkata is crowded, and live features are already standard there:**

- Puja Parikrama: crowd 1–10, only accepted within 500 m, expires after 30 min. Also has group live-location and route plans built from a time budget.
- PujoMap: tap to report crowd, reports fade after 90 min.
- Pandalgo, and Pujo Atlas (open source, GPL/MIT, Kolkata only).
- Kolkata Police guide map.
- Several GitHub projects with crowd-by-hour charts and TSP planners.

**Closest analogue outside Durga Puja:** puneganpati.in, a Ganesh mandal route optimiser with darshan-time estimates. It reached 4,100 users through WhatsApp with no marketing.

**What this means:** a live crowd map plus a route planner is *table stakes* in Kolkata. It is *new* in Bangalore, but anyone can copy it next year. The moat has to come from things that build up over time and things that are specific to Bangalore.

## 2. Where Bangalore differs from Kolkata

1. **Distances need a car.** Pujos are spread over 30+ neighbourhoods, 15–40 km apart. Kolkata apps assume you walk between pandals. In Bangalore the real costs are evening traffic, cab surge, auto haggling and full parking lots.
2. **Entry is uncertain.** Apartment and gated pujos close their gates to visitors when crowded, and some pujos are membership-based or on defence campuses. Nobody tracks this.
3. **Venues change every year.** BARSHA, BDPC, KARBA, BinB and WCA have all moved recently, so static lists go out of date within a year.
4. **No list is complete.** Sources claim 120–150 associations; the best listing has 70. Dhaak starts at 71.
5. **Misinformation already exists.** Viral reels mix in Kolkata pujos and list out-of-date venues.

## 3. Moat, ranked by how hard it is to copy

| # | Moat | Why it compounds | Built in v1? |
|---|---|---|---|
| 1 | **Verified committee network.** Committees claim their pujo and post status from a PIN-protected channel: bhog open, gates closed, queue, venue moved | The asset is relationships with 120+ associations. A competitor can copy the code but not the trust | Yes: Committees tab, PIN-hashed updates, ✓ badge |
| 2 | **Historical record across years.** Crowd by hour for each pujo, ratings per year, venue history, bhog timings | Every year adds data nobody else has; Kolkata apps let reports expire and keep nothing | Yes: Ratings tab keyed by year; CheckIns kept in full |
| 3 | **Routing for Bangalore.** Traffic by hour, parking, crowd at arrival time, scheduled moments, and gate rules | The algorithm can be copied. Curated parking, gate and venue data cannot | Yes (car/bike). Metro-first routing is next |
| 4 | **Committee and sponsor analytics.** Footfall and dwell time from check-ins and QR scans | Sponsorship packages cost lakhs (₹1.5–45 L in CR Park), and no one gives sponsors proof of footfall. Once committees use the reports, switching away is costly | No, needs a QR/poster pilot |
| 5 | **One UPI flow** for bhog coupons, membership and cultural-night passes | Today it's bank transfer plus screenshot, or separate Razorpay links per committee. A revenue share brings in money and creates lock-in | No, 2027 |
| 6 | **Open data and an open engine for every diaspora city.** CC-BY dataset plus forkable code for Pune, Hyderabad, NCR, Mumbai and abroad | Being the "default dataset" makes it the reference others cite. Pujo Atlas proves the open model but covers Kolkata only | Yes: MIT/CC-BY, and the Sheet schema is city-agnostic |
| 7 | **Live crowd layer** | Table stakes, not a moat by itself. Bangalore's lower user density means you need volunteers posting from gates to get it started | Yes |
| 8 | **WhatsApp-first distribution.** A bot ("next 3 pujos near me with bhog"), shareable plans, posters at help desks | Least defensible, but the biggest adoption lever (see puneganpati.in) | Partly: WhatsApp plan share |

**One-line positioning:** *"The Kolkata-style pujo app, built for Bangalore's distances and checked by the committees themselves."*

## 4. Differentiators in v1, compared with Google Maps

- **The route depends on the clock.** Leg times are scaled by the hour of departure, so it avoids crossing ORR at 7 pm when it doesn't have to.
- **It estimates the crowd at the moment you arrive,** not the crowd now. Big pujos get moved into their quieter hours (the sparkline in each pujo's detail shows the curve).
- **It catches must-catch moments.** Sandhi Puja, a singer's set or Anandamela are treated as time windows: it will wait up to 60 minutes for one, but won't detour more than about 45 minutes for it.
- **It avoids gate surprises.** Each stop shows a warning if the pujo is residents-first, restricted, or has an approximate pin.
- **Plan my evening:** "4 hours, start 6 pm, landmarks + bhog, open to all only" gives the best set of pujos in the best order.
- **Every check-in is verified or labelled:** it is marked verified within 400 m, fades over 90 minutes, and photos come from people who were there.
- **Trust in the data:** every pujo lists its sources, 2026 status, and how confident the pin is. Viral lists that don't check out are rejected.

## 5. The next 48 hours (2026 launch)

1. **Today:** deploy the Sheet and Apps Script and seed the data (README §3). Put it on GitHub Pages under a short domain.
2. **Fix the 17 landmark pins first.** Then do the 12 pujos with no pin, using `--geocode` plus WhatsApp groups.
3. **Committee outreach:** message 15–20 committees (start with Bengalee Association, Sarathi, BARSHA, Oikotan, RT Nagar, SCA, PBCA, EBCA, ECCA, SORRBA). Send each a PIN and a one-page "post your bhog/queue updates here".
4. **Volunteer seeding:** recruit 2–3 people at each top pujo to check in every 30–45 minutes on Saptami–Navami evenings. This fills the live map before regular users arrive.
5. **Distribution:** QR posters at help desks ("How crowded is it? Check Dhaak"), Bengali-in-Bangalore WhatsApp and Facebook groups, and the reel creators whose lists we used. Offer them a "verified by Dhaak" version of their list.
6. **During the puja:** watch the Corrections and Submissions tabs twice a day, and refit the crowd curve from real check-ins after Saptami.
7. **After Dashami:** publish a "Bengaluru Pujo 2026 report" (footfall curves, top-rated pujos by category). It doubles as PR and as the pitch to committees and sponsors for 2027.

## 6. 2027 roadmap

- Metro-first routing: Yellow line plus Pink line elevated section, showing walk/metro/auto legs and last-train times.
- A WhatsApp bot, and group "pujo crawls" with shared live progress.
- Committee dashboard with footfall reports for sponsors, plus QR check-ins at the gate.
- UPI bhog coupons and passes with a revenue share.
- City packs: Pune, Hyderabad, NCR, Mumbai, Chennai, and overseas (Bay Area, London, Singapore). Same Sheet schema, one fork per city.
- Other festivals on the same engine: Kali Puja, Jagaddhatri, Saraswati Puja, Ganesh Chaturthi and Dasara in Mysuru. The crowd and routing engine is the same; only the data changes.

## 7. Metrics to watch

- **Coverage:** pujos with a verified pin, and committees that have claimed their pujo.
- **Live density:** check-ins per hour at peak, and the share of them verified.
- **Usefulness:** plans created, plans shared on WhatsApp, and "Open in Google Maps" taps.
- **Retention signal:** ratings submitted, which is the seed of the historical record.
