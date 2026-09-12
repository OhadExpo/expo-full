// Every string handed to a translator anywhere in src (tt('…'), t('…'),
// T('…'), tr(readLang(), '…'), tr(lang, '…')) that has no Hebrew key.
import fs from 'node:fs';
import path from 'node:path';
const dictSrc = fs.readFileSync('src/i18n.js', 'utf8');
const dict = dictSrc.slice(dictSrc.indexOf('export const HE = {'));
const keys = new Set();
for (const m of dict.matchAll(/^\s*(?:'((?:\\'|[^'])+)'|"([^"]+)"|([A-Za-z_]\w*))\s*:\s*'/gm)) keys.add((m[1] || m[2] || m[3]).replace(/\\'/g, "'").toLowerCase());
const seen = new Map();
for (const f of fs.readdirSync('src').filter((x) => /\.jsx?$/.test(x) && x !== 'i18n.js')) {
  const s = fs.readFileSync(path.join('src', f), 'utf8');
  for (const m of s.matchAll(/\b(?:tt|t|T|tb)\('((?:\\'|[^'\n])*)'\)|\btr\((?:readLang\(\)|lang|l)\s*,\s*'((?:\\'|[^'\n])*)'\)/g)) {
    const k = (m[1] ?? m[2] ?? '').replace(/\\'/g, "'");
    if (!k || /[֐-׿]/.test(k)) continue;
    if (!keys.has(k.toLowerCase())) { if (!seen.has(k)) seen.set(k, f); }
  }
}
const list = [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
console.log(`${list.length} translator strings without a Hebrew key`);
for (const [k, f] of list) console.log(`${f.padEnd(22)} ${k}`);
fs.writeFileSync('audit-out/missing-keys-all.txt', list.map(([k, f]) => `${f}\t${k}`).join('\n'));
