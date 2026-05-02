// Smart-import endpoint — Opus 4.7-powered ingest agent for ANY document.
//
// Supported inputs (handled by the frontend, all routed through the modes below):
//   • XLSX, XLS, ODS, CSV, TSV — parsed client-side via xlsx → AOA
//   • PDF — rendered to images client-side via pdfjs → vision-extract
//   • PNG, JPG, JPEG, WEBP — sent straight to vision-extract
//   • Plain-text/markdown tables — split client-side → AOA
//
// Modes:
//   { kind: 'plan',           workbookSummary: { sheets: [{ name, headers, sampleRows, totalRows }] } }
//     → returns { sheets: [{ name, target, confidence, why, estItems }], order, notes, warnings }
//   { kind: 'vision-extract', images: [{ mediaType, data }], target?, hint? }
//     → returns { sheets: [{ name, headers, rows, sample }], notes }
//       (turns image/PDF pages into the same AOA shape XLSX produces)
//   { kind: 'analyze',        target, headers, sampleRows, sheetName?, existingContext? }
//     → returns { mapping, structure, enumNormalizations, notes, warnings, confidence }
//   { kind: 'transform',      target, mapping, rows, enumNormalizations?, existingContext? }
//     → returns { items, errors, warnings }   (server-side schema-validates + auto-repairs)
//
// The endpoint also supports an injectable `existingContext` payload:
// the frontend reads current library + trainees from Supabase, sends a
// compact summary in, and the model uses it to dedupe / reuse / cross-
// reference. This is what pushes the agent past prompt-only IQ — it has
// real ground truth about what the coach already has.

const SCHEMAS = {
  exercises: {
    description: 'Exercise library entries — one row per exercise the coach uses with their athletes.',
    fields: {
      title: { type: 'string', required: true, hint: 'Exercise name. e.g. "BB Back Squat", "Tall-Kneeling DB OHP".' },
      videoLink: { type: 'url', required: false, hint: 'YouTube or other public video URL demonstrating the exercise.' },
      cues: { type: 'string', required: false, hint: 'Coaching cues / technique notes. Free text, often Hebrew or English.' },
      category: { type: 'enum', required: false, options: ['Chest','Back','Shoulders','Arms','Core','Legs','Glutes','Full Body','Olympic','Cardio','Other'] },
      resistanceType: { type: 'enum', required: false, options: ['Barbell','Dumbbell','Bodyweight','Machine','Cable','Band','Kettlebell','Medicine Ball','Landmine','TRX/Suspension','Other'] },
      bodyPosition: { type: 'enum', required: false, options: ['Standing','Seated','Supine','Prone','Kneeling','Half-Kneeling','Quadruped','Side-Lying','Hanging','Other'] },
      movementPattern: { type: 'enum', required: false, options: ['Horizontal Push','Horizontal Pull','Vertical Push','Vertical Pull','Hip Hinge','Squat','Lunge','Carry/Loaded Locomotion','Rotation/Anti-Rotation','Isolation','Olympic'] },
      laterality: { type: 'enum', required: false, options: ['Bilateral','Unilateral','Alternating'] },
      primaryMuscles: { type: 'string', required: false },
      secondaryMuscles: { type: 'string', required: false },
      notes: { type: 'string', required: false },
    },
  },
  athletes: {
    description: 'Trainees / athletes — one row per person the coach trains.',
    fields: {
      name: { type: 'string', required: true, hint: 'Full name. May be Hebrew or English.' },
      email: { type: 'email', required: false },
      phone: { type: 'string', required: false, hint: 'International format preferred but accept any.' },
      age: { type: 'number', required: false },
      weight: { type: 'number', required: false, hint: 'kg.' },
      height: { type: 'number', required: false, hint: 'cm.' },
      goals: { type: 'string', required: false },
      injuries: { type: 'string', required: false },
      notes: { type: 'string', required: false },
      status: { type: 'enum', required: false, options: ['Active','Paused','Archived'] },
      format: { type: 'enum', required: false, options: ['In-Person Private','In-Person Semi-Private','Remote','Hybrid'] },
      package: { type: 'string', required: false, hint: 'e.g. "8 Sessions", "Monthly Unlimited".' },
      sessionsRemaining: { type: 'number', required: false },
      monthlyPrice: { type: 'number', required: false, hint: 'NIS, pre-VAT.' },
      sessionPrice: { type: 'number', required: false, hint: 'NIS, pre-VAT.' },
      startDate: { type: 'date', required: false, hint: 'ISO YYYY-MM-DD preferred.' },
    },
  },
  programs: {
    description: 'A single training program (block). One sheet may contain multiple days; each day has multiple exercise rows.',
    fields: {
      programName: { type: 'string', required: false },
      days: { type: 'array', required: true, hint: 'Array of { name, exercises: [{ title, sets, reps, tempo, rest, notes, superset, wk: [w1,w2,...] }] }' },
    },
  },
};

const SYSTEM_PROMPT_PLAN = `You are EXPO's senior import strategist. A coach uploaded a multi-sheet workbook. For each sheet, decide what KIND of data it holds (exercises | athletes | programs | skip) and HOW confident you are.

Respond with strict JSON only:
{
  "sheets": [ { "name": "<sheet name>", "target": "exercises"|"athletes"|"programs"|"skip", "confidence": 0.0-1.0, "why": "<1 short line>", "estItems": <int> } ],
  "order": [ "<sheet name>", ... ],
  "notes": "<1-3 sentences on workbook structure, dependencies, or anything unusual>",
  "warnings": [ "<flag if a coach should review before commit>", ... ]
}

# Heuristics
- Headers like {Name, Phone, Email, Goal, Status, Package} → athletes
- Headers like {Title/Exercise, Video, Cues, Muscle, Equipment} OR a flat single-purpose list of exercise names → exercises
- Headers like {#, Exercise, Sets, Reps, Tempo, W1..W4} OR an obvious day structure ("Day 1", "Day A", "יום 1") → programs
- A sheet with mostly blank rows or only a title → skip
- Sheet name patterns: "Athletes", "Trainees", "מתאמנים" → athletes; "Exercises", "תרגילים" → exercises; "Block X", "בלוק X", "Week X" → programs
- "order": import order matters because programs depend on exercises (so exercises sheets first, then athletes, then programs)
- For each sheet, set estItems = best-guess number of rows that will produce a record after junk-filtering`;

const SYSTEM_PROMPT_ANALYZE = `You are EXPO's senior data-mapping engineer. Coaches upload sheets in every imaginable layout — Trainerize exports, hand-built Excel templates, Google Sheets with Hebrew headers, raw CSV from CRMs, drive-style training-block sheets with day separators. Your job: given column headers + sample rows + (optionally) a snapshot of what already exists in the coach's database, propose the SHARPEST possible mapping to the target schema.

Respond with strict JSON only. No prose, no markdown fences. The shape:
{
  "structure": {
    "headerRowIdx": <0-based index of the row that contains column headers>,
    "dataStartIdx": <0-based index of the first DATA row>,
    "dataEndIdx": <0-based index of the last DATA row, inclusive — or null if to-end-of-sheet>,
    "junkRowsHint": "<1-line description of which rows to skip mid-sheet, if any>"
  },
  "mapping": { "<targetField>": { "source": "<exact source header>" | null, "transform"?: "<1-line conversion hint>", "confidence": <0.0-1.0> } },
  "enumNormalizations": { "<targetField>": { "<sourceValue>": "<canonicalOption>", ... } },
  "notes": "<1-3 sentences>",
  "warnings": [ "<short flags coach should review>", ... ],
  "confidence": <overall 0.0-1.0>
}

# Reasoning protocol (silent — output only the JSON)
1. Look at the sample rows FIRST. Don't trust headers blindly — sometimes a "Name" column actually holds Phone.
2. If existingContext is provided (a snapshot of the coach's current data), USE it:
   - For exercises: prefer mapping to existing titles (return them in "warnings" as "X duplicates with existing library — will skip on commit").
   - For athletes: same — flag duplicate names.
   - For programs: cross-reference exercise titles to known library entries (helps the transform step).
3. For each target field, score every source column on (a) header match, (b) value plausibility, (c) uniqueness vs other candidates. Pick highest scorer or null.
4. For enum fields, look at the actual source values and propose normalizations: e.g. {"Active":"Active","אקטיבי":"Active","פעיל":"Active","ACTIVE":"Active"}. Only include keys that appear in samples.
5. Detect sheet anatomy: where headers are (often row 0, but sometimes row 2-3 after a title block), where data starts, where it ends (some sheets have totals/notes at bottom).

# Hebrew dictionary
שם / שם מלא = name · אימייל / מייל = email · טלפון / נייד = phone · גיל = age · משקל = weight · גובה = height · מטרה / מטרות = goals · פציעה / פציעות = injuries · הערות / הערה = notes · סטטוס / פעיל = status · פורמט / סוג = format · חבילה = package · פגישות שנותרו = sessionsRemaining · מחיר חודשי = monthlyPrice · מחיר פגישה = sessionPrice · תאריך התחלה = startDate · תרגיל / שם תרגיל = title · קישור / סרטון / וידאו = videoLink · רמזים / הוראות = cues · קטגוריה = category · יום / Day = day boundary · סטים / Sets = sets · חזרות / Reps = reps · קצב / Tempo = tempo · מנוחה / Rest = rest · גל / Week = wk[i]

# Rules
- Source column headers are matched case-insensitively but write the EXACT header you saw, including casing and Hebrew.
- "transform" is only filled when a non-trivial conversion is needed.
- Enum fields: ONLY map when source values can be normalized. Provide the normalizations explicitly in enumNormalizations.
- Don't invent. If no plausible source, set source: null with confidence: 0.

# Few-shot — bad sheet, good mapping (athletes)

HEADERS: ["#","Name","Mobile","Goal","Notes","Status"]
SAMPLE: [["1","יוסי כהן","050-1234567","להעלות מסה","שכם דואב","Active"],["2","Dana Levi","+972521112233","strength","",""]]

GOOD OUTPUT (abridged):
{
  "structure": { "headerRowIdx": 0, "dataStartIdx": 1, "dataEndIdx": null, "junkRowsHint": "none" },
  "mapping": {
    "name": { "source": "Name", "confidence": 0.99 },
    "phone": { "source": "Mobile", "transform": "normalize to +972 E.164", "confidence": 0.95 },
    "goals": { "source": "Goal", "confidence": 0.98 },
    "injuries": { "source": "Notes", "transform": "treat free-text as injuries; coach can split", "confidence": 0.6 },
    "status": { "source": "Status", "confidence": 0.95 }
  },
  "enumNormalizations": { "status": { "Active": "Active", "": null } },
  "notes": "Mobile column mixes 0-prefixed and +972; transform normalizes both. 'Notes' is overloaded — mapped to injuries since both sample rows describe physical issues.",
  "warnings": ["Empty Status on row 2 — will be left blank."],
  "confidence": 0.9
}`;

const SYSTEM_PROMPT_TRANSFORM = `You are EXPO's senior data-transformation engineer. Given (a) a target schema, (b) a column→field mapping the coach approved, (c) raw rows, and (d) optionally a snapshot of existing data in the coach's database, produce normalized records that fit the target schema EXACTLY.

Respond with strict JSON only. No prose, no markdown fences:
{
  "items": [ { ...targetSchemaShape }, ... ],
  "errors": [ { "rowIdx": <number>, "msg": "<short reason>" }, ... ],
  "warnings": [ "<short flag for the coach>", ... ]
}

# Reasoning protocol (silent — output only the JSON)
1. Walk rows in order. Classify each: header, blank, separator, day-introducer, exercise/data, junk.
2. Apply the mapping + per-field "transform" hint + enumNormalizations.
3. Coerce types: numbers → numbers (strip "kg", "lbs", "₪"), dates → ISO YYYY-MM-DD (auto-detect DD/MM vs MM/DD by checking samples — if any cell has day>12, that side is days), enums → exact option string, booleans → true/false.
4. If existingContext is provided, use it to AVOID duplicating obvious matches — but DO emit them in items[]. The frontend handles dedup on commit.
5. Self-critique pass: scan your "items" for missing required fields, duplicate names, suspicious values; push concerns to "warnings".

# Rules
- One item per source row in the same order, EXCEPT for "programs" where you group by day (see below).
- Skip header/blank/separator/junk rows silently. Don't invent values. Empty source = empty target field.
- Strip whitespace, normalize quotes, but preserve Hebrew vs English exactly.
- Phone numbers: if Israeli (starts 0 or +972), normalize to +972XXXXXXXXX. Otherwise leave as-is.
- If a row is malformed, push to errors[] with rowIdx and short reason; never block the batch.

# PROGRAMS — special structure
Output one item: { "programName": "<from sheet name or top-row title>", "days": [ { "name": "<day label>", "exercises": [ {...} ] } ] }

Day-introducer detection (any of):
- Row where col-A is "Day"/"DAY"/"יום"/"Day 1"/"Day A" (case-insensitive)
- A merged-cell title row with only "Day X" / "DAY X"
- A row whose only non-empty cell starts with "Day"/"יום"
- An empty row followed by such a row

Exercise row shape:
{ "title": "<name>", "sets": <number|string>, "reps": "<string>", "tempo": "<string|null>", "rest": "<string|null>", "notes": "<string|null>", "superset": "<'A'|'B'|null>", "wk": ["<w1>","<w2>",...] | null }

Superset detection:
- Row #s "3a","3b","3c" → consecutive same-letter group: 3a→A,3b→A,4→null,5a→B,5b→B
- Or explicit "Superset"/"Group" column

Wave logs: columns "W1","W2","W3","W4" or "Week 1"…"Week 4" → wk: [w1,w2,...]

Set-rep notation in single cell ("3x10","5x5 @ RPE 8"):
- "3x10" → sets:3, reps:"10" · "3x10-12" → sets:3, reps:"10-12" · "AMRAP" → sets:1, reps:"AMRAP"
- When uncertain, leave verbatim in reps and put sets:3.`;

const SYSTEM_PROMPT_REPAIR = `You are EXPO's data-repair engineer. The previous transform pass produced items that failed schema validation. Fix each broken item to satisfy the schema. Strict JSON only:
{
  "fixed": [ { ...targetSchemaShape }, ... ],
  "stillBroken": [ { "itemIdx": <number>, "msg": "<short reason>" }, ... ]
}

For each broken item, look at the schemaErrors message and apply the minimal targeted fix. Don't restructure the whole record. If you can't fix without inventing, push to stillBroken.`;

const SYSTEM_PROMPT_VISION = `You are EXPO's senior document-OCR + extraction engineer. Coaches send any kind of document — handwritten training-block PDFs, screenshots of Google Sheets, photos of paper notebooks, exported reports. Your job: read the image(s) and turn the data into a CLEAN tabular AOA (array-of-arrays) — exactly the shape a parsed XLSX sheet would produce.

Respond with strict JSON only. No prose, no markdown fences:
{
  "sheets": [
    {
      "name": "<short label inferred from page header / sheet title / 'Page N'>",
      "headers": [ "<colA header>", "<colB header>", ... ],
      "rows": [ [ <cellA>, <cellB>, ... ], ... ],
      "sample": [ ... ],            // first 4 rows (subset of rows[])
      "guessedTarget": "exercises"|"athletes"|"programs"|"unknown",
      "guessedTargetConfidence": 0.0-1.0
    }
  ],
  "notes": "<2-4 sentences on document type, language, layout quirks, anything ambiguous>"
}

# Rules
- ONE sheet per logical table. If a single page has two stacked tables (e.g. Day 1 and Day 2 in a training-block PDF), output ONE sheet that includes both — keep the day-introducer rows so the analyze/transform step can detect them.
- For a multi-page PDF where each page is the same table continued, MERGE into one sheet (same headers, rows concatenated). For multi-page PDFs with DIFFERENT tables per page, output one sheet per page.
- Headers: pick the row that holds the column labels. If there are no clear headers (e.g. handwritten notes), invent them ("col1","col2",…) — the next stage can rename.
- Read Hebrew correctly (RTL text, מ-ם final-letter forms, vowel marks). Preserve the exact spelling.
- For handwritten exercise titles: transcribe verbatim, even if you suspect a typo. Don't auto-correct ("FFESS" stays "FFESS").
- For numeric cells: read the digits as written; don't reformat (e.g. "3 SETS x 5 REPS" stays as-is).
- Skip purely decorative rows (color bars, blank separators), but KEEP day-introducer rows like "Day 1", "ימי מנוחה 2-3".
- If you can't read a cell with confidence, output "?" so the coach catches it on review.
- "guessedTarget": classify by structural signals — list of names+phones → athletes; list of exercise names+videos → exercises; numbered exercise rows under "Day X" headers → programs; otherwise unknown.

# Few-shot example
Image shows: Hebrew handwritten EXPO training block with two days, each numbered 1, 2, 3, 4, 5, 6a, 6b, 7a, 7b in the leftmost column and exercise names in the next column.
GOOD OUTPUT (abridged):
{
  "sheets": [{
    "name": "Block #25",
    "headers": ["#", "Exercise"],
    "rows": [
      ["Day 1", ""],
      ["1", "Standing Rotational OHP MED-Ball Slam"],
      ["2", "Standing Rotational OHP MED-Ball Fake-Slam"],
      ...
      ["Day 2", ""],
      ["1", "FFESS to Standing to Lunge POGO Jump"],
      ...
    ],
    "sample": [["Day 1",""],["1","Standing Rotational OHP MED-Ball Slam"],["2","Standing Rotational OHP MED-Ball Fake-Slam"],["3","Hand-Assisted Unilateral DB Shrimp Squat"]],
    "guessedTarget": "programs",
    "guessedTargetConfidence": 0.95
  }],
  "notes": "Handwritten 1-page program with Day 1 / Day 2 sections. Numbers like 6a/6b indicate supersets — flagged in the analyze step."
}`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' }); return;
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'Smart-import not configured (ANTHROPIC_API_KEY missing).' }); return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { res.status(400).json({ error: 'Bad JSON' }); return; }
  }
  const kind = body?.kind;

  try {
    if (kind === 'vision-extract') {
      const images = Array.isArray(body?.images) ? body.images.slice(0, 12) : [];
      if (images.length === 0) { res.status(400).json({ error: 'images[] required' }); return; }
      const hint = String(body?.hint || '').slice(0, 500);
      const targetHint = body?.target ? `Best-guess target type per the coach: ${body.target}.` : '';
      const userText = `Extract a clean tabular AOA from the attached image(s). ${targetHint} ${hint}\n\nStrict JSON only.`;
      // Validate + normalize image entries (data may already be base64).
      const content = [];
      for (const img of images) {
        const mediaType = String(img.mediaType || 'image/png');
        const data = String(img.data || '');
        if (!data) continue;
        content.push({
          type: 'image',
          source: { type: 'base64', media_type: mediaType, data },
        });
      }
      content.push({ type: 'text', text: userText });
      const result = await anthropicJsonVision({ apiKey, system: SYSTEM_PROMPT_VISION, content, maxTokens: 6000 });
      res.status(200).json(result);
      return;
    }

    if (kind === 'plan') {
      const ws = body?.workbookSummary;
      if (!ws?.sheets?.length) { res.status(400).json({ error: 'workbookSummary.sheets[] required' }); return; }
      const summary = {
        sheets: ws.sheets.slice(0, 30).map(s => ({
          name: String(s.name || '').slice(0, 200),
          headers: (s.headers || []).slice(0, 30),
          sampleRows: (s.sampleRows || []).slice(0, 4),
          totalRows: s.totalRows || 0,
        })),
      };
      const userPrompt = `WORKBOOK:\n${JSON.stringify(summary, null, 2)}\n\nClassify each sheet. Strict JSON only.`;
      const result = await anthropicJson({ apiKey, system: SYSTEM_PROMPT_PLAN, userPrompt, maxTokens: 1500 });
      res.status(200).json(result);
      return;
    }

    const target = body?.target;
    if (!['exercises','athletes','programs'].includes(target)) {
      res.status(400).json({ error: 'target must be one of: exercises | athletes | programs' }); return;
    }
    const schema = SCHEMAS[target];

    if (kind === 'analyze') {
      const headers = Array.isArray(body?.headers) ? body.headers.slice(0, 60) : [];
      const sampleRows = Array.isArray(body?.sampleRows) ? body.sampleRows.slice(0, 8) : [];
      const sheetName = String(body?.sheetName || '').slice(0, 200);
      const existingContext = compactContext(body?.existingContext, target);
      if (headers.length === 0) { res.status(400).json({ error: 'headers[] required' }); return; }
      const userPrompt = `TARGET: ${target}
DESCRIPTION: ${schema.description}
FIELDS:
${JSON.stringify(schema.fields, null, 2)}

SHEET NAME: ${sheetName || '(unnamed)'}
HEADERS: ${JSON.stringify(headers)}
SAMPLE ROWS (each row is an array aligned to HEADERS):
${JSON.stringify(sampleRows, null, 2)}
${existingContext ? `\nEXISTING DATA SNAPSHOT (use to avoid duplicates / cross-reference):\n${existingContext}\n` : ''}
Propose the mapping + structure + enumNormalizations per the rules. Strict JSON only.`;
      const result = await anthropicJson({ apiKey, system: SYSTEM_PROMPT_ANALYZE, userPrompt, maxTokens: 2500 });
      res.status(200).json(result);
      return;
    }

    if (kind === 'transform') {
      const mapping = body?.mapping;
      const enumNormalizations = body?.enumNormalizations || {};
      const rows = Array.isArray(body?.rows) ? body.rows.slice(0, 200) : [];
      const existingContext = compactContext(body?.existingContext, target);
      if (!mapping || typeof mapping !== 'object') { res.status(400).json({ error: 'mapping required' }); return; }
      const userPrompt = `TARGET: ${target}
DESCRIPTION: ${schema.description}
FIELDS:
${JSON.stringify(schema.fields, null, 2)}

MAPPING (target field → source column header):
${JSON.stringify(mapping, null, 2)}

ENUM NORMALIZATIONS:
${JSON.stringify(enumNormalizations, null, 2)}

ROWS (each row is { headerName: cellValue }):
${JSON.stringify(rows, null, 2)}
${existingContext ? `\nEXISTING DATA SNAPSHOT (use for cross-reference; frontend dedupes on commit):\n${existingContext}\n` : ''}
Produce normalized items. Strict JSON only.`;
      const result = await anthropicJson({ apiKey, system: SYSTEM_PROMPT_TRANSFORM, userPrompt, maxTokens: 6000 });

      // Server-side schema validation. If anything is broken, run a repair pass.
      const items = Array.isArray(result?.items) ? result.items : [];
      const validated = items.map(item => ({ item, errors: validateAgainstSchema(item, target, schema) }));
      const broken = validated.filter(v => v.errors.length > 0);
      if (broken.length > 0 && broken.length < items.length) {
        // Targeted repair only for the broken subset.
        try {
          const repairUser = `TARGET: ${target}
SCHEMA FIELDS:
${JSON.stringify(schema.fields, null, 2)}

BAD ITEMS (with their schema errors):
${JSON.stringify(broken.slice(0, 50), null, 2)}

Fix each. Strict JSON only.`;
          const fix = await anthropicJson({ apiKey, system: SYSTEM_PROMPT_REPAIR, userPrompt: repairUser, maxTokens: 4000 });
          const fixedArr = Array.isArray(fix?.fixed) ? fix.fixed : [];
          let fi = 0;
          for (const v of validated) {
            if (v.errors.length === 0) continue;
            if (fi < fixedArr.length) { v.item = fixedArr[fi]; v.errors = validateAgainstSchema(fixedArr[fi], target, schema); }
            fi++;
          }
          if (Array.isArray(fix?.stillBroken)) {
            for (const sb of fix.stillBroken) {
              result.errors = result.errors || [];
              result.errors.push({ rowIdx: sb.itemIdx, msg: `repair-failed: ${sb.msg}` });
            }
          }
          result.items = validated.map(v => v.item);
          result.warnings = (result.warnings || []).concat([`Auto-repaired ${fixedArr.length} item(s) that failed initial schema check.`]);
        } catch (e) {
          result.warnings = (result.warnings || []).concat([`Repair pass failed: ${e.message}`]);
        }
      }
      res.status(200).json(result);
      return;
    }

    res.status(400).json({ error: 'kind must be one of: plan | vision-extract | analyze | transform' });
  } catch (e) {
    console.error('smart-import error', e);
    res.status(500).json({ error: e?.message || 'smart-import failed' });
  }
}

function compactContext(ctx, target) {
  if (!ctx || typeof ctx !== 'object') return null;
  // Truncate aggressively so the prompt stays cheap; the model only needs
  // representative examples to ground itself, not exhaustive lists.
  if (target === 'exercises') {
    const titles = Array.isArray(ctx.exerciseTitles) ? ctx.exerciseTitles.slice(0, 200) : [];
    return `EXISTING EXERCISE TITLES (${titles.length} sampled): ${JSON.stringify(titles)}`;
  }
  if (target === 'athletes') {
    const names = Array.isArray(ctx.athleteNames) ? ctx.athleteNames.slice(0, 100) : [];
    return `EXISTING ATHLETE NAMES (${names.length} sampled): ${JSON.stringify(names)}`;
  }
  if (target === 'programs') {
    const titles = Array.isArray(ctx.exerciseTitles) ? ctx.exerciseTitles.slice(0, 200) : [];
    const dayNames = Array.isArray(ctx.commonDayNames) ? ctx.commonDayNames.slice(0, 20) : [];
    return `EXISTING EXERCISE TITLES (${titles.length} sampled): ${JSON.stringify(titles)}\nCOMMON DAY NAMES IN PRIOR PROGRAMS: ${JSON.stringify(dayNames)}`;
  }
  return null;
}

// Lightweight schema validator. Returns array of error strings; empty = valid.
function validateAgainstSchema(item, target, schema) {
  const errs = [];
  if (!item || typeof item !== 'object') return ['not-object'];
  // Programs: validate the nested days/exercises shape
  if (target === 'programs') {
    if (!Array.isArray(item.days)) errs.push('days must be array');
    else {
      for (const d of item.days) {
        if (!d || typeof d !== 'object') { errs.push('day must be object'); continue; }
        if (typeof d.name !== 'string' || !d.name.trim()) errs.push('day.name required');
        if (!Array.isArray(d.exercises)) errs.push('day.exercises must be array');
        else {
          for (const ex of d.exercises) {
            if (!ex || typeof ex !== 'object') { errs.push('exercise must be object'); continue; }
            if (typeof ex.title !== 'string' || !ex.title.trim()) errs.push('exercise.title required');
            if (ex.sets !== undefined && ex.sets !== null && typeof ex.sets !== 'number' && typeof ex.sets !== 'string') errs.push('exercise.sets bad type');
            if (ex.wk !== undefined && ex.wk !== null && !Array.isArray(ex.wk)) errs.push('exercise.wk must be array or null');
          }
        }
      }
    }
    return errs;
  }
  // Flat schemas (exercises / athletes)
  for (const [field, def] of Object.entries(schema.fields)) {
    const v = item[field];
    if (def.required && (v === undefined || v === null || v === '')) errs.push(`required: ${field}`);
    if (v === undefined || v === null || v === '') continue;
    if (def.type === 'number' && typeof v !== 'number' && Number.isNaN(parseFloat(v))) errs.push(`${field} must be number, got: ${typeof v}`);
    if (def.type === 'enum' && def.options && !def.options.includes(v)) errs.push(`${field} not in allowed options (got "${v}")`);
    if (def.type === 'date' && typeof v === 'string' && !/^\d{4}-\d{2}-\d{2}/.test(v)) errs.push(`${field} not ISO date: "${v}"`);
    if (def.type === 'email' && typeof v === 'string' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) errs.push(`${field} not valid email: "${v}"`);
    if (def.type === 'url' && typeof v === 'string' && v.length > 0 && !/^https?:\/\//.test(v)) errs.push(`${field} not http(s) url: "${v}"`);
  }
  return errs;
}

async function anthropicJson({ apiKey, system, userPrompt, maxTokens }) {
  // Opus 4.7 with prompt caching on the long system prompt.
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-7',
      max_tokens: maxTokens,
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    throw new Error(`anthropic ${r.status}: ${txt.slice(0, 300)}`);
  }
  const j = await r.json();
  const text = j?.content?.[0]?.text || '';
  const parsed = parseLooseJson(text);
  if (!parsed) throw new Error(`Model returned non-JSON: ${text.slice(0, 400)}`);
  return parsed;
}

// Vision variant: same model + prompt caching, but accepts a content array
// of mixed image + text blocks. Used for PDF page renderings and direct
// image uploads (screenshots, photos of paper notebooks).
async function anthropicJsonVision({ apiKey, system, content, maxTokens }) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-7',
      max_tokens: maxTokens,
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content }],
    }),
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    throw new Error(`anthropic ${r.status}: ${txt.slice(0, 300)}`);
  }
  const j = await r.json();
  const text = j?.content?.[0]?.text || '';
  const parsed = parseLooseJson(text);
  if (!parsed) throw new Error(`Vision returned non-JSON: ${text.slice(0, 400)}`);
  return parsed;
}

function parseLooseJson(text) {
  if (!text) return null;
  const candidates = [
    text,
    text.replace(/^```json\s*|^```\s*|\s*```$/gm, '').trim(),
    (text.match(/\{[\s\S]*\}/) || [null])[0],
  ].filter(Boolean);
  for (const c of candidates) {
    try { return JSON.parse(c); } catch {}
  }
  return null;
}
