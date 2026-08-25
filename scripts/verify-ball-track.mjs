// Regression suite for ball tracking + launch angle.
//
// The design goal is that a BAD read produces NOTHING rather than a wrong
// number — the scorecard would otherwise print a confident launch angle derived
// from a swinging arm. Most of these assertions are about refusing.
//
// The two tests that matter most are drawn from real failures found while
// building this against Ohad's clip:
//   • "a gap-bridged track loses to a dense one" — the first tracker stitched an
//     arm onto the ball across a gap and reported 72 degrees instead of 57.
//   • "gravity gate" — a parabola alone is not enough; the thing has to fall at
//     9.81 m/s2 for the scale its own size implies.
import {
  toGray, motionBlobs, trackBall, launchAngle, fitQuadratic, fitLinear, BALL_DIAMETER_M,
} from '../src/ballTrack.js';

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log(`  ✗ ${name}\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`); }
};
const near = (name, got, want, tol) => {
  const ok = got != null && Math.abs(got - want) <= tol;
  if (ok) pass++; else { fail++; console.log(`  ✗ ${name}: got ${got}, want ${want} ±${tol}`); }
};

const W = 120, H = 120;
const blank = () => new Uint8Array(W * H).fill(30);
const paintDisc = (g, cx, cy, r, v = 220) => {
  for (let y = Math.max(0, cy - r); y <= Math.min(H - 1, cy + r); y++) {
    for (let x = Math.max(0, cx - r); x <= Math.min(W - 1, cx + r); x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) g[y * W + x] = v;
    }
  }
  return g;
};
const full = { x0: 0, y0: 0, x1: W, y1: H };

console.log('BALL TRACK\n');

// ── grayscale ──────────────────────────────────────────────────────────────
{
  const rgba = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255]);
  const g = toGray(rgba, 2, 1, 4);
  eq('white is bright', g[0] > 245, true);
  eq('black is dark', g[1], 0);
}

// ── motion blobs ───────────────────────────────────────────────────────────
{
  const a = paintDisc(blank(), 40, 40, 6);
  const b = paintDisc(blank(), 52, 40, 6);
  const found = motionBlobs(a, b, W, H, full);
  eq('a moving disc produces blobs', found.length >= 1, true);
  eq('and they sit between the two positions', found.every((f) => f.x > 30 && f.x < 62), true);
}
{
  // Nothing moved — the same frame twice.
  const a = paintDisc(blank(), 40, 40, 6);
  eq('a static scene produces nothing', motionBlobs(a, a, W, H, full).length, 0);
}
{
  // A whole person entering: far too big to be a ball.
  const a = blank();
  const b = blank();
  for (let y = 20; y < 110; y++) for (let x = 30; x < 70; x++) b[y * W + x] = 230;
  eq('a person-sized change is refused', motionBlobs(a, b, W, H, full).length, 0);
}
{
  // A long thin smear — a swinging rope, a court line flickering.
  const a = blank(), b = blank();
  for (let x = 10; x < 100; x++) { b[50 * W + x] = 230; b[51 * W + x] = 230; }
  eq('a thin smear is refused', motionBlobs(a, b, W, H, full).length, 0);
}
{
  // The SAME moving disc, but outside the search box.
  const a = paintDisc(blank(), 90, 90, 6);
  const b = paintDisc(blank(), 100, 90, 6);
  eq('movement outside the box is ignored', motionBlobs(a, b, W, H, { x0: 0, y0: 0, x1: 40, y1: 40 }).length, 0);
}
eq('no frames', motionBlobs(null, null, W, H, full).length, 0);

// ── tracking a flight out of clutter ───────────────────────────────────────
// A ball on a parabola, plus a decoy that jitters in place every frame (a hand).
const flight = (n, { vx = 160, vy = 260, g = 650, x0 = 20, y0 = 100, t0 = 0, fps = 60 } = {}) => {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = i / fps;
    out.push({ t: t0 + t * 1000, x: x0 + vx * t, y: y0 - (vy * t - 0.5 * g * t * t) });
  }
  return out;
};
{
  const truth = flight(16);
  const frames = truth.map((p, i) => ({
    t: p.t,
    blobs: [
      { x: p.x, y: p.y, n: 200, w: 16, h: 16 },
      { x: 200 + (i % 3), y: 300 - (i % 2), n: 120, w: 12, h: 12 },   // jittering decoy
    ],
  }));
  const tr = trackBall(frames);
  eq('finds a flight among clutter', !!tr && tr.points.length >= 14, true);
  near('and locks onto the ball, not the decoy', tr && tr.points[0].x, truth[0].x, 1);
  near('reports the ball size', tr && tr.ballPx, 16, 1);
}
{
  // The real bug: an arm for a few frames, a GAP, then the ball. The dense
  // ball-only track must win, because the stitched one reports a wrong angle.
  const ball = flight(14, { t0: 200 });
  const frames = [];
  frames.push({ t: 0, blobs: [{ x: 300, y: 400, n: 150, w: 14, h: 14 }] });
  frames.push({ t: 33, blobs: [{ x: 285, y: 370, n: 150, w: 14, h: 14 }] });
  for (let k = 66; k < 200; k += 33) frames.push({ t: k, blobs: [] });
  for (const p of ball) frames.push({ t: p.t, blobs: [{ x: p.x, y: p.y, n: 200, w: 16, h: 16 }] });
  const tr = trackBall(frames);
  eq('a gap-bridged track loses to a dense one', !!tr && tr.points.length === ball.length, true);
  near('so the track starts at the ball', tr && tr.points[0].t, 200, 1);
}
{
  // Pure clutter: blobs everywhere, on no path at all.
  const frames = Array.from({ length: 16 }, (_, i) => ({
    t: i * 33,
    blobs: [
      { x: 50 + ((i * 37) % 23), y: 80 + ((i * 53) % 19), n: 100, w: 12, h: 12 },
      { x: 90 - ((i * 29) % 17), y: 60 + ((i * 41) % 13), n: 100, w: 12, h: 12 },
    ],
  }));
  // Clutter CAN accidentally curve — a handful of scattered points will always
  // fit something. What refuses it is the physics: whatever that path is, it is
  // not falling at gravity for the size it claims to be. This asserts the
  // pipeline as the app actually calls it.
  const tr = trackBall(frames);
  eq('clutter is refused by the pipeline', tr ? launchAngle(tr.points, null, tr.ballPx) : null, null);
}
{
  // The origin constraint: the ball must come out of the shooting hand.
  const truth = flight(16);
  const frames = truth.map((p) => ({ t: p.t, blobs: [{ x: p.x, y: p.y, n: 200, w: 16, h: 16 }] }));
  eq('a flight starting at the hand is tracked', !!trackBall(frames, { origin: { x: 20, y: 100 } }), true);
  eq('the same flight far from the hand is refused', trackBall(frames, { origin: { x: 900, y: 900 } }), null);
}
{
  // The climb requirement: a near-level drift that still fits a parabola. This
  // is the real 17-degree false positive, reduced to its essentials.
  const pts = Array.from({ length: 16 }, (_, i) => {
    const t = i / 60;
    return { t: t * 1000, x: 200 - 100 * t, y: 140 - (25 * t - 0.5 * 300 * t * t) };
  });
  eq('a near-level drift is refused (it never climbed)', launchAngle(pts, null, 12), null);
}
eq('too few frames to track', trackBall([{ t: 0, blobs: [] }]), null);
eq('no frames to track', trackBall(null), null);

// ── launch angle ───────────────────────────────────────────────────────────
{
  // A ball leaving at 50°, y down in image space.
  const vx = 300, ang = 50 * Math.PI / 180, v = vx / Math.cos(ang), vy = v * Math.sin(ang), g = 980;
  const pts = Array.from({ length: 12 }, (_, i) => {
    const t = i * 0.033;
    return { t: 1000 + t * 1000, x: 100 + vx * t, y: 400 - (vy * t - 0.5 * g * t * t) };
  });
  const la = launchAngle(pts);
  near('recovers a 50° launch angle', la && la.angleDeg, 50, 2);
  eq('and reports a strong parabola fit', la && la.fit > 0.98, true);
}
{
  const vx = 300, ang = 35 * Math.PI / 180, v = vx / Math.cos(ang), vy = v * Math.sin(ang), g = 980;
  const pts = Array.from({ length: 12 }, (_, i) => { const t = i * 0.033; return { t: t * 1000, x: 100 + vx * t, y: 400 - (vy * t - 0.5 * g * t * t) }; });
  near('recovers a 35° launch angle', launchAngle(pts) && launchAngle(pts).angleDeg, 35, 2);
}
{
  // Reading the angle at the RELEASE rather than at first sight. The ball is
  // decelerating, so the earlier moment must give a STEEPER angle.
  const pts = flight(14, { t0: 200 });
  const seen = launchAngle(pts);
  const atRelease = launchAngle(pts, 100);
  eq('extrapolating back to the release steepens the angle', atRelease.angleDeg > seen.angleDeg, true);
  eq('but only within a sane reach', launchAngle(pts, -5000).angleDeg, seen.angleDeg);
}

// ── the gravity gate ───────────────────────────────────────────────────────
{
  // 650 px/s2 of fall with a 16px ball implies 9.81 m/s2 — this is a real ball.
  const pts = flight(14, { g: 9.81 * (16 / BALL_DIAMETER_M) });
  eq('a ball falling at gravity passes', !!launchAngle(pts, null, 16), true);
  // The identical path, but claimed to be a ball four times the size: the same
  // fall would then be a quarter of gravity, so it is not a ball.
  eq('the same fall at the wrong scale is refused', launchAngle(pts, null, 64), null);
  // And far too fast a fall for its size.
  const fast = flight(14, { g: 9.81 * (16 / BALL_DIAMETER_M) * 4, vy: 900 });
  eq('falling far too fast for its size is refused', launchAngle(fast, null, 16), null);
}

// ── and REFUSES everything that is not a shot ──────────────────────────────
eq('too few samples', launchAngle([{ t: 0, x: 0, y: 0 }, { t: 30, x: 5, y: -5 }]), null);
{
  const pts = Array.from({ length: 12 }, (_, i) => ({ t: i * 33, x: 100 + ((i * 37) % 13), y: 300 + ((i * 53) % 11) }));
  eq('noise is refused', launchAngle(pts), null);
}
{
  const pts = Array.from({ length: 12 }, (_, i) => ({ t: i * 33, x: 100 + 8 * i, y: 400 }));
  eq('a rolling ball is refused', launchAngle(pts), null);
}
{
  const pts = Array.from({ length: 12 }, (_, i) => { const t = i * 0.033; return { t: t * 1000, x: 100 + 300 * t, y: 100 + 0.5 * 980 * t * t }; });
  eq('a dropped ball is refused (no upward velocity)', launchAngle(pts), null);
}
{
  const pts = Array.from({ length: 12 }, (_, i) => ({ t: i * 33, x: 200, y: 300 }));
  eq('a stationary blob is refused', launchAngle(pts), null);
}
eq('null input', launchAngle(null), null);

// ── the fitters themselves ─────────────────────────────────────────────────
{
  const f = fitLinear([0, 1, 2, 3], [1, 3, 5, 7]);
  near('linear slope', f && f.m, 2, 1e-6);
  near('linear intercept', f && f.c, 1, 1e-6);
}
{
  const q = fitQuadratic([0, 1, 2, 3, 4], [0, 1, 4, 9, 16]);
  near('quadratic a', q && q.a, 1, 1e-6);
  eq('perfect fit is r2 = 1', q && Math.round(q.r2 * 1e6) / 1e6, 1);
}

console.log(`\nBALL TRACK: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
