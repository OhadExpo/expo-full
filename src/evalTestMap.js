// Maps Athletic-Evaluation test ids → the camera tool that measures them and
// how to fold the tool's result into that test's eval field value. This is the
// spine of the "test inside the eval" flow: the editor shows a TEST button next
// to every id listed here, launches the tool, and writes the measured value
// straight into scores[id].
//
// Only what the camera measures RELIABLY today is wired. Reliability ceiling is
// frame rate (per research: native slow-mo upload ≈ ±1cm at 240fps; live web
// camera ≈ ±3–10cm at 30–60fps), so jumps prefer an uploaded slow-mo clip.
//
// Stubbed (coming): broad_jump needs a horizontal scale reference; iso_* need a
// hold timer; the ROM joints need the pose goniometer. Listed here as
// `status:'soon'` so the UI can show a disabled "TEST · soon" affordance instead
// of pretending. drop_jump / sl_pogo are now LIVE — reactiveJumpMetrics gives
// ground-contact + RSI, and the jump tool branches to reactive mode on jumpType.

import { romKey } from './evaluationSchema.js';

// jumpType drives the on-screen cue/label inside the jump tool. side:true means
// the test stores a per-limb { L, R } object and the button is offered per side.
// `cue` = the framing shown on the tool's capture screen so the read is valid.
export const EVAL_TEST_TOOLS = {
  // Jumping & Landing — vertical height from flight time (h = g·t²/8)
  svj:        { tool: 'jump', jumpType: 'svj', label: 'Standing Vertical Jump', cue: 'Film side-on, full body in frame, ~2–3m back. Stand still, then jump straight up — no arm swing, no dip.', toValue: j => String(j.heightCm) },
  cmj:        { tool: 'jump', jumpType: 'cmj', label: 'Countermovement Jump',   cue: 'Film side-on, full body in frame, ~2–3m back. Stand still, dip and jump straight up in one motion.', toValue: j => String(j.heightCm) },
  sl_jump:    { tool: 'jump', jumpType: 'sl',  label: 'Single-Leg Jump', side: true, cue: 'Film side-on, full body in frame. Stand still on ONE leg, then jump straight up off that leg.', toValue: j => String(j.heightCm) },

  // Reactive jumps — ground-contact + RSI via reactiveJumpMetrics. The jump
  // tool segments airborne windows and contacts; the result carries heightCm,
  // contactMs (the SSC/LSC ground-contact time), and rsi. toValue folds those
  // into the composite eval field (matching evaluationSchema composite ids).
  drop_jump:  { tool: 'jump', jumpType: 'drop', label: 'Drop Jump (RSI)',
                cue: 'Film side-on, full body in frame. Drop off the box, land and rebound IMMEDIATELY — minimise ground contact.',
                toValue: j => ({ height_cm: String(j.heightCm), ssc_ms: String(j.contactMs), rsi: String(j.rsi) }) },
  sl_pogo:    { tool: 'jump', jumpType: 'pogo', side: true, label: 'POGO (RSI)',
                cue: 'Film side-on, full body in frame. Repeated stiff single-leg hops on the spot — stay tall, minimise ground contact.',
                toValue: j => ({ ssc_ms: String(j.contactMs), rsi: String(j.rsi) }) },

  // Standing broad jump — horizontal distance scaled by the athlete's stature.
  // Measured start-still → landing-still; coach-confirmed (and rescalable to a
  // known height) before it writes. See poseLab.broadJumpMetrics.
  broad_jump: { tool: 'jump', jumpType: 'broad', label: 'Standing Broad Jump',
                cue: 'Film side-on, full body + a couple of metres of runway in frame. Stand still behind the line, jump forward once, land and hold still.',
                toValue: j => String(j.distanceCm) },

  // Isometric holds — coach-operated hold-to-failure timer (no pose; a
  // stopwatch is the right tool). Result is whole seconds; sided tests store
  // { L, R }. unit in evaluationSchema is 'sec'.
  iso_sl_stand: { tool: 'hold', side: true, label: 'ISO Single-Leg Stand', goal: '30 sec E', cue: 'Balance on one leg, eyes forward. Timer runs until the foot touches down or the free leg is grabbed.', toValue: s => String(s) },
  iso_dead_hang:{ tool: 'hold', label: 'ISO Dead Hang', goal: '30 sec', cue: 'Full dead hang from the bar, arms straight. Timer runs until the grip releases.', toValue: s => String(s) },
  iso_sa_pushup:{ tool: 'hold', side: true, label: 'ISO SA Push-Up Stance', goal: '15 sec E', cue: 'Single-arm push-up stance, body braced. Timer runs until form breaks.', toValue: s => String(s) },
};

export const toolForTest = (testId) => EVAL_TEST_TOOLS[testId] || null;

// ───────────────────────────────────────────────────────────────────────────
// Passive-ROM camera goniometer — axis catalog for the top-level CAMERA TEST
// picker. Same spec shape romGoniometer.js uses (channels + toClinical + cue),
// so each entry drops straight into MovementLab's romSpec path → RomConfirm →
// romReadingFor with ZERO engine changes. The reading is fed analyzeClip()'s
// jointRom (poseLab.jointRomMetrics), which reports the INTERIOR angle at each
// joint vertex per side (see repCounter.ANGLE_DEFS three-point defs):
//   L/R SHO  hip·shoulder·elbow   arm-by-side ≈ 0-15° · raised ≈ 180°
//   L/R HIP  shoulder·hip·knee    standing tall ≈ 180° · limb moved away ↓
//   L/R KNE  hip·knee·ankle       straight ≈ 180° · flexed ↓
//
// HONEST SCOPE (the whole point — do not widen without evidence):
//   • Interior angle is an acos → it lives in [0,180]. It CANNOT distinguish
//     flexion from extension, or the plane the limb moved in — so a live axis is
//     only valid when the coach films that ONE movement and CONFIRMS the number
//     (RomConfirm never silently fills the field). The cue names the camera
//     placement (side-on for sagittal, front-on for frontal) so the read matches
//     the axis.
//   • Axes 2D markerless pose cannot honestly recover are kept OUT of the live
//     set and surfaced as `status:'soon'` by the picker (never faked):
//       – all Internal/External Rotations (2D can't see axial rotation)
//       – knee Over-Extension (acos caps at 180° → hyperextension is invisible)
//       – neck + scapula axes (no pose channel exists in ANGLE_DEFS)
//       – foot/ankle Dorsi/Plantar-Flexion + Inv/Eversion (no ankle-foot channel;
//         MediaPipe foot landmarks are too noisy for a ±20° clinical read)
//       – shoulder Adduction (arm crosses the body → self-occluded)
//
// clampDeg keeps a RESTRICTED joint (the reason a goniometer exists — a knee that
// only flexes 15° is the clinically important case) but nulls a physically
// impossible degree (occlusion/plane artifact above the ceiling, or a
// no-movement read below the floor). Mirrors romGoniometer.clampDeg.
const romLoOf = (e) => (e.loDeg != null ? e.loDeg : e.minDeg);
const romHiOf = (e) => (e.hiDeg != null ? e.hiDeg : e.maxDeg);
const clampDeg = (v, lo, hi) => (v == null || !Number.isFinite(v) || v < lo || v > hi ? null : Math.round(v));

// A raised-limb axis reads the interior angle DIRECTLY (arm-by-side ≈ 0 → the
// bigger the angle, the more range). A moved-away axis reads 180 − interior
// (standing ≈ 180 → the more the limb leaves the standing line, the smaller the
// interior angle). `plane` drives RomConfirm's film-placement warning.
const shoAxis = (axis, plane, ceil, cue) => ({
  jointId: 'shoulder', axis, plane, channels: { L: 'L SHO', R: 'R SHO' }, cue,
  toClinical: (e) => clampDeg(romHiOf(e), 10, ceil),
});
const hipAxis = (axis, plane, ceil, cue) => ({
  jointId: 'hip', axis, plane, channels: { L: 'L HIP', R: 'R HIP' }, cue,
  toClinical: (e) => clampDeg(180 - romLoOf(e), 3, ceil),
});

// The camera-measurable ROM axes. jointId + axis MUST match evaluationSchema.rom
// joints/axis labels so romKey(jointId, axis) lands in the right rom[] field.
//
// EXTENDED honest coverage (2026-08-14) — each backed by a hard-gated engine in
// poseLab.extendedJointRom (signed knee / neck construction / static ankle),
// never a naive acos:
//   • knee Over-Extension — a SIGNED knee angle (cross-product sign) so a knee
//     past straight is visible; the interior acos caps at 180° and can't see it.
//   • neck Flexion/Extension (side-on) + Lateral Flexion (front-on) — from the
//     nose/ear/shoulder/hip construction; unsided (`single`).
//   • foot_ankle Dorsal/Plantar-Flexion (side-on) — a dispersion-gated static
//     hold; foot landmarks are noisy so the engine refuses a wobbly read.
export const ROM_LIVE_AXES = [
  shoAxis('Flexion',   'sagittal', 185, 'Film side-on. Raise the straight arm forward and overhead through full range.'),
  shoAxis('Extension', 'sagittal',  70, 'Film side-on. Reach the straight arm behind the body through full range.'),
  shoAxis('Abduction', 'frontal',  185, 'Film front-on. Raise the straight arm out to the side and overhead through full range.'),
  hipAxis('Flexion',   'sagittal', 150, 'Film side-on. Raise the thigh toward the chest through full range.'),
  hipAxis('Extension', 'sagittal',  45, 'Film side-on. Drive the thigh behind the body (standing or prone) through full range.'),
  hipAxis('Abduction', 'frontal',   60, 'Film front-on. Take the straight leg out to the side through full range.'),
  hipAxis('Adduction', 'frontal',   40, 'Film front-on. Bring the straight leg across the midline through full range.'),
  {
    jointId: 'knee', axis: 'Flexion', plane: 'sagittal', channels: { L: 'L KNE', R: 'R KNE' },
    cue: 'Film side-on. Bend the knee through its full range (heel toward glute) and back.',
    toClinical: (e) => clampDeg(180 - romLoOf(e), 5, 170),
  },
  {
    // Signed-knee channel (extendedJointRom). overExtDeg is the hyperextension
    // magnitude past straight, or null when the sweep couldn't calibrate flexion
    // direction (near-straight clip) — kept honest, no fabricated degree.
    jointId: 'knee', axis: 'Over-Extension', plane: 'sagittal', channels: { L: 'L KNE±', R: 'R KNE±' },
    cue: 'Film SIDE-ON. Bend the knee through its FULL range first (calibrates flexion), then stand and lock it straight — push the knee back.',
    toClinical: (e) => (e.overExtDeg == null ? null : clampDeg(e.overExtDeg, 0, 40)),
  },
  {
    jointId: 'neck', axis: 'Flexion', plane: 'sagittal', single: true, channels: { single: 'NECK FLEX' },
    cue: 'Film SIDE-ON, head + shoulders in frame. Tuck the chin toward the chest through full range, then return.',
    toClinical: (e) => clampDeg(romHiOf(e), 5, 80),
  },
  {
    jointId: 'neck', axis: 'Extension', plane: 'sagittal', single: true, channels: { single: 'NECK FLEX' },
    cue: 'Film SIDE-ON, head + shoulders in frame. Tip the head back (look up) through full range, then return.',
    toClinical: (e) => clampDeg(-romLoOf(e), 5, 80),
  },
  {
    jointId: 'neck', axis: 'Lateral Flexion', plane: 'frontal', single: true, channels: { single: 'NECK LAT' },
    cue: 'Film FRONT-ON, head + shoulders in frame. Tip each ear toward its shoulder through full range.',
    toClinical: (e) => clampDeg(romHiOf(e), 5, 50),
  },
  {
    jointId: 'foot_ankle', axis: 'Dorsal-Flexion', plane: 'sagittal', channels: { L: 'L ANK', R: 'R ANK' },
    cue: 'Film SIDE-ON, foot fully in frame. Pull the toes up toward the shin and HOLD still ~1s.',
    toClinical: (e) => clampDeg(90 - romLoOf(e), 3, 40),
  },
  {
    jointId: 'foot_ankle', axis: 'Plantar-Flexion', plane: 'sagittal', channels: { L: 'L ANK', R: 'R ANK' },
    cue: 'Film SIDE-ON, foot fully in frame. Point the toes away and HOLD still ~1s.',
    toClinical: (e) => clampDeg(romHiOf(e) - 90, 3, 60),
  },
];

// ───────────────────────────────────────────────────────────────────────────
// Writeback helpers — the SINGLE source of truth for how a tool's result lands
// in the eval payload, used by BOTH the top-level picker (TraineeEvaluation) and
// the in-form per-test launch (EvaluationEditor), and asserted end-to-end by
// scripts/verify-eval-writeback.mjs. Keeping the merge here (not inline in two
// components) is what lets the fixture prove the numbers pull into the form shape.
//
// applyTestResult: fold a raw tool result into scores[testId] via map.toValue,
// respecting sided { L, R } merge (never clobber the other side) and composite
// objects (drop_jump/sl_pogo write every sub-key). A RETAKE just calls this again
// — the side/field is replaced, everything else is left intact.
export function applyTestResult(scores, test, map, side, raw) {
  const cur = scores || {};
  const v = map.toValue(raw);
  if (side) {
    const prev = (cur[test.id] && typeof cur[test.id] === 'object') ? cur[test.id] : {};
    return { ...cur, [test.id]: { ...prev, [side]: v } };
  }
  return { ...cur, [test.id]: v };
}

// applyRomResult: write a coach-confirmed clinical degree into rom[romKey]. A
// RETAKE overwrites that one key and leaves every other axis untouched.
export function applyRomResult(rom, spec, deg) {
  return { ...(rom || {}), [romKey(spec.jointId, spec.axis)]: String(deg) };
}

// Human-readable current value of one test (whole, or one side) — drives the
// picker's ✓ "already captured" state AND the retake confirm's "will be
// replaced" line. Returns null when nothing is captured yet (→ launch straight
// into capture, no popup). Shared so both surfaces agree on what "captured" means.
export function testValueDisplay(scores, test, side = null) {
  const v = scores && scores[test.id];
  if (v == null || v === '') return null;
  if (side) {
    const sv = (typeof v === 'object' && v) ? v[side] : null;
    if (sv == null || sv === '') return null;
    return typeof sv === 'object'
      ? Object.entries(sv).filter(([, x]) => x != null && x !== '').map(([k, x]) => `${k}:${x}`).join(' · ')
      : String(sv);
  }
  if (typeof v === 'object') {
    const parts = Object.entries(v).filter(([, x]) => x != null && x !== '');
    if (!parts.length) return null;
    return parts.map(([k, x]) => (typeof x === 'object' ? `${k}:${Object.values(x).join('/')}` : `${k}:${x}`)).join(' · ');
  }
  return String(v);
}

// (jointId, axisLabel) → live camera spec, or null when the camera can't honestly
// measure it (the picker then shows a disabled "soon" affordance for that axis).
export function romAxisSpec(jointId, axisLabel) {
  return ROM_LIVE_AXES.find((s) => s.jointId === jointId && s.axis === axisLabel) || null;
}
