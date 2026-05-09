"""Quote bare rgba(...) JS expressions. Smarter: per-line, count quotes
to determine if we're inside an existing string. Only quote when we're NOT
inside a string."""
import os, re, glob

src = r'C:\Users\Administrator\Desktop\expo-full\src'
files = sorted(set(glob.glob(os.path.join(src, '*.jsx')) + glob.glob(os.path.join(src, '*.js'))))

RGBA_RE = re.compile(r'rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*[\d.]+\s*\)')

def in_string(line, pos):
    """Return True if pos in `line` is inside an unclosed quote (single, double, or backtick)."""
    sq = dq = bq = False
    i = 0
    while i < pos:
        ch = line[i]
        prev = line[i-1] if i > 0 else ''
        if prev == '\\':
            i += 1
            continue
        if not dq and not bq and ch == "'":
            sq = not sq
        elif not sq and not bq and ch == '"':
            dq = not dq
        elif not sq and not dq and ch == '`':
            bq = not bq
        i += 1
    return sq or dq or bq

def fix_file(path):
    with open(path, 'r', encoding='utf-8') as fp:
        lines = fp.readlines()

    fixes = 0
    for line_no in range(len(lines)):
        line = lines[line_no]
        # Find all rgba(...) matches on this line
        new_chars = []
        i = 0
        last = 0
        while True:
            m = RGBA_RE.search(line, i)
            if not m: break
            # Check if the start of the match is inside a string
            if in_string(line, m.start()):
                # Inside a string — leave as-is
                i = m.end()
                continue
            # Outside a string — needs quoting
            new_chars.append(line[last:m.start()])
            new_chars.append("'" + m.group(0) + "'")
            last = m.end()
            i = m.end()
            fixes += 1
        if last > 0:
            new_chars.append(line[last:])
            lines[line_no] = ''.join(new_chars)

    if fixes > 0:
        with open(path, 'w', encoding='utf-8') as fp:
            fp.writelines(lines)
    return fixes

total = 0
for f in files:
    n = fix_file(f)
    if n > 0:
        total += n
        print(f'  {os.path.basename(f)}: {n}')
print(f'TOTAL: {total}')
