"""Sync EXPO brand assets (EXPO_LOGO + EXPO_LOGO_NAV) from the coach app's
src/theme.js into expo-il/src/theme.js so both surfaces stay visually identical.

Run from the expo-il directory:

    python scripts/sync-brand-from-coach.py

The coach side is the canonical source — never edit the base64 in expo-il
directly. Update there, then re-run this script.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path


def main() -> int:
    here = Path(__file__).resolve().parent.parent
    coach_theme = here.parent / "src" / "theme.js"
    expo_theme = here / "src" / "theme.js"

    if not coach_theme.exists():
        print(f"missing: {coach_theme}", file=sys.stderr)
        return 1
    if not expo_theme.exists():
        print(f"missing: {expo_theme}", file=sys.stderr)
        return 1

    coach_src = coach_theme.read_text(encoding="utf-8")
    nav_match = re.search(
        r'export const EXPO_LOGO_NAV = "(data:image/png;base64,[^"]+)";',
        coach_src,
    )
    logo_match = re.search(
        r'export const EXPO_LOGO = "(data:image/png;base64,[^"]+)";',
        coach_src,
    )
    if not nav_match or not logo_match:
        print("could not locate EXPO_LOGO_NAV / EXPO_LOGO in coach theme.js", file=sys.stderr)
        return 2

    nav = nav_match.group(1)
    logo = logo_match.group(1)

    expo_src = expo_theme.read_text(encoding="utf-8")

    # Replace the existing block (single regex) or inject if missing.
    block_re = re.compile(
        r"(// EXPO brand mark[\s\S]*?export const EXPO_LOGO = \"[^\"]+\";)\n?",
        re.MULTILINE,
    )
    new_block = (
        "// EXPO brand mark — copied verbatim from the coach app's src/theme.js so\n"
        "// both surfaces stay visually identical. Re-extract via the script in\n"
        "// expo-il/scripts/sync-brand-from-coach.py whenever the coach side updates.\n"
        f'export const EXPO_LOGO_NAV = "{nav}";\n'
        f'export const EXPO_LOGO = "{logo}";'
    )

    if block_re.search(expo_src):
        new_content = block_re.sub(new_block + "\n", expo_src)
    else:
        new_content = expo_src.rstrip() + "\n\n" + new_block + "\n"

    expo_theme.write_text(new_content, encoding="utf-8", newline="\n")
    print(f"synced {len(nav)} + {len(logo)} chars into {expo_theme}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
