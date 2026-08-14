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

// SIGNED deviation-from-straight at vertex b, in the 2D FILMED plane (x,y only).
// The plain interior angle (angleAt) is an acos capped at 180°, so it CANNOT
// tell the two ways a joint leaves straight apart — a knee flexing 10° and a
// knee HYPER-extending 10° both read as interior 170°. This returns 0 when the
// segments are straight/collinear-opposed, and a signed magnitude of how far
// off straight the joint is: |value| = 180 − interior, and the SIGN is the
// cross-product (z) of b→a × b→c, so the two directions get opposite signs.
// The sign is facing-dependent (a mirrored view flips it), so a caller that
// needs a fixed clinical direction (flexion vs hyperextension) must ORIENT the
// series itself (see poseLab.extendedJointRom). x,y only → honest ONLY for a
// joint moving in the filmed plane (side-on for sagittal reads).
export const signedDeviationAt = (lms, ai, bi, ci) => {
  const a = lms[ai], b = lms[bi], c = lms[ci];
  if (!a || !b || !c) return null;
  const v1x = a.x - b.x, v1y = a.y - b.y;
  const v2x = c.x - b.x, v2y = c.y - b.y;
  const m1 = Math.hypot(v1x, v1y), m2 = Math.hypot(v2x, v2y);
  if (m1 === 0 || m2 === 0) return null;
  const cos = Math.max(-1, Math.min(1, (v1x * v2x + v1y * v2y) / (m1 * m2)));
  const interior = Math.acos(cos) * 180 / Math.PI;     // 0..180
  const cross = v1x * v2y - v1y * v2x;                  // z of the 2D cross product
  const sign = cross > 0 ? 1 : (cross < 0 ? -1 : 0);
  return sign * (180 - interior);                       // 0 = straight; ± away from straight
};

// Title-regex → channel pair. Order matters — `none` first so isometric /
// carry / hold / anti-rotation exercises skip counting. An UNMATCHED title
// returns matched:false so the caller knows the channel is a fallback guess,
// not a confident read (adversarial-review 2026-08-12: a silent knee default
// on an off-catalog upper-body lift counts on a barely-moving channel).
export const CHANNEL_RULES = [
  { kind: 'none',  rx: /\b(hold|plank|l[-\s]?sit|dead[-\s]?hang|hanging|carry|farmer|iso|iso[-\s]?metric|wall[-\s]?sit|bear[-\s]?crawl|position|stretch|breath|scap|pallof|anti[-\s]?rotation|bird[-\s]?dog|dead[-\s]?bug)\b/i,
    channels: [] },
  { kind: 'hip',   rx: /\b(hip[-\s]?thrust|glute[-\s]?bridge|deadlift|\bdl\b|rdl|romanian|hinge|good[-\s]?morning|jefferson|clean|snatch|swing|kettlebell\s*swing|crab|reverse[-\s]?tabletop)\b/i,
    channels: ['L HIP', 'R HIP'] },
  { kind: 'knee',  rx: /\b(squat|lunge|step[-\s]?up|split[-\s]?squat|rfess|bulgarian|pistol|leg[-\s]?press|leg[-\s]?extension|leg[-\s]?curl|jump|bounce|goblet|thruster|pogo)\b/i,
    channels: ['L KNE', 'R KNE'] },
  { kind: 'elbow', rx: /\b(press|bench|push[-\s]?up|ohp|row|pull[-\s]?up|chin[-\s]?up|pulldown|face[-\s]?pull|curl|extension|tricep|skull|dip|pushdown|kick[-\s]?back|pullover|hammer)\b/i,
    channels: ['L ELB', 'R ELB'] },
  { kind: 'sho',   rx: /\b(fly|flye|raise|lateral|front[-\s]?raise|rear[-\s]?delt|pec[-\s]?deck|cross[-\s]?over|crossover)\b/i,
    channels: ['L SHO', 'R SHO'] },
];
export const detectChannels = (title) => {
  const t = String(title || '');
  for (const r of CHANNEL_RULES) if (r.rx.test(t)) return { kind: r.kind, channels: r.channels, matched: true };
  return { kind: 'knee', channels: ['L KNE', 'R KNE'], matched: false };
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

// Amplitude gate for real reps. After findPeaks, reject dips whose prominence
// (the ROM depth of that rep) is only a small fraction of the set's robust
// median depth — those are fidgets, re-racks, or setup twitches between real
// reps, not full reps. Mirrors the amplitude gate in poseLab.validateReps so
// the live counter and the offline camera-tools analyzer agree.
//   - refROM = median of the top 60% of prominences (robust to a couple of
//     genuine deep reps skewing the mean; ignores the shallow fakes).
//   - a rep must clear max(floor, 0.45 * refROM). floor keeps a hard 26° so a
//     set of uniformly small-ROM real reps isn't wiped out.
// With <2 peaks there's no set to compare against, so pass through unchanged.
export function filterRealPeaks(peaks, floor = 26) {
  if (!peaks || peaks.length < 2) return peaks || [];
  const proms = peaks.map(p => p.prom).sort((a, b) => b - a);
  const upper = proms.slice(0, Math.max(1, Math.ceil(proms.length * 0.6)));
  const refROM = upper[Math.floor(upper.length / 2)] || 0;
  const thr = Math.max(floor, 0.45 * refROM);
  return peaks.filter(p => p.prom >= thr);
}

// Auto-count-on-upload was removed 2026-04-24 — trash accuracy on complex
// clips made it a distraction. Trainer's interactive REPS toggle in
// WorkoutReview still uses the helpers above (detectChannels, medianFilter,
// findPeaks, SMOOTH_N) for its live counting. The high-level
// countRepsForVideo entry point, its Landmarker bootstrap, and the offscreen
// video + frame loop are gone.
