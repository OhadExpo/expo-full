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
// Split on the LANGUAGE boundary, not the first 'he:' that happens to appear —
// that matched inside a string and put most of the dictionary on the wrong side,
// reporting 154 phantom failures.
const heAt = i18n.search(/^\s*he\s*:\s*\{/m);
if (heAt < 0) { console.log('  ✗ cannot find the `he` half of shotI18n'); process.exit(1); }
const halves = { en: i18n.slice(0, heAt), he: i18n.slice(heAt) };

for (const [lang, body] of Object.entries(halves)) {
  for (const path of used) {
    const key = path.split('.')[1];
    // A key is present if it appears as `key:` somewhere in that half.
    ok(`${lang} has ${path}`, new RegExp(`\\b${key}\\s*:`).test(body));
  }
}

// TOP-LEVEL keys too. The first version of this check collected them and then
// only asserted on the nested ones — which is the very gap it exists to close.
const JS_ON_OBJ = new Set(['info', 'tips', 'cols', 'checks', 'phases']);
for (const lang of ['en', 'he']) {
  for (const key of usedTop) {
    if (JS_METHODS.has(key) || JS_ON_OBJ.has(key)) continue;
    ok(`${lang} has T.${key}`, new RegExp(`\\b${key}\\s*:`).test(halves[lang]));
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


// ── DUPLICATE KEYS ─────────────────────────────────────────────────────────
// `verdictOk` was defined twice in the same object: once as the per-shot
// verdict ('Clean mechanics'), once as the session verdict ('repeatable across
// the session'). JavaScript resolves that silently at parse time — the second
// wins — so a single shot scoring 80+ told the coach it was "repeatable across
// the session", which is a statement about a set of reps, not about one shot.
//
// A runtime check cannot see this (by the time the object exists, one of the
// two is simply gone), so the source has to be scanned. Walk the language body
// tracking brace depth, skipping strings, template literals and comments, and
// collect every identifier used as a key at the TOP level of that language.
const BS = String.fromCharCode(92); // an escape inside a string; written this way
                                    // because a literal backslash does not survive
                                    // being piped through the shell here.
// `body` is the WHOLE file and `lang` the language object to walk. The first
// version took a half-file and started at its first `{` — which landed inside
// a template literal on line 16, so the walk read garbage and reported no
// duplicates even when one was there. Anchor on `en: {` / `he: {` instead.
function topLevelKeys(body, lang) {
  // WS is a regex escape built at runtime: a literal backslash does not
  // survive being piped through the shell, and a silently de-escaped '\s'
  // becomes a plain 's', which is how this check first failed to match.
  const WS = String.fromCharCode(92) + 's';
  const start = body.search(new RegExp('^' + WS + '*' + lang + WS + '*:' + WS + '*[{]', 'm'));
  if (start < 0) throw new Error('cannot find the ' + lang + ' object');
  const keys = [];
  let depth = 0, i = body.indexOf('{', start);
  while (i < body.length) {
    const c = body[i];
    if (c === '/' && body[i + 1] === '/') { i = body.indexOf('\n', i); if (i < 0) break; continue; }
    if (c === '/' && body[i + 1] === '*') { i = body.indexOf('*/', i) + 2; continue; }
    if (c === "'" || c === '"' || c === '`') {
      const q = c; i++;
      while (i < body.length && body[i] !== q) { if (body[i] === BS) i++; i++; }
      i++; continue;
    }
    if (c === '{' || c === '(' || c === '[') { depth++; i++; continue; }
    if (c === '}' || c === ')' || c === ']') { depth--; i++; if (depth === 0) break; continue; }
    if (depth === 1 && /[a-zA-Z_]/.test(c)) {
      let j = i; while (j < body.length && /[a-zA-Z0-9_]/.test(body[j])) j++;
      let k = j; while (k < body.length && /\s/.test(body[k])) k++;
      if (body[k] === ':') keys.push(body.slice(i, j));
      i = j; continue;
    }
    i++;
  }
  return keys;
}

for (const lang of ['en', 'he']) {
  const keys = topLevelKeys(i18n, lang);
  const seen = new Set(), dups = new Set();
  for (const k of keys) { if (seen.has(k)) dups.add(k); seen.add(k); }
  ok(`${lang} defines every key exactly once (${keys.length} keys)`, dups.size === 0);
  if (dups.size) console.log(`     defined twice in ${lang}: ${[...dups].join(', ')}`);
}

// And the two verdicts must stay distinct texts, not the same sentence reused.
for (const lang of ['en', 'he']) {
  const perShot = /verdictOk\s*:\s*(['"`])(.*?)\1/.exec(halves[lang]);
  const session = /sessionRepeatable\s*:\s*(['"`])(.*?)\1/.exec(halves[lang]);
  ok(`${lang} has a per-shot verdictOk`, !!perShot);
  ok(`${lang} has a session sessionRepeatable`, !!session);
  ok(`${lang} does not say the same thing for a shot and a session`,
    perShot && session && perShot[2] !== session[2]);
}

console.log(`\nSHOT I18N: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
