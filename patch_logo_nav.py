import re, os, sys, base64
from pathlib import Path

repo = Path(r"C:\Users\Administrator\Desktop\expo-full")
theme_js = repo / "src" / "theme.js"
b64_file = repo / "logo_nav_b64.txt"

b64 = b64_file.read_text(encoding="utf-8").strip()
print(f"Loaded base64: {len(b64)} chars")

# Roundtrip verify
try:
    raw = base64.b64decode(b64)
    assert raw[:8] == b"\x89PNG\r\n\x1a\n", "Not a PNG"
    print(f"PNG roundtrip OK: {len(raw)} bytes")
except Exception as e:
    sys.exit(f"Roundtrip failed: {e}")

content = theme_js.read_text(encoding="utf-8")
pattern = r'(export const EXPO_LOGO_NAV = ")data:image/png;base64,[^"]+(";)'
m = re.search(pattern, content)
if not m:
    sys.exit("EXPO_LOGO_NAV not found")

new_content = re.sub(
    pattern,
    lambda _: f'{m.group(1)}data:image/png;base64,{b64}{m.group(2)}',
    content,
    count=1,
)
if new_content == content:
    sys.exit("No change made")

theme_js.write_text(new_content, encoding="utf-8")
print(f"Patched {theme_js}")
