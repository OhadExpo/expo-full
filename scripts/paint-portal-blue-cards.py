"""
Re-skin the training portal: 2px EXPO-blue stroke around all the card-style
containers (BW graph, history rows, warm-up, day cards, etc.) and a slimmer
1px blue stroke on inputs (half the card stroke per Ohad's spec). Buttons
stay on the default gray (C.bd) — we detect those by looking for cursor:
on the same line, since buttons in this file are inline-styled with a
cursor:pointer / cursor:'pointer' / cursor:'default' next to their border.

Idempotent: re-running on already-blue lines is a no-op.
"""
import re, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
TGT  = ROOT / "src" / "ClientPortal.jsx"

text = TGT.read_text(encoding="utf-8")
out_lines = []
swapped_cards = 0
swapped_inputs = 0

# Revert the inflated input borders Ohad called out (4px → 1px), keeping
# the EXPO-blue color so they read as half-stroke against the 2px cards.
input_revert_patterns = [
    (r"`4px solid \$\{C\.ac\}`", r"`1px solid ${C.ac}`"),
    (r"`4px solid \$\{existingBw\?C\.gn\+'60':C\.ac\}`",
     r"`1px solid ${existingBw?C.gn+'60':C.ac}`"),
]
for pat, rep in input_revert_patterns:
    new_text, n = re.subn(pat, rep, text)
    swapped_inputs += n
    text = new_text

# Card stroke pattern. Skip a line if it has a cursor: marker on it (button).
card_pat = re.compile(r"border:\s*`1px solid \$\{C\.bd\}`")
for line in text.split("\n"):
    if card_pat.search(line) and "cursor:" not in line:
        new_line = card_pat.sub("border:`2px solid ${C.ac}`", line)
        if new_line != line:
            swapped_cards += 1
        out_lines.append(new_line)
    else:
        out_lines.append(line)

TGT.write_text("\n".join(out_lines), encoding="utf-8")
print(f"input-revert swaps (4px to 1px): {swapped_inputs}")
print(f"card stroke swaps (gray to blue 2px): {swapped_cards}")
