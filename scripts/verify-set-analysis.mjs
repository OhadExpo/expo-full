// verify-set-analysis.mjs - the athlete's own set read (5.10 #552). Pure, no
// network. Checks src/setAnalysis.js on hand-built analyzeClip results AND end
// to end through the real poseLab.analyzeClip on a synthetic squat clip (five
// reps, side-on), then the same clip with the legs out of frame, then with a
// walk-in and a re-rack around the set.
// BREAK=1 swaps in the naive summarizer (it trusts every capture, so it reports
// reps on a poor one) - must FAIL. The real-clip accuracy gate is
// scripts/verify-set-count-accuracy.mjs (private hand-counted clips).
import { summarize as realSummarize, trend, isUsable, signed, isolateSet, readSet } from '../src/setAnalysis.js';
import { analyzeClip } from '../src/poseLab.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m); } };
const summarize = process.env.BREAK
  ? (r, o) => realSummarize(r && r.ok !== false ? { ...r, captureQuality: { grade: 'good' } } : r, o)
  : realSummarize;

// ---- 1. hand-built results ------------------------------------------------
// n alike reps, `dur` s apart, each with its bottom time and a quiet angle (jitter 1 deg)
const per = (n, rom, dur, t0 = 3000) => Array.from({ length: n }, (_, i) => ({ rom, ecc: dur * 0.5, pause: 0.1 * dur, con: dur * 0.4, bottomT: t0 + i * dur * 1000, jitter: 1 }));
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

// 9.10: jumps are not counted on the athlete side (a jump bends the knee twice;
// the flight channel read 7 for 6 and 14 for 6 on real clips)
const s4 = summarize({ ...good, countMethod: 'flight', repCount: 12 });
ok(s4.reps === null && s4.reason === 'not-counted', `flight-counted (jumps) -> no number, reason not-counted (got ${s4.reps}, ${s4.reason})`);
const s4b = summarize({ ...good, ballistic: true });
ok(s4b.reps === null && s4b.reason === 'not-counted', 'a jump title counted on the knee joint -> no number either');

const junk = { ...good, romTempo: { perRep: [null, ...per(5, 95, 2.1)] } };
const s5 = summarize(junk);
ok(s5.reps === null && s5.reason === 'inconsistent', `a rep poseLab could not measure (null) -> no number (got ${s5.reps}, ${s5.reason})`);

// ---- 2. the set inside the clip (9.10) ---------------------------------------
// setup + re-rack at the edges are trimmed; the set's own reps are counted
const withEdges = { ...good, romTempo: { perRep: [{ rom: 150, ecc: 2, pause: 3, con: 2, bottomT: 500, jitter: 1 }, ...per(6, 95, 2.1, 9000), { rom: 30, ecc: 1, pause: 0, con: 1, bottomT: 9000 + 6 * 2100 + 900, jitter: 1 }] } };
const s6 = summarize(withEdges);
ok(s6.reps === 6 && s6.romDeg === 95, `a bent-over setup before and a shallow set-down after are trimmed -> 6 (got ${s6.reps}, ROM ${s6.romDeg})`);
const rs6 = readSet(withEdges);
ok(rs6.reps && rs6.reps[0].t === 9000 && rs6.trimmed === 2, 'readSet names the reps it counted (first bottom 9.0 s, 2 trimmed)');
// a rep missing in the middle (gap of 2 reps) -> no number, not 5
const holed = per(6, 95, 2.1, 3000); holed.splice(3, 1);
const s7 = summarize({ ...good, romTempo: { perRep: holed } });
ok(s7.reps === null && s7.reason === 'inconsistent', `a rep missing mid-set (a 4.2 s gap among 2.1 s) -> no number (got ${s7.reps})`);
// a twitch in the middle (half the depth) -> no number
const twitch = per(6, 95, 2.1, 3000); twitch[3] = { ...twitch[3], rom: 40 };
ok(summarize({ ...good, romTempo: { perRep: twitch } }).reps === null, 'a shallow dip mid-set -> no number');
// two alike reps are not a set we can vouch for
ok(summarize({ ...good, romTempo: { perRep: per(2, 95, 2.1) } }).reps === null, 'two reps -> no number');
// a jittery angle (4 deg a frame against a 60 deg range) -> no number, reason capture
const jittery = per(6, 60, 2.1).map((p) => ({ ...p, jitter: 4 }));
const s8 = summarize({ ...good, romTempo: { perRep: jittery } });
ok(s8.reps === null && s8.reason === 'capture', `angle jitter 4 deg vs range 60 -> no number, reason capture (got ${s8.reps}, ${s8.reason})`);
ok(isolateSet([]).reps === null && isolateSet(null).reps === null, 'isolateSet on nothing -> no reps');

// ---- 3. trend -------------------------------------------------------------
const A = (at, reps, tempoS, romDeg, quality = 'good') => ({ at, reps, tempoS, romDeg, quality });
ok(trend([A('1', 6, 2, 90)]) === null, 'one read -> no trend');
ok(trend([A('1', 6, 2, 90), { ...s2 }]) === null, 'a poor read is skipped (one usable left -> no trend)');
const t1 = trend([A('1', 5, 2.4, 80), A('2', 6, 2.0, 90), A('3', 6, 2.1, 98)]);
ok(t1 && t1.n === 3 && t1.reps === 0 && t1.tempoS === 0.1 && t1.romDeg === 8 && t1.since === '2', `deltas vs the read before (got n=${t1 && t1.n} reps ${t1 && t1.reps} tempo ${t1 && t1.tempoS} rom ${t1 && t1.romDeg})`);
const many = Array.from({ length: 8 }, (_, i) => A(String(i), 5, 2, 80 + i));
ok(trend(many).n === 5 && trend(many).romSeries.length === 5, 'uses the last five usable reads at most');
ok(trend([A('1', 6, null, 90), A('2', 6, 2.0, 90)]).tempoS === null, 'blank on either side -> blank delta');
ok(signed(8) === '+8' && signed(-0.3) === '−0.3' && signed(0) === '0' && signed(null) === '', 'signed(): +8 / −0.3 / 0 / blank');

// ---- 4. end to end through poseLab.analyzeClip ----------------------------
// a side-on body (image coords, y down) squatting five times over 15 s at 20 fps
function body(depth, legsVisible = true, walk = 0) {
  const p = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.2, z: 0, visibility: 0.99 }));
  const hipY = 0.5 + 0.18 * depth, hipX = 0.5 - 0.12 * depth;
  const kneeX = 0.5 + 0.08 * depth, kneeY = 0.7 + 0.04 * depth;
  const set = (i, x, y) => { p[i] = { x: x + walk, y, z: 0, visibility: 0.99 }; };
  set(11, 0.5 - 0.02 * depth, 0.25 + 0.15 * depth); set(12, 0.5 - 0.02 * depth, 0.25 + 0.15 * depth);
  set(13, 0.55, 0.38 + 0.12 * depth); set(14, 0.55, 0.38 + 0.12 * depth);
  set(15, 0.6, 0.45 + 0.1 * depth); set(16, 0.6, 0.45 + 0.1 * depth);
  set(23, hipX, hipY); set(24, hipX, hipY); set(25, kneeX, kneeY); set(26, kneeX, kneeY);
  set(27, 0.5, 0.92); set(28, 0.5, 0.92); set(29, 0.48, 0.94); set(30, 0.48, 0.94); set(31, 0.56, 0.95); set(32, 0.56, 0.95);
  if (!legsVisible) for (const i of [23, 24, 25, 26, 27, 28, 29, 30, 31, 32]) p[i] = { ...p[i], visibility: 0.05 };
  return p;
}
function clip(legsVisible, edges = false) {
  const fps = 20, secs = 15, reps = 5, out = [];
  const pre = edges ? 6 : 0, post = edges ? 5 : 0;
  for (let i = 0; i < fps * (secs + pre + post); i++) {
    const tt = i / fps, t = tt - pre;
    let ph;
    if (t < 0) ph = tt > 1.5 && tt < 3.5 ? Math.sin(Math.PI * (tt - 1.5) / 2) * 1.6 : 0;   // a deep bend picking the weight up
    else if (t > secs) ph = t > secs + 1.5 && t < secs + 2.5 ? Math.sin(Math.PI * (t - secs - 1.5)) * 0.35 : 0;   // a small set-down
    else ph = t < 1 || t > secs - 1.5 ? 0 : Math.max(0, Math.sin(Math.PI * ((t - 1) * reps) / (secs - 2.5)) ** 2);
    const lm = body(Math.min(1.6, ph), legsVisible);
    out.push({ t: tt * 1000, landmarks: lm, worldLandmarks: lm.map((q) => ({ x: q.x - 0.5, y: q.y - 0.5, z: 0, visibility: q.visibility })) });
  }
  return out;
}
const e2eGood = summarize(analyzeClip(clip(true), 'Back Squat'), { title: 'Back Squat' });
ok(e2eGood && e2eGood.quality !== 'poor' && e2eGood.reps === 5, `synthetic 5-rep squat, whole body -> 5 reps (got ${e2eGood && e2eGood.reps}, ${e2eGood && e2eGood.quality} ${e2eGood && e2eGood.reason})`);
ok(e2eGood && e2eGood.romDeg > 30 && e2eGood.romDeg <= 180 && e2eGood.tempoS > 0.5 && e2eGood.tempoS < 6, `  ROM ${e2eGood && e2eGood.romDeg} deg and ${e2eGood && e2eGood.tempoS} s/rep are physical`);
const e2ePoor = summarize(analyzeClip(clip(false), 'Back Squat'), { title: 'Back Squat' });
ok(e2ePoor && e2ePoor.quality === 'poor' && e2ePoor.reps === null && e2ePoor.romDeg === null, `same squat, legs out of frame -> poor, NO numbers (got reps ${e2ePoor && e2ePoor.reps}, ${e2ePoor && e2ePoor.quality})`);
const rawEdges = analyzeClip(clip(true, true), 'Back Squat');
const e2eEdges = summarize(rawEdges, { title: 'Back Squat' });
ok(e2eEdges && e2eEdges.reps === 5, `same squat with a deep pick-up bend before and a set-down after -> 5 (analyzeClip alone: ${rawEdges.repCount}; read ${e2eEdges && e2eEdges.reps} ${e2eEdges && e2eEdges.reason})`);

console.log(`\nverify-set-analysis: ${pass} passed, ${fail} failed${process.env.BREAK ? ' (BREAK=1)' : ''}`);
process.exit(fail ? 1 : 0);
