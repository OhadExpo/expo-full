// Stamp the 09-13 shift's closing numbers into handoff row 82 and restamp §3.
// Reads the numbers from disk at run time - nothing typed from memory.
//   node audit-out/patch-handoff-final-0913.mjs <HEAD sha> <ahead count> <files changed> <deploy sha>
import fs from 'node:fs';
import { execSync } from 'node:child_process';
const [head, ahead, files, deploy] = process.argv.slice(2);
if (!head || !ahead || !files || !deploy) throw new Error('usage: <HEAD> <ahead> <files> <deploy sha>');
const revs = fs.readdirSync('audit-out/sheets/rev').filter((x) => /^r\d+\.xlsx$/.test(x)).length;
const top = Math.max(...fs.readdirSync('audit-out/sheets/rev').map((x) => Number((x.match(/^r(\d+)\.xlsx$/) || [])[1] || 0)));
const d = JSON.parse(fs.readFileSync('audit-out/sheets/derived.json', 'utf8'));
const pays = d.clients.reduce((a, c) => a + c.payments.filter((p) => p.kind === 'payment').length, 0);
const cards = d.clients.reduce((a, c) => a + c.payments.filter((p) => p.kind === 'card_start').length, 0);
const sess = d.clients.reduce((a, c) => a + c.sessions.reduce((x, s) => x + s.count, 0), 0);
const priced = d.clients.reduce((a, c) => a + c.payments.filter((p) => p.amount_est != null).length, 0);
const summary = fs.readFileSync('audit-out/sheets/timeline-summary.txt', 'utf8').split('\n')[0];
const gate = execSync('node scripts/verify-billing-history.mjs', { encoding: 'utf8' }).trim().split('\n').slice(-2).join(' · ');
const recon = d.reconciliation.filter((r) => r.month >= '2026-04').map((r) => `${r.month}: est ₪${(r.gym_est || 0) + (r.online_est || 0)} vs sheet ₪${(r.gym_sheet || 0) + (r.online_sheet || 0)}`).join('; ');

const f = 'docs/HANDOFF-2026-09-06.md';
let s = fs.readFileSync(f, 'utf8');
const L = s.split('\n');
const i = L.findIndex((l) => l.startsWith('| 82 |'));
if (i < 0) throw new Error('row 82');
if (!L[i].includes('**FINAL')) {
  L[i] = L[i].replace(/ \|$/, ` **FINAL (${new Date().toISOString().slice(0, 16).replace('T', ' ')}):** ${revs} revisions on disk (to r${top}); ${summary}; ${d.clients.length} sheet clients, ${pays} payments (${priced} of ${pays + cards} priced) + ${cards} card starts, ${sess} sessions counted; gate: ${gate}; reconciliation (roster estimate vs finance sheet, gym+online, club excluded): ${recon}. The sync's fetches are SOFT since 10:33 (a starved export no longer sinks the run; the newest harvested revision stands in). |`);
}
s = L.join('\n');
const rep = (a, b) => { if (!s.includes(a)) throw new Error('missing ' + a.slice(0, 40)); s = s.replace(a, b); };
rep('| HEAD | `2da1987` (2026-09-12, 22:50) |', `| HEAD | \`${head}\` (2026-09-13) |`);
s = s.replace(/\| Ahead of `origin\/master` \| \*\*\d+ commits\*\*/, `| Ahead of \`origin/master\` | **${ahead} commits**`);
s = s.replace(/all carried on `deploy-0911` = `[0-9a-f]+`/, `all carried on \`deploy-0911\` = \`${deploy}\``);
s = s.replace(/\| `origin\/bhbc-hebrew` \| \*\*backed up\*\* at `[0-9a-f]+` — pushed [0-9-]+ [0-9:]+/, `| \`origin/bhbc-hebrew\` | **backed up** at \`${head}\` — pushed 2026-09-13`);
s = s.replace(/\| Diff vs `origin\/master` \| \*\*\d+ files\*\*[^—]*—/, `| Diff vs \`origin/master\` | **${files} files** —`);
fs.writeFileSync(f, s);
console.log('row 82 FINAL + §3 restamped:', { revs, top, pays, cards, priced, sess, head, ahead, files, deploy });
