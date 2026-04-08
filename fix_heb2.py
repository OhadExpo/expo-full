import sys
path = sys.argv[1]
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

old = "deleteTyped===td.name"
new = "deleteTyped.trim().normalize('NFC')===td.name.trim().normalize('NFC')"
content = content.replace(old, new)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print(f"Fixed TraineeDetail: {content.count(new)} instances")
