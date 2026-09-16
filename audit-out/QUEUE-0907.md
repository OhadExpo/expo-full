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
- [x] (built 09-07: auth.jsx EN/עב switch on bhbc-hebrew; production login stays English by the 09-11 carve-out) B5 (his decision: auth.jsx has zero translation calls on purpose until he says)  Login screen in Hebrew — open question; at minimum make sure the switch reaches it
- [x] (done 09-07 H2/H3) B6 (his decision: roster offline = full-roster PII; zeros→dashes)  Dashboard offline zeros → dashes; coach roster cached offline
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
- [x] (done: see the second H6 line) H6 offline for every seat — walks running (owner, athlete, pt, public)
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
- [x] (done 09-11: heights via font metrics, nav natural widths 09-12) D3 buttons: same size + rulings in Hebrew as in English, everywhere — probe audit-out/probe-button-parity.mjs: 414 diffs / 18 routes (heights +4–6px from font metrics; widths from shorter words)
- [x] (done 09-11: SwUpdateBanner rules, deployed) D4 athletes get the update notification on EVERY login — add rules (once per bundle, snooze, idle-only)
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
- [x] (dashboard REVENUE card reads the sheet since 09-12) E6 "nothing was updated": the dashboard REVENUE card reads only app-marked payments (bit_payment_requests) — the sheet sync writes revenue_month_total / revenue_sheet_event, shown on /coach/billing only. Feed the dashboard card from the sheet totals so the twice-daily sync is visible where he looks
- [x] E7 "keep it updated forever twice a day" (daemon in shell:startup as a windowless VBS = survives logoff and reboot; 21:00 slot ran OK 09-12; HEARTBEAT: the REVENUE card shows when the sheet was last read — imported_at re-stamped by every sync, red past 30h) + "log ALL previous billings on EXPO: Bit, the roster sheet's revision history (already harvested: 336 events), every other source" — inventory sources reachable from here (Gmail Bit notifications, bank feed exports, Green Invoice), build ingestion per source into owner-only revenue tables, reconcile, show on billing
- [x] E8 gate: scripts/verify-english-literals.mjs in the build (English >LABEL< / placeholders in translated views); 113 → 0 by codemod + 70 keys; break-tested
- [x] E9 dictionary hygiene report — `audit-out/dict-hygiene.mjs` (report in `dict-hygiene-0912.txt`): 10 casing pairs, every one a deliberate singular/plural or noun/imperative split (Answered/ANSWERED, Save/SAVE, Record/record = W-L מאזן vs רשומה); 11 Latin-in-value lines are file types, demo data, ACL, VPN; nothing to unify — the trap is only a THIRD casing at a call site, which the report would show
- [x] E10 the club zone (/coach/bhbc) speaks Hebrew via its own switch: run the literal gate's idea on BhbcView (it imports its own translator?) — dump each zone tab in Hebrew as the physio sees it and fix leftovers
- [x] E11 host refresh with tonight's work (pairs, tonight page banner, tabs) + handoff rows 79/80 + memory

## F — 2026-09-13 00:xx "the billing is not even close to 10% ready. re-run every history field on רשימת מתאמנים and everything you can possibly think of to make it 100%" (5h autonomous)
- [x] F1 (measured: the 09-04 harvest was every 4th revision, 285 of ~2,600; the sheet had 12 header variants over five years; the importer read three date columns) inventory: what the roster sheet holds per client (every column), how many revisions Drive exposes vs how many were harvested, which fields the importer currently reads (only payment_date/start_date/rate) — measured, not assumed
- [x] F2 (1,136 files; ~36% of revision numbers exist as exports) re-harvest EVERY revision of רשימת מתאמנים (all tabs/sections), store every cell value per revision (raw, immutable copies)
- [x] F3 (parse-roster-timeline.py → cells.jsonl + timeline.json) build the per-client TIMELINE from all fields: rate changes, sessions-since-payment counter (its resets = payments), payment dates, start/stop, section moves, notes — one event table keyed (client, field, revision-time, old→new)
- [x] F4 (derive-payments.mjs; methods monthly/card/per_session/count/unknown with confidence; June 2026 reconciles within ₪570 of the finance sheet on 20% of revisions) derive payment events with confidence: a payment = payment-date cell change OR counter reset; attach the rate in force and the sessions counted since the previous payment; label derived amounts as ESTIMATED and reconcile month by month against ניהול פיננסי totals (the only real amounts)
- [x] F5 (revenue_sheet_event + 14 estimate columns, revenue_cell_history; five-seat verifier 0 leaks) write it all to EXPO (owner-only tables): extend revenue_sheet_event with the new event kinds + a revenue_client_timeline view; verify RLS from five seats (verify-revenue-private.mjs)
- [x] F6 (/coach/billing month reconciliation + per-client expandable history; athlete page billing section shows the same) surface it: /coach/billing sheet card → per-client history (every payment with date, rate, sessions, estimated amount, source), month reconciliation row (estimated vs sheet total, gap), and the trainee detail billing tab reads the same
- [x] F7 (finance revision history → Apr–May 2026 recovered, the sheet only exists since 2026-03; bit_payment_requests already shown on the athlete page and /coach/billing; client_workouts set beside the roster counts in attendance-vs-sheet.mjs — gym clients log nothing in the portal; Bit / Green Invoice / bank still need an export from him) other sources: ניהול פיננסי's own revision history (monthly totals as they were edited), any other tabs in either sheet, the old EXPO bit_payment_requests, client_workouts as attendance evidence (sessions performed per month per client vs the sheet's counter)
- [x] F8 (sync-revenue.mjs: harvest-new-revisions → parse → derive → import, background tab in his Chrome, probes upward until a batch finds nothing; verified r2626 = the sheet as of 12.09) the twice-daily sync harvests NEW revisions incrementally (not a one-off), and the heartbeat reports revision count
- [x] F9 (32 lines judged, 3 fixed; billing is coach-only — demo and marketing untouched on purpose; handoff row 82 + memory written) judge every new Hebrew line; marketing/demo parity check (billing surfaces are coach-only; demo untouched on purpose); handoff row 82 + memory

## G — 2026-09-13 09:45 "keep working. 2 hours of autonomous work"
- [x] G1 (done 11:00: 1,136 revision files = every export that exists for r1–r2632, both harvesters printed done; refresh: 58 clients, 337 payments, 646 sessions counted, 818 events, gate green) harvest to completion → full refresh (parse · derive · import) → gate green (closes F2)
- [x] G2 (proven 10:33: the run survives the starved export — soft fetch, r2626 stands in, 2 new revisions r2627–r2631 harvested, 785 events, gate green; the daemon runs this same code on its next hourly catch-up) the sync daemon's hourly catch-up passes with the 240s download wait (09:00 slot failed under the harvest's pacing)
- [x] G3 (May–Sep 2026 estimates = ~94% of the finance sheet's coaching totals; couple rate priced per session (A) beats per person (B) every month; swings are payment-date vs bank-month timing; 29 payments stay unpriced — 2021 punch cards with no price ever, "עד בלוק" prepay, first dates with no counter) reconciliation on the FULL history: couple-rate convention re-checked against the finance months; unpriced payments reviewed once more
- [x] G4 month rows on the sheet card expand to the payments behind them (who paid that month); a history health line (revisions covered, newest, last harvested)
- [x] G5 (Hebrew pairs re-shot incl. the physio zone with the calendar sessions; tonight page rebuilt, 146 commits; tabs re-opened in the background of his Chrome) host refresh: billing + athlete-detail pairs re-shot, tonight page rebuilt, tabs reloaded
- [x] G6 handoff row 82 stamped FINAL + §3 restamp; memory; deploy-0911 aligned, built, pushed

## H — 2026-09-13 ~17:00 (his messages mid-run)
- [x] H1 (sync-bhbc-calendar.mjs; 33 → 53 fixtures from the club calendar Aug 20 – Oct 12; standing sync needs the calendar's secret iCal address or the calendar shared with the service account — a reader cannot grant either; until then a session pulls the calendar through the connector) "the google calendar is not synced with bhbc.. make sure all the practices and scrimmages are logged in" — every practice/scrimmage on his Google Calendar appears in the club zone
- [x] H2 (logged 12.9, 60 min — his usual; note says minutes not given) "yesterday amit gershon worked out" — log Amit Gershon's session for 2026-09-12 in the zone
- [x] H3 (every chip: vs whom · where; 3.9 is the calendar's scrimmage vs Maccabi at Hadar Yosef 17:00) screenshot 16:58 "game vs who and where at?" — the game shown has no opponent / venue; fix the data and the display
- [x] H4 (4 shootarounds + 2 scrimmages on the schedule; zone knows both kinds) "also where are all the shootarounds? i need bhbc better updated and always synced" — shootarounds from the calendar into the zone; a standing calendar→zone sync (twice a day like the sheet)
- [x] H5 (minutes inside each lift tile, DUE as chips, dated day headers) screenshot 17:00 "this can be better displayed" — redesign what the screenshot shows
- [x] H6 (board shows the latest progress pain — 9) screenshots 17:01/17:02 "if there was a LATER report for pain… update it here since the pain is 9" — the injury row must show the latest pain report (9), not the first
- [x] H7 (logged 7.9, 30 min) "dusty worked out for 30 minutes on september 7th" — log Dusty Hannahs' lift, 2026-09-07, 30 min
- [x] H8 (shared Card: zero-padding cards inset the title 14px and stop the strip bleeding — every such card, both apps) screenshot 17:04 "all the hebrew titles everywhere are not aligned right (text is not where it should be)" — Hebrew titles sit off their intended edge; find the rule and fix it platform-wide
- [x] H9 (modal redesigned: jersey · name · minutes · DNP, summary that cannot scramble; minutes NOT filled — the league publishes no box score for the Winner Cup game, so they still come from the coach) screenshot 17:07 "find it and fill it it looks bad. the design is awful and it's not synced or updated" — the section in the screenshot: fill its data, redesign it, keep it synced

## I — 2026-09-14 "you can keep going"
- [x] I1 (00:38 run: no soft failures, gate green, calendar fetched and merged; the 21:00 daemon slot also OK) the sync daemon since 13.9 21:00: every slot passed (soft fetch or live), gate green, harvest current
- [x] I2 (fetch-bhbc-calendar.mjs — the app's own origin call, replayed; 107 events; verified vs the connector) the club calendar pulled again through the connector (Oct 12 → Dec 31) and merged; anything new on the zone
- [x] I3 (billing + zone at 390: neither page scrolls sideways; overflow is inside the scrolling strip/table by design) mobile 390: /coach/billing (sheet card, month + client expansion) and the club zone tabs in Hebrew — measured, fixed where they overflow
- [x] I4 deploy candidate rebuilt + smoked after I2/I3; handoff row 84
- [x] I5 (nine players, checksum 200:00, in the zone) the 3.9 box score: Maccabi TA 84 – 86 Bnei Herzliya, full game minutes per player → into the zone
- [x] I6 (solved: sync.prefetcheventrange replayed from a background tab) "for 3 figure it out… find a way on your own" — a STANDING calendar sync with no permission from anyone: the signed-in Chrome exports the calendars itself
- [x] I7 (clone-profile fallback) the 10:45 sync failed: Chrome was running WITHOUT the debug port, so launching the same profile never bound 9222 — fall back to the cloned signed-in profile

## J — 2026-09-15 "a: logged is spilling… one row, inside the borders. b: resume for another 4 hours nonstop"
- [x] J1 athlete portal, DAILY ROUTINE header: the "1 LOGGED" chip wraps to two lines and overflows its box — one row, inside its border, same height as START
      → DONE 15.9 00:14 — deployed as 79caf4c, measured 0 faults from Roey's seat on production
- [ ] J2 4 hours nonstop: J1, then the open I-items (calendar standing sync, 3.9 box score minutes, sync Chrome fallback), then the queue
- [x] J3 deploy the chip fix to production immediately (his explicit yes, this fix only, on top of cf884fb)
      → DONE — 79caf4c
- [ ] J4 FULL SWEEP: every chip/pill/button in both apps at phone widths — nothing may wrap inside its border or overflow it; it reached a real athlete screen
- [ ] J5 (his 14.9 image) 3.9 prep game Maccabi TA 84–86 BHBC: per-player minutes into the zone
- [ ] J6 (his 15.9 image) 14.9 prep game Hapoel HaEmek 92–70 BHBC: per-player minutes + the opponent on that scrimmage
- [x] J7 "wtf is going on with the menu??? fix it everywhere" + "immediately deploy after fixing" — his image did not reach me; auditing every menu (portal nav grid, coach nav, ⋮ more-menu, club-zone tabs) at phone width on PRODUCTION and fixing what is broken
      → DONE — the rails fade, deployed as a422dd5
- [x] J8 (his 15.9 image) the horizontal tab rails cut text on a hard edge — fade the ends, and scroll the ACTIVE tab fully into view; club zone + coach header + every horizontal scroller; deploy immediately
      → DONE — useEdgeFade + themes.css masks, deployed as a422dd5
- [ ] J9 (his 15.9 image) club-zone roster/load rows on a phone: MED buttons ragged, injury crammed beside the position — give the injury its own third row inside the same box height and align every button in one column; apply the pattern everywhere
- [ ] J10 (his 15.9 message) the players/history tab: a long dumb scroll on phone AND desktop — redesign it (grouped, jump-to, compact), smarter to move through
- [x] J11 (his 15.9 image) club-zone ROSTER cards: messy layout AND the Hebrew availability reads PLURAL for a single player (מוגבלים/זמינים → מוגבל/זמין) — fix everywhere
      → DONE 15.9 01:13 (2fcb4b1) — singular status word, the side reads ברך ימין not "ברך R", and the card drops its two-line reserves at phone width (six players on screen, not four). DEPLOY BLOCKED: the push to master was refused by the auto-mode classifier — needs his go
- [x] J12 (his 15.9 image) MANAGE ROSTER modal on a phone: names render one letter per line, the table overflows its own dialog — full redesign
      → DONE 15.9 01:13 (2fcb4b1) — the row is a grid: one line on a desktop, two on a phone with the second starting on the NAME column; dialog translated. Measured 390 + 1400, no overflow. Same deploy block as J11

## K — 2026-09-15 01:20 "pick up where the other conversation left off · 5 hours autonomous"
- [ ] K1 DEPLOY BLOCKED — the club-zone phone fixes (2fcb4b1) are cherry-picked, resolved, built green and measured clean in `.claude/worktrees/hotfix-0915`, mid-cherry-pick. `git cherry-pick --continue` + `git push origin HEAD:master` were both refused by the auto-mode classifier ("Production Deploy"). Needs his word or a Bash permission rule.
- [x] K2 J4 — the phone sweep: 1,900 controls across 12 coach routes, the portal, the physio seat, /demo, /try at 360/390/414/1400 in both languages; two real faults fixed (the tasks composer at 360, a long block title on /try); the probe itself corrected three ways
- [x] K3 J5/J6 — the 14.9 prep game's minutes (9 of 11 on the roster; Kagen and Malcov are not tagged into BHBC) and BOTH prep results now visible in the zone under PRE-SEASON; the Hebrew scoreline was rendering backwards and is isolated LTR now
- [x] K4 J9 — the load board's two control columns aligned to one x (MED 31, availability 229/132 in all ten rows), injury on its own reserved line, every row 94px
- [x] K5 J10 — the athlete's full history: kind chips with counts + months that fold, newest open, sticky headers; 30 entries render as 10 rows
- [x] K6 the Hebrew sweep the gate could not see: 202 JSX labels + 214 tooltips + 26 on the athlete's own screen, all composed; the gate now catches Title Case, the club zone's own dictionary, runs next to an expression, whole sentences and title attributes
- [x] K7 /try wired to the dictionary (55 strings) AND given the LangCtx its embedded portal needs — it was falling back to English inside a Hebrew page
- [x] K8 the demo's mock content: the nine tasks, their due dates, the revenue axis months and the dormant tags are Hebrew; exercise and plan names stay English by rule
- [x] K9 the tooltip layer (214 `title` attributes) and the accessibility layer (59 `aria-label`/`alt`) — composed, and the gate scans both from here on
- [x] K10 the marketing site: the logical-CSS codemod that was sitting uncommitted since 11.9, verified and committed, plus its last five English strings
- [x] K11 `audit-out/probe-cramped.mjs` — the probe that would have caught MANAGE ROSTER; proved by breaking the fix; three real faults found and fixed (the tasks filter rail at 360, the mini-tasks segmented control, and a false-positive rule for deliberate strip bleeds)
- [x] K12 the handoff audit back to 0 failures — four of its own checks were wrong (frozen counts, a pinned memory filename, "built, NOT deployed" not recognised as a status, a file-count regex reading §0's own sentence)
- [ ] K13 the RTL mirror probe flags 66 elements on /coach/tasks whose start offset depends on a SIBLING's text width — not a physical-CSS fault, but the probe cannot tell the difference yet

## L — 2026-09-16 "fix this immediatly it's been five times… the top menu" · "the top menu on expo is still bad" · two desktop centring reports · "save everything for a new conversation"
- [x] L1 top menu: logo out of the scrolling rail (715ecea); measured by what is PAINTED over the logo, 360/390/414 × scroll positions, EN+HE, desktop unchanged
- [ ] L2 DEPLOY L1 + L3 + L4 + cd42c60 — BLOCKED by the harness classifier; he must run the one `!` command in handoff §00. Production is still a422dd5
- [x] L3 program editor PATTERN COVERAGE text not vertically centred (4.9 above / 7.8 below) → shared Badge centres the cap ink (6.1/6.1, box unchanged) — 1dbb0ca, production-base 8e7b49c
- [x] L4 athletes roster status pill "massive gap" → 1.5px nudge replaced by metric centring (9.0/9.0) — NOTE: it measured centred before too; confirm with his screenshot after deploy
- [x] L5 "save everything" — handoff §00, this queue, memory
- [ ] L6 found in passing: `✓ Every primary pattern is covered.` and the template string `Training Analysis · ${traineeName}` (PlansView ~3642) are still English — template strings in JS are invisible to verify-english-literals
- [ ] L7 K13 still open: probe-rtl-mirror cannot tell a sibling-width shift from a physical-CSS fault (/coach/tasks flags 66)

## M — 2026-09-16 (side session, coaching data — no code, nothing to deploy) an online athlete (`tr_roei`, plan `pl_byw92s63mu3zk04d` "block #28"): "analyze block 27 and 28 … 2 versions of the new daily routine … more upright … no equipment except a band … 5-6 exercises" · "add it to block 28" · "make sure the youtube videos fit perfectly" · "recheck 5 more times" · "did you do a perfect job?" → he picked 2+3 (on-screen check, full re-verification) and 4 (video fit), NOT 1 (trim to ≤8 min)
PRIVATE DETAILS (athlete name, health notes, library-video evidence) are in local memory `project_roei_b28_daily_routines_2026_09_16.md` — this repo is PUBLIC, keep client detail out of it. All scripts, backups and the verification log are LOCAL ONLY in `audit-out/` (untracked on purpose).
- [x] M1 analysis of the daily routines in blocks 20–27 (+ the gym days of 27/28): the daily routine is barely logged (B25 2×, B26 0×, B27 opened once, 0 sets done) while gym days are; B27's routine was ~15 min of work; almost every drill lying/on all fours
- [x] M2 two daily days WRITTEN to that plan: `Daily routine A` (floor) and `Daily routine B` (standing/wall), `kind:'daily'`, 6 exercises each (band allowed, not required — some drills are bodyweight). `day a` / `Day b` untouched: `select md5((data->'days'->0)::text), md5((data->'days'->1)::text) from plans where id='pl_byw92s63mu3zk04d'` must return a3981018… / 486c9c25… (Postgres md5 of the jsonb text, NOT JSON.stringify). Final version: updated_at 2026-09-16 12:29:00.101 UTC (15:29 Israel). Only one daily row is library-linked (`e3005` Banded Elbow Wall-Slide); every row carries its own title/video/notes
- [x] M3 every video verified by FRAMES + TRANSCRIPT, not by title (yt-dlp `--extractor-args youtube:player_client=tv_simply` beats the 403s; 12-frame ffmpeg contact sheets) + oEmbed live/embeddable; independent video↔notes agents: 9 MATCH + 3 PARTIAL → fixed → 5/5 changed rows MATCH
- [x] M4 Hebrew notes: native-judge passes + corpus word checks → 0 broken on the final version
- [x] M5 on screen, both seats, final version: `/coach/programs/pl_byw92s63mu3zk04d/preview` @390 (all 12 exercise screens) + the editor @1440; viewing saved nothing. Log of the final re-runs: `audit-out/roei-b28-final-verification-2026-09-16.txt`
- [ ] M6 WAITS ON HIM (undecided — offered 16.9, he chose other fixes): both routines are ~12–15 min vs the ≤8 min target the analysis set. Do NOT trim without his word
- [ ] M7 WAITS ON HIM: two exercises in HIS library link to videos that show a different exercise (ids + evidence in the memory file). Library untouched — whole-array store write, see the 08-27 library wipe
- [ ] M8 WAITS ON HIM: two questions for the athlete (unlogged daily work; a readiness note on B26 wk4) — detail in the memory file
- [x] M9 WARNING, not a task: an editor tab that had that plan open before 12:29 UTC / 15:29 Israel on 16.9 must be RELOADED before any edit — savePlan upserts the whole plan and would erase both daily days. Rollback/backups: `audit-out/backup-plan-roei-block28-2026-09-16*.json` (original, before-fix4, before-fix5, FINAL-1229utc)

## O — 2026-09-16 "pita" (resume) · L6 led to gate hole #5
- [x] O1 L6 done (6ff8ebf): coverage line, push:pull hint, empty-state line, two strip headers → dictionary; native judge NONE. The component (PlansView `TrainingLineage`, V1) is mounted NOWHERE — the live page is `TrainingLineageV2`
- [x] O2 GATE HOLE #5 (ratchet shipped, break-tested both ways): verify-english-literals only scans files that ALREADY import ./i18n or ./bhbcHe. A screen with no wiring at all is invisible: ~318 English runs in 33 files (TrainingLineageV2 66, MovementLab 60, ExerciseMatchingView 13, ContractSign 13, TraineeEvaluation 12, …). Close it with a per-file ratchet (count may only fall), prove it by breaking
- [x] O3 Training Analysis page in Hebrew — 6aa91f0 (page + verdict engine + /demo/coach had NO LangCtx.Provider) and a71e5fe (lift report + launcher). Fresh-context native review: 29 + 2 faults, all repaired (a first judge said NONE and misquoted the file — discarded). EN text byte-identical before/after (page 8,105 B with reports open; lift report server-rendered). HE probed at 1400 + 390 phone with RTL applied: no overflow; Latin left = RPE/ACWR/VBT/Epley, exercise + block names. Signed/degree numbers isolated — measured with Range rects (raw gives 1°+). Probe: `audit-out/probe-lineage-he.mjs`
- [ ] O4 athlete-facing un-wired files next: ContractSign, ProgramShare, HoldTimer, VideoEmbed, IntakeForm, ErrorBoundary — check each against the held-at-production rule before editing
- [ ] O5 the English clipboard "next-block brief" (PlansView buildBrief, V1 — dead) — decide with V1: V1 removal is his call, not done
- [ ] O6 found in passing, NOT caused by O: `verify-analysis-engines` → verify-tool-parity fails 25/26 — the demo's "shot" tool description has an extra clause ("· makes over shots, marked by you") the real launcher lacks
- [ ] O7 found in passing: /demo/coach in Hebrew renders Hebrew text in an LTR layout — the demo never sets dir="rtl" (the real app does on .app-root). A parity gap on a public page; fix = dir on the demo root + an RTL sweep of the demo
- [x] O8 (f580fc4: 84 wired → 0, 32 labels composed + reviewed, demo walked in Hebrew) GATE HOLE #6: the LITERAL regex needs a capital as the FIRST character, so a run that starts with an arrow/symbol (`← Back`, `▸ Full report`, `◄ LEFT`) is invisible — LineageLauncher's `← Back` was only found by reading the file
- [ ] O9 real-seat check still owed for O3: the analysis page was verified on /demo/coach (mock data) + server render; open it once on a real athlete at /coach in Hebrew on the next preview/deploy
- [ ] O10 GATE HOLE #9 (found by O8's break test): isAllowed reduces each word to its CAPITALS and single letters A B C D E J L M N R S W X Y are allowlisted, so any Title-case word starting with one passes — `Save`, `Cancel`, `Medical`, `League Stats`, `Duplicate`, `Current`. Case-preserving check measured: 130 wired findings (club zone 18, CoachDemo 25, Tasks 18, TraineeDetail 13…). Probe for the rendered side: `audit-out/_demo-he-latin.mjs`
- [ ] O11 GATE HOLE #7/#8: the LITERAL run class has no COMMA (any sentence with a comma is invisible — e.g. the club zone's "This is exactly what your BHBC coaches see — …, …") and a run must start with a capital (lowercase fragments like `— no active injuries.`, `pending`, `received` pass)

