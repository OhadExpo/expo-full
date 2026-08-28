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
import { RefinedHeaderStrip, toast, confirmToast, stripBtnBase } from './ui';
import { traineeIdsFor } from './traineeUtils';
import { mergeIncomingSession } from './sessionMerge';
import { useT as useAppT } from './i18n';



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
// Title key for previous-week matching — mirrors the portal's normalization.
const prevTitleKey = (t) => { const n = String(t || '').toLowerCase().trim(); return n ? `t:${n}` : ''; };

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
  const tt = useAppT();
  const [session, setSession] = useState(null); // { id, startedAt, athletes: [...] }
  const [loaded, setLoaded] = useState(false);
  const [picking, setPicking] = useState(false);
  const [planDays, setPlanDays] = useState({}); // planId → days[] (for live tempo/video/cue lookup)
  const saveTimer = useRef(null);
  // Realtime broadcast channel for live cross-device session sync.
  const chanRef = useRef(null);
  // Re-entrancy guard for FINISH (a double-tap on the floor touchscreen must not
  // write every athlete's history twice — the ids differ so save()'s dedupe can't
  // catch it). (audit #1)
  const finishingRef = useRef(false);
  // True once a session has ended — blocks a late athlete-set broadcast from
  // scheduling a durable store write that resurrects the just-deleted row. (audit #2)
  const endedRef = useRef(false);

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
      // Index by id AND normalized title. Portal-logged rows carry portal-derived
      // eids ('dyn_…' / baseline keys) that never equal the plan's exerciseId, so
      // an id-only map silently lost the previous-week ghost whenever the athlete
      // logged that week themselves — the normal case (audit 08-22). Same
      // eid-then-title rule the portal's own matchers use.
      for (const ex of (w.exercises || [])) {
        const id = ex.exerciseId || ex.eid;
        const sets = ex.sets || [];
        if (id && !m.has(id)) m.set(id, sets);
        const tk = prevTitleKey(ex.title);
        if (tk && !m.has(tk)) m.set(tk, sets);
      }
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
        // Same guard as above — a null entry here white-screened the whole
        // live session floor, including on RESUME (audit 08-22 #42).
        for (const ex of (d.exercises || d.ex || []).filter(Boolean)) {
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
    endedRef.current = false; // a new/continuing session re-enables durable writes (audit #2)
    setSession(next);
    // Live-broadcast the new state to every other device on the channel
    // (immediate — no DB round-trip), then debounce the durable store write.
    try { chanRef.current?.send({ type: 'broadcast', event: 'session', payload: { value: next } }); } catch { /* channel not ready yet */ }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      supabase.from('store').upsert({ key: SKEY, value: next, updated_at: new Date().toISOString() }).then(() => {}, () => {});
    }, 400);
  }, []);

  // ---- LIVE sync across devices (Supabase Broadcast) ----
  // The on-the-floor big screen mirrors edits made from any other device on the
  // same session in real time. Broadcast (not postgres_changes) so it needs no
  // table replication / RLS change and works across roles. self:false → we
  // never receive the echo of our own broadcast.
  const sessionRef = useRef(session);
  sessionRef.current = session;
  // rowId -> when this device last changed that athlete. Used to protect an
  // in-flight local edit from a remote full-state snapshot (audit #43).
  const recentTouchRef = useRef(new Map());
  // Debounced durable store write (no re-broadcast — every coach device also
  // receives the granular event directly and merges independently).
  const persistStore = useCallback((next) => {
    if (endedRef.current) return; // session ended — don't resurrect the deleted store row (audit #2)
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { supabase.from('store').upsert({ key: SKEY, value: next, updated_at: new Date().toISOString() }).then(() => {}, () => {}); }, 500);
  }, []);

  // 'gym-session' = COACH DEVICES ONLY — the full-session mirror so the floor
  // big screen and the coach's phone stay in sync. Athletes never join this
  // topic, so it carries no cross-athlete data leak.
  useEffect(() => {
    // PRIVATE (#35): realtime.messages RLS restricts this topic to is_staff(),
    // so only coach/staff devices can mirror or inject group-session state.
    const ch = supabase.channel('gym-session', { config: { private: true, broadcast: { self: false } } });
    ch.on('broadcast', { event: 'session' }, ({ payload }) => {
      const v = payload?.value;
      if (v == null) {
        // The other device FINISHED: cancel our own pending debounced upsert
        // and latch endedRef, or a write scheduled ~400ms ago re-creates the
        // store row that was just deleted — the finished session comes back on
        // every device, gets FINISHED a second time, and every athlete gets a
        // duplicate, trainee-visible history row (audit 08-22 #41).
        if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
        endedRef.current = true;
        setSession(null);
        return;
      }
      if (Array.isArray(v.athletes)) {
        // A new/continuing session re-enables durable writes on a device that
        // had previously latched endedRef — otherwise it silently drops every
        // persistStore write for the rest of its life.
        endedRef.current = false;
        setSession((prev) => mergeIncomingSession(prev, v, recentTouchRef.current, Date.now()));
      }
    });
    // setAuth() before joining: a private join is authorized from the JWT on
    // the realtime socket, and this channel can be created before supabase-js
    // has propagated the token from SIGNED_IN.
    let disposed = false;
    (async () => {
      try { await supabase.realtime.setAuth(); } catch { /* surfaced below */ }
      if (disposed) return;
      ch.subscribe((status) => {
        if (status === 'CHANNEL_ERROR') console.warn('[live-sync] gym-session channel not authorized');
      });
    })();
    chanRef.current = ch;
    return () => { disposed = true; chanRef.current = null; supabase.removeChannel(ch); };
  }, []);

  // Per-trainee 'gym-set:<tid>' channels — each athlete shares a room ONLY with
  // their own portal, so no athlete ever receives another's data. The athlete↔
  // coach live set-sync + catch-up runs here. Reconciled to the roster.
  const setChansRef = useRef(new Map());
  const traineeKey = (session?.athletes || []).map(a => a.traineeId).filter(Boolean).join(',');
  useEffect(() => {
    const tids = new Set(traineeKey.split(',').filter(Boolean));
    const map = setChansRef.current;
    for (const tid of tids) {
      if (map.has(tid)) continue;
      // PRIVATE (#35): authorized coach-side by is_staff(); the athlete's own
      // portal is authorized for the same topic by their trainee id.
      const ch = supabase.channel('gym-set:' + tid, { config: { private: true, broadcast: { self: false } } });
      const findA = () => (sessionRef.current?.athletes || []).find(x => x.traineeId === tid);
      const dayOk = (p, a) => (!p.planName || !a.planName || p.planName === a.planName) && (!p.dayName || !a.dayName || p.dayName === a.dayName) && (p.week == null || a.week == null || p.week === a.week);
      // Athlete's live edit from their portal → overwrite that field on the card.
      ch.on('broadcast', { event: 'athlete-set' }, ({ payload: p }) => {
        if (!p || p.ei == null || p.si == null || !p.field) return;
        setSession(prev => {
          if (!prev?.athletes) return prev;
          let hit = false;
          const athletes = prev.athletes.map(a => {
            if (a.traineeId !== tid || !dayOk(p, a)) return a;
            const ex = a.exercises?.[p.ei];
            if (!ex || p.si >= (ex.sets || []).length) return a;
            hit = true;
            return { ...a, exercises: a.exercises.map((e, ei) => ei === p.ei ? { ...e, sets: e.sets.map((s, i) => i === p.si ? { ...s, [p.field]: p.value } : s) } : e) };
          });
          if (!hit) return prev;
          const next = { ...prev, athletes };
          persistStore(next);
          return next;
        });
      });
      // Athlete's catch-up reply → fill our EMPTY slots only (never clobber).
      ch.on('broadcast', { event: 'sync-state' }, ({ payload: p }) => {
        if (!p || !Array.isArray(p.exercises)) return;
        setSession(prev => {
          if (!prev?.athletes) return prev;
          let hit = false;
          const athletes = prev.athletes.map(a => {
            if (a.traineeId !== tid || !dayOk(p, a)) return a;
            const exercises = (a.exercises || []).map((ex, ei) => {
              const rex = p.exercises[ei];
              if (!rex) return ex;
              const sets = (ex.sets || []).map((s, si) => {
                const rs = rex.sets?.[si];
                if (!rs) return s;
                const ns = { ...s };
                ['reps', 'load', 'rpe'].forEach(f => { if ((ns[f] === '' || ns[f] == null) && rs[f] != null && rs[f] !== '') { ns[f] = rs[f]; hit = true; } });
                if (!ns.done && rs.done) { ns.done = true; hit = true; }
                return ns;
              });
              return { ...ex, sets };
            });
            return { ...a, exercises };
          });
          if (!hit) return prev;
          const next = { ...prev, athletes };
          persistStore(next);
          return next;
        });
      });
      // Athlete's portal asked for the current state → reply with the card's sets.
      ch.on('broadcast', { event: 'sync-request' }, () => {
        const a = findA();
        if (!a) return;
        const exercises = (a.exercises || []).map(ex => ({ sets: (ex.sets || []).map(s2 => ({ reps: s2.reps, load: s2.load, rpe: s2.rpe, done: s2.done })) }));
        if (!exercises.some(x => x.sets.some(s2 => s2.reps || s2.load || s2.rpe || s2.done))) return;
        try { ch.send({ type: 'broadcast', event: 'sync-state', payload: { traineeId: tid, planName: a.planName, dayName: a.dayName, week: a.week, exercises } }); } catch { /* not ready */ }
      });
      // On connect: pull anything the athlete already logged in their portal,
      // AND push our current card so the portal fills any value the coach typed
      // in the ~1s before this channel finished subscribing (audit F4). The
      // portal applies sync-state fill-empty-only, so it can't clobber the
      // athlete's own entries.
      (async () => {
      try { await supabase.realtime.setAuth(); } catch { /* surfaced below */ }
      // The athlete may have been checked OUT (or the view unmounted) while we
      // awaited the token — this channel was then already removed. Subscribing
      // now would resurrect a zombie channel that nothing tears down. map.set
      // below runs synchronously before this continuation, so an identity match
      // means it's still the live channel for this trainee.
      if (setChansRef.current.get(tid) !== ch) return;
      ch.subscribe((status) => {
        if (status === 'CHANNEL_ERROR') { console.warn('[live-sync] coach channel not authorized for', tid); return; }
        if (status !== 'SUBSCRIBED') return;
        const a = findA();
        if (!a) return;
        try { ch.send({ type: 'broadcast', event: 'sync-request', payload: { traineeId: tid, planName: a.planName, dayName: a.dayName } }); } catch { /* not ready */ }
        const exercises = (a.exercises || []).map(ex => ({ sets: (ex.sets || []).map(s2 => ({ reps: s2.reps, load: s2.load, rpe: s2.rpe, done: s2.done })) }));
        if (exercises.some(x => x.sets.some(s2 => s2.reps || s2.load || s2.rpe || s2.done))) {
          try { ch.send({ type: 'broadcast', event: 'sync-state', payload: { traineeId: tid, planName: a.planName, dayName: a.dayName, week: a.week, exercises } }); } catch { /* not ready */ }
        }
      });
      })();
      map.set(tid, ch);
    }
    for (const [tid, ch] of map) { if (!tids.has(tid)) { supabase.removeChannel(ch); map.delete(tid); } }
  }, [traineeKey, persistStore]);
  // Tear down all per-trainee channels on unmount.
  useEffect(() => () => { for (const [, ch] of setChansRef.current) supabase.removeChannel(ch); setChansRef.current.clear(); }, []);

  // Functional so a coach edit merges onto the LATEST state — the old
  // structuredClone(session) used a render-closure snapshot, so a coach edit
  // landing right after a portal 'athlete-set' merge would drop that athlete's
  // just-synced set from both the screen and the durable store (audit F3).
  const mutate = useCallback((fn) => {
    setSession(prev => {
      const draft = structuredClone(prev);
      fn(draft);
      // Which athlete rows did THIS device just touch? The coach mirror
      // broadcasts the WHOLE session on every edit and receivers used to replace
      // wholesale, so the phone's snapshot — built a moment before the big
      // screen's keystroke landed — reverted that keystroke mid-typing, and the
      // big screen's next broadcast reverted the phone's check-in back
      // (audit 08-22 #43). Remembering the rows we just changed lets the
      // receiver keep OUR version of exactly those.
      try {
        const before = new Map((prev?.athletes || []).map((a) => [a.rowId, JSON.stringify(a)]));
        const now = Date.now();
        for (const a of (draft.athletes || [])) {
          if (before.get(a.rowId) !== JSON.stringify(a)) recentTouchRef.current.set(a.rowId, now);
        }
        for (const [k, t] of recentTouchRef.current) if (now - t > 6000) recentTouchRef.current.delete(k);
      } catch { /* diffing is best-effort — never block the edit */ }
      try { chanRef.current?.send({ type: 'broadcast', event: 'session', payload: { value: draft } }); } catch { /* not ready */ }
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => { supabase.from('store').upsert({ key: SKEY, value: draft, updated_at: new Date().toISOString() }).then(() => {}, () => {}); }, 400);
      return draft;
    });
  }, []);

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
      // .filter(Boolean): a null exercise element (corrupt Drive import,
      // half-deleted editor row, offline partial) threw inside this async
      // callback and Add silently did nothing. The athlete portal already
      // filters the same data for the same reason (audit 08-22 #42).
      const exList = (day.exercises || day.ex || []).filter(Boolean).map((ex) => {
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
        // weeks isn't on the plans row we fetched (id,name,data) — read it from
        // planIndex, which carries the block length. Was always undefined →
        // nextWeekFor capped at the fallback 8. (audit)
        planWeeks: Number(planIndex.find(pi => pi.id === p.planId)?.weeks) || undefined,
        dayName: day.name || p.dayName || 'Session',
        week,
        checkedIn: false,
        curEx: 0,
        exercises: exList,
      };
    });
    // Merge onto the LATEST session via the ref, not the render-closure
    // `session` captured before the `await` above: a portal 'athlete-set'
    // broadcast (or another coach's edit) can land during the plans fetch, and
    // building `next` from the stale closure would drop that just-synced set
    // from the screen AND re-broadcast the stale state to every device (audit F3
    // — same class already fixed in `mutate`).
    const base = sessionRef.current;
    const next = base
      ? { ...base, athletes: [...base.athletes, ...athletes] }
      : { id: uid(), startedAt: new Date().toISOString(), athletes };
    persist(next);
    setPicking(false);
    // planIndex is READ above (planWeeks) and must be a dependency: without it
    // the callback keeps whatever planIndex existed when exercises last changed,
    // so a plan created or edited mid-day is missed, planWeeks falls back to
    // undefined, and the auto-week caps at 8 instead of the block's real length
    // — the exact regression planWeeks was added to fix (audit #92).
  }, [persist, exById, planIndex]);

  const finishSession = useCallback(async () => {
    // Read the LATEST session (sessionRef.current), NOT the render-closure `session`
    // — an athlete's portal broadcast can merge a freshly-logged set into state in the
    // window before React rebinds onFinish; finishing off the stale snapshot would
    // write client_workouts WITHOUT that set and then delete the store row, losing it
    // permanently. Every other mutating path here already reads the ref (audit).
    const cur = sessionRef.current;
    if (!cur) return;
    // Re-entrancy guard: a double-tap on the floor touchscreen (or "tap again to
    // be sure it saved") would otherwise re-run this before setSession(null)
    // commits — cur is still the live session, so it rebuilds `completed` with a
    // fresh set of ids and appends them AGAIN, writing every athlete's history
    // twice (trainee-visible, double-counts in analysis; save()'s id-dedupe can't
    // catch it — the ids differ). (audit #1)
    if (finishingRef.current) return;
    finishingRef.current = true;
    try {
    const finishedAt = new Date().toISOString();
    const completed = cur.athletes
      .map(a => {
        const exDone = a.exercises.filter(ex => ex.sets.some(s => s.done));
        if (!exDone.length) return null;
        return {
          id: 'cw_' + uid(),
          clientId: a.traineeId,
          // planId disambiguates two couple members' identically-named plans —
          // planName alone cannot (audit 08-22 #31).
          planId: a.planId || null,
          planName: a.planName,
          dayName: a.dayName,
          week: Number(a.week) || nextWeekFor(a.traineeId, a.planName, a.dayName, a.planWeeks),
          date: finishedAt, completedAt: finishedAt,
          notes: 'Logged in group session',
          formVideos: [], reviewedAt: finishedAt, source: 'group-session',
          exercises: a.exercises.map(ex => ({
            eid: ex.eid, title: ex.title, prescribed: ex.prescribed,
            // Write the FULL set array with done flags, the way the portal and
            // the single logger do. Compacting to done-only sets shifted every
            // later set down a slot, so an athlete who did sets 1 and 3 had
            // set 3's numbers show up against set 2 in next week's per-set
            // ghost — the ghost consumers read positionally (audit 08-22 #91).
            sets: ex.sets.map(s => ({ reps: s.reps, load: s.load, rpe: s.rpe, done: !!s.done })),
            substitution: null,
          })).filter(ex => ex.sets.some(s => s.done)),
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
    // Point of no return: mark the session ended so a late athlete-set broadcast
    // arriving during the delete window can't schedule a store write that
    // resurrects the row we're about to delete. (audit #2)
    endedRef.current = true;
    // Cancel any pending debounced upsert so it can't re-create the row we're
    // about to delete — otherwise a set edited just before FINISH resurrects the
    // finished session on next load. (audit)
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    // Tell the other devices the session ended so their floor screen clears too.
    try { chanRef.current?.send({ type: 'broadcast', event: 'session', payload: { value: null } }); } catch { /* noop */ }
    try { await supabase.from('store').delete().eq('key', SKEY); } catch {}
    setSession(null);
    if (completed.length) toast(`${completed.length} athlete${completed.length === 1 ? '' : 's'} logged to their history`, 'success', { ttl: 4000 });
    } finally {
      finishingRef.current = false;
    }
  }, [session, clientWorkouts, setClientWorkouts]);

  // Cancel a pending debounced session upsert on unmount (a late write after
  // navigating away could otherwise revive a cleared session). (audit)
  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  if (!loaded) return <div style={{ padding: 30, textAlign: 'center', color: C.td }}>Loading…</div>;

  // ---- no active session ----
  if (!session) {
    return (
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <BackBar label={tt('GROUP SESSION')} onBack={onBack} />
        <Card title={tt('START A GROUP SESSION')}>
          <div style={{ padding: '8px 2px 14px', color: C.tm, fontSize: 13, lineHeight: 1.6 }}>
            {tt('Add the athletes training now, check them in as they arrive, and log all their sets in one grid. Built to run on a big screen on the floor.')}
          </div>
          <button onClick={() => setPicking(true)} style={primaryBtn}>{tt('+ START SESSION')}</button>
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
      {session.athletes.length === 0 ? (
        // Empty floor — guide the coach to add athletes instead of a blank box.
        <div style={{ marginTop: 12, border: `1px solid ${C.cardBd}`, background: 'var(--c-sf)', boxShadow: C.cardShadow, padding: '54px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, textAlign: 'center' }}>
          <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke={C.ac} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.9 }}>
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
          <div style={{ fontFamily: FN, fontSize: 13, fontWeight: 700, letterSpacing: '0.14em', color: C.tx, textTransform: 'uppercase' }}>No one on the floor yet</div>
          <div style={{ fontFamily: FB, fontSize: 13, color: C.tm, maxWidth: 380, lineHeight: 1.55 }}>Add the athletes training now — check them in as they arrive and log every set from this one screen.</div>
          <button onClick={() => setPicking(true)} style={{ ...primaryBtn, width: 'auto', padding: '12px 26px', marginTop: 4 }}>+ Add athletes</button>
        </div>
      ) : (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12, marginTop: 12 }}>
        {session.athletes.map((a, ai) => (
          <AthleteCard key={a.rowId} a={a} name={(traineeById[a.traineeId]?.name) || a.traineeId}
            prevMap={prevByKey[`${a.traineeId}|${a.planName}|${a.dayName}|${(Number(a.week) || 1) - 1}`]} exDetail={exDetail}
            onToggleIn={() => mutate(d => { const x = d.athletes.find(z => z.rowId === a.rowId); if (x) x.checkedIn = !x.checkedIn; })}
            onSet={(ei, si, patch) => {
              // Resolve the athlete by stable rowId, not render index `ai` — a
              // concurrent roster shift (another device's remove/reorder committing
              // between event dispatch and this updater) would otherwise write the set
              // onto the WRONG athlete's card and rebroadcast it (same hazard onRemove
              // already guards). ei/si are stable within one athlete's own card.
              mutate(d => { const x = d.athletes.find(z => z.rowId === a.rowId); const s = x?.exercises?.[ei]?.sets?.[si]; if (s) Object.assign(s, patch); });
              // Granular per-field broadcast so the athlete's portal gets THIS
              // edit live. The full 'session' broadcast can't drive the portal —
              // it carries every (mostly empty) set and would wipe the athlete's
              // own entries; 'athlete-set' overwrites only the field we changed.
              const a2 = sessionRef.current?.athletes?.find(z => z.rowId === a.rowId);
              const setCh = a2 && setChansRef.current.get(a2.traineeId);
              if (setCh) {
                Object.entries(patch).forEach(([f, v]) => {
                  try { setCh.send({ type: 'broadcast', event: 'athlete-set', payload: { traineeId: a2.traineeId, planName: a2.planName, dayName: a2.dayName, week: a2.week, ei, si, field: f, value: v } }); } catch { /* not ready */ }
                });
              }
            }}
            onCurEx={(ei) => mutate(d => { const x = d.athletes.find(z => z.rowId === a.rowId); if (x) x.curEx = ei; })}
            onRemove={() => mutate(d => {
              // Remove by stable rowId, not the render-time index `ai`: the ✕
              // button awaits a confirm dialog first, so on a multi-device floor
              // a concurrent remove/reorder could have shifted the roster —
              // splicing `ai` would delete the WRONG athlete and rebroadcast it.
              const idx = d.athletes.findIndex(x => x.rowId === a.rowId);
              if (idx !== -1) d.athletes.splice(idx, 1);
            })}
          />
        ))}
      </div>
      )}
      {picking && <AthletePicker trainees={trainees} planIndex={planIndex} existing={session.athletes.map(a => a.traineeId)} clientWorkouts={clientWorkouts} onCancel={() => setPicking(false)} onConfirm={addAthletes} />}
    </div>
  );
}

// ---- live floor summary bar ----
function FloorBar({ session, checkedIn, traineeById, onAdd, onFinish }) {
  return (
    <div style={{ background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, overflow: 'hidden' }}>
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
      {session.athletes.length > 0 && (
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
      )}
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
          <button onClick={async () => {
            // Warn if the coach logged sets on this card — finishSession only
            // writes athletes still on the roster, so removing them discards that
            // logged work with no other signal. (audit #4)
            const hasLogged = (a.exercises || []).some(ex => (ex.sets || []).some(s => s.done));
            const msg = hasLogged
              ? `Remove ${name || 'this athlete'} from the floor? The sets you logged for them here are NOT saved yet and will be discarded.`
              : `Remove ${name || 'this athlete'} from the floor?`;
            if (await confirmToast(msg, { okLabel: 'Remove', cancelLabel: 'Keep' })) onRemove();
          }} title="Remove from session" style={{ ...miniBtn, color: C.rd, border: `1px solid ${C.cardBd}` }}>✕</button>
        </div>
      </div>
      <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {a.exercises.length === 0 && <div style={{ color: C.td, fontSize: 12, padding: 8, textAlign: 'center' }}>No exercises on this day.</div>}
        {a.exercises.map((ex, ei) => {
          const prevSets = prevMap?.get(ex.eid) || prevMap?.get(prevTitleKey(ex.title));
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
                  <span style={{ display: 'inline-block', width: 14, color: C.gn, flexShrink: 0 }}>{allDone ? '✓' : ''}</span>{ex.title}
                </span>
                <span style={{ color: 'var(--c-tx)', fontSize: 12, flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>▾</span>
              </div>
              {/* Prescription on its own line — clear, not crammed beside the
                  wrapping title. SETS × REPS + a muted done-count. */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
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
                {['', 'REPS', 'KG', 'RPE', '✓'].map(h => <span key={h} style={{ fontFamily: FN, fontSize: 8, fontWeight: 700, letterSpacing: '0.06em', color: C.tm, textAlign: 'center' }}>{h}</span>)}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {ex.sets.map((s, si) => {
                  const prior = prevSets?.[si];
                  return (
                  <React.Fragment key={si}>
                    {prior && (parseFloat(prior.load) > 0 || prior.reps) && (
                      <div style={{ display: 'grid', gridTemplateColumns: COLS, gap: 4, alignItems: 'center', opacity: 0.6, marginTop: si === 0 ? 0 : 4 }} title="Previous week">
                        <span style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, color: C.ac, textAlign: 'center' }}>‹</span>
                        <span style={{ fontFamily: FB, fontSize: 11, color: C.tx, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{prior.reps || '—'}</span>
                        <span style={{ fontFamily: FB, fontSize: 11, color: C.tx, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{parseFloat(prior.load) || '—'}</span>
                        <span style={{ fontFamily: FB, fontSize: 11, color: C.tx, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{prior.rpe || '—'}</span>
                        <span />
                      </div>
                    )}
                    <div style={{ display: 'grid', gridTemplateColumns: COLS, gap: 4, alignItems: 'center' }}>
                      <span style={{ fontFamily: FN, fontSize: 10, color: C.td, textAlign: 'center' }}>{si + 1}</span>
                      <input value={s.reps} onChange={e => onSet(ei, si, { reps: e.target.value })} placeholder="reps" inputMode="numeric" style={cell} />
                      <input value={s.load} onChange={e => onSet(ei, si, { load: e.target.value })} placeholder="kg" inputMode="decimal" style={cell} />
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
  const tt = useAppT();
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
    // Two rows can name the SAME athlete on the same program/day/week — each
    // picker row lists every athlete, so nothing stopped it. That produced two
    // cards for one person and two history rows on finish (audit 08-22 #93).
    const seen = new Set();
    const unique = picks.filter((p) => {
      const k = `${p.traineeId}|${p.planId}|${p.dayIdx}|${p.week}`;
      if (seen.has(k)) return false;
      seen.add(k); return true;
    });
    const dropped = picks.length - unique.length;
    if (dropped) toast(`Skipped ${dropped} duplicate ${dropped === 1 ? 'athlete' : 'athletes'}.`, 'warn');
    onConfirm(unique);
  };

  return createPortal((
    <div onClick={onCancel} role="dialog" aria-modal="true" style={overlay}>
      <div onClick={e => e.stopPropagation()} style={modal}>
        {/* Desktop keeps the single-line 5-column row. On a phone the athlete /
            program names can't render in a ~72px column, so below 760px the row
            reflows to three lines — athlete (+ remove) · program · week/day —
            each name-bearing select getting near-full width. Desktop layout is
            untouched (the media query only fires below 760px). */}
        <style>{`
          @media (max-width: 760px) {
            .sess-add-row {
              grid-template-columns: minmax(0,1fr) minmax(0,1fr) 28px !important;
              row-gap: 6px;
            }
            .sess-add-row > *:nth-child(1) { grid-area: 1 / 1 / 2 / 3; }
            .sess-add-row > *:nth-child(5) { grid-area: 1 / 3 / 2 / 4; }
            .sess-add-row > *:nth-child(2) { grid-area: 2 / 1 / 3 / 4; }
            .sess-add-row > *:nth-child(3) { grid-area: 3 / 1 / 4 / 2; }
            .sess-add-row > *:nth-child(4) { grid-area: 3 / 2 / 4 / 4; }
          }
        `}</style>
        <h3 style={{ margin: '0 0 14px', fontFamily: FN, fontSize: 14, color: C.ac, letterSpacing: '0.12em', fontWeight: 700 }}>ADD ATHLETES</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: '54vh', overflow: 'auto' }}>
          {rows.map((r, i) => {
            const plans = r.traineeId ? plansFor(r.traineeId) : [];
            const plan = planIndex.find(p => p.id === r.planId);
            const dayNames = plan?.dayNames || [];
            const weeks = Number(plan?.weeks) || 8;
            const wkVal = Number(r.week) || (r.planId ? dfltWeek(r) : 1);
            return (
              <div key={i} className="sess-add-row" style={{ display: 'grid', gridTemplateColumns: '1.1fr 1.1fr 0.7fr 1fr 28px', gap: 6, alignItems: 'center' }}>
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
          <button onClick={onCancel} style={{ ...miniBtn, padding: '9px 16px', border: `1px solid ${C.cardBd}`, color: C.tm }}>{tt("Cancel")}</button>
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
  const tt = useAppT();
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
      <button onClick={onBack} style={{ background: 'var(--c-sf)', border: `1px solid ${C.ac}`, color: C.ac, height: 28, padding: '0 14px', fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', cursor: 'pointer', borderRadius: 0, display: 'inline-flex', alignItems: 'center' }}>← {tt('BACK')}</button>
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
const stripBtn = { ...stripBtnBase, border: '1px solid rgba(255,255,255,0.55)', color: '#FFF' };
const miniBtn = { background: 'transparent', padding: '4px 8px', fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', cursor: 'pointer', borderRadius: 0, borderColor: C.cardBd };
const cell = { width: '100%', background: 'var(--c-bg)', border: `1px solid ${C.cardBd}`, padding: '4px 6px', color: C.tx, fontFamily: FN, fontSize: 12, outline: 'none', borderRadius: 0, textAlign: 'center', fontVariantNumeric: 'tabular-nums' };
// height 32 + boxSizing border-box so every select in the add-athletes row is
// one uniform box — and the ✕ button (same height) lines up with them.
const sel = { width: '100%', height: 32, boxSizing: 'border-box', background: 'var(--c-bg)', border: `1px solid ${C.cardBd}`, borderRadius: 0, padding: '0 8px', color: C.tx, fontFamily: FN, fontSize: 12, outline: 'none' };
const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1200, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 20, paddingTop: 50, backdropFilter: 'blur(4px)' };
const modal = { background: 'var(--c-bg)', border: `1px solid ${C.cardBd}`, maxWidth: 540, width: '100%', padding: 20, maxHeight: '82vh', overflow: 'auto' };
