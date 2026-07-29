# Client-side audit — 2026-07-29

Triggered by trainee Ron's "exercises show as Exercise 1/2/3, not names" report. Ran a 110-unit adversarially-verified workflow across every client file. The workflow's own verifiers hit a session limit (116 agents errored → auto-marked REFUTED), so its "0 confirmed" is NOT trustworthy — I re-verified the 72 unique raw findings by reading the code myself.

## Coverage (honest)
- 110 audit units defined; **73 completed fully**, 37 errored on the session limit (resets 3:50pm Asia/Jerusalem). A follow-up round must re-run those 37 + a clean verification pass to legitimately exceed 100 completed audits.
- 72 unique findings extracted from completed finders (17 HIGH, 38 MEDIUM, 17 LOW).

## FIXED this session (11 code + 2 data)
Data:
- **Title backfill** — 3,314 title-less exercises across 202/217 plans filled from the library (fill-empty-only, 0 unresolved). `scripts/backfill-plan-exercise-titles.cjs`. (LIVE in prod DB.)
- **Serial-leak** — Nadav Block #4 / Day C / Pull-Up reps "45816" neutralized to "". ⚠️ needs real value from source sheet.

Code (branch integrate-tonight):
1. PV ExPicker onChange — snapshot title on swap (commit d3ca7d7).
2. PV:1320 `addExWithId` — snapshot `ex.title` (the +Add modal path; primary source of new title-less rows).
3. PV:1346 `createLibraryExercise` — snapshot `ex.title`.
4. CP:653/457 — interrupted upload persisted `uploading:true` → workout permanently un-completable, all sets stranded. Neutralize transient upload state on serialize AND restore. (CATASTROPHIC data-loss.)
5. offlineQueue:135 — `isPermanent` classified JWT/auth-expiry + all PGRST as permanent → critical logged-workout writes dropped on a token-refresh window. Now auth-token errors retry (critical writes park). (data-loss.)
6. blobQueue:395 — 429 "rate limit exceeded" matched `permanentByMsg` ("exceeded") → form video dropped despite 408/429 carve-out. 408/429 always transient now.
7. CP:2811 — BW-entry delete matched by (clientId,blockName,week) → wiped multiple; now also matches `date`.
8. CP:150 — `days` seam lacked the `Array.isArray` guard its siblings have → non-array plan.days blanked the whole portal.
9. CP:487 — mid-session substitution prefill lacked `prefill:true` → untouched swap-in numbers saved as performed. Added the marker.
10. CP:2858 — History rendered raw array order; optimistic append put the just-finished session at the BOTTOM. Sort newest-first at render.
11. MealLogger:186 — a reload failure after a successful insert reported "Save failed" → duplicate re-saves. Refresh is now best-effort.

## Round 2 (resumed workflow) — 27 verdict-backed CONFIRMED; fixed in-loop

Fixed after re-verifying by reading (commits d3ca7d7, 2e5916d, 67a591c, + batch 4-7):
- CP deriveWeekIdx counted daily-routine days → week never advanced / re-log collisions. Excluded daily days.
- CP session-draft resume validated size only, not identity → a coach reorder realigned logged sets onto the wrong exercises. Added exOrder eid fingerprint.
- useSupaStore initial load clobbered a completed local save (transient savingRef vs sticky latch). Added mutatedRef.
- CP SetsRepsHero double-counted sets on an 'N×M' per-week reps cell ("3 × 2x10"). Drop sets when reps is combined.
- CP empty-string per-week cell showed '—' instead of flat fallback (?? vs empty check). pickWk helper.
- CP StepLogger key omitted week → stale allSets on week change (also fixes the realtime stale-weekNum finding via remount).
- CP sessionKey omitted day-index → same-named days collided on one draft. Added index + legacy fallback.
- CP eid-only matching (last-week video feedback, PR detection, priorTopFor prefill) → added normalized-title fallback.
- CP AthleteChallengesWidget fired real Supabase reads on demo/preview. Gated on !demoMode.
- PlansView exByTitle memoized index replaces per-row linear find (rule 90).
- App per-view ErrorBoundary key (was tab-only) → recovers on intra-tab nav.
- App coach header iOS safe-area padding (rule 150).
- theme.ytId host-guarded bare ?v= fallback (wrong-YouTube embed).

## DEFERRED — real but need Ohad's call or bigger work
- **CP:174 / App:1129 — athlete VIDEO for library-only rows.** Athletes can't read the library, so an eid-only row with no per-row `videoUrl` override shows no video. Ron did NOT report missing video (only names), and filling `videoUrl` risks the 3-state (undefined/''/url) "explicitly cleared" semantics. VERIFY whether athletes actually see videos before touching. Candidate: backfill `videoUrl` from library `videoLink` fill-empty-only, respecting `nCleared`-style intent.
- **PV:2166 / 2170 — portalVis keyed by trainee-name + plan-name.** Two same-named blocks share one visibility flag; renaming a hidden plan orphans its `false`. Needs a stable plan-id key (migration of the portalVis map).
- **autoTasks:627 — recurring auto-tasks don't re-fire after being marked done** (byKey includes DONE rows). May be INTENDED (don't re-nag). Product decision.
- **blobQueue:370/371 — already-uploaded form video dead-lettered if its workout syncs slower than MAX_ATTEMPTS.** Rare race; bytes are in storage but orphaned + slot marked failed. Needs cross-queue coordination.
- **PV:2342 — abandoned task→plan handoff can leak linkedTaskId onto the next saved plan.** Verify the consume/drop timing.
- **CP:1921 — deriveWeekIdx counts daily-routine days as required**, so a mixed daily+structured plan's week may not advance. Verify with a real mixed plan.

## NON-BUGS / won't-fix (verified benign or by-design)
- PV:1841 per-week truncation — grid only edits `weeks` columns; truncating hidden weeks-beyond-declared matches data to the visible count.
- Supabase SECURITY DEFINER advisor warnings — intentional RLS helpers (is_staff/my_trainee/current_trainee_id) + secret/token-gated fns.
- Perf `auth_rls_initplan` advisories — invisible at ~20 clients; premature to fix.

## Remaining MEDIUM/LOW (37 items) — triage in the follow-up round
The full ranked list is in the workflow journal:
`…/subagents/workflows/wf_4cc33867-473/journal.jsonl`. Notable: CP:1592 (per-week 'N×M' double-count), CP:370 (adjacent same-letter supersets merge), CP:1619/1484/415 (eid-only matching drops after eid rotation — mitigated by title backfill), useSupaStore:154/254/410 (array-shape guards + saveLocal-vs-load ordering), coachNotes:70 (no catch-up refetch on reconnect), VideoEmbed:56 (bare ?v= false-YouTube match).
