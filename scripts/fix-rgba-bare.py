"""Quote any bare rgba(...) JS expressions not already inside strings/templates."""
import os, re, glob

src = r'C:\Users\Administrator\Desktop\expo-full\src'
files = sorted(set(glob.glob(os.path.join(src, '*.jsx')) + glob.glob(os.path.join(src, '*.js'))))

RGBA_RE = re.compile(r'rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*[\d.]+\s*\)')

def fix_file(path):
    with open(path, 'r', encoding='utf-8') as fp:
        s = fp.read()

    out = []
    i = 0
    n = len(s)
    in_single = False
    in_double = False
    in_backtick = 0
    in_template_expr = 0
    in_line_comment = False
    in_block_comment = False
    fixes = 0
    SQ = "'"
    BQ = '`'
    DQ = '"'
    BS = '\\'

    while i < n:
        ch = s[i]
        nx = s[i+1] if i+1 < n else ''
        prev = s[i-1] if i > 0 else ' '

        if in_line_comment:
            out.append(ch)
            if ch == '\n': in_line_comment = False
            i += 1; continue
        if in_block_comment:
            out.append(ch)
            if ch == '*' and nx == '/':
                out.append(nx); in_block_comment = False; i += 2; continue
            i += 1; continue

        if not in_single and not in_double and not in_backtick:
            if ch == '/' and nx == '/':
                in_line_comment = True; out.append(ch); i += 1; continue
            if ch == '/' and nx == '*':
                in_block_comment = True; out.append(ch); i += 1; continue

        if not in_double and not in_backtick and ch == SQ and prev != BS:
            in_single = not in_single; out.append(ch); i += 1; continue
        if not in_single and not in_backtick and ch == DQ and prev != BS:
            in_double = not in_double; out.append(ch); i += 1; continue
        if not in_single and not in_double and ch == BQ and prev != BS:
            if in_backtick > in_template_expr:
                in_backtick -= 1
            else:
                in_backtick += 1
            out.append(ch); i += 1; continue

        if in_backtick > in_template_expr and ch == '$' and nx == '{':
            in_template_expr += 1
            out.append(ch); out.append(nx); i += 2; continue
        if in_template_expr > 0 and ch == '}':
            in_template_expr -= 1
            out.append(ch); i += 1; continue

        if in_single or in_double or (in_backtick > in_template_expr):
            out.append(ch); i += 1; continue

        # JS context — check for bare rgba(...)
        if ch == 'r' and s[i:i+4] == 'rgba' and not (prev.isalnum() or prev == '_' or prev == '$'):
            m = RGBA_RE.match(s, i)
            if m:
                matched = m.group(0)
                out.append("'" + matched + "'")
                i = m.end()
                fixes += 1
                continue

        out.append(ch); i += 1

    new_s = ''.join(out)
    if fixes > 0 and new_s != s:
        with open(path, 'w', encoding='utf-8') as fp:
            fp.write(new_s)
    return fixes

total = 0
for f in files:
    n = fix_file(f)
    if n > 0:
        total += n
        print(f'  {os.path.basename(f)}: {n}')
print(f'TOTAL: {total}')
