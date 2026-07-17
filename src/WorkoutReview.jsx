import React, { useState, useRef, useEffect, useMemo, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { fmtPrettyDate } from './dates';
import { safeUrl } from './VideoEmbed';
// LIFT METRICS on a trainee's uploaded Review clip: capture the clip's pose
// frames and run the same VBT/ROM/tempo battery MovementLab uses, rendered
// INLINE on the player (no 3D box, no fullscreen). The on-video skeleton is the
// existing POSE overlay (matched to the live style).
import { AnalyzeResult, captureClipFrames } from './MovementLab';
import { analyzeClip } from './poseLab';
import { C, FN, FB, FH, ytId, EXPO_ICON } from './theme';

// Hebrew at the same fontSize as Nord visually shrinks (smaller x-height,
// missing ascenders/descenders). Per feedback_new_ui_box_dimensions:
// "Hebrew bumps +3px inside the box, never resizes the box itself."
const isHebrew = (s) => /[֐-׿]/.test(s || '');
import { isRefined5b, useEscClose, SectionLabel, CollapsibleSection, useDelayedUnmountValue } from './ui';
import { EXPOMark } from './expoMark';
import { EX } from './exerciseData';
import useAutosave from './hooks/useAutosave';
import WeeklyFocusTool from './WeeklyFocusTool';
import {
  ANGLE_DEFS, angleAt, detectChannels, medianFilter, findPeaks, SMOOTH_N,
} from './repCounter';

const bi = {background:'var(--c-sf)',border:`1px solid ${C.cardBd}`,padding:"8px 10px",borderRadius:0,
  color:C.tx,fontFamily:FB,fontSize:13,outline:"none",width:"100%",boxSizing:"border-box",textAlign:"center"};

// Review-screen keyboard shortcuts. Bound at the detail-screen level so they
// only fire while a workout is actually open, never on the list view. Always
// skip when the user is typing into a textarea / input / contentEditable.
//
//   ⌘/Ctrl + Enter  → mark reviewed + jump to next pending  (saveAndNext)
//   M               → same (single-key alias for keyboard-only review pass)
//   J               → jump to next pending without marking the current one
//                     reviewed (lets the trainer skip ahead, come back later)
//
// onFire = saveAndNext, onJump = findNext+setSelectedWo. enabled gates them
// against the delete-confirm modal so accidental keystrokes don't fire while
// the user is typing 'delete'.
function ReviewHotkeys({ enabled, onFire, onJump }) {
  useEffect(() => {
    if (!enabled) return;
    const handler = (e) => {
      const tag = (e.target?.tagName || '').toLowerCase();
      if (tag === 'textarea' || tag === 'input' || tag === 'select') return;
      if (e.target?.isContentEditable) return;
      // Mark reviewed + next: ⌘/Ctrl+Enter or bare M.
      const isModEnter = (e.metaKey || e.ctrlKey) && e.key === 'Enter';
      const isM = !e.metaKey && !e.ctrlKey && !e.altKey && (e.key === 'm' || e.key === 'M');
      if (isModEnter || isM) {
        e.preventDefault(); onFire(); return;
      }
      // Jump only (no mark): bare J.
      const isJ = !e.metaKey && !e.ctrlKey && !e.altKey && (e.key === 'j' || e.key === 'J');
      if (isJ && onJump) {
        e.preventDefault(); onJump(); return;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [enabled, onFire, onJump]);
  return null;
}

// MediaPipe Pose landmark indices for skeleton drawing + joint-angle calc.
const POSE_CONNECTIONS = [
  [11,12],[11,23],[12,24],[23,24],   // torso
  [11,13],[13,15],                    // left arm
  [12,14],[14,16],                    // right arm
  [23,25],[25,27],                    // left leg
  [24,26],[26,28],                    // right leg
];

// ANGLE_DEFS, angleAt, detectChannels, medianFilter, findPeaks, SMOOTH_N
// now live in src/repCounter.js — imported above. They're shared with the
// client-side auto-count on upload (ClientPortal.jsx) so both paths run
// identical algorithm.

// Rep counting algorithm (ANGLE_DEFS / angleAt / detectChannels / medianFilter
// / findPeaks / SMOOTH_N) moved to src/repCounter.js — imported at the top so
// the client's upload-time auto-count runs the same code.

// Form-video player: speed control (0.125x recovers old fast-motion webm),
// frame-step (←/→ ~ 1/30s), fullscreen, and an optional MediaPipe Pose
// overlay with live joint angles + rep counter.
// `exerciseTitle` lets the rep counter auto-pick the right joint (knee/hip/
// elbow) instead of always-knee. If omitted, defaults to 'auto' which falls
// back to 'knee'. Trainer can override via the dropdown next to REPS.
// `onVideoRef` lets a parent grab the underlying <video> element (used by
// the side-by-side compare view to sync timing across two players).
// Error boundary so that a render throw inside the player doesn't black-
// screen the entire review page. Shows the error message + reload link
// instead, so the rest of the workout card stays usable.
class FormVideoErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err, info) { console.error('FormVideoPlayer crash:', err, info); }
  render() {
    if (this.state.err) {
      return (
        <div style={{background:C.rdD,border:`1px solid ${C.rd}`,borderRadius:0,padding:12,color:C.rd,fontSize:12,fontFamily:FB}}>
          <div style={{fontWeight:700,marginBottom:4}}>Video player crashed — reload to retry</div>
          <div style={{fontSize:11,opacity:0.8,whiteSpace:'pre-wrap',fontFamily:'monospace'}}>{String(this.state.err?.message || this.state.err)}</div>
          <button onClick={() => this.setState({ err: null })} style={{marginTop:8,background:C.sf,border:`1px solid ${C.rd}`,color:C.rd,borderRadius:0,padding:'4px 10px',fontSize:11,fontWeight:600,cursor:'pointer'}}>Retry</button>
        </div>
      );
    }
    return this.props.children;
  }
}

export function FormVideoPlayer(props) {
  return (
    <FormVideoErrorBoundary>
      <FormVideoPlayerImpl {...props} />
    </FormVideoErrorBoundary>
  );
}

function FormVideoPlayerImpl({ url, exerciseTitle, onVideoRef, reviewNotes, onReviewNotesChange, role = 'trainer' }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const landmarkerRef = useRef(null);
  const rafRef = useRef(null);
  // Inline LIFT METRICS on THIS clip (VBT/ROM/tempo). metricsState: idle | busy | done | err
  const [metricsState, setMetricsState] = useState('idle');
  const [metricsPct, setMetricsPct] = useState(0);
  const [metrics, setMetrics] = useState(null);        // { result, frames }
  const [metricsTab, setMetricsTab] = useState('velocity');
  const [metricsErr, setMetricsErr] = useState('');
  const [videoTime, setVideoTime] = useState(0);       // drives the metrics-graph playhead
  // Precise width check for the side-by-side layout — CSS flex-wrap alone is
  // unreliable here: it wraps based on items' UN-SHRUNK hypothetical sizes
  // (flex-basis), not their actual minimum sizes, so at some container widths
  // it wraps to stacked even though both columns would comfortably fit once
  // shrunk (Ohad: "fix the split display to make it fit too" — seen on a
  // narrower browser window where there was clearly unused width to the right
  // of the stacked layout). Measuring the real container width sidesteps that
  // CSS quirk entirely.
  const rowRef = useRef(null);
  const [rowWide, setRowWide] = useState(true);
  useEffect(() => {
    const el = rowRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => { setRowWide(entries[0].contentRect.width >= 620); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Natural aspect ratio of THIS clip, read once metadata loads. Portrait phone
  // footage (very common for form-check uploads) was being crammed into a fixed
  // wide 16:9-ish box — object-fit:contain then pillarboxed it down to a tiny
  // sliver with huge black bars either side. Once known, a portrait clip sizes
  // its OWN wrapper (not just the <video>) to match, so it fills the frame.
  const [vidAspect, setVidAspect] = useState(null);     // { ratio, portrait } | null
  // All state declarations up front — derived values and callbacks below
  // reference them, and placing state after the derivations would trip
  // the temporal-dead-zone at render time.
  // Hydrate compose state from a localStorage draft so a tab-switch /
  // refresh / accidental nav mid-comment doesn't lose the typed text or
  // drawings. Cleared on submit/cancel below. Keyed by video URL — distinct
  // videos keep distinct drafts.
  const draftKey = `expo-fv-compose-${url || 'unknown'}`;
  const _initialDraft = (() => {
    if (role !== 'trainer') return null;
    try { const raw = localStorage.getItem(draftKey); return raw ? JSON.parse(raw) : null; }
    catch { return null; }
  })();
  const [composing, setComposing] = useState(_initialDraft?.composing || null);
  const [composeText, setComposeText] = useState(_initialDraft?.composeText || '');
  const [commentsEnabled, setCommentsEnabled] = useState(true);
  const [activeDrawColor, setActiveDrawColor] = useState(null);
  const [rulerMode, setRulerMode] = useState(false);
  const [activeStroke, setActiveStroke] = useState(null);
  const [composeDrawings, setComposeDrawings] = useState(_initialDraft?.composeDrawings || []);
  // Autosave the in-progress comment (text + drawings + which note is being
  // edited / replied-to / created at what timestamp) to localStorage. Tab
  // switch / refresh / nav restores it on next mount via _initialDraft above.
  // Bundled into a single object so the hook has one stable value to track;
  // useMemo prevents needless re-fires when references look new but contents
  // haven't changed.
  const composeDraft = useMemo(
    () => (composing ? { composing, composeText, composeDrawings } : null),
    [composing, composeText, composeDrawings]
  );
  const composeAutosave = useAutosave(
    role === 'trainer' ? composeDraft : null,
    async (draft) => {
      if (!draft) return true;
      try { localStorage.setItem(draftKey, JSON.stringify(draft)); return true; }
      catch { return false; }
    },
    { debounceMs: 300 }
  );
  const [pausedAtCommentId, setPausedAtCommentId] = useState(null);
  const [videoPaused, setVideoPaused] = useState(true);
  const [videoEnded, setVideoEnded] = useState(false);
  // Browsers can't always decode the source (e.g. older legacy .MOV /
  // video/quicktime uploads on Chrome). When the <video> errors, swap to a
  // download fallback so the trainer can still access the clip.
  const [videoLoadError, setVideoLoadError] = useState(false);
  // A video read right after upload can 404 for a few seconds while the public
  // CDN propagates. The <video> onError used to be a one-way gate → permanent
  // "OPEN IN NEW TAB" fallback even though the object was fine moments later.
  // Retry a few times with backoff (cache-busted reload) before giving up.
  const videoRetryRef = useRef(0);
  const videoRetryTimerRef = useRef(null);
  const MAX_VIDEO_RETRIES = 4;
  useEffect(() => {
    // New URL → reset the retry budget and clear the error.
    videoRetryRef.current = 0;
    setVideoLoadError(false);
    return () => { if (videoRetryTimerRef.current) clearTimeout(videoRetryTimerRef.current); };
  }, [url]);
  const handleVideoError = () => {
    const v = videoRef.current;
    // MEDIA_ERR_SRC_NOT_SUPPORTED (4) is a codec problem — retrying won't help,
    // fail straight to the fallback. Network/decode hiccups (incl. CDN 404
    // right after upload) are worth retrying.
    const code = v?.error?.code;
    if (code !== 4 && videoRetryRef.current < MAX_VIDEO_RETRIES && url) {
      const attempt = ++videoRetryRef.current;
      videoRetryTimerRef.current = setTimeout(() => {
        if (!videoRef.current) return;
        const bust = (url.includes('?') ? '&' : '?') + 'r=' + attempt;
        videoRef.current.src = url + bust;
        videoRef.current.load();
      }, attempt * 1500); // 1.5s, 3s, 4.5s, 6s
      return;
    }
    setVideoLoadError(true);
  };
  const drawCanvasRef = useRef(null);
  const wrapperRef = useRef(null);
  // HUD position offset (drag) + a render-bumping counter so the drawing
  // canvas resizes on fullscreen enter/exit (its useEffect runs on every
  // render but needs *some* render trigger to fire after the wrapper
  // changes size).
  const [hudPos, setHudPos] = useState({ x: 0, y: 0 });
  const [hudDragArmed, setHudDragArmed] = useState(false);
  const [, setRenderTick] = useState(0);
  // Tracks whether *we* are currently in fullscreen (any FS element on the
  // page is the wrapper or its video). Drives the toggle that re-shows the
  // native fullscreen button while inside our FS, so the user has a one-tap
  // escape back to the page.
  const [isFullscreen, setIsFullscreen] = useState(false);
  const visitedCommentsRef = useRef(new Set());
  // Tracks the last currentTime we saw on a timeupdate tick. The auto-pause
  // logic uses this to detect comment crossings in the (lastT, currentT]
  // interval — robust to uneven tick rates that the old fixed-tolerance
  // window kept missing on 2nd/3rd replays.
  const lastTimeRef = useRef(0);
  // When a seek originates from clicking a saved comment (list tick or row
  // play button), restore pausedAtCommentId after the seek lands so the
  // drawer toolbar and persisted strokes become visible. Without this,
  // onSeeked would unconditionally clear pausedAtCommentId and the trainer
  // could never re-enter a comment's drawing context by clicking.
  const seekTargetCommentIdRef = useRef(null);
  const DRAW_COLORS = [
    { key: 'red',   hex: '#ff4c4c' },
    { key: 'blue',  hex: '#3BA0FF' },
    { key: 'green', hex: '#28d95b' },
    { key: 'white', hex: '#ffffff' },
    { key: 'black', hex: '#000000' },
  ];
  const notes = Array.isArray(reviewNotes) ? reviewNotes : [];
  const writeNotes = onReviewNotesChange || (() => {});
  const fmtTs = (sec) => {
    const s = Math.max(0, Math.floor(sec || 0));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };
  const addComment = () => {
    const v = videoRef.current;
    if (!v) return;
    try { v.pause(); } catch {}
    setComposing({ ts: v.currentTime, replyToId: null });
    setComposeText('');
  };
  // Trainer-only `C` shortcut: drop a comment at the current playhead time.
  // No modifier — typing into a textarea / input is filtered out at the top
  // of the handler so it never collides with composing the comment itself.
  // Stored in a ref so the closure always sees the latest addComment.
  const addCommentRef = useRef(addComment);
  useEffect(() => { addCommentRef.current = addComment; });
  useEffect(() => {
    if (role !== 'trainer') return;
    const handler = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key !== 'c' && e.key !== 'C') return;
      const tag = (e.target?.tagName || '').toLowerCase();
      if (tag === 'textarea' || tag === 'input' || tag === 'select') return;
      if (e.target?.isContentEditable) return;
      // Already composing — pressing C again would replace the in-progress
      // draft, which is exactly what the user doesn't want.
      if (composing) return;
      e.preventDefault();
      addCommentRef.current && addCommentRef.current();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [role, composing]);
  // Auto-play once the metadata loads so the trainer doesn't have to click
  // play on every clip in a 60-clip review session. Browsers block autoplay
  // with sound, so we mute on the trainer side. Athlete role keeps the
  // explicit-click default (no surprise sound on their own clip).
  useEffect(() => {
    if (role !== 'trainer') return;
    const v = videoRef.current;
    if (!v || !url) return;
    const onMeta = () => {
      try { v.muted = true; v.play().catch(() => {}); } catch {}
    };
    v.addEventListener('loadedmetadata', onMeta);
    return () => v.removeEventListener('loadedmetadata', onMeta);
  }, [role, url]);
  // Read the clip's natural orientation once available — drives the smart
  // portrait sizing below. Reset on URL change so switching clips doesn't keep
  // a stale ratio from the previous video for a frame.
  useEffect(() => {
    setVidAspect(null);
    const v = videoRef.current;
    if (!v || !url) return;
    const onDims = () => {
      const vw = v.videoWidth, vh = v.videoHeight;
      if (vw > 0 && vh > 0) setVidAspect({ ratio: vw / vh, portrait: vh > vw });
    };
    if (v.videoWidth > 0) onDims();          // metadata already loaded (fast cache hit)
    v.addEventListener('loadedmetadata', onDims);
    return () => v.removeEventListener('loadedmetadata', onDims);
  }, [url]);
  const addReply = (parentId) => {
    setComposing({ ts: null, replyToId: parentId });
    setComposeText('');
  };
  const cancelCompose = () => {
    setComposing(null); setComposeText(''); setComposeDrawings([]);
    try { localStorage.removeItem(draftKey); } catch {}
    composeAutosave.markClean();
  };
  const startEdit = (note, isReply = false, parentId = null) => {
    try { videoRef.current?.pause(); } catch {}
    setComposing({ ts: note.ts ?? null, replyToId: null, editId: note.id, isReply, parentId });
    setComposeText(note.text || '');
    setComposeDrawings(Array.isArray(note.drawings) ? note.drawings : []);
  };
  const submitCompose = () => {
    const text = composeText.trim();
    if (!text || !composing) { cancelCompose(); return; }
    const nowIso = new Date().toISOString();
    if (composing.editId) {
      // Edit path: replace text + drawings on the existing note (or just text
      // on a reply, since replies don't carry drawings).
      if (composing.isReply) {
        const next = notes.map(n => n.id === composing.parentId
          ? { ...n, replies: (n.replies || []).map(r => r.id === composing.editId ? { ...r, text, editedAt: nowIso } : r) }
          : n);
        writeNotes(next);
      } else {
        const next = notes.map(n => n.id === composing.editId
          ? { ...n, text, drawings: composeDrawings, editedAt: nowIso }
          : n);
        writeNotes(next);
      }
      cancelCompose();
      return;
    }
    const newId = 'rn_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    if (composing.replyToId) {
      const next = notes.map(n => n.id === composing.replyToId
        ? { ...n, replies: [...(n.replies || []), { id: newId, text, author: role, createdAt: nowIso }] }
        : n);
      writeNotes(next);
    } else {
      writeNotes([...notes, { id: newId, ts: composing.ts, text, author: role, createdAt: nowIso, replies: [], drawings: composeDrawings }]);
    }
    cancelCompose();
  };
  const deleteNote = (id) => {
    // Delete top-level note (and all its replies), or a reply.
    const top = notes.find(n => n.id === id);
    if (top) { writeNotes(notes.filter(n => n.id !== id)); return; }
    writeNotes(notes.map(n => ({ ...n, replies: (n.replies || []).filter(r => r.id !== id) })));
  };
  const seekTo = (ts, commentId = null) => {
    const v = videoRef.current;
    if (!v || ts == null) return;
    if (commentId) {
      // Re-entering an existing comment's drawing context: pause so strokes
      // render (the canvas is gated on videoPaused), and stash the id so
      // onSeeked re-applies pausedAtCommentId once the seek lands.
      try { v.pause(); } catch {}
      seekTargetCommentIdRef.current = commentId;
    }
    v.currentTime = Math.max(0, ts);
  };

  // Drawing context: which comment's drawings are currently showing? The
  // compose buffer if a new comment is being drafted; else the paused-at
  // comment's persisted drawings; else none. Defensive — guard against
  // stored data where `drawings` isn't an array (old saves predate the
  // field; corrupt saves would blow up spread if we trusted them).
  const _rawStrokes = composing
    ? composeDrawings
    : (pausedAtCommentId ? (notes.find(n => n.id === pausedAtCommentId)?.drawings) : []);
  const currentStrokes = Array.isArray(_rawStrokes) ? _rawStrokes : [];
  // Can the user edit drawings right now? Only trainer in a context with
  // write access (either composing a new note or viewing an existing one
  // with onReviewNotesChange available).
  const canDraw = role === 'trainer' && !!onReviewNotesChange && (!!composing || !!pausedAtCommentId);

  const pushStroke = (stroke) => {
    if (composing) {
      setComposeDrawings(prev => [...prev, stroke]);
    } else if (pausedAtCommentId) {
      const next = notes.map(n => n.id === pausedAtCommentId
        ? { ...n, drawings: [...(n.drawings || []), stroke] }
        : n);
      writeNotes(next);
    }
  };
  const undoLastStroke = () => {
    if (composing) {
      setComposeDrawings(prev => prev.slice(0, -1));
    } else if (pausedAtCommentId) {
      const n = notes.find(x => x.id === pausedAtCommentId);
      if (!n || !n.drawings?.length) return;
      const next = notes.map(x => x.id === pausedAtCommentId
        ? { ...x, drawings: x.drawings.slice(0, -1) }
        : x);
      writeNotes(next);
    }
  };
  const clearDrawings = () => {
    if (composing) {
      setComposeDrawings([]);
    } else if (pausedAtCommentId) {
      const next = notes.map(x => x.id === pausedAtCommentId
        ? { ...x, drawings: [] }
        : x);
      writeNotes(next);
    }
  };

  // Compute the actual video content rectangle within an element box, given
  // intrinsic videoWidth/videoHeight and CSS object-fit:contain. In normal
  // mode the element ≈ content (video sized to its aspect). In fullscreen
  // the element is 100vw × 100vh and the content is letterboxed inside, so
  // strokes must be normalized/painted relative to the content rect — not
  // the element rect — to keep proportions consistent across modes.
  const getContentRect = (elW, elH) => {
    const v = videoRef.current;
    const vw = v?.videoWidth || 0;
    const vh = v?.videoHeight || 0;
    if (!elW || !elH || !vw || !vh) return { offX: 0, offY: 0, w: elW, h: elH };
    const elAspect = elW / elH;
    const vidAspect = vw / vh;
    if (vidAspect > elAspect) {
      const w = elW, h = elW / vidAspect;
      return { offX: 0, offY: (elH - h) / 2, w, h };
    }
    const h = elH, w = elH * vidAspect;
    return { offX: (elW - w) / 2, offY: 0, w, h };
  };

  const normPoint = (e) => {
    const c = drawCanvasRef.current;
    if (!c) return { x: 0, y: 0 };
    const rect = c.getBoundingClientRect();
    const { offX, offY, w, h } = getContentRect(rect.width, rect.height);
    return {
      x: w ? (e.clientX - rect.left - offX) / w : 0,
      y: h ? (e.clientY - rect.top - offY) / h : 0,
    };
  };
  const onCanvasPointerDown = (e) => {
    if (!activeDrawColor || !canDraw) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = normPoint(e);
    setActiveStroke({
      id: 'dr_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36),
      color: activeDrawColor,
      type: rulerMode ? 'line' : 'free',
      coords: 'content',
      points: [p],
    });
  };
  const onCanvasPointerMove = (e) => {
    if (!activeStroke) return;
    const p = normPoint(e);
    setActiveStroke(s => !s ? s : (s.type === 'line'
      ? { ...s, points: [s.points[0], p] }
      : { ...s, points: [...s.points, p] }));
  };
  const onCanvasPointerUp = () => {
    if (!activeStroke) return;
    // Require at least 2 meaningful points to save. Prevents accidental dots.
    const s = activeStroke;
    if (s.points.length >= 2) pushStroke(s);
    setActiveStroke(null);
  };

  // Canvas painter: redraws strokes whenever inputs change. Wrapped in a
  // try/catch so a bad stored stroke can never black-screen the video — if
  // the paint throws, the canvas stays transparent and video shows through.
  useEffect(() => {
    try {
      const c = drawCanvasRef.current;
      const v = videoRef.current;
      if (!c || !v) return;
      const elW = v.clientWidth, elH = v.clientHeight;
      if (!elW || !elH) return;
      if (c.width !== elW) c.width = elW;
      if (c.height !== elH) c.height = elH;
      const ctx = c.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, elW, elH);
      const { offX, offY, w, h } = getContentRect(elW, elH);
      if (!w || !h) return;
      const strokes = activeStroke ? [...currentStrokes, activeStroke] : currentStrokes;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      // New strokes (coords='content') are normalized to the actual video
      // content rect — proportions hold across normal/FS. Legacy strokes
      // without the flag were normalized to the full element box; we paint
      // those element-relative so they stay correct in normal mode (where
      // they were drawn). They may look slightly off in FS, but redrawing
      // (now with the flag) fixes them permanently.
      for (const s of strokes) {
        if (!s || !Array.isArray(s.points) || s.points.length === 0) continue;
        const useContent = s.coords === 'content';
        const px = (p) => useContent ? p.x * w + offX : p.x * elW;
        const py = (p) => useContent ? p.y * h + offY : p.y * elH;
        ctx.strokeStyle = s.color || '#ff4c4c';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(px(s.points[0]), py(s.points[0]));
        if (s.type === 'line' && s.points.length >= 2) {
          ctx.lineTo(px(s.points[1]), py(s.points[1]));
        } else {
          for (let i = 1; i < s.points.length; i++) {
            ctx.lineTo(px(s.points[i]), py(s.points[i]));
          }
        }
        ctx.stroke();
      }
    } catch (e) { /* never let a paint error crash the video */ }
  });
  // Offline peak-detection rep counter state:
  //   signalBufs[channel] — dense arrays indexed by video-frame bucket
  //     (Math.round(vt * BUCKET_FPS)). Raw angle per bucket; NaN for frames
  //     MediaPipe hasn't visited yet. Scrubbing back re-visits the same
  //     bucket and overwrites, so the buffer always reflects the latest
  //     reading per frame regardless of playback order.
  //   lastPeakRunAt — video-time of the last findPeaks run; throttles re-runs
  //     to ~5 Hz so we aren't re-peak-finding on every frame.
  const repStateRef = useRef({ signalBufs: {}, lastPeakRunAt: -1 });
  // Ref-backed counters so the detection loop can increment them without
  // colliding with stale closure captures (the previous setState-from-closure
  // approach kept resetting count to 1 on every rep).
  const repsCountRef = useRef(0);
  const lastTempoRef = useRef(null);
  // Always start at 1x — original speed. (Was 1.5x for trainers, which both
  // played the lift faster than reality before you'd chosen to AND left no
  // speed button highlighted, since 1.5 isn't in the `speeds` row. The coach
  // can still bump speed manually per clip.)
  const [speed, setSpeed] = useState(1);
  const [loop, setLoop] = useState(false);
  const [poseOn, setPoseOn] = useState(false);
  const [poseLoading, setPoseLoading] = useState(false);
  const [poseError, setPoseError] = useState('');
  const [angles, setAngles] = useState({});
  const [repsOn, setRepsOn] = useState(false);
  const [reps, setReps] = useState(0);
  const [tempo, setTempo] = useState(null); // seconds of video time for last rep
  // Override which joint-channels feed the peak detector. 'auto' = derive from
  // exercise title. Manual overrides let the trainer force a channel pair for
  // exercises the classifier mismapped.
  const [trackOverride, setTrackOverride] = useState('auto');
  const autoPick = detectChannels(exerciseTitle);
  const activeChannels =
    trackOverride === 'auto' ? autoPick.channels :
    trackOverride === 'hip'  ? ['L HIP', 'R HIP'] :
    trackOverride === 'knee' ? ['L KNE', 'R KNE'] :
    trackOverride === 'elbow'? ['L ELB', 'R ELB'] :
    trackOverride === 'sho'  ? ['L SHO', 'R SHO'] :
    []; // 'none'
  const activeKind =
    trackOverride === 'auto' ? autoPick.kind :
    trackOverride;
  // Ref-mirrored so the detection loop's closure can read the LATEST selection
  // without needing the effect to re-subscribe every render (activeChannels is
  // a fresh array each render → can't just put it in the effect's deps).
  const activeChannelsRef = useRef(activeChannels);
  useEffect(() => { activeChannelsRef.current = activeChannels; }, [trackOverride, exerciseTitle]);

  useEffect(() => { if (videoRef.current) videoRef.current.playbackRate = speed; }, [speed]);

  // MediaRecorder-encoded WebMs ship without a duration cue in the EBML
  // header, so the <video> reports duration = Infinity until it has scanned
  // the full file. While duration is Infinity, the seek bar is dead, the
  // time readout shows ":00 / —", and playbackRate changes are silently
  // dropped on some browsers. The fix is to scrub past the end on first
  // load — the browser scans the whole stream looking for the seek target,
  // discovers the real duration, fires durationchange, then we scrub back
  // to start. After that, the player behaves identically to any mp4.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    let fixed = false;
    const onLoaded = () => {
      // Only kick in for the broken-metadata case. Avoid running on healthy
      // mp4 / well-formed webm where duration is already finite.
      if (fixed) return;
      if (Number.isFinite(v.duration) && v.duration > 0) return;
      fixed = true;
      try {
        // 1e101 is the canonical "scan to end" sentinel used by every browser
        // implementation of the trick — finite enough that Chrome doesn't
        // throw, large enough that no real video clears it.
        v.currentTime = 1e101;
      } catch { /* iOS sometimes throws — durationchange handler retries */ }
    };
    const onDuration = () => {
      if (fixed && Number.isFinite(v.duration) && v.duration > 0) {
        // Scan completed; jump back to start so the user sees frame 0.
        try { v.currentTime = 0; } catch {}
        // Re-apply the user's chosen speed in case the browser reset it
        // while metadata was being scanned.
        v.playbackRate = speed;
      }
    };
    v.addEventListener('loadedmetadata', onLoaded);
    v.addEventListener('durationchange', onDuration);
    // src may have already loaded before this effect mounted (cached).
    if (v.readyState >= 1) onLoaded();
    return () => {
      v.removeEventListener('loadedmetadata', onLoaded);
      v.removeEventListener('durationchange', onDuration);
    };
  }, [url, speed]);

  // Auto-pause at comment timestamps. Listener reads the latest notes + flags
  // out of refs so the handler doesn't need to re-register on every change.
  const notesRef = useRef(notes);
  useEffect(() => { notesRef.current = notes; }, [notes]);
  const commentsEnabledRef = useRef(commentsEnabled);
  useEffect(() => { commentsEnabledRef.current = commentsEnabled; }, [commentsEnabled]);
  const loopRef = useRef(loop);
  useEffect(() => { loopRef.current = loop; }, [loop]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    // Mark a comment as "passed" once we see currentTime cross it between
    // ticks. Using the (lastT, currentT] interval makes detection independent
    // of how often timeupdate fires — the old fixed-tolerance window missed
    // comments when a tick straddled them, which is why replays felt flaky.
    const rebuildVisited = (t) => {
      const ns = notesRef.current;
      visitedCommentsRef.current = new Set(ns.filter(n => n.ts != null && n.ts < t - 0.05).map(n => n.id));
    };
    const onTimeUpdate = () => {
      if (!commentsEnabledRef.current) return;
      if (v.seeking || v.paused || v.ended) return;
      const t = v.currentTime;
      const lastT = lastTimeRef.current;
      lastTimeRef.current = t;
      // Backward jump (loop wrap, scrub, replay-after-end without a seeked
      // event). Trust onSeeked / onPlayEvt to rebuild visited; this tick is
      // only good for catching forward crossings.
      if (t < lastT - 0.05) return;
      for (const n of notesRef.current) {
        if (n.ts == null) continue;
        if (visitedCommentsRef.current.has(n.id)) continue;
        // Crossed during this tick (small +0.05s grace catches the very first
        // tick after play() lands exactly on a ts).
        if (n.ts > lastT && n.ts <= t + 0.05) {
          visitedCommentsRef.current.add(n.id);
          try { v.pause(); } catch {}
          setPausedAtCommentId(n.id);
          break;
        }
      }
    };
    const onSeeked = () => {
      const t = v.currentTime;
      lastTimeRef.current = t;
      rebuildVisited(t);
      // If the seek was initiated by clicking a saved comment, re-enter that
      // comment's drawing context. Otherwise clear (scrub / manual jump).
      const targetId = seekTargetCommentIdRef.current;
      seekTargetCommentIdRef.current = null;
      setPausedAtCommentId(targetId);
    };
    const onPlayEvt = () => {
      // Some browsers don't fire 'seeked' when re-playing after the video
      // ended (they implicitly snap to 0 and start). Detect that here so the
      // visited set is rebuilt and the next pass through pauses at comments
      // again — fixes the "2nd replay misses comments" flake.
      const t = v.currentTime;
      if (t < lastTimeRef.current - 0.2) rebuildVisited(t);
      lastTimeRef.current = t;
      setVideoPaused(false);
      setVideoEnded(false);
      setPausedAtCommentId(null);
    };
    const onPauseEvt = () => { setVideoPaused(true); };
    const onEndedEvt = () => {
      if (loopRef.current) {
        // Loop handled natively by the video element. Clear visited so the
        // next pass through pauses at comments again.
        visitedCommentsRef.current = new Set();
        lastTimeRef.current = 0;
        setPausedAtCommentId(null);
        setVideoEnded(false);
      } else {
        setVideoEnded(true);
      }
    };
    v.addEventListener('timeupdate', onTimeUpdate);
    v.addEventListener('seeked', onSeeked);
    v.addEventListener('play', onPlayEvt);
    v.addEventListener('pause', onPauseEvt);
    v.addEventListener('ended', onEndedEvt);
    // Initial sync.
    setVideoPaused(v.paused);
    return () => {
      v.removeEventListener('timeupdate', onTimeUpdate);
      v.removeEventListener('seeked', onSeeked);
      v.removeEventListener('play', onPlayEvt);
      v.removeEventListener('pause', onPauseEvt);
      v.removeEventListener('ended', onEndedEvt);
    };
  }, [url]);
  useEffect(() => { if (videoRef.current) videoRef.current.loop = loop; }, [loop]);

  // Hand the <video> element back to the parent if it asked for it.
  useEffect(() => { if (onVideoRef && videoRef.current) onVideoRef(videoRef.current); }, [onVideoRef, url]);

  // Reset rep state when toggle flips or a new video loads. `trackOverride`
  // is intentionally NOT in this dep list — all 8 channels are stored in the
  // buffer, so switching the tracked region just re-runs findPeaks on a
  // different subset without needing a replay.
  useEffect(() => {
    setReps(0); setTempo(null);
    repsCountRef.current = 0;
    lastTempoRef.current = null;
    repStateRef.current = { signalBufs: {}, lastPeakRunAt: -1 };
  }, [repsOn, url]);

  // When the channel override changes (or auto-picked exerciseTitle changes),
  // force a fresh findPeaks on whatever data is already in the buffer. Without
  // this effect, a paused video wouldn't update the count because the detect
  // loop only fires on decoded frames.
  useEffect(() => {
    if (!repsOn) return;
    const st = repStateRef.current;
    if (activeChannels.length === 0) {
      repsCountRef.current = 0;
      setReps(0);
      return;
    }
    const vt = videoRef.current?.currentTime || 0;
    const curBucket = Math.round(vt * 30);
    const minDist = Math.max(4, Math.round(30 * 0.4));
    let bestCount = 0;
    for (const key of activeChannels) {
      const sig = st.signalBufs[key];
      if (!sig || sig.length < 10) continue;
      const truncated = sig.slice(0, Math.max(0, curBucket + 1));
      if (truncated.length < 10) continue;
      const smoothed = medianFilter(truncated, SMOOTH_N);
      // Invert to count troughs: every rep has exactly one flexion bottom
      // regardless of whether the clip starts extended or flexed.
      const inverted = smoothed.map(x => Number.isFinite(x) ? -x : x);
      const troughs = findPeaks(inverted, 25, minDist);
      if (troughs.length > bestCount) bestCount = troughs.length;
    }
    repsCountRef.current = bestCount;
    setReps(bestCount);
    st.lastPeakRunAt = -1;
  }, [trackOverride, exerciseTitle, repsOn]);

  // Fullscreen handling: (1) bump a render counter so the drawing canvas
  // useEffect re-runs and resizes its buffer to the new wrapper dims;
  // (2) track whether *we* are in fullscreen so the native FS button can
  // re-appear inside it (single-tap escape back to the page); (3) if the
  // user taps the native FS button while we're already fullscreen via the
  // wrapper, the browser tries to transition to video-only fullscreen —
  // detect that and call exitFullscreen() instead, so a click on the
  // native button reads as 'exit fullscreen' rather than 'switch to
  // video-only fullscreen and lose the overlays'.
  useEffect(() => {
    const onFsChange = () => {
      const fsEl = document.fullscreenElement || document.webkitFullscreenElement || null;
      const wrap = wrapperRef.current;
      const video = videoRef.current;
      // We consider 'in our fullscreen' as: the FS element is the wrapper.
      // If the FS element is the bare video, the user clicked the native
      // button while we were in wrapper-FS — exit entirely.
      if (fsEl && video && fsEl === video) {
        try { document.exitFullscreen?.(); } catch {}
        try { document.webkitExitFullscreen?.(); } catch {}
        setIsFullscreen(false);
      } else {
        setIsFullscreen(!!(fsEl && wrap && fsEl === wrap));
      }
      setRenderTick(t => t + 1);
    };
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange);
      document.removeEventListener('webkitfullscreenchange', onFsChange);
    };
  }, []);

  // Drag the pose/REPS HUD. Mouse: pointerdown starts dragging right away.
  // Touch: requires ~1500ms continuous hold before the drag arms (keeps a
  // tap on the readout from accidentally moving it on phones); a small
  // pre-arm move cancels the hold so a swipe up the page still scrolls.
  // Position is clamped to the wrapper rect on every frame so the HUD can't
  // be dragged off-screen and lost.
  const onHudPointerDown = (e) => {
    e.preventDefault();
    const isTouch = e.pointerType === 'touch';
    const startX = e.clientX, startY = e.clientY;
    const baseX = hudPos.x, baseY = hudPos.y;
    let armed = !isTouch;
    let armTimer = null;
    const target = e.currentTarget;
    // Capture the HUD's intrinsic size at pointerdown — offsetWidth/offsetHeight
    // ignore any transform we apply for dragging, so they're stable as the
    // user moves the box around.
    const hudW = target.offsetWidth;
    const hudH = target.offsetHeight;
    const ANCHOR_OFFSET = 6; // top:6 / right:6 anchor in the wrapper coords
    if (!isTouch) {
      try { target.setPointerCapture(e.pointerId); } catch {}
      setHudDragArmed(true);
    } else {
      armTimer = setTimeout(() => {
        armed = true;
        try { target.setPointerCapture(e.pointerId); } catch {}
        setHudDragArmed(true);
        if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(40);
      }, 1500);
    }
    const cleanup = () => {
      if (armTimer) clearTimeout(armTimer);
      setHudDragArmed(false);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    const onMove = (ev) => {
      if (!armed) {
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) > 8) cleanup();
        return;
      }
      let nextX = baseX + (ev.clientX - startX);
      let nextY = baseY + (ev.clientY - startY);
      // Clamp to wrapper bounds. HUD is anchored at (top:6, right:6). With
      // transform:translate(dx, dy) applied:
      //   - dx range so left edge >= 0:  dx >= -(W - hudW - 6)
      //                  right edge <= W: dx <= 6
      //   - dy range so top edge >= 0:    dy >= -6
      //                bottom edge <= H:  dy <= H - hudH - 6
      const wrap = wrapperRef.current;
      if (wrap) {
        const wRect = wrap.getBoundingClientRect();
        const dxMin = -(wRect.width - hudW - ANCHOR_OFFSET);
        const dxMax = ANCHOR_OFFSET;
        const dyMin = -ANCHOR_OFFSET;
        const dyMax = wRect.height - hudH - ANCHOR_OFFSET;
        // If wrapper is narrower than HUD (paranoia), keep it pinned at 0.
        nextX = Math.max(dxMin, Math.min(dxMax, nextX));
        nextY = Math.max(dyMin, Math.min(dyMax, nextY));
      }
      setHudPos({ x: nextX, y: nextY });
    };
    const onUp = () => cleanup();
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const fullscreen = () => {
    // Fullscreen the WRAPPER (video + pose canvas + draw canvas + REPS
    // readout), not the bare <video>, so all overlays come along. iOS
    // Safari is the exception — it only supports fullscreen on <video> via
    // webkitEnterFullscreen, so on iOS we fall back to the old video-only
    // behavior (no overlays in fullscreen on that platform).
    const wrap = wrapperRef.current;
    const v = videoRef.current;
    if (wrap && wrap.requestFullscreen) { wrap.requestFullscreen(); return; }
    if (wrap && wrap.webkitRequestFullscreen) { wrap.webkitRequestFullscreen(); return; }
    if (v && v.webkitEnterFullscreen) { v.webkitEnterFullscreen(); return; }
    if (v && v.requestFullscreen) v.requestFullscreen();
  };

  // Frame-step assumes 30fps source (typical phone clip). For a 60fps clip
  // this advances 2 frames per click — close enough for form review.
  const stepFrame = (frames) => {
    const v = videoRef.current; if (!v) return;
    if (!v.paused) v.pause();
    const dt = frames / 30;
    v.currentTime = Math.max(0, Math.min((v.duration || 0) - 0.001, v.currentTime + dt));
  };

  // (No seek reset: signal buffer is indexed by frame bucket, so scrubbing
  // re-visits the same index and overwrites. Count survives scrub/step-frame.)

  // Shared lazy-loader so both POSE and REPS toggles can fetch the model.
  const ensureModel = async () => {
    if (landmarkerRef.current) return true;
    setPoseLoading(true);
    setPoseError('');
    try {
      const { PoseLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision');
      const fileset = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/wasm'
      );
      // Desktop = FULL model (more accurate landmarks/angles, esp. on hard
      // bent-over poses; PC is invisibly fast on full). Phones stay on LITE so
      // the overlay keeps up with playback. Review is post-hoc, so the coach's
      // desktop gets the accuracy.
      const isMobile = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod|Mobile|Tablet|Silk/i.test(navigator.userAgent || '');
      const variant = isMobile ? 'lite' : 'full';
      const modelUrl = `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_${variant}/float16/latest/pose_landmarker_${variant}.task`;
      const opts = (delegate) => ({
        baseOptions: { modelAssetPath: modelUrl, delegate },
        runningMode: 'VIDEO',
        numPoses: 1,
      });
      try {
        landmarkerRef.current = await PoseLandmarker.createFromOptions(fileset, opts('GPU'));
      } catch {
        landmarkerRef.current = await PoseLandmarker.createFromOptions(fileset, opts('CPU'));
      }
    } catch (e) {
      console.error('Pose load failed:', e);
      setPoseError('Model load failed');
      setPoseLoading(false);
      return false;
    }
    setPoseLoading(false);
    return true;
  };

  // POSE / REPS and COMMENTS are mutually exclusive. Pose/reps auto-pause
  // for inference and the rep counter state-machine; that conflicts with
  // comments' auto-pause at timestamps and would corrupt mid-drawing state.
  // So turning on one group disables the other.
  const togglePose = async () => {
    if (poseOn) { setPoseOn(false); return; }
    if (await ensureModel()) { setPoseOn(true); setCommentsEnabled(false); }
  };
  const toggleReps = async () => {
    if (repsOn) { setRepsOn(false); return; }
    if (await ensureModel()) { setRepsOn(true); setCommentsEnabled(false); }
  };
  const toggleComments = () => {
    setCommentsEnabled(v => {
      const next = !v;
      if (next) { setPoseOn(false); setRepsOn(false); }
      return next;
    });
  };

  // LIFT METRICS — one seek-pass over the clip → pose frames → analyzeClip, then
  // render the VBT/ROM/tempo tables inline under the player. Click again to hide.
  const runMetrics = async () => {
    if (metricsState === 'busy') return;
    if (metricsState === 'done' || metricsState === 'err') { setMetricsState('idle'); setMetrics(null); setMetricsErr(''); return; }
    setMetricsState('busy'); setMetricsPct(0); setMetrics(null); setMetricsErr('');
    try {
      const frames = await captureClipFrames(url, { crossOrigin: true, onProgress: setMetricsPct });
      const result = analyzeClip(frames, exerciseTitle);
      setMetrics({ result, frames });
      setMetricsTab('velocity');
      setMetricsState('done');
    } catch (e) {
      setMetricsErr(e?.message || 'Could not analyze this clip.'); setMetricsState('err');
    }
  };

  // ROM & TEMPO auto-enables the on-video POSE skeleton so the coach can see
  // which joint the graph is measuring (Ohad: "rom automatically needs to
  // come with pose (and then we can take pose down)"). Fires once per switch
  // INTO the rom tab (keyed on metricsTab, not on poseOn) so a coach who then
  // manually turns pose back off isn't fought — it won't re-enable itself
  // again until they leave and re-enter the rom tab.
  useEffect(() => {
    if (metricsState !== 'done') return;
    if (metricsTab === 'rom' && !poseOn) togglePose();
    // Symmetric auto-OFF on leaving ROM & TEMPO (Ohad: "when I return to
    // speed & accel, pose needs to turn off") — skeleton is a ROM & TEMPO
    // companion, not something that should keep running on other tabs.
    if (metricsTab !== 'rom' && poseOn) togglePose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metricsTab, metricsState]);

  // While the metrics panel is open, mirror the video's playback time into
  // `videoTime` (rAF = smooth) so the graph playhead tracks the clip. The graph's
  // onScrub does the reverse (seeks the video). Two-way sync.
  useEffect(() => {
    if (metricsState !== 'done') return;
    let raf;
    const tick = () => { const v = videoRef.current; if (v) setVideoTime(v.currentTime || 0); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [metricsState]);

  useEffect(() => {
    // Detection runs whenever EITHER overlay (POSE) or rep counter (REPS) is on.
    if (!poseOn && !repsOn) {
      const c = canvasRef.current;
      if (c && c.width && c.height) c.getContext('2d').clearRect(0, 0, c.width, c.height);
      setAngles({});
      return;
    }
    const v = videoRef.current;
    const c = canvasRef.current;
    const lm = landmarkerRef.current;
    if (!v || !c || !lm) return;

    let active = true;
    const ctx = c.getContext('2d');
    let lastTs = -1;
    let pendingAngles = {};
    // Process every other rVFC tick: 30fps source → 15fps overlay. Cuts
    // model invocations in half with no perceptible difference for form
    // review (human eye reads 15fps overlay as smooth on slow-mo playback,
    // and rep cycles span 15-45 ticks at 15fps = plenty of resolution).
    let frameTick = 0;
    // Throttle the React HUD update — angle numbers don't need 60Hz.
    const hudInterval = setInterval(() => {
      if (!active) return;
      setAngles(pendingAngles);
      // Always sync reps/tempo from refs — refs hold canonical state, the
      // detection loop mutates them directly.
      setReps(repsCountRef.current);
      setTempo(lastTempoRef.current);
    }, 200);

    const detect = () => {
      if (!active) return;
      // 2x frame-skip: only process even ticks, just re-arm on odd ones so
      // the rVFC loop keeps running.
      const skip = (frameTick++ % 2) !== 0;
      if (skip) {
        if (typeof v.requestVideoFrameCallback === 'function') {
          v.requestVideoFrameCallback(detect);
        } else {
          rafRef.current = requestAnimationFrame(detect);
        }
        return;
      }
      const w = v.clientWidth, h = v.clientHeight;
      if (w > 0 && h > 0 && v.readyState >= 2) {
        if (c.width !== w) c.width = w;
        if (c.height !== h) c.height = h;
        // Use performance.now() consistently so timestamps stay monotonic.
        // (Mixing performance.now with metadata.mediaTime causes MediaPipe to
        // silently reject backward timestamps and break the loop.)
        const ts = Math.max(performance.now(), lastTs + 0.001);
        if (ts > lastTs) {
          lastTs = ts;
          try {
            const result = lm.detectForVideo(v, ts);
            ctx.clearRect(0, 0, w, h);
            const lms = result.landmarks?.[0];
            // worldLandmarks are 3D metric coords (meters, hip-centered) —
            // use them for joint-angle math so camera perspective doesn't
            // distort the result. Fall back to 2D `lms` if absent.
            const wlms = result.worldLandmarks?.[0] || lms;
            // Map normalized landmark coords (0..1 of the intrinsic frame)
            // into the letterboxed pixel rect inside the <video> element.
            // Default object-fit: contain — a portrait clip in a landscape
            // element leaves black bars on the sides; drawing at a.x*w
            // would stretch the skeleton across the whole element including
            // those bars. Compute the actual displayed rect and offset into it.
            const vw = v.videoWidth || w, vh = v.videoHeight || h;
            const s = Math.min(w / vw, h / vh);
            const dw = vw * s, dh = vh * s;
            const ox = (w - dw) / 2, oy = (h - dh) / 2;
            const px = (p) => ox + p.x * dw;
            const py = (p) => oy + p.y * dh;
            if (lms) {
              // Skeleton + dots only when the overlay is enabled. Rep counting
              // still runs silently when only REPS is on.
              if (poseOn) {
                // Match ARFormOverlay's LIVE AR-coaching skeleton exactly (Ohad
                // pointed to this earlier: "I want the skeleton embedded... like
                // how it shows on live" — this file had drifted from it since:
                // no dark halo, a flat unscaled 3px line, and a dot at ALL 33
                // landmarks including face/fingers, which reads as sparse/noisy
                // "lines" rather than a clean skeleton, especially against a
                // bright/busy gym background (Ohad: "just show a skeleton, not
                // these lines"). Dark underlay first for contrast, then the
                // bright cyan stroke on top; width scales with canvas size (a
                // fixed px count vanishes when the video renders small); joint
                // dots only at the 12 tracked joints, not every landmark.
                const skW = Math.max(4, Math.round(w * 0.006));
                ctx.lineCap = 'round'; ctx.lineJoin = 'round';
                ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = skW + 3;
                for (const [i, j] of POSE_CONNECTIONS) {
                  const a = lms[i], b = lms[j];
                  if (!a || !b) continue;
                  ctx.beginPath();
                  ctx.moveTo(px(a), py(a));
                  ctx.lineTo(px(b), py(b));
                  ctx.stroke();
                }
                ctx.strokeStyle = '#39BDFF';
                ctx.lineWidth = skW;
                for (const [i, j] of POSE_CONNECTIONS) {
                  const a = lms[i], b = lms[j];
                  if (!a || !b) continue;
                  ctx.beginPath();
                  ctx.moveTo(px(a), py(a));
                  ctx.lineTo(px(b), py(b));
                  ctx.stroke();
                }
                ctx.fillStyle = '#FFFFFF';
                for (const [i, j] of POSE_CONNECTIONS) {
                  for (const idx of [i, j]) {
                    const p = lms[idx]; if (!p) continue;
                    ctx.beginPath();
                    ctx.arc(px(p), py(p), skW * 0.85, 0, 2*Math.PI);
                    ctx.fill();
                  }
                }
              }
              const next = {};
              for (const d of ANGLE_DEFS) {
                const val = angleAt(wlms, d.a, d.b, d.c);
                if (val != null) next[d.name] = Math.round(val);
              }
              pendingAngles = next;

              // Rep counter: write every frame's raw angles into dense per-
              // channel buffers at index = round(vt * BUCKET_FPS). Scrubbing
              // back re-visits the same index and overwrites. Every ~0.2s of
              // video time, median-filter each tracked channel's buffer and
              // run findPeaks; display max peak count across channels.
              // All 8 channels are stored (not just the active ones) so
              // switching the override dropdown doesn't require a replay.
              const BUCKET_FPS = 30;
              if (repsOn) {
                const st = repStateRef.current;
                const vt = v.currentTime;
                const bucket = Math.round(vt * BUCKET_FPS);
                for (const d of ANGLE_DEFS) {
                  const key = d.name;
                  if (!st.signalBufs[key]) st.signalBufs[key] = [];
                  const raw = next[key];
                  st.signalBufs[key][bucket] = raw != null ? raw : NaN;
                }
                // Read the CURRENT override selection from the ref — not the
                // closure-captured value, which would be stale if the user
                // changed the dropdown mid-playback.
                const activeCh = activeChannelsRef.current;
                if (activeCh.length === 0) {
                  repsCountRef.current = 0;
                } else {
                  // Run findPeaks every tick (no throttle — a full run is
                  // ~40k ops on a 30s clip, cheap enough to do per frame).
                  // Truncate each channel at the current playhead so the
                  // count reflects playback progress — scrubbing backward
                  // drops the count, matching user expectation.
                  const minDist = Math.max(4, Math.round(BUCKET_FPS * 0.4));
                  const curBucket = Math.round(v.currentTime * BUCKET_FPS);
                  let bestCount = 0;
                  for (const key of activeCh) {
                    const sig = st.signalBufs[key];
                    if (!sig || sig.length < 10) continue;
                    const truncated = sig.slice(0, Math.max(0, curBucket + 1));
                    if (truncated.length < 10) continue;
                    const smoothed = medianFilter(truncated, SMOOTH_N);
                    // Count troughs: invert signal, findPeaks = find flexion bottoms.
                    const inverted = smoothed.map(x => Number.isFinite(x) ? -x : x);
                    // Prominence adapts to THIS channel's own observed swing
                    // instead of a flat 25° for every exercise (Ohad: "reps
                    // counter... still misses a lot"). A fixed 25° silently
                    // dropped legitimate reps on exercises with a naturally
                    // smaller working range (e.g. lateral raises, calf
                    // raises) — their whole swing never cleared the bar. 25%
                    // of the channel's own real min-max range, floored at 10°
                    // so pure landmark jitter on a still/near-isometric clip
                    // still can't fake a rep.
                    const reals = smoothed.filter(Number.isFinite);
                    const swing = reals.length ? Math.max(...reals) - Math.min(...reals) : 0;
                    const prominence = Math.max(10, swing * 0.25);
                    const troughs = findPeaks(inverted, prominence, minDist);
                    if (troughs.length > bestCount) bestCount = troughs.length;
                  }
                  repsCountRef.current = bestCount;
                  lastTempoRef.current = bestCount > 1 ? vt / bestCount : null;
                }
              }
            }
          } catch { /* swallow per-frame detect errors */ }
        }
      }
      // Re-arm: rVFC fires once per actual decoded frame (idle when paused),
      // so we don't waste detection cycles on duplicate frames.
      if (typeof v.requestVideoFrameCallback === 'function') {
        v.requestVideoFrameCallback(detect);
      } else {
        rafRef.current = requestAnimationFrame(detect);
      }
    };

    // Kick off the loop and run an immediate detection so the overlay shows
    // even when the video is currently paused on a frame.
    if (typeof v.requestVideoFrameCallback === 'function') {
      v.requestVideoFrameCallback(detect);
    } else {
      rafRef.current = requestAnimationFrame(detect);
    }
    detect();

    // Re-detect on scrub / load so a paused video updates its overlay.
    v.addEventListener('seeked', detect);
    v.addEventListener('loadeddata', detect);

    // Pressing Play restarts the rep count from 0. Each play → pause cycle is
    // a fresh counting session. Clears only the rep-counter buffers, not the
    // pose-overlay cache. Deliberately no reset on `seeked` or `pause` — only
    // the Play button resets.
    const onPlay = () => {
      if (!repsOn) return;
      repStateRef.current.signalBufs = {};
      repsCountRef.current = 0;
      lastTempoRef.current = null;
      setReps(0);
      setTempo(null);
    };
    v.addEventListener('play', onPlay);

    return () => {
      active = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (hudInterval) clearInterval(hudInterval);
      v.removeEventListener('seeked', detect);
      v.removeEventListener('loadeddata', detect);
      v.removeEventListener('play', onPlay);
    };
  }, [poseOn, repsOn]);

  useEffect(() => () => {
    if (landmarkerRef.current) {
      try { landmarkerRef.current.close(); } catch {}
      landmarkerRef.current = null;
    }
  }, []);

  const speeds = [0.125, 0.25, 0.5, 1, 2];
  // Side-by-side ONLY for portrait clips with metrics open AND the row is
  // actually wide enough (measured — see rowWide above). A landscape clip
  // already fills the row's width, so there's no spare horizontal space to
  // put a column beside it; it keeps the original full-width stacked layout.
  const sideBySide = !!(vidAspect?.portrait && metricsState !== 'idle' && rowWide);
  // Extracted so it can render in TWO different slots below: beside the video
  // (portrait clips — see the flex row wrapping the video block) or in its
  // original full-width spot underneath (landscape clips). Ohad: portrait
  // clips at maxHeight:70vh filled the whole viewport by themselves, leaving
  // no room to see the graph without scrolling — even after moving the graph
  // up. The real fix is horizontal: there's plenty of unused width beside a
  // narrow portrait video on a normal screen, so put the metrics panel there
  // instead of fighting it for vertical space.
  // marginTop is 0 when side-by-side — Ohad (OCD alignment): the panel's top
  // edge must line up exactly with the video's top edge, which has no margin.
  const metricsPanelJsx = (
    <>
      {metricsState === 'busy' && (
        <div style={{marginTop:sideBySide?0:8,padding:'12px 14px',background:C.sf2,border:`1px solid ${C.cardBd}`,borderRadius:0,fontFamily:FN,fontSize:11,color:C.tm,letterSpacing:'0.06em'}}>
          READING THE MOVEMENT… {metricsPct}%
          <div style={{height:3,background:'rgba(255,255,255,0.12)',marginTop:8}}><div style={{width:`${metricsPct}%`,height:'100%',background:C.ac,transition:'width 120ms'}}/></div>
        </div>
      )}
      {metricsState === 'err' && (
        <div style={{marginTop:sideBySide?0:8,padding:'12px 14px',background:C.sf2,border:`1px solid ${C.rd}`,borderRadius:0,fontFamily:FN,fontSize:11,color:C.rd}}>{metricsErr}</div>
      )}
      {metricsState === 'done' && metrics && (
        <div data-theme="dark" style={{marginTop:sideBySide?0:8,background:'#0a0a0b',border:`1px solid ${C.cardBd}`,borderRadius:0}}>
          {/* Dedicated title row — CLOSE used to float absolute over the content
              and sat directly on top of AnalyzeResult's own tab row (both
              anchored top-right), silently blocking the ROM & TEMPO tab's click
              area. A proper header row keeps it clear of the tabs entirely. */}
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'7px 10px',borderBottom:`1px solid ${C.cardBd}`}}>
            <span style={{fontFamily:FN,fontSize:9,fontWeight:700,letterSpacing:'0.16em',color:C.tm}}>LIFT METRICS</span>
            <button onClick={() => { setMetricsState('idle'); setMetrics(null); }} title="Hide metrics"
              style={{background:'transparent',border:`1px solid ${C.bd}`,color:C.tm,fontFamily:FN,fontSize:10,cursor:'pointer',padding:'2px 7px'}}>× CLOSE</button>
          </div>
          <div style={{padding:'10px 10px 4px'}}>
            <Suspense fallback={<div style={{color:C.tm,fontFamily:FN,fontSize:11,padding:12}}>Loading…</div>}>
              <AnalyzeResult result={metrics.result} frames={metrics.frames} exerciseTitle={exerciseTitle || 'Squat'} tab={metricsTab} setTab={setMetricsTab} view="metrics"
                playheadT={videoTime * 1000}
                onScrub={(tMs) => { const v = videoRef.current; if (v) { const t = Math.max(0, tMs / 1000); v.currentTime = t; setVideoTime(t); } }} />
            </Suspense>
          </div>
        </div>
      )}
    </>
  );
  return (
    <div>
    <div ref={rowRef} style={{display:'flex',gap:sideBySide?12:0,alignItems:'flex-start'}}>
      <div style={sideBySide ? {flex:'0 1 380px',minWidth:260,marginTop:0} : {flex:'1 1 100%',minWidth:0}}>
      {/* :fullscreen rules let pose / drawing / REPS overlays scale with the
          video when the wrapper is fullscreened. The video letterboxes via
          object-fit:contain; the pose-canvas drawing math already accounts
          for the letterbox bars (see the (ox, oy, dw, dh) math in detect),
          and the drawing canvas uses canvas-relative normalized coords so
          strokes draw consistently. */}
      <style>{`
        .fv-wrap:fullscreen, .fv-wrap:-webkit-full-screen {
          background:#000 !important; margin:0 !important; padding:0 !important;
          max-height:none !important; width:100vw !important; height:100vh !important;
          display:block !important; position:relative !important;
        }
        .fv-wrap:fullscreen video, .fv-wrap:-webkit-full-screen video {
          width:100% !important; height:100% !important;
          max-width:100% !important; max-height:100% !important;
          border-radius:0 !important; object-fit:contain !important; background:#000 !important;
        }
        .fv-wrap:fullscreen canvas, .fv-wrap:-webkit-full-screen canvas {
          position:absolute !important; top:0 !important; left:0 !important;
          width:100% !important; height:100% !important; z-index:5 !important;
        }
      `}</style>
      <div ref={wrapperRef} className="fv-wrap" style={{position:'relative',marginBottom:6,lineHeight:0,
          ...(vidAspect?.portrait ? {maxWidth:380,margin:'0 auto 6px'} : null)}}>
        <video ref={videoRef} src={url} controls
          controlsList={isFullscreen ? '' : 'nofullscreen'}
          playsInline crossOrigin="anonymous"
          onError={handleVideoError}
          style={vidAspect?.portrait
            ? {display:'block',width:'100%',aspectRatio:String(vidAspect.ratio),maxHeight:'70vh',borderRadius:0,background:C.sf2}
            : {display:'block',width:'100%',borderRadius:0,maxHeight:400,background:C.sf2}} />
        {videoLoadError && safeUrl(url) && (
          <a href={safeUrl(url)} target="_blank" rel="noopener noreferrer"
            style={{position:'absolute',bottom:8,right:8,zIndex:6,
              background:'rgba(10,10,11,0.85)',border:`1px solid ${C.ac}`,color:C.ac,
              fontFamily:FN,fontSize:10,padding:'4px 8px',borderRadius:0,
              textDecoration:'none',letterSpacing:0.5}}>
            OPEN IN NEW TAB ↗
          </a>
        )}
        <canvas ref={canvasRef}
          style={{position:'absolute',top:0,left:0,width:'100%',height:'100%',
            pointerEvents:'none',display:poseOn?'block':'none'}} />
        {/* Drawing overlay: visible only while the video is PAUSED, comments
            are enabled, and we're in a drawing context (composing OR paused-
            at-a-comment). The videoPaused gate is the important bit — if the
            user resumes playback mid-compose, strokes vanish so they don't
            obscure subsequent frames. Pointer events only flow to the canvas
            when a draw color is active, so when inactive the video native
            controls are still reachable. */}
        {commentsEnabled && videoPaused && (composing || pausedAtCommentId) && (
          <canvas ref={drawCanvasRef}
            onPointerDown={onCanvasPointerDown}
            onPointerMove={onCanvasPointerMove}
            onPointerUp={onCanvasPointerUp}
            onPointerCancel={onCanvasPointerUp}
            style={{position:'absolute',top:0,left:0,width:'100%',height:'100%',
              pointerEvents: (activeDrawColor && canDraw) ? 'auto' : 'none',
              cursor: (activeDrawColor && canDraw) ? 'crosshair' : 'default',
              touchAction: 'none'}} />
        )}
        {/* SKELETON (poseOn) draws ONLY the on-video overlay (the <canvas> above)
            — Ohad: "when I click on skeleton I wanna see the skeleton, not the
            'pose'". The numeric joint-angle HUD used to also appear under
            SKELETON; that's removed so the two are properly decoupled. REPS
            keeps its own count readout here, unaffected. */}
        {repsOn && (
          <div onPointerDown={onHudPointerDown}
            title="Long-press (mobile) or click and drag (desktop) to move"
            style={{position:'absolute',top:6,right:6,
              transform:`translate(${hudPos.x}px, ${hudPos.y}px)`,
              background:'rgba(10,10,11,0.78)',
              borderRadius:0,padding:'6px 8px',
              border:`1px solid ${hudDragArmed?C.ac:'transparent'}`,
              fontFamily:FN,fontSize:10,color:'#fff',lineHeight:1.5,
              fontVariantNumeric:'tabular-nums',
              cursor:hudDragArmed?'grabbing':'grab',
              touchAction:'none',userSelect:'none'}}>
            <div style={{textAlign:'center'}}>
              <div style={{fontSize:9,color:C.td,letterSpacing:0.5}}>REPS</div>
              <div style={{fontSize:18,fontWeight:700,color:C.gn,lineHeight:1}}>{reps}</div>
              {tempo != null && <div style={{fontSize:9,color:C.tm,marginTop:2}}>{tempo.toFixed(1)}s</div>}
            </div>
          </div>
        )}
      </div>
      {/* Mini-timeline with comment tick marks. Hidden when comments are
          disabled. Click a tick to seek. */}
      {commentsEnabled && notes.length > 0 && videoRef.current?.duration > 0 && (
        <div style={{position:'relative',height:14,background:C.sf2,borderRadius:0,marginBottom:8,overflow:'hidden'}}>
          {notes.map(n => {
            if (n.ts == null || !videoRef.current?.duration) return null;
            const pct = Math.min(100, Math.max(0, (n.ts / videoRef.current.duration) * 100));
            const isActive = pausedAtCommentId === n.id;
            return (
              <div key={n.id} onClick={() => seekTo(n.ts, n.id)}
                title={`${fmtTs(n.ts)} — ${(n.text || '').slice(0, 80)}`}
                style={{position:'absolute',left:pct+'%',top:0,bottom:0,width:isActive?5:3,background:n.author==='trainer'?C.ac:C.gn,cursor:'pointer',borderRadius:0,transform:'translateX(-1px)',boxShadow:isActive?`0 0 6px ${n.author==='trainer'?C.ac:C.gn}`:'none'}}/>
            );
          })}
        </div>
      )}
      {/* Top row: pose+reps (left) / comments (center) / FULL (right).
          Three flex groups (1fr / auto / 1fr) so the COMMENTS toggle sits
          at the true geometric centre of the row regardless of how wide
          the pose/reps group on the left or the FULL group on the right
          grow. */}
      <div style={{display:'flex',gap:4,alignItems:'center',marginBottom:4}}>
        <div style={{flex:1,display:'flex',gap:4,alignItems:'flex-start',flexWrap:'wrap',justifyContent:'flex-start'}}>
          {/* alignItems:flex-start (was center) — REPS' joint-picker dropdown
              hangs BELOW the REPS button now (see below), so the row's other
              single-height buttons must align to the TOP, not the vertical
              centre of that taller column.
              No fixed minWidth on any of these three anymore (was 78/78/96)
              — sized to content instead so SKELETON/REPS/METRICS reliably
              fit on one row even in the narrow side-by-side video column
              (Ohad: "skeleton reps and metrics should be in one row, not
              column"). */}
          {/* Was "POSE" — renamed SKELETON (Ohad), same standalone toggle
              button as before. ROM & TEMPO auto-enables it (see the effect
              above keyed on metricsTab==='rom'); this button still works
              independently to turn it on/off anytime. No active-state
              highlight (border/fill) anymore — Ohad: "no highlight since
              it's not related" — always plain, only the label text still
              says ON/OFF. */}
          <button onClick={togglePose} disabled={poseLoading}
            style={{padding:'3px 8px',borderRadius:0,border:'2px solid transparent',display:'inline-flex',alignItems:'center',justifyContent:'center',boxSizing:'border-box',whiteSpace:'nowrap',
              background:'transparent',color:C.tm,
              fontFamily:FN,fontSize:10,cursor:poseLoading?'wait':'pointer',opacity:poseLoading?0.6:1}}>
            {poseLoading ? 'LOADING…' : poseOn ? 'SKELETON ON' : 'SKELETON'}
          </button>
          {/* REPS + its joint-picker live in their own small column, not
              inline siblings of SKELETON/LIFT METRICS — the dropdown only
              appears when REPS is on, and having it inline pushed LIFT
              METRICS onto a wrapped second line (Ohad: "keep lift metrics in
              this spot... add the joint button right beneath the reps
              button"). Stacking it under REPS instead means the dropdown's
              extra height only grows this one column, never disturbing where
              SKELETON/LIFT METRICS/COMMENT sit in the row. */}
          <div style={{display:'flex',flexDirection:'column',gap:2}}>
            <button onClick={toggleReps} disabled={poseLoading}
              title={activeKind === 'none' ? 'Isometric — counter off' : `Tracking ${activeKind} for rep cycles (${activeChannels.join(' + ')})`}
              style={{padding:'3px 8px',borderRadius:0,border:`2px solid ${repsOn?C.gn:'transparent'}`,display:'inline-flex',alignItems:'center',justifyContent:'center',boxSizing:'border-box',whiteSpace:'nowrap',
                background:repsOn?C.gnD:'transparent',color:repsOn?C.gn:C.tm,
                fontFamily:FN,fontSize:10,cursor:poseLoading?'wait':'pointer',opacity:poseLoading?0.6:1}}>
              {repsOn ? `REPS ${reps}` : 'REPS'}
            </button>
            {repsOn && (
              <select value={trackOverride} onChange={e => setTrackOverride(e.target.value)}
                title="Which joint pair to count peaks on"
                style={{height:22,boxSizing:'border-box',padding:'0 6px',borderRadius:0,border:`1px solid ${C.bd}`,
                  background:'transparent',color:C.tm,fontFamily:FN,fontSize:10,cursor:'pointer'}}>
                <option value="auto">AUTO ({(autoPick.kind || 'none').toUpperCase()})</option>
                <option value="hip">HIP</option>
                <option value="knee">KNEE</option>
                <option value="elbow">ELBOW</option>
                <option value="sho">SHOULDER</option>
                <option value="none">SKIP</option>
              </select>
            )}
          </div>
          {/* LIFT METRICS (coach only) — analyses THIS clip in place and shows
              VBT / ROM / tempo inline under the video. SKELETON (above) is the
              on-video skeleton. No 3D box, no fullscreen. */}
          {role === 'trainer' && (
            <button onClick={runMetrics} disabled={metricsState==='busy'}
              title="Bar velocity (VBT), ROM, tempo & collapse flags from this clip"
              style={{padding:'3px 8px',borderRadius:0,border:`2px solid ${metricsState==='done'?C.pu:'transparent'}`,display:'inline-flex',alignItems:'center',justifyContent:'center',boxSizing:'border-box',whiteSpace:'nowrap',
                background:metricsState==='done'?(C.puD||C.acD):'transparent',color:metricsState==='done'?(C.pu||C.ac):C.tm,
                fontFamily:FN,fontSize:10,cursor:metricsState==='busy'?'wait':'pointer',opacity:metricsState==='busy'?0.6:1}}>
              {metricsState==='busy' ? `${metricsPct}%` : metricsState==='done' ? 'METRICS ✓' : 'METRICS'}
            </button>
          )}
          {poseError && <span style={{fontSize:9,color:C.rd,marginLeft:4}}>{poseError}</span>}
        </div>
        <div style={{flex:'0 0 auto',display:'flex',gap:4,alignItems:'center',flexWrap:'wrap',justifyContent:'center'}}>
          {/* Auto-pause-at-comment toggle. Trainee-only: the trainer always
              wants comments visible (drawing is part of commenting on the
              coach side), so hiding the toggle removes a useless control. */}
          {notes.length > 0 && role !== 'trainer' && (
            <button onClick={toggleComments}
              title={commentsEnabled ? 'Auto-pause at comments ON — click to disable' : 'Comments hidden — click to enable auto-pause'}
              style={{padding:'3px 10px',borderRadius:0,border:`2px solid ${commentsEnabled?C.ac:'transparent'}`,minWidth:116,display:'inline-flex',alignItems:'center',justifyContent:'center',boxSizing:'border-box',
                background:commentsEnabled?C.acD:'transparent',color:commentsEnabled?C.ac:C.tm,fontFamily:FN,fontSize:10,cursor:'pointer'}}>
              {commentsEnabled ? 'COMMENTS ON' : 'COMMENTS OFF'}
            </button>
          )}
          {onReviewNotesChange && role === 'trainer' && (
            <button onClick={addComment} title="Comment & draw at this timestamp — color swatches appear once a comment is open"
              style={{padding:'3px 10px',height:22,boxSizing:'border-box',borderRadius:0,border:`1px solid rgba(57,189,255,0.251)`,
                background:C.acD,color:C.ac,fontFamily:FN,fontSize:10,cursor:'pointer'}}>COMMENT</button>
          )}
        </div>
        <div style={{flex:1,display:'flex',gap:4,alignItems:'center',justifyContent:'flex-end'}}>
          <button onClick={fullscreen}
            style={{padding:'3px 10px',height:22,boxSizing:'border-box',borderRadius:0,border:`1px solid ${C.bd}`,
              background:'transparent',color:C.tm,fontFamily:FN,fontSize:10,cursor:'pointer'}}>⛶ FULL</button>
        </div>
      </div>
      {/* Bottom row: speeds → frame-step → LOOP, all centered as one
          horizontal group (justifyContent:'center'). Order per Ohad:
          0.125x .. 2x, ◀ ▶, then ↻ LOOP. */}
      <div style={{display:'flex',gap:4,alignItems:'center',justifyContent:'center',flexWrap:'wrap'}}>
        {speeds.map(s => (
          <button key={s} onClick={() => setSpeed(s)} title={`Playback speed ${s}x`}
            style={{padding:'3px 6px',borderRadius:0,border:`2px solid ${speed===s?C.ac:'transparent'}`,boxSizing:'border-box',
              background:speed===s?C.acD:'transparent',color:speed===s?C.ac:C.tm,
              fontFamily:FN,fontSize:10,cursor:'pointer'}}>{s}x</button>
        ))}
        <button onClick={() => stepFrame(-1)} title="Previous frame"
          style={{padding:'3px 6px',height:22,boxSizing:'border-box',borderRadius:0,border:`1px solid ${C.bd}`,
            background:'transparent',color:C.tm,fontFamily:FN,fontSize:10,cursor:'pointer'}}>◀</button>
        <button onClick={() => stepFrame(1)} title="Next frame"
          style={{padding:'3px 6px',height:22,boxSizing:'border-box',borderRadius:0,border:`1px solid ${C.bd}`,
            background:'transparent',color:C.tm,fontFamily:FN,fontSize:10,cursor:'pointer'}}>▶</button>
        <button onClick={() => setLoop(v => !v)} title="Loop the video"
          style={{padding:'3px 10px',height:22,boxSizing:'border-box',borderRadius:0,border:`1px solid ${loop?C.ac:C.bd}`,
            background:loop?C.acD:'transparent',color:loop?C.ac:C.tm,fontFamily:FN,fontSize:10,cursor:'pointer'}}>↻ LOOP</button>
      </div>
      </div>
      {/* Metrics panel sits BESIDE the video (this column) only for portrait
          clips — see sideBySide above. */}
      {sideBySide && <div style={{flex:'1 1 380px',minWidth:320}}>{metricsPanelJsx}</div>}
    </div>
    {/* Landscape clips (or metrics closed): original full-width position below the video. */}
    {!sideBySide && metricsPanelJsx}
      {/* Drawing toolbar — only visible when the trainer is in a drawing
          context (composing a new comment, or paused at an existing one
          they can edit). Color swatches toggle draw mode; active color
          shown ringed. Ruler toggles straight-line drawing. Undo /
          Clear manage the current comment's stroke list. */}
      {canDraw && commentsEnabled && (
        <div style={{display:'flex',gap:6,alignItems:'center',marginTop:6,flexWrap:'wrap'}}>
          <span style={{fontSize:9,fontFamily:FN,color:C.td,letterSpacing:0.5,marginRight:2}}>DRAW</span>
          {DRAW_COLORS.map(c => {
            const active = activeDrawColor === c.hex;
            return (
              <button key={c.key} onClick={() => setActiveDrawColor(active ? null : c.hex)}
                title={c.key + (active ? ' (click to disable drawing)' : ' (click to draw)')}
                style={{width:20,height:20,borderRadius:'50%',background:c.hex,
                  border: active ? `2px solid ${C.ac}` : `1px solid ${C.bd}`,
                  boxShadow: active ? `0 0 0 2px rgba(57,189,255,0.376)` : 'none',
                  cursor:'pointer',padding:0}} />
            );
          })}
          <button onClick={() => setRulerMode(v => !v)} title={rulerMode ? 'Straight-line mode ON' : 'Freehand mode — click for straight-line'}
            style={{padding:'3px 8px',height:22,boxSizing:'border-box',borderRadius:0,border:`1px solid ${rulerMode?C.ac:C.bd}`,
              background:rulerMode?C.acD:'transparent',color:rulerMode?C.ac:C.tm,fontFamily:FN,fontSize:10,cursor:'pointer'}}>
            📏 {rulerMode ? 'LINE' : 'FREE'}
          </button>
          <button onClick={undoLastStroke} disabled={currentStrokes.length === 0} title="Undo last stroke"
            style={{padding:'3px 8px',height:22,boxSizing:'border-box',borderRadius:0,border:`1px solid ${C.bd}`,
              background:'transparent',color:currentStrokes.length?C.tm:C.td,fontFamily:FN,fontSize:10,cursor:currentStrokes.length?'pointer':'default',opacity:currentStrokes.length?1:0.5}}>↶ UNDO</button>
          <button onClick={clearDrawings} disabled={currentStrokes.length === 0} title="Clear all drawings on this comment"
            style={{padding:'3px 8px',height:22,boxSizing:'border-box',borderRadius:0,border:`1px solid ${C.bd}`,
              background:'transparent',color:currentStrokes.length?C.tm:C.td,fontFamily:FN,fontSize:10,cursor:currentStrokes.length?'pointer':'default',opacity:currentStrokes.length?1:0.5}}>✕ CLEAR</button>
        </div>
      )}
      {/* Compose input (new comment or reply). Appears inline when composing is active. */}
      {composing && (
        <div style={{background:C.sf2,border:`1px solid rgba(57,189,255,0.376)`,borderRadius:0,padding:10,marginTop:8}}>
          <div style={{fontSize:10,fontFamily:FN,color:C.ac,fontWeight:700,marginBottom:6,textAlign:'center'}}>
            {composing.editId
              ? (composing.isReply ? 'EDITING REPLY' : `EDITING COMMENT AT ${fmtTs(composing.ts)}`)
              : (composing.replyToId ? '↳ REPLYING' : `COMMENT AT ${fmtTs(composing.ts)}`)}
          </div>
          <textarea value={composeText} autoFocus dir="auto"
            onChange={e => setComposeText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submitCompose(); } }}
            placeholder={composing.replyToId ? 'Type your reply…' : 'What should the athlete focus on at this moment?'}
            style={{width:'100%',minHeight:60,background:C.sf,border:`1px solid ${C.bd}`,borderRadius:0,padding:8,color:C.tx,fontFamily:FB,fontSize:13,boxSizing:'border-box',resize:'vertical',textAlign:'center'}}/>
          <div style={{display:'flex',gap:6,justifyContent:'flex-end',marginTop:6}}>
            <button onClick={cancelCompose} style={{padding:'4px 10px',borderRadius:0,border:`1px solid ${C.bd}`,background:'transparent',color:C.tm,fontFamily:FN,fontSize:11,cursor:'pointer'}}>Cancel</button>
            <button onClick={submitCompose} disabled={!composeText.trim()} style={{padding:'4px 10px',borderRadius:0,border:'none',background:composeText.trim()?C.ac:C.sf3,color:composeText.trim()?'#fff':C.td,fontFamily:FB,fontSize:11,fontWeight:700,cursor:composeText.trim()?'pointer':'default'}}>Save</button>
          </div>
        </div>
      )}
      {/* Threaded comment list — visibility depends on playback state and
          the comments toggle. Three modes:
           1. commentsEnabled && pausedAtCommentId  → show ONLY that comment,
              highlighted (the video just auto-paused at its timestamp).
           2. commentsEnabled && videoPaused && !pausedAtCommentId → show
              the full list (initial load, manual pause, end without loop).
              `videoEnded && !loop` is a subset of this case since ended →
              paused natively.
           3. Playing (or looping), or comments disabled → list hidden. Only
              the mini-timeline ticks + compose UI remain available. */}
      {commentsEnabled && notes.length > 0 && (pausedAtCommentId || videoPaused) && (() => {
        const visible = pausedAtCommentId
          ? notes.filter(n => n.id === pausedAtCommentId)
          : notes.slice().sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0));
        return (
          <div style={{marginTop:10,display:'flex',flexDirection:'column',gap:8}}>
            {visible.map(n => (
              <div key={n.id} className="motion-rise" style={{background:pausedAtCommentId===n.id?(n.author==='trainer'?C.acD:C.gnD):C.sf2,borderLeft:`3px solid ${n.author==='trainer'?C.ac:C.gn}`,borderRadius:0,padding:pausedAtCommentId===n.id?14:10,boxShadow:pausedAtCommentId===n.id?`0 0 0 2px ${n.author==='trainer'?C.ac:C.gn}40`:'none',transition:'padding .15s ease, box-shadow .15s ease'}}>
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
                  <button onClick={() => seekTo(n.ts, n.id)} style={{background:C.acD,border:`1px solid rgba(57,189,255,0.251)`,color:C.ac,fontFamily:FN,fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:0,cursor:'pointer'}}>▶ {fmtTs(n.ts)}</button>
                  <span style={{fontSize:10,fontFamily:FN,color:n.author==='trainer'?C.ac:C.gn,fontWeight:700,letterSpacing:0.5}}>{n.author === 'trainer' ? 'COACH' : 'ATHLETE'}</span>
                  <span style={{fontSize:10,color:C.td,marginLeft:'auto'}}>{n.createdAt ? fmtPrettyDate(n.createdAt) : ''}</span>
                  {(n.author === role) && onReviewNotesChange && (
                    <button onClick={() => startEdit(n, false, null)} title="Edit" style={{background:'transparent',border:'none',color:C.td,cursor:'pointer',fontSize:11,padding:0,marginLeft:4}}>✏️</button>
                  )}
                  {(n.author === role) && (
                    <button onClick={() => deleteNote(n.id)} title="Delete" style={{background:'transparent',border:'none',color:C.td,cursor:'pointer',fontSize:12,padding:0,marginLeft:4}}>✕</button>
                  )}
                </div>
                <div style={{fontSize:pausedAtCommentId===n.id?14:13,color:C.tx,whiteSpace:'pre-wrap',textAlign:'center'}}>{n.text}</div>
                {(n.replies || []).length > 0 && (
                  <div style={{marginTop:8,marginLeft:12,display:'flex',flexDirection:'column',gap:6,borderLeft:`2px solid ${C.bd}`,paddingLeft:10}}>
                    {n.replies.map(r => (
                      <div key={r.id}>
                        <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:2}}>
                          <span style={{fontSize:10,fontFamily:FN,color:r.author==='trainer'?C.ac:C.gn,fontWeight:700,letterSpacing:0.5}}>{r.author === 'trainer' ? 'COACH' : 'ATHLETE'}</span>
                          <span style={{fontSize:10,color:C.td}}>{r.createdAt ? fmtPrettyDate(r.createdAt) : ''}</span>
                          {(r.author === role) && onReviewNotesChange && (
                            <button onClick={() => startEdit(r, true, n.id)} title="Edit" style={{background:'transparent',border:'none',color:C.td,cursor:'pointer',fontSize:10,padding:0,marginLeft:'auto'}}>✏️</button>
                          )}
                          {(r.author === role) && (
                            <button onClick={() => deleteNote(r.id)} title="Delete" style={{background:'transparent',border:'none',color:C.td,cursor:'pointer',fontSize:11,padding:0,marginLeft:r.author===role&&onReviewNotesChange?4:'auto'}}>✕</button>
                          )}
                        </div>
                        <div style={{fontSize:12,color:C.tx,whiteSpace:'pre-wrap',textAlign:'center'}}>{r.text}</div>
                      </div>
                    ))}
                  </div>
                )}
                {onReviewNotesChange && (
                  <button onClick={() => addReply(n.id)}
                    style={{marginTop:8,background:'transparent',border:'none',color:C.ac,fontFamily:FN,fontSize:10,fontWeight:700,padding:0,cursor:'pointer'}}>↳ Reply</button>
                )}
              </div>
            ))}
          </div>
        );
      })()}
    </div>
  );
}

// Side-by-side video compare. Two FormVideoPlayer instances + a sync button
// that copies the left player's currentTime onto the right (cheap manual sync,
// good enough for "this week vs 4 weeks ago" form review).
function CompareModal({ leftLabel, leftUrl, leftTitle, rightLabel, rightUrl, rightTitle, onClose, closing }) {
  const [leftVid, setLeftVid] = useState(null);
  const [rightVid, setRightVid] = useState(null);
  useEscClose(true, onClose); // Escape closes the compare modal
  const sync = (target) => {
    if (!leftVid || !rightVid) return;
    if (target === 'right') rightVid.currentTime = leftVid.currentTime;
    else leftVid.currentTime = rightVid.currentTime;
  };
  const playBoth = () => { leftVid?.play(); rightVid?.play(); };
  const pauseBoth = () => { leftVid?.pause(); rightVid?.pause(); };
  return createPortal((
    <div onClick={onClose} role="dialog" aria-modal="true" aria-label="Compare videos" className={closing ? 'motion-fade-out' : 'motion-fade-in'} style={{position:'fixed',inset:0,zIndex:1200,background:C.scrim,display:'flex',alignItems:'flex-start',justifyContent:'center',paddingTop:32,overflow:'auto'}}>
      <div onClick={e => e.stopPropagation()} className={closing ? 'motion-fall' : 'motion-rise'} style={{background:C.bg,border:`1px solid ${C.cardBd}`,borderRadius:0,width:'min(1400px, 96vw)',padding:20}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
          <h3 style={{margin:0,fontFamily:FN,fontSize:16,color:C.tx}}>Compare</h3>
          <div style={{display:'flex',gap:6,alignItems:'center'}}>
            <button onClick={playBoth} style={{background:C.acD,border:`1px solid ${C.ac}`,color:C.ac,fontFamily:FN,fontSize:11,padding:'6px 12px',borderRadius:0,cursor:'pointer'}}>▶ PLAY BOTH</button>
            <button onClick={pauseBoth} style={{background:'var(--c-sf)',border:`1px solid ${C.cardBd}`,color:C.tm,fontFamily:FN,fontSize:11,padding:'6px 12px',borderRadius:0,cursor:'pointer'}}>❚❚ PAUSE</button>
            <button onClick={onClose} style={{background:'none',border:'none',color:C.tm,cursor:'pointer',fontSize:18,padding:'0 8px'}}>✕</button>
          </div>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr auto 1fr',gap:12,alignItems:'start'}}>
          <div>
            <div style={{fontSize:11,fontFamily:FN,color:C.tm,marginBottom:6}}>{leftLabel}</div>
            <FormVideoPlayer url={leftUrl} exerciseTitle={leftTitle} onVideoRef={setLeftVid} />
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:6,paddingTop:24}}>
            <button onClick={() => sync('right')} title="Copy left timestamp to right"
              style={{background:'var(--c-sf)',border:`1px solid ${C.cardBd}`,color:C.tm,fontFamily:FN,fontSize:10,padding:'6px 8px',borderRadius:0,cursor:'pointer',whiteSpace:'nowrap'}}>SYNC →</button>
            <button onClick={() => sync('left')} title="Copy right timestamp to left"
              style={{background:'var(--c-sf)',border:`1px solid ${C.cardBd}`,color:C.tm,fontFamily:FN,fontSize:10,padding:'6px 8px',borderRadius:0,cursor:'pointer',whiteSpace:'nowrap'}}>← SYNC</button>
          </div>
          <div>
            <div style={{fontSize:11,fontFamily:FN,color:C.tm,marginBottom:6}}>{rightLabel}</div>
            <FormVideoPlayer url={rightUrl} exerciseTitle={rightTitle} onVideoRef={setRightVid} />
          </div>
        </div>
      </div>
    </div>
  ), document.body);
}

export default function WorkoutReview({ clientWorkouts, weeklyFocus, setWeeklyFocus, planIndex, trainees, exercises, markReviewed, updateFormVideos, deleteWorkout, onOpenTrainee }) {
  // "Log In-Person Session" used to live as a subtab here. It moved out
  // 2026-05-28 — the in-person logging surface is now reachable directly
  // via `▶ LOG SESSION` on each TraineeDetail and at /coach/workouts.
  // Review is purely about reviewing what athletes uploaded.
  const [selectedWo, setSelectedWo] = useState(null);
  const [expandedEx, setExpandedEx] = useState(null);
  // Library lookup Map — 1,467 exercises; a .find() per card per render
  // (and this view re-renders per focus-textarea keystroke) is the known
  // perf antipattern.
  const exById = useMemo(() => new Map((exercises || []).map(e => [e.id, e])), [exercises]);
  // The review page is a QUEUE: by default show only athletes (and cards) that
  // still need reviewing. "Show reviewed" reveals the finished ones for
  // reference. (Ohad: no reason to see already-reviewed athletes/cards here.)
  const [showReviewed, setShowReviewed] = useState(false);
  // Dashboard task → review handoff. The TASKS widget stashes the workout
  // id in sessionStorage before routing here so the review tab opens
  // directly on the requested workout instead of the queue list.
  useEffect(() => {
    let consumed = null;
    try {
      consumed = sessionStorage.getItem('expo-pendingReviewWorkout');
      if (consumed) sessionStorage.removeItem('expo-pendingReviewWorkout');
    } catch {}
    if (!consumed) return;
    if ((clientWorkouts || []).some(w => w.id === consumed)) {
      setSelectedWo(consumed);
    } else {
      // Workout was deleted between the dashboard click and this mount, or
      // the task was orphaned. Toast so the coach isn't left wondering
      // why the page didn't open the expected session.
      try {
        import('./ui').then(({ toast }) => {
          toast('That workout is no longer in the review queue.', 'warn', { ttl: 6000 });
        });
      } catch {}
    }
    // Run once on mount; new handoffs require a fresh navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Delete-confirm modal state. The workout id under threat + the user's typed
  // verification (the word "delete", case-insensitive) before the destructive
  // call is enabled.
  const [deleteConfirmFor, setDeleteConfirmFor] = useState(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  // Compare flow: when set, shows picker modal for selecting the second video.
  // After pick, switches to CompareModal with both URLs.
  const [comparePicker, setComparePicker] = useState(null); // { left: {url,label}, candidates: [...] }
  const [compareActive, setCompareActive] = useState(null); // { left, right }
  const cmpPickerHold = useDelayedUnmountValue(comparePicker); // hold through exit anim
  const cmpVideosHold = useDelayedUnmountValue(compareActive);
  // Escape closes the delete-confirm + compare-picker overlays.
  useEscClose(!!deleteConfirmFor, () => { setDeleteConfirmFor(null); setDeleteConfirmText(''); });
  useEscClose(!!comparePicker, () => setComparePicker(null));

  const nameOf = (cid) => {
    const t = (trainees || []).find(x => x.id === cid);
    if (t) return t.name;
    // Couple members log under `${parentId}__${i}` (no own row); resolve to the
    // member's name like the other surfaces do, not the raw sub-id string.
    const m = String(cid || '').match(/^(.*)__(\d+)$/);
    if (m) {
      const mem = (trainees || []).find(x => x.id === m[1])?.members?.[Number(m[2])];
      if (mem?.name) return mem.name;
    }
    return cid || 'unknown';
  };

  // Group workouts by client — use real trainee names, no hardcoded ID map.
  //
  // Review-list policy: a workout day with zero uploaded form videos has
  // nothing to review (no clip to watch, no form to comment on). Hide
  // those days from the list so the queue contains only items that
  // actually need the coach's eyes. Workouts that have form videos
  // pending upload (no cloudUrl yet) also stay hidden until the upload
  // completes. Set-completion + reviewer notes still live on the
  // workout — they're not lost, just not surfaced here.
  const hasReviewableVideo = (w) =>
    Array.isArray(w.formVideos) && w.formVideos.some(f => f && f.cloudUrl);

  const byClient = {};
  (clientWorkouts || []).forEach(w => {
    if (!hasReviewableVideo(w)) return;
    const key = w.clientId || 'unknown';
    if (!byClient[key]) byClient[key] = { name: nameOf(key), workouts: [] };
    byClient[key].workouts.push(w);
  });

  // Focus keys are client-scoped: `clientId|planName|dayName|eid|Wn`.
  // The legacy un-scoped key (`planName|...`) collided across athletes who
  // share a plan name (e.g. two people on "Block #17") AND was readable by
  // every athlete under the old RLS. New writes always carry the client id;
  // reads fall back to the legacy key so the coach still sees old notes.
  const setFocus = (clientId, planName, dayName, eid, week, val) => {
    const fk = `${clientId}|${planName}|${dayName}|${eid}|W${week}`;
    setWeeklyFocus(prev => {
      const next = { ...prev };
      // Persist the user's text verbatim. Trimming on every keystroke would
      // strip the trailing space React just rendered, so the space key never
      // visibly registers in the controlled textarea — and you can't extend
      // existing text by appending a word either.
      if (val.length > 0) next[fk] = val;
      else delete next[fk];
      return next;
    });
  };

  const getFocus = (clientId, planName, dayName, eid, week) => {
    const scoped = weeklyFocus?.[`${clientId}|${planName}|${dayName}|${eid}|W${week}`];
    if (scoped) return scoped;
    return weeklyFocus?.[`${planName}|${dayName}|${eid}|W${week}`] || '';
  };

  // (The "Log In-Person Session" subtab was removed 2026-05-28; its
  // entry point is now `▶ LOG SESSION` on each TraineeDetail. Review
  // has no internal sub-navigation — it's a single surface.)

  // Shared delete-confirm modal. Driven by deleteConfirmFor (the workout id)
  // and the typed verification text. Same component used from both the list
  // cards and the detail-screen DELETE button — render it in each return
  // path that needs it.
  const woForConfirm = deleteConfirmFor ? clientWorkouts.find(w => w.id === deleteConfirmFor) : null;
  const delHold = useDelayedUnmountValue(woForConfirm); // hold through exit anim
  const onDeleteConfirm = () => {
    const id = deleteConfirmFor;
    deleteWorkout && deleteWorkout(id);
    setDeleteConfirmFor(null);
    setDeleteConfirmText('');
    if (selectedWo === id) {
      setSelectedWo(null);
      setExpandedEx(null);
      window.scrollTo(0, 0);
    }
  };
  const confirmOk = deleteConfirmText.trim().toLowerCase() === 'delete';
  const deleteModal = delHold.value ? createPortal((
    <div onClick={() => { setDeleteConfirmFor(null); setDeleteConfirmText(''); }}
      role="dialog" aria-modal="true" aria-label="Delete workout" className={delHold.closing ? 'motion-fade-out' : 'motion-fade-in'}
      style={{position:'fixed',inset:0,background:C.scrim,display:'flex',alignItems:'center',justifyContent:'center',zIndex:1200,padding:20}}>
      <div onClick={e => e.stopPropagation()} className={delHold.closing ? 'motion-fall' : 'motion-rise'}
        style={{background:C.bg,border:`1px solid ${C.rd||'#c94444'}`,borderRadius:0,padding:20,maxWidth:380,width:'100%'}}>
        <div style={{fontFamily:FN,fontSize:13,color:C.rd||'#ff6b6b',marginBottom:6,fontWeight:700,textAlign:'center'}}>DELETE WORKOUT</div>
        <div style={{fontSize:13,color:C.tx,marginBottom:6,textAlign:'center'}}>
          {delHold.value.dayName} · {delHold.value.planName} · W{delHold.value.week}
        </div>
        <div style={{fontSize:12,color:C.tm,marginBottom:14,textAlign:'center'}}>
          This permanently removes the workout, its sets, form videos, and review notes. Type <span style={{color:C.rd||'#ff6b6b',fontWeight:700}}>delete</span> to confirm.
        </div>
        <input autoFocus value={deleteConfirmText} onChange={e => setDeleteConfirmText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && confirmOk) onDeleteConfirm(); }}
          placeholder='type "delete"'
          style={{width:'100%',background:'var(--c-sf)',border:`1px solid ${C.cardBd}`,borderRadius:0,padding:'10px 12px',color:C.tx,fontFamily:FB,fontSize:14,outline:'none',boxSizing:'border-box',marginBottom:12,textAlign:'center'}} />
        <div style={{display:'flex',gap:8}}>
          <button onClick={() => { setDeleteConfirmFor(null); setDeleteConfirmText(''); }}
            style={{flex:1,padding:'10px 0',borderRadius:0,border:`1px solid ${C.cardBd}`,background:'transparent',color:C.tm,fontFamily:FB,fontSize:13,fontWeight:600,cursor:'pointer'}}>
            Cancel
          </button>
          <button disabled={!confirmOk} onClick={onDeleteConfirm}
            style={{flex:1,padding:'10px 0',borderRadius:0,border:'none',
              background: confirmOk ? (C.rd||'#c94444') : C.sf3,
              color: confirmOk ? '#fff' : C.td,
              fontFamily:FB,fontSize:13,fontWeight:700,
              cursor: confirmOk ? 'pointer' : 'default'}}>
            Delete
          </button>
        </div>
      </div>
    </div>
  ), document.body) : null;

  // Clear selectedWo when its referent disappears (deleted from the list).
  // useEffect avoids the state-mutation-during-render warning the previous
  // inline `setSelectedWo(null)` was producing under StrictMode.
  useEffect(() => {
    if (selectedWo && !clientWorkouts.find(w => w.id === selectedWo)) {
      setSelectedWo(null);
    }
  }, [selectedWo, clientWorkouts]);

  // ===== WORKOUT DETAIL VIEW =====
  if (selectedWo) {
    const wo = clientWorkouts.find(w => w.id === selectedWo);
    if (!wo) return null;

    // Save-and-next: after marking the current workout reviewed, jump to the
    // next unreviewed one in the queue (oldest-first so the trainer works
    // through the backlog) instead of returning to the list. Falls back to
    // the list when the queue is empty. Same flow is bound to Cmd/Ctrl+Enter.
    const findNextUnreviewed = () => {
      // Mirror the visible queue's filter (hasReviewableVideo) — only days
      // with an uploaded clip are reviewable, so "next" must skip video-less
      // days too, not just unreviewed ones. Without this, Save-&-Next jumped
      // to days the queue intentionally hides.
      const queue = (clientWorkouts || [])
        .filter(w => w.id !== wo.id && !w.reviewedAt && hasReviewableVideo(w))
        .sort((a, b) => new Date(a.date) - new Date(b.date));
      return queue[0]?.id || null;
    };
    const saveAndNext = () => {
      // Mark reviewed and ALWAYS return to the list — never auto-advance to the
      // next pending workout (Ohad: "don't ever move me to the next program").
      markReviewed && markReviewed(wo.id, true);
      setSelectedWo(null); setExpandedEx(null); window.scrollTo(0, 0);
    };
    // Jump-without-marking: skip the current workout and move to the next
    // pending one. Used when the trainer wants to defer a clip (waiting on
    // more form video, athlete clarification, etc.) but keep working through
    // the queue. Bound to bare J.
    const jumpNext = () => {
      const nextId = findNextUnreviewed();
      if (nextId) {
        setSelectedWo(nextId);
        setExpandedEx(null);
        window.scrollTo(0, 0);
      }
    };
    // Count only reviewable (video-having) unreviewed days so "(N LEFT)"
    // matches the visible queue badge instead of counting every unreviewed
    // day (which read 26 while the queue showed 2).
    const remainingAfter = (clientWorkouts || []).filter(w => w.id !== wo.id && !w.reviewedAt && hasReviewableVideo(w)).length;
    // Pre-fetch the next two pending workouts' form videos so the next
    // ⌘+Enter / M lands on a clip that's already in the browser cache. We
    // pull cloudUrls from each workout's exercises array (skip pending /
    // failed uploads). Hidden <video preload> tags below trigger the warm.
    const prefetchUrls = (() => {
      const sorted = (clientWorkouts || [])
        .filter(w => w.id !== wo.id && !w.reviewedAt && hasReviewableVideo(w))
        .sort((a, b) => new Date(a.date) - new Date(b.date));
      const urls = [];
      for (const w of sorted) {
        for (const fv of (w.formVideos || [])) {
          if (fv?.cloudUrl) { urls.push(fv.cloudUrl); break; } // first video per workout
        }
        if (urls.length >= 2) break;
      }
      return urls;
    })();
    // Look up the plan's actual length (default 4 if we can't find it).
    // Match by trainee + plan name so we don't pick up another trainee's
    // plan with the same name.
    const planRec = (planIndex || []).find(p => p.traineeId === wo.clientId && p.name === wo.planName)
                 || (planIndex || []).find(p => p.name === wo.planName);
    const planWeeks = planRec?.weeks || 4;
    const currentWeek = wo.week || 1;
    const isLastWeekOfBlock = currentWeek >= planWeeks;
    // When on the last week of the block, there's no "next week" inside this
    // block. The editor still shows so the trainer can capture an end-of-
    // block takeaway, but it's labelled and aimed differently.
    const nextWeek = isLastWeekOfBlock ? currentWeek : currentWeek + 1;
    const completedSets = (wo.exercises || []).reduce((a, ex) => a + (ex.sets || []).filter(s => s.done).length, 0);
    const totalSets = (wo.exercises || []).reduce((a, ex) => a + (ex.sets || []).length, 0);

    return (
      <div>
        {/* Compare picker: pick second video from the same client */}
        {cmpPickerHold.value && createPortal((
          <div onClick={() => setComparePicker(null)} role="dialog" aria-modal="true" aria-label="Pick a video to compare" className={cmpPickerHold.closing ? 'motion-fade-out' : 'motion-fade-in'} style={{position:'fixed',inset:0,zIndex:1100,background:C.scrim,display:'flex',alignItems:'flex-start',justifyContent:'center',paddingTop:60,backdropFilter:'blur(4px)'}}>
            <div onClick={e => e.stopPropagation()} className={cmpPickerHold.closing ? 'motion-fall' : 'motion-rise'} style={{background:C.sf,border:`1px solid ${C.bd}`,borderRadius:0,width:520,maxHeight:'80vh',overflow:'auto',padding:20}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
                <h3 style={{margin:0,fontFamily:FN,fontSize:15,color:C.tx}}>Compare with…</h3>
                <button onClick={() => setComparePicker(null)} style={{background:'none',border:'none',color:C.tm,cursor:'pointer',fontSize:16}}>✕</button>
              </div>
              <div style={{fontSize:11,color:C.tm,marginBottom:10}}>{cmpPickerHold.value.candidates.length} other video{cmpPickerHold.value.candidates.length===1?'':'s'} from this client:</div>
              {cmpPickerHold.value.candidates.map((c, i) => (
                <div key={i} onClick={() => { setCompareActive({ left: cmpPickerHold.value.left, right: { url: c.cloudUrl, label: c.label, title: c.title } }); setComparePicker(null); }}
                  style={{background:'var(--c-sf)',border:`1px solid ${C.cardBd}`,borderRadius:0,padding:'10px 14px',marginBottom:6,cursor:'pointer',transition:'border-color .15s'}}
                  onMouseEnter={e => e.currentTarget.style.borderColor = C.ac}
                  onMouseLeave={e => e.currentTarget.style.borderColor = C.bd}>
                  <div style={{fontSize:12,color:C.tx}}>{c.label}</div>
                </div>
              ))}
            </div>
          </div>
        ), document.body)}
        {/* Compare modal: two players side by side */}
        {cmpVideosHold.value && (
          <CompareModal
            leftLabel={cmpVideosHold.value.left.label} leftUrl={cmpVideosHold.value.left.url} leftTitle={cmpVideosHold.value.left.title}
            rightLabel={cmpVideosHold.value.right.label} rightUrl={cmpVideosHold.value.right.url} rightTitle={cmpVideosHold.value.right.title}
            closing={cmpVideosHold.closing}
            onClose={() => setCompareActive(null)}
          />
        )}
        <button onClick={() => { setSelectedWo(null); setExpandedEx(null); }}
          style={{background:"none",border:"none",color:C.ac,cursor:"pointer",fontFamily:FN,fontSize:12,fontWeight:700,letterSpacing:'0.06em',padding:0,marginBottom:12}}>
          ← BACK
        </button>

        {/* Workout header */}
        <div style={{background: 'var(--c-sf)',border:`1px solid ${C.cardBd}`,borderRadius:0,marginBottom:16}}>
          <div style={{ background: 'var(--c-stripBg, var(--c-sf))', borderBottom: '1px solid var(--c-cardBd)', padding: '10px 14px' }}>
            <SectionLabel as="div" style={{ color: '#FFFFFF', fontSize: C.alertLabelSize }}>WORKOUT</SectionLabel>
          </div>
          <div style={{padding:16}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
            <div>
              <h2 style={{margin:0,fontFamily:FN,fontSize:18,display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                {nameOf(wo.clientId)} — {wo.planName}
                {wo.reviewedAt && (
                  <span style={{fontSize:9,fontFamily:FN,color:C.gn,fontWeight:700,letterSpacing:0.5,
                    padding:"2px 6px",borderRadius:0,border:`1px solid rgba(46,213,115,0.251)`,background:C.gnD}}>
                    ✓ REVIEWED
                  </span>
                )}
              </h2>
              <div style={{fontSize:12,color:C.tm,marginTop:4}}>
                Week {wo.week} · {wo.dayName} · {fmtPrettyDate(wo.date)}
              </div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:18,fontWeight:700,fontFamily:FN,color:C.gn}}>{completedSets}/{totalSets}</div>
              <div style={{fontSize:9,fontFamily:FN,color:C.tm,letterSpacing:'0.18em'}}>SETS DONE</div>
            </div>
          </div>

          {wo.notes && (
            <div style={{marginTop:10,background:'var(--c-sf)',border:`1px solid ${C.cardBd}`,borderRadius:0,padding:10}}>
              <div style={{fontSize:9,fontFamily:FN,color:C.tm,letterSpacing:'0.18em',marginBottom:4}}>ATHLETE NOTES</div>
              <div style={{fontSize:13,color:C.tx}}>{wo.notes}</div>
            </div>
          )}
          {/* Pre-workout readiness check-in (autoregulation) the athlete filled
              in the portal. Elevated pain is flagged orange for the coach. */}
          {wo.autoregulation && (wo.autoregulation.pain || wo.autoregulation.sleep || wo.autoregulation.energy) && (
            <div style={{marginTop:10,background:'var(--c-sf)',border:`1px solid ${C.cardBd}`,borderRadius:0,padding:10}}>
              <div style={{fontSize:9,fontFamily:FN,color:C.tm,letterSpacing:'0.18em',marginBottom:6}}>READINESS CHECK-IN</div>
              <div style={{display:'flex',gap:18,flexWrap:'wrap'}}>
                {[['PAIN','pain'],['SLEEP','sleep'],['ENERGY','energy']].map(([label,key]) => wo.autoregulation[key] ? (
                  <div key={key} style={{display:'flex',alignItems:'baseline',gap:6}}>
                    <span style={{fontSize:9,fontFamily:FN,color:C.tm,letterSpacing:'0.1em'}}>{label}</span>
                    <span style={{fontSize:13,fontFamily:FN,fontWeight:700,textTransform:'uppercase',color:key==='pain'&&/mod|high/i.test(wo.autoregulation[key])?C.or:C.tx}}>{wo.autoregulation[key]}</span>
                  </div>
                ) : null)}
              </div>
            </div>
          )}
          </div>
        </div>

        {/* Exercise cards */}
        {(wo.exercises || []).map((ex, i) => {
          const isExpanded = expandedEx === i;
          const setsArr = ex.sets || [];
          const doneSets = setsArr.filter(s => s.done).length;
          // "all done" only when there's ≥1 set — an empty/skipped exercise
          // must NOT show the green complete badge (0===0). (audit)
          const allDone = setsArr.length > 0 && doneSets === setsArr.length;
          const libId = ex.eid?.startsWith('dyn_') ? ex.eid.slice(4) : ex.eid;
          const fromLib = exById.get(libId);
          const exName = EX[ex.eid]?.t || fromLib?.title || ex.title || ex.eid;
          const formVideo = wo.formVideos?.[i];
          const currentFocus = getFocus(wo.clientId, wo.planName, wo.dayName, ex.eid, wo.week || 1);
          const nextFocus = getFocus(wo.clientId, wo.planName, wo.dayName, ex.eid, nextWeek);

          // PREV WK: same exercise, same plan, same day, last week. Week 2+ only.
          // eid match wins; normalized title is the fallback (substitutions and
          // plan rebuilds can rotate eids while the title stays stable).
          const currentWeek = wo.week || 1;
          let prevWeekSets = null;
          let prevWeekIdx = null;
          if (currentWeek >= 2) {
            const targetWeek = currentWeek - 1;
            const titleKey = (ex.title || exName || '').toLowerCase().trim();
            let bestDate = null;
            for (const w of (clientWorkouts || [])) {
              if (w.clientId !== wo.clientId) continue;
              if (w.planName !== wo.planName) continue;
              if (w.dayName !== wo.dayName) continue;
              if (w.week !== targetWeek) continue;
              for (const px of (w.exercises || [])) {
                const pTitleKey = (px.title || '').toLowerCase().trim();
                const eidMatch = ex.eid && px.eid === ex.eid;
                const titleMatch = titleKey && pTitleKey === titleKey;
                if (!eidMatch && !titleMatch) continue;
                // Use load>0 only to decide this week qualifies, but store the
                // FULL set array so prevWeekSets[si] lines up with THIS week's
                // set index si (filtering shifted the ghost row by one). (audit)
                const realSets = (px.sets || []).filter(s => parseFloat(s.load) > 0);
                if (realSets.length && (!bestDate || new Date(w.date) > new Date(bestDate))) {
                  prevWeekSets = px.sets || [];
                  prevWeekIdx = targetWeek;
                  bestDate = w.date;
                }
              }
            }
          }

          return (
            <div key={i} data-ex-idx={i} style={{background: 'var(--c-sf)',border:`${isExpanded?'1px':'0.25px'} solid ${isExpanded?C.ac:C.cardBd}`,borderRadius:0,marginBottom:8,overflow:"hidden"}}>
              {/* Header row — click to expand */}
              <div onClick={() => setExpandedEx(isExpanded?null:i)}
                role="button" tabIndex={0} aria-expanded={isExpanded}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpandedEx(isExpanded?null:i); } }}
                style={{display:"flex",alignItems:"center",gap:10,padding:"12px 14px",cursor:"pointer"}}>
                <div style={{width:26,height:26,borderRadius:0,background:allDone?C.gnD:C.acD,
                  display:"flex",alignItems:"center",justifyContent:"center",fontFamily:FN,fontSize:11,fontWeight:700,
                  color:allDone?C.gn:C.ac,flexShrink:0}}>{i+1}</div>
                <div style={{flex:1}}>
                  <div style={{fontWeight:600,fontSize:13}}>{exName}</div>
                  <div style={{fontSize:11,color:C.tm,marginTop:2}}>
                    {ex.prescribed} · {doneSets}/{setsArr.length} sets
                    {(formVideo?.has || formVideo?.cloudUrl) && <span title="Form video submitted" style={{color:C.gn,marginLeft:6}}>📹</span>}
                    {(formVideo?.reviewNotes?.length > 0) && (
                      <span title={`${formVideo.reviewNotes.length} comment${formVideo.reviewNotes.length===1?'':'s'} on this exercise`} style={{color:C.ac,marginLeft:6}}>
                        💬{formVideo.reviewNotes.length > 1 ? <sup style={{fontSize:8}}>{formVideo.reviewNotes.length}</sup> : null}
                      </span>
                    )}
                    {(currentFocus || nextFocus) && (
                      <span title={nextFocus ? `Focus written for next week: ${nextFocus}` : `Focus from previous week: ${currentFocus}`} style={{color:C.or,marginLeft:6}}>
                        🎯
                      </span>
                    )}
                    {ex.substitution && <span style={{color:C.or,marginLeft:6,fontFamily:FN,fontWeight:700,fontSize:10,letterSpacing:0.5}} title={`Swapped from "${ex.substitution.from}"`}>⇄ SWAP</span>}
                  </div>
                  {ex.substitution && (
                    <div style={{fontSize:10,color:C.or,marginTop:3,fontFamily:FN,letterSpacing:0.5}}>
                      replaced "{ex.substitution.from}" mid-session
                    </div>
                  )}
                </div>
                <span style={{color:C.td,fontSize:11}}>{isExpanded?'▲':'▼'}</span>
              </div>

              {/* Expanded detail */}
              {isExpanded && (
                <div style={{padding:"0 14px 14px",borderTop:`1px solid ${C.cardBd}`}}>
                  {/* Set-by-set data — every column centered for visual symmetry */}
                  <div style={{marginTop:10,marginBottom:12}}>
                    <div style={{display:"grid",gridTemplateColumns:"40px 1fr 1fr 1fr",gap:4,marginBottom:4}}>
                      {['SET','REPS','LOAD','RPE'].map(h =>
                        <div key={h} style={{fontSize:9,fontFamily:FN,color:C.tm,letterSpacing:'0.18em',textAlign:'center'}}>{h}</div>)}
                    </div>
                    {setsArr.map((set, si) => {
                      const priorRaw = prevWeekSets?.[si];
                      // aligned by index now; only show the ghost when last week's
                      // set at THIS index actually had load (skip 0-load warmups).
                      const prior = (priorRaw && parseFloat(priorRaw.load) > 0) ? priorRaw : null;
                      return (
                        <React.Fragment key={si}>
                          {prior && (
                            <div style={{display:"grid",gridTemplateColumns:"40px 1fr 1fr 1fr",gap:4,padding:"2px 0",opacity:0.55,marginTop:si===0?0:6}}>
                              <div style={{fontFamily:FN,fontSize:9,color:C.ac,textAlign:"center",letterSpacing:"0.08em",fontWeight:800}}>W{prevWeekIdx}</div>
                              <div style={{fontFamily:FN,fontSize:11,color:C.tx,textAlign:'center',fontWeight:700,fontVariantNumeric:'tabular-nums'}}>{prior.reps || '—'}</div>
                              <div style={{fontFamily:FN,fontSize:11,color:C.tx,textAlign:'center',fontWeight:700,fontVariantNumeric:'tabular-nums'}}>{parseFloat(prior.load)}kg</div>
                              <div style={{fontFamily:FN,fontSize:11,color:C.tx,textAlign:'center',fontWeight:700,fontVariantNumeric:'tabular-nums'}}>{prior.rpe || '—'}</div>
                            </div>
                          )}
                          <div style={{display:"grid",gridTemplateColumns:"40px 1fr 1fr 1fr",gap:4,padding:"3px 0",
                            opacity:set.done?1:0.4,borderBottom:si<setsArr.length-1?`1px solid rgba(127,127,131,0.133)`:'none'}}>
                            <div style={{fontFamily:FN,fontSize:12,color:set.done?C.gn:C.td,textAlign:"center"}}>{set.done?'✓':si+1}</div>
                            <div style={{fontSize:12,color:C.tx,textAlign:'center',fontVariantNumeric:'tabular-nums'}}>{set.reps||'—'}</div>
                            <div style={{fontSize:12,color:C.tx,textAlign:'center',fontVariantNumeric:'tabular-nums'}}>{set.load?set.load+'kg':'—'}</div>
                            <div style={{fontSize:12,color:C.tx,textAlign:'center',fontVariantNumeric:'tabular-nums'}}>{set.rpe||'—'}</div>
                          </div>
                        </React.Fragment>
                      );
                    })}
                  </div>

                  {/* Client's form video */}
                  {(formVideo?.has || formVideo?.cloudUrl) ? (
                    <div style={{background:C.gnD,border:`1px solid rgba(46,213,115,0.188)`,borderRadius:0,padding:12,marginBottom:10}}>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
                        <div style={{fontSize:10,fontFamily:FN,color:C.gn,fontWeight:700}}>📹 FORM VIDEO SUBMITTED</div>
                        {formVideo.cloudUrl && (() => {
                          // Compare candidates: only the SAME exercise from
                          // OTHER weeks of the SAME block (same client). Apples
                          // to apples — never another exercise, never another
                          // block. Filters by plan name + exercise title.
                          const sameTitle = (a, b) => (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase();
                          const currentTitle = ex.title || exName;
                          const candidates = clientWorkouts
                            .filter(w => w.clientId === wo.clientId && w.planName === wo.planName)
                            .flatMap(w => (w.formVideos || []).map((fv, fi) => {
                              const t = w.exercises?.[fi]?.title || '';
                              if (!fv?.cloudUrl || !sameTitle(t, currentTitle)) return null;
                              return {
                                cloudUrl: fv.cloudUrl,
                                title: t,
                                label: `W${w.week} · ${w.dayName} · ${fmtPrettyDate(w.date)}`,
                              };
                            }))
                            .filter(v => v && v.cloudUrl !== formVideo.cloudUrl);
                          if (candidates.length === 0) return null;
                          const leftLabel = `${wo.planName} · W${wo.week} · ${wo.dayName} — ${ex.title || exName} · ${fmtPrettyDate(wo.date)}`;
                          return (
                            <button onClick={() => setComparePicker({ left: { url: formVideo.cloudUrl, label: leftLabel, title: ex.title || exName }, candidates })}
                              style={{background:'var(--c-sf)',border:`1px solid rgba(46,213,115,0.376)`,color:C.gn,fontFamily:FN,fontSize:9,padding:'3px 8px',borderRadius:0,cursor:'pointer',letterSpacing:0.5}}>
                              ⇄ COMPARE
                            </button>
                          );
                        })()}
                      </div>
                      {formVideo.cloudUrl ? (
                        <FormVideoPlayer url={formVideo.cloudUrl} exerciseTitle={ex.title || exName}
                          role="trainer"
                          reviewNotes={formVideo.reviewNotes || []}
                          onReviewNotesChange={updateFormVideos ? (nextNotes) => {
                            const updated = (wo.formVideos || []).map((fv, fi) => fi === i ? { ...fv, reviewNotes: nextNotes } : fv);
                            updateFormVideos(wo.id, updated);
                          } : null}
                        />
                      ) : formVideo.fileName ? (
                        <div style={{fontSize:11,color:C.tm,marginBottom:4}}>File: {formVideo.fileName} (upload pending)</div>
                      ) : null}
                      {formVideo.note && <div style={{fontSize:12,color:C.tx,marginTop:6}}>Client note: {formVideo.note}</div>}
                    </div>
                  ) : (
                    <div style={{background:'var(--c-sf)',border:`1px solid ${C.cardBd}`,borderRadius:0,padding:10,marginBottom:10,textAlign:"center"}}>
                      <div style={{fontSize:11,color:C.tm}}>No form video submitted</div>
                    </div>
                  )}

                  {/* Weekly Focus editor — for NEXT week of the same block,
                      or an END-OF-BLOCK takeaway when this is the final week. */}
                  <div style={{background:C.acD,borderRadius:0,padding:12,border:`1px solid rgba(57,189,255,0.125)`}}>
                    <div style={{fontSize:10,fontFamily:FN,color:C.ac,fontWeight:700,marginBottom:6,textAlign:'center'}}>
                      {isLastWeekOfBlock
                        ? `END-OF-BLOCK NOTE — W${currentWeek}/${planWeeks}`
                        : `W${currentWeek} → W${nextWeek} FOCUS`}
                    </div>
                    {/* OFF-BY-ONE FIX (option C): focus is stored under the SOURCE
                        week being reviewed (currentWeek = wo.week), which is the
                        key the athlete portal + WeeklyFocusTool both use — so it
                        surfaces on the athlete's NEXT week, not a week late. The
                        editor reads the correct key first, falling back to the old
                        target-week key so pre-fix notes still show; re-saving moves
                        them to the right key. Label unchanged. Last week is
                        identical (nextWeek === currentWeek). */}
                    <textarea dir="auto"
                      value={currentFocus || nextFocus}
                      onChange={e => setFocus(wo.clientId, wo.planName, wo.dayName, ex.eid, wo.week || 1, e.target.value)}
                      placeholder={isLastWeekOfBlock
                        ? `Last week of the block. Anything to carry into the next block? Load ceiling, pattern fixes, etc.`
                        : `Based on this performance, what should they focus on next week?`}
                      style={{...bi,minHeight:50,resize:"vertical",borderColor:(currentFocus || nextFocus)?'rgba(57,189,255,0.251)':C.bd,fontSize:12,textAlign:'center'}}
                    />
                    {/* Block weeks mini-view (W1..planWeeks) — adapts to the
                        actual block length. Caps the visible columns at 8 to
                        keep the row readable on long blocks (16w shows 8 then
                        wraps via flex). */}
                    <div style={{display:"grid",gridTemplateColumns:`repeat(${Math.min(planWeeks, 8)},1fr)`,gap:3,marginTop:6}}>
                      {Array.from({length: planWeeks}, (_, i) => i + 1).map(w => {
                        const f = getFocus(wo.clientId, wo.planName, wo.dayName, ex.eid, w);
                        const isCurrent = w === currentWeek;
                        const isNext = !isLastWeekOfBlock && w === nextWeek;
                        return (
                          <div key={w} style={{padding:"3px 4px",borderRadius:0,
                            background:isNext?'rgba(57,189,255,0.082)':isCurrent?'rgba(46,213,115,0.063)':C.sf2,
                            border:`1px solid ${isNext?'rgba(57,189,255,0.251)':isCurrent?'rgba(46,213,115,0.125)':f?'rgba(57,189,255,0.082)':C.bd}`,
                            textAlign:"center"}}>
                            <div style={{fontSize:7,fontFamily:FN,color:isNext?C.ac:isCurrent?C.gn:C.td}}>
                              W{w}{isCurrent?' ✓':''}{isNext?' →':''}
                            </div>
                            <div style={{fontSize:9,color:f?C.tx:C.td,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                              {f||'—'}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Per-exercise advance: collapse this card and jump to the
                      next one (or finish review on the last). Notes already
                      auto-save on change so this is purely a navigation
                      shortcut for working through a workout exercise-by-
                      exercise without scrolling. */}
                  <div style={{display:'flex',justifyContent:'center',marginTop:10}}>
                    <button onClick={() => {
                      const nextIdx = i + 1;
                      if (nextIdx < wo.exercises.length) {
                        setExpandedEx(nextIdx);
                        setTimeout(() => {
                          const el = document.querySelector(`[data-ex-idx="${nextIdx}"]`);
                          el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }, 50);
                      } else {
                        setExpandedEx(null);
                        setTimeout(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }), 50);
                      }
                    }}
                      style={{padding:'8px 18px',borderRadius:0,border:`1px solid ${C.ac}`,
                        background:C.acD,color:C.ac,fontFamily:FN,fontSize:11,fontWeight:700,
                        letterSpacing:0.5,cursor:'pointer'}}>
                      {i < wo.exercises.length - 1 ? '✓ NEXT EXERCISE →' : '✓ DONE — FINISH REVIEW ↓'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* Done — delete (with text-typed confirm), mark reviewed / unmark, back.
            Save & next: the primary CTA below jumps to the next pending workout
            (oldest-first) once the trainer marks the current one reviewed.
            ⌘/Ctrl+Enter and bare M both trigger save+next. Bare J jumps
            without marking — for clips you want to defer. C (handled inside
            FormVideoPlayer) drops a comment at the playhead. */}
        <ReviewHotkeys
          enabled={!deleteConfirmFor}
          onFire={() => { if (!wo.reviewedAt) saveAndNext(); }}
          onJump={jumpNext}
        />
        {/* Hidden prefetch tags — warm the browser cache for the next two
            pending workouts' form videos so the trainer doesn't wait on the
            first paint after pressing M / ⌘+Enter. preload="auto" hints to
            the browser to download bytes immediately. */}
        {prefetchUrls.map(u => <video key={u} src={u} preload="auto" muted style={{display:'none'}} />)}
        {/* One-line hotkey legend so the keyboard flow is discoverable
            without a tour. Sits above the action bar, FN caps, low-contrast
            so it doesn't compete with the primary CTA. */}
        <div style={{fontFamily:FN,fontSize:9,color:C.tm,letterSpacing:'0.18em',fontWeight:700,textAlign:'center',marginTop:14,marginBottom:-6}}>
          M · MARK REVIEWED · &nbsp; J · SKIP · &nbsp; C · COMMENT AT PLAYHEAD
        </div>
        <div style={{display:"flex",gap:8,marginTop:20,marginBottom:8}}>
          {deleteWorkout && (
            <button onClick={() => { setDeleteConfirmFor(wo.id); setDeleteConfirmText(''); }}
              title="Delete this workout"
              style={{padding:"12px 16px",borderRadius:0,border:`1px solid ${C.rd||'#c94444'}`,
                background:"transparent",color:C.rd||'#ff6b6b',fontFamily:FN,fontSize:12,fontWeight:600,
                cursor:"pointer"}}>
              DELETE
            </button>
          )}
          {/* Order: DELETE · UNMARK (small status toggles, left-aligned)
              followed by BACK TO REVIEW + NEXT PENDING — both primary
              size (flex:1) so they share the row equally. UNMARK only
              appears when the workout is already marked reviewed. */}
          {wo.reviewedAt && (
            <button onClick={() => { markReviewed && markReviewed(wo.id, false); }}
              style={{padding:"12px 16px",borderRadius:0,border:`1px solid ${C.cardBd}`,
                background:"transparent",color:C.tm,fontFamily:FN,fontSize:12,fontWeight:600,
                cursor:"pointer"}}>
              UNMARK
            </button>
          )}
          <button onClick={() => { setSelectedWo(null); setExpandedEx(null); window.scrollTo(0,0); }}
            title="Return to the review queue"
            style={{flex:1,padding:"12px 0",borderRadius:0,border:`1px solid ${C.cardBd}`,
              background:"transparent",color:C.tx,fontFamily:FN,fontSize:13,fontWeight:700,
              letterSpacing:0.5,cursor:"pointer"}}>
            ← BACK
          </button>
          {wo.reviewedAt ? (
            findNextUnreviewed() ? (
              <button onClick={() => { const nextId = findNextUnreviewed(); if (nextId) { setSelectedWo(nextId); setExpandedEx(null); window.scrollTo(0,0); } }}
                title="Jump to next pending workout"
                style={{flex:1,padding:"12px 0",borderRadius:0,border:`1px solid ${C.ac}`,
                  background:C.ac,color:C.acOnSurface,fontFamily:FN,fontSize:13,fontWeight:700,
                  letterSpacing:0.5,cursor:"pointer"}}>
                → NEXT PENDING ({remainingAfter})
              </button>
            ) : (
              <button onClick={() => { setSelectedWo(null); setExpandedEx(null); window.scrollTo(0,0); }}
                style={{flex:1,padding:"12px 0",borderRadius:0,border:`1px solid ${C.gn}`,
                  background:C.gn,color:"#FFFFFF",fontFamily:FN,fontSize:13,fontWeight:700,
                  letterSpacing:0.5,cursor:"pointer"}}>
                ✓ REVIEWED — BACK
              </button>
            )
          ) : (
            <button onClick={saveAndNext}
              title="Mark reviewed and return to the list (⌘/Ctrl + Enter)"
              style={{flex:1,padding:"12px 0",borderRadius:0,border:`1px solid ${C.ac}`,
                background:C.ac,color:C.acOnSurface,fontFamily:FN,fontSize:13,fontWeight:700,
                letterSpacing:0.5,cursor:"pointer"}}>
              ✓ MARK REVIEWED — BACK
            </button>
          )}
        </div>

        {deleteModal}
      </div>
    );
  }

  // ===== WORKOUT LIST VIEW =====
  const allWorkouts = (clientWorkouts || []).slice().reverse();

  if (allWorkouts.length === 0) return (
    <div>
      <div style={{fontFamily:FN,fontSize:9,fontWeight:700,color:C.tm,textTransform:'uppercase',letterSpacing:'0.18em',marginBottom:8}}>WORKOUT REVIEW</div>
      <div style={{color:C.tm,fontSize:13,marginBottom:20}}>
        Review completed workouts, watch client form videos, and set weekly focus for next week.
      </div>
      <div style={{textAlign:"center",padding:60,color:C.td}}>
        <EXPOMark height={22} style={{opacity:0.2,marginBottom:12}} />
        <div style={{fontSize:14}}>No completed workouts yet</div>
        <div style={{fontSize:12,marginTop:4}}>Workouts logged in the Athlete Portal will appear here</div>
      </div>
    </div>
  );

  return (
    <div>
      <div style={{fontFamily:FN,fontSize:9,fontWeight:700,color:C.tm,textTransform:'uppercase',letterSpacing:'0.18em',marginBottom:4}}>WORKOUT REVIEW</div>
      <div style={{color:C.tm,fontSize:11,marginBottom:16,fontFamily:FB}}>
        Review completed workouts, watch client form videos, and write focus notes for next week.
      </div>

      <WeeklyFocusTool trainees={trainees} exercises={exercises} weeklyFocus={weeklyFocus} setWeeklyFocus={setWeeklyFocus} />

      {(() => {
        const entries = Object.entries(byClient);
        const byName = ([, a], [, b]) => (a.name || '').localeCompare(b.name || '');
        const isPending = ([, d]) => d.workouts.some(w => !w.reviewedAt);
        const pending = entries.filter(isPending).sort(byName);
        const reviewedOnly = entries.filter(e => !isPending(e)).sort(byName);
        const reviewedCount = entries.reduce((n, [, d]) => n + d.workouts.filter(w => w.reviewedAt).length, 0);
        // One athlete block — reused for the pending group (always shown) and
        // the reviewed group (shown below the toggle when it's expanded).
        const renderClient = ([cid, data]) => (
        <CollapsibleSection key={cid} bare storageKey={`review-client-${cid}`} style={{marginBottom:20}}
          domId={`review-client-${cid}`}
          titleNode={<span style={{fontSize:isHebrew(data.name)?15:12,fontFamily:isHebrew(data.name)?FH:FN,color:'#FFFFFF',fontWeight:700}}>{isHebrew(data.name) ? data.name : (data.name || '').toUpperCase()} ({(data.workouts || []).filter(w => !w.reviewedAt).length})</span>}
          right={onOpenTrainee && trainees.some(t => t.id === cid) ? (
            <button onClick={() => onOpenTrainee(cid)}
              title="Open this athlete's page"
              style={{background:'transparent',border:'1px solid rgba(255,255,255,0.55)',color:'#FFFFFF',borderRadius:0,
                padding:'3px 10px',fontFamily:FN,fontSize:10,fontWeight:700,letterSpacing:'0.12em',
                textTransform:'uppercase',cursor:'pointer',whiteSpace:'nowrap',lineHeight:1.5}}
              onMouseEnter={e=>e.currentTarget.style.borderColor='#FFFFFF'}
              onMouseLeave={e=>e.currentTarget.style.borderColor='rgba(255,255,255,0.55)'}>
              Athlete page →
            </button>
          ) : null}>
          {data.workouts.slice()
            // Hide already-reviewed cards unless the coach opted to show them.
            .filter(w => showReviewed || !w.reviewedAt)
            // Unreviewed first (by most-recent date), then reviewed (by most-recent date)
            .sort((a, b) => {
              const ar = a.reviewedAt ? 1 : 0;
              const br = b.reviewedAt ? 1 : 0;
              if (ar !== br) return ar - br;
              return new Date(b.date) - new Date(a.date);
            })
            .map(wo => {
            const doneSets = (wo.exercises || []).reduce((a,ex) => a + (ex.sets || []).filter(s=>s.done).length, 0);
            const totalSets = (wo.exercises || []).reduce((a,ex) => a + (ex.sets || []).length, 0);
            const hasFormVids = hasReviewableVideo(wo);
            const reviewed = !!wo.reviewedAt;
            return (
              <div key={wo.id} onClick={() => setSelectedWo(wo.id)}
                role="button" tabIndex={0}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedWo(wo.id); } }}
                style={{background: 'var(--c-sf)',border:`1px solid ${C.cardBd}`,borderRadius:0,padding:"12px 16px",
                  marginBottom:6,cursor:"pointer",transition:"border-color .15s, opacity .15s",display:"flex",
                  justifyContent:"space-between",alignItems:"center",opacity:reviewed?0.55:1}}
                onMouseEnter={e=>{e.currentTarget.style.borderColor=C.ac; e.currentTarget.style.opacity='1';}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor=C.cardBd; e.currentTarget.style.opacity=reviewed?'0.55':'1';}}>
                {(() => {
                  // Week progress (B2): total weeks from the plan, current = wo.week.
                  // match the athlete FIRST (two athletes can share a block name
                  // of different lengths), fall back to name-only. (audit)
                  const planWeeks = ((planIndex || []).find(p => p.traineeId === wo.clientId && p.name === wo.planName)
                    || (planIndex || []).find(p => p.name === wo.planName))?.weeks || null;
                  const segCount = planWeeks && planWeeks <= 12 ? planWeeks : 0;
                  return (
                <div style={{minWidth:0,flex:1}}>
                  {/* Row 1 — DAY + WEEK (progress bar) only */}
                  <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                    <span style={{fontWeight:700,fontSize:15,color:C.tx,letterSpacing:'0.01em'}}>{wo.dayName}</span>
                    {segCount > 0 && (
                      <span style={{display:'inline-flex',gap:3,verticalAlign:'middle'}}>
                        {Array.from({length:segCount},(_,i)=>(
                          <span key={i} style={{width:13,height:5,background:i < Math.min(wo.week, segCount) ? 'var(--c-ac)' : 'var(--c-tm)', opacity:i < Math.min(wo.week, segCount) ? 1 : 0.35}} />
                        ))}
                      </span>
                    )}
                    <span style={{fontFamily:FN,fontSize:11,color:C.tm,letterSpacing:'0.04em'}}>Week {wo.week}{planWeeks?` / ${planWeeks}`:''}</span>
                  </div>
                  {/* Row 2 — BLOCK + date + sets (moved here from the week row) + reviewed */}
                  <div style={{display:"flex",alignItems:"center",gap:8,marginTop:6,flexWrap:"wrap"}}>
                    <span style={{fontFamily:FN,fontSize:12,color:C.ac,letterSpacing:'0.04em'}}>{wo.planName}</span>
                    <span style={{fontFamily:FN,fontSize:11,color:C.tm,letterSpacing:'0.04em'}}>· {fmtPrettyDate(wo.date)} · {doneSets}/{totalSets} sets{hasFormVids && <span style={{color:C.gn,marginLeft:4}}>📹</span>}</span>
                    {reviewed && (
                      <span style={{fontSize:8,fontFamily:FN,color:C.gn,fontWeight:700,letterSpacing:0.5,
                        padding:"1px 5px",borderRadius:0,border:`1px solid rgba(46,213,115,0.251)`,background:C.gnD}}>
                        ✓ REVIEWED
                      </span>
                    )}
                  </div>
                </div>
                  );
                })()}
                {/* Action group — Review/View + Delete together, off to the right */}
                <div style={{display:'flex',alignItems:'center',gap:8,marginLeft:12,flexShrink:0}}>
                  <button onClick={(e)=>{e.stopPropagation();setSelectedWo(wo.id);}}
                    title={reviewed?'View this workout':'Review this workout'}
                    style={{background:'transparent',border:`1px solid ${reviewed?C.cardBd:C.ac}`,color:reviewed?C.tm:C.ac,
                      borderRadius:0,padding:'5px 12px',fontFamily:FN,fontSize:11,fontWeight:700,letterSpacing:'0.08em',
                      cursor:'pointer',whiteSpace:'nowrap'}}>{reviewed?'VIEW →':'REVIEW →'}</button>
                  {deleteWorkout && (
                    <button onClick={(e) => { e.stopPropagation(); setDeleteConfirmFor(wo.id); setDeleteConfirmText(''); }}
                      title="Delete this workout"
                      style={{background:'transparent',border:`1px solid ${(C.rd||'#c94444')}40`,color:C.rd||'#ff6b6b',
                        borderRadius:0,padding:'5px 10px',fontFamily:FN,fontSize:11,fontWeight:700,letterSpacing:'0.08em',cursor:'pointer'}}>
                      DELETE
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </CollapsibleSection>
        );
        return (
        <>
          {pending.length === 0 && !showReviewed && (
            <div style={{ textAlign: 'center', padding: 48, color: C.td }}>
              <div style={{ fontFamily: FN, fontSize: 13, letterSpacing: '0.08em' }}>ALL CAUGHT UP</div>
              <div style={{ fontFamily: FB, fontSize: 12, marginTop: 6 }}>No workouts waiting on your review.</div>
            </div>
          )}
          {pending.map(renderClient)}
          {/* Queue divider: pending athletes above, the reviewed archive below.
              Sits directly under the last pending athlete (Ohad's ask), not at
              the top of the page. */}
          {reviewedCount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'center', margin: '4px 0 20px' }}>
              <button onClick={() => setShowReviewed(v => !v)}
                style={{ background: showReviewed ? `${C.ac}1f` : 'transparent', border: `1px solid ${showReviewed ? C.ac : C.cardBd}`, color: showReviewed ? C.ac : C.tm, borderRadius: 0, padding: '7px 16px', fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>
                {showReviewed ? `✕ HIDE REVIEWED (${reviewedCount})` : `SHOW REVIEWED (${reviewedCount})`}
              </button>
            </div>
          )}
          {showReviewed && reviewedOnly.map(renderClient)}
        </>
        );
      })()}
      {deleteModal}
    </div>
  );
}
