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

## H · The extra hour (Ohad: "do everything except deploying yet")

- [x] H1 login screen in Hebrew + EN/עב switch (auth.jsx)
- [x] H2 dashboard offline zeros → dashes
- [x] H3 coach roster cached offline (staff seats only)
- [x] H4 athlete library read: by design (portal resolves plan rows from the library by id) — not tightened
- [ ] H6 offline for every seat — walks running (owner, athlete, pt, public)
- [ ] H5 close: gates, pairs (login he), commit, push, handoff, memory
- [x] H6 offline for every seat — backend-unreachable walks (owner 23, athlete, pt, public 6) AND real-SW on HTTPS (owner 23/23, athlete, pt)
- [x] S1 Shot Analyzer makes/shots counter (marked, never inferred)
- [x] S2 Shot Analyzer: everything in Hebrew (title, overlay, fps, session-panel names)
- [x] S3 Shot Analyzer: phase chips two full rows
- [x] S4 Shot Analyzer: one ▸ per frame

## T · The three hours + the hour after (Ohad: "work for another 3 full hours" · "update the local host chrome" · "no way you stopped working after 12 minutes")

- [x] T1 Hebrew coverage sweep, 22 coach routes measured; dashboard 177→39 · tasks 244→12 · billing 143→18 · review 44→15 · cleanup 209→68 · calendar 43→10 · sessions 43→30 · smart-import 39→11 · intake 17→8 · bugs 10→0
- [x] T2 auto-task bodies in Hebrew at render (src/autoTaskHe.js), stored rows untouched
- [x] T3 Shot Analyzer: units + what the tiles measure, numbers on one baseline (0px spread)
- [x] T4 review-tools page in Hebrew
- [x] T5 host refresh on the final build: 16 pairs mirrored + 6 small coach routes; :4179/:4180/:4181 opened in the debug Chrome (9222) beside his own Chrome
- [x] T6 close: pairs on the host, commits pushed (a6792af … dc299d7); restamp + verifiers move to N6
- [ ] A4 before/after for every recap entry — still partial (six more coach routes tonight; the rest is a session of its own)

## N · The night block (Ohad 23:50 "reset the timer to 3 hours" · 00:22 "reset the timer again … finish like how i asked with the last 30 minutes")

- [x] N1 today's four lifts (Zack 30, עמית מנחם 30, עמית גרשון 60, Knight 60) — 4/4 verified, weight-room tab shows 4 lifted · 180 min
- [x] N2 unknown ≠ zero when the server is unreachable (dataIncomplete, not navigator.onLine); revenue tiles dash; one offline notice, not three toasts; athletes empty state says "could not reach the server"
- [x] N3 four reproducible before/after pairs (tasks-autobody, dashboard-dashes, roster-offline, bw-bidi) — recap carries 13; builder: language after sign-in, install prompt snoozed, Hebrew coach check
- [x] N4 tasks page last labels (placeholders, Auto-Alerts, Done; hotkeys re-anchored to data-hotkey); BW tab ENTRIES/HISTORY
- [x] N5 console sweep 35 routes: only /_vercel/insights/script.js 404 (preview-only)
- [ ] N6 light/dark parity on the touched routes · handoff verifiers · final host refresh (the last 30 minutes, 03:22–03:52)
