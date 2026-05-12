// Schema for the Athletic Evaluation form.
// Transcribed directly from ATH EVAL.xlsx (DDMMYY sheet) — the canonical
// protocol. Each test has a stable `id` used as the JSONB key in
// trainee_evaluations.scores. Tests with `sides:['L','R']` expect a
// per-side value (`{L: ..., R: ...}`); composite tests expect an object
// keyed by `composite[]` entries.
//
// Value typing is intentionally loose: free-text string. Ohad's example
// sheet uses values like "5", "R-4", "L-4", "R-3/4", "SLDL: 4" — coach
// shorthand that's easier to type than to enum. We don't over-validate;
// we render exactly what was entered.

export const EVAL_SCHEMA = {
  sections: [
    {
      id: 'stability',
      title: 'Stability & Isometric',
      tests: [
        { id: 'iso_sl_stand',   label: 'ISO Single Leg Stand',         unit: 'sec',   goal: '30 sec E',     sides: ['L', 'R'] },
        { id: 'iso_hand_grip',  label: 'ISO Hand Grip',                unit: 'N/kg',  goal: 'Normative',    sides: ['L', 'R'] },
        { id: 'iso_sa_pushup',  label: 'ISO Single Arm Push-Up Stance', unit: 'sec', goal: '15 sec E',     sides: ['L', 'R'] },
        { id: 'iso_dead_hang',  label: 'ISO-Dead Hang',                unit: 'sec',   goal: '30 sec' },
      ],
    },
    {
      id: 'jumping',
      title: 'Jumping & Landing',
      tests: [
        { id: 'cmj',         label: 'Countermovement Jump',            unit: 'cm',  goal: 'cm' },
        { id: 'svj',         label: 'Standing Vertical Jump',          unit: 'cm',  goal: 'cm' },
        { id: 'drop_jump',   label: 'Incremental Drop Jump (RSI)',     unit: 'cm/ms/rsi', goal: 'cm / ms / rsi',
          composite: [
            { id: 'height_cm', label: 'Height',  unit: 'cm' },
            { id: 'ssc_ms',    label: 'SSC/LSC', unit: 'ms' },
            { id: 'rsi',       label: 'RSI',     unit: '' },
          ] },
        { id: 'sl_jump',     label: 'Single Leg Jump',                 unit: 'cm',  goal: 'cm',  sides: ['L', 'R'] },
        { id: 'sl_pogo',     label: 'Vertical Single Leg POGO',        unit: 'ms/rsi', goal: 'ms / rsi',
          composite: [
            { id: 'ssc_ms', label: 'SSC/LSC', unit: 'ms' },
            { id: 'rsi',    label: 'RSI',     unit: '' },
          ],
          sides: ['L', 'R'] },
        { id: 'broad_jump',  label: 'Standing Horizontal/Broad Jump',  unit: 'cm',  goal: 'cm' },
      ],
    },
    {
      id: 'accel_decel',
      title: 'Acceleration / Deceleration',
      tests: [
        { id: 'sprint',  label: 'Sprint',              unit: 'composite', goal: '2-3 reps',
          composite: [
            { id: 'accel',       label: 'Acceleration',    unit: '' },
            { id: 'ground_force',label: 'Ground Force',    unit: '' },
            { id: 'top_v',       label: 'Top Velocity',    unit: '' },
            { id: 'rfd',         label: 'RFD',             unit: '' },
            { id: 'v_vs_h',      label: 'V vs H',          unit: '' },
          ] },
        { id: 'vo2_max', label: 'VO₂-MAX',             unit: 'ml/kg/min', goal: 'Normative' },
        { id: 'cod',     label: 'Sport-Specific COD',  unit: 'composite', goal: '—',
          composite: [
            { id: 'accel',        label: 'Acceleration',    unit: '' },
            { id: 'decel',        label: 'Deceleration',    unit: '' },
            { id: 'ground_force', label: 'Ground Force',    unit: '' },
            { id: 'top_v',        label: 'Top Velocity',    unit: '' },
            { id: 'rfd',          label: 'RFD',             unit: '' },
          ] },
      ],
    },
    {
      id: 'movements',
      title: 'Movements (Strength · Mobility · Stability)',
      hint: 'Score 0–5 per side. Free text accepts "R-4", "L-4/5", "SLDL: 4", etc.',
      tests: [
        { id: 'bw_lunge',         label: 'BW Standing Lunge',              goal: '8 reps E',          sides: ['L', 'R'] },
        { id: 'bw_alt_lunge',     label: 'BW Alternating Lunge',           goal: '8 reps E',          sides: ['L', 'R'] },
        { id: 'bw_rfess',         label: 'BW RFESS',                       goal: '8 reps E',          sides: ['L', 'R'] },
        { id: 'bw_squat',         label: 'BW Squat',                       goal: '2 sets × 5 reps' },
        { id: 'sl_hip_thrust',    label: 'Single Leg Hip Thrust',          goal: '2 sets × 5 reps E', sides: ['L', 'R'] },
        { id: 'dh_scap_pr',       label: 'Dead-Hang Scapula PRO/RET',      goal: '8 reps' },
        { id: 'pu_scap_pr',       label: 'Push-Up Stance Scapula PRO/RET', goal: '12 reps' },
        { id: 'push_up',          label: 'Push-Up',                        goal: 'reps (RPE 5-6)' },
        { id: 'sup_inverted_row', label: 'Supinated Inverted Row',         goal: 'reps (RPE 5-6)' },
        { id: 'hollow_hold',      label: 'Hollow Hold',                    goal: '2 sets × 10 sec' },
        { id: 'wall_toss',        label: 'Alternate-Hand Wall Toss',       goal: '2 sets × 4 reps E' },
        { id: 'db_rdl',           label: 'DB RDL',                         goal: '2 sets × 5 reps' },
        { id: 'fh_bstance_rdl',   label: 'Floating Heel B-Stance DB RDL',  goal: '2 sets × 4 reps E', sides: ['L', 'R'] },
        { id: 'hk_cable_row',     label: 'Half-Kneeled SA Cable Row',      goal: '8 reps E',          sides: ['L', 'R'] },
      ],
    },
  ],

  // Passive ROM lives in a separate top-level `rom` JSONB column. Keyed
  // <joint_id>_<axis_slug>; axis_slug is the lowercase joined-with-_
  // form (e.g. "shoulder_internal_rotation").
  rom: {
    title: 'Passive ROM',
    hint: 'Compare against age-normative values; record degrees per axis.',
    joints: [
      { id: 'neck',       label: 'Neck',         axes: ['Flexion', 'Extension', 'Lateral Flexion', 'Rotation'] },
      { id: 'scapula',    label: 'Scapula',      axes: ['Elevation', 'Depression', 'Protraction', 'Retraction'] },
      { id: 'shoulder',   label: 'Shoulder',     axes: ['Flexion', 'Extension', 'Adduction', 'Abduction', 'Internal Rotation', 'External Rotation'] },
      { id: 'hip',        label: 'Hip',          axes: ['Flexion', 'Extension', 'Adduction', 'Abduction', 'Internal Rotation', 'External Rotation'] },
      { id: 'knee',       label: 'Knee',         axes: ['Flexion', 'Over-Extension', 'Internal Rotation', 'External Rotation'] },
      { id: 'foot_ankle', label: 'Foot & Ankle', axes: ['Dorsal-Flexion', 'Plantar-Flexion', 'Inversion', 'Eversion'] },
    ],
  },
};

// Stable key helpers — keep client + server consistent.
export const romKey = (jointId, axisLabel) =>
  `${jointId}_${axisLabel.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z_]/g, '')}`;

// Flatten the schema into one ordered list of test rows (for the editor).
export function flattenSchema() {
  const rows = [];
  for (const s of EVAL_SCHEMA.sections) {
    rows.push({ kind: 'section', id: s.id, label: s.title, hint: s.hint });
    for (const t of s.tests) rows.push({ kind: 'test', sectionId: s.id, test: t });
  }
  rows.push({ kind: 'section', id: 'rom', label: EVAL_SCHEMA.rom.title, hint: EVAL_SCHEMA.rom.hint });
  for (const j of EVAL_SCHEMA.rom.joints) {
    rows.push({ kind: 'joint', joint: j });
  }
  return rows;
}

// Count how many test fields are filled in a scores+rom payload — used
// to show progress badges on the side-by-side comparison view.
export function countFilled(scores, rom) {
  let n = 0;
  for (const s of EVAL_SCHEMA.sections) {
    for (const t of s.tests) {
      const v = scores?.[t.id];
      if (v == null) continue;
      if (typeof v === 'object') {
        if (Object.values(v).some(x => x != null && x !== '')) n++;
      } else if (v !== '') n++;
    }
  }
  for (const j of EVAL_SCHEMA.rom.joints) {
    for (const ax of j.axes) {
      const v = rom?.[romKey(j.id, ax)];
      if (v != null && v !== '') n++;
    }
  }
  return n;
}
