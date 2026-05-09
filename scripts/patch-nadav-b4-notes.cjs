// Pull the Hebrew cue text out of each col-B cell's COMMENT (cell.c[0].t)
// and patch Nadav's already-inserted Block #4 (pl_9fec230d9951te9m) with
// per-plan ex.notes. Also handles col-D warm-up cells if they carry comments.
//
// Run:
//   node scripts/patch-nadav-b4-notes.cjs        # dry-run, prints diff
//   node scripts/patch-nadav-b4-notes.cjs apply  # updates the plan row

const path = require('path');
const XLSX = require('xlsx');
const { createClient } = require('@supabase/supabase-js');

const SUPA_URL = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const SUPA_KEY = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';
const PLAN_ID = 'pl_9fec230d9951te9m';
const SOURCE_XLSX = 'Nadav Blachar - Training Program.xlsx';
const SHEET_NAME = 'Block #4';

const APPLY = process.argv[2] === 'apply';

function commentText(cell) {
  if (!cell?.c || !Array.isArray(cell.c) || cell.c.length === 0) return '';
  // sheetjs stores the textual comment under cell.c[0].t
  const t = cell.c[0].t;
  return typeof t === 'string' ? t.trim() : '';
}

function readBlockNotes() {
  const wb = XLSX.readFile(path.join(__dirname, '..', SOURCE_XLSX));
  const ws = wb.Sheets[SHEET_NAME];
  const r = XLSX.utils.decode_range(ws['!ref']);
  const cell = (row, col) => ws[XLSX.utils.encode_cell({ r: row, c: col })];
  const cellStr = (row, col) => String(cell(row, col)?.v ?? '').trim();

  // Discover day boundaries by scanning col B for "Day A/B/C" headers.
  const dayHeaderRows = [];
  for (let row = r.s.r; row <= r.e.r; row++) {
    if (/^Day [A-Z]$/i.test(cellStr(row, 1))) dayHeaderRows.push(row);
  }
  // Each day's exercises run from header+1 until the next blank col-A
  // or the next day header.
  const days = []; // [{ name, exercises: [{idx, title, notes}] }]
  for (let h = 0; h < dayHeaderRows.length; h++) {
    const headerRow = dayHeaderRows[h];
    const nextHeader = dayHeaderRows[h + 1] ?? r.e.r + 1;
    const dayName = cellStr(headerRow, 1);
    const exs = [];
    for (let row = headerRow + 1; row < nextHeader; row++) {
      const idx = cellStr(row, 0);
      const title = cellStr(row, 1);
      if (!/^\d+[ab]?$/.test(idx) || !title) continue;
      const notes = commentText(cell(row, 1));
      exs.push({ idx, title, notes });
    }
    days.push({ name: dayName, exercises: exs });
  }

  // Warm-up cells live in col D (rows 2..5 typically). Read comments too.
  const warmup = [];
  for (let row = r.s.r; row <= r.e.r; row++) {
    const aVal = cellStr(row, 0);
    const dCell = cell(row, 3);
    const dVal = String(dCell?.v ?? '').trim();
    if (aVal === 'Instructions') continue;
    if (!dVal) continue;
    if (/^Day [A-Z]/.test(cellStr(row, 1))) break;     // hit first day header → stop
    if (/^Vid$/i.test(dVal)) break;                    // safeguard
    if (/Rest|Off/i.test(dVal)) continue;
    if (/^\d+[ab]?$/.test(dVal)) continue;
    if (/^Warm-Up/i.test(dVal)) continue;
    // Looks like a warm-up row (e.g., "BW High Step-Up (1x12 E)").
    warmup.push({ rawTitle: dVal, notes: commentText(dCell) });
  }
  return { days, warmup };
}

(async () => {
  const sb = createClient(SUPA_URL, SUPA_KEY);
  await sb.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });

  const { data: planRow } = await sb.from('plans').select('id,name,trainee_id,data').eq('id', PLAN_ID).maybeSingle();
  if (!planRow) { console.error(`plan ${PLAN_ID} not found`); process.exit(1); }
  console.log(`patching ${planRow.id} (${planRow.name})`);

  const { days: srcDays, warmup: srcWarmup } = readBlockNotes();
  console.log(`source days: ${srcDays.length}, exercises with cue-comments: ${srcDays.flatMap(d => d.exercises).filter(e => e.notes).length}/${srcDays.flatMap(d => d.exercises).length}`);
  console.log(`warm-up items with comments: ${srcWarmup.filter(w => w.notes).length}/${srcWarmup.length}`);

  // Patch by (dayName, idx) match — the import preserved both. Plan
  // exercises have `order` and `title`, but NOT the original "1"/"6a"
  // string. Match by ORDER within day instead.
  const proposed = []; // { day, title, before, after }
  const newDays = (planRow.data.days || []).map((d) => {
    const src = srcDays.find(x => x.name === d.name);
    if (!src) return d;
    return {
      ...d,
      exercises: d.exercises.map((ex, idx) => {
        const srcEx = src.exercises[idx];
        if (!srcEx) return ex;
        if (!srcEx.notes) return ex;
        if (ex.notes && ex.notes.trim()) return ex; // don't overwrite existing notes
        proposed.push({ day: d.name, title: ex.title, before: ex.notes || '', after: srcEx.notes });
        return { ...ex, notes: srcEx.notes };
      }),
    };
  });

  // Patch warm-up. Warm-up items in plan are { t, rx, vid }. We'll add `n` field
  // for the note (renderer doesn't surface it currently — but storing it makes
  // it available for any future warm-up cue feature, and it's faithful to source).
  const newWarmup = (planRow.data.warmup || []).map((w, idx) => {
    const src = srcWarmup[idx];
    if (!src || !src.notes) return w;
    if (w.n && w.n.trim()) return w;
    return { ...w, n: src.notes };
  });

  console.log(`\nproposed cue-note patches: ${proposed.length}`);
  for (const p of proposed) {
    console.log(`\n• ${p.day}  ${p.title}`);
    console.log(`    + ${p.after.slice(0, 220).replace(/\n/g, ' ⏎ ')}${p.after.length > 220 ? '…' : ''}`);
  }

  if (!APPLY) {
    console.log('\n[DRY RUN] re-run with `apply` to write.');
    process.exit(0);
  }

  const newData = { ...planRow.data, days: newDays, warmup: newWarmup };
  const { error: uErr } = await sb.from('plans').update({
    data: newData,
    updated_at: new Date().toISOString(),
  }).eq('id', PLAN_ID);
  if (uErr) { console.error('update failed:', uErr); process.exit(1); }
  console.log(`\n✓ patched plan ${PLAN_ID} with ${proposed.length} cue-note patches.`);
})();
