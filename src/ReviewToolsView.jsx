// REVIEW · TOOLS — the camera/pose video suite as its own coach surface,
// reached from the Review ▾ nav dropdown (Workouts / Tools). Every tool is a
// fullscreen MediaPipe / three.js modal, lazy-loaded on demand so the heavy
// pose + 3D code stays out of the main bundle until a coach actually opens one.
// Owner trial — nothing here writes to the athlete.
import React, { useState, useEffect, useRef, useMemo, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { C, FN, FB } from './theme';
import { RefinedHeaderStrip, SectionLabel } from './ui';
import { FormVideoPlayer } from './WorkoutReview';

// Build the reviewed-clip cascade tree from the coach's client workouts:
// athlete → block (planName) → week → day → [exercises that carry a cloud clip].
// Only form videos with a cloudUrl are included, so every exercise the coach can
// pick genuinely has a playable video (Ohad). Read-only; no plan join needed —
// week/day/planName/exercise title all live on the workout object.
function buildClipTree(workouts, trainees) {
  const nameOf = (cid) => {
    const t = (trainees || []).find(x => x.id === cid);
    if (t) return t.name;
    const base = String(cid || '').split('__')[0];   // couple sub-member id
    const p = (trainees || []).find(x => x.id === base);
    return p ? p.name : (cid || '—');
  };
  const A = new Map();
  for (const w of workouts || []) {
    if (!Array.isArray(w.formVideos)) continue;
    for (let i = 0; i < w.formVideos.length; i++) {
      const fv = w.formVideos[i];
      if (!fv || !fv.cloudUrl) continue;
      const ex = Array.isArray(w.exercises) ? w.exercises[i] : null;
      const title = (ex && (ex.title || ex.name)) || `Exercise ${i + 1}`;
      const cid = w.clientId || '—';
      const block = w.planName || 'Program';
      const week = (w.week != null && w.week !== '') ? `Week ${w.week}` : 'Week —';
      const day = w.dayName || 'Day';
      if (!A.has(cid)) A.set(cid, new Map());
      const B = A.get(cid);
      if (!B.has(block)) B.set(block, new Map());
      const W = B.get(block);
      if (!W.has(week)) W.set(week, new Map());
      const D = W.get(week);
      if (!D.has(day)) D.set(day, []);
      D.get(day).push({ title, url: fv.cloudUrl });
    }
  }
  return [...A.entries()].map(([cid, B]) => ({
    cid, name: nameOf(cid),
    blocks: [...B.entries()].map(([block, W]) => ({
      block,
      weeks: [...W.entries()].map(([week, D]) => ({
        week, days: [...D.entries()].map(([day, exercises]) => ({ day, exercises })),
      })),
    })),
  })).sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

// Cascading picker — five selects that narrow athlete → block → week → day →
// exercise; choosing an exercise hands its clip URL + name up to the tools.
function ReviewedClipPicker({ workouts, trainees, onPick, activeUrl }) {
  const tree = useMemo(() => buildClipTree(workouts, trainees), [workouts, trainees]);
  const [a, setA] = useState(''); const [b, setB] = useState('');
  const [w, setW] = useState(''); const [d, setD] = useState(''); const [e, setE] = useState('');
  const athlete = a !== '' ? tree[a] : null;
  const block = athlete && b !== '' ? athlete.blocks[b] : null;
  const week = block && w !== '' ? block.weeks[w] : null;
  const day = week && d !== '' ? week.days[d] : null;

  const sel = { flex: '1 1 130px', minWidth: 0, boxSizing: 'border-box', background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, color: C.tx, fontFamily: FB, fontSize: 13, padding: '9px 11px', borderRadius: 0, outline: 'none', cursor: 'pointer' };
  const selDim = { ...sel, color: C.td, cursor: 'default', opacity: 0.6 };

  const onE = (v) => { setE(v); const ex = day && v !== '' ? day.exercises[v] : null; if (ex) onPick(ex.url, ex.title); };

  if (!tree.length) {
    return (
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', fontFamily: FN, fontSize: 9, color: C.td, letterSpacing: '0.16em', fontWeight: 700, marginBottom: 6, textTransform: 'uppercase' }}>Load a reviewed clip</label>
        <div style={{ fontFamily: FB, fontSize: 12, color: C.tm, border: `1px dashed ${C.cardBd}`, padding: '10px 12px' }}>No recorded form videos yet — athletes' uploaded clips will appear here to analyse.</div>
      </div>
    );
  }
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', fontFamily: FN, fontSize: 9, color: C.td, letterSpacing: '0.16em', fontWeight: 700, marginBottom: 3, textTransform: 'uppercase' }}>Load a reviewed clip</label>
      <div style={{ fontFamily: FB, fontSize: 11, color: C.tm, marginBottom: 9, maxWidth: 480, lineHeight: 1.4 }}>
        Pick an athlete's already-recorded set — only exercises with a video are listed — and the tools analyse it directly, no re-upload.
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxWidth: 720 }}>
        <select value={a} onChange={ev => { setA(ev.target.value); setB(''); setW(''); setD(''); setE(''); }} style={sel}>
          <option value="">Athlete…</option>
          {tree.map((x, i) => <option key={x.cid} value={i}>{x.name}</option>)}
        </select>
        <select value={b} disabled={!athlete} onChange={ev => { setB(ev.target.value); setW(''); setD(''); setE(''); }} style={athlete ? sel : selDim}>
          <option value="">Block…</option>
          {athlete?.blocks.map((x, i) => <option key={i} value={i}>{x.block}</option>)}
        </select>
        <select value={w} disabled={!block} onChange={ev => { setW(ev.target.value); setD(''); setE(''); }} style={block ? sel : selDim}>
          <option value="">Week…</option>
          {block?.weeks.map((x, i) => <option key={i} value={i}>{x.week}</option>)}
        </select>
        <select value={d} disabled={!week} onChange={ev => { setD(ev.target.value); setE(''); }} style={week ? sel : selDim}>
          <option value="">Day…</option>
          {week?.days.map((x, i) => <option key={i} value={i}>{x.day}</option>)}
        </select>
        <select value={e} disabled={!day} onChange={ev => onE(ev.target.value)} style={day ? sel : selDim}>
          <option value="">Exercise…</option>
          {day?.exercises.map((x, i) => <option key={i} value={i}>{x.title}</option>)}
        </select>
      </div>
      {activeUrl && (
        // The full Review player, inline — video + skeleton toggle + speed/loop +
        // LIFT METRICS + 3D + rep-range selection, the exact experience Ohad wants
        // ("built perfectly like in a reviewed video"). Reused, not rebuilt.
        <div key={activeUrl} style={{ marginTop: 14 }}>
          <FormVideoPlayer url={activeUrl} exerciseTitle={(day && e !== '' && day.exercises[e]?.title) || 'Exercise'} />
        </div>
      )}
    </div>
  );
}

// Common lifts — quick-pick chips that set the analysed movement. The pose
// engine keyword-matches this name to decide which joints to read, so picking
// the right lift is what makes the ROM/tempo/depth numbers meaningful.
const QUICK_LIFTS = ['Squat', 'Bench Press', 'Deadlift', 'Overhead Press', 'Row', 'Pull-Up'];

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
            <button onClick={this.props.onClose} style={ghostBtn}>← BACK</button>
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
function ToolRow({ t, blocked, isFirst, onOpen }) {
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
        display: 'flex', alignItems: 'center', gap: 16, padding: '15px 4px',
        borderTop: isFirst ? 'none' : `1px solid ${C.cardBd}`, cursor: blocked ? 'not-allowed' : 'pointer',
        opacity: blocked ? 0.55 : 1, background: active ? 'rgba(57,189,255,0.05)' : 'transparent',
        transition: 'background .15s', outline: 'none',
      }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: FN, fontSize: 14, fontWeight: 700, letterSpacing: '0.03em', color: C.tx }}>{t.label}</div>
        <div style={{ fontFamily: FB, fontSize: 12, color: C.tm, marginTop: 3, lineHeight: 1.4 }}>{t.measures}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <span style={{ fontFamily: FN, fontSize: 8, fontWeight: 700, letterSpacing: '0.1em', color: t.live ? C.ac : C.tm, border: `1px solid ${t.live ? 'rgba(57,189,255,0.5)' : C.cardBd}`, padding: '2px 6px', whiteSpace: 'nowrap' }}>{t.live ? 'LIVE' : 'CLIP'}</span>
        <span style={{ fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: blocked ? C.or : C.ac, transform: active ? 'translateX(3px)' : 'none', transition: 'transform .15s', whiteSpace: 'nowrap' }}>{blocked ? 'NEEDS CAMERA' : 'OPEN →'}</span>
      </div>
    </div>
  );
}

export default function ReviewToolsView({ clientWorkouts = [], trainees = [] }) {
  const [title, setTitle] = useState('Squat');
  const [clipUrl, setClipUrl] = useState(null); // a picked reviewed-clip URL → fed into the tools
  const [tool, setTool]   = useState(null); // 'lab' | 'metrics' | 'jump' | 'live' | null
  const camOk = useRef(hasCameraApi());

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
    // Remember the last tool used (not auto-opened — that would hijack the camera).
    try { localStorage.setItem(LAST_TOOL_KEY, key); } catch { /* noop */ }
  };
  const close = () => setTool(null);

  const activeTool = REVIEW_TOOLS.find(t => t.key === tool);

  return (
    <div className="motion-rise" style={{ width: '100%' }}>
      {/* Header card — cyan strip + intro + the lift selector, matching the
          coach app's card/strip pattern (was a bespoke editorial layout). */}
      <div style={{ marginBottom: 16, background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, padding: '14px 18px' }}>
        <RefinedHeaderStrip padY={14} padX={18} marginBottom={14}>
          <SectionLabel as="div" style={{ color: '#FFFFFF', fontSize: C.alertLabelSize }}>MEASURE THE LIFT</SectionLabel>
        </RefinedHeaderStrip>
        <div style={{ color: C.tm, fontSize: 13, fontFamily: FB, lineHeight: 1.5, maxWidth: 620, marginBottom: 16 }}>
          Camera &amp; pose tools to read a set you're reviewing — bar speed, range
          of motion, jump power, live coaching. Owner trial; nothing is saved to
          the athlete.
        </div>

        {/* Reviewed-clip picker — cascade to an already-recorded form video and
            analyse it directly (Ohad). Sets the lift name + hands the clip URL to
            the tools. The manual lift selector below is the fallback / live path. */}
        <ReviewedClipPicker workouts={clientWorkouts} trainees={trainees} activeUrl={clipUrl}
          onPick={(url, t) => { setClipUrl(url); if (t) setTitle(t); }} />

        {/* The lift being analysed drives which joints the pose engine reads.
            When a clip is picked above, it's set AUTOMATICALLY from that exercise
            — Ohad: "I don't want to have to pick" — so we just show it read-only.
            Only when there's NO clip (live / manual) do we surface the picker. */}
        {clipUrl ? (
          <div>
            <label style={{ display: 'block', fontFamily: FN, fontSize: 9, color: C.td, letterSpacing: '0.16em', fontWeight: 700, marginBottom: 5, textTransform: 'uppercase' }}>Lift being analysed</label>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, maxWidth: '100%', background: 'var(--c-sf2)', border: `1px solid ${C.cardBd}`, padding: '9px 13px', borderRadius: 0 }}>
              <span style={{ fontFamily: FB, fontSize: 14, fontWeight: 600, color: C.tx, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
              <span style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', color: C.ac, whiteSpace: 'nowrap' }}>· AUTO</span>
            </div>
          </div>
        ) : (<>
          <label htmlFor="rt-exercise" style={{ display: 'block', fontFamily: FN, fontSize: 9, color: C.td, letterSpacing: '0.16em', fontWeight: 700, marginBottom: 3, textTransform: 'uppercase' }}>Lift being analysed</label>
          <div style={{ fontFamily: FB, fontSize: 11, color: C.tm, marginBottom: 9, maxWidth: 480, lineHeight: 1.4 }}>
            Tells the pose engine which joints to read — squat reads knee/hip depth, bench reads elbow lockout.
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
            {QUICK_LIFTS.map(l => {
              const on = title.trim().toLowerCase() === l.toLowerCase();
              return (
                <button key={l} onClick={() => setTitle(l)} type="button"
                  style={{ background: on ? 'var(--c-sf2)' : 'transparent', border: `1px solid ${on ? C.ac : C.cardBd}`, color: on ? C.ac : C.tm, fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', padding: '6px 12px', cursor: 'pointer', borderRadius: 0, textTransform: 'uppercase' }}>{l}</button>
              );
            })}
          </div>
          <input id="rt-exercise" value={title} onChange={e => setTitle(e.target.value)} placeholder="…or type any lift, e.g. Front Squat"
            style={{ width: '100%', maxWidth: 380, boxSizing: 'border-box', background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, color: C.tx, fontFamily: FB, fontSize: 14, padding: '10px 13px', borderRadius: 0, outline: 'none' }} />
        </>)}
      </div>

      {/* Tools card — hairline-divided rows inside the standard surface card. */}
      <div style={{ background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, padding: '14px 18px' }}>
        <RefinedHeaderStrip padY={14} padX={18} marginBottom={4}>
          <SectionLabel as="div" style={{ color: '#FFFFFF', fontSize: C.alertLabelSize }}>TOOLS</SectionLabel>
        </RefinedHeaderStrip>
        {REVIEW_TOOLS.map((t, i) => (
          <ToolRow key={t.key} t={t} blocked={t.live && !camOk.current} isFirst={i === 0} onOpen={() => open(t.key)} />
        ))}
      </div>

      {tool && createPortal((
        <ToolBoundary toolKey={tool} onClose={close}>
          <Suspense fallback={<ToolLoading label={activeTool ? activeTool.label : 'TOOL'} />}>
            {tool === 'lab'     && <MovementLab exerciseTitle={title || 'Squat'} initialMode="analyze" initialView="3d" toolLabel="MOVEMENT LAB" initialClipUrl={clipUrl} onClose={close} />}
            {tool === 'metrics' && <MovementLab exerciseTitle={title || 'Squat'} initialMode="analyze" initialView="metrics" toolLabel="LIFT METRICS" initialClipUrl={clipUrl} onClose={close} />}
            {tool === 'jump'    && <MovementLab exerciseTitle="Vertical Jump" initialMode="jump" initialClipUrl={clipUrl} onClose={close} />}
            {tool === 'live'    && <ARFormOverlay exerciseTitle={title || 'Squat'} onClose={close} />}
          </Suspense>
        </ToolBoundary>
      ), document.body)}
    </div>
  );
}
