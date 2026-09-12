// Let the English-literal gate's label pattern accept a trailing ellipsis
// ("LOADING PLAN…" slipped past it because … was not in the class).
import fs from 'node:fs';
const f = 'scripts/verify-english-literals.mjs';
let s = fs.readFileSync(f, 'utf8');
const from = "const LITERAL = />\\s*([A-Z][A-Z0-9 ·+→←✓%&/()'’.\\-–—:]{2,48}?)\\s*</g;";
const to = "const LITERAL = />\\s*([A-Z][A-Z0-9 ·+→←✓%&/()'’.…\\-–—:]{2,48}?)\\s*</g;";
if (!s.includes(from)) throw new Error('pattern line not found');
s = s.replace(from, to);
fs.writeFileSync(f, s);
console.log('patched');
