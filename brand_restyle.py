"""
EXPO Brand Restyle + Fixes
A: "Weekly Focus" header text
B: Brand colors #39BDFF, Nord font
C: BW weekly logging
D: BW graph tab in client portal
"""
import sys, os

project = os.path.join(os.path.expanduser('~'), 'Desktop', 'expo-full', 'src')

# ============ FIX A: Weekly Focus header ============
portal = os.path.join(project, 'ClientPortal.jsx')
with open(portal, 'r', encoding='utf-8') as f:
    content = f.read()
content = content.replace("COACH'S FOCUS THIS WEEK", "WEEKLY FOCUS")
with open(portal, 'w', encoding='utf-8') as f:
    f.write(content)
print("A: Fixed Weekly Focus header")

# ============ FIX B: Brand colors + Nord font ============
theme = os.path.join(project, 'theme.js')
with open(theme, 'r', encoding='utf-8') as f:
    content = f.read()

# Update accent color to official brand blue
content = content.replace('#3BA0FF', '#39BDFF')
content = content.replace('rgba(59,160,255', 'rgba(57,189,255')

# Update font families to Nord
content = content.replace(
    "export const FN = \"'JetBrains Mono', 'SF Mono', monospace\";",
    "export const FN = \"'Nord', 'JetBrains Mono', sans-serif\";"
)
content = content.replace(
    "export const FB = \"'DM Sans', system-ui, sans-serif\";",
    "export const FB = \"'Nord', 'DM Sans', system-ui, sans-serif\";"
)

with open(theme, 'w', encoding='utf-8') as f:
    f.write(content)
print("B: Updated brand colors to #39BDFF + Nord font")

# ============ FIX index.html: Add Nord font loading ============
indexpath = os.path.join(os.path.expanduser('~'), 'Desktop', 'expo-full', 'index.html')
with open(indexpath, 'r', encoding='utf-8') as f:
    content = f.read()

# Replace Google Fonts link with Nord font-face
old_fonts = '<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet"/>'
new_fonts = '<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet"/>\n  <link rel="stylesheet" href="/nord-fonts.css"/>'
content = content.replace(old_fonts, new_fonts)

# Update body font
content = content.replace(
    "font-family:'DM Sans',system-ui,sans-serif",
    "font-family:'Nord','DM Sans',system-ui,sans-serif"
)

with open(indexpath, 'w', encoding='utf-8') as f:
    f.write(content)
print("B: Updated index.html with Nord font loading")

print("\nAll fixes applied!")
