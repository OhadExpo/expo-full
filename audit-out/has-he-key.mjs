// Which of these strings have a Hebrew entry? (case-insensitive, like tr()).
//   node audit-out/has-he-key.mjs "Monthly" "NO LOGS" ...
import fs from 'node:fs';
const s = fs.readFileSync('src/i18n.js', 'utf8');
const keys = new Set([...s.matchAll(/(?:^\s*|[{,]\s*)(?:'((?:\\'|[^'])+)'|"([^"]+)"|([A-Za-z_]\w*))\s*:/gm)].map((m) => (m[1] || m[2] || m[3]).replace(/\\'/g, "'").toLowerCase()));
console.log(`${keys.size} keys`);
const miss = [];
for (const w of process.argv.slice(2)) (keys.has(w.toLowerCase()) ? [] : miss).push(w);
console.log('MISSING: ' + miss.map((w) => JSON.stringify(w)).join(' '));
