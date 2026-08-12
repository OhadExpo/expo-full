// Regression fixtures for the camera goniometer (src/romGoniometer.js).
// This writes a CLINICAL number a coach acts on, so the interior->clinical
// conversion, the robust-extreme preference, the clamp behaviour, and the
// worse-side pick are all pinned here. Run: node scripts/_verify-rom-goniometer.mjs
import { romCameraSpec, romReadingFor, ROM_CAMERA_AXES } from '../src/romGoniometer.js';

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n   got  ${JSON.stringify(got)}\n   want ${JSON.stringify(want)}`}`);
  ok ? pass++ : fail++;
};

// --- conversion direction per joint (raw min/max, no robust fields) ---
eq('knee flexion: interior min 40 -> 140',
  romReadingFor(romCameraSpec('knee', 'Flexion'), [{ name: 'L KNE', maxDeg: 178, minDeg: 40 }]).max, 140);
eq('hip flexion: interior min 90 -> 90 (thigh horizontal)',
  romReadingFor(romCameraSpec('hip', 'Flexion'), [{ name: 'L HIP', maxDeg: 180, minDeg: 90 }]).max, 90);
eq('shoulder flexion: interior max 165 -> 165 (direct)',
  romReadingFor(romCameraSpec('shoulder', 'Flexion'), [{ name: 'L SHO', maxDeg: 165, minDeg: 12 }]).max, 165);

// --- robust extreme (loDeg/hiDeg) preferred over a single-frame glitch ---
eq('knee: robust loDeg 40 used over glitch minDeg 30 -> 140',
  romReadingFor(romCameraSpec('knee', 'Flexion'), [{ name: 'L KNE', maxDeg: 178, minDeg: 30, hiDeg: 177, loDeg: 40 }]).max, 140);
eq('shoulder: robust hiDeg 168 used over glitch maxDeg 179 -> 168',
  romReadingFor(romCameraSpec('shoulder', 'Flexion'), [{ name: 'L SHO', maxDeg: 179, minDeg: 12, hiDeg: 168, loDeg: 11 }]).max, 168);

// --- clamp: the restricted joint (the reason a goniometer exists) is KEPT ---
eq('stiff knee 15deg flexion is NOT nulled',
  romReadingFor(romCameraSpec('knee', 'Flexion'), [{ name: 'L KNE', maxDeg: 178, minDeg: 165, hiDeg: 177, loDeg: 165 }]).max, 15);
// --- clamp: total non-movement (2deg) IS nulled (no false tiny flexion) ---
eq('no-movement 2deg -> null reading',
  romReadingFor(romCameraSpec('knee', 'Flexion'), [{ name: 'L KNE', maxDeg: 178, minDeg: 178, hiDeg: 178, loDeg: 178 }]), null);
// --- clamp: impossible above-ceiling (occlusion artifact) IS nulled ---
eq('knee 200deg artifact -> null reading',
  romReadingFor(romCameraSpec('knee', 'Flexion'), [{ name: 'L KNE', maxDeg: 178, minDeg: -20, hiDeg: 178, loDeg: -20 }]), null);

// --- worse side is min/minSide; demonstrated max is max/maxSide ---
const two = romReadingFor(romCameraSpec('knee', 'Flexion'), [
  { name: 'L KNE', maxDeg: 178, minDeg: 40, hiDeg: 177, loDeg: 40 },   // 140
  { name: 'R KNE', maxDeg: 176, minDeg: 52, hiDeg: 175, loDeg: 52 },   // 128
]);
eq('two-sided: max=140 L, min(worse)=128 R, asym 12',
  { max: two.max, maxSide: two.maxSide, min: two.min, minSide: two.minSide, asym: two.asymDeg },
  { max: 140, maxSide: 'L', min: 128, minSide: 'R', asym: 12 });

// --- guards: only measurable axes have a spec; junk input never throws ---
eq('knee Internal Rotation has no camera spec', romCameraSpec('knee', 'Internal Rotation'), null);
eq('neck Flexion has no camera spec', romCameraSpec('neck', 'Flexion'), null);
eq('empty jointRom -> null', romReadingFor(romCameraSpec('knee', 'Flexion'), []), null);
eq('non-array jointRom -> null', romReadingFor(romCameraSpec('knee', 'Flexion'), null), null);
eq('missing channel -> null', romReadingFor(romCameraSpec('knee', 'Flexion'), [{ name: 'L SHO', maxDeg: 170, minDeg: 10 }]), null);
eq('only 3 axes are camera-measurable (knee/hip/shoulder flexion)',
  ROM_CAMERA_AXES.map((a) => `${a.jointId}:${a.axis}`), ['knee:Flexion', 'hip:Flexion', 'shoulder:Flexion']);

console.log(`\n${fail === 0 ? '✓ ALL PASS' : '✗ FAILURES'} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
