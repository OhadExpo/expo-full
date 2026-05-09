// Build a global cue dictionary by walking ALL downloaded מעקב xlsx files.
// For each col-B cell with a comment, take the title + comment text and
// store under tokenSetKey(title). Then patch Omer Block #8 for any
// exercises STILL missing notes.
//
// Run:
//   node scripts/extract-cues-multi-meakav.cjs        # dry-run
//   node scripts/extract-cues-multi-meakav.cjs apply  # apply

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { createClient } = require('@supabase/supabase-js');

const SUPA_URL = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const SUPA_KEY = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';
const PLAN_ID = 'pl_3a55ef962099rwed';
const APPLY = process.argv[2] === 'apply';

const TOOL_DIR = String.raw`C:\Users\Administrator\.claude\projects\C--Users-Administrator-Desktop-expo-full\74b0903a-3c89-42ca-8869-7f524acc8c9e\tool-results`;

// All saved download_file_content xlsx blobs from this session.
const SAVED_BLOBS = [
  { name: 'Omer Sadeh tracking',      file: 'mcp-claude_ai_Google_Drive-download_file_content-1778350998050.txt' },
  { name: 'מעקב ישן (יובל גוטליב)',  file: 'mcp-claude_ai_Google_Drive-download_file_content-1778351077236.txt' },
  { name: 'מעקב יובל ברקו',          file: 'mcp-claude_ai_Google_Drive-download_file_content-1778351087521.txt' },
  { name: 'מעקב - רועי הידיד',       file: 'mcp-claude_ai_Google_Drive-download_file_content-1778351097781.txt' },
];

const PHRASES = [[/\bpro[-\/]ret\b/gi, 'protraction retraction']];
const SYN = { lying: 'laying' };
const norm = (s) => {
  let out = String(s || '').toLowerCase().replace(/[–—]/g, '-');
  for (const [re, rep] of PHRASES) out = out.replace(re, rep);
  return out.replace(/[^\w\s-+&()/]/g, ' ').replace(/\s+/g, ' ').trim();
};
const tok = (s) => norm(s).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean).map(t => SYN[t] || t);
const tokenSetKey = (s) => [...new Set(tok(s))].sort().join(' ');

// cueDict: tokenKey → [{ source, title, cue }]
const cueDict = new Map();

for (const blob of SAVED_BLOBS) {
  const fpath = path.join(TOOL_DIR, blob.file);
  if (!fs.existsSync(fpath)) { console.log(`[skip] missing: ${blob.name}`); continue; }
  const obj = JSON.parse(fs.readFileSync(fpath, 'utf8'));
  const buf = Buffer.from(obj.content, 'base64');
  const tmpXlsx = path.join(__dirname, '..', `_tmp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.xlsx`);
  fs.writeFileSync(tmpXlsx, buf);
  const wb = XLSX.readFile(tmpXlsx);
  let count = 0;
  for (const sn of wb.SheetNames) {
    const ws = wb.Sheets[sn];
    if (!ws['!ref']) continue;
    const range = XLSX.utils.decode_range(ws['!ref']);
    for (let r = range.s.r; r <= range.e.r; r++) {
      // Try col B first (most common), then col C as a fallback (some sheets shifted).
      for (const c of [1, 2]) {
        const cell = ws[XLSX.utils.encode_cell({ r, c })];
        if (!cell?.c || !Array.isArray(cell.c) || cell.c.length === 0) continue;
        const title = String(cell.v ?? '').trim();
        if (!title) continue;
        const cueText = (cell.c[0].t || '').trim();
        if (!cueText) continue;
        const k = tokenSetKey(title);
        if (!cueDict.has(k)) cueDict.set(k, []);
        cueDict.get(k).push({ source: `${blob.name}/${sn}!${XLSX.utils.encode_cell({ r, c })}`, title, cue: cueText });
        count++;
      }
    }
  }
  fs.unlinkSync(tmpXlsx);
  console.log(`[${blob.name}] ${count} cue-comments extracted`);
}

console.log(`\nTotal distinct titles in cue dictionary: ${cueDict.size}`);

(async () => {
  const sb = createClient(SUPA_URL, SUPA_KEY);
  await sb.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });
  const { data: planRow } = await sb.from('plans').select('id,name,trainee_id,data').eq('id', PLAN_ID).maybeSingle();

  const proposed = [];
  const newDays = (planRow.data.days || []).map(d => ({
    ...d,
    exercises: d.exercises.map(ex => {
      if (typeof ex.notes === 'string' && ex.notes.trim()) return ex;
      const k = tokenSetKey(ex.title);
      const hits = cueDict.get(k);
      if (!hits || hits.length === 0) return ex;
      // Prefer the longest cue (more thorough). Tie-break by source order.
      const best = [...hits].sort((a, b) => b.cue.length - a.cue.length)[0];
      proposed.push({ day: d.name, title: ex.title, source: best.source, cue: best.cue });
      return { ...ex, notes: best.cue };
    }),
  }));

  console.log(`\nproposed cue-note patches from multi-מעקב sweep: ${proposed.length}`);
  for (const p of proposed) {
    console.log(`\n• ${p.day}  ${p.title}`);
    console.log(`    source: ${p.source}`);
    console.log(`    + ${p.cue.slice(0, 220).replace(/\n/g, ' ⏎ ')}${p.cue.length > 220 ? '…' : ''}`);
  }

  if (!APPLY) {
    console.log('\n[DRY RUN] re-run with `apply` to write.');
    process.exit(0);
  }

  const newData = { ...planRow.data, days: newDays };
  const { error: uErr } = await sb.from('plans').update({
    data: newData,
    updated_at: new Date().toISOString(),
  }).eq('id', PLAN_ID);
  if (uErr) { console.error('update failed:', uErr); process.exit(1); }
  console.log(`\n✓ patched plan ${PLAN_ID} with ${proposed.length} cue-note patches.`);
})();
