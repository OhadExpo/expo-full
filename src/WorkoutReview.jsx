import React, { useState, useRef, useEffect, useMemo } from 'react';
import WorkoutsView from './WorkoutsView';
import { C, FN, FB, ytId, EXPO_ICON } from './theme';
import { EXPOMark } from './expoMark';
import { EX } from './exerciseData';
import useAutosave from './hooks/useAutosave';
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
        <div style={{background:'#3a1a1a',border:`1px solid #c94444`,borderRadius:0,padding:12,color:'#ff6b6b',fontSize:12,fontFamily:FB}}>
          <div style={{fontWeight:700,marginBottom:4}}>Video player crashed — reload to retry</div>
          <div style={{fontSize:11,opacity:0.8,whiteSpace:'pre-wrap',fontFamily:'monospace'}}>{String(this.state.err?.message || this.state.err)}</div>
          <button onClick={() => this.setState({ err: null })} style={{marginTop:8,background:'var(--c-sf)',border:`1px solid #c94444`,color:'#ff6b6b',borderRadius:0,padding:'4px 10px',fontSize:11,fontWeight:600,cursor:'pointer'}}>Retry</button>
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
  const seekTo = (ts) => {
    const v = videoRef.current;
    if (!v || ts == null) return;
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
  // Trainers default to 1.5x — they review dozens of clips per session and
  // always start by getting the gist of the lift before scrubbing back to
  // commentable frames. Athletes (own-portal playback) keep 1x so they don't
  // unconsciously absorb a sped-up version of their own movement.
  const [speed, setSpeed] = useState(role === 'trainer' ? 1.5 : 1);
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
      setPausedAtCommentId(null);
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
      // Lite variant is ~3x faster than full on mobile WASM with negligible
      // accuracy loss for single-subject form-review footage. PC was already
      // invisibly fast on full; lite makes phone usable, PC unchanged.
      const modelUrl = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task';
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
                ctx.strokeStyle = '#3BA0FF';
                ctx.lineWidth = 2;
                for (const [i, j] of POSE_CONNECTIONS) {
                  const a = lms[i], b = lms[j];
                  if (!a || !b) continue;
                  ctx.beginPath();
                  ctx.moveTo(px(a), py(a));
                  ctx.lineTo(px(b), py(b));
                  ctx.stroke();
                }
                ctx.fillStyle = '#fff';
                for (const p of lms) {
                  ctx.beginPath();
                  ctx.arc(px(p), py(p), 3, 0, 2*Math.PI);
                  ctx.fill();
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
                    const troughs = findPeaks(inverted, 25, minDist);
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
  return (
    <div>
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
      <div ref={wrapperRef} className="fv-wrap" style={{position:'relative',marginBottom:6,lineHeight:0}}>
        <video ref={videoRef} src={url} controls
          controlsList={isFullscreen ? '' : 'nofullscreen'}
          playsInline crossOrigin="anonymous"
          onError={() => setVideoLoadError(true)}
          style={{display:'block',width:'100%',borderRadius:0,maxHeight:400,background:C.sf2}} />
        {videoLoadError && (
          <a href={url} target="_blank" rel="noopener noreferrer"
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
        {(poseOn || repsOn) && (Object.keys(angles).length > 0 || repsOn) && (
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
            {repsOn && (
              <div style={{paddingBottom:4,marginBottom:poseOn?4:0,textAlign:'center',
                borderBottom:poseOn?`1px solid ${C.bd}`:'none'}}>
                <div style={{fontSize:9,color:C.td,letterSpacing:0.5}}>REPS</div>
                <div style={{fontSize:18,fontWeight:700,color:C.gn,lineHeight:1}}>{reps}</div>
                {tempo != null && <div style={{fontSize:9,color:C.tm,marginTop:2}}>{tempo.toFixed(1)}s</div>}
              </div>
            )}
            {poseOn && ANGLE_DEFS.map(d => (
              <div key={d.name} style={{display:'flex',gap:6,whiteSpace:'nowrap'}}>
                <span style={{color:C.td,minWidth:60,display:'inline-block'}}>{d.name}</span>
                <span style={{minWidth:32,display:'inline-block',textAlign:'right'}}>{angles[d.name] != null ? angles[d.name] + '°' : '—'}</span>
              </div>
            ))}
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
              <div key={n.id} onClick={() => seekTo(n.ts)}
                title={`${fmtTs(n.ts)} — ${n.text.slice(0, 80)}`}
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
        <div style={{flex:1,display:'flex',gap:4,alignItems:'center',flexWrap:'wrap',justifyContent:'flex-start'}}>
          <button onClick={togglePose} disabled={poseLoading}
            style={{padding:'3px 10px',borderRadius:0,border:`${poseOn?'2px':'0px'} solid ${C.ac}`,
              background:poseOn?C.acD:'transparent',color:poseOn?C.ac:C.tm,
              fontFamily:FN,fontSize:10,cursor:poseLoading?'wait':'pointer',opacity:poseLoading?0.6:1}}>
            {poseLoading ? 'LOADING…' : poseOn ? 'POSE ON' : 'POSE'}
          </button>
          <button onClick={toggleReps} disabled={poseLoading}
            title={activeKind === 'none' ? 'Isometric — counter off' : `Tracking ${activeKind} for rep cycles (${activeChannels.join(' + ')})`}
            style={{padding:'3px 10px',borderRadius:0,border:`${repsOn?'2px':'0px'} solid ${C.gn}`,
              background:repsOn?C.gnD:'transparent',color:repsOn?C.gn:C.tm,
              fontFamily:FN,fontSize:10,cursor:poseLoading?'wait':'pointer',opacity:poseLoading?0.6:1}}>
            {repsOn ? `REPS ${reps}` : 'REPS'}
          </button>
          {repsOn && (
            <select value={trackOverride} onChange={e => setTrackOverride(e.target.value)}
              title="Which joint pair to count peaks on"
              style={{padding:'3px 6px',borderRadius:0,border:`1px solid ${C.bd}`,
                background:'transparent',color:C.tm,fontFamily:FN,fontSize:10,cursor:'pointer'}}>
              <option value="auto">AUTO ({(autoPick.kind || 'none').toUpperCase()})</option>
              <option value="hip">HIP</option>
              <option value="knee">KNEE</option>
              <option value="elbow">ELBOW</option>
              <option value="sho">SHOULDER</option>
              <option value="none">SKIP</option>
            </select>
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
              style={{padding:'3px 10px',borderRadius:0,border:`${commentsEnabled?'2px':'0px'} solid ${C.ac}`,
                background:commentsEnabled?C.acD:'transparent',color:commentsEnabled?C.ac:C.tm,fontFamily:FN,fontSize:10,cursor:'pointer'}}>
              💬 {commentsEnabled ? 'ON' : 'OFF'}
            </button>
          )}
          {onReviewNotesChange && role === 'trainer' && (
            <button onClick={addComment} title="Comment & draw at this timestamp — color swatches appear once a comment is open"
              style={{padding:'3px 10px',borderRadius:0,border:`1px solid rgba(57,189,255,0.251)`,
                background:C.acD,color:C.ac,fontFamily:FN,fontSize:10,cursor:'pointer'}}>💬✏️ COMMENT</button>
          )}
        </div>
        <div style={{flex:1,display:'flex',gap:4,alignItems:'center',justifyContent:'flex-end'}}>
          <button onClick={fullscreen}
            style={{padding:'3px 10px',borderRadius:0,border:`1px solid ${C.bd}`,
              background:'transparent',color:C.tm,fontFamily:FN,fontSize:10,cursor:'pointer'}}>⛶ FULL</button>
        </div>
      </div>
      {/* Bottom row: speeds → frame-step → LOOP, all centered as one
          horizontal group (justifyContent:'center'). Order per Ohad:
          0.125x .. 2x, ◀ ▶, then ↻ LOOP. */}
      <div style={{display:'flex',gap:4,alignItems:'center',justifyContent:'center',flexWrap:'wrap'}}>
        {speeds.map(s => (
          <button key={s} onClick={() => setSpeed(s)} title={`Playback speed ${s}x`}
            style={{padding:'3px 6px',borderRadius:0,border:`${speed===s?'2px':'0px'} solid ${C.ac}`,
              background:speed===s?C.acD:'transparent',color:speed===s?C.ac:C.tm,
              fontFamily:FN,fontSize:10,cursor:'pointer'}}>{s}x</button>
        ))}
        <button onClick={() => stepFrame(-1)} title="Previous frame"
          style={{padding:'3px 6px',borderRadius:0,border:`1px solid ${C.bd}`,
            background:'transparent',color:C.tm,fontFamily:FN,fontSize:11,cursor:'pointer'}}>◀</button>
        <button onClick={() => stepFrame(1)} title="Next frame"
          style={{padding:'3px 6px',borderRadius:0,border:`1px solid ${C.bd}`,
            background:'transparent',color:C.tm,fontFamily:FN,fontSize:11,cursor:'pointer'}}>▶</button>
        <button onClick={() => setLoop(v => !v)} title="Loop the video"
          style={{padding:'3px 10px',borderRadius:0,border:`1px solid ${loop?C.ac:C.bd}`,
            background:loop?C.acD:'transparent',color:loop?C.ac:C.tm,fontFamily:FN,fontSize:10,cursor:'pointer'}}>↻ LOOP</button>
      </div>
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
            style={{padding:'3px 8px',borderRadius:0,border:`1px solid ${rulerMode?C.ac:C.bd}`,
              background:rulerMode?C.acD:'transparent',color:rulerMode?C.ac:C.tm,fontFamily:FN,fontSize:10,cursor:'pointer'}}>
            📏 {rulerMode ? 'LINE' : 'FREE'}
          </button>
          <button onClick={undoLastStroke} disabled={currentStrokes.length === 0} title="Undo last stroke"
            style={{padding:'3px 8px',borderRadius:0,border:`1px solid ${C.bd}`,
              background:'transparent',color:currentStrokes.length?C.tm:C.td,fontFamily:FN,fontSize:10,cursor:currentStrokes.length?'pointer':'default',opacity:currentStrokes.length?1:0.5}}>↶ UNDO</button>
          <button onClick={clearDrawings} disabled={currentStrokes.length === 0} title="Clear all drawings on this comment"
            style={{padding:'3px 8px',borderRadius:0,border:`1px solid ${C.bd}`,
              background:'transparent',color:currentStrokes.length?C.tm:C.td,fontFamily:FN,fontSize:10,cursor:currentStrokes.length?'pointer':'default',opacity:currentStrokes.length?1:0.5}}>✕ CLEAR</button>
        </div>
      )}
      {/* Compose input (new comment or reply). Appears inline when composing is active. */}
      {composing && (
        <div style={{background:C.sf2,border:`1px solid rgba(57,189,255,0.376)`,borderRadius:0,padding:10,marginTop:8}}>
          <div style={{fontSize:10,fontFamily:FN,color:C.ac,fontWeight:700,marginBottom:6,textAlign:'center'}}>
            {composing.editId
              ? (composing.isReply ? '✏️ EDITING REPLY' : `✏️ EDITING COMMENT AT ${fmtTs(composing.ts)}`)
              : (composing.replyToId ? '↳ REPLYING' : `💬 COMMENT AT ${fmtTs(composing.ts)}`)}
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
              <div key={n.id} style={{background:pausedAtCommentId===n.id?(n.author==='trainer'?C.acD:C.gnD):C.sf2,borderLeft:`3px solid ${n.author==='trainer'?C.ac:C.gn}`,borderRadius:0,padding:pausedAtCommentId===n.id?14:10,boxShadow:pausedAtCommentId===n.id?`0 0 0 2px ${n.author==='trainer'?C.ac:C.gn}40`:'none'}}>
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
                  <button onClick={() => seekTo(n.ts)} style={{background:C.acD,border:`1px solid rgba(57,189,255,0.251)`,color:C.ac,fontFamily:FN,fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:0,cursor:'pointer'}}>▶ {fmtTs(n.ts)}</button>
                  <span style={{fontSize:10,fontFamily:FN,color:n.author==='trainer'?C.ac:C.gn,fontWeight:700,letterSpacing:0.5}}>{n.author === 'trainer' ? 'COACH' : 'ATHLETE'}</span>
                  <span style={{fontSize:10,color:C.td,marginLeft:'auto'}}>{n.createdAt ? new Date(n.createdAt).toLocaleDateString() : ''}</span>
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
                          <span style={{fontSize:10,color:C.td}}>{r.createdAt ? new Date(r.createdAt).toLocaleDateString() : ''}</span>
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
function CompareModal({ leftLabel, leftUrl, leftTitle, rightLabel, rightUrl, rightTitle, onClose }) {
  const [leftVid, setLeftVid] = useState(null);
  const [rightVid, setRightVid] = useState(null);
  const sync = (target) => {
    if (!leftVid || !rightVid) return;
    if (target === 'right') rightVid.currentTime = leftVid.currentTime;
    else leftVid.currentTime = rightVid.currentTime;
  };
  const playBoth = () => { leftVid?.play(); rightVid?.play(); };
  const pauseBoth = () => { leftVid?.pause(); rightVid?.pause(); };
  return (
    <div onClick={onClose} style={{position:'fixed',inset:0,zIndex:1200,background:C.scrim,display:'flex',alignItems:'flex-start',justifyContent:'center',paddingTop:32,overflow:'auto'}}>
      <div onClick={e => e.stopPropagation()} style={{background:C.bg,border:`0.25px solid ${C.cardBd}`,borderRadius:0,width:'min(1400px, 96vw)',padding:20}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
          <h3 style={{margin:0,fontFamily:FN,fontSize:16,color:C.tx}}>Compare</h3>
          <div style={{display:'flex',gap:6,alignItems:'center'}}>
            <button onClick={playBoth} style={{background:C.acD,border:`1px solid ${C.ac}`,color:C.ac,fontFamily:FN,fontSize:11,padding:'6px 12px',borderRadius:0,cursor:'pointer'}}>▶ PLAY BOTH</button>
            <button onClick={pauseBoth} style={{background:'var(--c-sf)',border:`0.25px solid ${C.cardBd}`,color:C.tm,fontFamily:FN,fontSize:11,padding:'6px 12px',borderRadius:0,cursor:'pointer'}}>❚❚ PAUSE</button>
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
              style={{background:'var(--c-sf)',border:`0.25px solid ${C.cardBd}`,color:C.tm,fontFamily:FN,fontSize:10,padding:'6px 8px',borderRadius:0,cursor:'pointer',whiteSpace:'nowrap'}}>SYNC →</button>
            <button onClick={() => sync('left')} title="Copy right timestamp to left"
              style={{background:'var(--c-sf)',border:`0.25px solid ${C.cardBd}`,color:C.tm,fontFamily:FN,fontSize:10,padding:'6px 8px',borderRadius:0,cursor:'pointer',whiteSpace:'nowrap'}}>← SYNC</button>
          </div>
          <div>
            <div style={{fontSize:11,fontFamily:FN,color:C.tm,marginBottom:6}}>{rightLabel}</div>
            <FormVideoPlayer url={rightUrl} exerciseTitle={rightTitle} onVideoRef={setRightVid} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function WorkoutReview({ clientWorkouts, weeklyFocus, setWeeklyFocus, workouts, setWorkouts, planIndex, trainees, exercises, onDecrementSession, markReviewed, updateFormVideos, deleteWorkout }) {
  const [subTab, setSubTab] = useState("review");
  const [selectedWo, setSelectedWo] = useState(null);
  const [expandedEx, setExpandedEx] = useState(null);
  // Delete-confirm modal state. The workout id under threat + the user's typed
  // verification ("delete" or "remove" required) before the destructive call
  // is enabled.
  const [deleteConfirmFor, setDeleteConfirmFor] = useState(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  // Compare flow: when set, shows picker modal for selecting the second video.
  // After pick, switches to CompareModal with both URLs.
  const [comparePicker, setComparePicker] = useState(null); // { left: {url,label}, candidates: [...] }
  const [compareActive, setCompareActive] = useState(null); // { left, right }

  const nameOf = (cid) => (trainees || []).find(t => t.id === cid)?.name || cid || 'unknown';

  // Group workouts by client — use real trainee names, no hardcoded ID map.
  const byClient = {};
  clientWorkouts.forEach(w => {
    const key = w.clientId || 'unknown';
    if (!byClient[key]) byClient[key] = { name: nameOf(key), workouts: [] };
    byClient[key].workouts.push(w);
  });

  const setFocus = (planName, dayName, eid, week, val) => {
    const fk = `${planName}|${dayName}|${eid}|W${week}`;
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

  const getFocus = (planName, dayName, eid, week) => {
    const fk = `${planName}|${dayName}|${eid}|W${week}`;
    return weeklyFocus?.[fk] || '';
  };

  // ===== SUB-NAV =====
  const subNav = (
    <div style={{display:"flex",gap:4,marginBottom:16}}>
      {[["review","Review Athlete Workouts"],["log","Log In-Person Session"]].map(([k,l]) => (
        <button key={k} onClick={() => {setSubTab(k);setSelectedWo(null);setExpandedEx(null)}}
          style={{flex:1,padding:"10px 0",borderRadius:0,border:`${subTab===k?'1px':'0.25px'} solid ${subTab===k?C.ac:C.cardBd}`,
            background:subTab===k?C.acD:"transparent",color:subTab===k?C.ac:C.tm,
            fontFamily:FB,fontSize:13,fontWeight:600,cursor:"pointer"}}>{l}</button>
      ))}
    </div>
  );

  // Shared delete-confirm modal. Driven by deleteConfirmFor (the workout id)
  // and the typed verification text. Same component used from both the list
  // cards and the detail-screen DELETE button — render it in each return
  // path that needs it.
  const woForConfirm = deleteConfirmFor ? clientWorkouts.find(w => w.id === deleteConfirmFor) : null;
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
  const deleteModal = woForConfirm ? (
    <div onClick={() => { setDeleteConfirmFor(null); setDeleteConfirmText(''); }}
      style={{position:'fixed',inset:0,background:C.scrim,display:'flex',alignItems:'center',justifyContent:'center',zIndex:1200,padding:20}}>
      <div onClick={e => e.stopPropagation()}
        style={{background:C.bg,border:`1px solid ${C.rd||'#c94444'}`,borderRadius:0,padding:20,maxWidth:380,width:'100%'}}>
        <div style={{fontFamily:FN,fontSize:13,color:C.rd||'#ff6b6b',marginBottom:6,fontWeight:700,textAlign:'center'}}>DELETE WORKOUT</div>
        <div style={{fontSize:13,color:C.tx,marginBottom:6,textAlign:'center'}}>
          {woForConfirm.dayName} · {woForConfirm.planName} · W{woForConfirm.week}
        </div>
        <div style={{fontSize:12,color:C.tm,marginBottom:14,textAlign:'center'}}>
          This permanently removes the workout, its sets, form videos, and review notes. Type <span style={{color:C.rd||'#ff6b6b',fontWeight:700}}>delete</span> to confirm.
        </div>
        <input autoFocus value={deleteConfirmText} onChange={e => setDeleteConfirmText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && confirmOk) onDeleteConfirm(); }}
          placeholder='type "delete"'
          style={{width:'100%',background:'var(--c-sf)',border:`0.25px solid ${C.cardBd}`,borderRadius:0,padding:'10px 12px',color:C.tx,fontFamily:FB,fontSize:14,outline:'none',boxSizing:'border-box',marginBottom:12,textAlign:'center'}} />
        <div style={{display:'flex',gap:8}}>
          <button onClick={() => { setDeleteConfirmFor(null); setDeleteConfirmText(''); }}
            style={{flex:1,padding:'10px 0',borderRadius:0,border:`0.25px solid ${C.cardBd}`,background:'transparent',color:C.tm,fontFamily:FB,fontSize:13,fontWeight:600,cursor:'pointer'}}>
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
  ) : null;

  // ===== LOG IN-PERSON SESSION (wraps WorkoutsView) =====
  if (subTab === "log") return (
    <div>
      {subNav}
      <WorkoutsView workouts={workouts} setWorkouts={setWorkouts} planIndex={planIndex} trainees={trainees} exercises={exercises} onDecrementSession={onDecrementSession} />
    </div>
  );

  // ===== WORKOUT DETAIL VIEW =====
  if (selectedWo) {
    const wo = clientWorkouts.find(w => w.id === selectedWo);
    if (!wo) { setSelectedWo(null); return null; }

    // Save-and-next: after marking the current workout reviewed, jump to the
    // next unreviewed one in the queue (oldest-first so the trainer works
    // through the backlog) instead of returning to the list. Falls back to
    // the list when the queue is empty. Same flow is bound to Cmd/Ctrl+Enter.
    const findNextUnreviewed = () => {
      const queue = (clientWorkouts || [])
        .filter(w => w.id !== wo.id && !w.reviewedAt)
        .sort((a, b) => new Date(a.date) - new Date(b.date));
      return queue[0]?.id || null;
    };
    const saveAndNext = () => {
      markReviewed && markReviewed(wo.id, true);
      const nextId = findNextUnreviewed();
      if (nextId) {
        setSelectedWo(nextId);
        setExpandedEx(null);
        window.scrollTo(0, 0);
      } else {
        setSelectedWo(null); setExpandedEx(null); window.scrollTo(0, 0);
      }
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
    const remainingAfter = (clientWorkouts || []).filter(w => w.id !== wo.id && !w.reviewedAt).length;
    // Pre-fetch the next two pending workouts' form videos so the next
    // ⌘+Enter / M lands on a clip that's already in the browser cache. We
    // pull cloudUrls from each workout's exercises array (skip pending /
    // failed uploads). Hidden <video preload> tags below trigger the warm.
    const prefetchUrls = (() => {
      const sorted = (clientWorkouts || [])
        .filter(w => w.id !== wo.id && !w.reviewedAt)
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
    const completedSets = wo.exercises.reduce((a, ex) => a + ex.sets.filter(s => s.done).length, 0);
    const totalSets = wo.exercises.reduce((a, ex) => a + ex.sets.length, 0);

    return (
      <div>
        {/* Compare picker: pick second video from the same client */}
        {comparePicker && (
          <div onClick={() => setComparePicker(null)} style={{position:'fixed',inset:0,zIndex:1100,background:C.scrim,display:'flex',alignItems:'flex-start',justifyContent:'center',paddingTop:60,backdropFilter:'blur(4px)'}}>
            <div onClick={e => e.stopPropagation()} style={{background:C.sf,border:`1px solid ${C.bd}`,borderRadius:0,width:520,maxHeight:'80vh',overflow:'auto',padding:20}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
                <h3 style={{margin:0,fontFamily:FN,fontSize:15,color:C.tx}}>Compare with…</h3>
                <button onClick={() => setComparePicker(null)} style={{background:'none',border:'none',color:C.tm,cursor:'pointer',fontSize:16}}>✕</button>
              </div>
              <div style={{fontSize:11,color:C.tm,marginBottom:10}}>{comparePicker.candidates.length} other video{comparePicker.candidates.length===1?'':'s'} from this client:</div>
              {comparePicker.candidates.map((c, i) => (
                <div key={i} onClick={() => { setCompareActive({ left: comparePicker.left, right: { url: c.cloudUrl, label: c.label, title: c.title } }); setComparePicker(null); }}
                  style={{background:'var(--c-sf)',border:`0.25px solid ${C.cardBd}`,borderRadius:0,padding:'10px 14px',marginBottom:6,cursor:'pointer',transition:'border-color .15s'}}
                  onMouseEnter={e => e.currentTarget.style.borderColor = C.ac}
                  onMouseLeave={e => e.currentTarget.style.borderColor = C.bd}>
                  <div style={{fontSize:12,color:C.tx}}>{c.label}</div>
                </div>
              ))}
            </div>
          </div>
        )}
        {/* Compare modal: two players side by side */}
        {compareActive && (
          <CompareModal
            leftLabel={compareActive.left.label} leftUrl={compareActive.left.url} leftTitle={compareActive.left.title}
            rightLabel={compareActive.right.label} rightUrl={compareActive.right.url} rightTitle={compareActive.right.title}
            onClose={() => setCompareActive(null)}
          />
        )}
        <button onClick={() => { setSelectedWo(null); setExpandedEx(null); }}
          style={{background:"none",border:"none",color:C.ac,cursor:"pointer",fontFamily:FB,fontSize:13,padding:0,marginBottom:12}}>
          ← Back to workouts
        </button>

        {/* Workout header */}
        <div style={{background:'var(--c-sf)',border:`0.25px solid ${C.cardBd}`,borderRadius:0,padding:16,marginBottom:16}}>
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
                Week {wo.week} · {wo.dayName} · {new Date(wo.date).toLocaleDateString()}
              </div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:18,fontWeight:700,fontFamily:FN,color:C.gn}}>{completedSets}/{totalSets}</div>
              <div style={{fontSize:9,fontFamily:FN,color:C.tm,letterSpacing:'0.18em'}}>SETS DONE</div>
            </div>
          </div>

          {/* Autoregulation data */}
          {wo.autoregulation && (
            <div style={{display:"flex",gap:12,marginTop:12}}>
              {[['Pain',wo.autoregulation.pain,C.rd],['Energy',wo.autoregulation.energy,C.gn],['Sleep',wo.autoregulation.sleep,C.pu]].map(([l,v,col]) => (
                <div key={l} style={{flex:1,background:'var(--c-sf)',border:`0.25px solid ${C.cardBd}`,borderRadius:0,padding:8,textAlign:"center"}}>
                  <div style={{fontSize:9,fontFamily:FN,color:C.tm,letterSpacing:'0.18em'}}>{l.toUpperCase()}</div>
                  <div style={{fontSize:16,fontWeight:700,fontFamily:FN,color:v?col:C.td}}>{v || '—'}</div>
                </div>
              ))}
            </div>
          )}
          {wo.notes && (
            <div style={{marginTop:10,background:'var(--c-sf)',border:`0.25px solid ${C.cardBd}`,borderRadius:0,padding:10}}>
              <div style={{fontSize:9,fontFamily:FN,color:C.tm,letterSpacing:'0.18em',marginBottom:4}}>ATHLETE NOTES</div>
              <div style={{fontSize:13,color:C.tx}}>{wo.notes}</div>
            </div>
          )}
        </div>

        {/* Exercise cards */}
        {wo.exercises.map((ex, i) => {
          const isExpanded = expandedEx === i;
          const doneSets = ex.sets.filter(s => s.done).length;
          const libId = ex.eid?.startsWith('dyn_') ? ex.eid.slice(4) : ex.eid;
          const fromLib = (exercises || []).find(e => e.id === libId);
          const exName = EX[ex.eid]?.t || fromLib?.title || ex.title || ex.eid;
          const formVideo = wo.formVideos?.[i];
          const currentFocus = getFocus(wo.planName, wo.dayName, ex.eid, wo.week || 1);
          const nextFocus = getFocus(wo.planName, wo.dayName, ex.eid, nextWeek);

          return (
            <div key={i} data-ex-idx={i} style={{background:'var(--c-sf)',border:`${isExpanded?'1px':'0.25px'} solid ${isExpanded?C.ac:C.cardBd}`,borderRadius:0,marginBottom:8,overflow:"hidden"}}>
              {/* Header row — click to expand */}
              <div onClick={() => setExpandedEx(isExpanded?null:i)}
                style={{display:"flex",alignItems:"center",gap:10,padding:"12px 14px",cursor:"pointer"}}>
                <div style={{width:26,height:26,borderRadius:0,background:doneSets===ex.sets.length?C.gnD:C.acD,
                  display:"flex",alignItems:"center",justifyContent:"center",fontFamily:FN,fontSize:11,fontWeight:700,
                  color:doneSets===ex.sets.length?C.gn:C.ac,flexShrink:0}}>{i+1}</div>
                <div style={{flex:1}}>
                  <div style={{fontWeight:600,fontSize:13}}>{exName}</div>
                  <div style={{fontSize:11,color:C.tm,marginTop:2}}>
                    {ex.prescribed} · {doneSets}/{ex.sets.length} sets
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
                <div style={{padding:"0 14px 14px",borderTop:`0.25px solid ${C.cardBd}`}}>
                  {/* Set-by-set data — every column centered for visual symmetry */}
                  <div style={{marginTop:10,marginBottom:12}}>
                    <div style={{display:"grid",gridTemplateColumns:"40px 1fr 1fr 1fr",gap:4,marginBottom:4}}>
                      {['SET','REPS','LOAD','RPE'].map(h =>
                        <div key={h} style={{fontSize:9,fontFamily:FN,color:C.tm,letterSpacing:'0.18em',textAlign:'center'}}>{h}</div>)}
                    </div>
                    {ex.sets.map((set, si) => (
                      <div key={si} style={{display:"grid",gridTemplateColumns:"40px 1fr 1fr 1fr",gap:4,padding:"3px 0",
                        opacity:set.done?1:0.4,borderBottom:si<ex.sets.length-1?`1px solid rgba(127,127,131,0.133)`:'none'}}>
                        <div style={{fontFamily:FN,fontSize:12,color:set.done?C.gn:C.td,textAlign:"center"}}>{set.done?'✓':si+1}</div>
                        <div style={{fontSize:12,color:C.tx,textAlign:'center'}}>{set.reps||'—'}</div>
                        <div style={{fontSize:12,color:C.tx,textAlign:'center'}}>{set.load?set.load+'kg':'—'}</div>
                        <div style={{fontSize:12,color:C.tx,textAlign:'center'}}>{set.rpe||'—'}</div>
                      </div>
                    ))}
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
                                label: `W${w.week} · ${w.dayName} · ${new Date(w.date).toLocaleDateString()}`,
                              };
                            }))
                            .filter(v => v && v.cloudUrl !== formVideo.cloudUrl);
                          if (candidates.length === 0) return null;
                          const leftLabel = `${wo.planName} · W${wo.week} · ${wo.dayName} — ${ex.title || exName} · ${new Date(wo.date).toLocaleDateString()}`;
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
                    <div style={{background:'var(--c-sf)',border:`0.25px solid ${C.cardBd}`,borderRadius:0,padding:10,marginBottom:10,textAlign:"center"}}>
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
                    <textarea dir="auto"
                      value={nextFocus}
                      onChange={e => setFocus(wo.planName, wo.dayName, ex.eid, nextWeek, e.target.value)}
                      placeholder={isLastWeekOfBlock
                        ? `Last week of the block. Anything to carry into the next block? Load ceiling, pattern fixes, etc.`
                        : `Based on this performance, what should they focus on next week?`}
                      style={{...bi,minHeight:50,resize:"vertical",borderColor:nextFocus?rgba(57,189,255,0.251):C.bd,fontSize:12,textAlign:'center'}}
                    />
                    {/* Block weeks mini-view (W1..planWeeks) — adapts to the
                        actual block length. Caps the visible columns at 8 to
                        keep the row readable on long blocks (16w shows 8 then
                        wraps via flex). */}
                    <div style={{display:"grid",gridTemplateColumns:`repeat(${Math.min(planWeeks, 8)},1fr)`,gap:3,marginTop:6}}>
                      {Array.from({length: planWeeks}, (_, i) => i + 1).map(w => {
                        const f = getFocus(wo.planName, wo.dayName, ex.eid, w);
                        const isCurrent = w === currentWeek;
                        const isNext = !isLastWeekOfBlock && w === nextWeek;
                        return (
                          <div key={w} style={{padding:"3px 4px",borderRadius:0,
                            background:isNext?rgba(57,189,255,0.082):isCurrent?rgba(46,213,115,0.063):C.sf2,
                            border:`1px solid ${isNext?rgba(57,189,255,0.251):isCurrent?rgba(46,213,115,0.125):f?rgba(57,189,255,0.082):C.bd}`,
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
          M · MARK + NEXT · &nbsp; J · SKIP · &nbsp; C · COMMENT AT PLAYHEAD
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
            style={{flex:1,padding:"12px 0",borderRadius:0,border:`0.25px solid ${C.cardBd}`,
              background:"transparent",color:C.tx,fontFamily:FN,fontSize:13,fontWeight:700,
              letterSpacing:0.5,cursor:"pointer"}}>
            ← BACK TO REVIEW
          </button>
          {wo.reviewedAt ? (
            findNextUnreviewed() ? (
              <button onClick={() => { const nextId = findNextUnreviewed(); if (nextId) { setSelectedWo(nextId); setExpandedEx(null); window.scrollTo(0,0); } }}
                title="Jump to next pending workout"
                style={{flex:1,padding:"12px 0",borderRadius:0,border:`1px solid ${C.ac}`,
                  background:C.ac,color:"#0a0a0b",fontFamily:FN,fontSize:13,fontWeight:700,
                  letterSpacing:0.5,cursor:"pointer"}}>
                → NEXT PENDING ({remainingAfter})
              </button>
            ) : (
              <button onClick={() => { setSelectedWo(null); setExpandedEx(null); window.scrollTo(0,0); }}
                style={{flex:1,padding:"12px 0",borderRadius:0,border:`1px solid ${C.gn}`,
                  background:C.gn,color:"#0a0a0b",fontFamily:FN,fontSize:13,fontWeight:700,
                  letterSpacing:0.5,cursor:"pointer"}}>
                ✓ REVIEWED — BACK TO LIST
              </button>
            )
          ) : (
            <button onClick={saveAndNext}
              title="Mark reviewed and jump to the next pending workout (⌘/Ctrl + Enter)"
              style={{flex:1,padding:"12px 0",borderRadius:0,border:`1px solid ${C.ac}`,
                background:C.ac,color:"#0a0a0b",fontFamily:FN,fontSize:13,fontWeight:700,
                letterSpacing:0.5,cursor:"pointer"}}>
              ✓ MARK REVIEWED {remainingAfter > 0 ? `& NEXT (${remainingAfter} LEFT)` : '— BACK TO LIST'}
            </button>
          )}
        </div>

        {deleteModal}
      </div>
    );
  }

  // ===== WORKOUT LIST VIEW =====
  const allWorkouts = clientWorkouts.slice().reverse();

  if (allWorkouts.length === 0) return (
    <div>
      {subNav}
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
      {subNav}
      <div style={{fontFamily:FN,fontSize:9,fontWeight:700,color:C.tm,textTransform:'uppercase',letterSpacing:'0.18em',marginBottom:4}}>WORKOUT REVIEW</div>
      <div style={{color:C.tm,fontSize:11,marginBottom:16,fontFamily:FB}}>
        Review completed workouts, watch client form videos, and write focus notes for next week.
      </div>

      {/* Review queue — pending unreviewed workouts (with priority for those that have form videos) */}
      {(() => {
        const queue = (clientWorkouts || []).filter(w => !w.reviewedAt);
        if (queue.length === 0) return null;
        const withVideo = queue.filter(w => w.formVideos?.some(f => f?.cloudUrl)).length;
        return (
          <div style={{
            display:'flex',justifyContent:'space-between',alignItems:'center',
            background:'var(--c-sf)', border:`1px solid ${C.ac}`, borderRadius:0,
            padding:'10px 14px', marginBottom:14,
          }}>
            <div style={{display:'flex',alignItems:'center',gap:10}}>
              <div style={{
                width:28,height:28,borderRadius:0,background:C.acD,
                display:'flex',alignItems:'center',justifyContent:'center',
                fontFamily:FN,fontSize:12,fontWeight:700,color:C.ac,
              }}>{queue.length}</div>
              <div>
                <div style={{fontFamily:FN,fontSize:11,color:C.ac,letterSpacing:1.2,fontWeight:700}}>REVIEW QUEUE</div>
                <div style={{fontFamily:FB,fontSize:11,color:C.tm,marginTop:2}}>
                  {queue.length} pending · {withVideo} with form video{withVideo === 1 ? '' : 's'}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Group by client */}
      {Object.entries(byClient).map(([cid, data]) => (
        <div key={cid} style={{marginBottom:20}}>
          <div style={{fontSize:12,fontFamily:FN,color:C.ac,fontWeight:700,marginBottom:8}}>
            {data.name.toUpperCase()} ({data.workouts.length})
          </div>
          {data.workouts.slice()
            // Unreviewed first (by most-recent date), then reviewed (by most-recent date)
            .sort((a, b) => {
              const ar = a.reviewedAt ? 1 : 0;
              const br = b.reviewedAt ? 1 : 0;
              if (ar !== br) return ar - br;
              return new Date(b.date) - new Date(a.date);
            })
            .map(wo => {
            const doneSets = wo.exercises.reduce((a,ex) => a + ex.sets.filter(s=>s.done).length, 0);
            const totalSets = wo.exercises.reduce((a,ex) => a + ex.sets.length, 0);
            const hasFormVids = wo.formVideos?.some(f => f?.has);
            const reviewed = !!wo.reviewedAt;
            return (
              <div key={wo.id} onClick={() => setSelectedWo(wo.id)}
                style={{background:'var(--c-sf)',border:`0.25px solid ${C.cardBd}`,borderRadius:0,padding:"12px 16px",
                  marginBottom:6,cursor:"pointer",transition:"border-color .15s",display:"flex",
                  justifyContent:"space-between",alignItems:"center",opacity:reviewed?0.55:1}}
                onMouseEnter={e=>e.currentTarget.style.borderColor=C.ac}
                onMouseLeave={e=>e.currentTarget.style.borderColor=C.cardBd}>
                <div style={{minWidth:0,flex:1}}>
                  <div style={{fontWeight:600,fontSize:14,display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                    {wo.dayName}
                    <span style={{fontWeight:400,color:C.tm,fontSize:12}}>{wo.planName}</span>
                    {reviewed && (
                      <span style={{fontSize:8,fontFamily:FN,color:C.gn,fontWeight:700,letterSpacing:0.5,
                        padding:"1px 5px",borderRadius:0,border:`1px solid rgba(46,213,115,0.251)`,background:C.gnD}}>
                        ✓ REVIEWED
                      </span>
                    )}
                  </div>
                  <div style={{fontSize:11,color:C.tm,marginTop:2}}>
                    W{wo.week} · {new Date(wo.date).toLocaleDateString()} · {doneSets}/{totalSets} sets
                    {hasFormVids && <span style={{color:C.gn,marginLeft:4}}>📹</span>}
                  </div>
                </div>
                <div style={{display:'flex',alignItems:'center',gap:10,marginLeft:8,flexShrink:0}}>
                  <div style={{width:64,display:'flex',justifyContent:'flex-end'}}>
                    {deleteWorkout && (
                      <button onClick={(e) => { e.stopPropagation(); setDeleteConfirmFor(wo.id); setDeleteConfirmText(''); }}
                        title="Delete this workout"
                        style={{background:'var(--c-sf)',border:`1px solid ${C.rd||'#c94444'}40`,color:C.rd||'#ff6b6b',
                          borderRadius:0,padding:'2px 8px',fontFamily:FN,fontSize:11,fontWeight:600,cursor:'pointer',lineHeight:1.4}}>
                        DELETE
                      </button>
                    )}
                  </div>
                  <span style={{color:reviewed?C.td:C.ac,fontSize:12,width:64,textAlign:'right',display:'inline-block',whiteSpace:'nowrap',flexShrink:0}}>{reviewed?'View →':'Review →'}</span>
                </div>
              </div>
            );
          })}
        </div>
      ))}
      {deleteModal}
    </div>
  );
}
