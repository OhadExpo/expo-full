"""Quote bare rgba(...) JS expressions, including those inside ${...}
template-expressions. Tracks both backtick and template-expr depth."""
import os, re, glob

src = r'C:\Users\Administrator\Desktop\expo-full\src'
files = sorted(set(glob.glob(os.path.join(src, '*.jsx')) + glob.glob(os.path.join(src, '*.js'))))

RGBA_RE = re.compile(r'rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*[\d.]+\s*\)')

def context_at(s, pos):
    """Walk to position and return the current context state.
    Returns dict: {sq, dq, bq_depth, te_depth} where:
      sq = inside single-quoted string
      dq = inside double-quoted string
      bq_depth = depth of nested backtick template literals
      te_depth = depth of ${...} template expressions
    'in JS' = sq=False, dq=False, bq_depth == te_depth
    'in string' = sq or dq or bq_depth > te_depth
    """
    sq = dq = False
    bq_depth = 0
    te_depth = 0
    i = 0
    while i < pos:
        ch = s[i]
        prev = s[i-1] if i > 0 else ''
        if prev == '\\':
            i += 1
            continue
        # In template-literal-text mode (bq_depth > te_depth) only `${` opens TE,
        # and ` closes the backtick. Other quotes are text.
        in_text = bq_depth > te_depth
        if in_text:
            if ch == '$' and i+1 < len(s) and s[i+1] == '{':
                te_depth += 1
                i += 2
                continue
            if ch == '`':
                bq_depth -= 1
                i += 1
                continue
            i += 1
            continue
        # We're in JS context (could be top-level or inside ${...})
        if not dq and ch == "'":
            sq = not sq
            i += 1; continue
        if not sq and ch == '"':
            dq = not dq
            i += 1; continue
        if sq or dq:
            i += 1; continue
        if ch == '`':
            bq_depth += 1
            i += 1; continue
        if ch == '}' and te_depth > 0:
            te_depth -= 1
            i += 1; continue
        # JS comment skip
        if ch == '/' and i+1 < len(s) and s[i+1] == '/':
            # skip to end of line
            while i < len(s) and s[i] != '\n':
                i += 1
            continue
        if ch == '/' and i+1 < len(s) and s[i+1] == '*':
            j = s.find('*/', i+2)
            if j == -1: i = len(s); continue
            i = j + 2; continue
        i += 1
    return sq, dq, bq_depth, te_depth

def fix_file(path):
    with open(path, 'r', encoding='utf-8') as fp:
        s = fp.read()

    fixes = 0
    out_parts = []
    last = 0
    for m in RGBA_RE.finditer(s):
        sq, dq, bqd, ted = context_at(s, m.start())
        in_text = bqd > ted
        if sq or dq or in_text:
            # Inside a string — leave alone
            continue
        # JS context — quote it
        out_parts.append(s[last:m.start()])
        out_parts.append("'" + m.group(0) + "'")
        last = m.end()
        fixes += 1

    if fixes > 0:
        out_parts.append(s[last:])
        with open(path, 'w', encoding='utf-8') as fp:
            fp.write(''.join(out_parts))
    return fixes

total = 0
for f in files:
    n = fix_file(f)
    if n > 0:
        total += n
        print(f'  {os.path.basename(f)}: {n}')
print(f'TOTAL: {total}')
