// Regression fixtures for the EXTENDED camera-ROM engines (honest 2026-08-14
// additions): the SIGNED knee deviation (repCounter.signedDeviationAt), and the
// gated channel builder poseLab.extendedJointRom — signed-knee over-extension
// (with facing-robust orientation + calibration gate), the neck sagittal/lateral
// constructions, and the dispersion-gated static ankle read. These write CLINICAL
// numbers a coach acts on, so the math + every honesty gate is pinned here with
// deterministic synthetic geometry. Run: node scripts/verify-eval-extended-rom.mjs
import { signedDeviationAt } from '../src/repCounter.js';
import { extendedJointRom, neckSagittalAngle, neckLateralAngle } from '../src/poseLab.js';

let pass = 0, fail = 0;
const ok = (n, c) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n}`); c ? pass++ : fail++; };
const near = (n, got, want, tol = 2) => {
  const c = got != null && Number.isFinite(got) && Math.abs(got - want) <= tol;
  console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${c ? '' : `\n   got ${got} want ${want}±${tol}`}`);
  c ? pass++ : fail++;
};

// ── 33-landmark frame factory (all points visible at origin; apply overrides) ──
const P = (x, y) => ({ x, y, z: 0, visibility: 1 });
const lm = (over) => { const a = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 1 })); for (const k in over) a[k] = over[k]; return a; };
const frame = (t, over) => { const l = lm(over); return { t, landmarks: l, worldLandmarks: l }; };
const D = Math.PI / 180;

// ── signedDeviationAt — 0 straight, + one bend, − the other (hyperextension) ──
near('signed knee: straight (collinear) -> 0', signedDeviationAt(lm({ 23: P(0, 0), 25: P(0, 1), 27: P(0, 2) }), 23, 25, 27), 0, 0.5);
near('signed knee: flexed (ankle forward) -> +90', signedDeviationAt(lm({ 23: P(0, 0), 25: P(0, 1), 27: P(1, 1) }), 23, 25, 27), 90, 1);
near('signed knee: hyperextended (ankle back) -> −90', signedDeviationAt(lm({ 23: P(0, 0), 25: P(0, 1), 27: P(-1, 1) }), 23, 25, 27), -90, 1);

// signed L-knee at a chosen signed value v (deg): ankle rotated off straight
const kneeAnkle = (v) => P(Math.sin(v * D), 1 + Math.cos(v * D));   // v>0 flexion / v<0 hyperext
const kneeFrames = (seq) => seq.map((v, i) => frame(i * 50, { 23: P(0, 0), 25: P(0, 1), 27: kneeAnkle(v) }));

// ── extendedJointRom: knee over-extension, calibrated by a real flexion sweep ──
{
  const seq = [];
  for (let v = 0; v <= 100; v += 20) seq.push(v);        // flex sweep (calibrates direction)
  for (let i = 0; i < 5; i++) seq.push(100);
  for (let v = 100; v >= 0; v -= 20) seq.push(v);
  for (let v = 0; v >= -10; v -= 5) seq.push(v);         // lock back into ~10° hyperextension
  for (let i = 0; i < 6; i++) seq.push(-10);
  const ext = extendedJointRom(kneeFrames(seq)) || [];
  const lk = ext.find(e => e.name === 'L KNE±');
  ok('knee: L KNE± channel produced from a clean side-on sweep', !!lk);
  near('knee: over-extension magnitude ~10°', lk && lk.overExtDeg, 10, 3);
}
// near-straight clip (no flexion sweep) → sign can't be calibrated → REFUSE (null)
{
  const seq = [];
  for (let v = 0; v >= -8; v -= 4) seq.push(v);
  for (let i = 0; i < 10; i++) seq.push(-8);
  const ext = extendedJointRom(kneeFrames(seq)) || [];
  const lk = ext.find(e => e.name === 'L KNE±');
  ok('knee: near-straight clip → over-extension NOT calibrated (overExtDeg null)', !!lk && lk.overExtDeg === null);
}

// ── neck sagittal (side-on): +flexion / −extension, nose fixes the facing sign ──
{
  const neckLm = (d) => ({ 23: P(0, 0), 24: P(0, 0), 11: P(0, 1), 12: P(0, 1), 7: P(d, 1.9), 8: P(d, 1.9), 0: P(d + 0.3, 1.85) });
  near('neck helper: neutral (d=0) ~0°', neckSagittalAngle(lm(neckLm(0))), 0, 2);
  near('neck helper: forward lean (d=0.5) reads +flexion', neckSagittalAngle(lm(neckLm(0.5))), 29, 5);
  near('neck helper: back lean (d=−0.4) reads −extension', neckSagittalAngle(lm(neckLm(-0.4))), -24, 5);
  const seq = [];
  for (let d = 0; d <= 0.5; d += 0.1) seq.push(d);
  for (let i = 0; i < 4; i++) seq.push(0.5);
  for (let d = 0.5; d >= -0.4; d -= 0.1) seq.push(d);
  for (let i = 0; i < 4; i++) seq.push(-0.4);
  const frames = seq.map((d, i) => frame(i * 50, neckLm(d)));
  const nf = (extendedJointRom(frames) || []).find(e => e.name === 'NECK FLEX');
  ok('neck: NECK FLEX channel produced + flagged single (unsided)', !!nf && nf.single === true);
  near('neck: flexion end-range hiDeg ~29°', nf && nf.hiDeg, 29, 5);
  near('neck: extension end-range loDeg ~ −24°', nf && nf.loDeg, -24, 5);
}

// ── neck lateral (front-on): ear-line tilt off the shoulder line, magnitude ──
{
  const latLm = (tilt) => ({ 11: P(-0.5, 1), 12: P(0.5, 1), 7: P(-0.3, 2), 8: P(0.3, 2 + tilt), 0: P(0, 2.1), 23: P(0, 0), 24: P(0, 0) });
  near('neck lateral helper: upright ~0°', neckLateralAngle(lm(latLm(0))), 0, 2);
  near('neck lateral helper: tilt reads ~20°', neckLateralAngle(lm(latLm(0.218))), 20, 3);
  const seq = [];
  for (let tl = 0; tl <= 0.218; tl += 0.03) seq.push(tl);
  for (let i = 0; i < 6; i++) seq.push(0.218);
  const frames = seq.map((tl, i) => frame(i * 50, latLm(tl)));
  const nl = (extendedJointRom(frames) || []).find(e => e.name === 'NECK LAT');
  ok('neck: NECK LAT channel produced', !!nl);
  near('neck: lateral end-range hiDeg ~20°', nl && nl.hiDeg, 20, 4);
}

// ── ankle (static hold): steadiest-window median, dispersion-gated ──
const footAt = (interiorDeg) => P(Math.sin(interiorDeg * D), 1 - Math.cos(interiorDeg * D));
{
  // steady ~72° dorsiflexed hold (tiny ±0.5° jitter) → a clean static read
  const frames = [];
  for (let i = 0; i < 12; i++) frames.push(frame(i * 50, { 25: P(0, 0), 27: P(0, 1), 29: P(-0.2, 1.05), 31: footAt(72 + (i % 2 ? 0.5 : -0.5)) }));
  const la = (extendedJointRom(frames) || []).find(e => e.name === 'L ANK');
  ok('ankle: L ANK channel produced from a steady hold', !!la);
  near('ankle: stable interior angle ~72°', la && la.loDeg, 72, 3);
}
{
  // foot never settles (keeps rotating) → NO low-spread window → honest refusal
  const frames = [];
  for (let i = 0; i < 14; i++) frames.push(frame(i * 50, { 25: P(0, 0), 27: P(0, 1), 29: P(-0.2, 1.05), 31: footAt(60 + i * 2.5) }));
  const la = (extendedJointRom(frames) || []).find(e => e.name === 'L ANK');
  ok('ankle: never-settling clip → refused (no L ANK entry)', !la);
}

// ── occlusion honesty: a channel whose landmarks are invisible is omitted ──
{
  const seq = [0, 40, 90, 40, 0, 40, 90, 40, 0];
  const frames = seq.map((v, i) => {
    const l = lm({ 23: P(0, 0), 25: P(0, 1), 27: kneeAnkle(v) });
    l[27] = { ...l[27], visibility: 0.1 };               // ankle occluded → knee unreadable
    return { t: i * 50, landmarks: l, worldLandmarks: l };
  });
  const lk = (extendedJointRom(frames) || []).find(e => e.name === 'L KNE±');
  ok('gate: occluded ankle (vis 0.1) → knee channel omitted', !lk);
}

console.log(`\n${fail === 0 ? '✓ ALL PASS' : '✗ FAILURES'} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
