// Smart-import endpoint — uses Claude to map an arbitrary spreadsheet to one
// of EXPO's three target schemas (exercises | athletes | programs). The coach
// uploads any sheet shape; the model proposes a column → field mapping plus a
// row-level transform plan. The frontend then previews + commits.
//
// Two modes:
//   { kind: 'analyze', target, headers, sampleRows, sheetName? }
//     → returns { mapping: { fieldName: { source: 'colHeader' | null, transform?: '...' } }, notes: string }
//   { kind: 'transform', target, mapping, rows }
//     → returns { items: [{...targetSchemaShape}], errors: [{rowIdx, msg}] }
//
// Both modes share the same Anthropic key + model. Cost-bounded: one analyze
// call per sheet (~1k input + 500 output tokens), one transform call per
// chunked batch of rows.

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
    description: 'A single training program (block). One sheet may contain multiple days; each day has multiple exercise rows. Rows like "Day 1", "DAY A", or any cell starting with "Day"/"יום" introduce a new day. Exercise rows have a number/letter (1, 2, 3a, 3b…) in column A and exercise name in column B. Sets typically in a column called "Sets" or "S", reps in "Reps" or "R", tempo, rest, notes, week-by-week wave logs.',
    fields: {
      programName: { type: 'string', required: false, hint: 'The block / program name. Often the sheet name or a top-row title.' },
      days: { type: 'array', required: true, hint: 'Array of { name, exercises: [{ title, sets, reps, tempo, rest, notes, superset, wk: [w1,w2,...] }] }' },
    },
  },
};

const SYSTEM_PROMPT_ANALYZE = `You are EXPO's senior data-mapping engineer. Coaches upload sheets in every imaginable layout — Trainerize exports, hand-built Excel templates, Google Sheets with Hebrew headers, raw CSV from CRMs, drive-style training-block sheets with day separators. Your job: given column headers + sample rows, propose the SHARPEST possible mapping to the target schema.

Respond with strict JSON only. No prose, no markdown fences. The shape:
{
  "mapping": { "<targetField>": { "source": "<exact source header>" | null, "transform"?: "<1-line conversion hint>", "confidence": <0.0-1.0> } },
  "notes": "<1-3 sentences: any ambiguity, unusual structure, or fields you intentionally left null and why>",
  "warnings": [ "<short flag a coach should review before commit>", ... ],
  "confidence": <overall 0.0-1.0>
}

# Reasoning protocol (silent — output only the JSON)
1. Skim the sample rows first; the headers may lie about what's actually in the cells.
2. For each target field, score every source column on (a) header match, (b) value plausibility, (c) uniqueness vs other candidates. Pick the highest scorer or null.
3. If two source columns both fit one target, pick the one with cleaner data and flag the other in "warnings".
4. If a single source column carries multiple targets (e.g. "Name | Phone" packed in one cell), use "transform" to describe the split.

# Hebrew dictionary (recognize and map)
שם / שם מלא = name · אימייל / מייל = email · טלפון / נייד = phone · גיל = age · משקל = weight · גובה = height · מטרה / מטרות = goals · פציעה / פציעות = injuries · הערות / הערה = notes · סטטוס / פעיל = status · פורמט / סוג = format · חבילה = package · פגישות שנותרו = sessionsRemaining · מחיר חודשי = monthlyPrice · מחיר פגישה = sessionPrice · תאריך התחלה = startDate · תרגיל / שם תרגיל = title · קישור / סרטון / וידאו = videoLink · רמזים / הוראות = cues · קטגוריה = category · יום / Day = day boundary · סטים / Sets = sets · חזרות / Reps = reps · קצב / Tempo = tempo · מנוחה / Rest = rest · גל / Week = wk[i]

# Rules
- Source column headers are matched case-insensitively but write the EXACT header you saw, including casing and Hebrew.
- "transform" is only filled when a non-trivial conversion is needed (e.g. "split first+last from one cell", "convert lbs→kg via *0.4536", "parse '3x10' → sets:3, reps:'10'", "DD/MM/YYYY → ISO YYYY-MM-DD").
- Enum fields: only map when source values map cleanly to allowed options (case-insensitive match or obvious synonym). Otherwise null + warning.
- For "programs": the structure is hierarchical, so the mapping describes per-row column meanings (which column holds the order #, exercise name, sets, reps, tempo, rest, notes, week-1 load, week-2 load…). Day boundaries are detected later in transform; describe the day-row pattern you observed in "notes".
- Don't invent. If a target field has no plausible source, set source: null with confidence: 0.

# Few-shot — bad sheet, good mapping

HEADERS: ["#","Name","Mobile","Goal","Notes","Status"]
SAMPLE: [["1","יוסי כהן","050-1234567","להעלות מסה","שכם דואב","Active"],["2","Dana Levi","+972521112233","strength","",""]]
TARGET: athletes
GOOD OUTPUT (abridged):
{
  "mapping": {
    "name": { "source": "Name", "confidence": 0.99 },
    "phone": { "source": "Mobile", "transform": "normalize to E.164 (+972…)", "confidence": 0.95 },
    "goals": { "source": "Goal", "confidence": 0.98 },
    "injuries": { "source": "Notes", "transform": "treat free-text as injuries; coach can split later", "confidence": 0.6 },
    "status": { "source": "Status", "confidence": 0.95 },
    "email": { "source": null, "confidence": 0 },
    ...
  },
  "notes": "Mobile column mixes 0-prefixed local and +972 international; transform normalizes both. 'Notes' is overloaded — mapped to injuries since both sample rows describe physical issues.",
  "warnings": ["Empty Status on row 2 — treat as Active or leave blank?"],
  "confidence": 0.85
}`;

const SYSTEM_PROMPT_TRANSFORM = `You are EXPO's senior data-transformation engineer. Given (a) a target schema, (b) a column→field mapping the coach approved, and (c) raw rows, produce normalized records that fit the target schema EXACTLY.

Respond with strict JSON only. No prose, no markdown fences. The shape:
{
  "items": [ { ...targetSchemaShape }, ... ],
  "errors": [ { "rowIdx": <number>, "msg": "<short reason>" }, ... ],
  "warnings": [ "<short flag for the coach>", ... ]
}

# Reasoning protocol (silent — output only the JSON)
1. Walk rows in order. For each row, classify it: header, blank, separator, day-introducer, exercise/data, or junk.
2. Apply the mapping. Apply each "transform" hint from the mapping when present.
3. Coerce types: numbers → numbers (strip "kg", "lbs", "₪"), dates → ISO YYYY-MM-DD, enums → exact option string (case-insensitive match, else null + warning), booleans → true/false.
4. Self-critique pass: scan your "items" array. Are any required fields empty? Any duplicate names that should have merged? Push concerns to "warnings".

# Rules
- One item per source row in the same order, EXCEPT for "programs" where you group by day (see below). Skip header/blank/separator rows silently.
- Don't invent values. Empty source = empty target field.
- Strip trailing whitespace, collapse multiple spaces, normalize curly quotes to straight, but preserve Hebrew vs English exactly.
- If a row is malformed, push to errors[] with rowIdx and a short reason; skip it — never block the batch.

# PROGRAMS — special structure
Output shape: { "programName": "<from sheet name or top-row title>", "days": [ { "name": "<day label>", "exercises": [ {...} ] } ] }

Day-introducer detection (any of):
- A row where col-A is "Day", "DAY", "יום", "Day 1", "Day A" (case-insensitive)
- A merged-cell title row that contains only "Day X" or "DAY X"
- A row whose only non-empty cell starts with "Day" / "יום"
- An empty row followed by a row matching the above

Exercise row shape:
{ "title": "<exercise name>", "sets": <number|string>, "reps": "<string, e.g. '8-12', '5', '20 SEC'>", "tempo": "<string|null>", "rest": "<string|null>", "notes": "<string|null>", "superset": "<'A'|'B'|null>", "wk": ["<w1>","<w2>",...] | null }

Superset detection:
- Row #s like "3a", "3b", "3c" → superset, set superset='A' on the FIRST row of the supergroup, then 'B' on the next, etc., with the convention that consecutive same letter = grouped. So "3a"→A, "3b"→A, "4"→null, "5a"→B, "5b"→B.
- Or column "Superset"/"Group" with explicit values.

Wave logs (per-week loads):
- If columns "W1","W2","W3","W4" or "Week 1"…"Week 4" exist with values per row, populate wk: [w1,w2,w3,w4]. Strings allowed (e.g. "5x100kg", "3x110kg+").

Set-rep notation in a single cell ("3x10", "5x5 @ RPE 8"):
- Parse "3x10" → sets:3, reps:"10". "3x10-12" → sets:3, reps:"10-12". "AMRAP" → sets:1, reps:"AMRAP". When uncertain, leave the cell verbatim in reps and put sets to 3.

Drop common junk rows: empty rows, "Total" / "Notes:" footer rows, week-summary rows with no exercise.

# Few-shot — programs

INPUT MAPPING (abbreviated): { rowOrder: "#", title: "Exercise", sets: "S", reps: "R", tempo: "Tempo", notes: "Notes", weekCols: ["W1","W2","W3","W4"] }
ROWS:
[ { "#": "Day 1", "Exercise": "", ... },
  { "#": "1", "Exercise": "BB Back Squat", "S": "4", "R": "5", "Tempo": "3-1-1", "W1": "100kg", "W2": "105kg" },
  { "#": "2a", "Exercise": "DB Bench Press", "S": "3", "R": "8" },
  { "#": "2b", "Exercise": "Cable Row", "S": "3", "R": "10" },
  { "#": "Day 2", "Exercise": "", ... },
  { "#": "1", "Exercise": "Trap-Bar DL", "S": "5", "R": "3" } ]

GOOD OUTPUT (abridged):
{
  "items": [{
    "programName": "Block #25",
    "days": [
      { "name": "Day 1", "exercises": [
        { "title": "BB Back Squat", "sets": 4, "reps": "5", "tempo": "3-1-1", "wk": ["100kg","105kg"] },
        { "title": "DB Bench Press", "sets": 3, "reps": "8", "superset": "A" },
        { "title": "Cable Row", "sets": 3, "reps": "10", "superset": "A" }
      ]},
      { "name": "Day 2", "exercises": [
        { "title": "Trap-Bar DL", "sets": 5, "reps": "3" }
      ]}
    ]
  }],
  "errors": [],
  "warnings": ["W3 + W4 columns empty for all rows — block may be 2-week start, not full 4."]
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
  const target = body?.target;
  if (!['exercises','athletes','programs'].includes(target)) {
    res.status(400).json({ error: 'target must be one of: exercises | athletes | programs' }); return;
  }
  const schema = SCHEMAS[target];

  try {
    if (kind === 'analyze') {
      const headers = Array.isArray(body?.headers) ? body.headers.slice(0, 60) : [];
      const sampleRows = Array.isArray(body?.sampleRows) ? body.sampleRows.slice(0, 8) : [];
      const sheetName = String(body?.sheetName || '').slice(0, 200);
      if (headers.length === 0) {
        res.status(400).json({ error: 'headers[] required' }); return;
      }
      const userPrompt = `TARGET SCHEMA: ${target}
Description: ${schema.description}
Fields:
${JSON.stringify(schema.fields, null, 2)}

SHEET NAME: ${sheetName || '(unnamed)'}
HEADERS: ${JSON.stringify(headers)}
SAMPLE ROWS (each row is an array aligned to HEADERS):
${JSON.stringify(sampleRows, null, 2)}

Propose the mapping per the rules. Strict JSON only.`;

      const result = await anthropicJson({
        apiKey,
        system: SYSTEM_PROMPT_ANALYZE,
        userPrompt,
        maxTokens: 1200,
      });
      res.status(200).json(result);
      return;
    }

    if (kind === 'transform') {
      const mapping = body?.mapping;
      const rows = Array.isArray(body?.rows) ? body.rows.slice(0, 200) : [];
      if (!mapping || typeof mapping !== 'object') {
        res.status(400).json({ error: 'mapping required' }); return;
      }
      const userPrompt = `TARGET SCHEMA: ${target}
Description: ${schema.description}
Fields:
${JSON.stringify(schema.fields, null, 2)}

MAPPING (target field → source column header):
${JSON.stringify(mapping, null, 2)}

ROWS (each row is { headerName: cellValue }):
${JSON.stringify(rows, null, 2)}

Produce normalized items. Strict JSON only.`;

      const result = await anthropicJson({
        apiKey,
        system: SYSTEM_PROMPT_TRANSFORM,
        userPrompt,
        maxTokens: 4000,
      });
      res.status(200).json(result);
      return;
    }

    res.status(400).json({ error: 'kind must be one of: analyze | transform' });
  } catch (e) {
    console.error('smart-import error', e);
    res.status(500).json({ error: e?.message || 'smart-import failed' });
  }
}

async function anthropicJson({ apiKey, system, userPrompt, maxTokens }) {
  // Opus 4.7 for the smart-importer — this is a one-shot, accuracy-critical
  // path (a coach uploading their athlete book), not a chatty UI. The
  // marginal cost is ~10x Sonnet but mapping precision matters more than
  // per-call cost when the alternative is a bad import the coach has to
  // unwind. With prompt caching the system tokens are amortized.
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

// Robust JSON parser — Opus rarely wraps in fences, but if it does or adds
// a stray prose line, try a few fallbacks before giving up.
function parseLooseJson(text) {
  if (!text) return null;
  const candidates = [
    text,
    text.replace(/^```json\s*|^```\s*|\s*```$/gm, '').trim(),
    // Extract the first {...} block.
    (text.match(/\{[\s\S]*\}/) || [null])[0],
  ].filter(Boolean);
  for (const c of candidates) {
    try { return JSON.parse(c); } catch {}
  }
  return null;
}
