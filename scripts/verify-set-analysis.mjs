// verify-set-analysis.mjs - the athlete's own set read (5.10 #552). Pure, no
// network. Checks src/setAnalysis.js on hand-built analyzeClip results AND end
// to end through the real poseLab.analyzeClip on a synthetic squat clip (five
// reps, side-on), then the same clip with the legs out of frame.
// BREAK=1 swaps in the naive summarizer (it trusts every capture, so it reports
// reps on a poor one) - must FAIL.
import { summarize as realSummarize, trend, isUsable, signed } from '../src/setAnalysis.js';
import { analyzeClip } from '../src/poseLab.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m); } };
const summarize = process.env.BREAK
  ? (r, o) => realSummarize(r && r.ok !== false ? { ...r, captureQuality: { grade: 'good' } } : r, o)
  : realSummarize;

// ---- 1. hand-built results ------------------------------------------------
const per = (n, rom, dur) => Array.from({ length: n }, () => ({ rom, ecc: dur * 0.5, pause: 0.1 * dur, con: dur * 0.4 }));
const good = { ok: true, counted: true, repCount: 6, countMethod: 'joint', romTempo: { perRep: per(6, 95, 2.1) }, captureQuality: { grade: 'good', coverage: 0.98 }, frameCount: 240 };
const s1 = summarize(good, { title: 'Back Squat', fileName: 'a.mp4', at: '2026-10-05T10:00:00Z' });
ok(s1.reps === 6 && s1.tempoS === 2.1 && s1.romDeg === 95 && s1.quality === 'good', `good capture -> 6 reps, 2.1 s/rep, ROM 95 (got ${s1.reps}/${s1.tempoS}/${s1.romDeg}/${s1.quality})`);
ok(s1.model === 'lite' && s1.title === 'Back Squat' && s1.fileName === 'a.mp4', 'carries model lite, the plan-row title and the clip file name');

const poor = { ...good, captureQuality: { grade: 'poor', coverage: 0.4 } };
const s2 = summarize(poor, {});
ok(s2.quality === 'poor' && s2.reps === null && s2.tempoS === null && s2.romDeg === null && s2.reason === 'capture', 'poor capture -> no numbers at all, reason capture');
ok(!isUsable(s2), 'a poor read is not usable for the trend');

const fair = { ...good, captureQuality: { grade: 'fair' } };
ok(summarize(fair).quality === 'ok' && summarize(fair).reps === 6, "fair capture -> quality 'ok', numbers kept");

const none = { ...good, repCount: 0, romTempo: null };
const s3 = summarize(none);
ok(s3.reps === null && s3.reason === 'no-reps' && s3.quality === 'poor', 'zero reps -> reps null (not 0), reason no-reps');

const notCounted = { ...good, counted: false, repCount: 0 };
ok(summarize(notCounted).reason === 'not-counted' && summarize(notCounted).reps === null, 'no channel for the movement -> reason not-counted, no reps');

ok(summarize({ ok: false, reason: 'too-few-frames' }).reason === 'too-few-frames' && summarize({ ok: false }).reps === null, 'analyzeClip ok:false -> poor, no numbers');
ok(summarize(null) === null, 'no result -> null');

const flight = { ...good, countMethod: 'flight', repCount: 12 };
const s4 = summarize(flight);
ok(s4.reps === 12 && s4.tempoS === null && s4.romDeg === null, 'flight-counted (jumps) -> reps kept, joint tempo/ROM left blank');

const junk = { ...good, romTempo: { perRep: [null, { rom: 400, ecc: 0, pause: 0, con: 0 }, { rom: NaN, ecc: 40, pause: 0, con: 0 }] } };
const s5 = summarize(junk);
ok(s5.reps === 6 && s5.tempoS === null && s5.romDeg === null, 'impossible per-rep values (ROM 400, 0 s, 40 s) -> blank, never averaged');

// ---- 2. trend -------------------------------------------------------------
const A = (at, reps, tempoS, romDeg, quality = 'good') => ({ at, reps, tempoS, romDeg, quality });
ok(trend([A('1', 6, 2, 90)]) === null, 'one read -> no trend');
ok(trend([A('1', 6, 2, 90), { ...s2 }]) === null, 'a poor read is skipped (one usable left -> no trend)');
const t1 = trend([A('1', 5, 2.4, 80), A('2', 6, 2.0, 90), A('3', 6, 2.1, 98)]);
ok(t1 && t1.n === 3 && t1.reps === 0 && t1.tempoS === 0.1 && t1.romDeg === 8 && t1.since === '2', `deltas vs the read before (got n=${t1 && t1.n} reps ${t1 && t1.reps} tempo ${t1 && t1.tempoS} rom ${t1 && t1.romDeg})`);
const many = Array.from({ length: 8 }, (_, i) => A(String(i), 5, 2, 80 + i));
ok(trend(many).n === 5 && trend(many).romSeries.length === 5, 'uses the last five usable reads at most');
ok(trend([A('1', 6, null, 90), A('2', 6, 2.0, 90)]).tempoS === null, 'blank on either side -> blank delta');
ok(signed(8) === '+8' && signed(-0.3) === '−0.3' && signed(0) === '0' && signed(null) === '', 'signed(): +8 / −0.3 / 0 / blank');

// ---- 3. end to end through poseLab.analyzeClip ----------------------------
// a side-on body (image coords, y down) squatting five times over 15 s at 20 fps
function body(depth, legsVisible = true) {
  const p = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.2, z: 0, visibility: 0.99 }));
  const hipY = 0.5 + 0.18 * depth, hipX = 0.5 - 0.12 * depth;
  const kneeX = 0.5 + 0.08 * depth, kneeY = 0.7 + 0.04 * depth;
  const set = (i, x, y) => { p[i] = { x, y, z: 0, visibility: 0.99 }; };
  set(11, 0.5 - 0.02 * depth, 0.25 + 0.15 * depth); set(12, 0.5 - 0.02 * depth, 0.25 + 0.15 * depth);
  set(13, 0.55, 0.38 + 0.12 * depth); set(14, 0.55, 0.38 + 0.12 * depth);
  set(15, 0.6, 0.45 + 0.1 * depth); set(16, 0.6, 0.45 + 0.1 * depth);
  set(23, hipX, hipY); set(24, hipX, hipY); set(25, kneeX, kneeY); set(26, kneeX, kneeY);
  set(27, 0.5, 0.92); set(28, 0.5, 0.92); set(29, 0.48, 0.94); set(30, 0.48, 0.94); set(31, 0.56, 0.95); set(32, 0.56, 0.95);
  if (!legsVisible) for (const i of [23, 24, 25, 26, 27, 28, 29, 30, 31, 32]) p[i] = { ...p[i], visibility: 0.05 };
  return p;
}
function clip(legsVisible) {
  const fps = 20, secs = 15, reps = 5, out = [];
  for (let i = 0; i < fps * secs; i++) {
    const t = i / fps;
    const ph = t < 1 || t > secs - 1.5 ? 0 : Math.max(0, Math.sin(Math.PI * ((t - 1) * reps) / (secs - 2.5)) ** 2);
    const lm = body(ph, legsVisible);
    out.push({ t: t * 1000, landmarks: lm, worldLandmarks: lm.map((q) => ({ x: q.x - 0.5, y: q.y - 0.5, z: 0, visibility: q.visibility })) });
  }
  return out;
}
const e2eGood = summarize(analyzeClip(clip(true), 'Back Squat'), { title: 'Back Squat' });
ok(e2eGood && e2eGood.quality !== 'poor' && e2eGood.reps === 5, `synthetic 5-rep squat, whole body -> 5 reps (got ${e2eGood && e2eGood.reps}, ${e2eGood && e2eGood.quality})`);
ok(e2eGood && e2eGood.romDeg > 30 && e2eGood.romDeg <= 180 && e2eGood.tempoS > 0.5 && e2eGood.tempoS < 6, `  ROM ${e2eGood && e2eGood.romDeg} deg and ${e2eGood && e2eGood.tempoS} s/rep are physical`);
const e2ePoor = summarize(analyzeClip(clip(false), 'Back Squat'), { title: 'Back Squat' });
ok(e2ePoor && e2ePoor.quality === 'poor' && e2ePoor.reps === null && e2ePoor.romDeg === null, `same squat, legs out of frame -> poor, NO numbers (got reps ${e2ePoor && e2ePoor.reps}, ${e2ePoor && e2ePoor.quality})`);

console.log(`\nverify-set-analysis: ${pass} passed, ${fail} failed${process.env.BREAK ? ' (BREAK=1)' : ''}`);
process.exit(fail ? 1 : 0);
