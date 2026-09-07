# QUEUE — 2026-09-07 (from docs/HANDOFF-2026-09-06.md §15 + §17, then leftovers)

Mandate: "make sure you finish every single task on the handoff. then search for
leftovers, undone things, half-done things, and finish everything." No deploy.

## A · The handoff queue (§15), in order

- [x] A1  Athlete-facing section on the :4181 host (#25) — pairs-he.json, suffixed ids, backslash paths
- [x] A1b The pt-zone "Hebrew" pair is NOT Hebrew (both frames English: the zone's own `bhbc-lang` switch) — make the shooter flip it and recapture
- [x] A2  Align the pairs: equal-height panes + mirrored scroll (#26)
- [ ] A3  Refresh all three hosts at the END (shoot pairs, build tonight/replan/recap, audit-handoff)
- [ ] A4  Before/after for EVERY recap entry (#22) — extend build-before-after across SURFACES.md
- [ ] A5  #41 standing constraint: pictures over words on every host — check when rebuilding

## E · New from him this session (2026-09-07)

- [x] E1  "the app and the desktop expo and bhbc and all platforms have been very laggy and slow lately, check and fix it everywhere" — measure first (bundle, network, render, realtime, SW), from real seats, prod AND branch; fix causes; prove with numbers before/after. Runs right after A1. He added: "maybe its just my wifi that's slow rn but check it out" → the measurement must SEPARATE network from app: bytes + request count per route (network-independent), JS/render time on localhost (no network), and what a slow link actually has to pull on first load vs repeat load.

- [x] E2  "yuvi's videos take a while to load fix it" — Yuval (staff seat): which videos (form-video review? exercise demo? his own uploads?), measure time-to-first-frame from HIS seat, find the cause (bucket, resolver, poster, codec, no range requests, SW), fix, re-measure.

## B · Leftovers named in §17 / §15.6 as open

- [x] B1  `src/MealLogger.jsx` still English (error strings, day labels, totals) — finish the translation
- [x] B2  One WARM-UP heading in the portal could not be traced — trace it, translate it
- [ ] B3 (still open — the demo-dates probe header stays honest)  `audit-out/probe-demo-dates.mjs` "not trustworthy" — make a demo-dates gate that is
- [x] B4 (recorded decision in CoachDemo.jsx: the demo omits tabs it has no content for)  `/demo/coach` shows 6 nav items against the real 9 — parity rule says fix
- [ ] B5 (his decision: auth.jsx has zero translation calls on purpose until he says)  Login screen in Hebrew — open question; at minimum make sure the switch reaches it
- [ ] B6 (his decision: roster offline = full-roster PII; zeros→dashes)  Dashboard offline zeros → dashes; coach roster cached offline
- [x] B7  Portal "משקל · 84.2KG" renders as "84.2 · משקלKG" in the Hebrew branch shot — bidi, check + fix

## C · Only he can answer (report, do not guess)

- deploy or not · contact minutes daily? · Q4 label · ACWR/readiness off the dashboard · 14 days or a month on the dashboard grid · the month grid on the dashboard (parked, "ask him") · EXPO athlete floor session visible inside the club zone (a333fe1) · what `›` means in Block #16

## D · Before stopping (§15.5b)

- [ ] gates for what was touched, after a rebuild · update §3/§15 of the handoff · memory file + MEMORY.md line (<24KB) · commit named paths · `git push origin bhbc-hebrew` · `git rev-list --count origin/bhbc-hebrew..HEAD` = 0
RESTORE POINT (pre-perf-fixes): b1f93ab6f04fa84e842c58049f278312374c8a43

- [x] E3  "make sure you're not interferring with the google pay chrome chats ... another claude is dealing with it" — all my probes moved to a PRIVATE Chrome (port 9223, own profile dir, headless); never kill/restart/resize the shared 9222 Chrome again this session. (Earlier this session I restarted 9222 once at start — it was DOWN at that moment, nothing was running in it.)
