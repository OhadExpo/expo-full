import React, { useState } from 'react';
import { C, FN, FB, ytId, EXPO_ICON } from './theme';

// Same exercise data as ClientPortal
const EX = {
  e1:{t:"Prone Laying Around the World"},e2:{t:"90/90 POS Rear-Leg Heel-Clicks"},
  e3:{t:"Dead-Bug POS Elbow Floor-Slide"},e4:{t:"Bear-POS Shoulder Taps"},
  e5:{t:"ISO Kneeling Push-Up"},e6:{t:"90-90 Get Ups"},e7:{t:"ISO Kossac Squat"},
  e8:{t:"ABs Sit-Up w Twist"},e9:{t:"Machine Leg Extension"},e10:{t:"BB Lunge"},
  e11:{t:"BB Pedlay Row"},e12:{t:"Machine Incline Chest-Press"},
  e13:{t:"Machine Leg Curl"},e14:{t:"Standing Arnold DB OHP"},
  e29:{t:"Push-Up Tantrum"},e30:{t:"Banded Power Pallof Press"},
  e31:{t:"HOZ Board Jump SL Landing"},e32:{t:"BB FFESS"},e33:{t:"BB Bench Press"},
  e34:{t:"Elbow-Supported SA DB Row"},e35:{t:"Hip-Thrust POS DB Pullover"},
  e36:{t:"Short-Lever ABs Sit-Up"},e37:{t:"FFESS to Lunge POGO Jump"},
  e38:{t:"Alt SL Squat POGO"},e39:{t:"Power SL Hip-Thrust Catch"},
  e40:{t:"BB Deficit Jefferson DL"},e41:{t:"Seated BB OHP"},e42:{t:"DB Goblet Squat"},
  e43:{t:"SA Cable Pulldown"},e44:{t:"Elbow-Supported DB Knee Raise"},
};

const bi = {background:C.sf2,border:`1px solid ${C.bd}`,borderRadius:6,padding:"8px 10px",
  color:C.tx,fontFamily:FB,fontSize:13,outline:"none",width:"100%",boxSizing:"border-box"};

export default function WorkoutReview({ clientWorkouts, weeklyFocus, setWeeklyFocus }) {
  const [selectedWo, setSelectedWo] = useState(null);
  const [expandedEx, setExpandedEx] = useState(null);

  // Group workouts by client
  const byClient = {};
  clientWorkouts.forEach(w => {
    const key = w.clientId || 'unknown';
    if (!byClient[key]) byClient[key] = { name: w.exercises?.[0]?.title?.split(' ')[0] || key, workouts: [] };
    byClient[key].workouts.push(w);
    // Use the planName to get a better client label
    if (w.clientId === 't1') byClient[key].name = 'Diego Day';
    if (w.clientId === 't2') byClient[key].name = 'Ron Yonker';
  });

  const setFocus = (planName, dayName, eid, week, val) => {
    const fk = `${planName}|${dayName}|${eid}|W${week}`;
    setWeeklyFocus(prev => {
      const next = { ...prev };
      if (val.trim()) next[fk] = val.trim();
      else delete next[fk];
      return next;
    });
  };

  const getFocus = (planName, dayName, eid, week) => {
    const fk = `${planName}|${dayName}|${eid}|W${week}`;
    return weeklyFocus?.[fk] || '';
  };

  // ===== WORKOUT DETAIL VIEW =====
  if (selectedWo) {
    const wo = clientWorkouts.find(w => w.id === selectedWo);
    if (!wo) { setSelectedWo(null); return null; }
    const nextWeek = (wo.week || 1) + 1 > 4 ? 4 : (wo.week || 1) + 1;
    const completedSets = wo.exercises.reduce((a, ex) => a + ex.sets.filter(s => s.done).length, 0);
    const totalSets = wo.exercises.reduce((a, ex) => a + ex.sets.length, 0);

    return (
      <div>
        <button onClick={() => { setSelectedWo(null); setExpandedEx(null); }}
          style={{background:"none",border:"none",color:C.ac,cursor:"pointer",fontFamily:FB,fontSize:13,padding:0,marginBottom:12}}>
          ← Back to workouts
        </button>

        {/* Workout header */}
        <div style={{background:C.sf,border:`1px solid ${C.bd}`,borderRadius:10,padding:16,marginBottom:16}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
            <div>
              <h2 style={{margin:0,fontFamily:FN,fontSize:18}}>{wo.dayName}</h2>
              <div style={{fontSize:12,color:C.tm,marginTop:4}}>
                {wo.planName} · W{wo.week} · {new Date(wo.date).toLocaleDateString()}
              </div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:18,fontWeight:700,fontFamily:FN,color:C.gn}}>{completedSets}/{totalSets}</div>
              <div style={{fontSize:9,fontFamily:FN,color:C.td}}>SETS DONE</div>
            </div>
          </div>

          {/* Autoregulation data */}
          {wo.autoregulation && (
            <div style={{display:"flex",gap:12,marginTop:12}}>
              {[['Pain',wo.autoregulation.pain,C.rd],['Energy',wo.autoregulation.energy,C.gn],['Sleep',wo.autoregulation.sleep,C.pu]].map(([l,v,col]) => (
                <div key={l} style={{flex:1,background:C.sf2,borderRadius:6,padding:8,textAlign:"center"}}>
                  <div style={{fontSize:9,fontFamily:FN,color:C.td}}>{l.toUpperCase()}</div>
                  <div style={{fontSize:16,fontWeight:700,fontFamily:FN,color:v?col:C.td}}>{v || '—'}</div>
                </div>
              ))}
            </div>
          )}
          {wo.notes && (
            <div style={{marginTop:10,background:C.sf2,borderRadius:6,padding:10}}>
              <div style={{fontSize:9,fontFamily:FN,color:C.td,marginBottom:4}}>CLIENT NOTES</div>
              <div style={{fontSize:13,color:C.tx}}>{wo.notes}</div>
            </div>
          )}
        </div>

        {/* Exercise cards */}
        {wo.exercises.map((ex, i) => {
          const isExpanded = expandedEx === i;
          const doneSets = ex.sets.filter(s => s.done).length;
          const exName = EX[ex.eid]?.t || ex.title || ex.eid;
          const formVideo = wo.formVideos?.[i];
          const currentFocus = getFocus(wo.planName, wo.dayName, ex.eid, wo.week || 1);
          const nextFocus = getFocus(wo.planName, wo.dayName, ex.eid, nextWeek);

          return (
            <div key={i} style={{background:C.sf,border:`1px solid ${isExpanded?C.ac+'40':C.bd}`,borderRadius:10,marginBottom:8,overflow:"hidden"}}>
              {/* Header row — click to expand */}
              <div onClick={() => setExpandedEx(isExpanded?null:i)}
                style={{display:"flex",alignItems:"center",gap:10,padding:"12px 14px",cursor:"pointer"}}>
                <div style={{width:26,height:26,borderRadius:6,background:doneSets===ex.sets.length?C.gnD:C.acD,
                  display:"flex",alignItems:"center",justifyContent:"center",fontFamily:FN,fontSize:11,fontWeight:700,
                  color:doneSets===ex.sets.length?C.gn:C.ac,flexShrink:0}}>{i+1}</div>
                <div style={{flex:1}}>
                  <div style={{fontWeight:600,fontSize:13}}>{exName}</div>
                  <div style={{fontSize:11,color:C.tm,marginTop:2}}>
                    {ex.prescribed} · {doneSets}/{ex.sets.length} sets
                    {formVideo?.has && <span style={{color:C.gn,marginLeft:6}}>📹</span>}
                  </div>
                </div>
                {nextFocus && <div style={{width:6,height:6,borderRadius:3,background:C.ac,flexShrink:0}} />}
                <span style={{color:C.td,fontSize:11}}>{isExpanded?'▲':'▼'}</span>
              </div>

              {/* Expanded detail */}
              {isExpanded && (
                <div style={{padding:"0 14px 14px",borderTop:`1px solid ${C.bd}`}}>
                  {/* Set-by-set data */}
                  <div style={{marginTop:10,marginBottom:12}}>
                    <div style={{display:"grid",gridTemplateColumns:"40px 1fr 1fr 1fr",gap:4,marginBottom:4}}>
                      {['SET','REPS','LOAD','RPE'].map(h =>
                        <div key={h} style={{fontSize:9,fontFamily:FN,color:C.td,textAlign:h==='SET'?'center':'left'}}>{h}</div>)}
                    </div>
                    {ex.sets.map((set, si) => (
                      <div key={si} style={{display:"grid",gridTemplateColumns:"40px 1fr 1fr 1fr",gap:4,padding:"3px 0",
                        opacity:set.done?1:0.4,borderBottom:si<ex.sets.length-1?`1px solid ${C.bd}22`:'none'}}>
                        <div style={{fontFamily:FN,fontSize:12,color:set.done?C.gn:C.td,textAlign:"center"}}>{set.done?'✓':si+1}</div>
                        <div style={{fontSize:12,color:C.tx}}>{set.reps||'—'}</div>
                        <div style={{fontSize:12,color:C.tx}}>{set.load?set.load+'kg':'—'}</div>
                        <div style={{fontSize:12,color:C.tx}}>{set.rpe||'—'}</div>
                      </div>
                    ))}
                  </div>

                  {/* Client's form video */}
                  {formVideo?.has ? (
                    <div style={{background:C.gnD,border:`1px solid ${C.gn}30`,borderRadius:8,padding:12,marginBottom:10}}>
                      <div style={{fontSize:10,fontFamily:FN,color:C.gn,fontWeight:700,marginBottom:6}}>📹 FORM VIDEO SUBMITTED</div>
                      {formVideo.note && <div style={{fontSize:12,color:C.tx,marginBottom:4}}>Client note: {formVideo.note}</div>}
                      <div style={{fontSize:11,color:C.tm}}>Video review placeholder — file upload not yet connected to storage</div>
                    </div>
                  ) : (
                    <div style={{background:C.sf2,borderRadius:8,padding:10,marginBottom:10,textAlign:"center"}}>
                      <div style={{fontSize:11,color:C.td}}>No form video submitted</div>
                    </div>
                  )}

                  {/* Weekly Focus editor for NEXT week */}
                  <div style={{background:C.acD,borderRadius:8,padding:12,border:`1px solid ${C.ac}20`}}>
                    <div style={{fontSize:10,fontFamily:FN,color:C.ac,fontWeight:700,marginBottom:6}}>
                      WEEKLY FOCUS — W{nextWeek} (next)
                    </div>
                    <textarea
                      value={nextFocus}
                      onChange={e => setFocus(wo.planName, wo.dayName, ex.eid, nextWeek, e.target.value)}
                      placeholder={`Based on this performance, what should they focus on next week?`}
                      style={{...bi,minHeight:50,resize:"vertical",borderColor:nextFocus?C.ac+'40':C.bd,fontSize:12}}
                    />
                    {/* All 4 weeks mini-view */}
                    <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:3,marginTop:6}}>
                      {[1,2,3,4].map(w => {
                        const f = getFocus(wo.planName, wo.dayName, ex.eid, w);
                        const isCurrent = w === (wo.week||1);
                        const isNext = w === nextWeek;
                        return (
                          <div key={w} style={{padding:"3px 4px",borderRadius:3,
                            background:isNext?C.ac+'15':isCurrent?C.gn+'10':C.sf2,
                            border:`1px solid ${isNext?C.ac+'40':isCurrent?C.gn+'20':f?C.ac+'15':C.bd}`,
                            textAlign:"center"}}>
                            <div style={{fontSize:7,fontFamily:FN,color:isNext?C.ac:isCurrent?C.gn:C.td}}>
                              W{w}{isCurrent?' ✓':''}{isNext?' →':''}
                            </div>
                            <div style={{fontSize:9,color:f?C.tx:C.td,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                              {f||'—'}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // ===== WORKOUT LIST VIEW =====
  const allWorkouts = clientWorkouts.slice().reverse();

  if (allWorkouts.length === 0) return (
    <div>
      <h2 style={{fontFamily:FN,fontSize:18,marginBottom:8}}>Workout Review</h2>
      <div style={{color:C.tm,fontSize:13,marginBottom:20}}>
        Review completed workouts, watch client form videos, and set weekly focus for next week.
      </div>
      <div style={{textAlign:"center",padding:60,color:C.td}}>
        <img src={EXPO_ICON} alt="" style={{height:32,opacity:0.2,marginBottom:12}} />
        <div style={{fontSize:14}}>No completed workouts yet</div>
        <div style={{fontSize:12,marginTop:4}}>Workouts logged in the Client Portal will appear here</div>
      </div>
    </div>
  );

  return (
    <div>
      <h2 style={{fontFamily:FN,fontSize:18,marginBottom:4}}>Workout Review</h2>
      <div style={{color:C.tm,fontSize:13,marginBottom:16}}>
        Review completed workouts, watch client form videos, and write focus notes for next week.
      </div>

      {/* Group by client */}
      {Object.entries(byClient).map(([cid, data]) => (
        <div key={cid} style={{marginBottom:20}}>
          <div style={{fontSize:12,fontFamily:FN,color:C.ac,fontWeight:700,marginBottom:8}}>
            {data.name.toUpperCase()} ({data.workouts.length})
          </div>
          {data.workouts.slice().reverse().map(wo => {
            const doneSets = wo.exercises.reduce((a,ex) => a + ex.sets.filter(s=>s.done).length, 0);
            const totalSets = wo.exercises.reduce((a,ex) => a + ex.sets.length, 0);
            const hasFormVids = wo.formVideos?.some(f => f?.has);
            return (
              <div key={wo.id} onClick={() => setSelectedWo(wo.id)}
                style={{background:C.sf,border:`1px solid ${C.bd}`,borderRadius:8,padding:"12px 16px",
                  marginBottom:6,cursor:"pointer",transition:"border-color .15s",display:"flex",
                  justifyContent:"space-between",alignItems:"center"}}
                onMouseEnter={e=>e.currentTarget.style.borderColor=C.ac}
                onMouseLeave={e=>e.currentTarget.style.borderColor=C.bd}>
                <div>
                  <div style={{fontWeight:600,fontSize:14}}>{wo.dayName}
                    <span style={{fontWeight:400,color:C.tm,fontSize:12,marginLeft:6}}>{wo.planName}</span>
                  </div>
                  <div style={{fontSize:11,color:C.tm,marginTop:2}}>
                    W{wo.week} · {new Date(wo.date).toLocaleDateString()} · {doneSets}/{totalSets} sets
                    {hasFormVids && <span style={{color:C.gn,marginLeft:4}}>📹</span>}
                  </div>
                </div>
                <span style={{color:C.ac,fontSize:12}}>Review →</span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
