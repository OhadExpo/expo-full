# -*- coding: utf-8 -*-
"""Turn the harvested revisions into one payment-date history per client.

The roster's schema changed several times across five years - an English team
template in 2016, a Hebrew tracker in 2021, punch-card columns in 2022, the
current two-section layout - so nothing here assumes a fixed grid. It finds the
header row by its LABELS and maps columns from them, in whatever order and
whatever tab they appear in.

What comes out is deliberately narrow: a client's name, the dates the sheet
recorded for them, and the rate in force at the time. Amounts are NOT derived.
The sheet never stored one - it holds a price per session and a count of
sessions performed since the payment, which is not what was paid - so
multiplying them out would be inventing revenue.
"""
import openpyxl, glob, re, json, os, datetime

REV_DIR = 'audit-out/sheets/rev'
OUT = 'audit-out/sheets/history.json'

NAME_H = ['שם מלא', 'first name']
DATE_H = {
    'תאריך תשלום אחרון': 'last_payment',
    'תאריך תחילת כרטיסייה אחרונה': 'card_start',
    'תאריך התחלה': 'start',
    'start date': 'start',
}
PRICE_H = {
    'מחיר לאימון אישי': 'price_session',
    'מחיר לחודש': 'price_month',
}
COUNT_H = {'אימונים שבוצעו': 'sessions_done'}
SECTIONS = [
    'מתאמני חד"כ',
    'מתאמני חדר כושר',
    'מתאמני אונליין',
]


def norm(v):
    if v is None:
        return ''
    if isinstance(v, (datetime.datetime, datetime.date)):
        return v.strftime('%d.%m.%Y')
    s = str(v).strip()
    # openpyxl renders integer cells as "1.0"; a serial number is not a name.
    if re.fullmatch(r'-?\d+\.0', s):
        s = s[:-2]
    return s


def as_date(s):
    m = re.search(r'\b(\d{1,2})[./](\d{1,2})[./](\d{2,4})\b', s)
    if not m:
        return None
    d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
    if y < 100:
        y += 2000
    if not (1 <= d <= 31 and 1 <= mo <= 12 and 2015 <= y <= 2030):
        return None
    return '%04d-%02d-%02d' % (y, mo, d)


def parse_file(path, rev):
    wb = openpyxl.load_workbook(path, data_only=True, read_only=True)
    recs = []
    for ws in wb.worksheets:
        section = ''
        colmap = None
        for raw in ws.iter_rows():
            row = [norm(c.value) for c in raw]
            joined = ' '.join(x for x in row if x)
            if not joined.strip():
                continue
            hit = next((s for s in SECTIONS if s in joined and len(joined) < 60), '')
            if hit:
                section, colmap = hit, None
                continue
            low = [x.lower() for x in row]
            if any(any(h in x for h in NAME_H) for x in low):
                cm = {}
                for i, cell in enumerate(row):
                    c = cell.lower()
                    if any(h in c for h in NAME_H):
                        cm['name'] = i
                    for h, k in DATE_H.items():
                        if h in cell:
                            cm[k] = i
                    for h, k in PRICE_H.items():
                        if h in cell:
                            cm[k] = i
                    for h, k in COUNT_H.items():
                        if h in cell:
                            cm[k] = i
                if 'name' in cm and len(cm) > 1:
                    colmap = cm
                continue
            if not colmap or colmap['name'] >= len(row):
                continue
            name = row[colmap['name']]
            if len(name) < 2 or re.fullmatch(r'[\d\s.,-]+', name):
                continue
            r = {'rev': rev, 'section': section, 'name': name}
            for k, i in colmap.items():
                if k == 'name' or i >= len(row):
                    continue
                v = row[i]
                if not v:
                    continue
                if k in ('last_payment', 'card_start', 'start'):
                    d = as_date(v)
                    r[k if d else k + '_raw'] = d or v
                else:
                    r[k] = v
            if len(r) > 3:
                recs.append(r)
    wb.close()
    return recs


files = sorted(glob.glob(os.path.join(REV_DIR, 'r*.xlsx')),
               key=lambda p: int(re.search(r'r(\d+)\.xlsx', p).group(1)))
print('revisions on disk:', len(files))

# The twice-daily sync reads the LIVE sheet, not the revision history: a new
# payment shows up as a new date, and the unique key means only genuinely new
# dates are added. That is what makes EXPO accumulate the history this sheet
# destroys every time it is edited. A live read has no revision number, so it
# is recorded as None rather than given a fake one.
CURRENT = 'audit-out/sheets/roster.xlsx'
if os.path.exists(CURRENT):
    files.append(CURRENT)
    print('plus the live sheet')

all_recs, bad = [], []
for p in files:
    m = re.search(r'r(\d+)\.xlsx', os.path.basename(p))
    rev = int(m.group(1)) if m else None
    try:
        all_recs.extend(parse_file(p, rev))
    except Exception as e:
        bad.append((rev, str(e)[:60]))
print('records:', len(all_recs), '| unreadable files:', len(bad))
for r, e in bad[:5]:
    print('   r%d: %s' % (r, e))

people = {}
for r in all_recs:
    p = people.setdefault(r['name'], {
        'sections': set(), 'first_rev': r['rev'], 'last_rev': r['rev'],
        'last_payment': {}, 'card_start': {}, 'start': {},
        'price_session': set(), 'price_month': set(), 'sessions_done': set()})
    if r.get('section'):
        p['sections'].add(r['section'])
    if r['rev'] is not None:
        p['first_rev'] = r['rev'] if p['first_rev'] is None else min(p['first_rev'], r['rev'])
        p['last_rev'] = r['rev'] if p['last_rev'] is None else max(p['last_rev'], r['rev'])
    # The rate is recorded WITH the date, from the same revision. Taking a
    # client's rates as a set and using the first one labelled every payment
    # with an arbitrary historical price - sorted lexicographically, so a
    # client who moved 175 -> 250 had every payment stamped 175. A rate shown
    # beside a date has to be the rate that was in force on that date.
    for k in ('last_payment', 'card_start', 'start'):
        if r.get(k):
            p[k].setdefault(r[k], {
                'rev': r['rev'],
                'price_session': r.get('price_session'),
                'price_month': r.get('price_month'),
                'sessions_done': r.get('sessions_done'),
            })
    for k in ('price_session', 'price_month', 'sessions_done'):
        if r.get(k):
            p[k].add(str(r[k]))

out = []
for name, p in people.items():
    out.append({
        'name': name,
        'sections': sorted(p['sections']),
        'first_rev': p['first_rev'], 'last_rev': p['last_rev'],
        # rev is kept beside each date so a value can be traced back to the
        # exact revision it was read from.
        'payment_dates': [dict(date=d, first_seen_rev=v['rev'], rate_session=v['price_session'],
                               rate_month=v['price_month'], sessions=v['sessions_done'])
                          for d, v in sorted(p['last_payment'].items())],
        'card_starts': [dict(date=d, first_seen_rev=v['rev'], rate_session=v['price_session'],
                             rate_month=v['price_month'], sessions=v['sessions_done'])
                        for d, v in sorted(p['card_start'].items())],
        'start_dates': sorted(p['start'].keys()),
        'prices_session': sorted(p['price_session']),
        'prices_month': sorted(p['price_month']),
        'sessions_seen': sorted(p['sessions_done']),
    })
out.sort(key=lambda x: (-(len(x['payment_dates']) + len(x['card_starts'])), x['name']))
json.dump(out, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('people:', len(out), '->', OUT)
print('distinct payment dates:', sum(len(x['payment_dates']) for x in out),
      '| distinct card starts:', sum(len(x['card_starts']) for x in out))
for x in out[:15]:
    print(' ', x['name'][:22].ljust(22),
          'pay=%3d card=%3d' % (len(x['payment_dates']), len(x['card_starts'])),
          '|', ','.join(d['date'] for d in x['payment_dates'][:3]))
