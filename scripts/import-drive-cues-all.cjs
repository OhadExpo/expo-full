// Second pass: pulls ALL remaining meakav xlsx files from this session's
// Drive downloads (older trainee versions + youth groups + ex-clients) and
// applies their cell-B comments as library cues. Cues are exercise-level
// (shared across all plans using that exercise), so a comment Ohad wrote
// on a youth-group meakav for "DB Goblet Squat" is just as valid as one
// from an active-trainee meakav.
//
// Usage: node scripts/import-drive-cues-all.cjs apply --force

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const TOOL_DIR = String.raw`C:\Users\Administrator\.claude\projects\C--Users-Administrator-Desktop-expo-full\c8f9e8b3-cfe3-4d20-b55e-dd1032e42287\tool-results`;

const FILES = [
  { name: 'Yuval Gottlieb (old)',  file: 'mcp-claude_ai_Google_Drive-download_file_content-1778578716637.txt' },
  { name: 'Amit Yehudai (old)',    file: 'mcp-claude_ai_Google_Drive-download_file_content-1778578740101.txt' },
  { name: 'Roei Hayadid',          file: 'mcp-claude_ai_Google_Drive-download_file_content-1778578761179.txt' },
  { name: 'Youth A',               file: 'mcp-claude_ai_Google_Drive-download_file_content-1778578780683.txt' },
  { name: 'Youth Pro',             file: 'mcp-claude_ai_Google_Drive-download_file_content-1778578810565.txt' },
  { name: 'Youth B',               file: 'mcp-claude_ai_Google_Drive-download_file_content-1778578843731.txt' },
  { name: 'Sahar Edmoni',          file: 'mcp-claude_ai_Google_Drive-download_file_content-1778578869138.txt' },
  { name: 'Oriya Aharon',          file: 'mcp-claude_ai_Google_Drive-download_file_content-1778578890217.txt' },
  { name: 'Eyal Rehab',            file: 'mcp-claude_ai_Google_Drive-download_file_content-1778578907810.txt' },
  { name: 'Youth National',        file: 'mcp-claude_ai_Google_Drive-download_file_content-1778578933300.txt' },
  { name: 'Kids',                  file: 'mcp-claude_ai_Google_Drive-download_file_content-1778578952734.txt' },
  { name: 'Michal Kay',            file: 'mcp-claude_ai_Google_Drive-download_file_content-1778578970870.txt' },
];

const APPLY = process.argv.includes('apply');
const FORCE = process.argv.includes('--force');
const TMP = path.join(__dirname, '..', 'tmp-drive-xlsx');
if (!fs.existsSync(TMP)) fs.mkdirSync(TMP, { recursive: true });

let totalWritten = 0;
for (const f of FILES) {
  const fpath = path.join(TOOL_DIR, f.file);
  if (!fs.existsSync(fpath)) { console.log(`[skip] ${f.name} — tool-result missing`); continue; }
  const obj = JSON.parse(fs.readFileSync(fpath, 'utf8'));
  if (!obj.content) { console.log(`[skip] ${f.name} — no content`); continue; }
  const buf = Buffer.from(obj.content, 'base64');
  const xlsxPath = path.join(TMP, `${f.name.replace(/[^a-z0-9]/gi, '_')}.xlsx`);
  fs.writeFileSync(xlsxPath, buf);
  console.log(`\n[${f.name}] ${obj.title} — ${(buf.length / 1024).toFixed(0)} KB`);
  const args = ['scripts/import-ron-cues.cjs'];
  if (APPLY) args.push('apply');
  if (FORCE) args.push('--force');
  args.push(xlsxPath);
  try {
    const out = execSync(`node ${args.map(a => `"${a}"`).join(' ')}`, { encoding: 'utf8', maxBuffer: 100 * 1024 * 1024 });
    const m = out.match(/Wrote (\d+) cue updates/);
    const dry = out.match(/Hits \(will write\): (\d+)/);
    if (m) { console.log(`  ✓ Wrote ${m[1]} cues`); totalWritten += parseInt(m[1]); }
    else if (dry) console.log(`  (dry-run) would write ${dry[1]} cues`);
    else console.log(out.slice(-300));
  } catch (e) {
    console.error(`  ✗ ${f.name} failed:`, e.message.slice(0, 300));
  }
}

if (APPLY) console.log(`\n=== TOTAL: ${totalWritten} cues written across ${FILES.length} files ===`);
