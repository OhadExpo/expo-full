// End-to-end WRITEBACK fixture — proves a tool's measured result lands in the
// correct eval field, in the correct SHAPE, through the SAME helpers both the
// top-level picker (TraineeEvaluation) and the in-form launch (EvaluationEditor)
// use: evalTestMap.applyTestResult (scores[id], sided {L,R} merge, composite
// objects) and applyRomResult (rom[romKey]). Also asserts a RETAKE overwrites
// cleanly (old value replaced, everything else untouched). This is the honest
// bridge between the analyzer numbers and the eval form.
// Run: node scripts/verify-eval-writeback.mjs
import { EVAL_TEST_TOOLS, applyTestResult, applyRomResult, romAxisSpec, ROM_LIVE_AXES } from '../src/evalTestMap.js';
import { EVAL_SCHEMA, romKey } from '../src/evaluationSchema.js';
import { romReadingFor } from '../src/romGoniometer.js';

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n   got  ${JSON.stringify(got)}\n   want ${JSON.stringify(want)}`}`);
  ok ? pass++ : fail++;
};

// test object by id (carries sides/composite so applyTestResult merges correctly)
const testById = {};
for (const s of EVAL_SCHEMA.sections) for (const t of s.tests) testById[t.id] = t;
const apply = (scores, id, side, raw) => applyTestResult(scores, testById[id], EVAL_TEST_TOOLS[id], side, raw);

// ── simple test → scores[id] as a string ──
eq('svj height 42 → scores.svj = "42"', apply({}, 'svj', null, { heightCm: 42 }), { svj: '42' });
eq('broad_jump 210 → scores.broad_jump = "210"', apply({}, 'broad_jump', null, { distanceCm: 210 }), { broad_jump: '210' });
eq('iso_dead_hang 35s → scores.iso_dead_hang = "35"', apply({}, 'iso_dead_hang', null, 35), { iso_dead_hang: '35' });

// ── sided test → { L, R }, second side merges WITHOUT clobbering the first ──
{
  const afterL = apply({}, 'sl_jump', 'L', { heightCm: 44 });
  eq('sl_jump L=44 → {L:"44"}', afterL, { sl_jump: { L: '44' } });
  const afterR = apply(afterL, 'sl_jump', 'R', { heightCm: 46 });
  eq('sl_jump R=46 merges → {L:"44",R:"46"} (L untouched)', afterR, { sl_jump: { L: '44', R: '46' } });
}
{
  const afterL = apply({}, 'iso_sl_stand', 'L', 30);
  const afterR = apply(afterL, 'iso_sl_stand', 'R', 27);
  eq('iso_sl_stand L then R → {L:"30",R:"27"}', afterR, { iso_sl_stand: { L: '30', R: '27' } });
}

// ── composite test → object with every sub-key (drop_jump) ──
eq('drop_jump composite → all sub-keys',
  apply({}, 'drop_jump', null, { heightCm: 30, contactMs: 210, rsi: 1.4 }),
  { drop_jump: { height_cm: '30', ssc_ms: '210', rsi: '1.4' } });

// ── sided composite (sl_pogo) → { L:{...} }, merges per side ──
{
  const afterL = apply({}, 'sl_pogo', 'L', { contactMs: 200, rsi: 1.6 });
  eq('sl_pogo L composite → {L:{ssc_ms,rsi}}', afterL, { sl_pogo: { L: { ssc_ms: '200', rsi: '1.6' } } });
  const afterR = apply(afterL, 'sl_pogo', 'R', { contactMs: 190, rsi: 1.7 });
  eq('sl_pogo R merges, L untouched', afterR, { sl_pogo: { L: { ssc_ms: '200', rsi: '1.6' }, R: { ssc_ms: '190', rsi: '1.7' } } });
}

// ── RETAKE: re-run overwrites that field/side, leaves everything else intact ──
{
  const start = { svj: '42', sl_jump: { L: '44', R: '46' } };
  eq('retake sl_jump L=48 → L replaced, R + svj untouched',
    apply(start, 'sl_jump', 'L', { heightCm: 48 }), { svj: '42', sl_jump: { L: '48', R: '46' } });
  eq('retake svj=50 → svj replaced, sl_jump untouched',
    apply(start, 'svj', null, { heightCm: 50 }), { svj: '50', sl_jump: { L: '44', R: '46' } });
}

// ── ROM writeback → rom[romKey], including the full analyzer round-trip ──
{
  const spec = romAxisSpec('knee', 'Flexion');
  // analyzer jointRom entry → romReadingFor → confirmed degree → applyRomResult
  const reading = romReadingFor(spec, [{ name: 'L KNE', maxDeg: 178, minDeg: 40, hiDeg: 177, loDeg: 40 }]);
  eq('knee flexion entry → reading.max = 140', reading.max, 140);
  eq('applyRomResult lands 140 in rom.knee_flexion', applyRomResult({}, spec, reading.max), { knee_flexion: '140' });
}
eq('applyRomResult(neck Flexion) → rom.neck_flexion', applyRomResult({}, romAxisSpec('neck', 'Flexion'), 45), { neck_flexion: '45' });
eq('applyRomResult(foot_ankle Dorsal-Flexion) → key', applyRomResult({}, romAxisSpec('foot_ankle', 'Dorsal-Flexion'), 18), { foot_ankle_dorsalflexion: '18' });

// retake ROM: one axis overwrites, others untouched
eq('retake knee flexion 132 → replaced, hip_flexion untouched',
  applyRomResult({ knee_flexion: '140', hip_flexion: '90' }, romAxisSpec('knee', 'Flexion'), 132),
  { knee_flexion: '132', hip_flexion: '90' });

// ── every live ROM axis writes to a REAL schema rom key ──
const schemaKeys = new Set();
for (const j of EVAL_SCHEMA.rom.joints) for (const ax of j.axes) schemaKeys.add(romKey(j.id, ax));
for (const a of ROM_LIVE_AXES) {
  const key = Object.keys(applyRomResult({}, a, 1))[0];
  eq(`live axis ${a.jointId}:${a.axis} → schema key ${key}`, schemaKeys.has(key), true);
}

// ── every live JUMP/HOLD test id is a REAL schema test ──
const testIds = new Set(Object.keys(testById));
for (const id of Object.keys(EVAL_TEST_TOOLS)) {
  eq(`tool ${id} targets a real schema test`, testIds.has(id), true);
}

console.log(`\n${fail === 0 ? '✓ ALL PASS' : '✗ FAILURES'} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
