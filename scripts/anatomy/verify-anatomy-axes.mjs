// GATE: THE PLANE READINGS MEAN WHAT THEY SAY (13.10 #716). One known single-joint motion per joint and side - a hip
// flexed 30, a knee in 10 deg valgus, an ankle inverted 10, an arm abducted 90, a trunk rotated 20... - must read back
// as that motion, within 3 deg (vs the rest pose's own reading). Breaks if a sign, an axis or a decomposition changes.
// Usage: node scripts/anatomy/verify-anatomy-axes.mjs
import { Quaternion, Vector3 } from 'three';
import { PIVOT, S } from '../../src/anatomy/rig.js';
import { jointAxesFromQ } from '../../src/anatomy/jointAxes.js';
const R = (ax, deg) => new Quaternion().setFromAxisAngle(new Vector3(...ax).normalize(), (deg * Math.PI) / 180);
const rest = jointAxesFromQ(PIVOT.map(() => new Quaternion()));
const cases = [];
for (const sd of ['L', 'R']) {
  const s = sd === 'L' ? 1 : -1;
  cases.push(
    ['hip' + sd, 'thigh' + sd, R([1, 0, 0], -30), 'flex', 30], ['hip' + sd, 'thigh' + sd, R([0, 0, 1], 20 * s), 'abd', 20], ['hip' + sd, 'thigh' + sd, R([0, 1, 0], -15 * s), 'rot', 15],
    ['knee' + sd, 'shin' + sd, R([1, 0, 0], 40), 'flex', 40], ['knee' + sd, 'shin' + sd, R([0, 0, 1], 10 * s), 'valgus', 10], ['knee' + sd, 'shin' + sd, R([0, 1, 0], -10 * s), 'rot', 10],
    ['ankle' + sd, 'foot' + sd, R([1, 0, 0], -15), 'dorsi', 15], ['ankle' + sd, 'foot' + sd, R([0, 1, 0], 10 * s), 'toeOut', 10], ['ankle' + sd, 'foot' + sd, R([0, 0, 1], -10 * s), 'inv', 10],
    ['shoulder' + sd, 'uarm' + sd, R([1, 0, 0], -90), 'flex', 90], ['shoulder' + sd, 'uarm' + sd, R([0, 0, 1], 90 * s), 'abd', 90], ['shoulder' + sd, 'uarm' + sd, R([0, 1, 0], -30 * s), 'rot', 30],
    ['forearm' + sd, 'hand' + sd, R([0, 1, 0], -60 * s), 'pron', 60],
    ['wrist' + sd, 'hand' + sd, R([1, 0, 0], -30), 'flex', 30], ['wrist' + sd, 'hand' + sd, R([0, 0, 1], -20 * s), 'ulnar', 20],
  );
}
cases.push(['trunk', 'chest', R([1, 0, 0], 30), 'flex', 30], ['trunk', 'chest', R([0, 0, 1], -15), 'side', 15], ['trunk', 'chest', R([0, 1, 0], 20), 'rot', 20],
  ['neck', 'head', R([1, 0, 0], 30), 'flex', 30], ['neck', 'head', R([0, 0, 1], -15), 'side', 15], ['neck', 'head', R([0, 1, 0], 20), 'rot', 20]);
let bad = 0;
for (const [j, seg, q, k, want] of cases) {
  const Q = PIVOT.map(() => new Quaternion()); Q[S[seg]].copy(q);
  // a child rotated in the world is rotated relative to its parent; its own children follow (not needed: each case reads one joint)
  const got = jointAxesFromQ(Q)[j][k] - rest[j][k];
  const ok = Math.abs(got - want) < 3;
  if (!ok) bad++;
  console.log((ok ? 'ok  ' : 'BAD ') + j.padEnd(10), k.padEnd(7), 'want', String(want).padStart(4), 'got', got.toFixed(1).padStart(7), ' rest', rest[j][k].toFixed(1));
}
console.log(bad ? `verify-anatomy-axes: FAIL - ${bad} of ${cases.length} motions read wrong` : `verify-anatomy-axes: PASS - ${cases.length} / ${cases.length} motions read back within 3 deg`);
process.exit(bad ? 1 : 0);
