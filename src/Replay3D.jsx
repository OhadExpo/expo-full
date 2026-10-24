// REPLAY 3D (5.10 #556, Ohad: "Do 23" - "spin the athlete's landing to any angle
// after filming"). A real 3D scene of the pose the clip already gave us
// (MediaPipe world landmarks, metres): a solid body standing on a measured floor,
// 3D trails of the hands (the bar path) and the hips, front / side / top / behind
// and free orbit, slow motion, and the true 3D knee / hip / elbow angles at the
// frame on screen. It follows the video's playhead when the clip plays. No new
// model, no server: the same frames the metrics use.
//
// The geometry rules are poseLab's (frameToPoints3D: y up, a proper rotation;
// lmVisible: a point MediaPipe is unsure of is not drawn). If WebGL is not there
// the caller keeps the flat viewer (onUnsupported).
import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { frameToPoints3D, stableReplayFrames, lmVisible } from './poseLab';
import { C, FN } from './theme';
import { useT, LangCtx } from './i18n';
import AngleNum, { AngleHead } from './AngleNum';
import { ChipGrid, JoinedButtons, SegWord } from './ui';
import { createAnatomyBody } from './anatomy/AnatomyBody';
import { FOCUS_KEYS, autoFocus, focusPattern } from './anatomy/muscleFocus';
import { buildTrack, sampleTrack, fk, carry, modelAngles, S as SEG, PIVOT, RJ, NSEG as SEG_COUNT } from './anatomy/rig';
import { anatomyFrames } from './anatomy/lift2d';
import { modelBalance } from './anatomy/balance';
import { modelJointAxes } from './anatomy/jointAxes';
import { createPoseOverlay } from './poseOverlay';

const ACCENT = 0x39bdff, HIP_TRAIL = 0xf5a524, BODY = 0xe8eef5;
const FEET = [27, 28, 29, 30, 31, 32];
// THE PANEL'S CHIPS KEEP 3PX A SIDE (#1026): five to a row leaves a 360px phone 59px a chip, and the house 10px a side
// clipped FRONT, BEHIND, TRAILS, SKELETON, SURFACE, TRANSVERSE, CHEST and GLUTES (measured, scrollWidth > clientWidth)
const CHIP_TIGHT = { padding: '0 3px' };
// the anatomy layers: bones alone, muscles alone, or the muscles see-through over the bones
// THE LAYERS, as an anatomy app peels them (13.10 #721, Ohad: "skeleton > deeper muscles > superficial (however many
// layers there are)"): the bake measured three muscle layers; each view shows the skeleton and every layer from the
// chosen one inward, opaque
// light the focus on a body (#907): 'off', 'auto' (the joints that moved most in this clip) or a muscle group
function applyFocus(body, focus) {
  if (!body) return;
  const groups = focus === 'off' ? [] : focus === 'auto' ? autoFocus(body.track) : [focus];
  body.setHighlight(focusPattern(groups), 0xff2d8a);
}
const LAYERS = { skeleton: { bones: true, muscles: false }, deep: { bones: true, muscles: true, muscleOpacity: 1, depth: 3 }, middle: { bones: true, muscles: true, muscleOpacity: 1, depth: 2 }, surface: { bones: true, muscles: true, muscleOpacity: 1, depth: 1 } };
const LAYER_OLD = { bones: 'skeleton', muscles: 'surface', both: 'surface' };   // a choice remembered from before the layers

function webglOk() {
  try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); } catch { return false; }
}

// the true 3D angle at b (a-b-c), degrees
function angle3(a, b, c) {
  if (!a || !b || !c) return null;
  const u = { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }, v = { x: c.x - b.x, y: c.y - b.y, z: c.z - b.z };
  const d = Math.hypot(u.x, u.y, u.z) * Math.hypot(v.x, v.y, v.z);
  if (!d) return null;
  return Math.round((Math.acos(Math.max(-1, Math.min(1, (u.x * v.x + u.y * v.y + u.z * v.z) / d))) * 180) / Math.PI);
}

// the analysed joint's 3D angle, L/R averaged where both are seen (the rep timeline's trace)
const CHANNEL_JOINTS = { knee: [[23, 25, 27], [24, 26, 28]], hip: [[11, 23, 25], [12, 24, 26]], elbow: [[11, 13, 15], [12, 14, 16]], sho: [[13, 11, 23], [14, 12, 24]] };   // keys = the analysis' kind ('sho', not 'shoulder' - review 11.10)

// reps: [{ t0, tb, t1 }] in the frames' own ms (start / bottom / end of each counted rep, from the
// analysis); channel: the analysed joint. With both, a rep timeline sits under the scrubber (#656).
// range / onRange: the coach's first and last rep of the set (1-indexed, the same trim as ANALYZE REPS
// in the speed / ROM tabs - Ohad: "set where is the first and last rep"). Reps outside it are dimmed.
export default function Replay3D({ frames, playheadT = null, onUnsupported, onSeek = null, reps = null, channel = null, range = null, onRange = null, clipSrc = null, exerciseTitle = '' }) {
  const tt = useT();
  // time runs the way the frame slider does: right to left in Hebrew (#656)
  const rtl = useContext(LangCtx) === 'he';
  const hostRef = useRef(null), wrapRef = useRef(null);
  const stateRef = useRef(null);
  const [supported] = useState(() => webglOk());
  const [hostW, setHostW] = useState(0);   // the canvas width, for the rep-number rows (measured, not 360 on the first paint)
  // THE CLIP BESIDE THE BODY (13.10 #713, Ohad: "show me the original clip next to it"): the video the body was read
  // from, in the same row, on the same clock - while playing the clip IS the clock (slow motion included), paused it
  // follows the slider. A portrait clip stands beside the canvas, a landscape one above it.
  const clipRef = useRef(null), rowRef = useRef(null);
  const [clipAR, setClipAR] = useState(0.75);   // width / height, from the video once it loads
  const [rowW, setRowW] = useState(0);
  const clipSide = !!clipSrc && clipAR <= 1.05;
  const clipSideRef = useRef(clipSide); clipSideRef.current = clipSide;
  const clipARRef = useRef(clipAR); clipARRef.current = clipAR;
  // beside a portrait clip both stand at the clip's own height: the row = the clip + a canvas of 3:4 (as the side-by-side
  // videos he was sent - a fixed 1.15 x width height left the clip in black bars on a phone, 13.10)
  const sideH = (W) => Math.round(Math.min(560, (W - 8) / (clipARRef.current + 0.75)));
  const poseFrames = useMemo(() => stableReplayFrames(frames), [frames]);   // 5.10 #558; one shared computation per clip (#656)
  const pts = useMemo(() => poseFrames.map((f) => frameToPoints3D(f.worldLandmarks)), [poseFrames]);
  const [idx, setIdx] = useState(0);
  // the clip beside the body carries the two on-video tools too (14.10 #766): SKELETON + JOINT ANGLES, both on
  const [clipSkel, setClipSkel] = useState(true);
  const [clipAng, setClipAng] = useState(true);
  const clipCanvasRef = useRef(null), clipOvlRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(0.5);
  const [trails, setTrails] = useState(true);
  // the joint box's PLANE (13.10 #716): sagittal (the joint angles), frontal, transverse
  const [plane, setPlane] = useState(() => { try { const v = localStorage.getItem('expo-anatomy-plane'); return ['sag', 'front', 'trans'].includes(v) ? v : 'sag'; } catch { return 'sag'; } });
  useEffect(() => { try { localStorage.setItem('expo-anatomy-plane', plane); } catch { /* private mode */ } }, [plane]);
  // the plane drawn through the body (#820): read by the render loop every frame
  const planeRef = useRef(plane); planeRef.current = plane;
  const planeOnRef = useRef(false);
  // THE ANATOMY BODY (13.10 #690, Ohad: "anatomy models based on skeleton and muscle layers"): the Z-Anatomy skeleton
  // and muscles on one rig, played from a 60-a-second track (#691). The mannequin below is only the fallback when the
  // model cannot load. layer: 'bones' | 'muscles' | 'both'
  // the body is built from the frames LIFTED onto the picture (anatomy/lift2d.js): where the video shows each joint,
  // depth solved from bone lengths - MediaPipe's own 3D folded a leaning trunk (13.10 #705)
  const track = useMemo(() => {
    // NOT stableReplayFrames: its smoothing averaged a fast leg away (c31 9.5 s: a 22 cm leg lift -> -1 cm) and its
    // feet step pinned a lifted foot down. The rig keeps its own outlier rejection, feet and smoothing.
    // Guarded (13.10 review): a throw in ~1,200 lines of track maths must cost the anatomy body, never the whole tool -
    // no track = the stick figure
    if (!Array.isArray(frames) || !frames.length) return null;
    try {
    const lifted = anatomyFrames(frames, frames && frames.dims);
    const byT = new Map(lifted.map((f) => [f.t, f]));
    // a frame read as ANOTHER PERSON (13.10, c13) is no knot - its old points would put the stranger back
    const other = lifted.otherPerson || new Set();
    const tr = buildTrack(poseFrames.map((f, i) => { const g = byT.get(f.t); return { t: f.t, pts: g ? frameToPoints3D(g.worldLandmarks) : pts[i], img: (g || f).landmarks || null }; }).filter((f) => !other.has(f.t)), { dims: frames && frames.dims, exercise: exerciseTitle });
    // a harness can read what the replay was given (audit-out/_3d-shot.mjs ANATDBG=1) - inert unless set
    try { if (typeof window !== 'undefined' && window.__anatDebugOn) window.__anatDebug = { dims: frames && frames.dims, n: frames && frames.length, lifted: lifted.length, track: tr, frames, lifted0: lifted[0], uprightR: lifted.uprightR || null }; } catch { /* the harness's problem */ }
    return tr;
    } catch (e) { console.warn('anatomy track', e); return null; }
  }, [frames, poseFrames, pts, exerciseTitle]);
  const [anat, setAnat] = useState('loading');   // loading | ready | error
  // the stage (floor, framing, facing, trails) follows the anatomy body - unless the model could not load: then the
  // stick figure stands on its own points (13.10 review: it floated on the body's floor with trails beside it)
  const stageTrack = anat === 'error' ? null : track;
  // HOW MUCH OF THE CLIP WAS READ (13.10): the share of the clip with him in view - under 70%, the replay says so (he
  // left the picture, or was too far): a guess is never passed off as a reading
  // HOW STEADY THE 3D READ IS (13.10, measured): segments turning over 20 degrees in one 60 Hz frame while seen, per
  // second in view - 12 clips measured: good ones 0-4.7, a bench press from a low camera (c27) 39, a far rear view (c38)
  // 19. Over 10 the replay says the angle reads poorly: a body that flips in depth still matches the picture, so it is
  // never hidden by that
  const popRate = useMemo(() => {
    if (!track || !track.quats || !track.m) return 0;
    const N = SEG_COUNT, q = track.quats, sn = track.seen; let pops = 0, inV = 0;
    for (let k = 0; k + 1 < track.m; k++) {
      const t = track.t0 + (k * 1000) / track.hz; if (track.inView && !track.inView(t)) continue; inV++;
      for (let s2 = 0; s2 < N; s2++) {
        if (!sn[k * N + s2] || !sn[(k + 1) * N + s2]) continue;
        const a = k * N * 4 + s2 * 4, b = a + N * 4, d = Math.abs(q[a] * q[b] + q[a + 1] * q[b + 1] + q[a + 2] * q[b + 2] + q[a + 3] * q[b + 3]);
        if (2 * Math.acos(Math.min(1, d)) > (20 * Math.PI) / 180) pops++;
      }
    }
    return inV ? pops / (inV / track.hz) : 0;
  }, [track]);
  const readShare = useMemo(() => { if (!track || !track.inView) return 1; let n = 0, k = 0; for (let t = track.t0; t <= track.t1; t += 100) { n++; if (track.inView(t)) k++; } return n ? k / n : 1; }, [track]);
  const openedAt = useRef(false);
  const [layer, setLayer] = useState(() => { try { const v = localStorage.getItem('expo-anatomy-layer') || 'surface'; return LAYERS[v] ? v : LAYER_OLD[v] || 'surface'; } catch { return 'surface'; } });
  const layerRef = useRef(layer); layerRef.current = layer;
  // MUSCLE FOCUS (#907): off / auto (the joint that moved most) / a group - the muscles glow, the rest turn to glass
  const [focus, setFocus] = useState(() => { try { const v = localStorage.getItem('expo-anatomy-focus'); return FOCUS_KEYS.includes(v) ? v : 'off'; } catch { return 'off'; } });
  const focusRef = useRef(focus); focusRef.current = focus;
  const trailsRef = useRef(true); trailsRef.current = trails;   // a rebuilt scene keeps the toggle (review 12.10)
  const idxRef = useRef(0); idxRef.current = idx;
  // the original frames, in the replay's order (stableReplayFrames keeps the frames that have world points, in order)
  const rawFrames = useMemo(() => (frames || []).filter((f) => f && f.worldLandmarks), [frames]);
  useEffect(() => {
    const cv = clipCanvasRef.current, v = clipRef.current;
    if (!cv || !v) return undefined;
    const paint = () => {
      const bw = v.clientWidth, bh = v.clientHeight, vw = v.videoWidth, vh = v.videoHeight;
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      if (cv.width !== Math.round(bw * dpr)) cv.width = Math.round(bw * dpr);
      if (cv.height !== Math.round(bh * dpr)) cv.height = Math.round(bh * dpr);
      const ctx = cv.getContext('2d');
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
      // the replay frames hold rotated WORLD points only: the clip is drawn from the original frame, same index
      const f = rawFrames[idxRef.current] || null;
      if (!f || !f.landmarks || !vw || !vh || !bw || !bh || (!clipSkel && !clipAng)) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const sc = Math.min(bw / vw, bh / vh), dw = vw * sc, dh = vh * sc, ox = (bw - dw) / 2, oy = (bh - dh) / 2;
      if (!clipOvlRef.current) clipOvlRef.current = createPoseOverlay();
      clipOvlRef.current.update(f.landmarks, f.worldLandmarks, (f.t || 0) / 1000);
      clipOvlRef.current.draw(ctx, { w: bw, h: bh, px: (p) => ox + p.x * dw, py: (p) => oy + p.y * dh, skeleton: clipSkel, angles: clipAng });
    };
    paint();
    // the clip loads after the first paint, and its box resizes with the layout: redraw then too
    v.addEventListener('loadeddata', paint); v.addEventListener('seeked', paint);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(paint) : null;
    if (ro) ro.observe(v);
    return () => { v.removeEventListener('loadeddata', paint); v.removeEventListener('seeked', paint); if (ro) ro.disconnect(); };
  }, [idx, clipSkel, clipAng, clipAR, rawFrames]);   // eslint-disable-line react-hooks/exhaustive-deps
  const playingRef = useRef(false); playingRef.current = playing;
  // the trails show THIS rep (or the last 2 s outside one): drawn over the whole clip they piled
  // the set-up and every rep into one tangle at the shoulder (11.10 #656, "output can be better")
  const trailFromRef = useRef(() => 0);
  // VS THE FIRST REP (11.10 #656): an outline of the set's first rep, at the same point of ITS rep as
  // the frame on screen is of the current one, standing where he stands - so the drift of depth, back
  // angle or bar path across the set is seen, not reconstructed from numbers. -1 = nothing to draw.
  const [compare, setCompare] = useState(false);
  const compareRef = useRef(() => -1);

  // THE REPS ON THE TIMELINE (11.10 #656, Ohad: "output can be better"): the 3D replay knew
  // nothing of the set - a coach scrubbed frame by frame to find rep 4. Now the analysed joint's
  // angle runs under the scrubber, each counted rep shaded and numbered at its bottom, and
  // PREV / NEXT REP jump the replay (and the video) to the start of a rep.
  const repSpans = useMemo(() => (Array.isArray(reps) ? reps : []).filter((r) => r && Number.isFinite(r.tb))
    .map((r) => ({ t0: Number.isFinite(r.t0) ? r.t0 : r.tb, tb: r.tb, t1: Number.isFinite(r.t1) ? r.t1 : r.tb })).sort((a, b) => a.tb - b.tb), [reps]);
  const idxAt = (t) => { let lo = 0, hi = poseFrames.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (poseFrames[m].t < t) lo = m + 1; else hi = m; } return lo; };
  // THE SET (13.10 #714, Ohad: "only the exercise part. Cut the video before and after"): the first rep's start to the
  // last rep's end, 0.3 s either side - the replay opens on it and PLAY loops it; without counted reps, the whole clip
  const setSpan = useMemo(() => (repSpans.length ? [repSpans[0].t0 - 300, repSpans[repSpans.length - 1].t1 + 300] : null), [repSpans]);
  const setSpanRef = useRef(setSpan); setSpanRef.current = setSpan;
  // the replay OPENS on the set, or where he is in view (13.10: it opened on him walking past the phone); a parent that
  // drives the frame with no way to move it (the shot analyzer) keeps its own
  useEffect(() => {
    if (openedAt.current || !track || !poseFrames.length || (playheadT != null && !onSeek)) return;
    openedAt.current = true;
    const t = setSpan ? Math.max(setSpan[0], poseFrames[0].t) : track.firstInView;
    if (!(t > poseFrames[0].t)) return;
    const k = idxAt(t); setIdx(k); if (onSeek) onSeek(poseFrames[k].t - poseFrames[0].t);
  }, [track, poseFrames, playheadT, onSeek, setSpan]);   // eslint-disable-line react-hooks/exhaustive-deps
  const trace = useMemo(() => {
    const J = CHANNEL_JOINTS[channel] || null;
    if (!J || !pts.length || !repSpans.length) return null;
    // the sides are chosen ONCE per clip (as channelSignal does): averaging whichever side was seen
    // at each frame jumped the trace by the L/R difference every time a side flickered. A chosen
    // side missing for a frame takes the other side plus their usual offset; then a 5-median.
    const side = J.map(([i, j, k]) => pts.map((p) => (p && lmVisible(p[i]) && lmVisible(p[j]) && lmVisible(p[k]) ? angle3(p[i], p[j], p[k]) : null)));
    const share = side.map((sv) => sv.filter((x) => x != null).length / Math.max(1, sv.length));
    const use = share.map((x) => x >= 0.6).some(Boolean) ? share.map((x) => x >= 0.6) : share.map((x) => x === Math.max(...share));
    const both = [], A = side[0], B = side[1];
    for (let i = 0; i < pts.length; i++) if (A[i] != null && B[i] != null) both.push(A[i] - B[i]);
    both.sort((x, y) => x - y);
    const off = both.length ? both[both.length >> 1] : 0;   // L minus R, typical
    const raw = pts.map((_, i) => {
      const a = A[i], b = B[i];
      if (use[0] && use[1]) return a != null && b != null ? (a + b) / 2 : a != null ? a - off / 2 : b != null ? b + off / 2 : null;
      return use[0] ? (a != null ? a : b != null ? b + off : null) : (b != null ? b : a != null ? a - off : null);
    });
    const v = raw.map((_, i) => { const w = raw.slice(Math.max(0, i - 2), i + 3).filter((x) => x != null).sort((x, y) => x - y); return raw[i] == null || !w.length ? null : w[w.length >> 1]; });
    const ok = v.filter((x) => x != null); if (ok.length < 2) return null;
    // scaled to the 2nd-98th percentile: one wild frame used to flatten every rep into the top band
    const so = ok.slice().sort((x, y) => x - y), q = (f) => so[Math.min(so.length - 1, Math.floor(f * so.length))];
    // the clamp is for DRAWING only: the rep stats read `raw` - clamped, a long clip's bottom 2% is the
    // rep bottoms themselves and every deep rep read the same range (review 11.10)
    return { raw: v, v: v.map((x) => (x == null ? null : Math.max(q(0.02), Math.min(q(0.98), x)))), lo: q(0.02), hi: Math.max(q(0.98), q(0.02) + 1) };
  }, [pts, channel, repSpans.length]);
  // per rep: the analysed joint's range and the rep's time. (A "shorter than the set" mark was tried
  // and measured against his hand-noted reps on 23 clips: it flagged 19% of the false reps and 15% of
  // the true ones - no help telling them apart, so it is not shown.)
  const repStats = useMemo(() => {
    if (!trace) return [];
    const st = repSpans.map((r) => {
      let lo = Infinity, hi = -Infinity;
      for (let i = idxAt(r.t0); i < poseFrames.length && poseFrames[i].t <= r.t1; i++) { const a = trace.raw[i]; if (a != null) { if (a < lo) lo = a; if (a > hi) hi = a; } }
      // DEPTH = the joint's smallest angle in the rep - the bottom of a squat / hinge; for an elbow the
      // smallest angle is the TOP of a curl, so depth is shown for knee and hip work only
      return { rom: hi > lo ? Math.round(hi - lo) : null, depth: (channel === 'knee' || channel === 'hip') && Number.isFinite(lo) ? Math.round(lo) : null, sec: Math.max(0, (r.t1 - r.t0) / 1000) };
    });
    return st;
  }, [trace, repSpans, poseFrames, channel]);   // eslint-disable-line react-hooks/exhaustive-deps
  compareRef.current = (i) => {
    if (!compare || !poseFrames[i]) return -1;
    const t = poseFrames[i].t;
    const k = repSpans.findIndex((q) => t >= q.t0 && t <= q.t1);
    const ref = repSpans[lo - 1];
    if (k < 0 || !ref || k === lo - 1) return -1;
    const cur = repSpans[k], u = (t - cur.t0) / Math.max(1, cur.t1 - cur.t0);
    return idxAt(ref.t0 + u * (ref.t1 - ref.t0));
  };
  // REP SHAPES (11.10 #656): every rep's joint-angle curve, each stretched to the same length and laid
  // over the others - the set's depth consistency, and the rep whose shape breaks (a pause, a cut
  // bottom, a grind out of the hole), at a glance. The measured trace, never the drawing clamp.
  const shapes = useMemo(() => {
    if (!trace) return null;
    const out = repSpans.map((r) => {
      const pts2 = [];
      for (let i = idxAt(r.t0); i < poseFrames.length && poseFrames[i].t <= r.t1; i++) { const a = trace.raw[i]; if (a != null) pts2.push([(poseFrames[i].t - r.t0) / Math.max(1, r.t1 - r.t0), a]); }
      return pts2;
    });
    return out;
  }, [trace, repSpans, poseFrames]);   // eslint-disable-line react-hooks/exhaustive-deps
  trailFromRef.current = (i) => {
    const t = poseFrames[i] ? poseFrames[i].t : 0;
    const r = repSpans.find((q) => t >= q.t0 && t <= q.t1 + 250);
    return idxAt(r ? r.t0 : t - 2000);
  };
  const lo = range && range.from > 0 ? range.from : 1, hi = range && range.to > 0 ? range.to : repSpans.length;
  const inSet = (i) => i + 1 >= lo && i + 1 <= hi;
  const seekTo = (i) => { const k = Math.max(0, Math.min(poseFrames.length - 1, i)); setPlaying(false); setIdx(k); if (onSeek && poseFrames[k] && poseFrames[0]) onSeek(poseFrames[k].t - poseFrames[0].t); };

  useEffect(() => { if (!supported && onUnsupported) onUnsupported(); }, [supported, onUnsupported]);

  // the floor: the lowest a foot gets anywhere in the clip (the body never sinks into it)
  const floorY = useMemo(() => {
    if (stageTrack) return stageTrack.floor;   // the anatomy body's own soles, the lowest they get
    let m = Infinity;
    for (const p of pts) for (const k of FEET) { const q = p && p[k]; if (q && lmVisible(q) && q.y < m) m = q.y; }
    return isFinite(m) ? m : -0.95;
  }, [pts, stageTrack]);

  // where the body is over the whole clip: the camera frames HIM, not a fixed box (at 1440 he stood
  // small in a wide canvas). EVERY point that is drawn counts - a faded (unseen) arm is drawn too, and
  // framing only the seen points cut a raised arm off the top of the canvas (11.10 #671) - trimmed to
  // the 0.5-99.5th percentile against a wild frame, plus the head above the ears.
  const bounds = useMemo(() => {
    const X = [], Y = [], Z = [];
    const fin = (q) => q && Number.isFinite(q.x) && Number.isFinite(q.y) && Number.isFinite(q.z);
    if (stageTrack) {
      // THE MODEL IS FRAMED, not the raw points (13.10: in the app the anatomy body - built on the picture - stood
      // outside the raw points' box and was cut off at the top): every pivot, the crown and the toes, sampled over the clip
      const Q = PIVOT.map(() => new THREE.Quaternion()), root = new THREE.Vector3(), piv = PIVOT.map(() => new THREE.Vector3()), v = new THREE.Vector3();
      for (let k = 0; k < stageTrack.m; k += 6) {
        sampleTrack(stageTrack, stageTrack.t0 + (k * 1000) / stageTrack.hz, Q, root); fk(Q, root, stageTrack, piv);
        for (const q of piv) { X.push(q.x); Y.push(q.y); Z.push(q.z); }
        for (const [seg, pt] of [[SEG.head, RJ.crown], [SEG.footL, RJ.toeL], [SEG.footR, RJ.toeR], [SEG.handL, RJ.handTipL], [SEG.handR, RJ.handTipR]]) { carry(seg, pt, Q, piv, stageTrack, v); X.push(v.x); Y.push(v.y); Z.push(v.z); }
      }
    } else pts.forEach((p, n) => { if (!p || n % 2) return; for (let k = 11; k < p.length; k++) { const q = p[k]; if (fin(q)) { X.push(q.x); Y.push(q.y); Z.push(q.z); } } for (const k of [0, 7, 8]) { const q = p[k]; if (fin(q)) { X.push(q.x); Y.push(q.y + 0.13); Z.push(q.z); } } });
    if (X.length < 20) return null;
    const pc = (a, f) => { const s2 = a.slice().sort((x, y) => x - y); return s2[Math.min(s2.length - 1, Math.floor(f * s2.length))]; };
    const r = (a) => [pc(a, 0.005), pc(a, 0.995)];
    const [x0, x1] = r(X), [y0, y1] = r(Y), [z0, z1] = r(Z);
    const yb = Math.min(y0, floorY);
    return { c: [(x0 + x1) / 2, (yb + y1) / 2, (z0 + z1) / 2], h: y1 - yb, w: Math.max(x1 - x0, z1 - z0) };
  }, [pts, floorY, stageTrack]);

  // HIS front, not the world's (11.10 #671): FRONT / SIDE / BEHIND were fixed world axes, so a lifter
  // facing the camera was shown from BEHIND under 'FRONT'. Front = where his toes point (heel -> toe,
  // level), else his nose; side = the side the camera saw more of (his left joints are the odd ones).
  const facing = useMemo(() => {
    // with the anatomy body: ITS front (the pelvis's forward, averaged over the clip) - the raw points stand in another
    // frame than the body built on the picture (13.10)
    if (stageTrack) {
      const Q = PIVOT.map(() => new THREE.Quaternion()), root = new THREE.Vector3(); let fx = 0, fz = 0, sL = 0, sR = 0;
      for (let k = 0; k < stageTrack.m; k += 6) {
        const smp = sampleTrack(stageTrack, stageTrack.t0 + (k * 1000) / stageTrack.hz, Q, root);
        const f = new THREE.Vector3(0, 0, 1).applyQuaternion(Q[SEG.pelvis]); fx += f.x; fz += f.z;
        sL += smp.seen[SEG.uarmL] + smp.seen[SEG.thighL]; sR += smp.seen[SEG.uarmR] + smp.seen[SEG.thighR];
      }
      const l = Math.hypot(fx, fz); if (l > 1e-6) {
        const F = [fx / l, fz / l], S2 = [-F[1], F[0]];   // his right, level (forward x up)
        return { F, seen: sL >= sR ? [-S2[0], -S2[1]] : S2 };
      }
    }
    let fx = 0, fz = 0, sx = 0, sz = 0, nx = 0, nz = 0, visL = 0, visR = 0;
    for (const p of pts) {
      if (!p) continue;
      for (const [h, t] of [[29, 31], [30, 32]]) if (lmVisible(p[h]) && lmVisible(p[t])) { fx += p[t].x - p[h].x; fz += p[t].z - p[h].z; }
      for (const [l, r] of [[11, 12], [23, 24]]) if (p[l] && p[r] && Number.isFinite(p[l].x) && Number.isFinite(p[r].x)) { sx += p[r].x - p[l].x; sz += p[r].z - p[l].z; }
      if (lmVisible(p[0]) && (lmVisible(p[7]) || lmVisible(p[8]))) { const e = [7, 8].filter((k) => lmVisible(p[k])); const ex = e.reduce((a, k) => a + p[k].x, 0) / e.length, ez = e.reduce((a, k) => a + p[k].z, 0) / e.length; nx += p[0].x - ex; nz += p[0].z - ez; }
      for (const k of [11, 13, 15, 23, 25, 27]) { if (p[k]) visL += p[k].visibility || 0; if (p[k + 1]) visR += p[k + 1].visibility || 0; }
    }
    const sl = Math.hypot(sx, sz); if (!(sl > 1e-6)) return null;
    const S = [sx / sl, sz / sl];   // his left -> right, level
    // forward is perpendicular to the hip / shoulder line; the toes (else the nose) choose which way
    let F = [-S[1], S[0]];
    const vote = Math.hypot(fx, fz) > 1e-6 ? fx * F[0] + fz * F[1] : nx * F[0] + nz * F[1];
    if (vote < 0) F = [-F[0], -F[1]];
    // the camera saw his left side more: the side camera goes to his left (toward -S)
    const seen = visL >= visR ? [-S[0], -S[1]] : S;
    return { F, seen };
  }, [pts, stageTrack]);

  // build the scene once per clip
  useEffect(() => {
    if (!supported || !hostRef.current || !pts.length) return undefined;
    const host = hostRef.current;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // filmic tone + sRGB: the body reads as a lit form, not flat grey (10.10 #640)
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.08;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.touchAction = 'none';
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b0d10);
    // a soft studio environment: the anatomy's bone and wet muscle read as real materials, not flat colour (research 13.10)
    const pmrem = new THREE.PMREMGenerator(renderer); const room = new RoomEnvironment(), envTex = pmrem.fromScene(room, 0.04).texture;
    scene.environment = envTex; scene.environmentIntensity = 0.45;
    const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 50);
    const centreY = floorY + 0.95;
    const tgt = bounds ? new THREE.Vector3(bounds.c[0], bounds.c[1], bounds.c[2]) : new THREE.Vector3(0, centreY, 0);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(tgt); controls.enableDamping = true; controls.dampingFactor = 0.08;
    controls.minDistance = 1.2; controls.maxDistance = 9; controls.maxPolarAngle = Math.PI * 0.495;
    // the distance that fits his height (and his width at a narrow aspect), with a margin
    const fit = (dir) => {
      const tf = Math.tan((camera.fov * Math.PI) / 360), H = bounds ? Math.max(0.9, bounds.h) : 1.9, W = bounds ? Math.max(0.6, bounds.w) : 0.9;
      // from above the distance runs from the top of his head, not from his middle (the TOP view sat inside
      // his shoulders, 11.10 #671)
      const d = Math.abs(dir.y) > 0.9 ? H * 0.5 + (Math.max(W, 0.9) * 0.62) / Math.min(tf, tf * camera.aspect) : Math.max((H * 0.58) / tf, (W * 0.58) / (tf * camera.aspect));
      camera.position.copy(tgt).addScaledVector(dir.clone().normalize(), Math.max(1.4, Math.min(controls.maxDistance, d)));
      controls.target.copy(tgt); controls.update();
    };

    scene.add(new THREE.HemisphereLight(0xdfefff, 0x141820, 0.6));
    const key = new THREE.DirectionalLight(0xffffff, 1.1); key.position.set(2.5, 4, 3); key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024); Object.assign(key.shadow.camera, { left: -2, right: 2, top: 2, bottom: -2, near: 0.5, far: 12 });
    scene.add(key);
    // a cool fill from the other side and a cyan rim from behind: the silhouette separates from the dark
    const fill = new THREE.DirectionalLight(0x9fc7ff, 0.45); fill.position.set(-3, 2, 1.5); scene.add(fill);
    const rim = new THREE.DirectionalLight(0xa8dcff, 0.5); rim.position.set(-1.5, 2.6, -3.5); scene.add(rim);

    // the floor: a grid on a plane that takes the body's shadow
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.ShadowMaterial({ opacity: 0.35 }));
    plane.rotation.x = -Math.PI / 2; plane.position.y = floorY; plane.receiveShadow = true; scene.add(plane);
    // THE ANATOMICAL PLANE (#820): a translucent sheet with a cyan rim, through his hips on his own axes
    const bodyPlane = new THREE.Group();
    bodyPlane.add(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0x39BDFF, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false })));
    bodyPlane.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(1, 1)), new THREE.LineBasicMaterial({ color: 0x39BDFF, transparent: true, opacity: 0.7, depthWrite: false })));
    bodyPlane.visible = false; bodyPlane.renderOrder = 2; scene.add(bodyPlane);
    const pm = new THREE.Matrix4();
    // a lit floor disc under him, so he stands somewhere rather than in a void
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1.7, 64), new THREE.MeshStandardMaterial({ color: 0x161d25, roughness: 0.95, envMapIntensity: 0.12 }));   // the studio light is for the body, not the floor
    disc.rotation.x = -Math.PI / 2; disc.position.y = floorY - 0.002; disc.receiveShadow = true; scene.add(disc);
    const grid = new THREE.GridHelper(6, 24, 0x2a3a4a, 0x1a242e); grid.position.y = floorY + 0.001; scene.add(grid);

    // THE MANNEQUIN (10.10 #640, Ohad: "all the skeleton and 3d lab are currently awful : can be
    // 10x better"). Not sticks: tapered limbs - thick at the hip and shoulder, thin at the ankle and
    // wrist - a chest, belly and pelvis with volume built on HIS spine and shoulder line, a neck, a
    // head with a visor that shows where he faces, hands and feet. Left joints cyan, right joints
    // orange: the angle box's L and R. Every part is placed from the same stable world landmarks.
    const skin = new THREE.MeshPhysicalMaterial({ color: BODY, roughness: 0.42, metalness: 0, clearcoat: 0.35, clearcoatRoughness: 0.5 });
    const trunkMat = new THREE.MeshPhysicalMaterial({ color: 0xc6d0db, roughness: 0.5, metalness: 0, clearcoat: 0.25 });
    const LEFT_MAT = new THREE.MeshStandardMaterial({ color: ACCENT, roughness: 0.35, emissive: 0x06283a });
    const RIGHT_MAT = new THREE.MeshStandardMaterial({ color: HIP_TRAIL, roughness: 0.35, emissive: 0x3a2405 });
    const visorMat = new THREE.MeshStandardMaterial({ color: 0x0b0d10, roughness: 0.2, metalness: 0.3 });
    // A JOINT THE CAMERA DID NOT SEE (11.10 #656): it used to vanish, so a lift filmed from the side
    // drew a man with one arm. MediaPipe still places it (smoothed on its own stretch, poseLab) -
    // it is drawn FADED, never solid, and casts no shadow: a guess looks like a guess.
    const ghostOf = (m) => { const g = m.clone(); g.transparent = true; g.opacity = 0.26; g.depthWrite = false; return g; };
    const skinG = ghostOf(skin), trunkG = ghostOf(trunkMat), LEFT_G = ghostOf(LEFT_MAT), RIGHT_G = ghostOf(RIGHT_MAT);
    const look = (m, seen, solid, faded) => { m.material = seen ? solid : faded; m.castShadow = seen; m.visible = true; };
    const addMesh = (geo, mat) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; scene.add(m); return m; };
    // a limb: an open tapered tube, radius r0 at the joint it leaves and r1 at the one it reaches
    const LIMBS = [[11, 13, 0.050, 0.041], [13, 15, 0.040, 0.030], [12, 14, 0.050, 0.041], [14, 16, 0.040, 0.030],
      [23, 25, 0.085, 0.058], [25, 27, 0.056, 0.040], [24, 26, 0.085, 0.058], [26, 28, 0.056, 0.040]];
    const limbs = LIMBS.map(([a, b, r0, r1]) => ({ a, b, m: addMesh(new THREE.CylinderGeometry(r1, r0, 1, 24, 1, true), skin) }));
    // the joint balls close the tubes; odd MediaPipe indices are his LEFT side
    const JOINT_R = { 11: 0.054, 12: 0.054, 13: 0.043, 14: 0.043, 15: 0.032, 16: 0.032, 23: 0.074, 24: 0.074, 25: 0.06, 26: 0.06, 27: 0.042, 28: 0.042 };
    const joints = Object.entries(JOINT_R).map(([k, r]) => ({ k: +k, m: addMesh(new THREE.SphereGeometry(r, 24, 16), +k % 2 ? LEFT_MAT : RIGHT_MAT) }));
    const unit = new THREE.SphereGeometry(1, 32, 24);
    // the core is one smooth capsule along his spine; the chest (wider, flatter) blends over its top
    const core = addMesh(new THREE.CapsuleGeometry(1, 1, 8, 24), trunkMat);
    const chest = addMesh(unit, trunkMat), pelvis = addMesh(unit, trunkMat);
    const neck = addMesh(new THREE.CylinderGeometry(0.045, 0.056, 1, 20, 1, true), skin);
    const head = addMesh(unit, skin), visor = addMesh(unit, visorMat);
    const hands = [0, 1].map(() => addMesh(unit, skin));
    const feet = [0, 1].map(() => addMesh(unit, skin));

    // 3D trails over the whole clip, revealed up to the frame on screen. THICK and drawn OVER the body
    // (11.10 #671): as 1px depth-tested lines the hip path ran inside the pelvis and the bar path inside
    // the shoulders - in every shot of a full rep neither was visible. A dot marks where they are now.
    // A PAIR'S PATH (11.10 #671): always the midpoint of the two (the replay places both - a faded one too),
    // drawn while at least one of them is SEEN; a gap is bridged for at most GAP frames, then the trail
    // restarts. It used to need both seen and carry the last value through any gap: in a back squat the
    // 'bar path' sat at his hip, where his hands had hung in the walk-in; switching between one wrist and
    // the midpoint drew sideways jumps of the grip's width.
    const GAP = 3;
    const fin3 = (q) => !!q && Number.isFinite(q.x) && Number.isFinite(q.y) && Number.isFinite(q.z);
    const pairMid = (p, i, j) => { if (!p || !(lmVisible(p[i]) || lmVisible(p[j]))) return null; if (fin3(p[i]) && fin3(p[j])) return mid2(p[i], p[j]); const q = fin3(p[i]) ? p[i] : fin3(p[j]) ? p[j] : null; return q ? new THREE.Vector3(q.x, q.y, q.z) : null; };
    const mid2 = (a, b) => new THREE.Vector3((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    const lineMats = [];
    // THE TRAILS RIDE THE BODY ON SCREEN (13.10 #705, Ohad: "the lines don't even fit the skeleton"): with the anatomy
    // body the trail points are the MODEL's own joints at each captured frame - its hip centre, its wrists, its
    // shoulders - so the line can never run beside the bones. (They were MediaPipe's raw points; the body is the rig's.)
    const trailPts = stageTrack ? (() => {
      const Q = PIVOT.map(() => new THREE.Quaternion()), root = new THREE.Vector3(), piv = PIVOT.map(() => new THREE.Vector3());
      const P = (v, src) => ({ x: v.x, y: v.y, z: v.z, visibility: src ? src.visibility : 1 });
      return poseFrames.map((f, i) => {
        sampleTrack(stageTrack, f.t, Q, root); fk(Q, root, stageTrack, piv);
        const o = pts[i] ? pts[i].slice() : [];
        o[11] = P(piv[SEG.uarmL], o[11]); o[12] = P(piv[SEG.uarmR], o[12]); o[15] = P(piv[SEG.handL], o[15]); o[16] = P(piv[SEG.handR], o[16]);
        o[23] = P(piv[SEG.thighL], o[23]); o[24] = P(piv[SEG.thighR], o[24]);
        return o;
      });
    })() : pts;
    const mkTrail = (pick, color) => {
      const arr = new Float32Array(pts.length * 3), fresh = new Int32Array(pts.length).fill(-1); let last = null, lastAt = -1;
      trailPts.forEach((p, i) => { const v = pick(p); if (v) { last = v; lastAt = i; } if (last && i - lastAt <= GAP) { arr[i * 3] = last.x; arr[i * 3 + 1] = last.y; arr[i * 3 + 2] = last.z; fresh[i] = lastAt; } });
      const mat = new LineMaterial({ color, linewidth: 3.5, transparent: true, opacity: 0.95, depthTest: false });
      lineMats.push(mat);
      const line = new Line2(new LineGeometry(), mat); line.renderOrder = 3; line.frustumCulled = false; line.visible = false; scene.add(line);
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.024, 16, 12), new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true }));
      dot.renderOrder = 4; dot.visible = false; scene.add(dot);
      return { arr, line, dot, on: trailsRef.current, key: '', show(from, i, u = 0) {
        // nothing measured here (a long gap): no dot, no line
        if (fresh[i] < 0) { this.dot.visible = false; this.line.visible = false; return; }
        // the trail starts after the last long gap inside this rep
        let a = i; while (a > from && fresh[a - 1] >= 0) a--;
        from = a; const n = i - from + 1;
        // the dot rides with the BLENDED body between captured frames (it stepped ~10 times a second, 12.10 review)
        const j = u > 0 && i + 1 < pts.length && fresh[i + 1] >= 0 ? i + 1 : i, w = j === i ? 0 : u;
        this.dot.visible = this.on;
        this.dot.position.set(arr[i * 3] + (arr[j * 3] - arr[i * 3]) * w, arr[i * 3 + 1] + (arr[j * 3 + 1] - arr[i * 3 + 1]) * w, arr[i * 3 + 2] + (arr[j * 3 + 2] - arr[i * 3 + 2]) * w);
        if (!this.on || n < 2) { this.line.visible = false; this.key = ''; return; }
        // the line is rebuilt only when its range changes - not 60 times a second for the same frames (12.10 review)
        const k = from + ':' + i;
        if (k !== this.key) { this.line.geometry.setPositions(arr.subarray(from * 3, (i + 1) * 3)); this.key = k; }
        this.line.visible = true;
      } };
    };
    // THE BAR PATH follows where the bar is: on his back in a squat (the shoulders - his hands are behind his
    // head there, out of the camera's sight, and their 'seen' points floated above it), in his hands for a
    // hinge, a row, a press or a curl
    const BAR = channel === 'knee' ? [11, 12] : [15, 16];
    const handTrail = mkTrail((p) => pairMid(p, BAR[0], BAR[1]), ACCENT);
    const hipTrail = mkTrail((p) => pairMid(p, 23, 24), HIP_TRAIL);
    // 0.4 s (13.10: at 0.6 s a fast arm swing drew a long hook beside him - c31 9.5 s, c22 - the "blue line" again)
    const TAIL_N = 28, TAIL_MS = 400, TAIL_MAX_V = 12, BG = new THREE.Color(0x0b0d10);
    // the time between the two readings around t (0 on a reading)
    const knotGap = (tr, t) => { const K = tr.knotT; if (!K || !K.length) return 0; let lo = 0, hi = K.length - 1; if (t <= K[0] || t >= K[hi]) return 0; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (K[m] <= t) lo = m; else hi = m; } return K[hi] - K[lo]; };
    const mkTail = (color) => {
      const mat = new LineMaterial({ color: 0xffffff, vertexColors: true, linewidth: 4, transparent: true, opacity: 1, depthTest: false });
      lineMats.push(mat);
      const geo = new LineGeometry(); const line = new Line2(geo, mat); line.renderOrder = 3; line.frustumCulled = false; line.visible = false; scene.add(line);
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.026, 16, 12), new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true }));
      dot.renderOrder = 4; dot.visible = false; scene.add(dot);
      // colours: the joint's colour at the dot, fading into the background along the tail
      const cols = new Float32Array(TAIL_N * 3), c0 = new THREE.Color(color);
      for (let k = 0; k < TAIL_N; k++) { const w = 1 - k / (TAIL_N - 1); const c = BG.clone().lerp(c0, w * w); cols.set([c.r, c.g, c.b], k * 3); }
      return { line, dot, geo, cols, pos: new Float32Array(TAIL_N * 3) };
    };
    const handTail = mkTail(ACCENT), handTail2 = mkTail(ACCENT), hipTail = mkTail(HIP_TRAIL);
    // THE CENTRE OF MASS (13.10 #715): a white dot at the body's centre of mass, its plumb line to the floor, and the base
    // of support (the heels and toes on the floor) outlined under him - white while the plumb point is inside it,
    // orange when it is outside
    const COM_IN = 0xffffff, COM_OUT = 0xf5a524;
    const comDot = new THREE.Mesh(new THREE.SphereGeometry(0.03, 18, 14), new THREE.MeshBasicMaterial({ color: COM_IN, depthTest: false, transparent: true }));
    comDot.renderOrder = 5; comDot.visible = false; scene.add(comDot);
    const mkLine = (w, o) => { const mat = new LineMaterial({ color: COM_IN, linewidth: w, transparent: true, opacity: o, depthTest: false }); lineMats.push(mat); const ln = new Line2(new LineGeometry(), mat); ln.renderOrder = 4; ln.frustumCulled = false; ln.visible = false; scene.add(ln); return ln; };
    const plumb = mkLine(2, 0.75), baseLine = mkLine(2, 0.55);
    const plumbFoot = new THREE.Mesh(new THREE.RingGeometry(0.018, 0.03, 24), new THREE.MeshBasicMaterial({ color: COM_IN, depthTest: false, transparent: true, side: THREE.DoubleSide }));
    plumbFoot.rotation.x = -Math.PI / 2; plumbFoot.renderOrder = 5; plumbFoot.visible = false; scene.add(plumbFoot);
    const setLine = (ln, ps) => { const g = new LineGeometry(); g.setPositions(ps.flatMap((p) => [p.x, p.y, p.z])); ln.geometry.dispose(); ln.geometry = g; ln.computeLineDistances(); };
    const showBalance = (tNow) => {
      const tr = track, inV = tr && (!tr.inView || tr.inView(tNow));
      const B = inV ? modelBalance(tr, tNow) : null;
      const on = !!B; comDot.visible = plumb.visible = plumbFoot.visible = on; baseLine.visible = on && B.base.length >= 2;
      if (!on) return;
      const col = B.inBase === false ? COM_OUT : COM_IN, op = B.seen ? 1 : 0.4;   // a body the camera did not see: faded
      comDot.position.copy(B.com); comDot.material.color.setHex(col); comDot.material.opacity = op;
      plumbFoot.position.copy(B.plumb); plumbFoot.position.y += 0.003; plumbFoot.material.color.setHex(col); plumbFoot.material.opacity = op;
      setLine(plumb, [B.com, B.plumb]); plumb.material.color.setHex(col); plumb.material.opacity = 0.75 * op;
      if (B.base.length >= 2) { setLine(baseLine, [...B.base, B.base[0]]); baseLine.material.color.setHex(col); baseLine.material.opacity = 0.55 * op; }
    };
    const tQ = PIVOT.map(() => new THREE.Quaternion()), tRoot = new THREE.Vector3(), tPiv = PIVOT.map(() => new THREE.Vector3());
    const tail = (o, tNow, [sa, sb]) => {
      const tr = track, seenNow = tr && sampleTrack(tr, tNow, tQ, tRoot).seen;
      // not in view: the body is hidden, and so are its dots and tails (13.10, c05 0-2 s: two dots floated in an empty scene)
      const inV = !tr || !tr.inView || tr.inView(tNow);
      const on = inV && trailsRef.current && tr && seenNow[sa] && seenNow[sb];
      o.dot.visible = !!(inV && tr && seenNow[sa] && seenNow[sb]);
      if (!tr) { o.line.visible = false; return; }
      let n = 0;
      for (let k = 0; k < TAIL_N; k++) {
        const t = Math.max(tr.t0, tNow) - (k * TAIL_MS) / (TAIL_N - 1); if (k && t < tr.t0) break;   // before the first reading: the dot on the first pose, no tail
        const sm = sampleTrack(tr, t, tQ, tRoot); fk(tQ, tRoot, tr, tPiv);
        if (k && !(sm.seen[sa] && sm.seen[sb])) break;   // the tail stops where the joint was not seen
        if (k && knotGap(tr, t) > 300) break;   // ... and where no reading was taken (a bridged gap is drawn, never traced - c40 3.6 s)
        const x = (tPiv[sa].x + tPiv[sb].x) / 2, y = Math.max(tr.floor + 0.01, (tPiv[sa].y + tPiv[sb].y) / 2), z = (tPiv[sa].z + tPiv[sb].z) / 2;   // a tail never draws under the floor
        // nor a step faster than a hand moves (13.10, c13 42 s: the camera picked up another man as he walked to the phone,
        // the hand read 15 m/s and its tail streaked across the screen; a shot's release is ~7 m/s)
        if (k && Math.hypot(x - o.pos[(k - 1) * 3], y - o.pos[(k - 1) * 3 + 1], z - o.pos[(k - 1) * 3 + 2]) > (TAIL_MAX_V * TAIL_MS) / (TAIL_N - 1) / 1000) break;
        if (!k) o.dot.position.set(x, y, z);
        o.pos.set([x, y, z], k * 3); n++;
      }
      if (!on || n < 3) { o.line.visible = false; return; }
      o.geo = new LineGeometry(); o.geo.setPositions(o.pos.subarray(0, n * 3)); o.geo.setColors(o.cols.subarray(0, n * 3));
      o.line.geometry.dispose(); o.line.geometry = o.geo; o.line.visible = true;
    };
    // the first rep's outline: thin bones, no volume, never casts a shadow
    const REF_BONES = [[11, 12], [11, 23], [12, 24], [23, 24], [11, 13], [13, 15], [12, 14], [14, 16], [23, 25], [25, 27], [24, 26], [26, 28], [27, 31], [28, 32], [29, 31], [30, 32], [27, 29], [28, 30]];
    const refGeo = new THREE.BufferGeometry(); refGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(REF_BONES.length * 6), 3));
    const refLines = new THREE.LineSegments(refGeo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthTest: false }));
    refLines.renderOrder = 2; refLines.visible = false; scene.add(refLines);

    const up = new THREE.Vector3(0, 1, 0), tmp = new THREE.Vector3(), q = new THREE.Quaternion();
    const V = (P) => new THREE.Vector3(P.x, P.y, P.z);
    const basis = new THREE.Matrix4();
    // an ellipsoid on its own right-handed axes x (side), y (along), z (front), radii sx sy sz
    const place = (m, c, ax, ay, az, sx, sy, sz) => { basis.makeBasis(ax, ay, az); m.quaternion.setFromRotationMatrix(basis); m.position.copy(c); m.scale.set(sx, sy, sz); m.visible = true; };
    // axes from a side vector and an up vector: y = up, x = side without its up part, z = x * y
    const axesOf = (side, upv) => { const y = upv.clone().normalize(); const x = side.clone().addScaledVector(y, -side.dot(y)).normalize(); return [x, y, new THREE.Vector3().crossVectors(x, y).normalize()]; };
    // BETWEEN TWO CAPTURED FRAMES (11.10 #671): the capture runs ~9-10 fps and the replay plays at half
    // speed, so it showed ~5 poses a second - a slideshow. Playback now draws every screen frame, each
    // landmark blended between frame i and i+1 by the clock (u in 0..1); a pause shows the frame itself.
    let body = null;
    const mannequin = [...limbs.map((o) => o.m), ...joints.map((j) => j.m), core, chest, pelvis, neck, head, visor, ...hands, ...feet];
    const blend = [];
    const at = (i, u) => {
      const a = pts[Math.max(0, Math.min(pts.length - 1, i))] || [];
      const b = pts[i + 1];
      if (!(u > 0) || !b) return a;
      for (let k = 0; k < a.length; k++) {
        const A = a[k], B = b[k];
        if (!A || !B) { blend[k] = A ? { x: A.x, y: A.y, z: A.z, visibility: A.visibility } : null; continue; }   // a COPY: a stored reference got written into later - the captured frame itself (review 12.10)
        const o = blend[k] || (blend[k] = {});
        o.x = A.x + (B.x - A.x) * u; o.y = A.y + (B.y - A.y) * u; o.z = A.z + (B.z - A.z) * u;
        o.visibility = u < 0.5 ? A.visibility : B.visibility;
      }
      blend.length = a.length;
      return blend;
    };
    const pose = (i, u = 0) => {
      const p = at(i, u);
      // a measurement harness can count the poses drawn (audit-out/_3d-smooth.mjs) - inert unless set
      try { if (typeof window !== 'undefined' && typeof window.__expoPoseHook === 'function') window.__expoPoseHook(i, u); } catch { /* the harness's problem */ }
      const ok = (k) => lmVisible(p[k]);
      const has = (k) => !!p[k] && Number.isFinite(p[k].x) && Number.isFinite(p[k].y) && Number.isFinite(p[k].z);
      // the chosen plane, through the hips on his own axes (#820) - drawn after the body is posed for this time
      const drawPlane = () => {
        // on the ANATOMY body itself when it is drawn (its hip and shoulder joints - the raw points sit elsewhere in the
        // scene), else on the points (the mannequin is drawn on them)
        const planeAt = () => {
          if (body) {
          if (!body.group.visible) return null;   // not in view: no body, so no plane (it floated in an empty scene)
            const hl = body.jointWorld(SEG.thighL), hr = body.jointWorld(SEG.thighR), sl = body.jointWorld(SEG.uarmL), sr = body.jointWorld(SEG.uarmR);
            return { H: hl.clone().add(hr).multiplyScalar(0.5), S: sl.clone().add(sr).multiplyScalar(0.5), side: hr.clone().sub(hl) };
          }
          if (!(has(11) && has(12) && has(23) && has(24))) return null;
          return { H: V(p[23]).add(V(p[24])).multiplyScalar(0.5), S: V(p[11]).add(V(p[12])).multiplyScalar(0.5), side: V(p[24]).sub(V(p[23])) };
        };
        const pa = planeOnRef.current ? planeAt() : null;
        if (pa) {
          const H0 = pa.H;
          const sp = pa.S.clone().sub(H0); const L0 = Math.max(0.2, sp.length());
          const [px, py, pz] = axesOf(pa.side, sp);
          const which = planeRef.current;
          const [ax1, ax2] = which === 'front' ? [px, py] : which === 'trans' ? [px, pz] : [pz, py];
          pm.makeBasis(ax1, ax2, new THREE.Vector3().crossVectors(ax1, ax2).normalize());
          bodyPlane.quaternion.setFromRotationMatrix(pm);
          if (which === 'trans') { bodyPlane.position.copy(H0); bodyPlane.scale.set(L0 * 2.4, L0 * 2.4, 1); }
          else { bodyPlane.position.copy(H0).addScaledVector(py, L0 * 0.35); bodyPlane.scale.set(which === 'front' ? L0 * 2.6 : L0 * 2.2, L0 * 4.2, 1); }
          bodyPlane.visible = true;
        } else bodyPlane.visible = false;
        };
      // the anatomy body plays its own 60 Hz track at this exact time; the mannequin is drawn only without it
      if (body) { const a0 = poseFrames[Math.max(0, Math.min(poseFrames.length - 1, i))], a1 = poseFrames[i + 1]; body.setTime(a0.t + (a1 && u > 0 ? (a1.t - a0.t) * u : 0)); drawPlane(); }
      else {
      drawPlane();
      for (const o of limbs) {
        if (!has(o.a) || !has(o.b)) { o.m.visible = false; continue; }
        const a = V(p[o.a]), b = V(p[o.b]); const len = a.distanceTo(b);
        if (len < 1e-4) { o.m.visible = false; continue; }
        look(o.m, ok(o.a) && ok(o.b), skin, skinG); o.m.position.copy(a).add(b).multiplyScalar(0.5); o.m.scale.set(1, len, 1);
        q.setFromUnitVectors(up, tmp.copy(b).sub(a).normalize()); o.m.quaternion.copy(q);
      }
      for (const j of joints) {
        if (!has(j.k)) { j.m.visible = false; continue; }
        look(j.m, ok(j.k), j.k % 2 ? LEFT_MAT : RIGHT_MAT, j.k % 2 ? LEFT_G : RIGHT_G); j.m.position.copy(V(p[j.k]));
      }
      // the trunk, on his own spine and shoulder line
      const trunk = has(11) && has(12) && has(23) && has(24);
      let spineUp = null;
      if (trunk) {
        const tSeen = ok(11) && ok(12) && ok(23) && ok(24);
        look(chest, tSeen, trunkMat, trunkG); look(core, tSeen, trunkMat, trunkG); look(pelvis, tSeen, trunkMat, trunkG); look(neck, tSeen, skin, skinG);
        const S = V(p[11]).add(V(p[12])).multiplyScalar(0.5), H = V(p[23]).add(V(p[24])).multiplyScalar(0.5);
        const spine = S.clone().sub(H); const L = Math.max(0.2, spine.length());
        const sideS = V(p[12]).sub(V(p[11])), sideH = V(p[24]).sub(V(p[23]));
        const sw = sideS.length(), hw = sideH.length();
        const [sx, sy, sz] = axesOf(sideS, spine);
        const [hx, hy, hz] = axesOf(sideH, spine);
        const [bx, by, bz] = axesOf(sideS.clone().normalize().add(sideH.clone().normalize()), spine);
        place(chest, H.clone().addScaledVector(sy, L * 0.74), sx, sy, sz, Math.max(0.12, sw * 0.55), L * 0.25, 0.105);
        // capsule height = 3 x its y scale (length 1 + two radii): shoulders to hips
        place(core, H.clone().addScaledVector(by, L * 0.47), bx, by, bz, Math.max(0.10, Math.max(hw * 0.95, sw * 0.8) * 0.5), L * 0.29, 0.095);
        place(pelvis, H.clone().addScaledVector(hy, 0.02), hx, hy, hz, Math.max(0.12, hw * 0.8), 0.115, 0.12);
        neck.visible = true; neck.position.copy(S).addScaledVector(sy, 0.065); neck.scale.set(1, 0.15, 1); neck.quaternion.setFromUnitVectors(up, sy);
        spineUp = sy;
      } else { chest.visible = core.visible = pelvis.visible = neck.visible = false; }
      // the head from the face, never from the shoulder line (poseLab's rule); the visor faces his nose
      const ears = [7, 8].filter(ok);
      head.visible = visor.visible = ears.length > 0 || ok(0);
      if (head.visible) {
        const E = ears.length ? ears.reduce((acc, k) => acc.add(V(p[k])), new THREE.Vector3()).multiplyScalar(1 / ears.length) : V(p[0]);
        const hy = (spineUp || up).clone();
        // no face: a stand-in direction that is never along the spine (a plank filmed from the feet
        // has the spine along z - a z stand-in collapsed the head's axes, 1010b review)
        const alt = Math.abs(hy.z) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
        const hf = ok(0) && ears.length ? V(p[0]).sub(E) : alt.clone();
        hf.addScaledVector(hy, -hf.dot(hy)); if (hf.lengthSq() < 1e-8) hf.copy(alt).addScaledVector(hy, -alt.dot(hy)); hf.normalize();
        const hx = new THREE.Vector3().crossVectors(hy, hf).normalize();
        const c = E.clone().addScaledVector(hy, 0.03);
        place(head, c, hx, hy, hf, 0.085, 0.115, 0.1);
        place(visor, c.clone().addScaledVector(hf, 0.072).addScaledVector(hy, 0.012), hx, hy, hf, 0.068, 0.028, 0.034);
      }
      // hands: from the wrist toward the knuckles (index + pinky), or along the forearm
      [[15, 17, 19, 13], [16, 18, 20, 14]].forEach(([w, pk, ix, el], n) => {
        const m = hands[n];
        if (!has(w)) { m.visible = false; return; }
        const W = V(p[w]);
        const dir = has(pk) && has(ix) ? V(p[pk]).add(V(p[ix])).multiplyScalar(0.5).sub(W) : has(el) ? W.clone().sub(V(p[el])) : null;
        if (!dir || dir.lengthSq() < 1e-8) { m.visible = false; return; }
        dir.normalize(); look(m, ok(w), skin, skinG);
        m.position.copy(W).addScaledVector(dir, 0.062); m.quaternion.setFromUnitVectors(up, dir); m.scale.set(0.036, 0.072, 0.036);
      });
      // feet: heel to toe, resting on the floor line
      [[29, 31], [30, 32]].forEach(([he, to], n) => {
        const m = feet[n];
        if (!has(he) || !has(to)) { m.visible = false; return; }
        const Hh = V(p[he]), T = V(p[to]); const d = T.clone().sub(Hh); const len = d.length();
        if (len < 1e-3) { m.visible = false; return; }
        d.normalize(); look(m, ok(he) && ok(to), skin, skinG);
        m.position.copy(Hh).add(T).multiplyScalar(0.5).addScaledVector(up, 0.022);
        m.quaternion.setFromUnitVectors(up, d); m.scale.set(0.042, len * 0.58, 0.042);
      });
      }
      // the first rep's outline, moved so its hips sit on his hips at this frame
      // a harness can see the captured points over the body (audit-out/_anat-lab-shot.mjs STICKS=1) - inert unless set
      const sticks = typeof window !== 'undefined' && window.__anatSticks;
      const ri = sticks ? i : compareRef.current(i), rp = ri >= 0 ? (sticks ? p : pts[ri]) : null;
      const fin = (P) => !!P && Number.isFinite(P.x) && Number.isFinite(P.y) && Number.isFinite(P.z);
      const hipOf = (q) => (q && fin(q[23]) && fin(q[24]) ? { x: (q[23].x + q[24].x) / 2, y: (q[23].y + q[24].y) / 2, z: (q[23].z + q[24].z) / 2 } : null);
      const hc = hipOf(p), hr = hipOf(rp);
      if (sticks && rp) {
        const arr = refGeo.attributes.position.array; let n = 0;
        for (const [a, b] of REF_BONES) { const A = rp[a], B = rp[b]; if (fin(A) && fin(B)) arr.set([A.x, A.y, A.z, B.x, B.y, B.z], n); else arr.fill(0, n, n + 6); n += 6; }
        refGeo.attributes.position.needsUpdate = true; refGeo.computeBoundingSphere(); refLines.visible = true;
      } else if (rp && hc && hr) {
        const arr = refGeo.attributes.position.array; let n = 0, any = false;
        for (const [a, b] of REF_BONES) {
          const A = rp[a], B = rp[b];
          if (fin(A) && fin(B)) { arr.set([A.x - hr.x + hc.x, A.y - hr.y + hc.y, A.z - hr.z + hc.z, B.x - hr.x + hc.x, B.y - hr.y + hc.y, B.z - hr.z + hc.z], n); any = true; }
          else arr.fill(0, n, n + 6);
          n += 6;
        }
        refGeo.attributes.position.needsUpdate = true; refGeo.computeBoundingSphere(); refLines.visible = any;
      } else refLines.visible = false;
      const from = Math.max(0, Math.min(i, trailFromRef.current(i)));
      const ti = Math.max(0, Math.min(pts.length - 1, i));
      if (body) {
        // THE ANATOMY'S TRAILS (13.10 #706, Ohad: "Wtf is that blue line"): a whole-rep path of captured points ran off
        // into the air with kinks. Now each is a short tail - the last 0.4 s of the MODEL's own joint, sampled 28 times
        // from its 60 Hz track - fading out behind the dot, which sits on the joint. A joint the camera did not see has
        // no tail.
        const a0 = poseFrames[Math.max(0, Math.min(poseFrames.length - 1, i))], a1 = poseFrames[i + 1];
        const tNow = a0.t + (a1 && u > 0 ? (a1.t - a0.t) * u : 0);
        // a squat's bar is on his back (between the shoulders); otherwise EACH hand has its own tail on its own wrist -
        // the midpoint of two hands apart is a point in the air
        if (channel === 'knee') { tail(handTail, tNow, [SEG.uarmL, SEG.uarmR]); handTail2.line.visible = handTail2.dot.visible = false; }
        else { tail(handTail, tNow, [SEG.handL, SEG.handL]); tail(handTail2, tNow, [SEG.handR, SEG.handR]); }
        tail(hipTail, tNow, [SEG.thighL, SEG.thighR]);
        showBalance(tNow);
        handTrail.line.visible = hipTrail.line.visible = handTrail.dot.visible = hipTrail.dot.visible = false;
      } else { handTrail.show(Math.min(from, ti), ti, u); hipTrail.show(Math.min(from, ti), ti, u); }
    };

    const size = () => {
      // beside a clip the canvas is the clip's height (the two stand level)
      const w = host.clientWidth || 320, h = clipSideRef.current && rowRef.current ? sideH(rowRef.current.clientWidth || w) : Math.round(Math.min(560, w * 1.15));
      renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
      for (const m of lineMats) m.resolution.set(w, h);   // a fat line's width is in screen pixels
    };
    size();
    fit(facing ? new THREE.Vector3(facing.F[0] * 0.75 + facing.seen[0] * 0.66, 0.36, facing.F[1] * 0.75 + facing.seen[1] * 0.66) : new THREE.Vector3(2.1, 0.5, 2.6));
    const ro = new ResizeObserver(() => { size(); setHostW(host.clientWidth || 0); }); ro.observe(host); setHostW(host.clientWidth || 0);
    let raf = 0, alive = true;
    // a lit muscle pulses (#907): the body's clock
    const loop = () => { if (!alive) return; controls.update(); if (body && body.highlighted > 0) body.tick(performance.now() / 1000); renderer.render(scene, camera); raf = requestAnimationFrame(loop); };
    loop();
    stateRef.current = { pose, camera, controls, centreY, handTrail, hipTrail, fit, size, body: null };
    // a recorder can drive the replay frame by frame (audit-out/_anat-lab-render.mjs: an exact 60 fps video) - inert unless set
    try { if (typeof window !== 'undefined' && typeof window.__anatDrive === 'function') window.__anatDrive({ pose, camera, controls, renderer, scene, frames: poseFrames }); } catch { /* the recorder's problem */ }
    pose(idxRef.current);
    // the anatomy model: loads once per page, then this replay's body takes over from the mannequin
    if (track) {
      createAnatomyBody().then((b) => {
        if (!alive) { b.dispose(); return; }
        body = b; b.setTrack(track); b.setLayers(LAYERS[layerRef.current] || LAYERS.surface);
        try { if (window.__anatDebugOn) window.__anatBody = b; } catch { /* probes only */ }
        applyFocus(b, focusRef.current);
        scene.add(b.group);
        for (const m of mannequin) m.visible = false;
        if (stateRef.current) stateRef.current.body = b;
        pose(idxRef.current); setAnat('ready');
      }).catch((e) => { console.warn('anatomy model', e); if (alive) setAnat('error'); });
    }
    return () => {
      alive = false; cancelAnimationFrame(raf); ro.disconnect(); controls.dispose();
      if (body) { body.dispose(); body = null; }   // its geometry is the page's cache: out of the scene before the disposal below
      scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose()); });
      // the solid / faded pairs: a mesh holds only one of them at a time
      [skin, trunkMat, LEFT_MAT, RIGHT_MAT, skinG, trunkG, LEFT_G, RIGHT_G].forEach((m) => m.dispose());
      envTex.dispose(); pmrem.dispose();
      // the body's geometry is shared by the page, and three keeps every renderer that drew it alive through it - the
      // context is let go of explicitly (13.10 review: each mount leaked a WebGL context + ~10-25 MB of buffers)
      renderer.forceContextLoss(); renderer.dispose(); room.dispose(); if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
      stateRef.current = null;
    };
  }, [supported, pts, floorY, bounds, facing, channel, track, stageTrack]);

  // the frame on screen
  // while it plays, the playback loop draws (blended between frames); this would snap the body back to
  // the captured frame ~9 times a second. Stopping redraws the exact frame.
  useEffect(() => { const s = stateRef.current; if (s && !playingRef.current) s.pose(idx); }, [idx, compare, range, repSpans, playing]);   // the outline follows a toggle / a new first rep at once
  useEffect(() => { const s = stateRef.current; if (s) { s.handTrail.on = trails; s.hipTrail.on = trails; s.pose(idxRef.current); } }, [trails]);
  // a plane chosen while paused is drawn at once (#820: the sheet moved only when the frame did - 'clicking doesn't do anything')
  useEffect(() => { const s = stateRef.current; if (s && !playingRef.current) s.pose(idxRef.current); }, [plane, anat]);
  useEffect(() => { const s = stateRef.current; if (s && s.body) s.body.setLayers(LAYERS[layer] || LAYERS.surface); try { localStorage.setItem('expo-anatomy-layer', layer); } catch { /* private mode */ } }, [layer]);
  useEffect(() => { const s = stateRef.current; if (s && s.body) applyFocus(s.body, focus); try { localStorage.setItem('expo-anatomy-focus', focus); } catch { /* private mode */ } }, [focus]);

  // follow the clip while not playing on its own
  useEffect(() => {
    if (playing || playheadT == null || !poseFrames.length) return;
    const t0 = poseFrames[0].t; let best = 0, bd = Infinity;
    for (let i = 0; i < poseFrames.length; i++) { const d = Math.abs((poseFrames[i].t - t0) - playheadT); if (d < bd) { bd = d; best = i; } }
    setIdx(best);
  }, [playheadT, playing, poseFrames]);

  // own playback, at the chosen speed, on the clip's real timeline - looping the set when there is one (#714)
  useEffect(() => {
    if (!playing || poseFrames.length < 2) return undefined;
    const sp = setSpanRef.current, first = poseFrames[0].t, end = poseFrames[poseFrames.length - 1].t;
    const lo = sp ? Math.max(first, sp[0]) : first, hi = sp ? Math.min(end, sp[1]) : end;
    let raf = 0, last = performance.now(), clock = poseFrames[idxRef.current].t;
    if (clock < lo || clock >= hi) clock = lo;
    // the clip beside it plays too, at the same speed, and is the clock while it runs (#713)
    const v = clipRef.current;
    const seekClip = (t) => { if (v) { try { v.currentTime = t / 1000; } catch { /* not loaded yet */ } } };
    if (v) { try { v.playbackRate = speed; } catch { /* a rate the browser refuses: it plays at 1x, the clock still follows it */ } seekClip(clock); v.play().catch(() => {}); }
    const tick = (now) => {
      if (v && !v.paused && !v.seeking && v.readyState >= 2) clock = v.currentTime * 1000; else clock += (now - last) * speed;
      last = now;
      if (clock > hi) { clock = lo; seekClip(lo); }
      let i = idxRef.current; if (poseFrames[i].t > clock) i = 0; while (i + 1 < poseFrames.length && poseFrames[i + 1].t <= clock) i++;
      const nx = poseFrames[i + 1], u = nx ? (clock - poseFrames[i].t) / Math.max(1, nx.t - poseFrames[i].t) : 0;
      const s = stateRef.current; if (s) s.pose(i, Math.max(0, Math.min(1, u)));
      if (i !== idxRef.current) { idxRef.current = i; setIdx(i); }   // React (slider, angles) only at a new captured frame
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); if (v) v.pause(); };
  }, [playing, speed, poseFrames]);
  // paused, the clip shows the frame on screen (the slider, PREV / NEXT REP, the parent's playhead)
  useEffect(() => {
    const v = clipRef.current;
    if (!v || playing || !poseFrames[idx]) return;
    const t = poseFrames[idx].t / 1000;
    if (Math.abs((v.currentTime || 0) - t) > 0.03) { try { v.currentTime = t; } catch { /* not loaded yet: loadedmetadata seeks */ } }
  }, [idx, playing, poseFrames, clipSrc]);
  useEffect(() => { const st = stateRef.current; if (st && st.size) st.size(); }, [clipAR, rowW, clipSide]);
  // the row's width sets the canvas height and the clip's width
  useEffect(() => {
    const el = rowRef.current; if (!el || !clipSrc) return undefined;
    const ro = new ResizeObserver(() => setRowW(el.clientWidth || 0)); ro.observe(el); setRowW(el.clientWidth || 0);
    return () => ro.disconnect();
  }, [clipSrc, pts.length, supported]);

  const view = (k) => {
    const s = stateRef.current; if (!s) return;
    const F = facing ? facing.F : [0, 1], Sd = facing ? facing.seen : [1, 0];
    // top: from straight above, a hair behind him, so his front is the top of the screen
    const D = { front: [F[0], 0.09, F[1]], side: [Sd[0], 0.09, Sd[1]], top: [-F[0] * 0.002, 1, -F[1] * 0.002], behind: [-F[0], 0.09, -F[1]] }[k];
    s.fit(new THREE.Vector3(D[0], D[1], D[2]));
  };
  const full = () => { const el = wrapRef.current; if (!el) return; if (document.fullscreenElement) document.exitFullscreen(); else if (el.requestFullscreen) el.requestFullscreen(); };

  if (!supported) return null;
  if (!pts.length) return <div style={{ color: C.tm, fontFamily: FN, fontSize: 11, padding: 12 }}>{tt('No 3D pose captured in that clip.')}</div>;

  const p = pts[idx] || [];
  // a joint the camera did not see: the angle is the faded body's - shown grey with ~ (a guess)
  const a = (i, j, k) => { const v = p[i] && p[j] && p[k] ? angle3(p[i], p[j], p[k]) : null; return v == null ? null : { v, seen: lmVisible(p[i]) && lmVisible(p[j]) && lmVisible(p[k]) }; };
  // EVERY JOINT FROM THE BODY ON SCREEN (13.10 #709 / #710): with the anatomy body the box reads the model's own joints
  // (the number and the bones always agree; the ankle from the corrected foot, never MediaPipe's tipped foot points)
  const inViewNow = !track || !track.inView || !poseFrames[idx] || track.inView(poseFrames[idx].t);
  const MA = anat === 'ready' && track && poseFrames[idx] ? modelAngles(track, poseFrames[idx].t) : null;
  planeOnRef.current = !!MA;   // the plane is drawn while its chips are on screen (#820)
  // the centre of mass and the bar (the hands) ahead of (+) / behind (−) mid-foot, cm (#715)
  const MB = MA && inViewNow ? modelBalance(track, poseFrames[idx].t) : null;
  const cm = (v, seen) => (MB && Number.isFinite(v) ? { v: Math.round(v * 100), seen, signed: true, unit: '' } : null);
  const m = (k) => (inViewNow && MA && MA[k] && MA[k].v != null ? { v: Math.round(MA[k].v), seen: MA[k].seen, signed: MA[k].signed } : null);   // not in view: no numbers
  // every joint, every plane (#716): the frontal and transverse rows name the motion their + is; a transverse value
  // (a twist) is an estimate from a single camera - always shown so (~, grey)
  const AXS = MA && inViewNow && plane !== 'sag' ? modelJointAxes(track, poseFrames[idx].t) : null;
  const ax = (k, f, est = false) => (AXS && AXS[k] && Number.isFinite(AXS[k][f]) ? { v: Math.round(AXS[k][f]), seen: est ? false : AXS[k].seen, signed: true } : null);
  const LR = (lab, k, f, est) => [lab, ax(k + 'L', f, est), ax(k + 'R', f, est)];
  const angles = MA ? (plane === 'front' ? [
    LR(tt('HIP · ABDUCTION'), 'hip', 'abd'),
    LR(tt('KNEE · VALGUS'), 'knee', 'valgus'),
    LR(tt('ANKLE · INVERSION'), 'ankle', 'inv'),
    LR(tt('SHOULDER · ABDUCTION'), 'shoulder', 'abd'),
    LR(tt('WRIST · ULNAR DEVIATION'), 'wrist', 'ulnar'),
    [tt('TRUNK · SIDE BEND'), ax('trunk', 'side'), null, true],
    [tt('NECK · SIDE BEND'), ax('neck', 'side'), null, true],
  ] : plane === 'trans' ? [
    LR(tt('HIP · INTERNAL ROTATION'), 'hip', 'rot', true),
    LR(tt('KNEE · INTERNAL ROTATION'), 'knee', 'rot', true),
    LR(tt('FOOT · TOE-OUT'), 'ankle', 'toeOut', true),
    LR(tt('SHOULDER · INTERNAL ROTATION'), 'shoulder', 'rot', true),
    LR(tt('FOREARM · PRONATION'), 'forearm', 'pron', true),
    [tt('TRUNK · ROTATION'), ax('trunk', 'rot', true), null, true],
    [tt('NECK · ROTATION'), ax('neck', 'rot', true), null, true],
  ] : [
    [tt('KNEE'), m('kneeL'), m('kneeR')],
    [tt('HIP'), m('hipL'), m('hipR')],
    [tt('ANKLE'), m('ankleL'), m('ankleR')],
    [tt('SHOULDER'), m('shoulderL'), m('shoulderR')],
    [tt('ELBOW'), m('elbowL'), m('elbowR')],
    [tt('WRIST'), m('wristL'), m('wristR')],
    [tt('TRUNK'), m('trunk'), null, true],
    [tt('NECK'), m('neck'), null, true],
    [tt('COM (CM)'), cm(MB && MB.comAhead, MB && MB.seen), null, true],
    [tt('BAR / HANDS (CM)'), cm(MB && MB.barAhead, MB && MB.seen), null, true],
  ]) : [
    [tt('KNEE'), a(23, 25, 27), a(24, 26, 28)],
    [tt('HIP'), a(11, 23, 25), a(12, 24, 26)],
    [tt('ELBOW'), a(11, 13, 15), a(12, 14, 16)],
  ];
  // the ten controls as one equal-cell grid (5.10 #574): 10 on a desktop row, 2 x 5 on a
  // phone; white resting text as the pills had - this canvas is dark in every theme
  const pill = (k, label, on, active) => ({ k, label, onClick: on, active: !!active, tone: '#FFF' });
  // the camera's VIEWPOINTS have their own Hebrew (11.10): 'TOP' and 'FRONT' are shared keys - the rep
  // phase ('למעלה', up) and the front camera ('קדמית') - and read wrong here. English shows the word.
  const vt = (k) => { const v = tt(`view·${k}`); return v === `view·${k}` ? k : v; };
  // THE JOINT BOX (8 rows with the anatomy): over the canvas on a wide screen; on a phone UNDER it - over the canvas it
  // covered his head and trunk (13.10, 390)
  const boxBelow = !!MA && ((hostW > 0 && hostW < 600) || !!clipSrc);   // beside a clip the row is the clip's height: the box goes under it, never over the body
  // the clip's column: its own shape at the row's height
  const rowH = sideH(rowW || 360), clipW = Math.round(rowH * clipAR);
  const jointBox = (
    <div style={{ ...(boxBelow ? { marginTop: 8, border: `1px solid ${C.cardBd}`, gridTemplateColumns: '1fr auto auto', maxWidth: 560 } : { position: 'absolute', insetInlineStart: 8, top: 8, gridTemplateColumns: 'auto auto auto' }), display: 'grid', columnGap: boxBelow ? 18 : 10, rowGap: 2, padding: '6px 8px', background: 'rgba(10,10,11,0.72)', fontFamily: FN, fontSize: 10, color: '#FFF', fontVariantNumeric: 'tabular-nums', pointerEvents: 'none' }}>
          {/* L / R centred over their columns; every value one width (AngleNum) so the digits stack (13.10 #723) */}
          <span /> <AngleHead style={{ color: '#39BDFF', fontWeight: 700, justifySelf: 'center' }}>{tt('L')}</AngleHead><AngleHead style={{ color: '#F5A524', fontWeight: 700, justifySelf: 'center' }}>{tt('R')}</AngleHead>
          {angles.map(([k, l, r, one]) => (<React.Fragment key={k}><span style={{ color: C.tm, letterSpacing: '0.1em' }}>{k}</span>{[l, r].map((x, n) => (one && n === 1 ? <span key={n} /> : <AngleNum key={n} v={x ? x.v : null} seen={!x || x.seen} signed={!!(x && x.signed)} unit={x && x.unit != null ? x.unit : '°'} style={{ justifySelf: 'center', color: x && !x.seen ? '#6b7480' : '#FFF' }} />))}</React.Fragment>))}
          {MA && plane === 'sag' && <span style={{ gridColumn: '1 / -1', color: '#8a939e', fontSize: 9, letterSpacing: '0.06em', marginTop: 2 }}>{tt('ANKLE + DORSI · − PLANTAR')}</span>}
          {MA && plane === 'sag' && <span style={{ gridColumn: '1 / -1', color: '#8a939e', fontSize: 9, letterSpacing: '0.06em' }}>{tt('COM / BAR: + AHEAD OF MID-FOOT · − BEHIND')}</span>}
          {MA && plane !== 'sag' && <span style={{ gridColumn: '1 / -1', color: '#8a939e', fontSize: 9, letterSpacing: '0.06em', marginTop: 2 }}>{tt('+ = THE MOTION NAMED · − = ITS OPPOSITE · TRUNK / NECK + = TO HIS LEFT')}</span>}
          {MA && plane === 'trans' && <span style={{ gridColumn: '1 / -1', color: '#8a939e', fontSize: 9, letterSpacing: '0.06em' }}>{tt('~ = ESTIMATED: ONE CAMERA SEES A TWIST ONLY THROUGH THE JOINTS AROUND IT')}</span>}
    </div>
  );
  // the legend: over the canvas - or, beside a clip on a narrow canvas (a phone), UNDER the row: wrapped to three lines it
  // covered his legs (13.10, 390)
  const legendBelow = !!clipSrc && hostW > 0 && hostW < 400;
  const legendEl = (
        <div style={{ ...(legendBelow ? { marginTop: 6 } : { position: 'absolute', insetInlineEnd: 8, bottom: 8, maxWidth: 'calc(100% - 16px)' }), display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', columnGap: 10, rowGap: 4, fontFamily: FN, fontSize: 9, letterSpacing: '0.1em', color: C.tm, pointerEvents: 'none' }} /* wraps inside the canvas on a narrow phone, never off its edge (12.10) */>
          <span style={{ color: '#8a939e' }}>{tt('FADED = NOT SEEN')}</span>
          {anat === 'ready' && <span style={{ color: '#5c636e' }} dir="ltr">Z-ANATOMY · CC BY-SA</span>}
          {compare && <span style={{ color: '#FFFFFF' }}>━ {tt('REP {n}').replace('{n}', lo)}</span>}
          {trails && <><span style={{ color: '#39BDFF' }}>━ {tt(channel === 'knee' ? 'SHOULDERS' : 'HANDS')}</span><span style={{ color: '#F5A524' }}>━ {tt('HIPS')}</span></>}
        </div>
  );
  return (
    <div ref={wrapRef} style={{ background: '#0b0d10', position: 'relative' }}>
      {/* five a row (5.10 #556): ten in one row cut FULLSCREEN to "ULLSCREE" beside a clip */}
      <ChipGrid value={null} cols={5} phoneCols={5} style={{ marginBottom: 8 }} cellStyle={CHIP_TIGHT}
        items={[
          pill('play', playing ? tt('PAUSE') : tt('PLAY'), () => setPlaying((v) => !v), playing),
          ...[0.25, 0.5, 1].map((s) => pill(`x${s}`, `${s}×`, () => setSpeed(s), speed === s)),
          pill('front', vt('FRONT'), () => view('front')),
          pill('side', vt('SIDE'), () => view('side')),
          pill('top', vt('TOP'), () => view('top')),
          pill('behind', vt('BEHIND'), () => view('behind')),
          pill('trails', tt('TRAILS'), () => setTrails((v) => !v), trails),
          // Hebrew 'מסך מלא' is wider than a 360px phone's chip: the ⛶ mark (the app's own, beside FULL) only where it cannot fit
          /[\u0590-\u05FF]/.test(tt('FULL')) ? { ...pill('full', <SegWord full={tt('FULL')} short="⛶" />, full), he: true, title: tt('FULL') } : pill('full', tt('FULL'), full),
        ]} />
      {track && anat !== 'error' && (
        // a choice of one = a chip group (the house rule): the chosen layer filled; white resting text on this dark panel
        <ChipGrid value={layer} onChange={setLayer} cols={4} phoneCols={4} style={{ marginBottom: 8, maxWidth: 560 }} cellStyle={CHIP_TIGHT} ariaLabel={tt('MUSCLE LAYERS')}
          items={[['skeleton', 'SKELETON'], ['deep', 'DEEP'], ['middle', 'MIDDLE'], ['surface', 'SURFACE']].map(([k, en]) => { const key = `layer·${k.toUpperCase()}`, he = tt(key); return { k, label: he !== key ? he : k === 'skeleton' ? <SegWord full="SKELETON" short="BONES" /> : en, tone: '#FFF' }; })} />
      )}
      {track && anat !== 'error' && (
        // MUSCLE FOCUS (#907): the same chip group, ten = two full rows. Five to a row leaves a 360px phone 59px a chip, so the
        // chips keep 3px a side (CHIP_TIGHT, #1026) and SHOULDERS shortens to SHLDR only when it cannot fit
        <ChipGrid value={focus} onChange={setFocus} cols={5} phoneCols={5} style={{ marginBottom: 8, maxWidth: 640 }} cellStyle={CHIP_TIGHT} ariaLabel={tt('MUSCLE FOCUS')}
          items={FOCUS_KEYS.map((k) => { const key = `focus·${k.toUpperCase()}`, he = tt(key); return { k, label: he !== key ? he : k === 'shoulders' ? <SegWord full="SHOULDERS" short="SHLDR" /> : k.toUpperCase(), tone: '#FFF' }; })} />
      )}
      {MA && (
        // the joint box's plane (#716): the same chip group as the layers
        <ChipGrid value={plane} onChange={setPlane} cols={3} phoneCols={3} style={{ marginBottom: 8, maxWidth: 480 }} cellStyle={CHIP_TIGHT} ariaLabel={tt('PLANE')}
          items={[['sag', 'SAGITTAL'], ['front', 'FRONTAL'], ['trans', 'TRANSVERSE']].map(([k, en]) => { const key = `plane·${en}`, he = tt(key); return { k, label: he === key ? en : he, tone: '#FFF' }; })} />
      )}
      <div ref={rowRef} style={clipSrc ? { display: 'flex', flexDirection: clipSide ? 'row' : 'column', gap: 8, alignItems: 'flex-start' } : undefined}>
      {clipSrc && (
        <div style={{ flex: '0 0 auto', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', ...(clipSide ? { width: clipW, height: rowH + 2 } : { width: '100%' }) }}>
        <div style={{ position: 'relative', boxSizing: 'border-box', border: `1px solid ${C.cardBd}`, background: '#000', ...(clipSide ? { flex: '1 1 0', minHeight: 0 } : { width: '100%', aspectRatio: `${clipAR}` }) }}>
          <video ref={clipRef} src={clipSrc} muted playsInline preload="auto" aria-label={tt('ORIGINAL CLIP')}
            onLoadedMetadata={(e) => { const v = e.currentTarget; if (v.videoWidth && v.videoHeight) setClipAR(v.videoWidth / v.videoHeight); if (poseFrames[idxRef.current]) { try { v.currentTime = poseFrames[idxRef.current].t / 1000; } catch { /* noop */ } } }}
            style={{ display: 'block', width: '100%', height: '100%', objectFit: 'contain' }} />
          <canvas ref={clipCanvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />
        </div>
        <div data-clip-tools style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 1, background: C.cardBd, border: `1px solid ${C.cardBd}`, borderTop: 'none' }}>
          {[[clipSkel && clipAng, (f) => { const on = typeof f === 'function' ? f(clipSkel && clipAng) : f; setClipSkel(on); setClipAng(on); }, 'JOINT ANGLES']].map(([on, set, label]) => (
            <button key={label} type="button" aria-pressed={on} onClick={() => set((x) => !x)}
              style={{ height: 30, border: 'none', background: '#0a0a0b', color: on ? C.ac : 'rgba(255,255,255,0.6)', boxShadow: on ? `inset 0 0 0 1px ${C.ac}` : 'none',
                fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', cursor: 'pointer' }}>{tt(label)}</button>
          ))}
        </div>
        </div>
      )}
      <div style={{ position: 'relative', ...(clipSrc ? { flex: clipSide ? '1 1 0' : 'none', minWidth: 0, width: clipSide ? undefined : '100%' } : null) }}>
        <div ref={hostRef} style={{ width: '100%', border: `1px solid ${C.cardBd}` }} />
        {track && anat !== 'ready' && (
          <div style={{ position: 'absolute', insetInlineEnd: 8, top: 8, padding: '6px 8px', background: 'rgba(10,10,11,0.72)', fontFamily: FN, fontSize: 10, letterSpacing: '0.1em', color: anat === 'error' ? '#F5A524' : '#FFF', pointerEvents: 'none' }}>
            {anat === 'error' ? tt('Could not load the anatomy model.') : tt('LOADING ANATOMY…')}
          </div>
        )}
        {track && anat === 'ready' && track.inView && poseFrames[idx] && !track.inView(poseFrames[idx].t) && (
          <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', padding: '6px 10px', background: 'rgba(10,10,11,0.72)', fontFamily: FN, fontSize: 10, letterSpacing: '0.1em', color: '#8a939e', pointerEvents: 'none' }}>{tt('NOT IN VIEW')}</div>
        )}
        {/* the true 3D angles at this frame - left / right; over the canvas when there is room */}
        {!boxBelow && jointBox}
        {!legendBelow && legendEl}
      </div>
      </div>
      {legendBelow && legendEl}
      {boxBelow && jointBox}
      {anat === 'ready' && readShare >= 0.7 && track && track.bodyFrac != null && track.bodyFrac < 0.36 && (
        <div style={{ marginTop: 8, fontFamily: FN, fontSize: 10, letterSpacing: '0.06em', color: '#F5A524' }}>{tt('He is small in the picture - film closer, the whole body in the frame, for a true reading')}</div>
      )}
      {anat === 'ready' && readShare >= 0.7 && popRate > 10 && (
        <div style={{ marginTop: 8, fontFamily: FN, fontSize: 10, letterSpacing: '0.06em', color: '#F5A524' }}>{tt('This camera angle reads poorly in 3D - the body and its numbers are rough here. Film side-on at hip height, the whole body in the frame')}</div>
      )}
      {anat === 'ready' && readShare < 0.7 && (
        <div style={{ marginTop: 8, fontFamily: FN, fontSize: 10, letterSpacing: '0.06em', color: '#F5A524' }}>{tt('Only {n}% of this clip could be read - film the whole body, side-on, closer').replace('{n}', Math.round(readShare * 100))}</div>
      )}
      <input type="range" min={0} max={Math.max(0, poseFrames.length - 1)} value={idx} aria-label={tt('FRAME')}
        onChange={(e) => seekTo(+e.target.value)}
        style={{ width: '100%', display: 'block', margin: '10px 0 0', accentColor: C.ac }} />
      {trace && (() => {
        const T0 = poseFrames[0].t, T1 = poseFrames[poseFrames.length - 1].t, span = Math.max(1, T1 - T0);
        const X = (t) => { const x = (1000 * (t - T0)) / span; return rtl ? 1000 - x : x; }, Y = (a) => 40 - (36 * (a - trace.lo)) / Math.max(1, trace.hi - trace.lo);
        let d = '', pen = false;
        trace.v.forEach((a, i) => { if (a == null) { pen = false; return; } d += `${pen ? 'L' : 'M'}${X(poseFrames[i].t).toFixed(1)} ${Y(a).toFixed(1)} `; pen = true; });
        const tNow = poseFrames[idx] ? poseFrames[idx].t : T0;
        // rep numbers never overlap: one closer than 16px to the last on its line drops a line (two
        // reps 0.3 s apart at the end of a clip painted "8" over "9")
        const wPx = hostW || 360, ends = [];
        const rowOf = repSpans.map((r) => { const px = (X(r.tb) / 1000) * wPx; let k = 0; while (ends[k] != null && Math.abs(px - ends[k]) < 16) k++; ends[k] = px; return k; });
        const rows = rowOf.length ? Math.max(...rowOf) + 1 : 1;
        return (
          <div style={{ position: 'relative', height: 47 + 11 * rows, marginTop: 6, cursor: 'pointer' }} dir="ltr"
            onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); const u = (e.clientX - r.left) / r.width; seekTo(idxAt(T0 + (rtl ? 1 - u : u) * span)); }}>
            <svg viewBox="0 0 1000 44" preserveAspectRatio="none" width="100%" height="44" style={{ display: 'block', border: `1px solid ${C.cardBd}` }} aria-hidden="true">
              {repSpans.map((r, i) => <rect key={i} x={Math.min(X(r.t0), X(r.t1))} y="0" width={Math.max(2, Math.abs(X(r.t1) - X(r.t0)))} height="44" fill={inSet(i) ? 'rgba(57,189,255,0.14)' : 'rgba(255,255,255,0.04)'} />)}
              <path d={d} fill="none" stroke="#39BDFF" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
              <line x1={X(tNow)} x2={X(tNow)} y1="0" y2="44" stroke="#F5A524" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
            </svg>
            {repSpans.map((r, i) => (
              <span key={i} style={{ position: 'absolute', top: 46 + 11 * rowOf[i], left: `${X(r.tb) / 10}%`, transform: 'translateX(-50%)', fontFamily: FN, fontSize: 9, fontWeight: 700, color: inSet(i) ? '#39BDFF' : '#5c636e', fontVariantNumeric: 'tabular-nums', pointerEvents: 'none' }}>{i + 1}</span>
            ))}
          </div>
        );
      })()}
      {repSpans.length > 0 && (() => {
        const tNow = poseFrames[idx] ? poseFrames[idx].t : 0;
        let cur = -1; repSpans.forEach((r, i) => { if (r.t0 <= tNow + 1) cur = i; });
        // PREV: inside a rep, back to its start first; at its start, the rep before
        const prevK = cur < 0 ? -1 : (tNow > repSpans[cur].t0 + 150 ? cur : cur - 1);   // before the first rep there is none
        const go = (k) => { const r = repSpans[Math.max(0, Math.min(repSpans.length - 1, k))]; if (r) seekTo(idxAt(r.t0)); };
        const st = cur >= 0 ? repStats[cur] : null;
        return (<>
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: 12, rowGap: 8, marginTop: 10 }}>
            {/* three buttons + the rep label: on a phone the label drops a line so each button keeps ~110px
                (sharing the line it got ~80, and PREV REP was one letter from an ellipsis at 360) */}
            <JoinedButtons maxWidth={480} style={{ flex: '1 1 300px', '--c-sf': '#14181e', '--c-tx': '#FFFFFF', '--c-td': '#5c636e' /* this panel is dark in every theme */ }} items={[
              { label: `‹ ${tt('PREV REP')}`, onClick: () => go(prevK), disabled: prevK < 0 },
              { label: `${tt('NEXT REP')} ›`, onClick: () => go(cur + 1), disabled: cur >= repSpans.length - 1 },
              ...(repSpans.length > 1 ? [{ label: tt('VS REP {n}').replace('{n}', lo), onClick: () => setCompare((v) => !v), tone: compare ? 'accent' : undefined, title: tt('An outline of the first rep of the set, over this rep') }] : []),
            ]} />
            <span style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: '#FFF', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{tt('REP')} {cur < 0 ? '–' : cur + 1} / {repSpans.length}</span>
          </div>
          {onRange && cur >= 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10, flexWrap: 'wrap' }}>
              <JoinedButtons maxWidth={420} style={{ flex: '1 1 auto', '--c-sf': '#14181e', '--c-tx': '#FFFFFF', '--c-td': '#5c636e' }} items={[
                { label: tt('FIRST REP'), onClick: () => onRange(cur + 1, hi >= repSpans.length ? null : Math.max(cur + 1, hi)) },   // an untouched end stays open ('to the end'), so a re-read with more reps is not cut
                { label: tt('LAST REP'), onClick: () => onRange(Math.min(lo, cur + 1), cur + 1) },
                { label: tt('ALL REPS'), onClick: () => onRange(1, null), disabled: lo === 1 && hi === repSpans.length },
              ]} />
              <span style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: '#FFF', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{tt('IN THE SET: {n}').replace('{n}', Math.max(0, hi - lo + 1))}</span>
            </div>
          )}
          {st && (
            <div style={{ display: 'flex', flexWrap: 'wrap', columnGap: 14, rowGap: 2, marginTop: 8, fontFamily: FN, fontSize: 10, letterSpacing: '0.08em', color: '#FFF', fontVariantNumeric: 'tabular-nums' }}>
              {st.depth != null && <span><span style={{ color: C.tm }}>{tt('DEPTH')}</span> <span dir="ltr" style={{ unicodeBidi: 'isolate' }}>{st.depth}°</span></span>}
              {st.rom != null && <span><span style={{ color: C.tm }}>{tt('RANGE')}</span> <span dir="ltr" style={{ unicodeBidi: 'isolate' }}>{st.rom}°</span></span>}
              <span><span style={{ color: C.tm }}>{tt('DURATION')}</span> {st.sec.toFixed(1)} {tt('SEC')}</span>
            </div>
          )}
          {shapes && hi - lo >= 1 && (() => {
            const inSetIdx = shapes.map((_, i) => i).filter((i) => inSet(i) && shapes[i].length > 2);
            if (inSetIdx.length < 2) return null;
            let yLo = Infinity, yHi = -Infinity;
            inSetIdx.forEach((i) => shapes[i].forEach(([, a]) => { if (a < yLo) yLo = a; if (a > yHi) yHi = a; }));
            if (!(yHi > yLo)) return null;
            const X = (u) => (rtl ? 1000 - u * 1000 : u * 1000), Y = (a) => 56 - (52 * (a - yLo)) / (yHi - yLo);
            const path = (sh) => sh.map(([u, a], k) => `${k ? 'L' : 'M'}${X(u).toFixed(1)} ${Y(a).toFixed(1)}`).join(' ');
            const ref = lo - 1;
            const tNow = poseFrames[idx] ? poseFrames[idx].t : 0;
            // the current rep only while the frame is IN it - between reps and after the set there is none
            // (it used to stick to the end of the last rep's curve, review 11.10)
            const curR = cur >= 0 && inSet(cur) && tNow <= repSpans[cur].t1 && shapes[cur].length > 2 ? repSpans[cur] : null;
            const uNow = curR ? Math.max(0, Math.min(1, (tNow - curR.t0) / Math.max(1, curR.t1 - curR.t0))) : null;
            return (
              <div style={{ marginTop: 10 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', columnGap: 14, fontFamily: FN, fontSize: 9, letterSpacing: '0.1em', color: C.tm, marginBottom: 4 }}>
                  <span style={{ color: '#FFF', fontWeight: 700 }}>{tt('REP SHAPES')}</span>
                  {shapes[ref] && shapes[ref].length > 2 && <span style={{ color: '#FFFFFF' }}>┅ {tt('REP {n}').replace('{n}', lo)}</span>}
                  {curR && cur !== ref && <span style={{ color: '#39BDFF' }}>━ {tt('REP {n}').replace('{n}', cur + 1)}</span>}
                </div>
                <svg viewBox="0 0 1000 60" preserveAspectRatio="none" width="100%" height="60" style={{ display: 'block', border: `1px solid ${C.cardBd}` }} aria-hidden="true">
                  {inSetIdx.filter((i) => i !== ref && i !== cur).map((i) => <path key={i} d={path(shapes[i])} fill="none" stroke="rgba(57,189,255,0.28)" strokeWidth="1" vectorEffect="non-scaling-stroke" />)}
                  {shapes[ref] && shapes[ref].length > 2 && <path d={path(shapes[ref])} fill="none" stroke="#FFFFFF" strokeWidth="1.5" strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />}
                  {curR && cur !== ref && <path d={path(shapes[cur])} fill="none" stroke="#39BDFF" strokeWidth="2" vectorEffect="non-scaling-stroke" />}
                  {curR && <line x1={X(uNow)} x2={X(uNow)} y1="0" y2="60" stroke="#F5A524" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />}
                </svg>
              </div>
            );
          })()}
        </>);
      })()}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: FN, fontSize: 10, color: C.tm, marginTop: 6 }}>
        <span>{tt('FRAME')} {idx + 1} / {poseFrames.length}</span>
        <span>{tt('DRAG ORBIT · PINCH / WHEEL ZOOM')}</span>
      </div>
    </div>
  );
}
