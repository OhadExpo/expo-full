// rimJudge.js - automatic MADE for the Shot Analyzer (29.9 #430, v1).
//
// Ohad: "the shot analyzer need to automatically detect makes and misses. this
// needs to be a perfect feature". What one side-on phone can prove, measured on
// his own clips (28 shots labelled frame by frame, 26 made, 2 missed):
//
//   - A MAKE moves the net, hard, and the lower half of it with the ball
//     (frame-difference energy in the net box >= 10x its quiet level, both
//     halves), the ball arrives inside the rim's span and does not bounce back
//     up or out. On those 28 shots this called 21 of the 26 makes, 0 wrong.
//   - A MISS by net motion cannot be told apart: a ball off the back rim shakes
//     the net as hard as a soft make. What does separate them is a REBOUND - the
//     ball going back up or out above the rim - which no make showed and the
//     rim-out miss did; that is called MISSED at a lower confidence (shown for
//     checking). A ball never seen at the rim stays UNSURE. The coach's tap
//     always wins. Measured: 27 of 28 called, 27 right, 1 unsure.
//
// Coordinates: the coach taps the rim's left and right edge once per clip
// (rim = { l, r, y } in video pixels). u / v are rim-relative: 1 = one rim
// width, v positive downward, (0,0) the rim centre.
//
// The frames are read from an offscreen <video> at ~30 fps around each shot
// (the player is never touched); the rim crop is scaled so the rim is ~35 px.

const S = 140;                 // crop edge in canvas px (4 rim widths -> rim ~35 px)
const FPS = 30;
const MADE_NET = 10;           // net box energy / quiet level
const MADE_NET_LOW = 10;       // lower half of the net

function isOrange(r, g, b) {
  // OpenCV-equivalent HSV gate used in the prototype: H in [0, 44] or [340, 360]
  // degrees, S > 0.31, V > 0.2
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (max < 51 || d / (max || 1) <= 0.31) return false;
  let h;
  if (max === r) h = ((g - b) / d) % 6; else if (max === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
  h *= 60; if (h < 0) h += 360;
  return h <= 44 || h >= 340;
}

// the largest (orange AND moving) blob, 12..700 px, as its centroid
function ballCandidate(mask, w, h) {
  const seen = new Uint8Array(w * h); let best = null;
  const stack = [];
  for (let i = 0; i < w * h; i++) {
    if (!mask[i] || seen[i]) continue;
    let n = 0, sx = 0, sy = 0; stack.length = 0; stack.push(i); seen[i] = 1;
    while (stack.length) {
      const p = stack.pop(); const x = p % w, y = (p - x) / w; n++; sx += x; sy += y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const q = ny * w + nx; if (mask[q] && !seen[q]) { seen[q] = 1; stack.push(q); }
      }
    }
    if (n >= 12 && n <= 700 && (!best || n > best.n)) best = { n, x: sx / n, y: sy / n };
  }
  return best;
}

function percentile(arr, p) {
  if (!arr.length) return 0;
  const a = [...arr].sort((x, y) => x - y);
  return a[Math.min(a.length - 1, Math.max(0, Math.floor((p / 100) * (a.length - 1))))];
}

// Decide one shot from its per-frame read-outs (exported for the gate).
export function decideShot(frames, releaseIdx) {
  // ball-sized blobs only: at this scale the ball is ~260 px; a speck of 12-50 px
  // at the rim (compression noise, a shaking rim) is not the ball (29.9 trace)
  const BALL_MIN = 60;
  const isBall = (f) => f.ball && f.ball.n >= BALL_MIN;
  const near = frames.filter((f) => isBall(f) && Math.abs(f.ball.u) < 1.6 && f.ball.v > -1.6 && f.ball.v < 2.6);
  const quiet = frames.slice(0, releaseIdx).map((f) => f.net).filter((x) => x != null);
  const quietLo = frames.slice(0, releaseIdx).map((f) => f.netLo).filter((x) => x != null);
  // No quiet moment, no yardstick: with the release under ~0.5 s into the clip
  // (or its frames unread) the baseline was 0.05 and ANY ball at the rim read
  // as a 99% make (29.9 audit). Too few quiet frames = not judged.
  if (quiet.length < 8 || quietLo.length < 8) return { outcome: 'unsure', confidence: 0, evidence: { why: 'no quiet moment before the shot to compare the net against' } };
  const base = percentile(quiet, 30) + 0.05, baseLo = percentile(quietLo, 30) + 0.05;
  // CONTACT = the ball ARRIVING: a ball-sized sighting at the rim within 6
  // frames of one above it (v < -0.3). A speck already sitting at the rim before
  // the ball came down made the approach itself read as a rebound.
  const cIdx = frames.findIndex((f, i) => i >= releaseIdx && isBall(f) && Math.abs(f.ball.u) < 1.0 && Math.abs(f.ball.v) < 0.45
    && frames.slice(Math.max(releaseIdx, i - 6), i).some((g) => isBall(g) && g.ball.v < -0.3));
  if (cIdx < 0) return { outcome: 'unsure', confidence: 0, evidence: { why: 'the ball was not seen at the rim' } };
  const after = frames.slice(cIdx, cIdx + Math.round(0.6 * FPS));
  const netRatio = Math.max(0, ...after.map((f) => f.net || 0)) / base;
  const loRatio = Math.max(0, ...after.map((f) => f.netLo || 0)) / baseLo;
  // REBOUND = the ball going back UP above the rim for two frames running, or
  // out sideways above the rim plane, within 0.8 s of contact
  const post = near.filter((f) => f.i > frames[cIdx].i && f.t - frames[cIdx].t < 0.8);
  let rebound = post.some((f) => Math.abs(f.ball.u) > 1.1 && f.ball.v < 0.3);
  for (let j = 1; j < post.length && !rebound; j++) {
    if (post[j].i - post[j - 1].i === 1 && post[j].ball.v < -0.35 && post[j - 1].ball.v < -0.35 && post[j].ball.v < post[j - 1].ball.v) rebound = true;
  }
  const contactU = frames[cIdx].ball.u;
  const evidence = { net: Math.round(netRatio * 10) / 10, netLow: Math.round(loRatio * 10) / 10, rebound, contactU: Math.round(contactU * 100) / 100 };
  if (typeof window !== 'undefined' && window.__rimTrace) evidence.trace = frames.slice(cIdx, cIdx + 24).map((f) => (f.ball ? [Math.round(f.t * 100) / 100, Math.round(f.ball.u * 100) / 100, Math.round(f.ball.v * 100) / 100, f.ball.n] : [Math.round(f.t * 100) / 100]));
  if (netRatio >= MADE_NET && loRatio >= MADE_NET_LOW && !rebound && Math.abs(contactU) < 0.7) {
    const confidence = Math.min(0.99, 0.6 + (Math.min(netRatio, loRatio) - MADE_NET) / 50);
    return { outcome: 'made', confidence: Math.round(confidence * 100) / 100, evidence };
  }
  // A CLEAR REBOUND IS A MISS: after the contact fix, none of the 26 makes
  // bounced back up or out above the rim, and the rim-out miss did. One miss is
  // thin evidence, so it is called at a lower confidence and shown for checking.
  if (rebound) return { outcome: 'missed', confidence: 0.6, evidence };
  return { outcome: 'unsure', confidence: 0, evidence };
}

// Read the frames around every shot and decide each one.
// releasesMs: each shot's release time in the clip. rim: { l, r, y } in video px.
export async function judgeShots(src, rim, releasesMs, { onProgress, shouldStop, stats } = {}) {
  const v = document.createElement('video');
  v.src = src; v.muted = true; v.playsInline = true; v.preload = 'auto';
  v.style.cssText = 'position:fixed;left:-9999px;top:0;width:2px;height:2px;opacity:0;pointer-events:none';
  document.body.appendChild(v);
  const cv = document.createElement('canvas'); cv.width = S; cv.height = S;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  try {
    await new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error('Timed out reading that video.')), 45000);
      v.onloadedmetadata = () => { clearTimeout(t); res(); };
      v.onerror = () => { clearTimeout(t); rej(new Error('Could not read that video.')); };
    });
    const dur = v.duration;
    const rimW = Math.max(4, rim.r - rim.l), cx = (rim.l + rim.r) / 2, cy = rim.y;
    const side = 4 * rimW, sx0 = cx - side / 2, sy0 = cy - side / 2;
    const k = S / side;                         // source px -> crop px
    const rcx = (cx - sx0) * k, rcy = (cy - sy0) * k, rw = rimW * k;
    const box = (u0, u1, v0, v1) => [Math.max(0, Math.round(rcx + u0 * rw)), Math.min(S, Math.round(rcx + u1 * rw)), Math.max(0, Math.round(rcy + v0 * rw)), Math.min(S, Math.round(rcy + v1 * rw))];
    const NET = box(-0.45, 0.45, 0.12, 1.0), LO = box(-0.45, 0.45, 0.5, 1.0);
    // A SEEK THAT DID NOT LAND IS A FRAME NOT READ (29.9). The phone clips
    // carry a keyframe every ~4 s, so a seek can decode 250 frames first; the
    // old 700 ms fallback then drew the PREVIOUS frame - zero motion, a lower
    // baseline - and the same clip judged differently run to run (the miss read
    // MISSED once and UNSURE the next time). Now a seek gets 5 s, and one that
    // still has not landed leaves that frame out instead of reading it stale.
    const SEEK_MS = 5000;
    const seek = (t) => new Promise((res) => {
      const t0 = performance.now();
      let done = false; const fin = (ok) => { if (!done) { done = true; v.onseeked = null; const ms = performance.now() - t0; if (stats) { stats.seeks = (stats.seeks || 0) + 1; stats.maxMs = Math.max(stats.maxMs || 0, Math.round(ms)); if (ms > 700) stats.slow = (stats.slow || 0) + 1; if (!ok) stats.timeouts = (stats.timeouts || 0) + 1; } res(ok); } };
      v.onseeked = () => fin(true); setTimeout(() => fin(false), SEEK_MS);
      try { v.currentTime = Math.max(0.001, Math.min(dur - 0.001, t)); } catch { fin(false); }
    });
    const read = () => {
      ctx.clearRect(0, 0, S, S);
      ctx.drawImage(v, sx0, sy0, side, side, 0, 0, S, S);
      return ctx.getImageData(0, 0, S, S).data;
    };
    const out = [];
    // THREE SEEKS IN A ROW THAT NEVER LAND = this video cannot be read this way
    // (a stalled decoder, an unindexed recording). Stop and say so rather than
    // wait 5 s a frame for an hour (29.9 audit round 2).
    let missedInARow = 0;
    for (let si = 0; si < releasesMs.length; si++) {
      // quiet level: 1.0 -> 0.4 s before the release; the shot: release ->
      // +2.4 s (the ball reaches the rim 0.6-1.4 s after release). Both at the
      // same 30 fps, so motion is always measured between true neighbours.
      const r = releasesMs[si] / 1000;
      const times = [];
      for (let t = r - 1.0; t < r - 0.4; t += 1 / FPS) times.push(t);
      const releaseIdx = times.length;
      for (let t = r; t < r + 2.4; t += 1 / FPS) times.push(t);
      const frames = []; let prevGray = null;
      for (let i = 0; i < times.length; i++) {
        if (typeof shouldStop === 'function' && shouldStop()) { const e = new Error('stopped'); e.code = 'aborted'; throw e; }
        if (times[i] < 0 || times[i] > dur) { frames.push({ i, t: times[i], ball: null, net: null, netLo: null }); prevGray = null; continue; }
        if (!(await seek(times[i]))) {
          if (++missedInARow >= 3) { const e = new Error('Could not read the rim in this video.'); e.code = 'unreadable'; throw e; }
          frames.push({ i, t: times[i], ball: null, net: null, netLo: null }); prevGray = null; continue;
        }
        missedInARow = 0;
        const px = read();
        const gray = new Int16Array(S * S); const mask = new Uint8Array(S * S);
        for (let p = 0, q = 0; p < S * S; p++, q += 4) gray[p] = (px[q] * 299 + px[q + 1] * 587 + px[q + 2] * 114) / 1000;
        let net = null, netLo = null, ball = null;
        // compared only with the frame 1/30 s before it (not across the gap
        // between the quiet sample and the shot)
        const neighbour = prevGray && i > 0 && (times[i] - times[i - 1]) < 1.5 / FPS;
        if (neighbour) {
          const diff = (x0, x1, y0, y1) => { let s = 0, n = 0; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { s += Math.abs(gray[y * S + x] - prevGray[y * S + x]); n++; } return n ? s / n : 0; };
          net = diff(NET[0], NET[1], NET[2], NET[3]); netLo = diff(LO[0], LO[1], LO[2], LO[3]);
          for (let p = 0, q = 0; p < S * S; p++, q += 4) {
            if (Math.abs(gray[p] - prevGray[p]) > 14 && isOrange(px[q], px[q + 1], px[q + 2])) mask[p] = 1;
          }
          // a 3x3 dilation, as the prototype's
          const dil = new Uint8Array(S * S);
          for (let y = 1; y < S - 1; y++) for (let x = 1; x < S - 1; x++) {
            const p = y * S + x;
            if (mask[p] || mask[p - 1] || mask[p + 1] || mask[p - S] || mask[p + S] || mask[p - S - 1] || mask[p - S + 1] || mask[p + S - 1] || mask[p + S + 1]) dil[p] = 1;
          }
          const c = ballCandidate(dil, S, S);
          if (c) ball = { u: (c.x - rcx) / rw, v: (c.y - rcy) / rw, n: c.n };
        }
        frames.push({ i, t: times[i], ball, net, netLo });
        prevGray = gray;
      }
      out.push(decideShot(frames, releaseIdx));
      if (onProgress) onProgress(Math.round(((si + 1) / releasesMs.length) * 100));
    }
    return out;
  } finally {
    try { v.pause(); v.removeAttribute('src'); v.load(); v.remove(); } catch { /* noop */ }
  }
}
