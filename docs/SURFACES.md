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

### Coach app (auth, `/coach/*`) — `AuthedApp` tab switch (15 tabs)

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
| `/coach/review` | review | `WorkoutReview` | ✅ pass1 |
| `/coach/workouts` | workouts | `WorkoutsView` | ✅ pass2 |
| `/coach/intake` | intake | `IntakeView` | ✅ pass1 |
| `/coach/waitlist` | waitlist | `WaitlistView` | ✅ pass1 |
| `/coach/chat-audit` | chatAudit | `ChatAuditView` | ✅ pass2 |
| `/coach/smart-import` | smartImport | `SmartImportView` | ✅ pass1 |
| `/coach/tasks` | tasks | `CoachTasksView` (TasksV8View) | ✅ pass1 |
| `/coach/bugs` | bugs | `BugsView` | ✅ pass2 |
| `/coach/challenges` | challenges | `ChallengesView` | ✅ pass2 |
| `/coach/calendar` | calendar | `BookingView` | ✅ pass2 |
| `/coach/billing` | billing | `BillingView` | ✅ pass1 |

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

| Hash | view | Component | Audited |
|------|------|-----------|---------|
| `#/`, empty, `#programs`/`#why`/`#how`/`#contact`/`#faq`/`#discovery-call` | home | home tree (sections) | ✅ pass1 |
| `#/online`, `#/online/*` | home | catalog on home | ✅ pass1 |
| `#/gym`, `#/gym/*` | gym | `Gym` | ✅ pass1 |
| `#/programs/<id>` (detail) | detail | `ProgramDetail` | ✅ pass2 |
| chooser | chooser | `EntryChooser` (expo-il) | ✅ pass1 |

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
