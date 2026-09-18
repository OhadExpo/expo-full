// clipPreflight.js — tell the athlete what is wrong with the FOOTAGE before
// spending five minutes proving it.
//
// Ohad, 18.9: "make all camera tools way better. we're just at the start of
// where this technology can get us."
//
// Today every framing problem is discovered at the END. captureShotFrames runs
// pose over the whole clip and then the analyser explains, three to six minutes
// later, that the release happened above the top edge and there is no launch
// angle in the footage at all (docs/ball-launch-diagnosis-2026-08-31.md, and
// scripts/verify-clip-usable.mjs which exists precisely because two sessions
// were spent on the tracker before anyone measured the clip). That is a wasted
// trip to the gym: by the time he knows, he is home.
//
// This reads TWELVE frames — a couple of seconds — and says the same things up
// front, in terms he can act on with the phone still in his hand.
//
// It is deliberately conservative. Every check here answers "is the thing we
// need to measure inside the picture at all", never "is the shot any good".
// A clip it passes may still analyse badly; a clip it fails cannot analyse
// well, because the evidence is not in the file.
import { createPoseLandmarker } from './usePose';

const LM_BODY = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];
const LM_HEAD = [0, 2, 5, 7, 8];
const visOf = (p) => (p && (p.visibility == null ? 1 : p.visibility)) || 0;

// The tallest well-seen figure in the frame. Same rule the capture pass uses to
// pick the subject: a bystander on the baseline is smaller and further away.
function tallestSubject(landmarks) {
  if (!landmarks || !landmarks.length) return null;
  let best = null;
  for (const lms of landmarks) {
    if (!lms) continue;
    let minX = 1, maxX = 0, minY = 1, maxY = 0, seen = 0;
    for (const j of LM_BODY.concat(LM_HEAD)) {
      const p = lms[j];
      if (!p || visOf(p) < 0.3) continue;
      seen++;
      if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
    }
    if (seen < 6) continue;
    const h = maxY - minY;
    if (!best || h > best.h) best = { h, top: minY, bottom: maxY, left: minX, right: maxX, lms };
  }
  return best;
}

// 'seeked' fires when the CURRENT TIME has moved, not when the new frame has
// been painted into the element. Drawing straight after it gives you the
// PREVIOUS frame, or a blank one on the first sample - which reads as "no one
// in this clip". Wait for the frame itself where the browser offers it.
function seekTo(v, t) {
  return new Promise((res) => {
    let done = false;
    const fin = () => { if (done) return; done = true; v.onseeked = null; res(); };
    const afterSeek = () => {
      v.onseeked = null;
      if (typeof v.requestVideoFrameCallback === 'function') {
        let settled = false;
        v.requestVideoFrameCallback(() => { if (!settled) { settled = true; fin(); } });
        setTimeout(() => { if (!settled) { settled = true; fin(); } }, 400);
      } else {
        requestAnimationFrame(() => requestAnimationFrame(fin));
      }
    };
    v.onseeked = afterSeek;
    setTimeout(fin, 1500);       // a seek that never lands must not hang the check
    try { v.currentTime = t; } catch { fin(); }
  });
}

/**
 * @param {string} src            object URL or path of the clip
 * @param {object} opts
 * @param {number} opts.samples   how many frames to look at (default 12)
 * @param {'shot'|'lift'} opts.kind  what the clip is for — a shooting clip needs
 *                                headroom above the athlete that a lifting clip
 *                                does not.
 * @returns {Promise<{ok:boolean, findings:Array, measured:object}>}
 */
export async function preflightClip(src, { samples = 12, kind = 'shot', onProgress } = {}) {
  const measured = { samples: 0, withBody: 0, medianBodyHeight: null, minHeadY: null, topClipped: 0, meanLuma: null, dims: null, durationS: null };
  const findings = [];
  let lm, v, canvas;
  try {
    lm = await createPoseLandmarker({ runningMode: 'IMAGE', quality: 'lite', numPoses: 3 });
    v = document.createElement('video');
    v.src = src; v.muted = true; v.playsInline = true; v.preload = 'auto';
    v.style.cssText = 'position:fixed;left:-9999px;top:0;width:2px;height:2px;opacity:0;pointer-events:none';
    document.body.appendChild(v);
    await new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error('Timed out reading that video.')), 20000);
      v.onloadedmetadata = () => { clearTimeout(t); res(); };
      v.onerror = () => { clearTimeout(t); rej(new Error('Could not read that video.')); };
    });
    const dur = isFinite(v.duration) && v.duration > 0 ? v.duration : null;
    measured.durationS = dur ? +dur.toFixed(1) : null;
    measured.dims = { w: v.videoWidth || 0, h: v.videoHeight || 0 };

    canvas = document.createElement('canvas');
    const W = Math.min(640, v.videoWidth || 640);
    const H = Math.round((v.videoHeight || 640) * (W / (v.videoWidth || 640)));
    canvas.width = W; canvas.height = H;
    const cx = canvas.getContext('2d', { willReadFrequently: true });

    const heights = [];
    let lumaSum = 0, lumaN = 0;
    for (let i = 0; i < samples; i++) {
      // Skip the first and last 5%: clips start and end with the phone moving.
      const u = 0.05 + (0.9 * i) / Math.max(1, samples - 1);
      if (dur) await seekTo(v, dur * u);
      cx.drawImage(v, 0, 0, W, H);
      measured.samples++;
      if (onProgress) onProgress(Math.round(((i + 1) / samples) * 100));

      // Brightness, from a coarse grid — a clip too dark for the eye is too
      // dark for the model.
      try {
        const d = cx.getImageData(0, 0, W, H).data;
        let s = 0, n = 0;
        for (let p = 0; p < d.length; p += 4 * 97) { s += 0.2126 * d[p] + 0.7152 * d[p + 1] + 0.0722 * d[p + 2]; n++; }
        if (n) { lumaSum += s / n; lumaN++; }
      } catch { /* tainted canvas — skip brightness, keep the rest */ }

      let res;
      try { res = lm.detect(canvas); } catch { res = null; }
      const subj = tallestSubject(res && res.landmarks);
      if (!subj) continue;
      measured.withBody++;
      heights.push(subj.h);
      const headY = (subj.lms[0] && visOf(subj.lms[0]) >= 0.3) ? subj.lms[0].y : subj.top;
      if (measured.minHeadY == null || headY < measured.minHeadY) measured.minHeadY = headY;
      if (subj.top <= 0.005) measured.topClipped++;
    }
    if (lumaN) measured.meanLuma = Math.round(lumaSum / lumaN);
    if (heights.length) {
      heights.sort((a, b) => a - b);
      measured.medianBodyHeight = +heights[Math.floor(heights.length / 2)].toFixed(3);
    }
    if (measured.minHeadY != null) measured.minHeadY = +measured.minHeadY.toFixed(3);
  } catch (e) {
    return { ok: true, skipped: true, error: e?.message || String(e), findings: [], measured };
  } finally {
    try { if (v) { v.pause(); v.removeAttribute('src'); v.load(); v.remove(); } } catch { /* noop */ }
    try { if (lm && lm.close) lm.close(); } catch { /* noop */ }
  }

  const seenRate = measured.samples ? measured.withBody / measured.samples : 0;

  const shortSide = measured.dims ? Math.min(measured.dims.w || 0, measured.dims.h || 0) : 0;

  if (measured.withBody === 0) {
    // "No one was detected" is almost never "the video is empty". Measured on
    // the ten-clip corpus: c06 is a 654x368 wide shot of five players who are
    // each about a sixth of the frame tall, and the model finds none of them.
    // Saying "no one is in this clip" about a clip with five people in it is
    // the kind of confident wrong answer that stops him trusting the tool.
    findings.push({ key: 'no-body', level: 'block',
      msg: shortSide && shortSide < 600
        ? `No one could be tracked. The clip is only ${measured.dims.w}x${measured.dims.h} and a player filmed from the sideline is too few pixels to measure. Film closer, portrait, from about the free-throw line.`
        : 'No one could be tracked in this clip. Either it is the wrong video, or the athlete is too far from the camera to measure - he should fill at least a third of the frame height.' });
    return { ok: false, findings, measured };
  }
  if (seenRate < 0.5) {
    findings.push({ key: 'rarely-seen', level: 'block',
      msg: `The athlete could only be tracked in ${Math.round(seenRate * 100)}% of the frames sampled`
        + (measured.medianBodyHeight != null && measured.medianBodyHeight < 0.35
          ? ` - he fills ${Math.round(measured.medianBodyHeight * 100)}% of the frame height, which is too far away to measure. Film closer.`
          : '. Keep him in frame, and keep the phone still.') });
  }
  // The one that matters most for shooting: the release is roughly half a
  // body-height above the head, so a head already near the top edge means the
  // ball leaves the hand outside the picture and NO tracker can recover the
  // launch — that is a property of the footage. Measured on clip02, where the
  // shooting wrist is at y = -0.016 to 0.038 at release.
  if (kind === 'shot' && measured.minHeadY != null && measured.medianBodyHeight != null) {
    const headroom = measured.minHeadY;                       // frames above the head
    const needed = measured.medianBodyHeight * 0.45;          // where the ball goes
    if (headroom < needed) {
      findings.push({ key: 'no-headroom', level: 'warn',
        msg: `The ball will leave the top of the frame. There is ${Math.round(headroom * 100)}% of the picture above his head and the release needs about ${Math.round(needed * 100)}%. Tilt the phone up or step back, and you will get a launch angle.` });
    }
  }
  if (measured.topClipped >= Math.max(2, Math.round(measured.withBody * 0.3))) {
    findings.push({ key: 'head-cut', level: 'warn',
      msg: 'His head is cut off at the top of the frame in several shots. Tilt the phone up.' });
  }
  if (measured.medianBodyHeight != null && measured.medianBodyHeight < 0.25) {
    findings.push({ key: 'too-far', level: 'warn',
      msg: `He fills only ${Math.round(measured.medianBodyHeight * 100)}% of the frame height. Move closer — under about 25% the joints land within a few pixels of each other and the angles get noisy.` });
  }
  if (shortSide && shortSide < 600) {
    findings.push({ key: 'low-res', level: 'warn',
      msg: `The clip is ${measured.dims.w}x${measured.dims.h}. Under about 720p the joints land within a couple of pixels of each other and every angle inherits that noise - film at the phone's normal quality.` });
  }
  if (measured.meanLuma != null && measured.meanLuma < 45) {
    findings.push({ key: 'too-dark', level: 'warn',
      msg: 'The clip is very dark. Pose detection drops frames in low light — film with the lights on or face the window.' });
  }

  return { ok: !findings.some((f) => f.level === 'block'), findings, measured };
}
