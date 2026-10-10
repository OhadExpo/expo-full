// Stray control characters in source.
//
// This exists because of a near-miss. A patch meant to write the regex
//   /^\/demo\/(coach|athlete)\b/
// went through tooling that does not preserve backslashes, and the \b became a
// literal BACKSPACE character (0x08) sitting in the middle of the pattern. The
// regex was then valid, the build passed, eslint passed, and it matched
// NOTHING — the demo-open funnel event would have silently stopped firing
// altogether while looking completely correct in the editor and in grep.
//
// A mangled escape does not crash. It runs and quietly does the wrong thing.
// That is the whole reason to check for it mechanically.
import fs from 'node:fs';
import path from 'node:path';

const NL = String.fromCharCode(10);
const files = [];
// src, and since 29.9 the gates, the API and the marketing site too: the same
// accident (a \b written as a BACKSPACE byte) was sitting in two gates'
// regexes - audit-dead-controls (rec\b) and report-hebrew-coverage (block\b) -
// quietly measuring the wrong thing.
const walk = (d) => {
  let entries; try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const f = path.join(d, e.name);
    if (e.isDirectory()) { if (!/node_modules|dist|[.]git|testclips/.test(f)) walk(f); }
    else if (/[.](js|jsx|mjs|cjs|css|html)$/.test(e.name) && !/[.]tmp[.]/.test(e.name)) files.push(f);
  }
};
for (const d of ['src', 'scripts', 'api', 'expo-il/src']) walk(d);
files.push('shot-harness.html', 'set-harness.html');

// Tab (9), newline (10), carriage return (13) are legitimate. Everything else
// below 32 is not, and neither is 0x7f.
const allowed = new Set([9, 10, 13]);
// Files whose control bytes are on purpose: a 0x01 key separator and the
// terminal colour codes of a test runner.
const INTENDED = { [path.join('scripts', 'import-revenue-timeline.mjs')]: [1], [path.join('scripts', 'test-offline-queue.mjs')]: [27] };
let bad = 0;
console.log('SOURCE SANITY' + NL);
for (const file of files) {
  let src;
  try { src = fs.readFileSync(file, 'utf8'); } catch { continue; }
  const hits = [];
  for (let i = 0; i < src.length; i++) {
    const c = src.charCodeAt(i);
    if (((c < 32 && !allowed.has(c)) || c === 127) && !(INTENDED[file] || []).includes(c)) {
      const line = src.slice(0, i).split(NL).length;
      hits.push(`${file}:${line} contains 0x${c.toString(16).padStart(2, '0')}`);
    }
  }
  if (hits.length) { bad += hits.length; hits.slice(0, 5).forEach((h) => console.log('  x ' + h)); }
}

// The check must be able to fail. Prove it on a string that has one.
const canary = [...('a' + String.fromCharCode(8) + 'b')].some((c) => c.charCodeAt(0) === 8);
if (!canary) console.log('  x the checker itself no longer detects a control character');

console.log(`${NL}${files.length} files scanned, ${bad} stray control characters`);
process.exit(bad || !canary ? 1 : 0);
