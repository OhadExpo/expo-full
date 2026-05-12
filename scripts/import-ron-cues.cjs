// Pulls exercise notes (cell comments on column B = exercise name) from
// "מעקב - רון יונקר (1).xlsx" and writes them onto the matching library
// exercises' `cues` field in the expo-exercises store.
//
// Match strategy:
//   1. exact (case-insensitive trim) title match
//   2. token-set normalized title match (handles "Pull-Up" vs "Pull Up",
//      "Laying" vs "Lying", punctuation differences)
//
// Never clobbers a non-empty existing cues unless --force is passed. Logs
// every match + every miss so we can hand-review what's left over.
//
// Usage:
//   node scripts/import-ron-cues.cjs            # dry-run
//   node scripts/import-ron-cues.cjs apply      # write
//   node scripts/import-ron-cues.cjs apply --force   # overwrite existing cues
//
// Auth: signs in as ohadyproductions@gmail.com (per reference_scripts_trainer_auth.md)
// so the RLS update succeeds.

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { createClient } = require('@supabase/supabase-js');

const SUPA_URL = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const SUPA_KEY = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';
const TRAINER_EMAIL = 'ohadyproductions@gmail.com';
const TRAINER_PASS = '1234';

// Allow override: `node scripts/import-ron-cues.cjs apply <relative-xlsx-path>`
const CLI_PATH = process.argv.slice(2).find(a => a.endsWith('.xlsx'));
const XLSX_PATH = CLI_PATH ? path.resolve(CLI_PATH) : path.join(__dirname, '..', 'מעקב - רון יונקר (1).xlsx');
const APPLY = process.argv.includes('apply');
const FORCE = process.argv.includes('--force');

const PHRASES = [[/\bpro[-\/]ret\b/gi, 'protraction retraction']];
const SYN = { lying: 'laying' };
const norm = (s) => {
  let out = String(s || '').toLowerCase().replace(/[–—]/g, '-');
  for (const [re, rep] of PHRASES) out = out.replace(re, rep);
  return out.replace(/[^\w\s-+&()/]/g, ' ').replace(/\s+/g, ' ').trim();
};
const tok = (s) => norm(s).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean).map(t => SYN[t] || t);
const tokenSetKey = (s) => [...new Set(tok(s))].sort().join(' ');

function extractCuesFromXlsx(filePath) {
  const wb = XLSX.readFile(filePath, { cellNF: false, cellHTML: false });
  // titleKey → { title, cue, source[] }
  const cuesByExactTitle = new Map();
  const cuesByTokenKey = new Map();
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws || !ws['!ref']) continue;
    const range = XLSX.utils.decode_range(ws['!ref']);
    for (let r = 0; r <= range.e.r; r++) {
      const titleCellRef = XLSX.utils.encode_cell({ r, c: 1 }); // col B
      const cell = ws[titleCellRef];
      if (!cell || !cell.c || cell.c.length === 0) continue;
      const title = String(cell.v || '').trim();
      if (!title) continue;
      const cueText = cell.c.map(c => String(c.t || '').trim()).filter(Boolean).join('\n\n').trim();
      if (!cueText) continue;
      const exactKey = title.toLowerCase().trim();
      const tokenKey = tokenSetKey(title);
      const entry = { title, cue: cueText, source: [sheetName] };
      if (!cuesByExactTitle.has(exactKey)) cuesByExactTitle.set(exactKey, entry);
      else cuesByExactTitle.get(exactKey).source.push(sheetName);
      if (!cuesByTokenKey.has(tokenKey)) cuesByTokenKey.set(tokenKey, entry);
      else cuesByTokenKey.get(tokenKey).source.push(sheetName);
    }
  }
  return { cuesByExactTitle, cuesByTokenKey };
}

(async () => {
  console.log('=== EXTRACT ===');
  const { cuesByExactTitle, cuesByTokenKey } = extractCuesFromXlsx(XLSX_PATH);
  console.log(`Found ${cuesByExactTitle.size} unique exercise cues (by exact title) across ${[...new Set([...cuesByExactTitle.values()].flatMap(e => e.source))].length} sheets`);

  console.log('\n=== AUTH ===');
  const supa = createClient(SUPA_URL, SUPA_KEY);
  const { error: authErr } = await supa.auth.signInWithPassword({ email: TRAINER_EMAIL, password: TRAINER_PASS });
  if (authErr) { console.error('Auth failed:', authErr.message); process.exit(1); }
  console.log('Signed in as', TRAINER_EMAIL);

  console.log('\n=== FETCH LIBRARY ===');
  const { data: storeRow, error: storeErr } = await supa.from('store').select('value').eq('key', 'expo-exercises').single();
  if (storeErr) { console.error('Fetch failed:', storeErr.message); process.exit(1); }
  const lib = storeRow.value;
  if (!Array.isArray(lib)) { console.error('Library is not an array'); process.exit(1); }
  console.log(`Library has ${lib.length} exercises`);

  console.log('\n=== MATCH ===');
  const hits = [];   // [{ libId, libTitle, oldCues, newCues, matchType }]
  const skipped = []; // [{ libTitle, reason }]
  for (let i = 0; i < lib.length; i++) {
    const ex = lib[i];
    if (!ex || !ex.title) continue;
    const exactKey = String(ex.title).toLowerCase().trim();
    const tokenKey = tokenSetKey(ex.title);
    const matched = cuesByExactTitle.get(exactKey) || cuesByTokenKey.get(tokenKey);
    if (!matched) continue;
    const oldCues = String(ex.cues || '').trim();
    if (oldCues && !FORCE) {
      skipped.push({ libTitle: ex.title, reason: 'has existing cues (use --force to overwrite)' });
      continue;
    }
    if (oldCues === matched.cue) {
      skipped.push({ libTitle: ex.title, reason: 'already matches' });
      continue;
    }
    hits.push({
      libIdx: i, libId: ex.id, libTitle: ex.title,
      oldCues, newCues: matched.cue,
      matchType: cuesByExactTitle.get(exactKey) ? 'exact' : 'token',
      source: matched.source.join(', '),
    });
  }

  console.log(`Hits (will write): ${hits.length}`);
  console.log(`Skipped: ${skipped.length}`);
  console.log('');
  for (const h of hits) {
    console.log(`[${h.matchType}] ${h.libTitle}`);
    console.log(`  from sheet(s): ${h.source}`);
    if (h.oldCues) console.log(`  OLD: ${h.oldCues.slice(0,80).replace(/\n/g, ' ⏎ ')}…`);
    console.log(`  NEW: ${h.newCues.slice(0,120).replace(/\n/g, ' ⏎ ')}…`);
  }
  console.log('');
  for (const s of skipped) console.log(`  skip: ${s.libTitle} — ${s.reason}`);

  if (!APPLY) {
    console.log('\nDry-run only. Pass `apply` to write.');
    return;
  }

  console.log('\n=== APPLY ===');
  for (const h of hits) lib[h.libIdx].cues = h.newCues;
  const { error: upErr } = await supa.from('store').update({ value: lib }).eq('key', 'expo-exercises');
  if (upErr) { console.error('Update failed:', upErr.message); process.exit(1); }
  console.log(`Wrote ${hits.length} cue updates to expo-exercises.`);
})();
