// Regression suite for the shot-detection gates.
//
// Detection is currently proven by ONE real clip through a 3-minute browser
// harness. That is the right end-to-end check, but it is far too slow and too
// coarse to protect the gates while they are being tuned — and every gate in
// detectShots was retuned on 2026-08-25 (armElev 95 -> 70, visOk split into
// arm/legs, the release frame masked to raised-arm frames, the set frame
// restricted to tracked frames, and every gate widened to read the best frame in
// a +/-150ms neighbourhood).
//
// So: synthesise skeletons for a jump shot and for the things that must NOT be
// counted as one, and assert what the detector does with them. Runs in ~1s.
import { buildSeries, detectShots } from '../src/shotAnalysis.js';

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log(`  ✗ ${name}\n     got  ${JSON.stringify(got)}  want ${JSON.stringify(want)}`); }
};

const FPS = 60;
const DT = 1000 / FPS;

// A right-handed body in normalised image space (y grows DOWNWARD).
// `k` = knee bend 0..1 (1 = deepest dip), `a` = arm raise 0..1 (1 = full
// overhead release), `lift` = how far the whole body has left the floor.
function body({ k = 0, a = 0, lift = 0 }) {
  const hipY = 0.55 - lift;
  const shoY = 0.40 - lift + k * 0.06;      // the dip lowers the shoulders too
  const kneeY = 0.72 - lift + k * 0.02;
  const ankY = 0.90 - lift;
  const headY = 0.32 - lift + k * 0.06;

  // Shooting (right) arm: elbow rises from the hip to above the shoulder, wrist
  // from the chest to above the head.
  const elbY = shoY + 0.10 - a * 0.20;
  const wriY = shoY + 0.04 - a * 0.26;
  const elbX = 0.52 - a * 0.005;
  const wriX = 0.52 + a * 0.010;

  const P = {
    0:  { x: 0.50, y: headY + 0.02 },              // nose
    2:  { x: 0.49, y: headY },                     // L eye
    5:  { x: 0.51, y: headY },                     // R eye
    7:  { x: 0.48, y: headY + 0.01 },              // L ear
    8:  { x: 0.52, y: headY + 0.01 },              // R ear
    11: { x: 0.47, y: shoY },                      // L shoulder
    12: { x: 0.53, y: shoY },                      // R shoulder
    13: { x: 0.45, y: shoY + 0.12 },               // L elbow (guide arm, low)
    14: { x: elbX, y: elbY },                      // R elbow
    15: { x: 0.45, y: shoY + 0.22 },               // L wrist
    16: { x: wriX, y: wriY },                      // R wrist
    23: { x: 0.48, y: hipY },                      // L hip
    24: { x: 0.52, y: hipY },                      // R hip
    25: { x: 0.48, y: kneeY },                     // L knee
    26: { x: 0.52, y: kneeY },                     // R knee
    27: { x: 0.48, y: ankY },                      // L ankle
    28: { x: 0.52, y: ankY },                      // R ankle
    29: { x: 0.48, y: ankY + 0.02 },
    30: { x: 0.52, y: ankY + 0.02 },
    31: { x: 0.49, y: ankY + 0.03 },
    32: { x: 0.53, y: ankY + 0.03 },
  };
  // A knee bend has to move the knee FORWARD or the interior angle never closes.
  P[25].x += k * 0.045; P[26].x += k * 0.045;
  // Same for the elbow: pull it in so the elbow angle really closes at the set.
  const bend = 1 - Math.abs(a - 0.55) / 0.55;      // most bent mid-raise
  P[14].x -= Math.max(0, bend) * 0.05;

  const lm = [];
  for (let i = 0; i <= 32; i++) lm[i] = { ...(P[i] || { x: 0.5, y: 0.6 }), z: 0, visibility: 0.95 };

  // worldLandmarks: metres, hip-centred, y UP. Angles are read from these.
  const world = lm.map((p) => ({ x: (p.x - 0.50) * 1.9, y: (hipY - p.y) * 1.9, z: 0, visibility: p.visibility }));
  return { landmarks: lm, worldLandmarks: world };
}

const frames = (spec) => {
  const out = spec.map((s, i) => ({ t: i * DT, ...body(s) }));
  out.dims = { w: 1080, h: 1920 };
  out.fps = FPS;
  return out;
};
const ramp = (n, from, to) => Array.from({ length: n }, (_, i) => from + ((to - from) * i) / Math.max(1, n - 1));
const hold = (n, v) => Array.from({ length: n }, () => v);

// One complete jump shot: stand -> dip -> drive up with the arm -> release
// overhead at the top -> hold the follow-through -> land.
const SHOT = [
  ...hold(30, 0).map(() => ({ k: 0, a: 0, lift: 0 })),
  ...ramp(24, 0, 1).map((k) => ({ k, a: 0.15 * k, lift: 0 })),                       // dip
  ...ramp(18, 1, 0).map((k, i, arr) => ({ k, a: 0.15 + 0.55 * (1 - k), lift: 0.02 * (1 - k) })), // rise
  ...ramp(12, 0.7, 1).map((a, i) => ({ k: 0, a, lift: 0.05 + 0.02 * i })),            // extend to release
  ...hold(30, 0).map((_, i) => ({ k: 0, a: 1, lift: 0.09 - 0.003 * i })),             // follow-through
  ...ramp(20, 1, 0.2).map((a) => ({ k: 0.1, a, lift: 0 })),                           // land
];

console.log('SHOT DETECTION\n');

// ── the positive case ──────────────────────────────────────────────────────
{
  const f = frames(SHOT);
  const series = buildSeries(f, { hand: 'R', aspect: 1080 / 1920 });
  const dbg = [];
  const cycles = detectShots(series, FPS, { debug: dbg });
  eq('one synthetic jump shot is detected exactly once', cycles.length, 1);
  if (cycles.length === 1) {
    const c = cycles[0];
    eq('the phases come out in order (stance <= dip < set <= release)',
      c.stance <= c.dip && c.dip < c.set && c.set <= c.release, true);
    eq('the release frame really has the arm up',
      series.sm.armElev[c.release] > 70, true);
    eq('the dip frame really has a bent knee',
      series.sm.knee[c.dip] < 165, true);
  } else {
    console.log('   reject reasons:', JSON.stringify(dbg.slice(0, 4)));
  }
}

// ── things that must NOT count as a shot ───────────────────────────────────
{
  // Standing still: no dip, arm never leaves the hip.
  const f = frames(hold(120, 0).map(() => ({ k: 0, a: 0, lift: 0 })));
  const s = buildSeries(f, { hand: 'R', aspect: 1080 / 1920 });
  eq('standing still is not a shot', detectShots(s, FPS).length, 0);
}
{
  // Squatting: a deep dip, but the arm stays down the whole time.
  const spec = [...hold(20, 0).map(() => ({ k: 0, a: 0, lift: 0 })),
    ...ramp(25, 0, 1).map((k) => ({ k, a: 0, lift: 0 })),
    ...ramp(25, 1, 0).map((k) => ({ k, a: 0, lift: 0 })),
    ...hold(20, 0).map(() => ({ k: 0, a: 0, lift: 0 }))];
  const s = buildSeries(frames(spec), { hand: 'R', aspect: 1080 / 1920 });
  eq('a squat (dip, no arm) is not a shot', detectShots(s, FPS).length, 0);
}
{
  // Arms raised overhead with no dip at all — a stretch, a catch, a rebound.
  const spec = [...hold(20, 0).map(() => ({ k: 0, a: 0, lift: 0 })),
    ...ramp(25, 0, 1).map((a) => ({ k: 0, a, lift: 0 })),
    ...ramp(25, 1, 0).map((a) => ({ k: 0, a, lift: 0 })),
    ...hold(20, 0).map(() => ({ k: 0, a: 0, lift: 0 }))];
  const s = buildSeries(frames(spec), { hand: 'R', aspect: 1080 / 1920 });
  eq('arms up with NO dip is not a shot', detectShots(s, FPS).length, 0);
}

// ── two shots in one clip are two shots ────────────────────────────────────
{
  const gap = hold(40, 0).map(() => ({ k: 0, a: 0, lift: 0 }));
  const s = buildSeries(frames([...SHOT, ...gap, ...SHOT]), { hand: 'R', aspect: 1080 / 1920 });
  eq('two shots in one clip are counted separately', detectShots(s, FPS).length, 2);
}

// ── degenerate input never throws ──────────────────────────────────────────
{
  const f = frames(hold(4, 0).map(() => ({ k: 0, a: 0, lift: 0 })));
  const s = buildSeries(f, { hand: 'R', aspect: 1080 / 1920 });
  eq('a 4-frame clip yields no shot and no throw', detectShots(s, FPS).length, 0);
}

console.log(`\nSHOT DETECTION: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
