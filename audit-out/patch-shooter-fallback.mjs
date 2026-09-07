// The pair shooter's optional 4th JOBS field clicks a tab/button by regex; a
// card title is usually a plain div, so fall back to the smallest exact match.
import fs from 'node:fs';
const f = 'scripts/shoot-prod-vs-branch.mjs';
let s = fs.readFileSync(f, 'utf8');
const from = `const el = [...document.querySelectorAll('button,[role="tab"],[role="button"],h2,h3,a')].find((b) => re.test((b.textContent || '').trim())); if (!el) return null;`;
const to = `let el = [...document.querySelectorAll('button,[role="tab"],[role="button"],h2,h3,a')].find((b) => re.test((b.textContent || '').trim())); if (!el) el = [...document.querySelectorAll('div,span,td')].filter((b) => re.test((b.textContent || '').trim()) && b.getBoundingClientRect().width > 0 && b.getBoundingClientRect().width < 500).sort((a, b) => a.textContent.length - b.textContent.length)[0]; if (!el) return null;`;
const n = s.split(from).length - 1;
if (n !== 1) throw new Error('anchor count ' + n);
fs.writeFileSync(f, s.split(from).join(to));
console.log('shooter: card-title fallback added');
