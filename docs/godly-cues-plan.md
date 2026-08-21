# Godly Cues → Library Notes — Execution Plan

Ohad's mandate (2026-08-21): the exercise library is drawn from
`Exercise Database\Old Versions\Last Draft Exercise Library.xlsx` (canonical,
immutable — work on copies only). Eventually EVERY exercise gets new notes
authored from `Exercise Database\GODLY\Godly Cues - Movements-Positions.docx`.

Standing rules that govern this work (from memory, non-negotiable):

- Cue authoring is MANUAL-COLLAB: Ohad authors/approves, Claude structures and
  verifies. Claude never invents, places, or drops cues solo.
- Never flatten the phase format of cues.
- No bulk write to the library without an explicit OK per batch; snapshot the
  `expo-exercises` store key to a dated backup before every write wave.
- Data fidelity: an exercise with no applicable Godly content gets NO note —
  blank beats wrong.

## Phases

### Phase 0 — Inventory (read-only, Claude solo)
1. Copy the GODLY docx to a working dir (source stays untouched); extract its
   structure: movement families × positions × the cue/note content per section.
2. Cross-map the docx taxonomy against the library's `movementType` +
   `bodyPosition` (+ `movementPattern` legacy field where present).
3. Deliverable: coverage matrix — for each of the ~1,450 exercises, which Godly
   section (if any) applies; count covered / ambiguous / uncovered.

### Phase 1 — Mapping sign-off (Ohad decision)
- Ohad reviews the coverage matrix (one screen, grouped by movement family),
  corrects wrong mappings, decides the target field (`notes` vs `cues`) and the
  write policy (fill-empty-only vs overwrite old notes).
- Note: plan-row notes snapshot library cues (existing pipeline) — decide here
  whether new notes propagate into existing plan rows or only future ones.

### Phase 2 — Authoring waves (manual-collab loop)
- Batch by movement family (e.g., all Hip Hinge first). Per batch:
  1. Claude drafts notes STRICTLY from the Godly content for the mapped section
     — structure preserved, zero invention.
  2. Ohad edits/approves the batch.
  3. Backup store key → write approved batch → verify by re-read + spot-check
     from the athlete seat (title resolution rules apply: athletes read
     plan-row snapshots, not the library).
- Cadence: one family per session keeps batches reviewable.

### Phase 3 — Propagation + verification
- If approved in Phase 1: backfill plan-row notes (fill-empty-only, same as the
  2026-07-18 cues backfill), then sample-verify from a real athlete account.
- Final audit: count exercises with new notes vs total; list leftovers.

## Status
- 2026-08-21: plan written. Phase 0 not started — waiting for a session where
  Ohad wants to kick it off (docx lives in the gitignored Exercise Database
  folder with its own .claude context).
