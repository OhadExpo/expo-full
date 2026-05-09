// For every exercise in Omer Block #8 that's still missing a video URL
// (no per-plan ex.videoUrl AND no library videoLink), hunt across the 4
// already-downloaded מעקב xlsx files for any col-D hyperlink whose
// title-token-set matches. Print all candidates.

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { createClient } = require('@supabase/supabase-js');

const TOOL_DIR = String.raw`C:\Users\Administrator\.claude\projects\C--Users-Administrator-Desktop-expo-full\74b0903a-3c89-42ca-8869-7f524acc8c9e\tool-results`;
const SAVED = [
  { name: 'Omer tracking',          file: 'mcp-claude_ai_Google_Drive-download_file_content-1778350998050.txt' },
  { name: 'Yuval Gottlieb (old)',   file: 'mcp-claude_ai_Google_Drive-download_file_content-1778351077236.txt' },
  { name: 'Yuval Berko',            file: 'mcp-claude_ai_Google_Drive-download_file_content-1778351087521.txt' },
  { name: 'Roey Hayedid',           file: 'mcp-claude_ai_Google_Drive-download_file_content-1778351097781.txt' },
];

const PHRASES = [[/\bpro[-\/]ret\b/gi, 'protraction retraction']];
const SYN = { lying: 'laying' };
const norm = (s) => {
  let out = String(s || '').toLowerCase().replace(/[–—]/g, '-');
  for (const [re, rep] of PHRASES) out = out.replace(re, rep);
  return out.replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
};
const tok = (s) => norm(s).split(' ').filter(Boolean).map(t => SYN[t] || t);
const tokenSet = (s) => [...new Set(tok(s))].sort().join(' ');

// Build a global title→[urls] map from all tracking xlsx files.
const titleToHits = new Map();
for (const blob of SAVED) {
  const fpath = path.join(TOOL_DIR, blob.file);
  if (!fs.existsSync(fpath)) continue;
  const obj = JSON.parse(fs.readFileSync(fpath, 'utf8'));
  const buf = Buffer.from(obj.content, 'base64');
  const tmp = path.join(__dirname, '..', `_tmp_url_${Date.now()}_${Math.random().toString(36).slice(2,6)}.xlsx`);
  fs.writeFileSync(tmp, buf);
  const wb = XLSX.readFile(tmp);
  for (const sn of wb.SheetNames) {
    const ws = wb.Sheets[sn];
    if (!ws['!ref']) continue;
    const range = XLSX.utils.decode_range(ws['!ref']);
    for (let r = range.s.r; r <= range.e.r; r++) {
      // Title cell can be col B or C in some sheets.
      let title = '';
      for (const c of [1, 2]) {
        const cell = ws[XLSX.utils.encode_cell({ r, c })];
        const v = String(cell?.v ?? '').trim();
        if (v && v.length > 4 && !/^\d+[ab]?$/.test(v)) { title = v; break; }
      }
      if (!title) continue;
      // Walk the row for any URL-cell.
      for (let cc = range.s.c; cc <= range.e.c; cc++) {
        const cell = ws[XLSX.utils.encode_cell({ r, c: cc })];
        const url = cell?.l?.Target;
        if (!url || !/^https?:/i.test(url)) continue;
        const k = tokenSet(title);
        if (!titleToHits.has(k)) titleToHits.set(k, []);
        titleToHits.get(k).push({ source: `${blob.name}/${sn}`, title, url });
      }
    }
  }
  fs.unlinkSync(tmp);
}
console.log(`indexed ${titleToHits.size} distinct titles with URLs across 4 tracking xlsx files`);

// For each Omer Block #8 exercise still missing a URL, look up.
(async () => {
  const sb = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co', 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');
  await sb.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });
  const { data: planRow } = await sb.from('plans').select('data').eq('id', 'pl_3a55ef962099rwed').maybeSingle();
  const { data: libRow } = await sb.from('store').select('value').eq('key', 'expo-exercises').maybeSingle();
  const lib = libRow?.value || [];
  const libById = new Map(lib.map(L => [L.id, L]));

  for (const d of planRow.data.days || []) {
    for (const ex of d.exercises || []) {
      const linked = ex.exerciseId ? libById.get(ex.exerciseId) : null;
      const libVideo = linked?.videoLink || '';
      const planVideo = (typeof ex.videoUrl === 'string' && ex.videoUrl) || '';
      if (libVideo || planVideo) continue;       // already has a URL
      const k = tokenSet(ex.title);
      const hits = titleToHits.get(k);
      console.log(`\n• ${d.name}  ${ex.title}`);
      if (!hits || hits.length === 0) {
        console.log(`    ✗ no exact-token-set match in any tracking file`);
        continue;
      }
      // Dedup URLs, prefer most-frequent.
      const counts = new Map();
      for (const h of hits) counts.set(h.url, (counts.get(h.url) || 0) + 1);
      const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
      for (const [url, n] of ranked) {
        const sources = [...new Set(hits.filter(h => h.url === url).map(h => h.source))];
        console.log(`    ✓ ${url}  (${n}× from ${sources.join(', ')})`);
      }
    }
  }
})();
