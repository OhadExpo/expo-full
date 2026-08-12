// Camera goniometer — turns the pose engine's active joint-angle range into a
// clinical single-axis ROM degree the coach can drop into an Evaluation field.
//
// HONEST SCOPE (this is the whole point — do not widen it without evidence):
// 2D markerless pose recovers only SAGITTAL-plane flexion/extension reliably.
// Rotation (internal/external), frontal-plane (ab/adduction, lateral flexion),
// neck, scapula and ankle axes are NOT offered here — 2D can't see out-of-plane
// rotation, and the eval keeps those as manual goniometry. Even for the axes we
// DO measure, this is ACTIVE range (the athlete moves their own joint), which
// trends a few degrees below true passive end-range, so the coach CONFIRMS every
// value before it's written — the camera proposes, it never silently fills a
// clinical field. See evalTestMap.js for the jump/hold side of the same idea.
//
// The pose engine (poseLab.jointRomMetrics) reports, per joint channel, the
// INTERIOR angle at the joint vertex over the clip: {name:'L KNE', maxDeg, minDeg}.
// Interior-angle conventions (from repCounter.ANGLE_DEFS three-point defs):
//   KNE (hip·knee·ankle): straight leg ~180°, deep flexion small → clinical
//       knee flexion  = 180 − minInterior
//   HIP (shoulder·hip·knee): standing tall ~180°, thigh raised reduces it →
//       clinical hip  flexion = 180 − minInterior
//   SHO (hip·shoulder·elbow): arm by side ~0–15°, overhead ~180° → clinical
//       shoulder flexion = maxInterior  (direct, no inversion)
//
// Each spec carries the L/R channel pair and a `toClinical(entry)` that folds one
// jointRom entry into a clinical degree. We measure both sides and surface each,
// plus the demonstrated max, so the coach sees the fuller range and any L/R gap.

// clamp helper — a measured clinical degree outside a physiological window is a
// tracking artifact (occlusion, wrong camera plane), not a real end-range, so we
// null it rather than propose a nonsense number into the eval.
const clampDeg = (v, lo, hi) => (v == null || !Number.isFinite(v) || v < lo || v > hi ? null : Math.round(v));

// jointId/axis here MUST match evaluationSchema.rom joints + axis labels, so
// romKey(jointId, axis) lands in the right field.
export const ROM_CAMERA_AXES = [
  {
    jointId: 'knee', axis: 'Flexion', channels: { L: 'L KNE', R: 'R KNE' },
    cue: 'Film from the SIDE. Athlete bends the knee through its full range (heel to glute) and back.',
    // deepest bend = smallest interior angle
    toClinical: (e) => clampDeg(180 - e.minDeg, 20, 170),
  },
  {
    jointId: 'hip', axis: 'Flexion', channels: { L: 'L HIP', R: 'R HIP' },
    cue: 'Film from the SIDE. Athlete raises the thigh toward the chest through full range.',
    toClinical: (e) => clampDeg(180 - e.minDeg, 20, 150),
  },
  {
    jointId: 'shoulder', axis: 'Flexion', channels: { L: 'L SHO', R: 'R SHO' },
    cue: 'Film from the SIDE. Athlete raises the straight arm forward and overhead through full range.',
    // arm overhead = largest interior angle (direct, no inversion)
    toClinical: (e) => clampDeg(e.maxDeg, 30, 185),
  },
];

// Is this (jointId, axisLabel) pair one the camera can honestly measure?
export function romCameraSpec(jointId, axisLabel) {
  return ROM_CAMERA_AXES.find((s) => s.jointId === jointId && s.axis === axisLabel) || null;
}

// Fold a jointRomMetrics array (from analyzeClip().jointRom) into a per-side
// clinical reading for one axis spec. Returns null if neither side is measurable.
//   { L, R, max, maxSide, asymDeg }  (degrees; L/R may be null individually)
export function romReadingFor(spec, jointRom) {
  if (!spec || !Array.isArray(jointRom)) return null;
  const byName = Object.fromEntries(jointRom.map((j) => [j.name, j]));
  const L = byName[spec.channels.L] ? spec.toClinical(byName[spec.channels.L]) : null;
  const R = byName[spec.channels.R] ? spec.toClinical(byName[spec.channels.R]) : null;
  if (L == null && R == null) return null;
  const sides = [['L', L], ['R', R]].filter(([, v]) => v != null);
  const [maxSide, max] = sides.reduce((best, cur) => (cur[1] > best[1] ? cur : best));
  const asymDeg = (L != null && R != null) ? Math.abs(L - R) : null;
  return { L, R, max, maxSide, asymDeg };
}
