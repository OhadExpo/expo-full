// Auto-analyze every uploaded form video for an athlete — no manual "save to
// trend" step (Ohad, 2026-08-12). Runs the SAME pose pipeline the camera tools
// use (captureClipFrames -> analyzeClip -> savePoseMetric), so the Bar-Speed
// vault and Symmetry injury-watch the Analysis report already reads just fill in
// on their own. Owner-only, client-side; a poorly-tracked clip is refused by
// savePoseMetric so one bad film never fakes a velocity spike or an injury flag.
//
// Heavy + async (MediaPipe over each remote clip), so it runs ONCE per clip:
// analyzed URLs are remembered in localStorage and skipped on later opens.
//
// Hardened after a fresh-context adversarial review (2026-08-12):
//  - metrics are filed under the clip's TRUE owner (w.clientId), never the
//    passed traineeId, so a COUPLE's two members can never pool velocity or
//    symmetry into one person (was a phantom / masked injury flag).
//  - a TRANSIENT failure (network/CORS/decode blip) is retried on a later open
//    instead of being marked "analyzed" forever and silently losing that clip.
//  - a re-entrancy guard stops two concurrent batches for the same athlete
//    from double-counting a velocity sample via lost-update writes.
//  - the load attached to a clip is only used when it is UNAMBIGUOUS (one
//    distinct logged load); a mixed-load session stores null rather than
//    guessing the max and mispairing a light clip's speed with a heavy load.

import { analyzeClip } from './poseLab.js';
import { savePoseMetric } from './poseMetricsStore.js';
// captureClipFrames lives in MovementLab (which pulls MediaPipe WASM + a lazy 3D
// engine). Dynamic-import it inside the runner so opening the Analysis report
// never eagerly loads all that — it only arrives when a batch actually starts.

const DONE_KEY = 'expo-autopose-done-v1';
const ATTEMPTS_KEY = 'expo-autopose-attempts-v1';
const MAX_ATTEMPTS = 3; // transient retries across report-opens before giving up

function readMap(key) {
  try { return JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch { return {}; }
}
function writeMap(key, m) {
  try { localStorage.setItem(key, JSON.stringify(m)); } catch { /* private mode */ }
}
function markDone(url) { const d = readMap(DONE_KEY); d[url] = Date.now(); writeMap(DONE_KEY, d); }
export function isAnalyzed(url) { return !!readMap(DONE_KEY)[url]; }
function attemptsOf(url) { return readMap(ATTEMPTS_KEY)[url] || 0; }
function bumpAttempt(url) { const a = readMap(ATTEMPTS_KEY); a[url] = (a[url] || 0) + 1; writeMap(ATTEMPTS_KEY, a); return a[url]; }

// Every uploaded form video for one athlete, from the coach's client_workouts.
// Matches the athlete id OR a couple sub-member whose base is the athlete. One
// entry per clip: { url, title, date, load, cid, key }.
//   cid  = the clip's TRUE owner (the workout's clientId — a couple sub-member
//          id like `tr_x__0`), so the runner files metrics under the real person.
//   load = a single distinct logged load, else null (see header note).
export function collectAthleteFormVideos(clientWorkouts, traineeId) {
  if (!traineeId) return [];
  const base = (id) => String(id || '').split('__')[0];
  const out = [];
  const seen = new Set();
  for (const w of clientWorkouts || []) {
    const cid = w.clientId;
    if (cid !== traineeId && base(cid) !== traineeId) continue;
    if (!Array.isArray(w.formVideos)) continue;
    for (let i = 0; i < w.formVideos.length; i++) {
      const fv = w.formVideos[i];
      if (!fv || !fv.cloudUrl || seen.has(fv.cloudUrl)) continue;
      seen.add(fv.cloudUrl);
      const ex = Array.isArray(w.exercises) ? w.exercises[i] : null;
      const title = (ex && (ex.title || ex.name)) || `Exercise ${i + 1}`;
      // Load keys the velocity-by-load vault. The clip is ONE set but the logged
      // exercise may have several — and we can't tell which set was filmed. Only
      // trust the load when every logged set used the SAME load (one distinct
      // value); otherwise null, which safely excludes the clip from the load-ref
      // instead of pairing (say) an 80kg backoff clip's speed with a 120kg top set.
      let load = null;
      if (ex && Array.isArray(ex.sets)) {
        const ls = ex.sets.map((s) => parseFloat(s.load)).filter((n) => isFinite(n) && n > 0);
        const distinct = [...new Set(ls)];
        if (distinct.length === 1) load = distinct[0];
      }
      out.push({ url: fv.cloudUrl, title, date: w.date, load, cid, key: `${cid}|${w.date}|${title}` });
    }
  }
  return out;
}

// How many of the athlete's clips still need analysis (drives the UI nudge).
export function pendingCount(clientWorkouts, traineeId) {
  return collectAthleteFormVideos(clientWorkouts, traineeId)
    .filter((v) => !isAnalyzed(v.url) && attemptsOf(v.url) < MAX_ATTEMPTS).length;
}

// Re-entrancy guard: the Analysis report's effect can re-fire (realtime replaces
// the clientWorkouts array by identity) while a batch is still running. Without
// this, two batches for the same athlete run concurrently and their read-modify-
// write on the pose store can lose an update (a dropped velocity sample).
const _inflight = new Set();

// Analyze every not-yet-analyzed clip, sequentially (MediaPipe is single-GPU —
// parallel decode just thrashes). Each result is folded into the pose store via
// savePoseMetric, which already trends bar-speed + L/R symmetry and refuses a
// poorly-tracked clip. Robust per-clip: one bad/blocked video is skipped, never
// fatal. Returns a summary { total, analyzed, skipped, failed }.
export async function autoAnalyzeAthleteVideos(clientWorkouts, traineeId, opts = {}) {
  const { onProgress, shouldStop } = opts;
  if (!traineeId || _inflight.has(traineeId)) {
    return { total: 0, analyzed: 0, failed: 0, skipped: 0, busy: !!traineeId };
  }
  const vids = collectAthleteFormVideos(clientWorkouts, traineeId)
    .filter((v) => !isAnalyzed(v.url) && attemptsOf(v.url) < MAX_ATTEMPTS);
  const total = vids.length;
  if (!total) return { total: 0, analyzed: 0, failed: 0, skipped: 0 };
  _inflight.add(traineeId);
  let analyzed = 0, failed = 0, i = 0;
  try {
    const { captureClipFrames } = await import('./MovementLab');
    for (const v of vids) {
      if (typeof shouldStop === 'function' && shouldStop()) break;
      i++;
      try {
        const frames = await captureClipFrames(v.url, { crossOrigin: true });
        if (frames && frames.length >= 4) {
          const analysis = analyzeClip(frames, v.title);
          if (analysis && analysis.ok) {
            // File under the clip's TRUE owner (v.cid), never the passed
            // traineeId — a couple's members must not pool. A dateless clip is
            // NOT stored (savePoseMetric would stamp it "today" and can then
            // overwrite a real same-day entry); it's still marked done.
            if (v.date) savePoseMetric({ clientId: v.cid || traineeId, exercise: v.title, date: v.date, analysis, load: v.load });
            analyzed++;
            markDone(v.url);
          } else {
            // A usable read that MediaPipe rejected as poor is genuinely done.
            markDone(v.url);
          }
        } else {
          // Too few frames — likely a still-buffering / cold decode. Treat as a
          // TRANSIENT attempt: retry next open, give up only after MAX_ATTEMPTS.
          if (bumpAttempt(v.url) >= MAX_ATTEMPTS) markDone(v.url);
          failed++;
        }
      } catch {
        // network / CORS / decode blip — TRANSIENT. Do NOT mark done (that would
        // silently lose an injury-watch clip forever); retry on a later open and
        // give up only after MAX_ATTEMPTS so one broken URL can't loop forever.
        if (bumpAttempt(v.url) >= MAX_ATTEMPTS) markDone(v.url);
        failed++;
      }
      if (onProgress) onProgress({ done: i, total, current: v.title });
    }
  } finally {
    _inflight.delete(traineeId);
  }
  return { total, analyzed, failed, skipped: total - analyzed - failed };
}
