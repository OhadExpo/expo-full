// Wrap the coach demo's bare uppercase JSX literals (from demo-bare-literals.txt) in T().
import fs from 'node:fs';
const f = 'src/CoachDemo.jsx';
let s = fs.readFileSync(f, 'utf8');
const lits = fs.readFileSync('audit-out/demo-bare-literals.txt', 'utf8').split(/\r?\n/).filter(Boolean);
const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
let n = 0;
for (const lit of lits) {
  const re = new RegExp('>(\\s*)' + esc(lit) + '(\\s*)<', 'g');
  s = s.replace(re, (m, a, b) => { n++; return '>' + a + "{T('" + lit.replace(/'/g, "\\'") + "')}" + b + '<'; });
}
fs.writeFileSync(f, s);
console.log('wrapped', n, 'of', lits.length, 'literals');
