// ENGLISH LITERALS IN TRANSLATED VIEWS — a build gate.
//
// The regression class found on 2026-09-11/12: a coach view that already
// imports the translator renders an uppercase label straight into JSX
// (`>REVIEW →<`, `>← BACK<`, `placeholder="Filter athletes..."`), so the
// Hebrew screen carries one English word. The dictionary audit cannot see it;
// only a screen dump did. This scans the source instead, every build.
//
// Scope: src/*.jsx that import from './i18n', minus the athlete-portal files
// held at production. Allowlisted: brand/tech tokens, exercise-name shapes,
// single letters, and anything inside a comment. Exit 1 on findings.
//   node scripts/verify-english-literals.mjs           (gate)
//   node scripts/verify-english-literals.mjs --report  (list, exit 0)
import fs from 'node:fs';
import path from 'node:path';
const REPORT = process.argv.includes('--report');
const SKIP_FILES = new Set(['ClientPortal.jsx', 'MealLogger.jsx', 'DemoTraineePortal.jsx', 'TrySandbox.jsx']);
const ALLOW = new Set(['EXPO', 'RPE', 'ROM', 'VBT', 'BW', 'KG', 'PR', 'PRS', 'MRR', 'LTV', 'VAT', 'AI', 'OK', 'ID', 'URL', 'MP4', 'MOV', 'WEBM', 'CSV', 'PDF', 'PNG', 'JPG', 'XLSX', 'TSV', 'GB', 'MB', 'KB', 'FPS', 'HD', 'RDL', 'SLDL', 'OHP', 'DB', 'BB', 'KB', 'TRX', 'BHBC', 'ACWR', 'HRV', 'RTP', 'MD', 'PPG', 'EN', 'HE', 'LIVE', 'REC', 'A', 'B', 'C', 'D', 'E', 'W', 'L', 'R', 'X', 'N', 'Y', 'M', 'J', 'S', 'Δ', 'ATH', 'POS', 'ISO', 'SA', 'SL', 'BP', 'ECC', 'CON', 'AMRAP', 'EMOM', 'TUT', 'RIR', '1RM', 'E1RM', 'NCAA', 'CMU', 'OUI', 'TAU', 'NIS', 'ILS', 'USD', 'YT', 'GPS', 'API', 'RLS', 'SW', 'PWA', 'IOS', 'MEDIAPIPE', 'LITE', 'LOG', 'W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7', 'W8', 'W9', 'W10', 'W11', 'W12']);
const BRAND = /^(?:Google Calendar|Vercel|Supabase|WhatsApp|YouTube|Green Invoice)$/;
// A run that is really CODE: the widened bounds (} … {) can straddle a plain
// JS expression, e.g. the T() helper's own body.
const CODE_SHAPE = /\w\(|\)\.|=>|replace|const/;
const EXERCISE_SHAPE = /\b(?:DB|BB|SA|KB|TRX|RDL|SLDL|OHP|ISO|POS|ATH)\b|\d+\s*[x×]\s*\d+/i;
// Mixed case counts too. The first version only matched SHOUTING labels, so
// `>Log session<` and `>League Stats<` sat in the Hebrew club zone untouched
// for weeks - the two words a coach reads first on an athlete's card.
// A JSX text run does not have to sit between two TAGS. Half the English left
// in the app sits next to an expression - `{tr('Logs this session for')}<b>{n}</b>
// available athletes` - where only the first third was ever translated. Scan
// every run bounded by > or } on the left and < or { on the right.
const LITERAL = /[>}]\s*([A-Z][A-Za-z0-9 ·+→←✓%&/()'’.…\-–—:]{2,140}?)\s*[<{]/g;
// A tooltip is the one place the app EXPLAINS itself - the last place that
// should be in another language. 214 of them were English.
const TITLE_ATTR = /(?<![\w$])title=(?:"([A-Z][^"]{3,120})"|'([A-Z][^']{3,120})')/g;
const PLACEHOLDER = /placeholder=(?:"([A-Za-z][^"]{2,80})"|'([A-Za-z][^']{2,80})')/g;
const stripComments = (s) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, (m) => ' '.repeat(m.length)).replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length)).replace(/^\s*\/\/.*$/gm, (m) => ' '.repeat(m.length));
const isAllowed = (t) => {
  const s = t.trim();
  // A real word, not "OK" or "→". This used to demand TWO CAPITALS in a row,
  // which quietly allowed every Title Case label in the app - "Log session",
  // "View program", "League Stats" - the exact strings a coach reads first.
  if (!/[A-Za-z]{3,}/.test(s)) return true;                    // no real word
  if (s.split(/[\s·]+/).every((w) => ALLOW.has(w.replace(/[^A-Z0-9Δ]/g, '')) || /^[\d.,%₪+-]+$/.test(w) || w === '' || /^[·+→←✓%&/()'’.\-–—:]+$/.test(w))) return true;
  if (BRAND.test(s)) return true;                              // a product name is not translated
  if (CODE_SHAPE.test(s)) return true;
  if (EXERCISE_SHAPE.test(s)) return true;
  return false;
};
const findings = [];
for (const f of fs.readdirSync('src').filter((x) => x.endsWith('.jsx') && !SKIP_FILES.has(x))) {
  const raw = fs.readFileSync(path.join('src', f), 'utf8');
  // ...and the club zone, which has its OWN dictionary (bhbcHe) and was
  // therefore out of scope of a gate that only looked for ./i18n.
  if (!/from '\.\/i18n'/.test(raw) && !/from '\.\/bhbcHe'/.test(raw)) continue;
  const src = stripComments(raw);
  const lineOf = (i) => src.slice(0, i).split('\n').length;
  for (const m of src.matchAll(LITERAL)) { if (!isAllowed(m[1])) findings.push({ f, line: lineOf(m.index), text: m[1].trim(), kind: 'jsx' }); }
  // Placeholders that are DATA examples or typed confirmations stay English
  // on purpose: an email shape, a URL, "kg/%", "reps", "e.g. 83.5", and the
  // word the coach must type to confirm a delete (the check compares to it).
  const dataShape = (t) => /@|https?:|^e\.g\.|^\d|kg\/%|^reps$|delete|remove|^ohad\b|zoom\.us|\d{4}/i.test(t);
  for (const m of src.matchAll(TITLE_ATTR)) {
    const t = m[1] || m[2];
    if (/[֐-׿]/.test(t) || /\{/.test(t) || isAllowed(t)) continue;
    findings.push({ f, line: lineOf(m.index), text: t, kind: 'title' });
  }
  for (const m of src.matchAll(PLACEHOLDER)) { const t = m[1] || m[2]; if (!/[֐-׿]/.test(t) && !/\{/.test(t) && !dataShape(t)) findings.push({ f, line: lineOf(m.index), text: t, kind: 'placeholder' }); }
}
console.log(`ENGLISH LITERALS IN TRANSLATED VIEWS — ${findings.length} finding(s)`);
for (const x of findings) console.log(`  ${x.f}:${x.line}  ${x.kind.padEnd(11)} «${x.text}»`);
if (!REPORT && findings.length) process.exit(1);
