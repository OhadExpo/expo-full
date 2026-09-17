// Wrap what verify-english-literals.mjs reports: `>LABEL<` → `>{tt('LABEL')}<`
// and placeholder="…" → placeholder={tt('…')} in translated coach views,
// using each file's own translator name (tt / t / T); files with none get
// tr(readLang(), …) and the import. ESLint afterwards catches any wrap that
// landed outside the translator's scope — those are fixed by hand.
//   node scripts/codemod-wrap-english-literals.mjs [--dry]
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const DRY = process.argv.includes('--dry');
const rep = spawnSync(process.execPath, ['scripts/verify-english-literals.mjs', '--report'], { encoding: 'utf8' }).stdout;
const findings = [...rep.matchAll(/^\s+(\S+\.jsx):(\d+)\s+(jsx|placeholder)\s+«(.+)»$/gm)].map((m) => ({ f: m[1], line: +m[2], kind: m[3], text: m[4] }));
const byFile = new Map();
for (const x of findings) { if (!byFile.has(x.f)) byFile.set(x.f, []); byFile.get(x.f).push(x); }
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const q = (s) => "'" + s.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
let total = 0;
for (const [f, list] of byFile) {
  const p = path.join('src', f);
  let s = fs.readFileSync(p, 'utf8');
  const crlf = s.includes('\r\n'); if (crlf) s = s.replace(/\r\n/g, '\n');
  const name = f === 'CoachDemo.jsx' ? 'T' : /const tt = use(?:App)?T\(\)/.test(s) ? 'tt' : /const t = useT\(\)/.test(s) ? 't' : null;
  const call = name ? (x) => `${name}(${q(x)})` : (x) => `tr(readLang(), ${q(x)})`;
  if (!name && !/\{[^}]*\btr\b[^}]*\} from '\.\/i18n'/.test(s)) {
    s = s.replace(/^(import [^\n]*from '\.\/i18n';)/m, (m) => m.replace(/\{/, '{ tr, readLang,'));
  }
  let n = 0;
  for (const x of list) {
    if (x.kind === 'jsx') {
      const re = new RegExp('>(\\s*)' + esc(x.text) + '(\\s*)<');
      if (re.test(s)) { s = s.replace(re, (m, a, b) => '>' + a + '{' + call(x.text) + '}' + b + '<'); n++; }
    } else {
      const re = new RegExp('placeholder=(?:"' + esc(x.text) + '"|\'' + esc(x.text) + '\')');
      if (re.test(s)) { s = s.replace(re, 'placeholder={' + call(x.text) + '}'); n++; }
    }
  }
  total += n;
  console.log(String(n).padStart(4), f, name || '(tr)');
  if (!DRY) fs.writeFileSync(p, crlf ? s.replace(/\n/g, '\r\n') : s);
}
console.log(`${total} wrapped in ${byFile.size} files${DRY ? ' (dry)' : ''}`);
