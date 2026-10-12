// EVERY TRANSLATED LABEL HAS ITS HEBREW.
//
// 12.10: the library's '+ Add Exercise' went through tr(readLang(), 'Add Exercise') and the dictionary had no such key, so
// the Hebrew screen showed English. verify-english-literals does not see it (the string IS wired to the dictionary - the
// dictionary just lacks it). This gate reads every literal key passed to tt('..') / t('..') / tr(lang, '..') in src and
// fails when neither src/i18n.js, src/bhbcHe.js nor the file's OWN local dictionary (MovementLab, ErrorBoundary register
// theirs in the file) holds it. Dotted keys (CoachLanding's 'wl.err.email') are another dictionary - skipped.
//   node scripts/verify-he-keys.mjs          BREAK=1 checks a key that does not exist (must fail)
import fs from 'node:fs';
import path from 'node:path';

const { HE } = await import('../src/i18n.js');
let BH = {};
try { const m = await import('../src/bhbcHe.js'); BH = m.HE || {}; } catch (e) { /* the club dictionary is optional here */ }
const global = new Set([...Object.keys(HE), ...Object.keys(BH)].map((k) => k.toLowerCase()));

const RE = /\b(?:tt|t)\(\s*'((?:[^'\\]|\\.)*)'\s*\)|\btr\(\s*(?:readLang\(\)|lang|L|_dateLang)\s*,\s*'((?:[^'\\]|\\.)*)'\s*\)/g;
const LOCAL = /^\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|([A-Za-z][\w ]*))\s*:\s*['"`]/gm;   // a dictionary row: 'KEY': 'עברית'
const misses = [];
let checked = 0;
const scan = (p) => {
  const src = fs.readFileSync(p, 'utf8');
  const local = new Set([...src.matchAll(LOCAL)].map((m) => (m[1] ?? m[2] ?? m[3] ?? '').toLowerCase()));
  const hits = [...src.matchAll(RE)];
  if (process.env.BREAK && p.endsWith('ExercisesView.jsx')) hits.push({ 1: 'A key that has no Hebrew anywhere', index: 0 });
  for (const m of hits) {
    const s = (m[1] ?? m[2] ?? '').replace(/\\'/g, "'");
    if (!/[A-Za-z]{2}/.test(s) || /^[A-Z0-9 _./:·-]{1,4}$/.test(s)) continue;          // no words, or a short code (RPE, PR, KG)
    if (/^[a-z]+(\.[A-Za-z0-9]+)+$/.test(s) || /^(https?:|\/|#|expo-)/.test(s) || /[{}<>=]/.test(s)) continue;
    checked++;
    const k = s.toLowerCase();
    if (!global.has(k) && !local.has(k)) misses.push(`${p.replace(/\\/g, '/')}:${src.slice(0, m.index).split('\n').length}  '${s}'`);
  }
};
const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.(jsx|js)$/.test(e.name)) scan(p); } };
walk('src');
console.log(`HEBREW KEYS - ${checked} translated literal labels checked, ${misses.length} with no Hebrew`);
for (const m of misses) console.log('  ' + m);
process.exit(misses.length ? 1 : 0);
