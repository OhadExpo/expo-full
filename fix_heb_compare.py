import sys
path = sys.argv[1]
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Replace all strict === comparisons for deleteTyped with a normalize function
# The issue: Hebrew RTL marks and Unicode normalization cause === to fail even when strings look identical
old = "deleteTyped === deleteConfirm.name"
new = "deleteTyped.trim().normalize('NFC') === deleteConfirm.name.trim().normalize('NFC')"
content = content.replace(old, new)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print(f"Replaced {content.count(new)} instances")
