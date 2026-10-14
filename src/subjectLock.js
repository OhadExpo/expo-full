// THE SUBJECT LOCK (13.10 #719, Ohad: "Focus on one person moving only with the ability to ignore the surrounding").
// MediaPipe returns up to 5 people a frame; this keeps ONE of them - the lifter - for the whole clip.
//
// What it replaces (pickSubjectIdx): a lone detection was taken with no check at all, and the remembered position
// then moved to whoever it was. c22 (a barbell RDL, a man squatting in the background): at 33.4 s the hinge hid him
// for one frame, the background man was the only detection, the picker took him - and from 33.7 to 37.1 s it kept the
// stranger although the lifter was detected again in every frame (continuity now favoured the stranger).
//
// The lock: a candidate is HIM only if he could have got there - within a tight reach of where he was (any size: a
// plate or a hinge changes his outline), or within a wide reach AND his size (a jump, a fast step). The reach grows
// with the time since he was last matched and with his size in the picture (a body-length a second). No candidate is
// him: the frame has no subject (it is dropped) and the lock stays where he was. Lost for over a second: re-acquire,
// the largest and most central person, preferring one of his size.
//
// Size = the outline's diagonal (height + width), not its height: a hinge halves his height but not his diagonal.
// Distances are in picture heights (x scaled by the aspect), so they mean the same across and down the frame.

const median = (a) => { if (!a.length) return null; const b = a.slice().sort((x, y) => x - y); return b[b.length >> 1]; };

// one person's outline: centre (of the points the model saw, when there are enough), size, centrality
export function outline(p, aspect = 1) {
  if (!p || !p.length) return null;
  const pts = p.filter((q) => q && Number.isFinite(q.x) && Number.isFinite(q.y));
  if (!pts.length) return null;
  const seen = pts.filter((q) => (q.visibility == null ? 1 : q.visibility) > 0.5);
  const use = seen.length >= 8 ? seen : pts;
  let sx = 0, sy = 0, x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const q of use) { sx += q.x; sy += q.y; x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }
  const rx = sx / use.length;
  return { cx: rx * aspect, cy: sy / use.length, diag: Math.hypot((x1 - x0) * aspect, y1 - y0), span: y1 - y0, centrality: 1 - Math.min(1, Math.abs(0.5 - rx) * 2), shape: shapeOf(p, aspect) };
}
// his POSTURE, free of where he stands and how big he is: the shoulders, elbows, wrists, hips, knees and ankles from the
// hips' middle, in torso lengths. One person's posture barely changes in a tenth of a second; two people's differ
// (c29 23.2 s: a man walking past, upright, against the lifter hinged behind the plate - their position and size said
// "the same", their postures did not)
const SHAPE = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];
function shapeOf(p, aspect) {
  if (!p || p.length < 29) return null;
  const P = (i) => (p[i] && Number.isFinite(p[i].x) ? { x: p[i].x * aspect, y: p[i].y } : null);
  const h = [P(23), P(24)], s = [P(11), P(12)]; if (h.some((q) => !q) || s.some((q) => !q)) return null;
  const hx = (h[0].x + h[1].x) / 2, hy = (h[0].y + h[1].y) / 2, L = Math.hypot((s[0].x + s[1].x) / 2 - hx, (s[0].y + s[1].y) / 2 - hy);
  if (!(L > 1e-4)) return null;
  return SHAPE.map((i) => { const q = P(i); return q ? [(q.x - hx) / L, (q.y - hy) / L] : null; });
}
export function shapeDist(a, b) {
  if (!a || !b) return 0;
  let s = 0, n = 0; for (let k = 0; k < a.length; k++) if (a[k] && b[k]) { s += Math.hypot(a[k][0] - b[k][0], a[k][1] - b[k][1]); n++; }
  return n ? s / n : 0;
}

export function makeSubjectLock({ aspect = 1, lostMs = 1000, forgetMs = 5000, same = 0.12, samePerSec = 1.0, reach = 0.1, reachPerSec = 3.0, sizeTol = 1.45, reacquireTol = 2.5, shapeW = 1.0 } = {}) {
  let ref = null; let diags = [];
  const lock = (poses, tMs) => {
    const C = []; (poses || []).forEach((p, i) => { const o = outline(p, aspect); if (o && o.diag > 0) C.push({ i, ...o }); });
    if (!C.length) return -1;
    // a long absence forgets his size: whoever is there next is acquired afresh
    if (ref && tMs - ref.t > forgetMs) { ref = null; diags = []; }
    const dref = median(diags);
    let best = null;
    if (!ref || tMs - ref.t > lostMs) {
      // acquire (the first frames) / re-acquire (lost a moment): the largest, most central person - and, while his
      // size is remembered, only one of about his size (c33: the re-acquire took the small man in the background
      // while the lifter was off the side of the picture)
      let bs = -Infinity;
      for (const c of C) {
        const r = dref ? Math.abs(Math.log(c.diag / dref)) : 0;
        if (dref && r > Math.log(reacquireTol)) continue;
        const sc = c.span + 0.5 * c.centrality - 1.5 * r; if (sc > bs) { bs = sc; best = c; }
      }
      if (!best) return -1;
    } else {
      // tracking: ANY size on the same spot (a plate or a hinge changes his outline where he stands); further, up to a
      // body-length x3 a second, only at his size (c22 33.5 s: the stranger 1.7x smaller and 0.3 picture away passed a
      // 1.7x tolerance)
      const gap = Math.max(0, tMs - ref.t) / 1000, d0 = dref || ref.diag;
      const rS = same + samePerSec * d0 * gap, rR = reach + reachPerSec * d0 * gap, lt = Math.log(sizeTol);
      let bs = Infinity;
      for (const c of C) {
        const d = Math.hypot(c.cx - ref.cx, c.cy - ref.cy), r = Math.abs(Math.log(c.diag / d0));
        if (!(d <= rS || (d <= rR && r <= lt))) continue;
        // where he could be, his size, and his posture (in torso lengths) - each a cost
        const sc = d / rR + r + shapeW * shapeDist(c.shape, ref.shape); if (sc < bs) { bs = sc; best = c; }
      }
      if (!best) return -1;   // nobody here can be him: no subject this frame, the lock stays
    }
    ref = { cx: best.cx, cy: best.cy, diag: best.diag, shape: best.shape, t: tMs };
    diags.push(best.diag); if (diags.length > 60) diags.shift();
    return best.i;
  };
  return lock;   // (a re-read the capture drops as a duplicate is the same pose: moving the lock to it is harmless)
}

// a LIVE camera loop's pick (13.10 #719b): the lifter among a MediaPipe result's people -> { landmarks, worldLandmarks }
// or null (no subject this frame). Every live tool runs numPoses 3 with it (measured on Live Coach: 38-42 fps either
// way, the same smoothness)
export const LIVE_POSES = 3;
export function pickLocked(lock, res, tMs) {
  const L = res && res.landmarks; if (!L || !L.length) return null;
  const i = lock ? lock(L, tMs) : 0;
  return i >= 0 && L[i] ? { landmarks: L[i], worldLandmarks: (res.worldLandmarks && res.worldLandmarks[i]) || null } : null;
}
// the same, for a loop that reads result.landmarks[0]: the result with ONLY the lifter in it (or nobody)
export function lockResult(lock, res, tMs) {
  if (!res) return res;
  const p = pickLocked(lock, res, tMs);
  return { ...res, landmarks: p ? [p.landmarks] : [], worldLandmarks: p && p.worldLandmarks ? [p.worldLandmarks] : [] };
}
