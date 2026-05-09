// Decode the Drive-downloaded "Omer Sadeh - Training Program.xlsx" (saved
// as base64 JSON by the MCP), parse every sheet, and emit a JSON map of
// {exerciseTitle: cue-comment-text} from col-B cell comments. Then patch
// pl_3a55ef962099rwed for any exercises still missing notes.
//
// Run:
//   node scripts/extract-cues-from-omer-tracking.cjs        # dry-run
//   node scripts/extract-cues-from-omer-tracking.cjs apply  # apply

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { createClient } = require('@supabase/supabase-js');

const SUPA_URL = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const SUPA_KEY = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';
const PLAN_ID = 'pl_3a55ef962099rwed';
const APPLY = process.argv[2] === 'apply';

const TOOL_RESULT = String.raw`C:\Users\Administrator\.claude\projects\C--Users-Administrator-Desktop-expo-full\74b0903a-3c89-42ca-8869-7f524acc8c9e\tool-results\mcp-claude_ai_Google_Drive-download_file_content-1778350998050.txt`;

const TMP_XLSX = path.join(__dirname, '..', '_tmp_omer_tracking.xlsx');

function buildCueMap() {
  const raw = fs.readFileSync(TOOL_RESULT, 'utf8');
  const obj = JSON.parse(raw);
  const buf = Buffer.from(obj.content, 'base64');
  fs.writeFileSync(TMP_XLSX, buf);

  const wb = XLSX.readFile(TMP_XLSX);
  console.log('sheets:', wb.SheetNames);

  // map[normalizedTitle] = [{ sheet, row, title, comment }]
  const cueMap = new Map();
  for (const sn of wb.SheetNames) {
    const ws = wb.Sheets[sn];
    if (!ws['!ref']) continue;
    const range = XLSX.utils.decode_range(ws['!ref']);
    for (let r = range.s.r; r <= range.e.r; r++) {
      // Look at col B (index 1) for exercise titles with comments.
      const cell = ws[XLSX.utils.encode_cell({ r, c: 1 })];
      if (!cell?.c || !Array.isArray(cell.c) || cell.c.length === 0) continue;
      const title = String(cell.v ?? '').trim();
      if (!title) continue;
      const cueText = (cell.c[0].t || '').trim();
      if (!cueText) continue;
      const k = norm(title);
      if (!cueMap.has(k)) cueMap.set(k, []);
      cueMap.get(k).push({ sheet: sn, row: r + 1, title, comment: cueText });
    }
  }
  return cueMap;
}

const PHRASES = [[/\bpro[-\/]ret\b/gi, 'protraction retraction']];
const SYN = { lying: 'laying' };

const norm = (s) => {
  let out = String(s || '').toLowerCase().replace(/[–—]/g, '-');
  for (const [re, rep] of PHRASES) out = out.replace(re, rep);
  return out.replace(/[^\w\s-+&()/]/g, ' ').replace(/\s+/g, ' ').trim();
};
const tok = (s) => norm(s).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean).map(t => SYN[t] || t);
const tokenSetKey = (s) => [...new Set(tok(s))].sort().join(' ');

(async () => {
  const cueMap = buildCueMap();
  console.log(`distinct titles with cue-comments: ${cueMap.size}`);

  const sb = createClient(SUPA_URL, SUPA_KEY);
  await sb.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });
  const { data: planRow } = await sb.from('plans').select('id,name,trainee_id,data').eq('id', PLAN_ID).maybeSingle();

  // Build a token-set lookup over the cue map for tolerant matching.
  const cueByTokenKey = new Map();
  for (const [k, list] of cueMap.entries()) {
    const tk = tokenSetKey(k);
    if (!cueByTokenKey.has(tk)) cueByTokenKey.set(tk, list);
  }

  const proposed = [];
  const newDays = (planRow.data.days || []).map(d => ({
    ...d,
    exercises: d.exercises.map(ex => {
      if (typeof ex.notes === 'string' && ex.notes.trim()) return ex;
      // Try direct norm match first, then token-set.
      let hit = cueMap.get(norm(ex.title));
      if (!hit) hit = cueByTokenKey.get(tokenSetKey(ex.title));
      if (!hit) return ex;
      // Take the first hit (most-recent sheet usually wins by sheet order).
      const cue = hit[0].comment;
      proposed.push({ day: d.name, title: ex.title, source: `${hit[0].sheet}!B${hit[0].row}`, cue });
      return { ...ex, notes: cue };
    }),
  }));

  console.log(`\nproposed cue-note patches from Omer tracking xlsx: ${proposed.length}`);
  for (const p of proposed) {
    console.log(`\n• ${p.day}  ${p.title}`);
    console.log(`    source: ${p.source}`);
    console.log(`    + ${p.cue.slice(0, 220).replace(/\n/g, ' ⏎ ')}${p.cue.length > 220 ? '…' : ''}`);
  }

  if (!APPLY) {
    console.log('\n[DRY RUN] re-run with `apply` to write.');
    fs.unlinkSync(TMP_XLSX);
    process.exit(0);
  }

  const newData = { ...planRow.data, days: newDays };
  const { error: uErr } = await sb.from('plans').update({
    data: newData,
    updated_at: new Date().toISOString(),
  }).eq('id', PLAN_ID);
  fs.unlinkSync(TMP_XLSX);
  if (uErr) { console.error('update failed:', uErr); process.exit(1); }
  console.log(`\n✓ patched plan ${PLAN_ID} with ${proposed.length} cue-note patches.`);
})();
