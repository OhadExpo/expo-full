"""
Apply the training-portal stroke ruling to the coach-side views:
  - card-style containers (`border:`1px solid ${C.bd}`` on lines without cursor:)
    become `border:`0.25px solid ${C.ac}4D`` — 30% opacity EXPO blue, 0.25px
    inactive width, matching the trainee-side cards
  - active/inactive toggle conditionals (`border:`1px solid ${X?C.ac:C.bd}`` on
    lines that DO have cursor:) become a width+color split:
      `border:`${X?'2px':'0.25px'} solid ${X?C.ac:`${C.ac}4D`}``

Skip lines tinted by other state colors (C.rd, C.gn, C.or, C.pu, C.gnD, C.rdD,
etc.) — those carry semantic meaning (errors, success, warnings) and should
keep their current colors.

Idempotent.
"""
import re, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
TARGETS = [
    ROOT / "src" / "TraineesView.jsx",
    ROOT / "src" / "TraineeDetail.jsx",
    ROOT / "src" / "PlansView.jsx",
    ROOT / "src" / "ExercisesView.jsx",
]

card_pat   = re.compile(r"border:\s*`1px solid \$\{C\.bd\}`")
toggle_pat = re.compile(r"border:\s*`1px solid \$\{([^?`{}]+)\?C\.ac\s*:\s*C\.bd\}`")

total_cards = 0
total_toggles = 0

for path in TARGETS:
    text = path.read_text(encoding="utf-8")
    out_lines = []
    cards_in_file = 0
    toggles_in_file = 0
    for line in text.split("\n"):
        new_line = line
        # Toggle pattern (cursor: AND active?C.ac:C.bd)
        if "cursor:" in new_line:
            def toggle_repl(m):
                cond = m.group(1).strip()
                return f"border:`${{{cond}?'2px':'0.25px'}} solid ${{{cond}?C.ac:`${{C.ac}}4D`}}`"
            new_line, n = toggle_pat.subn(toggle_repl, new_line)
            toggles_in_file += n
        # Card pattern (no cursor:)
        if "cursor:" not in new_line and card_pat.search(new_line):
            new_line, n = card_pat.subn("border:`0.25px solid ${C.ac}4D`", new_line)
            cards_in_file += n
        out_lines.append(new_line)
    new_text = "\n".join(out_lines)
    if new_text != text:
        path.write_text(new_text, encoding="utf-8")
    rel = path.relative_to(ROOT)
    print(f"  {rel}: {cards_in_file} cards, {toggles_in_file} toggles")
    total_cards += cards_in_file
    total_toggles += toggles_in_file

print(f"total: {total_cards} cards, {total_toggles} toggles")
