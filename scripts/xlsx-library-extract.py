# Extract the canonical xlsx exercise library (all 6 GEM sheets) into a flat
# JSON keyed by normalized name, for the add-only merge into expo-exercises.
# Read-only on the xlsx. Run: PYTHONUTF8=1 python scripts/xlsx-library-extract.py
import json, re, openpyxl

SRC = r"C:\Users\Administrator\Desktop\expo-full\Exercise Database\FINAL Version\Last Draft Exercise Library.xlsx"
OUT = r"C:\Users\ADMINI~1\AppData\Local\Temp\claude\C--Users-Administrator-Desktop-expo-full\33c126c1-1fa5-49fc-8867-e401ddbc6e30\scratchpad\xlsx_library.json"

# xlsx column -> expo field (literal, per Ohad: fill with the columns that are full)
COLMAP = {
    'Resistance Type': 'resistanceType',
    'Body Position': 'bodyPosition',
    'Movement Type': 'movementType',
    'Primary Joints': 'primaryJoints',
    'Joint Movements': 'jointMovements',
    'Primary Muscle Groups': 'primaryMuscles',
    'Secondary Muscle Groups': 'secondaryMuscles',
    'Coaching Notes': 'cues',
}
# light normalization of resistance abbreviations to the expo enum
RES = {'BW': 'Bodyweight', 'DB': 'Dumbbell', 'BB': 'Barbell', 'KB': 'Kettlebell',
       'MB': 'Medicine Ball', 'CABLE': 'Cable', 'MACHINE': 'Machine', 'BAND': 'Band',
       'LANDMINE': 'Landmine', 'TRX': 'TRX/Suspension'}

def norm(s):
    return re.sub(r'\s+', ' ', str(s or '').strip()).lower()

def lat_of(sheet):
    u = sheet.upper()
    if '(BI)' in u: return 'Bilateral'
    if '(UNI)' in u: return 'Unilateral'
    return ''  # ATH+PLYO — don't guess laterality

wb = openpyxl.load_workbook(SRC, read_only=True, data_only=True)
out = {}
dupes = 0
for sheet in wb.sheetnames:
    ws = wb[sheet]
    it = ws.iter_rows(values_only=True)
    header = [str(c).strip() if c is not None else '' for c in next(it)]
    idx = {h: i for i, h in enumerate(header)}
    if 'Exercise Name' not in idx:
        continue
    lat = lat_of(sheet)
    for row in it:
        name = row[idx['Exercise Name']] if idx['Exercise Name'] < len(row) else None
        if not name or not str(name).strip():
            continue
        rec = {'name': str(name).strip(), 'sheet': sheet}
        for col, field in COLMAP.items():
            if col in idx and idx[col] < len(row):
                v = row[idx[col]]
                if v is not None and str(v).strip():
                    val = str(v).strip()
                    if field == 'resistanceType':
                        val = RES.get(val.upper(), val)
                    rec[field] = val
        if lat:
            rec['laterality'] = lat
        k = norm(name)
        if k in out:
            dupes += 1
            # keep the first; merge any fields the first lacked
            for f, v in rec.items():
                if f not in ('name', 'sheet') and f not in out[k]:
                    out[k][f] = v
        else:
            out[k] = rec

with open(OUT, 'w', encoding='utf-8') as f:
    json.dump(out, f, ensure_ascii=False, indent=0)
print('sheets:', wb.sheetnames)
print('unique names:', len(out), '| duplicate-name rows merged:', dupes)
# field-presence counts
from collections import Counter
c = Counter()
for r in out.values():
    for f in r:
        if f not in ('name', 'sheet'):
            c[f] += 1
print('field presence:', dict(c))
print('wrote', OUT)
