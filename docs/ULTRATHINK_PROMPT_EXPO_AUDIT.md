# Ultrathink Audit Prompt — EXPO Cross-Platform Perfection Mission

> Paste this verbatim into a Claude ultrathink / extended-thinking session.
> The output it generates is itself a prompt that Ohad will paste back to
> Claude Code (Opus 4.7) the next morning to execute through tomorrow's
> session.

---

# YOU ARE — Senior systems architect + ruthless platform auditor

You're a hybrid: principal-level full-stack engineer, security reviewer,
performance specialist, UX critic, biomechanics-informed product
analyst, and pragmatic founder-coach. Your job is to audit the entire
EXPO platform — every surface, every line, every flow, every integration
— and produce ONE master document that IS itself a structured prompt for
Claude Code (Opus 4.7) to execute tomorrow.

Do not write code. Do not propose new features unless they fix a
defect or close a gap. Your deliverable is the prompt, not the work.

---

# CONTEXT

EXPO is a fitness-coaching platform built by Ohad — a solo strength &
conditioning coach in Israel — to replace his Google Sheets-based
client-management workflow. It is the operating system for his entire
business and the daily tool for his ~20 trainees.

**Stack:** Vite + React 18 SPA · Supabase (Postgres + Auth + Storage +
RLS) · Vercel hosting · GitHub auto-deploy on push to master · PWA via
vite-plugin-pwa · Anthropic API for chat + smart-import · Hebrew
(primary) + English (secondary) with RTL/LTR theme support.

**Surfaces in scope (audit ALL):**

1. **expo-app.co.il/coach/\*** — Dashboard, Athletes, Programs,
   Exercises, Tasks, Review, Intake, Waitlist, Portal, Chat Audit,
   Smart Import, Preview Portal.
2. **expo-app.co.il/athlete** — Program, Bodyweight, Records, History
   tabs; form-video upload with client-side compression; offline blob
   queue.
3. **expo-app.co.il/demo/coach** and **/demo/trainee** — public read-
   only demos with fixture data.
4. **expo-app.co.il/try** — public engine sandbox (TrySandbox).
5. **expo-app.co.il/intake/\<he|en\>?t=\<token\>** — public token-gated
   intake form (3 form_types: initial / progress / assessment).
6. **expo-app.co.il/coaches** — SaaS storefront landing page.
7. **expo-app.co.il/** — EntryChooser routing to sign-in vs. /coaches.
8. **expo-il.co.il** — separate marketing site (different repo, but
   visually linked).
9. **Supabase schema** — ~20 tables, RLS policies, RPCs, triggers,
   storage buckets (form-videos, coach-demos).
10. **Anthropic API integration** — /api/chat endpoint, /api/smart-
    import endpoint.
11. **PWA / service worker** — manifest, install prompt, idle-only
    auto-update, blob caching strategy.
12. **Deployment pipeline** — Vercel project, build env vars, CI hooks,
    bundle splitting.
13. **Memory system** — ~80 files in `.claude/projects/.../memory/`
    that encode Ohad's preferences + project state.

Code lives at `C:\Users\Administrator\Desktop\expo-full`
(github.com/OhadExpo/expo-full). Read CLAUDE.md and memory/MEMORY.md
before opening any source file — they encode binding constraints
(e.g., never use "cure/diagnose/fix" terminology, never propose
weight-progression automation, RLS gotchas, Israeli VAT is 18% / 0.8475
multiplier, brand vocabulary cyan #3BA0FF on dark #0a0a0b).

---

# THE BAR — what "perfect" means

For every surface and every dimension, the system must satisfy these
non-negotiable invariants. Score each finding against this list:

**Correctness**
- Zero broken UI paths (every button click resolves to a sensible state)
- Zero accessibility violations on the WCAG 2.1 AA tier
- Zero RTL-flipped layouts when content is Hebrew
- Zero unhandled promise rejections in the typical user flow
- Zero data-loss paths (every trainee input survives blur, navigation,
  tab close, network loss)
- Zero race conditions in writes (autosave, blob queue, sync)

**Security & data integrity**
- Every Supabase table has RLS enabled with correct `TO authenticated`
  or `TO anon, authenticated` scoping (per
  `reference_supabase_rls_anon_gotchas`)
- Zero references to `auth.users` from anon-readable policies
- Zero secrets in client-bundled code (`grep`-able anon keys are OK;
  service-role keys are not)
- Zero CSP gaps for `<video>` / `<img>` / `connect-src`
- Zero SQL/PostgREST injection vectors (validate IDs before
  interpolation, per `reference_safe_trainee_id_helper`)
- Every cross-trainee surface respects multi-tenant isolation
  (per `project_multi_tenant_audit` — 7 BLOCKER list)
- Storage uploads use the correct path scoping (clientId-prefixed)

**Performance**
- Initial-route bundle ≤ 200 KB gzipped
- Every heavy view lazy-loaded
- No N+1 Supabase queries in render paths
- Image / video lazy load below the fold
- Service worker caches static assets; never caches API responses

**UX**
- Every form input auto-saves on blur / unmount / pagehide / tab hide
- Every save failure surfaces a visible error toast (no silent fails)
- Every loading state shown explicitly (never an empty page)
- Mobile viewport renders cleanly down to 360 px (iPhone SE)
- Both themes (dark default, light "refined") render every screen
  identically in semantic content but consistently in their respective
  brand vocabularies
- Hebrew text always has `dir="rtl"` set on its container; mixed
  HE/EN strings use `<bdi>` correctly
- Every nav label and every button label is consistent across the app
  (e.g., no "PREVIEW" + "VIEW IN PORTAL" + "Preview Portal" all
  meaning the same thing)

**Business-domain correctness**
- VAT calculations use 0.8475 multiplier (NOT 1/1.17)
- Pain ratings ≥6 trigger a STOP rather than a MODIFY
- Programming language never uses "cure" / "diagnose" / "fix" in
  client-facing UI strings or code comments
- Exercise taxonomy values match the canonical lists in CLAUDE.md
- Couple trainees (tr_xxx, __0, __1) are programmed per-member;
  surfaces don't accidentally mirror data between members

**Code hygiene**
- Zero dead files (no React component file unreferenced by any import)
- Zero unused exports
- Zero `console.log` left over from debugging (`console.warn` /
  `console.error` for actual error paths is fine)
- Zero TODO/FIXME without an associated open task
- Zero half-implemented features (state declared but not used; UI
  shown but its handler is a stub)
- Zero commented-out blocks > 5 lines
- All migrations idempotent (`IF NOT EXISTS` / `DROP POLICY IF EXISTS`)

**Operational**
- Every Postgres table has a sensible index for the actual query
  patterns it serves
- Every Supabase RLS-policy SELECT pulls only the column subset the
  consumer needs (no `select *` against tables with PII payload columns)
- Every external integration (Anthropic, Vercel, Supabase) is reachable
  from a smoke-test script in `scripts/`
- Every memory file in `.claude/.../memory/` is still accurate (no
  stale references to deleted files / removed tables)

---

# METHODOLOGY — how to investigate

Work through these passes in order. For each, record findings as you go.

**PASS 1 — File-system reconnaissance**
Walk `src/`, `scripts/`, `scripts/migrations/`, `docs/`, `public/`,
`api/` (if exists). Inventory every file. Cross-reference each
component file against the import graph. Flag every file with zero
inbound imports (candidate dead code).

**PASS 2 — Route walk**
For each route in `App.jsx`'s router, trace the render tree depth-first.
Note every state hook, every Supabase call, every guard. Flag:
- Missing loading states
- Missing error boundaries
- Race-prone state updates
- Hook-rules violations (early returns above hooks)
- Memory leaks (subscriptions / timers without cleanup)

**PASS 3 — Schema audit**
Connect (via the existing scripts pattern) and inspect:
- Every table's column list, indices, RLS policies, triggers
- Every column referenced by JS code — does it exist?
- Every column in the DB — does any code use it? If not, candidate to
  drop or surface
- Every JOIN-equivalent that's done client-side — should it be a view?
- Every RLS policy — does it reference auth.users (anti-pattern)?

**PASS 4 — Bilingual & RTL pass**
Walk every screen. Identify:
- Any string that should be translated but isn't
- Any layout that breaks on Hebrew content
- Any icon or affordance that points right when it should point left
  in RTL (per `feedback_rtl_forward_cta_arrows`)
- Any font fallback issue (Heebo for HE, JetBrains Mono for FN labels,
  DM Sans for FB body)

**PASS 5 — Mobile + PWA pass**
At viewport widths 320 / 360 / 414 / 768 px, walk every screen.
Identify horizontal scrollbars, clipped tap targets, text overflow,
illegible font sizes (< 14 px body). Check PWA:
- Install prompt timing
- Service worker update flow (idle-only? per
  `feedback_pwa_sw_auto_update_idle_only`)
- Offline behavior (does the trainee portal work offline?)
- Push notification capabilities (currently zero?)

**PASS 6 — Performance pass**
- Bundle composition: which chunks are heaviest, which are loaded
  eagerly that shouldn't be
- Supabase query patterns: count round-trips per render
- Image sizes vs. their rendered dimensions
- Video upload pipeline (compression bitrate / output codec / fallback)

**PASS 7 — Security pass**
- Every RLS policy reviewed against the 7 BLOCKER list in
  `project_multi_tenant_audit`
- Every storage bucket reviewed for path-traversal risk
- Every API key inspected for exposure
- CSP header (`vercel.json`) reviewed for completeness

**PASS 8 — Business-logic pass**
- Pain rules enforced on UI inputs and in any auto-task generation
- VAT calculations correct in every payment surface
- Couple-aware data scoping correct in every couple-relevant surface
- Exercise taxonomy matches the canonical lists
- Auto-task rules (in `src/autoTasks.js`) — each rule's detect() and
  resolve() reviewed against its intent; thrash protection adequate

**PASS 9 — Memory + docs pass**
- Every file in `memory/` opened and checked for accuracy
- Stale references (deleted files, removed tables, renamed APIs)
  flagged for update or deletion
- `MEMORY.md` index entries reviewed for currency

**PASS 10 — Integration pass**
- Anthropic API endpoints work; rate-limit handling sane; prompt cache
  used where applicable
- Smart-import flow walked end-to-end with a real xlsx
- Vercel deploy pipeline reviewed for env-var coverage
- GitHub Actions / Vercel auto-deploy verified

**PASS 11 — Accessibility deep dive**
- Tab order on every interactive form: logical, no traps
- Every button has an accessible name (visible text or `aria-label`)
- Color contrast meets 4.5:1 for body text and 3:1 for large text in
  both dark and refined themes — specifically check the cyan-on-white
  combinations in refined mode
- Every form input has a programmatic `<label>` association or
  `aria-label`
- Modal focus management: focus traps inside open modals; Escape
  closes; focus returns to the trigger element on close
- Screen-reader walk of the trainee card's Athletic Evaluation +
  NEXT ACTIONS sections (the densest grids)

**PASS 12 — Actionability check**
Every finding produced in passes 1–11 must have:
- An exact file path
- A specific line range (or function name) — never "somewhere in foo.jsx"
- A reproducible "how to see it" instruction (URL, click sequence, or
  data setup)
- A concrete fix that Claude Code can execute without further questions

If a finding lacks any of these, demote it to "OPEN QUESTION" and put
it in section 14 of the output instead of the BLOCKER/MEDIUM lists.

---

# OUTPUT SPEC — what to produce

A single markdown document, named `EXPO_PERFECTION_AUDIT_2026-05-13.md`,
~80 to 200 pages of dense Markdown. The document IS a prompt back to
Claude Code (Opus 4.7) — written in the second person, directly
addressing the implementing model.

The structure:

```
# EXPO Perfection Audit — Implementation Brief

## How to use this document
- Section ordering = recommended execution order (top = highest impact
  per minute of work).
- Each finding is a self-contained executable task: it includes file
  paths, exact diffs or step-by-step instructions, validation criteria,
  and acceptance test.
- Stop and ask Ohad before touching ANY of the items flagged
  `REQUIRES_CONFIRMATION`.

## 0. Pre-flight (read these first)
- CLAUDE.md (constraints)
- memory/MEMORY.md (binding preferences)
- The specific memory files referenced inline below.

## 1. BLOCKERS (must fix before any new work)
Numbered list, each with:
- TITLE
- File:line refs
- Symptom (what the user sees)
- Root cause (the why)
- Fix (concrete steps OR a diff)
- Validation (how to confirm it's fixed)
- Risk (what can break)

## 2. SECURITY GAPS
(same structure)

## 3. DATA-INTEGRITY GAPS
(same structure)

## 4. PERFORMANCE WINS
(same structure, ranked by impact / effort ratio)

## 5. UX GAPS
(same structure)

## 6. BILINGUAL / RTL ISSUES
(same structure)

## 7. MOBILE / PWA ISSUES
(same structure)

## 8. BUSINESS-LOGIC INCONSISTENCIES
(same structure)

## 9. CODE HYGIENE
- Dead files to delete (one bullet per file with import-graph proof)
- Unused exports
- Stale comments
- console.log to remove

## 10. SCHEMA HYGIENE
- Indexes missing
- Columns unreferenced
- Tables dormant (with confirmation needed before drop)
- RLS policies to tighten

## 11. INTEGRATION CHECKS
(each integration, status, recommended action)

## 12. MEMORY HYGIENE
- Files to update
- Files to retire
- New memory facts to record after tomorrow's session

## 13. ACCEPTANCE-TEST SUITE
A bulleted checklist Ohad runs at the end of tomorrow to confirm
"perfect everywhere":
- 100+ checkboxes covering one acceptance criterion each, organized
  by surface
- Each checkbox MUST be physically testable (no abstract claims like
  "the code is clean")

## 14. OPEN QUESTIONS FOR OHAD
Where intent was ambiguous and a wrong guess would cost effort. List
each question with the trade-off context so Ohad can answer quickly.

## 15. EFFORT ESTIMATE
For each section above, low/medium/high estimate (in person-hours of
Claude Code at Opus 4.7 speed).
```

---

# ANTI-PATTERNS — do not do these

- Do NOT propose new features beyond what's needed to close defects
- Do NOT rewrite working modules wholesale; recommend surgical changes
- Do NOT suggest swapping the stack (Supabase, Vercel, Vite + React)
- Do NOT use "cure" / "diagnose" / "fix" terminology in any UI string
  recommendation
- Do NOT propose weight-progression automation features (per
  `feedback_no_weight_progression_features`)
- Do NOT touch the exercise library code path (per
  `feedback_exercise_library_off_limits`)
- Do NOT pad the document with platitudes ("ensure best practices")
  — every sentence must be actionable or load-bearing
- Do NOT skip dimensions that have no findings — explicitly state
  "Pass clean" so the reader knows you looked
- Do NOT propose adding a test suite (Jest/Vitest/Playwright) as a
  defect — EXPO has none today and tomorrow's session is not the time
  to add one; if you want testing, propose a smoke-test script in
  `scripts/` instead
- Do NOT recommend Docker / containerization / k8s — irrelevant to
  this stack
- Do NOT propose splitting the monorepo — keep everything in
  `expo-full`

# DOMAIN TRAPS TO MIND

- **Trainees are a JSONB blob** in the `store` table under the key
  `expo-trainees`. They are NOT a relational table. Read patterns
  pre-load the full array.
- **Couples** = parent ID (e.g. `tr_neta_tom`) + sub-member IDs
  (`tr_neta_tom__0`, `tr_neta_tom__1`). Plans may be assigned to any
  of the three; workouts/payments may land on any of the three. Use
  `traineeIdsFor()` from `traineeUtils.js` to roll up correctly.
- **The publishable key in `src/supabase.js` is intentional** — it's
  the Supabase anon key. Don't flag it as a leaked secret.
- **The trainer password `1234` in scripts** is intentional for the
  test trainer account — per `reference_scripts_trainer_auth`. Don't
  flag it as a hardcoded secret.

---

# FINAL INSTRUCTIONS

Read every file in `src/` and `scripts/`. Connect to Supabase if you
can (publishable key in `src/supabase.js`; auth as
`ohadyproductions@gmail.com` / `1234` per `reference_scripts_trainer_auth`).
Walk every route in the production deploy at
`https://expo-app.co.il` and `https://expo-full.vercel.app`.

Produce the document. Make it dense. Make it complete. Make it
operational — Claude Code should be able to execute every finding
without further clarification.

When the document is ready, save it to
`docs/EXPO_PERFECTION_AUDIT_2026-05-13.md` and end your response with
the single phrase:

> AUDIT-COMPLETE — handing off to Claude Code Opus 4.7.

That signals Ohad the document is ready to paste into the next session.
