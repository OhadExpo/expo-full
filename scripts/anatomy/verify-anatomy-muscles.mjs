// GATE: DO THE MUSCLES TEAR? (13.10, D3: in deep flexion long strands spiked out of the hip, knee and feet). The baked
// muscle mesh (public/anatomy/body.glb) is skinned here exactly as the replay does it - each vertex the weighted sum of
// its segments' rig.segMatrix - at the clip's deepest knee / hip moments, and every triangle edge's stretch (posed length
// over rest length) is counted. A spike is an edge stretched over 2.5x. Reported per clip and per muscle (top 12).
// SLIDE (the opposite fault - smoothing the weights too far would let a muscle slide off its bone): how far each posed
// vertex sits from where its main segment alone would carry it, cm, median / p95 over the muscle vertices.
// OFF THE BONE (the fault the two above miss - a whole muscle that follows the wrong segment, e.g. a hamstring left with
// the pelvis while the thigh flexes 110 degrees, streams out behind the hips with no edge stretched): each sampled muscle
// vertex's distance to the nearest bone surface, posed, less the same at rest - cm, p95, and the share over 5 cm.
import fs from 'node:fs';
import os from 'node:os';
import { Vector3, Quaternion, Matrix4 } from 'three';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dequantize } from '@gltf-transform/functions';
import { MeshoptDecoder } from 'meshoptimizer';
import { frameToPoints3D } from '../../src/poseLab.js';
import { buildTrack, sampleTrack, fk, segMatrix, modelAngles, PIVOT, NSEG } from '../../src/anatomy/rig.js';
import { anatomyFrames } from '../../src/anatomy/lift2d.js';
import REST from '../../src/anatomy/restJoints.js';
import { clipTitle } from './_clipTitle.mjs';

const GLB = process.env.GLB || 'public/anatomy/body.glb', SPIKE = +(process.env.SPIKE || 2.5);
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(GLB); await doc.transform(dequantize());
const parts = [];
for (const node of doc.getRoot().listNodes()) {
  if (!/^muscle-/.test(node.getName()) || !node.getMesh()) continue;
  const M = new Matrix4().fromArray(node.getWorldMatrix());
  for (const prim of node.getMesh().listPrimitives()) {
    const P = prim.getAttribute('POSITION').getArray(), J = prim.getAttribute('JOINTS_0').getArray(), W = prim.getAttribute('WEIGHTS_0').getArray(), I = prim.getIndices().getArray();
    const MID = prim.getAttribute('_MUSCLE') ? prim.getAttribute('_MUSCLE').getArray() : null;
    const nv = P.length / 3, pos = new Float32Array(nv * 3), v = new Vector3();
    for (let i = 0; i < nv; i++) { v.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]).applyMatrix4(M); pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z; }
    // the unique edges, with their rest lengths
    const es = new Set(), E = [];
    for (let t = 0; t < I.length; t += 3) for (const [a, b] of [[I[t], I[t + 1]], [I[t + 1], I[t + 2]], [I[t + 2], I[t]]]) { const k = a < b ? a * 1e7 + b : b * 1e7 + a; if (es.has(k)) continue; es.add(k); E.push(a, b); }
    const rest = new Float32Array(E.length / 2);
    for (let e = 0; e < rest.length; e++) { const a = E[e * 2], b = E[e * 2 + 1]; rest[e] = Math.hypot(pos[a * 3] - pos[b * 3], pos[a * 3 + 1] - pos[b * 3 + 1], pos[a * 3 + 2] - pos[b * 3 + 2]); }
    parts.push({ name: node.getName(), pos, J, W, E: Uint32Array.from(E), rest, MID, nv });
  }
}
// the bones, rigid on their own segment (every 3rd vertex), and a 3 cm grid to find the nearest one
const bonesP = [];
for (const node of doc.getRoot().listNodes()) {
  if (!/^bone-/.test(node.getName()) || !node.getMesh()) continue;
  const M = new Matrix4().fromArray(node.getWorldMatrix()), v = new Vector3();
  for (const prim of node.getMesh().listPrimitives()) { const P = prim.getAttribute('POSITION').getArray(), J = prim.getAttribute('JOINTS_0').getArray(); for (let i = 0; i < P.length / 3; i += 3) { v.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]).applyMatrix4(M); bonesP.push(v.x, v.y, v.z, J[i * 4]); } }
}
const CELL = 0.03;
const grid = (pts) => { const g = new Map(); for (let i = 0; i < pts.length; i += 3) { const k = `${Math.floor(pts[i] / CELL)},${Math.floor(pts[i + 1] / CELL)},${Math.floor(pts[i + 2] / CELL)}`; let a = g.get(k); if (!a) g.set(k, (a = [])); a.push(i); } return g; };
const nearest = (g, pts, x, y, z, R) => { const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL), cz = Math.floor(z / CELL), r = Math.ceil(R / CELL); let best = R; for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) for (let dz = -r; dz <= r; dz++) { const a = g.get(`${cx + dx},${cy + dy},${cz + dz}`); if (!a) continue; for (const i of a) { const d = Math.hypot(pts[i] - x, pts[i + 1] - y, pts[i + 2] - z); if (d < best) best = d; } } return best; };
const restBones = new Float32Array(bonesP.length / 4 * 3); for (let i = 0; i < bonesP.length / 4; i++) { restBones[i * 3] = bonesP[i * 4]; restBones[i * 3 + 1] = bonesP[i * 4 + 1]; restBones[i * 3 + 2] = bonesP[i * 4 + 2]; }
const gRest = grid(restBones);
// sampled muscle vertices (every 6th) with their rest distance to bone (those within 9 cm of one)
for (const p of parts) { p.samp = []; for (let i = 0; i < p.nv; i += 6) { const d = nearest(gRest, restBones, p.pos[i * 3], p.pos[i * 3 + 1], p.pos[i * 3 + 2], 0.09); if (d < 0.09) p.samp.push(i, d); } }
const offAll = [], offBy = new Map();
const DIR = process.env.DIR || os.homedir() + '/expo-private-backups/set-clips/captures-full';
const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.json')).filter((f) => !process.env.ONLY || f.startsWith(process.env.ONLY));
const toObj = (a) => a.map((q) => (q ? { x: q[0], y: q[1], z: q[2], visibility: q[3] } : null));
const byMuscle = new Map(); let tot = 0, totE = 0; const slideAll = [];
for (const f of files) {
  const o = JSON.parse(fs.readFileSync(`${DIR}/${f}`, 'utf8'));
  const raw = []; let next = -Infinity;
  for (const fr of o.frames) { if (!fr.w || !fr.l || fr.t < next) continue; raw.push({ t: fr.t, landmarks: toObj(fr.l), worldLandmarks: toObj(fr.w) }); next = fr.t + 100; }
  const st = anatomyFrames(raw, o.dims); if (st.length < 10) continue;
  const tr = buildTrack(st.map((x) => ({ t: x.t, pts: frameToPoints3D(x.worldLandmarks), img: x.landmarks })), { exercise: clipTitle(f), dims: o.dims });
  // the deepest moments: the 6 smallest knee angles + the 6 smallest hip angles (in view)
  const cand = [];
  for (let t = tr.t0; t <= tr.t1; t += 100) {
    if (!tr.inView(t)) continue; const a = modelAngles(tr, t); if (!a) continue;
    cand.push({ t, kn: Math.min(a.kneeL?.v ?? 999, a.kneeR?.v ?? 999), hp: Math.min(a.hipL?.v ?? 999, a.hipR?.v ?? 999) });
  }
  const pick = new Set([...cand.slice().sort((x, y) => x.kn - y.kn).slice(0, 6), ...cand.slice().sort((x, y) => x.hp - y.hp).slice(0, 6)].map((c) => c.t));
  const Q = PIVOT.map(() => new Quaternion()), root = new Vector3(), piv = PIVOT.map(() => new Vector3()), Ms = PIVOT.map(() => new Matrix4());
  let spikes = 0, edges = 0;
  for (const t of pick) {
    sampleTrack(tr, t, Q, root); fk(Q, root, tr, piv); for (let s = 0; s < NSEG; s++) segMatrix(s, Q, piv, tr, Ms[s]);
    const me = Ms.map((m) => m.elements);
    // the posed bones and their grid
    const pb = new Float32Array(restBones.length);
    for (let i = 0; i < bonesP.length / 4; i++) { const x = bonesP[i * 4], y = bonesP[i * 4 + 1], z = bonesP[i * 4 + 2], e = me[bonesP[i * 4 + 3]]; pb[i * 3] = e[0] * x + e[4] * y + e[8] * z + e[12]; pb[i * 3 + 1] = e[1] * x + e[5] * y + e[9] * z + e[13]; pb[i * 3 + 2] = e[2] * x + e[6] * y + e[10] * z + e[14]; }
    const gPose = grid(pb);
    for (const p of parts) {
      const out = new Float32Array(p.nv * 3);
      for (let i = 0; i < p.nv; i++) {
        const x = p.pos[i * 3], y = p.pos[i * 3 + 1], z = p.pos[i * 3 + 2]; let X = 0, Y = 0, Z = 0;
        for (let k = 0; k < 4; k++) { const w = p.W[i * 4 + k]; if (!w) continue; const e = me[p.J[i * 4 + k]]; X += w * (e[0] * x + e[4] * y + e[8] * z + e[12]); Y += w * (e[1] * x + e[5] * y + e[9] * z + e[13]); Z += w * (e[2] * x + e[6] * y + e[10] * z + e[14]); }
        out[i * 3] = X; out[i * 3 + 1] = Y; out[i * 3 + 2] = Z;
        if ((i & 15) === 0) { let bk = 0; for (let k = 1; k < 4; k++) if (p.W[i * 4 + k] > p.W[i * 4 + bk]) bk = k; const e = me[p.J[i * 4 + bk]]; slideAll.push(100 * Math.hypot(X - (e[0] * x + e[4] * y + e[8] * z + e[12]), Y - (e[1] * x + e[5] * y + e[9] * z + e[13]), Z - (e[2] * x + e[6] * y + e[10] * z + e[14]))); }
      }
      for (let q = 0; q < p.samp.length; q += 2) { const i = p.samp[q], d0 = p.samp[q + 1] * tr.scale; const d1 = nearest(gPose, pb, out[i * 3], out[i * 3 + 1], out[i * 3 + 2], 0.3); offAll.push(100 * (d1 - d0)); if (d1 - d0 > 0.05) { const m = p.MID ? REST.muscles[p.MID[i]] : p.name; offBy.set(m, (offBy.get(m) || 0) + 1); } }
      for (let e = 0; e < p.rest.length; e++) {
        const a = p.E[e * 2], b = p.E[e * 2 + 1], r = p.rest[e] * tr.scale; if (!(r > 1e-5)) continue;
        const l = Math.hypot(out[a * 3] - out[b * 3], out[a * 3 + 1] - out[b * 3 + 1], out[a * 3 + 2] - out[b * 3 + 2]);
        edges++;
        if (l / r > SPIKE) { spikes++; const m = p.MID ? REST.muscles[p.MID[a]] : p.name; byMuscle.set(m, (byMuscle.get(m) || 0) + 1); }
      }
    }
  }
  tot += spikes; totE += edges;
  console.log(`${f.padEnd(20)} ${pick.size} deep poses  spikes ${spikes}  (${(1e4 * spikes / Math.max(1, edges)).toFixed(1)} per 10k edges)`);
}
console.log(`TOTAL spikes ${tot} (${(1e4 * tot / Math.max(1, totE)).toFixed(1)} per 10k edges)`);
slideAll.sort((a, b) => a - b); console.log(`SLIDE from the main segment: median ${slideAll[slideAll.length >> 1].toFixed(1)} cm, p95 ${slideAll[Math.floor(0.95 * (slideAll.length - 1))].toFixed(1)} cm`);
offAll.sort((a, b) => a - b); console.log(`OFF THE BONE: p95 ${offAll[Math.floor(0.95 * (offAll.length - 1))].toFixed(1)} cm, over 5 cm ${(100 * offAll.filter((x) => x > 5).length / Math.max(1, offAll.length)).toFixed(2)}% of ${offAll.length} samples; worst: ${[...offBy].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([m, c]) => `${m} ${c}`).join(' | ')}`);
console.log('worst muscles:', [...byMuscle].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([m, c]) => `${m} ${c}`).join(' | '));
