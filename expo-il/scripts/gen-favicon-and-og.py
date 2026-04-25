"""Generate favicons + OG card for the expo-il landing page.

Outputs into expo-il/public/:
  favicon.ico             multi-size 16/32/48 ICO
  favicon-16x16.png
  favicon-32x32.png
  favicon-48x48.png
  apple-touch-icon.png    180x180 (iOS / Safari home-screen)
  og-cover.png            1200x630 share card

Pipeline mirrors the main app's PWA icon generation (see
scripts/regen-favicons.py) so the brand stays consistent: white X glyph on
black background with a brand-blue ^ chevron over the upper arms. The OG
card adds the EXPO wordmark + Hebrew tagline so WhatsApp/social previews
read at a glance.
"""
import os
from PIL import Image, ImageDraw, ImageFont
import numpy as np

ROOT     = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
BRANDING = os.path.join(ROOT, "_branding")
PUBLIC   = os.path.join(ROOT, "expo-il", "public")

SHAPE_SRC = os.path.join(BRANDING, "White X black background 100_.png")
COLOR_SRC = os.path.join(BRANDING, "Black X 100_.png")

ACCENT_BLUE = (59, 160, 255)   # #3BA0FF
WHITE       = (255, 255, 255)
BG          = (0, 0, 0)

# Same blue-region fractional bbox used by the main app's icon pipeline.
BLUE_FRAC_X = (0.520, 0.689)
BLUE_FRAC_Y = (0.266, 0.350)


def extract_glyph_mask(img):
    arr = np.array(img.convert("RGBA"))
    rgb_max = arr[..., :3].max(axis=2)
    alpha   = arr[..., 3]
    return (rgb_max > 200) & (alpha > 128)


def render_icon(size, inner_pct):
    """Render a square icon centered by glyph centroid.

    inner_pct is the share of the canvas the glyph bbox occupies (0..1).
    Smaller inner_pct = more black breathing room around the X.
    """
    shape = Image.open(SHAPE_SRC).convert("RGBA")
    sw, sh = shape.size
    glyph_mask = extract_glyph_mask(shape)
    ys, xs = np.where(glyph_mask)
    if len(xs) == 0:
        raise RuntimeError("no glyph pixels found in shape source")
    bbox_w = xs.max() - xs.min() + 1
    bbox_h = ys.max() - ys.min() + 1
    bbox_side = max(bbox_w, bbox_h)
    cx, cy = float(xs.mean()), float(ys.mean())

    target_inner = size * inner_pct
    scale = target_inner / bbox_side

    # Build recoloured glyph: white body, blue overlay on the ^ region
    out = np.zeros_like(np.array(shape))
    out[..., 3]   = np.where(glyph_mask, 255, 0)
    out[..., :3]  = WHITE
    blue_x0 = int(BLUE_FRAC_X[0] * sw); blue_x1 = int(BLUE_FRAC_X[1] * sw)
    blue_y0 = int(BLUE_FRAC_Y[0] * sh); blue_y1 = int(BLUE_FRAC_Y[1] * sh)
    region = np.zeros((sh, sw), dtype=bool)
    region[blue_y0:blue_y1, blue_x0:blue_x1] = True
    out[glyph_mask & region, :3] = ACCENT_BLUE
    recoloured = Image.fromarray(out, "RGBA")

    new_w = int(round(sw * scale))
    new_h = int(round(sh * scale))
    resized = recoloured.resize((new_w, new_h), Image.LANCZOS)

    canvas = Image.new("RGB", (size, size), BG)
    rcx, rcy = cx * scale, cy * scale
    px = int(round(size / 2 - rcx))
    py = int(round(size / 2 - rcy))
    canvas.paste(resized, (px, py), resized)
    return canvas


def find_font(size):
    """Try to load DM Sans / Inter / system sans. Falls back to PIL default
    so the script never hard-fails on a clean install — the wordmark in the
    OG card just renders in PIL's bitmap font (still readable, looks rough)."""
    candidates = [
        r"C:\Windows\Fonts\segoeui.ttf",
        r"C:\Windows\Fonts\segoeuib.ttf",
        r"C:\Windows\Fonts\arialbd.ttf",
        r"C:\Windows\Fonts\arial.ttf",
    ]
    for path in candidates:
        try:
            return ImageFont.truetype(path, size)
        except Exception:
            continue
    return ImageFont.load_default()


def render_og(out_path, w=1200, h=630):
    """1200x630 share card: dark canvas, EXPO icon, wordmark, Hebrew tagline,
    expo-il.co.il URL slug at the bottom. Designed for WhatsApp / social
    previews where the whole image is visible."""
    img = Image.new("RGB", (w, h), BG)
    d = ImageDraw.Draw(img)

    # Subtle blue glow under the icon — gives the dark card some depth.
    glow_radius = 220
    glow_cx, glow_cy = w // 2, h // 2 - 40
    for r in range(glow_radius, 0, -8):
        a = int(20 * (1 - r / glow_radius))
        if a <= 0:
            continue
        d.ellipse(
            [glow_cx - r, glow_cy - r, glow_cx + r, glow_cy + r],
            fill=(int(ACCENT_BLUE[0] * a / 255), int(ACCENT_BLUE[1] * a / 255), int(ACCENT_BLUE[2] * a / 255)),
        )

    icon_size = 200
    icon = render_icon(icon_size, 0.8).convert("RGBA")
    img.paste(icon, (glow_cx - icon_size // 2, glow_cy - icon_size // 2), icon)

    # EXPO wordmark below the icon
    f_word = find_font(64)
    f_tag  = find_font(32)
    f_url  = find_font(24)

    word = "EXPO"
    bbox = d.textbbox((0, 0), word, font=f_word)
    word_w = bbox[2] - bbox[0]
    d.text(((w - word_w) / 2, glow_cy + icon_size // 2 + 30),
           word, fill=WHITE, font=f_word)

    # Tagline. PIL renders LTR and does not apply the Unicode BiDi algorithm,
    # so a Hebrew string would visually appear reversed. We use the English
    # tagline for the OG card — it reads cleanly worldwide on share previews
    # (WhatsApp, Twitter, iMessage) and the Hebrew page itself is what the
    # click leads to.
    tag = "Programmed training that actually works"
    bbox = d.textbbox((0, 0), tag, font=f_tag)
    tag_w = bbox[2] - bbox[0]
    d.text(((w - tag_w) / 2, glow_cy + icon_size // 2 + 110),
           tag, fill=ACCENT_BLUE, font=f_tag)

    # URL at the bottom — the whole point of an OG image is people glance and
    # remember the domain.
    url = "expo-il.co.il"
    bbox = d.textbbox((0, 0), url, font=f_url)
    url_w = bbox[2] - bbox[0]
    d.text(((w - url_w) / 2, h - 60),
           url, fill=(160, 160, 160), font=f_url)

    img.save(out_path, "PNG", optimize=True)
    return out_path


def main():
    INNER = 0.80
    for size in (16, 32, 48):
        path = os.path.join(PUBLIC, f"favicon-{size}x{size}.png")
        render_icon(size, INNER).save(path, "PNG", optimize=True)
        print(f"wrote {path}")

    # Multi-size .ico
    base = render_icon(48, INNER)
    base.save(os.path.join(PUBLIC, "favicon.ico"), format="ICO",
              sizes=[(16, 16), (32, 32), (48, 48)])
    print("wrote favicon.ico (16/32/48)")

    apple = render_icon(180, 0.96)  # iOS prefers fuller fill
    apple.save(os.path.join(PUBLIC, "apple-touch-icon.png"), "PNG", optimize=True)
    print("wrote apple-touch-icon.png (180x180)")

    og_path = os.path.join(PUBLIC, "og-cover.png")
    render_og(og_path)
    print(f"wrote {og_path} (1200x630)")


if __name__ == "__main__":
    main()
