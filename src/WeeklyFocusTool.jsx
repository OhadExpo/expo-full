// WeeklyFocusTool.jsx — set a weekly focus on a trainee's exercise WITHOUT a
// logged/filmed workout. Weekly focus is otherwise only writable from inside a
// workout review, so a day sent over WhatsApp (nothing logged → no review card)
// had nowhere to attach a focus. This lives in the Review page.
//
// CRITICAL: the focus key must match the eid the athlete's portal resolves, or
// the coach writes a note the athlete never sees. We therefore reproduce
// ClientPortal's EXACT eid resolution (title → EX_BY_TITLE, else dyn_<key>) and
// load the RAW plan row (not useFullPlan, which regenerates ids).

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { C, FN, FB } from './theme';
import { supabase } from './supabase';
import { EX } from './exerciseData';
import { isSafeTraineeId } from './traineeUtils';

const EX_BY_TITLE = {};
Object.entries(EX).forEach(([k, v]) => { if (v.t) EX_BY_TITLE[v.t.toLowerCase()] = k; });
const isHeb = (s) => /[֐-׿]/.test(s || '');

// Mirror of ClientPortal's per-exercise eid/title resolution (keep in sync).
// nameRaw MUST be the bare d.name the portal keys on (line 79 there) — not a
// d.n fallback — or the focus key diverges and the athlete never sees it.
function resolveDay(d, idx, exById, exByTitle) {
  const rawList = Array.isArray(d.exercises) ? d.exercises : (Array.isArray(d.ex) ? d.ex : []);
  return {
    nameRaw: d.name,                                   // exact key component (may be undefined)
    label: d.name || d.n || `Day ${idx + 1}`,          // readable UI label only
    ex: rawList.map((pe, peIdx) => {
      const libId = pe.exerciseId || pe.eid || null;
      let exData = libId ? (exById.get(libId) || null) : null;
      if (!exData && pe.title) exData = exByTitle.get(pe.title.toLowerCase().trim()) || null;
      const title = (exData?.title || pe.title || 'Exercise ' + (peIdx + 1)).trim();
      let eid = EX_BY_TITLE[title.toLowerCase()];
      if (!eid) { const stableKey = pe.id || libId || title.toLowerCase().replace(/[^a-z0-9]+/g, '_'); eid = 'dyn_' + stableKey; }
      return { eid, title };
    }),
  };
}

export default function WeeklyFocusTool({ trainees, exercises, weeklyFocus, setWeeklyFocus }) {
  const [open, setOpen] = useState(false);
  const [traineeId, setTraineeId] = useState('');
  const [query, setQuery] = useState('');               // type-and-search box text
  const [pickerOpen, setPickerOpen] = useState(false);
  const [plans, setPlans] = useState(null);
  const [planId, setPlanId] = useState('');
  const [week, setWeek] = useState(1);
  const [loadErr, setLoadErr] = useState(null);

  // Flatten couples into per-member options so the focus key uses the same id
  // the member's portal reads.
  const athleteOpts = useMemo(() => [...(trainees || [])]
    .flatMap(t => (t.members && t.members.length === 2)
      ? t.members.map((m, i) => ({ value: t.id + '__' + i, label: m.name || ('Member ' + (i + 1)) }))
      : [{ value: t.id, label: t.name || 'Unnamed' }])
    .sort((a, b) => a.label.localeCompare(b.label)), [trainees]);
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (q ? athleteOpts.filter(o => o.label.toLowerCase().includes(q)) : athleteOpts).slice(0, 8);
  }, [athleteOpts, query]);
  const pickAthlete = (o) => { setTraineeId(o.value); setQuery(o.label); setPickerOpen(false); };

  const exById = useMemo(() => { const m = new Map(); (exercises || []).forEach(e => m.set(e.id, e)); return m; }, [exercises]);
  const exByTitle = useMemo(() => { const m = new Map(); (exercises || []).forEach(e => { if (e.title) m.set(e.title.toLowerCase().trim(), e); }); return m; }, [exercises]);

  useEffect(() => {
    if (!traineeId) { setPlans(null); setPlanId(''); return; }
    if (!isSafeTraineeId(traineeId)) { setLoadErr('Invalid trainee id'); return; }
    let alive = true; setPlans(null); setLoadErr(null);
    (async () => {
      try {
        const { data, error } = await supabase.from('plans').select('id,name,data,active,trainee_id,created_at')
          .or(`trainee_id.eq.${traineeId},trainee_id.like.${traineeId}__%`).eq('active', true)
          .order('created_at', { ascending: false });
        if (error) throw error;
        if (!alive) return;
        const rows = Array.isArray(data) ? data : [];
        setPlans(rows); setPlanId(rows[0]?.id || '');
      } catch (e) { if (alive) setLoadErr(String(e?.message || e)); }
    })();
    return () => { alive = false; };
  }, [traineeId]);

  const plan = (plans || []).find(p => p.id === planId);
  const weeks = plan?.data?.weeks || 4;
  const days = useMemo(() => {
    if (!plan) return [];
    return (plan.data?.days || []).map((d, i) => resolveDay(d, i, exById, exByTitle));
  }, [plan, exById, exByTitle]);

  const keyFor = (dayName, eid) => `${traineeId}|${plan.name}|${dayName}|${eid}|W${week}`;
  const getF = (dayName, eid) => (plan ? (weeklyFocus?.[keyFor(dayName, eid)] ?? weeklyFocus?.[`${plan.name}|${dayName}|${eid}|W${week}`] ?? '') : '');
  // Focus autosaves (the weekly_focus store debounces the Supabase write). Show
  // a Saving…/Saved status so the coach knows it stuck — there's no Save button.
  const [saveState, setSaveState] = useState('idle');   // idle | saving | saved
  const saveTimer = useRef(null);
  const setF = (dayName, eid, val) => {
    setWeeklyFocus(prev => { const next = { ...prev }; const k = keyFor(dayName, eid); if (val.length > 0) next[k] = val; else delete next[k]; return next; });
    setSaveState('saving');
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => setSaveState('saved'), 800);
  };
  useEffect(() => () => clearTimeout(saveTimer.current), []);

  const sel = { background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, color: C.tx, fontFamily: FB, fontSize: 13, padding: '7px 9px', borderRadius: 0 };
  const lbl = { display: 'block', fontFamily: FN, fontSize: 9, color: C.tm, letterSpacing: '0.12em', fontWeight: 700, marginBottom: 4 };

  return (
    <div style={{ background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, marginBottom: 20, boxShadow: C.cardShadow }}>
      <div onClick={() => setOpen(o => !o)} role="button" tabIndex={0}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(o => !o); } }}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', cursor: 'pointer', background: C.acD, borderBottom: open ? `1px solid ${C.cardBd}` : 'none' }}>
        <span style={{ fontFamily: FN, fontSize: 12, fontWeight: 700, letterSpacing: '0.12em', color: '#FFF' }}>WEEKLY FOCUS · NO UPLOAD NEEDED</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {saveState !== 'idle' && (
            <span style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: saveState === 'saved' ? C.gn : C.tm }}>
              {saveState === 'saved' ? '✓ SAVED' : 'SAVING…'}
            </span>
          )}
          <span style={{ color: C.ac, fontFamily: FN, fontSize: 12, fontWeight: 700 }}>{open ? '▴' : '▾'}</span>
        </span>
      </div>
      {open && (
        <div style={{ padding: 14 }}>
          <div style={{ fontFamily: FB, fontSize: 11.5, color: C.td, lineHeight: 1.5, marginBottom: 12 }}>
            Leave a focus for a day the athlete didn't log in-app (e.g. videos came via WhatsApp). It saves to the exact same place the in-app review writes to — the athlete sees it on that exercise.
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 14 }}>
            <div style={{ flex: '1 1 200px', minWidth: 160, position: 'relative' }}>
              <label style={lbl}>ATHLETE</label>
              <input dir="auto" value={query} placeholder="Type a name…"
                onChange={e => { setQuery(e.target.value); setPickerOpen(true); if (traineeId) setTraineeId(''); }}
                onFocus={() => setPickerOpen(true)}
                onBlur={() => setTimeout(() => setPickerOpen(false), 150)}
                onKeyDown={e => { if (e.key === 'Enter' && matches.length) { e.preventDefault(); pickAthlete(matches[0]); } else if (e.key === 'Escape') setPickerOpen(false); }}
                style={{ ...sel, width: '100%', boxSizing: 'border-box', borderColor: traineeId ? C.ac : C.cardBd }} />
              {pickerOpen && matches.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, background: 'var(--c-sf)', border: `1px solid ${C.ac}`, borderTop: 'none', maxHeight: 240, overflowY: 'auto', boxShadow: C.cardShadow }}>
                  {matches.map(o => (
                    <div key={o.value} onMouseDown={e => { e.preventDefault(); pickAthlete(o); }}
                      style={{ padding: '8px 10px', cursor: 'pointer', fontFamily: FB, fontSize: 13, color: C.tx, borderBottom: `1px solid ${C.cardBd}`, background: o.value === traineeId ? C.acD : 'transparent' }}
                      onMouseEnter={e => e.currentTarget.style.background = C.acD}
                      onMouseLeave={e => e.currentTarget.style.background = o.value === traineeId ? C.acD : 'transparent'}>{o.label}</div>
                  ))}
                </div>
              )}
            </div>
            {plans && plans.length > 1 && (
              <div style={{ flex: '1 1 180px', minWidth: 150 }}>
                <label style={lbl}>BLOCK</label>
                <select value={planId} onChange={e => setPlanId(e.target.value)} style={{ ...sel, width: '100%' }}>
                  {plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            )}
            {plan && (
              <div style={{ flex: '0 0 90px' }}>
                <label style={lbl}>WEEK</label>
                <select value={week} onChange={e => setWeek(Number(e.target.value))} style={{ ...sel, width: '100%' }}>
                  {Array.from({ length: weeks }, (_, i) => i + 1).map(w => <option key={w} value={w}>W{w}</option>)}
                </select>
              </div>
            )}
          </div>

          {loadErr && <div style={{ color: C.rd, fontFamily: FB, fontSize: 12 }}>Couldn't load plans: {loadErr}</div>}
          {traineeId && plans === null && !loadErr && <div style={{ color: C.tm, fontFamily: FN, fontSize: 11, letterSpacing: '0.12em' }}>LOADING PLAN…</div>}
          {traineeId && plans && plans.length === 0 && <div style={{ color: C.tm, fontFamily: FB, fontSize: 12 }}>No active block for this athlete.</div>}

          {plan && days.map((d, di) => (
            <div key={di} style={{ marginBottom: 14 }}>
              <div style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, color: C.ac, letterSpacing: '0.14em', marginBottom: 6, textTransform: 'uppercase' }}>{d.label}</div>
              {d.ex.length === 0 ? <div style={{ color: C.td, fontFamily: FB, fontSize: 12 }}>No exercises.</div> : d.ex.map((ex, xi) => {
                const val = getF(d.nameRaw, ex.eid);
                return (
                  <div key={xi} style={{ marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                      <span style={{ fontFamily: FB, fontSize: 13, color: C.tx, direction: isHeb(ex.title) ? 'rtl' : 'ltr', fontWeight: 600 }}>{ex.title}</span>
                      {val && <span style={{ color: C.gn, fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em' }}>✓ SET</span>}
                    </div>
                    <textarea dir="auto" value={val} onChange={e => setF(d.nameRaw, ex.eid, e.target.value)}
                      placeholder="Focus for this exercise this week…"
                      style={{ width: '100%', boxSizing: 'border-box', background: 'transparent', border: `1px solid ${val ? C.ac : C.cardBd}`, borderLeft: `3px solid ${val ? C.ac : C.cardBd}`, color: C.tx, fontFamily: FB, fontSize: 13, padding: 8, borderRadius: 0, resize: 'vertical', minHeight: 38 }} />
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
