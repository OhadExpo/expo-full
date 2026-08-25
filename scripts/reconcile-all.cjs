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
const SHEETS = [
  ['tr_omer',            'omer-sadeh',        '1Ruy8TndzYj6G174E__-_jdecSJbyWF8JFQU3ilI57uA'],
  ['tr_diego',           'diego-day',         '1ro0rTvqF3XC5lSqD6VJCVtOX047b0xX2SvoYgxM4PII'],
  ['tr_jordon',          'jordon-varnado',    '1DdSFbVocnN4OVfnlh-Iv6Ykdvz6UM_43RcTbySYyl-E'],
  ['tr_nadav',           'nadav-blachar',     '1SWDaXPnnjP0BlBSVoXAd-KEG0JiTQK0d6DD85H1LmfY'],
  ['tr_shalev',          'shalev-lugashi',    '1WkUE4MpyNTev87PcRXm2tBcOrXIhP_bdtP1kgngAx0c'],
  ['tr_frederic',        'frederic-bourdillon','1djo-bxdvOTg8C6BmCAQ5AGM6acz1UbiEGX0Q3Hngl0Y'],
  ['tr_daeshon',         'daeshon-francis',   '1XpqVIKrlJkHQyUfAqLkQXZemOzN5wbci4pIe6G_gz-s'],
  ['tr_yoav',            'yoav-shamri',       '1d76cUEKNRx1Ymq_MUVfSL6d3_i_jv0Z6YnT-HBkgPKk'],
  ['tr_bh_qub3j221ly2',  'zack-bryant',       '1HqFto_HcpOdL6zuV5lwM3Y0hdbcnHCSD1TI8O_zeTlo'],
  ['tr_bh_2noztwj1ly3',  'dj-burns',          '1GTlKqcohsC8HK1oN1qHqnK2dgPQ084CeR2OfznqsvxI'],
  ['tr_bh_72laxfv1ly3',  'noah-carter',       '1brLTg6FAXf08MPEuZ_eIvTlxgfUgshAYuWFZbiT7XfQ'],
  ['tr_yuval',           'yuval-barko',       '1lDxT6dJUdds1Q55rs9AcLot3chO6uff5p3-LVj5J8d4'],
  ['tr_ron',             'ron-yunker',        '1LoQaBIWjK4IXPvL0V6IpotlUgHGuSZKtfW3VlCXN0GQ'],
  ['tr_roei',            'roei-hatzvi',       '1fVGi1NF9hdPr-yfk2tdgEu2WSY-7s4eqjsQ15idRr9o'],
  ['tr_ayelet',          'ayelet-kazatzev',   '1gMrqMC3WgF70bPWEepMXCsyq08M-I9H75dGiQaWL85w'],
  ['tr_yuval_gotlib',    'yuval-gotliv',      '18y2uNxeQjEtjnGZ-5o8vtRd126ejhVPnG8_AA1uCi0o'],
  ['tr_amit',            'amit-yehudai',      '1wd18MB4_hCqzRfDsPDGdzea1J5KA98pmXxW7ZnLiMy4'],
  ['tr_ylc4i7edmnxqyj3j','ohad',              '1piyukreppOWWq0bGqGQoBB86EBzZjV7zbu9M9irI_go'],
];

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
const cats = ['missingBlock', 'missingDay', 'missingRow', 'extraRow', 'sets', 'reps', 'tempo', 'notes', 'superset', 'url'];
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
