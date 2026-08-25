// ballTrack.js — find the basketball in flight and turn its path into the
// ball's true LAUNCH ANGLE.
//
// Why this exists: the scorecard's "release arm angle" is explicitly a PROXY for
// the ball's launch angle — the footnote said so. The forearm and the ball agree
// on a clean release and diverge exactly when the wrist snap is off, which is
// the case a coach most wants to see. Measuring the ball removes the proxy.
//
// WHY MOTION AND NOT COLOUR. The first version of this file looked for orange.
// Measured against Ohad's real night-court clip — a scan of three full
// 1080x1920 frames — 22% of every frame passed a reasonable "basketball orange"
// test. The floodlights and the floor are the same warm hue as the ball, and the
// g/r histogram of the entire scene piles up exactly where the ball sits. Colour
// carries almost no information on that footage, so it is gone. The ball is
// instead the one thing in the upper frame that MOVES like a ball: a small,
// round, solid blob tracing a parabola. On the same clip that signal is
// unmistakable — a 16-frame track with clean gravity deceleration.
//
// Everything here still refuses rather than guesses: a track is only accepted
// when enough frames agree, the points fit a parabola, the curvature really is
// gravity, and the resulting angle is one a jump shot can actually have.
//
// Pure and DOM-free — it is handed raw pixels — so it is unit testable. See
// scripts/verify-ball-track.mjs.

/** A basketball is 0.24 m across (FIBA size 7, 749-780 mm circumference). */
export const BALL_DIAMETER_M = 0.24;

/** RGBA (canvas) or RGB (raw) pixels to an 8-bit luma plane. */
export function toGray(px, w, h, stride = 4) {
  const g = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) {
    const i = p * stride;
    g[p] = (px[i] * 77 + px[i + 1] * 150 + px[i + 2] * 29) >> 8;
  }
  return g;
}

/**
 * Blobs that MOVED between two grayscale frames, filtered down to things that
 * could plausibly be a ball in flight.
 *
 * Returns [{ x, y, n, w, h, fill }] in pixel coords. Limbs, shadows and camera
 * noise survive this stage — separating the ball from them is trackBall's job,
 * because a single frame genuinely cannot tell them apart.
 */
export function motionBlobs(prev, curr, w, h, box, opts = {}) {
  const { threshold = 22, minPixels = 6, maxPixels = 400, maxAspect = 2.2, minFill = 0.35 } = opts;
  if (!prev || !curr || !w || !h) return [];
  const x0 = Math.max(0, Math.floor(box?.x0 ?? 0));
  const y0 = Math.max(0, Math.floor(box?.y0 ?? 0));
  const x1 = Math.min(w, Math.ceil(box?.x1 ?? w));
  const y1 = Math.min(h, Math.ceil(box?.y1 ?? h));
  if (x1 <= x0 || y1 <= y0) return [];

  const mask = new Uint8Array(w * h);
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const p = y * w + x;
      const d = curr[p] - prev[p];
      if (d > threshold || d < -threshold) mask[p] = 1;
    }
  }

  const seen = new Uint8Array(w * h);
  const out = [];
  const stack = [];
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const p0 = y * w + x;
      if (!mask[p0] || seen[p0]) continue;
      seen[p0] = 1; stack.length = 0; stack.push(p0);
      let n = 0, sx = 0, sy = 0, minX = 1e9, maxX = -1, minY = 1e9, maxY = -1, tooBig = false;
      while (stack.length) {
        const c = stack.pop(), cx = c % w, cy = (c / w) | 0;
        n++; sx += cx; sy += cy;
        if (cx < minX) minX = cx; if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy; if (cy > maxY) maxY = cy;
        // Stop walking anything far too big to be a ball rather than tracing the
        // whole silhouette of a person. The blob is discarded either way, but
        // the flood fill must still consume it so it is not re-entered.
        if (n > maxPixels) tooBig = true;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = cx + dx, ny = cy + dy;
            if (nx < x0 || ny < y0 || nx >= x1 || ny >= y1) continue;
            const np = ny * w + nx;
            if (mask[np] && !seen[np]) { seen[np] = 1; stack.push(np); }
          }
        }
      }
      if (tooBig || n < minPixels || n > maxPixels) continue;
      const bw = maxX - minX + 1, bh = maxY - minY + 1;
      if (Math.max(bw / bh, bh / bw) > maxAspect) continue;   // a smear, not a ball
      if (n / (bw * bh) < minFill) continue;                   // hollow — an edge, not a disc
      out.push({ x: sx / n, y: sy / n, n, w: bw, h: bh, fill: n / (bw * bh) });
    }
  }
  return out;
}

/**
 * Pick the ball's flight path out of per-frame blob candidates.
 *
 * frames: [{ t (ms), blobs: [{x, y, n}] }] in time order.
 *
 * Seeds a track from every plausible pair of early blobs, extends it by
 * predicting where a projectile would be next and taking the nearest candidate,
 * then keeps the longest well-fitting track. This is what separates the ball
 * from a jittering hand: the hand does not keep travelling on a parabola.
 *
 * Returns { points: [{t, x, y}], fit } or null.
 */
export function trackBall(frames, opts = {}) {
  const {
    // Tolerances are expressed in BALL DIAMETERS, not pixels, so this works
    // whatever coordinate unit the caller uses. An earlier version hard-coded
    // pixels and silently stopped finding anything the moment the unit changed.
    tolBalls = 0.7, maxStepBalls = 2.5,
    minLen = 6, seedSpan = 2, maxMiss = 1, minDensity = 0.75,
    // Where the ball was released, if known, and how far from it a track may
    // start — in ball diameters, because the ball only separates from the hand
    // a few frames after the release and has travelled by then.
    origin = null, maxOriginBalls = 9,
  } = opts;
  const fs = (frames || []).filter((f) => f && Array.isArray(f.blobs));
  if (fs.length < minLen) return null;

  let best = null;
  // Seed from ANY frame, not just the first few: the ball only separates from
  // the hand once it has cleared it, which on real footage is several frames
  // after the release.
  const seedLimit = Math.max(1, fs.length - minLen + 1);
  for (let i = 0; i < seedLimit; i++) {
    for (const a of fs[i].blobs) {
      const aPx = Math.max((a.w + a.h) / 2, 1e-9);
      const tol = tolBalls * aPx, maxStep = maxStepBalls * aPx;
      if (origin && Math.hypot(a.x - origin.x, a.y - origin.y) > maxOriginBalls * aPx) continue;
      for (let j = i + 1; j <= Math.min(fs.length - 1, i + seedSpan); j++) {
        for (const b of fs[j].blobs) {
          const dt = fs[j].t - fs[i].t;
          if (!(dt > 0)) continue;
          if (Math.abs(b.x - a.x) > maxStep * (j - i) || Math.abs(b.y - a.y) > maxStep * (j - i)) continue;
          const vx = (b.x - a.x) / dt, vy = (b.y - a.y) / dt;
          // Walk forward, predicting with the velocity so far. Gravity is not
          // assumed here — the fit at the end is what tests for it.
          const pts = [{ t: fs[i].t, x: a.x, y: a.y, px: (a.w + a.h) / 2 },
                       { t: fs[j].t, x: b.x, y: b.y, px: (b.w + b.h) / 2 }];
          let misses = 0, gaps = j - i - 1, lastIdx = j;
          for (let k = j + 1; k < fs.length; k++) {
            const last = pts[pts.length - 1];
            const dtk = fs[k].t - last.t;
            const px = last.x + vx * dtk, py = last.y + vy * dtk;
            let pick = null, bestD = tol + misses * tol * 0.6;
            for (const c of fs[k].blobs) {
              const d = Math.hypot(c.x - px, c.y - py);
              if (d < bestD) { bestD = d; pick = c; }
            }
            if (!pick) { misses++; gaps++; if (misses > maxMiss) break; continue; }
            misses = 0; lastIdx = k;
            pts.push({ t: fs[k].t, x: pick.x, y: pick.y, px: (pick.w + pick.h) / 2 });
          }
          if (pts.length < minLen) continue;
          // A real flight is seen in nearly every frame it spans. A path picked
          // out of clutter is sparse — it only lands on a candidate now and
          // then, and those few points can still curve convincingly.
          if (pts.length / (lastIdx - i + 1) < minDensity) continue;
          const q = fitQuadratic(pts.map((p) => (p.t - pts[0].t) / 1000), pts.map((p) => -p.y));
          if (!q || q.r2 < 0.9) continue;
          // Density matters as much as length. A track that had to bridge gaps
          // is usually two different objects stitched together — on the real
          // clip that was an arm followed by the ball, and the arm's much
          // steeper motion dragged the launch angle up by twenty degrees.
          const score = pts.length + q.r2 - gaps * 1.5;
          if (!best || score > best.score) best = { score, points: pts, fit: q.r2 };
        }
      }
    }
  }
  if (!best) return null;
  // Median apparent size of the tracked blob. This is what lets the caller
  // convert pixels to metres — a basketball is 0.24 m wide, always — and so
  // check that the thing being tracked is falling at GRAVITY.
  const sizes = best.points.map((p) => p.px).filter((v) => v > 0).sort((a, b) => a - b);
  const ballPx = sizes.length ? sizes[sizes.length >> 1] : 0;
  return { points: best.points, fit: Math.round(best.fit * 1000) / 1000, ballPx };
}

/**
 * Launch angle from a run of ball samples.
 *
 * points: [{ t (ms), x, y }] in image pixels, y DOWN, x and y in the SAME unit.
 * ballPx: optional — the ball's apparent width in pixels. A basketball is
 *   0.24 m across, so this fixes the pixel-to-metre scale and lets the fitted
 *   curvature be checked against real GRAVITY. This is the strongest test in
 *   the file: a limb, a shadow or a stitched-together track has no reason to
 *   accelerate downward at 9.81 m/s2, and on Ohad's clip the real ball matched
 *   the prediction to 1.5%.
 * releaseMs: optional — the ball is usually first seen a few frames after the
 *   hand lets go, and it is decelerating the whole time, so reading the velocity
 *   at the first SAMPLE understates the launch. Given the release time the
 *   parabola is evaluated there instead, which is the angle a coach means.
 *
 * Returns { angleDeg, fit, n } or null when the samples do not describe a
 * projectile — the normal outcome for a bad detection run, and the entire point.
 */
export function launchAngle(points, releaseMs = null, ballPx = 0) {
  const p = (points || []).filter((q) => q && Number.isFinite(q.t) && Number.isFinite(q.x) && Number.isFinite(q.y));
  if (p.length < 5) return null;

  const t0 = p[0].t;
  const ts = p.map((q) => (q.t - t0) / 1000);          // seconds
  const xs = p.map((q) => q.x);
  const ys = p.map((q) => -q.y);                        // flip so UP is positive

  // The ball must actually travel — a stationary blob is not a shot.
  const dx = xs[xs.length - 1] - xs[0];
  if (Math.abs(dx) < 8) return null;

  const lin = fitLinear(ts, xs);
  if (!lin) return null;

  // y(t) = a t^2 + b t + c. Gravity means a is clearly NEGATIVE (y is up).
  const quad = fitQuadratic(ts, ys);
  if (!quad) return null;
  if (!(quad.a < -50)) return null;                     // not falling like a projectile
  if (quad.r2 < 0.9) return null;                       // not a parabola

  // Did it actually GO UP? A shot climbs for many ball-widths before it falls.
  // Something drifting almost level can still fit a parabola beautifully — on
  // the real clip one such track rose by less than a third of a ball.
  if (ballPx > 0) {
    const climb = Math.max(...ys) - ys[0];
    if (climb < 1.2 * ballPx) return null;
  }

  // Is it falling at gravity? Generous bounds, because the motion blob is the
  // union of two ball positions and so reads a little wider than the ball —
  // but still far tighter than anything an arbitrary moving object would pass.
  if (ballPx > 0) {
    const expected = 9.81 * (ballPx / BALL_DIAMETER_M);   // px/s2
    const measured = -2 * quad.a;
    if (measured < expected * 0.45 || measured > expected * 2.2) return null;
  }

  // Evaluate at the release when we know it, else at the first sample. Only
  // extrapolate backwards a little — beyond ~300ms the ball was still in the
  // hand and the parabola never applied.
  let tEval = 0;
  if (Number.isFinite(releaseMs)) {
    const dtr = (releaseMs - t0) / 1000;
    if (dtr < 0 && dtr > -0.2) tEval = dtr;
  }

  const vx = lin.m;
  const vy = 2 * quad.a * tEval + quad.b;               // dy/dt at tEval
  if (!Number.isFinite(vx) || !Number.isFinite(vy)) return null;
  if (vy <= 0) return null;                             // the ball must be going UP

  const angleDeg = Math.atan2(vy, Math.abs(vx)) * 180 / Math.PI;
  if (!(angleDeg > 15 && angleDeg < 80)) return null;   // outside any real jump shot

  // REAL-WORLD UNITS. The ball's apparent size is a ruler: it is 0.24 m across,
  // always. So once the flight is tracked, the pixel scale is known and the same
  // fit yields metres and metres-per-second — no extra measurement, no
  // calibration step, nothing for the coach to enter.
  //
  //   speed  = |v| at the release
  //   rise   = how far ABOVE the release point the ball peaks, v_y^2 / 2g,
  //            using the gravity this clip actually measured rather than 9.81
  //            in assumed units.
  let speedMs = null, riseM = null;
  if (ballPx > 0) {
    const mPerPx = BALL_DIAMETER_M / ballPx;
    speedMs = Math.hypot(vx, vy) * mPerPx;
    const gPx = -2 * quad.a;                      // px/s2, measured from this flight
    if (gPx > 0) riseM = (vy * vy) / (2 * gPx) * mPerPx;
    // Sanity: a jump shot leaves the hand at roughly 3-11 m/s and peaks less
    // than 4 m above the release. Outside that the scale is not trustworthy, so
    // report nothing rather than a confident wrong number.
    if (!(speedMs > 2 && speedMs < 14)) speedMs = null;
    if (!(riseM > 0.05 && riseM < 4)) riseM = null;
  }

  return {
    angleDeg: Math.round(angleDeg * 10) / 10,
    fit: Math.round(quad.r2 * 1000) / 1000,
    n: p.length,
    speedMs: speedMs == null ? null : Math.round(speedMs * 10) / 10,
    riseM: riseM == null ? null : Math.round(riseM * 100) / 100,
  };
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
