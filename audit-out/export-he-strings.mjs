// Every Hebrew string that ships in a public bundle, with its English key, for
// the native-reader audit. Never the cue corpus (his authoring, not UI).
//   node audit-out/export-he-strings.mjs  -> audit-out/he-strings.tsv + batches
import fs from 'node:fs';
const he = (s) => /[֐-׿]/.test(s);
const un = (s) => s.replace(/\\'/g, "'");
const out = [];
// 1. app dictionary: key: 'value'
let src = fs.readFileSync('src/i18n.js', 'utf8').replace(/\r\n/g, '\n');
const dict = src.slice(src.indexOf('export const HE = {'));
for (const x of dict.matchAll(/^\s*(?:'((?:\\'|[^'])+)'|"([^"]+)"|([A-Za-z_]\w*))\s*:\s*'((?:\\'|[^'])*)',?\s*$/gm)) {
  const k = un(x[1] || x[2] || x[3]); const v = un(x[4]);
  if (he(v)) out.push(['i18n', k, v]);
}
// 2. marketing: { en: '...', he: '...' } (quotes vary)
src = fs.readFileSync('expo-il/src/i18n.js', 'utf8').replace(/\r\n/g, '\n');
for (const x of src.matchAll(/en:\s*(?:'((?:\\'|[^'])*)'|"([^"]*)"|`([^`]*)`)\s*,\s*he:\s*(?:'((?:\\'|[^'])*)'|"([^"]*)"|`([^`]*)`)/g)) {
  const en = un(x[1] || x[2] || x[3] || ''); const v = un(x[4] || x[5] || x[6] || '');
  if (he(v)) out.push(['expo-il', en, v]);
}
// 3. every Hebrew literal in the smaller sources
for (const f of ['src/shotI18n.js', 'src/autoTaskHe.js', 'src/intakeFormSchemas.js', 'src/SwUpdateBanner.jsx']) {
  const t = fs.readFileSync(f, 'utf8');
  for (const x of t.matchAll(/'((?:\\'|[^'\n])*[֐-׿](?:\\'|[^'\n])*)'|"([^"\n]*[֐-׿][^"\n]*)"/g)) out.push([f.replace('src/', ''), '', un(x[1] || x[2])]);
}
fs.writeFileSync('audit-out/he-strings.tsv', out.map((r) => r.join('\t')).join('\n'));
const by = {}; for (const r of out) by[r[0]] = (by[r[0]] || 0) + 1;
console.log(JSON.stringify(by), 'total', out.length);
// batches of 120 lines: "N | en | he"
fs.mkdirSync('audit-out/he-batches', { recursive: true });
let n = 0;
for (let i = 0; i < out.length; i += 120) {
  const lines = out.slice(i, i + 120).map((r, j) => `${i + j + 1} | ${r[0]} | ${r[1]} | ${r[2]}`);
  fs.writeFileSync(`audit-out/he-batches/batch-${++n}.txt`, lines.join('\n'));
}
console.log(n + ' batches');
