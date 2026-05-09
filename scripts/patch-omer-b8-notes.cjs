// Mirror of patch-nadav-b4-notes.cjs but for Omer Block #8 (pl_3a55ef962099rwed).
// Reads cell-comments off col-B in "omer Block #8.xlsx" (sheet "Block #8")
// and fills any blank ex.notes with the source-xlsx Hebrew cues.
//
// Run:
//   node scripts/patch-omer-b8-notes.cjs        # dry-run
//   node scripts/patch-omer-b8-notes.cjs apply  # apply

const path = require('path');
const XLSX = require('xlsx');
const { createClient } = require('@supabase/supabase-js');

const SUPA_URL = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const SUPA_KEY = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';
const PLAN_ID = 'pl_3a55ef962099rwed';
const SOURCE_XLSX = 'omer Block #8.xlsx';
const SHEET_NAME = 'Block #8';

const APPLY = process.argv[2] === 'apply';

const commentText = (cell) => {
  if (!cell?.c || !Array.isArray(cell.c) || cell.c.length === 0) return '';
  const t = cell.c[0].t;
  return typeof t === 'string' ? t.trim() : '';
};

function readBlockNotes() {
  const wb = XLSX.readFile(path.join(__dirname, '..', SOURCE_XLSX));
  const ws = wb.Sheets[SHEET_NAME];
  const r = XLSX.utils.decode_range(ws['!ref']);
  const cell = (row, col) => ws[XLSX.utils.encode_cell({ r: row, c: col })];
  const cellStr = (row, col) => String(cell(row, col)?.v ?? '').trim();

  const dayHeaderRows = [];
  for (let row = r.s.r; row <= r.e.r; row++) {
    if (/^Day [A-Z]$/i.test(cellStr(row, 1))) dayHeaderRows.push(row);
  }
  const days = [];
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
  // Warm-up cells in col D
  const warmup = [];
  for (let row = r.s.r; row <= r.e.r; row++) {
    if (cellStr(row, 0) === 'Instructions') continue;
    const dCell = cell(row, 3);
    const dVal = String(dCell?.v ?? '').trim();
    if (!dVal) continue;
    if (/^Day [A-Z]/.test(cellStr(row, 1))) break;
    if (/^Vid$/i.test(dVal)) break;
    if (/Rest|Off/i.test(dVal)) continue;
    if (/^\d+[ab]?$/.test(dVal)) continue;
    if (/^Warm-Up/i.test(dVal)) continue;
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
  const total = srcDays.flatMap(d => d.exercises).length;
  const withCues = srcDays.flatMap(d => d.exercises).filter(e => e.notes).length;
  console.log(`source days: ${srcDays.length}, exercises with cue-comments: ${withCues}/${total}`);

  const proposed = [];
  const newDays = (planRow.data.days || []).map((d) => {
    const src = srcDays.find(x => x.name === d.name);
    if (!src) return d;
    return {
      ...d,
      exercises: d.exercises.map((ex, idx) => {
        const srcEx = src.exercises[idx];
        if (!srcEx || !srcEx.notes) return ex;
        if (ex.notes && ex.notes.trim()) return { ...ex, _hadNotes: true };  // skip
        proposed.push({ day: d.name, title: ex.title, after: srcEx.notes });
        return { ...ex, notes: srcEx.notes };
      }).map(({ _hadNotes, ...rest }) => rest),
    };
  });

  // Warm-up — store as `n` field for forward-compat (current renderer doesn't show it).
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
