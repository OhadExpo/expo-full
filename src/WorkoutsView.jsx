import React, { useState, useEffect, useMemo, useRef } from 'react';
import { StoredVideo } from './StoredMedia';
import { fmtPrettyDate } from './dates';
import { C, FN, FB, FH, uid } from './theme';

// Hebrew renders ~3px smaller than Nord at the same fontSize (smaller
// x-height, missing ascenders/descenders). Same pattern that's already
// applied to NotesWidget, PlansView, WorkoutReview.
import { isHebrew } from './script';
import { Btn, TextArea, Badge, Card, ConfirmDialog, EmptyState, baseInput, isRefined5b, CollapsibleSection, CaretGlyph, ChipGrid } from './ui';
import { supabase } from './supabase';
import { traineeIdsFor } from './traineeUtils';
import { useT, tr, readLang, dirOfText } from './i18n';
import { useUrlSync, segmentAfter } from './urlState';
import { runPace } from './runPace';
import { presKm } from './runAnalysis';

// Inline exercise video — IDENTICAL rules to the group session (Ohad: "just play
// and pause, no clicking on the youtube video at all"). Plays in place, never
// navigates away or goes fullscreen. YouTube: sandboxed iframe (no allow-popups/
// allow-top-navigation so links can't navigate the page) + fs=0. Direct files:
// <video controlsList="nofullscreen nodownload"> + disablePictureInPicture.
const ytId = (url) => {
  const m = String(url || '').match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/);
  return m ? m[1] : null;
};
// Supersets are colour-coded BY LETTER (A=cyan, B=purple, C=orange, …) — the
// same scheme PlansView/CoachDemo use — so stacked supersets are distinguishable
// instead of one undifferentiated purple block.
const SS_PALETTE = [C.ac, C.pu, C.or, C.gn, C.pk].filter(Boolean);
const ssColor = (ss) => ss ? SS_PALETTE[(ss.toUpperCase().charCodeAt(0) - 65) % SS_PALETTE.length] : C.td;

// Title key for previous-week matching — mirrors the portal's normalization.
const prevTitleKey = (t) => { const n = String(t || '').toLowerCase().trim(); return n ? `t:${n}` : ''; };

function InlineVideo({ url }) {
  const yt = ytId(url);
  if (yt) {
    const short = /youtube\.com\/shorts\//i.test(String(url || ''));  // vertical → portrait frame
    return (
      <div style={{ marginTop: 8, marginBottom: 10, aspectRatio: short ? '9/16' : '16/9', background: '#000', border: `1px solid ${C.cardBd}`, maxWidth: short ? 260 : 400, marginInlineStart: 'auto', marginInlineEnd: 'auto' }}>
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
      <StoredVideo src={url} controls playsInline controlsList="nofullscreen nodownload" disablePictureInPicture
        style={{ width: '100%', maxWidth: 400, display: 'block', marginInlineStart: 'auto', marginInlineEnd: 'auto', marginTop: 8, marginBottom: 10, aspectRatio: '16/9', background: '#000', border: `1px solid ${C.cardBd}`, objectFit: 'contain' }} />
    );
  }
  return null;
}

function WorkoutLogger({ workout, exercises, priorWorkouts, onUpdate, onComplete, onBack, onBroadcastSet, athleteName = '' }) {
  const tt = useT();
  const run = workout.sport === 'running';   // #808: a run's rep = km / time / HR, as the athlete portal's run logger
  const updateSet = (ei,si,u) => { const exs=[...workout.exercises]; const sets=[...exs[ei].sets]; sets[si]={...sets[si],...u}; exs[ei]={...exs[ei],sets}; onUpdate({exercises:exs}); if (onBroadcastSet) { Object.entries(u).forEach(([k,v]) => onBroadcastSet(ei, si, k, v)); } };
  const updateEx = (ei,u) => { const exs=[...workout.exercises]; exs[ei]={...exs[ei],...u}; onUpdate({exercises:exs}); };
  // Group consecutive exercises that share a superset letter into one block —
  // like the athlete portal renders them — instead of a big "Group A" badge on
  // every row.
  const groups = [];
  workout.exercises.forEach((ex,i) => {
    const ss = ex.superset || '';
    const last = groups[groups.length-1];
    if (ss && last && last.ss === ss) last.items.push({ex,i});
    else groups.push({ ss, items:[{ex,i}] });
  });
  // Library lookup Map — 1,467 exercises; this view re-renders on every set
  // keystroke, so a linear .find per exercise card was the slowest input
  // path in the coach app.
  const exById = useMemo(() => new Map((exercises || []).map(e => [e.id, e])), [exercises]);
  // Most-recent prior top set per exerciseId — the "last time" reference,
  // the in-person equivalent of the athlete portal's previous-week ghost
  // row. Precomputed ONCE per priorWorkouts change (it used to re-sort the
  // whole history per exercise per render).
  const lastTimeById = useMemo(() => {
    const out = new Map();
    const sorted = (priorWorkouts || []).slice().sort((a, b) => new Date(b.completedAt || b.date) - new Date(a.completedAt || a.date));
    for (const pw of sorted) {
      for (const pex of (pw.exercises || [])) {
        // Tolerate both shapes: coach workouts use exerciseId/completed;
        // athlete client_workouts use eid/done.
        const id = pex.exerciseId || pex.eid;
        const tk = prevTitleKey(pex.title); // portal eids never match plan ids (audit 08-22)
        if ((!id || out.has(id)) && (!tk || out.has(tk))) continue;
        const sets = pex.sets || [];
        // A logged load qualifies even if the "done" box was skipped.
        const done = sets.filter(s => (s.completed || s.done) && parseFloat(s.load) > 0);
        const logged = done.length ? done : sets.filter(s => parseFloat(s.load) > 0);
        if (!logged.length) continue;
        const top = logged.reduce((a, b) => parseFloat(b.load) > parseFloat(a.load) ? b : a);
        const entry = { load: top.load, reps: top.reps, date: pw.completedAt || pw.date };
        if (id && !out.has(id)) out.set(id, entry);
        if (tk && !out.has(tk)) out.set(tk, entry);
      }
    }
    return out;
  }, [priorWorkouts]);
  const lastTimeFor = (ex) => lastTimeById.get(ex.exerciseId) || lastTimeById.get(prevTitleKey(ex.title)) || null;
  // Per-set previous-week reference (the portal's progressive-overload ghost):
  // what the athlete logged for THIS plan + day in the immediately previous
  // week. Keyed by exercise id → that exercise's set array. Tolerates both
  // shapes (eid/exerciseId). Empty on week 1 (no week before it).
  const prevWeek = useMemo(() => {
    const tgt = (Number(workout.week) || 1) - 1;
    const out = new Map();
    if (tgt < 1) return out;
    for (const pw of (priorWorkouts || [])) {
      if (pw.planName !== workout.planName || pw.dayName !== workout.dayName) continue;
      if ((Number(pw.week) || 0) !== tgt) continue;
      for (const pex of (pw.exercises || [])) {
        const id = pex.exerciseId || pex.eid;
        const sets = pex.sets || [];
        if (id && !out.has(id)) out.set(id, sets);
        const tk = prevTitleKey(pex.title);
        if (tk && !out.has(tk)) out.set(tk, sets);
      }
    }
    return out;
  }, [priorWorkouts, workout.week, workout.planName, workout.dayName]);
  // Collapse (long in-person sessions): a finished exercise folds to a
  // one-line summary so the rest of the list stays scannable. Auto-collapses
  // once every set is logged; tap the summary (or the HIDE control) to toggle.
  const [manualCollapse, setManualCollapse] = useState({}); // exIdx → explicit override
  const [groupCollapse, setGroupCollapse] = useState({});   // superset gi → explicit override
  // Sticky progress header pins below the coach nav (position:sticky top:0).
  // Measure the nav height so it stays correct at any width / wrap.
  const [stickyTop, setStickyTop] = useState(57);
  useEffect(() => {
    const measure = () => { const h = document.querySelector('header'); if (h) setStickyTop(Math.round(h.getBoundingClientRect().height)); };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);
  const allDone = (ex) => ex.sets.length > 0 && ex.sets.every(s => s.completed);
  const isCollapsed = (ex, exIdx) =>
    manualCollapse[exIdx] !== undefined ? manualCollapse[exIdx] : allDone(ex);
  const toggleCollapse = (ex, exIdx) =>
    setManualCollapse(m => ({ ...m, [exIdx]: !isCollapsed(ex, exIdx) }));
  // Superset-level collapse: one control for the whole group (both members),
  // instead of a HIDE per exercise. Auto-collapses once every member is done.
  const groupAllDone = (items) => items.length > 0 && items.every(({ ex }) => allDone(ex));
  const isGroupCollapsed = (gi, items) =>
    groupCollapse[gi] !== undefined ? groupCollapse[gi] : groupAllDone(items);
  const toggleGroup = (gi, items) =>
    setGroupCollapse(m => ({ ...m, [gi]: !isGroupCollapsed(gi, items) }));

  const renderExercise = (ex, exIdx, inGroup, withDivider, groupControlled = false) => {
    const exData = exById.get(ex.exerciseId);
    const videoUrl = ex.videoUrl ?? ex.vid ?? exData?.videoLink ?? '';
    const prevSets = prevWeek.get(ex.exerciseId) || prevWeek.get(prevTitleKey(ex.title));   // previous-week set array (or undefined) — id, then title (portal eids differ)
    const prevWeekNum = (Number(workout.week) || 1) - 1;
    // Plan note FIRST. ex.q never exists on this view's workout exercises
    // (startWorkout produces `notes`), so the old order resolved the generic
    // library cue ahead of the athlete-specific instruction the coach wrote —
    // and a note the coach deliberately cleared came back as the library cue.
    // SessionsView and the athlete portal both give the plan note precedence
    // (audit 08-22 #55).
    const cue = ex.notes || ex.q || exData?.cues || '';
    const doneCount = ex.sets.filter(s => s.completed).length;
    const fullyDone = allDone(ex);
    // Collapsed when every set is in (or the coach folded it): the card is just its strip. A superset member is
    // driven by its group's one control, so it never folds on its own.
    const folded = isCollapsed(ex, exIdx) && !groupControlled;
    const title = exData?.title || ex.title || 'Unknown';
    const capOf = (v) => String(v || '').replace(/^HR\s*/i, '');
    // one prescription line (#809): what to do, in the order it is read - the amount, the pace / tempo, the cap
    const rx = run
      ? [(ex.sets || []).length > 1 ? (ex.sets || []).length + ' × ' + (ex.reps || '') : ex.reps, ex.tempo, ex.load ? tt('HR up to {n}').replace('{n}', capOf(ex.load)) : '']
      : [(ex.sets || []).length + ' × ' + (ex.reps || '—'), (ex.tempo && String(ex.tempo) !== String(ex.reps)) ? ex.tempo : '', ex.rpe ? 'RPE ' + ex.rpe : '', ex.rest ? ex.rest + 's' : ''];
    const GRID = { display: 'grid', gridTemplateColumns: '32px 1fr 1fr 1fr 44px', gap: 4, alignItems: 'center' };
    // the athlete portal's set field: bordered on the card, no fill, 16px (iOS never zooms), the number centred
    const SETI = { background: 'var(--c-sf)', border: '1px solid ' + C.cardBd, borderRadius: 0, color: C.tx, fontFamily: FB, fontSize: 16, padding: '0 6px', height: 44, width: '100%', minWidth: 0, boxSizing: 'border-box', textAlign: 'center', outline: 'none', fontVariantNumeric: 'tabular-nums' };
    const strip = (
      <div className="title-strip" role={groupControlled ? undefined : 'button'} tabIndex={groupControlled ? undefined : 0} aria-expanded={groupControlled ? undefined : !folded}
        onClick={groupControlled ? undefined : () => toggleCollapse(ex, exIdx)}
        onKeyDown={groupControlled ? undefined : (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleCollapse(ex, exIdx); } }}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, minHeight: 41, boxSizing: 'border-box', padding: inGroup ? '9px 2px' : '9px 14px', background: inGroup ? 'transparent' : 'var(--c-stripBg, var(--c-sf))', borderBottom: folded ? 'none' : '1px solid ' + C.cardBd, cursor: groupControlled ? 'default' : 'pointer' }}>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
          <span style={{ fontFamily: FN, fontSize: 13, fontWeight: 700, color: fullyDone ? C.gn : 'var(--c-stripTx, ' + C.tx + ')', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{exIdx + 1}</span>
          <span dir="auto" style={{ fontFamily: isHebrew(title) ? FH : FN, fontSize: isHebrew(title) ? 15 : 13, fontWeight: 700, letterSpacing: isHebrew(title) ? 0 : '0.06em', textTransform: isHebrew(title) ? 'none' : 'uppercase', color: 'var(--c-stripTx, ' + C.tx + ')', lineHeight: 1.35, overflowWrap: 'anywhere', unicodeBidi: 'isolate' }}>{title}</span>
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexShrink: 0, fontFamily: FN, fontSize: 12, fontWeight: 700, color: fullyDone ? C.gn : C.tm, fontVariantNumeric: 'tabular-nums' }}>
          {fullyDone ? '✓ ' : ''}{doneCount}/{ex.sets.length}
          {!groupControlled && <span style={{ display: 'inline-flex', transform: folded ? 'none' : 'rotate(180deg)', transition: 'transform .15s', color: C.tx }}><CaretGlyph /></span>}
        </span>
      </div>
    );
    if (folded) return (
      <div key={ex.id} style={{ background: inGroup ? 'transparent' : 'var(--c-sf)', border: inGroup ? 'none' : '1px solid ' + C.cardBd, borderTop: withDivider ? '1px solid ' + C.cardBd : undefined, borderRadius: 0, marginBottom: inGroup ? 0 : 10 }}>{strip}</div>
    );
    return (
      <div key={ex.id} style={{ background: inGroup ? 'transparent' : 'var(--c-sf)', border: inGroup ? 'none' : '1px solid ' + C.cardBd, borderTop: withDivider ? '1px solid ' + C.cardBd : undefined, borderRadius: 0, marginBottom: inGroup ? 0 : 10 }}>
        {strip}
        <div style={{ padding: inGroup ? '12px 2px 8px' : 14 }}>
          {/* the prescription: one line, the amount first in the accent, each part isolated (a pace range never flips) */}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 8, rowGap: 2, marginBottom: 12, fontFamily: FB, fontSize: 15, fontWeight: 600, color: C.tx }}>
            {rx.filter(Boolean).map((v, k) => (
              <React.Fragment key={k}>
                {k > 0 && <span style={{ color: C.td }}>·</span>}
                <bdi dir="auto" style={{ color: k === 0 ? C.ac : C.tx, fontVariantNumeric: 'tabular-nums' }}>{v}</bdi>
              </React.Fragment>
            ))}
          </div>
          {/* Coach cue - the plan's note for this row, an accent-barred block, RTL-aware */}
          {cue && (
            <div style={{ display: 'flex', gap: 10, marginBottom: 12, background: 'rgba(57,189,255,0.06)', borderInlineStart: '3px solid ' + C.ac, padding: '9px 12px' }}>
              <span style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', color: C.ac, flexShrink: 0, paddingTop: 2 }}>{tt('CUE')}</span>
              <div style={{ minWidth: 0, flex: 1, fontSize: 13, color: C.tx, lineHeight: 1.5, direction: dirOfText(cue), textAlign: 'start', fontFamily: isHebrew(cue) ? FH : FB, wordBreak: 'break-word' }}>{cue}</div>
            </div>
          )}
          {videoUrl && <InlineVideo url={videoUrl} />}
          <div style={{ ...GRID, marginBottom: 4 }}>
            {(run ? ['', tt('KM'), tt('SPLIT'), tt('HR'), '✓'] : ['', tt('REPS'), tt('KG'), 'RPE', '✓']).map((h, k) => <div key={k} style={{ fontSize: 10.5, fontFamily: FN, fontWeight: 700, letterSpacing: '0.08em', color: C.tm, textAlign: 'center' }}>{h}</div>)}
          </div>
          {ex.sets.map((set, sIdx) => {
            // Ghost row above each set: what the athlete logged for this same set in the previous week, in the
            // input columns (the portal's reference row)
            const prior = prevSets?.[sIdx];
            const pace = run ? runPace(set.reps, set.time) : '';
            return <React.Fragment key={sIdx}>
              {prior && (parseFloat(prior.load) > 0 || prior.reps || (run && prior.time)) && (
                <div style={{ ...GRID, marginTop: sIdx === 0 ? 0 : 8, opacity: 0.72 }}>
                  <span style={{ fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: C.ac, textAlign: 'center' }}>W{prevWeekNum}</span>
                  {[prior.reps || '—', run ? (prior.time || '—') : (parseFloat(prior.load) || '—'), run ? (prior.hr || '—') : (prior.rpe || '—')].map((v, k) => <div key={k} style={{ fontFamily: FB, fontSize: 14, color: C.tx, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{v}</div>)}
                  <div />
                </div>
              )}
              <div style={{ ...GRID, marginBottom: 4, opacity: set.completed ? 0.5 : 1 }}>
                <span style={{ fontFamily: FN, fontSize: 13, color: C.td, textAlign: 'center' }}>{set.setNum}</span>
                {run ? <>
                  {/* a run's rep: DISTANCE in reps (km), TIME in its own field (never kg - PRs and tonnage never read a run), HR (#808) */}
                  <input aria-label={tt('Distance (km)')} value={set.reps} inputMode="decimal" onChange={e => updateSet(exIdx, sIdx, { reps: e.target.value.replace(',', '.') })} style={SETI} placeholder={String(ex.reps || '').replace(/\s*(km|ק״מ|ק"מ)$/i, '') || '—'} />
                  <input aria-label={tt('Time (mm:ss)')} value={set.time || ''} inputMode="numeric" onChange={e => updateSet(exIdx, sIdx, { time: e.target.value.replace(/[.,]/g, ':') })} style={SETI} placeholder={tt('mm:ss')} />
                  <input aria-label={tt('Heart rate')} value={set.hr || ''} inputMode="numeric" onChange={e => updateSet(exIdx, sIdx, { hr: e.target.value.replace(/\D/g, '') })} style={SETI} placeholder={ex.load ? capOf(ex.load) : '—'} />
                </> : <>
                  <input aria-label={tt('Reps')} value={set.reps} inputMode="numeric" onChange={e => updateSet(exIdx, sIdx, { reps: e.target.value })} style={SETI} placeholder="—" />
                  <input aria-label={tt('Weight (kg)')} value={set.load} inputMode="decimal" onChange={e => updateSet(exIdx, sIdx, { load: e.target.value.replace(',', '.') })} style={SETI} placeholder="—" />
                  <input aria-label="RPE" value={set.rpe} inputMode="decimal" onChange={e => updateSet(exIdx, sIdx, { rpe: e.target.value.replace(',', '.') })} style={SETI} placeholder="—" />
                </>}
                {/* the whole cell is the tap target, a 24px tick centred in it (the portal's) */}
                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 44, cursor: 'pointer' }}>
                  {/* a run set ticked with its distance empty records the prescribed distance, as the athlete's own logger does (#851 / #866) */}
                  <input type="checkbox" checked={set.completed} onChange={e => { const v = e.target.checked; const k = run && v && !String(set.reps || '').trim() ? presKm(String(ex.reps || '')) : null; updateSet(exIdx, sIdx, k != null ? { completed: v, reps: String(k) } : { completed: v }); }} style={{ width: 24, height: 24, margin: 0, accentColor: C.gn, cursor: 'pointer' }} />
                </label>
              </div>
              {/* a run's pace, under its own TIME column (#809: it floated between the columns) */}
              {pace && (
                <div data-run-pace style={{ ...GRID, margin: '-2px 0 6px' }}>
                  <span /><span />
                  <span style={{ fontFamily: FN, fontSize: 11, fontWeight: 700, color: C.ac, textAlign: 'center', fontVariantNumeric: 'tabular-nums', unicodeBidi: 'isolate' }} dir="auto">{pace} {tt('/km')}</span>
                  <span /><span />
                </div>
              )}
            </React.Fragment>;
          })}
          {/* Coach's session note - separate from the prescribed cue above, so it starts blank */}
          <input value={ex.coachNote || ''} onChange={e => updateEx(exIdx, { coachNote: e.target.value })} placeholder={tt('Notes for this exercise…')} dir="auto"
            style={{ ...SETI, height: 'var(--btn-h, 36px)', fontSize: 13, textAlign: 'start', padding: '0 10px', marginTop: 8, fontFamily: FB }} />
        </div>
      </div>);
  };
  const totalSets = workout.exercises.reduce((a,ex)=>a+ex.sets.length,0);
  const doneSets = workout.exercises.reduce((a,ex)=>a+ex.sets.filter(s=>s.completed).length,0);
  const pct = totalSets>0?Math.round(doneSets/totalSets*100):0;
  const isCompleted = workout.status==="completed";
  return (
    <div>
      {/* Sticky progress header — pinned just below the coach nav so the %
          progress + Back stay on screen through a long scroll. The Complete
          action lives at the BOTTOM, after Session Observations (Ohad). */}
      <div style={{position:'sticky',top:stickyTop,zIndex:40,background:C.bg,paddingTop:8,paddingBottom:10,marginBottom:8,borderBottom:`1px solid ${C.cardBd}`}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <button onClick={onBack} style={{background:"none",border:"none",color:C.ac,cursor:"pointer",fontFamily:FN,fontSize:12,fontWeight:700,letterSpacing:'0.06em',padding:0}}>← {tr(readLang(), 'BACK')}</button>
          {isCompleted&&<Badge color={C.gn} style={{fontSize:13,padding:"6px 14px"}}>{tt('Completed')}</Badge>}
        </div>
        {/* WHO this session is for, first and big (#810: the head named the day and the block, never the athlete) */}
        {athleteName && <div style={{fontFamily:isHebrew(athleteName)?FH:FN,fontSize:isHebrew(athleteName)?22:19,fontWeight:700,letterSpacing:isHebrew(athleteName)?0:'0.04em',textTransform:isHebrew(athleteName)?'none':'uppercase',color:C.tx,lineHeight:1.25,marginBottom:6,overflowWrap:'anywhere',textAlign:'start'}}><bdi>{athleteName}</bdi></div>}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:'baseline',gap:12,fontSize:12,fontFamily:FN,color:C.tm,marginBottom:6}}>
          <span style={{minWidth:0,display:'flex',flexWrap:'wrap',columnGap:8,alignItems:'baseline'}}><bdi dir="auto" style={{color:C.tx,fontWeight:700}}>{workout.dayName}</bdi>{workout.planName&&<bdi dir="auto" style={{color:C.td}}>{workout.planName}</bdi>}</span>
          <span style={{color:C.tx,fontWeight:700,whiteSpace:'nowrap',flexShrink:0,unicodeBidi:'isolate'}}>{readLang() === 'he' ? `שבוע ${workout.week}` : `W${workout.week}`} · {doneSets}/{totalSets} · {pct}%</span></div>
        <div style={{background:'var(--c-sf)',border:`1px solid ${C.cardBd}`,borderRadius:0,height:6,overflow:"hidden"}}><div style={{background:C.gn,height:"100%",width:`${pct}%`,transition:"width 0.3s"}}/></div>
      </div>
      {groups.map((g,gi) => g.ss ? (() => {
        // One expand/collapse for the whole superset — drives both members.
        const collapsed = isGroupCollapsed(gi, g.items);
        const allD = groupAllDone(g.items);
        const doneSets = g.items.reduce((a,{ex})=>a+ex.sets.filter(s=>s.completed).length,0);
        const totalSets = g.items.reduce((a,{ex})=>a+ex.sets.length,0);
        const titles = g.items.map(({ex})=>(exById.get(ex.exerciseId)?.title)||ex.title||'?').join(' + ');
        const sc = ssColor(g.ss);
        return (
        <div key={gi} style={{border:`1px solid ${sc}`, borderInlineStart:`3px solid ${allD?C.gn:sc}`, borderRadius:0, padding:'8px 12px', marginBottom:10, background: 'var(--c-sf)'}}>
          <button onClick={()=>toggleGroup(gi,g.items)} title={tr(readLang(), collapsed?'Expand superset':'Collapse superset')}
            style={{width:'100%',display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,background:'transparent',border:'none',cursor:'pointer',padding:0,textAlign: 'start'}}>
            <span style={{fontFamily:FN,fontSize:9,fontWeight:700,letterSpacing:'0.18em',color:allD?C.gn:sc,textTransform:'uppercase',minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
              {allD && <span style={{marginInlineEnd:6}}>✓</span>}{tr(readLang(), 'Superset')} {g.ss}{collapsed && <span style={{color:C.tm,fontWeight:600,letterSpacing:'0.04em',textTransform:'none'}}> · {titles}</span>}
            </span>
            <span style={{fontFamily:FN,fontSize:9,fontWeight:700,letterSpacing:'0.12em',color:allD?C.gn:C.tm,flexShrink:0,whiteSpace:'nowrap'}}>{doneSets}/{totalSets} · {tt(collapsed?'EXPAND':'COLLAPSE')}</span>
          </button>
          {!collapsed && <div style={{marginTop:4}}>{g.items.map(({ex,i},k) => renderExercise(ex, i, true, k>0, true))}</div>}
        </div>
        );
      })() : (
        g.items.map(({ex,i}) => renderExercise(ex, i, false))
      ))}
      <TextArea label="Workout Notes" value={workout.notes||""} onChange={e=>onUpdate({notes:e.target.value})} placeholder={tt('Session observations...')} />
      {/* Primary Complete action at the very bottom — after every set + the
          session notes (Ohad: "complete workout … beneath session observations"). */}
      {!isCompleted
        ? <div style={{display:'flex',justifyContent:'center',marginTop:16}}><Btn variant="success" onClick={onComplete} style={{padding:'14px 48px',fontSize:14,fontWeight:700}}>{tt('Complete Workout')}</Btn></div>
        : <div style={{marginTop:16,textAlign:'center'}}><Badge color={C.gn} style={{fontSize:13,padding:"8px 16px"}}>{tt('Completed')}</Badge></div>}
    </div>);
}

export default function WorkoutsView({ workouts, setWorkouts, planIndex, trainees, exercises, onDecrementSession, clientWorkouts = [], setClientWorkouts, deleteClientWorkout }) {
  const tt = useT();
  const libById = useMemo(() => new Map((exercises || []).map(e => [e.id, e])), [exercises]);
  // The active session is LOCAL (component state), never persisted as an
  // "in-progress" record — a half-logged session shouldn't be saved unless an
  // athlete is genuinely live in the app. On Complete it's written to
  // client_workouts (the athlete's portal history).
  const [active, setActive] = useState(null);
  // THE LOGGER HAS ITS URL (14.10 #770 phase 2): /coach/sessions-single/logging/<athlete> while a session is logged;
  // Back closes it, as its own BACK does. A live session is not in the URL, so a reload lands on the picker.
  const SW_BASE = '/coach/sessions-single';
  const onSingle = () => typeof window !== 'undefined' && window.location.pathname.startsWith(SW_BASE);
  useUrlSync(active ? `logging/${active.traineeId || ''}` : null, (v) => { if (!v) setActive(null); else window.history.replaceState(window.history.state, '', SW_BASE + window.location.search); /* Forward into a closed logger: it cannot resume - the picker's URL */ }, {
    toPath: (v) => (!onSingle() ? null : v ? `${SW_BASE}/${v.split('/').map(encodeURIComponent).join('/')}` : (segmentAfter(window.location.pathname, SW_BASE) === 'logging' ? { path: SW_BASE, replace: true } : null)),
    fromPath: (pth) => (segmentAfter(pth, SW_BASE) === 'logging' ? pth.slice(SW_BASE.length + 1) : null),
  });
  useEffect(() => {   // a reload of a logging URL: nothing to resume - say so in the URL too
    if (onSingle() && segmentAfter(window.location.pathname, SW_BASE) === 'logging') window.history.replaceState(window.history.state, '', SW_BASE + window.location.search);
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  const [filterTrainee, setFilterTrainee] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [expandedTrainees, setExpandedTrainees] = useState({});
  // Picker state — search box + which athlete row is expanded (accordion) +
  // the chosen "log into" week per plan (picked before entering the logger).
  const [pickSearch, setPickSearch] = useState("");
  const [pickOpen, setPickOpen] = useState(null);
  const [weekByPlan, setWeekByPlan] = useState({});
  // Next un-logged (week, dayIdx) for a plan — the autopicker rule, IDENTICAL to
  // the group session's nextWorkout: scan weeks then days, return the first
  // (week, day) the athlete hasn't logged in their portal history. Partially-done
  // week stays in that week (W1 day1 done, day2 not → W1 day2, NOT W2). Fully-done
  // block → last week, day 0 (nothing left). This is "the workout we're on".
  // #850: a day of one week (plan index dayWeeks) is offered in that week only
  const inWk = (p, i, w) => { const ow = p.dayWeeks && p.dayWeeks[i]; return ow == null || ow === '' || Number(ow) === Number(w); };
  const nextWorkoutFor = (p) => {
    const dayNames = p.dayNames || [];
    const planWeeks = Number(p.weeks) || 4;
    if (!dayNames.length) return { week: 1, dayIdx: 0 };
    const logs = (clientWorkouts || []).filter(x => x.clientId === p.traineeId && x.planName === p.name);
    const done = new Set(logs.map(x => `${Number(x.week) || 1}|${x.dayName}`));
    // Continue from the LATEST trained week (don't backfill a skipped earlier
    // day) — sync to the athlete's actual position from their last logged workout.
    const maxWk = logs.length ? Math.max(...logs.map(x => Number(x.week) || 1)) : 1;
    for (let wk = Math.max(1, maxWk); wk <= planWeeks; wk++) {
      for (let di = 0; di < dayNames.length; di++) {
        if (inWk(p, di, wk) && !done.has(`${wk}|${dayNames[di]}`)) return { week: wk, dayIdx: di };
      }
    }
    return { week: Math.min(planWeeks, Math.max(1, maxWk)), dayIdx: 0 };
  };
  // First un-logged day within a SPECIFIC week (so the day highlight follows the
  // coach's week pick). -1 if every day that week is already done.
  const nextDayInWeek = (p, week) => {
    const doneDays = new Set((clientWorkouts || [])
      .filter(x => x.clientId === p.traineeId && x.planName === p.name && (Number(x.week) || 1) === week)
      .map(x => x.dayName));
    return (p.dayNames || []).findIndex((d, i) => inWk(p, i, week) && !doneDays.has(d));
  };
  // Default week for a plan = the week of the next un-logged workout.
  const defaultWeekFor = (p) => nextWorkoutFor(p).week;
  // Seed the trainee filter from sessionStorage — set by the "LOG SESSION"
  // button on TraineeDetail so the coach lands here pre-filtered to the
  // athlete they were just looking at. Stash is consumed on first mount.
  useEffect(() => {
    try {
      const tid = sessionStorage.getItem('expo-pendingInPersonTrainee');
      if (tid) { setFilterTrainee(tid); sessionStorage.removeItem('expo-pendingInPersonTrainee'); }
    } catch {}
  }, []);
  const startWorkout = async (planSummary, dayIdx, weekArg) => {
    // Load full plan data from Supabase
    const { data: fullPlan } = await supabase.from('plans').select('*').eq('id', planSummary.id).single();
    if (!fullPlan) return;
    const days = fullPlan.data?.days || [];
    const day = days[dayIdx];
    if (!day) return;
    // Drive-imported plans store exercises under day.ex with compressed keys
    // (eid/s/r) instead of day.exercises (id/exerciseId/sets/reps). Without
    // this fallback the in-person log crashes on old-shape plans — 174 of the
    // 209 production plans use the old shape. Mirror useFullPlan's normalize.
    const dayExercises = Array.isArray(day.exercises) ? day.exercises.filter(Boolean) : (Array.isArray(day.ex) ? day.ex.filter(Boolean).map(e => ({
      id: e.id || uid(),
      exerciseId: e.exerciseId || e.eid || '',
      sets: e.sets ?? e.s ?? 3,
      reps: e.reps ?? e.r ?? '',
      tempo: e.tempo ?? '',
      load: e.load ?? '',   // a RUN's HR cap lives here (#808)
      rest: e.rest ?? '',
      superset: e.superset ?? '',
      notes: e.notes ?? e.n ?? '',
      // Per-week prescriptions must survive the compact-shape normalise, or the
      // logger silently falls back to the base placeholder (audit 08-22 #17).
      wk: e.wk,
      wkS: e.wkS,
      // The per-row video override must survive too (audit 08-22 #102). Without
      // it the logger fell back to the library clip on old-shape plans — 174 of
      // 209 — showing a video the coach had overridden, or one they had
      // deliberately CLEARED. `??` keeps the three states apart: undefined
      // inherits, '' means "no video here", a url wins.
      videoUrl: e.videoUrl ?? e.vid,
    })) : []);
    // Week comes from the picker (chosen before entering the logger). Fall back
    // to the athlete's next un-logged week for this plan+day if none passed.
    const planWeeks = Number(fullPlan.data?.weeks) || 4;
    let week = Number(weekArg) || 0;
    if (week < 1) {
      const loggedWeeks = (clientWorkouts || [])
        .filter(x => x.clientId === fullPlan.trainee_id && x.planName === fullPlan.name && x.dayName === day.name)
        .map(x => Number(x.week) || 1);
      week = loggedWeeks.length ? Math.max(...loggedWeeks) + 1 : 1;
    }
    week = Math.min(planWeeks, Math.max(1, week));
    // a RUNNING block (#808): the logger takes km / time / HR per rep, saved in the portal's own run shape
    const isRun = fullPlan.data?.sport === 'running';
    const w = {id:uid(),planId:fullPlan.id,traineeId:fullPlan.trainee_id,dayName:day.name,planName:fullPlan.name,
      date:new Date().toISOString(),status:"in-progress", week, planWeeks, ...(isRun ? { sport: 'running' } : {}),
      // Plans that vary reps/sets per week store ex.wk / ex.wkS — read the
      // CHOSEN week, exactly as SessionsView and the athlete portal already do.
      // Using the base values here showed the placeholder reps ("3x>"),
      // allocated the wrong number of set rows, wrote the wrong prescribed
      // string into the athlete's permanent history, and desynced the
      // index-matched live set-sync (audit 08-22 #17).
      exercises:dayExercises.map(ex=>{
        const wi = week - 1;
        const reps = (Array.isArray(ex.wk) && ex.wk[wi] != null && ex.wk[wi] !== '') ? ex.wk[wi] : (ex.reps ?? '');
        const rawS = (Array.isArray(ex.wkS) && ex.wkS[wi] != null) ? ex.wkS[wi] : ex.sets;
        // a run's 'sets' is its rep count as written ('5' of 5 × 1 km): the week's when it reads, else the base, else one -
        // exactly the portal's rule, so the two loggers hold the same rows for the live sync (#808)
        const runN = (v) => { const n = parseInt(v, 10); return n > 0 ? n : 0; };
        const setCount = isRun ? (runN(Array.isArray(ex.wkS) ? ex.wkS[wi] : null) || runN(ex.sets) || 1) : Math.max(1, Number(rawS) || 3);
        return {...ex,id:uid(),reps,sets:Array.from({length:setCount},(_,i)=>({setNum:i+1,reps:"",load:"",rpe:"",...(isRun ? { time:"", hr:"" } : {}),completed:false}))};
      }),
      notes:""};
    setActive(w);
  };
  const updateActive = (updates) => setActive(prev => prev ? { ...prev, ...updates } : prev);
  // Live two-way bridge for the SINGLE (1-on-1) session — mirrors the group
  // session's. The coach's edits here broadcast to the athlete's portal, and
  // the athlete's portal edits merge into this live logger. Same 'gym-session'
  // channel + 'athlete-set' event as SessionsView; single-athlete so we match
  // on active.traineeId (no athletes[] loop), map eid→exerciseId, and translate
  // the portal's 'done' field to this view's 'completed'.
  const chanRef = useRef(null);
  const subscribedRef = useRef(false);
  const activeRef = useRef(active);
  activeRef.current = active;
  useEffect(() => {
    const tid = active?.traineeId;
    if (!tid) return undefined;
    const matches = (prev, p) => prev && prev.traineeId === p.traineeId
      && (!p.planName || !prev.planName || p.planName === prev.planName)
      && (!p.dayName || !prev.dayName || p.dayName === prev.dayName)
      && (p.week == null || prev.week == null || p.week === prev.week);
    // Per-trainee topic (see ClientPortal) so only THIS athlete's portal shares
    // the room — no cross-athlete leak on the old shared 'gym-session'.
    // PRIVATE (#35): realtime.messages RLS authorizes staff here, and the
    // athlete's own portal for the same topic. Before #35 anyone with the
    // browser-shipped anon key could join a guessed 'gym-set:<id>'.
    const ch = supabase.channel('gym-set:' + tid, { config: { private: true, broadcast: { self: false } } });
    // Matched by EXERCISE INDEX (ei) — the portal derives exercise ids from the
    // title while this logger uses the plan's exerciseId, so only position is a
    // reliable shared key. 'done' (portal) maps to 'completed' (this view).
    ch.on('broadcast', { event: 'athlete-set' }, ({ payload: p }) => {
      if (!p || !p.traineeId || p.ei == null || p.si == null || !p.field) return;
      setActive(prev => {
        if (!matches(prev, p)) return prev;
        const key = p.field === 'done' ? 'completed' : p.field;
        const ex = prev.exercises?.[p.ei];
        if (!ex || p.si >= (ex.sets || []).length) return prev;
        if (ex.sets[p.si]?.[key] === p.value) return prev; // no-op — avoid churn / needless overwrite
        const exercises = prev.exercises.map((e, ei) => ei === p.ei
          ? { ...e, sets: e.sets.map((s, i) => i === p.si ? { ...s, [key]: p.value } : s) }
          : e);
        return { ...prev, exercises };
      });
    });
    // CATCH-UP: reply to a peer's sync-request with the current logged sets
    // (positional exercises[], index = exercise index).
    ch.on('broadcast', { event: 'sync-request' }, ({ payload: p }) => {
      const a = activeRef.current;
      if (!p || !p.traineeId || !matches(a, p)) return;
      const exercises = (a.exercises || []).map(ex => ({ sets: (ex.sets || []).map(s => ({ reps: s.reps, load: s.load, rpe: s.rpe, done: s.completed, ...(s.time ? { time: s.time } : {}), ...(s.hr ? { hr: s.hr } : {}) })) }));   // a run's time + HR too (#808)
      if (!exercises.some(x => x.sets.some(s => s.reps || s.load || s.rpe || s.done || s.time || s.hr))) return;
      try { ch.send({ type: 'broadcast', event: 'sync-state', payload: { traineeId: a.traineeId, planName: a.planName, dayName: a.dayName, exercises } }); } catch { /* not ready */ }
    });
    // CATCH-UP: fill empty local slots from a peer's replied state (by index).
    ch.on('broadcast', { event: 'sync-state' }, ({ payload: p }) => {
      if (!p || !p.traineeId || !Array.isArray(p.exercises)) return;
      setActive(prev => {
        if (!matches(prev, p)) return prev;
        let hit = false;
        const exercises = prev.exercises.map((ex, ei) => {
          const rex = p.exercises[ei];
          if (!rex) return ex;
          const sets = (ex.sets || []).map((s, si) => {
            const rs = rex.sets?.[si];
            if (!rs) return s;
            const ns = { ...s };
            ['reps', 'load', 'rpe', 'time', 'hr'].forEach(f => { if ((ns[f] === '' || ns[f] == null) && rs[f] != null && rs[f] !== '') { ns[f] = rs[f]; hit = true; } });   // a run's time + HR (#808)
            if (!ns.completed && rs.done) { ns.completed = true; hit = true; }
            return ns;
          });
          return { ...ex, sets };
        });
        return hit ? { ...prev, exercises } : prev;
      });
    });
    const ping = (a) => { if (a?.traineeId) { try { ch.send({ type: 'broadcast', event: 'sync-request', payload: { traineeId: a.traineeId, planName: a.planName, dayName: a.dayName } }); } catch { /* not ready */ } } };
    // setAuth() before joining — a private join is authorized from the JWT on
    // the realtime socket, which may not be set yet on a fresh page load.
    let disposed = false;
    (async () => {
      try { await supabase.realtime.setAuth(); } catch { /* surfaced below */ }
      if (disposed) return;
      ch.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          subscribedRef.current = true;
          ping(activeRef.current);
          // AND push what the coach has already typed. A sync-request only
          // PULLS; broadcasts sent before the channel finished subscribing were
          // swallowed. So on slow gym wifi the coach could type the first set's
          // load during the ~1s join window, have it dropped, and the portal —
          // already open on the athlete's phone — would never learn about it,
          // then blank those values from the athlete's own finish() as
          // untouched prefills. The group session already does this (audit F4);
          // the single logger was missed (audit #103).
          //
          // The portal applies sync-state fill-empty-only, so this cannot
          // clobber anything the athlete has entered himself.
          const a = activeRef.current;
          if (a && a.traineeId) {
            // done from the coach's `completed` (the key here was `done` - his ticks were never pushed on join); a run's time + HR (#808)
            const exercises = (a.exercises || []).map(ex => ({ sets: (ex.sets || []).map(s2 => ({ reps: s2.reps, load: s2.load, rpe: s2.rpe, done: !!s2.completed, ...(s2.time ? { time: s2.time } : {}), ...(s2.hr ? { hr: s2.hr } : {}) })) }));
            if (exercises.some(x => x.sets.some(s2 => s2.reps || s2.load || s2.rpe || s2.done || s2.time || s2.hr))) {
              try { ch.send({ type: 'broadcast', event: 'sync-state', payload: { traineeId: a.traineeId, planName: a.planName, dayName: a.dayName, week: a.week, exercises } }); } catch { /* not ready */ }
            }
          }
        }
        else if (status === 'CHANNEL_ERROR') console.warn('[live-sync] coach 1-on-1 channel not authorized for', tid);
      });
    })();
    chanRef.current = ch;
    return () => { disposed = true; chanRef.current = null; subscribedRef.current = false; supabase.removeChannel(ch); };
  }, [active?.traineeId]); // re-subscribe to the per-trainee topic when the athlete changes
  // Broadcast one coach set-edit to the athlete's portal. Reads the live
  // `active` via closure (recreated each render), translates 'completed'→'done'.
  const broadcastSet = (ei, si, field, value) => {
    if (!active || ei == null) return;
    try {
      chanRef.current?.send({ type: 'broadcast', event: 'athlete-set', payload: {
        traineeId: active.traineeId, planName: active.planName, dayName: active.dayName, week: active.week,
        ei, si, field: field === 'completed' ? 'done' : field, value,
      } });
    } catch { /* channel not ready */ }
  };
  // Double-tap guard. Nothing blocked a second call before setActive(null)
  // committed, so a laggy phone minted TWO client_workouts rows and dropped the
  // athlete's paid balance by 2 for one session. Both sibling surfaces already
  // guard exactly this (ClientPortal submittingRef, SessionsView finishingRef)
  // — this one didn't (audit 08-22 #56).
  const completingRef = useRef(false);
  const completeWorkout = () => {
    const w = active;
    if (!w || completingRef.current) return;
    completingRef.current = true;
    // try/finally, not a trailing release: if anything in here throws (a
    // decrement handler, a bad exercise row) the ref would stay latched and
    // "Complete Workout" would be dead for the rest of the session.
    try {
    const finishedAt = new Date().toISOString();
    if (w.traineeId) onDecrementSession(w.traineeId);
    // FULL PORTAL INTEGRATION: write a client_workouts row so the in-person
    // session shows in the athlete's portal History / PRs / previous-week
    // ghost — the same store + shape the portal logs to. reviewedAt is set
    // (the coach logged it, nothing to review) and source tags its origin.
    if (setClientWorkouts) {
      const row = {
        id: 'cw_' + uid(), clientId: w.traineeId, planId: w.planId || null, planName: w.planName, dayName: w.dayName,
        week: Number(w.week) || 1, date: finishedAt, completedAt: finishedAt,
        notes: w.notes || '', formVideos: [], reviewedAt: finishedAt, source: 'coach-session',
        exercises: (w.exercises || []).map(ex => ({
          eid: ex.exerciseId || '',
          title: libById.get(ex.exerciseId)?.title || ex.title || '',
          prescribed: w.sport === 'running' ? `${(ex.sets || []).length}x${ex.reps || ''}` : `${(ex.sets || []).length}×${ex.reps || ''}`,   // a run as the portal writes it (#808)
          sets: (ex.sets || []).map(s => ({ reps: s.reps, load: s.load, rpe: s.rpe, done: !!s.completed, ...(s.time ? { time: s.time } : {}), ...(s.hr ? { hr: s.hr } : {}) })),
          substitution: null,
        })),
      };
      setClientWorkouts(prev => [...prev, row]);
    }
    setActive(null);
    } finally {
      // Released on the next tick — by then `active` is null, so the `!w` check
      // carries the guard from here on.
      setTimeout(() => { completingRef.current = false; }, 0);
    }
  };
  // Filter the plan picker. Without this, the picker dumps all 209
  // production plans into one scroll. Active-only by default and a
  // trainee filter that piggybacks the same state the Completed
  // filter below already uses, so the coach only sees relevant
  // starting points.
  // NOTE: every useMemo lives ABOVE the early `return` below — React
  // requires identical hook order each render. Crash repro before this
  // ordering fix was React #300 ("rendered more hooks than during the
  // previous render") when activeWorkout toggled between renders.
  // Couples: one row, plans on the MEMBER ids — expand so their blocks are
  // visible here too (audit 08-22 #54). memberOwner maps a member id back to
  // the row it belongs to, so grouping and the name lookup still work.
  const activeTraineeIds = useMemo(
    () => new Set((trainees || []).filter(t => t.status !== 'Archived').flatMap(t => traineeIdsFor(t.id))),
    [trainees]
  );
  const visiblePlans = useMemo(
    () => (planIndex || []).filter(p =>
      p.active !== false &&
      activeTraineeIds.has(p.traineeId) &&
      (!filterTrainee || p.traineeId === filterTrainee)
    ),
    [planIndex, activeTraineeIds, filterTrainee]
  );
  // Group visiblePlans by trainee and pick the latest block per trainee
  // (most recently updated). For an in-person session, the coach is
  // almost always logging against the trainee's CURRENT block, not an
  // older one. So default the picker to one card per trainee. The
  // expander reveals the older blocks for the rare "they're running a
  // different program today" case.
  // "Current block" = the plan most recently TRAINED (client_workouts activity),
  // else most recently ASSIGNED (createdAt). NOT updatedAt (an edited-but-untrained
  // old block wrongly won — e.g. Yuval's "Block #3" updated after he'd moved on to
  // "Block Alpha") and NOT blockNum (inconsistent numbering). So plans[0] = the
  // block the athlete is actually on.
  const plansByTrainee = useMemo(() => {
    const m = new Map();
    for (const p of visiblePlans) {
      // Group a member's plans under their PARENT row so the picker shows one
      // card per athlete/couple and the name lookup resolves (audit #54).
      const key = String(p.traineeId || '').split('__')[0] || p.traineeId;
      if (!m.has(key)) m.set(key, []);
      m.get(key).push(p);
    }
    const lastLog = (tid, n) => { const ds = (clientWorkouts || []).filter(x => x.clientId === tid && x.planName === n).map(x => new Date(x.date || 0).getTime()).filter(Boolean); return ds.length ? Math.max(...ds) : 0; };
    const score = (p) => Math.max(lastLog(p.traineeId, p.name), new Date(p.createdAt || 0).getTime());
    for (const arr of m.values()) {
      arr.sort((a, b) => (score(b) - score(a)) || (new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0)));
    }
    return m;
  }, [visiblePlans, clientWorkouts]);
  if (active) {
    const w = active;
    // Previous-week reference reads the athlete's portal history (the same
    // store the portal logs to, which now includes coach-logged sessions).
    const priorWorkouts = (clientWorkouts||[]).filter(x => x.clientId===w.traineeId);
    const athleteName = (() => { const t = (trainees || []).find(x => traineeIdsFor(x.id).includes(w.traineeId)); if (!t) return ''; const mi = String(w.traineeId).split('__')[1]; return (mi != null && t.members && t.members[parseInt(mi, 10)]?.name) || t.name || ''; })();   // a couple's session names the partner on the floor (review)
    return <WorkoutLogger workout={w} exercises={exercises} priorWorkouts={priorWorkouts} onUpdate={updateActive} onComplete={completeWorkout} onBack={()=>setActive(null)} onBroadcastSet={broadcastSet} athleteName={athleteName} />;
  }
  // "Completed" = coach-logged sessions in the athlete's portal history.
  const completed = (clientWorkouts||[])
    .filter(w => w.source==='coach-session' && (!filterTrainee || w.clientId===filterTrainee))
    .slice().sort((a,b)=> new Date(b.date||0) - new Date(a.date||0));
  const toggleExpanded = (tid) => setExpandedTrainees(prev => ({ ...prev, [tid]: !prev[tid] }));
  // Athlete rows for the picker (hoisted so the header can show the count).
  const pickerRows = Array.from(plansByTrainee.entries())
    .map(([tid,plans])=>({tid,plans,name:(trainees.find(t=>t.id===tid)?.name)||''}))
    .filter(r => filterTrainee ? r.tid===filterTrainee : (!pickSearch || r.name.toLowerCase().includes(pickSearch.toLowerCase())))
    .sort((a,b)=>a.name.localeCompare(b.name));
  return (
    <div>
      {/* Picker — search-first accordion. One calm row per athlete (name +
          current block); tap to reveal that block's day buttons. Replaces the
          old wall of full-height cards (every athlete's buttons + older-block
          bars on screen at once = too much). */}
      {(planIndex||[]).length===0 ? (
        <div style={{color:C.td,fontSize:13,marginBottom:20}}>{tt('Create a plan first.')}</div>
      ) : (
        <div style={{marginBottom:24}}>
          {/* Search — big, cyan-bordered, matching the Exercise Library search. */}
          {filterTrainee ? (
            <button onClick={()=>setFilterTrainee("")} style={{background:'none',border:'none',color:C.ac,cursor:'pointer',fontFamily:FN,fontSize:11,fontWeight:700,letterSpacing:'0.08em',padding:'0 0 12px'}}>{tt('← all athletes')}</button>
          ) : (
            <input type="text" value={pickSearch} onChange={e=>setPickSearch(e.target.value)} placeholder={tt('Search athlete…')}
              style={{...baseInput,textAlign:'start',width:'100%',boxSizing:'border-box',minHeight:'var(--btn-h)',padding:'0 14px',fontSize:13,border:`1px solid ${C.ac}`,marginBottom:12}} />
          )}
          {/* Card: cyan strip header ("Start a Session" + count) over the athlete
              accordion — same card/strip language as the Exercise Library. */}
          <div style={{background:'var(--c-sf)',border:`1px solid ${C.cardBd}`,borderRadius:0,overflow:'hidden'}}>
            <div className="title-strip" style={{background:'var(--c-stripBg, var(--c-sf))',borderBottom:'1px solid var(--c-cardBd)',padding:'0 14px',minHeight:41,boxSizing:'border-box' /* the house strip box (OCD #494: was 34px) */,display:'flex',justifyContent:'space-between',alignItems:'center',gap:10}}>
              <span style={{fontFamily:FN,fontSize:13,fontWeight:700,color:'var(--c-stripTx)',textTransform:'uppercase',letterSpacing:'0.08em'}}>{tt('Start a Session')}</span>
              <span style={{fontFamily:FN,fontSize:10,fontWeight:700,color:'var(--c-stripTx)',opacity:0.85,letterSpacing:'0.08em'}}>{readLang() === 'he' ? (pickerRows.length === 1 ? 'מתאמן אחד' : `${pickerRows.length} מתאמנים`) : `${pickerRows.length} athlete${pickerRows.length !== 1 ? 's' : ''}`}</span>
            </div>
            {(() => {
              const rows = pickerRows;
              if (!rows.length) return <div style={{color:C.td,fontSize:13,padding:'18px',textAlign:'center'}}>{tt('No athletes match.')}</div>;
              // Auto-open when the list is down to one (search hit or deep-link).
              const forceOpen = (filterTrainee || (rows.length===1 ? rows[0].tid : null));
              return rows.map(({tid,plans,name},ri)=>{
                const open = pickOpen===tid || forceOpen===tid;
                const latest = plans[0];
                const heb = isHebrew(name);
                const olderOpen = !!expandedTrainees[tid];
                const blocks = olderOpen ? plans : [latest];
                return (
                  <div key={tid} style={{borderTop: ri===0?'none':`1px solid ${C.cardBd}`}}>
                    <button onClick={()=>setPickOpen(open && pickOpen===tid ? null : tid)}
                      onMouseEnter={e=>{if(!open)e.currentTarget.style.background='rgba(57,189,255,0.04)';}}
                      onMouseLeave={e=>{if(!open)e.currentTarget.style.background='transparent';}}
                      /* baseline, not centre: the name and the block title inside are set
                         on a shared baseline, so centring the caret against their BLOCK put
                         it 2.6px off the type it belongs to (row-ink sweep, 18.9). */
                      style={{width:'100%',display:'flex',alignItems:'baseline',justifyContent:'space-between',gap:10,
                        background: open?'var(--c-sf)':'transparent',border:'none',cursor:'pointer',padding: ri===0 ? '12px 14px 10px' : '14px 14px 10px' /* the caret hangs under the baseline: the words sit midway; the first row sits on the strip itself (#735) */,textAlign: 'start',transition:'background .12s'}}>
                      <span style={{display:'flex',alignItems:'baseline',gap:10,minWidth:0}}>
                        {/* one 18px line for a Latin or a Hebrew name (14.10 #735: Heebo's taller line box stood the Hebrew rows 49px
                            against 42, 17 over 19.2 under) */}
                        <span style={{fontFamily:heb?FH:FB,fontSize:heb?16:14,lineHeight:'18px',fontWeight:600,color:C.tx,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',...(heb?{paddingBlock:4,marginBlock:-4}:{})}}>{/* the ellipsis box clipped a Hebrew name's ק / ן 3px (tablet sweep #756): 4px of room inside the clip, the row keeps its 18px */}{name}</span>
                        <span style={{fontFamily:FN,fontSize:11,lineHeight:'18px',color:C.tm,whiteSpace:'nowrap'}}>{latest.name}</span>
                      </span>
                      <span style={{fontFamily:FN,fontSize:12,color:'var(--c-tx)',flexShrink:0,transform:open?'rotate(180deg)':'none',transition:'transform .15s'}}><CaretGlyph /></span>
                    </button>
                    {open && (
                      <div style={{padding:'0 14px 14px'}}>
                        {blocks.map((p,bi)=>{
                          const pw = Number(p.weeks)||4;
                          const selWeek = weekByPlan[p.id] ?? defaultWeekFor(p);
                          return (
                          <div key={p.id} style={{marginTop: bi===0?2:10, paddingTop: bi===0?0:10, borderTop: bi===0?'none':`1px solid ${C.cardBd}`}}>
                            {blocks.length>1 && <div style={{fontFamily:FN,fontSize:10,color:C.td,letterSpacing:'0.08em',marginBottom:6}}>{p.name}</div>}
                            {/* Week to log into — chosen here, before the logger opens. */}
                            {/* the weeks and the days as equal-cell grids (5.10 #574; the W chips stood
                                24px beside 36px buttons). CoachDemo's Workouts tab mirrors both. */}
                            {pw>1 && <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:8}}>
                              <span style={{fontFamily:FN,fontSize:9,fontWeight:700,letterSpacing:'0.14em',color:C.tm,flexShrink:0}}>{tt('LOG INTO')}</span>
                              <ChipGrid ariaLabel={tt('LOG INTO')} soft value={selWeek} onChange={(wn)=>setWeekByPlan(m=>({...m,[p.id]:wn}))} style={{flex:'1 1 auto'}}
                                items={Array.from({length:pw},(_,i)=>i+1).map(wn=>({k:wn,label:`W${wn}`}))} />
                            </div>}
                            {(() => { const nextDay = nextDayInWeek(p, selWeek); return (
                              // The next workout gets a subtle tint — like the active/
                              // hovered ATHLETES item in the top nav: faint cyan wash +
                              // cyan text, NO loud box, NO "NEXT" label - so the grid is `soft`.
                              <ChipGrid ariaLabel={p.name} soft value={nextDay} onChange={(i)=>startWorkout(p,i,selWeek)}
                                items={(p.dayNames||[]).map((dName,i)=>({k:i,label:`▶ ${dName}`,title:i===nextDay?'Next workout — the one to do now':undefined})).filter((it)=>inWk(p,it.k,selWeek))} />
                            ); })()}
                          </div>
                          );
                        })}
                        {plans.length>1 && (
                          <button onClick={()=>toggleExpanded(tid)}
                            style={{marginTop:10,background:'transparent',border:'none',color:C.ac,fontFamily:FN,fontSize:10,fontWeight:700,letterSpacing:'0.1em',cursor:'pointer',padding:'4px 0'}}>
                            {olderOpen ? 'HIDE OLDER BLOCKS' : `+ ${plans.length-1} OLDER BLOCK${plans.length-1===1?'':'S'}`}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              });
            })()}
          </div>
        </div>
      )}
      {/* No "logged" list here — a completed session writes straight to the
          athlete's portal History (and shows on their page + Review). The
          Single page's only job is to START/log a session. */}
    </div>);
}
