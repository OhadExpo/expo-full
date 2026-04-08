import sys
path = sys.argv[1]
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Pass setTrainees to TraineeDetail
content = content.replace(
    '{tab==="trainees"&&selectedTrainee&&<TraineeDetail trainee={selectedTrainee} trainees={trainees} plans={plans}',
    '{tab==="trainees"&&selectedTrainee&&<TraineeDetail trainee={selectedTrainee} trainees={trainees} setTrainees={setTrainees} plans={plans}'
)

# Fix #2: Better filename cleaning in parseSpreadsheet - strip מעקב prefix and common Hebrew patterns
old_clean = "const traineeName=fileName.replace(/\\.(xlsx|xls|csv)$/i,'').replace(/[-_]/g,' ').replace(/\\s*Training Program\\s*$/i,'').replace(/\\s*מעקב\\s*$/i,'').trim();"
new_clean = "const traineeName=fileName.replace(/\\.(xlsx|xls|csv)$/i,'').replace(/[-_]/g,' ').replace(/\\s*Training Program\\s*$/i,'').replace(/^מעקב\\s*/,'').replace(/\\s*מעקב\\s*$/,'').replace(/^\\s*-\\s*/,'').replace(/\\s*-\\s*$/,'').trim();"
content = content.replace(old_clean, new_clean)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print("App.jsx updated")
