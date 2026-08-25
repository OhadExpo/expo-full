// Every i18n key the Shot Analyzer USES must exist, in BOTH languages.
//
// This exists because a label shipped as the literal word "undefined": the UI
// was updated to render T.info.ballSpeed and T.info.ballRise, the patch that
// was supposed to add those keys silently missed, and nothing caught it —
// JavaScript is perfectly happy to render undefined, the build passed, and it
// reached master.
//
// So: read the component, collect every `T.<group>.<key>` it references, and
// assert the key exists under both `en` and `he`.
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../src/ShotAnalyzer.jsx', import.meta.url), 'utf8');
const i18n = fs.readFileSync(new URL('../src/shotI18n.js', import.meta.url), 'utf8');

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) pass++; else { fail++; console.log('  ✗ ' + name); } };

// Which keys does the component ask for?
const used = new Set();
// `T.tips.map(...)` is a JS array method, not a dictionary key — exclude the
// built-ins, or the check complains that the language is missing ".map".
const JS_METHODS = new Set(['map', 'filter', 'join', 'length', 'slice', 'forEach', 'find',
  'some', 'every', 'reduce', 'includes', 'indexOf', 'concat', 'sort', 'split', 'replace',
  'trim', 'toString', 'keys', 'values', 'entries']);
for (const m of src.matchAll(/\bT\.([a-zA-Z]+)\.([a-zA-Z0-9_]+)/g)) {
  if (JS_METHODS.has(m[2])) continue;
  used.add(`${m[1]}.${m[2]}`);
}
// Top-level ones too: T.something used directly.
const usedTop = new Set();
for (const m of src.matchAll(/\bT\.([a-zA-Z0-9_]+)\b(?!\.)/g)) usedTop.add(m[1]);

console.log(`SHOT I18N\n\nkeys referenced by ShotAnalyzer.jsx: ${used.size} nested, ${usedTop.size} top-level`);

// Split the dictionary into its two language halves so each is checked on its own.
const heAt = i18n.indexOf('he:');
if (heAt < 0) { console.log('  ✗ cannot find the `he` half of shotI18n'); process.exit(1); }
const halves = { en: i18n.slice(0, heAt), he: i18n.slice(heAt) };

for (const [lang, body] of Object.entries(halves)) {
  for (const path of used) {
    const key = path.split('.')[1];
    // A key is present if it appears as `key:` somewhere in that half.
    ok(`${lang} has ${path}`, new RegExp(`\\b${key}\\s*:`).test(body));
  }
}

// A label rendered from a missing key shows the word "undefined" to the coach —
// assert the component never renders a bare T.* that the dictionary lacks.
const missing = [];
for (const path of used) {
  const key = path.split('.')[1];
  for (const [lang, body] of Object.entries(halves)) {
    if (!new RegExp(`\\b${key}\\s*:`).test(body)) missing.push(`${lang}:${path}`);
  }
}
ok('no referenced key is missing from either language', missing.length === 0);
if (missing.length) console.log('     missing: ' + missing.join(', '));

console.log(`\nSHOT I18N: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
