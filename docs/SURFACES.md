# EXPO — Canonical Surface Manifest

Generated from the routers (`src/App.jsx` AuthGate + AuthedApp `getRoute`/tab switch, and `expo-il/src/App.jsx` `parseHash`). This is the **single source of truth for "what pages exist."**

RULE: Any audit, sweep, regression check, or "review everything" task MUST enumerate from this file, not from memory. If you add/rename/remove a route, update this file in the same commit. When auditing, tick every row — a surface is "covered" only when it was actually loaded/inspected, not assumed.

Last verified against code: 2026-09-04 — `scripts/check-surfaces.mjs` found all 45 routes/tabs present. (That gate checks PRESENCE only: it cannot tell you a row's notes are still true, and a route deleted from code never fails it.) (Known gate blind spot: `check-surfaces.mjs` only sees literal `path ===`/`startsWith` checks and tabMap keys — dynamic sub-routes like the programs editor deep link must be added here by hand, and routes deleted from code never fail the gate.)

---

## EXPO-APP (expo-app.co.il) — pathname routing

### Public (no auth) — `src/App.jsx` AuthGate

| Path | Component | Notes |
|------|-----------|-------|
| `/` (browser) | `EntryChooser` | split-screen SIGN IN / FOR COACHES. PWA → `LoginScreen` |
| `/login` | `LoginScreen` | dual-role; fallback for any unmatched authed path |
| `/demo`, `/demo/` | `CoachLanding` (follows the reader) | SaaS marketing landing + waitlist. Renders in the language the visitor is already reading the app in (`readLang()`), which falls back to the browser language and then to English. `/coaches*` legacy -> redirects here |
| `/demo/he`, `/he/demo` | `CoachLanding` (he) | Hebrew landing (`/he/demo` redirects to `/demo/he`) |
| `/demo/en`, `/demo/en/` | `CoachLanding` (en) | English landing, forced. The counterpart of `/demo/he`, for sharing one language on purpose |
| `/demo/coach`, `/demo/coach/*` | `CoachDemo` | full coach-side tour, all mock data |
| `/demo/athlete`, `/demo/trainee` | `DemoTraineePortal` | real `ClientPortal` in `demoMode` + fixture data |
| `/demo/sandbox` | `TrySandbox` (pov=trainee) | legacy alias |
| `/demo/club` | `ClubDemoIndex` | EXPO TEAMS front door (#904): what the club zone does + the two public demo clubs; en/he toggle |
| `/demo/club/galil/overview`, `/demo/club/galil/<page>` | `ClubDemo` → the REAL `BhbcView` | fictional basketball club on a generated season (`src/clubs/demoSeed.js`); every write in memory, 0 database calls (`scripts/verify-club-demo.mjs galil`). Pages = the zone's: `overview`, `roster`, `schedule[/week\|/list]`, `practices`, `lifts`, `medical`, `games`, `activity`; pop-ups keep the zone's tails (`/player/<id>`, `/injury/<id>`, `/log-lift`, ..., `/portal/<id>` = the player's own athlete app on his generated program); a guided-tour stop is `?tour=<1-7>` |
| `/demo/club/sharon/overview`, `/demo/club/sharon/<page>` | `ClubDemo` → `BhbcView` (soccer) | fictional football club (`src/clubs/soccerSeed.js`); GAMES = `SoccerLeagueView` (W-D-L table, goals, assists, cards) |
| `/demo/club/netanya/overview`, `/demo/club/netanya/<page>` | `ClubDemo` → `BhbcView` | a PROSPECT's demo (Elitzur Netanya colours, generated crest and players) - shared by link only, `noindex`, never listed on `/demo/club` |
| `/try`, `/try/*` | `TrySandbox` | public engine sandbox (visitor uploads clip → pose/rep/compare) |
| `/coaches/try` | → `/demo/coach` | legacy redirect alias |
| `/coaches/demo/coach` | → `/demo/coach` | legacy redirect alias |
| `/coaches/demo` | → `/demo/athlete` | legacy redirect alias |
| `/coaches/demo/trainee` | → `/demo/athlete` | legacy redirect alias |
| `/intake/he`, `/intake/en` | `IntakeForm` | token-gated public intake (works in PWA too) |
| `/book/<slug>` | (forward) | ONE booking system since 22.10 (#892): forwards to the website's Google booking chooser (`expo-il.co.il`, `/he` in Hebrew); the old EXPO slot page no longer takes bookings |
| `/book/cancel/<id>` | `BookingPublic` | the client's own cancellation; the booking uuid is the capability, the work is a SECURITY DEFINER RPC that can only move a confirmed FUTURE booking to canceled |
| `/p/<token>` | `ProgramShare` | read-only shared program preview |
| `/sign/<token>` | `ContractSign` | public contract signing; anon UPDATE signature |

### Coach app (auth, `/coach/*`) — `AuthedApp` tab switch (17 tabs)

| URL | tab key | Component | Audited |
|-----|---------|-----------|---------|
| `/coach/dashboard` | dashboard | `DashboardView` | ✅ pass1 |
| `/coach/athletes` (`/coach/trainees` legacy) | trainees | `TraineesView` | ✅ pass1 |
| `/coach/athletes/<id>` | trainees | `TraineeDetail` | ✅ pass1 |
| `/coach/athletes/<id>/preview` | trainees | `CoachPreviewPortal` | ✅ pass2 |
| `/coach/programs` | plans | `PlansView` | ✅ pass2 |
| `/coach/programs/<id>` | plans | `PlansView` (editor deep link) | ✅ 2026-06-09 |
| `/coach/programs/<id>/preview` | plans | `CoachPreviewPortal` (plan) | ✅ pass2 |
| `/coach/exercises` | exercises | `ExercisesView` | ✅ pass2 |
| `/coach/exercise-matching` | exerciseMatching | `ExerciseMatchingView` | 🆕 2026-08-16 (Athletes▾→Matching; resolve unmatched plan exercise titles at scale) |
| `/coach/exercise-classify` | exerciseClassify | `ExerciseClassifyView` | 🆕 2026-08-16 (Athletes▾→Classify; batch taxonomy classify unclassified library at scale) |
| `/coach/exercise-cleanup` | exerciseCleanup | `ExerciseCleanupView` | 🆕 2026-08-21 (Exercises hub→Cleanup; review + bulk-delete trash library entries — set/rep numbers, superset markers, warmup notes) |
| `/coach/exercise-videos` | exerciseVideos | `VideoGapsView` | 🆕 2026-10-05 #559 (Exercises hub→Videos, owner-only; library exercises with no video ranked by the athletes who miss one, safe candidates, dry-run approve to library + absent program rows, undo, dead-link check via /api/video-health) |
| `/coach/review` | review | `WorkoutReview` | ✅ pass1 (Review▾→Workouts) |
| `/coach/review-tools` | reviewTools | `ReviewToolsView` | 🆕 2026-06-14 (Review▾→Tools; owner-only camera suite) |
| `/coach/workouts` | workouts | `WorkoutsView` | ✅ pass2 |
| `/coach/sessions` | sessions | `SessionsView` (mode=group) | 🆕 2026-06-12 (lab-trial: group grid; nav Sessions▾→Group) |
| `/coach/sessions-single` | sessionsSolo | `SessionsView` (mode=single) | 🆕 2026-06-12 (lab-trial: 1-on-1 logger + Movement tools) |
| `/coach/intake` | intake | `IntakeView` | ✅ pass1 |
| `/coach/waitlist` | waitlist | `WaitlistView` | ✅ pass1 |
| `/coach/chat-audit` | chatAudit | `ChatAuditView` | ✅ pass2 |
| `/coach/smart-import` | smartImport | `SmartImportView` | ✅ pass1 |
| `/coach/tasks` | tasks | `CoachTasksView` (TasksV8View) | ✅ pass1 |
| `/coach/bugs` | bugs | `BugsView` | ✅ pass2 |
| `/coach/challenges` | challenges | `ChallengesView` | ✅ pass2 |
| `/coach/calendar` | calendar | `BookingView` | ✅ pass2 |
| `/coach/billing` | billing | `BillingView` | ✅ pass1 |
| `/coach/bhbc` | bhbc | `BhbcView` (Bnei Herzliya S&C zone) | 🆕 2026-08-15 (Athletes▾→BHBC; staff-gated separate zone, no EXPO nav) |

The zone has its own tab strip, and since 27.9 every tab is a route
(`/coach/bhbc/<tab>` for the owner, `/bhbc/<tab>` for a club coach): **overview ·
roster · schedule · practices · lifts · medical · games · activity**.
PRACTICES split from SCHEDULE on 29.9 (#401): practices = week planner (LOG S&C
in its strip), practice attendance, past practices; schedule = next game, the
month/week/list calendar, microcycle. The zone's actions live in their own
card's strip (#396): MANAGE ROSTER on Roster, LOG LIFT on Lifts, LOG S&C on
Practices. A sweep of the zone loads every tab route.

Staff (Yuval) coach sees only `STAFF_TABS` — verify gating when touching nav/RLS.

### Athlete portal (auth, `/athlete/*`) — `ClientPortal`

| Surface | Notes | Audited |
|---------|-------|---------|
| `/athlete` PROGRAM | warm-ups → Start Check-In → set logging → FORM CHECK upload | ✅ pass1 (+E2E upload) |
| `/athlete` BW | bodyweight log | ✅ pass1 |
| `/athlete` MEAL LOG | `MealLogger` (page mode) | ✅ pass2 |
| `/athlete` HISTORY | past workouts | ✅ pass2 (null-guards fixed, commit 127783f) |
| `/athlete/progress` PROGRESS (was PRs; 16.10 #826) | `AthleteProgress` (+ `TraineePRsView` embedded) | new 16.10 |
| `/athlete/progress/jump-test` JUMP TEST (the filming how-to open; also `/demo/athlete/progress/jump-test`) | `JumpTest` in `AthleteProgress` - films one jump, poseLab.jumpMetrics, saves to `athlete_tests`; the coach sees it on the athlete page | new 23.10 #897 |
| `/athlete/program/trim` THE VIDEO TRIMMER (#970; also `/demo/athlete/program/trim`) | `VideoTrimSheet` from `ClientPortal` StepLogger - opens on every recorded or picked clip before it uploads: the clip looped inside the cut, a filmstrip with two handles, a playhead that scrubs; Back cancels; a reload lands on the page (the file cannot come back) |
| `/athlete` MESSAGES | `CoachMessages` (page mode) | ✅ pass2 |


### Every surface has its own URL (14.10, #770 - hard rule in CLAUDE.md)

One mechanism, `src/urlState.js` (`useUrlSync` / `useUrlFlag`): open = push, Back closes, a UI close steps back, a reload or a shared link reopens the same surface. URL words = the UI's own labels.

| Surface | URL |
|---------|-----|
| Athlete portal pages | `/athlete/program` · `/bodyweight` · `/meal-log` · `/history` · `/progress` (an old `/prs` link opens it) · `/messages` (same tails under `/demo/athlete/…`, `/coach/athletes/<id>/preview/…`, `/coach/programs/<id>/preview/…`) |
| Athlete page pop-ups | `/coach/athletes/<id>/edit` · `/contract` · `/add-payment` · `/edit-payment/<payment>` · `/assign-program` · `/remove-program/<program>` · `/archive` · `/delete` (sections stay `#vitals` … `#club`) |
| Athlete evaluation (16.10 #837) | `/coach/athletes/<id>/evaluation/new` · `/evaluation/<eval>` (the editor) · `/evaluation-summary/<eval>` (the summary - opens after a save; SUMMARY on every saved evaluation; the demo athlete card: `/demo/coach/trainees/<id>/evaluation-summary`) |
| BHBC pop-ups (any zone page) | `…/bhbc/<page>/player/<id>` (+ `/game/<date>`) · `/program/<id>` · `/log-lift[/<id>]` · `/log-s-and-c` · `/game-details` · `/minutes-played/<date>` · `/injury/<athlete>[/<injury>]` · `/manage-roster` (`/coach/bhbc/…` owner, `/bhbc/…` club coach) |
| Report a bug (any coach or athlete page) | `<page>/report-bug` - e.g. `/coach/dashboard/report-bug`, `/athlete/messages/report-bug`; opened from More options -> Report a bug (coach) or the Messages tab's 'Something not working? Report it' (athlete), never a loose header button (#893, 22.10) |
| Run laps from the watch (athlete run logger) | `<logger page>/from-watch` - the preview of laps read from the runner's watch screenshot(s), before FILL writes them into the run's sets (#898, 23.10) |
| Review | `/coach/review/<workout>` (the open review) |
| Review tools | `/coach/review-tools/movement-lab` · `/lift-metrics` · `/jump-test` · `/live-coach` · `/shot-analyzer` |
| Coach demo sub-pages | `/demo/coach/review-tools`, `/demo/coach/sessions-single` (were the same URL as Workouts / Group) |
| Canonical | `/demo/sandbox` → `/try`; an unknown `/coach/<x>` → `/coach/dashboard` |

| `/try` steps | `/try` (exercise; the demo portal's tabs as `/try/program` … `/try/messages`) · `/try/upload` · `/try/analyze` · `/try/compare` (14.10 phase 2; a reload of a clip step shows its empty state - the clip is the visitor's file) |
| BHBC MY PROGRAM | `/bhbc/my-program` (+ the portal tabs `/bhbc/my-program/history` …); the owner's preview `/coach/bhbc/my-program/preview/head-coach` (14.10 #769) |

| Training Analysis | `/coach/programs/analysis/<athlete>` (14.10 phase 2) |
| Program editor pop-ups | `/coach/programs/<id>/add-exercise` · `/compare` · `/history` (the MORE menu's words; 14.10 phase 2) |
| Exercise form | `/coach/exercises/new` · `/coach/exercises/<id>/edit` (14.10 phase 2) |
| New Athlete form | `/coach/athletes/new/online-athlete` · `/gym-single` · `/gym-couple` · `/bnei-herzliya` (the + menu's words; 14.10 phase 2) |
| Group session picker | `/coach/sessions/start-session` · `/coach/sessions/add-athletes` (14.10 phase 2) |
| Single-session logger | `/coach/sessions-single/logging/<athlete>` while logging (a live session is not in the URL: a reload / Forward lands on the picker) (14.10 phase 2) |
| Owed detail | `/coach/billing/owed/<athlete>` · `/coach/dashboard/owed/<athlete>` (a sheet-only client = a short hash, never a name) (14.10 phase 2) |
| BHBC schedule views | `…/bhbc/schedule` (Month) · `/schedule/week` · `/schedule/list` (14.10 phase 2) |
| Exercise matching pop-ups | `/coach/exercise-matching/change/<title>` · `/preview/<exercise>` (alone or on top of the picker) · `/apply` (14.10 phase 2) |
| Tasks board | `/coach/tasks` (list) · `/coach/tasks/board` (14.10 phase 2) · demo `/demo/coach/tasks` · `/demo/coach/tasks/board` (16.10 #842) · the board column in view on a tablet / phone: `/coach/tasks/board/<to-do / in-progress / waiting / stuck>` · demo `/demo/coach/tasks/board/<column>` (16.10 #855, swapped in place) |
| Tasks → נכסים (property engine, staff only) | `/coach/tasks/properties` · tabs `/coach/tasks/properties/<new\|shortlist\|call\|rejected\|history\|opportunities>` (16.10; no demo - Ohad + Yuval only) |
| Challenge form | `/coach/challenges/new` · `/coach/challenges/<id>/edit` (14.10 phase 2) |
| Intake pop-ups | `/coach/intake/<submission>` · `/coach/intake/generate-link` (14.10 phase 2) |

| Coach demo inner pages | `/demo/coach/review/<workout>` · `/demo/coach/programs/analysis/<athlete>` (as the real app's; 14.10 phase 2) |

Phase 2 done 14.10. Deliberately NOT in history: menus (MORE, the mobile drawer, filter pills), confirm dialogs, the marketing exit-intent pop-up (opens by itself), the demo's per-exercise note peek.

---

## EXPO-IL (expo-il.co.il) — hash routing — `expo-il/src/App.jsx` `parseHash`

Corrected 2026-07-19 against `parseHash`. The previous version of this table
claimed `#/` and empty render **home**; they have rendered the **chooser** since
the 2026-05-14 dual-arm split. Because audits enumerate from this file, that
error is what let a live nav bug survive two passes — every tab on the catalog
ran `location.hash = '#/'` and ejected the visitor to the chooser. Keep this
table honest to `parseHash` or the same class of bug hides again.

| Hash | view | Component | Audited |
|------|------|-----------|---------|
| `#/`, empty, **and any unknown hash** | chooser | `EntryChooser` (expo-il) | ✅ 2026-07-19 |
| `#/online`, `#/online/*` | home | programs catalog + sections | ✅ 2026-07-19 |
| `#programs`/`#why`/`#how`/`#contact`/`#faq`/`#discovery-call` (bare section anchors) | home | catalog scrolled to a section (`HOME_SECTIONS`) | ✅ 2026-07-19 |
| `#/gym`, `#/gym/*` | gym | `Gym` | ✅ pass1 |
| `#/programs/<id>` (detail) | detail | `ProgramDetail` | ✅ pass2 |
| `#/programs/<unknown-id>` | detail | `NotFound` (in-component guard) | ✅ 2026-07-19 |
| `#/privacy` | privacy | `Legal.Privacy` — what is collected, where it goes, browser storage | 🆕 2026-09-21 |
| `#/terms` | terms | `Legal.Terms` — not medical advice, cancellations, content ownership | 🆕 2026-09-21 |
| `…/quiz` · `…/demo/pose` · `…/demo/rep` · `…/demo/cmp` (a suffix on any page; the page under it is routed without it) | the quiz / a WHAT'S INSIDE demo over the current page | `useHashModal` | 🆕 2026-10-14 (#770 phase 2; the exit-intent pop-up opens by itself and the mobile menu is a menu, so neither pushes history) |
| `#/accessibility` | accessibility | `Legal.Accessibility` — IS 5568 / WCAG statement, what is and is not done | 🆕 2026-09-21 |

---

## Static / meta

| File | Concern |
|------|---------|
| `index.html` | `<title>`, favicons, **Open Graph tags** (og:image/title/description for link unfurls) |
| `vercel.json` | CSP (media-src/img-src/connect-src), headers |
| `public/manifest.webmanifest` | PWA name/icons/theme |

---

## Coverage ledger

Pass 1 (2026-06-05): dashboard, athletes/TraineeDetail, review, intake, waitlist, smart-import, tasks, billing, athlete PROGRAM+BW, full expo-il home/online/gym/chooser, all demo/coaches/try/sandbox surfaces.

Pass 2 (2026-06-05): coach `exercises, workouts, plans(+preview), chat-audit, bugs, challenges, calendar`, `CoachPreviewPortal`; athlete-portal `meal/history/PRs/messages`; public `book/p/sign/intake-form/login`; expo-il `program detail`. Fixed: 6 DB-string-deref white-screen/crash guards (commit a421d3c). Remaining defense-in-depth (LOW, not live bugs): MealLogger/CoachMessages lack their own demoMode prop (parent-gated); CoachMessages refined-ternary.

All 38 manifest surfaces now have ≥1 audit pass. Re-run from this ledger for future sweeps.
