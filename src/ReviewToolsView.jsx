// REVIEW · TOOLS — the camera/pose video suite as its own coach surface,
// reached from the Review ▾ nav dropdown (Workouts / Tools). Every tool is a
// fullscreen MediaPipe / three.js modal, lazy-loaded on demand so the heavy
// pose + 3D code stays out of the main bundle until a coach actually opens one.
// Owner tools. Trends stay on this device; SEND TO ATHLETE writes one coach note on the picked clip (4.10 #530).
import React, { useState, useEffect, useRef, useMemo, lazy, Suspense } from 'react';
import { useT, tr, readLang } from './i18n';
import { createPortal } from 'react-dom';
import { C, FN, FB } from './theme';
import { Card, ChipGrid } from './ui';
import { FormVideoPlayer } from './WorkoutReview';
import ErrorBoundary from './ErrorBoundary';
import { useAthletePlans } from './usePlansStore';

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
      const week = (w.week != null && w.week !== '') ? `${tr(readLang(), 'Week')} ${w.week}` : `${tr(readLang(), 'Week')} —`;
      const day = w.dayName || 'Day';
      if (!A.has(cid)) A.set(cid, new Map());
      const B = A.get(cid);
      if (!B.has(block)) B.set(block, new Map());
      const W = B.get(block);
      if (!W.has(week)) W.set(week, new Map());
      const D = W.get(week);
      if (!D.has(day)) D.set(day, []);
      D.get(day).push({ title, url: fv.cloudUrl, date: w.date, cid, eid: ex && ex.eid, wid: w.id, slot: i,
        recorded: (ex && Array.isArray(ex.sets) ? ex.sets.map(s => parseFloat(s.reps)).filter(n => isFinite(n)) : []) });
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
  const tt = useT();
  const tree = useMemo(() => buildClipTree(workouts, trainees), [workouts, trainees]);
  const [a, setA] = useState(''); const [b, setB] = useState('');
  const [w, setW] = useState(''); const [d, setD] = useState(''); const [e, setE] = useState('');
  const athlete = a !== '' ? tree[a] : null;
  const block = athlete && b !== '' ? athlete.blocks[b] : null;
  const week = block && w !== '' ? block.weeks[w] : null;
  const day = week && d !== '' ? week.days[d] : null;
  // On-demand load the picked athlete's plans so we can show the PRESCRIBED
  // (target) reps next to the camera count + what he logged. Owner-only read.
  const { plans, load: loadPlans } = useAthletePlans();
  useEffect(() => { if (athlete?.cid) loadPlans(athlete.cid); }, [athlete?.cid, loadPlans]);
  const targetFor = (ex) => {
    if (!plans || !block || !day || !ex) return null;
    const plan = plans.find(p => (p.name || '') === (block.block || ''));
    const pd = plan?.days?.find(x => (x.name || '').trim() === (day.day || '').trim());
    if (!pd?.exercises) return null;
    // Prefer an exact id match (robust to duplicate/generic day + exercise names,
    // per adversarial review); fall back to title only if the clip has no eid.
    const pe = (ex.eid && pd.exercises.find(x => x.exerciseId === ex.eid))
      || pd.exercises.find(x => (x.title || '').trim().toLowerCase() === (ex.title || '').trim().toLowerCase());
    if (!pe) return null;
    // Wave-loaded programs prescribe per WEEK (ex.wk = ["8","6","4",...], index
    // 0 = week 1; client_workouts.week is 1-based). Reading pe.reps alone showed
    // the base prescription for every week, so the camera tool's target never
    // moved through the wave (audit 08-22 #90).
    const wkIdx = Number(week && week.week) - 1;
    if (Array.isArray(pe.wk) && wkIdx >= 0 && wkIdx < pe.wk.length) {
      const v = pe.wk[wkIdx];
      if (v != null && String(v).trim() !== '') return String(v);
    }
    return pe.reps != null && pe.reps !== '' ? String(pe.reps) : null;
  };

  // the five choices are ONE joined grid (10.10 #648): equal cells, 36px, one frame, hairlines
  const sel = { width: '100%', minWidth: 0, height: 36, boxSizing: 'border-box', background: 'var(--c-sf)', border: 'none', color: C.tx, fontFamily: FB, fontSize: 13, padding: '0 10px', borderRadius: 0, outline: 'none', cursor: 'pointer' };
  const selDim = { ...sel, color: C.td, cursor: 'default' };

  const onE = (v) => { setE(v); const ex = day && v !== '' ? day.exercises[v] : null; if (ex) onPick(ex.url, ex.title, ex.cid, ex.date, ex.recorded, targetFor(ex), ex.wid, ex.slot); };
  // RECENT CLIPS, ONE TAP (4.10 #530, Ohad: "the tools in expo can be 10x better"):
  // reaching a clip took five dropdowns in a row (athlete, block, week, day,
  // exercise). The newest recorded sets across every athlete are listed first;
  // a tap sets the same five choices and loads the clip. The dropdowns stay for
  // anything older.
  const recent = useMemo(() => {
    const out = [];
    tree.forEach((A, ai) => A.blocks.forEach((B, bi) => B.weeks.forEach((W, wi) => W.days.forEach((D, di) => D.exercises.forEach((X, xi) => {
      out.push({ ai, bi, wi, di, xi, name: A.name, ex: X });
    })))));
    return out.sort((x, y) => String(y.ex.date || '').localeCompare(String(x.ex.date || ''))).slice(0, 8);
  }, [tree]);
  const pickRecent = (r) => {
    setA(String(r.ai)); setB(String(r.bi)); setW(String(r.wi)); setD(String(r.di)); setE(String(r.xi));
    onPick(r.ex.url, r.ex.title, r.ex.cid, r.ex.date, r.ex.recorded, null, r.ex.wid, r.ex.slot);
  };
  // the prescription arrives with the athlete's programs - say it once it is known
  const lastEmit = useRef('');
  useEffect(() => {
    const ex = day && e !== '' ? day.exercises[e] : null;
    if (!ex || !plans) return;
    const t = targetFor(ex);
    const sig = `${ex.url}|${t}`;
    if (t != null && lastEmit.current !== sig) { lastEmit.current = sig; onPick(ex.url, ex.title, ex.cid, ex.date, ex.recorded, t, ex.wid, ex.slot); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plans, day, e]);
  const shortDate = (iso) => { const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}` : ''; };

  // REBUILT FROM THE RULES (10.10 #648, Ohad: "literally everything on this page is horrible ...
  // there's 0 rules applied here"): one card, its strip the card's top; one short note; the recent
  // clips the card's full width with one right column (date · action), no row fills; the older clips
  // as one joined 36px grid.
  const total = tree.reduce((n, A) => n + A.blocks.reduce((m, B) => m + B.weeks.reduce((k, W) => k + W.days.reduce((j, D) => j + D.exercises.length, 0), 0), 0), 0);
  const miniLabel = { fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.tm };
  return (
    <Card header={tt('Load a reviewed clip')} headerRight={tree.length ? <span style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--c-stripTx)', whiteSpace: 'nowrap' }}>{tt('{n} clips').replace('{n}', total)}</span> : null} style={{ marginBottom: 16 }}>
      <div style={{ fontFamily: FB, fontSize: 13, color: C.tm, lineHeight: 1.45, marginBottom: tree.length ? 14 : 0 }}>
        {tree.length ? tt('A recorded set, then a tool - no re-upload.') : tt("No recorded form videos yet — athletes' uploaded clips will appear here to analyse.")}
      </div>
      {recent.length > 0 && (
        <div style={{ border: `1px solid ${C.cardBd}`, marginBottom: 14 }}>
          <div style={{ ...miniLabel, display: 'flex', alignItems: 'center', height: 32, padding: '0 12px', borderBottom: `1px solid ${C.cardBd}` }}>{tt('Recent clips')}</div>
          {recent.map((r, i) => {
            const on = activeUrl && r.ex.url === activeUrl;
            return (
              <button key={r.ex.url + i} type="button" onClick={() => pickRecent(r)} aria-pressed={!!on} className="rt-clip"
                style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 52px 72px', columnGap: 12, alignItems: 'center', width: '100%', minHeight: 48, padding: '6px 12px', boxSizing: 'border-box', background: 'transparent', border: 'none', borderTop: i ? `1px solid ${C.cardBd}` : 'none', boxShadow: on ? `inset 2px 0 0 ${C.ac}` : 'none', cursor: 'pointer', textAlign: 'start', color: C.tx, borderRadius: 0 }}>
                <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                  <span style={{ fontFamily: FN, fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', minWidth: 0, overflowWrap: 'anywhere' }}><bdi>{r.ex.title}</bdi></span>
                  <span style={{ fontFamily: FB, fontSize: 12, color: C.tm, minWidth: 0, overflowWrap: 'anywhere' }}><bdi>{r.name}</bdi></span>
                </span>
                <span dir="ltr" style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', color: C.tm, textAlign: 'end', fontVariantNumeric: 'tabular-nums' }}>{shortDate(r.ex.date)}</span>
                <span style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: on ? C.gn : C.ac, textAlign: 'end', whiteSpace: 'nowrap' }}>{on ? tt('Loaded') : tt('Load')}</span>
              </button>
            );
          })}
        </div>
      )}
      {tree.length > 0 && (<>
        <div style={{ ...miniLabel, marginBottom: 6 }}>{tt('Older clips')}</div>
        <div className="rt-picker" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 1, background: C.cardBd, border: `1px solid ${C.cardBd}` }}>
          <select value={a} onChange={ev => { setA(ev.target.value); setB(''); setW(''); setD(''); setE(''); }} style={sel} aria-label={tt('Athlete…')}>
            <option value="">{tt('Athlete…')}</option>
            {tree.map((x, i) => <option key={x.cid} value={i}>{x.name}</option>)}
          </select>
          <select value={b} disabled={!athlete} onChange={ev => { setB(ev.target.value); setW(''); setD(''); setE(''); }} style={athlete ? sel : selDim} aria-label={tt('Block…')}>
            <option value="">{tt('Block…')}</option>
            {athlete?.blocks.map((x, i) => <option key={i} value={i}>{x.block}</option>)}
          </select>
          <select value={w} disabled={!block} onChange={ev => { setW(ev.target.value); setD(''); setE(''); }} style={block ? sel : selDim} aria-label={tt('Week…')}>
            <option value="">{tt('Week…')}</option>
            {block?.weeks.map((x, i) => <option key={i} value={i}>{x.week}</option>)}
          </select>
          <select value={d} disabled={!week} onChange={ev => { setD(ev.target.value); setE(''); }} style={week ? sel : selDim} aria-label={tt('Day…')}>
            <option value="">{tt('Day…')}</option>
            {week?.days.map((x, i) => <option key={i} value={i}>{x.day}</option>)}
          </select>
          <select value={e} disabled={!day} onChange={ev => onE(ev.target.value)} style={day ? sel : selDim} aria-label={tt('Exercise…')}>
            <option value="">{tt('Exercise…')}</option>
            {day?.exercises.map((x, i) => <option key={i} value={i}>{x.title}</option>)}
          </select>
        </div>
      </>)}
    </Card>
  );
}

// Common lifts — quick-pick chips that set the analysed movement. The pose
// engine keyword-matches this name to decide which joints to read, so picking
// the right lift is what makes the ROM/tempo/depth numbers meaningful.
const QUICK_LIFTS = ['Squat', 'Bench Press', 'Deadlift', 'Overhead Press', 'Row', 'Pull-Up'];

const MovementLab   = lazy(() => import('./MovementLab'));
const ARFormOverlay = lazy(() => import('./ARFormOverlay'));
const ShotAnalyzer  = lazy(() => import('./ShotAnalyzer'));

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
    measures: 'Bar speed (VBT) + per-goal stop-set cutoff · ROM/tempo/collapse · L/R symmetry',
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
  // Basketball — record/upload a jump shot; pose on every frame → phases
  // (dip · set · release · apex · follow-through) → 9-checkpoint scorecard
  // → FIX GUIDE (what / why / how). Engine: shotAnalysis.js.
  { key: 'shot',    label: 'SHOT ANALYZER', icon: 'target',
    measures: 'Jump-shot mechanics, phase by phase · does the release repeat across the set',
    useWhen: 'Break a shooter’s form down and hand him the fix guide. Film a set, not one shot — the spread across reps is the coachable part.',
    needsTitle: false, live: false },
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
  color: 'var(--c-stripTx)', fontFamily: FN, fontSize: 11, fontWeight: 700,
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
            <div style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, color: 'var(--c-rd, #FF4757)', letterSpacing: '0.18em', marginBottom: 12 }}>{tr(readLang(), 'TOOL FAILED TO LOAD')}</div>
            <div style={{ color: 'var(--c-stripTx)', fontFamily: FB, fontSize: 14, lineHeight: 1.55, marginBottom: 20 }}>
              This tool needs WebGL and (for live tools) a camera. If you're
              offline or the browser blocked access, that's the cause. Close and
              try again, or pick another tool.
            </div>
            <button onClick={this.props.onClose} style={ghostBtn}>← {tr(readLang(), 'BACK')}</button>
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
  const tt = useT();
  return (
    <div style={stage}>
      <style>{'@keyframes rtspin{to{transform:rotate(360deg)}}'}</style>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: 34, height: 34, margin: '0 auto 16px', borderRadius: '50%',
          border: '2px solid rgba(255,255,255,0.16)', borderTopColor: C.ac,
          animation: 'rtspin .7s linear infinite',
        }} />
        <div style={{ fontFamily: FN, fontSize: 11, fontWeight: 700, color: 'var(--c-stripTx)', letterSpacing: '0.18em' }}>{tt('LOADING')} {label}…</div>
        <div style={{ fontFamily: FB, fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 6 }}>{tt('warming up pose engine')}</div>
      </div>
    </div>
  );
}

// One tool = one full-width list row (icon · name + what it measures · tags ·
// OPEN). Editorial/linear layout — no nested card, no "use when" clutter — so
// the launcher reads calm. Hover paints a soft cyan wash; live tools without a
// camera are dimmed and marked.
function ToolRow({ t, blocked, isFirst, onOpen }) {
  const tt = useT();
  return (
    <div
      role="button" tabIndex={blocked ? -1 : 0} aria-disabled={blocked || undefined}
      aria-label={`${tr(readLang(), t.label)} — ${tr(readLang(), t.measures)}`}
      onClick={blocked ? undefined : onOpen}
      onKeyDown={blocked ? undefined : (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
      className="rt-tool"
      style={{
        display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 112px', columnGap: 12, alignItems: 'center', minHeight: 64, padding: '10px 0',
        boxSizing: 'border-box', borderTop: isFirst ? 'none' : `1px solid ${C.cardBd}`, cursor: blocked ? 'not-allowed' : 'pointer',
        opacity: blocked ? 0.55 : 1, outline: 'none',
      }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: FN, fontSize: 13, fontWeight: 700, letterSpacing: '0.06em', color: C.tx }}>
          {tt(t.label)}
        </div>
        <div style={{ fontFamily: FB, fontSize: 12, color: C.tm, marginTop: 4, lineHeight: 1.4 }}>{tt(t.measures)}</div>
      </div>
      <span style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: blocked ? C.or : C.ac, textAlign: 'end', whiteSpace: 'nowrap' }}>{tt(blocked ? 'NEEDS CAMERA' : 'OPEN →')}</span>
    </div>
  );
}

export default function ReviewToolsView({ clientWorkouts = [], trainees = [], updateFormVideos = null }) {
  const tt = useT();
  // NO GUESSED EXERCISE (27.9, Ohad: "auto detection doesnt work and shouldnt
  // be there"): the name is the one the clip was LOGGED under, or empty; the
  // movement itself is picked inside the tool.
  const [title, setTitle] = useState('');
  const [clipUrl, setClipUrl] = useState(null); // a picked reviewed-clip URL → fed into the tools
  const [clipMeta, setClipMeta] = useState({ clientId: null, date: null, recorded: [], target: null, wid: null, slot: null }); // athlete+date+logged+prescribed of the picked clip
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

  // SEND TO ATHLETE (4.10 #530): the analysis lands as a coach note at 0:00 on
  // the clip it was read from - the same note, the same save path (a three-way
  // merged, queued-if-offline write) as one typed in Review, so he sees it where
  // he sees every note. Only when the clip's workout + slot are known.
  const sendNote = (clipMeta.wid && clipMeta.slot != null && updateFormVideos) ? async (text) => {
    const wo = (clientWorkouts || []).find((w) => w.id === clipMeta.wid);
    if (!wo || !Array.isArray(wo.formVideos) || !wo.formVideos[clipMeta.slot]) return false;
    const note = { id: 'rn_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36), ts: 0, text, author: 'trainer', createdAt: new Date().toISOString(), replies: [], drawings: [] };
    const updated = wo.formVideos.map((fv, i) => (i === clipMeta.slot ? { ...fv, reviewNotes: [...((fv && fv.reviewNotes) || []), note] } : fv));
    return (await updateFormVideos(clipMeta.wid, updated)) || 'failed';   // 'saved' | 'queued' | 'failed'
  } : null;

  return (
    <div className="motion-rise" style={{ width: '100%' }}>
      <ReviewedClipPicker workouts={clientWorkouts} trainees={trainees} activeUrl={clipUrl}
        onPick={(url, t, cid, date, recorded, target, wid, slot) => { setClipUrl(url); if (t) setTitle(t); setClipMeta({ clientId: cid || null, date: date || null, recorded: recorded || [], target: target || null, wid: wid || null, slot: Number.isInteger(slot) ? slot : null }); }} />

      {clipUrl ? (
        /* the clip on the left (sticky), the lift and the tools on the right, top-aligned with it */
        <div className="rt-work" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>
          <div key={clipUrl} style={{ minWidth: 0, position: 'sticky', top: 12 }}>
            <FormVideoPlayer url={clipUrl} exerciseTitle={title || 'Exercise'} />
          </div>
          <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* the lift: the six as one grid and "any lift" as its last row - one joined control */}
            <Card header={tt('Lift being analysed')}>
              <ChipGrid ariaLabel={tt('Lift being analysed')} value={title.trim().toLowerCase()} onChange={(k) => setTitle(QUICK_LIFTS.find(l => l.toLowerCase() === k))} cols={3} phoneCols={2}
                items={QUICK_LIFTS.map(l => ({ k: l.toLowerCase(), label: l }))} />
              <input value={title} onChange={e => setTitle(e.target.value)} placeholder={tt('…or type any lift')} aria-label={tt('…or type any lift')}
                style={{ display: 'block', width: '100%', height: 36, boxSizing: 'border-box', background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderTop: 'none', color: C.tx, fontFamily: FB, fontSize: 13, padding: '0 12px', borderRadius: 0, outline: 'none' }} />
            </Card>
            <Card header={tt('TOOLS')}>
              {REVIEW_TOOLS.map((t, i) => (
                <ToolRow key={t.key} t={t} blocked={t.live && !camOk.current} isFirst={i === 0} onOpen={() => open(t.key)} />
              ))}
            </Card>
          </div>
        </div>
      ) : (
        <Card header={tt('TOOLS')}>
          {REVIEW_TOOLS.map((t, i) => (
            <ToolRow key={t.key} t={t} blocked={t.live && !camOk.current} isFirst={i === 0} onOpen={() => open(t.key)} />
          ))}
        </Card>
      )}

      {tool && createPortal((
        <ToolBoundary toolKey={tool} onClose={close}>
          {/* The camera tools are the most complex components in the app and
              they were rendering with NO error boundary - only Suspense, which
              catches a slow import, not a throw. One bad frame of pose data or
              a null landmark in render took the whole Review Tools screen down
              with it, in front of a coach mid-session. A boundary per tool
              means a failure costs that tool, not the screen.
              Keyed on the tool so switching tools clears a previous error. */}
          <ErrorBoundary key={tool || 'none'} inline>
          <Suspense fallback={<ToolLoading label={activeTool ? activeTool.label : 'TOOL'} />}>
            {tool === 'lab'     && <MovementLab exerciseTitle={title || ''} initialMode="analyze" initialView="3d" toolLabel="MOVEMENT LAB" initialClipUrl={clipUrl} onClose={close} />}
            {tool === 'metrics' && <MovementLab exerciseTitle={title || ''} initialMode="analyze" initialView="metrics" toolLabel="LIFT METRICS" initialClipUrl={clipUrl} vaultClientId={clipMeta.clientId} vaultDate={clipMeta.date} recordedReps={clipMeta.recorded} targetReps={clipMeta.target} onSendNote={clipUrl ? sendNote : null} onClose={close} />}
            {tool === 'jump'    && <MovementLab exerciseTitle={title || 'Vertical Jump'} initialMode="jump" initialClipUrl={clipUrl} vaultClientId={clipUrl ? clipMeta.clientId : null} vaultDate={clipUrl ? clipMeta.date : null} onSendNote={clipUrl ? sendNote : null} onClose={close} />}
            {tool === 'live'    && <ARFormOverlay exerciseTitle={title || ''} onClose={close} />}
            {/* Camera / gallery ONLY — the reviewed-clip picker never feeds the
                shot tool (Ohad 08-23: no previously-uploaded EXPO videos). */}
            {tool === 'shot'    && <ShotAnalyzer onClose={close} />}
          </Suspense>
          </ErrorBoundary>
        </ToolBoundary>
      ), document.body)}
    </div>
  );
}
