import sys
path = sys.argv[1]
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Remove the old small ex.n badge (it's now in the proper INSTRUCTIONS box)
content = content.replace(
    """{ex.n && <div style={{fontSize:12,color:C.or,background:C.orD,padding:'6px 10px',borderRadius:6,marginTop:6}}>{ex.n}</div>}""",
    ""
)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print("Removed duplicate ex.n badge")
