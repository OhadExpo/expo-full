// BAKE THE ANATOMY BODY (#690, 13.10). One offline step turns the two Z-Anatomy GLBs (CC BY-SA 4.0) into
// public/anatomy/body.glb + src/anatomy/restJoints.js, so the app never classifies 2,600 meshes in a phone:
//  - bones and muscles grouped into 19 rig segments by their OWN names, sides from the model's own '.l' / '.r'
//    (the June viewer took the side from the x sign - the model faces +z, so its left is at +x and every side was
//    swapped: a mirrored rig that faced backwards);
//  - the attachment markers ('.or', '.e2l' ...), labels, ear bones, larynx and deep muscles dropped (and the scalp's
//    frontalis / occipitalis and the temporalis: without their aponeurosis / the skull they hung as open bands - a
//    crown - and stood up like horns in the muscles-only view);
//  - every part simplified (meshoptimizer), quantized and meshopt-compressed;
//  - every vertex skinned: a bone to its own segment; a MUSCLE to the segments it attaches to (the model's origin /
//    insertion markers name the bones) and the ones between, weighted by its distance to each segment's real bone
//    surface, then smoothed over the mesh - so a muscle stretches across a joint instead of tearing at it.
// Usage: node scripts/anatomy/bake-anatomy.mjs  (deterministic; re-run when the rules change)
import { NodeIO, Document } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { quantize, reorder } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import { MeshoptSimplifier, MeshoptEncoder } from 'meshoptimizer';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

await MeshoptSimplifier.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule(), 'meshopt.encoder': MeshoptEncoder });
const SRC = 'public/anatomy', OUT_GLB = process.env.OUT_GLB || 'public/anatomy/body.glb', OUT_JSON = process.env.OUT_JSON || 'src/anatomy/restJoints.js';
const BONE_RATIO = +(process.env.BONE_RATIO || 0.55), MUSC_RATIO = +(process.env.MUSC_RATIO || 0.22);

// THE RIG (order = skin joint index). parent -1 = root. pivot = the joint the segment turns about.
export const SEGMENTS = [
  ['pelvis', -1], ['lumbar', 0], ['chest', 1], ['neck', 2], ['head', 3],
  ['clavL', 2], ['uarmL', 5], ['farmL', 6], ['handL', 7],
  ['clavR', 2], ['uarmR', 9], ['farmR', 10], ['handR', 11],
  ['thighL', 0], ['shinL', 13], ['footL', 14],
  ['thighR', 0], ['shinR', 16], ['footR', 17],
];
const SEG = Object.fromEntries(SEGMENTS.map(([n], i) => [n, i]));

// ---- read every mesh node: name, ancestors, world-space geometry ------------------------------------------------
async function readNodes(file) {
  const doc = await io.read(file);
  const parentOf = new Map(); for (const n of doc.getRoot().listNodes()) for (const k of n.listChildren()) parentOf.set(k, n);
  const out = [];
  for (const n of doc.getRoot().listNodes()) {
    const mesh = n.getMesh(); if (!mesh) continue;
    const chain = []; for (let p = parentOf.get(n); p; p = parentOf.get(p)) chain.push(p.getName());
    const M = n.getWorldMatrix(); const N3 = normalMatrix(M);
    for (const pr of mesh.listPrimitives()) {
      const pa = pr.getAttribute('POSITION'); if (!pa || pa.getCount() < 50) continue;   // < 50 verts = a landmark pin, not a surface
      const P = pa.getArray(), na = pr.getAttribute('NORMAL'), Nn = na ? na.getArray() : null, idx = pr.getIndices();
      const cnt = pa.getCount(), pos = new Float32Array(cnt * 3), nor = new Float32Array(cnt * 3);
      for (let i = 0; i < cnt; i++) {
        const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
        pos[i * 3] = M[0] * x + M[4] * y + M[8] * z + M[12]; pos[i * 3 + 1] = M[1] * x + M[5] * y + M[9] * z + M[13]; pos[i * 3 + 2] = M[2] * x + M[6] * y + M[10] * z + M[14];
        if (Nn) { const a = Nn[i * 3], b = Nn[i * 3 + 1], c = Nn[i * 3 + 2]; let u = N3[0] * a + N3[3] * b + N3[6] * c, v = N3[1] * a + N3[4] * b + N3[7] * c, w = N3[2] * a + N3[5] * b + N3[8] * c; const l = Math.hypot(u, v, w) || 1; nor[i * 3] = u / l; nor[i * 3 + 1] = v / l; nor[i * 3 + 2] = w / l; }
      }
      const ind = idx ? Uint32Array.from(idx.getArray()) : Uint32Array.from({ length: cnt }, (_, i) => i);
      out.push({ name: n.getName(), parent: chain[0] || '', chain, pos, nor: Nn ? nor : null, ind });
    }
  }
  return out;
}
function normalMatrix(M) {   // inverse-transpose of the upper 3x3
  const a = M[0], b = M[1], c = M[2], d = M[4], e = M[5], f = M[6], g = M[8], h = M[9], i = M[10];
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g, det = a * A + b * B + c * C || 1;
  return [A / det, B / det, C / det, -(b * i - c * h) / det, (a * i - c * g) / det, -(a * h - b * g) / det, (b * f - c * e) / det, -(a * f - c * d) / det, (a * e - b * d) / det];
}
const sideOf = (name) => (/\.l$/.test(name) ? 'L' : /\.r$/.test(name) ? 'R' : null);
const baseOf = (name) => name.replace(/\.(l|r)$/, '').toLowerCase();

// ---- BONES ---------------------------------------------------------------------------------------------------------
const MARKER = /\.(o|e)\d*[lr]$|\.(j|g|t|s|i)$/;   // origin / insertion markers, labels, group joints
function boneSeg(name) {
  if (MARKER.test(name)) return null;
  const n = baseOf(name), s = sideOf(name);
  if (/malleus|incus|stapes|thyroid cartilage|cricoid|arytenoid|cornicul|epiglott|laryngeal|ligament|menisc|\bdisc|membrane|sinus of|cells of ethmoid|concha|tympanic/.test(n)) return null;
  if (/frontal bone|parietal bone|occipital bone|temporal bone|sphenoid|ethmoid|nasal bone|maxilla|palatine|zygomatic|lacrimal|vomer|mandible|incisor|canine|premolar|molar/.test(n)) return { seg: 'head' };
  if (/hyoid|atlas|axis \(c2\)|vertebra c\d/.test(n)) return { seg: 'neck' };
  if (/vertebra t\d|\brib\b|sternum|manubrium|xiphoid|costal cartilage/.test(n)) return { seg: 'chest' };
  if (/vertebra l\d/.test(n)) return { seg: 'lumbar' };
  if (/sacrum|coccy|hip bone/.test(n)) return { seg: 'pelvis' };
  if (!s) return { unknown: true };
  if (/clavicle|scapula/.test(n)) return { seg: 'clav' + s };
  if (/humerus/.test(n)) return { seg: 'uarm' + s };
  if (/^radius|^ulna/.test(n)) return { seg: 'farm' + s };
  if (/scaphoid|lunate|triquetr|pisiform|trapezium|trapezoid|capitate|hamate|metacarpal|of hand|sesamoid.*hand/.test(n)) return { seg: 'hand' + s };
  if (/^patella/.test(n)) return { seg: 'thigh' + s, blend: 'shin' + s };   // the kneecap rides between the two
  if (/^femur/.test(n)) return { seg: 'thigh' + s };
  if (/^tibia|^fibula/.test(n)) return { seg: 'shin' + s };
  if (/talus|calcaneus|navicular|cuboid|cuneiform bone|metatarsal|of foot/.test(n)) return { seg: 'foot' + s };
  return { unknown: true };
}

// ---- MUSCLES -------------------------------------------------------------------------------------------------------
// sheets and non-muscle tissue, and the deepest small muscles (13.10 #721: the transversus abdominis, internal oblique,
// intercostals and multifidus came BACK - with the layers they are the DEEP view of the trunk, no longer hidden budget)
const MUSC_DROP = /linea alba|fascia|bursa|sheath|aponeuros|septum|retinacul|ligament|tendinous arch|interosseous membrane|annular|diaphragm|subcostal|transversus thoracis|rotatores|interspinales|intertransvers|levatores|pharyn|palat|glosso|tongue|uvula|laryn|stylo|epicranial|temporoparietal|auricular|occipitofrontal|frontalis|occipitalis|temporalis|pelvic diaphragm|levator ani|coccygeus|sphincter|cremaster|platysma/;
const MUSC_NAME = (n) => n.toLowerCase().replace(/\.(l|r)$/, '');

// ---- helpers -----------------------------------------------------------------------------------------------------
function region(pos, pick) { let n = 0, x = 0, y = 0, z = 0; for (let i = 0; i < pos.length; i += 3) if (pick(pos[i], pos[i + 1], pos[i + 2])) { x += pos[i]; y += pos[i + 1]; z += pos[i + 2]; n++; } return n ? [x / n, y / n, z / n] : null; }
function bbox(pos) { const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9]; for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], pos[i + k]); hi[k] = Math.max(hi[k], pos[i + k]); } return { lo, hi }; }
const midp = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
const r4 = (v) => v.map((x) => Math.round(x * 1e4) / 1e4);

// WELD: several Z-Anatomy meshes are triangle soup (the external oblique: 88,866 vertices for 88,866 indices) - every
// triangle with its own corners, so the simplifier could merge nothing and the shading was faceted. Corners at the same
// place (to 0.05 mm) become one vertex first.
function weld(part) {
  const map = new Map(), remap = new Uint32Array(part.pos.length / 3); let n = 0; const keep = [];
  for (let i = 0; i < remap.length; i++) {
    const k = `${Math.round(part.pos[i * 3] * 2e4)},${Math.round(part.pos[i * 3 + 1] * 2e4)},${Math.round(part.pos[i * 3 + 2] * 2e4)}`;
    let j = map.get(k); if (j === undefined) { j = n++; map.set(k, j); keep.push(i); } remap[i] = j;
  }
  if (n === remap.length) return part;
  const pos = new Float32Array(n * 3); keep.forEach((i, j) => pos.set(part.pos.subarray(i * 3, i * 3 + 3), j * 3));
  const ind = Uint32Array.from(part.ind, (i) => remap[i]);
  return { ...part, pos, nor: null, ind };
}
function simplify(part0, ratio) {
  const part = weld(part0);
  const target = Math.max(3, Math.floor((part.ind.length * ratio) / 3) * 3);
  if (part.ind.length <= 300 || ratio >= 1) return part;
  const [ind] = MeshoptSimplifier.simplify(part.ind, part.pos, 3, target, +(process.env.SIMP_ERR || 0.01), process.env.NO_LOCK ? [] : ['LockBorder']);
  // compact the vertex buffer to the vertices still used
  const remap = new Int32Array(part.pos.length / 3).fill(-1); let n = 0;
  for (const i of ind) if (remap[i] < 0) remap[i] = n++;
  const pos = new Float32Array(n * 3), nor = part.nor ? new Float32Array(n * 3) : null;
  for (let i = 0; i < remap.length; i++) { const j = remap[i]; if (j < 0) continue; pos.set(part.pos.subarray(i * 3, i * 3 + 3), j * 3); if (nor) nor.set(part.nor.subarray(i * 3, i * 3 + 3), j * 3); }
  return { ...part, pos, nor, ind: Uint32Array.from(ind, (i) => remap[i]) };
}
function computeNormals(pos, ind) {
  const nor = new Float32Array(pos.length);
  for (let t = 0; t < ind.length; t += 3) {
    const a = ind[t] * 3, b = ind[t + 1] * 3, c = ind[t + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2], vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const k of [a, b, c]) { nor[k] += nx; nor[k + 1] += ny; nor[k + 2] += nz; }
  }
  for (let i = 0; i < nor.length; i += 3) { const l = Math.hypot(nor[i], nor[i + 1], nor[i + 2]) || 1; nor[i] /= l; nor[i + 1] /= l; nor[i + 2] /= l; }
  return nor;
}

// one segment's DISTANCE FIELD over the body box (1 cm cells): each cell keeps the nearest bone-surface vertex of that
// segment (two raster sweeps of nearest-point propagation, ~Danielsson). A query is one lookup: the distance from the
// muscle vertex to its cell's nearest bone vertex (error under a cell). Grid shells per query took minutes.
let BOX = null; const CELL = 0.01;
function grid(points) {
  const { lo, n } = BOX, [nx, ny, nz] = n, N = nx * ny * nz;
  const sx = new Float32Array(N).fill(NaN), sy = new Float32Array(N), sz = new Float32Array(N);
  const id = (i, j, k) => (k * ny + j) * nx + i;
  for (let q = 0; q < points.length; q += 3) {
    const i = Math.floor((points[q] - lo[0]) / CELL), j = Math.floor((points[q + 1] - lo[1]) / CELL), k = Math.floor((points[q + 2] - lo[2]) / CELL);
    if (i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz) continue;
    const c = id(i, j, k), cx = lo[0] + (i + 0.5) * CELL, cy = lo[1] + (j + 0.5) * CELL, cz = lo[2] + (k + 0.5) * CELL;
    if (Number.isNaN(sx[c]) || (points[q] - cx) ** 2 + (points[q + 1] - cy) ** 2 + (points[q + 2] - cz) ** 2 < (sx[c] - cx) ** 2 + (sy[c] - cy) ** 2 + (sz[c] - cz) ** 2) { sx[c] = points[q]; sy[c] = points[q + 1]; sz[c] = points[q + 2]; }
  }
  const NB = []; for (let dk = -1; dk <= 1; dk++) for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) if (dk < 0 || (dk === 0 && (dj < 0 || (dj === 0 && di < 0)))) NB.push([di, dj, dk]);
  const relax = (i, j, k, sgn) => {
    const c = id(i, j, k), cx = lo[0] + (i + 0.5) * CELL, cy = lo[1] + (j + 0.5) * CELL, cz = lo[2] + (k + 0.5) * CELL;
    let bd = Number.isNaN(sx[c]) ? Infinity : (sx[c] - cx) ** 2 + (sy[c] - cy) ** 2 + (sz[c] - cz) ** 2;
    for (const [di, dj, dk] of NB) {
      const a = i + sgn * di, b = j + sgn * dj, e = k + sgn * dk; if (a < 0 || b < 0 || e < 0 || a >= nx || b >= ny || e >= nz) continue;
      const o = id(a, b, e); if (Number.isNaN(sx[o])) continue;
      const d = (sx[o] - cx) ** 2 + (sy[o] - cy) ** 2 + (sz[o] - cz) ** 2; if (d < bd) { bd = d; sx[c] = sx[o]; sy[c] = sy[o]; sz[c] = sz[o]; }
    }
  };
  for (let pass = 0; pass < 2; pass++) {
    for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) relax(i, j, k, 1);
    for (let k = nz - 1; k >= 0; k--) for (let j = ny - 1; j >= 0; j--) for (let i = nx - 1; i >= 0; i--) relax(i, j, k, -1);
  }
  return { near(x, y, z, maxR = 0.35) {
    const i = Math.min(nx - 1, Math.max(0, Math.floor((x - lo[0]) / CELL))), j = Math.min(ny - 1, Math.max(0, Math.floor((y - lo[1]) / CELL))), k = Math.min(nz - 1, Math.max(0, Math.floor((z - lo[2]) / CELL)));
    const c = id(i, j, k); if (Number.isNaN(sx[c])) return maxR;
    return Math.min(maxR, Math.hypot(sx[c] - x, sy[c] - y, sz[c] - z));
  } };
}
// the segments on the rig path between two segments (both included)
function path(a, b) {
  const up = (s) => { const out = []; for (let x = s; x >= 0; x = SEGMENTS[x][1]) out.push(x); return out; };
  const A = up(a), B = up(b); const common = A.find((x) => B.includes(x));
  return [...A.slice(0, A.indexOf(common) + 1), ...B.slice(0, B.indexOf(common))];
}

// =================================================================================================================
const skel = await readNodes(`${SRC}/skeleton.glb`);
const musc = await readNodes(`${SRC}/muscles.glb`);

// 1. bones -> segments
const boneParts = [], unknown = new Map();
for (const p of skel) {
  let c = boneSeg(p.name);
  // a part (a process, a body) without a bone word takes its parent bone's segment
  if (c && c.unknown) { for (const a of p.chain) { const c2 = boneSeg(a); if (c2 && !c2.unknown) { c = c2; break; } } }
  if (!c) continue;
  if (c.unknown) { unknown.set(p.name, (unknown.get(p.name) || 0) + p.pos.length / 3); continue; }
  boneParts.push({ ...p, seg: SEG[c.seg], blend: c.blend ? SEG[c.blend] : -1, side: sideOf(p.name) || sideOf(p.chain.find((x) => sideOf(x)) || '') });
}
if (unknown.size) console.log('UNCLASSIFIED bone parts (dropped):', [...unknown].map(([k, v]) => `${k}(${v})`).join(', '));

// 2. rest joints, from the bone geometry itself (model: metres, y up, facing +z, left = +x)
const byName = (re, side) => boneParts.filter((p) => re.test(baseOf(p.name)) && (!side || p.side === side));
const cat = (parts) => { const n = parts.reduce((a, p) => a + p.pos.length, 0), o = new Float32Array(n); let k = 0; for (const p of parts) { o.set(p.pos, k); k += p.pos.length; } return o; };
const J = {};
for (const S of ['L', 'R']) {
  const fem = cat(byName(/^femur/, S)), fb = bbox(fem);
  // the femoral head: the top 5 cm of the femur, its medial half (the greater trochanter is the lateral half)
  const topF = region(fem, (x, y) => y > fb.hi[1] - 0.05); const medX = topF[0];
  J['hip' + S] = region(fem, (x, y) => y > fb.hi[1] - 0.05 && Math.abs(x) < Math.abs(medX));
  const tib = cat(byName(/^tibia/, S)), tb = bbox(tib);
  J['knee' + S] = midp(region(fem, (x, y) => y < fb.lo[1] + 0.02), region(tib, (x, y) => y > tb.hi[1] - 0.02));
  J['ankle' + S] = region(cat(byName(/^talus/, S)), () => true);
  const cal = cat(byName(/calcaneus/, S)), cb = bbox(cal);
  J['heel' + S] = region(cal, (x, y, z) => z < cb.lo[2] + 0.015);
  const foot = cat(byName(/metatarsal|of foot/, S)), ftb = bbox(foot);
  J['toe' + S] = region(foot, (x, y, z) => z > ftb.hi[2] - 0.02);
  const hum = cat(byName(/humerus/, S)), hb = bbox(hum);
  const topH = region(hum, (x, y) => y > hb.hi[1] - 0.04);
  J['shoulder' + S] = region(hum, (x, y) => y > hb.hi[1] - 0.04 && Math.abs(x) < Math.abs(topH[0]));
  const uln = cat(byName(/^ulna/, S)), ub = bbox(uln), rad = cat(byName(/^radius/, S)), rb = bbox(rad);
  J['elbow' + S] = midp(region(hum, (x, y) => y < hb.lo[1] + 0.02), region(uln, (x, y) => y > ub.hi[1] - 0.03));
  J['wrist' + S] = midp(region(rad, (x, y) => y < rb.lo[1] + 0.015), region(cat(byName(/lunate/, S)), () => true));
  const m2 = cat(byName(/second metacarpal/, S)), m5 = cat(byName(/fifth metacarpal/, S));
  J['index' + S] = region(m2, (x, y) => y < bbox(m2).lo[1] + 0.012);
  J['pinky' + S] = region(m5, (x, y) => y < bbox(m5).lo[1] + 0.012);
  const fing = cat(byName(/distal phalanx of third finger of hand/, S));
  J['handTip' + S] = region(fing, (x, y) => y < bbox(fing).lo[1] + 0.005);
  const clv = cat(byName(/clavicle/, S)), clb = bbox(clv);
  J['sc' + S] = region(clv, (x) => Math.abs(x) < Math.min(Math.abs(clb.lo[0]), Math.abs(clb.hi[0])) + 0.015);
  J['ear' + S] = region(cat(byName(/temporal bone/, S)), () => true);
}
const vert = (re) => { const p = cat(byName(re)); return { p, b: bbox(p) }; };
const L5 = vert(/vertebra l5/), SAC = vert(/sacrum/), L1 = vert(/vertebra l1/), T12 = vert(/vertebra t12/), C7 = vert(/vertebra c7/), T1 = vert(/vertebra t1$/), C1 = vert(/atlas/);
// a vertebral joint: between the BODIES (front half) of the two vertebrae
// (the front third of the vertebra; its own top / bottom - a thoracic spinous process reaches lower than the body)
const bodyEnd = (v, top) => {
  const zc = v.b.hi[2] - (v.b.hi[2] - v.b.lo[2]) / 3; const front = []; for (let i = 0; i < v.p.length; i += 3) if (v.p[i + 2] > zc) front.push(v.p[i], v.p[i + 1], v.p[i + 2]);
  const fb = bbox(front); return region(front, (x, y) => (top ? y > fb.hi[1] - 0.008 : y < fb.lo[1] + 0.008));
};
J.hipMid = midp(J.hipL, J.hipR);
J.l5s1 = midp(bodyEnd(L5, false), region(SAC.p, (x, y) => y > SAC.b.hi[1] - 0.015));
J.t12l1 = midp(bodyEnd(T12, false), bodyEnd(L1, true));
J.c7t1 = midp(bodyEnd(C7, false), bodyEnd(T1, true));
J.c1 = region(C1.p, (x, y) => y > C1.b.hi[1] - 0.006);
J.shoMid = midp(J.shoulderL, J.shoulderR);
J.earMid = midp(J.earL, J.earR);
J.nose = region(cat(byName(/nasal bone/)), () => true);
const skull = cat(byName(/parietal bone|frontal bone|occipital bone/)); J.crown = region(skull, (x, y) => y > bbox(skull).hi[1] - 0.01);
// the pivots: where each segment turns
const PIVOT = { pelvis: J.hipMid, lumbar: J.l5s1, chest: J.t12l1, neck: J.c7t1, head: J.c1, clavL: J.scL, clavR: J.scR, uarmL: J.shoulderL, uarmR: J.shoulderR, farmL: J.elbowL, farmR: J.elbowR, handL: J.wristL, handR: J.wristR, thighL: J.hipL, thighR: J.hipR, shinL: J.kneeL, shinR: J.kneeR, footL: J.ankleL, footR: J.ankleR };
for (const [k, v] of Object.entries(J)) if (!v || v.some((x) => !Number.isFinite(x))) throw new Error('joint not found: ' + k);
// sanity: the model faces +z and its left is at +x (the whole point of reading '.l' / '.r')
if (!(J.hipL[0] > 0 && J.shoulderL[0] > 0 && J.toeL[2] > J.heelL[2] && J.nose[2] > J.earMid[2])) throw new Error('model orientation is not the expected one (left +x, facing +z)');

// 3. simplify bones, then build the per-segment bone grids for the muscle weights
const bones = boneParts.map((p) => { const s = simplify(p, BONE_RATIO); return { ...s, nor: computeNormals(s.pos, s.ind) }; });
{ const all = bbox(cat([...bones, ...musc.filter((m) => m.pos.length)]));
  const lo = all.lo.map((v) => v - 0.04), hi = all.hi.map((v) => v + 0.04); BOX = { lo, n: lo.map((v, k) => Math.ceil((hi[k] - v) / CELL)) }; console.log('field', BOX.n.join('x')); }
const grids = SEGMENTS.map((_, i) => grid(cat(bones.filter((b) => b.seg === i || b.blend === i))));
console.log('fields built');

// 4. muscles: attachments from the skeleton's markers ('<muscle>.or' sits under the bone it starts on)
const attach = new Map();   // 'vastus lateralis muscle|R' -> Set(seg)
for (const p of skel) {
  const m = p.name.match(/^(.*)\.(o|e)\d*([lr])$/); if (!m) continue;
  let seg = null; for (const a of [p.parent, ...p.chain]) { const c = boneSeg(a); if (c && !c.unknown) { seg = SEG[c.seg]; break; } }
  if (seg == null) continue;
  const key = m[1].toLowerCase() + '|' + m[3].toUpperCase();
  if (!attach.has(key)) attach.set(key, new Set()); attach.get(key).add(seg);
}
const muscles = [], noAttach = [];
const muscleNames = [];
for (const p of musc) {
  const n = MUSC_NAME(p.name); if (MUSC_DROP.test(n) || MUSC_DROP.test((p.chain[0] || '').toLowerCase())) continue;
  if (p.chain.some((c) => /^fasciae|bursae|tendon sheaths/i.test(c))) continue;
  const s = sideOf(p.name);
  const sp = simplify(p, MUSC_RATIO);
  let cand = null;
  const at = attach.get(n + '|' + (s || '')) || (s ? null : (attach.get(n + '|L') || attach.get(n + '|R')));
  if (at && at.size) { const segs = [...at]; const set = new Set(); for (const a of segs) for (const b of segs) path(a, b).forEach((x) => set.add(x)); cand = [...set]; }
  if (!cand) {
    // no markers: the segment whose bones are nearest the muscle's centre, with its parent and children
    noAttach.push(p.name);
    const c = region(sp.pos, () => true); let best = -1, bd = Infinity;
    grids.forEach((g, i) => { const nm = SEGMENTS[i][0]; if (s && /[LR]$/.test(nm) && !nm.endsWith(s)) return; const d = g.near(c[0], c[1], c[2], 0.4); if (d < bd) { bd = d; best = i; } });
    cand = [best, SEGMENTS[best][1], ...SEGMENTS.map((x, i) => (x[1] === best ? i : -1))].filter((x) => x >= 0);
  }
  // THE BONES IT LIES ON (13.10, verify-anatomy-muscles OFF THE BONE: the rectus femoris and the long heads of biceps
  // femoris / biceps brachii resolved only their ORIGIN marker - one segment, the pelvis or the clavicle - and moved
  // rigidly with it: in a deep squat the whole thigh muscle stayed with the pelvis and stuck out of the leg): every
  // segment whose bone surface is within 2 cm of 8% of the muscle's vertices joins, and the rig path between them
  {
    const nv0 = sp.pos.length / 3, near = new Map();
    for (let v = 0; v < nv0; v += 2) grids.forEach((g, i) => { if (g.near(sp.pos[v * 3], sp.pos[v * 3 + 1], sp.pos[v * 3 + 2], 0.03) < 0.02) near.set(i, (near.get(i) || 0) + 1); });
    const lie = [...near].filter(([, c]) => c >= 0.08 * Math.ceil(nv0 / 2)).map(([i]) => i);
    const all = new Set([...cand, ...lie]); const arr = [...all];
    for (const a of arr) for (const b of arr) path(a, b).forEach((x) => all.add(x));
    cand = [...all];
  }
  // one side's muscle never follows the other side's limb
  cand = cand.filter((i) => { const nm = SEGMENTS[i][0]; return !(s && /[LR]$/.test(nm) && !nm.endsWith(s)); });
  if (!cand.length) { noAttach.push(p.name + ' (other side only)'); const c = region(sp.pos, () => true); let best = -1, bd = Infinity; grids.forEach((g, i) => { const nm = SEGMENTS[i][0]; if (s && /[LR]$/.test(nm) && !nm.endsWith(s)) return; const d = g.near(c[0], c[1], c[2], 0.4); if (d < bd) { bd = d; best = i; } }); cand = [best]; }
  muscleNames.push(p.name);
  muscles.push({ ...sp, nor: computeNormals(sp.pos, sp.ind), cand, id: muscleNames.length - 1 });
}
if (process.env.DEBUG_CAND) for (const m of muscles) { const nm = muscleNames[m.id]; if (new RegExp(process.env.DEBUG_CAND, 'i').test(nm)) console.log('CAND', nm, m.cand.map((c) => SEGMENTS[c][0]).join(',')); }
console.log('muscles kept', muscles.length, 'without attachment markers', noAttach.length);

// 4b. THE LAYERS (13.10 #721, Ohad: "like an anatomy app, where we can choose skeleton > deeper muscles > superficial
// (however many layers there are)"): peeled in the rest pose, as a dissection does. The muscles a ray from their own
// surface escapes the body from (along the surface normal, 5 mm cells, past the bones and every muscle still on) are
// the SURFACE layer; take them off and the next ones exposed are the MIDDLE; the rest are DEEP. Z-Anatomy names no
// depth, so the depth is measured.
{
  const C2 = 0.005, lo = BOX.lo, nx = Math.ceil((BOX.n[0] * CELL) / C2), ny = Math.ceil((BOX.n[1] * CELL) / C2), nz = Math.ceil((BOX.n[2] * CELL) / C2);
  const BONE = 65535, EMPTY = 65534, MULTI = 65533;
  const cellOf = (x, y, z) => { const i = Math.floor((x - lo[0]) / C2), j = Math.floor((y - lo[1]) / C2), k = Math.floor((z - lo[2]) / C2); return i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz ? -1 : (k * ny + j) * nx + i; };
  // a surface's triangles, sampled finer than half a cell
  const raster = (g, pos, ind, id) => {
    for (let t = 0; t < ind.length; t += 3) {
      const a = ind[t] * 3, b = ind[t + 1] * 3, c = ind[t + 2] * 3;
      const L = Math.max(Math.hypot(pos[a] - pos[b], pos[a + 1] - pos[b + 1], pos[a + 2] - pos[b + 2]), Math.hypot(pos[a] - pos[c], pos[a + 1] - pos[c + 1], pos[a + 2] - pos[c + 2]), Math.hypot(pos[b] - pos[c], pos[b + 1] - pos[c + 1], pos[b + 2] - pos[c + 2]));
      const n = Math.max(1, Math.ceil(L / (C2 * 0.5)));
      for (let u = 0; u <= n; u++) for (let v = 0; v <= n - u; v++) {
        const w = n - u - v, x = (pos[a] * u + pos[b] * v + pos[c] * w) / n, y = (pos[a + 1] * u + pos[b + 1] * v + pos[c + 1] * w) / n, z = (pos[a + 2] * u + pos[b + 2] * v + pos[c + 2] * w) / n;
        const q = cellOf(x, y, z); if (q < 0) continue; const o = g[q];
        if (o === BONE) continue; g[q] = id === BONE ? BONE : o === EMPTY || o === id ? id : MULTI;
      }
    }
  };
  const bonesG = new Uint16Array(nx * ny * nz).fill(EMPTY); for (const bn of bones) raster(bonesG, bn.pos, bn.ind, BONE);
  // the cavities closed: the diaphragm and the pelvic floor (never drawn) are walls here - without them the abdomen
  // opened to the air below and the transversus / psoas / piriformis faced "outside" across it
  for (const p of musc) if (/diaphragm|levator ani|coccygeus|iliococcygeus|pubococcygeus|puborectalis/.test(MUSC_NAME(p.name)) && p.ind && p.ind.length) raster(bonesG, p.pos, p.ind, BONE);
  // a trunk muscle's face turned INTO the trunk is covered (by the organs the model does not have): the trunk's axis at
  // each height = the middle of its bones there
  const TRUNKSEG = new Set(['pelvis', 'lumbar', 'chest'].map((n) => SEG[n]));
  const axZ = new Map(); for (const bn of bones) if (TRUNKSEG.has(bn.seg)) for (let i = 0; i < bn.pos.length; i += 3) { const b = Math.round(bn.pos[i + 1] / 0.02); const o = axZ.get(b) || [0, 0]; o[0] += bn.pos[i + 2]; o[1]++; axZ.set(b, o); }
  const axisZ = (y) => { const o = axZ.get(Math.round(y / 0.02)); return o ? o[0] / o[1] : null; };
  const segNear = (c) => { let b = 0, bd = Infinity; SEGMENTS.forEach(([nm], i) => { const q = PIVOT[nm]; const d = Math.hypot(c[0] - q[0], c[1] - q[1], c[2] - q[2]); if (d < bd) { bd = d; b = i; } }); return b; };
  for (const m of muscles) m.trunk = TRUNKSEG.has(segNear(region(m.pos, () => true)));
  // THE OUTSIDE: the air reachable from the box's edge, every shell a wall (grown 5 mm so a crack in a mesh does not
  // let the flood in). A ray ESCAPES when it reaches it - the gap between an arm and the trunk, or between the thighs,
  // is outside (the serratus, the adductors are not deep), the abdominal cavity is not (the transversus stays deep).
  const outsideOf = (g) => {
    const wall = new Uint8Array(nx * ny * nz);
    for (let q = 0; q < g.length; q++) if (g[q] !== EMPTY) {
      const i = q % nx, j = ((q / nx) | 0) % ny, k = (q / (nx * ny)) | 0;
      for (let dk = -1; dk <= 1; dk++) for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const a = i + di, b = j + dj, c = k + dk; if (a >= 0 && b >= 0 && c >= 0 && a < nx && b < ny && c < nz) wall[(c * ny + b) * nx + a] = 1; }
    }
    const out = new Uint8Array(nx * ny * nz), Q = new Int32Array(nx * ny * nz); let h = 0, t = 0;
    const push = (q) => { if (!wall[q] && !out[q]) { out[q] = 1; Q[t++] = q; } };
    for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) if (i === 0 || j === 0 || k === 0 || i === nx - 1 || j === ny - 1 || k === nz - 1) push((k * ny + j) * nx + i);
    while (h < t) { const q = Q[h++], i = q % nx, j = ((q / nx) | 0) % ny, k = (q / (nx * ny)) | 0;
      if (i > 0) push(q - 1); if (i < nx - 1) push(q + 1); if (j > 0) push(q - nx); if (j < ny - 1) push(q + nx); if (k > 0) push(q - nx * ny); if (k < nz - 1) push(q + nx * ny); }
    return out;
  };
  // peeled BY MUSCLE (its name, both sides, every part together): a muscle is one layer, the body symmetric
  const groups = new Map(); for (const m of muscles) { const k = MUSC_NAME(muscleNames[m.id]); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(m); }
  let active = [...groups.keys()]; const layerOf = new Map(); const names = ['surface', 'middle', 'deep'];
  const SHARE = +(process.env.LAYER_SHARE || 0.2), SKIP = +(process.env.LAYER_SKIP || 2);
  for (let L = 1; L <= 3 && active.length; L++) {
    if (L === 3) { for (const k of active) layerOf.set(k, 3); break; }
    const g = bonesG.slice(); for (const k of active) for (const m of groups.get(k)) raster(g, m.pos, m.ind, m.id);
    const outside = outsideOf(g);
    const exposed = [];
    for (const k of active) {
      let out = 0, n = 0;
      for (const m of groups.get(k)) {
        const nv = m.pos.length / 3;
        for (let v = 0; v < nv; v += 3) {
          n++; let x = m.pos[v * 3], y = m.pos[v * 3 + 1], z = m.pos[v * 3 + 2]; const dx = m.nor[v * 3], dy = m.nor[v * 3 + 1], dz = m.nor[v * 3 + 2];
          if (m.trunk) { const az = axisZ(y); if (az != null && dx * x + dz * (z - az) < 0) continue; }   // faces into the trunk: covered
          let free = false;
          for (let st = 1; st <= 160; st++) {   // 0.4 m in 2.5 mm steps; the first SKIP steps pass the cells it shares with a neighbour (its own never block) - more and a 5 mm trapezius over the rhomboids was jumped
            x += dx * C2 * 0.5; y += dy * C2 * 0.5; z += dz * C2 * 0.5;
            const q = cellOf(x, y, z); if (q < 0) { free = true; break; }
            if (st <= SKIP) continue;
            if (outside[q]) { free = true; break; }   // reached the air outside the body: escaped
            const o = g[q]; if (o !== EMPTY && o !== m.id) break;   // another muscle / a bone covers it here
          }
          if (free) out++;
        }
      }
      if (out / Math.max(1, n) >= SHARE) exposed.push(k);
    }
    if (!exposed.length) { for (const k of active) layerOf.set(k, L); break; }
    for (const k of exposed) layerOf.set(k, L);
    const set = new Set(exposed); active = active.filter((k) => !set.has(k));
    console.log('layer', names[L - 1], exposed.length, 'muscles, left', active.length);
  }
  // FOUR NAMED CORRECTIONS where the model, not the anatomy, decided: the rectus abdominis lies under the external
  // oblique's aponeurosis, which Z-Anatomy draws as part of that muscle (it read DEEP); the psoas and the iliacus face an
  // abdomen with no organs in it (they read SURFACE / MIDDLE); the intercostals' sheets sit one layer off
  const FIX = { 'rectus abdominis muscle': 1, 'psoas major': 3, 'iliacus muscle': 3, 'innermost intercostal muscles': 3, 'external intercostal muscles': 2 };
  for (const [k, L] of Object.entries(FIX)) if (groups.has(k)) layerOf.set(k, L); else console.log('layer fix: no muscle named', k);
  // the LITE body takes the full body's layers by name (LAYERS_FROM=<the full bake's restJoints.js>): the simplified
  // mesh peeled 16 muscles differently, and a phone must show the same anatomy as the desktop
  if (process.env.LAYERS_FROM) {
    const src = (await import(pathToFileURL(process.env.LAYERS_FROM).href)).default;
    layerOf.clear(); src.muscles.forEach((nm, i) => layerOf.set(MUSC_NAME(nm), src.muscleLayers[i]));
    console.log('layers taken from', process.env.LAYERS_FROM);
  }
  for (const m of muscles) m.layer = layerOf.get(MUSC_NAME(muscleNames[m.id])) || 3;
  const per = [1, 2, 3].map((L) => muscles.filter((m) => m.layer === L).length);
  console.log('layers: surface', per[0], 'middle', per[1], 'deep', per[2]);
  if (process.env.LAYER_LIST) for (const L of [1, 2, 3]) console.log(names[L - 1].toUpperCase() + ':', [...new Set(muscles.filter((m) => m.layer === L).map((m) => MUSC_NAME(muscleNames[m.id])))].join(' | '));
}

// 5. muscle weights: inverse distance to each candidate segment's bone surface, smoothed over the mesh
function skinMuscle(m) {
  const nv = m.pos.length / 3, K = m.cand.length;
  const W = new Float32Array(nv * K);
  for (let v = 0; v < nv; v++) {
    const x = m.pos[v * 3], y = m.pos[v * 3 + 1], z = m.pos[v * 3 + 2];
    let sum = 0;
    for (let k = 0; k < K; k++) { const d = grids[m.cand[k]].near(x, y, z, 0.35); const w = 1 / Math.pow(Math.min(d, 0.35) + 0.008, 4); W[v * K + k] = w; sum += w; }
    for (let k = 0; k < K; k++) W[v * K + k] /= sum;
  }
  // 300 Laplacian passes over the triangle adjacency (13.10, scripts/anatomy/verify-anatomy-muscles.mjs: with 4, the
  // hand-over from one bone to the next sat in a sliver of the muscle and a deep squat stretched its edges 2.5x+ - 7,375
  // such edges on c31, the hip's muscles worst; 48 -> 939, 120 -> 218, 300 -> 14, while the slide off the main bone rose only from
  // 0.7 to 2.5 cm at p95). LAPLACE=n to measure another.
  if (K > 1) {
    const nb = Array.from({ length: nv }, () => new Set());
    for (let t = 0; t < m.ind.length; t += 3) { const a = m.ind[t], b = m.ind[t + 1], c = m.ind[t + 2]; nb[a].add(b).add(c); nb[b].add(a).add(c); nb[c].add(a).add(b); }
    for (let it = 0; it < +(process.env.LAPLACE || 300); it++) {
      const N = new Float32Array(W.length);
      for (let v = 0; v < nv; v++) { const ns = nb[v]; for (let k = 0; k < K; k++) { let s = W[v * K + k]; for (const u of ns) s += W[u * K + k]; N[v * K + k] = s / (ns.size + 1); } }
      W.set(N);
    }
  }
  // the 4 largest -> JOINTS_0 / WEIGHTS_0
  const J4 = new Uint8Array(nv * 4), W4 = new Float32Array(nv * 4); const dom = new Uint8Array(nv);
  for (let v = 0; v < nv; v++) {
    const o = m.cand.map((seg, k) => [seg, W[v * K + k]]).sort((a, b) => b[1] - a[1]).slice(0, 4);
    const s = o.reduce((a, q) => a + q[1], 0) || 1;
    o.forEach(([seg, w], k) => { J4[v * 4 + k] = seg; W4[v * 4 + k] = w / s; });
    dom[v] = o[0][0];
  }
  return { J4, W4, dom };
}

// 6. assemble: one mesh per (layer, dominant segment) so a limb the camera did not see can be drawn faded
function groupBy(parts, layer) {
  const groups = new Map();
  for (const p of parts) {
    let J4, W4, dom;
    if (layer === 'bone') {
      const nv = p.pos.length / 3; J4 = new Uint8Array(nv * 4); W4 = new Float32Array(nv * 4); dom = new Uint8Array(nv).fill(p.seg);
      for (let v = 0; v < nv; v++) { J4[v * 4] = p.seg; if (p.blend >= 0) { J4[v * 4 + 1] = p.blend; W4[v * 4] = 0.5; W4[v * 4 + 1] = 0.5; } else W4[v * 4] = 1; }
    } else ({ J4, W4, dom } = skinMuscle(p));
    // a muscle goes to the group of its most-weighted segment overall
    const cnt = new Map(); for (const d of dom) cnt.set(d, (cnt.get(d) || 0) + 1);
    const g = [...cnt].sort((a, b) => b[1] - a[1])[0][0];
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push({ ...p, J4, W4 });
  }
  return groups;
}
const doc = new Document(); const buf = doc.createBuffer(); const scene = doc.createScene('body');
const matB = doc.createMaterial('bone'), matM = doc.createMaterial('muscle');
let vB = 0, vM = 0;
for (const [layer, parts, mat] of [['bone', bones, matB], ['muscle', muscles, matM]]) {
  for (const [seg, list] of groupBy(parts, layer)) {
    const nv = list.reduce((a, p) => a + p.pos.length / 3, 0), ni = list.reduce((a, p) => a + p.ind.length, 0);
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), j4 = new Uint8Array(nv * 4), w4 = new Float32Array(nv * 4), ind = new Uint32Array(ni), mid = new Uint16Array(nv), lay = new Uint8Array(nv);
    let vo = 0, io2 = 0;
    for (const p of list) { const n = p.pos.length / 3; pos.set(p.pos, vo * 3); nor.set(p.nor, vo * 3); j4.set(p.J4, vo * 4); w4.set(p.W4, vo * 4); mid.fill(layer === 'muscle' ? p.id : 0, vo, vo + n); lay.fill(layer === 'muscle' ? p.layer || 3 : 0, vo, vo + n); for (let i = 0; i < p.ind.length; i++) ind[io2 + i] = p.ind[i] + vo; vo += n; io2 += p.ind.length; }
    const prim = doc.createPrimitive().setMaterial(mat)
      .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(pos).setBuffer(buf))
      .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(nor).setBuffer(buf))
      .setAttribute('JOINTS_0', doc.createAccessor().setType('VEC4').setArray(j4).setBuffer(buf))
      .setAttribute('WEIGHTS_0', doc.createAccessor().setType('VEC4').setArray(w4).setBuffer(buf))
      .setIndices(doc.createAccessor().setType('SCALAR').setArray(nv < 65535 ? Uint16Array.from(ind) : ind).setBuffer(buf));
    if (layer === 'muscle') prim.setAttribute('_MUSCLE', doc.createAccessor().setType('SCALAR').setArray(mid).setBuffer(buf));
    // 1 surface / 2 middle / 3 deep (4b) - the replay hides the layers above the one chosen
    if (layer === 'muscle') prim.setAttribute('_LAYER', doc.createAccessor().setType('SCALAR').setArray(lay).setBuffer(buf));
    const name = `${layer}-${SEGMENTS[seg][0]}`;   // "-": GLTFLoader strips ":" from names
    scene.addChild(doc.createNode(name).setMesh(doc.createMesh(name).addPrimitive(prim)));
    if (layer === 'bone') vB += nv; else vM += nv;
  }
}
doc.getRoot().getAsset().copyright = 'Z-Anatomy (CC BY-SA 4.0), baked for EXPO';
await doc.transform(reorder({ encoder: MeshoptEncoder }), quantize({ quantizePosition: 14, quantizeNormal: 8, quantizeWeight: 8 }));
doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
await io.write(OUT_GLB, doc);
const rest = { v: 1, segments: SEGMENTS.map(([name, parent]) => ({ name, parent, pivot: r4(PIVOT[name]) })), joints: Object.fromEntries(Object.entries(J).map(([k, v]) => [k, r4(v)])), muscles: muscleNames, muscleLayers: muscleNames.map((_, id) => { const m = muscles.find((x) => x.id === id); return m ? m.layer : 3; }) };
fs.writeFileSync(OUT_JSON, '// GENERATED by scripts/anatomy/bake-anatomy.mjs - the rest pose of public/anatomy/body.glb (Z-Anatomy, CC BY-SA 4.0). Do not edit.' + String.fromCharCode(10) + 'export default ' + JSON.stringify(rest) + ';' + String.fromCharCode(10));
console.log(`bones ${vB} verts, muscles ${vM} verts -> ${OUT_GLB} ${(fs.statSync(OUT_GLB).size / 1e6).toFixed(2)} MB; ${OUT_JSON}`);
