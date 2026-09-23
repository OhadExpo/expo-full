// A DOTTED i18n KEY MUST NEVER REACH AN ENGLISH SCREEN.
//
// tr() returns the key itself when there is no entry for the active language.
// Natural-language keys ("Search programs…") degrade gracefully to English;
// a dotted key degrades to the literal string "tools.blurb" on the page. Every
// dotted key therefore needs its English side written out at the call site,
// guarded by a readLang() branch. This gate reads the SOURCE and fails on any
// dotted key used without one — cheap, static, and it cannot be fooled by a
// screen nobody thought to open.
import fs from 'node:fs';

const FILES = fs.readdirSync('src').filter((f) => /\.jsx?$/.test(f)).map((f) => 'src/' + f);
const USE = /\b(?:T|tt|tr)\s*\(\s*(?:readLang\(\)\s*,\s*)?'([a-z][A-Za-z0-9]*(?:\.[A-Za-z0-9]+)+)'/g;
const bad = [];
let scanned = 0;
let dotted = 0;

for (const f of FILES) {
  const src = fs.readFileSync(f, 'utf8');
  const lines = src.split('\n');
  scanned++;
  for (const m of src.matchAll(USE)) {
    dotted++;
    const upto = src.slice(0, m.index);
    const lineNo = upto.split('\n').length;
    // The guard may sit on this line or the two above it (a ternary wraps).
    const win = lines.slice(Math.max(0, lineNo - 3), lineNo).join(' ');
    if (/readLang\(\)\s*===\s*'he'|lang\s*===\s*'he'/.test(win)) continue;
    bad.push(`${f}:${lineNo}  ${m[1]}`);
  }
}

console.log(`DOTTED i18n KEY GATE — ${scanned} source files, ${dotted} dotted-key call sites`);
if (bad.length) {
  console.log('\nUNGUARDED (an English visitor sees the key itself):');
  for (const b of bad) console.log('  ' + b);
  process.exit(1);
}
console.log('  all guarded by a readLang() branch');
