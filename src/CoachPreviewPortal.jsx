import React, { useState, useEffect } from 'react';
import { C, FN, FB } from './theme';
import { supabase } from './supabase';
import ClientPortal from './ClientPortal';

// Coach-side preview. Two modes:
//   • traineeId → load all of that athlete's active plans, view their portal.
//   • planId    → load just that one plan (plus its parent trainee for
//                 context), view a single program in trainee shoes.
// Either way, ClientPortal renders in demoMode so writes are sandboxed —
// the coach can click around without polluting the trainee's record.
//
// Mounted by App.jsx for /coach/trainees/<id>/preview or /coach/programs/<id>/preview.
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
          // Couples: trainees may have plans under parent ID OR sub-member IDs.
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
        <div style={{display:'flex',alignItems:'center',gap:10,minWidth:0}}>
          <div style={{fontFamily:FN,fontSize:10,color:C.ac,fontWeight:700,letterSpacing:'0.18em',whiteSpace:'nowrap'}}>👁 PREVIEW</div>
          <div style={{fontFamily:FB,fontSize:13,color:C.tx,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{headerLabel}</div>
          <div style={{fontFamily:FN,fontSize:10,color:C.tm,letterSpacing:'0.04em',whiteSpace:'nowrap'}}>· edits sandboxed</div>
        </div>
        <button onClick={onBack} style={{background:'transparent',border:`1px solid ${C.ac}`,color:C.ac,padding:'6px 14px',fontFamily:FN,fontSize:11,fontWeight:700,letterSpacing:'0.18em',cursor:'pointer',borderRadius:0}}>← BACK TO COACH</button>
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
