// PHASE 1d — the SHAPE of his coaching prose.
//
// 132,138 characters of notes across 1,227 prescribed exercises, plus the
// library cues. Case study 01 claimed three things about how he writes, from
// one athlete's daily routine: he cues the FAILURE not the success, he runs
// set-up then movement then constraint, and he writes in bullets. Those are
// testable against the whole corpus, so test them instead of repeating them.
//
// Counting only. No interpretation, and no model - the judgements stay with
// the reader who gets these numbers.
//
//   node scripts/ohad-phase1d-cue-language.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const CORPUS = 'C:/Users/Administrator/expo-private-backups/coaching/corpus-frozen-20260919';
const rows = readFileSync(CORPUS + '/phase1b-rows.jsonl', 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const withNote = rows.filter((r) => r.note && r.note.trim());

// Hebrew negation and prohibition - the "cue the failure" claim.
const NEG = ['בלי', 'לא ', 'אל ', 'נסה לא', 'אסור', 'שלא', 'אין '];
// Conditionals - "if X then Y", the self-correcting cue.
const COND = ['אם ', 'כש', 'במידה'];
// Second-person imperative markers he uses.
const IMP = ['תעמוד', 'תרים', 'תוציא', 'תחזיק', 'תסובב', 'תמשוך', 'תדחוף', 'תנסה', 'תשמור', 'קח', 'שב', 'שכב', 'עמוד', 'סובב', 'דחוף', 'תכניס', 'תוריד', 'תעלה'];
// Set-up vocabulary: where the body IS before anything moves.
const SETUP = ['שכיבה', 'עמידה', 'ישיבה', 'שכב', 'עמוד', 'שב', 'התחל', 'כפות', 'מרפק', 'ברכיים', 'ישבן', 'כתפיים'];

const anyOf = (s, words) => words.some((w) => s.includes(w));
const countOf = (s, words) => words.reduce((n, w) => n + s.split(w).length - 1, 0);

const lines = withNote.flatMap((r) => r.note.split('\n').map((x) => x.trim()).filter(Boolean));
const bulletNotes = withNote.filter((r) => r.note.split('\n').filter((x) => x.trim().startsWith('-')).length >= 2);
const negNotes = withNote.filter((r) => anyOf(r.note, NEG));
const condNotes = withNote.filter((r) => anyOf(r.note, COND));
const impNotes = withNote.filter((r) => anyOf(r.note, IMP));

// Does the FIRST line set up, and a LATER line constrain? That is the claimed
// set-up -> movement -> constraint order, tested per note.
let orderHolds = 0, orderTestable = 0;
for (const r of withNote) {
  const L = r.note.split('\n').map((x) => x.trim()).filter(Boolean);
  if (L.length < 3) continue;
  orderTestable++;
  const firstSetsUp = anyOf(L[0], SETUP);
  const laterConstrains = L.slice(1).some((x) => anyOf(x, NEG));
  if (firstSetsUp && laterConstrains) orderHolds++;
}

const lens = withNote.map((r) => r.note.length).sort((a, b) => a - b);
const q = (p) => lens[Math.floor(lens.length * p)] || 0;
const lineLens = lines.map((l) => l.length).sort((a, b) => a - b);
const lq = (p) => lineLens[Math.floor(lineLens.length * p)] || 0;

// The words he reaches for most, once stopwords are out. Frequency only.
const STOP = new Set(['את', 'של', 'על', 'עם', 'לא', 'זה', 'הוא', 'אל', 'או', 'גם', 'כל', 'יש', 'אין', 'הם', 'אם', 'כי', 'רק', 'עד', 'לפי', 'בין', 'אחרי', 'לפני', 'כדי', 'מה', 'איך', 'בלי', 'תוך', 'אבל', 'שלא', 'שאתה', 'אתה', 'להיות', 'יותר', 'פחות', 'הזה', 'הזאת']);
const freq = {};
for (const l of lines) for (const w of l.split(/[^\u0590-\u05FF']+/)) {
  if (w.length < 3 || STOP.has(w)) continue;
  freq[w] = (freq[w] || 0) + 1;
}
const top = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 30);

const pc = (n, d) => d ? (n / d * 100).toFixed(1) + '%' : '-';
const md = `# Phase 1d — the shape of his coaching prose

${withNote.length} notes, ${lines.length} lines, ${withNote.reduce((a, r) => a + r.note.length, 0).toLocaleString()} characters.

## Testing what case study 01 claimed, against the whole corpus

| claim | measured | holds? |
|---|---|---|
| he cues the FAILURE, not the success | ${negNotes.length} of ${withNote.length} notes contain a negation or prohibition (${pc(negNotes.length, withNote.length)}) | ${negNotes.length / withNote.length > 0.4 ? 'yes' : 'weaker than claimed'} |
| he writes "if X then Y" self-correcting cues | ${condNotes.length} notes (${pc(condNotes.length, withNote.length)}) | ${condNotes.length / withNote.length > 0.2 ? 'yes' : 'less common than the daily routine suggested'} |
| set-up first, constraint later | ${orderHolds} of ${orderTestable} notes with 3+ lines (${pc(orderHolds, orderTestable)}) | ${orderHolds / Math.max(orderTestable, 1) > 0.4 ? 'yes' : 'weaker than claimed'} |
| he writes in bullets | ${bulletNotes.length} notes have 2+ dash-led lines (${pc(bulletNotes.length, withNote.length)}) | ${bulletNotes.length / withNote.length > 0.4 ? 'yes' : 'the daily routine is bulleted, the corpus is not'} |
| he writes in the imperative | ${impNotes.length} notes carry one of his imperative verbs (${pc(impNotes.length, withNote.length)}) | |

## How long a note is

| | characters |
|---|---|
| shortest | ${lens[0]} |
| 25th percentile | ${q(0.25)} |
| median | ${q(0.5)} |
| 75th percentile | ${q(0.75)} |
| longest | ${lens[lens.length - 1]} |

A LINE, which is the unit he actually writes in: median ${lq(0.5)} characters,
75th ${lq(0.75)}, longest ${lineLens[lineLens.length - 1]}. Short lines, many of them.

## The 30 words he reaches for most

${top.map(([w, n]) => `| ${w} | ${n} |`).join('\n')}

These are frequency counts, not a vocabulary ruling. They belong beside the
voice brief, where a word's presence here is the evidence that it is HIS - the
rule in the daily runbook is "do not propose a word unless you can point to him
using it", and this is the pointing.
`;
writeFileSync(CORPUS + '/phase1d-summary.md', md);
console.log(md);
