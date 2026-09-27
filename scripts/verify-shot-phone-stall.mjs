// verify-shot-phone-stall.mjs — the capture must never sit on a frozen bar.
//
// Ohad, 27.9, on his phone: "the shot analyzer always gets stuck on 40%.
// horrible bug. fix!!" - and after the dropped-frame budget shipped, "still
// getting stuck at 40%". The playback pass had three exits: 'ended', a frame
// past the window, or a hard timer at FOUR TIMES the playback length (six
// minutes on a 45 s clip). A phone that stops presenting frames - screen
// locked, video paused by the browser, a starved decoder, play() refused -
// sat on the last percentage for those six minutes.
//
// A browser is not needed to prove the control flow, so this drives the real
// playThrough / stepThrough / seekTo / withDeadline from src/shotCapture.js
// against a FAKE <video> whose failures are scripted. Pure node, ~15 s.
//
//   node scripts/verify-shot-phone-stall.mjs
//
// It proves the paths, not the phone: the device test is in the report that
// shipped with it (390px, coarse pointer, 4x CPU throttle).

// A document whose visibility the test controls - installed BEFORE the module
// loads, because shotCapture reads `typeof document` at import time.
class FakeDoc extends EventTarget {
  constructor() { super(); this.hidden = false; }
  get visibilityState() { return this.hidden ? 'hidden' : 'visible'; }
  setHidden(h) { this.hidden = h; this.dispatchEvent(new Event('visibilitychange')); }
}
globalThis.document = new FakeDoc();
const doc = globalThis.document;
// Every fake video listens for visibility, like the browser pausing it.
(await import('node:events')).setMaxListeners(100, doc);

const { playThrough, stepThrough, seekTo, withDeadline, visibilityClock } = await import('../src/shotCapture.js');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name + (extra ? '   ' + extra : '')); } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ── the fake video ──────────────────────────────────────────────────────────
// Presents a frame every 1/fps / rate seconds of wall clock while playing, and
// calls the pending requestVideoFrameCallback with that frame's mediaTime.
// Scripted failures:
//   blockPlay     play() rejects NotAllowedError (muted autoplay refused)
//   noFrames      playback runs but nothing is ever presented (rVFC silent)
//   stallAt       presentation stops at this mediaTime; still "playing"
//   noEnded       reaches the end but never fires 'ended'
//   seekNever     a seek never fires 'seeked'
//   pauseWhenHidden  the browser pauses a hidden video and does NOT resume it
class FakeVideo extends EventTarget {
  constructor(o = {}) {
    super();
    Object.assign(this, { fps: 30, duration: 2, blockPlay: false, noFrames: false, stallAt: Infinity, noEnded: false, seekNever: false, pauseWhenHidden: true, seekDelay: 5 }, o);
    this._t = 0; this.paused = true; this.ended = false; this.error = null; this.playbackRate = 1;
    this._cbs = []; this._iv = null; this.onseeked = null; this.onerror = null; this.plays = 0;
    doc.addEventListener('visibilitychange', () => { if (doc.hidden && this.pauseWhenHidden && !this.paused) this.pause(); });
  }
  get currentTime() { return this._t; }
  set currentTime(t) {
    this._t = Math.max(0, Math.min(this.duration, t)); this.ended = false;
    if (this.seekNever) return;
    setTimeout(() => { if (this.onseeked) this.onseeked(); this._present(true); }, this.seekDelay);
  }
  requestVideoFrameCallback(cb) { this._cbs.push(cb); return this._cbs.length; }
  _present(fromSeek) {
    if (this.noFrames) return;
    if (!fromSeek && this._t >= this.stallAt) return;
    const cbs = this._cbs; this._cbs = [];
    for (const cb of cbs) cb(performance.now(), { mediaTime: this._t });
  }
  play() {
    this.plays++;
    if (this.blockPlay) { const e = new Error('play() refused'); e.name = 'NotAllowedError'; return Promise.reject(e); }
    if (!this.paused) return Promise.resolve();
    if (this.ended || this._t >= this.duration) this._t = 0;
    this.paused = false; this.ended = false;
    const dt = 1 / this.fps;
    this._iv = setInterval(() => {
      if (this._t >= this.stallAt) return;                // decoder starved: time does not move
      this._t = Math.min(this.duration, this._t + dt);
      this._present(false);
      if (this._t >= this.duration) {
        clearInterval(this._iv); this._iv = null; this.paused = true; this.ended = true;
        if (!this.noEnded) this.dispatchEvent(new Event('ended'));
      }
    }, (dt * 1000) / this.playbackRate / 4);                // 4x faster than real time - the test only needs the order of events
    return Promise.resolve();
  }
  pause() { this.paused = true; if (this._iv) { clearInterval(this._iv); this._iv = null; } }
}

const mkRun = (extra = {}) => ({ vis: visibilityClock(), mode: { stepOnly: false }, stepRegions: [], stats: { stalls: 0, blocked: false }, stallMs: 400, seekMs: 60, seekMaxMs: 120, ...extra });
const maxGap = (ts) => { let g = 0; for (let i = 1; i < ts.length; i++) g = Math.max(g, ts[i] - ts[i - 1]); return g; };
// A HANG IS THE BUG, so it must fail by name rather than wait for an outer
// timeout: with the stall detector disabled this gate used to just sit there.
let scenario = 'start', scenarioAt = performance.now();
const scene = (name) => { scenario = name; scenarioAt = performance.now(); };
setInterval(() => {
  if (performance.now() - scenarioAt > 15000) {
    console.log(`  ✗ HUNG for 15 s in: ${scenario} - the capture would sit on a frozen bar here`);
    console.log(`\nSHOT PHONE STALL: ${pass} passed, ${fail + 1} failed`);
    process.exit(1);
  }
}, 500).unref();
const timed = async (p) => { const t0 = performance.now(); let err = null; try { await p; } catch (e) { err = e; } return { ms: performance.now() - t0, err }; };
const FD = 1 / 30, STEP = 2 / 30;

console.log('SHOT CAPTURE ON A PHONE\n');

// 1. Healthy playback: every frame through playback, no seeking, no stall.
{
  scene('healthy'); const v = new FakeVideo(); const run = mkRun(); const ts = [];
  const r = await timed(playThrough(v, { from: 0, to: 2, rate: 1, frameDur: FD, step: STEP, run, onFrame: (_v, t) => { ts.push(t); } }));
  ok('healthy: resolves', !r.err, r.err && r.err.message);
  ok('healthy: read by playback (>= 50 frames, none stepped)', ts.length >= 50 && !run.stats.steppedFrames, `frames ${ts.length}, stepped ${run.stats.steppedFrames}`);
  ok('healthy: no stall recorded', run.stats.stalls === 0);
  run.vis.dispose();
}

// 2. play() refused without a gesture: read by seeking, no hang, and later
//    windows skip playback entirely.
{
  scene('play refused'); const v = new FakeVideo({ blockPlay: true }); const run = mkRun(); const ts = [];
  const r = await timed(playThrough(v, { from: 0, to: 2, rate: 1, frameDur: FD, step: STEP, run, onFrame: (_v, t) => { ts.push(t); } }));
  ok('play refused: resolves without waiting for a stall', !r.err && r.ms < 2000, `${Math.round(r.ms)}ms ${r.err ? r.err.message : ''}`);
  ok('play refused: whole range read by seeking', ts.length >= 30 && ts[0] === 0 && ts[ts.length - 1] > 1.9, `frames ${ts.length}, last ${ts[ts.length - 1]}`);
  ok('play refused: flagged blocked + stepOnly', run.stats.blocked && run.mode.stepOnly);
  const plays = v.plays; const ts2 = [];
  await playThrough(v, { from: 0.5, to: 1, rate: 1, frameDur: FD, step: STEP, run, onFrame: (_v, t) => { ts2.push(t); } });
  ok('play refused: the next window goes straight to seeking', v.plays === plays && ts2.length >= 7, `plays ${plays}->${v.plays}, frames ${ts2.length}`);
  run.vis.dispose();
}

// 3. Playback runs but no frame is ever presented (rVFC silent - the
//    off-screen / power-saving case). Nudged once, then read by seeking.
{
  scene('no frames presented'); const v = new FakeVideo({ noFrames: true }); const run = mkRun(); const ts = [];
  const r = await timed(playThrough(v, { from: 0, to: 1, rate: 1, frameDur: FD, step: STEP, run, onFrame: (_v, t) => { ts.push(t); } }));
  // The fake keeps TIME moving with no frames and fires 'ended' - the pass
  // used to call that done with nothing read ("I could not find a person").
  ok('no frames presented: resolves', !r.err, r.err && r.err.message);
  ok('no frames presented: ended with zero frames is NOT done - range read by seeking', ts.length >= 15 && ts[ts.length - 1] > 0.95, `frames ${ts.length}`);
  ok('no frames presented: stepOnly set for later windows', run.mode.stepOnly);
  run.vis.dispose();
}
{
  // Same, with time frozen too (a video that never starts): must step it all.
  scene('never starts'); const v = new FakeVideo({ noFrames: true, stallAt: 0 }); const run = mkRun(); const ts = [];
  const r = await timed(playThrough(v, { from: 0, to: 1, rate: 1, frameDur: FD, step: STEP, run, onFrame: (_v, t) => { ts.push(t); } }));
  ok('never starts: resolves after nudge + stall (≈2x stallMs), not a 4x-length timer', !r.err && r.ms < 3000, `${Math.round(r.ms)}ms`);
  ok('never starts: whole range read by seeking', ts.length >= 15 && ts[ts.length - 1] > 0.95, `frames ${ts.length}`);
  ok('never starts: stepOnly set for later windows', run.mode.stepOnly && run.stats.stalls === 1);
  run.vis.dispose();
}

// 4. Stalls half-way (decoder starved): first half by playback, rest by
//    seeking from the frame after the last one, no gap at the join.
{
  scene('mid-way stall'); const v = new FakeVideo({ stallAt: 1.0 }); const run = mkRun(); const ts = [];
  const r = await timed(playThrough(v, { from: 0, to: 2, rate: 1, frameDur: FD, step: STEP, run, onFrame: (_v, t) => { ts.push(t); } }));
  ok('mid-way stall: resolves', !r.err, r.err && r.err.message);
  ok('mid-way stall: reaches the end of the range', ts[ts.length - 1] > 1.9, `last ${ts[ts.length - 1]}`);
  ok('mid-way stall: no gap wider than one seek step', maxGap(ts) <= STEP + 1e-6, `max gap ${maxGap(ts).toFixed(3)}s`);
  ok('mid-way stall: playback kept for later windows (it presented frames)', !run.mode.stepOnly && run.stats.stalls === 1);
  run.vis.dispose();
}

// 5. Reaches the end but 'ended' never fires: done, nothing re-read.
{
  scene('no ended event'); const v = new FakeVideo({ noEnded: true }); const run = mkRun(); const ts = [];
  const r = await timed(playThrough(v, { from: 0, to: 2, rate: 1, frameDur: FD, step: STEP, run, onFrame: (_v, t) => { ts.push(t); } }));
  ok('no ended event: resolves as done', !r.err && run.stats.stalls === 0 && !run.stats.steppedFrames, `stalls ${run.stats.stalls}, stepped ${run.stats.steppedFrames}`);
  run.vis.dispose();
}

// 6. Screen locked mid-pass (page hidden, browser pauses the video) for far
//    longer than the stall window: NOT a stall; resumes by playback on return.
{
  scene('screen locked'); const v = new FakeVideo({ duration: 2 }); const run = mkRun(); const ts = [];
  const p = timed(playThrough(v, { from: 0, to: 2, rate: 1, frameDur: FD, step: STEP, run, onFrame: (_v, t) => { ts.push(t); } }));
  await wait(150); doc.setHidden(true);
  const atHide = ts.length;
  await wait(1500);                                   // ~4x stallMs away
  ok('screen locked: nothing read while hidden', ts.length <= atHide + 1, `${atHide} -> ${ts.length}`);
  doc.setHidden(false);
  const r = await p;
  ok('screen locked: resumes and finishes', !r.err && ts[ts.length - 1] > 1.9, r.err ? r.err.message : `last ${ts[ts.length - 1]}`);
  ok('screen locked: hidden time was not counted as a stall', run.stats.stalls === 0 && !run.stats.steppedFrames, `stalls ${run.stats.stalls}, stepped ${run.stats.steppedFrames}`);
  run.vis.dispose();
}

// 7. A file the phone cannot seek: fails LOUDLY with a code, in bounded time.
{
  scene('unseekable'); const v = new FakeVideo({ seekNever: true }); const run = mkRun();
  const r = await timed(stepThrough(v, { from: 0, to: 2, step: STEP, run, onFrame: () => {} }));
  ok('unseekable: throws code seek', r.err && r.err.code === 'seek', r.err ? r.err.code : 'no error');
  ok('unseekable: within 12 bounded tries', r.ms < 12 * 130, `${Math.round(r.ms)}ms`);
  run.vis.dispose();
}

// 8. STOP: aborting mid-playback rejects promptly with code aborted.
{
  scene('STOP'); const v = new FakeVideo({ duration: 20 }); const ac = new AbortController(); const run = mkRun({ signal: ac.signal });
  setTimeout(() => ac.abort(), 200);
  const r = await timed(playThrough(v, { from: 0, to: 20, rate: 1, frameDur: FD, step: STEP, run, onFrame: () => {} }));
  ok('STOP: rejects with code aborted', r.err && r.err.code === 'aborted', r.err ? r.err.code : 'resolved');
  ok('STOP: within a second', r.ms < 1000, `${Math.round(r.ms)}ms`);
  ok('STOP: video paused', v.paused);
  run.vis.dispose();
}

// 9. seekTo reports whether the seek landed.
{
  scene('seekTo'); ok('seekTo: true when seeked fires', (await seekTo(new FakeVideo(), 1, 200)) === true);
  ok('seekTo: false on timeout', (await seekTo(new FakeVideo({ seekNever: true }), 1, 100)) === false);
}

// 10. withDeadline: a model that never loads is an error, not a wait; a model
//     that loads late is closed; hidden time does not count.
{
  scene('deadline'); const err = Object.assign(new Error('x'), { code: 'model' });
  const r = await timed(withDeadline(new Promise(() => {}), 300, err));
  ok('deadline: never-resolving load rejects with its code', r.err && r.err.code === 'model' && r.ms < 900, `${Math.round(r.ms)}ms`);
  let late = null;
  await timed(withDeadline(new Promise((res) => setTimeout(() => res('LM'), 500)), 200, err, { onLate: (x) => { late = x; } }));
  await wait(400);
  ok('deadline: a late model is handed to onLate (closed, not leaked)', late === 'LM');
  const vis = visibilityClock();
  doc.setHidden(true);
  const p = timed(withDeadline(new Promise((res) => setTimeout(() => res('ok'), 900)), 400, err, { clock: vis.activeNow }));
  const r2 = await p;
  doc.setHidden(false);
  ok('deadline: hidden time does not expire it', !r2.err, r2.err ? 'expired while hidden' : '');
  vis.dispose();
}

console.log(`\nSHOT PHONE STALL: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
