// Port of the EXACT findPeaks + medianFilter logic from src/WorkoutReview.jsx.
// Feed it the CSV produced by extract_signal.py. If the counts match what
// scipy reported (21 L_HIP / 24 R_HIP at prominence=20°), the JS algorithm
// is correct and the problem is UI/state. If not, my port has a bug.

const fs = require('fs');
const path = require('path');

// ---- ported from src/WorkoutReview.jsx ----
const SMOOTH_N = 5;
function medianFilter(signal, win = SMOOTH_N) {
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
const isReal = (x) => x != null && Number.isFinite(x);
// Plateau-aware local max: a peak is the rising→flat→falling shape. scipy's
// find_peaks picks the middle of any plateau. Walk the signal once, for each
// position find the extent of any plateau at that value, confirm left
// strictly < v and right strictly < v, emit the plateau midpoint.
function findPeaks(signal, prominence, minDist) {
  const candidates = [];
  const n = signal.length;
  let i = 1;
  while (i < n - 1) {
    const v = signal[i];
    if (!isReal(v)) { i++; continue; }
    // Scan left past NaN and equal values until we hit a different real.
    let pi = i - 1;
    while (pi >= 0 && (!isReal(signal[pi]) || signal[pi] === v)) pi--;
    if (pi < 0 || signal[pi] > v) { i++; continue; }
    // Left side is strictly lower. Now find right edge of the plateau-at-v.
    let pEnd = i;
    while (pEnd + 1 < n && (!isReal(signal[pEnd + 1]) || signal[pEnd + 1] === v)) pEnd++;
    // Right neighbor beyond plateau
    let ni = pEnd + 1;
    while (ni < n && !isReal(signal[ni])) ni++;
    if (ni >= n || signal[ni] >= v) { i = pEnd + 1; continue; }
    // Confirmed peak. Midpoint of plateau is the representative index.
    const peakIdx = Math.floor((i + pEnd) / 2);
    // Prominence walk: left until something > v, right until something > v.
    let leftMin = v;
    for (let j = pi; j >= 0; j--) { const x = signal[j]; if (!isReal(x)) continue; if (x > v) break; if (x < leftMin) leftMin = x; }
    let rightMin = v;
    for (let j = ni; j < n; j++) { const x = signal[j]; if (!isReal(x)) continue; if (x > v) break; if (x < rightMin) rightMin = x; }
    const prom = v - Math.max(leftMin, rightMin);
    if (prom >= prominence) candidates.push({ idx: peakIdx, v, prom });
    i = pEnd + 1;
  }
  // Dedup by minDist — keep taller.
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

// ---- load CSV ----
const csvPath = path.join(__dirname, 'sl-hip-thrust.csv');
if (!fs.existsSync(csvPath)) {
  console.error('missing', csvPath, '— run extract_signal.py first');
  process.exit(1);
}
const lines = fs.readFileSync(csvPath, 'utf8').trim().split(/\r?\n/);
const headers = lines[0].split(',');
const cols = Object.fromEntries(headers.map(h => [h, []]));
for (const line of lines.slice(1)) {
  const parts = line.split(',');
  headers.forEach((h, i) => {
    const v = parts[i];
    cols[h].push(v === '' || v === undefined ? NaN : Number(v));
  });
}
const t = cols['t'];
const fps = t.length / t[t.length - 1];
console.log(`samples: ${t.length}, fps: ${fps.toFixed(2)}`);

// ---- simulate live bucketing ----
// In the live detector, each MediaPipe frame writes to bucket = round(vt * 30).
// For a 24.9fps clip into 30fps buckets, some buckets stay undefined.
// Rebucket the CSV and report what findPeaks sees.
const BUCKET_FPS = 30;
const bucketed = {};
for (const key of ['L_HIP', 'R_HIP', 'L_KNE', 'R_KNE', 'L_ELB', 'R_ELB', 'L_SHO', 'R_SHO']) {
  const arr = [];
  for (let i = 0; i < t.length; i++) {
    const b = Math.round(t[i] * BUCKET_FPS);
    arr[b] = cols[key][i];
  }
  bucketed[key] = arr;
}

console.log('\ndirect CSV-sample peak detection (no bucketing, raw arrays):');
for (const key of ['L_HIP', 'R_HIP']) {
  const sm = medianFilter(cols[key], SMOOTH_N);
  const peaks = findPeaks(sm, 20, Math.round(fps * 0.4));
  console.log(`  ${key}: ${peaks.length} peaks`);
}

console.log('\nBUCKETED (what the live detector actually sees — 30fps buckets):');
for (const key of ['L_HIP', 'R_HIP', 'L_KNE', 'R_KNE']) {
  const sig = bucketed[key];
  const nonNan = sig.filter(x => isReal(x)).length;
  const holes = sig.length - nonNan;
  console.log(`  ${key}: ${sig.length} bucket slots, ${nonNan} real, ${holes} gaps`);
  const sm = medianFilter(sig, SMOOTH_N);
  const peaks = findPeaks(sm, 20, Math.max(4, Math.round(BUCKET_FPS * 0.4)));
  console.log(`    → ${peaks.length} peaks`);
}

console.log('\nlower prominence sweep (bucketed, L_HIP):');
for (const p of [5, 10, 15, 20, 25, 30]) {
  const sm = medianFilter(bucketed['L_HIP'], SMOOTH_N);
  const peaks = findPeaks(sm, p, Math.max(4, Math.round(BUCKET_FPS * 0.4)));
  console.log(`  prominence=${p}: ${peaks.length} peaks`);
}

// Inspect WHY direct CSV returns only 5 peaks when scipy said 21 at same params.
console.log('\n--- Debug: candidates found in raw L_HIP signal ---');
{
  const sig = medianFilter(cols['L_HIP'], SMOOTH_N);
  let localMaxCount = 0, neighborRejected = 0, promRejected = 0, kept = 0;
  const prominence = 20;
  const NEIGHBOR_MAX = 3;
  for (let i = 1; i < sig.length - 1; i++) {
    const v = sig[i];
    if (!isReal(v)) continue;
    let pi = i - 1; while (pi >= 0 && !isReal(sig[pi])) pi--;
    let ni = i + 1; while (ni < sig.length && !isReal(sig[ni])) ni++;
    if (pi < 0 || ni >= sig.length) continue;
    if (v <= sig[pi] || v <= sig[ni]) continue;
    localMaxCount++;
    if (i - pi > NEIGHBOR_MAX || ni - i > NEIGHBOR_MAX) { neighborRejected++; continue; }
    let leftMin = v;
    for (let j = pi; j >= 0; j--) { const x = sig[j]; if (!isReal(x)) continue; if (x > v) break; if (x < leftMin) leftMin = x; }
    let rightMin = v;
    for (let j = ni; j < sig.length; j++) { const x = sig[j]; if (!isReal(x)) continue; if (x > v) break; if (x < rightMin) rightMin = x; }
    const prom = v - Math.max(leftMin, rightMin);
    if (prom < prominence) { promRejected++; continue; }
    kept++;
  }
  console.log(`  local maxima: ${localMaxCount}`);
  console.log(`  rejected by NEIGHBOR_MAX: ${neighborRejected}`);
  console.log(`  rejected by prominence<${prominence}: ${promRejected}`);
  console.log(`  passed both: ${kept}`);
}
