// A key defined twice in ONE object literal is invisible: JavaScript keeps the
// last one and says nothing — no error, no warning, a green build.
//
// This exists because of a real one. `verdictOk` was defined twice in
// src/shotI18n.js: once as the per-shot verdict ('Clean mechanics') and once as
// the session verdict ('repeatable across the session'). The second won, so
// every shot scoring 80+ told the coach it was "repeatable across the session"
// — a claim about a set of reps, made about a single shot. It shipped.
//
// Note there is no backslash anywhere below. Literal backslashes do not survive
// being piped through this environment's shell, and a silently de-escaped
// pattern still RUNS — it just matches the wrong thing, which is how two
// earlier versions of this check passed while testing nothing.
import fs from 'node:fs';
import path from 'node:path';

const BS = String.fromCharCode(92);
const NL = String.fromCharCode(10);
const TAB = String.fromCharCode(9);

const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const f = path.join(d, e.name);
    if (e.isDirectory()) { if (!/node_modules|dist|[.]git/.test(f)) walk(f); }
    else if (/[.](js|jsx)$/.test(e.name)) files.push(f);
  }
})('src');

function duplicateKeys(src) {
  const stack = [];        // one Map of key -> count per open object
  const pendingStack = []; // ternaries left open when the object was entered
  const dups = new Map();
  let i = 0, pendingTernary = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') { const n = src.indexOf(NL, i); i = n < 0 ? src.length : n; continue; }
    if (c === '/' && src[i + 1] === '*') { const n = src.indexOf('*/', i); i = n < 0 ? src.length : n + 2; continue; }
    if (c === "'" || c === '"' || c === '`') {
      const q = c; i++;
      while (i < src.length && src[i] !== q) { if (src[i] === BS) i++; i++; }
      i++; continue;
    }
    // A ternary's colon is not a key. `isReal(x) ? -x : null` reads as a key
    // named x otherwise — that false positive was 4 of the first 4 hits.
    if (c === '?' && src[i + 1] !== '.' && src[i + 1] !== '?') { pendingTernary++; i++; continue; }
    if (c === ',' || c === ';') { pendingTernary = 0; i++; continue; }
    if (c === '{') { stack.push(new Map()); pendingStack.push(pendingTernary); pendingTernary = 0; i++; continue; }
    if (c === '}') {
      const top = stack.pop();
      pendingTernary = pendingStack.pop() || 0;
      if (top) for (const [k, n] of top) if (n > 1) dups.set(k, n);
      i++; continue;
    }
    if (stack.length && /[a-zA-Z_$]/.test(c)) {
      let j = i; while (j < src.length && /[a-zA-Z0-9_$]/.test(src[j])) j++;
      let k = j; while (k < src.length && (src[k] === ' ' || src[k] === TAB)) k++;
      const name = src.slice(i, j);
      const before = src.slice(Math.max(0, i - 40), i).trim();
      const isKey = src[k] === ':' && src[k + 1] !== ':'
        && !/(case|default|return)$/.test(before) && !/[.]$/.test(before);
      if (isKey && pendingTernary > 0) pendingTernary--;
      else if (isKey) { const m = stack[stack.length - 1]; m.set(name, (m.get(name) || 0) + 1); }
      i = j; continue;
    }
    i++;
  }
  return dups;
}

console.log('DUPLICATE OBJECT KEYS' + NL);
let bad = 0;
for (const file of files) {
  const dups = duplicateKeys(fs.readFileSync(file, 'utf8'));
  if (dups.size) {
    bad++;
    for (const [k, n] of dups) console.log(`  x ${file}: "${k}" defined ${n} times in one object`);
  }
}

// The scan above SKIPS string literals, so a QUOTED key ('Save changes': ...) is never
// counted - which is most of a translation dictionary. And a dictionary can be extended
// later with Object.assign(HE, { ... }), a second literal that silently overrides the
// first. Both hid one on 17.9: bhbcHe.js defined 'lift' as 'תרגיל' and again, in the
// Object.assign block, as 'אימון כוח' - so a gym line read "5 אימון כוח, 12 סטים".
// For the flat dictionaries, collect every key of the HE literal plus every
// Object.assign(HE, ...) block and report any key defined twice across them.
const DICTS = [path.join('src', 'i18n.js'), path.join('src', 'bhbcHe.js')];
const KEY_LINE = new RegExp('^[ ' + TAB + "]*(?:'((?:[^'" + BS + BS + ']|' + BS + BS + ".)*)'|" + '"((?:[^"' + BS + BS + ']|' + BS + BS + '.)*)"|([A-Za-z_$][A-Za-z0-9_$]*))[ ' + TAB + ']*:', 'gm');
function dictKeys(src) {
  const blocks = [];
  const main = src.indexOf('export const HE = {');
  if (main >= 0) blocks.push(src.slice(main, src.indexOf(NL + '};', main)));
  for (let at = src.indexOf('Object.assign(HE, {'); at >= 0; at = src.indexOf('Object.assign(HE, {', at + 1)) {
    blocks.push(src.slice(at, src.indexOf(NL + '});', at)));
  }
  const seen = new Map();
  for (const b of blocks) for (const m of b.matchAll(KEY_LINE)) { const k = m[1] ?? m[2] ?? m[3]; seen.set(k, (seen.get(k) || 0) + 1); }
  return [...seen].filter(([, n]) => n > 1);
}
for (const file of DICTS) {
  if (!fs.existsSync(file)) continue;
  const d = dictKeys(fs.readFileSync(file, 'utf8'));
  if (d.length) { bad++; for (const [k, n] of d) console.log(`  x ${file}: dictionary key "${k}" defined ${n} times (HE literal + Object.assign)`); }
}

// The check must be able to FAIL, or it is decoration. Prove it on a known case.
const canary = duplicateKeys('const t = { a: 1, b: 2, a: 3 };');
const dictCanary = dictKeys("export const HE = {" + NL + "  'lift': 'a'," + NL + "};" + NL + "Object.assign(HE, {" + NL + "  'lift': 'b'," + NL + "});");
const canaryOk = canary.get('a') === 2 && dictCanary.length === 1 && dictCanary[0][0] === 'lift';
if (!canaryOk) console.log('  x the checker itself no longer detects a duplicate');

console.log(`${NL}${files.length} files scanned, ${bad} with a repeated key`);
process.exit(bad || !canaryOk ? 1 : 0);
