import os

# Fix App.jsx header - use LOGO wordmark instead of just the icon
app_path = os.path.join(os.path.expanduser('~'), 'Desktop', 'expo-full', 'src', 'App.jsx')
with open(app_path, 'r', encoding='utf-8') as f:
    c = f.read()

# Header: replace icon with logo wordmark (the header is primary brand real estate)
c = c.replace(
    '<img src={EXPO_ICON} alt="" style={{height:22}}/>',
    '<img src={EXPO_LOGO} alt="EXPO" style={{height:24}}/>'
)
with open(app_path, 'w', encoding='utf-8') as f:
    f.write(c)
print("App.jsx: Header now uses LOGO wordmark")

# Fix ClientPortal - finish screen should use LOGO not icon
cp_path = os.path.join(os.path.expanduser('~'), 'Desktop', 'expo-full', 'src', 'ClientPortal.jsx')
with open(cp_path, 'r', encoding='utf-8') as f:
    c = f.read()

# Finish screen: celebration moment = brand moment = full LOGO
c = c.replace(
    '<img src={EXPO_ICON} alt="EXPO" style={{height:48,marginBottom:16,opacity:0.8}} />',
    '<img src={EXPO_LOGO} alt="EXPO" style={{height:40,marginBottom:16}} />'
)

with open(cp_path, 'w', encoding='utf-8') as f:
    f.write(c)
print("ClientPortal: Finish screen now uses LOGO wordmark")
print("All other placements already correct (icon in compact/secondary contexts, logo in hero/header contexts)")
