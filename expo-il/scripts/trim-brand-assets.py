"""Trim the transparent padding around the EXPO wordmark and icon source
PNGs and emit clean, tightly-cropped copies for the landing page.

The originals in _branding/ are master files with the logo floating in the
middle of a big transparent canvas. That's fine for designers but it makes
<img> tags render the logo at ~20% of the box size on the web. Cropping to
the actual content bounds (with a small margin) gives us pixel-tight assets
the layout can size confidently.
"""
import os
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
BRANDING = os.path.join(ROOT, "_branding")
PUBLIC = os.path.join(ROOT, "expo-il", "public")


def trim(src_path, out_path, margin_px=0, force_square=False):
    img = Image.open(src_path).convert("RGBA")
    bbox = img.getbbox()
    if not bbox:
        raise RuntimeError(f"empty image: {src_path}")
    cropped = img.crop(bbox)
    w, h = cropped.size
    if force_square:
        side = max(w, h) + margin_px * 2
        canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
        canvas.paste(cropped, ((side - w) // 2, (side - h) // 2), cropped)
        canvas.save(out_path, "PNG", optimize=True)
    else:
        if margin_px:
            canvas = Image.new("RGBA", (w + margin_px * 2, h + margin_px * 2), (0, 0, 0, 0))
            canvas.paste(cropped, (margin_px, margin_px), cropped)
            canvas.save(out_path, "PNG", optimize=True)
        else:
            cropped.save(out_path, "PNG", optimize=True)
    print(f"  {os.path.basename(src_path)} -> {os.path.basename(out_path)}  ({w}x{h})")


def main():
    print("Trimming wordmark...")
    trim(
        os.path.join(BRANDING, "White 100_.png"),
        os.path.join(PUBLIC, "expo-logo.png"),
        margin_px=8,
    )
    # The icon mark (EXPO LOGO.png) is already tightly cropped on a black
    # textured square, but ensure it's exactly square in case of any odd
    # alpha edges.
    print("Standardising icon mark...")
    trim(
        os.path.join(BRANDING, "EXPO LOGO.png"),
        os.path.join(PUBLIC, "expo-icon.png"),
        force_square=True,
    )


if __name__ == "__main__":
    main()
