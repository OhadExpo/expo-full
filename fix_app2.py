import sys
path = sys.argv[1]
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Add weeklyFocus store
content = content.replace(
    "const [bwLog,setBwLog]=useStore(KEYS.bw,[]);",
    "const [bwLog,setBwLog]=useStore(KEYS.bw,[]);\n  const [weeklyFocus,setWeeklyFocus]=useStore('expo-weekly-focus',{});"
)

# Pass weeklyFocus to ClientPortal
content = content.replace(
    '<ClientPortal clientWorkouts={clientWorkouts} setClientWorkouts={setClientWorkouts} bwLog={bwLog} setBwLog={setBwLog}/>',
    '<ClientPortal clientWorkouts={clientWorkouts} setClientWorkouts={setClientWorkouts} bwLog={bwLog} setBwLog={setBwLog} weeklyFocus={weeklyFocus} setWeeklyFocus={setWeeklyFocus}/>'
)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print("App.jsx updated with weeklyFocus store")
