"""Regenerate browser favicons with extra black breathing room around the X.

The installed-app icons (icon-180/192/512/maskable) stay as-is — Ohad
likes how they sit. The browser favicon set (favicon.ico + favicon-16/32/48)
gets a smaller inner fill so the blue ^ chevron at the top doesn't crowd
the black canvas edge at tiny sizes.

Pipeline matches project_pwa_state.md:
  shape source = _branding/White X black background 100_.png
  color map    = _branding/Black X 100_.png  (blue region at fractional
                 bbox x[0.520-0.689] y[0.266-0.350])
  mask         = (rgb_max > 200) AND (alpha > 128)
  centering    = centroid of glyph pixels (NOT bbox — X is asymmetric)
  fill         = 80% of canvas (was 96% for the app icons)
"""
import os
from PIL import Image
import numpy as np

BRANDING = os.path.join(os.path.dirname(__file__), "..", "_branding")
PUBLIC = os.path.join(os.path.dirname(__file__), "..", "public")

SHAPE_SRC = os.path.join(BRANDING, "White X black background 100_.png")
COLOR_SRC = os.path.join(BRANDING, "Black X 100_.png")

ACCENT_BLUE = (59, 160, 255)  # #3BA0FF — theme blue, matches C.ac
WHITE = (255, 255, 255)

# Blue-region fractional bbox in the color source (Black X variant).
BLUE_FRAC_X = (0.520, 0.689)
BLUE_FRAC_Y = (0.266, 0.350)


def extract_glyph(img):
    arr = np.array(img.convert("RGBA"))
    rgb_max = arr[..., :3].max(axis=2)
    alpha = arr[..., 3]
    mask = (rgb_max > 200) & (alpha > 128)
    return mask


def render_icon(size, inner_pct):
    """Render a square icon at `size` px with the X filling `inner_pct` of canvas."""
    shape = Image.open(SHAPE_SRC).convert("RGBA")
    color = Image.open(COLOR_SRC).convert("RGBA")
    sw, sh = shape.size

    glyph_mask = extract_glyph(shape)
    ys, xs = np.where(glyph_mask)
    if len(xs) == 0:
        raise RuntimeError("no glyph pixels found in shape source")

    bbox_x0, bbox_x1 = xs.min(), xs.max() + 1
    bbox_y0, bbox_y1 = ys.min(), ys.max() + 1
    bbox_w = bbox_x1 - bbox_x0
    bbox_h = bbox_y1 - bbox_y0
    bbox_side = max(bbox_w, bbox_h)

    # Centroid of glyph pixels (in source coords)
    cx = float(xs.mean())
    cy = float(ys.mean())

    # Compute scale so the bbox fits inner_pct of the target canvas
    target_inner = size * inner_pct
    scale = target_inner / bbox_side

    # Build the recolored shape: white by default, blue inside the
    # color-source's blue region (mapped via fractional bbox).
    cw, ch = color.size
    blue_x0 = int(BLUE_FRAC_X[0] * cw)
    blue_x1 = int(BLUE_FRAC_X[1] * cw)
    blue_y0 = int(BLUE_FRAC_Y[0] * ch)
    blue_y1 = int(BLUE_FRAC_Y[1] * ch)

    shape_arr = np.array(shape.resize((sw, sh)))  # already source-size
    out = np.zeros_like(shape_arr)
    out[..., 3] = np.where(glyph_mask, 255, 0)
    out[..., :3] = WHITE

    # Apply blue region — only on glyph pixels whose source coords fall in
    # the color-source's blue fractional bbox (rescaled to shape dims).
    blue_in_shape_x0 = int(BLUE_FRAC_X[0] * sw)
    blue_in_shape_x1 = int(BLUE_FRAC_X[1] * sw)
    blue_in_shape_y0 = int(BLUE_FRAC_Y[0] * sh)
    blue_in_shape_y1 = int(BLUE_FRAC_Y[1] * sh)

    region_mask = np.zeros((sh, sw), dtype=bool)
    region_mask[blue_in_shape_y0:blue_in_shape_y1, blue_in_shape_x0:blue_in_shape_x1] = True
    blue_mask = glyph_mask & region_mask
    out[blue_mask, :3] = ACCENT_BLUE

    recolored = Image.fromarray(out, "RGBA")

    # Resize to scaled bbox, paste centered by centroid on black canvas.
    new_w = int(round(sw * scale))
    new_h = int(round(sh * scale))
    resized = recolored.resize((new_w, new_h), Image.LANCZOS)

    canvas = Image.new("RGB", (size, size), (0, 0, 0))
    # Centroid in resized coords:
    rcx = cx * scale
    rcy = cy * scale
    paste_x = int(round(size / 2 - rcx))
    paste_y = int(round(size / 2 - rcy))
    canvas.paste(resized, (paste_x, paste_y), resized)
    return canvas


def main():
    INNER = 0.80  # 80% — gives the blue ^ visible black border
    for size in (16, 32, 48):
        out_path = os.path.join(PUBLIC, f"favicon-{size}x{size}.png")
        img = render_icon(size, INNER)
        img.save(out_path, "PNG", optimize=True)
        print(f"wrote {out_path}")

    # Multi-size .ico
    ico_sizes = [(16, 16), (32, 32), (48, 48)]
    base = render_icon(48, INNER)
    base.save(os.path.join(PUBLIC, "favicon.ico"), format="ICO", sizes=ico_sizes)
    print("wrote favicon.ico (multi-size 16/32/48)")


if __name__ == "__main__":
    main()
