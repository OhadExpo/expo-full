// poseOverlay.js - THE on-video pose overlay, one engine for every surface that draws a body over a clip or a camera
// (14.10 #764 / #766, Ohad: "Include ankle and wrist joint with the arm/foot and make sure it's perfect. Smooth. No
// glitching and sits perfectly on the body on any frame" + "both tools ready to use in every single place").
//
// Two tools, drawn by one call:
//   SKELETON      - the body's lines: torso, arms on to the hand (wrist -> knuckles), legs on to the foot (ankle, heel,
//                   toe), a white dot at every joint drawn
//   JOINT ANGLES  - each joint's angle, at that joint: shoulders, elbows, wrists, hips, knees, ankles (3D world points,
//                   so the camera's perspective does not bend the number)
//
// What makes it steady (measured by scripts/verify-review-overlay.mjs):
//   - One-Euro per coordinate in the CLIP'S time (still at rest, no lag when the body moves fast); a seek back, or a
//     jump of more than a quarter second, starts every filter from where the body IS
//   - a joint changes state only after its confidence has stayed across the line for a while (on: 0.5+ for 0.12 s;
//     off: under 0.3 for 0.35 s), so a wrist at the edge of the camera's confidence does not blink
//   - a label keeps its place while that place is clear, and its number moves on a change of 2 degrees or more
// Display only: counting and analysis keep reading the raw landmarks.

import { ANGLE_DEFS, angleAt } from './repCounter';

export const HAND_L = 33, HAND_R = 34;
const BODY = [
  [11, 12], [11, 23], [12, 24], [23, 24],   // torso
  [11, 13], [13, 15], [15, HAND_L],         // left arm + hand
  [12, 14], [14, 16], [16, HAND_R],         // right arm + hand
  [23, 25], [25, 27], [27, 29], [29, 31], [27, 31],   // left leg + foot: ankle - heel - toe
  [24, 26], [26, 28], [28, 30], [30, 32], [28, 32],   // right leg + foot
];
export const OVERLAY_CONNECTIONS = BODY;
export const OVERLAY_ANGLES = [
  ...ANGLE_DEFS,
  { name: 'L WRI', a: 13, b: 15, c: HAND_L }, { name: 'R WRI', a: 14, b: 16, c: HAND_R },
  { name: 'L ANK', a: 25, b: 27, c: 31 }, { name: 'R ANK', a: 26, b: 28, c: 32 },
];

// the knuckle point: the middle of the index and pinky landmarks, as visible as the weaker of the two
export const withHands = (l) => {
  if (!l) return l;
  const mid = (i, j) => (l[i] && l[j] ? { x: (l[i].x + l[j].x) / 2, y: (l[i].y + l[j].y) / 2, z: ((l[i].z ?? 0) + (l[j].z ?? 0)) / 2,
    visibility: Math.min(l[i].visibility ?? 1, l[j].visibility ?? 1) } : null);
  const out = l.slice(0, 33); out[HAND_L] = mid(17, 19); out[HAND_R] = mid(18, 20); return out;
};

const oeA = (cut, dt) => 1 / (1 + 1 / (2 * Math.PI * cut * dt));
function makeSmoother({ minCutoff = 1, beta = 12, dCutoff = 1 } = {}) {
  let bank = [], tPrev = null;
  return {
    smooth(lms, t) {
      if (!lms) return lms;
      if (tPrev == null || t < tPrev || t - tPrev > 0.25) bank = [];
      const dt = tPrev == null ? 0 : t - tPrev;
      tPrev = t;
      return lms.map((p, i) => {
        if (!p) return p;
        if ((p.visibility ?? 1) < 0.2) { bank[i] = null; return p; }   // a joint the camera lost restarts where it reappears
        const prev = bank[i];
        if (!prev || !(dt > 0)) {
          if (!prev) bank[i] = { x: p.x, y: p.y, z: p.z ?? 0, dx: 0, dy: 0, dz: 0 };
          return prev ? { ...p, x: prev.x, y: prev.y, z: p.z == null ? p.z : prev.z } : p;
        }
        const f = (k) => {
          const aD = oeA(dCutoff, dt);
          const dHat = aD * (((p[k] ?? 0) - prev[k]) / dt) + (1 - aD) * prev['d' + k];
          const a = oeA(minCutoff + beta * Math.abs(dHat), dt);
          prev['d' + k] = dHat; prev[k] = a * (p[k] ?? 0) + (1 - a) * prev[k];
          return prev[k];
        };
        return { ...p, x: f('x'), y: f('y'), z: p.z == null ? p.z : f('z') };
      });
    },
    reset() { bank = []; tPrev = null; },
  };
}

// One overlay per player / camera. update() once per frame with that frame's landmarks and its time in seconds (the
// clip's time for a video, performance.now()/1000 for a live camera), then draw().
export function createPoseOverlay() {
  const smImg = makeSmoother({ minCutoff: 1, beta: 12 }), smWld = makeSmoother({ minCutoff: 1, beta: 4 });
  let shown = [], since = [], slotOf = {}, valOf = {}, sl = null, swl = null;
  const isShown = (i, p, t) => {
    const vis = p ? (p.visibility ?? 1) : 0;
    const want = shown[i] ? vis >= 0.3 : vis >= 0.5;
    if (want === !!shown[i]) { since[i] = null; return !!shown[i]; }
    if (since[i] == null || t < since[i]) since[i] = t;
    if (shown[i] == null || t - since[i] >= (shown[i] ? 0.35 : 0.12)) { shown[i] = want; since[i] = null; }
    return !!shown[i];
  };
  const on = (i) => !!(sl && sl[i] && shown[i]);
  return {
    update(lms, world, t) {
      if (!lms) { sl = null; swl = null; return null; }
      sl = smImg.smooth(withHands(lms), t);
      // world points carry no visibility in every build - borrow the 2D landmark's
      const w = world ? world.map((q, i) => (q && q.visibility == null && lms[i] ? { ...q, visibility: lms[i].visibility } : q)) : lms;
      swl = smWld.smooth(withHands(w), t);
      for (let i = 0; i < sl.length; i++) isShown(i, sl[i], t);
      return sl;
    },
    get points() { return sl; },
    isOn: on,
    reset() { smImg.reset(); smWld.reset(); shown = []; since = []; slotOf = {}; valOf = {}; sl = null; swl = null; },
    // px / py map a landmark to canvas units (each surface letterboxes / mirrors its own way); w / h = the canvas in those
    // units. Sizes scale with w, so a native-resolution canvas shown small reads the same as a CSS-sized one.
    // dots: a white dot at each measured joint when the skeleton is off (false where the surface draws its own skeleton)
    draw(ctx, { w, h, px, py, skeleton = true, angles = false, lineW, dots = true }) {
      if (!sl || (!skeleton && !angles)) return;
      const skW = lineW || Math.max(4, Math.round(w * 0.006));
      if (skeleton) {
        const segs = BODY.filter(([i, j]) => on(i) && on(j));
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        for (const [col, lw] of [['rgba(0,0,0,0.45)', skW + 3], ['#39BDFF', skW]]) {
          ctx.strokeStyle = col; ctx.lineWidth = lw;
          for (const [i, j] of segs) { ctx.beginPath(); ctx.moveTo(px(sl[i]), py(sl[i])); ctx.lineTo(px(sl[j]), py(sl[j])); ctx.stroke(); }
        }
        ctx.fillStyle = '#FFFFFF';
        const dots = new Set(); for (const [i, j] of segs) { dots.add(i); dots.add(j); }
        for (const i of dots) { ctx.beginPath(); ctx.arc(px(sl[i]), py(sl[i]), skW * 0.85, 0, 2 * Math.PI); ctx.fill(); }
      }
      if (angles) {
        // the pill scales with the BODY on screen, not the frame: a small figure far from the camera got pills bigger than
        // its limbs, crowded off their joints (the shot analyzer, 14.10); never under 9px, never over 2.2% of the width
        const ys = [11, 12, 27, 28].filter(on).map((i) => py(sl[i]));
        const bodyH = ys.length >= 2 ? Math.max(...ys) - Math.min(...ys) : h * 0.6;
        const fs = Math.max(9, Math.min(Math.round(w * 0.022), Math.round(bodyH * 0.07))), padX = Math.round(fs * 0.45), bh = Math.round(fs * 1.55);
        const midX = [11, 12, 23, 24].every(on) ? (px(sl[11]) + px(sl[12]) + px(sl[23]) + px(sl[24])) / 4 : w / 2;
        // a number reads left to right in every language: on a Hebrew (RTL) page the canvas inherits rtl and drew "°22"
        ctx.direction = 'ltr';
        ctx.font = `700 ${fs}px Nord, Heebo, sans-serif`; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
        const placed = [];
        for (const d of OVERLAY_ANGLES) {
          if (!on(d.a) || !on(d.b) || !on(d.c)) continue;
          const raw = angleAt(swl, d.a, d.b, d.c);
          if (raw == null) continue;
          if (valOf[d.name] == null || Math.abs(raw - valOf[d.name]) >= 2) valOf[d.name] = Math.round(raw);
          const j = sl[d.b], jx = px(j), jy = py(j), txt = `${valOf[d.name]}°`;
          const bw = Math.ceil(ctx.measureText(txt).width) + padX * 2;
          const side = jx < midX ? -1 : 1, gap = Math.round(fs * 0.9);
          // never on top of another pill: outward first, then above, below, inward, then outward stepping down
          const out = jx + side * gap + (side < 0 ? -bw : 0), inw = jx - side * gap + (side > 0 ? -bw : 0);
          const cands = [[out, jy - bh / 2], [jx - bw / 2, jy - gap - bh], [jx - bw / 2, jy + gap], [inw, jy - bh / 2]];
          for (let k = 1; k <= 4; k++) cands.push([out, jy - bh / 2 + k * (bh + 3)], [out, jy - bh / 2 - k * (bh + 3)]);
          const fit = ([x, y]) => [Math.max(2, Math.min(w - bw - 2, x)), Math.max(2, Math.min(h - bh - 2, y))];
          const hits = ([x, y]) => placed.some((q) => x < q[0] + q[2] + 2 && q[0] < x + bw + 2 && y < q[1] + q[3] + 2 && q[1] < y + bh + 2);
          const order = slotOf[d.name] != null ? [slotOf[d.name], ...cands.keys()] : [...cands.keys()];
          let pick = 0;
          for (const k of order) { if (!hits(fit(cands[k]))) { pick = k; break; } }
          slotOf[d.name] = pick;
          const [bx, by] = fit(cands[pick]);
          placed.push([bx, by, bw, bh]);
          // a pill moved off its joint keeps a thin line back to it, so every number still points at its joint
          if (pick > 3) {
            const cx = Math.max(bx, Math.min(bx + bw, jx)), cy = Math.max(by, Math.min(by + bh, jy));
            ctx.strokeStyle = 'rgba(57,189,255,0.8)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(jx, jy); ctx.lineTo(cx, cy); ctx.stroke();
          }
          if (!skeleton && dots) { ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.arc(jx, jy, Math.max(3, fs * 0.28), 0, 2 * Math.PI); ctx.fill(); }
          ctx.fillStyle = 'rgba(10,10,11,0.78)'; ctx.fillRect(bx, by, bw, bh);
          ctx.strokeStyle = '#39BDFF'; ctx.lineWidth = Math.max(1, Math.round(fs / 14)); ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
          ctx.fillStyle = '#FFFFFF'; ctx.fillText(txt, bx + bw / 2, by + bh / 2 + 1);
        }
      }
    },
  };
}
