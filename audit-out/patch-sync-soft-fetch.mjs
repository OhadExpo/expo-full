// sync-revenue: a download that Google keeps behind the export queue (the
// account is paced while a revision harvest runs) must not sink the whole
// run. The two fetches become SOFT: on failure the run says so and continues
// with the newest file already on disk (the roster's newest harvested
// revision stands in for the live export), and the run still ends OK only if
// every hard step passed.
import fs from 'node:fs';
const f = 'scripts/sync-revenue.mjs';
let s = fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const rep = (a, b, l) => { const n = s.split(a).length - 1; if (n !== 1) throw new Error(l + ' x' + n); s = s.replace(a, b); console.log('ok', l); };

rep(`function run(cmd, args, label, extraEnv = {}) {`, `let softFailures = 0;
function run(cmd, args, label, extraEnv = {}, { soft = false } = {}) {`, 'signature');
rep(`  if (r.status !== 0) { say(\`FAILED: \${label} (exit \${r.status})\`); finish(1); }
  return out;`, `  if (r.status !== 0) {
    if (soft) { softFailures++; say(\`SOFT FAIL: \${label} (exit \${r.status}) - continuing with what is on disk\`); return out; }
    say(\`FAILED: \${label} (exit \${r.status})\`); finish(1);
  }
  return out;`, 'soft branch');
rep(`run('node', ['scripts/fetch-sheet-xlsx.mjs', ROSTER, 'audit-out/sheets/roster.xlsx'], 'fetch roster');
run('node', ['scripts/fetch-sheet-xlsx.mjs', FINANCE, 'audit-out/sheets/finance.xlsx'], 'fetch finance');`,
`run('node', ['scripts/fetch-sheet-xlsx.mjs', ROSTER, 'audit-out/sheets/roster.xlsx'], 'fetch roster', {}, { soft: true });
run('node', ['scripts/fetch-sheet-xlsx.mjs', FINANCE, 'audit-out/sheets/finance.xlsx'], 'fetch finance', {}, { soft: true });
// If the live export was starved, the newest harvested revision IS the sheet
// as of its last edit - use it so the parsers still see today's roster.
if (softFailures) {
  const revs = fs.readdirSync('audit-out/sheets/rev').map((x) => Number((x.match(/^r(\\d+)\\.xlsx$/) || [])[1] || 0)).filter(Boolean);
  if (revs.length) { const top = Math.max(...revs); fs.copyFileSync(\`audit-out/sheets/rev/r\${top}.xlsx\`, 'audit-out/sheets/roster.xlsx'); say(\`roster.xlsx <- r\${top} (live export starved)\`); }
}`, 'soft fetches');
rep(`say('done');
finish(0);`, `say(softFailures ? \`done with \${softFailures} soft failure(s) - the live export was starved; history and totals still refreshed\` : 'done');
finish(0);`, 'done line');
fs.writeFileSync(f, s);
