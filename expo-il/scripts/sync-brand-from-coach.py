"""Sync EXPO brand assets from the coach app's src/theme.js into expo-il.

  - EXPO_LOGO_NAV → inline base64 in expo-il/src/theme.js (used in nav + footer,
    small enough to inline cheaply).
  - EXPO_LOGO     → decoded to expo-il/public/expo-hero-logo.png (used only in
    the hero; keeping it out of the JS bundle saves ~30KB of base64 payload).

Run from the expo-il directory:

    python scripts/sync-brand-from-coach.py

The coach side is the canonical source — never edit the base64 in expo-il
directly. Update there, then re-run this script.
"""
from __future__ import annotations

import base64
import re
import sys
from pathlib import Path


def main() -> int:
    here = Path(__file__).resolve().parent.parent
    coach_theme = here.parent / "src" / "theme.js"
    expo_theme = here / "src" / "theme.js"
    hero_png = here / "public" / "expo-hero-logo.png"

    if not coach_theme.exists():
        print(f"missing: {coach_theme}", file=sys.stderr)
        return 1
    if not expo_theme.exists():
        print(f"missing: {expo_theme}", file=sys.stderr)
        return 1

    coach_src = coach_theme.read_text(encoding="utf-8")
    nav_match = re.search(
        r'export const EXPO_LOGO_NAV = "data:image/png;base64,([^"]+)";',
        coach_src,
    )
    logo_match = re.search(
        r'export const EXPO_LOGO = "data:image/png;base64,([^"]+)";',
        coach_src,
    )
    if not nav_match or not logo_match:
        print("could not locate EXPO_LOGO_NAV / EXPO_LOGO in coach theme.js", file=sys.stderr)
        return 2

    nav_b64 = nav_match.group(1)
    logo_b64 = logo_match.group(1)

    # Hero logo → real PNG file (browser-cacheable, no JS bundle bloat).
    hero_png.write_bytes(base64.b64decode(logo_b64))
    print(f"wrote {hero_png} ({hero_png.stat().st_size} bytes)")

    expo_src = expo_theme.read_text(encoding="utf-8")
    block_re = re.compile(
        r"(// EXPO brand mark[\s\S]*?export const EXPO_LOGO_NAV = \"[^\"]+\";)\n?",
        re.MULTILINE,
    )
    new_block = (
        "// EXPO brand mark — synced from the coach app's src/theme.js. Only the\n"
        "// nav-sized variant inlines as base64; the larger hero logo is written\n"
        "// to public/expo-hero-logo.png so it doesn't bloat the JS bundle. Re-run\n"
        "// scripts/sync-brand-from-coach.py whenever the coach side updates.\n"
        f'export const EXPO_LOGO_NAV = "data:image/png;base64,{nav_b64}";'
    )

    if block_re.search(expo_src):
        new_content = block_re.sub(new_block + "\n", expo_src)
    else:
        new_content = expo_src.rstrip() + "\n\n" + new_block + "\n"

    # Drop the now-unused EXPO_LOGO base64 if it's still hanging around from
    # an older sync. Match the whole multi-line export and remove it.
    new_content = re.sub(
        r'\nexport const EXPO_LOGO = "data:image/png;base64,[^"]+";\n?',
        "\n",
        new_content,
    )

    expo_theme.write_text(new_content, encoding="utf-8", newline="\n")
    print(f"synced nav ({len(nav_b64)} chars) into {expo_theme}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
