// Add HE dictionary keys from a JSON file of [key, hebrew] pairs; skips keys
// that already exist (case-insensitive, tr() is case-insensitive too).
//   node audit-out/add-keys.mjs audit-out/keys-xyz.json
import fs from 'node:fs';
const f = 'src/i18n.js';
let s = fs.readFileSync(f, 'utf8');
const anchor = `  "Compare with…": 'השווה עם…',`;
if (s.split(anchor).length !== 2) throw new Error('anchor');
const add = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const esc = (k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const fresh = add.filter(([k]) => !new RegExp(`^\\s*["']?${esc(k)}["']?\\s*:`, 'mi').test(s));
if (fresh.length) s = s.replace(anchor, anchor + '\n' + fresh.map(([k, v]) => `  "${k}": '${v.replace(/'/g, "\\'")}',`).join('\n'));
fs.writeFileSync(f, s);
console.log('added', fresh.length, fresh.map(([k]) => k).join(', ') || '(none)');
