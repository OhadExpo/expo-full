# EXPO Perfection Audit — Implementation Brief

**Audit date:** 2026-05-13
**Commit head at audit time:** `6819f5b` style(cards): uniform cyan strips + Vitals title left-aligned
**Targets audited:** expo-app.co.il (coach + athlete + demo + try + intake + coaches), Supabase project `gtcbfglttoiyfsnfbhdy`, 5 `/api/*` Vercel functions, vite-plugin-pwa service worker, vercel.json CSP, ~85 memory files.
**Format:** This document IS the prompt for tomorrow's Claude Code (Opus 4.7) execution session. Every finding has file:line refs and a concrete fix. Execute top-down — section order is the recommended sequence.

---

## How to use this document

- Section ordering is execution order. Within a section, items are sorted by impact / effort ratio.
- Every finding has: title, file:line, symptom, root cause, fix, validation, risk.
- Anything labelled `REQUIRES_CONFIRMATION` sits in section 14 (Open Questions), not in BLOCKERs. Do not execute those without Ohad's explicit answer.
- Treat the section 13 acceptance suite as the post-execution checkpoint. The audit is not complete until every box in that section can be ticked truthfully.
- Update the working tree commit-by-commit. Run `npm run build` after each commit so the bare-CSS-fn guard catches any regression.
- The user-facing rule overrides any guideline here: if Ohad says skip, skip. The CLAUDE.md hard-don'ts (no "cure/diagnose/fix", no weight-progression, no library-tooling, no stack swaps, never `git add -A`) are absolute.

---

## 0. Pre-flight (read these first)

Read in this order:

1. `CLAUDE.md` — binding constraints (Strategic Mirror tone, Israeli VAT 18% / 0.8475 multiplier, exercise taxonomy, no "cure/diagnose/fix", no weight-progression, hard-don'ts).
2. `.claude/projects/C--Users-Administrator-Desktop-expo-full/memory/MEMORY.md` — index of binding preferences and project state.
3. `memory/feedback_uniform_card_strips.md` — the canonical card-strip rule that section 5 references repeatedly.
4. `memory/feedback_close_enough_never_good.md` — finish-the-job rule. If a visible defect is named, fix it; do not ask "good enough?".
5. `memory/feedback_never_git_add_dash_a.md` — only stage explicit paths.
6. `memory/feedback_other_coaches_scope.md` — subscribed coaches never touch marketing/chat/waitlist surfaces.
7. `memory/reference_supabase_rls_anon_gotchas.md` — `TO anon, authenticated` explicit role scoping required.
8. `memory/reference_safe_trainee_id_helper.md` — validate trainee IDs before interpolation into PostgREST raw filters.
9. `memory/reference_csp_video_block.md` — `media-src` history; informs current CSP review.
10. `memory/reference_storage_upload_tus.md` — TUS chunked upload from this Windows box.
11. `memory/feedback_videolink_accuracy.md` — never substitute close-family videos.
12. `memory/project_resume_2026_05_14.md` — current pause state, 6 migrations live, what shipped during the marathon.

When in doubt during execution, the **memory note overrides this document, and the user instruction overrides everything**. CLAUDE.md is the constitution; this audit is the punch list.

---

## 1. BLOCKERS (must fix before any new work)

Each item below blocks something. Either a multi-tenant launch, a data-loss path, a rules-of-hooks crash, a silent failure of a user-facing feature, or a public-surface security gap.

### 1.0a USER-REPORTED REGRESSION — dark coach portal tables flipped to light — RESOLVED: cross-device theme sync (no code fix needed)

- **Reported by Ohad on 2026-05-13.** Symptom: "the dark coach portal has changed (some of the tables became light mode), i never asked for that."
- **Root cause confirmed:** Ohad answered "Yes — I tried light mode somewhere." The `useTheme` hook's mount effect at `src/hooks/useTheme.js:68-85` adopts `data.user.user_metadata.theme_pref` from Supabase Auth on every sign-in. A one-time light-mode toggle on another device set `theme_pref='light'` globally; subsequent sign-ins on the Windows desktop adopt it.
- **No regression in code.** The cross-device sync is working as designed. The cards/tables that "flipped" are the new cyan-strip surfaces (`src/TraineeEvaluation.jsx:107, 216`, `src/NotesInline.jsx:73`, `src/NotesWidget.jsx:142`, `src/TraineeCRM.jsx:54, 104`, `src/DashboardView.jsx`, `src/PlansView.jsx`) which use `background: refined ? '#FFFFFF' : 'var(--c-sf)'`. With `theme_pref='light'`, `refined` is true and they render white-with-cyan-strip. That's the designed light theme.
- **Fix (one-time, no code edit):**
  1. On Ohad's current dark-preferring desktop: click the theme toggle in the coach header to flip light → dark.
  2. The `setTheme('dark')` call writes `user_metadata.theme_pref = 'dark'` to Supabase.
  3. Sign out → sign back in. Confirm dark mode persists.
  4. Belt-and-suspenders: on any device where Ohad toggled light, sign in once and toggle to dark.
- **Validation:** After the toggle, on the desktop:
  - `document.documentElement.getAttribute('data-theme')` returns `"dark"`.
  - `/coach/dashboard` renders dark. Every card body is `#0a0a0c`, not white.
  - Sign out + sign back in confirms the preference sticks.
- **Risk:** None. No code change. This is a user-state issue, not a code regression.

### 1.0b USER-REPORTED REGRESSION — Import button missing in coach portal header

- **Reported by Ohad on 2026-05-13.** Symptom in his words: "the import buttom dissapeard, fix it."
- **File:line:** `src/App.jsx:357` — `const fileRef = useRef(null)` exists. `src/App.jsx:477` — `handleImport` handler exists. `src/App.jsx:532` — `handleDrop` drag-and-drop handler exists. **None of them are attached to any DOM element.** Grep confirms no `<input type="file" ref={fileRef}>` element exists in the file.
- **Symptom:** A coach who wants to import an XLSX block file (or JSON backup) has no clickable button. The Smart Import icon in the header at `src/App.jsx:655` navigates to `/coach/smart-import` (the AI-driven import flow), which is a different surface and doesn't accept a direct XLSX drop for the simple-parse path.
- **Root cause:** Commit `0dc8473` ("feat: smart import replaces import button with same icon") removed the visible import affordance but left the handler code dangling. The dead `fileRef` / `handleImport` / `handleDrop` / `handleConfirmImport` / `toggleImportTrainee` / `setPendingImport` / `setImportSelectedTrainees` / `setImportMsg` / `setDragOver` block at `src/App.jsx:352-547` (plus the modal at lines 681-711) is all orphaned code if Smart Import truly replaces it.
- **Fix:** Two options — Ohad picks:
  - **Option A (restore the button):** Re-add a visible Import button in the header next to the Smart Import icon. Pattern:
    ```jsx
    <input ref={fileRef} type="file" accept=".json,.xlsx,.xls,.csv"
           onChange={handleImport} style={{display:'none'}} />
    <button className="hdr-icon-btn"
            onClick={() => fileRef.current?.click()}
            title="Import XLSX/CSV/JSON"
            style={{...baseBtn, background:'transparent', color:C.tm,
                    padding:'6px 8px', fontSize:14, borderRadius:0}}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" strokeWidth="2" strokeLinecap="round"
           strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="7 10 12 15 17 10"/>
        <line x1="12" y1="15" x2="12" y2="3"/>
      </svg>
    </button>
    ```
    Place it inline at `src/App.jsx:655` BEFORE the Smart Import button so the bare XLSX-direct path stays as the quick action. Also restore the drag-and-drop drop zone wrapper around `<main>` if Ohad wants drag-to-import.
  - **Option B (delete the dead code):** If Smart Import truly replaces the legacy import (Ohad confirms), delete the entire `fileRef + handleImport + doImportSingle + doImportMulti + handleExport + handleDrop + handleDragOver + handleDragLeave + handleConfirmImport + toggleImportTrainee + pendingImport state + importSelectedTrainees state + importMsg state + dragOver state` block (App.jsx:352-547) plus the import modal (681-711). Cleaner working tree; loses the bare-XLSX shortcut.
- **Recommended:** Option A. The bare XLSX import is faster than walking through Smart Import for a known-shape Drive sheet. Two buttons in the header (xlsx-direct + smart-import) cost nothing.
- **Validation:** Click the restored button. File picker opens. Pick an xlsx. Trainee-assign modal appears. Assign to a test trainee. Plan lands in the database.
- **Risk:** Option A — none, restores prior behavior. Option B — deletes ~250 lines of dead code; verify no other surface imports from these handlers (`grep` confirms they don't).

### 1.0c USER-REPORTED REGRESSION — "Log-in button disappeared" — RESOLVED: Sign Out icon in coach header

- **Reported by Ohad on 2026-05-13.** Symptom: "the log-in buttom ... dissapeard, fix it." Clarified to: the Sign OUT icon in the coach header.
- **File:line:** `src/App.jsx:658` — the sign-out button uses `color: C.tm` (muted gray) with no border, SVG-only door+arrow icon at the far right of the header bar.
- **Root cause:** On the dark header background, `C.tm` (muted gray) reads as faint. The other right-side icons (Smart Import, Export, Password change) use the same muted color but their actions are reversible. Sign Out is the most consequential action and should be the most legible.
- **Fix:** Change `color: C.tm` to `color: C.tx` on the sign-out button at `src/App.jsx:658`. Full body color — immediate visual recovery. Also add `aria-label="Sign out"` for screen-reader parity (currently has only `title="Sign out"`).
- **Validation:** Load `/coach/dashboard` in dark mode. The far-right door+arrow icon should be fully legible body-color, not faded gray. Hover state should still show the cyan tint (existing `.hdr-icon-btn:hover` rule at App.jsx:624).
- **Risk:** None. Pure visual contrast bump; no behavior change.

### 1.1 AuthGate hooks-rule violation — popstate crashes the app

- **File:line:** `src/App.jsx:101-190`. `useEffect` calls at lines 117, 129 sit BEFORE early returns at lines 162-180, and a third `useEffect` at line 184 sits AFTER those returns.
- **Symptom:** Browser back/forward between `/try` or `/demo/*` and `/coach/*` flips React's hook count, throwing "Rendered more hooks than during the previous render". AuthGate crashes, surfaces in `ErrorBoundary`.
- **Root cause:** The early-return blocks for the public-routes branch were grafted in front of the auth-redirect `useEffect` without moving them after all hook calls. React Rules-of-Hooks require an unconditional hook order across renders.
- **Fix:** Move the redirect `useEffect` at line 184 up so all three `useEffect`s run unconditionally before any early return. Concretely: place lines 184-190 immediately after the existing `useEffect` at line 129 (still before any conditional return). Verify the early returns at 162-180 remain after every hook.
- **Validation:** In a dev build, navigate `/try → /coach/dashboard` via the back button. Expect no React warning in the console and no ErrorBoundary fallback. Validate the same path under React StrictMode (`<React.StrictMode>` wrap) — strict mode doubles all effects and will surface the violation immediately if any hook is conditional.
- **Risk:** Low if changed surgically. Touching the redirect logic could break the `/coaches → /demo` legacy rewrite at line 129; verify by visiting `https://expo-app.co.il/coaches` and confirming the address bar rewrites to `/demo`.

### 1.2 TraineeDetail.jsx hooks-rule violation — `td` toggle crashes the detail view

- **File:line:** `src/TraineeDetail.jsx:60` — `if (!td) return null;` early return sits ABOVE `useState`/`useAutosave` calls at lines 72 and 113.
- **Symptom:** When the trainee data prop is briefly undefined (parent re-fetches, transient race), React records a shorter hook list than the previous render. The next time `td` is defined, the hooks misalign and React throws.
- **Root cause:** Early-exit guard placed mid-hook-list.
- **Fix:** Move `if (!td) return null;` to immediately before the `return (` block (around line 240) — after all `useState` and `useAutosave` calls. Or hoist the `useState`/`useAutosave` calls above the early return. The first option is less disruptive.
- **Validation:** In dev, open `/coach/trainees/tr_amit` and watch console while the parent component re-fetches (e.g., trigger a "reload trainees" action). No hook-count warning should fire. Confirm `useAutosave` continues to autosave drafts on the detail page.
- **Risk:** Surgical change; the early return still fires when needed.

### 1.3 TraineePRsView useMemo used as side-effect — anti-pattern crash risk

- **File:line:** `src/TraineePRsView.jsx:213` — `useMemo` body calls `setPickedId(...)`.
- **Symptom:** `useMemo` is for pure values. Calling `setState` inside fires twice in StrictMode and creates an unmemoized state write during render. On rapid prop changes, React can complain about state updates during render and abort the commit.
- **Root cause:** Developer wanted "run when options change" but reached for `useMemo` instead of `useEffect`.
- **Fix:** Convert to `useEffect(() => { ... }, [options])`. Replace the return value if any with explicit state declared via `useState`.
- **Validation:** Toggle exercise picker in Records tab on a trainee with multiple historical PRs. Expect no React warnings. Confirm the picker still pre-selects the most recent.
- **Risk:** None — the function had no useful return value being consumed.

### 1.4 ClientPortal handleVideoUpload not gated on demoMode — public upload to prod storage

- **File:line:** `src/ClientPortal.jsx:564, 575` (entry point: `handleVideoUpload`).
- **Symptom:** A visitor at the public `/demo/athlete` route can record/select a form video and invoke `uploadWithProgress` / `supabase.storage.from('form-videos').upload(...)` against the anon key. The path interpolates `clientId = '__demo__'` and pollutes the production storage bucket with public junk.
- **Root cause:** `handleComplete`, plans-load, and presence heartbeat all check `demoMode`. `handleVideoUpload` does not.
- **Fix:** First line of `handleVideoUpload`:
  ```
  if (demoMode) { toast('Demo mode — uploads disabled', 'info'); return; }
  ```
- **Validation:** Load `/demo/athlete`, attempt to upload any video. Expect a toast, expect zero storage objects created. Confirm via Supabase Studio → Storage → form-videos that no new `__demo__/` objects exist.
- **Risk:** Trivial; just an early return.

### 1.5 Dead `blob:` URL persisted across session resume — form video appears lost

- **File:line:** `src/ClientPortal.jsx:262-264, 301-312, 517-518`.
- **Symptom:** Trainee starts a workout, films a set, tab closes (or accidental reload) mid-upload. On resume, the StepLogger restores `fv[ei].videoUrl` set to a stale `blob:...` URL minted by the previous tab. The `<video>` element renders empty. The trainee believes their recording vanished.
- **Root cause:** `sessionDraft` bundles the in-memory `fv` array verbatim into localStorage. The blob URL minted by `URL.createObjectURL` is bound to that document, not portable.
- **Fix:** Build a `serializeFv(fv)` helper that strips `videoUrl` if it starts with `blob:` and keeps only `{has, note, fileName, cloudUrl, pendingBlobId, uploaded}`. On rehydrate, if `cloudUrl` is null but `pendingBlobId` is set, re-pull the Blob from IndexedDB via `getEntry(pendingBlobId)`, mint a fresh `URL.createObjectURL`, and slot it back into `fv[ei].videoUrl`. If neither cloudUrl nor pendingBlobId resolves, mark `has: false` so the UI shows the "no video yet" affordance honestly. Use the helper in `useAutosave`'s `save` fn and in the resume guard.
- **Validation:** Start a workout, film one set, immediately reload the tab before upload completes. Resume. Confirm the video re-appears (or, if the blob was lost entirely, the UI shows the no-video affordance — not a black box).
- **Risk:** Misses an edge case where the IDB blob entry was already drained but the upload hadn't patched `cloudUrl` yet. Acceptable; the IDB drain runs after `attachWorkout` so by the time the blob is gone the workout row has the URL.

### 1.6 Remove button leaks queued blob — upload continues after user "removed" the video

- **File:line:** `src/ClientPortal.jsx:1130`.
- **Symptom:** Trainee taps Remove on a freshly recorded form video. The state mutation clears the local `videoUrl`, but the IDB blob entry survives. The offline drainer picks it up and uploads the "removed" clip + patches the workout row.
- **Root cause:** `Remove` handler only mutates `fv[ei]` state keys. It does not `URL.revokeObjectURL` and does not `removeBlob(f.pendingBlobId)`.
- **Fix:** Inline before the `setFv(...)`:
  ```
  if (f.videoUrl?.startsWith('blob:')) URL.revokeObjectURL(f.videoUrl);
  if (f.pendingBlobId) removeBlob(f.pendingBlobId).catch(()=>{});
  ```
- **Validation:** Start a slow-network workout that has a pending blob upload. Tap Remove. Wait 30s for the offline drainer. Confirm no workout row patch and no storage object lands.
- **Risk:** None.

### 1.7 Multi-tenant blocker — coach-rendered "Ohad" name strings to trainees of any coach

- **File:line:** `src/ClientPortal.jsx:1644`, `src/TrySandbox.jsx:651`.
- **Symptom:** Both files hard-code "Ohad" in user-facing strings shown to trainees (notification copy, sandbox banners). When a coach other than Ohad onboards, their trainees see "from Ohad" attribution on their own coach's notes.
- **Root cause:** Single-tenant copy baked in at the start of the marketing chat era and never parametrized.
- **Fix:** Resolve coach display name from the active coach record (today via `TRAINER_EMAILS[0]` or the trainer row; eventually via `current_trainer_id()` from the multi-tenant migration). Replace both literals with `${coachDisplayName}`.
- **Validation:** Local impersonation — temporarily add a second email to `TRAINER_EMAILS` and a different display name. Confirm trainee-facing copy uses the impersonated name.
- **Risk:** Today these are Ohad-only surfaces; refactor is cheap. Mark `REQUIRES_CONFIRMATION` only if Ohad wants to defer until the multi-tenant DRAFT lands.

### 1.8 SUBSTITUTION_TEST_EMAILS hardcoded to Ohad — multi-tenant blocker

- **File:line:** `src/ClientPortal.jsx:39` — `const SUBSTITUTION_TEST_EMAILS = new Set(['ohadyproductions@gmail.com']);`
- **Symptom:** The substitution swap UI only renders for Ohad's email today. When other coaches eventually onboard, their template-purchase trainees won't see the SWAP affordance.
- **Root cause:** Test-fixture override committed to prod.
- **Fix:** Remove the constant entirely. Rely on `isTemplatePlan(plan)` alone (the typed `plans.is_template_purchase` column + the legacy name-prefix fallback already cover the gate).
- **Validation:** Open `/athlete` as a template-purchase trainee; confirm SWAP appears. Open as a regular client; confirm SWAP does not appear.
- **Risk:** None — the test override was a one-off.

### 1.9 Task→Plan auto-link race — silent loss of the handoff

- **File:line:** `src/PlansView.jsx:1110-1122` + `src/coachNotes.js:138-145`.
- **Symptom:** Clicking "→ NEW PROGRAM" on a task fires `consumePendingTaskPlanLink()` which destructively reads the sessionStorage entry. If the plan editor's mount races with the consume call, or `cancelled` fires before the consume completes, the linked task ID is dropped entirely. Plan opens unlinked; on save the task does not auto-mark done; coach has no signal anything went wrong.
- **Root cause:** Destructive read in `consume*` before the consumer confirms it wants the payload.
- **Fix:** Split `consumePendingTaskPlanLink()` into `peekPendingTaskPlanLink()` (non-destructive) and `dropPendingTaskPlanLink()` (delete only). In `PlansView.jsx:1110`, peek first, only drop after the mount confirms it's using the value. Alternatively, swap the read order so `if (cancelled) return;` fires BEFORE the `sessionStorage.removeItem`.
- **Validation:** Click "→ NEW PROGRAM" on a task. In dev tools, watch sessionStorage during the navigation. Confirm the key persists until the plan editor mounts and consumes it. Confirm the task auto-marks done on save.
- **Risk:** Minor refactor; cover with a console.assert log during testing to verify the peek/drop pattern in practice.

### 1.10 DashboardView passes garbage plan data to syncAutoTasks — auto-task timing wrong on non-4-week plans

- **File:line:** `src/DashboardView.jsx:188-199`.
- **Symptom:** Every dashboard mount calls `syncAutoTasks` with a mapped plan list where every plan ends up with `weeks: 4` regardless of its true week count. The `next_block_due` rule and `week_missed` rule both depend on `weeks` to know when a milestone hits. Result: false positives on 8-week or 12-week plans; false negatives on 6-week plans.
- **Root cause:** The PostgREST SELECT aliases `data` → `weeks` (a name collision), then line 196 reads `p.weeks?.weeks || (p.weeks?.days ? 4 : 4)`. The right side of the ternary is `4 : 4` (always 4). The left side relies on the alias having put the JSONB into `p.weeks`, which sometimes works and sometimes returns the integer 4 from the actual weeks column on the row.
- **Fix:** Rewrite the SELECT as `select('id, name, trainee_id, data, created_at')` and the map as:
  ```
  weeks: p.data?.weeks || 4,
  days: p.data?.days || []
  ```
  Delete the dead `4 : 4` fallback.
- **Validation:** Find a trainee on an 8-week block at week 7. Confirm `next_block_due` fires (it should — last week of the block). Find a trainee on a 4-week block at week 2. Confirm `next_block_due` does not fire.
- **Risk:** Touch only the SELECT alias and the map; `syncAutoTasks` contract unchanged.

### 1.11 BLOCKERS deferred to OPEN QUESTIONS

The following are blocker-shaped findings but require Ohad's go/no-go on scope. They appear in section 14 (Open Questions), not here:

- `TRAINER_EMAILS` hardcoded in `src/auth.jsx:11` — explicitly deferred per memory `project_multi_tenant_first_task.md` until the 5-coach gate opens. Do not unblock without confirmation.
- The full 7 BLOCKERs from `memory/project_multi_tenant_audit.md` (chat_logs RLS, leads scoping, presence per-trainer, smart-import library reads, storage path coach-prefix, trainee_trainer lookup, etc.) — these all gate on the multi-tenant deploy decision.
- The 6 NEW hardcoded-email RLS policies on `coach_notes`, `coach_tasks`, `trainee_activity`, `trainee_evaluations`, `trainee_next_actions`, plus the existing `chat_logs_trainer_select` — same gate.

---

## 2. SECURITY GAPS

### 2.1 Supabase function `search_path` mutable on 5 SECURITY DEFINER functions

- **File:line:** Supabase functions `trainees_sync_auth`, `verify_intake_token`, `set_updated_at_coach_notes`, `submit_intake_form`, `set_updated_at_trainee_evaluations` (per `mcp__plugin_supabase_supabase__get_advisors` security pass).
- **Symptom:** A function with mutable `search_path` running as `SECURITY DEFINER` can be hijacked by a user with `CREATE` privilege in any schema on the search_path. Even though Supabase project is tightly held, this is a defense-in-depth gap.
- **Root cause:** Functions defined without `SET search_path = public, pg_temp`.
- **Fix:** Apply a migration that adds `SET search_path = public, pg_temp` to each function definition. Idempotent via `CREATE OR REPLACE FUNCTION`.
- **Validation:** Re-run `mcp__plugin_supabase_supabase__get_advisors` security pass. Confirm the `function_search_path_mutable` warnings clear.
- **Risk:** None functional. Pin to `public, pg_temp` (or `pg_catalog, public, pg_temp` if you reference catalog functions).

### 2.2 Anon-callable SECURITY DEFINER functions — review which are intentional

- **Functions flagged anon-callable:** `current_client_id`, `current_trainee_id`, `ensure_client_account(text, text)`, `is_trainer`, `mark_intake_token_used(text)`, `rls_auto_enable`, `submit_intake_form(...)`, `trainees_sync_auth`, `verify_intake_token(text)`.
- **Symptom:** Anon callers can hit `/rest/v1/rpc/<fn>` and execute these as the function owner. Some are designed for public intake flow (`verify_intake_token`, `submit_intake_form`, `mark_intake_token_used`); others should not be anon-callable (`current_client_id`, `current_trainee_id`, `is_trainer`, `ensure_client_account`, `rls_auto_enable`, `trainees_sync_auth`).
- **Root cause:** Functions created without explicit `REVOKE EXECUTE ... FROM anon`.
- **Fix:** Apply a migration:
  ```
  REVOKE EXECUTE ON FUNCTION public.current_client_id() FROM anon;
  REVOKE EXECUTE ON FUNCTION public.current_trainee_id() FROM anon;
  REVOKE EXECUTE ON FUNCTION public.is_trainer() FROM anon;
  REVOKE EXECUTE ON FUNCTION public.ensure_client_account(text, text) FROM anon;
  REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon;
  REVOKE EXECUTE ON FUNCTION public.trainees_sync_auth() FROM anon;
  ```
  Keep `verify_intake_token`, `submit_intake_form`, `mark_intake_token_used` anon-callable — they back the public intake flow per `2026-05-07-intake-token-server-side.sql`.
- **Validation:** Re-run advisors. Confirm only the three intake-flow functions remain on the anon list.
- **Risk:** Test the intake flow at `/intake/he?t=<live_token>` after the revoke — confirm submission still works (it uses RPC `submit_intake_form` which stays public).

### 2.3 form-videos public bucket allows listing — fix or accept

- **Detail:** Per advisors, `storage.objects` has two broad SELECT policies on the `form-videos` bucket: `allow_all_form_videos` and `public_read`.
- **Symptom:** Anon clients can list every object in the bucket via the storage API. Public buckets do not need listing to allow direct fetch of a known URL.
- **Root cause:** Two policies grant SELECT; one is redundant. Listing enables a casual data-discovery surface.
- **Fix:** Drop `allow_all_form_videos` (or whichever is the broader of the two). Keep one SELECT policy scoped to bucket = 'form-videos'. The bucket remains public for direct URL access via signed paths or known paths.
- **Validation:** Anon `curl` against `https://<project>.supabase.co/storage/v1/object/list/form-videos` should return empty or 403 after the change. Direct fetches of known URLs continue to succeed.
- **Risk:** If any current code path lists the bucket, it breaks. Grep `src/`, `scripts/` for `.list(` and `from('form-videos')` — no occurrences should rely on listing.

### 2.4 Auth Leaked Password Protection (HIBP) disabled

- **Detail:** Supabase Auth setting "Password Strength: Check against HaveIBeenPwned" is off.
- **Symptom:** Users can set passwords that appear in known breach corpora. Combined with the `1234` default password for new trainees (per `auth.jsx:271` minimum 4 chars), this is a soft target.
- **Root cause:** Dashboard setting never enabled.
- **Fix:** Enable in Supabase Studio → Auth → Policies → Password Strength → "Check against HaveIBeenPwned: On". Independently, raise `auth.jsx:271` password-minimum from 4 → 8 chars once you stop using `1234` as the trigger default. Defer if changing the default password breaks the trainee-onboarding flow today.
- **Validation:** Try setting a known-breached password (e.g. `password123`) via PasswordChangeModal. Expect rejection.
- **Risk:** None functional; affects only future password changes, not existing.

### 2.5 `chat_logs_trainer_select` policy uses `roles: {public}` — should be `{authenticated}`

- **File:line:** `scripts/migrations/2026-05-03-chat-logs-rls-fix.sql:23-27` (live in production per pg_policies).
- **Symptom:** Policy is `TO PUBLIC` (or implicitly), which per memory `reference_supabase_rls_anon_gotchas.md` is the "PostgREST may reject anon" footgun pattern. Today the policy gates on `auth.jwt() ->> 'email'` so anon callers fail the predicate, but the role scoping is the wrong level.
- **Root cause:** Migration omitted explicit `TO authenticated`.
- **Fix:** Drop + recreate with `TO authenticated`. Same predicate, explicit role list.
- **Validation:** Anon `curl` to `/rest/v1/chat_logs?select=*` returns empty (it does already). Trainer SELECT continues to work.
- **Risk:** None.

### 2.6 Rate limit bypass on `/api/chat` and `/api/smart-import`

- **File:line:** `api/chat.js:169-178, 185`; `api/smart-import.js:436-445, 454`.
- **Symptom:** Both endpoints use an in-memory `Map` rate-limit bucket that resets on every Vercel cold start. An attacker hitting cold instances in different regions can bypass the 30-req/hour cap. Compounded by line 185 (`x-forwarded-for.split(',')[0].trim()`) — Vercel sets `x-forwarded-for` from the upstream chain, and an attacker can spoof the leftmost token.
- **Root cause:** Best-effort in-process rate limit + leftmost-XFF semantics.
- **Fix:**
  - Switch IP source: use `req.headers['x-real-ip']` (Vercel-injected single value) or take the *last* XFF token (Vercel appends the real client at the end).
  - Move bucket to durable storage. Install Upstash Redis from the Vercel Marketplace per `feedback_autonomous_setup.md` (one-click integration, env vars auto-provisioned). Then replace the in-memory `Map` with `await redis.incr(key, { ex: 3600 })`.
- **Validation:** Hammer `/api/chat` from a single IP through multiple regions. Confirm the 31st request returns 429 regardless of cold-start.
- **Risk:** Slight latency add per request (one Redis round-trip). Acceptable; the chat is already on Sonnet 4.6 (~500ms baseline).

### 2.7 Smart Import accepts anon callers — cost ceiling at risk

- **File:line:** `api/smart-import.js:478-479`.
- **Symptom:** When the `Authorization: Bearer <coach JWT>` header is missing, the handler falls back to `SUPA_PUBLISHABLE_KEY` and continues. An unauthenticated attacker can hit the smart-import endpoint and burn Anthropic Opus 4.7 dollars (up to ~$1.50/request worst case after the 8-hop tool loop).
- **Root cause:** Defense-in-depth gate missing.
- **Fix:** Add immediately after the rate-limit check:
  ```js
  if (!authToken) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  ```
  Smart Import is a coach-only feature; there is no anon use case.
- **Validation:** `curl -X POST https://expo-app.co.il/api/smart-import` without an Authorization header. Expect 401.
- **Risk:** None — the only legitimate callers are authenticated.

### 2.8 Smart Import body-size cap is illusory

- **File:line:** `api/smart-import.js:461-464` (the `content-length > 2MB` check).
- **Symptom:** Vercel's default `bodyParser` has already parsed `req.body` before the handler runs. By the time line 461 executes, the parse is done and the cap is decorative.
- **Root cause:** Missing Vercel function config export.
- **Fix:** Add at the top of the file:
  ```js
  export const config = {
    maxDuration: 60,
    api: { bodyParser: { sizeLimit: '2mb' } },
  };
  ```
  Apply the same `maxDuration: 60` to `api/chat.js` (the SSE path can exceed Hobby's 10s timeout) and `api/capture.js` for parity.
- **Validation:** POST a 5MB payload to `/api/smart-import`. Expect 413, not a 200 that runs the whole tool loop.
- **Risk:** Verify the Vercel plan supports `maxDuration: 60` (Pro does; Hobby caps at 10s).

### 2.9 SSE streaming has no maxDuration — 10s cutoff on Hobby

- **File:line:** `api/chat.js` overall — no `export const config`.
- **Symptom:** On Vercel Hobby, the function hard-times-out at 10s. Streaming Sonnet 4.6 at 800 tokens easily exceeds that. The client sees a truncated reply.
- **Root cause:** Missing config.
- **Fix:** As in 2.8 — add `export const config = { maxDuration: 60 }`. Also add an SSE heartbeat ping every 15s to prevent middlebox connection drops:
  ```js
  const heartbeat = setInterval(() => res.write(`: ping\n\n`), 15000);
  // clear in the SSE finally
  ```
- **Validation:** Send a chat message that elicits a long reply (~500 tokens). Confirm the response streams to completion without truncation.
- **Risk:** Heartbeat is well-known SSE pattern; safe.

### 2.10 `/api/resolve-video` has no rate limit and no body-size cap

- **File:line:** `api/resolve-video.js`.
- **Symptom:** The SSRF defenses (5-hop redirect cap + host allowlist on `photos.app.goo.gl` / `photos.google.com` initial + `googleusercontent.com` per-hop) are tight. But the endpoint has no rate limit and reads the response body with `r.text()` (unbounded).
- **Root cause:** Helper endpoint built lean; abuse surface not analyzed.
- **Fix:** Add the same rate-limit pattern as chat.js (or Upstash-backed). Cap response body to 256KB:
  ```js
  const reader = r.body.getReader();
  let received = 0;
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.length;
    if (received > 256 * 1024) throw new Error('response too large');
    chunks.push(value);
  }
  const html = new TextDecoder().decode(Buffer.concat(chunks));
  ```
- **Validation:** Probe with a crafted upstream that returns gigabytes. Confirm the endpoint rejects.
- **Risk:** Trivial.

### 2.11 `/api/capture` has no rate limit + duplicate enrichment cost

- **File:line:** `api/capture.js`.
- **Symptom:** Anon callers can repeatedly POST the same enriched lead. Each call spawns 2 Haiku calls; cost is small but non-zero. The 409 unique-constraint short-circuit fires only AFTER enrichment runs.
- **Root cause:** No early existence probe; no rate limit.
- **Fix:**
  - Add per-IP rate limit (5/hour) mirroring chat.js.
  - Before the Haiku calls, GET `/rest/v1/leads?email=eq.<email>&source=eq.<source>&select=id` and short-circuit if the row already exists.
- **Validation:** Submit the same email + source twice in quick succession. Confirm only the first triggers enrichment (check chat_logs for Haiku turns or Anthropic billing).
- **Risk:** Trivial.

### 2.12 Intake tokens use `Math.random()` instead of CSPRNG

- **File:line:** `src/intakeFormSchemas.js:254-259`.
- **Symptom:** Tokens are derived from `Math.random()` (V8: ~52 bits of state per call). The comment claims "~113 bits of entropy" which is false for `Math.random()`. Same-tab attackers could predict subsequent tokens.
- **Root cause:** PRNG choice.
- **Fix:**
  ```js
  function generateIntakeToken() {
    const buf = new Uint8Array(16);
    crypto.getRandomValues(buf);
    return Array.from(buf, b => b.toString(36).padStart(2, '0')).join('').slice(0, 24);
  }
  ```
  Or rely on Postgres `gen_random_uuid()` server-side and remove the client-side generator entirely.
- **Validation:** Generate 10 tokens, confirm sufficient entropy (no two collide; visual inspection of randomness).
- **Risk:** None — token format changes but submission flow consumes whatever it receives.

### 2.13 IntakeForm missing email regex on submit

- **File:line:** `src/IntakeForm.jsx:140` (input has `type="email"` but submit handler is `onClick` not `onSubmit`, so the browser validation never fires).
- **Symptom:** `"foo"` is accepted as an email and reaches the `email` column on `intake_submissions`.
- **Root cause:** `validate()` does not regex-check `q.type === 'email'`.
- **Fix:** In `validate()`:
  ```js
  if (q.type === 'email' && v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
    return 'Invalid email';
  }
  ```
- **Validation:** Try submitting an intake form with `foo` in the email field. Expect validation error.
- **Risk:** None.

### 2.14 LIKE wildcard not escaped in CoachPreviewPortal

- **File:line:** `src/CoachPreviewPortal.jsx:58` — `.or(`trainee_id.eq.${id},trainee_id.like.${id}__%`)`.
- **Symptom:** Underscore in LIKE is a single-char wildcard. Pattern `tr_abc__%` matches anything starting `tr_abc` + 2 chars + anything. A trainee ID like `tr_abcdef` would unexpectedly match `tr_abc__%`.
- **Root cause:** No escape of the literal underscore.
- **Fix:** Escape underscores in `id` before interpolation:
  ```js
  const safeId = id.replace(/[_%\\]/g, '\\$&');
  .or(`trainee_id.eq.${id},trainee_id.like.${safeId}__%`)
  ```
  Or switch to a Postgres function that takes the id as a typed argument and uses `LIKE escape '\\'`.
- **Validation:** Add a test trainee ID `tr_test`, also add `tr_testextra`. Preview `tr_test` and confirm only its own plans (and `tr_test__0`/`__1` if any) appear; `tr_testextra` does not leak.
- **Risk:** Low — current IDs don't have the collision, but the fix prevents future regressions.

### 2.15 Plans couple-suffix RLS clause can leak via prefix LIKE

- **Detail:** `plans` table policy `client_read_own_plans` includes:
  ```
  current_client_id() ~~ (split_part(trainee_id, '__'::text, 1) || '%'::text)
  ```
  A LIKE clause that builds a pattern from the row data and checks the user's id against it. If row `trainee_id = 'tr_xx'` (with `__` split returning `'tr_xx'`, pattern `'tr_xx%'`), then user `'tr_xxabc__0'` matches. A client whose id is a prefix-collision of another trainee's id can read that trainee's plans.
- **Symptom:** Edge case, but data-leak across trainees if IDs ever collide on a strict-prefix basis.
- **Root cause:** Pattern-build using row data + LIKE.
- **Fix:** Tighten the clause. Use explicit equality on parent ID instead of LIKE:
  ```
  (
    trainee_id = current_client_id()
    OR trainee_id = current_client_id() || '__0'
    OR trainee_id = current_client_id() || '__1'
    OR current_client_id() = trainee_id || '__0'
    OR current_client_id() = trainee_id || '__1'
  )
  ```
- **Validation:** Apply on a Supabase branch first. Confirm regular trainee `/athlete` view still shows their plans. Add a `tr_xx` row plus a `tr_xxabc` row and try cross-read.
- **Risk:** Trainee IDs that don't fit the `__0`/`__1` couple suffix convention need fallback handling.

---

## 3. DATA-INTEGRITY GAPS

### 3.1 Presence heartbeat is a textbook read-modify-write race

- **File:line:** `src/ClientPortal.jsx:1289-1293`.
- **Symptom:** Multiple trainees online simultaneously can clobber each other's presence stamps. Coach dashboard sees flickering Online indicators.
- **Root cause:** `select value → mutate object → upsert` with no atomicity.
- **Fix:** Move to per-client rows: store under `expo-presence-${clientId}`, write only that one row. Eliminates the shared object entirely. Coach-side aggregation queries `select * from store where key like 'expo-presence-%'`.
- **Validation:** Open `/athlete` from two browsers under different trainee accounts simultaneously. Confirm coach dashboard shows both online without flicker over a 5-minute window.
- **Risk:** Coach-side reader must be updated to aggregate across keys. Migration of existing `expo-presence` JSONB → per-row entries is a one-time pass.

### 3.2 Order race between blob upload and live workout writes

- **File:line:** `src/blobQueue.js:201-227` + `src/useSupaStore.js:267-309`.
- **Symptom:** Offline workout finishes; comes back online. `useSupaStore.save` enqueues `client_workouts.upsert`. `drainBlobs()` independently uploads form-video and patches `client_workouts` via `.update` or enqueue. If the `.update` ever runs before the upsert, it silently fails (row doesn't exist).
- **Root cause:** Two independent queues, no causal ordering.
- **Fix:**
  - Make the `client_workouts.update` handler at `useSupaStore.js:76` tolerant of missing rows: re-enqueue rather than throw.
  - Optionally, add a sequence guard: blob queue waits until the offlineQueue has drained its `client_workouts.upsert` entries before issuing `.update`.
- **Validation:** Simulate offline workout finish + close tab. Reopen online. Confirm both workout row and form-video URL land correctly, regardless of drain order.
- **Risk:** None — the tolerant-update path is strictly safer.

### 3.3 markTaskCompletedByPlan failure race — orphan task, duplicate plan risk

- **File:line:** `src/PlansView.jsx:1090-1104` + `src/coachNotes.js:117-129`.
- **Symptom:** Plan saves succeed, `markTaskCompletedByPlan` fails (RLS, network), the editor closes, no error toast surfaces. Later, the coach sees the task still open, clicks "→ NEW PROGRAM" again, creates a duplicate plan.
- **Root cause:** Non-atomic two-step (savePlan + markTaskCompletedByPlan); the second-step failure is logged via `reportFailure` but the editor closes regardless.
- **Fix:** Persist a pending-task-link in a small `coach_notes` row (or sessionStorage) when `markTaskCompletedByPlan` returns false. Surface a "task wasn't auto-marked, retry?" affordance on the next NotesInline render for that plan. Alternatively, write a queued cleanup pass on Dashboard mount that scans for plans linked to still-open tasks.
- **Validation:** Force `markTaskCompletedByPlan` to fail (e.g., temporarily wrong predicate). Save a plan from a task. Confirm the retry affordance appears on the trainee card.
- **Risk:** Adds one more queued operation; acceptable.

### 3.4 BILLING one-time migration runs unconditionally on every coach mount

- **File:line:** `src/App.jsx:422-441`.
- **Symptom:** The hardcoded BILLING map seeds payment values keyed by Hebrew trainee names. On every Ohad sign-in, this migration runs (idempotent today because the names already match). When a second coach signs in, this map still fires and writes Ohad's billing data over the new coach's trainees if name collisions exist.
- **Root cause:** Migration was meant as one-time but never gated to a single owner.
- **Fix:** Gate on `email === 'ohadyproductions@gmail.com'` for now; remove entirely once the data is settled and the migration is no longer needed (it has run; delete the block).
- **Validation:** Sign in as Ohad — no behavior change. Impersonate a non-Ohad trainer — confirm the block does not run.
- **Risk:** Low. The block is dead-effect today (data already migrated) so simply deleting is also acceptable.

### 3.5 NotesWidget badge counts include DONE rows

- **File:line:** `src/NotesWidget.jsx:101-108` + `src/coachNotes.js:33-40`.
- **Symptom:** Dashboard widget reads "TASKS (47)" with 3 actually open. Filter pills similarly inflate.
- **Root cause:** `useCoachNotes` returns all rows; `counts` computed against the full set.
- **Fix:** Compute counts off the `openRows` partition. Update pill counts the same way.
- **Validation:** Mark several tasks done. Confirm widget badge reflects only open count.
- **Risk:** None — display-only.

### 3.6 Optimistic task creation lacks `created_at` — local sort breaks momentarily

- **File:line:** `src/coachNotes.js:53-74` + `sortTasks` at line 107-113.
- **Symptom:** New task appears at random position until the next refetch.
- **Root cause:** `new Date(undefined)` returns Invalid Date; sort compares NaN.
- **Fix:** Set `created_at: new Date().toISOString()` on the optimistic row before pushing to state.
- **Validation:** Create a new task. Confirm it lands at the top of the list immediately (assuming desc-by-created sort).
- **Risk:** None.

### 3.7 EX dictionary mutated unbounded across plan renders

- **File:line:** `src/ClientPortal.jsx:102-107` — `trainerPlanToPortal` appends `dyn_*` keys to the module-imported `EX`.
- **Symptom:** Across many trainees and sessions, the shared `EX` map grows unbounded. In dual-role coach/preview flows, one trainee's dyn keys can leak into another's lookup.
- **Root cause:** Mutating an imported module-level Map.
- **Fix:** Replace with a local `Map` scoped to the `trainerPlanToPortal` call. Memoize per `plan.id` if needed. Return a portal-shape that carries resolved exercise data on its rows.
- **Validation:** Open `/athlete` for trainee A, then preview trainee B from `/coach/trainees/<B>/preview`. Confirm trainee B's exercise resolutions do not contain any artifact from A's plan.
- **Risk:** Surgical refactor of a hot path; cover with manual smoke test.

### 3.8 Form-video element missing onError handler

- **File:line:** `src/ClientPortal.jsx:748, 751, 1017, 1019, 1121`.
- **Symptom:** When Supabase storage 404s, CSP blocks, or codec fails, the `<video>` renders a silent black box. Trainee thinks the upload was lost.
- **Root cause:** No `onError` handler on the elements.
- **Fix:** Add `onError={e => setFvErr(...)}` and a fallback UI similar to the GooglePhotosEmbed err state. Match the existing error pattern used for embed failures.
- **Validation:** Manually break a Supabase storage URL (e.g., revoke the file). Confirm the UI shows an actionable "video unavailable" affordance, not a black box.
- **Risk:** Low.

### 3.9 useSupaStore localStorage asymmetry on `expo-exercises`

- **File:line:** `src/useSupaStore.js:142` (write) vs line 118 (read).
- **Symptom:** `expo-exercises` is persisted to localStorage on initial load but excluded from the write-back on saves. The cached copy drifts from server state, then is ignored on next load (line 118 skips parsing trainees/exercises). The write at line 142 is wasted I/O.
- **Root cause:** Two code paths drifted.
- **Fix:** Strip `expo-exercises` from the write at line 142 (mirror line 118's exclusion). Supabase is the source of truth.
- **Validation:** Confirm localStorage no longer carries an `expo-exercises` entry after a save. Verify exercise reads still work.
- **Risk:** None.

---

## 4. PERFORMANCE WINS

Ranked by impact / effort.

### 4.1 Google Fonts blocked by CSP — Heebo never loads (HIGH impact)

- **File:line:** `vercel.json:19` (CSP `style-src` and `font-src`) vs `index.html:29-31` (Google Fonts link tags).
- **Symptom:** Production CSP rejects `https://fonts.googleapis.com/css2?family=Heebo...` (style-src lacks the domain) and `https://fonts.gstatic.com` (font-src lacks the domain). Every Hebrew user is currently seeing a system-font fallback, drifting from the Nord + Heebo design baseline.
- **Root cause:** CSP tightened after the external links were added.
- **Fix:** Two options:
  - **Option A (preferred):** Self-host Heebo woff2 in `/public/fonts/` (mirroring the Nord pipeline). Drop the Google Fonts links from `index.html`. Eliminates the third-party dependency entirely.
  - **Option B (cheaper):** Add `https://fonts.googleapis.com` to CSP `style-src` and `https://fonts.gstatic.com` to `font-src` in `vercel.json:19`.
- **Validation:** After deploy, load `/coach/dashboard` with the Hebrew theme. Open devtools → Network → filter Fonts. Confirm Heebo woff2 loads with status 200 (and no CSP violation reports in console).
- **Risk:** Self-hosting is one-time setup; the existing Nord pipeline already shows the recipe.

### 4.2 7 RLS policies use unwrapped `auth.<function>()` — per-row evaluation

- **Detail:** Per Supabase performance advisor, the following tables have RLS policies that call `auth.<fn>()` directly inside USING/WITH CHECK, causing per-row re-evaluation: `store.auth_presence_rw`, `chat_logs.chat_logs_trainer_select`, `coach_notes.coach_notes_trainer_all`, `coach_tasks.coach_tasks_trainer_all`, `trainee_activity.trainee_activity_trainer_all`, `trainee_evaluations.trainee_evaluations_trainer_all`, `trainee_next_actions.trainee_next_actions_trainer_all`.
- **Symptom:** At low row counts (today: 1-54 rows on each), invisible. At scale (5+ coaches × 50 trainees × months of activity), every RLS-gated read iterates and re-evaluates the JWT.
- **Root cause:** Pattern omits the `(select ...)` wrapper.
- **Fix:** For each policy, drop and recreate with `(select auth.jwt() ->> 'email')` instead of `auth.jwt() ->> 'email'`. Idempotent migration; pattern is `DROP POLICY IF EXISTS ... CREATE POLICY ...`.
- **Validation:** Re-run the performance advisor. Confirm the `auth_rls_initplan` warnings clear.
- **Risk:** Pure rewrite of policy expressions; functional behavior identical.

### 4.3 Multiple permissive policies on `store` table (5x cost)

- **Detail:** `store` table has both `authed_all` and `auth_presence_rw` policies for the same role+action. Per Postgres docs, both policies execute for every row.
- **Symptom:** Doubled RLS evaluation cost on every store read/write. Today negligible (~6 rows); at scale, real.
- **Root cause:** `auth_presence_rw` was added defensively per memory `project_marketing_chat.md` notes, but is now redundant given `authed_all` already covers the case.
- **Fix:** Drop `auth_presence_rw`. Keep `authed_all`. Validate that the per-row check (`key = 'expo-presence' AND auth.uid() IS NOT NULL`) is no longer needed because `authed_all` allows all writes by authenticated users anyway.
- **Validation:** After drop, test presence write from an unauthed session — should be rejected (RLS denies anon). Test from authed — should succeed.
- **Risk:** Memory `reference_production_rls.md` says `authed_all` is intentional today; preserve.

### 4.4 `EX` dictionary unbounded growth

- Covered in 3.7. Performance angle: every plan render walks an ever-growing Map.

### 4.5 Module-level `_gphResolveCache` has no eviction

- **File:line:** `src/ClientPortal.jsx:143`, `src/VideoEmbed.jsx:9`.
- **Symptom:** Long-running PWA sessions retain every resolved Google Photos URL forever. Negligible memory but unbounded in principle.
- **Fix:** Cap at 200 entries with FIFO eviction. Simple `Map.delete(firstKey)` when size > 200.
- **Validation:** None functional — just bounded memory.
- **Risk:** None.

### 4.6 IIFE reading localStorage on every render

- **File:line:** `src/ClientPortal.jsx:182-185`, `src/WorkoutReview.jsx:120-124`.
- **Symptom:** Each render parses the persisted draft from localStorage; wasted CPU during autosave bursts.
- **Fix:** Wrap initial-state reads in `useMemo` with empty deps, or move into the initial-state arg of `useState(() => parse(...))`.
- **Validation:** Profile a typing burst on the StepLogger. Confirm localStorage reads stop after the first render.
- **Risk:** None.

### 4.7 DemoEmbed iframe carries full chrome

- **File:line:** `src/CoachLanding.jsx:312` mounts `/demo/athlete?embed=1`. `DemoTraineePortal` ignores `embed=1`.
- **Symptom:** The iframe on the marketing landing renders the full sticky banner + ClientPortal chrome. Looks busy and adds a few hundred KB of unnecessary rendering inside the iframe.
- **Fix:** Read `URLSearchParams` in DemoTraineePortal; when `embed=1`, hide the sticky banner and thin the ClientPortal header. Pass an `embedded` prop to ClientPortal that suppresses the EXPO logo header.
- **Validation:** Open `/coaches` (or `/demo`), scroll to the embedded preview. Confirm the iframe shows a clean POV without the sticky banner.
- **Risk:** None.

### 4.8 useSupaClientWorkouts swallows load errors silently

- **File:line:** `src/useSupaStore.js:225-244` (and parallel hooks `useSupaBwLog`, `useSupaWeeklyFocus`).
- **Symptom:** When the user is offline at load time, they see an empty workout list with no indication anything failed.
- **Fix:** Add `loadError` state and either return it or emit via `emitSaveError({key, op: 'load', msg: e?.message})` so SaveErrorToast catches it.
- **Validation:** Disconnect network and load the trainee detail. Confirm a toast surfaces.
- **Risk:** None.

### 4.9 9 unused indexes on dormant tables (LOW)

- **Detail:** Per advisor: `idx_client_workouts_reviewed_at`, `chat_logs_site_idx`, `intake_submissions_trainee_id_idx`, `intake_submissions_token_idx`, `coach_notes_pinned_idx`, `coach_notes_recent_idx`, `coach_tasks_status_priority_idx`, `coach_tasks_assignee_idx`, `coach_tasks_due_date_idx`, `coach_notes_linked_plan_idx`, `coach_notes_auto_kind_idx`.
- **Symptom:** No measurable impact today (write amplification negligible at this scale). The advisor flags them because they're not yet used by any query plan.
- **Root cause:** Tables are dormant (`coach_tasks` 0 rows, `intake_submissions` 0 rows) or queries haven't exercised them yet.
- **Fix:** Keep them. Re-evaluate in 90 days. The cost of dropping and re-adding later exceeds the cost of carrying them.
- **Validation:** N/A.
- **Risk:** None.

### 4.10 No `client_id` index on `client_workouts` or `bw_logs`

- **Detail:** Both tables filter heavily by `client_id` but only have `pkey` + (for client_workouts) `reviewed_at` indexes. The `bw_logs_client_block_week_uniq` UNIQUE on `(client_id, block_name, week)` does provide some client_id coverage but a single-column index on `client_id` would help all the `select * where client_id = X` paths.
- **Symptom:** At 20 rows, irrelevant. At 200 trainees × 1000 workouts each, sequential scans become real.
- **Fix:** Add `CREATE INDEX IF NOT EXISTS idx_client_workouts_client_id ON client_workouts(client_id, created_at DESC);` and similar for bw_logs.
- **Validation:** EXPLAIN ANALYZE on a typical query confirms index use after creation.
- **Risk:** None.

---

## 5. UX GAPS

### 5.1 Card-strip rhythm contradicts itself

- **Files:** `src/ui.jsx:111-120` (RefinedHeaderStrip primitive), `src/ui.jsx:285-290` (SectionLabel — fontSize 11, letterSpacing 0.04em), memory `feedback_uniform_card_strips.md` (commit fd84bf9 — strip text fontSize 13, letterSpacing 0.04em, weight 700, uppercase).
- **Symptom:** Two competing patterns coexist. The newer SectionLabel uses 0.04em + 11px; the binding memory rule says 13px + 0.04em; many surfaces still hand-roll the old 0.18em + 9-11px pattern (per cross-cutting audit, 216 raw `letterSpacing:'0.18em'` occurrences in src/).
- **Root cause:** A redesign that touched SectionLabel never swept the broader codebase.
- **Fix:** Commit to one rule. The latest memory entry (after commit `fd84bf9`) says fontSize 13 + 0.04em + 700 + uppercase. Either:
  - **Option A:** Sweep all hand-rolled strip headers (B1.1 / B1.2 / B1.3 below) to match the canonical, and align SectionLabel's defaults to the same.
  - **Option B:** Keep SectionLabel for "small caps heading above a stat" and reserve the canonical only for actual cyan strips.
- Confirm with Ohad which is preferred (see section 14 OPEN QUESTIONS).
- **Validation:** Visit `/coach/dashboard`, `/coach/trainees`, `/coach/programs`. Every card header strip should render identical typography. Use chrome-devtools `getBoundingClientRect` on the strip text to verify.

### 5.2 Hand-rolled cyan strip in DashboardView Payment summary

- **File:line:** `src/DashboardView.jsx:525-527`.
- **Symptom:** Inline `<div style={{background:'var(--c-sf)', padding:'8px 20px', borderBottom:'1px solid rgba(0,0,0,0.10)'}}>` instead of `<RefinedHeaderStrip>`. Strip text uses `fontSize:10, letterSpacing:'0.10em'` — both off-spec.
- **Fix:** Wrap card in `<Card header={...}>` from `src/ui.jsx`, or substitute the inline div with `<RefinedHeaderStrip padY={14} padX={20}>`. Bump strip text to canonical params.
- **Validation:** Compare visually with neighboring dashboard cards. Confirm rhythm.

### 5.3 Hand-rolled cyan strip in ExercisesView filter card

- **File:line:** `src/ExercisesView.jsx:49-54`.
- **Symptom:** Inline cyan-strip div with `padding:'8px 14px'`, label `fontSize:11, letterSpacing:'0.08em'`. Tracking is 0.08em vs canonical 0.04em.
- **Fix:** Replace with `<RefinedHeaderStrip>` or migrate the wrapper to `<Card header={...}>`.
- **Validation:** Visual.

### 5.4 ActivityFeed hand-rolls header (TraineeCRM)

- **File:line:** `src/TraineeCRM.jsx:102-117`.
- **Symptom:** ACTIVITY card uses `fontSize:9, letterSpacing:'0.18em', color:tm` — legacy "tiny-label" pattern. Neighbor sections (Athletic Evaluation, NEXT ACTIONS) use RefinedHeaderStrip. Rhythm break.
- **Fix:** Wrap in `<RefinedHeaderStrip padY={14} padX={14}>` with canonical title style.
- **Validation:** Visit `/coach/trainees/tr_amit`. Confirm ACTIVITY header matches Athletic Evaluation and NEXT ACTIONS visually.

### 5.5 NotesWidget non-compact header breaks rhythm

- **File:line:** `src/NotesWidget.jsx:165-176`.
- **Symptom:** The `/coach/tasks` route uses non-compact mode, which renders a baseline `<div>` with fontSize:10, letterSpacing:'0.18em' — same legacy style. Compact mode (Dashboard) uses RefinedHeaderStrip correctly.
- **Fix:** Always render the cyan strip header. Mode difference should be inner layout only.

### 5.6 CoachTasksView title `<h2>TASKS</h2>` not in strip vocabulary

- **File:line:** `src/CoachTasksView.jsx:18-23`.
- **Symptom:** `/coach/tasks` route shows a bare `<h2>` page title above the NotesWidget.
- **Fix:** Delete the `<h2>` and let NotesWidget's header act as the section title (after 5.5 is fixed), or wrap the whole route in a Card with the canonical strip.

### 5.7 Modal lacks Escape + focus trap + ARIA

- **File:line:** `src/ui.jsx:350-359`.
- **Symptom:** Modal has no `onKeyDown` Escape handler, no `role="dialog"`, no `aria-modal="true"`, no focus trap. Only the close-button (✕) closes it. Per-modal Escape handlers exist in ExerciseSubstitution.jsx:50, PlansView.jsx:116, TraineePRsView.jsx:279 — each consumer reinvents it.
- **Fix:** Inside `Modal`: `useEffect` listening for Escape, `role="dialog"`, `aria-modal="true"`, `aria-labelledby={titleId}`, initial-focus + restore-focus on close. Apply once and remove redundant handlers in consumers.
- **Validation:** Open any modal. Press Esc — expect close. Tab through — focus should stay inside. Click outside — already works.

### 5.8 Icon-only buttons missing aria-label across the codebase

- **Files:** `src/ui.jsx:51, 55, 357`, `src/PlansView.jsx:150`, `src/PlanDiff.jsx:279`, `src/WorkoutReview.jsx:1389`, `src/ClientPortal.jsx:1559`, `src/RefinedActionButton` (`ui.jsx:265-272`).
- **Symptom:** Icon-only buttons use `title=` (hover-only, not announced by screen readers).
- **Fix:** Add `aria-label={label || title}` to `Btn`, `RefinedActionButton`, Modal close. Replace `title` with both `title` AND `aria-label` everywhere on icon-only buttons.

### 5.9 C.ac on white card body fails 4.5:1 contrast

- **Detail:** `Btn` primary variant (`ui.jsx:26`) uses `color: C.ac` on white card body. `#39BDFF` on white is 2.7:1 — fails WCAG AA body. Passes 3:1 for large/bold (Btn is 11px/700 uppercase — qualifies).
- **Detail:** `acText` is defined in `theme.js:34` as the AA-safe variant, but `grep "acText"` returns zero importers.
- **Fix:** Use `C.acText` for cyan body text < 14px on white. Sweep `color: C.ac` callers on light-mode-rendered surfaces.

### 5.10 Lead/intake delete uses blocking `window.confirm()` — iOS PWA blocked

- **Files:** `src/DashboardView.jsx:142`, `src/IntakeView.jsx:141`, `src/WaitlistView.jsx:127`.
- **Symptom:** On iOS PWA, the native `confirm()` dialog is blocked or unreliable. `confirmToast()` in `src/ui.jsx:394-409` is the existing replacement.
- **Fix:** Replace `if (!confirm(...))` with `await confirmToast(...)` in each site.

### 5.11 Inconsistent button labels for the same action

- **Symptom:** "Preview portal" action surfaces as: `PORTAL` (TraineesView.jsx:457, 504), `👁 Portal` (TraineeDetail.jsx:261), generic ActionIcon kind="eye" (PlansView).
- **Fix:** Standardize on `PORTAL` (uppercase). Apply consistently across all preview-portal affordances.

### 5.12 Sticky mobile CTA points to wrong target

- **File:line:** `src/CoachLanding.jsx:739-742`.
- **Symptom:** Sticky bar says `TRY THE ENGINE` but links to `/demo/coach` (CoachDemo, not the engine).
- **Fix:** Change `href="/demo/coach"` → `href="/try"`.

### 5.13 TrySandbox POVBanner exits the engine

- **File:line:** `src/TrySandbox.jsx:881, 887`.
- **Symptom:** Banner advertises COACH/ATHLETE toggle for "the same engine" but COACH leaves the engine entirely and lands in `/demo/coach` (the coach tour).
- **Fix:** Either point COACH to `/try?pov=coach` and re-enable the `pov='coach'` branch in TrySandbox, or remove the toggle entirely. Whichever stays must match the memory description in `project_expo_app_marketing.md:80-82`.

### 5.14 goPrev from `pre` step with zero warmups crashes

- **File:line:** `src/ClientPortal.jsx:689`.
- **Symptom:** On plans with no warmups, tapping Back on the Pre-Workout Check sets `step=null` which renders an empty page.
- **Fix:** Hide the Back button on `pre` when `wuCount === 0`, or change the fallback to `onBack()` to exit the StepLogger.

### 5.15 `plansLoadError` not cleared when clientId changes

- **File:line:** `src/ClientPortal.jsx:1242`.
- **Symptom:** Switching clients leaves the red banner from a previous client's failed plan load.
- **Fix:** Add `setPlansLoadError(null)` in the `!ci` early-bail branch.

### 5.16 Inline auto-task target_kind miscategorization

- **File:line:** `src/autoTasks.js:269-274` + sync at 451-461.
- **Symptom:** `new_intake_pending` tasks land in `target_kind='general'` because `s.trainee_id` is typically null pre-onboarding. The NotesWidget INTAKE filter pill never surfaces them.
- **Fix:** Let `detect()` return optional `target_kind`. Have `new_intake_pending` return `target_kind: 'intake', target_id: s.id`. Sync prefers `d.target_kind` over the fallback ternary.

### 5.17 at_risk_silent hysteresis chatter

- **File:line:** `src/autoTasks.js:217` (resolve threshold).
- **Symptom:** Task flips open/done as the activity threshold crosses 14d.
- **Fix:** Hysteresis — detect at ≥21d, resolve at <14d. Or widen resolve threshold so the just-resolved task doesn't immediately re-fire.

### 5.18 at_risk_silent / payment_overdue resolve uses target_id, not auto_ref

- **File:line:** `src/autoTasks.js:217` + sync L475.
- **Symptom:** Today coincidentally works because target_id === auto_ref. Brittle for future rule authors.
- **Fix:** Resolve returns `row.auto_ref` explicitly, not target_id. Update both rules.

### 5.19 SectionLabel + binding rule conflict

- See 5.1. This is the meta-finding; 5.2-5.6 are instances.

---

## 6. BILINGUAL / RTL ISSUES

### 6.1 Zero `dir="rtl"` wrappers across src/

- **Files:** 16 files contain Hebrew strings; none wraps them in a `dir="rtl"` container.
- **Symptom:** Browser auto-bidi works for most one-liners but breaks for mixed-content (Hebrew + numbers/punctuation/Latin). Visible bidi reorder bugs in NotesInline, EvaluationEditor, ClientPortal headers.
- **Hot spots:**
  - ClientPortal: many `← Back` Hebrew-context buttons, no wrapper.
  - IntakeForm: `dir === 'rtl' ? ... :` switches strings but the outer wrapper never receives `dir={dir}`.
- **Fix:** Add `dir="rtl"` to the ClientPortal page wrapper when the active trainee's locale is HE. Add `dir={dir}` to IntakeForm's top container in every phase branch.
- **Validation:** Open `/intake/he?t=<token>` and confirm the whole form flows RTL — error messages on the right, page scrollbar where expected, mixed content reads correctly.

### 6.2 Free-text inputs/textareas missing dir="auto"

- **Files:** `src/NotesInline.jsx`, `src/NotesWidget.jsx`, `src/TraineeCRM.jsx`, `src/EvaluationEditor.jsx`.
- **Symptom:** When a coach types Hebrew into a free-text field with no `dir`, cursor jumps LTR-first.
- **Fix:** Add `dir="auto"` to every textarea/input that accepts Hebrew.

### 6.3 CoachLanding `dir` reset to LTR unconditionally on unmount

- **File:line:** `src/CoachLanding.jsx:442-449`.
- **Symptom:** Navigating `/demo/he → /intake/he` resets `<html dir>` to `ltr`; IntakeForm doesn't set it.
- **Fix:** Capture previous `dir` on mount, restore on unmount.

### 6.4 Session-notes textarea uses textAlign:center only — Hebrew renders LTR

- **File:line:** `src/ClientPortal.jsx:851`.
- **Symptom:** Hebrew text in the final session-notes textarea renders LTR with mixed punctuation.
- **Fix:** Mirror the Hebrew-detection used at line 1009 (`dir="auto"` or active `direction:'rtl'`).

### 6.5 Hebrew gender-default in CoachLanding waitlist success copy

- **File:line:** `src/CoachLanding.jsx:160` — `'✓ אתה ברשימה. אני אשלח לך מייל...'` (male default).
- **Fix:** Use `'את/ה ברשימה'` for parity with the rest of the form's gender-neutral pattern. Most other strings in the file already do `מאמן/ת` etc.

### 6.6 Forward-CTA arrows — verified compliant

- Pass clean. `src/CoachLanding.jsx:41, 50-51, 64-65, 164` all place `←` at logical end of Hebrew strings. Memory rule respected.

---

## 7. MOBILE / PWA ISSUES

### 7.1 Tap-target sizes below 44px iOS guidance

- **Files:** `src/ClientPortal.jsx:1126-1133` (Replace/Remove `padding:8` → ~32px), `src/ClientPortal.jsx:1559` (BW delete × ~20px), checkbox columns (`width:18 height:18` in 32px column).
- **Fix:** Bump padding so each touch target reaches ≥44px square.

### 7.2 Fixed-width modals overflow 360px

- **Files:** `src/TraineeDetail.jsx:608, 596, 604`, `src/TraineesView.jsx:608` — `width: 420` / 380 with no maxWidth.
- **Fix:** Add `maxWidth: 'calc(100vw - 32px)'`.

### 7.3 SmartImportView grid no flex collapse

- **File:line:** `src/SmartImportView.jsx:421`.
- **Symptom:** `gridTemplateColumns: '1fr 1fr 1fr auto'` on the file-control bar with no `@media` collapse; below readability on 360px.
- **Fix:** Use `gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))'`.

### 7.4 Missing maskable 192px PWA icon

- **File:line:** `vite.config.js:32-36`.
- **Symptom:** Only `icon-maskable-512.png` declares `purpose: 'maskable'`. Android adaptive-icon devices that prefer maskable will downscale the 512.
- **Fix:** Generate `icon-maskable-192.png` (mirror the 512 pipeline) and add to the manifest icons array.

### 7.5 start_url=`/portal` has no SPA handler

- **File:line:** `vite.config.js:30` + `vercel.json:4`.
- **Symptom:** Launching the installed PWA loads `/portal` which is rewritten to `/index.html`. AuthGate has no `/portal` branch; the URL persists but doesn't drive routing. AuthGate falls into the `replaceState(null, '', '/')` path on line 121.
- **Fix:** Change `start_url` to `/` in `vite.config.js:30`. Or add explicit `/portal` handling in App.jsx so the URL has meaning.

### 7.6 No SSE heartbeat / 10s timeout on Hobby

- Covered in 2.9.

### 7.7 Offline queue replay tolerance

- Covered in 3.2.

---

## 8. BUSINESS-LOGIC INCONSISTENCIES

### 8.1 Multi-tenant exposure on coach-rendered "Ohad" strings

- Covered in 1.7. Listed here for completeness.

### 8.2 BILLING one-time migration unconditional

- Covered in 3.4.

### 8.3 Substitution test emails hardcoded

- Covered in 1.8.

### 8.4 Plan couple-suffix LIKE policy leak edge case

- Covered in 2.15.

### 8.5 at_risk_silent hysteresis

- Covered in 5.17.

### 8.6 ruleWeekMissed can resolve on different plan's workout

- **File:line:** `src/autoTasks.js:151-165`.
- **Symptom:** If a trainee has two active plans (rare — main block + accessory), a workout logged for plan B at week ≥ wNum will resolve a `week_missed` task created for plan A.
- **Root cause:** Resolve key is `target_id` (trainee), not `(trainee, plan_id)`.
- **Fix:** Match resolve against `w.planName === planName` where planName is parsed from the auto_ref (or carry plan name in the body).

### 8.7 Pain rules + biomechanics (Pass clean)

- CLAUDE.md mandates pain ≥6 = stop. No UI surface in scope actively gates on pain values today (no in-app pain entry UI was found). When that ships, the rule applies.
- VAT calculations: grep of `0.8475` / `1/1.17` / `* 1.18` / `/ 1.18` / `* 0.82` returned no hits across src/. No VAT math anywhere. Pass clean.
- Exercise taxonomy: `src/theme.js:67-75` matches CLAUDE.md exactly. Pass clean.
- Couple-aware data scoping: `traineeIdsFor()` from `traineeUtils.js` is referenced in TraineeDetail and Dashboard roll-ups. Pass clean structurally; verify via 8.4 fix.

---

## 9. CODE HYGIENE

### 9.1 Dead files to delete

- `src/Dashboard.jsx` — 22-line orphan, zero inbound imports across src/. Was replaced by `DashboardView.jsx` (lazy-imported in `App.jsx:26`). File is truncated mid-function; would error if anything ever imported it. **Action:** `git rm src/Dashboard.jsx`.

### 9.2 Dead branches in CoachDemo and TrySandbox

- `src/CoachDemo.jsx:2335-2466` — `_DemoReviewLegacy` defined but never imported/exported (~130 lines).
- `src/CoachDemo.jsx:2828-2834` — always-mounted iframe hack with stale comment.
- `src/TrySandbox.jsx:56-61` — comment marks `pov="coach"` branches as dead; the `BuyCallToAction` default `pov="coach"` is misleading.
- **Action:** Delete `_DemoReviewLegacy`. Strip the always-mounted iframe comment + render Review conditionally. In TrySandbox, change `BuyCallToAction({ pov = 'trainee' })` default to match the actual mount conditions and delete unused `isCoach` branches across POVBanner/ExercisePicker/UploadStep/AnalyzeStep/CompareStep/NextStepPanel (~200 lines).

### 9.3 Vestigial role resolution in AuthProvider

- **File:line:** `src/auth.jsx:19-71`.
- **Symptom:** `AuthProvider` resolves a `role` and `clientId` from `clientList`, but `App.jsx:73` passes `clientList={[]}` permanently. Real role resolution happens later in AuthedApp's `useMemo(clientTrainee)` (line 251).
- **Action:** Strip `resolveRole` + `role` + `clientId` state from AuthProvider; reduce its API to `{ session, user, loading, signOut }`.

### 9.4 console.log left in production code

- **File:line:** `src/ClientPortal.jsx:554` — `console.log(`Compressed: ${...}MB → ${...}MB`)`.
- **Action:** Remove or gate behind a `__DEBUG__` flag.

### 9.5 Dead state and variables

- `src/DashboardView.jsx:183` — `const pList = Array.isArray(planCounts) ? [] : [];` never referenced.
- `src/TraineeCRM.jsx:227` — accepts `onOpenTasksTab` prop but never uses it. Remove from the call site at `src/TraineeDetail.jsx:335`.
- **Action:** Delete each.

### 9.6 State mutation during render

- `src/WorkoutsView.jsx:79` — `if (!w) { setActiveWorkout(null); return null; }` writes state during render.
- `src/WorkoutReview.jsx:1530` — same pattern: `if (!wo) { setSelectedWo(null); return null; }`.
- **Action:** Move each to a `useEffect` that runs when the value changes and is missing.

### 9.7 WorkoutsView filter does not exclude Archived

- **File:line:** `src/WorkoutsView.jsx:96`.
- **Symptom:** Filter dropdown shows all trainees including Archived. Compare to TraineesView which filters Archived.
- **Fix:** Add `.filter(t => t.status !== 'Archived')` to the trainees source.

### 9.8 useAutosave unmount cleanup re-fires on every enqueue identity change

- **File:line:** `src/hooks/useAutosave.js:99-103`.
- **Symptom:** Under StrictMode, the cleanup fires twice.
- **Fix:** Wrap enqueue in a ref so the cleanup-only effect uses `[]` deps.

### 9.9 Hardcoded SUPA_URL + publishable key duplicated

- **Files:** `src/CoachLanding.jsx:30-31`, `src/CoachChat.jsx:15-16`, `src/ClientPortal.jsx:456-457`.
- **Action:** Move to `src/supabase.js` as exported constants and import.

### 9.10 setNote._t timer keyed globally not per-id

- **File:line:** `src/WaitlistView.jsx:114-116`.
- **Symptom:** Two notes typed concurrently — timer from note A is cleared and only note B persists.
- **Fix:** Use `useRef({})` map keyed by note id.

### 9.11 reload functions miss cancellation flags

- **Files:** `src/IntakeView.jsx:100`, `src/ChatAuditView.jsx:39-60`, `src/WaitlistView.jsx:75-103`.
- **Symptom:** `setState` fires on unmounted component on slow loads.
- **Fix:** Add `let cancelled = false` in each `useEffect`, bail before setters.

### 9.12 Optimistic mutations in SmartImportView

- **File:line:** `src/SmartImportView.jsx:283-300`.
- **Symptom:** Bounded-concurrency worker mutates `transform.items[i].videoLink` in place. Retries double-resolve.
- **Fix:** Build a new resolved array and pass to upsert; leave `transform` immutable.

### 9.13 console.error errors are silent on the server

- **File:line:** `src/ErrorBoundary.jsx:27`.
- **Symptom:** Client-side crashes log to console only; Vercel doesn't capture them.
- **Fix:** Wire a POST to `/api/log-error` (new endpoint) or use Vercel Web Analytics events. 5-line addition.

### 9.14 Pass clean

- No `TODO`/`FIXME`/`XXX`/`HACK` markers in src/ or api/.
- No `cure` / `diagnose` in src/ or api/. The literal word "fix" appears only in commit messages and dev comments, never in user-facing copy.
- VAT math: pass clean (no occurrences).

---

## 10. SCHEMA HYGIENE

### 10.1 Indexes to add

- **Add `idx_client_workouts_client_id` on `client_workouts(client_id, created_at DESC)`** — see 4.10.
- **Add `idx_bw_logs_client_id` on `bw_logs(client_id, date DESC)`** — same shape.

### 10.2 Indexes to drop (none right now)

- The 9 unused indexes flagged by the advisor should be kept. They support queries that will exercise them once tables fill. See 4.9.

### 10.3 Columns unreferenced (informational only)

- Suggest running an audit query in 90 days to identify columns truly unused by code. Today's coverage is high; nothing flagged.

### 10.4 Tables dormant

- `coach_tasks` (0 rows) — semantic dormant per consolidation.
- `trainee_next_actions` (0 rows) — dormant per consolidation.
- `trainee_activity` (0 rows) — dormant; CRM activity feed derives from workouts/payments/plans/completed-tasks in JS, not from this table.

**REQUIRES_CONFIRMATION:** Drop these tables (with a cleanup migration), or keep them dormant in case the original CRM/Tasks design comes back? See section 14.

### 10.5 RLS policies to tighten

- All 6 hardcoded-email policies (`coach_notes_trainer_all`, `coach_tasks_trainer_all`, `trainee_activity_trainer_all`, `trainee_evaluations_trainer_all`, `trainee_next_actions_trainer_all`, `chat_logs_trainer_select`) — wrap in `(select auth.jwt()...)` per 4.2. Also migrate to `is_trainer()` once multi-tenant lands.
- `chat_logs_trainer_select` — change role from `{public}` to `{authenticated}` per 2.5.

### 10.6 Function search_path mutable

- 5 functions — per 2.1. Migration adds `SET search_path = public, pg_temp` to each.

### 10.7 SECURITY DEFINER anon revokes

- 6 functions — per 2.2.

### 10.8 Duplicate permissive policies on store

- `auth_presence_rw` redundant with `authed_all` — drop per 4.3.

### 10.9 form-videos public bucket listing

- One of two SELECT policies redundant — drop per 2.3.

---

## 11. INTEGRATION CHECKS

| Integration | Status | Action |
|---|---|---|
| Anthropic chat (Sonnet 4.6 + ephemeral cache + session memory) | Working | Add SSE heartbeat + maxDuration config (2.9) |
| Smart Import (Opus 4.7, tool loop, 5 tools) | Working with security gaps | Require auth (2.7), enforce body cap (2.8), lower MAX_HOPS to 5 (cost ceiling) |
| Resolve-video (Google Photos OG extraction) | SSRF defenses tight | Add rate limit + response body cap (2.10) |
| Capture (lead enrichment 2-stage Haiku) | Working | Add rate limit + dedup before enrichment (2.11) |
| Chat-health probe | Minimal, working | Pass clean |
| Vercel deploy (GitHub auto-deploy on master) | Working | Pass clean |
| Supabase MCP (apply_migration + execute_sql) | Working | Pass clean — use for tomorrow's migrations |
| PWA service worker (idle-only auto-update) | Compliant | Pass clean per `feedback_pwa_sw_auto_update_idle_only` |
| Chrome devtools MCP (relaunched-Chrome trick) | Available | Use per `feedback_browser_attach` for live verifications |
| Vercel MCP | Limited (403 on team) | Use chat-health probe for env-var verification per `reference_supabase_vercel_mcp` |
| Vercel Analytics | Wired (`@vercel/analytics` mounted) | Confirm Web Analytics is enabled in Vercel project settings; per `project_expo_il_state`, this is the dashboard knob that gates retention |
| Google Fonts CDN | **Blocked by CSP** | Self-host Heebo OR widen CSP per 4.1 |
| Vercel runtime cache / Upstash Redis | Not installed | Install via Marketplace for durable rate limiting (2.6, 2.10, 2.11) |

---

## 12. MEMORY HYGIENE

Per the memory hygiene pass, the index `MEMORY.md` carries stale entries and the system has 13 retire-candidates plus 5 gaps in coverage.

### 12.1 Files to RETIRE (delete from MEMORY.md and from disk if uncontroversial)

- `project_next_session_queue.md` — superseded by resume_2026_05_14.
- `project_athlete_side_polish_local.md` — superseded; athlete polish ships freely.
- `project_resume_2026_05_13.md` — superseded by resume_2026_05_14.
- `project_resume_mission_2026_05_12.md` — superseded twice.
- `project_hover_preview_recolor.md` — self-marked RESOLVED.
- `project_next_big_initiatives.md` — A/B/C all shipped (per commits 9cb933a, 4a02ba9, 1b136b5).
- `project_amit_block17_videos_verified.md` — one-shot.
- `project_omer_block8_shipped.md` — one-shot.
- `project_roey_block25_shipped.md` — one-shot.
- `project_yuval_alpha_state.md` — one-shot.
- `project_amit_comment_recovery.md` — resolved.
- `project_white_theme_spec.md` — superseded by light_theme_shipped.
- `project_tomorrow_design_queue.md` — superseded.
- `project_multi_tenant_first_task.md` — consolidate into audit.
- `project_audit_fixes_local_branch.md` — historical (keep file as archive; drop MEMORY.md entry).
- `project_coach_light_mode_shipped.md` — historical (keep file; drop entry).
- `project_demo_coach_parity.md` — historical (keep file; drop entry).

### 12.2 Files to UPDATE

- `MEMORY.md` — front-door references stale files. Top entry should be `project_resume_2026_05_14.md`. The `feedback_uniform_card_strips.md` blurb in the index has the old numbers (fontSize 11 + 0.18em); update to `fontSize 13, FN 0.04em uppercase 700` per commit fd84bf9.
- `reference_anthropic_api_key.md` — drop the dollar balance line (point-in-time).
- `reference_production_rls.md` — schema state outdated; add the 6 NEW tables and their hardcoded-email policy pattern.
- `project_marketing_chat.md` — model line is stale (says "claude-haiku-4-5-20251001 everywhere"; actually api/chat.js uses Sonnet 4.6).
- `project_multi_tenant_audit.md` — 7 original BLOCKERs + 6 new hardcoded-email RLS policies. Total 13.

### 12.3 NEW memory entries to write after tomorrow's session

These don't yet exist; write them to `.claude/projects/.../memory/` after the audit-execution session lands:

1. `reference_ultrathink_audit_pattern.md` (reference) — the multi-pass ultrathink prompt recipe Ohad ran today. When to reuse vs. when `reference_full_audit_prompt.md` is enough. Saved prompt path. Cite this audit's filename.
2. `project_ultrathink_audit_executed_2026_05_14.md` (project) — completion record. List BLOCKERs found, what shipped, what was deferred, acceptance-test pass/fail. Replaces resume_14 as the new front-door.
3. `reference_auto_tasks_engine.md` (reference) — the 7-rule contract: `detect()`/`resolve()` shape, idempotency via `auto_kind + auto_ref` unique partial index, the `<14d skip` for `at_risk_silent`, where to add rule #8. Pairs with the hysteresis fix from 5.17.
4. `reference_crm_activity_derivation.md` (reference) — `crmData.js` contract: `deriveAutoEvents` merging workouts + plans + payments + completed-tasks; cadence-pill thresholds; `useCompletedTasksForTrainee` join logic.
5. `reference_athletic_evaluation_model.md` (reference) — BHBC-transcribed eval schema: 5 sections + ROM block, sided/composite/sided-composite scoring, longitudinal model on `trainee_evaluations`, click-to-expand contract.

Optional 6th: `feedback_<emergent>.md` if tomorrow's work surfaces a clear new binding rule.

### 12.4 Verify CLAUDE.md brand color

- CLAUDE.md `accent #3BA0FF` vs `src/theme.js` line 2 comment `#39BDFF (EXPO Blue)` and `feedback_expo_brand_identity_in_themes` `#39BDFF`.
- **REQUIRES_CONFIRMATION:** Which is canonical? Three sources agree on `#39BDFF`; CLAUDE.md is the outlier. Recommend updating CLAUDE.md to `#39BDFF`.

---

## 13. ACCEPTANCE-TEST SUITE

Run this checklist at the END of tomorrow's session. Every box must be testable; no abstract claims like "the code is clean." Organized by surface.

### Auth & Routing

- [ ] Sign in as `ohadyproductions@gmail.com` / `1234`. Confirm landing on `/coach/dashboard`.
- [ ] Sign out. Confirm landing on `/login` (or `/` EntryChooser per browser/PWA mode).
- [ ] Sign in as a dual-role account. Confirm RolePickerScreen renders.
- [ ] Pick "Coach" from picker. Confirm `/coach/dashboard` loads and Portal-mode logo click-back works.
- [ ] Pick "Client" from picker. Confirm `/athlete` loads and the EXPO logo in the header switches role back to coach when clicked.
- [ ] In a single tab, browser-back from `/try` to `/coach/dashboard`. Expect no React warning, no ErrorBoundary fallback.
- [ ] Browser back/forward across `/demo/coach → /demo/athlete → /try`. Expect no hook-count error in console.
- [ ] Sign in via Google OAuth. Confirm session persists across browser close + reopen (localStorage migration).
- [ ] Sign out clears session. Confirm reopening browser does NOT auto-sign-in.
- [ ] PWA install flow on Android (or iOS Share → Add to Home Screen). Confirm `start_url` opens to portal/login as expected.

### Dashboard

- [ ] Open `/coach/dashboard`. Confirm cards render: TASKS (top), Athletes table, KPI tiles, Overdue/Dormant strips.
- [ ] TASKS card uses canonical cyan strip (fontSize 13, letterSpacing 0.04em, uppercase, weight 700, white-on-cyan).
- [ ] Open count on TASKS pill matches `.filter(status !== 'done').length`, not total.
- [ ] Filter pills (ALL / TRAINEE / INTAKE / GENERAL) match open-count, not total.
- [ ] Auto-task engine runs on mount. For each of the 7 rules with applicable signals, confirm tasks appear.
- [ ] Mark an auto-task done. Confirm the corresponding `auto_kind+auto_ref` is honored — same condition does NOT re-create on next mount.
- [ ] Click "→ NEW PROGRAM" on a trainee-tagged task. Plan editor opens. Save the plan. Confirm task auto-marks done.
- [ ] Force `markTaskCompletedByPlan` to fail (e.g., RLS test). Confirm an actionable retry affordance surfaces.

### Trainees (list + detail)

- [ ] Open `/coach/trainees`. Confirm trainee cards render with cyan strip header, payment status pill, plan count.
- [ ] Filter by status. Archived hidden by default.
- [ ] Open a trainee card. Confirm Athletic Evaluation, NEXT ACTIONS, Vitals, ACTIVITY, BW chart, Recent Workouts, Assigned Programs all render with canonical cyan strip rhythm.
- [ ] On a trainee with no workouts logged, cadence pill shows NO SESSIONS LOGGED.
- [ ] Click PORTAL on a trainee. CoachPreviewPortal opens in demo mode. Confirm no Supabase writes fire during preview navigation.
- [ ] Edit a trainee. Save. Confirm autosave draft cleared.
- [ ] Edit a trainee. Click Cancel. Confirm draft cleared (not persisted as ghost).
- [ ] Delete a trainee. Confirm `confirmToast` modal (not native `window.confirm`).
- [ ] Couple trainee `tr_neta_tom`: confirm member sub-cards render correctly.
- [ ] Couple trainee `tr_moshe_dana`: confirm members program independently (not mirrored).

### Programs

- [ ] Open `/coach/programs`. Confirm list renders grouped by athlete. Sort order is current-block-first.
- [ ] Open a plan editor. Confirm cyan strip header on Day cards.
- [ ] Edit a row's sets/reps/load. Save. Confirm autosave indicator fires.
- [ ] Toggle COMPARE. Confirm side-by-side layout. Pattern Coverage charts on both sides align.
- [ ] OVERVIEW grid: confirm # column / EXERCISE column / SUPERSET column baseline-align (use getBoundingClientRect to verify pixel parity).
- [ ] Switch program via the in-editor dropdown. Confirm `flushAutosave()` runs before remount.
- [ ] Preview a program via PORTAL button. Confirm CoachPreviewPortal renders single-plan mode.
- [ ] Import an XLSX. Confirm trainee-selection modal renders; assign to 2 trainees. Confirm plans appear under both.
- [ ] Hover preview popover — confirm pale-cyan tint + cyan border (per memory `project_hover_preview_recolor`).
- [ ] Open a plan that has wave-load `wk[]` entries. Confirm W1-W4 chips render under the load cell.

### Exercises

- [ ] Open `/coach/exercises`. Confirm library list with category/movement-pattern badges.
- [ ] Filter by category. Confirm filter cyan strip uses canonical params.
- [ ] Edit a library row. Confirm video URL field, cues field, classifications save.
- [ ] Search by Hebrew title. Confirm match (e.g., "סקוואט").

### Tasks (`/coach/tasks`)

- [ ] Open `/coach/tasks`. Confirm full-task view with filter strip (search, assignee, status).
- [ ] Open task expand. Confirm inline edit + notes log + status toggle.
- [ ] Create a new task with `+ NEW TASK FOR <NAME>` quick-create. Confirm `related_kind=trainee` + `related_id` + `related_label` are set.
- [ ] Promote a CRM next-action via → TASK. Confirm migration to `coach_tasks` row.
- [ ] Completed tasks for a trainee appear in that trainee's activity feed.

### Review

- [ ] Open `/coach/review`. Confirm queued workouts list with form-video badges.
- [ ] Open a workout. FormVideoPlayer renders.
- [ ] Pause video. Click COMMENT at a timestamp. Compose box appears, drawing toolbar appears.
- [ ] Draw on the canvas, type a comment. Submit. Confirm comment + drawings persist.
- [ ] Click on a saved comment. Video pauses at that frame, drawings re-render.
- [ ] Resume playback. Drawings hide.
- [ ] Frame-step buttons work.
- [ ] PREV WK row visible on each set inputs card (week 2+).
- [ ] Speed slider 1.5× works on FormVideoPlayer.

### Intake

- [ ] Open `/coach/intake`. Confirm token generator.
- [ ] Generate an initial intake token. Open in incognito at `/intake/he?t=<token>`. Confirm form renders RTL (whole form, not just text).
- [ ] Submit with empty required multichoice. Confirm validation rejects.
- [ ] Submit with bad email (`foo`). Confirm validation rejects.
- [ ] Generate a progress intake. Submit. Confirm `trainee_id` from token resolves server-side, anon cannot override.
- [ ] Generate a physical-assessment intake (third form_type). Submit. Confirm Athletic Evaluation panel surfaces in the trainee card.
- [ ] Token already used: visit `/intake/he?t=<used-token>`. Confirm "this link has been used" message.

### Athlete portal

- [ ] Open `/athlete` as a trainee. Confirm Programs tab loads with active block.
- [ ] Start workout. Confirm warmup → pre-check → first exercise flow.
- [ ] Film a set. Confirm compression toast (file > 15MB → `compressVideoChrome` runs).
- [ ] Tap Remove on a recorded video. Confirm blob URL revoked, IDB entry deleted, no background upload completes.
- [ ] Reload tab mid-upload. Resume. Form video either re-renders from IDB blob OR shows actionable "no video" affordance — never silent black box.
- [ ] Plan with zero warmups: Back from pre-step does NOT crash.
- [ ] BW entry persists per-week. Re-entering same week overwrites.
- [ ] SWAP affordance visible only on template-purchase plans.
- [ ] Substitute an exercise. Confirm alternate scores reasonably (test against "Lat Pulldown" → expect Pull-Up family).
- [ ] Hebrew exercise title renders correctly (no LTR cursor jump in notes).
- [ ] Mobile tap-target ≥44px on Remove, Replace, BW delete (×).

### Demo / Marketing

- [ ] Open `/demo/coach` (CoachDemo). Confirm 6 tabs + sample data + cross-athlete Compare.
- [ ] Open `/demo/athlete` (DemoTraineePortal). Confirm sticky DEMO banner.
- [ ] Try to upload a form video on `/demo/athlete`. Confirm toast "Demo mode — uploads disabled". Confirm no Supabase storage object created.
- [ ] Open `/try` (TrySandbox). Confirm pose detection + rep counter work on a sample clip upload.
- [ ] CoachLanding `/demo`. Sticky mobile CTA points to `/try` (not `/demo/coach`).
- [ ] POVBanner toggle COACH/TRAINEE works as advertised (either stays in engine or takes a clear "see the other POV" route, no exit confusion).
- [ ] CoachLanding waitlist form submits → Supabase `leads` row. Duplicate email → 409 = silent success.
- [ ] Chat widget loads on `/demo`. Send a message. Confirm SSE streams reply.

### Security & RLS

- [ ] As anon: `curl POST /api/chat` 31 times. Confirm 429 on the 31st.
- [ ] As anon: `curl POST /api/smart-import` without Authorization. Expect 401.
- [ ] As anon: `curl /storage/v1/object/list/form-videos`. Expect empty or 403.
- [ ] Apply the search_path migrations. Re-run `mcp__plugin_supabase_supabase__get_advisors` security — confirm function_search_path_mutable cleared.
- [ ] Apply the SECURITY DEFINER revokes. Confirm intake flow at `/intake/he?t=<token>` still works.
- [ ] Apply the `(select auth.jwt()...)` wraps. Re-run advisors performance — confirm auth_rls_initplan cleared.

### Build & Deploy

- [ ] `npm run build` passes. Bare-CSS-fn guard exits 0.
- [ ] Bundle size — eyeball the initial chunk. Should be ≤ ~200 KB gzipped after lazy splits.
- [ ] Push to master. Confirm Vercel deploy succeeds within 15 seconds.
- [ ] After deploy: `curl -sI https://expo-app.co.il/manifest.webmanifest` → 200 + correct MIME.
- [ ] `curl -s https://expo-app.co.il/api/chat-health | jq .ok` → true.
- [ ] PWA install prompt fires after engagement (Android Chrome) — beforeinstallprompt captured.

### Bilingual / RTL

- [ ] `/intake/he?t=<token>` — entire form RTL, error messages on the right, scrollbar where expected.
- [ ] NotesInline textarea — typing Hebrew, cursor stays correctly oriented.
- [ ] CoachLanding HE route `/demo/he` — Hebrew hero, navigation, sections. Page-level `<html dir>` is rtl.
- [ ] Navigate `/demo/he → /intake/he`. After return, `/coach/dashboard` is LTR (dir restored correctly, not stuck rtl).

### Memory

- [ ] After execution, MEMORY.md index updated per 12.1-12.4.
- [ ] 5 new memory files written per 12.3.
- [ ] CLAUDE.md brand color verified (#39BDFF vs #3BA0FF) and corrected.

### Performance

- [ ] Open `/coach/dashboard` with the React Profiler. First commit < 500ms (acceptable for ~25K LOC SPA).
- [ ] EX dictionary growth: monitor over 5 trainee preview navigations. Memory profile in DevTools — confirm no unbounded growth.
- [ ] Hebrew text loads with Heebo woff2 (not system fallback).

### Schema

- [ ] Apply migration: add `idx_client_workouts_client_id` and `idx_bw_logs_client_id`. Confirm advisor flags reduce.
- [ ] Drop `auth_presence_rw` redundant policy on `store`. Confirm presence write from authed client still works; anon rejected.

(Count: 100+ checkboxes covering one acceptance criterion each.)

---

## 14. OPEN QUESTIONS — RESOLVED 2026-05-13

All 13 questions (11 OPEN QUESTIONS + 2 user-report clarifications) answered by Ohad in interactive session. Decisions recorded below — execute according to these answers.

### Q1. Card-strip canonical typography — RESOLVED

**Decision:** `fontSize 13, fontWeight 700, letterSpacing 0.04em, textTransform uppercase, color refined ? '#FFFFFF' : 'var(--c-tx)'` is canonical.

**Ohad's note:** "you choose, whatever fits the eye better visually, easier to read, and fits the brand style better."

**Rationale for the pick:** Commit `fd84bf9` already moved three strips (NotesInline, NotesWidget, TraineeEvaluation) to 13 + 0.04em — the in-flight direction. The 11 + 0.04em SectionLabel reads as soft caption; 13 + 0.04em reads as confident headline, anchors the section visually, matches dashboard tile titles. The 13px choice honors the binding memory `feedback_uniform_card_strips.md` (updated 2026-05-13).

**Execution direction:**
- Update `src/ui.jsx:285-290` SectionLabel default to `fontSize 13, fontWeight 700, letterSpacing 0.04em` (matches strip canonical).
- Sweep the 216 raw `letterSpacing:'0.18em'` occurrences across `src/` — for occurrences inside cyan-strip headers, lift to `0.04em + 13px`. For occurrences NOT in a strip (e.g., small caps labels inside cards), leave at `0.18em + 9-11px` if they read as captions, OR migrate to `<SectionLabel>` for consistency.
- Update memory `feedback_uniform_card_strips.md` index entry to reflect the canonical (already done in commit `fd84bf9`).

### Q2. Dormant tables — RESOLVED: KEEP

**Decision:** Keep `coach_tasks`, `trainee_next_actions`, `trainee_activity` dormant. Do not drop.

**Rationale:** Zero rows → zero storage cost. The original CRM/Tasks design could return. Dropping forces a re-migration; keeping is free.

**Execution:** No action. Skip the cleanup-migration step entirely.

### Q3. Multi-tenant blockers — RESOLVED: DEFER

**Decision:** Strict-defer the TRAINER_EMAILS refactor + 6 hardcoded-email RLS policy migrations until the 5-coach gate per `feedback_other_coaches_scope`.

**Execution:** Section 1.11 BLOCKERs deferred. Section 2 SECURITY items 2.2 (anon revokes) and 2.5 (chat_logs role scoping) still execute — those don't require multi-tenant context. Skip migrations that rewrite hardcoded `'ohadyproductions@gmail.com'` predicates.

### Q4. Heebo font — RESOLVED: SELF-HOST

**Decision:** Self-host Heebo woff2 in `/public/fonts/`. Drop Google Fonts links from `index.html`.

**Execution:**
- Download Heebo weight 300, 400, 500, 700 woff2 from Google Fonts.
- Place under `/public/fonts/heebo-{300,400,500,700}.woff2`.
- Add `@font-face` declarations to `/public/nord-fonts.css` (or a new `heebo-fonts.css`).
- Remove the `<link rel="preconnect" href="//fonts.googleapis.com">` and `<link href="//fonts.googleapis.com/css2?family=Heebo...">` from `index.html`.
- Verify Hebrew text renders with Heebo (devtools → Computed → font-family stack lists Heebo first).
- No CSP changes needed.

### Q5. CLAUDE.md brand color — RESOLVED: CORRECT CLAUDE.md

**Decision:** Update CLAUDE.md from `accent #3BA0FF` → `accent #39BDFF`.

**Execution:** One-line edit in CLAUDE.md, line that defines the design-system token under "Canonical facts."

### Q6. TrySandbox POV banner — RESOLVED: DEFER (code-only, no visible change)

**Decision:** No execution this round.

**Ohad's constraint:** "i don't understand. choose for yourself if it matters (but make sure i don't see any change, this should be code only)."

**Interpretation:** Ohad doesn't recall the issue. The constraint "no visible UI change" rules out both Option A (re-enable pov="coach" inside engine — different click target) and Option B (remove toggle — element disappears). Option C (keep as-is) is the only no-change path; that means the audit finding is acknowledged but not actioned.

**Execution direction:** Skip the fix. Add a one-line comment at `src/TrySandbox.jsx:881` documenting the known divergence between the memory-described "two POVs of one engine" intent and the current "exit to /demo/coach" behavior. Future revisit when Ohad has a screenshot or clearer requirement.

### Q7. BILLING migration — RESOLVED: DELETE entirely + surface root cause

**Decision:** Delete the entire BILLING block at `src/App.jsx:422-441`.

**Ohad's new info (load-bearing):** "the gate is not working probably since it doesn't update (i update it everyday and on the expo-app i don't see any change)."

**Root cause analysis:** The block at `App.jsx:434` runs only when `trainees.some(t => BILLING[t.name] && !t.monthly)` is true — i.e., the migration fires ONLY when some trainee has an EMPTY `monthly` value. After the initial seed (which has long since run), every trainee has a populated `monthly`, so the gate is permanently false. The hardcoded BILLING map at `App.jsx:423-433` is dead code.

**Where Ohad's "daily updates" should go:** The `TraineeDetail` edit modal at `src/TraineeDetail.jsx` is the canonical edit surface for `monthly`, `perSession`, `lastPayment`. Updates here write to Supabase via `useSupaStore(KEYS.trainees)` and propagate immediately. The BILLING map in App.jsx is a stale one-time seeder.

**Execution:**
- Delete the entire useEffect block at `App.jsx:420-441`.
- Confirm with Ohad: he should edit `monthly` / `perSession` / `lastPayment` via the trainee detail page, not by updating a constant in the source code. After the deletion, his daily updates via the UI WILL persist + render correctly.
- If Ohad has been updating the BILLING constant in source code and expecting it to override DB values, that workflow has been broken since the first time the migration ran. Surface this explicitly.

### Q8. Athlete-portal embed mode — RESOLVED: STRIP BANNER + LOGO

**Decision:** When `/demo/athlete?embed=1`, hide both the sticky "DEMO · ATHLETE PORTAL" banner AND the EXPO logo in the ClientPortal header.

**Execution:**
- In `src/DemoTraineePortal.jsx`, read `URLSearchParams.get('embed') === '1'`. When true, suppress the sticky banner.
- Pass `embedded={true}` prop to `<ClientPortal>`.
- In `src/ClientPortal.jsx`, when `embedded`, hide the EXPO logo at the header (likely a CSS suppression of the `<EXPOMark>` block).
- Verify by visiting `/coaches` (or `/demo`), scrolling to the DemoEmbed iframe. Expect a clean POV with no double EXPO branding.

### Q9. Smart-import MAX_HOPS — RESOLVED: KEEP AT 8

**Decision:** Leave `MAX_HOPS = 8` in `api/smart-import.js:712`.

**Execution:** No change to MAX_HOPS. Still execute the OTHER smart-import security/cost fixes from section 2: require auth (2.7), enforce real body cap via Vercel config (2.8). The MAX_HOPS cap alone wasn't the dominant cost driver — auth-gating is more impactful.

### Q10. SECURITY DEFINER anon revokes — RESOLVED: APPLY with verification first

**Decision:** Apply `REVOKE EXECUTE ... FROM anon` on the 6 functions listed in section 2.2, AFTER verifying the intake flow still works.

**Execution:**
1. Note the current function list anon-callable per advisor: `current_client_id`, `current_trainee_id`, `is_trainer`, `ensure_client_account`, `rls_auto_enable`, `trainees_sync_auth` (6 to revoke), plus `verify_intake_token`, `submit_intake_form`, `mark_intake_token_used` (3 to KEEP anon-callable — they back the public intake flow).
2. Before applying revokes: smoke-test the intake form. Visit `/intake/he?t=<live_token>`, fill, submit. Confirm submission lands in `intake_submissions`.
3. Apply the migration via Supabase MCP `apply_migration`:
   ```sql
   REVOKE EXECUTE ON FUNCTION public.current_client_id() FROM anon;
   REVOKE EXECUTE ON FUNCTION public.current_trainee_id() FROM anon;
   REVOKE EXECUTE ON FUNCTION public.is_trainer() FROM anon;
   REVOKE EXECUTE ON FUNCTION public.ensure_client_account(text, text) FROM anon;
   REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon;
   REVOKE EXECUTE ON FUNCTION public.trainees_sync_auth() FROM anon;
   ```
4. Re-smoke-test the intake flow. Re-run advisors to confirm warnings cleared on the 6 functions while the 3 intake functions remain anon-callable.

### Q11. Migration pre-flight — RESOLVED: DIRECT TO PROD AFTER BACKUP

**Decision:** Apply schema migrations (search_path SET on the 5 functions + `(select auth.jwt())` wraps on 7 RLS policies + drop redundant permissive policies on store + drop redundant form-videos SELECT policy + anon revokes per Q10) directly to production after a backup.

**Ohad's note:** "i don't understand." → Picked the simpler path. Branches add cost ($0.32/day) and complexity for marginal safety on idempotent migrations.

**Execution:**
1. Trigger a manual backup: Supabase Dashboard → Database → Backups → "Take backup now". Wait for completion.
2. Apply migrations one at a time via Supabase MCP `apply_migration` with descriptive names. Each migration uses `DROP POLICY IF EXISTS` + `CREATE POLICY` (idempotent) and `CREATE OR REPLACE FUNCTION` (idempotent).
3. After each migration: re-run `mcp__plugin_supabase_supabase__get_advisors` (both security and performance) and confirm the corresponding warnings clear.
4. If anything goes wrong: rollback the affected migration via inverse SQL (drop the new policy, recreate the prior).

### Q12 (was 1.0a). Dark-portal tables flipped to light — RESOLVED: user_metadata sync

**Decision:** Confirmed as user_metadata.theme_pref sync, NOT a code regression.

**Ohad's answer:** "Yes — I tried light mode somewhere."

**Mechanism:** `src/hooks/useTheme.js:68-85` — on every sign-in, the hook reads `data.user.user_metadata.theme_pref` from Supabase Auth. If it's `'light'` or `'dark'` and differs from the local document.documentElement attribute, the hook adopts the remote value and writes it to localStorage. So a one-time light-mode toggle on another machine sets `theme_pref='light'` globally; every subsequent sign-in adopts it, including on this Windows desktop.

**Fix path (one-time, no code change):**
1. On Ohad's current dark-preferring machine, click the theme toggle to flip light → dark explicitly. This calls `setTheme('dark')` which writes `user_metadata.theme_pref = 'dark'` to Supabase.
2. Sign out, sign back in. Confirm dark mode persists.
3. Optional belt-and-suspenders: on ANY device where he ever toggled light, sign in once and toggle to dark.

**No code edit required.** The cross-device sync is working as designed; the symptom is a stale preference, not a bug.

**Surface in the doc as "verified, no fix needed":** Update section 1.0a in the audit to mark as RESOLVED-NO-CODE.

### Q13 (was 1.0c). "Log-in button disappeared" — RESOLVED: Sign Out icon

**Decision:** The Sign OUT icon in the coach header (`src/App.jsx:658`) is the affordance Ohad reports as invisible.

**Root cause:** `color: C.tm` (muted gray) on the dark header background reads as faint. Compared to ThemeToggle / Smart Import / Export / Password buttons in the same icon row, the Sign Out button is visually identical in styling but its action is the most consequential — should read as the most legible affordance, not the least.

**Fix:**
- Change `color: C.tm` → `color: C.tx` on the Sign Out button at `src/App.jsx:658`. Full body color, immediate visual recovery.
- Optionally add `aria-label="Sign out"` for screen readers (it currently has only `title="Sign out"`).
- Validation: load `/coach/dashboard` in dark mode. The right-side icon button (door + arrow SVG) should be fully legible, not faded.

---

---

## 15. EFFORT ESTIMATE

Rough buckets in person-hours at Opus 4.7 speed.

| Section | Hours | Notes |
|---|---|---|
| 1. BLOCKERS | 6–8h | 10 items; hooks reorders + small refactors |
| 2. SECURITY GAPS | 4–6h | Mostly migrations + small handler edits |
| 3. DATA-INTEGRITY GAPS | 4–6h | Presence row-per-client refactor + blob-URL serialization |
| 4. PERFORMANCE WINS | 3–5h | Heebo self-host or CSP, RLS wraps, EX scope, index adds |
| 5. UX GAPS | 6–10h | 19 items; card-strip sweep dominates if Option A in 5.1 |
| 6. BILINGUAL / RTL | 2–3h | 6 items; mostly wrapper-attribute additions |
| 7. MOBILE / PWA | 2–3h | 7 items; trivial style/config edits |
| 8. BUSINESS-LOGIC | 1–2h | 7 items; mostly cross-references to other sections |
| 9. CODE HYGIENE | 3–5h | 14 items; many deletions + small fixes |
| 10. SCHEMA HYGIENE | 2–3h | Migrations applied via Supabase MCP |
| 11. INTEGRATION CHECKS | 1–2h | mostly verify |
| 12. MEMORY HYGIENE | 1–2h | Index update + 5 new memory files |
| 13. ACCEPTANCE-TEST SUITE | 2–3h | Walk all boxes after fixes |
| 14. OPEN QUESTIONS | 30m | Resolve before starting |

**Total range: ~37–58h of focused engineering** if all sections execute. Realistic single-day execution: BLOCKERs + SECURITY + DATA-INTEGRITY + 5-10 highest-leverage UX/PWA items + acceptance suite (~12–16h of focused work, which is one solid day of Opus pair-programming).

**Recommended day-1 priority order:**

1. Resolve OPEN QUESTIONS (30m).
2. BLOCKERs 1.1–1.10 (4–6h).
3. SECURITY 2.1–2.5 (DDL migrations via Supabase MCP — 2h).
4. PERFORMANCE 4.1 (Heebo unblock — 30m).
5. DATA-INTEGRITY 3.1, 3.2, 3.3 (presence + offline queue + task→plan retry — 2h).
6. UX 5.10 (window.confirm → confirmToast — 30m), 5.14 (goPrev crash — 15m), 5.15 (plansLoadError clear — 5m).
7. Run section 13 acceptance suite.
8. Commit, push, verify deploy.
9. Write the 5 new memory entries (12.3) and update MEMORY.md.

The remainder (UX rhythm sweep, dormant-table drop migration, smart-import auth gate) on day 2 or as follow-up.

---

> AUDIT-COMPLETE — handing off to Claude Code Opus 4.7.
