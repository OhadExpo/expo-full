import sys
path = sys.argv[1]
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Add onOpenPlan prop
content = content.replace(
    'export default function TraineeDetail({ trainee, trainees, setTrainees, plans, exercises, workouts, payments, setPayments, onBack })',
    'export default function TraineeDetail({ trainee, trainees, setTrainees, plans, exercises, workouts, payments, setPayments, onBack, onOpenPlan })'
)

# Make plan cards clickable
old_plan = """tp.map(p=><Card key={p.id} style={{marginBottom:8}}><div style={{fontWeight:600,color:C.tx}}>{p.name}</div><div style={{fontSize:12,color:C.tm,marginTop:2}}>{p.days.length} days"""
new_plan = """tp.map(p=><Card key={p.id} onClick={()=>onOpenPlan&&onOpenPlan(p.id)} style={{marginBottom:8,cursor:'pointer'}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><div><div style={{fontWeight:600,color:C.tx}}>{p.name}</div><div style={{fontSize:12,color:C.tm,marginTop:2}}>{p.days.length} days"""

content = content.replace(old_plan, new_plan)

# Close the extra div we opened
old_close = """exercises</div></Card>)}"""
new_close = """exercises</div></div><span style={{color:C.ac,fontSize:12}}>Open →</span></div></Card>)}"""
content = content.replace(old_close, new_close, 1)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print("TraineeDetail: plan cards now clickable")
