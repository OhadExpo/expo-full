"""
Rebuild EXPO_LOGO base64 string in src/theme.js from the branding asset
_branding/White 100_.png. Source PNG has massive transparent padding around
the actual mark; crop to the non-transparent bounding box, downscale to a
size that's still crisp at 2x DPR (login screen renders the logo at ~324px
wide, so 800px source = generous Retina margin), encode to PNG base64, and
regex-replace the existing EXPO_LOGO data URI in theme.js.
"""
from PIL import Image
import base64, io, re, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
SRC  = ROOT / "_branding" / "White 100_.png"
DST  = ROOT / "src" / "theme.js"

img = Image.open(SRC).convert("RGBA")
print(f"source: {img.size}")

# Crop to non-transparent bounding box
alpha = img.getchannel("A")
bbox  = alpha.getbbox()
if not bbox:
    raise SystemExit("source image is fully transparent")
img = img.crop(bbox)
print(f"cropped: {img.size}")

# Downscale to width 800 (preserve aspect ratio), oversampled for Retina
target_w = 800
ratio = target_w / img.size[0]
target = (target_w, max(1, round(img.size[1] * ratio)))
img = img.resize(target, Image.LANCZOS)
print(f"resized: {img.size}")

# Encode to PNG base64
buf = io.BytesIO()
img.save(buf, "PNG", optimize=True)
b64 = base64.b64encode(buf.getvalue()).decode("ascii")
data_uri = "data:image/png;base64," + b64
print(f"data URI length: {len(data_uri)} chars (~{len(buf.getvalue())//1024}KB binary)")

# Patch theme.js with regex (string-replace chokes on long base64)
text = DST.read_text(encoding="utf-8")
pattern = re.compile(r'export const EXPO_LOGO = "data:image/png;base64,[^"]+";')
new_decl = f'export const EXPO_LOGO = "{data_uri}";'
new_text, n = pattern.subn(new_decl, text, count=1)
if n != 1:
    raise SystemExit(f"expected exactly 1 EXPO_LOGO match, found {n}")
DST.write_text(new_text, encoding="utf-8")
print(f"patched {DST.relative_to(ROOT)}")
