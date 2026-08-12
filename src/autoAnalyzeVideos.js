// Auto-analyze every uploaded form video for an athlete — no manual "save to
// trend" step (Ohad, 2026-08-12). Runs the SAME pose pipeline the camera tools
// use (captureClipFrames -> analyzeClip -> savePoseMetric), so the Bar-Speed
// vault and Symmetry injury-watch the Analysis report already reads just fill in
// on their own. Owner-only, client-side; a poorly-tracked clip is refused by
// savePoseMetric so one bad film never fakes a velocity spike or an injury flag.
//
// Heavy + async (MediaPipe over each remote clip), so it runs ONCE per clip:
// analyzed URLs are remembered in localStorage and skipped on later opens.

import { analyzeClip } from './poseLab';
import { savePoseMetric } from './poseMetricsStore';
// captureClipFrames lives in MovementLab (which pulls MediaPipe WASM + a lazy 3D
// engine). Dynamic-import it inside the runner so opening the Analysis report
// never eagerly loads all that — it only arrives when a batch actually starts.

const DONE_KEY = 'expo-autopose-done-v1';

function readDone() {
  try { return JSON.parse(localStorage.getItem(DONE_KEY) || '{}') || {}; } catch { return {}; }
}
function markDone(url) {
  try { const d = readDone(); d[url] = Date.now(); localStorage.setItem(DONE_KEY, JSON.stringify(d)); } catch { /* private mode */ }
}
export function isAnalyzed(url) { return !!readDone()[url]; }

// Every uploaded form video for one athlete, from the coach's client_workouts.
// Matches the athlete id OR a couple sub-member whose base is the athlete. One
// entry per clip: { url, title, date, load, key }.
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
      // best logged load on that exercise → lets the vault key velocity by load
      let load = null;
      if (ex && Array.isArray(ex.sets)) {
        const ls = ex.sets.map((s) => parseFloat(s.load)).filter((n) => isFinite(n) && n > 0);
        if (ls.length) load = Math.max(...ls);
      }
      out.push({ url: fv.cloudUrl, title, date: w.date, load, key: `${cid}|${w.date}|${title}` });
    }
  }
  return out;
}

// How many of the athlete's clips still need analysis (drives the UI nudge).
export function pendingCount(clientWorkouts, traineeId) {
  return collectAthleteFormVideos(clientWorkouts, traineeId).filter((v) => !isAnalyzed(v.url)).length;
}

// Analyze every not-yet-analyzed clip, sequentially (MediaPipe is single-GPU —
// parallel decode just thrashes). Each result is folded into the pose store via
// savePoseMetric, which already trends bar-speed + L/R symmetry and refuses a
// poorly-tracked clip. Robust per-clip: one bad/blocked video is skipped, never
// fatal. Returns a summary { total, analyzed, skipped, failed }.
export async function autoAnalyzeAthleteVideos(clientWorkouts, traineeId, opts = {}) {
  const { onProgress, shouldStop } = opts;
  const vids = collectAthleteFormVideos(clientWorkouts, traineeId).filter((v) => !isAnalyzed(v.url));
  const total = vids.length;
  if (!total) return { total: 0, analyzed: 0, failed: 0, skipped: 0 };
  const { captureClipFrames } = await import('./MovementLab');
  let analyzed = 0, failed = 0, i = 0;
  for (const v of vids) {
    if (typeof shouldStop === 'function' && shouldStop()) break;
    i++;
    try {
      const frames = await captureClipFrames(v.url, { crossOrigin: true });
      if (frames && frames.length >= 4) {
        const analysis = analyzeClip(frames, v.title);
        if (analysis && analysis.ok) {
          // savePoseMetric returns null for a poor-quality / empty read — that's a
          // legitimate "nothing usable here", still mark done so we don't re-crunch it.
          savePoseMetric({ clientId: traineeId, exercise: v.title, date: v.date, analysis, load: v.load });
          analyzed++;
        }
      }
      markDone(v.url);
    } catch {
      failed++;
      markDone(v.url); // a broken/blocked URL won't succeed on retry — don't loop on it forever
    }
    if (onProgress) onProgress({ done: i, total, current: v.title });
  }
  return { total, analyzed, failed, skipped: total - analyzed - failed };
}
