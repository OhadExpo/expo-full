// Scan for missing exercise videos: compare what was in the original xlsx
// against what the library currently has for each of Roei's imported plans.
//
// For every exercise in every Roei plan:
//  1. resolve to library entry (by eid/exerciseId, else title)
//  2. lookup the same exercise in roei-sheet.xlsx (same block, title match)
//  3. report whenever the sheet cell carries a hyperlink BUT the library entry
//     has no videoLink (i.e. the import dropped it).
//
// Usage: node scripts/scan-missing-videos.cjs [trainee_id] [xlsx_path]
//        defaults: tr_roei, roei-sheet.xlsx

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { createClient } = require('@supabase/supabase-js');

const TRAINEE_ID = process.argv[2] || 'tr_roei';
const XLSX_PATH = process.argv[3] || path.join(__dirname, '..', 'roei-sheet.xlsx');

const s = createClient(
  'https://gtcbfglttoiyfsnfbhdy.supabase.co',
  'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv'
);

const simp = t => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
const blockNumOf = n => { const m = String(n||'').match(/#\s*(\d+)/); return m ? parseInt(m[1]) : null; };

// Pull every non-empty cell with its title and hyperlink target from the training-day portion of a sheet.
function extractSheetCells(ws) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  let firstDayRow = rows.length;
  for (let r = 0; r < rows.length; r++) {
    if (String(rows[r][0]||'').trim() === '#' && String(rows[r][1]||'').trim()) { firstDayRow = r; break; }
  }
  const cells = [];
  for (let r = firstDayRow; r < rows.length; r++) {
    const row = rows[r] || [];
    for (let c = 0; c < row.length; c++) {
      const v = String(row[c]||'').trim();
      if (!v) continue;
      const ref = XLSX.utils.encode_cell({ r, c });
      const vid = ws[ref]?.l?.Target || ws[ref]?.l?.target || '';
      // Exercise titles often include reps — strip trailing "(3x12 E)" or similar
      const cleanTitle = v.replace(/\s*\([^)]{1,40}\)\s*$/, '').trim();
      cells.push({ raw: v, title: cleanTitle, vid, r, c });
    }
  }
  return cells;
}

(async () => {
  console.log('trainee:', TRAINEE_ID);
  console.log('xlsx:', XLSX_PATH);

  const wb = XLSX.read(fs.readFileSync(XLSX_PATH));
  const byBlock = new Map();
  for (const name of wb.SheetNames) {
    const n = blockNumOf(name); if (n === null) continue;
    byBlock.set(n, { name, cells: extractSheetCells(wb.Sheets[name]) });
  }

  const { data: pr } = await s.from('store').select('value').eq('key', 'expo-plans').maybeSingle();
  const plans = (pr?.value || []).filter(p => p.traineeId === TRAINEE_ID);
  const { data: er } = await s.from('store').select('value').eq('key', 'expo-exercises').maybeSingle();
  const exs = er?.value || [];
  const libById = new Map(exs.map(e => [e.id, e]));
  const libBySimpTitle = new Map();
  exs.forEach(e => { const k = simp(e.title); if (k) (libBySimpTitle.get(k) || libBySimpTitle.set(k, []).get(k)).push(e); });

  console.log('plans:', plans.length, '| library size:', exs.length, '| sheet blocks:', byBlock.size);

  const stats = { total: 0, noLib: 0, libNoVid: 0, libHasVid: 0, dropped: 0 };
  const dropped = []; // sheet has vid, library entry lacks videoLink
  const missingLib = []; // no library match
  const libLacksAnywhere = []; // library entry lacks video and we can't recover

  for (const p of plans) {
    const blockNum = blockNumOf(p.name);
    const sh = byBlock.get(blockNum);
    const days = p.days || [];
    for (const d of days) {
      const exerciseArr = d.exercises || d.ex || [];
      for (const ex of exerciseArr) {
        stats.total++;
        // Title sources in order: explicit title | library lookup | notes in brackets
        const idRef = ex.exerciseId || ex.eid;
        const noteTitle = (ex.notes || '').match(/^\s*\[([^\]]+)\]/)?.[1]?.trim() || '';
        const title = ex.title || libById.get(idRef)?.title || noteTitle || '';
        const libEntry = libById.get(idRef)
          || (libBySimpTitle.get(simp(title))?.[0]);
        const hasLibVid = !!(libEntry?.videoLink);

        if (!libEntry) {
          stats.noLib++;
          // Was there a hyperlink in the source sheet for this title?
          const sheetVid = sh?.cells.find(c => simp(c.title) === simp(title) && c.vid)?.vid || '';
          missingLib.push({ plan: p.name, day: d.name, title, sheetVid });
          continue;
        }

        if (hasLibVid) { stats.libHasVid++; continue; }

        stats.libNoVid++;
        // Can we find this exercise in the sheet for this block?
        if (sh) {
          const hit = sh.cells.find(c => simp(c.title) === simp(title) && c.vid);
          if (hit) {
            stats.dropped++;
            dropped.push({ plan: p.name, block: blockNum, day: d.name, title, sheetVid: hit.vid, libId: libEntry.id });
            continue;
          }
        }
        libLacksAnywhere.push({ plan: p.name, day: d.name, title, libId: libEntry.id });
      }
    }
  }

  console.log('\n=== SUMMARY ===');
  console.log('  total exercise slots:       ', stats.total);
  console.log('  ✓ library entry + video:    ', stats.libHasVid);
  console.log('  ⚠ library entry, no video:  ', stats.libNoVid);
  console.log('     └ of which sheet HAD vid (DROPPED on import):', stats.dropped);
  console.log('  ❌ no library match:         ', stats.noLib);

  if (dropped.length) {
    console.log('\n=== DROPPED VIDEOS (library entry exists but videoLink missing; sheet has a link for this title) ===');
    dropped.slice(0, 100).forEach(d =>
      console.log(`  Block #${d.block} · ${d.day}: "${d.title}" → ${d.sheetVid.slice(0, 70)}  (lib ${d.libId})`));
    if (dropped.length > 100) console.log(`  ... +${dropped.length - 100} more`);
  }

  if (missingLib.length) {
    console.log('\n=== NO LIBRARY MATCH (unlinked, showing top 30 by usage) ===');
    const agg = {};
    missingLib.forEach(m => {
      if (!agg[m.title]) agg[m.title] = { n: 0, vids: new Set() };
      agg[m.title].n++;
      if (m.sheetVid) agg[m.title].vids.add(m.sheetVid);
    });
    Object.entries(agg).sort((a,b) => b[1].n-a[1].n).slice(0, 30)
      .forEach(([t, v]) => {
        const tag = v.vids.size ? ` [sheet vid × ${v.vids.size}]` : '';
        console.log(`  (${v.n}×) ${t}${tag}`);
      });
    const withVid = missingLib.filter(m => m.sheetVid).length;
    console.log(`\n  ${withVid} / ${missingLib.length} unlinked slots have a hyperlink in the source sheet (recoverable).`);
  }
})().catch(e => { console.error('ERROR:', e); process.exit(1); });
