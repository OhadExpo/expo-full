// Rebuilds the Hebrew ground truth and measures Ohad's register end to end.
//
// The `hebrew-voice` skill points here. One command, no scratch files:
//   node scripts/hebrew-corpus.mjs
//
// WHY. My Hebrew was written in English and translated. The cure is knowing
// what HE writes, measured rather than guessed — his word for a thing, his
// sentence length, his verb forms. Ground truth is his own coaching cues.
//
// git blame cannot tell his lines from mine: every commit in this repo is
// authored under his name. So provenance is by FILE, listed below.
import fs from 'node:fs';
import path from 'node:path';

const HEB = /[\u0590-\u05FF]/;

// His writing. Cue authoring is his — these files ARE the standard.
const HIS_FILES = [/^src\/exerciseData\.js$/, /^src\/demoTraineeData\.js$/];

// Hebrew glues its prefixes on (ha-, ve-, be-, le-, me-, she-, ke-). A naive
// boundary makes `הרצפה` invisible and reports רצפה:0 for a word used 372
// times. Prefix allowed before; no suffix after, which would change the word.
const PRE = '(?:[\u05D5\u05D4\u05D1\u05DC\u05DE\u05E9\u05DB]{0,2})';
const NB = (w) => new RegExp('(?<![\u0590-\u05FF])' + PRE + '(?:' + w + ')(?![\u0590-\u05FF])', 'g');

const files = [];
function walk(d) {
  if (!fs.existsSync(d)) return;
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const f = path.join(d, e.name);
    if (e.isDirectory()) { if (!/node_modules|dist|\.git/.test(e.name)) walk(f); }
    else if (/\.(js|jsx)$/.test(e.name)) files.push(f.split(path.sep).join('/'));
  }
}
walk('src'); walk('expo-il/src');

const his = [], mine = [];
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  if (!HEB.test(src)) continue;
  const target = HIS_FILES.some((re) => re.test(f)) ? his : mine;
  for (const line of src.split('\n')) {
    if (!HEB.test(line)) continue;
    const re = /'([^'\n]*)'|"([^"\n]*)"|`([^`\n]*)`/g;
    let m;
    while ((m = re.exec(line))) {
      const s = m[1] ?? m[2] ?? m[3];
      if (s && HEB.test(s)) target.push(s);
    }
  }
}

// Most of his Hebrew is NOT in this repo — it is the cue text on his plan rows
// in Supabase. The in-repo slice is ~70 lines and is NOT representative: it
// skews long, because exerciseData.js holds descriptions as well as cues.
//
// That corpus is his private coaching material, so it is not committed and no
// credential lives in this file. Export it first, then pass it in:
//
//   node scripts/export-plan-cues.mjs > cues.json     (signs in as the owner)
//   node scripts/hebrew-corpus.mjs --corpus cues.json
//
// Without it you get the small slice, and the register numbers are flagged
// unreliable rather than quietly reported as fact.
const ci = process.argv.indexOf('--corpus');
let db = [];
if (ci > -1 && process.argv[ci + 1]) {
  const raw = JSON.parse(fs.readFileSync(process.argv[ci + 1], 'utf8'));
  db = (Array.isArray(raw) ? raw : Object.values(raw)).filter((x) => typeof x === 'string' && HEB.test(x));
}

const truth = [...new Set([...his, ...db])];
const corpus = truth.join('\n');
const n = (w) => (corpus.match(NB(w)) || []).length;

console.log(`GROUND TRUTH: ${truth.length} lines he wrote (${his.length} in repo + ${db.length} plan cues) · ${mine.length} strings I wrote\n`);
if (truth.length < 500) {
  console.log('! Corpus under 500 lines. The register numbers below are NOT reliable —');
  console.log('! pass --corpus with his exported plan cues. See the header.\n');
}

const SETS = [
  ['floor', ['רצפה', 'קרקע']],
  ['knee', ['ברך', 'ברכיים']],
  ['glute', ['ישבן', 'פופיק', 'עכוז']],
  ['chest', ['חזה', 'בית חזה']],
  ['shoulder blades', ['שכמות', 'עצמות השכם']],
  ['heel', ['עקב', 'עקבים']],
  ['push', ['דחוף', 'תדחף', 'לדחוף']],
  ['lift', ['תרים', 'הרם', 'להרים']],
  ['hold', ['תחזיק', 'החזק', 'להחזיק']],
  ['tight', ['מכווצת', 'צמוד', 'הדוק']],
  ['forward', ['קדימה', 'לפנים']],
  ['backward', ['אחורה', 'לאחור']],
];
console.log('HIS WORD FOR IT (counted, not guessed):');
for (const [meaning, words] of SETS) {
  const scored = words.map((w) => [w, n(w)]).sort((a, b) => b[1] - a[1]);
  if (!scored[0][1]) { console.log(`  ${meaning.padEnd(17)} — none present`); continue; }
  console.log(`  ${meaning.padEnd(17)} USE «${scored[0][0]}»   ${scored.map(([w, c]) => w + ':' + c).join('  ')}`);
}

// CAUTION, learned the hard way: measuring only his CUES said he never uses
// עומס. He uses it constantly in the marketing site he wrote. Absence in one
// register is not absence — do not "correct" his vocabulary off this table.
const fut = (corpus.match(NB('ת[\u0590-\u05FF]{2,}')) || []).length;
const inf = (corpus.match(NB('ל[\u0590-\u05FF]{3,}')) || []).length;
// Report BOTH units. A stored cue is often several sentences in one string, so
// per-string and per-sentence medians differ by 3-4x. Quoting one under the
// other's name is how a number stops being true.
const med = (a) => a.sort((x, y) => x - y)[a.length >> 1];
const pct = (a, p) => a.sort((x, y) => x - y)[Math.floor(a.length * p)];
const strLens = truth.map((t) => t.split(/\s+/).filter(Boolean).length);
const sentLens = truth
  .flatMap((t) => t.split(/[.!?\n]/))
  .map((t) => t.trim())
  .filter((t) => t && HEB.test(t))
  .map((t) => t.split(/\s+/).filter(Boolean).length);
console.log(`\nREGISTER: future-imperative ${fut} · infinitive ${inf}`);
console.log(`LENGTH per stored cue:  median ${med(strLens)} words · 90th pct ${pct(strLens, 0.9)}`);
console.log(`LENGTH per sentence:    median ${med(sentLens)} words · 90th pct ${pct(sentLens, 0.9)}   <- the one to write to`);
console.log('\nNow run: node scripts/verify-hebrew.mjs');
