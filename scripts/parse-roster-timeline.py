# -*- coding: utf-8 -*-
"""Every cell the roster ever held, per client, per revision - and when it changed.

Ohad (2026-09-13): "the billing is not even close to 10% ready. re-run every
history field on רשימת מתאמנים and everything you can possibly think of to make
it 100%."

The first parser kept three date columns. This one keeps EVERY column under
every header the sheet ever had (the English team template of 2016, the punch
card tracker of 2022, the two-section layout of 2026), so nothing the sheet
recorded is lost, and it turns the per-revision grid into a per-client
TIMELINE: for each (client, field) the sequence of values with the revision
range each value held, and the change list (old -> new, bounded by revision
timestamps from audit-out/sheets/revisions.json).

Outputs (audit-out/sheets/):
  cells.jsonl     one line per (rev, tab, section, name, field, value)
  timeline.json   per client: fields -> [{value, first_rev, last_rev, first_iso, last_iso}], changes
  timeline-summary.txt  what was found, for the handoff

Amounts are still NOT computed here. That is scripts/derive-payments.mjs, which
labels anything it multiplies as ESTIMATED and reconciles it to the finance
sheet's monthly totals - the only real amounts.
"""
import openpyxl, glob, re, json, os, sys, datetime, collections

REV_DIR = 'audit-out/sheets/rev'
REVS = 'audit-out/sheets/revisions.json'
OUT_DIR = 'audit-out/sheets'
LIVE = 'audit-out/sheets/roster.xlsx'

# Header label -> canonical field. Anything not listed is kept under a slug of
# its own label, so a column added next year is captured, not dropped.
FIELDS = {
    'שם מלא': 'name', 'first name': 'first_name', 'last name': 'last_name', 'שם': 'name',
    'תאריך תשלום אחרון': 'last_payment',
    'תאריך תחילת כרטיסייה אחרונה': 'card_start',
    'תאריך התחלה': 'start', 'תאריך התחל': 'start', 'start date': 'start',
    'מחיר לאימון אישי': 'price_session', 'מחיר לחודש': 'price_month',
    'אימונים שבוצעו': 'sessions_done',
    'כניסות (לא כולל כניסה ראשונה חינמית)': 'entries', 'כניסות': 'entries',
    'סוג כרטיסייה - כניסות לחודש': 'card_type',
    'phone': 'phone', 'email': 'email', 'position': 'position', 'notes': 'notes', 'role': 'role',
    "מס'": 'row_no',
}
SECTIONS = ['מתאמני חד"כ', 'מתאמני חדר כושר', 'מתאמני אונליין', 'מתאמנים אישיים', 'מתאמני זום']
NOISE_ROW = re.compile(r'^(עודכן לאחרונה|updated|סה"כ|total)', re.I)


def norm(v):
    if v is None:
        return ''
    if isinstance(v, (datetime.datetime, datetime.date)):
        return v.strftime('%d.%m.%Y')
    s = str(v).strip()
    if re.fullmatch(r'-?\d+\.0', s):
        s = s[:-2]
    return re.sub(r'\s+', ' ', s)


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


def field_of(label):
    l = label.strip().lower()
    for h, k in FIELDS.items():
        if h.lower() in l:
            return k
    slug = re.sub(r'[^\w֐-׿]+', '_', l).strip('_')
    return 'x_' + slug if slug else None


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
            if NOISE_ROW.match(joined.strip()):
                continue
            low = [x.lower() for x in row]
            if any(('שם מלא' in x) or ('first name' in x) or x == 'שם' for x in low):
                cm = {}
                for i, cell in enumerate(row):
                    if not cell:
                        continue
                    k = field_of(cell)
                    if k and k not in cm:
                        cm[k] = i
                if ('name' in cm or 'first_name' in cm) and len(cm) > 1:
                    colmap = cm
                continue
            if not colmap:
                continue
            if 'name' in colmap and colmap['name'] < len(row):
                name = row[colmap['name']]
            elif 'first_name' in colmap and colmap['first_name'] < len(row):
                name = (row[colmap['first_name']] + ' ' + (row[colmap['last_name']] if 'last_name' in colmap and colmap['last_name'] < len(row) else '')).strip()
            else:
                continue
            if len(name) < 2 or re.fullmatch(r'[\d\s.,-]+', name):
                continue
            for k, i in colmap.items():
                if k in ('name', 'first_name', 'last_name', 'row_no') or i >= len(row):
                    continue
                v = row[i]
                if not v:
                    continue
                d = as_date(v) if k in ('last_payment', 'card_start', 'start') else None
                recs.append({'rev': rev, 'tab': ws.title, 'section': section, 'name': name, 'field': k, 'value': d or v, 'raw': v if d and d != v else None})
    wb.close()
    return recs


def main():
    files = sorted(glob.glob(os.path.join(REV_DIR, 'r*.xlsx')), key=lambda p: int(re.search(r'r(\d+)\.xlsx', p).group(1)))
    revs = {}
    if os.path.exists(REVS):
        for r in json.load(open(REVS, encoding='utf8')):
            revs[r['rev']] = r
    print('revisions on disk:', len(files), '| timestamps known for:', len(revs))
    all_recs, bad = [], []
    for p in files:
        rev = int(re.search(r'r(\d+)\.xlsx', p).group(1))
        try:
            all_recs.extend(parse_file(p, rev))
        except Exception as e:
            bad.append((rev, str(e)[:80]))
    live_recs = []
    if os.path.exists(LIVE):
        try:
            live_recs = parse_file(LIVE, None)
        except Exception as e:
            bad.append(('live', str(e)[:80]))
    print('cell records:', len(all_recs), '| live:', len(live_recs), '| unreadable:', len(bad))
    for r, e in bad[:8]:
        print('   r%s: %s' % (r, e))

    with open(os.path.join(OUT_DIR, 'cells.jsonl'), 'w', encoding='utf8') as f:
        for r in all_recs + live_recs:
            f.write(json.dumps(r, ensure_ascii=False) + '\n')

    # ---- timeline: per (name, field) the sequence of values by revision ----
    def key(name):
        return re.sub(r'[֑-ׇ"\'`.,\-]', '', name).replace('  ', ' ').strip()

    by_client = collections.OrderedDict()
    order = sorted({r['rev'] for r in all_recs})
    rev_index = {rv: i for i, rv in enumerate(order)}
    per = collections.defaultdict(lambda: collections.defaultdict(dict))  # key -> field -> rev -> value
    meta = {}
    for r in all_recs:
        k = key(r['name'])
        per[k][r['field']][r['rev']] = r['value']
        m = meta.setdefault(k, {'names': set(), 'sections': set(), 'tabs': set(), 'first_rev': r['rev'], 'last_rev': r['rev']})
        m['names'].add(r['name']); m['tabs'].add(r['tab'])
        if r['section']:
            m['sections'].add(r['section'])
        m['first_rev'] = min(m['first_rev'], r['rev']); m['last_rev'] = max(m['last_rev'], r['rev'])

    def iso(rev):
        x = revs.get(rev)
        return x['iso'] if x else None

    out = []
    n_changes = 0
    for k, fields in per.items():
        m = meta[k]
        client = {'key': k, 'names': sorted(m['names']), 'sections': sorted(m['sections']), 'tabs': sorted(m['tabs']),
                  'first_rev': m['first_rev'], 'last_rev': m['last_rev'], 'first_iso': iso(m['first_rev']), 'last_iso': iso(m['last_rev']),
                  'fields': {}, 'changes': []}
        for fld, byrev in fields.items():
            runs = []
            prev_v, prev_rev = None, None
            for rv in sorted(byrev):
                v = byrev[rv]
                if runs and runs[-1]['value'] == v:
                    runs[-1]['last_rev'] = rv
                else:
                    if runs:
                        client['changes'].append({'field': fld, 'from': runs[-1]['value'], 'to': v,
                                                  'after_rev': runs[-1]['last_rev'], 'at_rev': rv,
                                                  'after_iso': iso(runs[-1]['last_rev']), 'at_iso': iso(rv)})
                        n_changes += 1
                    runs.append({'value': v, 'first_rev': rv, 'last_rev': rv})
            for run in runs:
                run['first_iso'] = iso(run['first_rev']); run['last_iso'] = iso(run['last_rev'])
            client['fields'][fld] = runs
        client['changes'].sort(key=lambda c: c['at_rev'])
        out.append(client)
    out.sort(key=lambda c: -len(c['changes']))
    json.dump(out, open(os.path.join(OUT_DIR, 'timeline.json'), 'w', encoding='utf8'), ensure_ascii=False)

    lines = []
    lines.append('revisions parsed: %d (r%d..r%d) | clients: %d | cell records: %d | value changes: %d' % (
        len(files), order[0] if order else 0, order[-1] if order else 0, len(out), len(all_recs), n_changes))
    fld_counts = collections.Counter(r['field'] for r in all_recs)
    lines.append('fields seen: ' + ', '.join('%s=%d' % kv for kv in fld_counts.most_common()))
    for c in out[:60]:
        pays = [x for x in c['changes'] if x['field'] in ('last_payment', 'card_start')]
        lines.append('%-28s revs r%d-r%d  changes=%3d  payment-date changes=%2d  fields=%s' % (
            c['names'][0][:28], c['first_rev'], c['last_rev'], len(c['changes']), len(pays), ','.join(sorted(c['fields']))))
    txt = '\n'.join(lines)
    open(os.path.join(OUT_DIR, 'timeline-summary.txt'), 'w', encoding='utf8').write(txt)
    print(txt[:6000])


if __name__ == '__main__':
    main()
