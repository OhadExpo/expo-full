// Every string literal passed to a translator (tt / tb / T / TN / tr(readLang(), …)
// / trFn(readLang(), …) / t( in files whose t = useT()) that has NO Hebrew in the
// dictionary. A wrapped key with no entry renders English on a Hebrew screen,
// and no gate looked. Club zone files resolve through bhbcHe.
import fs from 'node:fs';
import path from 'node:path';
import { tr } from '../src/i18n.js';
import { bhbcT } from '../src/bhbcHe.js';
const HEB = /[֐-׿]/;
const rows = [];
for (const f of fs.readdirSync('src').filter((x) => /\.(jsx|js)$/.test(x))) {
  if (/^(i18n|bhbcHe|shotI18n|autoTaskHe)\.js$/.test(f)) continue;
  const raw = fs.readFileSync(path.join('src', f), 'utf8');
  const src = raw.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/^\s*\/\/.*$/gm, (m) => ' '.repeat(m.length));
  const club = /^Bhbc/.test(f) || /from '\.\/bhbcHe'/.test(raw) && !/from '\.\/i18n'/.test(raw);
  const tIsTranslator = /const t = use(?:App)?T\(\)/.test(raw);
  const pats = [
    /\b(?:tt|tb|T|TN)\(\s*(['"])((?:\\.|(?!\1).)*)\1\s*[,)]/g,
    /\b(?:tr|trFn)\(\s*(?:readLang\(\)|lang|'he')\s*,\s*(['"])((?:\\.|(?!\1).)*)\1\s*\)/g,
  ];
  if (tIsTranslator) pats.push(/(?<![\w.$])t\(\s*(['"])((?:\\.|(?!\1).)*)\1\s*\)/g);
  if (club) pats.push(/(?<![\w.$])tr\(\s*(['"])((?:\\.|(?!\1).)*)\1\s*\)/g);
  const lineOf = (i) => src.slice(0, i).split('\n').length;
  for (const re of pats) {
    for (const m of src.matchAll(re)) {
      const key = m[2].replace(/\\'/g, "'").replace(/\\"/g, '"');
      if (!/[A-Za-z]{2}/.test(key) || HEB.test(key)) continue;
      const he = club ? bhbcT('he', key) : tr('he', key);
      if (he === key) rows.push({ f, line: lineOf(m.index), key });
    }
  }
}
const byKey = new Map();
for (const r of rows) { if (!byKey.has(r.key)) byKey.set(r.key, []); byKey.get(r.key).push(`${r.f}:${r.line}`); }
fs.writeFileSync('audit-out/_missing-keys.json', JSON.stringify([...byKey.entries()].map(([key, at]) => ({ key, at })), null, 2));
console.log(`wrapped keys with no Hebrew: ${byKey.size} distinct, ${rows.length} call sites`);
const perFile = {}; for (const r of rows) perFile[r.f] = (perFile[r.f] || 0) + 1;
console.log(Object.entries(perFile).sort((a, b) => b[1] - a[1]).map(([f, n]) => `  ${String(n).padStart(4)} ${f}`).join('\n'));
