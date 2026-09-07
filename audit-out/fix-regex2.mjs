// Repair the install-prompt dismiss line in the builder: a heredoc had eaten
// the backslashes and left real tab/newline characters inside the regex.
import fs from 'node:fs';
const f = 'scripts/build-before-after.mjs';
let s = fs.readFileSync(f, 'utf8');
const start = s.indexOf("const b = [...document.querySelectorAll('button')].find((e) => /^[");
if (start < 0) throw new Error('dismiss line not found');
const end = s.indexOf(".test(e.textContent || ''));", start);
if (end < 0) throw new Error('dismiss line end not found');
const good = String.raw`const b = [...document.querySelectorAll('button')].find((e) => /^\s*(אחר כך|later|not now|maybe later|לא עכשיו)\s*$/i`;
s = s.slice(0, start) + good + s.slice(end);
fs.writeFileSync(f, s);
console.log('dismiss line repaired');
