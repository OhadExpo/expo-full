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
import { createPoseLandmarker } from './usePose.js';
import { toGray, motionBlobs } from './ballTrack.js';
// Pure, DOM-free: only used to find the provisional releases for the opt-in
// ball pass (ballPass 'seek'), after the pose passes are complete.
import { buildSeries, detectShots, detectShootingHand, RELAXED_SHOT_GATES } from './shotAnalysis.js';

const LM_HEAD = [0, 2, 5, 7, 8];
const LM_BODY = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];
const visOf = (p) => (p && (p.visibility == null ? 1 : p.visibility)) || 0;
const lerp = (a, b, u) => a + (b - a) * u;

// Subject = the pose closest to the last known subject, preferring the taller
// figure — a bystander on the baseline is smaller and further away.
// `maxStep` is how far the subject's torso centroid may plausibly travel
// since the previous sample, in frame widths. Measured on clip02: the
// typical step is 0.0028 and the tracker was taking steps of 0.28-0.40 in a
// single 33ms frame - 145x the median, a third of the frame. No body moves
// like that; that is the tracker changing its mind about WHICH PLAYER it is
// following. Ohad: it must only follow the shooter, even when there are
// several players on the video.
//
// Candidates inside the step are preferred as a GROUP - the old score could
// always be out-bid by a nearer-to-camera bystander, because height was
// worth more than distance. If nothing is reachable we fall back to the
// full field, so a subject genuinely lost behind a screen is re-acquired
// rather than dropped for the rest of the clip.
function pickSubject(landmarks, prev, maxStep = Infinity) {
  if (!landmarks || !landmarks.length) return { idx: -1 };
  const cands = [];
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
    // A body touching the frame edge is cut off, and a body we cannot see whole
    // is not one we can measure a shot on. Without this the score preferred
    // whoever was LARGEST, which on real footage is whoever stands nearest the
    // camera - so the tracker locked onto a foreground team-mate and reported
    // no shots at all on a clip that plainly contains them.
    //
    // Deliberately a penalty rather than a hard reject: a shooter who steps
    // briefly over the edge should not vanish from his own clip mid-rep, he
    // should just lose to a fully visible alternative when one exists.
    const EDGE = 0.02;
    const clipped = (minX <= EDGE ? 1 : 0) + (maxX >= 1 - EDGE ? 1 : 0)
      + (minY <= EDGE ? 1 : 0) + (maxY >= 1 - EDGE ? 1 : 0);
    const cropPenalty = clipped * 0.35;
    const score = h * 2 - near * 3 + (vsum / seen) * 0.5 - cropPenalty;
    const reachable = !prev || near <= maxStep;
    cands.push({ idx: i, score, cx, cy, reachable, clipped, box: { x0: minX, y0: minY, x1: maxX, y1: maxY } });
  }
  if (!cands.length) return { idx: -1 };
  // Nothing reachable means the subject was not detected THIS frame. Falling
  // back to the whole field here is what produced the swap: measured on
  // clip02, frame 5 jumped to x=0.107 while frames 4 and 6 sat at x=0.49 -
  // one frame on a player at the far edge, because he was briefly the only
  // pose returned. Emitting nothing is honest and the hole-filling pass
  // re-seeks it; emitting a different body corrupts every measurement built
  // on the series. Re-acquisition is allowed only when the caller says the
  // subject has been gone long enough to be genuinely lost (maxStep=Infinity).
  const reach = cands.filter((c) => c.reachable);
  if (!reach.length && Number.isFinite(maxStep)) return { idx: -1, lost: true };
  let pool = reach.length ? reach : cands;
  // ACQUISITION: prefer a body we can see WHOLE.
  //
  // With no previous position the score is height-led, and height in frame
  // is proximity to the camera, not evidence of being the subject. Measured
  // on clip02 frame 0: a bystander on the near baseline, cut off by the left
  // edge, scored 2.011 against the shooter's 1.847 purely on size - and the
  // crop penalty could not close it, 0.35 per edge against a 0.54 height
  // advantage. Holding identity then made that first wrong pick sticky, and
  // a real shot released at 0.70s went uncounted.
  //
  // Only at acquisition. Once locked, the step limit decides, so a shooter
  // who briefly clips the edge mid-rep is not handed to a bystander.
  if (!prev) {
    const whole = pool.filter((c) => !c.clipped);
    if (whole.length) pool = whole;
  }
  let best = null;
  for (const c of pool) if (!best || c.score > best.score) best = c;
  return best ? { idx: best.idx, centroid: { x: best.cx, y: best.cy }, box: best.box, jumped: !best.reachable } : { idx: -1 };
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

// WAIT FOR THE CLIP TO BE IN MEMORY BEFORE MEASURING ANYTHING.
//
// This is why the shot count moved between runs on the SAME video - 17, then
// 7, then whatever the machine felt like. Nothing ever waited for the file:
// preload='auto' was set and the coarse pass started as soon as metadata
// arrived, so playback raced the download. A decode stall costs frames
// silently - requestVideoFrameCallback simply fires fewer times, skipRatio
// stays 0 because nothing was RE-presented, and a rep that happened during
// the stall is never bracketed. Warm cache: 17. Cold cache: 7.
//
// A shot count that changes when you press the button twice is worse than no
// shot count, so the download is finished first and the pass runs against
// memory. The timeout is a floor, not a target: a clip that will not buffer
// still gets analysed, just with the old risk.
//
// PHONES: a phone's media stack keeps a much smaller buffer than a desktop's,
// so on a long or high-bitrate clip `buffered` may simply never reach the end -
// the old loop then sat out its full 90 s with the bar frozen near 12%. When the
// covered span stops growing for 8 s of active time the browser is not going to
// buffer more, and waiting longer buys nothing.
const awaitBuffered = (v, { timeoutMs = 90000, stallMs = 8000, onTick, clock = () => performance.now(), signal } = {}) => new Promise((res) => {
  const t0 = clock();
  let best = -1, grewAt = t0;
  const tick = () => {
    if (signal?.aborted) return res({ ok: false, aborted: true });
    const d = v.duration;
    let covered = 0;
    try {
      for (let i = 0; i < v.buffered.length; i++) covered += v.buffered.end(i) - v.buffered.start(i);
    } catch { /* buffered can throw while the element is settling */ }
    if (covered > best + 0.05) { best = covered; grewAt = clock(); }
    if (onTick && Number.isFinite(d) && d > 0) onTick(Math.min(1, covered / d));
    if (Number.isFinite(d) && d > 0 && covered >= d - 0.3) return res({ ok: true, covered });
    if (clock() - grewAt > stallMs) return res({ ok: false, covered, plateau: true });
    if (clock() - t0 > timeoutMs) return res({ ok: false, covered });
    setTimeout(tick, 150);
  };
  tick();
});

// ------------------------------------------------------------------------
// PHONE ROBUSTNESS (27.9, Ohad: "the shot analyzer always gets stuck on 40%",
// then again after the dropped-frame budget shipped). A phone breaks the
// assumptions a desktop never tests: the screen locks four minutes into a
// five-minute capture, the page is hidden, the browser stops presenting video
// frames, play() is refused, a seek never lands, the GPU model never finishes
// loading. Every await below is bounded, and every wait that is really a
// phone being away does not count against a budget.
// ------------------------------------------------------------------------

// An Error the screen can translate: `code` keys T.errors in shotI18n.
export const codeErr = (code, msg) => { const e = new Error(msg || code); e.code = code; return e; };
const abortErr = () => codeErr('aborted', 'Stopped.');
const hasDoc = typeof document !== 'undefined';

// Hidden time is not work time. A phone that locks its screen freezes the
// page: timers stall, playback pauses, nothing is presented. Budgets and stall
// detectors run on ACTIVE time, and the work waits for the page to come back
// instead of timing out against a clock that kept running while he was away.
export function visibilityClock() {
  const now = () => performance.now();
  let hiddenTotal = 0;
  let hiddenAt = hasDoc && document.hidden ? now() : null;
  const waiters = new Set();     // one-shot: whenVisible()
  const listeners = new Set();   // persistent: onVisible()
  const onVis = () => {
    if (document.hidden) { if (hiddenAt == null) hiddenAt = now(); return; }
    if (hiddenAt != null) { hiddenTotal += now() - hiddenAt; hiddenAt = null; }
    const ws = [...waiters]; waiters.clear();
    for (const w of ws) w();
    for (const l of [...listeners]) { try { l(); } catch { /* noop */ } }
  };
  if (hasDoc) document.addEventListener('visibilitychange', onVis);
  return {
    hidden: () => hasDoc && !!document.hidden,
    activeNow: () => now() - hiddenTotal - (hiddenAt != null ? now() - hiddenAt : 0),
    whenVisible: (signal) => (!hasDoc || !document.hidden || signal?.aborted)
      ? Promise.resolve()
      : new Promise((res) => { waiters.add(res); signal?.addEventListener('abort', res, { once: true }); }),
    onVisible: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    dispose: () => {
      if (hasDoc) document.removeEventListener('visibilitychange', onVis);
      const ws = [...waiters]; waiters.clear(); listeners.clear();
      for (const w of ws) w();
    },
  };
}

// A promise with a deadline measured on `clock` (active time by default), that
// also gives up on abort. `onLate` receives a value that arrives after the
// deadline, so a model that finally loads can still be closed instead of leaked.
export function withDeadline(p, ms, err, { clock = () => performance.now(), signal, onLate } = {}) {
  return new Promise((res, rej) => {
    let done = false;
    const t0 = clock();
    const end = (fn, v) => { if (done) return false; done = true; clearInterval(iv); signal?.removeEventListener('abort', onAbort); fn(v); return true; };
    const onAbort = () => end(rej, abortErr());
    const iv = setInterval(() => { if (clock() - t0 > ms) end(rej, err); }, 250);
    signal?.addEventListener('abort', onAbort, { once: true });
    Promise.resolve(p).then((v) => { if (!end(res, v) && onLate) onLate(v); }, (e) => end(rej, e));
  });
}

// Resolves true when the seek LANDED and false when it did not (timeout or
// error) - a read after a seek that never landed is the previous frame under a
// new timestamp, which is worse than no frame.
//
// 'seeked' means currentTime moved, not that the new frame is what a read now
// returns (see clipPreflight.js: drawing straight after it gave the previous
// frame, or a blank one). Where the browser offers it, wait for the frame
// itself - briefly, because a seek to the frame already shown presents nothing.
//
// A phone that presents NO frames (the case the seek fallback exists for) also
// presents none after a seek, and waiting 250 ms on every step would add minutes.
// Three misses in a row on one element and it stops waiting for that element.
const seekFrameMisses = new WeakMap();
export const seekTo = (v, time, ms = 600) => new Promise((res) => {
  let done = false, landed = false;
  const fin = (ok) => { if (done) return; done = true; v.onseeked = null; res(ok); };
  v.onseeked = () => {
    landed = true;
    const misses = seekFrameMisses.get(v) || 0;
    if (typeof v.requestVideoFrameCallback === 'function' && misses < 3) {
      let got = false;
      try { v.requestVideoFrameCallback(() => { got = true; seekFrameMisses.set(v, 0); fin(true); }); } catch { fin(true); }
      setTimeout(() => { if (!got && !done) seekFrameMisses.set(v, misses + 1); fin(true); }, 250);
    } else fin(true);
  };
  v.onerror = () => fin(false);
  setTimeout(() => { if (!landed) fin(false); }, ms);
  try { v.currentTime = time; } catch { fin(false); }
});

// Read [from,to] by SEEKING, one frame every `step` seconds. Slower than
// playback but it depends on nothing the phone can withhold: no play(), no
// presented frames, no user gesture. It is the deterministic mode, the path for
// browsers without requestVideoFrameCallback, and the fallback when playback
// stalls. Waits (does not fail) while the page is hidden; fails LOUDLY when the
// phone cannot seek this file at all, instead of reading stale frames forever.
export async function stepThrough(v, { from, to, step, onFrame, run }) {
  if (run.stepRegions) run.stepRegions.push({ from, to, step });
  const SEEK_MIN = run.seekMs || 600, SEEK_MAX = run.seekMaxMs || 3000;
  let misses = 0, seekMs = SEEK_MIN;
  for (let t = from; t <= to + 1e-6; t += step) {
    if (run.signal?.aborted) throw abortErr();
    await run.vis.whenVisible(run.signal);
    if (run.signal?.aborted) throw abortErr();
    const ok = await seekTo(v, t, seekMs);
    if (v.error) throw codeErr('decode', 'The phone stopped decoding this video.');
    if (!ok) {
      misses++;
      // A 60 fps HEVC seek on a phone can simply be slow - give it longer
      // before calling it lost, and only give up on a run of them.
      seekMs = Math.min(SEEK_MAX, seekMs * 1.5);
      if (misses >= 12) throw codeErr('seek', 'The phone could not step through this video.');
      continue;
    }
    misses = 0; seekMs = Math.max(SEEK_MIN, seekMs * 0.9);
    if (run.stats) run.stats.steppedFrames = (run.stats.steppedFrames || 0) + 1;
    try { await onFrame(v, t); } catch (e) { if (e && e.code === 'aborted') throw e; }
  }
}

// ------------------------------------------------------------------------
// THE DETERMINISTIC BALL PASS (opt-in: ballPass 'seek').
//
// The shot COUNT is repeatable now; the launch ANGLE is not. Measured on
// 2026-09-01, three runs of his 11-shot clip: 11 / 11 / 11 shots, and 0 / 10 /
// 10 angles. The release is found from the pose - wrist apex plus elbow
// extension - and lands within 0-3 frames of the truth on every run. The ball
// is found somewhere else entirely: motion blobs collected DURING the fine pass,
// off a PLAYING video, which the browser presents at whatever rate MediaPipe
// leaves it. A frame that is not presented is a frame with no ball candidate,
// and a blob is only computed when the previous frame is under 60 ms old - so
// one dropped frame costs two frames of ball. Which frames go missing changes
// every run, and trackBall needs six dense frames in a row to call it a flight.
//
// Seek-stepping the WHOLE fine pass was measured and rejected (9 of 17 shots,
// 3x slower). This is far narrower: once the releases are known, read only
// release-100 ms to release+1500 ms of each shot, by seeking, one source frame
// at a time, and difference consecutive frames exactly as the fine pass does.
// That is ~100 seeks a shot instead of ~2,700 for a clip, and the frames it
// reads do not depend on how busy the machine was.
//
// Nothing about the pose changes - the shot count cannot move. Only the ball
// candidates for a shot whose span was read cleanly are replaced; every other
// shot keeps the playback candidates it had. trackBall and launchAngle run
// unchanged, with every gate they already have.
//
// Never throws except for STOP: a seek that does not land, a canvas that cannot
// be read or a shot that takes too long marks THAT span as not read, and the
// analysis falls back to the playback candidates for it.
//
// Exported, and handed `readGray` instead of a canvas, so the control flow can
// be driven from node with a fake video (scripts/verify-shot-phone-stall.mjs).
//
//   releases   release times in ms (the provisional ones; see captureShotFrames)
//   readGray   (video) => Uint8Array luma plane of mw x mh, the SAME fixed
//              whole-frame canvas the fine pass differences
//   cutFor     (tSec) => pixel row the search stops at (the athlete's waist)
export async function seekBallPass(v, {
  releases, frameDur, duration = Infinity, readGray, mw, mh, cutFor = () => mh, run,
  preMs = 100, postMs = 1500, maxFps = 60, maxFramesPerShot = 120,
  shotBudgetMs = 20000, totalBudgetMs = 600000, minCover = 0.8, onProgress,
}) {
  const clock = () => run.vis.activeNow();
  const t0 = clock();
  // "At the clip's real fps, capped": a 120 / 240 fps clip is read at 60, which
  // still differences frames 17 ms apart - far inside the 60 ms gate.
  const stride = Math.max(1, Math.round((1 / maxFps) / frameDur));
  const frames = [], spans = [];
  const why = {};
  const fail = (span, w) => { span.why = w; why[w] = (why[w] || 0) + 1; };
  for (let si = 0; si < (releases || []).length; si++) {
    const rel = releases[si];
    if (run.signal?.aborted) throw abortErr();
    // From the release minus a little - the provisional release can sit a frame
    // or two off the final one - to well past the 700 ms the score reads, so a
    // re-score with a different hand or shot type still lands inside the span.
    const kFrom = Math.max(0, Math.ceil((rel - preMs) / 1000 / frameDur));
    let kTo = Math.floor((rel + postMs) / 1000 / frameDur);
    if (Number.isFinite(duration)) kTo = Math.min(kTo, Math.floor((duration - frameDur * 0.5) / frameDur));
    const ks = [];
    for (let k = kFrom; k <= kTo && ks.length < maxFramesPerShot; k += stride) ks.push(k);
    const span = { releaseMs: Math.round(rel), from: null, to: null, planned: ks.length, read: 0, ok: false, why: null };
    spans.push(span);
    if (!ks.length) { fail(span, 'empty'); continue; }
    if (clock() - t0 > totalBudgetMs) { fail(span, 'budget'); continue; }
    const got = [];
    let cancelled = false;
    const work = (async () => {
      let prevG = null, prevT = -1e9, misses = 0;
      const SEEK_MIN = run.seekMs || 600, SEEK_MAX = run.seekMaxMs || 3000;
      let seekMs = SEEK_MIN;
      for (const k of ks) {
        if (cancelled) return 'deadline';
        if (run.signal?.aborted) throw abortErr();
        await run.vis.whenVisible(run.signal);
        if (run.signal?.aborted) throw abortErr();
        if (cancelled) return 'deadline';
        // The MIDDLE of the frame, not its start. A seek to exactly k/fps sits on
        // the boundary between two frames, and float rounding then hands back
        // the previous frame now and then - a duplicate (zero difference, no
        // ball) followed by a skip (a 2-frame difference). That is the very
        // irregularity this pass exists to remove. The sample is still recorded
        // at k/fps, the same clock the playback frames carry.
        const landed = await seekTo(v, (k + 0.5) * frameDur, seekMs);
        if (v.error) return 'decode';
        if (!landed) {
          // A frame that did not land must not be differenced against.
          prevG = null;
          seekMs = Math.min(SEEK_MAX, seekMs * 1.5);
          if (++misses >= 6) return 'seek';
          continue;
        }
        misses = 0; seekMs = Math.max(SEEK_MIN, seekMs * 0.9);
        let g = null;
        try { g = readGray(v); } catch { return 'read'; }
        if (!g) return 'read';
        const tMs = k * frameDur * 1000;
        let blobs = null;
        // Same rule as the fine pass: only difference against the frame that
        // really is the one before.
        if (prevG && tMs - prevT > 0 && tMs - prevT < 60) {
          const yCut = Math.max(1, Math.min(mh, Math.round(cutFor(tMs / 1000))));
          blobs = motionBlobs(prevG, g, mw, mh, { x0: 0, y0: 0, x1: mw, y1: yCut })
            .map((bb) => ({ x: bb.x / mh, y: bb.y / mh, w: bb.w / mh, h: bb.h / mh, n: bb.n }));
        }
        prevG = g; prevT = tMs;
        got.push({ t: tMs, blobs });
        if (onProgress) { try { onProgress((si + got.length / ks.length) / releases.length); } catch { /* noop */ } }
      }
      return null;
    })();
    let res;
    try {
      res = await withDeadline(work, shotBudgetMs, codeErr('ballPass', 'ball pass over budget'), { clock, signal: run.signal });
    } catch (e) {
      cancelled = true;
      if (e && e.code === 'aborted') throw e;
      if (e && e.code === 'ballPass') {
        // Over budget: stop the loop and WAIT for it to let go of the video
        // before the next span seeks it - each of its awaits is bounded.
        try { await work; } catch (e2) { if (e2 && e2.code === 'aborted') throw e2; }
        res = 'deadline';
      } else res = 'error';   // anything unexpected: this span falls back, the pass goes on
    }
    span.read = got.length;
    if (got.length) { span.from = Math.round(got[0].t); span.to = Math.round(got[got.length - 1].t); }
    if (res) { fail(span, res); continue; }
    // A span that was mostly seeks that never landed is not a deterministic
    // read; the playback candidates are the better evidence for that shot.
    if (got.length < ks.length * minCover) { fail(span, 'sparse'); continue; }
    span.ok = true;
    for (const f of got) frames.push(f);
  }
  frames.sort((a, b) => a.t - b.t);
  // Two releases closer than the span overlap; keep one sample per instant.
  const dedup = [];
  for (const f of frames) if (!dedup.length || f.t - dedup[dedup.length - 1].t > 0.5) dedup.push(f);
  return { frames: dedup, spans, stepMs: frameDur * 1000 * stride, ms: Math.round(clock() - t0), why };
}

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
// No NEW presented frame for this long, while the page is visible and no frame
// is being processed, means playback is not coming back on its own.
const STALL_MS = 8000;

// `run` carries the per-capture state the phone paths need:
//   vis          visibilityClock()      signal   AbortSignal (STOP)
//   mode         { stepOnly }           set once playback proved dead here,
//                                       so later windows skip the 16 s probe
//   stepRegions  where frames were read by seeking at a coarser step, so the
//                dropped-frame pass does not mistake the step for holes
//   stats        what happened, for the console line and the screen
//
// THE OLD HANG. The only exits were 'ended', mediaTime passing `to`, or a hard
// timer at FOUR TIMES the playback length - six minutes on a 45 s clip at 0.5x.
// Anything that stopped presentation on a phone (the screen dimming and
// locking, the browser pausing a hidden video, a decoder starving) left the bar
// frozen at the last frame's percentage for those six minutes: with the coarse
// pass that is the bar sitting on 40%. Now a stall is noticed in 8 s of ACTIVE
// time, playback is nudged once, and the rest of the range is read by seeking
// - progress keeps moving and nothing is silently cut off.
export async function playThrough(v, { from, to, rate, onFrame, frameDur, drops, deterministic = false, step, run }) {
  const stepFor = step || frameDur;
  // The seek-step path sees every frame no matter how loaded the machine is,
  // and it is the only way to get a repeatable shot count - so callers can ask
  // for it deliberately (at the source frame rate, exactly as before).
  if (deterministic) { await stepThrough(v, { from, to, step: frameDur, onFrame, run: { ...run, stepRegions: null } }); return; }
  if (typeof v.requestVideoFrameCallback !== 'function' || run.mode.stepOnly) {
    await stepThrough(v, { from, to, step: stepFor, onFrame, run });
    return;
  }
  await seekTo(v, Math.max(0, from));
  v.playbackRate = rate;
  const res = await new Promise((resolve) => {
    let last = -1, settled = false, busy = false, pending = false, frames = 0, nudged = false;
    let lastNewAt = run.vis.activeNow();
    const cleanup = [];
    const finish = (why) => {
      if (settled) return;
      settled = true;
      clearInterval(iv);
      for (const c of cleanup) { try { c(); } catch { /* noop */ } }
      try { v.pause(); } catch { /* noop */ }
      resolve({ why, last, frames });
    };
    const request = () => {
      if (settled || pending) return;
      pending = true;
      try { v.requestVideoFrameCallback(cb); } catch { pending = false; }
    };
    const cb = async (_now, meta) => {
      pending = false;
      if (settled) return;
      const mt = meta.mediaTime;
      if (mt > to + 0.001) { finish('done'); return; }
      // One callback per distinct source frame; skip re-presentations.
      const isNewFrame = mt > last + frameDur * 0.5;
      if (!busy && isNewFrame) {
        busy = true; last = mt; frames++;
        lastNewAt = run.vis.activeNow();
        try { await onFrame(v, mt); } catch (e) { if (e && e.code === 'aborted') { busy = false; finish('aborted'); return; } }
        busy = false;
        // A slow detection (a phone CPU, a first GPU shader compile) is work,
        // not a stall - the clock restarts when the frame is done.
        lastNewAt = run.vis.activeNow();
      } else if (busy && isNewFrame && drops) {
        // A genuinely new source frame arrived while pose detection was still
        // running, so it is discarded — not queued. This is the sole source of
        // run-to-run variation in the shot count.
        drops.skipped = (drops.skipped || 0) + 1;
        drops.lastSkipMs = Math.round(mt * 1000);
      }
      request();
    };
    const onEnded = () => finish('done');
    const onError = () => finish('error');
    v.addEventListener('ended', onEnded);
    v.addEventListener('error', onError);
    cleanup.push(() => v.removeEventListener('ended', onEnded), () => v.removeEventListener('error', onError));
    // Back from a locked screen / another app: the browser paused a hidden
    // video and does not always resume it. Resume, and re-arm the callback.
    cleanup.push(run.vis.onVisible(() => {
      if (settled) return;
      lastNewAt = run.vis.activeNow();
      if (v.paused && !v.ended) { try { v.play().catch(() => {}); } catch { /* noop */ } }
      request();
    }));
    if (run.signal) {
      const onAbort = () => finish('aborted');
      run.signal.addEventListener('abort', onAbort, { once: true });
      cleanup.push(() => run.signal.removeEventListener('abort', onAbort));
    }
    const iv = setInterval(() => {
      if (settled) return;
      if (run.signal?.aborted) { finish('aborted'); return; }
      if (v.error) { finish('error'); return; }
      if (busy) return;
      const quiet = run.vis.activeNow() - lastNewAt;
      if (quiet < (run.stallMs || STALL_MS)) return;
      // Already at the end and 'ended' simply never came: that is done.
      if (v.ended || v.currentTime >= to - frameDur) { finish('done'); return; }
      if (!nudged) {
        nudged = true;
        lastNewAt = run.vis.activeNow();
        try { v.play().catch(() => {}); } catch { /* noop */ }
        request();
        return;
      }
      finish('stalled');
    }, 500);
    // Arm the callback BEFORE play() settles: a play() promise that stays
    // pending while a phone loads the file must not also hold back the frames.
    request();
    let p;
    try { p = v.play(); } catch (e) { p = Promise.reject(e); }
    Promise.resolve(p).catch((e) => {
      const name = e && e.name;
      // Muted playback without a gesture is refused on some phones (iOS Low
      // Power Mode, battery savers). Seeking needs no gesture - read by seeking.
      if (name === 'NotAllowedError') { run.stats.blocked = true; finish('blocked'); }
      else if (name === 'NotSupportedError') finish('error');
      else if (name !== 'AbortError') finish('stalled');
    });
  });
  if (res.why === 'aborted') throw abortErr();
  if (res.why === 'error') throw codeErr('decode', 'The phone stopped decoding this video.');
  // 'done' is only done if the frames reached the end. A video can PLAY to its
  // end while presenting nothing (a phone that does not composite an
  // off-screen video) - 'ended' fires, zero frames were read, and the pass
  // used to call that finished: "I could not find a person" about a clip full
  // of him. The same applies to a tail the browser skipped. On a healthy pass
  // the last frame sits within a frame or two of `to`, so this never fires.
  const tailTol = Math.max(0.25, 4 * frameDur);
  const tailMissing = res.frames === 0 || to - res.last > tailTol;
  if (res.why === 'done' && !tailMissing) return;
  // 'stalled', 'blocked', or a 'done' with its tail missing: read the rest by
  // seeking, from the frame after the last one that arrived. Playback that
  // never presented a single frame is dead on this phone - later windows go
  // straight to seeking.
  if (res.why === 'done') run.stats.tails = (run.stats.tails || 0) + 1;
  else run.stats.stalls = (run.stats.stalls || 0) + 1;
  if (res.frames === 0) run.mode.stepOnly = true;
  const resume = res.last >= 0 ? res.last + stepFor : from;
  if (resume <= to + 1e-6) await stepThrough(v, { from: resume, to, step: stepFor, onFrame, run });
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
    // finish(), not resolve(): a refused play() used to leave the 2.5 s timer
    // armed, and its v.pause() then landed inside the coarse pass.
    let p;
    try { p = v.play(); } catch (e) { p = Promise.reject(e); }
    Promise.resolve(p).then(() => v.requestVideoFrameCallback(onFrame)).catch(() => finish());
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
 *
 * `ballPass` 'seek' (default OFF) re-reads the ball for each shot by seeking,
 * after the releases are known - see seekBallPass above. Also reachable without
 * a code change with localStorage 'expo-shot-ball' = 'seek', the same way the
 * heavy fine model is. Any other value, or null with no stored choice, is the
 * old behaviour exactly.
 */
// `signal` (AbortSignal): STOP on the screen. The capture used to run on after
// STOP with nobody listening, so the NEXT analysis shared the phone's CPU with
// a ghost of the last one - and stalled for real.
export async function captureShotFrames(src, { onProgress, maxFine = 2600, fineRate = 0.34, coarseRate = 0.5, deterministic = false, ballPass = null, signal } = {}) {
  // Three settings, because measurement showed the two passes do not deserve
  // the same treatment. Three default-path captures on an IDLE machine returned
  // 11, 8 and 11 shots, and the per-run stats pinned the loss precisely:
  //
  //   coarse 727 frames -> 8 windows -> 11 shots
  //   coarse 500 frames -> 5 windows ->  8 shots
  //   coarse 698 frames -> 8 windows -> 11 shots
  //
  // The coarse pass brackets the reps; the fine pass only refines brackets that
  // already exist, so it can never recover a rep the coarse pass never saw. The
  // count is decided entirely by the coarse pass - which means 'coarse' buys the
  // reliability where it matters and leaves the expensive fine pass on the fast
  // path.
  //   false      both passes on playback (default, unchanged)
  //   'coarse'   coarse seek-stepped, fine on playback
  //   true       both seek-stepped (slowest, byte-identical between runs)
  const detCoarse = deterministic === true || deterministic === 'coarse';
  const detFine = deterministic === true;
  const ballSeek = ballPass === 'seek' || (ballPass == null && (() => {
    try { return typeof localStorage !== 'undefined' && localStorage.getItem('expo-shot-ball') === 'seek'; } catch { return false; }
  })());
  // The fine pass owns 50-98% of the bar, unless the ball pass needs a share.
  const fineSpan = ballSeek ? 30 : 48;
  let lmCoarse, lmFine, v, canvas;
  const report = (p, label) => { if (onProgress) onProgress(Math.max(0, Math.min(100, Math.round(p))), label); };
  const vis = visibilityClock();
  const clock = () => vis.activeNow();
  const run = { vis, signal, mode: { stepOnly: false }, stepRegions: [], stats: { stalls: 0, blocked: false, fineModel: 'full' } };
  const checkAbort = () => { if (signal?.aborted) throw abortErr(); };
  // A model that never finishes loading (a slow connection, a GPU delegate that
  // hangs instead of throwing on some phones) used to be an endless wait.
  const loadModel = (opts, ms) => withDeadline(createPoseLandmarker(opts), ms,
    codeErr('model', 'The body-tracking model did not load.'),
    { clock, signal, onLate: (lm) => { try { lm.close(); } catch { /* noop */ } } });
  // detect() that throws on every frame (a WebGL context the phone took back
  // under memory pressure, a GPU the delegate cannot drive) was swallowed per
  // frame and surfaced as "I could not find a person" - a confident wrong
  // answer. Counted, the model is rebuilt ONCE, and a model that never
  // produced a single result is reported as the model, not the clip.
  const health = { ok: 0, err: 0, consec: 0, lastErr: null, rebuilt: false };
  const detect = (lm, input) => {
    try { const r = lm.detect(input); health.ok++; health.consec = 0; return r; }
    catch (e) { health.err++; health.consec++; health.lastErr = e; return null; }
  };
  const maybeRebuild = async () => {
    if (health.consec < 10 || health.rebuilt) return;
    health.rebuilt = true; health.consec = 0;
    try { lmCoarse.close(); } catch { /* noop */ }
    lmCoarse = await loadModel({ runningMode: 'IMAGE', quality: 'lite', numPoses: 3 }, 45000);
  };
  try {
    // IMAGE mode: frames arrive out of a normal decode order (we seek between
    // windows), and VIDEO mode rejects those outright as timestamp mismatches.
    report(0, 'loading the model');
    lmCoarse = await loadModel({ runningMode: 'IMAGE', quality: 'lite', numPoses: 3 }, 90000);
    checkAbort();
    v = document.createElement('video');
    // Muted AND inline as ATTRIBUTES too: the muted property alone does not
    // reflect, and some mobile autoplay checks read the attribute.
    v.muted = true; v.defaultMuted = true; v.setAttribute('muted', ''); v.setAttribute('playsinline', '');
    v.src = src; v.playsInline = true; v.preload = 'auto';
    v.style.cssText = 'position:fixed;left:-9999px;top:0;width:2px;height:2px;opacity:0;pointer-events:none';
    document.body.appendChild(v);
    await new Promise((res, rej) => {
      // A clip that neither loads nor errors (stalled range request, a codec the
      // browser silently refuses) left this await pending FOREVER: the offscreen
      // probe <video> stayed in the DOM holding the download, and — because the
      // auto-analysis sweep is strictly sequential — the entire remaining
      // backlog never ran again for the rest of the session, with nothing shown
      // anywhere. Bounded so a bad clip fails and the next one proceeds.
      const t = setTimeout(() => rej(codeErr('readTimeout', 'Timed out reading that video.')), 45000);
      v.onloadedmetadata = () => { clearTimeout(t); res(); };
      v.onerror = () => {
        clearTimeout(t);
        // MEDIA_ERR_SRC_NOT_SUPPORTED (4): the phone cannot play this format.
        rej(v.error && v.error.code === 4 ? codeErr('codec', 'This phone cannot play this video format.') : codeErr('read', 'Could not read that video.'));
      };
    });
    checkAbort();
    // A clip whose AUDIO decodes but whose VIDEO does not (HEVC / HDR from
    // another phone, on a phone without that decoder) still reaches metadata,
    // with a 0x0 picture. Nothing would ever be presented; every later stage
    // would wait on frames that cannot come. Say so now.
    if (!v.videoWidth) {
      await new Promise((res) => {
        const done = () => { v.removeEventListener('loadeddata', done); v.removeEventListener('resize', done); res(); };
        v.addEventListener('loadeddata', done); v.addEventListener('resize', done);
        setTimeout(done, 5000);
      });
      if (!v.videoWidth) throw codeErr('codec', 'This phone cannot play this video format.');
    }
    let dur = v.duration;
    if (!isFinite(dur) || dur <= 0) {
      // A MediaRecorder WebM carries no duration until the file is scanned to
      // its end; seeking far past it forces the scan. A phone's in-memory
      // recording can take longer than the old 1.5 s to scan - wait for the
      // duration itself, up to 8 s.
      await new Promise((res) => {
        let settled = false;
        const d = () => { if (settled) return; settled = true; v.onseeked = null; v.removeEventListener('durationchange', dc); res(); };
        const dc = () => { if (isFinite(v.duration) && v.duration > 0) d(); };
        v.onseeked = d; v.addEventListener('durationchange', dc);
        setTimeout(d, 8000);
        try { v.currentTime = 1e7; } catch { d(); }
      });
      dur = v.duration; try { v.currentTime = 0; } catch { /* noop */ }
    }
    if (!isFinite(dur) || dur <= 0) throw codeErr('noDuration', 'Could not read that video (no duration).');
    const fps = (await measureFps(v)) || 30;
    try { v.pause(); v.currentTime = 0; } catch { /* noop */ }
    const frameDur = 1 / fps;
    checkAbort();

    // The coarse pass decides the shot count, so it does not start until the
    // clip is in memory. See awaitBuffered above.
    const buf = await awaitBuffered(v, { onTick: (f) => report(f * 12, 'loading the clip'), clock, signal });
    checkAbort();
    if (!buf.ok) report(12, 'loading the clip');
    const vw = v.videoWidth || 1080, vh = v.videoHeight || 1920;
    // Where playback fails and the pass has to SEEK instead, reading every
    // source frame of a whole clip would be ~2,700 seeks on a 45 s 60 fps phone
    // clip. The coarse pass only has to see the hands above the head, which
    // lasts a few hundred ms - 15 reads a second is plenty. The fine pass keeps
    // up to 30 a second inside its windows.
    const coarseStep = frameDur * Math.max(1, Math.round((1 / 15) / frameDur));
    const fineStep = frameDur * Math.max(1, Math.round((1 / 30) / frameDur));

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
    // Paired with prevC so the reachable radius scales with the real gap
    // between samples: a 200ms recovery seek may legitimately move further
    // than a 33ms step, and a fixed radius would either leak swaps at the
    // long gaps or drop the subject at the short ones.
    let prevT = null;
    // Every accepted subject position, by time. The recovery pass below
    // re-seeks scattered holes, so the RUNNING prev is meaningless there -
    // consecutive holes can be seconds apart, the gate opens to Infinity and
    // it re-acquires whoever is largest. Those frames then sort back in
    // beside good ones, which is where the 0.44-of-a-frame steps between
    // adjacent 33ms samples came from. A hole is anchored to its nearest
    // neighbour IN TIME instead.
    const subjSeen = [];
    const nearestSeen = (t) => {
      let best = null;
      for (const e of subjSeen) {
        const d = Math.abs(e.t - t);
        if (!best || d < best.d) best = { d, c: e.c };
      }
      return best;
    };
    // Under 0.5s since the last accepted sample we hold identity and accept a
    // gap. Past that the subject is genuinely lost - he walked behind a
    // screen, the clip cut - and anything may be re-acquired.
    const REACQUIRE_S = 0.5;
    const stepFor = (t) => {
      if (prevC == null || prevT == null) return Infinity;
      const gap = Math.abs(t - prevT);
      return gap > REACQUIRE_S ? Infinity : Math.max(0.05, gap * 1.0);
    };
    await playThrough(v, {
      // coarseRate 0.5, MEASURED. The coarse pass used to run at 1, and the
      // frames it lost were not lost to our busy flag (that counter reads zero)
      // - the browser simply presents fewer frames while MediaPipe is running,
      // so requestVideoFrameCallback fires less often. Halving playback gives
      // the browser twice the wall-clock per source frame on the SAME decode
      // path, which is what seek-stepping got wrong (9 of 17 shots, 3x slower).
      //
      // Three runs of Ohad's 11-shot clip, each rate:
      //   rate 1    11/11/11 shots, but 0/10/10 launch ANGLES, 421s avg
      //   rate 0.5  11/11/11 shots and 10/10/10 angles,        357s avg
      // The detector was never the unstable part; the ball track was, and one
      // run in three produced no angle at all. It is also FASTER and far more
      // consistent in wall-clock (spread 10s vs 153s) - a cleaner coarse series
      // leaves the fine pass less to re-examine.
      // coarseRate 0.5, MEASURED on two clips, seven runs.
      //
      // The frames the coarse pass loses are not lost to our busy flag - that
      // counter reads zero. The browser presents fewer frames than the source
      // has while MediaPipe is running, so requestVideoFrameCallback fires less
      // often, and it fires a different number of times each run. Halving
      // playback gives the browser twice the wall clock per source frame on the
      // SAME decode path - which is what seek-stepping got wrong when it was
      // tried (9 of 17 shots, 3x slower).
      //
      //                       rate 1                    rate 0.5
      //   his 11-shot clip    11/11/11 shots            11/11/11 shots
      //   (3 runs)            angles 0/10/10            angles 10/10/10
      //   clip02 (4 runs)     5/5/5/6 shots             5/5/5/5 shots
      //
      // The detector was never the unstable part - the ball track was, and at
      // rate 1 one run in three produced no launch angle at all.
      //
      // A 2-run sample of clip02 first said 0.5 was WORSE (5 then 4). Four runs
      // say 0.5 is the stable one and rate 1 is the one that wanders. Two runs
      // is not a measurement here; the noise is the size of the effect.
      //
      // SLOWER IS NOT MONOTONICALLY BETTER - 0.5 is a sweet spot, not a
      // direction. A third independent 3-run sample of his clip reconfirmed 0.5
      // at 11/11/11 shots and 10/10/10 angles in 352s; 0.34 in the same session
      // gave 11/11/11 shots but only 9/9/10 angles, and took 381s. Do not
      // "improve" this by lowering it further without measuring.
      //
      // Deeper cause still open: shotAnalysis smooth() is medianFilter(sig, 5)
      // plus an EMA with a fixed alpha - both counted in SAMPLES, so their time
      // constant changes with capture density. Making them time-based would
      // make detection invariant to how many frames the browser hands us, which
      // is the disease this rate change only treats.
      from: 0, to: dur, rate: coarseRate, frameDur, drops, deterministic: detCoarse, step: coarseStep, run,
      onFrame: async (vid, mt) => {
        checkAbort();
        // Read the frame FIRST, synchronously, while it is the presented one;
        // only a failing streak pays for an await (the one-time rebuild).
        const r = detect(lmCoarse, vid);
        if (!r && health.consec >= 10 && !health.rebuilt) await maybeRebuild();
        const sub = pickSubject(r?.landmarks, prevC, stepFor(mt));
        if (sub.idx >= 0) {
          prevC = sub.centroid;
          prevT = mt;
          subjSeen.push({ t: mt, c: sub.centroid });
          track.push({ t: mt, box: sub.box });
          coarse.push({ t: mt * 1000, landmarks: r.landmarks[sub.idx], worldLandmarks: r.worldLandmarks?.[sub.idx] || null, fine: false });
        }
        report((mt / dur) * 40, 'finding the athlete');
      },
    });
    // WHAT THE PLAYBACK PASS DROPPED, READ BACK EXACTLY.
    //
    // requestVideoFrameCallback only fires for frames the browser actually
    // presents. Under CPU load it presents fewer, skipRatio stays 0 because
    // nothing was RE-presented, and the reps inside the gap are never
    // bracketed - which is how the same clip returned 17, 17 and then 10.
    //
    // Gaps are found in the timestamps we did get, and only those windows are
    // re-read by seek, which is exact. A clean pass finds no gaps and pays
    // nothing.
    checkAbort();
    // Every read failed: that is the model on this phone, not an empty clip.
    if (!health.ok && health.err) throw codeErr('model', 'The body-tracking model failed on this phone: ' + (health.lastErr?.message || health.lastErr));
    let recovered = 0, recoveryCapped = false;
    if (coarse.length > 1) {
      // A HOLE IS WHAT THE DETECTOR CANNOT SEE THROUGH, NOT EVERY MISSING FRAME
      // (30.9 #475, Ohad: "a video of 11 throws and it analyzed just 10"). The
      // coarse pass only needs 15 reads a second (coarseStep, above) - hands
      // above the head last a few hundred ms. Counting every 2.5 missing SOURCE
      // frames as a hole planned ~630 re-reads on his 60 fps clip, and the 25 s
      // budget reached ~115 of them on EVERY run (4 of 4 capped, measured).
      const gapMs = Math.max(frameDur * 1000 * 2.5, coarseStep * 1000 * 1.5);
      // A span read by SEEKING at coarseStep (playback failed there) is spaced
      // by that step on purpose - it is not a hole to re-read frame by frame.
      const stepped = (a, b) => run.stepRegions.some((g) => a >= g.from * 1000 - 1 && b <= (g.to + g.step) * 1000 + 1 && b - a <= g.step * 1000 * 1.6);
      const holes = [];
      for (let i = 1; i < coarse.length; i++) {
        const dt = coarse[i].t - coarse[i - 1].t;
        if (dt > gapMs && !stepped(coarse[i - 1].t, coarse[i].t)) holes.push({ from: coarse[i - 1].t, to: coarse[i].t });
      }
      drops.holes = holes.length;
      // A cap, because a pathologically bad pass could otherwise seek for
      // minutes - and it is REPORTED rather than silently truncating.
      const MAX_RECOVER = 700;
      // THE 40% FREEZE (27.9, Ohad: "the shot analyzer always gets stuck on 40%.
      // horrible bug"). A phone drops many frames in the playback pass, and this
      // loop re-read every one of them by seeking - up to 700 seeks at up to
      // 600ms each plus a pose read - with no progress in between: ten minutes
      // of a bar pinned at 40%. Now it reports as it goes (40 -> 50) and it has
      // a WALL-CLOCK budget: 25s, then it stops and says it stopped.
      // ACTIVE time: a screen that locks mid-pass used to spend the whole
      // budget while the phone was asleep, and came back to a capped pass.
      const RECOVER_BUDGET_MS = 25000;
      const recoverStart = clock();
      // THE WHOLE CLIP FIRST, THEN THE DETAIL (#475). The holes used to be
      // filled in time order, frame by frame, so when the budget ran out the
      // LATE part of the clip was never re-read at all - a shot whose frames the
      // browser dropped there was simply gone. Now each hole is read at
      // coarseStep, middle first, and the holes take turns: every hole gets its
      // middle read before any hole gets a second.
      const stepMs = coarseStep * 1000, frameMs = frameDur * 1000;
      const midFirst = (arr) => {
        const out = []; const q = [[0, arr.length - 1]];
        while (q.length) { const [a, b] = q.shift(); if (a > b) continue; const m = (a + b) >> 1; out.push(arr[m]); q.push([a, m - 1], [m + 1, b]); }
        return out;
      };
      const perHole = holes.map((h) => {
        const ts = [];
        for (let t = h.from + stepMs; t < h.to - stepMs * 0.5; t += stepMs) ts.push(t);
        if (!ts.length) ts.push(h.from + Math.max(1, Math.round((h.to - h.from) / 2 / frameMs)) * frameMs);
        return midFirst(ts);
      });
      const order = [];
      for (let k = 0, more = true; more; k++) { more = false; for (const ts of perHole) if (k < ts.length) { order.push(ts[k]); more = true; } }
      const planned = Math.max(1, Math.min(order.length, MAX_RECOVER));
      let tried = 0;
      if (holes.length) {
        report(40, 'filling the dropped frames');
        for (const tMsHole of order) {
          {
            checkAbort();
            await vis.whenVisible(signal);
            checkAbort();
            if (recovered >= MAX_RECOVER || clock() - recoverStart > RECOVER_BUDGET_MS) { recoveryCapped = true; break; }
            tried++;
            if (tried % 5 === 0) report(40 + Math.min(1, Math.max(tried / planned, (clock() - recoverStart) / RECOVER_BUDGET_MS)) * 10, 'filling the dropped frames');
            // A seek that did not land would be read as the previous frame
            // under this timestamp - skip it rather than record a wrong one.
            if (!(await seekTo(v, tMsHole / 1000))) continue;
            const r = detect(lmCoarse, v);
            const anchor = nearestSeen(tMsHole / 1000);
            const aStep = anchor ? (anchor.d > 0.5 ? Infinity : Math.max(0.05, anchor.d * 1.0)) : Infinity;
            const sub = pickSubject(r?.landmarks, anchor ? anchor.c : null, aStep);
            if (sub.idx >= 0) {
              subjSeen.push({ t: tMsHole / 1000, c: sub.centroid });
              track.push({ t: tMsHole / 1000, box: sub.box });
              coarse.push({ t: tMsHole, landmarks: r.landmarks[sub.idx], worldLandmarks: r.worldLandmarks?.[sub.idx] || null, fine: false });
              recovered++;
            }
          }
        }
        drops.recoverMs = Math.round(clock() - recoverStart); drops.planned = planned; drops.tried = tried;
        // Everything downstream assumes chronological order.
        coarse.sort((a, b) => a.t - b.t);
        track.sort((a, b) => a.t - b.t);
      }
    }

    const msCoarse = Math.round(performance.now() - t0);
    if (recovered) drops.recovered = recovered;
    if (recoveryCapped) drops.recoveryCapped = true;
    if (track.length < 6) throw codeErr('noPerson', 'I could not find a person in this clip. Film the whole body, side-on, in good light.');

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
    // The full model is a download on a phone's first run - say so, never a silent wait.
    report(50, 'loading the detailed model');
    // The detailed model is an UPGRADE, not a requirement. On a slow phone
    // connection, or a GPU delegate that hangs instead of failing, it used to
    // be an endless wait on 50%. Past 30 s of active time the windows are read
    // with the fast model already in memory, and the stats say so.
    let fineLm;
    // FULL, NOT HEAVY - MEASURED (29.9 #431). Heavy is the more accurate model
    // on still images, but this pass reads frames off REAL-TIME playback: a
    // model twice as slow gets half the frames per shot window and shots drop
    // out. Same clip, same headless seat, back to back: heavy 1 shot vs full 4
    // (and 0 vs 5 in an earlier pair). Heavy stays reachable for experiments
    // with localStorage 'expo-shot-fine' = 'heavy'; it falls back to full, and
    // full to the fast model.
    const fineWanted = (() => {
      try { if (localStorage.getItem('expo-shot-fine') === 'heavy') return 'heavy'; } catch { /* private mode */ }
      return 'full';
    })();
    for (const q of fineWanted === 'heavy' ? ['heavy', 'full'] : ['full']) {
      try {
        lmFine = await loadModel({ runningMode: 'IMAGE', quality: q, numPoses: 1 }, 30000);
        fineLm = lmFine; run.stats.fineModel = q; break;
      } catch (e) {
        if (e && e.code === 'aborted') throw e;
      }
    }
    if (!fineLm) { fineLm = lmCoarse; run.stats.fineModel = 'lite'; }
    const fineHealth = { consec: 0 };
    const detectFine = (input) => {
      try { const r = fineLm.detect(input); fineHealth.consec = 0; return r; }
      catch {
        // Ten failures in a row on the detailed model: carry on with the fast one.
        if (++fineHealth.consec >= 10 && fineLm !== lmCoarse) { fineLm = lmCoarse; run.stats.fineModel = 'lite'; fineHealth.consec = 0; }
        return null;
      }
    };
    const fine = [];
    const totalMs = windows.reduce((a, w) => a + (w.to - w.from), 0) || 1;
    let doneMs = 0;
    for (const w of windows) {
      // Identity inside a window, held to the same physical limit as the
      // coarse pass. Comparing against the coarse BOX alone was too loose:
      // its tolerance scales with body width, so a wide box let a 0.22 step
      // between adjacent 33ms frames pass. Reset per window - a new window
      // starts somewhere else in the clip and that jump is legitimate.
      let prevFineC = null, prevFineT = null;
      if (fine.length >= maxFine) break;
      await playThrough(v, {
        from: w.from / 1000, to: w.to / 1000, rate: fineRate, frameDur, drops, deterministic: detFine, step: fineStep, run,
        onFrame: async (vid, mt) => {
          checkAbort();
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
          r = detectFine(canvas);
          const sub = pickSubject(r?.landmarks, null);
          if (sub.idx >= 0 && r.worldLandmarks?.[sub.idx]) {
            const mapped = r.landmarks[sub.idx].map((p) => (p ? { x: (sx + p.x * sideLen) / vw, y: (sy + p.y * sideLen) / vh, z: p.z, visibility: p.visibility } : p));
            // IS THIS STILL THE SAME MAN?
            //
            // The crop is padded to 1.9x the body so the arms stay in frame,
            // which on a busy court means a team-mate is often inside it too.
            // This pass runs with numPoses 1, so the model returns ONE pose and
            // pickSubject has no choice to make - whoever it locked onto is
            // what we get. Measured on clip02: the torso centroid stepped 0.44
            // of the frame between adjacent frames, repeatedly, around frames
            // 50-69. That is not a body moving, it is the model changing its
            // mind about which body.
            //
            // We already know where the subject is: the coarse box that decided
            // this crop. Anything landing outside it is a different player, and
            // the frame is dropped rather than recorded. Ohad: it must only
            // follow the shooter, even when there are several players on the
            // video.
            const TORSO_J = [11, 12, 23, 24];
            let tx = 0, ty = 0, tn = 0;
            for (const j of TORSO_J) {
              const q = mapped[j];
              if (q && (q.visibility == null || q.visibility > 0.3)) { tx += q.x; ty += q.y; tn++; }
            }
            const bcx = (b.x0 + b.x1) / 2, bcy = (b.y0 + b.y1) / 2;
            const tolX = Math.max((b.x1 - b.x0) * 0.85, 0.06);
            const tolY = Math.max((b.y1 - b.y0) * 0.85, 0.06);
            if (tn && (Math.abs(tx / tn - bcx) > tolX || Math.abs(ty / tn - bcy) > tolY)) return;
            if (tn) {
              const fc = { x: tx / tn, y: ty / tn };
              if (prevFineC && prevFineT != null) {
                const gap = Math.abs(mt - prevFineT);
                const lim = gap > 0.5 ? Infinity : Math.max(0.05, gap * 1.0);
                if (Math.hypot(fc.x - prevFineC.x, fc.y - prevFineC.y) > lim) return;
              }
              prevFineC = fc; prevFineT = mt;
            }
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
          report(50 + ((doneMs + (mt * 1000 - w.from)) / totalMs) * fineSpan, 'reading the shots');
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

    // ---------------------------------------------------- ball pass (opt-in) ---
    // The pose is finished and the count is decided; nothing below can change
    // either. The releases found here are PROVISIONAL - the screen re-runs the
    // analysis with the coach's hand and shot type - which is why each span
    // reaches 1.5 s past its release: a final release a few frames away still
    // falls inside it, and one that does not simply keeps the playback ball.
    let ballStats = null;
    if (ballSeek) {
      checkAbort();
      let releases = [];
      try {
        const hand = detectShootingHand(out) || 'R';
        const series = buildSeries(out, { hand, aspect: vw / vh });
        let cyc = detectShots(series, fps);
        if (!cyc.length) cyc = detectShots(series, fps, RELAXED_SHOT_GATES);
        releases = cyc.map((c) => series.tMs[c.release]).filter((t) => Number.isFinite(t));
      } catch { releases = []; }
      ballStats = { mode: 'seek', releases: releases.length, ok: 0, frames: 0, ms: 0, why: {} };
      if (releases.length) {
        report(50 + fineSpan, 'following the ball');
        try {
          const bp = await seekBallPass(v, {
            releases, frameDur, duration: dur, mw: MW, mh: MH, run,
            readGray: (vid) => {
              mctx.drawImage(vid, 0, 0, vw, vh, 0, 0, MW, MH);
              return toGray(mctx.getImageData(0, 0, MW, MH).data, MW, MH, 4);
            },
            cutFor: (tSec) => {
              const b = boxAt(track, tSec) || { x0: 0.2, y0: 0.1, x1: 0.8, y1: 0.9 };
              return (b.y0 + (b.y1 - b.y0) * 0.5) * MH;
            },
            onProgress: (f) => report(50 + fineSpan + Math.max(0, Math.min(1, f)) * (48 - fineSpan), 'following the ball'),
          });
          out.ballSeek = { frames: bp.frames, spans: bp.spans, stepMs: bp.stepMs };
          ballStats.ok = bp.spans.filter((s) => s.ok).length;
          ballStats.frames = bp.frames.length;
          ballStats.ms = bp.ms;
          ballStats.why = bp.why;
        } catch (e) {
          if (e && e.code === 'aborted') throw e;
          // Whatever went wrong, the playback ball is still there for every shot.
          ballStats.error = String((e && e.message) || e);
        }
      }
    }
    // skipped: frames discarded mid-detection. skipRatio: how much of the
    // clip never reached the model. A high ratio means the shot COUNT is
    // unreliable, which no fps average will reveal - the fps figure is
    // computed from the frames that did arrive, so heavy skipping just
    // looks like a lower-frame-rate video.
    const seen = coarse.length + fine.length + drops.skipped;
    out.stats = { coarse: coarse.length, fine: fine.length, windows: windows.length, duration: dur, msCoarse, msFine,
                  skipped: drops.skipped, skipRatio: seen ? Math.round((drops.skipped / seen) * 100) / 100 : 0,
                  // Phone paths: how often playback stalled and was finished by
                  // seeking, whether play() was refused, which model read the
                  // shots, and any detections that threw.
                  stalls: run.stats.stalls, tails: run.stats.tails || 0, blocked: run.stats.blocked, stepOnly: run.mode.stepOnly,
                  steppedFrames: run.stats.steppedFrames || 0, fineModel: run.stats.fineModel,
                  detectErrors: health.err, rebuilt: health.rebuilt,
                  // the dropped-frame re-read: how many it found, and whether its budget ran out (#475)
                  recovered: drops.recovered || 0, recoveryCapped: !!drops.recoveryCapped, recoverMs: drops.recoverMs || 0, holes: drops.holes || 0, planned: drops.planned || 0, tried: drops.tried || 0,
                  // the opt-in seek ball pass: null when off; else spans read cleanly of releases found, and why the rest fell back
                  ballPass: ballStats };
    report(100, 'done');
    try { console.log('[shot-capture]', JSON.stringify(out.stats), 'out', out.length); } catch { /* noop */ }
    return out;
  } finally {
    vis.dispose();
    if (lmCoarse) try { lmCoarse.close(); } catch { /* noop */ }
    if (lmFine) try { lmFine.close(); } catch { /* noop */ }
    if (v) try { v.pause(); v.removeAttribute('src'); v.load(); v.remove(); } catch { /* noop */ }
  }
}
