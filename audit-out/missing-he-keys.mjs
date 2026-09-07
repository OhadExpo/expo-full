// Which strings does the code hand to the translator that the Hebrew dictionary
// does not hold? Those render English silently - the failure the 08-28 sweep
// called "coverage". Mechanical, so it is a script and not a reading.
//   node audit-out/missing-he-keys.mjs [--json]
import fs from 'node:fs';
const i18n = fs.readFileSync('src/i18n.js', 'utf8');
const keys = new Set([...i18n.matchAll(/^\s*(?:'((?:\\'|[^'])+)'|"((?:\\"|[^"])+)"|([A-Za-z_][\w]*))\s*:/gm)].map((m) => (m[1] || m[2] || m[3]).replace(/\\'/g, "'").toLowerCase()));
const files = fs.readdirSync('src').filter((f) => /\.(jsx|js)$/.test(f) && !/^(i18n|bhbcHe|shotI18n)\.js$/.test(f));
const missing = new Map(); // key -> Set(files)
for (const f of files) {
  const s = fs.readFileSync('src/' + f, 'utf8');
  for (const m of s.matchAll(/\b(?:tt|t|tr\([^,]+,)\s*\(?\s*(['"])((?:\\\1|(?!\1).)+)\1\s*\)/g)) {
    const k = m[2].replace(/\\'/g, "'");
    if (!/[A-Za-z]{2,}/.test(k)) continue;
    if (keys.has(k.toLowerCase())) continue;
    if (!missing.has(k)) missing.set(k, new Set());
    missing.get(k).add(f);
  }
}
const rows = [...missing.entries()].sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0]));
if (process.argv.includes('--json')) { console.log(JSON.stringify(rows.map(([k, fs]) => ({ key: k, files: [...fs] })), null, 1)); }
else {
  console.log(`${rows.length} strings reach the translator and have no Hebrew (${keys.size} keys in the dictionary)`);
  const byFile = {};
  for (const [k, fset] of rows) for (const f of fset) { byFile[f] = byFile[f] || []; byFile[f].push(k); }
  for (const [f, ks] of Object.entries(byFile).sort((a, b) => b[1].length - a[1].length)) console.log(`\n${f} (${ks.length})\n  ${ks.map((k) => JSON.stringify(k)).join('  ')}`);
}
