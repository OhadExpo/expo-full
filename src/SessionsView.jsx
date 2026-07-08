// SessionsView.jsx — /coach/sessions. The EXPO Performance Center floor tool.
//
// Ohad's organizing rule (2026-06-12): everything about the physical gym floor
// lives under ONE "Sessions" surface — live floor view + group-session grid +
// check-in are this page, not separate routes.
//
// Flow: start a session → add 4–7 athletes, each on a program + day → check
// them in on arrival → log every athlete's sets in one grid → finish, which
// writes each athlete's completed work to client_workouts in the SAME shape
// the athlete portal uses (so it shows up in History / Review / Overload).
//
// Active session persists to the `store` table (key expo-gym-session) so a
// reload mid-session doesn't lose the floor. Camera tools (Movement Lab, AR
// overlay) launch per-athlete from here but are separate surfaces.

import React, { useEffect, useMemo, useState, useCallback, useRef, Suspense, lazy } from 'react';
import { createPortal } from 'react-dom';
import { C, FN, FB, FH } from './theme';
import { supabase } from './supabase';
import { RefinedHeaderStrip, toast, confirmToast } from './ui';
import { traineeIdsFor } from './traineeUtils';

// "Single athlete" reuses the existing in-person coach logger (WorkoutsView).
// It writes to the coach `workouts` table (NOT client_workouts), which the
// athlete portal never reads — so it stays trial-safe. The camera/pose tools
// (Movement Lab, AR Form) do NOT live here — they're their own surface under
// Review › Tools, where a coach reviews a recorded lift. Sessions is for
// logging the session. Lazy so the Sessions menu loads instantly.
const WorkoutsView = lazy(() => import('./WorkoutsView'));

const SKEY = 'expo-gym-session';       // active session (coach-only)
const LOGKEY = 'expo-gym-session-log'; // finished trial sessions (coach-only)
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
const fresh = () => ({ reps: '', load: '', rpe: '', done: false });

// Inline exercise video for the group grid. Plays in place — never navigates
// away or goes fullscreen (Ohad: "just play and pause, no clicking on the
// youtube video at all"). YouTube: sandboxed iframe (no allow-popups /
// allow-top-navigation → links can't navigate the page) + fs=0 (no fullscreen).
// Direct files: <video controlsList="nofullscreen">.
const ytId = (url) => {
  const m = String(url || '').match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/);
  return m ? m[1] : null;
};
function InlineVideo({ url }) {
  const yt = ytId(url);
  if (yt) {
    const short = /youtube\.com\/shorts\//i.test(String(url || ''));  // vertical → portrait frame
    return (
      <div style={{ marginTop: 8, aspectRatio: short ? '9/16' : '16/9', background: '#000', border: `1px solid ${C.cardBd}`, ...(short ? { maxWidth: 260, marginLeft: 'auto', marginRight: 'auto' } : {}) }}>
        <iframe
          src={`https://www.youtube.com/embed/${yt}?rel=0&modestbranding=1&controls=1&fs=0&disablekb=1&playsinline=1`}
          sandbox="allow-scripts allow-same-origin allow-presentation"
          allow="autoplay"
          title="exercise video"
          style={{ width: '100%', height: '100%', border: 'none', display: 'block' }} />
      </div>
    );
  }
  if (/\.(mp4|webm|mov|m4v)(\?|$)/i.test(url || '')) {
    return (
      <video src={url} controls playsInline controlsList="nofullscreen nodownload" disablePictureInPicture
        style={{ width: '100%', marginTop: 8, aspectRatio: '16/9', background: '#000', border: `1px solid ${C.cardBd}`, objectFit: 'contain' }} />
    );
  }
  return null;
}

// SESSIONS — the mode comes from the nav dropdown (Sessions ▾ → Group | Single),
// not an in-page menu. GROUP = 4–7 grid (big-screen, no camera). SINGLE = the
// existing coach logger + the camera/Movement tools for the 1-on-1.
export default function SessionsView({ mode = 'group', ...props }) {
  if (mode === 'single') {
    return (
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <Suspense fallback={<div style={{ padding: 30, textAlign: 'center', color: C.td }}>Loading…</div>}>
          <WorkoutsView workouts={props.workouts} setWorkouts={props.setWorkouts} planIndex={props.planIndex}
            trainees={props.trainees} exercises={props.exercises} onDecrementSession={props.onDecrementSession}
            clientWorkouts={props.clientWorkouts} setClientWorkouts={props.setClientWorkouts} />
        </Suspense>
      </div>
    );
  }
  return <GroupSessions trainees={props.trainees} planIndex={props.planIndex} exercises={props.exercises} clientWorkouts={props.clientWorkouts} setClientWorkouts={props.setClientWorkouts} workouts={props.workouts} />;
}

function GroupSessions({ trainees = [], planIndex = [], exercises = [], clientWorkouts = [], setClientWorkouts, workouts = [], onBack }) {
  const [session, setSession] = useState(null); // { id, startedAt, athletes: [...] }
  const [loaded, setLoaded] = useState(false);
  const [picking, setPicking] = useState(false);
  const [planDays, setPlanDays] = useState({}); // planId → days[] (for live tempo/video/cue lookup)
  const saveTimer = useRef(null);

  const exById = useMemo(() => {
    const m = new Map();
    for (const e of exercises) m.set(e.id, e);
    return m;
  }, [exercises]);
  const traineeById = useMemo(() => Object.fromEntries(trainees.map(t => [t.id, t])), [trainees]);
  // Previous-week reference per (athlete|plan|day): the most-recent logged
  // session's sets per exercise, so the grid can show a per-set ghost like the
  // portal/Single. Keyed by `${clientId}|${planName}|${dayName}` → Map(eid→sets).
  const prevByKey = useMemo(() => {
    const tmp = {}; // key includes WEEK so a W2 card shows W1, W3 shows W2, etc.
    for (const w of (clientWorkouts || [])) {
      const k = `${w.clientId}|${w.planName}|${w.dayName}|${Number(w.week) || 1}`;
      if (!tmp[k] || new Date(w.date || 0) > new Date(tmp[k].date || 0)) tmp[k] = w;
    }
    const out = {};
    for (const [k, w] of Object.entries(tmp)) {
      const m = new Map();
      for (const ex of (w.exercises || [])) { const id = ex.exerciseId || ex.eid; if (id && !m.has(id)) m.set(id, ex.sets || []); }
      out[k] = m;
    }
    return out;
  }, [clientWorkouts]);
  // Next un-logged week for an athlete on a plan+day (finished W1 → 2), capped.
  const nextWeekFor = (traineeId, planName, dayName, planWeeks) => {
    const wks = (clientWorkouts || []).filter(x => x.clientId === traineeId && x.planName === planName && x.dayName === dayName).map(x => Number(x.week) || 1);
    const max = wks.length ? Math.max(...wks) : 0;
    return Math.min(Number(planWeeks) || 8, Math.max(1, max + 1));
  };

  // Load plan day-data for everyone in the session so each card can resolve
  // tempo / video / cue LIVE from the source of truth — not from a snapshot
  // taken at add-time (which old sessions lack, and which goes stale). This is
  // why video/tempo were missing.
  useEffect(() => {
    const ids = [...new Set((session?.athletes || []).map(a => a.planId).filter(Boolean))].filter(id => !planDays[id]);
    if (!ids.length) return;
    (async () => {
      try {
        const { data } = await supabase.from('plans').select('id,data').in('id', ids);
        if (data?.length) setPlanDays(prev => { const n = { ...prev }; for (const p of data) n[p.id] = p.data?.days || []; return n; });
      } catch {}
    })();
  }, [session]); // eslint-disable-line react-hooks/exhaustive-deps
  // `${planId}|${eid}` → { tempo, videoUrl, cue } resolved from the plan + library.
  const exDetail = useMemo(() => {
    const out = {};
    for (const [pid, days] of Object.entries(planDays)) {
      for (const d of (days || [])) {
        for (const ex of (d.exercises || d.ex || [])) {
          const eid = ex.exerciseId || ex.eid || '';
          if (!eid) continue;
          const lib = exById.get(eid);
          out[`${pid}|${eid}`] = {
            tempo: ex.tempo ?? '',
            videoUrl: ex.videoUrl ?? ex.vid ?? lib?.videoLink ?? '',
            cue: ex.notes ?? ex.n ?? lib?.cues ?? '',
          };
        }
      }
    }
    return out;
  }, [planDays, exById]);

  // ---- load / persist active session ----
  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.from('store').select('value').eq('key', SKEY).maybeSingle();
        if (data?.value && Array.isArray(data.value.athletes)) setSession(data.value);
      } catch {}
      setLoaded(true);
    })();
  }, []);
  const persist = useCallback((next) => {
    setSession(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      supabase.from('store').upsert({ key: SKEY, value: next, updated_at: new Date().toISOString() }).then(() => {}, () => {});
    }, 400);
  }, []);

  const mutate = useCallback((fn) => {
    persist((() => { const draft = structuredClone(session); fn(draft); return draft; })());
  }, [session, persist]);

  // ---- add athletes ----
  const addAthletes = useCallback(async (picks) => {
    // picks: [{ traineeId, planId, dayIdx, dayName }]
    const planIds = [...new Set(picks.map(p => p.planId))];
    let planData = {};
    if (planIds.length) {
      try {
        const { data } = await supabase.from('plans').select('id,name,data').in('id', planIds);
        for (const p of data || []) planData[p.id] = p;
      } catch {}
    }
    const athletes = picks.map(p => {
      const plan = planData[p.planId];
      const days = plan?.data?.days || [];
      const day = days[p.dayIdx] || {};
      const week = Number(p.week) || 1;
      const wi = week - 1; // 0-indexed into per-week arrays
      const exList = (day.exercises || day.ex || []).map((ex) => {
        const eid = ex.exerciseId || ex.eid || '';
        const lib = exById.get(eid);
        const title = ex.title || lib?.title || lib?.t || '?';
        // Plans that vary reps/sets per week store ex.wk / ex.wkS arrays — use
        // the chosen week's value (fixes "3x>" where the base reps is a
        // placeholder), else the base.
        const reps = (Array.isArray(ex.wk) && ex.wk[wi] != null && ex.wk[wi] !== '') ? ex.wk[wi] : (ex.reps ?? ex.r ?? '');
        const setCount = Number((Array.isArray(ex.wkS) && ex.wkS[wi] != null) ? ex.wkS[wi] : (ex.sets ?? ex.s)) || 3;
        const tempo = ex.tempo ?? '';
        const videoUrl = ex.videoUrl ?? ex.vid ?? lib?.videoLink ?? '';
        return { eid, title, reps, tempo, videoUrl, prescribed: `${setCount}×${reps}`, sets: Array.from({ length: Math.max(1, setCount) }, fresh) };
      });
      return {
        rowId: uid(),
        traineeId: p.traineeId,
        planId: p.planId,
        planName: plan?.name || '',
        planWeeks: Number(plan?.weeks) || undefined,
        dayName: day.name || p.dayName || 'Session',
        week,
        checkedIn: false,
        curEx: 0,
        exercises: exList,
      };
    });
    const next = session
      ? { ...session, athletes: [...session.athletes, ...athletes] }
      : { id: uid(), startedAt: new Date().toISOString(), athletes };
    persist(next);
    setPicking(false);
  }, [session, persist, exById]);

  const finishSession = useCallback(async () => {
    if (!session) return;
    const finishedAt = new Date().toISOString();
    const completed = session.athletes
      .map(a => {
        const exDone = a.exercises.filter(ex => ex.sets.some(s => s.done));
        if (!exDone.length) return null;
        return {
          id: 'cw_' + uid(),
          clientId: a.traineeId,
          planName: a.planName,
          dayName: a.dayName,
          week: Number(a.week) || nextWeekFor(a.traineeId, a.planName, a.dayName, a.planWeeks),
          date: finishedAt, completedAt: finishedAt,
          notes: 'Logged in group session',
          formVideos: [], reviewedAt: finishedAt, source: 'group-session',
          exercises: a.exercises.map(ex => ({
            eid: ex.eid, title: ex.title, prescribed: ex.prescribed,
            sets: ex.sets.filter(s => s.done).map(s => ({ reps: s.reps, load: s.load, rpe: s.rpe, done: true })),
            substitution: null,
          })).filter(ex => ex.sets.length),
        };
      })
      .filter(Boolean);
    if (!completed.length) {
      if (!(await confirmToast('No sets are marked done. End the session anyway (nothing will be saved)?', { okLabel: 'End', cancelLabel: 'Keep going' }))) return;
    } else if (setClientWorkouts) {
      // Unified with Single + Portal: write to client_workouts so each athlete's
      // group-session work shows in their portal History, coach page, and feeds
      // the previous-week ghost — same store all three logging surfaces use.
      setClientWorkouts(prev => [...prev, ...completed]);
    }
    // Cancel any pending debounced upsert so it can't re-create the row we're
    // about to delete — otherwise a set edited just before FINISH resurrects the
    // finished session on next load. (audit)
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    try { await supabase.from('store').delete().eq('key', SKEY); } catch {}
    setSession(null);
    if (completed.length) toast(`${completed.length} athlete${completed.length === 1 ? '' : 's'} logged to their history`, 'success', { ttl: 4000 });
  }, [session, clientWorkouts, setClientWorkouts]);

  // Cancel a pending debounced session upsert on unmount (a late write after
  // navigating away could otherwise revive a cleared session). (audit)
  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  if (!loaded) return <div style={{ padding: 30, textAlign: 'center', color: C.td }}>Loading…</div>;

  // ---- no active session ----
  if (!session) {
    return (
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <BackBar label="GROUP SESSION" onBack={onBack} />
        <Card title="START A GROUP SESSION">
          <div style={{ padding: '8px 2px 14px', color: C.tm, fontSize: 13, lineHeight: 1.6 }}>
            Add the athletes training now, check them in as they arrive, and log all their sets in one grid. Built to run on a big screen on the floor.
          </div>
          <button onClick={() => setPicking(true)} style={primaryBtn}>+ START SESSION</button>
        </Card>
        {picking && <AthletePicker trainees={trainees} planIndex={planIndex} clientWorkouts={clientWorkouts} onCancel={() => setPicking(false)} onConfirm={addAthletes} />}
      </div>
    );
  }

  // ---- live floor (no camera tools here — group runs on a shared screen) ----
  const checkedIn = session.athletes.filter(a => a.checkedIn).length;
  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <FloorBar session={session} checkedIn={checkedIn} traineeById={traineeById}
        onAdd={() => setPicking(true)} onFinish={finishSession} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12, marginTop: 12 }}>
        {session.athletes.map((a, ai) => (
          <AthleteCard key={a.rowId} a={a} name={(traineeById[a.traineeId]?.name) || a.traineeId}
            prevMap={prevByKey[`${a.traineeId}|${a.planName}|${a.dayName}|${(Number(a.week) || 1) - 1}`]} exDetail={exDetail}
            onToggleIn={() => mutate(d => { d.athletes[ai].checkedIn = !d.athletes[ai].checkedIn; })}
            onSet={(ei, si, patch) => mutate(d => { Object.assign(d.athletes[ai].exercises[ei].sets[si], patch); })}
            onCurEx={(ei) => mutate(d => { d.athletes[ai].curEx = ei; })}
            onRemove={() => mutate(d => { d.athletes.splice(ai, 1); })}
          />
        ))}
      </div>
      {picking && <AthletePicker trainees={trainees} planIndex={planIndex} existing={session.athletes.map(a => a.traineeId)} clientWorkouts={clientWorkouts} onCancel={() => setPicking(false)} onConfirm={addAthletes} />}
    </div>
  );
}

// ---- live floor summary bar ----
function FloorBar({ session, checkedIn, traineeById, onAdd, onFinish }) {
  return (
    <div style={{ background: 'var(--c-sf)', border: `1px solid ${C.cardBd}` }}>
      <RefinedHeaderStrip padY={14} padX={14} marginBottom={0}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <span style={{ fontWeight: 700, fontSize: 13, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#FFF' }}>
            ON THE FLOOR · {checkedIn}/{session.athletes.length} CHECKED IN
          </span>
          <div style={{ display: 'flex', gap: 0 }}>
            <button onClick={onAdd} style={stripBtn}>+ ADD</button>
            <button onClick={onFinish} style={{ ...stripBtn, borderLeft: 'none' }}>■ FINISH</button>
          </div>
        </div>
      </RefinedHeaderStrip>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: 12 }}>
        {session.athletes.map(a => {
          const cur = a.exercises[a.curEx];
          return (
            <div key={a.rowId} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 10px', background: a.checkedIn ? 'rgba(57,189,255,0.08)' : 'var(--c-sf)', border: `1px solid ${a.checkedIn ? C.ac : C.cardBd}` }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: a.checkedIn ? C.gn : C.td }} />
              <span style={{ fontFamily: FN, fontSize: 12, fontWeight: 700, color: C.tx }}>{(traineeById[a.traineeId]?.name) || a.traineeId}</span>
              <span style={{ fontFamily: FN, fontSize: 10, color: C.tm, letterSpacing: '0.04em' }}>{a.checkedIn ? (cur ? `→ ${cur.title}` : '—') : 'not in'}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---- per-athlete logging card ----
function AthleteCard({ a, name, prevMap, exDetail, onToggleIn, onSet, onCurEx, onRemove }) {
  const COLS = '16px 1fr 1fr 0.8fr 30px';
  return (
    <div style={{ background: 'var(--c-sf)', border: `1px solid ${a.checkedIn ? C.ac : C.cardBd}`, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderBottom: `1px solid ${C.cardBd}` }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: FN, fontSize: 13, fontWeight: 700, color: C.tx, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
          <div style={{ fontFamily: FN, fontSize: 10, color: C.tm, letterSpacing: '0.04em' }}>{a.dayName}{a.week ? ` · W${a.week}` : ''}</div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
          <button onClick={onToggleIn} style={{ ...miniBtn, minWidth: 72, textAlign: 'center', display: 'inline-flex', justifyContent: 'center', background: a.checkedIn ? C.gn : 'transparent', color: a.checkedIn ? '#FFF' : C.tm, border: `1px solid ${a.checkedIn ? C.gn : C.cardBd}` }}>{a.checkedIn ? '✓ IN' : 'CHECK IN'}</button>
          <button onClick={async () => { if (await confirmToast(`Remove ${name || 'this athlete'} from the floor?`, { okLabel: 'Remove', cancelLabel: 'Keep' })) onRemove(); }} title="Remove from session" style={{ ...miniBtn, color: C.rd, border: `1px solid ${C.cardBd}` }}>✕</button>
        </div>
      </div>
      <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {a.exercises.length === 0 && <div style={{ color: C.td, fontSize: 12, padding: 8, textAlign: 'center' }}>No exercises on this day.</div>}
        {a.exercises.map((ex, ei) => {
          const prevSets = prevMap?.get(ex.eid);
          const det = exDetail?.[`${a.planId}|${ex.eid}`] || {};
          const tempo = ex.tempo || det.tempo || '';
          const videoUrl = ex.videoUrl || det.videoUrl || '';
          const cue = det.cue || '';
          const open = a.curEx === ei;
          const doneCount = ex.sets.filter(s => s.done).length;
          const allDone = doneCount === ex.sets.length && ex.sets.length > 0;
          return (
          <div key={ei} style={{ border: `1px solid ${open ? C.ac : C.cardBd}`, borderLeft: `3px solid ${allDone ? C.gn : open ? C.ac : C.cardBd}`, background: open ? 'rgba(57,189,255,0.04)' : 'transparent' }}>
            {/* Collapsed header — tap to expand (accordion: one open at a time).
                Title WRAPS on whole words instead of truncating. */}
            <div onClick={() => onCurEx(open ? -1 : ei)} style={{ padding: 8, cursor: 'pointer' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <span style={{ fontFamily: FB, fontSize: 12.5, color: C.tx, fontWeight: 600, minWidth: 0, whiteSpace: 'normal', overflowWrap: 'break-word', lineHeight: 1.3 }}>
                  {allDone && <span style={{ color: C.gn, marginRight: 4 }}>✓</span>}{ex.title}
                </span>
                <span style={{ color: '#FFF', fontSize: 12, flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>▾</span>
              </div>
              {/* Prescription on its own line — clear, not crammed beside the
                  wrapping title. SETS × REPS + a muted done-count. */}
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
                <span style={{ fontFamily: FN, fontSize: 13, fontWeight: 700, letterSpacing: '0.02em', color: C.ac }}>{ex.prescribed}</span>
                <span style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', color: allDone ? C.gn : C.tm }}>{doneCount}/{ex.sets.length} DONE</span>
              </div>
            </div>
            {open && (
            <div style={{ padding: '0 8px 8px' }} onClick={e => e.stopPropagation()}>
              {tempo && !String(ex.prescribed || '').includes(tempo) && <div style={{ fontFamily: FN, fontSize: 11, color: C.or, letterSpacing: '0.04em', marginBottom: 4 }}>⏱ {tempo}</div>}
              {cue && <div style={{ fontSize: 11.5, color: C.tx, lineHeight: 1.45, marginBottom: 6, background: 'rgba(57,189,255,0.06)', borderInlineStart: `3px solid ${C.ac}`, padding: '6px 8px', direction: /[֐-׿]/.test(cue) ? 'rtl' : 'ltr', fontFamily: /[֐-׿]/.test(cue) ? FH : FB, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{cue}</div>}
              {videoUrl && <InlineVideo url={videoUrl} />}
              <div style={{ display: 'grid', gridTemplateColumns: COLS, gap: 4, marginTop: 8, marginBottom: 2 }}>
                {['', 'KG', 'REPS', 'RPE', '✓'].map(h => <span key={h} style={{ fontFamily: FN, fontSize: 8, fontWeight: 700, letterSpacing: '0.06em', color: C.tm, textAlign: 'center' }}>{h}</span>)}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {ex.sets.map((s, si) => {
                  const prior = prevSets?.[si];
                  return (
                  <React.Fragment key={si}>
                    {prior && (parseFloat(prior.load) > 0 || prior.reps) && (
                      <div style={{ display: 'grid', gridTemplateColumns: COLS, gap: 4, alignItems: 'center', opacity: 0.6, marginTop: si === 0 ? 0 : 4 }} title="Previous week">
                        <span style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, color: C.ac, textAlign: 'center' }}>‹</span>
                        <span style={{ fontFamily: FB, fontSize: 11, color: C.tx, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{parseFloat(prior.load) || '—'}</span>
                        <span style={{ fontFamily: FB, fontSize: 11, color: C.tx, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{prior.reps || '—'}</span>
                        <span style={{ fontFamily: FB, fontSize: 11, color: C.tx, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{prior.rpe || '—'}</span>
                        <span />
                      </div>
                    )}
                    <div style={{ display: 'grid', gridTemplateColumns: COLS, gap: 4, alignItems: 'center' }}>
                      <span style={{ fontFamily: FN, fontSize: 10, color: C.td, textAlign: 'center' }}>{si + 1}</span>
                      <input value={s.load} onChange={e => onSet(ei, si, { load: e.target.value })} placeholder="kg" inputMode="decimal" style={cell} />
                      <input value={s.reps} onChange={e => onSet(ei, si, { reps: e.target.value })} placeholder="reps" inputMode="numeric" style={cell} />
                      <input value={s.rpe} onChange={e => onSet(ei, si, { rpe: e.target.value })} placeholder="—" inputMode="decimal" style={cell} />
                      <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                        <input type="checkbox" checked={!!s.done} onChange={e => onSet(ei, si, { done: e.target.checked })} style={{ width: 20, height: 20, accentColor: C.gn, cursor: 'pointer' }} />
                      </label>
                    </div>
                  </React.Fragment>
                  );
                })}
              </div>
            </div>
            )}
          </div>
          );
        })}
      </div>
    </div>
  );
}

// ---- athlete + program + day picker ----
function AthletePicker({ trainees, planIndex, existing = [], clientWorkouts = [], onCancel, onConfirm }) {
  const [rows, setRows] = useState([]); // { traineeId, planId, dayIdx, week }
  const active = trainees.filter(t => t.status !== 'Archived' && !existing.includes(t.id));
  const plansFor = (traineeId) => {
    const ids = traineeIdsFor(traineeId);
    return planIndex.filter(p => ids.includes(p.traineeId));
  };
  // Default week = the athlete's next un-logged week for that plan+day (finished
  // W1 → W2), capped at the block length.
  const dfltWeek = (r) => {
    const plan = planIndex.find(p => p.id === r.planId);
    const dayName = plan?.dayNames?.[r.dayIdx] || '';
    const wks = (clientWorkouts || []).filter(x => x.clientId === r.traineeId && x.planName === plan?.name && x.dayName === dayName).map(x => Number(x.week) || 1);
    const max = wks.length ? Math.max(...wks) : 0;
    return Math.min(Number(plan?.weeks) || 8, Math.max(1, max + 1));
  };
  const blockNum = (name) => { const m = String(name || '').match(/#\s*(\d+)/); return m ? Number(m[1]) : -1; };
  // The athlete's NEXT workout. "Current block" is the plan most recently
  // TRAINED (client_workouts activity), else most recently ASSIGNED (createdAt)
  // — NOT the highest Block #N. Athletes have inconsistent numbering (e.g. Yuval:
  // Block #1–3 are old, real training is "Block Alpha"), so blockNum picks the
  // wrong block. Then continue from the LATEST trained week (don't backfill a
  // skipped earlier day): first un-logged (week, day) at/after the max logged
  // week. New block untrained → W1 day 0. Block fully done → last week.
  const currentPlan = (traineeId) => {
    const plans = plansFor(traineeId);
    if (!plans.length) return null;
    const lastLog = (n) => { const ds = (clientWorkouts || []).filter(x => x.clientId === traineeId && x.planName === n).map(x => new Date(x.date || 0).getTime()).filter(Boolean); return ds.length ? Math.max(...ds) : 0; };
    const score = (p) => Math.max(lastLog(p.name), new Date(p.createdAt || 0).getTime());
    return [...plans].sort((a, b) => (score(b) - score(a)) || (blockNum(b.name) - blockNum(a.name)) || (new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0)))[0];
  };
  const nextWorkout = (traineeId) => {
    const latest = currentPlan(traineeId);
    if (!latest) return null;
    const planWeeks = Number(latest.weeks) || 4;
    const dayNames = latest.dayNames || [];
    const logs = (clientWorkouts || []).filter(x => x.clientId === traineeId && x.planName === latest.name);
    const done = new Set(logs.map(x => `${Number(x.week) || 1}|${x.dayName}`));
    const maxWk = logs.length ? Math.max(...logs.map(x => Number(x.week) || 1)) : 1;
    for (let wk = Math.max(1, maxWk); wk <= planWeeks; wk++) {
      for (let di = 0; di < dayNames.length; di++) {
        if (!done.has(`${wk}|${dayNames[di]}`)) return { planId: latest.id, dayIdx: di, week: wk };
      }
    }
    return { planId: latest.id, dayIdx: 0, week: Math.min(planWeeks, Math.max(1, maxWk)) }; // block fully done
  };
  const addRow = () => setRows(r => [...r, { traineeId: '', planId: '', dayIdx: 0, week: 0 }]);
  const setRow = (i, patch) => setRows(r => r.map((x, j) => j === i ? { ...x, ...patch } : x));
  const delRow = (i) => setRows(r => r.filter((_, j) => j !== i));
  useEffect(() => { if (rows.length === 0) addRow(); }, []); // eslint-disable-line

  const confirm = () => {
    const picks = rows.filter(r => r.traineeId && r.planId).map(r => {
      const plan = planIndex.find(p => p.id === r.planId);
      return { traineeId: r.traineeId, planId: r.planId, dayIdx: Number(r.dayIdx) || 0, dayName: plan?.dayNames?.[r.dayIdx] || '', week: Number(r.week) || dfltWeek(r) };
    });
    if (!picks.length) { toast('Pick at least one athlete + program.', 'warn'); return; }
    onConfirm(picks);
  };

  return createPortal((
    <div onClick={onCancel} role="dialog" aria-modal="true" style={overlay}>
      <div onClick={e => e.stopPropagation()} style={modal}>
        <h3 style={{ margin: '0 0 14px', fontFamily: FN, fontSize: 14, color: C.ac, letterSpacing: '0.12em', fontWeight: 700 }}>ADD ATHLETES</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: '54vh', overflow: 'auto' }}>
          {rows.map((r, i) => {
            const plans = r.traineeId ? plansFor(r.traineeId) : [];
            const plan = planIndex.find(p => p.id === r.planId);
            const dayNames = plan?.dayNames || [];
            const weeks = Number(plan?.weeks) || 8;
            const wkVal = Number(r.week) || (r.planId ? dfltWeek(r) : 1);
            return (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.1fr 1.1fr 0.7fr 1fr 28px', gap: 6, alignItems: 'center' }}>
                <select value={r.traineeId} onChange={e => { const tid = e.target.value; const nx = tid ? nextWorkout(tid) : null; setRow(i, nx ? { traineeId: tid, planId: nx.planId, dayIdx: nx.dayIdx, week: nx.week } : { traineeId: tid, planId: '', dayIdx: 0, week: 0 }); }} style={sel}>
                  <option value="">— athlete —</option>
                  {active.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <select value={r.planId} onChange={e => setRow(i, { planId: e.target.value, dayIdx: 0, week: 0 })} style={sel} disabled={!r.traineeId}>
                  <option value="">— program —</option>
                  {plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                {/* Week before day — pick the week, then the day within it. */}
                <select value={wkVal} onChange={e => setRow(i, { week: Number(e.target.value) })} style={sel} disabled={!r.planId} title="Week to log into">
                  {Array.from({ length: weeks }, (_, wi) => wi + 1).map(wn => <option key={wn} value={wn}>W{wn}</option>)}
                </select>
                <select value={r.dayIdx} onChange={e => setRow(i, { dayIdx: Number(e.target.value) })} style={sel} disabled={!r.planId}>
                  {dayNames.length ? dayNames.map((d, di) => <option key={di} value={di}>{d || `Day ${di + 1}`}</option>) : <option value={0}>Day 1</option>}
                </select>
                <button onClick={() => delRow(i)} style={{ ...miniBtn, height: 32, boxSizing: 'border-box', padding: '0 8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.rd, border: `1px solid ${C.cardBd}` }}>✕</button>
              </div>
            );
          })}
        </div>
        <button onClick={addRow} style={{ ...miniBtn, marginTop: 10, padding: '8px 12px', border: `1px solid ${C.cardBd}`, color: C.ac }}>+ ANOTHER</button>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button onClick={onCancel} style={{ ...miniBtn, padding: '9px 16px', border: `1px solid ${C.cardBd}`, color: C.tm }}>Cancel</button>
          <button onClick={confirm} style={{ ...primaryBtn, width: 'auto', padding: '9px 18px' }}>Add to session</button>
        </div>
      </div>
    </div>
  ), document.body);
}

// ---- bits ----
function Card({ title, children }) {
  return (
    <div style={{ background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, padding: 14, boxShadow: C.cardShadow }}>
      <RefinedHeaderStrip padY={14} padX={14} marginBottom={12}>
        <span style={{ fontWeight: 700, fontSize: 13, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#FFF' }}>{title}</span>
      </RefinedHeaderStrip>
      {children}
    </div>
  );
}
// Back row — fixed 28px-high control, cyan ghost, matches the editor/preview
// back affordances elsewhere in the app.
function BackBar({ label, onBack }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
      <button onClick={onBack} style={{ background: 'var(--c-sf)', border: `1px solid ${C.ac}`, color: C.ac, height: 28, padding: '0 14px', fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', cursor: 'pointer', borderRadius: 0, display: 'inline-flex', alignItems: 'center' }}>← BACK</button>
      <span style={{ fontFamily: FN, fontSize: 11, color: C.tm, letterSpacing: '0.12em', fontWeight: 700 }}>{label}</span>
    </div>
  );
}
// Big choose-your-mode card. Cyan hairline, hover-lift, glyph + title + desc —
// the same decisive, brand-bright treatment as the EntryChooser/landing cards.
function MenuCard({ glyph, title, desc, onClick }) {
  return (
    <button onClick={onClick}
      onMouseEnter={e => { e.currentTarget.style.borderColor = C.ac; e.currentTarget.style.background = 'rgba(57,189,255,0.06)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = C.cardBd; e.currentTarget.style.background = 'var(--c-sf)'; e.currentTarget.style.transform = 'none'; }}
      style={{ textAlign: 'left', background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderRadius: 0, padding: '20px 18px', cursor: 'pointer', transition: 'border-color 140ms, background 140ms, transform 140ms', display: 'flex', flexDirection: 'column', gap: 8, minHeight: 168 }}>
      <span style={{ fontSize: 30, lineHeight: 1 }}>{glyph}</span>
      <span style={{ fontFamily: FN, fontSize: 14, fontWeight: 700, letterSpacing: '0.06em', color: C.tx, marginTop: 4 }}>{title}</span>
      <span style={{ fontFamily: FB, fontSize: 12.5, color: C.tm, lineHeight: 1.5, flex: 1 }}>{desc}</span>
      <span style={{ fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', color: C.ac, marginTop: 4 }}>ENTER →</span>
    </button>
  );
}
const primaryBtn = { width: '100%', padding: '12px', background: C.ac, border: `1px solid ${C.ac}`, color: '#FFF', fontFamily: FN, fontSize: 12, fontWeight: 700, letterSpacing: '0.12em', cursor: 'pointer', borderRadius: 0 };
const stripBtn = { background: 'transparent', border: '1px solid rgba(255,255,255,0.55)', color: '#FFF', padding: '4px 12px', fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', cursor: 'pointer' };
const miniBtn = { background: 'transparent', padding: '4px 8px', fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', cursor: 'pointer', borderRadius: 0, borderColor: C.cardBd };
const cell = { width: '100%', background: 'var(--c-bg)', border: `1px solid ${C.cardBd}`, padding: '4px 6px', color: C.tx, fontFamily: FN, fontSize: 12, outline: 'none', borderRadius: 0, textAlign: 'center', fontVariantNumeric: 'tabular-nums' };
// height 32 + boxSizing border-box so every select in the add-athletes row is
// one uniform box — and the ✕ button (same height) lines up with them.
const sel = { width: '100%', height: 32, boxSizing: 'border-box', background: 'var(--c-bg)', border: `1px solid ${C.cardBd}`, borderRadius: 0, padding: '0 8px', color: C.tx, fontFamily: FN, fontSize: 12, outline: 'none' };
const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1200, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 20, paddingTop: 50, backdropFilter: 'blur(4px)' };
const modal = { background: 'var(--c-bg)', border: `1px solid ${C.cardBd}`, maxWidth: 540, width: '100%', padding: 20, maxHeight: '82vh', overflow: 'auto' };
