# EXPO Build Session — April 9-10, 2026 (Conversations A + B)

## Project State (as of end of Convo B)
- **Path PC:** `C:\Users\Ohad\Desktop\expo-full`
- **Path Laptop:** `C:\Users\Administrator\Desktop\expo-full`
- **GitHub:** `https://github.com/OhadExpo/expo-full.git` (remote origin, master branch)
- **Latest commit:** `48d5698` ("new-expo-x-icon-pwa")
- **Live URLs:** `https://expo-app.co.il` (trainer dashboard), `https://expo-app.co.il/portal` (client login)
- **Alt URL:** `https://expo-full.vercel.app`
- **Supabase:** Project `gtcbfglttoiyfsnfbhdy` at `https://gtcbfglttoiyfsnfbhdy.supabase.co`
- **Supabase anon key:** `sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv`
- **Custom domain:** `expo-app.co.il` — DNS propagated (A record → 76.76.21.21), SSL issued
- **Domain registrar:** mynames.co.il (`dash.mynames.co.il/domains/eedxmtWAvmOFhv7P/dns`)

## Multi-Machine Workflow
- GitHub remote: `https://github.com/OhadExpo/expo-full.git`
- **Start working (any machine):** `cd expo-full && git pull`
- **Done working:** `git add -A && git commit -m "msg" && git push`
- **Deploy:** `npx vercel --prod --yes`
- PC user: `C:\Users\Ohad\Desktop\expo-full`
- Laptop user: `C:\Users\Administrator\Desktop\expo-full`

## Architecture

### Tech Stack
- **Frontend:** Vite + React (single-page app, ~86 modules, ~803KB bundle)
- **Hosting:** Vercel (auto-deploy via `npx vercel --prod --yes`)
- **Database:** Supabase (PostgreSQL) — 4 tables + 1 storage bucket
- **Domain:** `expo-app.co.il` (custom, via Vercel)
- **PWA:** manifest.json + icons for home screen install
- **Fonts:** JetBrains Mono (labels), DM Sans (body), Nord (via local CSS)
- **Theme:** Dark (#0a0a0b bg, #3BA0FF accent)

### Supabase Database Tables
Created via SQL Editor, all with RLS enabled + public read/write policies (MVP, no auth):

1. **`client_workouts`** — workout logs from client portal
   - id text PK, client_id, plan_name, day_name, week, date, autoregulation jsonb, notes, exercises jsonb, form_videos jsonb, created_at

2. **`bw_logs`** — body weight tracking
   - id serial PK, client_id, week, bw numeric, date

3. **`weekly_focus`** — trainer's per-exercise weekly notes
   - id serial PK, focus_key text unique, value text, updated_at

4. **`store`** — generic key-value for trainer dashboard data
   - key text PK, value jsonb, updated_at

5. **Storage bucket: `form-videos`** — public bucket for video uploads
   - Policies: public_upload (INSERT), public_read (SELECT)

### Data Flow
- **Trainer dashboard** (`expo-app.co.il`) reads/writes via `useSupaStore` hooks → Supabase `store` table
- **Client portal** (`expo-app.co.il/portal`) reads/writes via `useSupaStore` hooks → dedicated tables
- **All hooks** write to localStorage (instant) AND Supabase (async sync) — dual-write pattern
- **Video uploads** go to Supabase Storage `form-videos/{clientId}/{timestamp}-{filename}`

## File Structure (current)
```
src/
  App.jsx              — main app, tabs, import/export, portal routing, useSupaStore hooks
  ClientPortal.jsx     — CLIENTS array, StepLogger, email login, video upload to Supabase
  exerciseData.js      — shared EX dict (e1-e228, all clients) — SINGLE SOURCE OF TRUTH
  WorkoutReview.jsx    — imports from exerciseData.js, client name mappings
  supabase.js          — Supabase client (URL + anon key)
  useSupaStore.js      — 4 Supabase-backed hooks (useSupaStore, useSupaClientWorkouts, useSupaBwLog, useSupaWeeklyFocus)
  useStore.js          — old localStorage hook (still imported by useSupaStore as fallback pattern)
  theme.js             — colors, fonts, logos (base64), taxonomy constants
  ui.jsx               — shared UI components (Btn, Input, Select, Badge, Card, Modal, etc.)
  DashboardView.jsx    — trainer dashboard with client cards, revenue summary
  PlansView.jsx        — plan editor with weekly focus
  WorkoutsView.jsx     — in-person session logger
  TraineesView.jsx     — trainee list
  TraineeDetail.jsx    — individual trainee view with billing + payment fields
  ExercisesView.jsx    — exercise library
  main.jsx             — React entry point
public/
  manifest.json        — PWA manifest (name: EXPO Training, start_url: /portal)
  icon-192.png         — 192×192 X mark icon (white+blue chevron on black)
  icon-512.png         — 512×512 X mark icon
index.html             — main HTML with PWA meta tags, apple-touch-icon, theme-color
vercel.json            — rewrite /portal → /index.html
supabase-schema.sql    — database schema reference
package.json           — deps include @supabase/supabase-js, xlsx, vite, react
```

### Dead code / utility scripts in project root (cleanup pending):
- `_seed_supabase.py` — was used to seed 14 trainees to Supabase
- `_check_supabase.py` — was used to verify Supabase data
- `_extract_icons.py` — was used to extract base64 icons from theme.js
- `_make_icons.py` — was used to resize icons
- `_write_icons.py` — was used to write base64 icons to files
- `_update_icons.py` — was used to resize uploaded icon
- `parse_sheet.py` — old Excel parser from earlier sessions
- `diego.expo.json` — old seed data

## Clients in Client Portal (ClientPortal.jsx → CLIENTS array)

### Exercise ID Ranges (in exerciseData.js)
- e1-e14: Diego Day (Block #9)
- e29-e44: Ron Yonker (Block #13)
- e50-e72: Omer Sadeh (Block #7)
- e100-e120: Yuval Barko (Comeback Block)
- e200-e228: Shalev Lugashi (Block #7)

### Client Portal Login
| ID | Name | Email(s) for Login | Status |
|----|------|--------------------|--------|
| t1 | Diego Day | `""` (NOT SET) | Can't login |
| t2 | Ron Yonker | `""` (NOT SET) | Can't login |
| t3 | Omer Sadeh | `"omersadehbi@gmail.com"` | Working |
| t4 | Yuval Barko | `["shmuel034@gmail.com","yuvalberkovitch@gmail.com"]` | Working |
| t5 | Shalev Lugashi | `"shalev"` | Working |

## Trainees in Supabase (store table, key: expo-trainees)
14 trainees seeded from Google Sheet `18TdfofxAOd1d_EkOjbhYOBjWflqlfkAzY8sI52xJnOc` (רשימת מתאמנים):

**In-Person:**
| ID | Name | Format | Monthly | Per Session | Last Payment |
|----|------|--------|---------|-------------|--------------|
| tr_ayelet | איילת קזצב | Private | ₪800 | ₪200 | 2026-01-21 |
| tr_moshe_dana | משה ודנה טיני | Couple | ₪2,400 | ₪200 | 2026-01-18 |
| tr_miya_hilk | מיה וחילק יניב | Couple | ₪800 | ₪250 | 2026-02-06 |
| tr_neta_tom | נטע ותום רונן | Couple | ₪1,200 | ₪300 | 2026-04-01 |
| tr_limor_daniel | לימור ודניאל ספן | Couple | ₪1,200 | ₪300 | 2026-01-28 |
| tr_ilan | אילן כרמלי | Private | — | — | — |
| tr_yuval | יובל ברקו | Private | — | — | — |
| tr_shalev | שלב לוגשי | Private | — | — | — |

**Online:**
| ID | Name | Monthly | Last Payment |
|----|------|---------|--------------|
| tr_amit | עמית יהודאי | ₪500 | 2026-04-01 |
| tr_ron | רון יונקר | Block-based | 2026-03-16 |
| tr_diego | דיאגו דיי | ₪800 | 2026-02-12 |
| tr_tal | טל סיאונוב | ₪600 | 2026-04-06 |
| tr_roei | רועי הצבי (Inactive) | Block-based | 2025-09-30 |
| tr_omer | עומר שדה | — | — |

## Excel → Client Portal Pipeline (how to add new clients)

1. Get xlsx (download from Google Sheets or upload directly)
2. Parse with openpyxl: `cell.hyperlink.target` for video URLs, `cell.comment.text` for Hebrew coaching cues
3. Add exercises to `exerciseData.js` (inside the EX object, before closing `};`)
4. Add client entry to CLIENTS array in `ClientPortal.jsx` with email, plan structure, exercise refs
5. Add client name mapping in `WorkoutReview.jsx` byClient block
6. `git add -A && git commit -m "msg" && npx vercel --prod --yes && git push`

## Key Technical Patterns

### useSupaStore hooks (src/useSupaStore.js)
- `useSupaStore(key, initial)` — generic, reads/writes `store` table
- `useSupaClientWorkouts(initial)` — reads/writes `client_workouts` table
- `useSupaBwLog(initial)` — reads/writes `bw_logs` table
- `useSupaWeeklyFocus(initial)` — reads/writes `weekly_focus` table
- All hooks: localStorage for instant state, Supabase for async persistence
- Bug fix applied: `prev = dataRef.current` captured BEFORE updating `dataRef.current` in save callbacks
- Bug fix applied: `.maybeSingle()` instead of `.single()` for empty table reads

### Client Portal (src/ClientPortal.jsx)
- Email-gated login (client types email, matched against CLIENTS array)
- Direct URL: `/portal` (configured via vercel.json rewrite)
- StepLogger component: warmup steps → pre-workout autoregulation → exercise steps → finish
- Per-exercise: video embed, Hebrew coaching cues, weekly focus, set logging (reps/load/RPE), form video upload
- Video upload: goes to Supabase Storage `form-videos/{clientId}/{timestamp}-{filename}`
- BW tracking: persists across week toggles, shows green border when already logged, overwrites (not duplicates)
- Scroll to top on step change: `window.scrollTo(0,0)` in goNext/goPrev

### Trainer Dashboard
- TraineeDetail shows: Monthly Price, Per Session Price, Last Payment (from seeded data)
- Billing section with Add Payment button
- Archive/Restore/Permanent Delete workflow

## Git Commit History (chronological, this session)
- yuval-real-video-urls-from-spreadsheet
- yuval-hebrew-coaching-cues-from-cell-comments
- email-login-client-portal / fix-hooks-order-email-login
- merge-cues-notes-single-box-hide-empty
- reorder-video-above-weekly-focus-always-visible
- add-portal-direct-url
- multi-email-login-bw-graph-dates
- real-video-upload-form-check
- add-shalev-lugashi-block7
- add-omer-email-login
- supabase-backend-integration / fix-supabase-store-maybeSingle
- supabase-storage-video-upload / static-supabase-import-video-upload
- fix-useStore-stale-closure-bug
- fix-bw-persist-scroll-top-payment-display
- pwa-manifest-icons-homescreen
- new-expo-x-icon-pwa (latest: 48d5698)

## COMPLETED Items
- [x] Shared exercise data refactoring (exerciseData.js as single source of truth)
- [x] 5 clients in portal: Diego, Ron, Omer, Yuval, Shalev (with video URLs + Hebrew cues)
- [x] Email-gated client portal login
- [x] Direct /portal URL
- [x] Custom domain expo-app.co.il (DNS propagated, SSL issued)
- [x] Supabase backend (4 tables + storage bucket, all hooks wired)
- [x] 14 trainees seeded to Supabase from Google Sheet
- [x] Video upload to Supabase Storage (cloud persistence)
- [x] BW persistence across week toggles (green border, overwrite not duplicate)
- [x] Scroll to top on step change (goNext/goPrev)
- [x] Payment info visible in trainee detail (Monthly, Per Session, Last Payment)
- [x] Stale closure bug fixed in useStore and useSupaStore
- [x] PWA manifest + X mark icons for home screen (192×192, 512×512)
- [x] GitHub remote configured and pushed (multi-machine workflow working)
- [x] Laptop cloned and verified — same commit, same build hash

## PENDING Items (priority order)
1. **Dead code cleanup** — remove Python utility scripts from project root
2. **Diego & Ron need email addresses** for portal login
3. **7+ more clients need xlsx programs parsed** and added to portal
4. **Supabase auth** — currently public RLS policies (no auth). Add proper auth for production.
5. **Session auto-decrement** — planned but not implemented
6. **Workout history persistence** — Supabase stores workouts but Review tab display needs end-to-end verification
7. **Video upload to Google Drive** — user has 5TB, Supabase free tier only 1GB. Could add Drive upload as alternative.

## Key Decisions & Constraints
- **20KB artifact ceiling** no longer applies — we're in full Vite/React now, not the Claude artifact sandbox
- **Supabase free tier:** 1GB storage (form videos), 500MB database. ~50-200 form check videos before upgrade needed.
- **Supabase Pro ($25/month):** 100GB storage if needed
- **No auth yet:** All tables have public RLS policies. Any user with the anon key can read/write. Fine for MVP but needs fixing before wider rollout.
- **vercel.json rewrite:** `/portal` → `/index.html` (SPA routing for client portal)
- **Font loading:** Nord font via local CSS (`/nord-fonts.css`), DM Sans via Google Fonts CDN
