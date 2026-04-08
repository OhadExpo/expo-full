import sys
path = sys.argv[1]
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace(
    "import ClientPortal from './ClientPortal';",
    "import ClientPortal from './ClientPortal';\nimport DashboardView from './DashboardView';"
)

content = content.replace(
    'const tabs=[{key:"trainees",label:"Trainees",count:trainees.length},{key:"plans",label:"Plans",count:plans.length},{key:"exercises",label:"Exercises",count:exercises.length},{key:"workouts",label:"Workouts",count:workouts.length},{key:"client",label:"Client Portal",count:null}];',
    'const tabs=[{key:"dashboard",label:"Dashboard",count:null},{key:"trainees",label:"Trainees",count:trainees.length},{key:"plans",label:"Plans",count:plans.length},{key:"exercises",label:"Exercises",count:exercises.length},{key:"workouts",label:"Workouts",count:workouts.length},{key:"client",label:"Client Portal",count:null}];'
)

old_header = '''<div style={{display:"flex",alignItems:"center",gap:10}}>
            <img src={EXPO_ICON} alt="" style={{height:28}}/>
            <img src={EXPO_LOGO} alt="EXPO" style={{height:28}}/></div>'''
new_header = '''<div style={{display:"flex",alignItems:"center"}}>
            <div style={{display:"flex",alignItems:"center",gap:8,padding:"6px 14px",background:"linear-gradient(135deg, rgba(59,160,255,0.08), rgba(59,160,255,0.02))",borderRadius:10,border:"1px solid rgba(59,160,255,0.12)"}}>
              <img src={EXPO_ICON} alt="" style={{height:22}}/>
              <div style={{width:1,height:18,background:C.bd,opacity:0.5}}/>
              <img src={EXPO_LOGO} alt="EXPO" style={{height:18,opacity:0.9}}/></div></div>'''
content = content.replace(old_header, new_header)

old_main = '{tab==="trainees"&&!selectedTrainee&&<TraineesView'
new_main = '{tab==="dashboard"&&<DashboardView trainees={trainees} plans={plans} workouts={workouts} payments={payments} onSelectTrainee={id=>{setSelectedTrainee(id);setTab("trainees")}}/>}\n        {tab==="trainees"&&!selectedTrainee&&<TraineesView'
content = content.replace(old_main, new_main)

content = content.replace('const [tab,setTab]=useState("trainees")', 'const [tab,setTab]=useState("dashboard")')

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print("Done - all fixes applied")
