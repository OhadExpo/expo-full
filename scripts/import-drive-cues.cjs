// Decodes saved Google Drive download tool-result JSON files (base64
// xlsx content), writes them as temp xlsx, then runs the cue importer
// against each. One-time use to backfill library cues for active
// trainees whose meakav files live in Drive (not in the repo).
//
// Usage:
//   node scripts/import-drive-cues.cjs              # dry-run all listed
//   node scripts/import-drive-cues.cjs apply        # apply
//   node scripts/import-drive-cues.cjs apply --force # overwrite existing

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const TOOL_DIR = String.raw`C:\Users\Administrator\.claude\projects\C--Users-Administrator-Desktop-expo-full\0284ceaa-0109-436d-91b7-8ffec566cf1d\tool-results`;

// Tool-result files just downloaded — order matters: oldest version of a
// trainee's file first so the LATEST overrides if --force is on. Keep
// active trainees only; ignore youth-group / archived clients.
const FILES = [
  { name: 'Roei Hatzvi',     file: 'mcp-claude_ai_Google_Drive-download_file_content-1778578313995.txt' },
  { name: 'Yuval Berko',     file: 'mcp-claude_ai_Google_Drive-download_file_content-1778578339760.txt' },
  { name: 'Yuval Gottlieb',  file: 'mcp-claude_ai_Google_Drive-download_file_content-1778578359922.txt' },
  { name: 'Tal Siaonov',     file: 'mcp-claude_ai_Google_Drive-download_file_content-1778578380858.txt' },
  { name: 'Amit Yehudai',    file: 'mcp-claude_ai_Google_Drive-download_file_content-1778578401562.txt' },
];

const APPLY = process.argv.includes('apply');
const FORCE = process.argv.includes('--force');
const TMP = path.join(__dirname, '..', 'tmp-drive-xlsx');
if (!fs.existsSync(TMP)) fs.mkdirSync(TMP, { recursive: true });

let totalWritten = 0;
for (const f of FILES) {
  const fpath = path.join(TOOL_DIR, f.file);
  if (!fs.existsSync(fpath)) { console.log(`[skip] ${f.name} — file missing`); continue; }
  const obj = JSON.parse(fs.readFileSync(fpath, 'utf8'));
  const buf = Buffer.from(obj.content, 'base64');
  const xlsxPath = path.join(TMP, `${f.name.replace(/[^a-z0-9]/gi, '_')}.xlsx`);
  fs.writeFileSync(xlsxPath, buf);
  console.log(`\n========================================`);
  console.log(`[${f.name}] (${obj.title}) — ${(buf.length / 1024).toFixed(0)} KB`);
  console.log(`========================================`);
  const args = ['scripts/import-ron-cues.cjs'];
  if (APPLY) args.push('apply');
  if (FORCE) args.push('--force');
  args.push(xlsxPath);
  try {
    const out = execSync(`node ${args.map(a => `"${a}"`).join(' ')}`, { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
    // Find the "Wrote N cue updates" line
    const m = out.match(/Wrote (\d+) cue updates/);
    const dry = out.match(/Hits \(will write\): (\d+)/);
    if (m) { console.log(`✓ Wrote ${m[1]} cues`); totalWritten += parseInt(m[1]); }
    else if (dry) console.log(`(dry-run) would write ${dry[1]} cues`);
    else console.log(out.slice(-500));
  } catch (e) {
    console.error(`✗ ${f.name} failed:`, e.message.slice(0, 200));
  }
}

if (APPLY) console.log(`\n=== TOTAL: ${totalWritten} cues written across ${FILES.length} files ===`);
