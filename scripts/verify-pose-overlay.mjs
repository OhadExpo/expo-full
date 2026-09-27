// verify-pose-overlay.mjs — the Movement Lab's skeleton, proven in node.
//
// Ohad, 27.9, from his phone: "head is not correct… head is turned over, and
// everything is glitchy and incorrect… that's not a squat, auto detection
// doesnt work and shouldnt be there". Each complaint is a check here:
//   1. HEAD UPRIGHT — a synthetic upright pose must render its head above the
//      shoulders, within 20° of vertical, in the 2D overlay AND the 3D view from
//      every preset. A NEGATIVE CONTROL (the same pose with its y axis flipped,
//      the classic "y-up read as y-down" mistake) must FAIL the same check, so a
//      pass means the convention is right, not that the check is blind.
//   2. NO GHOST JOINTS — a joint under 50% visibility is never drawn and no bone
//      ends at it; no face point visible → no head at all.
//   3. SMOOTHING — the One-Euro filter cuts still-pose jitter by more than half
//      while a fast limb lags by less than 3% of the frame.
//   4. NO GUESSING — an explicit "no exercise" pick counts nothing whatever the
//      title says; an unmatched title no longer falls back to the knee; and the
//      MovementLab source carries no exercise-guessing path (scanner self-tested).
// Run: node scripts/verify-pose-overlay.mjs
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  buildScene2D, buildScene3D, headTiltFromVertical, frameToPoints3D, createOneEuro, createPoseSmoother,
  ONE_EURO_IMAGE, frameAt, analyzeClip, MOVEMENTS,
} from '../src/poseLab.js';
import { detectFaults, detectAsymmetry } from '../src/poseInsights.js';
import { demoSquatFrames } from '../src/demoMotion.js';

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { if (ok) { pass++; console.log(`PASS  ${name}`); } else { fail++; console.log(`FAIL  ${name}${detail ? `  (${detail})` : ''}`); } };

// ---- a synthetic upright athlete, facing the camera ------------------------
// World (MediaPipe convention): metres, hip-centred, x right, y DOWN, z toward
// the camera negative. Image: normalised [0..1], y DOWN.
const WORLD = {
  0: [0, -0.62, -0.09], 2: [-0.03, -0.66, -0.07], 5: [0.03, -0.66, -0.07], 7: [-0.075, -0.64, 0], 8: [0.075, -0.64, 0],
  9: [-0.02, -0.58, -0.07], 10: [0.02, -0.58, -0.07],
  11: [-0.18, -0.46, 0], 12: [0.18, -0.46, 0], 13: [-0.22, -0.2, 0], 14: [0.22, -0.2, 0], 15: [-0.24, 0.04, 0], 16: [0.24, 0.04, 0],
  23: [-0.1, 0, 0], 24: [0.1, 0, 0], 25: [-0.1, 0.44, 0], 26: [0.1, 0.44, 0], 27: [-0.1, 0.86, 0], 28: [0.1, 0.86, 0],
  29: [-0.1, 0.9, 0.05], 30: [0.1, 0.9, 0.05], 31: [-0.1, 0.92, -0.12], 32: [0.1, 0.92, -0.12],
};
const mk = (tbl, map, vis = {}) => {
  const out = new Array(33).fill(null);
  for (const k of Object.keys(tbl)) { const i = Number(k); const [x, y, z] = map(tbl[k]); out[i] = { x, y, z, visibility: vis[i] ?? 0.99 }; }
  return out;
};
const worldPose = (vis) => mk(WORLD, ([x, y, z]) => [x, y, z], vis);
// Image: centre the body, ~0.85 of a portrait frame tall.
const imagePose = (vis) => mk(WORLD, ([x, y, z]) => [0.5 + x * 0.45, 0.45 + y * 0.45, z], vis);
const BOX = { ox: 0, oy: 0, dw: 720, dh: 1280 };

const mid2 = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const shoulderMid2D = (scene) => { const a = scene.joints.find(j => j.i === 11), b = scene.joints.find(j => j.i === 12); return a && b ? mid2(a, b) : (a || b); };
const shoulderMid3D = (scene) => { const a = scene.joints.find(j => j.i === 11), b = scene.joints.find(j => j.i === 12); return a && b ? { x: (a.sx + b.sx) / 2, y: (a.sy + b.sy) / 2 } : null; };

// ---- 1. HEAD UPRIGHT — 2D overlay ------------------------------------------
{
  const s = buildScene2D(imagePose(), BOX);
  const sh = shoulderMid2D(s);
  const tilt = s.head && headTiltFromVertical(sh, s.head.center);
  check('2D front view: head exists', !!s.head);
  check('2D front view: head centre ABOVE the shoulders (screen y smaller)', s.head && s.head.center.y < sh.y, s.head && `${s.head.center.y.toFixed(0)} vs ${sh.y.toFixed(0)}`);
  check('2D front view: head within 20° of vertical', tilt != null && tilt <= 20, `tilt ${tilt?.toFixed(1)}°`);
  check('2D: neck runs from the shoulder midpoint to the head edge', !!(s.head?.neck && Math.abs(s.head.neck.from.x - sh.x) < 1e-6 && s.head.neck.to.y > s.head.center.y));
  check('2D: head radius is head-sized (3–12% of frame height)', s.head && s.head.r > BOX.dh * 0.03 && s.head.r < BOX.dh * 0.12, s.head && `r ${s.head.r.toFixed(1)}px`);
  // Side-on: far ear + far eye occluded.
  const side = buildScene2D(imagePose({ 8: 0.1, 5: 0.1, 10: 0.1 }), BOX);
  const tSide = side.head && headTiltFromVertical(shoulderMid2D(side), side.head.center);
  check('2D one ear hidden (side-on): head still upright within 20°', tSide != null && tSide <= 20, `tilt ${tSide?.toFixed(1)}°`);
  // Facing away: face points weak, ears visible.
  const away = buildScene2D(imagePose({ 0: 0.1, 2: 0.1, 5: 0.1, 9: 0.1, 10: 0.1 }), BOX);
  const tAway = away.head && headTiltFromVertical(shoulderMid2D(away), away.head.center);
  check('2D facing away (only ears): head upright, no facing tick', tAway != null && tAway <= 20 && !away.head.tick, `tilt ${tAway?.toFixed(1)}°`);
}

// ---- 1b. HEAD UPRIGHT — 3D view, every preset + a sweep of orbits ----------
{
  const W = 560, H = 620;
  const presets = [['FRONT', 0, -0.05], ['SIDE', Math.PI / 2, -0.05], ['DEFAULT', 0.5, -0.05], ['BACK', Math.PI, -0.05]];
  for (let k = 0; k < 8; k++) presets.push([`orbit ${k * 45}°`, (k * Math.PI) / 4, 0.3]);
  let worst = 0, allAbove = true, allHead = true;
  for (const [, yaw, pitch] of presets) {
    const s = buildScene3D(worldPose(), { rot: { yaw, pitch }, W, H, maxR: 1 });
    if (!s.head) { allHead = false; continue; }
    const sh = shoulderMid3D(s);
    const tilt = headTiltFromVertical(sh, { x: s.head.center.sx, y: s.head.center.sy });
    worst = Math.max(worst, tilt);
    if (!(s.head.center.sy < sh.y)) allAbove = false;
  }
  check('3D: head drawn from every preset/orbit', allHead);
  check('3D: head above the shoulders from every preset/orbit', allAbove);
  check('3D: head within 20° of vertical from every preset/orbit', worst <= 20, `worst ${worst.toFixed(1)}°`);
  const pts = frameToPoints3D(worldPose());
  check('frameToPoints3D: y up (nose above hips)', pts[0].y > pts[23].y);
  check('frameToPoints3D: proper rotation (handedness kept: left shoulder stays on +x)', pts[11].x === WORLD[11][0]);
  // NEGATIVE CONTROL: feed the pose already y-up (the classic axis mix-up).
  // The identical check must now FAIL — proof it can see a turned-over head.
  const flipped = mk(WORLD, ([x, y, z]) => [x, -y, z]);
  const sf = buildScene3D(flipped, { rot: { yaw: 0, pitch: -0.05 }, W, H, maxR: 1 });
  const tf = headTiltFromVertical(shoulderMid3D(sf), { x: sf.head.center.sx, y: sf.head.center.sy });
  check('NEGATIVE CONTROL: a y-flipped pose reads as a turned-over head (>160°)', tf > 160, `tilt ${tf.toFixed(1)}°`);
  const sf2 = buildScene2D(mk(WORLD, ([x, y, z]) => [0.5 + x * 0.45, 0.45 - y * 0.45, z]), BOX);
  const tf2 = headTiltFromVertical(shoulderMid2D(sf2), sf2.head.center);
  check('NEGATIVE CONTROL: a y-flipped image pose fails the 2D check too (>160°)', tf2 > 160, `tilt ${tf2.toFixed(1)}°`);
}

// ---- 2. NO GHOST JOINTS -----------------------------------------------------
{
  const s = buildScene2D(imagePose({ 13: 0.2, 27: 0.49 }), BOX);
  check('2D: joint at visibility 0.2 is hidden, not drawn', !s.joints.some(j => j.i === 13) && s.hidden.includes(13));
  check('2D: joint at visibility 0.49 is hidden (threshold 0.5)', !s.joints.some(j => j.i === 27) && s.hidden.includes(27));
  check('2D: no bone ends at a hidden joint', !s.bones.some(b => [13, 27].includes(b.a) || [13, 27].includes(b.b)));
  check('2D: visible joints still drawn (wrist 15 kept, its elbow bone dropped)', s.joints.some(j => j.i === 15) && !s.bones.some(b => b.a === 13 && b.b === 15));
  const s3 = buildScene3D(worldPose({ 14: 0.1 }), { rot: { yaw: 0.5, pitch: -0.05 }, W: 560, H: 620 });
  check('3D: hidden joint dropped with its bones', !s3.joints.some(j => j.i === 14) && !s3.bones.some(b => b.a === 14 || b.b === 14));
  const noFace = {}; for (const i of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) noFace[i] = 0.05;
  check('2D: no face point visible → no head drawn (never a guessed head)', buildScene2D(imagePose(noFace), BOX).head === null);
  check('3D: no face point visible → no head drawn', buildScene3D(worldPose(noFace), { rot: { yaw: 0, pitch: 0 }, W: 560, H: 620 }).head === null);
}

// ---- 3. ONE-EURO SMOOTHING --------------------------------------------------
{
  let seed = 7; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const gauss = () => { let u = 0, v = 0; while (!u) u = rnd(); while (!v) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const f = createOneEuro(ONE_EURO_IMAGE);
  const raw = [], out = [];
  for (let i = 0; i < 300; i++) { const x = 0.5 + gauss() * 0.004; raw.push(x); out.push(f.filter(x, i / 30)); }
  const sd = (a) => { const s = a.slice(30); const m = s.reduce((p, q) => p + q, 0) / s.length; return Math.sqrt(s.reduce((p, q) => p + (q - m) ** 2, 0) / s.length); };
  check('One-Euro: still-pose jitter cut by more than half', sd(out) < sd(raw) * 0.5, `raw sd ${sd(raw).toFixed(4)} → ${sd(out).toFixed(4)}`);
  const g = createOneEuro(ONE_EURO_IMAGE);
  let lag = 0;
  for (let i = 0; i <= 30; i++) { const x = 0.2 + 1.0 * (i / 30); const y = g.filter(x, i / 30); if (i >= 15) lag = Math.max(lag, Math.abs(y - x)); }
  check('One-Euro: a fast limb (1 frame-height/s) lags < 3% of the frame', lag < 0.03, `max lag ${lag.toFixed(4)}`);
  const sm = createPoseSmoother(ONE_EURO_IMAGE);
  sm.smooth(imagePose(), 0);
  const moved = imagePose({ 13: 0.1 }); moved[13] = { ...moved[13], x: 0.9 };
  const r = sm.smooth(moved, 33);
  check('Pose smoother: an invisible point passes through untouched (renderer hides it)', r[13].x === 0.9);
  const back = imagePose(); back[13] = { ...back[13], x: 0.1 };
  const r2 = sm.smooth(back, 66);
  check('Pose smoother: a point that reappears starts where it IS (filter reset)', Math.abs(r2[13].x - 0.1) < 1e-9);
}

// ---- frame lookup for the video-synced overlay ------------------------------
{
  const fr = [0, 33, 66, 100, 400].map(t => ({ t }));
  check('frameAt: nearest frame', frameAt(fr, 60, 120).t === 66);
  check('frameAt: nothing inside the gap → null (no stale skeleton)', frameAt(fr, 250, 120) === null);
}

// ---- 4. NO GUESSING ----------------------------------------------------------
{
  const frames = demoSquatFrames(3, 20, 2);
  const neutral = analyzeClip(frames, 'Back Squat', { movement: null });
  check('explicit "no exercise": title ignored, nothing counted', neutral.ok && neutral.counted === false && neutral.repCount === 0 && neutral.velocity === null && neutral.kind === null);
  check('explicit "no exercise": joint ROM + speed trace still measured', Array.isArray(neutral.jointRom) && neutral.jointRom.length > 0 && !!neutral.barSpeed);
  const picked = analyzeClip(frames, '', { movement: 'squat' });
  check('explicit pick "squat" on an EMPTY title counts the 3 reps', picked.repCount === 3, `got ${picked.repCount}`);
  const unmatched = analyzeClip(frames, 'Zercher Walkabout');
  check('unmatched logged title → no knee fallback, nothing counted', unmatched.counted === false && unmatched.repCount === 0);
  check('logged title that maps (Back Squat) still counts for Workout Review', analyzeClip(frames, 'Back Squat').repCount === 3);
  const knee110 = { ok: true, jointRom: [{ name: 'L KNE', minDeg: 110, maxDeg: 175, romDeg: 65 }, { name: 'R KNE', minDeg: 110, maxDeg: 175, romDeg: 65 }] };
  check('detectFaults: explicit none ignores a "Back Squat" title (no depth fault)', !detectFaults(knee110, 'Back Squat', { movement: null }).faults.some(f => /Stopping high/.test(f.msg)));
  check('detectFaults: explicit squat pick runs the depth check', detectFaults(knee110, '', { movement: 'squat' }).faults.some(f => /Stopping high/.test(f.msg)));
  const knees = [{ name: 'L KNE', romDeg: 100 }, { name: 'R KNE', romDeg: 120 }];
  check('detectAsymmetry: explicit none ignores a unilateral-sounding title', detectAsymmetry(knees, 'Bulgarian Split Squat', { movement: null })?.unilateral !== true);
  check('MOVEMENTS: every entry is explicit (key, label, channels)', MOVEMENTS.every(m => m.key && m.label && Array.isArray(m.channels) && m.channels.length === 2));

  // Source scan: MovementLab must not guess the movement anywhere.
  const here = dirname(fileURLToPath(import.meta.url));
  const src = fs.readFileSync(join(here, '..', 'src', 'MovementLab.jsx'), 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
  const GUESS = [
    [/exerciseTitle\s*=\s*['"]Squat['"]/, "default exercise 'Squat'"],
    [/\bisBallistic\s*\(/, 'isBallistic(title)'],
    [/\bdetectChannels\s*\(/, 'detectChannels(title)'],
    [/\bmovementRepCount\s*\(/, 'flight-count override chosen from the title'],
    [/\bisReactive\b/, 'reactive-jump auto-detect'],
    [/\\b\(pogo\|drop/, 'jump-type title regex'],
    [/AnatomyModelViewer/, 'the anatomy rig with the turned-over skull'],
    [/analyzeClip\(\s*frames\s*,\s*exerciseTitle\s*\)/, 'analyzeClip without an explicit movement'],
  ];
  const scan = (text) => GUESS.filter(([rx]) => rx.test(text)).map(([, what]) => what);
  // Self-test: the scanner must catch a planted guess, or its silence means nothing.
  check('source scanner self-test catches a planted isBallistic(title)', scan("const x = isBallistic(exerciseTitle);").length === 1);
  const hits = scan(code);
  check('MovementLab.jsx: no exercise-guessing path', hits.length === 0, hits.join(', '));
  const calls = [...code.matchAll(/analyzeClip\(/g)].length;
  const explicitCalls = [...code.matchAll(/analyzeClip\([^)]*\{\s*movement:/g)].length;
  check('MovementLab.jsx: every analyzeClip call passes an explicit movement', calls > 0 && calls === explicitCalls, `${explicitCalls}/${calls}`);
  check("MovementLab.jsx: the pick starts EMPTY (no default exercise)", /\[movementKey, setMovementKey\]\s*=\s*useState\(''\)/.test(code));
}

console.log(`\n${fail ? '✗' : '✓'} POSE OVERLAY — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
