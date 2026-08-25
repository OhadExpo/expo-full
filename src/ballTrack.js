// ballTrack.js — find the basketball in a frame, and turn a run of ball
// positions into the ball's true LAUNCH ANGLE.
//
// Why this exists: the scorecard's "release arm angle" is explicitly a PROXY for
// the ball's launch angle — the footnote says so. The forearm and the ball agree
// on a clean release and diverge exactly when the wrist snap is off, which is
// the case a coach most wants to see. Measuring the ball removes the proxy.
//
// Deliberately conservative. A basketball on a night court is a dim orange blob
// a few dozen pixels across, and the same orange appears on the floor, on kit
// and under sodium lighting. Everything here is built so that a bad read
// produces NOTHING rather than a wrong number:
//
//   • the search is restricted to a box around the shooting hand, not the frame
//   • a blob must be round enough and big enough to be a ball
//   • the launch angle is only returned when the points actually fit a parabola
//     with a plausible downward acceleration (gravity), and enough of them
//
// Pure and DOM-free apart from the ImageData it is handed, so it is unit
// testable — see scripts/verify-ball-track.mjs.

// A basketball is orange: high red, mid green, low blue, and clearly saturated.
// Tested against both a bright indoor ball and the dim night-court clip.
export function isBallPixel(r, g, b) {
  if (r < 70) return false;                    // too dark to judge
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  if (max - min < 40) return false;            // grey/white — floor, kit, sky
  if (r !== max) return false;                 // orange is red-dominant
  if (b > g) return false;                     // blue must not beat green
  const gr = g / r;
  return gr > 0.25 && gr < 0.72;               // orange, not red and not yellow
}

/**
 * Find the ball inside `imageData`, searching only within a box.
 * Returns { x, y, r, n } in IMAGE-DATA pixel coords, or null.
 *
 * box = { x0, y0, x1, y1 } in pixels, clamped internally.
 */
export function findBall(imageData, box, { minPixels = 24, step = 2 } = {}) {
  if (!imageData || !imageData.data) return null;
  const { data, width, height } = imageData;
  const x0 = Math.max(0, Math.floor(box?.x0 ?? 0));
  const y0 = Math.max(0, Math.floor(box?.y0 ?? 0));
  const x1 = Math.min(width, Math.ceil(box?.x1 ?? width));
  const y1 = Math.min(height, Math.ceil(box?.y1 ?? height));
  if (x1 <= x0 || y1 <= y0) return null;

  let sx = 0, sy = 0, n = 0, minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let y = y0; y < y1; y += step) {
    for (let x = x0; x < x1; x += step) {
      const i = (y * width + x) * 4;
      if (!isBallPixel(data[i], data[i + 1], data[i + 2])) continue;
      sx += x; sy += y; n++;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  if (n < minPixels) return null;

  // Roundness: a ball's bounding box is roughly square, and it fills a good
  // fraction of it. A long orange smear on the floor fails both.
  const w = maxX - minX + 1, h = maxY - minY + 1;
  const aspect = w > h ? w / h : h / w;
  if (aspect > 1.8) return null;
  const sampled = (w / step) * (h / step);
  if (sampled > 0 && n / sampled < 0.4) return null;

  return { x: sx / n, y: sy / n, r: (w + h) / 4, n };
}

/**
 * Launch angle from a run of ball samples taken right after the release.
 *
 * points: [{ t (ms), x, y }] in image pixels, y DOWN.
 * Returns { angleDeg, fit, n } or null when the samples do not describe a
 * projectile — which is the normal outcome for a bad detection run, and the
 * whole point of this function.
 */
export function launchAngle(points) {
  const p = (points || []).filter((q) => q && Number.isFinite(q.t) && Number.isFinite(q.x) && Number.isFinite(q.y));
  if (p.length < 5) return null;

  const t0 = p[0].t;
  const ts = p.map((q) => (q.t - t0) / 1000);          // seconds
  const xs = p.map((q) => q.x);
  const ys = p.map((q) => -q.y);                        // flip so UP is positive

  // The ball must actually travel horizontally — a stationary blob is not a shot.
  const dx = xs[xs.length - 1] - xs[0];
  if (Math.abs(dx) < 8) return null;

  // vx from a straight-line fit of x(t).
  const lin = fitLinear(ts, xs);
  if (!lin) return null;

  // y(t) = a t^2 + b t + c. Gravity means a is clearly NEGATIVE (y is up).
  const quad = fitQuadratic(ts, ys);
  if (!quad) return null;
  if (!(quad.a < -50)) return null;                     // not falling like a projectile
  if (quad.r2 < 0.9) return null;                       // not a parabola

  const vx = lin.m;
  const vy = quad.b;                                    // dy/dt at t=0
  if (!Number.isFinite(vx) || !Number.isFinite(vy)) return null;
  if (vy <= 0) return null;                             // the ball must be going UP at release

  const angleDeg = Math.atan2(vy, Math.abs(vx)) * 180 / Math.PI;
  if (!(angleDeg > 15 && angleDeg < 80)) return null;   // outside any real jump shot
  return { angleDeg: Math.round(angleDeg * 10) / 10, fit: Math.round(quad.r2 * 1000) / 1000, n: p.length };
}

// --- small least-squares helpers (no dependencies) --------------------------

export function fitLinear(xs, ys) {
  const n = xs.length;
  if (n < 2) return null;
  const sx = xs.reduce((a, b) => a + b, 0), sy = ys.reduce((a, b) => a + b, 0);
  const sxx = xs.reduce((a, b) => a + b * b, 0), sxy = xs.reduce((a, b, i) => a + b * ys[i], 0);
  const d = n * sxx - sx * sx;
  if (Math.abs(d) < 1e-9) return null;
  const m = (n * sxy - sx * sy) / d;
  return { m, c: (sy - m * sx) / n };
}

export function fitQuadratic(xs, ys) {
  const n = xs.length;
  if (n < 3) return null;
  let s0 = n, s1 = 0, s2 = 0, s3 = 0, s4 = 0, t0 = 0, t1 = 0, t2 = 0;
  for (let i = 0; i < n; i++) {
    const x = xs[i], y = ys[i], x2 = x * x;
    s1 += x; s2 += x2; s3 += x2 * x; s4 += x2 * x2;
    t0 += y; t1 += x * y; t2 += x2 * y;
  }
  // Solve the 3x3 normal equations by Cramer's rule.
  const det = (a, b, c, d, e, f, g, h, i) => a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  const D = det(s4, s3, s2, s3, s2, s1, s2, s1, s0);
  if (Math.abs(D) < 1e-9) return null;
  const a = det(t2, s3, s2, t1, s2, s1, t0, s1, s0) / D;
  const b = det(s4, t2, s2, s3, t1, s1, s2, t0, s0) / D;
  const c = det(s4, s3, t2, s3, s2, t1, s2, s1, t0) / D;

  const mean = t0 / n;
  let ssRes = 0, ssTot = 0;
  for (let i = 0; i < n; i++) {
    const pred = a * xs[i] * xs[i] + b * xs[i] + c;
    ssRes += (ys[i] - pred) ** 2;
    ssTot += (ys[i] - mean) ** 2;
  }
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;
  return { a, b, c, r2 };
}
