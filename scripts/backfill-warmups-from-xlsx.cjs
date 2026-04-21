// Backfill plan.warmup from a trainee's xlsx sheet (one trainee per run).
// Matches sheets to Supabase plans by block number (e.g. "Block #24").
// Updates ONLY the warmup field — days, exercises, notes, etc. are untouched.
// Writes to BOTH store.expo-plans blob AND plans table (since both are read).
//
// Usage:
//   node scripts/backfill-warmups-from-xlsx.cjs <trainee_id> <path/to/sheet.xlsx>            # dry run
//   node scripts/backfill-warmups-from-xlsx.cjs <trainee_id> <path/to/sheet.xlsx> apply

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { createClient } = require('@supabase/supabase-js');

const s = createClient(
  'https://gtcbfglttoiyfsnfbhdy.supabase.co',
  'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv'
);

const TRAINEE_ID = process.argv[2];
const XLSX_PATH = process.argv[3];
const APPLY = process.argv[4] === 'apply';

if (!TRAINEE_ID || !XLSX_PATH) {
  console.error('usage: node scripts/backfill-warmups-from-xlsx.cjs <trainee_id> <sheet.xlsx> [apply]');
  process.exit(1);
}

const WU_HEADER_RE = /^\s*(warm[-\s]?up|morning routine|חימום|instructions?|notes?|neck exc|bb\s*-\s*barbell|everything else|bb exercises|week\s*\d|rest|home routine|date:|day\s+\w)/i;
const WU_RX_RE = /^(.+?)\s*\(\s*([^()]+?)\s*\)\s*$/;

function extractWarmup(ws) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  let firstDayRow = rows.length;
  for (let r = 0; r < rows.length; r++) {
    if (String(rows[r][0]||'').trim() === '#' && String(rows[r][1]||'').trim()) { firstDayRow = r; break; }
  }
  const warmup = []; const seen = new Set();
  for (let r = 0; r < firstDayRow; r++) {
    const row = rows[r] || [];
    for (let c = 0; c < row.length; c++) {
      const v = String(row[c]||'').trim();
      if (!v || WU_HEADER_RE.test(v)) continue;
      const m = v.match(WU_RX_RE); if (!m) continue;
      const t = m[1].trim(), rx = m[2].trim();
      if (!t || !rx || !/\d|sec|rep|min/i.test(rx) || /[:]/.test(t)) continue;
      if (/^(week\s|date\s|new\s+gym)/i.test(t)) continue;
      const key = t.toLowerCase(); if (seen.has(key)) continue; seen.add(key);
      const ref = XLSX.utils.encode_cell({ r, c });
      const vid = ws[ref]?.l?.Target || ws[ref]?.l?.target || '';
      warmup.push(vid ? { t, rx, vid } : { t, rx });
    }
  }
  return warmup;
}

const blockNumOf = s => { const m = String(s||'').match(/#\s*(\d+)/); return m ? parseInt(m[1]) : null; };

(async () => {
  console.log(APPLY ? 'APPLY MODE' : 'DRY RUN');
  console.log('='.repeat(60));
  console.log('trainee_id:', TRAINEE_ID);
  console.log('xlsx:', XLSX_PATH);

  // Load sheet + build { blockNum -> warmup[] }
  const wb = XLSX.read(fs.readFileSync(XLSX_PATH));
  const sheetWu = new Map();
  for (const name of wb.SheetNames) {
    const n = blockNumOf(name); if (n === null) continue;
    const wu = extractWarmup(wb.Sheets[name]);
    if (wu.length) sheetWu.set(n, { name, warmup: wu });
  }
  console.log('sheets with warmup:', sheetWu.size);

  // Load trainee plans from both stores
  const { data: pr } = await s.from('store').select('value').eq('key', 'expo-plans').maybeSingle();
  const blobPlans = pr?.value || [];
  const myBlobPlans = blobPlans.filter(p => p.traineeId === TRAINEE_ID);

  const { data: rowPlans } = await s.from('plans').select('id,name,data').eq('trainee_id', TRAINEE_ID);

  console.log('trainee has', myBlobPlans.length, 'plans in blob,', (rowPlans||[]).length, 'in plans table');

  // Plan updates to apply
  const updates = []; // { plan, blockNum, warmup, blobIdx, rowId }
  for (const p of myBlobPlans) {
    const n = blockNumOf(p.name); if (n === null) { console.log('  skip', p.name, '(no block#)'); continue; }
    const sh = sheetWu.get(n); if (!sh) { console.log('  no sheet warmup for', p.name, '(block #'+n+')'); continue; }
    const already = Array.isArray(p.warmup) && p.warmup.length > 0;
    updates.push({
      planName: p.name, blockNum: n, warmup: sh.warmup, sheetName: sh.name,
      blobIdx: blobPlans.indexOf(p), rowId: p.id, already
    });
  }

  console.log('\n=== Planned updates ===');
  for (const u of updates) {
    const tag = u.already ? '[overwrite]' : '[new]';
    console.log(tag, u.planName, '← sheet:', u.sheetName, '— wu:', u.warmup.length);
    u.warmup.forEach(w => console.log('    •', w.t, '—', w.rx, w.vid ? '✓vid' : ''));
  }

  if (!APPLY) { console.log('\n(dry run — rerun with "apply")'); return; }
  if (updates.length === 0) { console.log('\nnothing to do'); return; }

  // Apply to blob
  for (const u of updates) { blobPlans[u.blobIdx] = { ...blobPlans[u.blobIdx], warmup: u.warmup }; }
  const { error: e1 } = await s.from('store').update({ value: blobPlans }).eq('key', 'expo-plans');
  if (e1) throw e1;
  console.log('\n✓ store.expo-plans blob updated');

  // Apply to plans table (only data.warmup; preserve data.days)
  for (const u of updates) {
    const row = (rowPlans || []).find(r => r.id === u.rowId);
    if (!row) { console.log('  (no plans table row for', u.planName, ')'); continue; }
    const newData = { ...(row.data || {}), warmup: u.warmup };
    const { error } = await s.from('plans').update({ data: newData }).eq('id', u.rowId);
    if (error) console.log('  FAIL', u.planName, error.message);
    else console.log('  ✓', u.planName);
  }
  console.log('\nDone.');
})().catch(e => { console.error('ERROR:', e); process.exit(1); });
