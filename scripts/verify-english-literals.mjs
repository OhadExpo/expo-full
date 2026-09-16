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
const BRAND = /^(?:Google Calendar|Vercel|Supabase|WhatsApp|YouTube|Green Invoice|Safari)$/;
// A run that is really CODE: the widened bounds (} … {) can straddle a plain
// JS expression, e.g. the T() helper's own body.
const CODE_SHAPE = /\w\(|\)\.|=>|\breplace\b|\bconst\b/;
const EXERCISE_SHAPE = /\b(?:DB|BB|SA|KB|TRX|RDL|SLDL|OHP|ISO|POS|ATH)\b|\d+\s*[x×]\s*\d+/i;
// Mixed case counts too. The first version only matched SHOUTING labels, so
// `>Log session<` and `>League Stats<` sat in the Hebrew club zone untouched
// for weeks - the two words a coach reads first on an athlete's card.
// A JSX text run does not have to sit between two TAGS. Half the English left
// in the app sits next to an expression - `{tr('Logs this session for')}<b>{n}</b>
// available athletes` - where only the first third was ever translated. Scan
// every run bounded by > or } on the left and < or { on the right.
// Hole #6 (2026-09-16): the run had to START with a capital, so a label led by
// a glyph - `← BACK`, `✓ MARK PAID`, `+ New Program`, `◔ CHASE` - was never
// seen; 50 of them sat in translated views. An optional 1-2 symbol lead is
// allowed now (anything but a letter, digit, quote, bracket, Hebrew, or the
// code punctuation , ; : = that would straddle a line of JS).
const LITERAL = /[>}]\s*((?:[^\sA-Za-z0-9<>{}()[\]'"`$,;:=֐-׿]{1,2}\s*)?[A-Z][A-Za-z0-9 ·+→←✓%&/()'’.,…\-–—:]{2,140}?)\s*[<{]/g;
// Hole #7/#8 (17.9): a run with a COMMA was invisible - the class had none - and so
// was one starting lowercase (`— no active injuries.`, `pending`). A lowercase
// run must end at a TAG, not an expression: `} else {` is code, `} athletes<` is not.
const LITERAL_LC = /(?<!=)[>}]\s*((?:[^\sA-Za-z0-9<>{}()[\]'"`$,;:=֐-׿]{1,2}\s*)?[a-z][A-Za-z0-9 ·+→←✓%&/()'’.,…\-–—:]{2,140}?)\s*</g;
// `x > limit && (`, `padX + (n`, `s.count` - an expression, not a sentence.
const LC_CODE = /&&|\|\||\w\.\w|\+ \(|^[a-z]+[A-Z]\w*\b/;
// `delete` is the word the coach TYPES to confirm a delete - the check compares to it.
const JS_WORD = /^(?:else|catch|finally|while|return|if|from|of|in|as|const|let|var|typeof|new|await|async|case|default)\b/;
// A tooltip is the one place the app EXPLAINS itself - the last place that
// should be in another language. 214 of them were English.
const TITLE_ATTR = /(?<![\w$])title=(?:"([A-Z][^"]{3,120})"|'([A-Z][^']{3,120})')/g;
// A screen reader gets nothing BUT these strings, so an English aria-label
// on a Hebrew screen is the whole control, not a detail.
const A11Y_ATTR = /(?<![\w$])(aria-label|alt)=(?:"([A-Z][^"]{3,120})"|'([A-Z][^']{3,120})')/g;
const PLACEHOLDER = /placeholder=(?:"([A-Za-z][^"]{2,80})"|'([A-Za-z][^']{2,80})')/g;
// Blank comments out but KEEP their newlines, or every reported line number
// after a multi-line comment drifts (an injection at 3904 reported as 3622).
const blank = (m) => m.replace(/[^\n]/g, ' ');
const stripComments = (s) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, blank).replace(/\/\*[\s\S]*?\*\//g, blank).replace(/^\s*\/\/.*$/gm, blank);
const isAllowed = (t) => {
  const s = t.trim();
  // A real word, not "OK" or "→". This used to demand TWO CAPITALS in a row,
  // which quietly allowed every Title Case label in the app - "Log session",
  // "View program", "League Stats" - the exact strings a coach reads first.
  if (!/[A-Za-z]{3,}/.test(s)) return true;                    // no real word
  // Hole #9 (16.9): this stripped each word down to its CAPITALS, and single
  // letters are allowlisted, so every Title-case word starting with A B C D E
  // J L M N R S W X or Y passed - `Save`, `Cancel`, `Medical`, `League Stats`.
  // Case is kept now: only a word that IS an allowlisted token passes.
  if (s.split(/[\s·]+/).every((w) => ALLOW.has(w.replace(/[^A-Za-z0-9Δ]/g, '')) || /^[\d.,%₪+-]+$/.test(w) || w === '' || /^[·+→←✓%&/()'’.\-–—:]+$/.test(w))) return true;
  if (BRAND.test(s)) return true;                              // a product name is not translated
  if (CODE_SHAPE.test(s)) return true;
  if (EXERCISE_SHAPE.test(s)) return true;
  return false;
};
const findings = [];
// Hole #5 (2026-09-16): the scan used to SKIP every file that does not import
// a dictionary - so a screen with no Hebrew wiring at all, the worst case, was
// invisible. The coach's live Training Analysis page (TrainingLineageV2) sat
// fully English behind a green gate; 33 files, ~318 runs. Every file is
// scanned now. A wired file must read zero. An un-wired file may only go DOWN
// from its recorded count in english-literals-baseline.json - lower the
// number in that file when you translate one; never raise it.
const BASELINE_FILE = path.join('scripts', 'english-literals-baseline.json');
const BASELINE = fs.existsSync(BASELINE_FILE) ? JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8')) : {};
const unwired = {};
for (const f of fs.readdirSync('src').filter((x) => x.endsWith('.jsx') && !SKIP_FILES.has(x))) {
  const raw = fs.readFileSync(path.join('src', f), 'utf8');
  // ...and the club zone, which has its OWN dictionary (bhbcHe) and was
  // therefore out of scope of a gate that only looked for ./i18n.
  const wired = /from '\.\/i18n'/.test(raw) || /from '\.\/bhbcHe'/.test(raw);
  const before = findings.length;
  scanFile(f, raw);
  if (!wired) { unwired[f] = findings.length - before; for (const x of findings.slice(before)) x.unwired = true; }
}
function scanFile(f, raw) {
  const src = stripComments(raw);
  const lineOf = (i) => src.slice(0, i).split('\n').length;
  for (const m of src.matchAll(LITERAL)) { if (!isAllowed(m[1])) findings.push({ f, line: lineOf(m.index), text: m[1].trim(), kind: 'jsx' }); }
  for (const m of src.matchAll(LITERAL_LC)) { const t = m[1].trim(); if (!JS_WORD.test(t.replace(/^[^a-z]+/, '')) && !LC_CODE.test(t) && t !== 'delete' && !isAllowed(t)) findings.push({ f, line: lineOf(m.index), text: t, kind: 'jsx' }); }
  // Placeholders that are DATA examples or typed confirmations stay English
  // on purpose: an email shape, a URL, "kg/%", "reps", "e.g. 83.5", and the
  // word the coach must type to confirm a delete (the check compares to it).
  const dataShape = (t) => /@|https?:|^e\.g\.|^\d|kg\/%|^reps$|delete|remove|^ohad\b|zoom\.us|\d{4}/i.test(t);
  for (const m of src.matchAll(TITLE_ATTR)) {
    const t = m[1] || m[2];
    if (/[֐-׿]/.test(t) || /\{/.test(t) || isAllowed(t)) continue;
    findings.push({ f, line: lineOf(m.index), text: t, kind: 'title' });
  }
  for (const m of src.matchAll(A11Y_ATTR)) {
    const t = m[2] || m[3];
    if (/[֐-׿]/.test(t) || /\{/.test(t) || isAllowed(t)) continue;
    findings.push({ f, line: lineOf(m.index), text: t, kind: m[1] });
  }
  for (const m of src.matchAll(PLACEHOLDER)) { const t = m[1] || m[2]; if (!/[֐-׿]/.test(t) && !/\{/.test(t) && !dataShape(t)) findings.push({ f, line: lineOf(m.index), text: t, kind: 'placeholder' }); }
}
if (process.argv.includes('--write-baseline')) {
  const out = Object.fromEntries(Object.entries(unwired).filter(([, n]) => n > 0).sort());
  fs.writeFileSync(BASELINE_FILE, JSON.stringify(out, null, 2) + '\n');
  console.log(`baseline written: ${Object.keys(out).length} files, ${Object.values(out).reduce((a, b) => a + b, 0)} runs`);
  process.exit(0);
}
const wiredFindings = findings.filter((x) => !x.unwired);
const grew = Object.entries(unwired).filter(([f, n]) => n > (BASELINE[f] || 0));
const shrank = Object.entries(BASELINE).filter(([f, n]) => (unwired[f] || 0) < n);
const unwiredTotal = Object.values(unwired).reduce((a, b) => a + b, 0);
console.log(`ENGLISH LITERALS IN TRANSLATED VIEWS — ${wiredFindings.length} finding(s)`);
for (const x of (REPORT ? findings : wiredFindings)) console.log(`  ${x.f}:${x.line}  ${x.kind.padEnd(11)} «${x.text}»${x.unwired ? '  [un-wired]' : ''}`);
console.log(`UN-WIRED FILES (no dictionary import) — ${unwiredTotal} run(s) in ${Object.values(unwired).filter((n) => n).length} file(s), ratchet: may only fall`);
for (const [f, n] of grew) {
  console.log(`  ✗ ${f}: ${n} English run(s), baseline ${BASELINE[f] || 0}`);
  for (const x of findings.filter((y) => y.f === f)) console.log(`      ${x.line}  ${x.kind.padEnd(11)} «${x.text}»`);
}
for (const [f, n] of shrank) console.log(`  ↓ ${f}: ${unwired[f] || 0} (baseline ${n}) - lower it in ${BASELINE_FILE}`);
if (!REPORT && (wiredFindings.length || grew.length)) process.exit(1);
