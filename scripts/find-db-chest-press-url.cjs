// Hunt for any URL for "DB Chest Press" across:
//   - Omer's master tracking xlsx (downloaded earlier)
//   - The 3 large מעקב xlsx files downloaded earlier
//   - Every other trainee's plan in Supabase (cross-plan ex.videoUrl)
//   - The library
// Reports every match — Ohad picks the best.
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { createClient } = require('@supabase/supabase-js');

const TOOL_DIR = String.raw`C:\Users\Administrator\.claude\projects\C--Users-Administrator-Desktop-expo-full\74b0903a-3c89-42ca-8869-7f524acc8c9e\tool-results`;
const SAVED = [
  { name: 'Omer Sadeh tracking',     file: 'mcp-claude_ai_Google_Drive-download_file_content-1778350998050.txt' },
  { name: 'מעקב ישן (יובל גוטליב)', file: 'mcp-claude_ai_Google_Drive-download_file_content-1778351077236.txt' },
  { name: 'מעקב יובל ברקו',         file: 'mcp-claude_ai_Google_Drive-download_file_content-1778351087521.txt' },
  { name: 'מעקב - רועי הידיד',      file: 'mcp-claude_ai_Google_Drive-download_file_content-1778351097781.txt' },
];

const norm = (s) => String(s || '').toLowerCase().replace(/[–—]/g, '-').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const tokenSet = (s) => [...new Set(norm(s).split(' ').filter(Boolean))].sort().join(' ');
const TARGET_KEY = tokenSet('DB Chest Press');

console.log(`hunting for: DB Chest Press (token-set "${TARGET_KEY}")\n`);

// ---- xlsx scan: every cell with a hyperlink whose adjacent title matches ----
for (const blob of SAVED) {
  const fpath = path.join(TOOL_DIR, blob.file);
  if (!fs.existsSync(fpath)) { console.log(`[skip] ${blob.name} — file missing`); continue; }
  const obj = JSON.parse(fs.readFileSync(fpath, 'utf8'));
  const buf = Buffer.from(obj.content, 'base64');
  const tmp = path.join(__dirname, '..', `_tmp_dbcp_${Date.now()}_${Math.random().toString(36).slice(2,6)}.xlsx`);
  fs.writeFileSync(tmp, buf);
  const wb = XLSX.readFile(tmp);
  let hits = 0;
  for (const sn of wb.SheetNames) {
    const ws = wb.Sheets[sn];
    if (!ws['!ref']) continue;
    const range = XLSX.utils.decode_range(ws['!ref']);
    for (let r = range.s.r; r <= range.e.r; r++) {
      // Find a B-column cell whose tokenSet matches "DB Chest Press"
      for (const c of [1, 2]) {
        const titleCell = ws[XLSX.utils.encode_cell({ r, c })];
        if (!titleCell) continue;
        const title = String(titleCell.v ?? '').trim();
        if (!title) continue;
        if (tokenSet(title) !== TARGET_KEY) continue;
        // Walk the row for any cell with a hyperlink
        for (let cc = range.s.c; cc <= range.e.c; cc++) {
          const linkCell = ws[XLSX.utils.encode_cell({ r, c: cc })];
          if (!linkCell?.l?.Target) continue;
          const url = linkCell.l.Target;
          if (!/^https?:/i.test(url)) continue;
          console.log(`✓ ${blob.name} / ${sn} ! row ${r+1} col ${XLSX.utils.encode_col(cc)}`);
          console.log(`    title="${title}"  url=${url}`);
          hits++;
        }
      }
    }
  }
  fs.unlinkSync(tmp);
  if (hits === 0) console.log(`  (no hits in ${blob.name})`);
}

// ---- cross-plan scan ----
(async () => {
  const sb = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co', 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');
  await sb.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });
  const { data: plans } = await sb.from('plans').select('id,name,trainee_id,data');
  console.log(`\ncross-plan scan: ${plans.length} plans`);
  let xpHits = 0;
  for (const p of plans) {
    for (const d of p.data?.days || []) {
      for (const ex of d.exercises || []) {
        if (tokenSet(ex.title || '') !== TARGET_KEY) continue;
        const url = ex.videoUrl;
        if (typeof url !== 'string' || !url) continue;
        console.log(`✓ plan ${p.id} (${p.name}) trainee ${p.trainee_id} day "${d.name}"  url=${url}`);
        xpHits++;
      }
    }
  }
  if (xpHits === 0) console.log(`  (no per-plan ex.videoUrl override anywhere)`);

  // ---- library ----
  const { data: libRow } = await sb.from('store').select('value').eq('key', 'expo-exercises').maybeSingle();
  const lib = libRow?.value || [];
  const libHit = lib.find(L => tokenSet(L.title) === TARGET_KEY);
  console.log(`\nlibrary entry: ${libHit ? libHit.title + ' (' + libHit.id + ')' : '— not found —'}  videoLink=${libHit?.videoLink || '(empty)'}`);
})();
