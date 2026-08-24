# Exercise cue authoring — the plan

Written 2026-08-25. Every number below was measured against the live library
(`scripts/_cue-coverage.cjs`, read-only), not estimated.

Ohad's standing ask: *"everything is drawn from `Last Draft Exercise Library.xlsx`
and eventually we need to make new notes for all the exercises based on
`Godly Cues - Movements-Positions.docx` — so you will plan this."*

---

## 1. Where the library actually stands

| | count | of 1,326 |
|---|---|---|
| Exercises in the live library | 1,326 | — |
| Have a cue block | 806 | 61% |
| **Have no cue at all** | **520** | **39%** |
| Have a demo video | 641 | 48% |
| Carry a taxonomy category | 75 | **6%** |
| Cue blocks using the locked phase labels | **0** | 0% |
| Cue blocks containing Latin letters (banned, §2) | 37 | — |
| Cue blocks with trailing periods (banned, §6) | 81 | — |

Two facts drive everything else:

- **No approved cue block is in the locked format yet.** `STYLE_GUIDE.md` fixed
  the phase labels to exactly `נקודת התחלה:` and `נקודת אמצע:` on 2026-06-02;
  the 806 existing blocks are all flat bullet lists that predate that decision.
  So this is not "fill the missing 520" — it is "bring 1,326 to one standard",
  of which 806 already have raw material to convert.
- **Only 6% of the library carries a category.** That is the blocker for the
  composition model below, and it is the cheapest thing to fix.

## 2. The model: compose four layers, don't author 1,326 blocks

`Godly Cues - Movements-Positions.docx` is not an exercise list. It is
**72 layer blocks** across the four layers `STYLE_GUIDE.md` names
(*תנועה / תנוחה / סוג תרגיל / מנח גפה*):

| Layer | Blocks in the doc | Examples |
|---|---|---|
| **Movement** (תנועה) | ~21 | Push-Up · Chest Press · Shoulder Press · Dip · HOZ Row · VERT Row · Pullover · Lateral Raise · Front Raise · Facepull · Bicep Curl (Sh. Flexion / Extension) · Tricep Extension (Sh. Flexion / Extension) · HO SA Row · VERT SA Row · SA Chest Press · SA Shoulder Press · Throw · Slam · Toss |
| **Exercise type** (סוג תרגיל) | 3 | Ipsilateral · Unilateral · Contralateral |
| **Body position** (תנוחה) | ~25 | Standing (wide / narrow / elevated heels / floating heels) · ATH-POS · B-Stance · Seating (floor / bench) · Supinated & Pronated Laying · Half- and Tall-Kneeling · Bird-Dog · Plank · Push-Up position · Bear · Crab · Hollow · Dead-Hang · Inclined / Declined / Chest-Supported bench · Wall-assisted |
| **Limb position** (מנח גפה) | ~5 | Hands variations |

A cue block for any exercise is therefore
`movement + position + exercise-type + limb-position`, plus a short
variant-specific override where the composition is not enough.

**This is the whole point of the plan.** Authoring 1,326 blocks by hand is not a
project anyone finishes. Authoring ~72 layer blocks — most already drafted in
the doc — and composing them is.

The doc currently covers **upper body + all positions**. Lower body and the
remaining plyo movements are still to author (matches the standing order in
`project_upper_body_cues_resume_2026_06_01`: upper → lower → plyo).

## 3. The blocker, and why it is first

Composition needs to know, per exercise: movement, body position, exercise type,
limb position. Today **75 of 1,326** carry even a category.

The Classify screen (Exercises hub → Classify) already exists for exactly this
and already proposes taxonomy values. Nothing else in the plan can start until
coverage is high, because without it there is no way to pick which layer blocks
compose an exercise's cue.

## 4. Phases

**Phase 0 — freeze the standard (done).** `STYLE_GUIDE.md` is locked. Any change
to it invalidates work already approved, so it does not change mid-project.

**Phase 1 — taxonomy coverage.** Drive category / movement / position / laterality
coverage from 6% toward ~100% via the Classify screen. Claude proposes in bulk,
Ohad approves in bulk; nothing is written unreviewed. Gate to leave the phase:
every exercise that appears in a live plan row is classified (those matter first
— they are what an athlete actually opens).

**Phase 2 — author the layer blocks, with Ohad.** Convert the doc's 72 blocks
into the locked format, layer by layer, Ohad authoring and Claude structuring and
verifying. **Never solo** (`feedback_ohad_cue_authoring`): Claude does not
invent, place, or drop a cue line. Order: the movements that cover the most
classified exercises first, so each approved block immediately unlocks the
largest number of variants.

**Phase 3 — compose and preview.** Generate proposed cue blocks by composition
for every classified exercise. These are **proposals in a review queue**, not
writes. Ohad approves per exercise or per movement group; only approved blocks
are written to `library.cues`.

**Phase 4 — normalise the 806 legacy blocks.** Apply the style guide mechanically
where it is unambiguous — strip trailing periods (81 blocks), transliterate Latin
terms (37 blocks), convert future tense to imperative, fix feminine slips — and
show every diff to Ohad before it lands. Where the legacy text conflicts with the
composed block, the legacy text wins if Ohad approved it; the composition only
fills gaps.

**Phase 5 — propagate.** `library.cues` is the source; plan rows carry snapshots
in `notes`/`n` (`reference_plan_notes_from_library_cues`). After each approved
batch, re-run the fill-empty-only backfill so athletes see the new cues, and
never overwrite a coach's plan-specific note (`audit #55` — the plan note wins).

## 5. Verification gates (every batch, no exceptions)

1. **Style conformance is machine-checked, not eyeballed** — extend
   `scripts/_cue-coverage.cjs` into a linter for §2 (no Latin), §3 (exactly the
   two phase labels), §4 (masculine singular), §6 (no trailing period, `90 מעלות`
   not `°`, en-dash ranges).
2. **Athletes must be able to read it.** Athletes cannot read the library
   (`reference_athlete_title_resolution`), so every approved cue must reach the
   plan row snapshot. Verify from the athlete seat, not the coach seat.
3. **Never bulk-touch the library without an explicit OK**
   (`reference_library_video_gaps`), and take a dated backup first
   (`feedback_data_ops_reversible`).

## 6. What NOT to do

- Do **not** flatten the phase format back to plain bullets.
- Do **not** author, place, or drop cue lines without Ohad.
- Do **not** write a cue for an exercise whose classification is a guess — an
  empty cue is better than a wrong one (`feedback_data_fidelity`).
- Do **not** re-open the style guide mid-project.

## 7. Cost, honestly

Phase 1 is the only phase with real bulk work, and it is mostly machine-proposed.
Phase 2 is the only phase that needs Ohad's time in volume — roughly 72 blocks,
which at a handful of minutes each is a few focused sessions, not a marathon.
Phases 3–5 are automation plus approval clicks. The composition model is what
turns this from ~1,326 authoring decisions into ~72.
