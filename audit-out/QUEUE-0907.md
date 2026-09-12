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
- [x] N7 demo parity: /demo/athlete follows the app language (was above the provider); ?lang=he|en honoured and kept; demo banner in Hebrew; demo pair on the host. DECISION for him: the Hebrew marketing CTA points at /try (a mock with no translator)
- [x] N8 intake form: instruction verbs in the masculine register (slash forms gone); status choices left
- [x] N9 a save that fails offline still toasts (loads stay quiet); Hebrew toast
- [x] N10 drill-downs in Hebrew: program editor 609→312, Edit Athlete form (both copies), athlete detail 195→127, booking settings 18→5, readiness everywhere; the pair shooter can open a card
- [x] N11 close: 15-step battery green (02:47), restamped + both verifiers green, final host chain done 03:15 (29 pairs mirrored, 3 tabs reloaded), last push

## D · 2026-09-11 (day)
- [x] D1 lifts 09-11: עמית גרשון 60, Nathan Knight 60 — 2/2 verified, restore point kept
- [x] D2 no FOCUS anywhere in the athlete portal (per-exercise line, logger label, sandbox mock) — built, portal shot clean
- [ ] D3 buttons: same size + rulings in Hebrew as in English, everywhere — probe audit-out/probe-button-parity.mjs: 414 diffs / 18 routes (heights +4–6px from font metrics; widths from shorter words)
- [ ] D4 athletes get the update notification on EVERY login — add rules (once per bundle, snooze, idle-only)
- [ ] D5 after D3/D4: rebuild, pairs, the three hosts, reload his tabs, show him
- [x] D3 buttons: 414 → 0 differences on the dashboard/programs; heights via font metrics, widths via tbFor()
- [x] D4 update notice rules (SwUpdateBanner)
- [x] D9 Hebrew audit everywhere before the deploy: 1,335 strings judged, 57 repaired by hand, gate green, judged again
- [x] D6 (19:45, cf884fb, restore dc80f2d; prod current, smoke clean, physio + athlete seats photographed) DEPLOY at ~18:05 (his order): everything except the athlete portal — branch deploy-0911 = bhbc-hebrew with ClientPortal/MealLogger at production, the athlete tree outside the provider, the login English; restore point origin/master dc80f2d
- [x] D7 (scripts/build-athlete-left.mjs → :4182) a local host page listing what is left to review on the UNDEPLOYED athlete portal (pairs + the §8 athlete rows), new tab in his Chrome
- [x] D8 (deployed; photographed en+he; Hebrew labels + bidi date on bhbc-hebrew) compare mode (review tools): "buttons are not centered and too boring and flat"; re-think whether the metrics buttons belong inside compare mode; "play both, pause, sync, etc.. redesign it smarter, nicer, ocd"

## E-block — 2026-09-12 evening (his screenshots on the live editor)
- [x] E1 editor toolbar: PORTAL / OVERVIEW / MORE / PORTAL toggle / DELETE / SAVE PROGRAM / athlete + block selects / UNDO / REDO — ONE vertical height (measured: 42 / 38 / 24 mix)
- [x] E2 CHANGE EXERCISE side panel: no horizontal scroll — everything fits the panel width (results rows overflow to the left)
- [x] E3 GRP select on day rows: the box is too small for its text — text cannot be seen
- [x] E4 the ⤴ share/copy button beside EXPAND ALL: glyph not centred vertically/horizontally in its box — full platform audit of single-glyph buttons (INK vs box), fix everywhere
- [x] E5 (it is the EXPO revenue sync; Task Scheduler denied → Startup daemon at 09:00/21:00) the BHBC dashboard must pull an update from his sheet (18TdfofxAOd… gid=1803423381) autonomously twice a day — find what exists (sync scripts, SA access, what the tab holds), build the scheduled sync, prove a run
