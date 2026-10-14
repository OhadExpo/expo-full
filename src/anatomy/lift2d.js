// THE BODY IS WHERE THE VIDEO SHOWS IT (13.10 #705, Ohad: "We're not close"). MediaPipe gives two readings of every
// frame: the IMAGE points (where each joint is in the picture - accurate) and the WORLD points (a 3D guess). Measured
// on his shrimp squat (c31, 15.0 s): the world points put his nose 22 cm above his hips while the video shows his head
// far above them - leaning toward the camera, the 3D guess folds the trunk. The replay was faithful to a wrong guess.
//
// So each frame is rebuilt (Taylor's monocular reconstruction, research 13.10): every bone keeps its clip length (the
// median of its world lengths); its ends sit where the PICTURE puts them (image points scaled to metres); and only the
// part the picture cannot show - how far the bone points toward or away from the camera - is solved from the bone's
// length, dz = +-sqrt(L^2 - dxy^2), the sign from the world points (held through near-flat moments so it cannot flicker).
// Output: frames shaped like MediaPipe's (worldLandmarks: x right, y down, z depth, hip-centred) - the rest of the
// pipeline (stableReplayFrames, the rig) is unchanged.
const fin = (p) => !!p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);
// parent -> child, walked from the hips outward (parents first)
const EDGES = [[23, 11], [24, 12], [11, 13], [13, 15], [12, 14], [14, 16], [23, 25], [25, 27], [24, 26], [26, 28],
  [27, 29], [27, 31], [28, 30], [28, 32], [15, 17], [15, 19], [15, 21], [16, 18], [16, 20], [16, 22]];
const FACE = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const SCALE_PTS = [11, 12, 23, 24, 25, 26, 27, 28];
const d3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const median = (a) => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); return s.length ? s[s.length >> 1] : NaN; };

// the frames within +-ms of each one, as [lo, hi] index ranges - the frames come sorted by time, so two pointers do in one
// pass what a scan of every frame per frame did (13.10 review: 5,400 frames = 0.8 s on a desktop, seconds on a phone)
function windows(times, ms) {
  const n = times.length, lo = new Int32Array(n), hi = new Int32Array(n); let a = 0, b = 0;
  for (let i = 0; i < n; i++) { while (times[a] < times[i] - ms) a++; if (b < i) b = i; while (b + 1 < n && times[b + 1] <= times[i] + ms) b++; lo[i] = a; hi[i] = b; }
  return { lo, hi };
}
export function liftFrom2D(frames, dims) {
  if (!Array.isArray(frames) || !frames.length) return frames;
  const W = dims && dims.w > 0 ? dims.w : null, H = dims && dims.h > 0 ? dims.h : null;
  if (!W || !H) return frames;   // no picture size: nothing to anchor to
  // each bone's clip length (its median 3D length)
  const L = new Map();
  for (const [a, b] of EDGES) L.set(`${a}-${b}`, median(frames.map((f) => { const w = f.worldLandmarks; return w && fin(w[a]) && fin(w[b]) ? d3(w[a], w[b]) : NaN; })));
  const LSH = median(frames.map((f) => { const w = f.worldLandmarks; return w && fin(w[11]) && fin(w[12]) ? d3(w[11], w[12]) : NaN; }));
  const sign = new Map();   // edge -> the last confident depth sign
  // THE BODY MOVES IN THE PICTURE (13.10): MediaPipe's 3D is hip-centred - a squat never went down, only the feet came
  // up to the hips. Where the hips are in the frame says how far the whole body moved, up / down and sideways: one
  // clip scale (the median metres-per-pixel) turns that into metres. (Depth - toward the camera - stays put.)
  // THE SCALE (metres per pixel) IS STEADY (13.10, c31 8.8 s: fitted per frame to MediaPipe's 3D, it shrank the whole body
  // whenever that 3D folded the trunk - the ankles came up to 11 cm under the hips while the picture shows 24): each
  // frame's fit, then the median of the fits within 1.5 s - the camera does not move; he may walk toward it.
  const fitK = frames.map((f) => {
    const w = f.worldLandmarks, l = f.landmarks; if (!w || !l || !fin(w[23]) || !fin(w[24]) || !l[23] || !l[24]) return NaN;
    const hx = (l[23].x + l[24].x) * W / 2, hy = (l[23].y + l[24].y) * H / 2, wx = (w[23].x + w[24].x) / 2, wy = (w[23].y + w[24].y) / 2;
    let num = 0, den = 0;
    for (const k of SCALE_PTS) { if (!l[k] || !fin(w[k])) continue; const ix = l[k].x * W - hx, iy = l[k].y * H - hy; num += ix * (w[k].x - wx) + iy * (w[k].y - wy); den += ix * ix + iy * iy; }
    return den > 0 && num > 0 ? num / den : NaN;
  });
  const wk = windows(frames.map((f) => f.t), 1500);
  const steadyK = frames.map((f, i) => median(fitK.slice(wk.lo[i], wk.hi[i] + 1)));
  const ks = [];
  const out = frames.map((f, fi) => {
    const w = f.worldLandmarks, l = f.landmarks;
    if (!w || !l || !fin(w[23]) || !fin(w[24]) || !l[23] || !l[24]) return f;
    const img = (k) => (l[k] && Number.isFinite(l[k].x) && Number.isFinite(l[k].y) ? { x: l[k].x * W, y: l[k].y * H } : null);
    const h2 = { x: (l[23].x + l[24].x) * W / 2, y: (l[23].y + l[24].y) * H / 2 };
    const h3 = { x: (w[23].x + w[24].x) / 2, y: (w[23].y + w[24].y) / 2, z: (w[23].z + w[24].z) / 2 };
    // metres per pixel for this frame: the least-squares fit of the world body onto the picture body
    let num = 0, den = 0;
    for (const k of SCALE_PTS) { const i = img(k); if (!i || !fin(w[k])) continue; const ix = i.x - h2.x, iy = i.y - h2.y; num += ix * (w[k].x - h3.x) + iy * (w[k].y - h3.y); den += ix * ix + iy * iy; }
    if (!(den > 0) || !(num > 0)) return f;
    const k = Number.isFinite(steadyK[fi]) ? steadyK[fi] : num / den; ks.push(k);
    const P = new Array(w.length).fill(null);
    // A COLLAPSED PICTURE IS NOT TRUSTED (13.10, c38 rear view, far: the picture put both hips, knees and ankles at one
    // spot while the 3D kept the hips 12 cm apart - the legs crossed). Where the picture's hip (or shoulder) width is
    // under half of the 3D's width across the picture, that half of the body takes the 3D's place for this frame.
    const wPlane = (a, b) => Math.hypot(w[a].x - w[b].x, w[a].y - w[b].y);
    const iPlane = (a, b) => { const A = img(a), Bq = img(b); return A && Bq ? Math.hypot(A.x - Bq.x, A.y - Bq.y) * k : 0; };
    const legsBad = fin(w[23]) && fin(w[24]) && wPlane(23, 24) > 0.08 && iPlane(23, 24) < 0.5 * wPlane(23, 24);
    const armsBad = fin(w[11]) && fin(w[12]) && wPlane(11, 12) > 0.12 && iPlane(11, 12) < 0.5 * wPlane(11, 12);
    const LEGS = new Set([23, 24, 25, 26, 27, 28, 29, 30, 31, 32]), ARMS = new Set([11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22]);
    const fromWorld = (j) => (legsBad && LEGS.has(j)) || (armsBad && ARMS.has(j));
    const inPlane = (j) => { if (fromWorld(j)) return fin(w[j]) ? { x: (w[j].x - h3.x), y: (w[j].y - h3.y) } : null; const i = img(j); return i ? { x: (i.x - h2.x) * k, y: (i.y - h2.y) * k } : null; };
    // the hips: the picture's place, the world's depth
    for (const j of [23, 24]) { const q = inPlane(j); P[j] = q ? { x: q.x, y: q.y, z: w[j].z - h3.z, visibility: w[j].visibility ?? l[j].visibility } : null; }
    for (const [a, b] of EDGES) {
      const pa = P[a], q = inPlane(b), len = L.get(`${a}-${b}`);
      if (!pa || !q || !fin(w[a]) || !fin(w[b]) || !Number.isFinite(len)) { P[b] = fin(w[b]) && pa ? { x: pa.x + (w[b].x - w[a].x), y: pa.y + (w[b].y - w[a].y), z: pa.z + (w[b].z - w[a].z), visibility: w[b].visibility ?? (l[b] && l[b].visibility) } : null; continue; }
      const dx = q.x - pa.x, dy = q.y - pa.y, dz2 = len * len - dx * dx - dy * dy;
      const wdz = w[b].z - w[a].z, key = `${a}-${b}`;
      // the sign: the world's, once it is clearly one way (over a quarter of the bone); held until it clearly turns
      let sg = sign.get(key) ?? (wdz >= 0 ? 1 : -1);
      if (Math.abs(wdz) > 0.25 * len) sg = wdz >= 0 ? 1 : -1;
      sign.set(key, sg);
      const dz = dz2 > 0 ? sg * Math.sqrt(dz2) : 0;
      P[b] = { x: q.x, y: q.y, z: pa.z + dz, visibility: w[b].visibility ?? (l[b] && l[b].visibility) };
    }
    // THE SHOULDERS KEEP THEIR WIDTH (13.10, c05 3.8-4.3 s: facing the camera, trunk level, his shoulders overlapped in
    // the picture; each was rebuilt from its own hip and they ended 5 cm apart - with no shoulder line the chest rolled
    // over and both arms swung up): under 80% of the clip's width, the two are set apart in depth - the picture's place,
    // the world's side of which one is nearer - and each arm moves with its shoulder.
    if (P[11] && P[12] && Number.isFinite(LSH) && fin(w[11]) && fin(w[12])) {
      const dx = P[12].x - P[11].x, dy = P[12].y - P[11].y, cur = Math.hypot(dx, dy, P[12].z - P[11].z), dz2 = LSH * LSH - dx * dx - dy * dy;
      if (cur < 0.8 * LSH && dz2 > 0) {
        const mz = (P[11].z + P[12].z) / 2, half = Math.sqrt(dz2) / 2 * (w[12].z - w[11].z >= 0 ? 1 : -1);
        for (const [sh, side] of [[11, -1], [12, 1]]) {
          const dz = mz + side * half - P[sh].z;
          for (const j of sh === 11 ? [11, 13, 15, 17, 19, 21] : [12, 14, 16, 18, 20, 22]) if (P[j]) P[j] = { ...P[j], z: P[j].z + dz };
        }
      }
    }
    // the face: the picture's place around the shoulders, the world's depth offsets
    const sm = P[11] && P[12] ? { z: (P[11].z + P[12].z) / 2 } : null, wsm = fin(w[11]) && fin(w[12]) ? (w[11].z + w[12].z) / 2 : null;
    for (const j of FACE) { const q = inPlane(j); P[j] = q && fin(w[j]) && sm && wsm != null ? { x: q.x, y: q.y, z: sm.z + (w[j].z - wsm), visibility: w[j].visibility ?? (l[j] && l[j].visibility) } : (fin(w[j]) ? { ...w[j] } : null); }
    return { ...f, worldLandmarks: P, _hip2: h2 };
  });
  const ksS = ks.slice().sort((x, y) => x - y), kMed = ksS.length ? ksS[ksS.length >> 1] : 0;
  if (!(kMed > 0)) return out.map(({ _hip2, ...f }) => f);
  return out.map((f) => {
    if (!f._hip2) return f;
    const { _hip2: h2, ...g } = f, dx = (h2.x - W / 2) * kMed, dy = (h2.y - H / 2) * kMed;
    return { ...g, worldLandmarks: g.worldLandmarks.map((q) => (q ? { ...q, x: q.x + dx, y: q.y + dy } : q)) };
  });
}

// A LIGHT SMOOTHER THAT KEEPS THE PEAKS (13.10): Savitzky-Golay, 5 frames, 2nd order, on every coordinate - the shared
// stabiliser's smoothing averaged a 22 cm leg lift down to nothing (c31 9.5 s); this one follows a parabola through the
// neighbours, so a fast kick, a squat bottom, a jump top keep their size and only frame-to-frame jitter goes.
const SG5 = [-3, 12, 17, 12, -3].map((c) => c / 35);
export function smoothLifted(frames) {
  const n = frames.length; if (n < 5) return frames;
  return frames.map((f, i) => {
    const w = f.worldLandmarks; if (!w || i < 2 || i > n - 3) return f;
    const nb = [-2, -1, 0, 1, 2].map((d) => frames[i + d].worldLandmarks);
    if (nb.some((x) => !x)) return f;
    return { ...f, worldLandmarks: w.map((p, k) => {
      if (!fin(p) || nb.some((x) => !fin(x[k]))) return p;
      let x = 0, y = 0, z = 0; for (let d = 0; d < 5; d++) { x += SG5[d] * nb[d][k].x; y += SG5[d] * nb[d][k].y; z += SG5[d] * nb[d][k].z; }
      return { ...p, x, y, z };
    }) };
  });
}

// THE ANATOMY'S FRAMES, ONE PIPELINE (13.10) - the replay and every gate call this, so they can never differ:
// lifted onto the picture -> left/right labels made continuous (MediaPipe swaps a crossing pair of legs frame to frame -
// c31 9.5 s - and a smoother would average the two legs into one) -> the light peak-keeping smoother -> stood upright.
// Not the shared stabiliser's smoothing or feet step (they averaged a fast leg away / pinned a lifted foot down).
import { stabilizeWorldFrames, makeSubjectGuard } from '../poseLab.js';
// A LIMB'S LABELS SWAPPED ALONE (13.10, c31 9.3-10.2 s: MediaPipe called his rear leg 'left' in one frame and 'right'
// in the next, the hips staying put - the whole-body swap test, diluted by the unswapped hips and shoulders, never fired).
// Each leg pair and arm pair is checked on its own, in the PICTURE: swapped back when the swapped reading sits under 60%
// of the distance of the kept one from the frame before. Both readings (image + world) swap together.
const LIMB_PAIRS = { leg: [[25, 26], [27, 28], [29, 30], [31, 32]], arm: [[13, 14], [15, 16], [17, 18], [19, 20], [21, 22]] };
// MediaPipe's two readings swap a limb's labels INDEPENDENTLY (13.10, c31 9.5-10.2 s: the picture called the raised rear
// foot 'right' then 'left' while the 3D kept it 'left'; swapping both together made the right thigh's length jump
// 0.30-0.43 m). So each reading is made continuous by its own evidence: the picture's labels by the picture (a raised
// foot stays the same foot), the 3D labels by the 3D (taken from the hip centre). Then the lift joins them.
// ...AGAINST A FRESH FRAME ONLY (13.10, c08 walking lunge, away then back: while he turned round the arms overlapped in
// the picture, the reference froze on the last frame they were apart - his back to the camera - and every frame after the
// turn read as 'swapped' against it: from 22 s to the end both arms crossed in front of him, the dumbbells at the groin,
// shoulder 'adduction 57'). An ARM reference over REF_MS old is no evidence: the frame is taken as MediaPipe labels it.
// The legs keep theirs: close together in a front view MediaPipe flickers their labels, and without the old reference
// c20's lunge collapsed into the floor (measured, 13.10).
const REF_MS = 500;
function continuous(frames, key, posOf, apartMin) {
  const ref = {}, refT = {};
  const apart = (arr, pairs) => { let d = 0, k = 0; for (const [a, b] of pairs) { const u = posOf(arr, a), v = posOf(arr, b); if (u && v) { d += Math.hypot(u[0] - v[0], u[1] - v[1], (u[2] || 0) - (v[2] || 0)); k++; } } return k ? d / k : 0; };
  const dd = (u, v) => Math.hypot(u[0] - v[0], u[1] - v[1], (u[2] || 0) - (v[2] || 0));
  return frames.map((f) => {
    let arr = f[key]; if (!arr) return f;
    for (const [name, pairs] of Object.entries(LIMB_PAIRS)) {
      const prev = ref[name] && (name !== 'arm' || f.t - refT[name] <= REF_MS) ? ref[name] : null;
      if (prev) {
        let keep = 0, swap = 0, used = 0;
        for (const [a, b] of pairs) { const pa = posOf(prev, a), pb = posOf(prev, b), ca = posOf(arr, a), cb = posOf(arr, b); if (!pa || !pb || !ca || !cb) continue; keep += dd(ca, pa) + dd(cb, pb); swap += dd(ca, pb) + dd(cb, pa); used++; }
        if (used >= 2 && swap < keep * 0.6) { arr = arr.slice(); for (const [a, b] of pairs) [arr[a], arr[b]] = [arr[b], arr[a]]; }
      }
      if (apart(arr, pairs) > apartMin) { ref[name] = arr; refT[name] = f.t; }
    }
    return arr === f[key] ? f : { ...f, [key]: arr };
  });
}
const img2 = (l, k) => (l[k] && Number.isFinite(l[k].x) && Number.isFinite(l[k].y) ? [l[k].x, l[k].y] : null);
const hipRel = (w, k) => { if (!w[23] || !w[24] || !w[k]) return null; return [w[k].x - (w[23].x + w[24].x) / 2, w[k].y - (w[23].y + w[24].y) / 2, w[k].z - (w[23].z + w[24].z) / 2]; };
export function fixLimbSwaps(frames) {
  return agree(continuous(continuous(frames, 'landmarks', img2, 0.04), 'worldLandmarks', hipRel, 0.12));
}
// THE TWO READINGS AGREE ON WHICH LIMB IS WHICH (13.10, c38 rear view: the picture and the 3D had a pair mirrored against
// each other, and the lift joined one leg's place in the picture to the other leg's depth - the legs crossed). MediaPipe's
// 3D x runs the same way as the picture's x, so the left-right ORDER of a pair must match in both; where the picture
// clearly orders a pair (over 3% of the frame) and the 3D orders it the other way, the 3D's labels follow the picture's.
function agree(frames) {
  return frames.map((f) => {
    const l = f.landmarks, w = f.worldLandmarks; if (!l || !w) return f;
    let W2 = w;
    for (const pairs of Object.values(LIMB_PAIRS)) {
      let same = 0, opp = 0;
      for (const [a, b] of pairs) {
        if (!l[a] || !l[b] || !w[a] || !w[b]) continue;
        const di = l[a].x - l[b].x, dw = w[a].x - w[b].x;
        if (Math.abs(di) < 0.03 || Math.abs(dw) < 0.02) continue;
        if (di * dw > 0) same++; else opp++;
      }
      if (opp >= 2 && opp > same) { if (W2 === w) W2 = w.slice(); for (const [a, b] of pairs) [W2[a], W2[b]] = [W2[b], W2[a]]; }
    }
    return W2 === w ? f : { ...f, worldLandmarks: W2 };
  });
}
// the body is HIS body: a pose somewhere he cannot have got to is another person (poseLab makeSubjectGuard) - the 3D
// body only; the counts and the angles read the capture as it is (13.10: as a capture filter it turned c40's blank
// count into a wrong 20)
export function anatomyFrames(frames, dims) {
  const guard = makeSubjectGuard();
  const other = new Set();
  const own = (frames || []).filter((f) => { if (!f || !f.landmarks || guard(f.landmarks, f.t)) return true; other.add(f.t); return false; });
  const lifted = liftFrom2D(fixLimbSwaps(own), dims).filter((f) => f && f.worldLandmarks);
  const OFF = { plantFeet: false, smooth: false, bones: false };
  const lr = stabilizeWorldFrames(lifted, { ...OFF, upright: false });
  const out = stabilizeWorldFrames(smoothLifted(lr), { ...OFF, upright: true });
  out.otherPerson = other;   // the times dropped as another person - a caller must not put its own points back there
  return out;
}
