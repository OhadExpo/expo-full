# Athletic Evaluation — Movements Section UI redesign

Date: 2026-06-04
Status: Approved direction, spec for review

## Goal

Make the Athletic Evaluation editor easier to operate while testing a client,
for the Movements (qualitative) section only. Three changes:

1. Show the per-exercise **parameters to watch** (from the ATH EVAL sheet) as an
   always-visible reference column.
2. Replace free-text scoring with **1-3 tap buttons**, color-coded
   (1 red · 2 orange · 3 green), per side (L/R) for sided moves and single for
   bilateral moves.
3. Add a **collapsible per-exercise note** field.

Out of scope (separate, later tasks): Passive ROM normative completion; the
collapsible-cards audit; setting gender on real athletes.

## Scope boundary

Only the **Movements** section (`sectionId === 'movements'`, 14 tests) changes.
Stability & Isometric, Jumping & Landing, and Acceleration/Deceleration keep
their existing numeric/free-text `TestRow` rendering untouched. Passive ROM is
unchanged in this task.

## 1. Parameters to watch (reference data)

Add a `params: string[]` field to each Movements test in `evaluationSchema.js`,
transcribed from the ATH EVAL sheet's "Parameters" column. Pure reference —
never scored, never persisted. Obvious spelling typos in the source are
corrected (Stablility→Stability, Strenth→Strength, Diaphramic→Diaphragmatic,
Rectraction→Retraction); wording/structure otherwise preserved verbatim.

| id | exercise | params |
|----|----------|--------|
| bw_lunge | BW Standing Lunge | Hip Extension (Strength, Mobility) · Knee Flexion+Extension (Stability) · Ankle Dorsal-Flexion (Mobility) |
| bw_alt_lunge | BW Alternating Lunge | Hip External Rotation (Mobility, Stability) · Knee Flexion+Extension (Strength, Stability) · Ankle Inversion (Mobility, Stability) · Foot Pronation (Mobility) |
| bw_rfess | BW RFESS | Hip Internal Rotation+Flexion (Mobility, Stability) · Knee Flexion+Extension (Strength, Stability) · Ankle Eversion (Mobility, Stability) · Foot Arches (Mobility) |
| bw_squat | BW Squat | Hip Rotation (Mobility) · Knee External Rotation (Mobility, Stability) · Ankle+Foot (Mobility, Stability) |
| sl_hip_thrust | Single Leg Hip Thrust | Hip Internal Rotation+Extension (Strength, Mobility) · Knee Extension (Strength, Stability) · Trunk (Strength, Diaphragmatic Control) |
| dh_scap_pr | Dead-Hang Scapula PRO/RET | Scapula Depression+Elevation (Strength, Mobility) · Elbow Extension (Mobility, Stability) · Wrist (Strength) |
| pu_scap_pr | Push-Up Stance Scapula PRO/RET | Scapula Retraction+Protraction (Strength, Stability, Mobility) · Elbow Extension (Strength, Stability) · Wrist Extension (Strength, Mobility) |
| push_up | Push-Up | Scapula Movement (Mobility) · Shoulder External Rotation (Mobility, Stability) · Elbow Extension (Strength, Stability) · Wrist Extension (Strength) · Trunk (Strength) |
| sup_inverted_row | Supinated Inverted Row | Shoulder (Internal Rotation) · Elbow Flexion (Strength) · Trunk (Strength) |
| hollow_hold | Hollow Hold | Neck Flexion (Strength/Stability) · Hip Flexion (Strength/Stability) · Trunk (Strength + Diaphragmatic Control) |
| wall_toss | Alternate-Hand Wall Toss | Coordination/Hip Rotation |
| db_rdl | DB RDL | Hip Extension (Mobility) · Hip Flexion (Strength) · Knee External Rotation (Mobility, Stability) · Trunk (Strength + Diaphragmatic Control) |
| fh_bstance_rdl | Floating Heel B-Stance DB RDL | Hip Internal Rotation w Hinge (Mobility, Stability) · Foot (Pronation) |
| hk_cable_row | Half-Kneeled SA Cable Row | Scapula Upward/Downward Rotation (Mobility, Stability) · Shoulder Internal Rotation (Strength, Mobility) · Trunk (Strength + Diaphragmatic Control) |

Rendered as a `WATCH` column, one parameter per line, muted text.

## 2. 1-3 tap scoring (Movements only)

Replace the free-text score `<input>` with three tap buttons `[1][2][3]`.

- **Sided** moves (`sides: ['L','R']`): an L button-group and an R button-group.
- **Bilateral** moves: one button-group.
- **Colors:** 1 = red (`C.rd`), 2 = orange (`C.or`), 3 = green (success token;
  use `#00A85D` dark / `#00CA72` light to match the Tasks "done" green).
  Selected button = solid fill in its color + white text. Unselected = faint
  outline of its color (low-alpha border, muted text) so the row reads calm
  until tapped.
- Tapping the already-selected number clears it (toggle off).

### Data model — no migration

Stored exactly as today in `scores[testId]`:
- Sided: `{ L: 1|2|3, R: 1|2|3 }`
- Bilateral: `1|2|3` (scalar)

The integer values slot into the existing object-vs-scalar shape, so the
side-by-side comparison view and `countFilled` keep working unchanged.

**Legacy values:** older evals stored free-text like `"5"`, `"R-4"`. In the
editor, if the existing value isn't in {1,2,3}, no button is highlighted and a
faint `was: <value>` hint shows beneath the group until the coach taps a new
score. Nothing is auto-converted or destroyed. The read-only comparison view
continues to render whatever string is stored.

## 3. Per-exercise collapsible note

A `📝` toggle sits with the score zone. Tapping opens a single-line text input
inline; a filled note shows the icon in the accent color so it reads as
"has note" at a glance.

### Storage — reserved key, no migration

Per-exercise notes live under a reserved key inside the existing `scores` JSONB:

```
scores.__notes = { [testId]: "free text" }
```

`__notes` is namespaced so it never collides with a test id, and both
`countFilled` and the schema-driven render loops iterate known test ids only, so
it is invisible to them. The existing top-level `notes` textarea (global
coach observations) is unchanged and kept.

## Component design

`EvaluationEditor.jsx`:

- `TestRow` gains an early branch: when `sectionId === 'movements'`, render a new
  `MovementRow` (three zones: `TEST + goal` · `WATCH params` · `SCORE 1-3 L/R +
  note`). All other sections fall through to the existing `TestRow` body
  unchanged.
- New `ScoreButtons({ value, onChange })` — the 1/2/3 colored toggle group.
- New `MovementRow` — composes name/goal, the params list, the score buttons
  (one group bilateral / two groups sided), and the note toggle+input.
- `SectionBlock` passes `sectionId` down and, for the movements section, renders
  column headers `# · TEST · WATCH · SCORE` (the non-movements header stays
  `# · TEST · GOAL · SCORE`).
- Note state: `notes` map read from `existing?.scores?.__notes`, written back
  into `scores.__notes` on save via the existing `setScore`/save path.

No change to `evaluationsData.js` (DB layer) or DB schema.

## Testing / verification

- Create + save a new eval: tap 1/2/3 on sided and bilateral movements, add a
  couple per-exercise notes → reload → values + notes persist.
- Open Diego's existing eval (has legacy `"4"/"5"` movement scores) → legacy
  `was: N` hints show, comparison view still renders, re-tapping overwrites.
- Confirm Stability/Jumping/Accel rows render and save exactly as before.
- Confirm `countFilled` badge count is unaffected by `__notes`.
- Verify colors in both dark and light (`isRefined5b`) themes.
