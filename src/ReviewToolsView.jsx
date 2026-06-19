// REVIEW · TOOLS — the camera/pose video suite as its own coach surface,
// reached from the Review ▾ nav dropdown (Workouts / Tools). Every tool is a
// fullscreen MediaPipe / three.js modal, lazy-loaded on demand so the heavy
// pose + 3D code stays out of the main bundle until a coach actually opens one.
// Owner trial — nothing here writes to the athlete.
import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { C, FN, FB } from './theme';
import { SectionIcon } from './ui';

const MovementLab   = lazy(() => import('./MovementLab'));
const ARFormOverlay = lazy(() => import('./ARFormOverlay'));

// Four tools, one job each. The first three run off a RECORDED clip (record or
// upload — so no camera is mandatory); only LIVE COACH needs a live camera, and
// it folds in what used to be the separate rep counter. `needsTitle` tools use
// the exercise name above; `live` tools are disabled when there's no camera API.
const REVIEW_TOOLS = [
  { key: 'lab',     label: 'MOVEMENT LAB', icon: 'cube',
    measures: 'Rotatable 3D skeleton rebuilt from the lift',
    useWhen: 'See a movement in 3D — orbit it, scrub the rep, read joint angles.',
    needsTitle: true,  live: false },
  { key: 'metrics', label: 'LIFT METRICS', icon: 'trendingUp',
    measures: 'Bar speed (VBT) + velocity-loss · ROM + tempo + collapse flags',
    useWhen: 'Pull the numbers off a recorded set — fatigue, depth, tempo.',
    needsTitle: true,  live: false },
  { key: 'jump',    label: 'JUMP TEST', icon: 'zap',
    measures: 'Jump height from flight time · estimated peak power',
    useWhen: 'Test lower-body power. Enter bodyweight for watts.',
    needsTitle: false, live: false },
  { key: 'live',    label: 'LIVE COACH', icon: 'camera',
    measures: 'Real-time reps + depth target + bar-path drift on the live feed',
    useWhen: 'Coach a set as it happens — feedback before the rep ends.',
    needsTitle: true,  live: true },
];

const LAST_TOOL_KEY = 'expo-review-tools-last';

const hasCameraApi = () =>
  typeof navigator !== 'undefined' &&
  !!navigator.mediaDevices &&
  typeof navigator.mediaDevices.getUserMedia === 'function';

// Shared fullscreen stage — the loading overlay and the error card paint on the
// SAME black backdrop the tools themselves use (position:fixed inset:0
// zIndex:1500), so opening a tool is one continuous surface, never a flash.
const stage = {
  position: 'fixed', inset: 0, background: '#000', zIndex: 1500,
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
};
const ghostBtn = {
  background: 'transparent', border: '1px solid rgba(255,255,255,0.3)',
  color: '#FFF', fontFamily: FN, fontSize: 11, fontWeight: 700,
  letterSpacing: '0.18em', padding: '11px 22px', cursor: 'pointer', borderRadius: 0,
};

// Scoped boundary: a tool chunk failing (offline, CDN hiccup, WebGL/camera
// unavailable) must NOT take down the whole coach app the way the top-level
// boundary would — it would replace the entire page and force a reload. Catch
// it here, recover in place, let the coach close and pick another tool. Resets
// itself whenever the active tool changes (precedent: WorkoutReview's
// FormVideoErrorBoundary).
class ToolBoundary extends React.Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err) { try { console.error('[EXPO] review-tool load error:', err); } catch { /* noop */ } }
  componentDidUpdate(prev) {
    if (prev.toolKey !== this.props.toolKey && this.state.err) this.setState({ err: null });
  }
  render() {
    if (this.state.err) {
      return (
        <div style={stage}>
          <div style={{ maxWidth: 420, textAlign: 'center' }}>
            <div style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, color: 'var(--c-rd, #FF4757)', letterSpacing: '0.18em', marginBottom: 12 }}>TOOL FAILED TO LOAD</div>
            <div style={{ color: '#FFF', fontFamily: FB, fontSize: 14, lineHeight: 1.55, marginBottom: 20 }}>
              This tool needs WebGL and (for live tools) a camera. If you're
              offline or the browser blocked access, that's the cause. Close and
              try again, or pick another tool.
            </div>
            <button onClick={this.props.onClose} style={ghostBtn}>✕ CLOSE</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// Branded fullscreen loading state — replaces a null Suspense fallback so
// clicking a tool gives instant feedback instead of 1–2s of dead air while the
// MediaPipe / three.js chunk downloads and the pose engine warms up.
function ToolLoading({ label }) {
  return (
    <div style={stage}>
      <style>{'@keyframes rtspin{to{transform:rotate(360deg)}}'}</style>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: 34, height: 34, margin: '0 auto 16px', borderRadius: '50%',
          border: '2px solid rgba(255,255,255,0.16)', borderTopColor: C.ac,
          animation: 'rtspin .7s linear infinite',
        }} />
        <div style={{ fontFamily: FN, fontSize: 11, fontWeight: 700, color: '#FFF', letterSpacing: '0.18em' }}>LOADING {label}…</div>
        <div style={{ fontFamily: FB, fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 6 }}>warming up pose engine</div>
      </div>
    </div>
  );
}

// One tool = one full-width list row (icon · name + what it measures · tags ·
// OPEN). Editorial/linear layout — no nested card, no "use when" clutter — so
// the launcher reads calm. Hover paints a soft cyan wash; live tools without a
// camera are dimmed and marked.
function ToolRow({ t, blocked, isLast, onOpen }) {
  const [hover, setHover] = useState(false);
  const active = hover && !blocked;
  return (
    <div
      role="button" tabIndex={blocked ? -1 : 0} aria-disabled={blocked || undefined}
      aria-label={`${t.label} — ${t.measures}`}
      onClick={blocked ? undefined : onOpen}
      onKeyDown={blocked ? undefined : (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 16, padding: '16px 12px',
        borderTop: `1px solid ${C.cardBd}`, cursor: blocked ? 'not-allowed' : 'pointer',
        opacity: blocked ? 0.55 : 1, background: active ? 'rgba(57,189,255,0.05)' : 'transparent',
        transition: 'background .15s', outline: 'none',
      }}>
      <div style={{ width: 40, height: 40, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(57,189,255,0.1)' }}>
        <SectionIcon kind={t.icon} color={C.ac} size={18} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: FN, fontSize: 14, fontWeight: 700, letterSpacing: '0.03em', color: C.tx }}>{t.label}</div>
        <div style={{ fontFamily: FB, fontSize: 12, color: C.tm, marginTop: 3, lineHeight: 1.4 }}>{t.measures}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        {isLast && <span style={{ fontFamily: FN, fontSize: 8, fontWeight: 700, letterSpacing: '0.12em', color: C.bg, background: C.ac, padding: '2px 6px' }}>LAST</span>}
        <span style={{ fontFamily: FN, fontSize: 8, fontWeight: 700, letterSpacing: '0.1em', color: t.live ? '#FF7A7A' : C.tm, border: `1px solid ${t.live ? 'rgba(255,90,90,0.5)' : C.cardBd}`, padding: '2px 6px', whiteSpace: 'nowrap' }}>{t.live ? 'LIVE' : 'CLIP'}</span>
        <span style={{ fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: blocked ? '#FF4757' : C.ac, transform: active ? 'translateX(3px)' : 'none', transition: 'transform .15s', whiteSpace: 'nowrap' }}>{blocked ? 'NEEDS CAMERA' : 'OPEN →'}</span>
      </div>
    </div>
  );
}

export default function ReviewToolsView() {
  const [title, setTitle] = useState('Squat');
  const [tool, setTool]   = useState(null); // 'lab' | 'metrics' | 'jump' | 'live' | null
  const [lastKey, setLastKey] = useState(null);
  const camOk = useRef(hasCameraApi());

  // Restore the last tool the coach used (label only — never auto-open, that
  // would hijack the camera).
  useEffect(() => {
    try { setLastKey(localStorage.getItem(LAST_TOOL_KEY)); } catch { /* noop */ }
  }, []);

  // Lock body scroll while a fullscreen tool is mounted so the page behind
  // can't rubber-band on touch underneath the camera.
  useEffect(() => {
    if (!tool) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [tool]);

  const open = (key) => {
    setTool(key);
    setLastKey(key);
    try { localStorage.setItem(LAST_TOOL_KEY, key); } catch { /* noop */ }
  };
  const close = () => setTool(null);

  const activeTool = REVIEW_TOOLS.find(t => t.key === tool);

  return (
    <div className="motion-rise" style={{ maxWidth: 760 }}>
      <div style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, color: C.tm, textTransform: 'uppercase', letterSpacing: '0.2em', marginBottom: 8 }}>REVIEW · TOOLS</div>
      <h2 style={{ fontFamily: FB, fontSize: 26, fontWeight: 800, letterSpacing: '-0.01em', color: C.tx, margin: '0 0 8px' }}>Measure the lift</h2>
      <div style={{ color: C.tm, fontSize: 13, marginBottom: 22, fontFamily: FB, maxWidth: 560, lineHeight: 1.5 }}>
        Camera &amp; pose tools to read a set you're reviewing — bar speed, range
        of motion, jump power, live coaching. Owner trial; nothing is saved to
        the athlete.
      </div>

      {/* Exercise name — drives the label/overlay for Lab / Metrics / Live.
          Jump auto-labels itself, so this is scoped to the other three. */}
      <div style={{ marginBottom: 22, maxWidth: 380 }}>
        <label htmlFor="rt-exercise" style={{ display: 'block', fontFamily: FN, fontSize: 9, color: C.td, letterSpacing: '0.16em', fontWeight: 700, marginBottom: 7, textTransform: 'uppercase' }}>Exercise · for Lab / Metrics / Live</label>
        <input id="rt-exercise" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Back Squat"
          style={{ width: '100%', boxSizing: 'border-box', background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, color: C.tx, fontFamily: FB, fontSize: 14, padding: '11px 13px', borderRadius: 0, outline: 'none' }} />
      </div>

      {/* Tools as a calm linear list — hairline-divided full-width rows. */}
      <div style={{ borderBottom: `1px solid ${C.cardBd}` }}>
        {REVIEW_TOOLS.map(t => (
          <ToolRow key={t.key} t={t} blocked={t.live && !camOk.current} isLast={t.key === lastKey} onOpen={() => open(t.key)} />
        ))}
      </div>

      {tool && (
        <ToolBoundary toolKey={tool} onClose={close}>
          <Suspense fallback={<ToolLoading label={activeTool ? activeTool.label : 'TOOL'} />}>
            {tool === 'lab'     && <MovementLab exerciseTitle={title || 'Squat'} initialMode="analyze" initialView="3d" toolLabel="MOVEMENT LAB" onClose={close} />}
            {tool === 'metrics' && <MovementLab exerciseTitle={title || 'Squat'} initialMode="analyze" initialView="metrics" toolLabel="LIFT METRICS" onClose={close} />}
            {tool === 'jump'    && <MovementLab exerciseTitle="Vertical Jump" initialMode="jump" onClose={close} />}
            {tool === 'live'    && <ARFormOverlay exerciseTitle={title || 'Squat'} onClose={close} />}
          </Suspense>
        </ToolBoundary>
      )}
    </div>
  );
}
