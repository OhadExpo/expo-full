import sys
path = sys.argv[1]
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Add onOpenPlan handler to TraineeDetail
old = '<TraineeDetail trainee={selectedTrainee} trainees={trainees} setTrainees={setTrainees} plans={plans}'
new = '<TraineeDetail trainee={selectedTrainee} trainees={trainees} setTrainees={setTrainees} plans={plans} onOpenPlan={pid=>{setTab("plans");setSelectedTrainee(null);/* plan editor opens via PlansView */}}'
content = content.replace(old, new)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print("App.jsx: onOpenPlan wired")
