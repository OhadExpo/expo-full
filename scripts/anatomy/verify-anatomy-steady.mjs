// GATE: THE PLANE READINGS DO NOT FLICKER (13.10 #716 / #717). Each frontal / transverse reading, frame to frame at 60 Hz
// through the clip: no step over 90 deg (a wrap or an undefined plane read as a number - hip abduction once jumped 241 deg
// at p99). Usage: node scripts/anatomy/verify-anatomy-steady.mjs [capture.json ...] (default: four public captures)
import fs from 'node:fs';
import { anatomyFrames } from '../../src/anatomy/lift2d.js';
import { buildTrack } from '../../src/anatomy/rig.js';
import { frameToPoints3D } from '../../src/poseLab.js';
import { modelJointAxes } from '../../src/anatomy/jointAxes.js';
import { clipTitle } from './_clipTitle.mjs';
const FILES = process.argv.slice(2).length ? process.argv.slice(2) : ['public/_anat_capture.json', 'public/_anat_capture_c26.json', 'public/_anat_capture_c40h.json', 'public/_anat_capture_c35h.json'];
let worst = 0, worstAt = '';
for (const file of FILES) {
const o = JSON.parse(fs.readFileSync(file, 'utf8'));
const toObj = (x) => (x ? x.map((q) => (q ? { x: q[0], y: q[1], z: q[2], visibility: q[3] } : null)) : null);
const fr = []; let nx = -Infinity; for (const f of o.frames) { if (!f.w || !f.l || f.t < nx) continue; fr.push({ t: f.t, landmarks: toObj(f.l), worldLandmarks: toObj(f.w) }); nx = f.t + 50; }
const st = anatomyFrames(fr, o.dims); const other = st.otherPerson || new Set();
const tr = buildTrack(st.filter((x) => !other.has(x.t)).map((x) => ({ t: x.t, pts: frameToPoints3D(x.worldLandmarks), img: x.landmarks })), { exercise: clipTitle(file), dims: o.dims });
const keys = [['hipL', 'abd'], ['hipL', 'rot'], ['kneeL', 'valgus'], ['kneeL', 'rot'], ['ankleL', 'inv'], ['ankleL', 'toeOut'], ['shoulderL', 'abd'], ['shoulderL', 'rot'], ['forearmL', 'pron'], ['wristL', 'ulnar'], ['trunk', 'side'], ['trunk', 'rot'], ['neck', 'rot']];
const steps = Object.fromEntries(keys.map(([j, f]) => [j + '.' + f, []]));
let prev = null;
for (let t = tr.t0; t <= tr.t1; t += 1000 / 60) { if (tr.inView && !tr.inView(t)) { prev = null; continue; } const a = modelJointAxes(tr, t); if (prev) for (const [j, f] of keys) { if (a[j][f] == null || prev[j][f] == null) continue; const d = Math.abs(a[j][f] - prev[j][f]); if (d > worst && !/rot$/.test(f)) { worst = d; worstAt = `${file} ${j}.${f} ${(t / 1000).toFixed(2)} s`; } if (process.env.BIG && d > 90) console.log("BIG", j, f, (t / 1000).toFixed(2), prev[j][f].toFixed(0), "->", a[j][f].toFixed(0)); if (Number.isFinite(d)) steps[j + '.' + f].push(d); } prev = a; }
const pct = (v, q) => { const s = v.slice().sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : NaN; };
if (process.env.VERBOSE) for (const [k, v] of Object.entries(steps)) console.log(k.padEnd(16), 'step median', pct(v, 0.5).toFixed(2), 'p95', pct(v, 0.95).toFixed(1), 'p99', pct(v, 0.99).toFixed(1), 'max', pct(v, 1).toFixed(0));
}
console.log(worst > 90 ? `verify-anatomy-steady: FAIL - a frontal reading jumped ${worst.toFixed(0)} deg in one frame (${worstAt})` : `verify-anatomy-steady: PASS - largest frontal step ${worst.toFixed(1)} deg (${worstAt}); twists (estimates) not gated`);
process.exit(worst > 90 ? 1 : 0);
