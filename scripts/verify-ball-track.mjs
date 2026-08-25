// Regression suite for ball detection + launch angle.
//
// The whole design goal is that a BAD read produces nothing rather than a wrong
// number — the scorecard would otherwise print a confident launch angle derived
// from an orange patch of floor. Most of these assertions are about refusing.
import { isBallPixel, findBall, launchAngle, fitQuadratic, fitLinear } from '../src/ballTrack.js';

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log(`  ✗ ${name}\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`); }
};
const near = (name, got, want, tol) => {
  const ok = got != null && Math.abs(got - want) <= tol;
  if (ok) pass++; else { fail++; console.log(`  ✗ ${name}: got ${got}, want ${want} ±${tol}`); }
};

// a tiny ImageData stand-in
const img = (w, h, paint) => {
  const data = new Uint8ClampedArray(w * h * 4).fill(0);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const [r, g, b] = paint(x, y) || [20, 20, 24];
    const i = (y * w + x) * 4;
    data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
  }
  return { data, width: w, height: h };
};
const disc = (cx, cy, rad, col) => (x, y) => ((x - cx) ** 2 + (y - cy) ** 2 <= rad * rad ? col : null);

console.log('BALL TRACK\n');

// ── the colour gate ────────────────────────────────────────────────────────
eq('basketball orange is a ball pixel', isBallPixel(205, 105, 45), true);
eq('a dim night-court ball still counts', isBallPixel(120, 62, 30), true);
eq('white is not', isBallPixel(240, 240, 240), false);
eq('grey court is not', isBallPixel(120, 120, 122), false);
eq('near-black is not', isBallPixel(30, 14, 6), false);
eq('pure red is not (kit)', isBallPixel(200, 20, 20), false);
eq('yellow is not', isBallPixel(220, 210, 40), false);
eq('blue is not', isBallPixel(40, 90, 200), false);

// ── finding the ball ───────────────────────────────────────────────────────
{
  const im = img(80, 80, disc(40, 40, 9, [210, 110, 50]));
  const hit = findBall(im, { x0: 0, y0: 0, x1: 80, y1: 80 });
  near('finds the disc centre x', hit && hit.x, 40, 2);
  near('finds the disc centre y', hit && hit.y, 40, 2);
  near('estimates a sane radius', hit && hit.r, 9, 3);
}
{
  // The SAME ball, but outside the search box — must not be found.
  const im = img(80, 80, disc(70, 70, 9, [210, 110, 50]));
  eq('a ball outside the box is ignored', findBall(im, { x0: 0, y0: 0, x1: 30, y1: 30 }), null);
}
{
  // A long orange smear (floor line, kit) is not round enough.
  const im = img(80, 80, (x, y) => (y > 38 && y < 44 && x > 4 && x < 76 ? [210, 110, 50] : null));
  eq('an orange streak is refused', findBall(im, { x0: 0, y0: 0, x1: 80, y1: 80 }), null);
}
{
  const im = img(80, 80, disc(40, 40, 2, [210, 110, 50]));
  eq('a few stray orange pixels are refused', findBall(im, { x0: 0, y0: 0, x1: 80, y1: 80 }), null);
}
eq('no image', findBall(null, { x0: 0, y0: 0, x1: 10, y1: 10 }), null);

// ── launch angle from a real projectile ────────────────────────────────────
{
  // A ball leaving at 50° with vx = 300 px/s, y down in image space.
  const vx = 300, ang = 50 * Math.PI / 180, v = vx / Math.cos(ang), vy = v * Math.sin(ang), g = 980;
  const pts = [];
  for (let i = 0; i < 12; i++) {
    const t = i * 0.033;
    pts.push({ t: 1000 + t * 1000, x: 100 + vx * t, y: 400 - (vy * t - 0.5 * g * t * t) });
  }
  const la = launchAngle(pts);
  near('recovers a 50° launch angle', la && la.angleDeg, 50, 2);
  eq('and reports a strong parabola fit', la && la.fit > 0.98, true);
}
{
  // Same shot, a shallow 35°.
  const vx = 300, ang = 35 * Math.PI / 180, v = vx / Math.cos(ang), vy = v * Math.sin(ang), g = 980;
  const pts = Array.from({ length: 12 }, (_, i) => { const t = i * 0.033; return { t: t * 1000, x: 100 + vx * t, y: 400 - (vy * t - 0.5 * g * t * t) }; });
  near('recovers a 35° launch angle', launchAngle(pts) && launchAngle(pts).angleDeg, 35, 2);
}

// ── and REFUSES everything that is not one ─────────────────────────────────
eq('too few samples', launchAngle([{ t: 0, x: 0, y: 0 }, { t: 30, x: 5, y: -5 }]), null);
{
  // Random jitter — a mis-detection run.
  const pts = Array.from({ length: 12 }, (_, i) => ({ t: i * 33, x: 100 + ((i * 37) % 13), y: 300 + ((i * 53) % 11) }));
  eq('noise is refused', launchAngle(pts), null);
}
{
  // A ball rolling on the floor: horizontal, no gravity curve.
  const pts = Array.from({ length: 12 }, (_, i) => ({ t: i * 33, x: 100 + 8 * i, y: 400 }));
  eq('a rolling ball is refused', launchAngle(pts), null);
}
{
  // Straight DOWN — a dropped ball, no upward velocity at t0.
  const pts = Array.from({ length: 12 }, (_, i) => { const t = i * 0.033; return { t: t * 1000, x: 100 + 300 * t, y: 100 + 0.5 * 980 * t * t }; });
  eq('a dropped ball is refused (no upward velocity)', launchAngle(pts), null);
}
{
  // Stationary blob — a static orange object misread every frame.
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
