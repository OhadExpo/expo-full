// Regression fixtures for the extended camera-goniometer ROM catalog
// (src/evalTestMap.js ROM_LIVE_AXES) that backs the top-level CAMERA TEST
// picker. Each axis writes a CLINICAL degree a coach acts on, so the
// interior→clinical conversion, per-axis clamps, and honest "soon" boundary
// are pinned here. The specs reuse romGoniometer.romReadingFor (generic over
// any spec with channels + toClinical), so this also proves that wiring.
// Run: node scripts/verify-eval-camera-rom.mjs
import { romReadingFor } from '../src/romGoniometer.js';
import { romAxisSpec, ROM_LIVE_AXES } from '../src/evalTestMap.js';
import { EVAL_SCHEMA, romKey } from '../src/evaluationSchema.js';

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n   got  ${JSON.stringify(got)}\n   want ${JSON.stringify(want)}`}`);
  ok ? pass++ : fail++;
};
// read one axis' clinical `max` from a single-side jointRom entry
const read = (jointId, axis, entry) => {
  const r = romReadingFor(romAxisSpec(jointId, axis), [entry]);
  return r ? r.max : null;
};

// ── shoulder (L/R SHO = hip·shoulder·elbow, arm-by-side≈0 → raised≈180) ──
eq('shoulder Flexion: interior max 165 -> 165 (direct)',   read('shoulder', 'Flexion',   { name: 'L SHO', maxDeg: 165, minDeg: 12 }), 165);
eq('shoulder Abduction: interior max 170 -> 170 (direct)', read('shoulder', 'Abduction', { name: 'L SHO', maxDeg: 170, minDeg: 10 }), 170);
eq('shoulder Extension: interior max 55 -> 55',            read('shoulder', 'Extension', { name: 'L SHO', maxDeg: 55, minDeg: 8 }), 55);
eq('shoulder Extension: impossible 120 (flex/abd film) -> null', read('shoulder', 'Extension', { name: 'L SHO', maxDeg: 120, minDeg: 8 }), null);

// ── hip (L/R HIP = shoulder·hip·knee, standing≈180 → moved-away reduces) ──
eq('hip Flexion: interior min 90 -> 90',   read('hip', 'Flexion',   { name: 'L HIP', maxDeg: 180, minDeg: 90 }), 90);
eq('hip Extension: interior min 150 -> 30', read('hip', 'Extension', { name: 'L HIP', maxDeg: 180, minDeg: 150 }), 30);
eq('hip Extension: over-ceiling (60) -> null', read('hip', 'Extension', { name: 'L HIP', maxDeg: 180, minDeg: 120 }), null);
eq('hip Abduction: interior min 140 -> 40', read('hip', 'Abduction', { name: 'L HIP', maxDeg: 180, minDeg: 140 }), 40);
eq('hip Adduction: interior min 150 -> 30', read('hip', 'Adduction', { name: 'L HIP', maxDeg: 180, minDeg: 150 }), 30);

// ── knee (L/R KNE = hip·knee·ankle, straight≈180 → flexed reduces) ──
eq('knee Flexion: interior min 40 -> 140', read('knee', 'Flexion', { name: 'L KNE', maxDeg: 178, minDeg: 40 }), 140);
eq('knee Flexion: robust loDeg preferred over glitch minDeg', read('knee', 'Flexion', { name: 'L KNE', maxDeg: 178, minDeg: 30, hiDeg: 177, loDeg: 40 }), 140);
eq('knee Flexion: stiff 15deg is KEPT (not nulled)', read('knee', 'Flexion', { name: 'L KNE', maxDeg: 178, minDeg: 165 }), 15);

// ── knee Over-Extension (signed-knee channel; overExtDeg carries the hyperext) ──
eq('knee Over-Extension: overExtDeg 7 -> 7', read('knee', 'Over-Extension', { name: 'L KNE±', overExtDeg: 7 }), 7);
eq('knee Over-Extension: overExtDeg 0 (none) -> 0 kept', read('knee', 'Over-Extension', { name: 'L KNE±', overExtDeg: 0 }), 0);
eq('knee Over-Extension: uncalibrated (null) -> null reading', romReadingFor(romAxisSpec('knee', 'Over-Extension'), [{ name: 'L KNE±', overExtDeg: null }]), null);

// ── neck (unsided single-channel; sagittal signed +flex/−ext, lateral magnitude) ──
eq('neck Flexion: signed hiDeg 45 -> 45', read('neck', 'Flexion', { name: 'NECK FLEX', maxDeg: 45, minDeg: -30, hiDeg: 45, loDeg: -30 }), 45);
eq('neck Extension: signed loDeg -30 -> 30', read('neck', 'Extension', { name: 'NECK FLEX', maxDeg: 45, minDeg: -30, hiDeg: 45, loDeg: -30 }), 30);
eq('neck Lateral Flexion: magnitude 25 -> 25', read('neck', 'Lateral Flexion', { name: 'NECK LAT', maxDeg: 25, minDeg: 0, hiDeg: 25, loDeg: 0 }), 25);
eq('neck read is single (no L/R split)', romReadingFor(romAxisSpec('neck', 'Flexion'), [{ name: 'NECK FLEX', hiDeg: 40, loDeg: -20, maxDeg: 40, minDeg: -20 }]).single, true);

// ── ankle (static hold; interior 90≈neutral → dorsi=90−v, plantar=v−90) ──
eq('ankle Dorsal-Flexion: static 72 -> 18', read('foot_ankle', 'Dorsal-Flexion', { name: 'L ANK', maxDeg: 72, minDeg: 72, hiDeg: 72, loDeg: 72 }), 18);
eq('ankle Dorsal-Flexion on a PLANTAR hold (130) -> null', romReadingFor(romAxisSpec('foot_ankle', 'Dorsal-Flexion'), [{ name: 'L ANK', maxDeg: 130, minDeg: 130, hiDeg: 130, loDeg: 130 }]), null);
eq('ankle Plantar-Flexion: static 130 -> 40', read('foot_ankle', 'Plantar-Flexion', { name: 'L ANK', maxDeg: 130, minDeg: 130, hiDeg: 130, loDeg: 130 }), 40);
eq('ankle Plantar-Flexion on a DORSI hold (72) -> null', romReadingFor(romAxisSpec('foot_ankle', 'Plantar-Flexion'), [{ name: 'L ANK', maxDeg: 72, minDeg: 72, hiDeg: 72, loDeg: 72 }]), null);

// ── honest boundary: everything 2D pose STILL can't see has NO live spec ──
eq('knee Internal Rotation has no live spec (axial rotation)', romAxisSpec('knee', 'Internal Rotation'), null);
eq('shoulder Internal Rotation has no live spec', romAxisSpec('shoulder', 'Internal Rotation'), null);
eq('shoulder Adduction has no live spec (self-occluded)', romAxisSpec('shoulder', 'Adduction'), null);
eq('hip External Rotation has no live spec', romAxisSpec('hip', 'External Rotation'), null);
eq('neck Rotation has no live spec (axial rotation)', romAxisSpec('neck', 'Rotation'), null);
eq('foot_ankle Inversion has no live spec (out-of-plane)', romAxisSpec('foot_ankle', 'Inversion'), null);
eq('scapula Retraction has no live spec', romAxisSpec('scapula', 'Retraction'), null);

// ── the live set is exactly the 14 honestly-measurable axes ──
eq('exactly 14 live axes, in order',
  ROM_LIVE_AXES.map(a => `${a.jointId}:${a.axis}`),
  ['shoulder:Flexion', 'shoulder:Extension', 'shoulder:Abduction',
   'hip:Flexion', 'hip:Extension', 'hip:Abduction', 'hip:Adduction',
   'knee:Flexion', 'knee:Over-Extension',
   'neck:Flexion', 'neck:Extension', 'neck:Lateral Flexion',
   'foot_ankle:Dorsal-Flexion', 'foot_ankle:Plantar-Flexion']);

// ── every live axis' (jointId, axis) exists in the eval schema, so
//    romKey(jointId, axis) lands in a real rom[] field ──
const schemaKeys = new Set();
for (const j of EVAL_SCHEMA.rom.joints) for (const ax of j.axes) schemaKeys.add(romKey(j.id, ax));
for (const a of ROM_LIVE_AXES) {
  eq(`live axis ${a.jointId}:${a.axis} maps to a real schema rom key`,
    schemaKeys.has(romKey(a.jointId, a.axis)), true);
}

console.log(`\n${fail === 0 ? '✓ ALL PASS' : '✗ FAILURES'} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
