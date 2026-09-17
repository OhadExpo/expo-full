// CoachDemo translation coverage: T('…') strings without a Hebrew key, and
// uppercase JSX literals still bare.
import fs from 'node:fs';
const src = fs.readFileSync('src/CoachDemo.jsx', 'utf8');
const dict = fs.readFileSync('src/i18n.js', 'utf8').slice(fs.readFileSync('src/i18n.js', 'utf8').indexOf('export const HE = {'));
const keys = new Set();
for (const m of dict.matchAll(/^\s*(?:'((?:\\'|[^'])+)'|"([^"]+)"|([A-Za-z_]\w*))\s*:\s*'/gm)) keys.add((m[1] || m[2] || m[3]).replace(/\\'/g, "'").toLowerCase());
const used = [...src.matchAll(/\bT\('((?:\\'|[^'])*)'\)/g)].map((m) => m[1].replace(/\\'/g, "'"));
const missing = [...new Set(used.filter((u) => !keys.has(u.toLowerCase())))];
const bare = [...new Set([...src.matchAll(/>\s*([A-Z][A-Z0-9 ·+→←✓%&/()'’.-]{2,40})\s*</g)].map((m) => m[1].trim()))];
console.log(`T() calls ${used.length} · distinct ${new Set(used).size} · missing keys ${missing.length} · bare uppercase literals ${bare.length}`);
fs.writeFileSync('audit-out/demo-missing-keys.txt', missing.join('\n'));
fs.writeFileSync('audit-out/demo-bare-literals.txt', bare.join('\n'));
console.log('MISSING:\n' + missing.slice(0, 80).join(' | '));
console.log('BARE:\n' + bare.slice(0, 60).join(' | '));
