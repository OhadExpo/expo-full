// Import Nadav Blachar Block #4 ("Nadav Blachar - Training Program.xlsx",
// sheet "Block #4"). 24 exercises across 3 days (8/8/8) + a 3-item
// warm-up. Column D ("Vid") of each exercise row carries a YouTube
// hyperlink — sheet_to_json hides those, so we parse cell.l.Target
// directly and apply each per-exercise videoUrl override. Same shape
// as scripts/import-omer-block8.cjs.
//
// Run:
//   node scripts/import-nadav-block4.cjs        # dry-run with match report
//   node scripts/import-nadav-block4.cjs apply  # writes the plan row

const path = require('path');
const crypto = require('crypto');
const XLSX = require('xlsx');
const { createClient } = require('@supabase/supabase-js');

const SUPA_URL = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const SUPA_KEY = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';
const TRAINER_EMAIL = 'ohadyproductions@gmail.com';
const TRAINER_PASSWORD = '1234';

const TRAINEE_ID = 'tr_nadav';
const PLAN_NAME = 'Block #4';
const SHEET_NAME = 'Block #4';
const SOURCE_XLSX = 'Nadav Blachar - Training Program.xlsx';

const APPLY = process.argv[2] === 'apply';
const uid = (prefix = '') => prefix + crypto.randomBytes(6).toString('hex') + Date.now().toString(36).slice(-4);

// Rest rule, transcribed verbatim from the xlsx Instructions row:
//   "BB Exercises + Chinups > Rest: 2:00–3:30 MIN"
//   "Everything Else      > Rest: 1:30–2:30 MIN"
// Trap-Bar variants are barbell-class; included in the BB bucket.
const restFor = (title) => {
  const t = title.toLowerCase();
  if (
    t.startsWith('bb ') || t.includes(' bb ') || t.startsWith('bb/') ||
    t.startsWith('trap bar ') || t.includes(' trap bar ') ||
    t.startsWith('trap-bar ') || t.includes(' trap-bar ') ||
    t.includes('chin-up') || t.includes('chinup') || t.includes('pull-up') || t === 'pull-up'
  ) return '180';
  return '120';
};

// ----- step 1: parse the xlsx (titles + tempo + sets/reps + col-D URL) -----

function readBlock() {
  const wb = XLSX.readFile(path.join(__dirname, '..', SOURCE_XLSX));
  const ws = wb.Sheets[SHEET_NAME];
  if (!ws) throw new Error(`sheet "${SHEET_NAME}" not found`);
  const range = XLSX.utils.decode_range(ws['!ref']);
  const cell = (r, c) => ws[XLSX.utils.encode_cell({ r, c })];
  const cellStr = (r, c) => String(cell(r, c)?.v ?? '').trim();
  const cellLink = (r, c) => cell(r, c)?.l?.Target || '';

  const days = [];        // [{ name, exercises: [{title, sets, reps, tempo, url}] }]
  const warmup = [];      // [{ t, rx, vid }]
  let currentDay = null;
  let inWarmup = false;

  for (let r = range.s.r; r <= range.e.r; r++) {
    const a = cellStr(r, 0);
    const b = cellStr(r, 1);
    const d = cellStr(r, 3);
    const dLink = cellLink(r, 3);
    const e = cellStr(r, 4);

    // Warm-up row pattern: col D has "<title> (<rx>)" text and a hyperlink.
    // Heuristic: the "Warm-Up" header sits in row 1 (col D), so subsequent
    // rows whose col-D contains a non-numeric label are warm-up entries
    // until we hit the first "Day X" header row.
    if (b === '' && /Warm-Up/i.test(cellStr(r, 3)) && cellStr(r, 0) === 'Instructions') continue;
    if (currentDay === null && d && !/^\d+[ab]?$/i.test(d) && !/^Day [A-Z]/.test(d) && !/Vid|VID/i.test(d) && !/Rest|Off/i.test(d)) {
      // Warm-up row. Format: "Title (Rx)" — split on the last "(".
      const m = d.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
      const t = m ? m[1].trim() : d.trim();
      const rx = m ? m[2].trim() : '';
      warmup.push({ t, rx, vid: dLink });
      continue;
    }

    // "Day X" header row.
    if (/^Day [A-Z]$/i.test(b)) {
      currentDay = { name: b.replace(/^d/, 'D'), exercises: [] };
      days.push(currentDay);
      continue;
    }

    // Exercise row: col-A is a number (1..N) and col-B has the title.
    if (currentDay && /^\d+[ab]?$/.test(a) && b) {
      currentDay.exercises.push({
        idx: a,                                  // raw "1" / "6a" / "6b"
        title: b,
        url: dLink,
        tempo: cellStr(r, 4),                    // col E
        sets: cellStr(r, 5),                     // col F
        reps: cellStr(r, 6),                     // col G
      });
    }
  }
  return { warmup, days };
}

// ----- step 2: title matching against the library ------------------------

const PHRASES = [
  [/\bpro[-\/]ret\b/gi, 'protraction retraction'],
];

const norm = (s) => {
  let out = String(s || '').toLowerCase().replace(/[–—]/g, '-');
  for (const [re, rep] of PHRASES) out = out.replace(re, rep);
  return out.replace(/[^\w\s-+&()/]/g, ' ').replace(/\s+/g, ' ').trim();
};

const SYN = { lying: 'laying' };
const tok = (s) => norm(s).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean).map(t => SYN[t] || t);
const tokenSetKey = (s) => [...new Set(tok(s))].sort().join(' ');

function jaccard(a, b) { const A = new Set(a), B = new Set(b); if (!A.size || !B.size) return 0; let i = 0; for (const x of A) if (B.has(x)) i++; return i / (A.size + B.size - i); }

function findMatch(title, lib) {
  const want = norm(title);
  const wantTok = tok(title);
  const wantKey = tokenSetKey(title);
  for (const ex of lib) if (norm(ex.title) === want) return { ex, score: 1.0, kind: 'exact' };
  for (const ex of lib) if (tokenSetKey(ex.title) === wantKey) return { ex, score: 1.0, kind: 'exact' };
  let best = null, bestScore = 0;
  for (const ex of lib) {
    const s = jaccard(wantTok, tok(ex.title));
    if (s > bestScore) { bestScore = s; best = ex; }
  }
  return { ex: best, score: bestScore, kind: bestScore >= 0.7 ? 'close' : 'none' };
}

// ----- step 3: superset letter from "6a"/"6b" --------------------------------

// Convention from reference_superset_letter_mapping.md:
// xlsx "6a"/"6b" → ss="A"; "7a"/"7b" → ss="B" (capture the GROUP number, not
// the part letter; mod-5 starting at A so 6→A, 7→B, 8→C, ...). Singletons
// (numeric-only "1".."5") get no superset.
const supersetForIdx = (idx) => {
  const m = idx.match(/^(\d+)[ab]$/);
  if (!m) return '';
  const groupNum = parseInt(m[1], 10);
  if (groupNum < 6) return '';
  const offset = (groupNum - 6) % 5;
  return 'ABCDE'[offset];
};

// ---------------------------------------------------------------------------

(async () => {
  const sb = createClient(SUPA_URL, SUPA_KEY);
  console.log('signing in as trainer…');
  const { error: aErr } = await sb.auth.signInWithPassword({ email: TRAINER_EMAIL, password: TRAINER_PASSWORD });
  if (aErr) { console.error('auth failed:', aErr); process.exit(1); }

  const { data: libRow } = await sb.from('store').select('value').eq('key', 'expo-exercises').maybeSingle();
  const lib = libRow?.value || [];
  console.log(`exercise library: ${lib.length} entries`);

  const { data: existing } = await sb.from('plans').select('id,name').eq('trainee_id', TRAINEE_ID);
  if (existing?.some(p => p.name === PLAN_NAME)) {
    console.error(`! ${TRAINEE_ID} already has a plan named "${PLAN_NAME}". Aborting.`);
    process.exit(1);
  }

  const { warmup, days } = readBlock();
  console.log(`source: ${days.length} days · warmup ${warmup.length} items · exercises with URL: ${days.flatMap(d => d.exercises).filter(e => e.url).length}/${days.flatMap(d => d.exercises).length}`);

  // Build days payload.
  const dataDays = days.map(d => ({
    id: uid(),
    name: d.name,
    exercises: d.exercises.map((row, idx) => {
      const m = findMatch(row.title, lib);
      const linked = m.kind === 'exact' ? m.ex : null;
      return {
        id: uid(),
        exerciseId: linked ? linked.id : '',
        title: row.title,
        sets: row.sets ?? '',
        reps: row.reps ?? '',
        load: '',
        rpe: '',
        tempo: row.tempo ?? '',
        rest: restFor(row.title),
        notes: '',
        order: idx,
        superset: supersetForIdx(row.idx),
        wk: null,
        videoUrl: row.url || undefined,        // per-plan override; undefined → falls back to library
      };
    }),
  }));

  const planId = uid('pl_');
  const plan = {
    id: planId,
    name: PLAN_NAME,
    trainee_id: TRAINEE_ID,
    phase: '',
    notes: '',
    active: true,
    data: { days: dataDays, warmup, weeks: 4 },
  };

  // ----- match report -----
  let exact = 0, close = 0, none = 0;
  console.log(`\n${PLAN_NAME} — match report:`);
  for (const d of days) {
    console.log(`\n  ${d.name}:`);
    for (const row of d.exercises) {
      const m = findMatch(row.title, lib);
      const urlTag = row.url ? ' [URL✓]' : '';
      if (m.kind === 'exact') {
        exact++;
        console.log(`    ✓ ${row.title}${urlTag}`);
        console.log(`        → ${m.ex.title} (${m.ex.id}) videoLink=${m.ex.videoLink ? 'lib' : '—'} cues=${m.ex.cues ? 'yes' : 'no'}`);
      } else if (m.kind === 'close') {
        close++;
        console.log(`    ~ ${row.title}${urlTag}`);
        console.log(`        ≈ ${m.ex?.title} (score=${m.score.toFixed(2)}) — NOT linked (videolink-accuracy rule)`);
      } else {
        none++;
        console.log(`    ✗ ${row.title}${urlTag} — no library match`);
      }
    }
  }
  console.log(`\nsummary: ${exact} exact, ${close} close (unlinked), ${none} unmatched`);
  console.log(`per-plan URL overrides applied: ${dataDays.flatMap(d => d.exercises).filter(e => e.videoUrl).length}/${dataDays.flatMap(d => d.exercises).length}`);

  if (!APPLY) {
    console.log('\n[DRY RUN] re-run with `apply` to insert.');
    process.exit(0);
  }

  const dbRow = {
    id: plan.id,
    name: plan.name,
    trainee_id: plan.trainee_id,
    phase: plan.phase,
    notes: plan.notes,
    active: plan.active,
    data: plan.data,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const { error: pErr } = await sb.from('plans').insert([dbRow]);
  if (pErr) { console.error('insert failed:', pErr); process.exit(1); }
  console.log(`\n✓ inserted plan ${plan.id} (${plan.name}) for ${TRAINEE_ID}.`);
})();
