# EXPO — Canonical Surface Manifest

Generated from the routers (`src/App.jsx` AuthGate + AuthedApp `getRoute`/tab switch, and `expo-il/src/App.jsx` `parseHash`). This is the **single source of truth for "what pages exist."**

RULE: Any audit, sweep, regression check, or "review everything" task MUST enumerate from this file, not from memory. If you add/rename/remove a route, update this file in the same commit. When auditing, tick every row — a surface is "covered" only when it was actually loaded/inspected, not assumed.

Last synced to code: 2026-06-09. (Known gate blind spot: `check-surfaces.mjs` only sees literal `path ===`/`startsWith` checks and tabMap keys — dynamic sub-routes like the programs editor deep link must be added here by hand, and routes deleted from code never fail the gate.)

---

## EXPO-APP (expo-app.co.il) — pathname routing

### Public (no auth) — `src/App.jsx` AuthGate

| Path | Component | Notes |
|------|-----------|-------|
| `/` (browser) | `EntryChooser` | split-screen SIGN IN / FOR COACHES. PWA → `LoginScreen` |
| `/login` | `LoginScreen` | dual-role; fallback for any unmatched authed path |
| `/demo`, `/demo/` | `CoachLanding` (en) | SaaS marketing landing + waitlist. `/coaches*` legacy → redirects here |
| `/demo/he`, `/he/demo` | `CoachLanding` (he) | Hebrew landing (`/he/demo` redirects to `/demo/he`) |
| `/demo/coach`, `/demo/coach/*` | `CoachDemo` | full coach-side tour, all mock data |
| `/demo/athlete`, `/demo/trainee` | `DemoTraineePortal` | real `ClientPortal` in `demoMode` + fixture data |
| `/demo/sandbox` | `TrySandbox` (pov=trainee) | legacy alias |
| `/try`, `/try/*` | `TrySandbox` | public engine sandbox (visitor uploads clip → pose/rep/compare) |
| `/coaches/try` | → `/demo/coach` | legacy redirect alias |
| `/coaches/demo/coach` | → `/demo/coach` | legacy redirect alias |
| `/coaches/demo` | → `/demo/athlete` | legacy redirect alias |
| `/coaches/demo/trainee` | → `/demo/athlete` | legacy redirect alias |
| `/intake/he`, `/intake/en` | `IntakeForm` | token-gated public intake (works in PWA too) |
| `/book/<slug>` | `BookingPublic` | public booking; anon insert via RLS |
| `/p/<token>` | `ProgramShare` | read-only shared program preview |
| `/sign/<token>` | `ContractSign` | public contract signing; anon UPDATE signature |

### Coach app (auth, `/coach/*`) — `AuthedApp` tab switch (16 tabs)

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

Staff (Yuval) coach sees only `STAFF_TABS` — verify gating when touching nav/RLS.

### Athlete portal (auth, `/athlete/*`) — `ClientPortal`

| Surface | Notes | Audited |
|---------|-------|---------|
| `/athlete` PROGRAM | warm-ups → Start Check-In → set logging → FORM CHECK upload | ✅ pass1 (+E2E upload) |
| `/athlete` BW | bodyweight log | ✅ pass1 |
| `/athlete` MEAL LOG | `MealLogger` (page mode) | ✅ pass2 |
| `/athlete` HISTORY | past workouts | ✅ pass2 (null-guards fixed, commit 127783f) |
| `/athlete` PRs | `TraineePRsView` | ✅ pass2 |
| `/athlete` MESSAGES | `CoachMessages` (page mode) | ✅ pass2 |

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
