import sys
path = sys.argv[1]
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()
content = content.replace(
    "const active = trainees.filter(t => t.status === 'Active').length;",
    "const active = trainees.filter(t => t.status === 'Active').length;\n  const archivedCount = trainees.filter(t => t.status === 'Archived').length;"
)
with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print("Done")
