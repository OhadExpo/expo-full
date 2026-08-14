// Fixtures for buildPoseReport + downsampleTrace — the compact, persistable
// per-lift REPORT payload the Analysis page renders the Review-style velocity /
// degrees graphs from. The coach ACTS on these graphs + tables, so the payload
// carries a standalone fixture: it must be JSON-safe, honest (no fabricated
// series), and bounded in size (downsampled).
// Run: node scripts/verify-pose-report.mjs
import { buildPoseReport, downsampleTrace, analyzeClip } from '../src/poseLab.js';
import { demoSquatFrames } from '../src/demoMotion.js';

let pass = 0, fail = 0;
const check = (name, cond) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); cond ? pass++ : fail++; };

const frames = demoSquatFrames(3, 20, 2);
const analysis = analyzeClip(frames, 'Back Squat');
const rep = buildPoseReport(frames, 'Back Squat', analysis);

check('buildPoseReport returns a payload on a clean squat', rep && typeof rep === 'object');
check('payload is versioned (v2)', rep && rep.v === 2);

// --- velocity/accel traces present + well-shaped ---
check('speed trace present with a series', rep && rep.speed && Array.isArray(rep.speed.series) && rep.speed.series.length >= 3);
check('speed samples are {t,speed}', rep && rep.speed.series.every((p) => typeof p.t === 'number' && typeof p.speed === 'number'));
check('speed carries a peak', rep && typeof rep.speed.peak === 'number');
check('accel trace present with {t,accel}', rep && rep.accel && rep.accel.series.every((p) => typeof p.t === 'number' && typeof p.accel === 'number'));

// --- primary joint + per-joint angle channels for the ROM selector ---
check('primaryJoint is the squat knee (KNE)', rep && rep.primaryJoint === 'KNE');
check('per-joint angle channels present', rep && rep.angles && Object.keys(rep.angles).length >= 2);
check('knee angle channels carry {t,angle}', rep && (rep.angles['L KNE'] || rep.angles['R KNE']) && (rep.angles['L KNE'] || rep.angles['R KNE']).series.every((p) => typeof p.t === 'number' && typeof p.angle === 'number'));

// --- per-rep tables ---
check('perRepVel: one row per rep', rep && Array.isArray(rep.perRepVel) && rep.perRepVel.filter(Boolean).length === 3);
check('perRepVel rows carry mean+peak', rep && rep.perRepVel.filter(Boolean).every((r) => typeof r.mean === 'number' && typeof r.peak === 'number'));
check('perRepRom: one row per rep', rep && Array.isArray(rep.perRepRom) && rep.perRepRom.filter(Boolean).length === 3);
check('perRepRom rows carry rom + tempo phases', rep && rep.perRepRom.filter(Boolean).every((r) => typeof r.rom === 'number' && typeof r.ecc === 'number' && typeof r.con === 'number'));

// --- headline mirrors + L/R bars ---
check('bestMean mirrors the velocity summary', rep && Math.abs(rep.bestMean - analysis.velocity.bestMean) < 1e-6);
check('maxRom mirrors the romTempo summary', rep && Math.abs(rep.maxRom - analysis.romTempo.maxRom) < 1e-6);
check('jointRom carries per-joint {name,romDeg} for the L↔R bars', rep && Array.isArray(rep.jointRom) && rep.jointRom.every((j) => typeof j.name === 'string' && typeof j.romDeg === 'number'));

// --- JSON-safe (persisted to localStorage) ---
let jsonOk = true; try { JSON.parse(JSON.stringify(rep)); } catch { jsonOk = false; }
check('payload round-trips through JSON', jsonOk);

// --- downsampleTrace: bounds size, keeps endpoints, no-op when small ---
const big = { series: Array.from({ length: 900 }, (_, i) => ({ t: i * 10, speed: Math.sin(i / 20) })), peak: 1 };
const ds = downsampleTrace(big, 200);
check('downsampleTrace caps a long trace to <=200 pts', ds && ds.series.length <= 200);
check('downsampleTrace keeps the first sample', ds && ds.series[0].t === big.series[0].t);
check('downsampleTrace keeps the last sample', ds && ds.series[ds.series.length - 1].t === big.series[big.series.length - 1].t);
check('downsampleTrace carries peak through', ds && ds.peak === 1);
const small = { series: big.series.slice(0, 50), peak: 1 };
check('downsampleTrace is a no-op when already small', downsampleTrace(small, 200).series.length === 50);

// --- honesty: a degenerate clip yields no payload, never a fabricated shell ---
const bad = buildPoseReport([], 'Back Squat', { ok: false });
check('buildPoseReport([], not-ok) -> null (no fabricated payload)', bad === null);
let threw = false;
try { buildPoseReport(null, 'Back Squat', null); } catch { threw = true; }
check('buildPoseReport(null,...) does not throw', !threw);

console.log(`\n${fail === 0 ? '✓ ALL PASS' : '✗ FAILURES'} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
