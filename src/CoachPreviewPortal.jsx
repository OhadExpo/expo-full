import React, { useState, useEffect } from 'react';
import { C, FN, FB } from './theme';
import { supabase } from './supabase';
import ClientPortal from './ClientPortal';

// Coach-side "View as Trainee" preview. Loads the trainee's plans on the
// coach's authenticated session (trainer email is whitelisted in RLS) and
// renders ClientPortal in demoMode so writes are sandboxed — the coach can
// click around without polluting the trainee's workouts/BW log.
//
// Mounted by App.jsx when the route is /coach/trainees/<id>/preview.
export default function CoachPreviewPortal({ traineeId, trainees, exercises, portalVis, clientWorkouts, bwLog, weeklyFocus, onBack }) {
  const trainee = trainees.find(t => t.id === traineeId);
  const [plans, setPlans] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    if (!traineeId) return;
    (async () => {
      try {
        const { data, error: e } = await supabase
          .from('plans')
          .select('*')
          .eq('trainee_id', traineeId)
          .eq('active', true);
        if (e) throw e;
        if (!alive) return;
        setPlans(Array.isArray(data) ? data : []);
      } catch (err) {
        if (alive) setError(String(err?.message || err));
      }
    })();
    return () => { alive = false; };
  }, [traineeId]);

  if (!trainee) return <div style={{padding:40,textAlign:'center',color:C.tm}}>Trainee not found.</div>;
  if (error) return <div style={{padding:40,textAlign:'center',color:C.rd}}>Failed to load: {error}</div>;
  if (plans === null) return <div style={{padding:40,textAlign:'center',color:C.tm,fontFamily:FN,letterSpacing:'0.18em'}}>LOADING TRAINEE PORTAL…</div>;

  return (
    <div style={{position:'relative'}}>
      <div style={{position:'sticky',top:0,zIndex:50,background:C.bg,borderBottom:`1px solid ${C.ac}`,padding:'10px 16px',display:'flex',alignItems:'center',justifyContent:'space-between',gap:12}}>
        <div style={{display:'flex',alignItems:'center',gap:10,minWidth:0}}>
          <div style={{fontFamily:FN,fontSize:10,color:C.ac,fontWeight:700,letterSpacing:'0.18em',whiteSpace:'nowrap'}}>👁 PREVIEW</div>
          <div style={{fontFamily:FB,fontSize:13,color:C.tx,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>Viewing as <span style={{color:C.ac,fontWeight:700}}>{trainee.name}</span></div>
          <div style={{fontFamily:FN,fontSize:10,color:C.tm,letterSpacing:'0.04em',whiteSpace:'nowrap'}}>· edits sandboxed (demo mode)</div>
        </div>
        <button onClick={onBack} style={{background:'transparent',border:`1px solid ${C.ac}`,color:C.ac,padding:'6px 14px',fontFamily:FN,fontSize:11,fontWeight:700,letterSpacing:'0.18em',cursor:'pointer',borderRadius:0}}>← BACK TO COACH</button>
      </div>
      <ClientPortal
        clientId={traineeId}
        signOut={onBack}
        clientWorkouts={clientWorkouts}
        setClientWorkouts={() => {}}
        bwLog={bwLog}
        setBwLog={() => {}}
        weeklyFocus={weeklyFocus}
        setWeeklyFocus={() => {}}
        portalVis={portalVis}
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
