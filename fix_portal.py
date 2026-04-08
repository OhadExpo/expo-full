import sys
path = sys.argv[1]
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update import to include EXPO_LOGO_LG, EXPO_ICON_LG
# (may already be there from earlier fix)

# 2. Add weeklyFocus prop to ClientPortal and StepLogger
content = content.replace(
    'export default function ClientPortal({ clientWorkouts, setClientWorkouts, bwLog, setBwLog })',
    'export default function ClientPortal({ clientWorkouts, setClientWorkouts, bwLog, setBwLog, weeklyFocus, setWeeklyFocus })'
)

content = content.replace(
    'function StepLogger({day, plan, weekNum, clientId, onBack, onComplete})',
    'function StepLogger({day, plan, weekNum, clientId, onBack, onComplete, weeklyFocus})'
)

# 3. Pass weeklyFocus to StepLogger
content = content.replace(
    'return <StepLogger day={plan.days[lg]} plan={plan} weekNum={wk} clientId={cl.id} onBack={() => setLg(null)} onComplete={handleComplete}/>',
    'return <StepLogger day={plan.days[lg]} plan={plan} weekNum={wk} clientId={cl.id} onBack={() => setLg(null)} onComplete={handleComplete} weeklyFocus={weeklyFocus}/>'
)

# 4. Add instruction box and weekly focus box BEFORE the video in the exercise step
# Find the video section in exercise step and add boxes before it
old_video = """      {vid && <div style={{marginBottom:14,borderRadius:12,overflow:'hidden',aspectRatio:'16/9',background:C.sf2}}>
        <iframe src={`https://www.youtube.com/embed/${vid}`} style={{width:'100%',height:'100%',border:'none'}} allowFullScreen/></div>}
      <div style={{background:C.sf,border:`1px solid ${C.bd}`,borderRadius:12,padding:14,marginBottom:14}}>"""

new_video = """      {/* Exercise Instructions (from program) */}
      {ex.n && <div style={{background:C.sf,border:'1px solid '+C.or+'40',borderLeft:'3px solid '+C.or,borderRadius:10,padding:12,marginBottom:12}}>
        <div style={{fontSize:10,fontFamily:FN,color:C.or,marginBottom:4,fontWeight:700}}>INSTRUCTIONS</div>
        <div style={{fontSize:13,color:C.tx,lineHeight:1.5}}>{ex.n}</div></div>}
      {/* Weekly Coach Focus */}
      {(() => { const fk = `${plan.name}|${day.name}|${ex.eid}|W${weekNum+1}`; const wf = weeklyFocus?.[fk]; return wf ? (
        <div style={{background:C.acD,border:'1px solid '+C.ac+'30',borderLeft:'3px solid '+C.ac,borderRadius:10,padding:12,marginBottom:12}}>
          <div style={{fontSize:10,fontFamily:FN,color:C.ac,marginBottom:4,fontWeight:700}}>COACH'S FOCUS THIS WEEK</div>
          <div style={{fontSize:13,color:C.tx,lineHeight:1.5}}>{wf}</div></div>) : null; })()}
      {vid && <div style={{marginBottom:14,borderRadius:12,overflow:'hidden',aspectRatio:'16/9',background:C.sf2}}>
        <iframe src={`https://www.youtube.com/embed/${vid}`} style={{width:'100%',height:'100%',border:'none'}} allowFullScreen/></div>}
      <div style={{background:C.sf,border:`1px solid ${C.bd}`,borderRadius:12,padding:14,marginBottom:14}}>"""

content = content.replace(old_video, new_video)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print("ClientPortal updated with instruction box + weekly focus")
