"""
Rebuild EXPO_LOGO and EXPO_LOGO_NAV in src/theme.js from _branding/White 100_.png.

The source PNG ships with stray near-transparent noise pixels in the top ~13 rows
(an artifact from the original PDF rasterization). The previous rebuild script
used PIL's bbox(), which includes that noise — producing a logo with massive
empty space above the caret. The previous EXPO_LOGO_NAV was hand-cropped tighter,
but the caret tip ended up at row 0; sub-pixel rendering at the small heights
the UI uses (h=11..22) anti-aliases that row to near-transparent, so the caret
reads as "missing" / "cut off at the top".

This script:
  1. Crops to the LARGEST contiguous content block (skips stray noise rows)
  2. Adds a small transparent top/bottom buffer so the caret tip + wordmark
     descenders never touch the image edge — protecting them from sub-pixel
     anti-aliasing at small render heights.
  3. Writes back EXPO_LOGO (full mark, 800px wide) and EXPO_LOGO_NAV (nav mark,
     400px wide — 2x the largest UI render of h=50, plus retina margin).
"""
from PIL import Image
import base64, io, re, pathlib
import numpy as np

ROOT = pathlib.Path(__file__).resolve().parents[1]
SRC  = ROOT / "_branding" / "White 100_.png"
DST  = ROOT / "src" / "theme.js"

img = Image.open(SRC).convert("RGBA")
arr = np.array(img)
a = arr[:,:,3]
H, W = a.shape

# Find content blocks at threshold > 32 (drops near-transparent noise dust).
mask = (a > 32)
row_counts = mask.sum(axis=1)
in_block = False
blocks = []
start = 0
for y in range(H):
    has_content = row_counts[y] >= 4  # require minimum width to count as real content
    if has_content and not in_block:
        in_block, start = True, y
    elif not has_content and in_block:
        blocks.append((start, y, y - start))
        in_block = False
if in_block:
    blocks.append((start, H, H - start))

if not blocks:
    raise SystemExit("source image has no meaningful content rows")

# Pick the contiguous content region: from the FIRST block taller than the
# stray-noise threshold (>= 50 rows) through the LAST. This skips the dust at
# top while preserving caret + wordmark.
real_blocks = [b for b in blocks if b[2] >= 50]
if not real_blocks:
    raise SystemExit(f"no content blocks taller than 50 rows; blocks={blocks}")
y0 = real_blocks[0][0]
y1 = real_blocks[-1][1]

# Find tight column bbox over the real-content rows
col_counts = mask[y0:y1].sum(axis=0)
nz_cols = np.where(col_counts >= 4)[0]
x0, x1 = int(nz_cols[0]), int(nz_cols[-1]) + 1

print(f"source: {img.size}")
print(f"content blocks (start, end, h): {blocks}")
print(f"cropping to y={y0}..{y1} ({y1-y0} rows), x={x0}..{x1} ({x1-x0} cols)")

cropped = img.crop((x0, y0, x1, y1))
cw, ch = cropped.size

# Add transparent breathing room — proportional to image height so it survives
# any downscale. 4% top + 4% bottom = ~8% total. At h=22 render this is ~1.7px
# top buffer; enough to prevent the caret tip from being anti-aliased to nothing.
pad_pct = 0.04
pad_v = max(2, round(ch * pad_pct))
pad_h = max(2, round(cw * 0.01))
padded = Image.new("RGBA", (cw + 2 * pad_h, ch + 2 * pad_v), (0, 0, 0, 0))
padded.paste(cropped, (pad_h, pad_v))
print(f"padded to: {padded.size} (top/bottom buffer={pad_v}px each)")


def encode_to_data_uri(image, target_w):
    ratio = target_w / image.size[0]
    target = (target_w, max(1, round(image.size[1] * ratio)))
    out = image.resize(target, Image.LANCZOS)
    buf = io.BytesIO()
    out.save(buf, "PNG", optimize=True)
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    return "data:image/png;base64," + b64, out.size, len(buf.getvalue())


# EXPO_LOGO — used in auth screen at maxHeight 20vh; 800px wide handles
# Retina at large desktop renders.
logo_uri, logo_size, logo_bytes = encode_to_data_uri(padded, 800)
print(f"EXPO_LOGO: {logo_size}, {logo_bytes//1024}KB")

# EXPO_LOGO_NAV — used at h=11..50 across the platform. 400px wide is generous
# 4x the largest render (h=50 → w≈147), plenty for high-DPR sharpness, and
# keeps the data URI under 10KB. The padding survives the downscale.
nav_uri, nav_size, nav_bytes = encode_to_data_uri(padded, 400)
print(f"EXPO_LOGO_NAV: {nav_size}, {nav_bytes//1024}KB")

# Patch theme.js
text = DST.read_text(encoding="utf-8")
patched = text
for name, uri in [("EXPO_LOGO", logo_uri), ("EXPO_LOGO_NAV", nav_uri)]:
    pattern = re.compile(rf'export const {name} = "data:image/png;base64,[^"]+";')
    new_decl = f'export const {name} = "{uri}";'
    patched, n = pattern.subn(new_decl, patched, count=1)
    if n != 1:
        raise SystemExit(f"expected exactly 1 {name} match, found {n}")

DST.write_text(patched, encoding="utf-8")
print(f"patched {DST.relative_to(ROOT)}")
