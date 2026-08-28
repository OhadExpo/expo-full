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
    origin = null, maxOriginBalls = 9, originBias = 0, trace = null,
    // Optional out-object. The builder rejects candidates in a loop, so there is
    // no single reason it failed — but there IS a shape to the failure, and it
    // says different things. Mostly `tooShort` means the ball was not detected
    // in enough frames; mostly `badFit` means it was detected but what got
    // tracked was clutter. Without this the only way to tell them apart was to
    // add a console.log and re-run a two-minute clip.
    stats = null,
  } = opts;
  const bump = (k) => { if (stats) stats[k] = (stats[k] || 0) + 1; };
  const fs = (frames || []).filter((f) => f && Array.isArray(f.blobs));
  if (fs.length < minLen) { bump('tooFewFrames'); return null; }

  let best = null;
  // Seed from ANY frame, not just the first few: the ball only separates from
  // the hand once it has cleared it, which on real footage is several frames
  // after the release.
  const seedLimit = Math.max(1, fs.length - minLen + 1);
  for (let i = 0; i < seedLimit; i++) {
    for (const a of fs[i].blobs) {
      const aPx = Math.max((a.w + a.h) / 2, 1e-9);
      const tol = tolBalls * aPx, maxStep = maxStepBalls * aPx;
      if (origin && Math.hypot(a.x - origin.x, a.y - origin.y) > maxOriginBalls * aPx) { bump('farFromHand'); continue; }
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
            if (!pick) {
              misses++; gaps++;
              // `trace` (optional, diagnostic only) records WHY a walk stopped.
              // Five hypotheses about shot 4 were argued and disproved before
              // anyone simply logged this.
              if (misses > maxMiss) { if (trace) trace.push({ startT: pts[0].t, n: pts.length, ended: 'lost the ball', atT: fs[k].t, gaps }); break; }
              continue;
            }
            misses = 0; lastIdx = k;
            pts.push({ t: fs[k].t, x: pick.x, y: pick.y, px: (pick.w + pick.h) / 2 });
          }
          bump('seeds');
          if (trace && pts.length >= minLen) trace.push({ startT: pts[0].t, n: pts.length, ended: 'reached the end of the window', gaps });
          if (pts.length < minLen) { bump('tooShort'); continue; }
          // A real flight is seen in nearly every frame it spans. A path picked
          // out of clutter is sparse — it only lands on a candidate now and
          // then, and those few points can still curve convincingly.
          if (pts.length / (lastIdx - i + 1) < minDensity) { bump('tooSparse'); continue; }
          const q = fitQuadratic(pts.map((p) => (p.t - pts[0].t) / 1000), pts.map((p) => -p.y));
          if (!q || q.r2 < 0.9) { bump('badFit'); continue; }
          bump('kept');
          // Density matters as much as length. A track that had to bridge gaps
          // is usually two different objects stitched together — on the real
          // clip that was an arm followed by the ball, and the arm's much
          // steeper motion dragged the launch angle up by twenty degrees.
          // DEFAULT scoring, unchanged: length dominates, because r2 only ever
          // contributes 0..1. That is deliberate for the normal case — a longer
          // run of the same object is better evidence than a short one.
          //
          // It is also why shot 4 of Ohad's clip picks the WRONG ball: the
          // previous shot, still sailing across an empty night sky, is visible
          // for ~20 frames while the ball just off his hand manages ~11. Length
          // wins regardless of which one actually started at the hand.
          //
          // `originBias` (opt-in, default 0) adds a reward for starting CLOSE to
          // the hand, so a shorter arc that genuinely left the shooter can beat
          // a longer one that merely drifted past. Exposed for measurement
          // before anyone changes the default — see
          // docs/shot-analyzer-next-2026-08-27.md.
          let score = pts.length + q.r2 - gaps * 1.5;
          if (originBias && origin) {
            const d0 = Math.hypot(pts[0].x - origin.x, pts[0].y - origin.y) / Math.max(pts[0].px, 1e-9);
            score += originBias * Math.max(0, 1 - d0 / maxOriginBalls);
          }
          if (!best || score > best.score) best = { score, points: pts, fit: q.r2 };
        }
      }
    }
  }
  if (!best) { bump('noTrack'); return null; }
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
export function launchAngle(points, releaseMs = null, ballPx = 0, out = null, origin = null) {
  // Every refusal below says WHY. There are a dozen ways for a track to fail
  // this and they all used to return a bare null, so an untracked rep was
  // indistinguishable from a rep that was never filmed — and unfixable without
  // adding a console.log and re-running a two-minute clip. Callers who want the
  // reason pass an object; everyone else is unaffected.
  const no = (why) => { if (out) out.why = why; return null; };
  const p = (points || []).filter((q) => q && Number.isFinite(q.t) && Number.isFinite(q.x) && Number.isFinite(q.y));
  if (p.length < 5) return no('fewer than 5 ball samples');

  const t0 = p[0].t;
  const ts = p.map((q) => (q.t - t0) / 1000);          // seconds
  const xs = p.map((q) => q.x);
  const ys = p.map((q) => -q.y);                        // flip so UP is positive

  // The ball must actually travel — a stationary blob is not a shot.
  const dx = xs[xs.length - 1] - xs[0];
  if (Math.abs(dx) < 8) return no('the blob never travelled sideways');

  const lin = fitLinear(ts, xs);
  if (!lin) return no('no linear fit in x');

  // y(t) = a t^2 + b t + c. Gravity means a is clearly NEGATIVE (y is up).
  const quad = fitQuadratic(ts, ys);
  if (!quad) return no('no quadratic fit in y');
  if (!(quad.a < -50)) return no('not falling like a projectile');
  if (quad.r2 < 0.9) return no(`the path is not a parabola (r2 ${quad.r2.toFixed(2)})`);

  // Did it actually GO UP? A shot climbs for many ball-widths before it falls.
  let ascentMissing = false;
  // Something drifting almost level can still fit a parabola beautifully — on
  // the real clip one such track rose by less than a third of a ball.
  if (ballPx > 0) {
    // Measure the rise from the HAND, not from the first blob the tracker
    // managed to lock onto.
    //
    // Shot 4 of Ohad's clip was rejected as "it barely rose (0.5 ball widths)"
    // for months of work. It is a real, clean shot. Reading the fixture frame
    // by frame: the highest blob traces 0.308 -> 0.292 (apex) -> 0.451, a
    // textbook parabola whose descent accelerates at gravity. The problem is
    // that at the labelled release the ball is ALREADY 0.12 frame-heights
    // above the wrist — the ascent out of the hand is not in the candidate set
    // at all, so the arc begins near its own apex and the climb measured
    // WITHIN it is meaningless.
    //
    // The ball starts in the hand. That is the base. With it, the same rep
    // measures ~5 ball widths instead of 0.5.
    //
    // This can only ever INCREASE the measured climb, so no rep that passes
    // today can start failing. The gravity check below is what still keeps a
    // drifting object out; this gate only ever answered "did it go up".
    let base = ys[0];
    // Set when the base had to come from the hand — i.e. the climb out of the
    // hand was never tracked. Recorded because it decides, below, which
    // numbers this flight can honestly report.
    if (origin && Number.isFinite(origin.y) && Number.isFinite(origin.x)) {
      const originUp = -origin.y;
      // Only when the hand is genuinely BELOW the first tracked point (i.e. the
      // ascent was missed) and the arc starts near the hand horizontally —
      // otherwise this would anchor to a hand that has nothing to do with the
      // tracked object.
      if (originUp < base && Math.abs(xs[0] - origin.x) < 6 * ballPx) { base = originUp; ascentMissing = true; }
    }
    const climb = Math.max(...ys) - base;
    if (climb < 1.2 * ballPx) return no(`it barely rose (${(climb / ballPx).toFixed(1)} ball widths)`);
  }

  // Is it falling at gravity? Generous bounds, because the motion blob is the
  // union of two ball positions and so reads a little wider than the ball —
  // but still far tighter than anything an arbitrary moving object would pass.
  if (ballPx > 0) {
    const expected = 9.81 * (ballPx / BALL_DIAMETER_M);   // px/s2
    const measured = -2 * quad.a;
    if (measured < expected * 0.45 || measured > expected * 2.2) return no(`it is not falling at gravity (${(measured / expected).toFixed(2)}x)`);
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
  if (!Number.isFinite(vx) || !Number.isFinite(vy)) return no('the fit produced no velocity');
  if (vy <= 0) return no('the ball was already coming down');

  const angleDeg = Math.atan2(vy, Math.abs(vx)) * 180 / Math.PI;
  if (!(angleDeg > 15 && angleDeg < 80)) return no(`launch ${angleDeg.toFixed(0)} deg is outside any jump shot`);

  // IS THE SHOT IN THE IMAGE PLANE?
  //
  // Everything below assumes the ball travels ACROSS the sensor, not away from
  // it. When it recedes, the component along the view axis is invisible, so the
  // projection under-reads the speed and over-reads the launch angle — and the
  // fit cannot tell, because a receding parabola is still a lovely parabola.
  //
  // The ball's own apparent size is the giveaway: it scales as 1/distance, so a
  // square-on shot holds its size and a receding one shrinks. On Ohad's clip it
  // shrank 1.45x across the flight, which is why that shot measured 5.3 m/s at
  // 63 degrees when a three needs about 9.3 at nearer 50.
  //
  // Measured, never gated: the angle SPREAD and the rep-to-rep comparison
  // survive an oblique camera, and refusing the whole reading would throw away
  // the coachable part. The caller is told so it can say so.
  let recede = null;
  {
    const px = p.map((q) => q.px).filter((v) => v > 0);
    if (px.length >= 8) {
      const k = Math.max(3, Math.round(px.length / 5));
      const head = px.slice(0, k).reduce((a, b) => a + b, 0) / k;
      const tail = px.slice(-k).reduce((a, b) => a + b, 0) / k;
      if (tail > 0) recede = Math.round((head / tail) * 100) / 100;
    }
  }

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
  const gPx = -2 * quad.a;                        // px/s2, measured from this flight
  if (ballPx > 0 && gPx > 0) {
    // SCALE FROM GRAVITY, not from the blob. The ball's apparent width is
    // inflated by motion blur — the motion blob is the union of two ball
    // positions — and that error goes straight into every metre. Gravity does
    // not have that problem: it is exactly 9.81 m/s2, so the curvature this
    // flight measured in px/s2 IS the pixel scale, and it comes from the same
    // 20-sample fit that already had to pass an r2 gate.
    //
    // The ball width still earns its keep as the sanity check that decides
    // whether the flight is a ball at all (see the gravity gate above).
    const mPerPx = 9.81 / gPx;
    speedMs = Math.hypot(vx, vy) * mPerPx;
    riseM = (vy * vy) / (2 * gPx) * mPerPx;
    // Sanity: a jump shot leaves the hand at roughly 3-11 m/s and peaks less
    // than 4 m above the release. Outside that the scale is not trustworthy, so
    // report nothing rather than a confident wrong number.
    if (!(speedMs > 2 && speedMs < 14)) speedMs = null;
    if (!(riseM > 0.05 && riseM < 4)) riseM = null;
  }

  // WHAT THIS FLIGHT CAN HONESTLY REPORT.
  //
  // When the ascent out of the hand was never tracked, the arc begins near its
  // own apex. Everything measured AT THE RELEASE — launch angle, release speed,
  // rise — is then an extrapolation across frames that were never seen, and it
  // reads far too low: the rescued rep on Ohad's clip fits at r2 0.994 and
  // still yields 19 degrees at 3.2 m/s, when a jump shot leaves the hand near
  // 45-55 degrees at ~7 m/s.
  //
  // The shot is real and is now correctly DETECTED and tracked. But a wrong
  // number presented as a measurement is worse than no number — the file
  // already nulls a speed outside 2-14 m/s for exactly this reason. Same rule
  // here: keep the flight, drop the release-time figures, and say why.
  if (ascentMissing) {
    return {
      recede,
      obliqueShot: recede != null && recede >= 1.2,
      angleDeg: null,
      fit: Math.round(quad.r2 * 1000) / 1000,
      n: p.length,
      speedMs: null,
      riseM: null,
      ascentMissing: true,
      partialWhy: 'the ball was already above the hand when tracking began, so the release angle and speed are not measurable on this rep',
    };
  }

  return {
    // How much the ball shrank across the flight, and whether that is enough to
    // say the shot was not square to the camera. 1.0 = square.
    recede,
    obliqueShot: recede != null && recede >= 1.2,
    angleDeg: Math.round(angleDeg * 10) / 10,
    fit: Math.round(quad.r2 * 1000) / 1000,
    n: p.length,
    speedMs: speedMs == null ? null : Math.round(speedMs * 10) / 10,
    riseM: riseM == null ? null : Math.round(riseM * 100) / 100,
    ascentMissing: false,
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
