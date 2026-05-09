// Decode the Drive-downloaded xlsx (saved as base64 JSON by the MCP), parse it,
// and dump (title, videoLink-from-cell-hyperlink) pairs that match the
// Block #8 gap titles. Mirrors scripts/extract-meakav-hyperlinks.cjs pattern.

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const TOOL_RESULT = String.raw`C:\Users\Administrator\.claude\projects\C--Users-Administrator-Desktop-expo-full\74b0903a-3c89-42ca-8869-7f524acc8c9e\tool-results\mcp-claude_ai_Google_Drive-download_file_content-1778337023479.txt`;

const raw = fs.readFileSync(TOOL_RESULT, 'utf8');
const obj = JSON.parse(raw);
const buf = Buffer.from(obj.content, 'base64');

const TMP_XLSX = path.join(__dirname, '..', '_tmp_final_exercise_library.xlsx');
fs.writeFileSync(TMP_XLSX, buf);
console.log(`wrote ${TMP_XLSX} (${buf.length} bytes)`);

const wb = XLSX.readFile(TMP_XLSX, { cellHTML: false });
console.log('sheets:', wb.SheetNames);

// We're looking for Block #8 gap titles, plus partial-match candidates the
// library scan flagged as "close" so we can confirm an exact name match
// might exist with subtle spelling differences.
const TARGETS = [
  'Continiuous Overhead Med Ball Throw',
  'Continuous Overhead Med Ball Throw',
  'Banded Crab-POS Raise',
  'Side-Plank POS Hand to Toe',
  'Trap Bar Squat Jump',
  'Trap-Bar Squat Jump',
  'Chest-Supported T-Bar MID-POS Row',
  'Elevated Floating-Heel Banded Hip-Thrust POGO Jump',
  'Prone-Laying Supinated to Pronated SA DB Y-Raise',
  // Library entries that exist but lack videoLink — search for them too in
  // case the master sheet has the URL even though the in-app library doesn't.
  'DB Chest Press',
  'Power Chin-Up',
  'GHD SL ABs Sit-Up',
  'Supinated Inverted Row',
  'ATH-POS SA DB Row',
  'Machine SL Extension',
  'Laying Elbow-Supported Knee Extension',
];

const norm = (s) => String(s || '').toLowerCase()
  .replace(/[–—]/g, '-')
  .replace(/[^a-z0-9 ]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();
const tokenSet = (s) => [...new Set(norm(s).split(' ').filter(Boolean))].sort().join(' ');
const targetKeys = new Map(TARGETS.map(t => [tokenSet(t), t]));

for (const sn of wb.SheetNames) {
  const ws = wb.Sheets[sn];
  if (!ws['!ref']) continue;
  const range = XLSX.utils.decode_range(ws['!ref']);

  for (let r = range.s.r; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = ws[addr];
      if (!cell) continue;
      const text = String(cell.v ?? '').trim();
      if (!text) continue;
      const k = tokenSet(text);
      if (!targetKeys.has(k)) continue;

      const rowCells = [];
      for (let cc = range.s.c; cc <= range.e.c; cc++) {
        const a = XLSX.utils.encode_cell({ r, c: cc });
        const ce = ws[a];
        if (!ce) continue;
        const val = String(ce.v ?? '').trim();
        const link = ce.l?.Target || '';
        if (val || link) rowCells.push({ col: cc, val, link });
      }

      console.log(`\n[${sn} ${addr}]  TITLE = ${text}`);
      for (const rc of rowCells) {
        const colLetter = XLSX.utils.encode_col(rc.col);
        const v = rc.val.length > 80 ? rc.val.slice(0, 80) + '…' : rc.val;
        const linkPart = rc.link ? `   ↗ ${rc.link}` : '';
        console.log(`   ${colLetter}: ${v}${linkPart}`);
      }
    }
  }
}
