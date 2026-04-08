import sys
path = sys.argv[1]
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()
content = content.replace("COACH'S FOCUS THIS WEEK", "WEEKLY FOCUS")
content = content.replace("No specific focus set for this week", "No focus set this week")
with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print("Renamed to Weekly Focus")
