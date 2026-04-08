import sys
path = sys.argv[1]
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Fix: guard the onClick so it only fires when names match
old = '''<Btn variant="danger" onClick={() => handlePermanentDelete(deleteConfirm.id)}
              disabled={deleteTyped !== deleteConfirm.name}
              style={{ opacity: deleteTyped === deleteConfirm.name ? 1 : 0.3, cursor: deleteTyped === deleteConfirm.name ? "pointer" : "not-allowed" }}>
              Delete Permanently</Btn>'''

new = '''<Btn variant="danger" onClick={() => { if (deleteTyped === deleteConfirm.name) handlePermanentDelete(deleteConfirm.id); }}
              style={{ opacity: deleteTyped === deleteConfirm.name ? 1 : 0.3, cursor: deleteTyped === deleteConfirm.name ? "pointer" : "not-allowed", pointerEvents: deleteTyped === deleteConfirm.name ? "auto" : "none" }}>
              Delete Permanently</Btn>'''

content = content.replace(old, new)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print("Fixed delete button")
