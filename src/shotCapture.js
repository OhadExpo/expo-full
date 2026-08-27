// shotCapture.js — two-pass frame capture for the Shot Analyzer.
//
// Two things make a shooting clip different from a lifting clip:
//   1. The athlete is FAR away — maybe 15% of a 1080×1920 frame. Running pose
//      on the whole frame throws that resolution away; the wrist and elbow land
//      a couple of pixels apart and half the frames drop out.
//   2. A shot lasts ~1 s inside a 45 s clip, and there may be a dozen of them.
//
// So: find the athlete and the shot moments cheaply over the whole clip, then
// re-read ONLY those moments at full frame rate on a CROP around him.
//
// Both passes capture by PLAYING the video and reading frames through
// requestVideoFrameCallback, never by seeking: a seek on a 60 fps portrait
// phone clip costs 100–175 ms, which made a 45 s clip take four minutes.
// Playback at 0.25× presents every source frame with a ~66 ms detection budget,
// so the fine pass gets every frame of the shot at a fraction of the cost.
//
// Output frames match what the analyser expects:
//   [{ t(ms), landmarks (full-frame normalised), worldLandmarks (metric) }]
// plus frames.dims, frames.fps, frames.windows and frames.stats.
import { createPoseLandmarker } from './usePose';
import { toGray, motionBlobs } from './ballTrack.js';

const LM_HEAD = [0, 2, 5, 7, 8];
const LM_BODY = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];
const visOf = (p) => (p && (p.visibility == null ? 1 : p.visibility)) || 0;
const lerp = (a, b, u) => a + (b - a) * u;

// Subject = the pose closest to the last known subject, preferring the taller
// figure — a bystander on the baseline is smaller and further away.
function pickSubject(landmarks, prev) {
  if (!landmarks || !landmarks.length) return { idx: -1 };
  let best = null;
  for (let i = 0; i < landmarks.length; i++) {
    const lms = landmarks[i]; if (!lms) continue;
    let minX = 1, maxX = 0, minY = 1, maxY = 0, seen = 0, vsum = 0;
    for (const j of LM_BODY.concat(LM_HEAD)) {
      const p = lms[j]; if (!p) continue;
      const vv = visOf(p); if (vv < 0.3) continue;
      seen++; vsum += vv;
      if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
    }
    if (seen < 6) continue;
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    const h = maxY - minY;
    const near = prev ? Math.hypot(cx - prev.x, cy - prev.y) : 0;
    const score = h * 2 - near * 3 + (vsum / seen) * 0.5;
    if (!best || score > best.score) best = { idx: i, score, cx, cy, box: { x0: minX, y0: minY, x1: maxX, y1: maxY } };
  }
  return best ? { idx: best.idx, centroid: { x: best.cx, y: best.cy }, box: best.box } : { idx: -1 };
}

function boxAt(track, t) {
  if (!track.length) return null;
  if (t <= track[0].t) return track[0].box;
  if (t >= track[track.length - 1].t) return track[track.length - 1].box;
  let i = 0; while (i < track.length - 1 && track[i + 1].t < t) i++;
  const a = track[i], b = track[i + 1];
  const u = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);
  return { x0: lerp(a.box.x0, b.box.x0, u), y0: lerp(a.box.y0, b.box.y0, u), x1: lerp(a.box.x1, b.box.x1, u), y1: lerp(a.box.y1, b.box.y1, u) };
}

const seekTo = (v, time) => new Promise((res) => {
  let done = false;
  const fin = () => { if (!done) { done = true; res(); } };
  v.onseeked = fin; v.onerror = fin;
  setTimeout(fin, 600);
  try { v.currentTime = time; } catch { fin(); }
});

/**
 * Play [from,to] at `rate` and call onFrame(video, mediaTimeSeconds) once per
 * DISTINCT source frame. Resolves when `to` is reached or the video ends.
 * Falls back to a seek-step loop when requestVideoFrameCallback is missing.
 */
// `drops` (optional) counts frames thrown away because pose detection was still
// busy when the next one arrived.
//
// MEASURED, and the answer was not what I expected: on Ohad's 45 s clip this
// counter reads ZERO, while the capture still only analysed 741 frames — about
// 16 fps out of a 60 fps source. So the busy flag is NOT where the frames go.
// The browser simply presents fewer frames than 60 a second while MediaPipe is
// running, so requestVideoFrameCallback fires that much less often. The loss is
// upstream of us, exactly as the note at the top of this file always said.
//
// The counter stays because it is what proved that, and because if the balance
// ever tips — a faster machine, a lighter model — this is the first place the
// frames would start disappearing instead.
async function playThrough(v, { from, to, rate, onFrame, frameDur, drops, deterministic = false }) {
  await seekTo(v, Math.max(0, from));
  v.playbackRate = rate;
  // The seek-step path sees every frame no matter how loaded the machine is.
  // It is the fallback for browsers without requestVideoFrameCallback, and it
  // is also the only way to get a repeatable shot count - so callers can ask
  // for it deliberately.
  if (deterministic || typeof v.requestVideoFrameCallback !== 'function') {
    // Safari-old / unsupported: step by seeking (slow but correct).
    for (let t = from; t <= to; t += frameDur) { await seekTo(v, t); await onFrame(v, t); }
    return;
  }
  await new Promise((resolve) => {
    let last = -1, settled = false;
    const stop = () => { if (settled) return; settled = true; try { v.pause(); } catch { /* noop */ } resolve(); };
    let busy = false;
    const cb = async (_now, meta) => {
      if (settled) return;
      const mt = meta.mediaTime;
      if (mt > to + 0.001) { stop(); return; }
      // One callback per distinct source frame; skip re-presentations.
      const isNewFrame = mt > last + frameDur * 0.5;
      if (!busy && isNewFrame) {
        busy = true; last = mt;
        try { await onFrame(v, mt); } catch { /* noop */ }
        busy = false;
      } else if (busy && isNewFrame && drops) {
        // A genuinely new source frame arrived while pose detection was still
        // running, so it is discarded — not queued. This is the sole source of
        // run-to-run variation in the shot count.
        drops.skipped = (drops.skipped || 0) + 1;
        drops.lastSkipMs = Math.round(mt * 1000);
      }
      v.requestVideoFrameCallback(cb);
    };
    v.addEventListener('ended', stop, { once: true });
    v.play().then(() => v.requestVideoFrameCallback(cb)).catch(stop);
    // Hard stop: playback should take (to-from)/rate seconds; allow 4× slack.
    setTimeout(stop, Math.max(4000, ((to - from) / rate) * 1000 * 4));
  });
}

// True frame rate from presentation timestamps, snapped to a standard rate.
async function measureFps(v) {
  if (typeof v.requestVideoFrameCallback !== 'function') return null;
  return await new Promise((resolve) => {
    const times = []; let settled = false;
    const finish = () => {
      if (settled) return; settled = true; clearTimeout(to);
      try { v.pause(); } catch { /* noop */ }
      const raw = times.slice(1).map((t, i) => t - times[i]).filter((d) => d > 0.0008);
      const dts = (raw.length > 4 ? raw.slice(2) : raw).sort((a, b) => a - b);
      if (dts.length < 2) return resolve(null);
      const med = dts[Math.floor(dts.length / 2)];
      const fps = med > 0 ? 1 / med : 0;
      if (!(fps >= 10 && fps <= 300)) return resolve(null);
      const STD = [24, 25, 30, 48, 50, 60, 90, 120, 240];
      const near = STD.find((s) => Math.abs(fps - s) / s <= 0.06);
      resolve(near || fps);
    };
    const onFrame = (_n, meta) => {
      if (settled) return;
      times.push(meta.mediaTime);
      if (times.length >= 12 || (times.length >= 6 && meta.mediaTime > 0.6)) { finish(); return; }
      v.requestVideoFrameCallback(onFrame);
    };
    const to = setTimeout(finish, 2500);
    try { v.muted = true; v.currentTime = 0; } catch { /* noop */ }
    v.play().then(() => v.requestVideoFrameCallback(onFrame)).catch(() => resolve(null));
  });
}

/**
 * @param {string} src object URL / file URL
 * @param {{onProgress?:(pct:number,label?:string)=>void, maxFine?:number, fineRate?:number, deterministic?:boolean}} opts
 *
 * `deterministic` steps the clip frame by frame with seeks instead of reading
 * a playing video. SLOWER - a seek on a 60 fps portrait clip costs 100-175 ms,
 * which is why playback is the default - but it sees EVERY frame regardless of
 * machine load.
 *
 * That matters because the default path does not: the same 45 s clip analysed
 * three times on 2026-08-27 returned 11, 10 and 9 shots, because the browser
 * presents fewer frames while MediaPipe is running (~16 fps of a 60 fps source)
 * and a release that lands in a gap is simply never seen. Nothing downstream is
 * random; this is the only place the variance enters.
 *
 * Not wired to any UI yet - it is here so the speed/reliability trade can be
 * MEASURED before anyone decides. See docs/shot-analyzer-next-2026-08-27.md.
 */
export async function captureShotFrames(src, { onProgress, maxFine = 2600, fineRate = 0.34, deterministic = false } = {}) {
  let lmCoarse, lmFine, v, canvas;
  const report = (p, label) => { if (onProgress) onProgress(Math.max(0, Math.min(100, Math.round(p))), label); };
  try {
    // IMAGE mode: frames arrive out of a normal decode order (we seek between
    // windows), and VIDEO mode rejects those outright as timestamp mismatches.
    lmCoarse = await createPoseLandmarker({ runningMode: 'IMAGE', quality: 'lite', numPoses: 3 });
    v = document.createElement('video');
    v.src = src; v.muted = true; v.playsInline = true; v.preload = 'auto';
    v.style.cssText = 'position:fixed;left:-9999px;top:0;width:2px;height:2px;opacity:0;pointer-events:none';
    document.body.appendChild(v);
    await new Promise((res, rej) => {
      // A clip that neither loads nor errors (stalled range request, a codec the
      // browser silently refuses) left this await pending FOREVER: the offscreen
      // probe <video> stayed in the DOM holding the download, and — because the
      // auto-analysis sweep is strictly sequential — the entire remaining
      // backlog never ran again for the rest of the session, with nothing shown
      // anywhere. Bounded so a bad clip fails and the next one proceeds.
      const t = setTimeout(() => rej(new Error('Timed out reading that video.')), 45000);
      v.onloadedmetadata = () => { clearTimeout(t); res(); };
      v.onerror = () => { clearTimeout(t); rej(new Error('Could not read that video.')); };
    });
    let dur = v.duration;
    if (!isFinite(dur) || dur <= 0) {
      await new Promise((res) => { const d = () => { v.onseeked = null; res(); }; v.onseeked = d; setTimeout(d, 1500); try { v.currentTime = 1e7; } catch { d(); } });
      dur = v.duration; try { v.currentTime = 0; } catch { /* noop */ }
    }
    if (!isFinite(dur) || dur <= 0) throw new Error('Could not read that video (no duration).');
    const fps = (await measureFps(v)) || 30;
    try { v.pause(); v.currentTime = 0; } catch { /* noop */ }
    const frameDur = 1 / fps;
    const vw = v.videoWidth || 1080, vh = v.videoHeight || 1920;

    // ------------------------------------------------------------ pass 1 ---
    // Whole clip at playback speed, fast model, whole frame: where is he, and
    // when are his hands above his head.
    const t0 = performance.now();
    // Frames thrown away because pose detection was still busy. See the
    // note on playThrough: this is where run-to-run variance comes from.
    const drops = { skipped: 0, lastSkipMs: null };
    const track = [];
    const coarse = [];
    let prevC = null;
    await playThrough(v, {
      from: 0, to: dur, rate: 1, frameDur, drops, deterministic,
      onFrame: (vid, mt) => {
        let r = null;
        try { r = lmCoarse.detect(vid); } catch { /* noop */ }
        const sub = pickSubject(r?.landmarks, prevC);
        if (sub.idx >= 0) {
          prevC = sub.centroid;
          track.push({ t: mt, box: sub.box });
          coarse.push({ t: mt * 1000, landmarks: r.landmarks[sub.idx], worldLandmarks: r.worldLandmarks?.[sub.idx] || null, fine: false });
        }
        report((mt / dur) * 40, 'finding the athlete');
      },
    });
    const msCoarse = Math.round(performance.now() - t0);
    if (track.length < 6) throw new Error('I could not find a person in this clip. Film the whole body, side-on, in good light.');

    // Shot candidates: either wrist above the top of the head.
    const above = coarse.map((f) => {
      const l = f.landmarks; if (!l) return false;
      const head = Math.min(...LM_HEAD.map((j) => (l[j] ? l[j].y : 1)));
      const wr = Math.min(visOf(l[15]) > 0.3 ? l[15].y : 1, visOf(l[16]) > 0.3 ? l[16].y : 1);
      return wr < head;
    });
    const windows = [];
    for (let i = 0; i < coarse.length; i++) {
      if (!above[i]) continue;
      const startT = coarse[i].t;
      // Extend the run while the hands stay up, tolerating up to 200 ms of
      // dropped/blurred frames. (Tolerating a plain time GAP instead would
      // swallow the entire clip once the coarse pass samples densely — that is
      // how eleven shots collapsed into two windows.)
      let j = i, lastAboveT = coarse[i].t;
      while (j + 1 < coarse.length && (above[j + 1] || coarse[j + 1].t - lastAboveT < 200)) {
        j++; if (above[j]) lastAboveT = coarse[j].t;
      }
      // Reach back far enough to contain the dip (up to 1.4 s before release).
      const w = { from: Math.max(0, startT - 1500), to: Math.min(dur * 1000, lastAboveT + 900) };
      const last = windows[windows.length - 1];
      if (last && w.from <= last.to + 150) last.to = Math.max(last.to, w.to);
      else windows.push(w);
      i = j;
    }
    if (!windows.length) windows.push({ from: 0, to: dur * 1000 });

    // ------------------------------------------------------------ pass 2 ---
    // Each window, played slowly so every source frame gets a full detection,
    // cropped to the athlete so the model sees him big.
    canvas = document.createElement('canvas');
    const CROP = 512;
    canvas.width = CROP; canvas.height = CROP;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    // A SECOND, small canvas holding the WHOLE frame at a fixed scale, used only
    // to find the ball. It cannot share the pose crop: that crop follows the
    // athlete and so moves between frames, and frame-differencing a moving
    // window sees motion everywhere. This one never moves, so a difference
    // between consecutive frames is real movement in the scene.
    const MW = 270;
    const mCanvas = document.createElement('canvas');
    const MH = Math.max(1, Math.round(MW * vh / vw));
    mCanvas.width = MW; mCanvas.height = MH;
    const mctx = mCanvas.getContext('2d', { willReadFrequently: true });
    let prevGray = null, prevGrayT = -1e9;
    lmFine = await createPoseLandmarker({ runningMode: 'IMAGE', quality: 'full', numPoses: 1 });
    const fine = [];
    const totalMs = windows.reduce((a, w) => a + (w.to - w.from), 0) || 1;
    let doneMs = 0;
    for (const w of windows) {
      if (fine.length >= maxFine) break;
      await playThrough(v, {
        from: w.from / 1000, to: w.to / 1000, rate: fineRate, frameDur, drops, deterministic,
        onFrame: (vid, mt) => {
          if (fine.length >= maxFine) return;
          const b = boxAt(track, mt) || { x0: 0.2, y0: 0.1, x1: 0.8, y1: 0.9 };
          const bw = (b.x1 - b.x0) * vw, bh = (b.y1 - b.y0) * vh;
          const cxp = ((b.x0 + b.x1) / 2) * vw, cyp = ((b.y0 + b.y1) / 2) * vh;
          // Pad generously — the arms leave the body box at the top of the shot.
          let sideLen = Math.max(Math.max(bw, bh) * 1.9, 200);
          sideLen = Math.min(sideLen, Math.max(vw, vh));
          let sx = cxp - sideLen / 2, sy = cyp - sideLen / 2;
          sx = Math.max(-sideLen * 0.5, Math.min(vw - sideLen * 0.5, sx));
          sy = Math.max(-sideLen * 0.5, Math.min(vh - sideLen * 0.5, sy));
          ctx.clearRect(0, 0, CROP, CROP);
          ctx.drawImage(vid, sx, sy, sideLen, sideLen, 0, 0, CROP, CROP);
          let r = null;
          try { r = lmFine.detect(canvas); } catch { /* noop */ }
          const sub = pickSubject(r?.landmarks, null);
          if (sub.idx >= 0 && r.worldLandmarks?.[sub.idx]) {
            const mapped = r.landmarks[sub.idx].map((p) => (p ? { x: (sx + p.x * sideLen) / vw, y: (sy + p.y * sideLen) / vh, z: p.z, visibility: p.visibility } : p));
            // Candidate BALL positions: small round things that moved since the
            // previous frame, searched only above the athlete's waist because
            // that is the only place a released ball can be. Nothing is decided
            // here — a limb passes these tests too. Picking the ball out of the
            // candidates is trackBall's job, and it needs a whole flight to do
            // it. Purely additive: a frame with no candidates simply carries
            // none, and the launch angle is only computed when enough of them
            // describe a parabola that falls at gravity.
            let blobs = null;
            try {
              mctx.drawImage(vid, 0, 0, vw, vh, 0, 0, MW, MH);
              const g = toGray(mctx.getImageData(0, 0, MW, MH).data, MW, MH, 4);
              const tNow = mt * 1000;
              // Only difference against a frame that really is the one before —
              // across a window boundary the gap is huge and everything "moved".
              if (prevGray && tNow - prevGrayT > 0 && tNow - prevGrayT < 60) {
                const yCut = Math.min(MH, Math.round((b.y0 + (b.y1 - b.y0) * 0.5) * MH));
                // Reported in FRAME-HEIGHT fractions, the same isotropic unit the
                // analysis uses for every other distance, so nothing downstream
                // has to know the capture resolution.
                blobs = motionBlobs(prevGray, g, MW, MH, { x0: 0, y0: 0, x1: MW, y1: yCut })
                  .map((bb) => ({ x: bb.x / MH, y: bb.y / MH, w: bb.w / MH, h: bb.h / MH, n: bb.n }));
              }
              prevGray = g; prevGrayT = tNow;
            } catch { /* canvas read blocked — carry on without ball candidates */ }
            fine.push({ t: mt * 1000, landmarks: mapped, worldLandmarks: r.worldLandmarks[sub.idx], blobs, fine: true });
          }
          report(40 + ((doneMs + (mt * 1000 - w.from)) / totalMs) * 58, 'reading the shots');
        },
      });
      doneMs += w.to - w.from;
    }
    const msFine = Math.round(performance.now() - t0) - msCoarse;

    // Merge: fine frames win inside their windows, coarse fills the rest so the
    // timeline still covers the whole clip.
    const inWindow = (tMs) => windows.some((w) => tMs >= w.from - 1 && tMs <= w.to + 1);
    const merged = fine.concat(coarse.filter((f) => !inWindow(f.t)));
    merged.sort((a, b) => a.t - b.t);
    const out = [];
    for (const f of merged) { if (!out.length || f.t - out[out.length - 1].t > (frameDur * 1000) / 3) out.push(f); }
    out.dims = { w: vw, h: vh };
    out.windows = windows;
    out.fps = fps;
    // skipped: frames discarded mid-detection. skipRatio: how much of the
    // clip never reached the model. A high ratio means the shot COUNT is
    // unreliable, which no fps average will reveal - the fps figure is
    // computed from the frames that did arrive, so heavy skipping just
    // looks like a lower-frame-rate video.
    const seen = coarse.length + fine.length + drops.skipped;
    out.stats = { coarse: coarse.length, fine: fine.length, windows: windows.length, duration: dur, msCoarse, msFine,
                  skipped: drops.skipped, skipRatio: seen ? Math.round((drops.skipped / seen) * 100) / 100 : 0 };
    report(100, 'done');
    try { console.log('[shot-capture]', JSON.stringify(out.stats), 'out', out.length); } catch { /* noop */ }
    return out;
  } finally {
    if (lmCoarse) try { lmCoarse.close(); } catch { /* noop */ }
    if (lmFine) try { lmFine.close(); } catch { /* noop */ }
    if (v) try { v.pause(); v.removeAttribute('src'); v.load(); v.remove(); } catch { /* noop */ }
  }
}
