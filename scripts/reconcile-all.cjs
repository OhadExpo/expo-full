// Download every athlete's Drive sheet and reconcile it against the app.
//
// Ohad: "make sure there are no gaps from any Google Drive sheet item to the
// EXPO programs — exercises, notes, sets, reps, tempo and urls."
//
// Downloads through the logged-in debug Chrome (scripts/_export-gsheet.mjs) so
// nothing large passes through a model context, then runs the field-level
// reconciler per athlete and prints one combined table.
//
// Usage: node scripts/reconcile-all.cjs [outDir] [--skip-download]
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const OUT = process.argv[2] || 'C:/Users/ADMINI~1/AppData/Local/Temp/claude/C--Users-Administrator-Desktop-expo-full/1b998d45-0533-4d88-921c-50467a82acaf/scratchpad/sheets';
const SKIP_DL = process.argv.includes('--skip-download');

// trainee id → Drive file id. Built from the Drive titles; the English sheets
// are "<Name> - Training Program", the older Hebrew ones "מעקב <name>".
// The table (trainee id, slug, Drive file id) is CLIENT DATA and lives in the
// gitignored scripts/sheet-map.local.json - the repo is public (29.9 audit).
const SHEETS = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'sheet-map.local.json'), 'utf8')).sheets; }
  catch { console.error('scripts/sheet-map.local.json is missing (it is local only: restore it from expo-private-backups).'); process.exit(1); }
})();

fs.mkdirSync(OUT, { recursive: true });
const results = [];
for (const [trainee, slug, fileId] of SHEETS) {
  const xlsx = path.join(OUT, `${slug}.xlsx`);
  if (!SKIP_DL && !fs.existsSync(xlsx)) {
    try {
      execFileSync('node', ['scripts/_export-gsheet.mjs', fileId, xlsx], { stdio: 'pipe', timeout: 180000 });
    } catch (e) {
      console.log(`DOWNLOAD FAILED  ${slug}  ${String(e.message).split('\n')[0].slice(0, 70)}`);
      results.push({ slug, trainee, error: 'download failed' });
      continue;
    }
  }
  if (!fs.existsSync(xlsx)) { results.push({ slug, trainee, error: 'no file' }); continue; }
  const json = path.join(OUT, `${slug}.json`);
  try {
    const out = execFileSync('node', ['scripts/reconcile-sheet-vs-app.cjs', xlsx, trainee, '--json', json],
      { encoding: 'utf8', timeout: 300000 });
    const head = out.split('\n').find((l) => l.startsWith('sheet:')) || '';
    const r = JSON.parse(fs.readFileSync(json, 'utf8'));
    const tot = Object.entries(r.gaps).filter(([k]) => k !== 'rehosted' && k !== 'extraRow').reduce((a, [, v]) => a + v.length, 0);
    results.push({ slug, trainee, head, gaps: r.gaps, fixes: r.fixes || [], total: tot, compared: r.compared, sheetRows: r.sheetRows });
  } catch (e) {
    console.log(`RECONCILE FAILED ${slug}: ${String(e.message).split('\n')[0].slice(0, 90)}`);
    results.push({ slug, trainee, error: 'reconcile failed' });
  }
}

console.log('\n================ COMBINED ================');
const cats = ['missingBlock', 'missingDay', 'missingRow', 'extraRow', 'sets', 'reps', 'tempo', 'notes', 'superset', 'warmup', 'url'];
console.log('athlete'.padEnd(22) + 'rows  cmp  ' + cats.map((c) => c.slice(0, 6).padStart(7)).join('') + '   TOTAL');
const totals = Object.fromEntries(cats.map((c) => [c, 0]));
const allFixes = [];
let grand = 0;
for (const r of results) {
  if (r.error) { console.log(r.slug.padEnd(22) + '  ' + r.error); continue; }
  cats.forEach((c) => { totals[c] += r.gaps[c].length; });
  grand += r.total;
  allFixes.push(...(r.fixes || []));
  console.log(r.slug.padEnd(22) + String(r.sheetRows).padStart(4) + String(r.compared).padStart(5) + '  '
    + cats.map((c) => String(r.gaps[c].length).padStart(7)).join('') + String(r.total).padStart(8));
}
console.log('-'.repeat(22 + 11 + cats.length * 7 + 8));
console.log('ALL'.padEnd(22) + '           ' + cats.map((c) => String(totals[c]).padStart(7)).join('') + String(grand).padStart(8));
fs.writeFileSync(path.join(OUT, '_combined.json'), JSON.stringify(results, null, 2));
fs.writeFileSync(path.join(OUT, '_fixes.json'), JSON.stringify(allFixes, null, 2));
console.log(`applicable fixes queued: ${allFixes.length} (extraRow excluded from TOTAL — app-side extras)`);
console.log('\nwrote', path.join(OUT, '_combined.json'));
