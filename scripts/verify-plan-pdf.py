# -*- coding: utf-8 -*-
"""THE PRINTED BLOCK IS COMPLETE AND EVERY PAGE IDENTIFIES ITSELF.

Ohad rated this export "15%". The three things wrong with it were structural,
not decorative, and each is asserted here against a REAL export of a REAL
block - the PDF Chrome itself produces through MORE > Export PDF, not a
screenshot of a preview:

  ONE DAY PER PAGE      - "make sure it's one workout day per one page"
  EVERY PAGE IS NAMED   - nine loose sheets where page 5 said only "DAY 2",
                          with no athlete, no block and no number, are
                          unusable. The rebuild lost this when it replaced the
                          old table (whose thead repeated) with sections.
  NOTHING IS DROPPED    - "all the info like tempo and everything else
                          (supersets or whatever i added) will be displayed".
                          Every exercise title and every cue in the block must
                          appear in the PDF text.

Run:  python scripts/verify-plan-pdf.py [planId]
"""
import subprocess, sys, json, re, os
import fitz

PLAN = sys.argv[1] if len(sys.argv) > 1 else None
PDF = 'audit-out/_verify-plan.pdf'
JSONP = 'audit-out/_verify-plan.json'

cmd = ['node', 'scripts/export-plan-pdf.mjs'] + ([PLAN] if PLAN else ['']) + [PDF]
cmd = [c for c in cmd if c != '']
env = dict(os.environ, PLAN_JSON_OUT=JSONP)
r = subprocess.run(cmd, capture_output=True, text=True, env=env, encoding='utf-8', errors='replace')
out = (r.stdout or '') + (r.stderr or '')
for line in out.splitlines():
    if line.strip() and 'deprecat' not in line.lower() and '[console:' not in line:
        print('  | ' + line)
if not os.path.exists(PDF):
    print('FAIL  no PDF was produced')
    sys.exit(1)
if not os.path.exists(JSONP):
    print('FAIL  the exporter did not write the plan it printed; cannot check completeness')
    sys.exit(1)

plan = json.load(open(JSONP, encoding='utf-8'))
days = plan.get('days') or []
warm = [x for x in (plan.get('warmup') or plan.get('warmUp') or []) if x]
athlete = (plan.get('athleteName') or '').strip()
name = (plan.get('name') or '').strip()

doc = fitz.open(PDF)
pages = [p.get_text() for p in doc]
bad = []

expected_pages = len(days) + (1 if warm else 0)
if len(pages) != expected_pages:
    bad.append('page count is %d; the block has %d days%s, so one day per page means %d'
               % (len(pages), len(days), ' plus a warm-up' if warm else '', expected_pages))
else:
    print('ok    one day per page: %d pages for %d days%s' % (len(pages), len(days), ' + warm-up' if warm else ''))

# Every page names itself.
for i, txt in enumerate(pages, 1):
    flat = re.sub(r'\s+', ' ', txt)
    missing = []
    if athlete and athlete not in flat:
        missing.append('athlete')
    if name and name.lower() not in flat.lower():
        missing.append('block name')
    if not re.search(r'DAY\s+\d+\s+OF\s+\d+|WARM-UP', flat, re.I):
        missing.append('day N of M')
    if missing:
        bad.append('page %d carries no %s' % (i, ' and no '.join(missing)))
if not [b for b in bad if 'carries no' in b]:
    print('ok    all %d pages carry the athlete, the block and their number' % len(pages))

# Nothing the coach wrote is missing.
alltext = re.sub(r'\s+', ' ', ' '.join(pages))
titles, cues = [], []
for d in days:
    for ex in (d.get('exercises') or d.get('ex') or []):
        if not ex:
            continue
        t = (ex.get('title') or '').strip()
        if t:
            titles.append(t)
        for line in str(ex.get('notes') or ex.get('n') or '').split('\n'):
            line = line.strip(' -–\t')
            if len(line) > 6:
                cues.append(line)

def present(s):
    return re.sub(r'\s+', ' ', s) in alltext


# Hebrew cannot be checked by substring. PDF text extraction returns RTL runs in
# VISUAL order and moves the punctuation with them, so the cue the coach wrote
# as "- תנועה מלאה!" comes back as "!מלאה תנועה -". Matching the words instead
# is order-blind and still fails when a cue is genuinely absent: every word has
# to be on ONE page, and the longest word - the one least likely to occur by
# chance elsewhere in the block - has to be there too.
WORD = re.compile(r'[^\W\d_]{2,}', re.UNICODE)
page_words = [set(WORD.findall(t)) for t in pages]


def cue_present(line):
    ws = set(WORD.findall(line))
    if not ws:
        return True
    longest = max(ws, key=len)
    for pw in page_words:
        if longest in pw and len(ws - pw) == 0:
            return True
    return False


miss_t = [t for t in set(titles) if not present(t)]
miss_c = [c for c in set(cues) if not cue_present(c)]
if miss_t:
    bad.append('%d of %d exercise titles are not in the PDF, e.g. %s'
               % (len(miss_t), len(set(titles)), '; '.join(miss_t[:3])))
else:
    print('ok    all %d exercise titles are in the PDF' % len(set(titles)))
if miss_c:
    bad.append('%d of %d cues are not in the PDF, e.g. %s'
               % (len(miss_c), len(set(cues)), '; '.join(miss_c[:2])[:120]))
else:
    print('ok    all %d cues are in the PDF' % len(set(cues)))

print('')
if bad:
    for b in bad:
        print('FAIL  ' + b)
    print('\n%d problem(s) with the printed block' % len(bad))
    sys.exit(1)
print('0 - the printed block is one day per page, named on every page, and complete')
