# EXPO platform bug audit — 2026-08-22

Durable extract of the 12-subsystem audit workflow (run `wf_2c638fa6-63e`). Every candidate finding below came from an agent that READ the cited file; a "verified" tag means an adversarial verifier re-traced it in code and could not refute it. Findings without a tag were never verified (the verify phase was cut short by session limits) — treat them as unconfirmed leads, not facts.

Totals: **103 findings**, 5 verified real, 29 verified-and-refuted, 69 unverified.

By severity: 17 high · 39 medium · 47 low

> Fixed-and-deployed items are marked ✅ FIXED with the commit. See memory `project_platform_bug_audit_2026_08_22.md` for the resume plan.


> **STATUS 2026-08-25.** Every finding in this document has now been actioned:
> fixed, refuted on verify, or (for #57) deliberately disabled with the blocker
> documented in the code. Fixes shipped across commits `5fe72b0`, `1d9fdf4`,
> `e416d93`, `29e64eb` and `f1ae2d1`, each verified live before moving on.
> Findings still marked _[unverified]_ below were verified as ALREADY FIXED by an
> earlier wave and left as-is.

## 1. [HIGH] Stacked Modal+ConfirmDialog closing in one commit strands body overflow:hidden — page permanently unscrollable **[VERIFIED FIXED 2026-08-25]**

**Where:** `C:/Users/Administrator/Desktop/expo-full/src/ui.jsx:719`

**Evidence:** Modal: `const prevOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden';` (672-673) restored at 719 `document.body.style.overflow = prevOverflow;`. ConfirmDialog does the identical save/restore at 752/781. The saved value is whatever was on body at open time, so a dialog opened OVER another dialog saves 'hidden'. React runs the cleanup effects in tree order (earlier sibling first), so when both close in the same commit the OUTER Modal restores '' first and the INNER dialog restores 'hidden' last.

**Failure scenario:** TraineesView: Edit Athlete Modal (line 884) contains the '📦 Archive Athlete' button (972) which opens ConfirmDialog (979) while the Modal stays open. handleArchive (TraineesView.jsx:600-603) runs `setArchiveConfirm(null); setShowForm(false)` — one batched commit → Modal cleanup restores '', ConfirmDialog cleanup restores 'hidden' → body stuck at overflow:hidden. Every later Modal saves prev='hidden' and restores it, so the whole app stays unscrollable until a full page reload. Same trigger shipped tonight in ExerciseMatchingView: LibraryPicker Modal stays open under the ExercisePeek Modal (onPeek at line 270 does not clear pickerFor); 'Use this match' (line 276) runs `setPeek(null); setPickerFor(null)` in one commit → same stranded lock. Escape with both open (see next finding) hits it too.

**Proposed fix:** Replace the per-instance save/restore with a module-level lock counter (increment on open, decrement on close, only clear overflow when the counter hits 0), or always restore to '' and re-assert 'hidden' in the surviving open dialog's effect.

---

## 2. [HIGH] Whole-roster Lift session is silently dropped — Save enabled but logTeamSession rejects zero-load lifts **[VERIFIED FIXED 2026-08-25]**

**Where:** `src/BhbcView.jsx:2177`

**Evidence:** Line 2177: `const canSave = scope === 'squad' ? (preview > 0 || liftOk) : (athleteId && (preview > 0 || liftOk || pain || sleep || energy));` — `liftOk` (Lift with minutes, no RPE) enables Save in squad scope. Line 605 routes squad payloads to logTeamSession, whose first lines (279–281) are `const load = sessionLoad(minutes, rpe); if (load <= 0) { toast('Add minutes + RPE'); return; }`. For a Lift the RPE input is hidden (line 2210 `{!isLift && <Input label="Session RPE..."`), so rpe='' and load=0. Only logSession (single-athlete path, lines 265–269) has the zero-load Lift branch.

**Failure scenario:** Coach opens Log a session → 'Whole roster' → type Lift → 40 minutes → Save (button is enabled, UI says 'Gym session — minutes only, no RPE'). logTeamSession returns early with the contradictory toast 'Add minutes + RPE', the modal closes (setLogFor(null) runs unconditionally after onSave), and NOTHING is recorded for any athlete — the team gym session is silently lost.

**Proposed fix:** In logTeamSession, mirror logSession's Lift branch: when type==='Lift' && Number(minutes)>0 and load===0, push { type, min, rpe: null, load: 0, attended: true } into each available athlete's sessions without touching loads; keep the load>0 path for sRPE types.

---

## 3. [HIGH] Head Coach Report shows every next game as 'Away' — boolean home passed to the isBH() name matcher **[VERIFIED FIXED 2026-08-25]**

**Where:** `src/BhbcView.jsx:1226`

**Evidence:** Line 1226: `{isBH(nextGame.home) ? 'Home' : 'Away'}`. `isBH` (line 1664) is `(n) => /הרצליה|herzliy/i.test(n || '')` — a team-NAME matcher for league feed strings. Club fixtures store `home` as a boolean (GameEditModal save, line 1010: `home: home === '' ? null : home === 'home'`; real store data has `"home": true/false`). `isBH(true)` tests the string "true" → false; `isBH(false)` tests '' → false.

**Failure scenario:** Any home fixture (e.g. the 2026-09-17 'home: true' vs Rishon LeZion in expo-bhbc-fixtures): the Head Coach Report's 'Next game' line prints '· Away', while NextGamePanel's HAChip on the same Overview correctly shows 'Home' — the head coach gets contradictory, wrong venue info for every home game.

**Proposed fix:** Use the boolean directly like the rest of the file: `{nextGame.home === true ? 'Home' : nextGame.home === false ? 'Away' : ''}` (or reuse HAChip).

---

## 4. [HIGH] CHASE WhatsApp link uses un-normalized local phone — wa.me rejects it **[REFUTED on verify]**

**Where:** `src/BillingView.jsx:116`

**Evidence:** `const chase = (t, r) => { const phone = String(t?.phone || '').replace(/[^\d]/g, ''); ... window.open(`https://wa.me/${phone}?text=${msg}`, '_blank'); }`. Every other WhatsApp path in the app (DashboardView, NotesWidget:418, NotesInline:238, WhatsAppCheckInButton) routes through normalizePhoneIL (whatsappButton.jsx:7-13), which converts leading-0 Israeli numbers to 972-prefixed E.164 — proving phones are stored in local '05X-XXXXXXX' format. BillingView only strips non-digits, producing wa.me/05XXXXXXXX.

**Failure scenario:** Coach clicks '◔ CHASE' on a pending payment for an athlete whose phone is stored as '054-8124381' (the normal format). WhatsApp opens with 'The phone number shared via url is invalid' — the payment reminder never reaches the athlete. Broken on essentially every roster phone.

**Proposed fix:** Use normalizePhoneIL(t?.phone) like every other WhatsApp entry point; toast when it returns null.

**Verifier:** Already fixed in current code (commit 2429368, 'audit wave 2'). BillingView.jsx:118-123 now reads: const phone = normalizePhoneIL(t?.phone); if (!phone) { toast('No phone number on file for this athlete.', 'warn'); return; } — normalizePhoneIL is imported at line 24. The claimed digit-strip-only code no longer exists; the exact fix the claim proposed is in place.

---

## 5. [HIGH] One Escape press closes the whole evaluation editor through stacked overlays — full manual eval discarded **[VERIFIED FIXED 2026-08-25]**

**Where:** `src/EvaluationEditor.jsx:378`

**Evidence:** EvaluationEditor.jsx:378: `useEscClose(true, onClose); // Escape closes the editor` stays active the entire time the editor is mounted. useEscClose (ui.jsx:820-833) and ConfirmDialog's own handler (ui.jsx:757-758 `if (e.key === 'Escape') { e.preventDefault(); onCancelRef.current?.(); }`) are BOTH window-level 'keydown' listeners; preventDefault does not stop the other listener, and neither checks whether it is the topmost dialog (only the Tab-trap does). The embedded camera overlays (MovementLab/HoldTimer, rendered at EvaluationEditor.jsx:552-603) have no Escape handling of their own (grep for 'Escape' in MovementLab.jsx: no matches), so the editor's listener is the one that reacts.

**Failure scenario:** Coach fills in 20+ scores/ROM values in a new evaluation (no autosave — state lives only in the modal), clicks a ◉ TEST button on a field that already has a value → the Retake ConfirmDialog opens → coach presses Escape intending to cancel just the retake. Both listeners fire on the same keydown: the ConfirmDialog cancels AND the editor's useEscClose calls onClose → setEditing(null) unmounts the editor and every typed score, note and ROM entry is lost with no confirmation. Same loss occurs pressing Escape while a MovementLab/HoldTimer overlay is open (the editor beneath closes, unmounting the tool mid-capture).

**Proposed fix:** Make useEscClose/ConfirmDialog Escape handling topmost-dialog-aware (same querySelectorAll('[role="dialog"]') last-one-wins check the Tab trap already uses), or gate EvaluationEditor's useEscClose with `!retake && !activeTest && !activeRom`, and/or require a confirm when closing an editor with unsaved entries.

---

## 6. [HIGH] Apply writes heuristic guesses for ALL unclassified exercises, including rows never reviewed (beyond the 150-row cap or filtered out) **[REFUTED on verify]**

**Where:** `src/ExerciseClassifyView.jsx:34`

**Evidence:** `val()` (line 28) falls back to the classifier guess: `d[k] !== undefined ? d[k] : (ex[k] || g[k] || '')`, and `pending` (lines 34-39) iterates `items` — not `rows`/`filtered` — so every exercise with any guess counts as changed with zero coach action. apply() (line 50) then writes those guesses to the library. Consequence: 'Fill all fully-guessed' (line 41) is a functional no-op, and partial guesses (1-2 of 3 fields) plus known-wrong heuristics (exerciseClassify.js:14 maps 'trap-bar'/'trap bar' to 'Landmine') are batch-written for ~1,300 rows the coach never saw.

**Failure scenario:** Coach opens Classify, reviews the first visible rows (CAP=150) or a filtered subset, clicks Apply. The confirm shows a large number, coach assumes it reflects the review workflow and confirms — the entire library's unclassified rows (including every 'Trap Bar Deadlift' → resistanceType 'Landmine', and hundreds of rows that were never rendered) get heuristic taxonomy written, polluting the filter facets the ExercisesView is built on.

**Proposed fix:** Make `pending` require an explicit opt-in: only rows with an edits[] entry (from a dropdown change or 'Fill all fully-guessed') should apply; drop the `g[k]` fallback from the apply path (keep it for display pre-fill only).

**Verifier:** Already fixed. src/ExerciseClassifyView.jsx:37-44: `pending` now requires an explicit edits[] entry with at least one taxonomy key defined (`if (!d || d.skip) return false; if (!['resistanceType','bodyPosition','movementType'].some((k) => d[k] !== undefined)) return false;`) plus a real change. Raw classifier guesses only prefill dropdowns for display; apply() (line 55) reads editVal, which falls back to the exercise's stored value, never the guess. 'Fill all fully-guessed' works because acceptAllComplete copies guesses into edits.

---

## 7. [HIGH] applyMatch writes library-shape keys (videoLink/cues) instead of plan-row keys (videoUrl/notes) — athletes still get no video or cues after matching **[REFUTED on verify]**

**Where:** `src/exerciseMatch.js:160`

**Evidence:** applyMatch: `return { ...e, exerciseId: ex.id, title: ex.title || ex.t || t, videoLink: ex.videoLink || e.videoLink, cues: ex.cues || e.cues };`. Plan-row consumers never read these keys: ClientPortal.jsx:243 `const notes = pe.notes ?? pe.n;`, ClientPortal.jsx:250-251 `pe.videoUrl !== undefined || pe.vid !== undefined`. The correct contract is shown by the plan editor itself — PlansView.jsx:2317 on relink writes `{ exerciseId: id, title: lib?.title, videoUrl: lib?.videoLink, ..., n: lib?.cues }`. Athletes cannot read the exercise library (RLS; plan-row snapshots are their only source), so `exerciseId` alone gives them nothing.

**Failure scenario:** Coach runs the new Matching screen and applies matches, expecting the athlete to now see the library demo video and cues (the function comment says 'refreshed title/videoLink/cues'). On the athlete portal trainerExercises is empty (library not readable), exData is null, and the row's videoUrl/vid and notes/n were never written — the athlete still sees no video and no cues for every matched exercise. Meanwhile dead `videoLink`/`cues` keys are permanently injected into trainee-visible plans.data blobs.

**Proposed fix:** In applyMatch, write the plan-row snapshot keys: `videoUrl: ex.videoLink || e.videoUrl` and notes/n per row shape (`notes` for full rows, `n` for compact rows), mirroring PlansView ExPicker; drop the videoLink/cues keys.

**Verifier:** Already fixed in current code (commit 4fde6b2). src/exerciseMatch.js:179-181 now writes the plan-row snapshot keys: `if (!out.videoUrl && !out.vid && ex.videoLink) out.videoUrl = ex.videoLink;` and notes/n per row shape (`out.n = ex.cues` for compact rows, `out.notes` otherwise), fill-only. No videoLink/cues keys are injected anywhere in applyMatch.

---

## 8. [HIGH] applyMatch overwrites the athlete-visible title while the confirm dialog promises titles stay the same; also severs title-keyed workout-history fallback **[REFUTED on verify]**

**Where:** `src/exerciseMatch.js:160`

**Evidence:** `title: ex.title || ex.t || t` replaces the plan-row title snapshot with the library title. The confirm modal (ExerciseMatchingView.jsx:270) says: 'Titles athletes see stay the same; the rows just resolve to real library exercises.' By construction every group's title differs from the library title (otherwise it would have resolved), so 100% of applied rows get renamed. ClientPortal matches prior workouts by eid then falls back by title (ClientPortal.jsx:1721-1722 `pidx = pw.exercises.findIndex(pe => pe.eid === ex.eid)` then `(pe.title||'').toLowerCase().trim() === fbTitleKey`); the portal eid also changes (dyn_ key derives from the new exerciseId), so with the title changed too, both match paths break.

**Failure scenario:** Coach accepts a near-miss match (e.g. plan row 'Seating DB OHP' → library 'Standing MID-POS DB OHP') and confirms based on the dialog's explicit promise. The athlete's program now shows the library name instead of the coach's chosen snapshot (possibly a deliberate Hebrew/custom name), and prev-week ghosts / PR history / form-video feedback lookups for that exercise stop matching because both eid and title fallback keys changed.

**Proposed fix:** Either keep the row title (`title: t`) so only the link changes — making the dialog true and preserving title-fallback continuity — or change the dialog copy and accept the history break knowingly.

**Verifier:** Already fixed. Current applyMatch (src/exerciseMatch.js:170-182) never writes a title key — the spread `{ ...e }` keeps the existing snapshot, and the contract comment at lines 150-151 explicitly states the athlete-visible title is not touched. The confirm dialog's promise (ExerciseMatchingView.jsx:284) is now true, and title-fallback history matching is preserved.

---

## 9. [HIGH] Apply writes whole plans.data blobs from a snapshot fetched once at mount — clobbers any plan edits made since the screen was opened **[REFUTED on verify]**

**Where:** `src/ExerciseMatchingView.jsx:173`

**Evidence:** Plans are fetched a single time in the mount effect (line 131 `supabase.from('plans').select('id,name,trainee_id,data')`) and never refreshed. apply() folds matches into that stale snapshot and writes it back wholesale: `await supabase.from('plans').update({ data: p.data }).eq('id', p.id)` — a full-blob overwrite with no version/updated_at guard.

**Failure scenario:** Coach opens the Matching tab, then edits a program in the PlanEditor (autosave, 600ms debounce) in another tab or leaves Matching open for a while, then returns and clicks Apply. Every plan touched by a match is reverted to its mount-time contents plus the match — silently destroying the sets/reps/exercise edits made in between, in trainee-visible data.

**Proposed fix:** Re-fetch each plan's current data immediately before applying (or apply the match transform to freshly-fetched rows), ideally with an updated_at optimistic-concurrency check.

**Verifier:** Already fixed. apply() in src/ExerciseMatchingView.jsx:169-173 re-fetches all plans (`const { data: fresh } = await supabase.from('plans').select(...)`) immediately before folding matches in, and the diff/update loop runs against `fresh`, not the mount-time snapshot. Concurrent editor autosaves made while the screen was open are preserved.

---

## 10. [HIGH] Outer component defined inside render — entire card remounts every keystroke, composer loses focus per character **[VERIFIED FIXED 2026-08-25]**

**Where:** `src/NotesInline.jsx:156`

**Evidence:** NotesInline.jsx:156-165 defines `const Outer = ({ children }) => bareMode ? <div>{children}</div> : (<div style={{...}}>{children}</div>);` inside the NotesInline function body, and renders `<Outer>` at line 167 around the whole card (task rows, HISTORY, the 'Add a note…' textarea at 445, the tags input at 460). A new function identity is created on every render, so React treats it as a different component type and unmounts/remounts the full subtree on every state change — including every `setBody` keystroke in the composer.

**Failure scenario:** Coach opens a trainee card (NEXT ACTIONS panel) and types a task into 'Add a note…': after the first character the textarea DOM node is destroyed and recreated, focus drops to <body>, and the coach must click back into the box for every single character. Same for the #tags input and the inline task-edit textarea (which also fires its onBlur=saveEdit path when refocusing elsewhere). Any open ExplainInfoButton popover also closes on each keystroke because its component state is reset by the remount.

**Proposed fix:** Hoist the wrapper out of the component (module-level `function Outer({ bareMode, children }) {...}`) or replace it with inline JSX: `bareMode ? <div>{body}</div> : <div style={cardStyle}>{body}</div>` built from a shared `body` variable — never define a component type inside render.

---

## 11. [HIGH] Library-cue snapshot seeded into ex.n is dead — athletes never see cues for picker-added/swapped exercises **[VERIFIED FIXED 2026-08-25]**

**Where:** `src/PlansView.jsx:1717`

**Evidence:** addExWithId (PlansView.jsx:1716-1717): `const lib = ...; if (lib?.cues) ex.n = lib.cues;` on a row built from defaultPlanEx() which already has `notes: ""`. Same in the swap path (PlansView.jsx:2317): `update({ ..., notes: '', notesEdited: false, n: lib?.cues || '' })`. But every consumer resolves notes with nullish-coalescing, where the empty string wins: ClientPortal.jsx:243 `const notes = pe.notes ?? pe.n;` ("" is not nullish, so pe.n is ignored → out.n never set) and usePlansStore.js normalizeDays:32 `notes: e.notes ?? e.n ?? ''` (the normalized shape has no `n` key at all, so the seeded cues are also physically dropped on the next open→autosave cycle). Athletes cannot read the exercise library (store key 'expo-exercises' is staff-RLS'd; useSupaStore.js:190-192 returns no row → trainerExercises stays []), so ClientPortal's library fallback (d.q at ClientPortal.jsx:1711) is empty on the athlete seat. Meanwhile the coach-side editor (ExEditorExtras, PlansView.jsx:1240-1242) displays the cues via the live library with a 'FROM LIBRARY' tag, and the comment at 1711-1715 claims 'ex.n is now the single source of truth for what the athlete sees' — it is never read.

**Failure scenario:** Coach adds 'DB Bench Press' to a day via the exercise picker (or swaps an existing row to it) and does not hand-edit the notes. The editor shows the library coaching cues in the NOTES box ('FROM LIBRARY'). The athlete opens the workout on their phone: the exercise shows the title and sets/reps but NO coaching cues. After the coach reopens and autosaves the plan once, the seeded `n` field is stripped from the row entirely, so the snapshot cannot even be recovered.

**Proposed fix:** Seed the snapshot into the field consumers actually read: in addExWithId and the ExPicker swap, set `ex.notes = lib?.cues || ''` (leaving notesEdited false so the coach editor still treats it as library-inherited), or change ClientPortal:243 / normalizeDays:32 to `(pe.notes !== undefined && pe.notes !== '') ? pe.notes : pe.n` — and keep `n` in the normalized round-trip so it survives resaves.

---

## 12. [HIGH] addExWithId never snapshots videoUrl — newly added exercises have no demo video on the athlete portal **[VERIFIED FIXED 2026-08-25]**

**Where:** `src/PlansView.jsx:1721`

**Evidence:** addExWithId (PlansView.jsx:1707-1724) snapshots only the title (`ex.title = lib?.title || ''`, with the comment 'The plan must be self-contained'), but not the video: defaultPlanEx has no videoUrl key, so the row saves with videoUrl undefined. ClientPortal.jsx:250-253 only emits `out.vid` when an override exists (`pe.videoUrl !== undefined || pe.vid !== undefined`); otherwise ClientPortal.jsx:1675 falls back to `d.vid` = EX[eid].vid, which is populated from exData (the library) at ClientPortal.jsx:196-200 — and the athlete seat has an empty library (RLS on 'expo-exercises'), so d.vid is '' for every non-legacy exercise. The swap path proves the snapshot is required: ExPicker onChange at PlansView.jsx:2317 explicitly writes `videoUrl: lib?.videoLink || ''`. The add path omits it. Bonus drift trap in the swap path itself: `lib?.videoLink || ''` stamps '' (the documented explicit-no-video state, usePlansStore.js:43-47) when the library entry has no video yet, so if that library exercise later gains a video the row never inherits it — even on the coach seat.

**Failure scenario:** Coach builds a new block by adding library exercises via the picker; most library entries have demo videos. Coach previews the plan (coach seat has the library → videos render) and ships it. The athlete opens the workout: no VIDEO link/embed on any of the newly added exercises. The coach's preview and the athlete's reality diverge silently.

**Proposed fix:** In addExWithId (and createLibraryExercise), snapshot the video like the swap path does — but only when one exists: `if (lib?.videoLink) ex.videoUrl = lib.videoLink;` (leave undefined otherwise). In the swap path change `videoUrl: lib?.videoLink || ''` to `videoUrl: lib?.videoLink || undefined` so a missing library video stays in the inherit state instead of explicit-cleared.

---

## 13. [HIGH] Previous-week ghost never matches portal-logged workouts — eid scheme mismatch, no title fallback **[VERIFIED FIXED 2026-08-25]**

**Where:** `src/SessionsView.jsx:121`

**Evidence:** prevByKey matches strictly by id: `const id = ex.exerciseId || ex.eid; if (id && !m.has(id)) m.set(id, ex.sets || [])` (line 121) and the card looks up `prevMap?.get(ex.eid)` (line 615) with the PLAN's library exerciseId. But rows the athlete logs in the portal store portal-derived eids: ClientPortal.jsx 184-187 sets `eid = EX_BY_TITLE[title]` (static baseline key) or `'dyn_' + (pe.id || libId || slug)`, and finish() writes that eid (line 1339). `'dyn_ex_...'` never equals the raw plan exerciseId. WorkoutsView has the same strict match in lastTimeById (line 79 `const id = pex.exerciseId || pex.eid`) and prevWeek (line 105). The portal's own matchers explicitly need a title fallback for this ("eid first, normalized title second (plan rebuilds rotate eids)", ClientPortal.jsx 438) — the coach loggers have none.

**Failure scenario:** Athlete logs W1 of a block at home in the portal (the normal case). Next week the coach runs a group session (or 1-on-1) for W2 of the same plan/day: prevByKey finds the W1 row but every per-exercise lookup misses (plan exerciseId vs 'dyn_…' eid), so the per-set previous-week ghost and "last time" reference silently never render — the progressive-overload reference the floor grid was built to show only works when the prior week was ALSO coach-logged.

**Proposed fix:** Add the portal's title fallback: key the prev maps by both id and normalized title (workout rows carry `title`), matching ClientPortal's eid-then-title matcher.

---

## 14. [HIGH] Calendar pull-sync permanently strips due-date + priority from every synced task body **[VERIFIED REAL]**

**Where:** `src/TasksV8View.jsx:1947`

**Evidence:** reconcileIncoming (lines 1946-1953): `const newSummary = stripStatusPrefix(event.summary || ''); const currentDisplay = stripOwnerPrefix(localRow.body); if (newSummary && newSummary !== currentDisplay) { ... await update(localRow.id, { body: prefix + newSummary }); }`. Events are always created with summary = displayBodyOf(body) (title only — priority bracket and `· due` suffix stripped: line 1848 `displayBody: displayBodyOf(r.body)`, line 2369, line 2410 `displayBody: body`). But currentDisplay only strips the owner prefix, so for any task with `[URGENT]`/`[HIGH]` or a `· due YYYY-MM-DD` suffix, newSummary !== currentDisplay is ALWAYS true, and the body is rewritten to `prefix + newSummary` — dropping the due suffix and priority bracket. pullChangesSinceLastSync (googleCalendarSync.js:414-447) returns EXPO's own event writes (syncToken covers all changes; the first no-token poll uses updatedMin=last-30-days), so the very first 60s poll after connecting reprocesses the just-synced events.

**Failure scenario:** Coach creates 'Ohad: [URGENT] Call Dani · due 2026-08-25 14:00' with Calendar connected. Event lands with summary 'Call Dani'. Within 60s the poll returns that event, newSummary='Call Dani' ≠ currentDisplay='[URGENT] Call Dani · due 2026-08-25 14:00', and the row body is overwritten to 'Ohad: Call Dani'. The due date and urgency vanish from the task — no OVERDUE/TODAY chip, wrong smart-sort, and the next calendar patch (finding below) moves the event too. Happens to every synced task carrying a due or priority.

**Proposed fix:** Compare newSummary against displayBodyOf(localRow.body), and on a real remote title change rebuild the body preserving the priority bracket and due suffix (prefix + priorityTag + newSummary + dueSuffix).

**Verifier:** CONFIRMED in current code. TasksV8View.jsx:1946-1953: newSummary = stripStatusPrefix(event.summary) but currentDisplay = stripOwnerPrefix(localRow.body) — NOT displayBodyOf. Events are always created with summary = title only (displayBodyOf strips [PRIORITY] and '· due …', lines 184-186; callers at 1848, 1883, 2369, 2410 all pass displayBody). So for body 'Ohad: [URGENT] Call Dani · due 2026-08-25 14:00', currentDisplay = '[URGENT] Call Dani · due 2026-08-25 14:00' ≠ newSummary 'Call Dani' → update(body: 'Ohad: Call Dani'), dropping priority + due. The poll runs immediately on mount and every 60s (lines 1983-1984); pullChangesSinceLastSync (googleCalendarSync.js:414-447) uses syncToken/updatedMin with no self-write filter and reconcileIncoming has no etag guard, so the app's own just-created events come straight back and trigger the rewrite. One-shot data loss per due/priority task.

---

## 15. [HIGH] Status change (and manual/batch sync) moves the Google Calendar event to the task's created_at date **[VERIFIED REAL]**

**Where:** `src/TasksV8View.jsx:2369`

**Evidence:** setStatus ends with `await syncRowToCalendar(rowWithIntent, { displayBody: displayBodyOf(row.body) });` — no dueAt/dueTime opts. Same for handleSyncToCalendar (line 1883: `reconcileRow(row, { displayBody: displayBodyOf(row.body) })`) and the connect-time batch sync (lines 1847-1848). buildEventPayload (googleCalendarSync.js:292) then falls back: `const dueIso = opts.dueAt || row.due_at || row.created_at || ...` — coach_notes rows never carry due_at (coachNotes.create writes no such column), so the event is rebuilt at created_at 09:00 Asia/Jerusalem. Only the composer path (line 2411) passes opts.dueAt.

**Failure scenario:** Task created Aug 1 with `· due 2026-08-25` syncs correctly to Aug 25. Coach clicks the status pill → In Progress. patchTask rebuilds the payload with dueIso = created_at and the event silently jumps back to Aug 1 09:00 — a past date — while keeping the '[WORKING]' title. Every status flip on a due-dated task corrupts the calendar. The connect-time backlog sync also creates all events at their creation dates rather than their due dates.

**Proposed fix:** Pass dueAt: row._dueAt (from dueAtFromBody) and dueTime: row._dueTime into every syncRowToCalendar/reconcileRow call, not just the composer path.

**Verifier:** CONFIRMED in current code. setStatus (TasksV8View.jsx:2369) calls syncRowToCalendar(rowWithIntent, { displayBody: displayBodyOf(row.body) }) with no dueAt/dueTime; same for handleSyncToCalendar (1883) and the connect-time batch sync (1847-1848). Only onComposerSubmit (2411-2412) passes dueAt. buildEventPayload (googleCalendarSync.js:292) falls back dueIso = opts.dueAt || row.due_at || row.created_at — and coach_notes has no due_at column (comment at 2373: 'coach_notes has no due_at column'; the composer's create() writes only body/tags/target fields; the ADD COLUMN SQL at lines 1026-1047 is an unapplied migration prompt). patchTask sends the full payload including start/end, so any status flip on a due-dated task silently relocates the event to created_at 09:00. Traced end-to-end; real.

---

## 16. [HIGH] Motion-detected rep channel never reaches the rep counter — REPS stuck at 0 for unmatched/Hebrew titles **[FIXED 2026-08-25]**

**Where:** `src/WorkoutReview.jsx:630`

**Evidence:** Line 630: `useEffect(() => { activeChannelsRef.current = activeChannels; }, [trackOverride, exerciseTitle]);` and the recount effect at line 822 ends `}, [trackOverride, exerciseTitle, repsOn]);`. But `activeChannels` also depends on `posePick` via line 611: `const autoPick = (namePick.source === 'unknown' && posePick) ? posePick : namePick;`. When `posePick` arrives (set ~1/s by the detect loop at line 1267), the component re-renders and the dropdown label updates to "AUTO (KNEE · MOTION)", but neither effect re-runs, so `activeChannelsRef.current` keeps the `unknown` pick's empty `channels: []`. The detect loop reads only the ref (line 1207 `const activeCh = activeChannelsRef.current;`) and line 1208 `if (activeCh.length === 0) { repsCountRef.current = 0; }` — count pinned to 0.

**Failure scenario:** Any clip whose exercise title matches nothing in the lexicon — including EVERY Hebrew-titled exercise, since liftDetect's `norm()` strips non-[a-z0-9] so a Hebrew title normalizes to '' and `channelFromTitle` returns null → `namePick.source === 'unknown'`. Coach turns REPS on, motion scoring correctly identifies the joint (badge shows '· MOTION'), yet the on-video REPS readout stays 0 for the whole clip. This is precisely the 24%-unmatched fallback path the #19 fusion was built for; it silently doesn't count until the coach manually forces a joint in the dropdown.

**Proposed fix:** Add `posePick` (or better, key both effects on `activeChannels` contents, e.g. `activeChannels.join()`) to the dep arrays of the ref-mirror effect (line 630) and the recount effect (line 822).

---

## 17. [HIGH] Single in-person logger ignores per-week wk/wkS arrays — wrong reps/set-count shown and persisted **[FIXED 2026-08-25]**

**Where:** `src/WorkoutsView.jsx:377`

**Evidence:** startWorkout builds sets from the flat count only: `exercises:dayExercises.map(ex=>({...ex,id:uid(),sets:Array.from({length:Number(ex.sets)||3},...)}))` (line 377) and the compact-shape mapping (lines 355-363) carries only `sets: e.sets ?? e.s ?? 3, reps: e.reps ?? e.r ?? ''` — `wk`/`wkS` are never read. The two sibling surfaces both handle them: SessionsView.jsx 373-374 (`(Array.isArray(ex.wk) && ex.wk[wi] ...)`, added with the comment "fixes '3x>' where the base reps is a placeholder") and ClientPortal.jsx setCountFor (line 420, `ex.wkS[weekNum]`) / finish() (lines 1332-1337, `wkReps`/`wkSets`). completeWorkout then persists `prescribed: `${(ex.sets||[]).length}×${ex.reps||''}`` (line 496) into client_workouts.

**Failure scenario:** Coach starts a 1-on-1 session on any plan whose reps/sets vary per week (these exist in prod — the group session shipped a fix for exactly this). The logger shows the base placeholder reps (e.g. "3x>") instead of the chosen week's prescription, allocates the wrong number of set rows (base sets instead of wkS[week]), and on Complete writes the wrong `prescribed` string into the athlete's permanent portal history. Because the portal allocates wkS[weekNum] rows while the coach logger allocates the base count, the index-matched live set-sync also diverges: a set index that exists on one side is silently dropped by the other side's `p.si >= sets.length` guard, so sets logged on the extra rows never sync and are missing from the coach's completed row.

**Proposed fix:** Mirror SessionsView 364-377: compute wi = week-1, take reps from ex.wk?.[wi] and set count from ex.wkS?.[wi] before falling back to ex.reps/ex.sets, for both day.exercises and day.ex shapes.

---

## 18. [MEDIUM] copyGuard blocks copy/cut and the context menu inside form fields — Ctrl+X silently no-ops, stale clipboard gets pasted **[FIXED 2026-08-25]**

**Where:** `C:/Users/Administrator/Desktop/expo-full/src/copyGuard.js:33`

**Evidence:** `const block = (e) => { if (inAllowedZone(e.target)) return; e.preventDefault(); };` is installed capture-phase for 'contextmenu', 'copy' AND 'cut' (37-39). inAllowedZone only checks data-allow-copy ancestry — there is no exception for input/textarea/[contenteditable], even though the injected CSS (48-50) deliberately re-enables selection in those fields "so data entry still works".

**Failure scenario:** Coach editing an athlete outside the program editor (e.g. the Notes textarea in the Edit Athlete modal, or the Messages compose box) selects text and presses Ctrl+X to move it to another field: preventDefault on 'cut' cancels BOTH the clipboard write and the text removal — nothing visibly happens, the clipboard still holds its previous content, and the subsequent Ctrl+V pastes stale text into the target field → wrong data saved. Ctrl+C of the coach's own typed text is likewise blocked everywhere except the plan editor, and right-click→Paste is unavailable in every input because 'contextmenu' is blocked regardless of target.

**Proposed fix:** In block(), also return early when e.target is (or is inside) an input, textarea, or [contenteditable="true"] — copying/cutting one's own form-field text is data entry, not content exfiltration; the site-content protection Ohad asked for is unaffected.

---

## 19. [MEDIUM] Apply CTA assumes C.ac is cyan — in light theme --c-ac is #0E0F12, giving #04121f text on a near-black fill (unreadable at rest) **[FIXED 2026-08-25]**

**Where:** `C:/Users/Administrator/Desktop/expo-full/src/ExerciseMatchingView.jsx:206`

**Evidence:** Line 206: `style={{ background: affectedRows ? C.ac : undefined, borderColor: affectedRows ? C.ac : undefined, color: affectedRows ? '#04121f' : undefined }}` and line 288: `<Btn onClick={apply} style={{ background: C.ac, borderColor: C.ac, color: '#04121f' }}>`. themes.css defines `--c-ac: #0E0F12` for data-theme="light" (line 164) — C.ac is only cyan in dark mode; ui.jsx's own comment on the 'solid' variant (ui.jsx:106-107) warns exactly about this: "literal #39BDFF (not C.ac, which resolves near-black in the light-refined theme)".

**Failure scenario:** Coach on the light theme opens Exercise Matching (new tonight), accepts matches: the enabled 'Apply N matches (M rows)' header button and the confirm dialog's 'Apply N rows' button render as #04121f text on a #0E0F12 fill — ~1:1 contrast, both primary CTAs of the new flow are illegible black boxes. Light/dark parity break on the screen's main action.

**Proposed fix:** Use the literal brand cyan like the 'solid' Btn variant does (`background:'#39BDFF', color:'#06131b'`) or just `variant="solid"`, instead of C.ac + hardcoded dark text.

---

## 20. [MEDIUM] .expo-btn:hover !important wipes solid inline button fills — Apply/'Use this match' CTAs become dark-text-on-dark while hovered **[FIXED 2026-08-25]**

**Where:** `C:/Users/Administrator/Desktop/expo-full/src/themes.css:21`

**Evidence:** `.expo-btn:hover { background: color-mix(in srgb, currentColor 12%, transparent) !important; }` — !important beats any inline background, so every <Btn> styled with a solid fill loses it on hover and gets a 12% tint of its TEXT color instead. ExerciseMatchingView.jsx:206 renders the main Apply CTA as `<Btn ... style={{ background: affectedRows ? C.ac : undefined, ..., color: affectedRows ? '#04121f' : undefined }}>` and line 288 / ExercisePeek line 84 use the same solid-fill+dark-text pattern.

**Failure scenario:** Dark theme, Exercise Matching screen (shipped tonight): the moment the coach hovers the cyan 'Apply N matches' button to click it, the !important rule replaces the #39BDFF fill with rgba(4,18,31,0.12) — near-transparent on the ~black page — leaving #04121f text on a near-black background: the primary CTA's label becomes unreadable exactly at click time. Same for the green 'Use this match' button in the peek modal and every other Btn given a solid inline background app-wide (the built-in 'solid' variant call sites happen to override to transparent, but custom-fill call sites do not).

**Proposed fix:** Scope the hover rule to non-filled buttons (e.g. only apply when no inline background is set, via a `.expo-btn--filled` opt-out class on solid-fill call sites), or drop !important and give filled buttons their own hover treatment (brightness filter already exists).

---

## 21. [MEDIUM] Escape closes every stacked dialog at once — inner confirm's Escape also discards the outer edit modal **[VERIFIED FIXED 2026-08-25]**

**Where:** `C:/Users/Administrator/Desktop/expo-full/src/ui.jsx:679`

**Evidence:** Each open Modal registers its own `window.addEventListener('keydown', onKey)` whose handler runs `if (e.key === 'Escape') { e.preventDefault(); onCloseRef.current?.(); return; }` (679). ConfirmDialog has the identical handler (758) and useEscClose too (821). preventDefault does not stop the other window listeners, and none of them checks whether it is the topmost dialog, so ONE Escape keypress fires every open dialog's onClose.

**Failure scenario:** Coach opens Edit Athlete (TraineesView Modal 884), fills in changes, clicks '📦 Archive Athlete' (972) → ConfirmDialog opens on top. Presses Escape intending only to cancel the confirm: ConfirmDialog cancels AND the edit Modal closes, silently discarding all typed edits. Same in tonight's ExerciseMatchingView: 'Change…' picker Modal + VIEW peek Modal are stacked; Escape in the peek also kills the picker (search text lost). Both cases additionally trigger the stranded scroll-lock from the previous finding since the two dialogs close in the same commit.

**Proposed fix:** In the Escape branch, only act when this dialog's card is the topmost open dialog (e.g. compare cardRef against the last [role="dialog"] in the DOM, the pattern useEscClose already uses for Tab), or maintain a module-level dialog stack and let only the top entry consume Escape.

---

## 22. [MEDIUM] Focus traps of stacked dialogs fight — Tab is pinned to the top dialog's first control, Confirm button unreachable by keyboard **[VERIFIED FIXED 2026-08-25]**

**Where:** `C:/Users/Administrator/Desktop/expo-full/src/ui.jsx:699`

**Evidence:** Modal's trap (696-701): `if (e.shiftKey && (active === first || !node.contains(active))) { ... last.focus(); } else if (!e.shiftKey && (active === last || !node.contains(active))) { ... first.focus(); }` where `node` is that instance's own cardRef. With two dialogs open, the bottom dialog's listener runs first, sees the active element is outside ITS card (`!node.contains(active)`), and yanks focus into itself; then the top dialog's listener runs, sees focus outside ITS card, and yanks it back to its own FIRST focusable. Net result on every Tab press: focus lands on the top dialog's first focusable, never advancing.

**Failure scenario:** Edit Athlete Modal open + Archive ConfirmDialog on top (TraineesView 884/979): every Tab press lands on the Cancel button (ConfirmDialog's first focusable). A keyboard user can never Tab to the Confirm button — the archive action is mouse-only. Same in the ExerciseMatchingView picker+peek stack: Tab is pinned to the peek's ✕ button, so the video/'Use this match' controls are keyboard-unreachable.

**Proposed fix:** Trap Tab only in the topmost dialog: have each trap bail unless its card is the last [role="dialog"] in the document (same topmost check useEscClose already implements at ui.jsx:824-825).

---

## 23. [MEDIUM] Sales-chat system prompt states wrong program duration and promises coach video review the templates don't include **[FIXED 2026-08-25]**

**Where:** `expo-il/api/chat.js:82`

**Evidence:** api/chat.js:82: `• **Return to Training** — 320₪ · 12 weeks. Post-injury reload.` and line 156 example: `the program reloads bilateral then unilateral leg strength over 12 weeks` — but src/programs.js:330 for rehab-return says `duration: '8 weeks · variable days/week'`. Additionally api/chat.js:88 promises `Form-video review by Ohad (async, ~48h turnaround) with side-by-side compare and timestamped feedback` and line 86 says `not a template — Ohad customizes the starting loads`, while the site itself (i18n.js 'why.col2.form': 'Auto rep counter + side-by-side compare' vs 'why.col3.form': 'Personal video feedback', and 'how.04.d': 'no coach DMs in the way') explicitly reserves personal video feedback for 1:1 coaching and sells these as self-run templates.

**Failure scenario:** A rehab prospect asks the chat about Return to Training and is told it is a 12-week block; the product page says 8 weeks — the buyer gets contradictory purchase-deciding facts on the same site. Any prospect asking "what's included" is promised personal 48h video review by Ohad, a service the template product (per the site's own comparison table) does not include — a purchase made on that promise is a mis-sold obligation Ohad then has to honor or refund.

**Proposed fix:** Regenerate the PROGRAMS block of SYSTEM_PROMPT from src/programs.js (or import it) so durations/prices can't drift, and align the WHAT'S INCLUDED section with the template offering (auto rep counter + compare, not personal review).

---

## 24. [MEDIUM] Mobile sticky CTA bar covers the chat launcher bubble, making chat nearly untappable **[FIXED 2026-08-25]**

**Where:** `expo-il/src/Chat.jsx:210`

**Evidence:** Chat.jsx:208-213 renders the closed-chat launcher at `position: 'fixed', bottom: 20, ...(anchorRight ? { right: 20 } : { left: 20 }), zIndex: 80, width: 56, height: 56`. App.jsx:3047-3056 renders StickyCTA at `position: 'fixed', left: 0, right: 0, bottom: 0, ... zIndex: 90` with ~51px total height (padding '10px 14px' + paddingBottom 'calc(10px + env(safe-area-inset-bottom))' + ~31px button row). 90 > 80, so the full-width bar paints over the bottom ~31px of the 56px bubble.

**Failure scenario:** Hebrew mobile visitor (<721px viewport, where .fv-sticky-cta is shown) on the catalog home scrolls past 480px — StickyCTA slides up and overlaps the chat bubble at bottom:20/left:20. Taps on the lower two-thirds of the bubble (including its visual center) hit the bar's inert flex-1 label span instead of the chat button; only a ~25px sliver at the top still opens chat. The chat widget is effectively dead for mid-page mobile visitors, exactly the audience the widget targets.

**Proposed fix:** Lift the chat bubble above the sticky bar on mobile (e.g. bottom: calc(20px + 56px) when the bar can be visible, or give the bubble zIndex > 90 and offset it), or hide StickyCTA while the chat bubble/panel is present.

---

## 25. [MEDIUM] Dual-role: browser Back after switching to athlete portal desyncs URL from rendered portal **[REFUTED on verify]**

**Where:** `src/App.jsx:986`

**Evidence:** pickPortal('client') only does `window.history.replaceState(null, '', '/athlete')` (App.jsx:883), leaving earlier pushState '/coach/*' entries in the stack. The popstate handler `if (r.mode === 'coach') { setTab(r.tab); ... }` (App.jsx:988) sets coach tab state, but rendering is gated earlier by `if (isClient) return (<div data-theme="dark" ...><ClientPortal .../>` (App.jsx:1296) and isClient = portalChoice==='client', which popstate never changes.

**Failure scenario:** Dual-role user (Ohad/Yuval) browses coach tabs (each pushes a history entry), clicks Portal → athlete view at /athlete. Pressing browser Back pops to /coach/dashboard (or any earlier coach URL): the address bar shows a coach URL while the athlete portal keeps rendering; Back appears dead, and the hidden coach `tab` state was silently changed underneath. Only a manual reload (which then rewrites the URL back to /athlete) recovers.

**Proposed fix:** In the popstate handler, when getRoute().mode==='coach' and portalChoice==='client', either re-pick 'trainer' (sessionStorage + setPortalChoice) so the coach view renders at the coach URL, or replaceState back to '/athlete'.

**Verifier:** Already fixed: the popstate handler (App.jsx:996-999) now, when popping to a coach route while the stored portal choice is 'client', sets PORTAL_CHOICE_KEY to 'trainer' and calls setPortalChoice('trainer'), so the coach view renders at the coach URL and Back works. Fix comment cites the audit ('audit 08-22'). No desync path remains.

---

## 26. [MEDIUM] Sign-out never clears cross-account local caches or the offline queue **[REFUTED on verify]**

**Where:** `src/auth.jsx:136`

**Evidence:** auth.jsx signOut: `await supabase.auth.signOut(); setSession(null);` and App.jsx:640 only adds `sessionStorage.removeItem(PORTAL_CHOICE_KEY)`. Nothing removes 'expo-cw', 'expo-bw', 'expo-weekly-focus', per-key store snapshots, or 'expo-offline-queue'. useSupaClientWorkouts hydrates synchronously from the old cache (useSupaStore.js:326 `const s = localStorage.getItem('expo-cw'); ... return Array.isArray(p) ? p : initial;`) and offlineQueue.js drains on 'online'/interval regardless of which session is active.

**Failure scenario:** Shared device (couple members, gym tablet, coach's phone handed to an athlete): user A signs out, user B signs in. B's app boots showing A's cached workouts/bodyweight/weekly-focus until B's fetch resolves — and permanently if the fetch fails (offline). Worse: a workout A finished offline sits in 'expo-offline-queue'; when B goes online the queue replays A's client_workouts.upsert under B's JWT — RLS 42501 → isPermanent → the entry is DROPPED (offlineQueue.js:123 `if (code === '42501') return true`), so A's logged workout is silently destroyed and B gets a confusing SAVE FAILED toast.

**Proposed fix:** On signOut, clear the known cache keys (expo-cw, expo-bw, expo-weekly-focus, expo-workouts, expo-portal-vis, expo-bhbc-*) and either clear or user-namespace 'expo-offline-queue' (park entries tagged with the auth uid and only drain when that uid's session is active).

**Verifier:** Already fixed in current code: auth.jsx:148-155 signOut now removes all expo-(cw|bw|workouts|weekly-focus|portal-vis|bhbc-|checkins|trainees|exercises) localStorage keys and calls setQueueUser(null); offlineQueue.js:30-31 tags every entry with the enqueuing uid and drain() (lines 158-163) rotates foreign-uid entries to the tail instead of replaying them under another user's JWT, so the 42501-drop scenario cannot occur. Fix comments cite 'audit 08-22' — the claimed defect no longer exists in the tree.

---

## 27. [MEDIUM] Existing-rows select omits `body` — body-diff guard always true; coach edits to auto-task bodies (priority/due) silently clobbered every sync **[REFUTED on verify]**

**Where:** `src/autoTasks.js:591`

**Evidence:** Line 589-593: `.select('id, auto_kind, auto_ref, target_id, target_label, status')` — `body` is not selected. Line 630: `if (existing.status === 'open' && existing.body !== d.body) { bodyPatches.push(...) }` — existing.body is always undefined, so the comparison is true for EVERY open auto-task on EVERY sync, issuing one UPDATE per open auto row per dashboard mount. Consequence beyond wasted writes: TasksV8View lets the coach set urgency on auto-alert rows (setPriority, line 2324 rewrites body with '[URGENT] '), and the body-patch pass rewrites the body back to the detector's copy, stripping the bracket.

**Failure scenario:** Coach opens /coach/tasks, marks the 'Chase payment from דני' auto-alert URGENT (body becomes '[URGENT] Chase payment…'). He returns to the Dashboard; syncAutoTasks runs, detects existing.body (undefined) !== detector body, and PATCHes the body back to 'Chase payment…'. The urgency he set disappears with no feedback. Also ~N pointless UPDATE round-trips per mount for N open auto-tasks.

**Proposed fix:** Add body to the select. Additionally decide the edit-vs-detector precedence: either strip user decorations before comparing (compare displayBodyOf both sides) or preserve the [PRIORITY]/due decorations when patching.

**Verifier:** Already fixed in current code (commit 2429368). autoTasks.js:600 selects 'id, auto_kind, auto_ref, target_id, target_label, status, body' — body IS included. Additionally the diff pass (lines 640-646) now parses out the coach's [PRIORITY] bracket and '· due …' suffix, compares only the detector core, and re-attaches the decorations when patching (`${pri}${d.body}${due}`), so coach urgency edits survive syncs. Neither the always-true diff nor the clobbering exists anymore.

---

## 28. [MEDIUM] todayISO/daysAgoISO use UTC — between local midnight and 02:00/03:00 Israel time all 'today' writes land on yesterday **[FIXED 2026-08-25]**

**Where:** `src/BhbcView.jsx:56`

**Evidence:** Line 56: `const todayISO = () => new Date().toISOString().slice(0, 10);` and line 57 daysAgoISO also formats via `toISOString()` (UTC). The repo's canonical fix exists in MealLogger.jsx:20–24: “LOCAL date, not toISOString() (UTC) — a meal logged 00:00–03:00 Israel time was landing on yesterday's date.” This `today` feeds cycleAvail's `availability[today]` (line 213), saveInjury's availability mirror (line 374), WellnessModal/LogModal/PracticeEntryModal default dates (842, 2167, 905), `checkedToday`, and every `f.date >= today` fixture filter.

**Failure scenario:** Israeli pro games end ~21:45; Ohad logs the game session or flips a player's availability at 00:30 local (still 21:30–22:30 UTC of the previous day): the write is keyed to YESTERDAY's date — availability for the actual today stays 'Full', the check-in date is wrong, and the Overview still shows yesterday's game as 'GAME DAY'/next game until 02:00–03:00.

**Proposed fix:** Replace both helpers with local-time formatting exactly like MealLogger.todayISO (getFullYear/getMonth/getDate with padStart).

---

## 29. [MEDIUM] LogModal shows Readiness inputs in 'Whole roster' scope but logTeamSession discards them silently **[FIXED 2026-08-25]**

**Where:** `src/BhbcView.jsx:2230`

**Evidence:** The 'Readiness (optional)' block (lines 2230–2237) renders unconditionally for both scopes, and Save passes `readiness: { pain, sleep, energy }` (line 2240). The squad path `logTeamSession({ date, type, minutes, rpe })` (line 279) destructures no readiness field — the values are dropped; only logSession (line 271) writes `rec.readiness[date]`.

**Failure scenario:** Coach logs a squad practice and fills pain/sleep/energy in the same modal expecting a team-wide check-in: the session saves, the readiness values vanish for every athlete with no error — the Load board keeps showing 'no check-in' and the S&C Brief keeps nagging 'Chase check-ins'.

**Proposed fix:** Either hide the Readiness section when scope==='squad', or make logTeamSession apply the readiness entry to each included athlete's rec.readiness[date].

---

## 30. [MEDIUM] last14/last28 memoized with empty deps — a tab left open past midnight shows stale windows that disagree with ACWR **[FIXED 2026-08-25]**

**Where:** `src/BhbcView.jsx:158`

**Evidence:** Lines 158–159: `const last14 = useMemo(() => Array.from({ length: 14 }, (_, i) => daysAgoISO(13 - i)), []);` (same for last28) — computed once at mount. But `today = todayISO()` (line 157) is recomputed every render, and `rows` (deps `[roster, bhbcLoads, today, last14]`, line 174) mixes both: `acwrFromDaily(rec.loads, today)` uses the fresh date while `series = last14.map(...)` and `ms = monotonyStrain(last14.slice(-7)...)` use the frozen window.

**Failure scenario:** Coach leaves the /bhbc Load board open overnight (dashboard/PWA use). Next morning he logs today's practice: ACWR and '7d' update (today advanced), but every 14-day sparkline, the monotony feeding the S&C Brief, and the 28-day team trend still end at yesterday — today's just-logged load is invisible in the charts and monotony/strain are computed over the wrong 7 days until a full reload.

**Proposed fix:** Derive the windows from `today`: `useMemo(() => ..., [today])` for both last14 and last28.

---

## 31. [MEDIUM] Couple members' same-named plans cross-contaminate: week derivation, done badges, ghosts, and React keys all collide on plan name alone **[VERIFIED REAL]**

**Where:** `src/ClientPortal.jsx:2044`

**Evidence:** deriveWeekIdx: `const logs = (cw || []).filter(w => w.planName === name);` — scoped by plan NAME only. The portal deliberately merges both couple members' plans (line 2160: `.in('trainee_id', traineeIdsFor(ci))` fetches tr_x, tr_x__0, tr_x__1), but workouts are saved with only `clientId: ci` (the parent — finish(), line 1321) and no plan id / member id. Same-name collisions then break everything keyed by planName: the done badge (line 3349 `cw.some(w => w.dayName === day.name && w.week === vpWeek + 1 && w.planName === vp.name)`), prevWeekSets ghosts (line 1745 `if (w.planName !== plan.name) continue;`), `activePlan` selection (line 2287 `visPlans.find(p => p.name === selectedBlockName)` picks the first of two same-named plans), and the React list keys (line 3297 `<React.Fragment key={vp.name}>` and day-card `key: vp.name + '-' + di` — duplicate keys for two same-named plans, so React mis-reconciles one member's cards onto the other's). Additionally line 2261 computes ONE `latestBlock` across the merged list, so the other member's current numbered block is hidden by default unless the coach sets an explicit portalVis toggle.

**Failure scenario:** A couple (the exact Neta+Tom case in the project record: the intact member's plan was COPIED onto the broken member's row, producing two member plans with the identical name and identical 'Day A/B' day names). Member A logs 'Day A' W2 of 'Block #12'. Member B opens the shared portal: their identically-named 'Block #12' Day A now shows ✓ done / 'AGAIN', deriveWeekIdx counts A's logs and advances B's week, so when B taps LOG the session is filed under the wrong week; B's set-1 rows are prefilled and ghosted with A's loads (prevWeekSets matches planName+dayName+week and then title). The duplicate React keys also mis-render the two plans' cards after any state update.

**Proposed fix:** Save the plan id (and/or the member trainee_id the plan belongs to) on each workout row and scope deriveWeekIdx / done / ghosts / activePlan by plan id, not name; key the plan Fragments by p.id.

**Verifier:** Fully traced in current code. Plans are merged across parent+member ids (ClientPortal.jsx:2159-2160 .in('trainee_id', traineeIdsFor(ci))) while workouts are pooled under the single shared ci (line 2307 w.clientId === ci) and finish() (line 1322) saves only clientId+planName+dayName+week — no plan id or member id. Every downstream predicate is name-scoped: deriveWeekIdx line 2044 (w.planName === name), done badge line 3349, prevWeekSets ghosts line 1745 (w.planName !== plan.name), activePlan line 2287 (find by name), and React keys line 3297 (key={vp.name}) which duplicate for two same-named plans. The Neta+Tom repair (copy intact member's plan onto the broken member's row) produces exactly two identically-named member plans, so member A's logs mark B's day done, advance B's derived week, and ghost A's loads into B's set rows. Line 2261's single latestBlock across the merged list also hides the second member's current block absent an explicit portalVis toggle. No guard anywhere distinguishes members.

---

## 32. [MEDIUM] Landing embed promises a clip-upload engine but now iframes the athlete portal where uploads are disabled _[unverified]_

**Where:** `src/CoachLanding.jsx:322`

**Evidence:** <iframe src="/demo/athlete?embed=1" title="EXPO live engine" ...> under copy 'demo.h2': 'Upload a clip. Watch the engine work.', spinner text 'LOADING ENGINE…' / 'POSE MODEL · ~6MB · FIRST LOAD ONLY', and hero smallprint 'NO CARD · NO SIGNUP · DEMO RUNS ON YOUR OWN CLIP'. App.jsx line 567 routes /demo/athlete to DemoTraineePortal (real ClientPortal in demoMode), and ClientPortal.jsx line 1025 hard-blocks uploads in demoMode: if (demoMode) { toast('Demo mode — uploads disabled', 'info'); return; }.

**Failure scenario:** A coach prospect on expo-app.co.il/demo reads 'Upload a clip. Watch the engine work', waits for 'LOADING ENGINE… POSE MODEL ~6MB', then gets the fixture athlete portal — no upload surface anywhere in the embed, and even FILM SET inside the demo logger toasts 'uploads disabled'. The page's central live-proof claim is unfulfillable in the embed; the actual clip engine lives only at /try, which desktop visitors are never linked to (only the mobile sticky bar links /try). Parity drift from re-pointing /demo/athlete at DemoTraineePortal while the marketing copy/spinner still describe the old TrySandbox engine embed.

**Proposed fix:** Either iframe the engine (/try?embed=1 or /demo/sandbox?embed=1) for this section, or rewrite demo.h2/demo.embed.loading/demo.embed.modelfoot/hero.smallprint to describe the portal preview and add a visible desktop link to /try for the own-clip engine.

---

## 33. [MEDIUM] Message thread query returns the OLDEST 200 rows — newest messages permanently invisible once a thread exceeds 200 **[REFUTED on verify]**

**Where:** `src/CoachMessages.jsx:256`

**Evidence:** .order('created_at', { ascending: true })       .limit(200);  — ascending + limit returns the FIRST (oldest) 200 rows of coach_messages for the trainee. There is no pagination anywhere in the component; the realtime INSERT listener (line 283) just calls reload(false), which re-runs the same oldest-200 query.

**Failure scenario:** A coach–athlete thread accumulates 201+ messages (a chatty athlete over months of voice notes + texts easily reaches this). From then on: (1) on every load the thread shows only the oldest 200 messages — every new message is missing; (2) an inbound realtime message triggers reload, which fetches the same oldest 200, so the new message never appears; (3) the sender sees their own message via the optimistic setRows append, but it vanishes on the next reload — both sides silently stop being able to communicate through the app while believing messages were delivered.

**Proposed fix:** Query .order('created_at', { ascending: false }).limit(200) and reverse the result before setRows, so the window is always the NEWEST 200.

**Verifier:** Already fixed in the working tree. src/CoachMessages.jsx:255-261 now queries .order('created_at', { ascending: false }).limit(200) and reverses the result before setRows, with a code comment explicitly documenting the old ascending+limit freeze ('audit 08-22'). The claimed outcome is unreachable in the current code — the window is always the newest 200.

---

## 34. [MEDIUM] trashVerdict 'definite' false positives are PRE-CHECKED for deletion: 'each side/per side/for time' and timed titles whose guard misses common exercises **[REFUTED on verify]**

**Where:** `src/ExerciseCleanupView.jsx:27`

**Evidence:** Line 27: `/last\/extra|extra for \d|\bfor time\b|as needed|if needed|each side|per side/i` → level 'definite' (auto-checked). Line 31: `/^\d+(...)?\s*(sec|second|seconds|min|minutes)\b/i` guarded only by `/sprint|run|jog|hold|plank|iso|hang|carry|bike|row|jump|skip/i` — 'walk', 'sit', 'wall', 'erg', 'crawl' are absent, so '30 sec Wall Sit', '60 sec Farmer Walk', '2 min Ski Erg' are 'definite'. Line 23 flags 'superset' ANYWHERE as definite while line 21's own comment concedes 'X Superset' combos may be real pairings — but exempts only titles matching `^DB .+Superset$`.

**Failure scenario:** Library (built from years of sheet imports, this gym demonstrably uses wall sits — exerciseData.js e218 'SL Wall Sit') contains real exercises like '30 sec Wall Sit' or 'KB Swing + Squat Superset'. They arrive pre-checked among 100+ definite rows; coach trusts 'definite come pre-checked' and clicks Delete — real exercises with cues/videos are permanently removed from the store, and their plan rows go unresolved.

**Proposed fix:** Demote 'each side/per side/for time' and 'superset'-containing multi-word titles to 'suspicious' (unchecked), and extend the timed-title guard with walk|sit|wall|erg|crawl|squat — or auto-demote any 'definite' row that still has idRefs/titleRefs > 0 or a videoLink.

**Verifier:** Already fixed on all three fronts. src/ExerciseCleanupView.jsx:32 demotes 'for time/as needed/each side/per side' to suspicious; line 36's timed-title guard now includes walk|sit|wall|erg|crawl|squat|march AND returns 'suspicious'; line 23 demotes multi-word '<exercises> Superset' combos to suspicious. Additionally the pre-check initializer (line 83) only pre-checks definite rows with idRefs===0 && titleRefs===0 && no videoLink && no cues/notes — a real referenced exercise can never arrive pre-checked.

---

## 35. [MEDIUM] applyMatch rewrites every row sharing the normalized title — including rows already correctly linked by a valid exerciseId **[REFUTED on verify]**

**Where:** `src/exerciseMatch.js:158`

**Evidence:** `if (normTitle(t) !== titleKey) return e;` is the only guard — there is no check that the row is actually unresolved. scanUnmatched only groups rows that fail resolution, but rows with the SAME title and a VALID exerciseId (title snapshot drifted after a library rename, or reason 'corrupt-superset-id'/'missing-title' rows whose siblings resolve by id) are silently re-pointed: their exerciseId is overwritten with the accepted match and their title replaced.

**Failure scenario:** Library exercise X was renamed after plans snapshotted title T; those rows still resolve via id. A separate row with title T and a broken id surfaces in Matching. Coach accepts library exercise Y for it — applyMatch also re-points every valid X-linked row titled T to Y, corrupting correct links, and touches more rows than the 'Apply N rows' count promised.

**Proposed fix:** Skip rows whose exerciseId already resolves to a library entry (pass the library's id set into applyMatch), or restrict the rewrite to the exact (planId, di, ei) rows collected by scanUnmatched.

**Verifier:** Already fixed. src/exerciseMatch.js:174-175: `const existingId = e.exerciseId || e.eid; if (!byCoords && existingId && validIds.has(existingId) && existingId !== CORRUPT_ID) return e; // already correctly linked` — validIds is built from the library param (line 159), so title-sharing rows that resolve by id are skipped.

---

## 36. [MEDIUM] scanUnmatched flags fully-resolved rows as unmatched when their NOTES mention 'superset —', bypassing id/title resolution **[REFUTED on verify]**

**Where:** `src/exerciseMatch.js:72`

**Evidence:** `else if (MISSING_RX.test(title) || MISSING_RX.test(note)) reason = 'missing-title';` runs BEFORE the `idOk`/`titleOk` resolution check (lines 74-76), and MISSING_RX = `/חסר תרגיל|superset\s*[—-]|missing exercise|\(unresolved\)/i` is tested against the row's coaching note, not just the title.

**Failure scenario:** A correctly-linked plan row whose note says 'superset - with next exercise' (a normal coach annotation) is reported as unmatched and grouped under its REAL title. The coach, trusting the screen ('every row whose exercise doesn't resolve'), accepts a suggestion — applyMatch then rewrites all rows with that title (see the valid-row rewrite finding), re-pointing and renaming healthy rows.

**Proposed fix:** Apply the MISSING_RX test to the note only when the row also fails id/title resolution; keep the note heuristic as a tiebreaker, not a primary trigger.

**Verifier:** Already fixed. src/exerciseMatch.js:77: `else if (!idOk && !titleOk && (MISSING_RX.test(title) || MISSING_RX.test(note))) reason = 'missing-title';` — the note heuristic now applies only to rows that also fail id AND title resolution; a healthy linked row whose coaching note mentions a superset is never flagged (comment at lines 74-76 documents exactly this).

---

## 37. [MEDIUM] Failed plan updates are marked applied locally — rows vanish from the screen with no retry path and a misleading success toast **[REFUTED on verify]**

**Where:** `src/ExerciseMatchingView.jsx:177`

**Evidence:** In apply(): `for (const p of changed) { const { error } = await supabase.from('plans').update(...); if (!error) ok++; }` — errors are counted but not surfaced per-plan, then `toast(`Applied — ${ok} plan(s) updated`); setPlans(working); setDecisions({});` runs unconditionally. Local state now equals the intended post-write state even for plans whose write failed (RLS, network, timeout).

**Failure scenario:** One of 12 plan updates fails mid-loop. Toast reads 'Applied — 11 plans updated'; the groups list recomputes from the local `working` array so the failed plan's rows disappear from the screen as if fixed. The DB row is unchanged, but re-applying is impossible this session (JSON.stringify(op.data)===np.data now, so `changed` excludes it) — the broken rows silently reappear only after a full reload.

**Proposed fix:** Only fold successfully-written plans into setPlans; on any error, toast the failure count explicitly and keep the failed groups' decisions so Apply can be retried.

**Verifier:** Already fixed. src/ExerciseMatchingView.jsx:175-187: failures are collected in `failedIds`; local state restores the fresh (unapplied) data for failed plans (`const next = working.map((np) => (failedIds.has(np.id) ? (fresh||[]).find(...) : np))`), the toast reports '{n} FAILED, their rows stay listed for retry', and decisions are kept for groups touching failed plans so Apply can be retried.

---

## 38. [MEDIUM] Explicit Save marks autosave clean even when savePlan failed — silent edit loss on exit **[FIXED 2026-08-25]**

**Where:** `src/PlansView.jsx:1774`

**Evidence:** PlanEditor.handleSave (PlansView.jsx:1766-1778): `await onSave(snapshot); if (planRef.current === snapshot) markClean();` — markClean is called regardless of whether the save succeeded. onSave is PlansView.handleSave (PlansView.jsx:3536-3564), which ignores savePlan's return value entirely (`await savePlan(plan);`) and then, when linkedTaskId is set, marks the task completed and linked to a plan id that may not exist in the DB. savePlan (usePlansStore.js:332-338) returns false on a generic upsert error with only a console.error — no toast (only the blank-overwrite guard toasts). markClean (useAutosave.js:79-82) clears dirtyRef, so the visibilitychange/pagehide/unmount/BACK flush paths (useAutosave.js:93-114) see nothing dirty and never retry the write.

**Failure scenario:** Coach edits a program, hits 'Save Program' during a transient Supabase/network failure. The upsert fails; the only signal is a console.error. The button returns to normal, the status pill goes idle (markClean), and the coach navigates BACK — flushAutosave finds dirty=false and writes nothing. All edits since the last successful autosave are silently gone, and if the editor was opened from a task handoff, the task was additionally marked done and 'linked' to the unsaved plan state.

**Proposed fix:** Propagate the result: make PlansView.handleSave return `await savePlan(plan)` (and skip markTaskCompletedByPlan on false, toasting the failure), and in PlanEditor.handleSave only markClean when onSave returned true — otherwise leave dirty so the flush paths retry, and surface the error state.

---

## 39. [MEDIUM] Orphan '+ ASSIGN PROGRAM' creates the plan under the parent couple id **[FIXED 2026-08-25]**

**Where:** `src/PlansView.jsx:4144`

**Evidence:** The orphan rows are built from trainees at the parent level (PlansView.jsx:3890-3908): for couples the coverage check spans [t.id, t.id+'__0', t.id+'__1'] but the row is pushed with `tid: t.id` (the parent). Both the table CTA (PlansView.jsx:4144 `onClick={()=>handleNewPlan(row.tid)}`) and the grid CTA (4281) pass that parent id straight into handleNewPlan, which stamps it as the new plan's traineeId (3530). Every other assignment surface in this file carefully expands couples to member ids (ShareAthleteModal 4560-4562, athleteOptions 2399, AthleteCombo 1835) because plans must reference member ids — visKeyForPlan (2604-2616) treats a suffix-less id as a solo and builds `${name}:${plan.name}` instead of the couple's `...:mN` key, and TraineeDetail/portal member flows key on the `__N` ids.

**Failure scenario:** Coach adds a new couple (e.g. two members, no program yet). The couple appears as an orphan row on the Programs page; coach clicks '+ ASSIGN PROGRAM'. A plan is created with trainee_id = the parent couple id `tr_x`. Neither member's per-member views (portal visibility keys, member-scoped plan lists, weekly-focus keys) match it, reproducing exactly the 'plans imported under wrong trainee IDs' class of data bug the couples contract exists to prevent — the coach later finds the block attached to nobody's member row.

**Proposed fix:** For couple orphans, either open a member picker before creating (mirror ShareAthleteModal's expansion) or default to `t.id + '__0'`; never pass a bare couple parent id into handleNewPlan.

---

## 40. [MEDIUM] '+ New Program' flow cannot assign an athlete who already has programs — combo navigates away, stranding an unassigned empty program **[FIXED 2026-08-25]**

**Where:** `src/PlansView.jsx:1845`

**Evidence:** The rail footer button (PlansView.jsx:4110) is titled 'Create a new, empty program — you pick the athlete inside the editor', and handleNewPlan immediately persists the blank plan (3530-3534). But the editor's only athlete control (AthleteCombo onPick, PlansView.jsx:1837-1856) branches: `if (onSwitchProgram && theirs.length) { ... onSwitchProgram(theirs[0].id); }` — for any athlete who already has ≥1 program (all ~20 real clients) it flushes and NAVIGATES to that athlete's latest block instead of assigning. The assignment branch `setPlan({...plan, traineeId: tid})` is only reachable for the explicit 'Unassigned' option, and the no-programs branch opens a 'start a NEW blank program?' prompt — also not an assignment. There is no remaining path in the editor to attach the just-created program to an existing client.

**Failure scenario:** Coach clicks '+ New Program' from the rail (per the tooltip's instruction), the blank 'New Program' is saved to the DB, then picks 'Diego Day' in the athlete combo. Instead of assigning, the editor jumps to Diego's latest existing block. The blank 'New Program' remains in the DB unassigned — accumulating as junk that only the 'Unassigned' flag filter surfaces — and the coach's intended flow silently did the wrong thing.

**Proposed fix:** When the currently open plan is unassigned (plan.traineeId === ''), make the combo pick ASSIGN (`setPlan({...plan, traineeId: tid})`) instead of navigating; keep the navigate behavior only for plans that already have an owner.

---

## 41. [MEDIUM] Session-ended broadcast doesn't cancel receivers' pending store upserts — finished session resurrects, history duplicated **[FIXED 2026-08-25]**

**Where:** `src/SessionsView.jsx:211`

**Evidence:** The receive handler is only `ch.on('broadcast', { event: 'session' }, ({ payload }) => { const v = payload?.value; if (v == null) { setSession(null); return; } ... })` (lines 211-215). It neither clears `saveTimer` nor sets `endedRef.current = true`. Meanwhile every local edit schedules a 400-500ms debounced upsert of the FULL session (mutate line 344, persist 184-187) that is only cancelled on the finishing device (line 463) — endedRef guards only the broadcast-driven persistStore path (line 199). Conversely, when a NEW session arrives via broadcast, endedRef is reset only in persist (line 178), so a device that previously finished a session keeps endedRef=true and silently drops persistStore writes for the new session.

**Failure scenario:** Two coach devices on the floor (the stated design: big screen + phone). Phone edits a set; ~200ms later the big screen taps FINISH — it writes client_workouts, deletes the `expo-gym-session` store row and broadcasts null. The phone's still-pending debounced upsert fires 400ms after its edit and re-creates the deleted row with the full finished session. Next page load, the "finished" session is back on every device with all sets still marked done; the coach taps FINISH again and every athlete's group-session history is written a second time (double-counted, trainee-visible).

**Proposed fix:** In the 'session' handler: on `v == null` clear saveTimer and set endedRef.current = true; on a non-null session set endedRef.current = false.

---

## 42. [MEDIUM] Null exercise entry in a plan day crashes the coach session surfaces (portal filters the same data) **[FIXED 2026-08-25]**

**Where:** `src/SessionsView.jsx:366`

**Evidence:** addAthletes maps the raw arrays: `const exList = (day.exercises || day.ex || []).map((ex) => { const eid = ex.exerciseId || ex.eid || ''; ... })` (lines 366-367) — a null element throws TypeError inside the async callback, so the picker's Add silently does nothing. Worse, exDetail iterates the same raw arrays at render time: `for (const ex of (d.exercises || d.ex || [])) { const eid = ex.exerciseId || ex.eid || ''` (lines 152-153) inside a useMemo — a null entry white-screens the whole Sessions view, including when RESUMING a persisted live session. WorkoutsView.startWorkout has the same hole (`day.ex.map(e => ({ id: e.id || uid(), ...`, lines 355-363). ClientPortal defends against exactly this state: `rawList = (...).filter(Boolean)` with the comment "a null day / exercise / warm-up element (corrupt Drive import, half-deleted editor row, offline partial) would otherwise throw" (ClientPortal.jsx 153-160) — i.e. this data state has occurred in production.

**Failure scenario:** A plan day contains one null exercise element (half-deleted editor row / corrupt import — the case the portal already survives). Coach adds that athlete to a group session: nothing happens (unhandled rejection). If the session was already running when planDays loads that plan, the exDetail useMemo throws and the entire live floor screen crashes mid-session.

**Proposed fix:** Apply `.filter(Boolean)` at the same three seams (addAthletes exList, exDetail loop, startWorkout dayExercises). Note the portal also filters, so filtering keeps the positional `ei` sync contract aligned.

---

## 43. [MEDIUM] Full-session broadcast is last-writer-wins — concurrent edits on two coach devices silently revert each other **[FIXED 2026-08-25]**

**Where:** `src/SessionsView.jsx:342`

**Evidence:** Every coach edit rebroadcasts the ENTIRE session and every receiver overwrites wholesale: `chanRef.current?.send({ type: 'broadcast', event: 'session', payload: { value: draft } })` (line 342) and `if (Array.isArray(v.athletes)) setSession(v)` (line 214). There is no merge or versioning on the coach-mirror channel; only the portal-facing gym-set events are granular. Check-in toggles, curEx, add/remove and the last ~100ms of keystrokes exist only in the sender's full snapshot.

**Failure scenario:** Big screen coach is typing athlete X's load while the phone coach taps CHECK IN on athlete Y (multi-device floor is the stated design). The phone's full-state broadcast — built before the last keystroke arrived — lands on the big screen and setSession(v) reverts the keystroke mid-typing (input visibly flickers/loses a digit); symmetrically the big screen's next keystroke broadcast reverts Y's check-in on the phone. The shared debounced store upsert then persists whichever device wrote last, so one of the two changes is also lost durably until re-entered.

**Proposed fix:** Send granular events (check-in, curEx, roster ops) on the coach channel like athlete-set, or merge incoming full state field-wise instead of replacing.

---

## 44. [MEDIUM] UTC date defaults mis-date weigh-ins/payments/evals logged after midnight Israel time; BwAddRow's max blocks picking the real 'today' **[FIXED 2026-08-25]**

**Where:** `src/TraineeDetail.jsx:108`

**Evidence:** BwAddRow: line 108 `useState(() => new Date().toISOString().slice(0, 10))` and line 128 `max={new Date().toISOString().slice(0, 10)}` use the UTC date. Same UTC slice for the payment form default (TraineeDetail.jsx:220 and the resets at 264/811/818), EvaluationEditor.jsx:355 `existing?.eval_date || new Date().toISOString().slice(0, 10)`, and TraineesView.jsx:357 startDate. The repo's own convention elsewhere is local: MealLogger.jsx:20-24 and ChallengesView.jsx:279 build the day from getFullYear/getMonth/getDate specifically to avoid this.

**Failure scenario:** Israel is UTC+2/+3. Any weigh-in, payment or evaluation entered between 00:00 and 02:00/03:00 local defaults to YESTERDAY's date and is saved mis-dated unless the coach notices. Worse, BwAddRow's `max` is also the UTC date, so during that window the date picker refuses to select the actual local today at all — the coach cannot enter a correctly-dated weigh-in.

**Proposed fix:** Use a local-date helper (same construction as MealLogger.todayISO) for all four default/max sites.

---

## 45. [MEDIUM] New Bnei Herzliya athlete silently saved with '8 Sessions' package and sessionsRemaining 8 — hidden billing fields are never cleared **[FIXED 2026-08-25]**

**Where:** `src/TraineesView.jsx:958`

**Evidence:** Tonight's change hides the fields but not the values: line 958 `{form.format !== 'Bnei Herzliya' && <Select label="Package" ...>}` / line 959 hides Sessions Remaining — yet defaultTrainee() (lines 354-359) initializes `package: "8 Sessions", sessionsRemaining: 8`, the '+ Add Athlete → Bnei Herzliya' menu item (lines 691-695) spreads `{...defaultTrainee(), format}`, and handleSave (lines 584-599) writes the form verbatim with no strip for BH. TrainingBlock (lines 236, 253-254: `hasSessions = sessionsRemaining != null && sessionsRemaining > 0` → `{sessionsRemaining} SESSIONS LEFT`) then renders it.

**Failure scenario:** Coach adds a Bnei Herzliya player via the roster's add menu and saves. The row persists package='8 Sessions', sessionsRemaining=8, and the athlete card shows '8 SESSIONS LEFT' for a club athlete whose card explicitly says 'Club athlete — no billing'. Converting an existing paying client to BH format likewise freezes and keeps their old package/sessions/price values invisible-but-live. The TraineeDetail EditTraineeModal (TraineeDetail.jsx:1253-1256) still exposes Package/Sessions/Monthly/Per-Session for BH athletes with no hiding at all, so the two editors of the same record now disagree.

**Proposed fix:** In handleSave, when format === 'Bnei Herzliya' delete/null package, sessionsRemaining, packagePrice, monthly, perSession before saving; apply the same hiding in TraineeDetail's EditTraineeModal.

---

## 46. [MEDIUM] BHBC membership drift: roster-added 'Bnei Herzliya' athletes never reach the BHBC zone/coach sync (format vs team vs branch three-field split) **[FIXED 2026-08-25]**

**Where:** `src/TraineesView.jsx:691`

**Evidence:** The add menu (TraineesView.jsx:691-695) creates the athlete with `format: 'Bnei Herzliya'` only — no `team: 'BHBC'`. But the BHBC zone roster (BhbcView.jsx:153 `trainees.filter(t => t.team === 'BHBC' ...)`) and the owner→coach roster projection (App.jsx:732, same `t.team === 'BHBC'` filter feeding the `expo-bhbc-roster` store key) key exclusively on `team`. Conversely BhbcView's own add (BhbcView.jsx:573-575) sets `team: 'BHBC'` but no format/branch, and the roster's 'Bnei Herzliya' format filter (TraineesView.jsx:472, 501) checks only `t.format === 'Bnei Herzliya' || t.branch === 'Bnei Herzliya'`. PlansView.jsx:3323 already had to accept all three markers.

**Failure scenario:** Coach adds a new BHBC player from the athletes roster ('+ Add Athlete → Bnei Herzliya'). The player never appears in the /bhbc zone, is never synced into expo-bhbc-roster for the club coaches, and gets no ACWR/load tracking. A player added inside the BHBC zone instead doesn't show under the roster's 'Bnei Herzliya' format filter and its count. Two creation paths, mutually invisible results.

**Proposed fix:** Pick one canonical marker (team === 'BHBC') and set it in the TraineesView add path (plus format for display); make the roster filter accept team as PlansView does.

---

## 47. [MEDIUM] Couple card per-member bodyweight sparklines can never show data — they filter sub-member IDs that no writer ever produces **[FIXED 2026-08-25]**

**Where:** `src/TraineesView.jsx:733`

**Evidence:** TraineesView.jsx:733-742 filters `b.clientId === subMemberId(t.id, 0)` / `subMemberId(t.id, 1)` for the two member sparklines. But every bw writer keys the PARENT id: the athlete portal writes `clientId: ci` (ClientPortal.jsx:2364 and 2823) where ci = clientTrainee.id and my_trainee() 'returns the PARENT row' for couple members (scripts/migrations/2026-07-19-realtime-private-channels.sql:36); the coach's BwAddRow writes `clientId: trainee` — the parent — (TraineeDetail.jsx:851). Verified live: bw_logs has 31 rows, ZERO with a `__N` sub-id (read-only DB audit). No code path can produce the rows this UI reads.

**Failure scenario:** Any of the four couples on the roster (tr_moshe_dana, tr_miya_hilk, tr_neta_tom, tr_limor_daniel) logs bodyweight from their portal, or the coach adds a weigh-in on their detail page. The entry lands parent-keyed: the detail-page chart shows it (tBw uses traineeIdsFor), the portal shows it, but the roster card's per-member BODYWEIGHT section stays 'NO LOGS' forever for both members — the coach reads 'couple never weighs in' while data exists. The per-member split is fiction: both members' weights also mix into one parent-keyed series with no member attribution anywhere.

**Proposed fix:** Either fall back to parent-keyed entries on the couple card (one shared sparkline, matching reality), or make bw writes member-attributed (portal member picker writing subMemberId) before rendering a per-member split.

---

## 48. [MEDIUM] Range-of-motion card reads from the velocity-filtered Bar-Speed vault, so ROM trends for ballistic and symmetry-only lifts are invisible **[FIXED 2026-08-25]**

**Where:** `src/TrainingLineageV2.jsx:368`

**Evidence:** Line 368: `const romLifts = useMemo(() => (vault || []).filter((l) => l.entries.some((e) => e.maxRom != null)), [vault]);` where `vault = getAthleteVault(traineeId)`. getAthleteVault (poseMetricsStore.js:181) filters `.filter((l) => l.count > 0 && l.hasVel && isVelocityLossLift(l.title))` — explicitly a BAR SPEED filter. But savePoseMetric stores `maxRom` for ballistic lifts too (velocity is nulled at line 77, `maxRom` kept at line 87, entry stored when `asymRows` exists), and its own comment says "the injury screen must still cover machine/ROM-only work".

**Failure scenario:** Athlete films box jumps / pogos, or a machine lift where the bar-velocity read failed but L/R symmetry succeeded. savePoseMetric stores real per-set `maxRom` entries, yet the "Range of motion" card shows "No ROM read yet" (or omits those lifts) because `hasVel` is false / `isVelocityLossLift` is false — the stored ROM data is unreachable in the UI. The card's caption ("Peak working range per filmed lift") claims coverage it silently doesn't have.

**Proposed fix:** Build romLifts from the full store (e.g. add an unfiltered `getAthleteRomLifts(clientId)` in poseMetricsStore that only requires `entries.some(e => e.maxRom != null)`), instead of deriving from the BAR SPEED-filtered vault.

---

## 49. [MEDIUM] Compare flow revokes the first clip's live blob URL, killing it on any later remount **[FIXED 2026-08-25]**

**Where:** `src/TrySandbox.jsx:78`

**Evidence:** useEffect(() => { return () => { if (videoUrl) try { URL.revokeObjectURL(videoUrl); } catch {} if (secondUrl) try { URL.revokeObjectURL(secondUrl); } catch {} }; }, [videoUrl, secondUrl]); — the cleanup runs with the PREVIOUS closure values on every dep change, so when only secondUrl changes it revokes the still-in-use videoUrl.

**Failure scenario:** On /try: pick exercise → upload clip 1 → ANALYZE → COMPARE → upload clip 2. setSecondUrl(B) changes the deps, cleanup fires with prev [A, null] and revokes clip 1's blob URL A while it is still the active primary clip. Clicking '← BACK' (or re-entering Compare) remounts SandboxPlayer with src=A, which is now a revoked blob: the video errors and renders a dead black player. The first clip is permanently unplayable for the rest of the session.

**Proposed fix:** Revoke only the URL that actually changed: keep prev-value refs, or split into two effects (one per URL) that revoke the previous value of that URL only.

---

## 50. [MEDIUM] Pose-detection loop spawns an extra permanent detect chain per seek (plus a doubled initial chain) **[FIXED 2026-08-25]**

**Where:** `src/TrySandbox.jsx:1846`

**Evidence:** if (typeof v.requestVideoFrameCallback === 'function') v.requestVideoFrameCallback(detect); else rafRef.current = requestAnimationFrame(detect); detect(); ... v.addEventListener('seeked', detect); v.addEventListener('loadeddata', detect); — detect() unconditionally re-schedules itself at the end of every invocation, so each extra entry point starts another self-perpetuating rVFC chain that never dies until the effect re-runs.

**Failure scenario:** Visitor on /try scrubs the timeline: every 'seeked' event calls detect directly, which then schedules its own next requestVideoFrameCallback — after N seeks there are N+2 parallel detection chains, each running MediaPipe detectForVideo (lastTs = max(now, lastTs+0.001) always passes the ts>lastTs guard, so none dedupe). The frameTick%2 skip is shared, so ~half of all chains do a full pose inference on every frame — CPU load grows with every scrub and the public demo grinds/heats phones until POSE/REPS is toggled.

**Proposed fix:** Use a single scheduler: have seeked/loadeddata set a 'needsFrame' flag or only (re)schedule via one guarded token (e.g. cancel/replace a stored rVFC handle), and drop the extra direct detect() after the initial schedule.

---

## 51. [MEDIUM] 'NOW SEE THE COACH VIEW →' CTA on /try links back to /try itself (self-link dead end) **[FIXED 2026-08-25]**

**Where:** `src/TrySandbox.jsx:2030`

**Evidence:** const secondHref  = isCoach ? '/demo' : '/try'; const secondLbl   = isCoach ? 'NOW SEE THE ATHLETE VIEW →' : 'NOW SEE THE COACH VIEW →'; — TrySandbox defaults pov='trainee' and App.jsx line 562 mounts <TrySandbox /> (no pov) for /try, so isCoach is always false on every live mount.

**Failure scenario:** Visitor on /try (athlete POV engine) finishes the Analyze or Compare step and clicks the funnel CTA 'NOW SEE THE COACH VIEW →'. They navigate to /try — the exact same athlete-POV page, reset to step 1 — and never reach the coach demo. The coach-view leg of the conversion funnel is unreachable from this CTA; it should point at /demo/coach.

**Proposed fix:** Change the trainee branch to secondHref='/demo/coach'. (The isCoach branch's '/demo' target is also wrong for its 'ATHLETE VIEW' label — should be '/demo/athlete' — but that branch is currently unreachable.)

---

## 52. [MEDIUM] Failed payments read strands the entire coach app on the loading splash **[REFUTED on verify]**

**Where:** `src/useBitPayments.js:61`

**Evidence:** reload(): `if (error) { console.warn('useBitPayments reload failed:', error.message); return; }` — setLoaded(true) is only reached on success. App.jsx:1320 gates the whole coach UI on `const storesReady = tL && wL && pyL && pL && cwL && bwL;` and returns the 'Loading data...' splash otherwise, with the comment (1318-1319) 'All loaded flags flip true on failure too, so a failed read can't strand this splash' — true for useSupaStore (setLoaded(true) sits outside the try/catch, useSupaStore.js:218) but false for useBitPayments. The realtime channel only fires on table changes, so nothing retries.

**Failure scenario:** One transient network error or RLS hiccup on the bit_payment_requests SELECT at boot → pyL stays false forever → the coach (or Yuval) is stuck on the 'Loading data...' screen with no error and no retry until a full page refresh. A persistent policy error bricks the app entirely.

**Proposed fix:** setLoaded(true) in a finally block (keep rows empty), optionally exposing a loadError like useSupaStore does.

**Verifier:** Already fixed in current code (commit 2429368). useBitPayments.js:60-66: the error branch now calls setLoaded(true) before returning, with the comment 'a transient read failure must not strand the loading splash (audit 08-22)'. The App.jsx storesReady gate can no longer be stranded by a failed bit_payment_requests read.

---

## 53. [MEDIUM] Empty day.exercises[] shadows populated day.ex[] — hybrid days render as 'No exercises' **[FIXED 2026-08-25]**

**Where:** `src/WeeklyFocusTool.jsx:26`

**Evidence:** resolveDay (WeeklyFocusTool.jsx:26): `const rawList = Array.isArray(d.exercises) ? d.exercises : (Array.isArray(d.ex) ? d.ex : []);` — an empty `d.exercises: []` array wins over a populated compact `d.ex`. This mirrors ClientPortal.jsx:160 (same expression), so the athlete portal has the identical flaw. normalizeDays (usePlansStore.js:14-22) explicitly documents this exact state as real ('a hybrid/partial-write state') and prefers whichever array HAS exercises, so the coach's editor shows the day's content while WeeklyFocusTool — and the athlete's portal — show nothing for the same day.

**Failure scenario:** A drive-imported or partially-migrated plan carries a day with `{ exercises: [], ex: [{eid, s, r}, ...] }`. Coach opens the Review page's Weekly Focus tool to leave a focus for that athlete: the day renders 'No exercises', so no focus can be attached — while opening the same plan in the editor shows a fully populated day. On the athlete seat the same day appears empty in the portal.

**Proposed fix:** Use the normalizeDays preference in both mirrors: `const trainerArr = Array.isArray(d.exercises) ? d.exercises : null; const compact = Array.isArray(d.ex) ? d.ex : null; const rawList = (trainerArr && trainerArr.length) ? trainerArr : (compact && compact.length) ? compact : (trainerArr || compact || []);` — updating ClientPortal.jsx:160 in the same change since the two must stay in sync.

---

## 54. [MEDIUM] Couple members' plans invisible in the in-person session picker — flow silently missing for couples **[FIXED 2026-08-25]**

**Where:** `src/WorkoutsView.jsx:521`

**Evidence:** visiblePlans requires `activeTraineeIds.has(p.traineeId)` (line 521) where activeTraineeIds is built from trainee ROW ids (line 515). Couples are one trainee row (traineeUtils.js: "Couples are represented as a single trainee row") and their plans are assigned to sub-member ids `tr_x__0`/`tr_x__1` (per the standing couple rule), which are never in that set — so those plans are filtered out entirely. The group-session picker handles this correctly via `traineeIdsFor` (SessionsView.jsx 691-692); WorkoutsView never calls it. Additionally, if such a plan were ever started, startWorkout sets `traineeId: fullPlan.trainee_id` (line 375, the member id) while the portal's channel and history use the parent id (ClientPortal.jsx 639 `'gym-set:' + clientId`, 2307 `w.clientId === ci`), so live sync and portal history would both miss.

**Failure scenario:** Coach opens Sessions → Single (or the Workouts picker) to log an in-person session for Neta or Tom (couple with per-member plans): the athlete either doesn't appear at all or appears with no plans (the row name lookup `trainees.find(t=>t.id===tid)` at line 564 also returns undefined for member-id groups, yielding a nameless row). The coach cannot start the session; group session is the only working path for couples.

**Proposed fix:** Build visiblePlans/plansByTrainee against traineeIdsFor(t.id) and normalize the workout's traineeId to the parent id (split on '__') so channel + client_workouts match the portal.

---

## 55. [MEDIUM] Cue precedence inverted in single logger — library cue overrides the coach's plan-specific note **[FIXED 2026-08-25]**

**Where:** `src/WorkoutsView.jsx:144`

**Evidence:** `const cue = ex.q || exData?.cues || ex.notes;` (line 144). `ex.q` never exists on this view's workout exercises (the startWorkout mapping produces `notes`, lines 355-363), so this resolves library cues BEFORE the plan row's note. Both sibling surfaces give the plan note precedence: SessionsView.jsx 159 `cue: ex.notes ?? ex.n ?? lib?.cues ?? ''` and the portal (plan `n` wins over library `q`, including the explicit nCleared "coach cleared this note" state, ClientPortal.jsx 256-260).

**Failure scenario:** Coach writes an athlete-specific note on a plan row (e.g. a rehab constraint) that differs from the generic library cue, then logs that athlete 1-on-1: the logger's CUE block shows the generic library cue instead of the athlete-specific instruction. A note the coach explicitly cleared on the plan also resurfaces as the library cue.

**Proposed fix:** Reorder to `ex.notes || ex.q || exData?.cues` (and honor notesEdited/cleared if present), matching SessionsView and the portal.

---

## 56. [MEDIUM] completeWorkout has no re-entrancy guard — double-tap writes duplicate history and decrements the paid session count twice **[FIXED 2026-08-25]**

**Where:** `src/WorkoutsView.jsx:479`

**Evidence:** `const completeWorkout = () => { const w = active; if (!w) return; ... if (w.traineeId) onDecrementSession(w.traineeId); ... setClientWorkouts(prev => [...prev, row]); setActive(null); }` (lines 479-504). Nothing blocks a second invocation before the setActive(null) re-render commits. Both sibling surfaces guard exactly this: ClientPortal.jsx 382 `submittingRef` ("guards Complete-Workout against a double-tap minting two workout rows" — i.e. this failure was observed) and SessionsView.jsx 98/423 `finishingRef` (audit #1, same rationale).

**Failure scenario:** Coach double-taps "Complete Workout" on a laggy phone at the end of an in-person session: two client_workouts rows with different ids are appended (duplicate history in the athlete's portal, double-counted by analysis) and onDecrementSession runs twice — the athlete's remaining paid sessions drop by 2 for one session.

**Proposed fix:** Add the same ref guard the other two surfaces use (completingRef.current check/set around the body).

---

## 57. [LOW] recallSession is dead code: anon key cannot SELECT chat_logs under RLS, so server-side chat memory never works **[DISABLED + DOCUMENTED 2026-08-25]**

**Where:** `expo-il/api/chat.js:24`

**Evidence:** api/chat.js:27-35 fetches `${SUPA_URL}/rest/v1/chat_logs?session_id=eq...` with `'apikey': SUPA_PUBLISHABLE_KEY / Authorization: Bearer <publishable>` (anon role). But scripts/migrations/2026-05-02-chat-logs.sql grants `GRANT SELECT ON public.chat_logs TO authenticated` only (anon gets INSERT + sequence), and the only SELECT policy is `chat_logs_trainer_select ... TO authenticated USING (auth.jwt()->>'email' = 'ohadyproductions@gmail.com')` (re-asserted in 2026-05-03-chat-logs-rls-fix.sql). Anon SELECT is denied → `r.ok` is false → recallSession returns [] on line 36 every time.

**Failure scenario:** A returning visitor reloads the page and sends a fresh message with the same-session flow (cleanMessages.length <= 2 at chat.js:236); the intended prior-turn recall silently returns nothing, so the advertised "returning visitor isn't talking to a stranger" behavior never functions. No error is surfaced anywhere, so the breakage is invisible. (The RLS itself is correct — this is the feature being built on a key that can't read the table.)

**Proposed fix:** Either drop recallSession (and the sessionId round-trip cost) or perform the read server-side with the secret service key / a scoped RPC; keep anon strictly INSERT-only.

---

## 58. [LOW] Prerendered /programs/<id>.html pages emit invalid currency "NIS" in Product structured data — the fix applied in the SPA never reached the crawlable pages **[FIXED 2026-08-25]**

**Where:** `expo-il/scripts/generate-program-pages.mjs:83`

**Evidence:** generate-program-pages.mjs:83 `priceCurrency: p.currency,` and line 113 `<meta property="product:price:currency" content="${p.currency}" />` with every program's currency being 'NIS' (confirmed in dist/programs/foundation-12.html: `"priceCurrency":"NIS"`). The client-side equivalent was already corrected in src/App.jsx:2665: `priceCurrency: (program.currency || 'NIS') === 'NIS' ? 'ILS' : program.currency, // ISO 4217 for schema (Google rejects "NIS")`.

**Failure scenario:** Google and WhatsApp scrapers only ever see the static /programs/<id>.html pages (that's their entire purpose per the file header comment). "NIS" is not a valid ISO-4217 code, so the Product/Offer rich result is rejected on exactly the pages search engines index, while the never-crawled SPA route carries the correct 'ILS'. Price-rich search snippets silently never appear.

**Proposed fix:** Apply the same NIS→ILS mapping in pageHtml() for both the JSON-LD offer and the product:price:currency meta, then rebuild.

---

## 59. [LOW] Browser tab title stays in the previous language after the EN/HE toggle **[FIXED 2026-08-25]**

**Where:** `expo-il/src/App.jsx:3126`

**Evidence:** App.jsx:3124-3126: `useEffect(() => { document.title = t(docTitleKey, docTitleVars); }, [docTitleKey, docTitleVars && docTitleVars.title]);` — the effect's deps omit the language. `t` resolves per current lang, and setLang() forces a re-render, but since docTitleKey and the title var are unchanged the effect is skipped, so document.title is not re-evaluated.

**Failure scenario:** Visitor lands on the Hebrew catalog (title 'EXPO · אימון אונליין'), clicks the EN toggle in the nav: the whole page switches to English but the tab title remains Hebrew (and vice versa) until the next route change. Wrong-language title also persists into the /en share/bookmark the toggle deliberately creates via pushState.

**Proposed fix:** Add the current lang (from useLang) to the effect dependency array.

---

## 60. [LOW] Skip-link on standalone routes (gym, chooser) navigates the user to the catalog instead of skipping to content _[unverified]_

**Where:** `expo-il/src/App.jsx:3206`

**Evidence:** App.jsx:3206 `<a className="fv-skip" href="#programs">Skip to content</a>` is rendered unconditionally for every route, including isStandalone ones. parseHash (App.jsx:69) maps 'programs' to `{ view: 'home', scrollTo: 'programs' }` because 'programs' is in HOME_SECTIONS — and no element with id="programs" exists on the gym or chooser pages.

**Failure scenario:** A keyboard or screen-reader user on #/gym presses Tab (the skip-link is the first focusable element) and activates it: the hash becomes '#programs', the route flips to view:'home', and they are teleported off the gym page onto the catalog — losing the page they were on instead of skipping its header. Same on the entry chooser.

**Proposed fix:** Render the skip-link only on non-standalone routes, or point it at an id that exists on the current route (e.g. #main).

---

## 61. [LOW] Gym page hardcodes Instagram handle @expo_il, bypassing the declared single source of truth (CONTACT.instagram = @ohadaptable) **[CONFIRMED — needs Ohad: is @expo_il the gym’s own account? Not a code fix]**

**Where:** `expo-il/src/Gym.jsx:725`

**Evidence:** Gym.jsx:725 and :952 hardcode `href={`https://instagram.com/expo_il`}` / `href="https://instagram.com/expo_il"`, while theme.js:40-48 declares CONTACT as the "Single source of truth for outbound contact links" with `instagram: 'https://www.instagram.com/ohadaptable/'` — which the online-side footer, contact section, and index.html Organization sameAs all use.

**Failure scenario:** Two different Instagram identities are published from the same brand site. If @expo_il is not a live account (it appears nowhere else in the repo, unlike @ohadaptable), the gym page's two Instagram links 404 for every visitor; if it is real, any future handle change edited in the CONTACT single source silently leaves the gym page pointing at the stale/other account — the exact drift the CONTACT object exists to prevent.

**Proposed fix:** Route both Gym.jsx links through CONTACT.instagram (or add a CONTACT.instagramGym entry if the gym genuinely has its own account).

---

## 62. [LOW] Monotony blind spot: sd=0 with positive load returns null, so a maximally monotonous week is never flagged **[FIXED 2026-08-25]**

**Where:** `src/acwrEngine.js:91`

**Evidence:** Line 91: `const monotony = sd > 0 ? mean / sd : null;` — identical non-zero daily loads (sd=0) yield monotony null, and CoachBrief line 1149 filters `r.ms.monotony != null && r.ms.monotony >= 2`, so the flag can never fire. Mathematically sd→0 with mean>0 is the HIGHEST monotony (Foster's metric diverges), not 'no data'.

**Failure scenario:** Training-camp week: the coach bulk-logs the same team practice (same minutes × same team RPE via logTeamSession/savePractice) for 7 consecutive days — every athlete's 7 daily loads are identical, sd=0, monotony=null, and the S&C Brief's 'Vary the stimulus' warning (the exact situation it exists for) never appears.

**Proposed fix:** When n>0, mean>0 and sd===0, return a sentinel high monotony (e.g. Infinity or a capped value like 10) so downstream `>= 2` checks flag it.

---

## 63. [LOW] Legacy /coaches/try renders CoachLanding while the URL is rewritten to /demo/coach **[REFUTED on verify]**

**Where:** `src/App.jsx:576`

**Evidence:** The redirect effect (App.jsx:498) `if (path === '/coaches/try' || path === '/coaches/demo/coach') { window.history.replaceState(null, '', '/demo/coach'); }` runs AFTER render and replaceState triggers no re-render. During that same render, '/coaches/try' fails the '/demo/coach' checks (line 564) and falls into `if (path === '/demo' || path === '/demo/' || path.startsWith('/coaches'))` (line 576) → CoachLanding. All other legacy paths ('/coaches/demo/coach', '/coaches/demo', '/coaches/demo/trainee') have matching render branches; '/coaches/try' is the only one without.

**Failure scenario:** A visitor opens a shared legacy link expo-app.co.il/coaches/try expecting the interactive coach demo. They get the marketing landing page instead, with the address bar showing /demo/coach — and refreshing then shows different content (the real CoachDemo) than what was on screen.

**Proposed fix:** Add `path === '/coaches/try'` to the CoachDemo render branch at line 564, or perform the legacy rewrite before first render (module scope / useState init) instead of in an effect.

**Verifier:** Already fixed: App.jsx:564 now includes `path === '/coaches/try'` in the CoachDemo render branch, with a comment (lines 565-567, 'audit 08-22') explaining exactly this first-render gap. /coaches/try renders CoachDemo on the same render the replaceState rewrite happens.

---

## 64. [LOW] BHBC coach's /coach/bhbc URL is rewritten to /coach/dashboard, killing the branded login and bookmarks **[REFUTED on verify]**

**Where:** `src/App.jsx:1063`

**Evidence:** The staff deep-link correction effect runs for every non-owner coach: `if (r.mode === 'coach' && r.tab && !STAFF_TABS.includes(r.tab) && window.location.pathname !== '/coach/dashboard') { setTab('dashboard'); window.history.replaceState(null, '', '/coach/dashboard'); }` — 'bhbc' is not in STAFF_TABS ('dashboard','tasks') and isBhbcCoach is not exempted, so every BHBC coach session at /coach/bhbc gets its URL replaced. The BHBC-branded LoginScreen requires the exact path: `const isBhbcPath = path === '/coach/bhbc' || path === '/coach/bhbc/'` (App.jsx:589).

**Failure scenario:** A Bnei Herzliya coach signs in at /coach/bhbc (the club-branded door). On mount the URL silently becomes /coach/dashboard. When their session expires or they sign out, they land on /coach/dashboard → the signed-out AuthGate replaces to /login and shows the generic EXPO login instead of the club-branded one; their /coach/bhbc bookmark is destroyed every session. Same-URL sharing between coaches propagates the wrong door.

**Proposed fix:** Exempt BHBC coaches in both staff URL-guard effects: `if (isBhbcCoach) return;` (their whole surface is the zone; keep /coach/bhbc as their canonical URL), or add 'bhbc' to the allowed tabs for isBhbcCoach.

**Verifier:** Already fixed: both staff URL-guard effects now start with `if (isBhbcCoach) return;` (App.jsx:1055 and 1076), with comments citing 'audit 08-22' — a BHBC coach's /coach/bhbc URL is never rewritten, so the branded login path and bookmarks survive.

---

## 65. [LOW] Stored portal choice swallows same-tab /coach deep links — push-notification clicks land dual-role users in the athlete portal **[REFUTED on verify]**

**Where:** `src/App.jsx:838`

**Evidence:** portalChoice initializer: `const stored = sessionStorage.getItem(PORTAL_CHOICE_KEY); if (stored) return stored;` — the /coach URL bypass below it only runs when nothing is stored. With stored==='client', a full navigation to any /coach/* URL renders ClientPortal (isClient true) and the redirect effect at line 960 `if (isClient && !onAthlete) window.history.replaceState(null, '', '/athlete')` erases the requested coach URL. sw.js notificationclick performs exactly such a same-tab navigation: `await client.navigate(targetUrl)` (sw.js:101).

**Failure scenario:** Ohad (dual-role) last used the athlete side in his PWA (sessionStorage choice='client'). A coach push notification arrives with url '/coach/review'; tapping it focuses the existing window and navigates it to /coach/review — the app boots, reads the stored 'client' choice, renders the athlete portal, and rewrites the URL to /athlete. The notification's deep link is silently discarded; the coach never reaches the review it pointed at.

**Proposed fix:** In the initializer, let an explicit /coach or /athlete path OVERRIDE the stored choice (URL intent is newer than the sticky preference), writing the new side to sessionStorage.

**Verifier:** Already fixed: the portalChoice initializer (App.jsx:841-852) now checks the URL FIRST — a path starting with /coach forces 'trainer' (and /athlete forces 'client') and persists it to sessionStorage before ever consulting the stored choice, with a comment naming the push-notification scenario ('audit 08-22'). A coach deep link can no longer be swallowed by a stale 'client' preference.

---

## 66. [LOW] Auto-tasks moved to working/waiting/stuck never auto-resolve when their condition clears **[REFUTED on verify]**

**Where:** `src/autoTasks.js:655`

**Evidence:** Phase B: `const openOfKind = (existingRows || []).filter(r => r.auto_kind === rule.kind && r.status === 'open');` — only status 'open' rows are eligible for resolve(). TasksV8View's 6-state StatusPill (STATUS_CYCLE, and auto rows rendered with an editable pill at lines 2683-2693) lets the coach set an auto-alert to 'working'/'waiting'/'stuck', which removes it from the resolve pool permanently. The (auto_kind, auto_ref) row still exists so detect won't re-insert, and body patches also skip non-open rows.

**Failure scenario:** Coach sets 'Chase payment from X' to In Progress. The athlete pays the next day. The task's condition is gone, but because status !== 'open' it is never auto-closed and never re-worded — a stale 'chase payment' directive with outdated day counts sits in the queue indefinitely until manually closed.

**Proposed fix:** Treat any non-terminal status (open/working/waiting/stuck) as resolvable in Phase B, or at minimum working/waiting.

**Verifier:** Already fixed in current code (commit 2429368). autoTasks.js:668-673: Phase B now filters ['open', 'working', 'waiting', 'stuck'].includes(r.status) — exactly the fix the claim proposed, with the comment 'an In-Progress chase payment must die when the athlete pays (audit 08-22)'. An in-progress auto-task whose condition clears is auto-closed.

---

## 67. [LOW] coach_notes auto-rows read is unordered with a 2000-row cap — idempotency degrades once history exceeds it **[REFUTED on verify]**

**Where:** `src/autoTasks.js:593`

**Evidence:** `.not('auto_kind', 'is', null).limit(2000)` with no .order(). Done auto-tasks are never deleted (Phase B only flips status to 'done'), so the auto-row population grows monotonically. Once it passes 2000, PostgREST returns an arbitrary 2000-row subset: byKey misses existing (kind, ref) pairs → duplicate INSERTs are attempted every sync (swallowed by the unique index, but each is a failed round-trip), and — worse — OPEN rows missing from the subset are invisible to Phase B, so resolved conditions nondeterministically stop auto-closing.

**Failure scenario:** After enough months of accumulated done auto-tasks (9 rules × ~20 clients × daily churn), the table crosses 2000 auto rows. Some syncs silently skip resolving a subset of open tasks and hammer the unique index with dup inserts; which tasks are affected varies per query plan.

**Proposed fix:** Order by status/created_at so open rows are always in the window (e.g. .order('status') open-first), or purge/limit done auto rows, or filter the read to status='open' plus a bounded recent-done window.

**Verifier:** Already fixed in current code (commit 2429368). autoTasks.js:598-603 now orders the read: .order('status', { ascending: false }).limit(2000). Descending text order sorts working > waiting > stuck > open > done > cancelled, so every non-terminal row lands in the 2000-row window before any done/cancelled history — open rows can no longer fall out of the resolve pool, which was the concrete harm claimed. (Done-row growth can still cause dup-insert round-trips past 2000, but the resolver blind spot — the actual defect — is closed.)

---

## 68. [LOW] Missing startDate renders 'Infinityd since signup' in the payment-overdue task body **[REFUTED on verify]**

**Where:** `src/autoTasks.js:374`

**Evidence:** `const since = daysAgo(t.startDate); if (since >= 21) { out.push({ ... body: `Chase payment from ${bidi(t.name)} · never paid · ${since}d since signup...` }) }` — daysAgo (line 33) returns Infinity when iso is falsy, Infinity >= 21 passes, and the template interpolates 'Infinityd since signup'. Same Infinity leaks into ruleAtRiskSilent's sinceStart guard (line 217) where it silently passes the <14 check.

**Failure scenario:** An Active trainee imported without a startDate and with no recorded payments gets a dashboard task reading 'Chase payment from ⁨X⁩ · never paid · Infinityd since signup', and the body-patch pass keeps rewriting it with the same string every sync.

**Proposed fix:** Guard: skip the never-paid branch (or omit the day count) when t.startDate is missing/unparseable.

**Verifier:** Already fixed in current code (commit 2429368). autoTasks.js:378-383: the body template now guards the interpolation — `never paid${Number.isFinite(since) ? ` · ${since}d since signup` : ''}` — so a missing startDate still fires the chase task (intended) but never renders 'Infinityd'. The secondary at_risk_silent mention was never a bug: Infinity < 14 is false at line 222, so a startDate-less trainee simply isn't skipped, which is the correct conservative behavior.

---

## 69. [LOW] next_block_due resolve is not couple-aware — task never auto-closes if the next block is filed under a different member id **[REFUTED on verify]**

**Where:** `src/autoTasks.js:131`

**Evidence:** detect matches plans couple-wide: `plans.filter(p => traineeIdsFor(t.id).includes(p.traineeId))` (line 86), but resolve requires an exact id match: `const newer = plans.find(p => p.traineeId === currentPlan.traineeId && ...)` (lines 130-133). For a couple (tr_x / tr_x__0 / tr_x__1), a current block under tr_x__0 whose successor is created under tr_x (parent) or the plan-editor default id never satisfies resolve, so the 'Build next block' task stays open even though the block shipped.

**Failure scenario:** Neta+Tom couple: current block assigned to tr_x__0; coach creates the next block and it lands under the parent tr_x (the historical shared-assignment pattern that exists in the data). resolve() finds no newer plan with traineeId === 'tr_x__0' — the BLOCK ENDING task persists forever and the coach keeps seeing a stale 'Build Block #N+1' card.

**Proposed fix:** In resolve, compare against traineeIdsFor(parseTraineeId(currentPlan.traineeId)?.parentId || currentPlan.traineeId) the way detect does.

**Verifier:** Already fixed in current code (commit 2429368). autoTasks.js:130-138: resolve now uses familyOf = (tid) => String(tid || '').split('__')[0] and matches `familyOf(p.traineeId) === familyOf(currentPlan.traineeId)`, so a successor block filed under the parent id or the other member suffix (tr_x vs tr_x__0/tr_x__1) closes the task. Comment on-site: 'match the same FAMILY, not the exact id (audit 08-22)'.

---

## 70. [LOW] Session edit/delete indices go stale when the sessions array mutates — wrong session edited or deleted _[unverified]_

**Where:** `src/BhbcView.jsx:806`

**Evidence:** Activity rows carry `sess: { date, idx }` captured from the render-time enumeration of `rec.sessions[date]` (line 667), and deleteSession splices by that idx (line 246 `arr.splice(idx, 1)`), guarded only by existence (`!rec.sessions[date][idx] return prev`). The open-edit state `editSess` (line 658) stores a raw idx too. Neither is re-anchored after a mutation.

**Failure scenario:** A date has 3 sessions. Coach opens minutes-edit on the 3rd (editSess.idx=2), then deletes the 1st: the array shifts, the still-open edit input now saves onto what was the 2nd session (now idx... the old idx 2 = a different entry). Same with a double-click on ✕: the second fire deletes the session that slid into the same idx — both its entry and its load are subtracted from the wrong session.

**Proposed fix:** Give each session entry a stable id at creation and edit/delete by id; or clear editSess whenever bhbcLoads for that athlete/date changes.

---

## 71. [LOW] Editing an sRPE session's minutes to 0/blank zeroes its load and relabels it 'Gym · attended' _[unverified]_

**Where:** `src/BhbcView.jsx:229`

**Evidence:** editSession line 228 `const min = Number(newMin) || 0;` then lines 229–233 recompute `newLoad = sessionLoad(min, s.rpe)` = 0 and set `s.load = 0`, keeping the session. The history label (line 667) branches on `!s.load ? \`Gym · ${s.min ? s.min + ' min' : 'attended'}\` : ...`, which was written for Lift entries — a zero-load Practice/Game now renders as a gym attendance row, and `out.loads[date]` is left as an explicit 0-valued key (unlike deleteSession which prunes it).

**Failure scenario:** Coach edits a logged Practice's minutes, clears the field, and hits Enter (empty → 0): the practice's load correctly leaves ACWR, but the history now shows 'Gym · attended' for what was a practice, misrepresenting the record; there is no way to see it was a Practice or restore the RPE-based load except re-typing minutes.

**Proposed fix:** Reject/ignore non-positive minutes in editSession (keep prior min), or label by `s.type` instead of by `!s.load` (e.g. `s.rpe == null` for attendance-only gym entries).

---

## 72. [LOW] Toggling 'Preview as coach' while on the Sessions tab leaves a blank main area with no active tab _[unverified]_

**Where:** `src/BhbcView.jsx:504`

**Evidence:** Line 385 removes 'sessions' from NAV_TABS when asCoach, and line 504 gates the content with `{view === 'sessions' && !asCoach && (...)}` — but `view` state is not reset when previewCoach flips on, so no view block matches and no tab renders active.

**Failure scenario:** Owner is on the Sessions tab and clicks '◉ Preview as coach' (line 429): the page shows only the header/toolbar over an empty main area until he manually clicks another tab — reads as the preview being broken.

**Proposed fix:** In the previewCoach toggle (and on `coach` mount), if view === 'sessions', setView('overview').

---

## 73. [LOW] Fixture rows without a `start` key crash the Overview/Schedule sorts (future trap) **[FIXED 2026-08-25]**

**Where:** `src/BhbcView.jsx:1270`

**Evidence:** Line 1270 `todayFx = fixtures.filter(f => f.date === today).slice().sort((a, b) => a.start.localeCompare(b.start))` — plus the same unguarded `a.start.localeCompare` at 907 (PracticeEntryModal), 1587 (ScheduleWeek), 1631 (ScheduleMonth). HeadCoachReport line 1212 defends with `(a.start || '')`, proving start is known-optional; NextGamePanel line 1092 handles `!nextGame.start`. Current store rows use `start: ""` for TBD games (scripts/_bhbc-fixtures-backup-20260818.json line 190), which survives — but a fixture written without the key at all throws TypeError.

**Failure scenario:** A sync script or manual store edit adds a game as `{date, type:'game', opponent, timeTBD:true}` with no `start` field (the natural way to write a TBD fixture). On that fixture's day — game day — TodayPanel's sort throws `Cannot read properties of undefined (reading 'localeCompare')` and the inline ErrorBoundary replaces the whole BHBC Overview; the Schedule week/month views crash the same way any day the fixture is in range.

**Proposed fix:** Guard all four sorts with `String(a.start || '').localeCompare(String(b.start || ''))`.

---

## 74. [LOW] Parked workout upsert can drain AFTER the queued form_videos URL patch and overwrite it, orphaning an already-uploaded video on the server **[VERIFIED REAL]**

**Where:** `src/blobQueue.js:251`

**Evidence:** attachUrl's row-missing branch queues `enqueueOp({ type: 'client_workouts.update', payload: { id: workoutId, patch: { form_videos: patchedFv } }, ... })` and returns true, letting drainBlobs delete the blob, relying on the comment's FIFO assumption ('the offlineQueue is FIFO, so it lands AFTER the pending workout upsert'). But offlineQueue.js breaks FIFO for a failing critical entry: at MAX_ATTEMPTS the client_workouts.upsert is PARKED and rotated to the TAIL (offlineQueue.js line 198 `write([...rest, { ...target, parked: true }])`), placing it BEHIND the later-enqueued form_videos update. The update handler stub-inserts {id, form_videos-with-cloudUrl}; the parked upsert then drains and `supabase.from('client_workouts').upsert(row)` (useSupaStore.js line 83) overwrites form_videos with the finish-time snapshot that still has pendingBlobId and cloudUrl:null.

**Failure scenario:** Athlete finishes a workout offline with a queued form video. Back online, the DB endpoint flaps while storage works: the workout upsert fails 5 attempts and is parked to the tail; the blob then uploads, attachUrl finds no server row, queues the URL patch, and the blob is DELETED from IndexedDB. The URL patch drains (stub row with cloudUrl), then the parked upsert drains and clobbers form_videos back to {pendingBlobId, cloudUrl:null}. The uploaded bytes sit in storage with no row referencing them; the coach's review slot shows a pending upload forever (the athlete's device still shows it via the localStorage patch, masking the loss).

**Proposed fix:** Make the upsert handler exclude form_videos when the row already exists (or merge per-slot like mergeReviewNotes), or have attachUrl keep the blob until the workout row itself is confirmed on the server.

**Verifier:** Traced end-to-end. blobQueue.js:250-260 queues the fv update and returns true so drainBlobs deletes the blob, relying on FIFO ordering per its own comment. offlineQueue.js:216 breaks that ordering: a critical client_workouts.upsert that fails MAX_ATTEMPTS (5) transient attempts is parked and rotated to the TAIL (write([...rest, { ...target, parked: true }])), landing behind a form_videos update enqueued mid-flap. The update handler (useSupaStore.js:93-94) stub-upserts {id, form_videos-with-cloudUrl}; the parked upsert handler (useSupaStore.js:83) then replays the full finish-time row whose form_videos (useSupaStore.js:451, built at ClientPortal.jsx:1300-1305) still carries pendingBlobId/cloudUrl:null, overwriting the URL. Nothing later re-syncs form_videos (save() only pushes workout ids not already in prev), so the uploaded bytes are permanently unreferenced server-side; the athlete's localStorage patch masks the loss while the coach's review slot shows pending forever. Requires a flapping connection where storage upload + the attachUrl SELECT succeed inside the same window in which 5 upsert attempts fail — a real but narrow state, so low severity is correct.

---

## 75. [LOW] DayChip border interpolates a literal '${C.cardBd}' string — invalid CSS, chips render borderless **[FIXED 2026-08-25]**

**Where:** `src/CoachDemo.jsx:2696`

**Evidence:** border: `1px solid ${muted ? C.bd : '${C.cardBd}'}` — the non-muted branch is a single-quoted string containing the text ${C.cardBd}, not an interpolation, so the computed style is border: "1px solid ${C.cardBd}" which the browser rejects and drops.

**Failure scenario:** Open any program in /demo/coach → Programs: the day-summary chips ('6 EXERCISES', '2 SUPERSETS', '~N MIN') get an invalid border declaration and render with no border at all, while only the muted 'EST · BASED ON 90s REST' chip (the muted branch, C.bd) gets its border — the exact inverse of the intended emphasis.

**Proposed fix:** Replace '${C.cardBd}' with C.cardBd inside the template literal.

---

## 76. [LOW] Clicking the PROGRAMS tab while inside a program detail rewrites the URL to the list but leaves the detail on screen _[unverified]_

**Where:** `src/CoachDemo.jsx:3900`

**Evidence:** navigateToTab: setTab(key); setSelectedTrainee(null); ... window.history.pushState({ tab: key }, '', target ...) — it never clears DemoPrograms' selectedProgramId, and DemoPrograms' URL-sync effect (line 1801) only runs on [selectedProgramId] changes, so nothing re-pushes the detail path.

**Failure scenario:** Visitor deep in /demo/coach/programs/p1 clicks the PROGRAMS nav tab expecting to return to the list. setTab('programs') is a no-op (same value), pushState rewrites the URL to /demo/coach/programs, but the mounted DemoPrograms still holds selectedProgramId='p1' — the screen keeps showing the p1 editor under a list URL. Pressing browser Back then pops to /demo/coach/programs/p1 with zero visible change, so Back appears broken and a copied/shared URL misrepresents what's on screen.

**Proposed fix:** Give DemoPrograms a reset signal (e.g. key the component or pass a resetToken bumped by navigateToTab), or have DemoPrograms listen for the tab click / compare pathname on each render and null its selection when the URL is the bare list path.

---

## 77. [LOW] Deep link to an unknown trainee id renders a blank Athletes tab _[unverified]_

**Where:** `src/CoachDemo.jsx:573`

**Evidence:** if (selected) { const t = MOCK_TRAINEES.find(x => x.id === selected); if (!t) return null; — DemoTrainees returns null for any id not in the 8-row mock roster, and selectedTrainee is seeded straight from the URL (traineeIdFromPath) on mount.

**Failure scenario:** Any shared/mistyped/stale link like /demo/coach/trainees/t9 (ids are guessable t1..t8) loads the coach demo with the ATHLETES tab active and a completely empty main area — no roster, no back affordance — because DemoTrainees short-circuits to null instead of falling back to the list. A prospect following a dead link concludes the demo is broken.

**Proposed fix:** When the id doesn't resolve, clear the selection (render the roster list) instead of returning null.

---

## 78. [LOW] Parity drift: demo exercise-grid chips missing tonight's ExercisesView chip-ellipsis fix _[unverified]_

**Where:** `src/CoachDemo.jsx:2907`

**Evidence:** Demo chip: style={{ display: 'inline-flex', ... padding: '2px 7px', whiteSpace: 'nowrap' }} — no minWidth/flexShrink/overflow. Tonight's real ExercisesView.jsx line 263 chip is display:'inline-block', minWidth: 0, flexShrink: 1, overflow: 'hidden', textOverflow: 'ellipsis' with the comment 'a chip that doesn't fit compresses'.

**Failure scenario:** In /demo/coach → Exercises → Grid view, a muscle/joint chip longer than the ~300px card (e.g. 'Quadriceps, Gluteus Maximus' style values on narrow phone columns) cannot shrink: whiteSpace:nowrap with no minWidth:0 makes the flex row overflow the card edge — the exact overflow the real ExercisesView fixed tonight. Under the standing marketing/demo-parity mandate this demo surface drifted from the tonight-changed real view.

**Proposed fix:** Copy the real chip style: add minWidth: 0, flexShrink: 1, overflow: 'hidden', textOverflow: 'ellipsis' to the demo grid chips.

---

## 79. [LOW] Language toggle fires the coach_demo_open funnel event, polluting the demo-open conversion metric _[unverified]_

**Where:** `src/CoachLanding.jsx:501`

**Evidence:** if (href.startsWith('/demo/')) { trackFunnel('coach_demo_open', { target: href.replace('/demo/', '') }); } — the EN-page language toggle at line 575 is <a href='/demo/he'>, which matches startsWith('/demo/') and tracks coach_demo_open with target 'he'.

**Failure scenario:** Every visitor who switches the landing page from English to Hebrew is counted as having 'clicked any demo CTA' in the analytics funnel (coach_landing_view → coach_demo_open → waitlist). The demo-open conversion rate — the number this page exists to measure — is inflated by locale switches, and the 'target' dimension gains a bogus 'he' bucket that isn't a demo surface.

**Proposed fix:** Exclude the locale route: match only /demo/coach and /demo/athlete (e.g. /^\/demo\/(coach|athlete)/), or track the toggle as its own lang_switch event.

---

## 80. [LOW] Demo fixture 'today' computed via UTC toISOString — dates drift a day during 00:00–03:00 Asia/Jerusalem **[FIXED 2026-08-25]**

**Where:** `src/demoTraineeData.js:93`

**Evidence:** const daysAgo = n => { const d = new Date(today); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); }; — UTC date, while MealLogger.jsx's own todayISO() is explicitly LOCAL ('a meal logged 00:00–03:00 Israel time was landing on yesterday's date') and MealLogger seeds DEMO_MEALS with setMeals(iso === todayISO() ? DEMO_MEALS : []).

**Failure scenario:** A visitor opens /demo/athlete between local midnight and ~03:00 (UTC+3): daysAgo(0) returns yesterday's date, so the meal-log 'Today' tab shows meals whose created_at (mealAt builds daysAgo(0)+'T08:15:00') is stamped the previous day, and every workout/BW row (daysAgo(1), daysAgo(2)…) shifts one day older than intended — 'last workout' reads a day staler than the fixture designed. This is the exact UTC-todayISO class of bug the repo already fixed in MealLogger.

**Proposed fix:** Build daysAgo from local parts (getFullYear/getMonth/getDate padded), mirroring MealLogger's todayISO().

---

## 81. [LOW] Hard reset removes 'expo-portal-choice' from localStorage but the key lives in sessionStorage **[REFUTED on verify]**

**Where:** `src/ErrorBoundary.jsx:65`

**Evidence:** handleHardReset: `const keys = ['expo-theme', 'expo-portal-choice']; keys.forEach(k => { try { localStorage.removeItem(k); } catch {} });` — but PORTAL_CHOICE_KEY is read/written exclusively via sessionStorage (auth.jsx:465, App.jsx:838/842/846/859/865/889). The removal is a no-op for the portal choice.

**Failure scenario:** A dual-role user crashes because of a bad state tied to their picked portal, hits 'Reset & reload' on the crash card — the code's stated purpose ('Wipe localStorage theme + portal-choice so a borked persisted state doesn't keep biting') fails for portal-choice: after reload sessionStorage still holds the choice, the same portal re-renders, and the crash loop continues.

**Proposed fix:** Also call `sessionStorage.removeItem('expo-portal-choice')` in handleHardReset.

**Verifier:** Already fixed: ErrorBoundary.jsx:67 now calls `sessionStorage.removeItem('expo-portal-choice')` in handleHardReset (comment: 'the choice actually lives in sessionStorage (audit 08-22)'), so the reset clears the real key and the crash-loop scenario is closed.

---

## 82. [LOW] trashVerdict reads only ex.title — a compact-shape library entry (t key) is flagged 'empty title' definite and pre-checked for deletion **[REFUTED on verify]**

**Where:** `src/ExerciseCleanupView.jsx:68`

**Evidence:** `.map((ex) => { const v = trashVerdict(ex.title); ... })` with trashVerdict line 19-20: `if (!t) return { level: 'definite', reason: 'empty title' }`. The rest of the suite defensively reads both shapes (exerciseMatch.js:49 `normTitle(ex && (ex.title || ex.t))`, LibraryPicker `e.title || e.t`), implying t-shaped library rows are a live possibility; for such a row Cleanup shows a blank title, 'empty title', 0 refs (refs also keyed off ex.title at line 70), pre-checked.

**Failure scenario:** Any library entry stored with `t` instead of `title` appears as a nameless pre-checked 'definite' row; coach bulk-deletes definite rows and a real exercise is destroyed without ever displaying its name.

**Proposed fix:** Use `ex.title || ex.t` in trashVerdict input, the title cell, and the normTitle refs lookup, matching exerciseMatch.js's libIndex.

**Verifier:** Already fixed. src/ExerciseCleanupView.jsx:73 calls `trashVerdict(ex.title || ex.t)`, line 75 keys refs off `normTitle(r.ex.title || r.ex.t)`, and the title cell (line 129) renders `r.ex.title || r.ex.t` — all three spots handle the compact shape.

---

## 83. [LOW] Blank-title groups (∅ key) can be 'accepted' and 'applied' but applyMatch matches nothing — UI reports rows updated that were never touched **[REFUTED on verify]**

**Where:** `src/exerciseMatch.js:91`

**Evidence:** groupUnmatched: `const key = normTitle(r.title) || `∅:${r.reason}`;` creates groups keyed '∅:corrupt-superset-id' for title-less rows. The UI lets the coach accept a match for that group and counts its rows in affectedRows, but applyMatch compares `normTitle(t) !== titleKey` — an empty normalized title never equals '∅:...', so zero rows change while the Apply button promised e.g. 'Apply 1 match (12 rows)'.

**Failure scenario:** Coach resolves the '(blank)' corrupt-superset group via Change…, confirms Apply — toast shows '0 plans updated' (or the group simply persists), the rows remain corrupt, and the coach has no indication why the accepted fix did nothing.

**Proposed fix:** Either exclude ∅ groups from accept/apply (route them to a per-row fixer), or have applyMatch match those rows by (planId, di, ei) from the group's rows list.

**Verifier:** Already fixed. src/exerciseMatch.js:160-162 + 172: applyMatch now builds a (planId|di|ei) coordinate set from group.rows and, when the group key starts with '∅:' (`const byCoords = String(titleKey||'').startsWith('∅:')`), matches rows by exact coordinates instead of normalized title — blank-title corrupt-superset rows are actually rewritten.

---

## 84. [LOW] EmptyState called with unsupported props (title/hint) — success states render as a blank box **[REFUTED on verify]**

**Where:** `src/ExerciseMatchingView.jsx:202`

**Evidence:** ExerciseMatchingView.jsx:202 `<EmptyState title="Everything resolves" hint="No unmatched exercise titles across any plan." />` and ExerciseCleanupView.jsx:112 `<EmptyState title="Library is clean" hint="..." />`, but ui.jsx:841 defines `EmptyState = ({ icon, message }) => ...` — title/hint are dropped, so both screens' 'all clean' states render an empty padded div with no text.

**Failure scenario:** Coach finishes cleanup/matching (or arrives with a clean library): the screen shows a large blank area instead of 'Library is clean' / 'Everything resolves', reading like a loading failure.

**Proposed fix:** Use `<EmptyState message="..." />` (as ExerciseClassifyView.jsx:77 correctly does), or extend EmptyState to accept title/hint.

**Verifier:** Already fixed. Both call sites use the supported prop: ExerciseMatchingView.jsx:216 `<EmptyState message="Everything resolves — no unmatched exercise titles across any plan." />` and ExerciseCleanupView.jsx:119 `<EmptyState message="Library is clean — no trash-looking entries detected." />`, matching ui.jsx:845's `({ icon, message })` signature.

---

## 85. [LOW] Unclassified banner count uses all-three-blank while the Classify screen counts any-blank — banner number contradicts the screen it opens **[REFUTED on verify]**

**Where:** `src/ExercisesView.jsx:59`

**Evidence:** ExercisesView.jsx:55 `const isMissing = e => !e.resistanceType && !e.bodyPosition && !e.movementType;` feeds the banner ('N exercises are unclassified … Classify at scale →'), but exerciseClassify.js:76 `isUnclassified = (ex) => !((ex.resistanceType||'') && (ex.movementType||'') && (ex.bodyPosition||''))` (any field missing) drives ExerciseClassifyView's 'N unclassified' header.

**Failure scenario:** Banner says '1,205 exercises are unclassified'; clicking it opens Classify showing '1,379 unclassified' — every partially-classified exercise makes the two numbers disagree, undermining trust in the counts during the classification campaign.

**Proposed fix:** Use the shared isUnclassified from exerciseClassify.js for the banner count.

**Verifier:** Already fixed. src/ExercisesView.jsx:57 is now `const isMissing = e => isUnclassified(e);` (imported from exerciseClassify.js, line 4), with a comment stating it MUST match the Classify screen's count — banner and screen use the identical any-field-missing definition. (Note the Classify screen additionally requires a title at ExerciseClassifyView.jsx:22, so a title-less unclassified entry could still diverge the counts by that sliver, but the claimed all-three-blank vs any-blank contradiction no longer exists.)

---

## 86. [LOW] 'kickback' (hip) outweighs 'tricep' (elbow) — Tricep Kickback rep-counts on the static hip _[unverified]_

**Where:** `src/liftDetect.js:119`

**Evidence:** Hip lexicon (line 119) contains `'kickback'`; elbow lexicon (line 134) contains `'tricep'`. Neither has a WEIGHT override, so DEFAULT_WEIGHT applies (line 161: `tok.trim().split(' ').length * 10 + tok.length`): 'kickback' = 18, 'tricep' = 16. In channelFromTitle the higher weight wins (line 188 `if (!best || w > best.w) best = ...`), so a "DB Tricep Kickback" resolves to kind 'hip' with 0.85 confidence.

**Failure scenario:** Coach opens REPS on a Tricep Kickback clip: the counter tracks L/R HIP, which barely moves in a bent-over kickback → count 0 or jitter noise. Motion disagreement surfaces only as the optional "MOTION SEES ELBOW →" suggestion button; the auto count is wrong until clicked. Same misroute feeds detectLift consumers (auto channel pick in WorkoutReview).

**Proposed fix:** Add a WEIGHT override so 'tricep'/'curl'-family tokens beat 'kickback' (e.g. `tricep: 45`), or split 'kickback' into 'glute kickback' (hip) and leave bare 'kickback' out — mirroring repCounter.CHANNEL_RULES which already puts kick-back on the elbow.

---

## 87. [LOW] "Latest block" convention conflict: an un-numbered plan is treated as the newest block by the Next-Block report but as the oldest by the Analysis engine _[unverified]_

**Where:** `src/NextBlockReport.jsx:112`

**Evidence:** latestBlockExercises (line 112): `const latestId = model.blocks[model.blocks.length - 1].id;` and deriveDaysPerWeek (line 137) do the same. model.blocks is sorted in PlansView.jsx:2807-2811 with `if (a.num != null) return -1; if (b.num != null) return 1;` — any un-numbered plan always sorts AFTER every numbered block, i.e. becomes "latest". lineageAnalysis.js:503 makes the opposite call for the same concept: `return an == null ? -1 : 1; // un-numbered plans sort as OLDEST (front), so the highest-numbered block is "latest"`.

**Failure scenario:** An athlete with numbered blocks #1–#16 plus one un-numbered side plan (e.g. an old "Morning Routine" or imported "Deload Week"): the Next-Block report's baseSets, days/week, and the six-bucket "current" column all read from that stray un-numbered plan (it's forced to the end of blockOrder regardless of recency), producing a wrong volume target and false "empty bucket — floor applied" rows, while the Training Analysis header on the same athlete names the real #16 as latest. Also affects stats.latestSets / suggestedPhase computed in the same model.

**Proposed fix:** Align PlansView's block ordering with lineageAnalysis (un-numbered blocks sort oldest, or order un-numbered by created_at against the numbered timeline) so both surfaces agree on the athlete's current block.

---

## 88. [LOW] Explicit Save bypasses the autosave serial chain — stale in-flight autosave can land after it _[unverified]_

**Where:** `src/PlansView.jsx:1769`

**Evidence:** useAutosave exists to serialize writes ('a serial Promise chain so writes never race', useAutosave.js:3-4, enqueue at 40-68), but PlanEditor.handleSave (PlansView.jsx:1766-1769) calls `onSave(snapshot)` → savePlan directly, outside chainRef. An autosave upsert of an older snapshot that is already in flight can resolve at Supabase AFTER the explicit save's upsert, leaving the row at the older state, while handleSave's `if (planRef.current === snapshot) markClean()` (1774) marks the editor clean so nothing rewrites it.

**Failure scenario:** Coach types edit A (600ms debounce fires, upsert A in flight), immediately types edit B and clicks 'Save Program' within the request's round-trip. Upsert B is issued concurrently; the network delivers A after B. DB now holds state A (missing edit B) while the editor shows '✓ Saved' clean. If the coach closes the tab without another edit, edit B is lost.

**Proposed fix:** Route the explicit save through the same chain: expose the hook's flush-with-latest (mark dirty + `await flush()`) and have handleSave call that instead of calling savePlan directly.

---

## 89. [LOW] Per-week wk/wkS arrays longer than plan.weeks are invisible and truncated on first edit _[unverified]_

**Where:** `src/PlansView.jsx:2272`

**Evidence:** The day grid renders exactly `plan.weeks` inputs (`Array.from({length:weeks})` at PlansView.jsx:2271 and 2285) even when `ex.wkS`/`ex.wk` are longer, and any cell edit runs `const next=resize(ex.wkS,weeks,"")` (2272, 2286) with `resize = (arr, n, fill) => Array.from({length:n}, ...)` (2034) — silently cutting the array down to plan.weeks. The compare pane proves longer arrays exist in real data: ReadOnlyPlanPanel derives its week count from the arrays themselves (`Math.max((pe.wk?.length||0), (pe.wkS?.length||0), 1)` at 1058) precisely because plan.weeks can disagree, and imported plans default `weeks` to 4 when data.weeks is missing (usePlansStore.js:166) while their wk arrays may carry 5-6 entries.

**Failure scenario:** An imported 6-week block stored wk arrays of length 6 but its data JSONB lacks `weeks` (defaults to 4). Coach opens it and fixes one week-2 rep cell: resize(ex.wk, 4, "") deletes the week-5 and week-6 prescriptions for that exercise, with no visual indication they ever existed — the editor only showed 4 columns. Autosave persists the truncation ~600ms later.

**Proposed fix:** Render and resize to `Math.max(plan.weeks, ex.wk?.length||0, ex.wkS?.length||0)` per row (as the compare pane already does), or at minimum never shrink: `resize(arr, Math.max(n, arr.length), fill)` on edit so hidden weeks are preserved.

---

## 90. [LOW] Clip target-reps lookup ignores per-week (wave-load) prescriptions and can read a stale previous athlete's plans _[unverified]_

**Where:** `src/ReviewToolsView.jsx:83`

**Evidence:** targetFor (lines 74-84) returns `pe.reps` only: `return pe && pe.reps != null && pe.reps !== '' ? String(pe.reps) : null;` — it never consults the normalized per-week array `pe.wk` even though the picked clip carries a specific `week`. Additionally, the target is computed once at pick time (line 89 `onPick(..., targetFor(ex))`) from the `plans` state, which is loaded asynchronously per athlete (line 73 `useEffect(() => { if (athlete?.cid) loadPlans(athlete.cid); ... })`); block names like "Block #3" recur across athletes, so a not-yet-replaced `plans` from the previously selected athlete can satisfy `plans.find(p => (p.name || '') === (block.block || ''))`.

**Failure scenario:** (a) Wave-loaded block: ex.reps='10', wk=['10','8','6']; coach picks a Week-3 clip → LIFT METRICS shows target 10 while the athlete was prescribed 6, so the camera-count cross-check labels a completed set as short. (b) Coach switches athlete A→B in the cascade and picks an exercise before B's plans finish loading: A's "Block #3 / Day A" prescription is matched by title and shown as B's target; it is frozen into clipMeta.target and never recomputed after B's plans arrive.

**Proposed fix:** Resolve the week: prefer `pe.wk[weekIndex]` when present (parse the picked 'Week N'), falling back to pe.reps; and recompute the target when `plans` for the picked athlete finish loading (derive target in render from clip identity + current plans instead of freezing it at pick time).

---

## 91. [LOW] Group finish compacts set arrays (done-only) — next week's per-set ghost misaligns after skipped sets _[unverified]_

**Where:** `src/SessionsView.jsx:442`

**Evidence:** `sets: ex.sets.filter(s => s.done).map(s => ({ reps: s.reps, load: s.load, rpe: s.rpe, done: true }))` (line 442) writes a COMPACTED array. The ghost consumers are positional: SessionsView 650-655 `const prior = prevSets?.[si]` and the portal deliberately writes FULL arrays for exactly this reason (ClientPortal.jsx 1914: "prevWeekSets is now the FULL (un-compacted) array, so a blank entry = a set the athlete skipped"). completeWorkout in WorkoutsView also writes all sets (line 497).

**Failure scenario:** In a group session an athlete does sets 1 and 3 of a 3-set exercise (set 2 skipped/not ticked). The saved row holds [set1, set3]. Next week's grid shows set 3's load as the ghost for set 2 — the coach prescribes the back-off set from the top-set's number.

**Proposed fix:** Write the full set array with done flags (like the portal and the single logger) instead of filtering to done sets.

---

## 92. [LOW] addAthletes closes over planIndex but omits it from its deps — planWeeks silently wrong after a plan-index refresh _[unverified]_

**Where:** `src/SessionsView.jsx:407`

**Evidence:** `const addAthletes = useCallback(async (picks) => { ... planWeeks: Number(planIndex.find(pi => pi.id === p.planId)?.weeks) || undefined, ... }, [persist, exById]);` (lines 350-407) — planIndex is read at line 387 but not a dependency, so the callback keeps the planIndex captured when exercises last changed.

**Failure scenario:** Coach creates/edits a plan mid-day (planIndex reloads; exercises unchanged), then adds an athlete on that plan to a group session: the stale closure's planIndex.find misses, planWeeks stays undefined, and nextWeekFor caps the auto-week at the fallback 8 instead of the block's real length — the exact regression the audit comment at 385-387 says this field was added to fix.

**Proposed fix:** Add planIndex to the dependency array (or read it via a ref).

---

## 93. [LOW] AthletePicker allows the same athlete twice in one batch — duplicate cards, two history rows on finish _[unverified]_

**Where:** `src/SessionsView.jsx:739`

**Evidence:** `active = trainees.filter(t => ... && !existing.includes(t.id))` (line 689) excludes only athletes already IN the session; each picker row's dropdown lists the full active set, and confirm has no cross-row dedupe: `const picks = rows.filter(r => r.traineeId && r.planId).map(...)` (line 739). addAthletes appends all picks (line 403).

**Failure scenario:** Coach adds several rows in one picker pass and selects the same athlete twice (same default plan/day/week). Two cards for the athlete appear on the floor; portal broadcasts write into both (dayOk matches both), and FINISH writes two client_workouts rows for the same session — duplicate history and double-counted volume.

**Proposed fix:** Dedupe picks on (traineeId, planId, dayIdx, week) in confirm, or exclude a row's traineeId from the other rows' options.

---

## 94. [LOW] Corrupt couple member (null element in members[]) white-screens the whole trainee detail page — the roster card guards this exact state, the detail page doesn't **[FIXED 2026-08-25]**

**Where:** `src/TraineeDetail.jsx:706`

**Evidence:** TraineeDetail.jsx:706-708 `renderMemberColumn(td.members[0], 0, false)` and the programs grid at 892-893 (`const m = td.members[mi]; ... m.name`) dereference members with no null guard — renderMemberColumn's first use is `m.name` (line 382/387). TraineesView.jsx:723-727 added `const m0 = (t.members && t.members[0]) || {};` with the comment 'a null member element ... would throw on m.name/.phone and blank the roster grid. Default to {} so a corrupt member renders empty' — i.e. this corruption was actually observed in the data.

**Failure scenario:** A couple row whose members array contains a null/non-object element (the same corruption the roster card was hardened against) renders fine in the roster grid but throws `Cannot read properties of null (reading 'name')` the moment the coach opens that couple's detail page, blanking it via the error boundary.

**Proposed fix:** Apply the same `(td.members && td.members[mi]) || {}` default in renderMemberColumn's call sites and the couple programs grid.

---

## 95. [LOW] Shared (parent-assigned) couple plans: coach visibility toggles write ':mN' keys the portal never reads — hide/Only would silently not apply _[unverified]_

**Where:** `src/TraineeDetail.jsx:896`

**Evidence:** tpMember(mi) (TraineeDetail.jsx:159) includes plans with `p.traineeId === trainee` (the parent), and the couple UI keys EVERY plan in a member column as `${td.name}:${p.name}:m${mi}` (lines 364 and 896). The portal computes the key via memberIndexFromId(p.traineeId, ci) (ClientPortal.jsx:2248-2250): for a parent-assigned plan that returns null → key WITHOUT the ':mN' suffix. So an explicit false written by the coach's toggle/Only/HIDE-ALL on a shared plan lands under ':m0'/':m1' keys the portal never looks up. Currently unexercised — read-only DB audit found 45 sub-id plans and 0 parent-assigned couple plans — so this is a drift trap, not an active leak.

**Failure scenario:** The moment a plan is assigned to a couple's parent ID (PlansView assignment, an import, or a future 'both members' option — the data model and getMemberPlanCounts explicitly support it), the coach clicks the plan's portal toggle OFF or 'Only' in a member column, sees the toggle flip OFF, but the athletes' shared portal still shows the block (its unsuffixed key has no explicit false, and ClientPortal's latest-block default may keep it visible).

**Proposed fix:** In the couple member columns, key parent-assigned plans without the ':mN' suffix (mirror memberIndexFromId logic: suffix only when p.traineeId is a sub-id).

---

## 96. [LOW] PR view splits a same-exercise-twice-in-one-day lift into two identical-titled series via the suffixed 'eid#2', understating the ALL-TIME PR **[REFUTED on verify]**

**Where:** `src/TraineePRsView.jsx:48`

**Evidence:** aggregate() buckets by `const stableId = ... (ex.eid || `title:${...}`)` with no title-based merge. ClientPortal.trainerPlanToPortal deliberately mints a suffixed eid for a duplicate exercise in one day (line 233: `const dupEid = `${eid}#${nSeen}`;`) and finish() persists it verbatim onto the workout (line 1339 `eid: ex.eid`). The in-logger matchers (priorTopFor, newPRs, prevWeekSets) all carry a normalized-title fallback for exactly this, but aggregate() here does not.

**Failure scenario:** A plan programs 'BB Bench Press' twice in one day (heavy top set as eid 'e33', back-off as 'e33#2') — the documented #51 use case. Every logged session produces two exercise entries with different eids but the same title. The PRs picker then shows TWO 'BB Bench Press' options with split session counts; the back-off series' hero card shows an 'ALL-TIME PR' that is only the back-off weight — a wrong record for the athlete — and the real top-set PR history is fragmented across the two entries.

**Proposed fix:** In aggregate(), strip the '#N' suffix from ex.eid (or merge buckets by normalized title when titles are identical) before bucketing.

**Verifier:** Already fixed in the working tree. src/TraineePRsView.jsx:46-53 now strips the duplicate-in-day suffix before bucketing — const baseEid = ex.eid ? String(ex.eid).replace(/#\d+$/, '') : ex.eid — with a comment citing this exact audit finding ('audit 08-22'). Both instances of the lift merge into one PR series in the current code, so the split/understated PR cannot occur.

---

## 97. [LOW] Roster edit modal replaces the whole trainee row with its open-time snapshot — concurrent updates (portal session decrement, status change) silently reverted on Update _[unverified]_

**Where:** `src/TraineesView.jsx:596`

**Evidence:** Line 596 `setTrainees(prev => prev.map(t => t.id === editId ? toSave : t))` — toSave is the full form snapshot captured when EDIT was clicked (line 822/875 `setForm({...t, ...})`), not a field merge. sessionsRemaining is live-mutated by athlete activity: App.jsx:1076-1085 handleDecrementSession decrements the parent row when a session completes, and the store syncs in realtime. TraineeDetail's handleSaveEdit (line 283 `{ ...t, ...toSave }`) merges but toSave still contains the stale sessionsRemaining/status snapshot, so the same field-level clobber applies there.

**Failure scenario:** Coach opens an athlete's EDIT modal (roster or detail). While it is open, the athlete finishes a portal workout → sessionsRemaining decrements 8→7 in the shared store. Coach fixes a typo in the phone field and clicks Update → the snapshot writes sessionsRemaining=8 back, undoing the decrement; a status change made from another device in the same window is reverted the same way. With the detail modal's persistent localStorage draft (restored across days after an Escape-dismiss), the reverted snapshot can be much older.

**Proposed fix:** Diff the form against the open-time snapshot and write only fields the coach actually changed, or at minimum exclude live counters (sessionsRemaining) from wholesale replace.

---

## 98. [LOW] useFullPlan.load has no stale-request guard — rapid program switches can resolve out of order _[unverified]_

**Where:** `src/usePlansStore.js:145`

**Evidence:** useFullPlan.load (usePlansStore.js:145-185) does `setPlan(loaded)` for whichever request resolves last, with no request-id/abort guard — in the same file useAthletePlans (199-233) carries exactly that guard (`reqRef`/`myReq`) for the same reason. The in-editor block dropdown (PlansView.jsx:1888-1893) and AthleteCombo both call onSwitchProgram=loadFullPlan on each pick, so two quick picks issue two concurrent selects on the same hook.

**Failure scenario:** Coach opens the block dropdown and clicks Block #17, then immediately corrects to Block #18. The #17 select resolves after the #18 select (slow first response). editPlanData ends at Block #17: the editor (keyed by plan id) remounts showing #17 while the coach chose #18 — and any edits then autosave into the wrong block.

**Proposed fix:** Copy the useAthletePlans pattern into useFullPlan: bump a reqRef per load and only setPlan/setLoading(false) when the resolving request is still the latest.

---

## 99. [LOW] Load-error fallback resurrects the deliberately-unsynced 'expo-trainees' localStorage snapshot **[REFUTED on verify]**

**Where:** `src/useSupaStore.js:212`

**Evidence:** The mount-load catch does `const s = localStorage.getItem(key); if (s) { const parsed = asShape(JSON.parse(s)); setData(parsed); ... }` for EVERY key — including 'expo-trainees', which the same hook deliberately excludes from both the synchronous init (line 164: `if (key === 'expo-exercises' || key === 'expo-trainees') return initial;`) and every write path (lines 203, 244, 295, 312) precisely because 'a stale localStorage blob here can overwrite fresh server data'.

**Failure scenario:** A device that used the app before the trainees key was locked to staff (pre-2026-06 RLS) still holds a full 'expo-trainees' blob with every client's PII (emails, phones, pricing). An athlete or BHBC-era session on that device hits a transient network error on the store SELECT → the catch hydrates the entire legacy roster into app state (passed as the `trainees` prop into ClientPortal), resurrecting data that RLS now denies — the exact staleness the init-path exclusion was written to prevent.

**Proposed fix:** Mirror the exclusion in the catch: skip the localStorage fallback for 'expo-trainees' (and 'expo-exercises' consistency), leaving state at `initial`.

**Verifier:** Already fixed: the mount-load catch (useSupaStore.js:213-218) now guards `if (key !== 'expo-trainees' && key !== 'expo-exercises')` before reading the localStorage fallback, with a comment citing exactly this PII-resurrection hazard ('audit 08-22'). A legacy roster blob can no longer be hydrated on network failure.

---

## 100. [LOW] saveLocal bypasses the array-shape guard, so BHBC poll / broadcast can apply a corrupt non-array value **[REFUTED on verify]**

**Where:** `src/useSupaStore.js:309`

**Evidence:** saveLocal: `const val = typeof next === 'function' ? next(dataRef.current) : next; setData(val);` — no `asShape(val)` coercion, unlike the mount load (line 193 `const val = asShape(row.value)`) and the realtime handler (line 241). App.jsx:1238 applies raw server values through it every 5s in the BHBC zone: `if (r.key === 'expo-bhbc-fixtures') setBhbcFixturesLocal(r.value);` and line 1241 `setTraineesLocal(r.value)`.

**Failure scenario:** A sync script (scripts/sync-roster-apply.cjs family) or a bad manual store write puts an object instead of an array into 'expo-bhbc-fixtures' or 'expo-bhbc-roster'. Every open BHBC client's 5-second poll applies it verbatim via saveLocal; the next `trainees.filter(...)` / fixtures `.map(...)` throws and the zone (or the whole coach shell via `activeAthletesCount = trainees.filter(...)` at App.jsx:1121, outside any inline boundary's reach on next render) crashes on all connected devices simultaneously until the row is fixed.

**Proposed fix:** Run `asShape()` inside saveLocal (it already closes over `initial`), so declared-array stores can never be replaced by a non-array from poll/broadcast paths.

**Verifier:** Already fixed: saveLocal (useSupaStore.js:311-322) now runs `asShape(...)` on the incoming value (line 316), with a comment citing the audit ('audit 08-22') — a non-array server value for a declared-array store is coerced back to `initial` and cannot crash connected clients.

---

## 101. [LOW] Weekly-focus 500ms debounce loses the write when the tab is closed (unmount flush never runs on tab close) **[VERIFIED REAL]**

**Where:** `src/useSupaStore.js:768`

**Evidence:** save() defers the network write: `if (timerRef.current) clearTimeout(timerRef.current); timerRef.current = setTimeout(flush, 500);` and the only safety net is a React unmount cleanup (line 743 `useEffect(() => () => { if (timerRef.current) { clearTimeout(timerRef.current); flush(); } }, [flush])`) — closing the tab/PWA does not run unmount cleanups, there is no beforeunload/pagehide/visibilitychange flush, and a value sitting only in pendingRef is not in the offline queue (the hook's own comment at line 686 admits pendingRef values are 'invisible' to the queue overlay).

**Failure scenario:** Coach types a weekly focus note in Review and immediately closes the tab (or the PWA is swapped away and killed) within the debounce window. Local state and localStorage hold the new value, but the server never received it — on any OTHER device (or after the localStorage cache is superseded by the mount fetch, which reads only cloud+queue at line 711 `const merged = { ...cloud, ...pending }`), the note is gone and the athlete never sees it.

**Proposed fix:** Add a pagehide/visibilitychange==='hidden' listener that flushes pendingRef immediately (fetch keepalive or plain await), or enqueue into the offline queue at save() time instead of only on flush failure.

**Verifier:** Confirmed in current code: useSupaWeeklyFocus's save() (useSupaStore.js:774-775) defers the network write via `timerRef.current = setTimeout(flush, 500)`, and the ONLY safety net is the React unmount cleanup at lines 750-752 — which does not run on tab close/PWA kill. Grep confirms no pagehide/beforeunload/visibilitychange listener anywhere in useSupaStore.js, and a value pending only in pendingRef is never in the offline queue (enqueue happens only inside flush on failure, lines 739/743). The mount fetch (line 718) builds `{...cloud, ...pending-from-queue}` and overwrites localStorage (line 721), so a note typed and abandoned within the debounce window is lost on the server, on other devices, and even on the same device after the next mount fetch. Concrete trace holds; unfixed.

---

## 102. [LOW] Compact-shape mapping drops the per-row video override — library video shown where coach overrode or cleared it **[FIXED 2026-08-25]**

**Where:** `src/WorkoutsView.jsx:355`

**Evidence:** The day.ex normalization (lines 355-363) maps id/exerciseId/sets/reps/tempo/superset/notes but not `vid`/`videoUrl`, so renderExercise's `const videoUrl = ex.videoUrl ?? ex.vid ?? exData?.videoLink ?? ''` (line 141) always falls through to the library video for compact plans. The portal propagates the override including the explicit empty string ("'' → explicit 'no video for this program row'", ClientPortal.jsx 244-253), and SessionsView carries `ex.vid` through (lines 158, 376).

**Failure scenario:** A compact-shape plan row has a coach-set video override (different angle/variation) or an explicit '' (coach cleared a wrong video). The 1-on-1 logger plays the library's default video anyway — for the cleared case this re-surfaces the exact wrong video the coach removed (violates the standing 'blank > wrong' rule).

**Proposed fix:** Carry `videoUrl: e.videoUrl ?? e.vid` (preserving undefined-vs-'' three-state) through the compact mapping.

---

## 103. [LOW] Single logger missed the F4 fix — coach edits during the subscribe window never reach an already-open portal _[unverified]_

**Where:** `src/WorkoutsView.jsx:461`

**Evidence:** On SUBSCRIBED the single logger only pings: `if (status === 'SUBSCRIBED') { subscribedRef.current = true; ping(activeRef.current); }` (line 461). The group session explicitly pushes its own state too, for this exact race: "AND push our current card so the portal fills any value the coach typed in the ~1s before this channel finished subscribing (audit F4)" followed by a sync-state send (SessionsView.jsx 315-325). broadcastSet sends on an unjoined channel are swallowed by the try/catch (line 472-477).

**Failure scenario:** Athlete's portal is already connected on the day; coach opens the 1-on-1 logger and types the first set's load in the ~1s before the coach channel finishes subscribing (slow gym wifi). Those broadcasts are dropped, the on-subscribe message is only a sync-REQUEST (which pulls, never pushes), and the portal never re-requests — the coach-logged values never appear on the athlete's phone and are blanked from the athlete's own finish() if left as untouched prefills.

**Proposed fix:** Mirror F4: after ping(), send a sync-state snapshot of the active workout when it has any data.

---
