// Shared rep-counter — used by both the trainer's interactive REPS toggle
// (WorkoutReview) and the client's upload-time auto-count (ClientPortal).
// Same algorithm in both places: offline peak detection over the recorded
// per-frame joint-angle signal, prominence + min-distance peak-finding, title
// regex picks which joint channel carries the rep cycle. Validated against
// scipy.signal.find_peaks on real clips at prominence=25°.

export const ANGLE_DEFS = [
  { name: 'L SHO', a:23, b:11, c:13 },
  { name: 'R SHO', a:24, b:12, c:14 },
  { name: 'L ELB', a:11, b:13, c:15 },
  { name: 'R ELB', a:12, b:14, c:16 },
  { name: 'L HIP', a:11, b:23, c:25 },
  { name: 'R HIP', a:12, b:24, c:26 },
  { name: 'L KNE', a:23, b:25, c:27 },
  { name: 'R KNE', a:24, b:26, c:28 },
];

// Joint angle at b between vectors b→a and b→c. Uses 3D (x,y,z) so camera
// perspective doesn't distort the result — call with result.worldLandmarks[0]
// for metric hip-centered coords.
export const angleAt = (lms, ai, bi, ci) => {
  const a = lms[ai], b = lms[bi], c = lms[ci];
  if (!a || !b || !c) return null;
  const v1x = a.x - b.x, v1y = a.y - b.y, v1z = (a.z ?? 0) - (b.z ?? 0);
  const v2x = c.x - b.x, v2y = c.y - b.y, v2z = (c.z ?? 0) - (b.z ?? 0);
  const m1 = Math.hypot(v1x, v1y, v1z), m2 = Math.hypot(v2x, v2y, v2z);
  if (m1 === 0 || m2 === 0) return null;
  const cos = (v1x*v2x + v1y*v2y + v1z*v2z) / (m1*m2);
  return Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI;
};

// Title-regex → channel pair. Order matters — `none` first so isometric /
// carry / hold exercises skip counting. Unmatched titles default to knee.
export const CHANNEL_RULES = [
  { kind: 'none',  rx: /\b(hold|plank|l[-\s]?sit|dead[-\s]?hang|hanging|carry|farmer|iso|iso[-\s]?metric|wall[-\s]?sit|bear[-\s]?crawl|position|stretch|breath|scap)\b/i,
    channels: [] },
  { kind: 'hip',   rx: /\b(hip[-\s]?thrust|glute[-\s]?bridge|deadlift|\bdl\b|rdl|romanian|hinge|good[-\s]?morning|jefferson|clean|snatch|swing|kettlebell\s*swing|crab|reverse[-\s]?tabletop)\b/i,
    channels: ['L HIP', 'R HIP'] },
  { kind: 'knee',  rx: /\b(squat|lunge|step[-\s]?up|split[-\s]?squat|rfess|bulgarian|pistol|leg[-\s]?press|leg[-\s]?extension|leg[-\s]?curl|jump|bounce|goblet|thruster|pogo)\b/i,
    channels: ['L KNE', 'R KNE'] },
  { kind: 'elbow', rx: /\b(press|bench|push[-\s]?up|ohp|row|pull[-\s]?up|chin[-\s]?up|pulldown|curl|extension|tricep|skull|dip|pushdown|pullover|hammer)\b/i,
    channels: ['L ELB', 'R ELB'] },
  { kind: 'sho',   rx: /\b(fly|flye|raise|lateral|front[-\s]?raise|rear[-\s]?delt)\b/i,
    channels: ['L SHO', 'R SHO'] },
];
export const detectChannels = (title) => {
  const t = String(title || '');
  for (const r of CHANNEL_RULES) if (r.rx.test(t)) return { kind: r.kind, channels: r.channels };
  return { kind: 'knee', channels: ['L KNE', 'R KNE'] };
};

export const SMOOTH_N = 5;
export function medianFilter(signal, win = SMOOTH_N) {
  const half = Math.floor(win / 2);
  const out = new Array(signal.length);
  for (let i = 0; i < signal.length; i++) {
    const vals = [];
    for (let j = Math.max(0, i - half); j <= Math.min(signal.length - 1, i + half); j++) {
      const x = signal[j];
      if (x != null && Number.isFinite(x)) vals.push(x);
    }
    if (vals.length === 0) { out[i] = undefined; continue; }
    vals.sort((a, b) => a - b);
    out[i] = vals[Math.floor(vals.length / 2)];
  }
  return out;
}

export const isReal = (x) => x != null && Number.isFinite(x);

// Plateau-aware peak finder matching scipy.signal.find_peaks. Rising→flat→
// falling counts as one peak at the plateau midpoint. Strict v > prev && v >
// next misses plateau peaks that median smoothing creates.
export function findPeaks(signal, prominence, minDist) {
  const candidates = [];
  const n = signal.length;
  let i = 1;
  while (i < n - 1) {
    const v = signal[i];
    if (!isReal(v)) { i++; continue; }
    let pi = i - 1;
    while (pi >= 0 && (!isReal(signal[pi]) || signal[pi] === v)) pi--;
    if (pi < 0 || signal[pi] > v) { i++; continue; }
    let pEnd = i;
    while (pEnd + 1 < n && (!isReal(signal[pEnd + 1]) || signal[pEnd + 1] === v)) pEnd++;
    let ni = pEnd + 1;
    while (ni < n && !isReal(signal[ni])) ni++;
    if (ni >= n || signal[ni] >= v) { i = pEnd + 1; continue; }
    const peakIdx = Math.floor((i + pEnd) / 2);
    let leftMin = v;
    for (let j = pi; j >= 0; j--) { const x = signal[j]; if (!isReal(x)) continue; if (x > v) break; if (x < leftMin) leftMin = x; }
    let rightMin = v;
    for (let j = ni; j < n; j++) { const x = signal[j]; if (!isReal(x)) continue; if (x > v) break; if (x < rightMin) rightMin = x; }
    const prom = v - Math.max(leftMin, rightMin);
    if (prom >= prominence) candidates.push({ idx: peakIdx, v, prom });
    i = pEnd + 1;
  }
  const kept = [];
  for (const c of candidates) {
    while (kept.length && c.idx - kept[kept.length - 1].idx < minDist) {
      if (c.v > kept[kept.length - 1].v) kept.pop();
      else { c._drop = true; break; }
    }
    if (!c._drop) kept.push(c);
  }
  return kept;
}

// After findPeaks, drop peaks that are outliers on inter-peak spacing. A rep
// set has a roughly consistent cadence; setup / warmup / edge peaks stand out
// by having much longer gaps to their neighbors. Drop any peak whose gap to
// BOTH neighbors exceeds gapMult × median gap.
export function trimOutlierPeaks(peaks, gapMult = 2.0) {
  if (!peaks || peaks.length < 4) return peaks || [];
  const gaps = [];
  for (let i = 1; i < peaks.length; i++) gaps.push(peaks[i].idx - peaks[i - 1].idx);
  const sorted = [...gaps].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const thresh = median * gapMult;
  const kept = [];
  for (let i = 0; i < peaks.length; i++) {
    const left = i > 0 ? peaks[i].idx - peaks[i - 1].idx : Infinity;
    const right = i < peaks.length - 1 ? peaks[i + 1].idx - peaks[i].idx : Infinity;
    if (Math.min(left, right) <= thresh) kept.push(peaks[i]);
  }
  return kept;
}

// Worker-based MediaPipe. Worker is lazy-loaded once per session. Each
// countRepsForVideo shares the same worker via a pending-reply map keyed by
// a monotonic request id. Main thread owes the worker ImageBitmap frames
// (transferred, zero-copy) and a monotonic timestamp; worker returns the
// 3D world-landmark array. Heavy inference stays off main thread so UI
// and video decode run smoothly during auto-count.

let workerPromise = null;
let nextReqId = 1;
const pending = new Map(); // reqId → resolver

async function getWorker() {
  if (workerPromise) {
    try { return await workerPromise; }
    catch { workerPromise = null; }
  }
  const p = (async () => {
    const w = new Worker(new URL('./repCounterWorker.js', import.meta.url), { type: 'module' });
    w.addEventListener('message', (e) => {
      const msg = e.data;
      if (msg?.type === 'result' && pending.has(msg.id)) {
        const r = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) r.reject(new Error(msg.error));
        else r.resolve(msg);
      }
    });
    w.addEventListener('error', (e) => {
      // Reject any in-flight requests so we don't hang.
      for (const [id, r] of pending) r.reject(new Error('Worker crashed: ' + (e.message || 'unknown')));
      pending.clear();
    });
    await new Promise((resolve, reject) => {
      const onReady = (e) => {
        if (e.data?.type === 'ready') { w.removeEventListener('message', onReady); resolve(); }
        else if (e.data?.type === 'result' && e.data.error) { w.removeEventListener('message', onReady); reject(new Error(e.data.error)); }
      };
      w.addEventListener('message', onReady);
      w.postMessage({ type: 'init' });
      setTimeout(() => reject(new Error('Worker init timeout')), 30000);
    });
    return w;
  })();
  workerPromise = p;
  try { return await p; }
  catch (e) { if (workerPromise === p) workerPromise = null; throw e; }
}

// Send one frame to the worker; returns the world-landmark array (or null).
async function detectInWorker(bitmap, ts) {
  const w = await getWorker();
  const id = nextReqId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve: (msg) => resolve(msg.world || msg.landmarks || null), reject });
    try { w.postMessage({ type: 'frame', id, bitmap, ts }, [bitmap]); }
    catch (e) { pending.delete(id); reject(e); }
  });
}

// Serialize calls — MediaPipe's Landmarker is stateful per-instance and can't
// process two video streams concurrently (interleaved detectForVideo calls
// confuse internal timestamp tracking). Each countRepsForVideo awaits the
// previous one's turn.
let countChain = Promise.resolve();

// Auto-count reps on a video File/Blob OR a URL. Returns { count, kind }.
//   - source: File | Blob | string (URL)
//   - exerciseTitle: string — routed through detectChannels() to pick joint pair
//   - onProgress: optional (frac: number) → display percentage (0..1)
// If the exercise classifies as 'none' (isometric), returns count=0 immediately.
export async function countRepsForVideo(source, exerciseTitle, onProgress) {
  const { kind, channels } = detectChannels(exerciseTitle);
  if (channels.length === 0) return { count: 0, kind };
  // Queue: wait for prior caller to finish before touching the Landmarker.
  const prior = countChain;
  let releaseNext;
  countChain = new Promise((r) => { releaseNext = r; });
  try {
    await prior;
    return await runCount(source, kind, channels, onProgress);
  } finally {
    releaseNext();
  }
}

async function runCount(source, kind, channels, onProgress) {
  // Warm up the worker before we start playing video so the first frame
  // doesn't pay the MediaPipe init cost.
  await getWorker();

  // Offscreen video element; create URL if we got a File/Blob.
  const objUrl = typeof source === 'string' ? null : URL.createObjectURL(source);
  const url = objUrl || source;
  const v = document.createElement('video');
  // crossOrigin only needed for external URLs. Setting it for blob: URLs can
  // cause load failures on some browsers since blob: doesn't respond to CORS.
  if (typeof source === 'string') v.crossOrigin = 'anonymous';
  v.muted = true;
  v.playsInline = true;
  v.preload = 'auto';
  // Offscreen. No CSS width/height so the element sizes to its intrinsic
  // video dimensions — mobile browsers sometimes fail to decode into a
  // container sized smaller than the source. `left:-10000px` keeps it out
  // of view. No opacity:0 or display:none (both block autoplay on iOS).
  v.style.cssText = 'position:fixed;left:-10000px;top:0;pointer-events:none;';
  v.src = url;
  document.body.appendChild(v);

  const cleanup = () => {
    try { v.pause(); } catch {}
    try { v.remove(); } catch {}
    if (objUrl) URL.revokeObjectURL(objUrl);
  };

  await new Promise((resolve, reject) => {
    v.onloadeddata = resolve;
    v.onerror = () => reject(new Error('video load failed'));
    setTimeout(() => reject(new Error('video load timeout')), 30000);
  }).catch(e => { cleanup(); throw e; });

  const BUCKET_FPS = 30;
  const buffers = {};
  ANGLE_DEFS.forEach(d => { buffers[d.name] = []; });
  let frameCount = 0, framesWithPose = 0;

  // No canvas needed — we use createImageBitmap(video) which captures the
  // current frame as a transferable. Sent zero-copy to the worker.

  // 1x playback. MediaPipe inference runs in the worker, so main-thread
  // saturation is no longer a concern — every decoded frame gets sent off
  // for detection. Maximum signal density matches the interactive toggle.
  try { await v.play(); } catch (e) { cleanup(); throw new Error('Video playback blocked: ' + (e?.message || e)); }

  const inFlight = new Set();
  let lastTs = -1;
  const processFrame = () => {
    const ts = Math.max(performance.now(), lastTs + 0.001);
    lastTs = ts;
    frameCount++;
    const vt = v.currentTime;
    const bucket = Math.round(vt * BUCKET_FPS);
    const p = (async () => {
      let bitmap;
      try { bitmap = await createImageBitmap(v); }
      catch { return; }
      let wlms = null;
      try { wlms = await detectInWorker(bitmap, ts); }
      catch { /* worker rejected — skip this frame */ return; }
      if (!wlms) return;
      framesWithPose++;
      for (const d of ANGLE_DEFS) {
        const val = angleAt(wlms, d.a, d.b, d.c);
        buffers[d.name][bucket] = (val != null) ? val : NaN;
      }
      if (onProgress && v.duration) onProgress(Math.min(1, vt / v.duration));
    })();
    inFlight.add(p);
    p.finally(() => inFlight.delete(p));
  };

  // Loop — rVFC fires once per decoded frame; fall back to requestAnimationFrame.
  // Only exit on `ended` or safety timeout — transient `paused` (tab backgrounding,
  // decoder stall) would otherwise cut us off with partial signal and undercount.
  const usesRVFC = typeof v.requestVideoFrameCallback === 'function';
  await new Promise((resolve) => {
    let done = false;
    const finish = () => { if (done) return; done = true; resolve(); };
    const loop = () => {
      if (done) return;
      processFrame();
      if (v.ended) { finish(); return; }
      if (usesRVFC) v.requestVideoFrameCallback(loop);
      else requestAnimationFrame(loop);
    };
    v.onended = finish;
    // Safety timeout. At 4x playback wall time ≈ duration/4, but playbackRate
    // may get clamped to 1x or 2x on some browsers. 60s min, 1.5x duration ms
    // to keep comfortable headroom for 1x clamped playback on longer clips.
    const timeoutMs = Math.max(60000, (v.duration || 60) * 1500);
    setTimeout(finish, timeoutMs);
    if (usesRVFC) v.requestVideoFrameCallback(loop);
    else requestAnimationFrame(loop);
  });

  // Playback ended (or safety timeout) — drain any pending worker responses
  // so the signal buffer is complete before we findPeaks.
  await Promise.allSettled(Array.from(inFlight));

  const durationAtEnd = v.duration;
  const currentAtEnd = v.currentTime;
  cleanup();

  // Count TROUGHS (rep bottoms). Invert signal → findPeaks returns minima as
  // peaks. Every rep has exactly one flexion minimum regardless of where the
  // clip starts/ends.
  const minDist = Math.max(4, Math.round(BUCKET_FPS * 0.4));
  let best = 0;
  for (const key of channels) {
    const sig = buffers[key];
    if (!sig || sig.length < 10) continue;
    const sm = medianFilter(sig, SMOOTH_N);
    const inverted = sm.map(x => isReal(x) ? -x : x);
    const troughs = findPeaks(inverted, 25, minDist);
    // Drop outlier troughs whose gap to both neighbors is >2× the median
    // inter-trough gap. Catches edge/warmup/setup peaks that stick out
    // from a consistent rep cadence. Validated: SL hip thrust 21 → 20 exact.
    const trimmed = trimOutlierPeaks(troughs, 2.0);
    if (trimmed.length > best) best = trimmed.length;
  }
  // Diagnostic: log frame/pose counts so silent failures surface in DevTools.
  console.log(`[repCounter] ${kind} count=${best} frames=${frameCount} withPose=${framesWithPose} dur=${durationAtEnd} curT=${currentAtEnd} ended=${endedAtEnd} paused=${pausedAtEnd} ready=${readyAtEnd}`);
  return {
    count: best, kind,
    frames: frameCount, framesWithPose,
    duration: durationAtEnd, currentTime: currentAtEnd,
  };
}
