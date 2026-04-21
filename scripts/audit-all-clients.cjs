// Read-only audit of every trainee's imported plans.
// Reports: unique exercise refs, library-link rate, library-video rate,
// and where possible (Roei, whose xlsx we have), whether any sheet hyperlinks
// were dropped during import.

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { createClient } = require('@supabase/supabase-js');

const s = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co',
  'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');

const simp = t => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
const blockNumOf = n => { const m = String(n||'').match(/#\s*(\d+)/); return m ? parseInt(m[1]) : null; };

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
      const v = String(row[c]||'').trim(); if (!v) continue;
      const ref = XLSX.utils.encode_cell({ r, c });
      const vid = ws[ref]?.l?.Target || ws[ref]?.l?.target || '';
      const cleanTitle = v.replace(/\s*\([^)]{1,40}\)\s*$/, '').trim();
      cells.push({ title: cleanTitle, vid });
    }
  }
  return cells;
}

(async () => {
  const { data: tr } = await s.from('store').select('value').eq('key','expo-trainees').maybeSingle();
  const trainees = tr?.value || [];
  const { data: pr } = await s.from('store').select('value').eq('key','expo-plans').maybeSingle();
  const allPlans = pr?.value || [];
  const { data: er } = await s.from('store').select('value').eq('key','expo-exercises').maybeSingle();
  const exs = er?.value || [];
  const libById = new Map(exs.map(e => [e.id, e]));
  const libBySimp = new Map();
  exs.forEach(e => { const k = simp(e.title); if (k) (libBySimp.get(k) || libBySimp.set(k, []).get(k)).push(e); });

  // Map trainee_id -> xlsx path (placed in sheets/)
  const SHEETS_DIR = path.join(__dirname, '..', 'sheets');
  const TRAINEE_SHEETS = {
    tr_roei: ['roei.xlsx'],
    tr_tal: ['tal.xlsx'],
    tr_yuval: ['yuval_barko.xlsx'],
    tr_yuval_gotlib: ['yuval_gotlib.xlsx'],
    tr_neta_tom: ['neta.xlsx', 'tom_ronen.xlsx'],
  };

  function loadSheetsForTrainee(tid) {
    const m = new Map();
    for (const f of TRAINEE_SHEETS[tid] || []) {
      const full = path.join(SHEETS_DIR, f);
      if (!fs.existsSync(full)) continue;
      const wb = XLSX.read(fs.readFileSync(full));
      for (const name of wb.SheetNames) {
        const n = blockNumOf(name); if (n === null) continue;
        // If the same block appears in two files (e.g. neta + tom), merge their cells
        const existing = m.get(n) || [];
        m.set(n, [...existing, ...extractSheetCells(wb.Sheets[name])]);
      }
    }
    return m;
  }

  console.log('Trainees:', trainees.length, '| Plans:', allPlans.length, '| Library:', exs.length);
  console.log('');

  const rows = [];
  const droppedDetail = []; // per-trainee lost-video list
  for (const t of trainees) {
    const plans = allPlans.filter(p => p.traineeId === t.id);
    if (!plans.length) continue;
    const imported = plans.filter(p => String(p.id || '').startsWith('imp_'));
    const sheetByBlock = loadSheetsForTrainee(t.id);
    const hasSheet = sheetByBlock.size > 0;
    let total = 0, linked = 0, linkedWithVid = 0, linkedNoVid = 0, unlinked = 0, dropped = 0;
    for (const p of plans) {
      const blockNum = blockNumOf(p.name);
      const sheetCells = (blockNum != null) ? sheetByBlock.get(blockNum) : null;
      for (const d of (p.days || [])) {
        for (const ex of (d.exercises || d.ex || [])) {
          total++;
          const idRef = ex.exerciseId || ex.eid;
          const noteTitle = (ex.notes || '').match(/^\s*\[([^\]]+)\]/)?.[1]?.trim() || '';
          const title = ex.title || libById.get(idRef)?.title || noteTitle || '';
          const libEntry = libById.get(idRef) || libBySimp.get(simp(title))?.[0];
          if (!libEntry) {
            unlinked++;
            if (sheetCells) {
              const hit = sheetCells.find(c => simp(c.title) === simp(title) && c.vid);
              if (hit) { dropped++; droppedDetail.push({ trainee: t.name, plan: p.name, day: d.name, title, vid: hit.vid, reason: 'unlinked' }); }
            }
            continue;
          }
          linked++;
          if (libEntry.videoLink) linkedWithVid++;
          else {
            linkedNoVid++;
            if (sheetCells) {
              const hit = sheetCells.find(c => simp(c.title) === simp(title) && c.vid);
              if (hit) { dropped++; droppedDetail.push({ trainee: t.name, plan: p.name, day: d.name, title, vid: hit.vid, libId: libEntry.id, reason: 'linked-no-vid' }); }
            }
          }
        }
      }
    }
    rows.push({ name: t.name, id: t.id, plans: plans.length, imported: imported.length, total, linked, linkedWithVid, linkedNoVid, unlinked, dropped, hasSheet });
  }

  rows.sort((a,b) => b.total - a.total);

  const pad = (v, w) => String(v).padEnd(w);
  console.log(pad('TRAINEE', 24), pad('SHEET', 6), pad('PLANS', 6), pad('IMPD', 6), pad('SLOTS', 6), pad('LINK+VID', 10), pad('LINK-VID', 9), pad('UNLINK', 7), pad('DROPPED', 8));
  console.log('-'.repeat(92));
  for (const r of rows) {
    const linkPct = r.total ? Math.round(100*r.linkedWithVid/r.total) : 0;
    console.log(pad(r.name, 24), pad(r.hasSheet ? 'yes' : '—', 6), pad(r.plans, 6), pad(r.imported, 6), pad(r.total, 6),
      pad(r.linkedWithVid + ' (' + linkPct + '%)', 10),
      pad(r.linkedNoVid, 9),
      pad(r.unlinked, 7),
      pad(r.dropped, 8));
  }

  const grand = rows.reduce((a,r) => ({ plans: a.plans+r.plans, total: a.total+r.total, linkedWithVid: a.linkedWithVid+r.linkedWithVid, linkedNoVid: a.linkedNoVid+r.linkedNoVid, unlinked: a.unlinked+r.unlinked, dropped: a.dropped+r.dropped }), { plans:0, total:0, linkedWithVid:0, linkedNoVid:0, unlinked:0, dropped:0 });
  console.log('-'.repeat(80));
  console.log(pad('TOTAL ('+rows.length+' trainees)', 24), pad(grand.plans, 6), pad('', 6), pad(grand.total, 6),
    pad(grand.linkedWithVid + ' (' + Math.round(100*grand.linkedWithVid/grand.total) + '%)', 9),
    pad(grand.linkedNoVid, 9), pad(grand.unlinked, 7), pad(grand.dropped, 8));

  console.log('\nDROPPED column = sheet hyperlink for that title exists but portal has no video for that slot.');
  console.log('                 computed only for trainees with a sheet in sheets/ (flagged in "SHEET" col).');

  if (droppedDetail.length) {
    console.log('\n=== DROPPED VIDEO DETAIL ===');
    droppedDetail.slice(0, 40).forEach(d =>
      console.log(`  [${d.trainee}] ${d.plan} · ${d.day}: "${d.title}" → ${String(d.vid).slice(0, 70)}  (${d.reason})`));
    if (droppedDetail.length > 40) console.log(`  ... +${droppedDetail.length - 40} more`);
  }
})().catch(e => { console.error(e); process.exit(1); });
