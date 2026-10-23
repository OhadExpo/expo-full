// THE ANATOMY BODY (#690): the baked Z-Anatomy skeleton + muscles (public/anatomy/body.glb, CC BY-SA 4.0) as one
// skinned body on the 19-segment rig, played from a 60-a-second track (rig.js). Every movement tool mounts THIS - a
// fix lands everywhere at once.
//   const body = await createAnatomyBody();           // loads once per page (cached), then clones cheaply
//   scene.add(body.group); body.setTrack(buildTrack(frames)); body.setTime(ms);
//   body.setLayers({ bones: true, muscles: true, muscleOpacity: 0.35 });   // depth: 1 surface + all below, 2 middle + deep, 3 deep only
// A segment the camera did not see is drawn faded (setTime reads the track's 'seen').
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { NSEG, S, SEGMENTS, PIVOT, fk, segMatrix, sampleTrack } from './rig.js';
import REST from './restJoints.js';

// a phone (or a low-core device) loads the lighter bake - the same body, joints and rig, ~40% of the vertices and 2.3 MB
// instead of 3.7 (scripts/anatomy/bake-anatomy.mjs OUT_GLB=... BONE_RATIO=0.3 MUSC_RATIO=0.12 SIMP_ERR=0.03)
const LITE = typeof navigator !== 'undefined' && ((navigator.userAgentData && navigator.userAgentData.mobile) || /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent || '') || (navigator.hardwareConcurrency || 8) <= 4);
export const ANATOMY_URL = LITE ? '/anatomy/body-lite.glb' : '/anatomy/body.glb';
let loading = null;
// the parsed parts, once per page: [{ layer: 'bone'|'muscle', seg, geometry }]
export function loadAnatomyParts(url = ANATOMY_URL) {
  if (!loading) {
    const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
    loading = loader.loadAsync(url).then((g) => {
      const parts = [];
      g.scene.updateMatrixWorld(true);
      g.scene.traverse((o) => {
        if (!o.isMesh) return;
        const [layer, segName] = (o.name || '').split('-'); const seg = S[segName];
        if (!(layer === 'bone' || layer === 'muscle') || seg == null) return;
        const src = o.geometry, geo = new THREE.BufferGeometry();
        // dequantize into float model space (the quantization's scale + offset live on the node)
        const toF = (a, n) => { const out = new Float32Array(a.count * n); for (let i = 0; i < a.count; i++) for (let k = 0; k < n; k++) out[i * n + k] = a.getComponent(i, k); return new THREE.BufferAttribute(out, n); };
        geo.setAttribute('position', toF(src.attributes.position, 3));
        geo.attributes.position.applyMatrix4(o.matrixWorld);
        if (src.attributes.normal) { geo.setAttribute('normal', toF(src.attributes.normal, 3)); geo.attributes.normal.applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(o.matrixWorld)); geo.attributes.normal.normalize?.(); }
        else geo.computeVertexNormals();
        geo.setAttribute('skinIndex', src.attributes.skinIndex);
        geo.setAttribute('skinWeight', toF(src.attributes.skinWeight, 4));
        if (src.attributes._muscle) geo.setAttribute('muscleId', src.attributes._muscle);
        // THE MUSCLE LAYERS (13.10 #721): 1 surface / 2 middle / 3 deep, peeled at bake time (bake-anatomy.mjs 4b); a body
        // baked before the layers draws every muscle as the surface (never a missing attribute: it reads 0 = discarded)
        if (layer === 'muscle') geo.setAttribute('muscleLayer', src.attributes._layer ? toF(src.attributes._layer, 1) : new THREE.BufferAttribute(new Float32Array(src.attributes.position.count).fill(1), 1));
        geo.setIndex(src.index);
        parts.push({ layer, seg, geometry: geo });
      });
      if (!parts.length) throw new Error('anatomy: no parts in ' + url);
      addFibres(parts);
      return parts;
    }).catch((e) => { loading = null; throw e; });
  }
  return loading;
}

// THE FIBRES (#907, Ohad 23.10 on an anatomy reel: "our models are not close to this level"). A muscle's fibres run
// along its long axis; the bake has no UVs, so each muscle's axis is its principal direction (PCA of its rest vertices)
// and each vertex gets: fiberDir (that axis) and fiberT (0..1 along it - the ends are the tendons). The shader draws
// striations across the fibres, pale tendon ends and a small tone per muscle - the look of a medical render, live.
function addFibres(parts) {
  const ms = parts.filter((p) => p.layer === 'muscle' && p.geometry.attributes.muscleId);
  const st = new Map();
  for (const p of ms) {
    const pos = p.geometry.attributes.position.array, ids = p.geometry.attributes.muscleId;
    for (let i = 0; i < ids.count; i++) {
      const k = ids.getX(i); let a = st.get(k);
      if (!a) { a = new Float64Array(10); st.set(k, a); }
      const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
      a[0]++; a[1] += x; a[2] += y; a[3] += z; a[4] += x * x; a[5] += x * y; a[6] += x * z; a[7] += y * y; a[8] += y * z; a[9] += z * z;
    }
  }
  const ax = new Map();
  for (const [k, a] of st) {
    const n = a[0], mx = a[1] / n, my = a[2] / n, mz = a[3] / n;
    const c = [a[4] / n - mx * mx, a[5] / n - mx * my, a[6] / n - mx * mz, a[7] / n - my * my, a[8] / n - my * mz, a[9] / n - mz * mz];
    let v = [0.3, 1, 0.2];
    for (let it = 0; it < 32; it++) {
      const w = [c[0] * v[0] + c[1] * v[1] + c[2] * v[2], c[1] * v[0] + c[3] * v[1] + c[4] * v[2], c[2] * v[0] + c[4] * v[1] + c[5] * v[2]];
      const L = Math.hypot(w[0], w[1], w[2]) || 1; v = [w[0] / L, w[1] / L, w[2] / L];
    }
    ax.set(k, { m: [mx, my, mz], v, lo: Infinity, hi: -Infinity });
  }
  const proj = (A, pos, i) => (pos[i * 3] - A.m[0]) * A.v[0] + (pos[i * 3 + 1] - A.m[1]) * A.v[1] + (pos[i * 3 + 2] - A.m[2]) * A.v[2];
  for (const p of ms) {
    const pos = p.geometry.attributes.position.array, ids = p.geometry.attributes.muscleId;
    for (let i = 0; i < ids.count; i++) { const A = ax.get(ids.getX(i)), t = proj(A, pos, i); if (t < A.lo) A.lo = t; if (t > A.hi) A.hi = t; }
  }
  for (const p of ms) {
    const pos = p.geometry.attributes.position.array, ids = p.geometry.attributes.muscleId, n = ids.count;
    const dir = new Float32Array(n * 3), tt = new Float32Array(n), mid = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const k = ids.getX(i), A = ax.get(k);
      dir[i * 3] = A.v[0]; dir[i * 3 + 1] = A.v[1]; dir[i * 3 + 2] = A.v[2];
      tt[i] = A.hi > A.lo ? (proj(A, pos, i) - A.lo) / (A.hi - A.lo) : 0.5; mid[i] = k;
    }
    p.geometry.setAttribute('fiberDir', new THREE.BufferAttribute(dir, 3));
    p.geometry.setAttribute('fiberT', new THREE.BufferAttribute(tt, 1));
    p.geometry.setAttribute('muscleIdF', new THREE.BufferAttribute(mid, 1));
  }
}
// the ids of the muscles whose name matches (both sides unless the pattern says .l / .r) - e.g. /Levator scapulae/
export function muscleIds(re) { const out = []; (REST.muscles || []).forEach((n, i) => { if (re.test(n)) out.push(i); }); return out; }
const HI_W = 1024;   // the highlight lookup: one texel per muscle id (610 in the bake)
// the fibre look + the HIGHLIGHT (a named muscle glows, pulsing, the rest muted - the reel's "this is the muscle")
function fibres(mat, U) {
  const prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : () => '';
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 fiberDir;\nattribute float fiberT;\nattribute float muscleIdF;\nvarying float vT;\nvarying float vU;\nvarying float vMid;\nvarying vec3 vFib;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vT = fiberT; vMid = muscleIdF;\n  vec3 acrossR = cross(fiberDir, normal);\n  vU = dot(position, normalize(acrossR + vec3(1e-5)));')
      .replace('#include <skinnormal_vertex>', '#include <skinnormal_vertex>\n#ifdef USE_SKINNING\n  vFib = normalize(normalMatrix * (skinMatrix * vec4(cross(fiberDir, normal), 0.0)).xyz + vec3(1e-5));\n#else\n  vFib = normalize(normalMatrix * cross(fiberDir, normal) + vec3(1e-5));\n#endif');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nvarying float vT;\nvarying float vU;\nvarying float vMid;\nvarying vec3 vFib;\nuniform float uFreq;\nuniform sampler2D uHiTex;\nuniform int uHiN;\nuniform vec3 uHiCol;\nuniform float uTime;\nfloat fibHi() { return uHiN > 0 ? texelFetch(uHiTex, ivec2(int(vMid + 0.5), 0), 0).r : 0.0; }`)
      .replace('#include <color_fragment>', '#include <color_fragment>\n  float fTend = smoothstep(0.82, 0.985, abs(vT * 2.0 - 1.0));\n  float fH = fract(sin(vMid * 12.9898) * 43758.5453);\n  float fU = vU * uFreq;\n  float fFade = (1.0 - smoothstep(0.7, 2.4, fwidth(fU))) * (1.0 - fTend);\n  float fSt = sin(fU + 1.6 * sin(vT * 37.0 + vMid));\n  diffuseColor.rgb *= (0.86 + 0.26 * fH) * (1.0 - 0.13 * fFade * (0.5 + 0.5 * fSt));\n  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.80, 0.70), fTend);')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = mix(roughnessFactor, 0.3, fTend);')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n  normal = normalize(normal + vFib * fSt * 0.32 * fFade);')
      .replace('gl_FragColor.a *= mix(uLo, uHi, fr);', 'gl_FragColor.a *= (uHiN > 0 && fHi > 0.5) ? 1.0 : mix(uLo, uHi, fr);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  float fHi = fibHi();\n  if (uHiN > 0) {\n    if (fHi > 0.5) { float pu = 0.78 + 0.22 * sin(uTime * 3.2); diffuseColor.rgb = mix(diffuseColor.rgb, uHiCol, 0.42); totalEmissiveRadiance += uHiCol * pu * 0.8; }\n    else { float g = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11)); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(g), 0.35) * 0.78; }\n  }');
  };
  mat.customProgramCacheKey = () => `${prevKey()}-fibres`;
  return mat;
}
// THE GLOW SHELL (#907): the lit muscle drawn a second time, pushed out along its normals by a few millimetres,
// additive, brightest at the silhouette - the halo of the medical renders without a bloom pass (a bloom pass made the
// white bones glow too and tinted the plane; this lights only the chosen muscle and costs one cheap pass)
function glowShell(U) {
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.FrontSide });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float muscleIdF;\nvarying float vMid;\nvarying vec3 vGN;\nvarying vec3 vGV;\nuniform float uTime;')
      .replace('#include <skinning_vertex>', '#include <skinning_vertex>\n  vMid = muscleIdF;\n#ifdef USE_SKINNING\n  transformed += normalize(objectNormal) * (0.006 + 0.002 * sin(uTime * 3.2));\n#endif')
      .replace('#include <project_vertex>', '#include <project_vertex>\n#ifdef USE_SKINNING\n  vGN = normalize(normalMatrix * objectNormal);\n#else\n  vGN = vec3(0.0, 0.0, 1.0);\n#endif\n  vGV = -mvPosition.xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nvarying float vMid;\nvarying vec3 vGN;\nvarying vec3 vGV;\nuniform sampler2D uHiTex;\nuniform int uHiN;\nuniform vec3 uHiCol;\nuniform float uTime;`)
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>\n  float h = uHiN > 0 ? texelFetch(uHiTex, ivec2(int(vMid + 0.5), 0), 0).r : 0.0;\n  if (h < 0.5) discard;\n  float fr = pow(1.0 - abs(dot(normalize(vGN), normalize(vGV))), 1.6);\n  gl_FragColor = vec4(uHiCol * (0.35 + 1.4 * fr) * (0.8 + 0.2 * sin(uTime * 3.2)), 1.0);`);
  };
  mat.customProgramCacheKey = () => 'glow-shell';
  return mat;
}
// materials: matte ivory bone (its ridges read by the grazing key light), deep wet muscle red (research 13.10, 6.2)
// THE X-RAY LOOK (research 13.10, 6.1): muscles over bones are drawn twice - a depth-only pass first, then one blended
// colour pass that keeps only the FRONT muscle surface (no inner faces, no sorting flicker), its opacity rising toward
// the silhouette (Fresnel), so the outline reads solid and the skeleton shows through the middle.
function fresnel(mat, lo, hi) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uLo = { value: lo }; sh.uniforms.uHi = { value: hi };
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uLo; uniform float uHi;')
      .replace('#include <dithering_fragment>', '#include <dithering_fragment>\n  float fr = pow(1.0 - abs(dot(normalize(vNormal), normalize(vViewPosition))), 2.0);\n  gl_FragColor.a *= mix(uLo, uHi, fr);');
  };
  mat.customProgramCacheKey = () => `fresnel-${lo}-${hi}`;
  return mat;
}
// a muscle above the chosen depth is not drawn: one uniform per body, on every muscle material (13.10 #721)
function layerCut(mat, uDepth) {
  const prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : () => '';
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    sh.uniforms.uDepth = uDepth;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float muscleLayer;\nvarying float vLayer;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vLayer = muscleLayer;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vLayer;\nuniform float uDepth;')
      .replace('#include <clipping_planes_fragment>', 'if (vLayer < uDepth - 0.5) discard;\n#include <clipping_planes_fragment>');
  };
  mat.customProgramCacheKey = () => `${prevKey()}-layer`;
  return mat;
}
function materials(uDepth, U) {
  const fib = (m) => fibres(m, U);
  const bone = new THREE.MeshStandardMaterial({ color: 0xe6dcc4, roughness: 0.78, metalness: 0, emissive: 0x1a140c, emissiveIntensity: 0.35, side: THREE.FrontSide });
  const muscle = new THREE.MeshPhysicalMaterial({ color: 0xb03a2f, roughness: 0.5, metalness: 0, sheen: 0.3, sheenColor: new THREE.Color(0xff9a8a), side: THREE.FrontSide });
  const ghost = (m, o) => { const g = m.clone(); g.transparent = true; g.opacity = o; g.depthWrite = false; return g; };
  // see-through muscles: the colour pass (Fresnel alpha) + its depth-only twin
  const muscleT = fresnel(muscle.clone(), 0.18, 0.95); muscleT.transparent = true; muscleT.depthWrite = false; muscleT.depthFunc = THREE.LessEqualDepth;
  const muscleDepth = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: true });
  // FOCUS (#907): a lit muscle under others (levator scapulae under the trapezius) is seen through the rest - the
  // others are glass with a solid edge, the lit one solid and glowing (the reel's x-ray)
  const muscleF = fresnel(muscle.clone(), 0.13, 0.78); muscleF.transparent = true; muscleF.depthWrite = false;
  // the clones first (muscleT above, the ghost here), then the cut on each - a clone of a cut material would cut twice
  const muscleG = ghost(muscle, 0.14);
  // the crossfade (13.10 #745): one material per segment while it changes, between the ghost and the solid look
  const boneBase = bone.clone(), muscleBase = muscle.clone();
  const blend = (layer) => (layer === 'bone' ? ghost(boneBase, 1) : fib(layerCut(ghost(muscleBase, 1), uDepth)));
  return { blend, bone, muscle: fib(layerCut(muscle, uDepth)), boneG: ghost(bone, 0.22), muscleG: fib(layerCut(muscleG, uDepth)), muscleT: fib(layerCut(muscleT, uDepth)), muscleDepth: layerCut(muscleDepth, uDepth), muscleF: fib(layerCut(muscleF, uDepth)) };
}
// a soft contact shadow on the floor (real-time shadow maps would re-skin ~540k vertices per light every frame)
function contactShadow() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const r = g.createRadialGradient(64, 64, 4, 64, 64, 62); r.addColorStop(0, 'rgba(0,0,0,0.55)'); r.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.renderOrder = -1; return m;
}

export async function createAnatomyBody({ url } = {}) {
  const parts = await loadAnatomyParts(url);
  const group = new THREE.Group(); group.name = 'anatomy';
  const bones = SEGMENTS.map((n) => { const b = new THREE.Bone(); b.name = n; b.matrixAutoUpdate = false; return b; });
  const skeleton = new THREE.Skeleton(bones, bones.map(() => new THREE.Matrix4()));
  const uDepth = { value: 1 };
  // the fibre spacing (per metre, ~3 mm a fibre bundle) and the highlight, shared by every muscle material of this body
  const hiData = new Uint8Array(HI_W), hiTex = new THREE.DataTexture(hiData, HI_W, 1, THREE.RedFormat, THREE.UnsignedByteType);
  hiTex.magFilter = hiTex.minFilter = THREE.NearestFilter; hiTex.needsUpdate = true;
  const U = { uFreq: { value: 2100 }, uHiTex: { value: hiTex }, uHiN: { value: 0 }, uHiCol: { value: new THREE.Color(0xff2d8a) }, uTime: { value: 0 } };
  const M = materials(uDepth, U);
  const mk = (p, mat, order, extra) => {
    const m = new THREE.SkinnedMesh(p.geometry, mat);
    m.bind(skeleton, new THREE.Matrix4());
    m.frustumCulled = false; m.castShadow = false; m.receiveShadow = false;
    m.renderOrder = order; m.userData = { layer: p.layer, seg: p.seg, ...extra };
    group.add(m); return m;
  };
  const meshes = parts.map((p) => mk(p, p.layer === 'bone' ? M.bone : M.muscle, p.layer === 'bone' ? 0 : 2));
  // the depth-only twins of the muscles, used in the see-through mode
  const depthTwins = parts.filter((p) => p.layer === 'muscle').map((p) => mk(p, M.muscleDepth, 1, { twin: true }));
  // the glow twins of the muscles (#907), drawn last, only while a muscle is lit
  const glowMat = glowShell(U);
  const glowTwins = parts.filter((p) => p.layer === 'muscle' && p.geometry.attributes.muscleIdF).map((p) => mk(p, glowMat, 4, { glow: true }));
  const shadow = contactShadow(); group.add(shadow);
  const layers = { bones: true, muscles: true, muscleOpacity: 1, depth: 1 };
  let track = null, lastSeen = new Uint8Array(NSEG).fill(1);
  // how solid each segment is drawn, 0 (ghost) .. 1 (solid): the share of the track's seen frames within 0.2 s (#745)
  let lastW = new Float32Array(NSEG).fill(1); const curW = new Float32Array(NSEG);
  const blendM = { bone: new Array(NSEG).fill(null), muscle: new Array(NSEG).fill(null) };
  const blendOf = (layer, seg, w) => {
    const key = layer === 'bone' ? 'bone' : 'muscle';
    const m = blendM[key][seg] || (blendM[key][seg] = M.blend(key));
    m.opacity = (key === 'bone' ? 0.22 : 0.14) + (1 - (key === 'bone' ? 0.22 : 0.14)) * w; return m;
  };
  const weigh = (t) => {
    const hz = track.hz || 60, f = Math.round(((t - track.t0) * hz) / 1000), K = Math.max(1, Math.round(0.2 * hz)), sn = track.seen;
    for (let i = 0; i < NSEG; i++) { let sum = 0, cnt = 0; for (let k = Math.max(0, f - K); k <= Math.min(track.m - 1, f + K); k++) { sum += sn[k * NSEG + i]; cnt++; } curW[i] = cnt ? sum / cnt : 1; }
    let changed = false; for (let i = 0; i < NSEG; i++) if (Math.abs(curW[i] - lastW[i]) > 0.001) { changed = true; break; }
    if (changed) { lastW = Float32Array.from(curW); for (let i = 0; i < NSEG; i++) lastSeen[i] = curW[i] >= 0.5 ? 1 : 0; look(); }
  };
  const Q = PIVOT.map(() => new THREE.Quaternion()), root = new THREE.Vector3(), piv = PIVOT.map(() => new THREE.Vector3());
  const QA = PIVOT.map(() => new THREE.Quaternion()), QB = PIVOT.map(() => new THREE.Quaternion()), rootA = new THREE.Vector3(), rootB = new THREE.Vector3();

  const look = () => {
    const focus = layers.muscles && U.uHiN.value > 0;
    const through = !focus && layers.bones && layers.muscles && layers.muscleOpacity < 1;
    for (const m of meshes) {
      const { layer, seg } = m.userData, seen = lastSeen[seg] !== 0, w = lastW[seg];
      const mid = w > 0.001 && w < 0.999;   // changing: the crossfade (the see-through look keeps its own two)
      if (layer === 'bone') { m.visible = layers.bones; m.material = mid ? blendOf('bone', seg, w) : seen ? M.bone : M.boneG; }
      else { m.visible = layers.muscles; m.material = focus ? (seen ? M.muscleF : M.muscleG) : mid && !through ? blendOf('muscle', seg, w) : !seen ? M.muscleG : through ? M.muscleT : M.muscle; }
    }
    for (const m of depthTwins) m.visible = through && lastSeen[m.userData.seg] !== 0;
    for (const m of glowTwins) m.visible = layers.muscles && U.uHiN.value > 0;
  };
  look();
  const apply = (Qs, rootV) => {
    fk(Qs, rootV, track, piv);
    for (let i = 0; i < NSEG; i++) { segMatrix(i, Qs, piv, track, bones[i].matrixWorld); }
    // the contact shadow under the feet, on the clip's floor, wider as the feet spread
    const fl = piv[S.footL], fr = piv[S.footR], w = Math.max(0.5, Math.hypot(fl.x - fr.x, fl.z - fr.z) + 0.45);
    shadow.position.set((fl.x + fr.x) / 2, track.floor + 0.003, (fl.z + fr.z) / 2); shadow.scale.set(w, w * 0.8, 1);
  };
  return {
    group, meshes, skeleton,
    setTrack(tr) { track = tr; if (tr) this.setTime(tr.t0); },
    get track() { return track; },
    // the pose at t (ms, the frames' own clock)
    setTime(t) {
      if (!track) return;
      // not in view (no reading near t, or his trunk unseen): no body - a guess is not drawn (13.10)
      group.visible = !track.inView || track.inView(t);
      const s = sampleTrack(track, t, Q, root);
      apply(s.Q, s.root);
      if (track.seen && track.m) weigh(t);
      else { let changed = false; for (let i = 0; i < NSEG; i++) if (lastSeen[i] !== s.seen[i]) { changed = true; break; } if (changed) { lastSeen = Uint8Array.from(s.seen); look(); } }
    },
    // LIVE (13.10): the pose at t blended from another track (the one this track replaced) by w - each segment's turn
    // slerped, the hips lerped - so a rebuilt live track takes over without a snap
    setTimeBlend(fromTrack, t, w) {
      if (!track) return;
      if (!fromTrack || !(w < 1)) { this.setTime(t); return; }
      group.visible = !track.inView || track.inView(t);
      const a = sampleTrack(fromTrack, Math.max(fromTrack.t0, Math.min(fromTrack.t1, t)), QA, rootA);
      const s = sampleTrack(track, t, Q, root);
      for (let i = 0; i < NSEG; i++) QB[i].copy(a.Q[i]).slerp(s.Q[i], w);
      rootB.copy(a.root).lerp(s.root, w);
      apply(QB, rootB);
      if (track.seen && track.m) weigh(t);
      else { let changed = false; for (let i = 0; i < NSEG; i++) if (lastSeen[i] !== s.seen[i]) { changed = true; break; } if (changed) { lastSeen = Uint8Array.from(s.seen); look(); } }
    },
    // where a rest point of a segment is now (e.g. the trails, the camera)
    jointWorld(seg) { return piv[seg].clone(); },
    setLayers(o) { Object.assign(layers, o); uDepth.value = layers.depth || 1; look(); },
    // light up muscles (ids from muscleIds(), or a RegExp) in a colour; none = the plain look. tick(seconds) pulses it.
    setHighlight(sel, color) {
      const ids = !sel ? [] : sel instanceof RegExp ? muscleIds(sel) : sel;
      hiData.fill(0); let n = 0; for (const id of ids) if (id >= 0 && id < HI_W) { hiData[id] = 255; n++; } hiTex.needsUpdate = true; U.uHiN.value = n;
      if (color != null) U.uHiCol.value.set(color);
      look();
      return U.uHiN.value;
    },
    get highlighted() { return U.uHiN.value; },
    tick(sec) { U.uTime.value = sec; },
    // its own: the materials, the contact shadow (plane, material, canvas texture) and the skeleton; the body's geometries
    // are the page cache's and stay
    dispose() { glowMat.dispose(); hiTex.dispose(); for (const k of Object.keys(M)) if (M[k] && M[k].dispose) M[k].dispose(); for (const arr of Object.values(blendM)) for (const m of arr) if (m) m.dispose(); shadow.geometry.dispose(); if (shadow.material.map) shadow.material.map.dispose(); shadow.material.dispose(); skeleton.dispose(); group.removeFromParent(); },
  };
}
