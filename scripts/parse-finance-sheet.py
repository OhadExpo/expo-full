# -*- coding: utf-8 -*-
"""Read the ניהול פיננסי workbook into monthly revenue totals by channel.

These are the only actual AMOUNTS either sheet records. The roster never stored
one - it holds a rate and a count of sessions performed since the last payment,
which is not what was paid - so the money side of the picture comes from here
and the per-client dates come from the roster's revisions.

One tab per month, named for the month it covers (the header inside says when
it was last updated, which is the following month - "June 2026" carries
"עודכן לאחרונה: 01.07.2026"). The layout is three income blocks and two expense
blocks side by side, so rows are found by their LABEL, not by position.
"""
import openpyxl, json, re, sys, datetime

SRC = sys.argv[1] if len(sys.argv) > 1 else 'audit-out/sheets/finance.xlsx'
OUT = sys.argv[2] if len(sys.argv) > 2 else 'audit-out/sheets/finance.json'

# Only income lines. Expenses are Ohad's personal budget and are none of EXPO's
# business; nothing here reads or stores them.
CHANNELS = {
    'מתאמני אונליין': 'online',
    'מתאמני חדר כושר (העברות)': 'gym_transfer',
    'מתאמני חדר כושר (מזומן)': 'gym_cash',
    'מתאמנים שהעבירו להורים': 'via_parents',
    'בני הרצליה כדורסל': 'bhbc',
    # Income, but a National Insurance payment rather than coaching revenue.
    # Kept under its own channel so it can be shown or excluded deliberately,
    # never silently folded into training income.
    'ביטוח לאומי': 'national_insurance',
}

MONTHS = {m: i + 1 for i, m in enumerate(
    ['january', 'february', 'march', 'april', 'may', 'june', 'july',
     'august', 'september', 'october', 'november', 'december'])}


def month_of(tab):
    m = re.match(r'\s*([A-Za-z]+)\s+(\d{4})\s*$', tab)
    if not m:
        return None
    mo = MONTHS.get(m.group(1).lower())
    return '%04d-%02d-01' % (int(m.group(2)), mo) if mo else None


def as_amount(v):
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip().replace(',', '')
    # "50 x" and "1200 x" mean a placeholder, not a figure. Not a number.
    if not re.fullmatch(r'-?\d+(\.\d+)?', s):
        return None
    return float(s)


wb = openpyxl.load_workbook(SRC, data_only=True)
rows, skipped = [], []
for ws in wb.worksheets:
    month = month_of(ws.title)
    if not month:
        skipped.append(ws.title)
        continue
    grid = [[('' if c.value is None else c.value) for c in r] for r in ws.iter_rows()]
    for r in grid:
        for i, cell in enumerate(r):
            label = str(cell).strip()
            ch = CHANNELS.get(label)
            if not ch:
                continue
            # The amount is the next numeric cell to the right of the label.
            amt = None
            for j in range(i + 1, min(i + 4, len(r))):
                a = as_amount(r[j])
                if a is not None:
                    amt = a
                    break
            if amt is None:
                continue
            rows.append({'month': month, 'channel': ch, 'label_he': label,
                         'amount': amt, 'currency': 'ils', 'source_tab': ws.title})

# One row per (month, channel); a label appearing twice in a tab is the same
# figure read twice, not two payments.
seen, out = set(), []
for r in rows:
    k = (r['month'], r['channel'])
    if k in seen:
        continue
    seen.add(k)
    out.append(r)
out.sort(key=lambda r: (r['month'], r['channel']))

json.dump(out, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('tabs read:', [ws.title for ws in wb.worksheets])
if skipped:
    print('tabs skipped (not a month name):', skipped)
print('rows:', len(out), '->', OUT)
for r in out:
    print('  %s  %-18s %10.2f  %s' % (r['month'], r['channel'], r['amount'], r['label_he']))
tot = {}
for r in out:
    if r['channel'] != 'national_insurance':
        tot[r['month']] = tot.get(r['month'], 0) + r['amount']
print('\ncoaching revenue by month (excludes national insurance):')
for m in sorted(tot):
    print('  %s  %10.2f ILS' % (m, tot[m]))
