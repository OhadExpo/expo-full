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
import { C, FN, FB } from './theme';
import { supabase } from './supabase';
import { RefinedHeaderStrip, toast, confirmToast } from './ui';
import { traineeIdsFor } from './traineeUtils';

// Camera tools pull MediaPipe — lazy so the Sessions grid loads instantly and
// the pose bundle only ships when a coach opens a tool on the floor.
const MovementLab = lazy(() => import('./MovementLab'));
const ARFormOverlay = lazy(() => import('./ARFormOverlay'));

const SKEY = 'expo-gym-session';       // active session (coach-only)
const LOGKEY = 'expo-gym-session-log'; // finished trial sessions (coach-only)
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
const fresh = () => ({ reps: '', load: '', rpe: '', done: false });

export default function SessionsView({ trainees = [], planIndex = [], exercises = [], clientWorkouts = [], setClientWorkouts }) {
  const [session, setSession] = useState(null); // { id, startedAt, athletes: [...] }
  const [loaded, setLoaded] = useState(false);
  const [picking, setPicking] = useState(false);
  const [cam, setCam] = useState(null); // { tool:'lab'|'ar', title } | null
  const saveTimer = useRef(null);

  const exById = useMemo(() => {
    const m = new Map();
    for (const e of exercises) m.set(e.id, e);
    return m;
  }, [exercises]);
  const traineeById = useMemo(() => Object.fromEntries(trainees.map(t => [t.id, t])), [trainees]);

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
      const exList = (day.exercises || day.ex || []).map((ex) => {
        const eid = ex.exerciseId || ex.eid || '';
        const lib = exById.get(eid);
        const title = ex.title || lib?.title || lib?.t || '?';
        const setCount = Number(ex.sets ?? ex.s) || 3;
        const reps = ex.reps ?? ex.r ?? '';
        return { eid, title, prescribed: `${setCount}×${reps}`, sets: Array.from({ length: Math.max(1, setCount) }, fresh) };
      });
      return {
        rowId: uid(),
        traineeId: p.traineeId,
        planId: p.planId,
        planName: plan?.name || '',
        dayName: day.name || p.dayName || 'Session',
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
    const completed = session.athletes
      .map(a => {
        const exDone = a.exercises.filter(ex => ex.sets.some(s => s.done));
        if (!exDone.length) return null;
        return {
          id: 'w_' + uid(),
          clientId: a.traineeId,
          planName: a.planName,
          dayName: a.dayName,
          week: 1,
          date: new Date().toISOString(),
          notes: 'Logged in gym session',
          formVideos: [],
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
    } else {
      // TRIAL ISOLATION: do NOT write to client_workouts — that is the table
      // every athlete reads in their portal History, and Sessions is an
      // owner-only trial right now (trainees must not see anything). Finished
      // sessions append to a coach-only store log instead. Flip this to the
      // client_workouts write (the `completed` array is already in portal
      // shape) only when Ohad takes Sessions live for real.
      try {
        const { data: prev } = await supabase.from('store').select('value').eq('key', LOGKEY).maybeSingle();
        const log = Array.isArray(prev?.value) ? prev.value : [];
        await supabase.from('store').upsert({ key: LOGKEY, value: [...log, { at: new Date().toISOString(), sessions: completed }], updated_at: new Date().toISOString() });
      } catch {}
    }
    try { await supabase.from('store').delete().eq('key', SKEY); } catch {}
    setSession(null);
    if (completed.length) toast(`Trial session logged (coach-only) · ${completed.length} athlete${completed.length === 1 ? '' : 's'}`, 'success', { ttl: 4000 });
  }, [session]);

  if (!loaded) return <div style={{ padding: 30, textAlign: 'center', color: C.td }}>Loading…</div>;

  // ---- no active session ----
  if (!session) {
    return (
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <TrialBanner />
        <Card title="SESSIONS">
          <div style={{ padding: '8px 2px 14px', color: C.tm, fontSize: 13, lineHeight: 1.6 }}>
            Run the floor: add the athletes training now, check them in as they arrive, and log everyone's sets in one grid. Finishing saves each athlete's work to their history.
          </div>
          <button onClick={() => setPicking(true)} style={primaryBtn}>+ START SESSION</button>
        </Card>
        {picking && <AthletePicker trainees={trainees} planIndex={planIndex} onCancel={() => setPicking(false)} onConfirm={addAthletes} />}
      </div>
    );
  }

  // ---- live floor ----
  const checkedIn = session.athletes.filter(a => a.checkedIn).length;
  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <TrialBanner />
      <FloorBar session={session} checkedIn={checkedIn} traineeById={traineeById}
        onAdd={() => setPicking(true)} onFinish={finishSession} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12, marginTop: 12 }}>
        {session.athletes.map((a, ai) => (
          <AthleteCard key={a.rowId} a={a} name={(traineeById[a.traineeId]?.name) || a.traineeId}
            onToggleIn={() => mutate(d => { d.athletes[ai].checkedIn = !d.athletes[ai].checkedIn; })}
            onSet={(ei, si, patch) => mutate(d => { Object.assign(d.athletes[ai].exercises[ei].sets[si], patch); })}
            onCurEx={(ei) => mutate(d => { d.athletes[ai].curEx = ei; })}
            onRemove={() => mutate(d => { d.athletes.splice(ai, 1); })}
            onCam={(tool) => setCam({ tool, title: a.exercises[a.curEx]?.title || 'Squat' })}
          />
        ))}
      </div>
      {picking && <AthletePicker trainees={trainees} planIndex={planIndex} existing={session.athletes.map(a => a.traineeId)} onCancel={() => setPicking(false)} onConfirm={addAthletes} />}
      {cam && (
        <Suspense fallback={null}>
          {cam.tool === 'lab'
            ? <MovementLab exerciseTitle={cam.title} initialMode="analyze" onClose={() => setCam(null)} />
            : <ARFormOverlay exerciseTitle={cam.title} onClose={() => setCam(null)} />}
        </Suspense>
      )}
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
function AthleteCard({ a, name, onToggleIn, onSet, onCurEx, onRemove, onCam }) {
  return (
    <div style={{ background: 'var(--c-sf)', border: `1px solid ${a.checkedIn ? C.ac : C.cardBd}`, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderBottom: `1px solid ${C.cardBd}` }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: FN, fontSize: 13, fontWeight: 700, color: C.tx, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
          <div style={{ fontFamily: FN, fontSize: 10, color: C.tm, letterSpacing: '0.04em' }}>{a.dayName}</div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
          <button onClick={onToggleIn} style={{ ...miniBtn, background: a.checkedIn ? C.gn : 'transparent', color: a.checkedIn ? '#FFF' : C.tm, border: `1px solid ${a.checkedIn ? C.gn : C.cardBd}` }}>{a.checkedIn ? '✓ IN' : 'CHECK IN'}</button>
          <button onClick={onRemove} title="Remove from session" style={{ ...miniBtn, color: C.rd, border: `1px solid ${C.cardBd}` }}>✕</button>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 0, borderBottom: `1px solid ${C.cardBd}` }}>
        <button onClick={() => onCam('lab')} title="Record + analyze the current exercise (velocity, ROM, 3D)" style={{ ...miniBtn, flex: 1, padding: '7px 0', borderRight: `1px solid ${C.cardBd}`, color: C.ac }}>📹 LAB</button>
        <button onClick={() => onCam('ar')} title="Live AR form overlay for the current exercise" style={{ ...miniBtn, flex: 1, padding: '7px 0', color: C.ac }}>🪞 AR</button>
      </div>
      <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {a.exercises.length === 0 && <div style={{ color: C.td, fontSize: 12, padding: 8, textAlign: 'center' }}>No exercises on this day.</div>}
        {a.exercises.map((ex, ei) => (
          <div key={ei} onClick={() => onCurEx(ei)} style={{ border: `1px solid ${a.curEx === ei ? C.ac : C.cardBd}`, padding: 8, cursor: 'pointer', background: a.curEx === ei ? 'rgba(57,189,255,0.05)' : 'transparent' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontFamily: FB, fontSize: 12, color: C.tx, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ex.title}</span>
              <span style={{ fontFamily: FN, fontSize: 10, color: C.tm, flexShrink: 0, marginLeft: 6 }}>{ex.prescribed}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {ex.sets.map((s, si) => (
                <div key={si} style={{ display: 'grid', gridTemplateColumns: '18px 1fr 1fr 34px', gap: 4, alignItems: 'center' }} onClick={e => e.stopPropagation()}>
                  <span style={{ fontFamily: FN, fontSize: 10, color: C.td, textAlign: 'center' }}>{si + 1}</span>
                  <input value={s.load} onChange={e => onSet(ei, si, { load: e.target.value })} placeholder="kg" inputMode="decimal" style={cell} />
                  <input value={s.reps} onChange={e => onSet(ei, si, { reps: e.target.value })} placeholder="reps" inputMode="numeric" style={cell} />
                  <button onClick={() => onSet(ei, si, { done: !s.done })} style={{ ...miniBtn, padding: '4px 0', background: s.done ? C.gn : 'transparent', color: s.done ? '#FFF' : C.tm, border: `1px solid ${s.done ? C.gn : C.cardBd}` }}>{s.done ? '✓' : '○'}</button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- athlete + program + day picker ----
function AthletePicker({ trainees, planIndex, existing = [], onCancel, onConfirm }) {
  const [rows, setRows] = useState([]); // { traineeId, planId, dayIdx }
  const active = trainees.filter(t => t.status !== 'Archived' && !existing.includes(t.id));
  const plansFor = (traineeId) => {
    const ids = traineeIdsFor(traineeId);
    return planIndex.filter(p => ids.includes(p.traineeId));
  };
  const addRow = () => setRows(r => [...r, { traineeId: '', planId: '', dayIdx: 0 }]);
  const setRow = (i, patch) => setRows(r => r.map((x, j) => j === i ? { ...x, ...patch } : x));
  const delRow = (i) => setRows(r => r.filter((_, j) => j !== i));
  useEffect(() => { if (rows.length === 0) addRow(); }, []); // eslint-disable-line

  const confirm = () => {
    const picks = rows.filter(r => r.traineeId && r.planId).map(r => {
      const plan = planIndex.find(p => p.id === r.planId);
      return { traineeId: r.traineeId, planId: r.planId, dayIdx: Number(r.dayIdx) || 0, dayName: plan?.dayNames?.[r.dayIdx] || '' };
    });
    if (!picks.length) { toast('Pick at least one athlete + program.', 'warn'); return; }
    onConfirm(picks);
  };

  return (
    <div onClick={onCancel} role="dialog" aria-modal="true" style={overlay}>
      <div onClick={e => e.stopPropagation()} style={modal}>
        <h3 style={{ margin: '0 0 14px', fontFamily: FN, fontSize: 14, color: C.ac, letterSpacing: '0.12em', fontWeight: 700 }}>ADD ATHLETES</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: '54vh', overflow: 'auto' }}>
          {rows.map((r, i) => {
            const plans = r.traineeId ? plansFor(r.traineeId) : [];
            const plan = planIndex.find(p => p.id === r.planId);
            const dayNames = plan?.dayNames || [];
            return (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 28px', gap: 6, alignItems: 'center' }}>
                <select value={r.traineeId} onChange={e => setRow(i, { traineeId: e.target.value, planId: '', dayIdx: 0 })} style={sel}>
                  <option value="">— athlete —</option>
                  {active.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <select value={r.planId} onChange={e => setRow(i, { planId: e.target.value, dayIdx: 0 })} style={sel} disabled={!r.traineeId}>
                  <option value="">— program —</option>
                  {plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <select value={r.dayIdx} onChange={e => setRow(i, { dayIdx: Number(e.target.value) })} style={sel} disabled={!r.planId}>
                  {dayNames.length ? dayNames.map((d, di) => <option key={di} value={di}>{d || `Day ${di + 1}`}</option>) : <option value={0}>Day 1</option>}
                </select>
                <button onClick={() => delRow(i)} style={{ ...miniBtn, color: C.rd, border: `1px solid ${C.cardBd}` }}>✕</button>
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
  );
}

// ---- bits ----
function TrialBanner() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', marginBottom: 10, background: 'rgba(57,189,255,0.08)', border: `1px solid ${C.ac}` }}>
      <span style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', color: C.ac, border: `1px solid ${C.ac}`, padding: '2px 7px' }}>TRIAL</span>
      <span style={{ fontFamily: FB, fontSize: 12, color: C.tm, lineHeight: 1.4 }}>
        Visible only to you. Athletes and staff don't see Sessions, and finishing a trial session logs coach-only — it does <strong>not</strong> appear in any athlete's history.
      </span>
    </div>
  );
}
function Card({ title, children }) {
  return (
    <div style={{ background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, padding: 14 }}>
      <RefinedHeaderStrip padY={14} padX={14} marginBottom={12}>
        <span style={{ fontWeight: 700, fontSize: 13, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#FFF' }}>{title}</span>
      </RefinedHeaderStrip>
      {children}
    </div>
  );
}
const primaryBtn = { width: '100%', padding: '12px', background: C.ac, border: `1px solid ${C.ac}`, color: '#FFF', fontFamily: FN, fontSize: 12, fontWeight: 700, letterSpacing: '0.12em', cursor: 'pointer', borderRadius: 0 };
const stripBtn = { background: 'transparent', border: '1px solid rgba(255,255,255,0.55)', color: '#FFF', padding: '4px 12px', fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', cursor: 'pointer' };
const miniBtn = { background: 'transparent', padding: '4px 8px', fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', cursor: 'pointer', borderRadius: 0, borderColor: C.cardBd };
const cell = { width: '100%', background: 'var(--c-bg)', border: `1px solid ${C.cardBd}`, padding: '4px 6px', color: C.tx, fontFamily: FN, fontSize: 12, outline: 'none', borderRadius: 0 };
const sel = { width: '100%', background: 'var(--c-bg)', border: `1px solid ${C.cardBd}`, padding: '7px 8px', color: C.tx, fontFamily: FN, fontSize: 12, outline: 'none' };
const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1200, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 20, paddingTop: 50, backdropFilter: 'blur(4px)' };
const modal = { background: 'var(--c-bg)', border: `1px solid ${C.cardBd}`, maxWidth: 540, width: '100%', padding: 20, maxHeight: '82vh', overflow: 'auto' };
