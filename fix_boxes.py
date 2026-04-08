import sys
path = sys.argv[1]
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Replace the exercise step section - find the marker and replace everything from EXERCISE STEP to the nav buttons
# The exercise step starts after "const ei = step;" and ends before the closing of StepLogger
old_ex_section = """      {d.q && <div style={{background:C.puD,borderRadius:10,padding:12,marginBottom:14,fontSize:13,color:C.tx,lineHeight:1.6,direction:'rtl',textAlign:'right'}}>
        <div style={{fontSize:10,fontFamily:FN,color:C.pu,marginBottom:4,direction:'ltr',textAlign:'left'}}>COACHING CUES</div>{d.q}</div>}
      {/* Exercise Instructions (from program) */}
      {ex.n && <div style={{background:C.sf,border:'1px solid '+C.or+'40',borderLeft:'3px solid '+C.or,borderRadius:10,padding:12,marginBottom:12}}>
        <div style={{fontSize:10,fontFamily:FN,color:C.or,marginBottom:4,fontWeight:700}}>INSTRUCTIONS</div>
        <div style={{fontSize:13,color:C.tx,lineHeight:1.5}}>{ex.n}</div></div>}
      {/* Weekly Coach Focus */}
      {(() => { const fk = `${plan.name}|${day.name}|${ex.eid}|W${weekNum+1}`; const wf = weeklyFocus?.[fk]; return wf ? (
        <div style={{background:C.acD,border:'1px solid '+C.ac+'30',borderLeft:'3px solid '+C.ac,borderRadius:10,padding:12,marginBottom:12}}>
          <div style={{fontSize:10,fontFamily:FN,color:C.ac,marginBottom:4,fontWeight:700}}>COACH'S FOCUS THIS WEEK</div>
          <div style={{fontSize:13,color:C.tx,lineHeight:1.5}}>{wf}</div></div>) : null; })()}"""

new_ex_section = """      {/* Coaching Cues - from Excel comments */}
      {d.q && <div style={{background:C.puD,borderRadius:10,padding:12,marginBottom:12,fontSize:13,color:C.tx,lineHeight:1.6,direction:'rtl',textAlign:'right'}}>
        <div style={{fontSize:10,fontFamily:FN,color:C.pu,marginBottom:4,direction:'ltr',textAlign:'left'}}>COACHING CUES</div>{d.q}</div>}
      {/* Exercise Notes/Guidelines - ALWAYS visible */}
      <div style={{background:C.sf,border:'1px solid '+C.or+'40',borderLeft:'3px solid '+C.or,borderRadius:10,padding:12,marginBottom:12}}>
        <div style={{fontSize:10,fontFamily:FN,color:C.or,marginBottom:4,fontWeight:700}}>EXERCISE NOTES</div>
        <div style={{fontSize:13,color:ex.n?C.tx:C.td,lineHeight:1.5}}>{ex.n || 'No specific notes for this exercise'}</div></div>
      {/* Weekly Coach Focus - ALWAYS visible */}
      {(() => { const fk = `${plan.name}|${day.name}|${ex.eid}|W${weekNum+1}`; const wf = weeklyFocus?.[fk]; return (
        <div style={{background:wf?C.acD:C.sf,border:'1px solid '+(wf?C.ac+'30':C.bd),borderLeft:'3px solid '+(wf?C.ac:C.bd),borderRadius:10,padding:12,marginBottom:12}}>
          <div style={{fontSize:10,fontFamily:FN,color:wf?C.ac:C.td,marginBottom:4,fontWeight:700}}>COACH'S FOCUS THIS WEEK</div>
          <div style={{fontSize:13,color:wf?C.tx:C.td,lineHeight:1.5}}>{wf || 'No specific focus set for this week'}</div></div>); })()}"""

if old_ex_section in content:
    content = content.replace(old_ex_section, new_ex_section)
    print("Replaced exercise step boxes - now always visible")
else:
    print("ERROR: Could not find exercise step section to replace")
    # Debug: show what's around the coaching cues
    idx = content.find('COACHING CUES')
    if idx >= 0:
        print(f"Found COACHING CUES at index {idx}")
        print(repr(content[idx:idx+200]))
    else:
        print("COACHING CUES not found either!")

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
