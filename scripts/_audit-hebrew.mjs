// Apply the hebrew-voice rules mechanically to every Hebrew string we ship.
// Rule 1: over ~15 words, break it. Rule 6: at most one em-dash per screen.
// Plus the transliteration and calque tells that have already bitten once.
//
// Written with the file tool, not a shell heredoc: the first attempt had its
// backslashes eaten mid-regex and would not even parse.
import fs from 'node:fs';

const files = ['src/shotI18n.js', 'expo-il/src/i18n.js'];
const HEB = /[֐-׿]/;

const TELLS = [
  [/קיו:/, 'transliterated "cue" as a label'],   // plain /קיו/ also matches נקיות
  [/פוקוס/, 'transliterated "focus"'],
  [/טיימינג/, 'transliterated "timing"'],
  // Hebrew has no , so bound the word by "not a Hebrew letter either side".
  // Without this, /הזו/ matches inside הזווית and /קיו/ inside נקיות — both
  // fired on strings that were perfectly fine.
  [/(?<![֐-׿])הזו(?![֐-׿])/, 'bookish "הזו" — spoken Israeli is "הזאת"'],
  [/(?<![֐-׿])בכדי(?![֐-׿])/, '"בכדי" is a miswrite of "כדי"'],
  [/על מנת/, 'formal — "כדי" is what people say'],
  [/ניתן ל/, 'bureaucratic passive — prefer "אפשר"'],
  [/יש לבצע|יש לבדוק/, 'instruction-manual register'],
  [/הקבלה על/, 'reads as "the analogy"'],
];

// Pull single-quoted and backtick-quoted literals without needing an escape
// class: split on the quote char and take the odd segments.
function literals(src, quote) {
  const parts = src.split(quote);
  const out = [];
  for (let i = 1; i < parts.length; i += 2) {
    const s = parts[i];
    if (s && !s.includes('\n') && s.length >= 10) out.push(s);
  }
  return out;
}

let long = 0, dashy = 0, tells = 0, total = 0;
const longest = [];

for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  const all = [...literals(src, "'"), ...literals(src, '`')];
  for (const s of all) {
    if (!HEB.test(s)) continue;
    total++;
    for (const sent of s.split(/[.!?]/)) {
      const w = sent.trim().split(/\s+/).filter(Boolean).length;
      if (w > 15) {
        long++;
        longest.push([w, sent.trim().slice(0, 80)]);
      }
    }
    const dashes = (s.match(/—/g) || []).length;
    if (dashes > 1) {
      dashy++;
      if (dashy <= 6) console.log(`DASH ${dashes}  ${s.slice(0, 74)}`);
    }
    for (const [re, why] of TELLS) {
      if (re.test(s)) { tells++; console.log(`TELL ${why}\n     ${s.slice(0, 74)}`); }
    }
  }
}

longest.sort((a, b) => b[0] - a[0]);
for (const [w, t] of longest.slice(0, 8)) console.log(`LONG ${w}w  ${t}`);

console.log(`\n${total} Hebrew strings | ${long} sentences over 15 words | ${dashy} strings with >1 em-dash | ${tells} known tells`);
process.exit(tells ? 1 : 0);
