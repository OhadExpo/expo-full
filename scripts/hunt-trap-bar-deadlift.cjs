// Same pattern as hunt-elevated-heel-goblet — sweep all 7 saved tracking
// xlsx files for any "Trap Bar Deadlift" / "Trap-Bar DL" variant and
// surface cell-comment cues + col-D hyperlinks.

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const TOOL_DIR = String.raw`C:\Users\Administrator\.claude\projects\C--Users-Administrator-Desktop-expo-full\74b0903a-3c89-42ca-8869-7f524acc8c9e\tool-results`;
const SAVED = [
  { name: 'Omer Sadeh',          file: 'mcp-claude_ai_Google_Drive-download_file_content-1778350998050.txt' },
  { name: 'Yuval Gottlieb (old)', file: 'mcp-claude_ai_Google_Drive-download_file_content-1778351077236.txt' },
  { name: 'Yuval Berko #1',      file: 'mcp-claude_ai_Google_Drive-download_file_content-1778351087521.txt' },
  { name: 'Roey Hayedid',        file: 'mcp-claude_ai_Google_Drive-download_file_content-1778351097781.txt' },
  { name: 'Roey Hatzvi',         file: 'mcp-claude_ai_Google_Drive-download_file_content-1778353221758.txt' },
  { name: 'Ron Yonker',          file: 'mcp-claude_ai_Google_Drive-download_file_content-1778353234755.txt' },
  { name: 'Yuval Berko #2',      file: 'mcp-claude_ai_Google_Drive-download_file_content-1778353247463.txt' },
];

// Match any trap-bar deadlift variant: "Trap Bar Deadlift", "Trap-Bar DL",
// "Low-Handles Trap-Bar Deadlift", "Trap Bar B-Stance Deadlift", etc.
const matches = (title) => /trap[-\s]?bar.+(deadlift|dl)\b/i.test(title);

console.log('hunt: any "Trap Bar / Trap-Bar Deadlift" variant\n');

for (const blob of SAVED) {
  const fpath = path.join(TOOL_DIR, blob.file);
  if (!fs.existsSync(fpath)) { console.log(`[skip] ${blob.name} — missing`); continue; }
  const obj = JSON.parse(fs.readFileSync(fpath, 'utf8'));
  const buf = Buffer.from(obj.content, 'base64');
  const tmp = path.join(__dirname, '..', `_tmp_tbdl_${Date.now()}_${Math.random().toString(36).slice(2,6)}.xlsx`);
  fs.writeFileSync(tmp, buf);
  const wb = XLSX.readFile(tmp);
  let any = false;
  for (const sn of wb.SheetNames) {
    const ws = wb.Sheets[sn];
    if (!ws['!ref']) continue;
    const range = XLSX.utils.decode_range(ws['!ref']);
    for (let r = range.s.r; r <= range.e.r; r++) {
      for (const c of [1, 2]) {
        const titleCell = ws[XLSX.utils.encode_cell({ r, c })];
        const title = String(titleCell?.v ?? '').trim();
        if (!title || !matches(title)) continue;
        const cue = (titleCell?.c?.[0]?.t || '').trim();
        let url = '';
        for (let cc = range.s.c; cc <= range.e.c; cc++) {
          const cell = ws[XLSX.utils.encode_cell({ r, c: cc })];
          if (cell?.l?.Target) { url = cell.l.Target; break; }
        }
        any = true;
        console.log(`[${blob.name}] ${sn} row ${r+1}`);
        console.log(`  title: ${title}`);
        if (url) console.log(`  url:   ${url}`);
        if (cue) console.log(`  cue:   ${cue.slice(0, 280).replace(/\n/g, ' ⏎ ')}${cue.length > 280 ? '…' : ''}`);
        console.log();
      }
    }
  }
  if (!any) console.log(`[${blob.name}] no trap-bar deadlift row\n`);
  fs.unlinkSync(tmp);
}
