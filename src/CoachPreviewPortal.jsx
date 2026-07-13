import React, { useState, useEffect } from 'react';
import { C, FN, FB } from './theme';
import { supabase } from './supabase';
import { isSafeTraineeId } from './traineeUtils';
import ClientPortal from './ClientPortal';

// Coach-side preview. Two modes:
//   • traineeId → load all of that athlete's active plans, view their portal.
//   • planId    → load just that one plan (plus its parent trainee for
//                 context), view a single program in trainee shoes.
// Either way, ClientPortal renders in demoMode so writes are sandboxed —
// the coach can click around without polluting the trainee's record.
//
// Mounted by App.jsx for /coach/athletes/<id>/preview or /coach/programs/<id>/preview.
// /coach/trainees/<id>/preview still resolves to the same render for legacy links.
export default function CoachPreviewPortal({ traineeId, planId, trainees, exercises, portalVis, clientWorkouts, bwLog, weeklyFocus, onBack }) {
  const [plans, setPlans] = useState(null);
  const [resolvedTraineeId, setResolvedTraineeId] = useState(traineeId || null);
  const [error, setError] = useState(null);

  // Reshape Supabase plan rows (snake_case + nested data) into the shape
  // ClientPortal expects (camelCase, days/warmup/weeks pulled to top level).
  // Without this, demoMode hands raw rows to ClientPortal which then renders
  // an empty program list.
  const reshape = (p) => ({
    id: p.id, name: p.name, traineeId: p.trainee_id, phase: p.phase,
    notes: p.notes, active: p.active, createdAt: p.created_at,
    days: p.data?.days || [], warmup: p.data?.warmup || [],
    weeks: p.data?.weeks || 4,
  });

  useEffect(() => {
    let alive = true;
    setPlans(null); setError(null);
    (async () => {
      try {
        if (planId) {
          const { data, error: e } = await supabase.from('plans').select('*').eq('id', planId).limit(1);
          if (e) throw e;
          if (!alive) return;
          const p = Array.isArray(data) && data[0];
          if (!p) { setError('Program not found.'); return; }
          setResolvedTraineeId(p.trainee_id || null);
          setPlans([reshape(p)]);
          return;
        }
        if (traineeId) {
          // Block anything that isn't a real trainee ID before it lands in
          // the .or() filter string. Shared helper so any future call site
          // building PostgREST filters from URL params can do the same.
          if (!isSafeTraineeId(traineeId)) {
            setError('Invalid trainee identifier.');
            return;
          }
          // Couples: trainees may have plans under parent ID OR sub-member IDs
          // (e.g. tr_couple__0). The literal underscores in the LIKE pattern
          // are SQL wildcards but trainee IDs in our schema don't collide with
          // that, so the loose match is acceptable.
          const { data, error: e } = await supabase.from('plans').select('*').or(`trainee_id.eq.${traineeId},trainee_id.like.${traineeId}__%`).eq('active', true);
          if (e) throw e;
          if (!alive) return;
          setResolvedTraineeId(traineeId);
          setPlans(Array.isArray(data) ? data.map(reshape) : []);
        }
      } catch (err) {
        if (alive) setError(String(err?.message || err));
      }
    })();
    return () => { alive = false; };
  }, [traineeId, planId]);

  const trainee = trainees.find(t => t.id === resolvedTraineeId);

  if (error) return <div style={{padding:40,textAlign:'center',color:C.rd}}>Failed to load: {error}</div>;
  if (plans === null) return <div style={{padding:40,textAlign:'center',color:C.tm,fontFamily:FN,letterSpacing:'0.18em'}}>LOADING PREVIEW…</div>;

  const headerLabel = planId
    ? <>Previewing <span style={{color:C.ac,fontWeight:700}}>{plans[0]?.name || 'Program'}</span>{trainee && <> · {trainee.name}</>}</>
    : <>Viewing as <span style={{color:C.ac,fontWeight:700}}>{trainee?.name || 'Trainee'}</span></>;

  return (
    <div style={{position:'relative'}}>
      <div style={{position:'sticky',top:0,zIndex:50,background:C.bg,borderBottom:`1px solid ${C.ac}`,padding:'10px 16px',display:'flex',alignItems:'center',justifyContent:'space-between',gap:12}}>
        {/* One font + one size + lineHeight:1 across the whole row so the three
            pieces sit on a single level baseline (Ohad: "not leveled" — was
            10/13/10px in two fonts, the Hebrew name floated off the Latin). */}
        <div style={{display:'flex',alignItems:'center',gap:10,minWidth:0,fontFamily:FN,fontSize:11,lineHeight:1,letterSpacing:'0.1em',textTransform:'uppercase'}}>
          <div style={{color:C.ac,fontWeight:700,whiteSpace:'nowrap'}}>👁 PREVIEW</div>
          <div style={{color:C.tx,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{headerLabel}</div>
        </div>
        <button onClick={onBack} style={{background:'var(--c-sf)',border:`1px solid ${C.ac}`,color:C.ac,padding:'6px 14px',fontFamily:FN,fontSize:11,fontWeight:700,letterSpacing:'0.18em',cursor:'pointer',borderRadius:0,whiteSpace:'nowrap',flexShrink:0,display:'inline-flex',alignItems:'center',gap:5}}>← BACK</button>
      </div>
      <ClientPortal
        clientId={resolvedTraineeId || 'preview'}
        signOut={onBack}
        clientWorkouts={clientWorkouts}
        setClientWorkouts={() => {}}
        bwLog={bwLog}
        setBwLog={() => {}}
        weeklyFocus={weeklyFocus}
        setWeeklyFocus={() => {}}
        /* planId preview = explicit single-program request → bypass the
           portalVis filter so a hidden block still renders when the coach
           clicks Preview on its row. traineeId preview keeps the filter so
           it reflects what the athlete actually sees. */
        portalVis={planId ? null : portalVis}
        trainerPlans={plans}
        trainerExercises={exercises}
        trainees={trainees}
        onDecrementSession={() => {}}
        updateFormVideos={() => {}}
        demoMode={true}
        demoPlans={plans}
      />
    </div>
  );
}
