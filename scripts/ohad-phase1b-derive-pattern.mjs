// PHASE 1b — derive the taxonomy from the TITLE, because the library has none.
//
// Phase 1 measured it: 92.7% of prescribed rows match a library exercise, but
// only 12.6% come back with a movement pattern, because the library's taxonomy
// fields are 94% empty (75 of 1,332 classified). Phase 2 cannot reason about
// patterns off a field that is blank.
//
// His titles are unusually machine-readable, and that is itself a finding about
// him: he names the POSITION first and the movement second, with a stable set
// of abbreviations (SA = single arm, ISO = isometric, BB / DB / SL, POS for a
// position, "E" for each side). So the title carries the taxonomy the library
// does not.
//
// Rules only. No model, no guessing: a title that matches nothing is reported
// as UNCLASSIFIED and counted, never quietly bucketed. The canonical vocabulary
// is the one in CLAUDE.md - this does not invent categories.
//
//   node scripts/ohad-phase1b-derive-pattern.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const CORPUS = 'C:/Users/Administrator/expo-private-backups/coaching/corpus-frozen-20260919';
const rows = readFileSync(CORPUS + '/phase1-rows.jsonl', 'utf8').trim().split('\n').map((l) => JSON.parse(l));

const has = (t, ...words) => words.some((w) => t.includes(w));

// Ordered: the FIRST rule that matches wins, so the specific sits above the
// general. "rdl" must beat "dl", "pull-up" must beat "pull".
const PATTERN_RULES = [
  ['Olympic', ['clean', 'snatch', 'jerk', 'high pull']],
  ['Hip Hinge', ['rdl', 'romanian', 'deadlift', 'good morning', 'hip thrust', 'hip-thrust', 'glute bridge', 'hip lift', 'swing', 'pull through', 'back extension', 'nordic']],
  ['Squat', ['squat', 'step up', 'step-up', 'leg press', 'sissy', 'pistol']],
  ['Lunge', ['lunge', 'split squat', 'kossac', 'cossack', 'bulgarian']],
  ['Vertical Pull', ['pulldown', 'pull down', 'pull-up', 'pullup', 'chin-up', 'chinup', 'chin up', 'lat pull']],
  ['Vertical Push', ['ohp', 'overhead press', 'shoulder press', 'push press', 'arnold', 'landmine press', 'z press']],
  ['Horizontal Pull', ['row', 'facepull', 'face pull', 'rear delt', 'inverted']],
  ['Horizontal Push', ['bench', 'chest press', 'push-up', 'pushup', 'push up', 'dip', 'fly', 'flye', 'pec']],
  ['Rotation/Anti-Rotation', ['rotation', 'rotational', 'paloff', 'pallof', 'chop', 'lift-chop', 'twist', 'windmill', 'russian', 'anti-rotation']],
  ['Carry/Loaded Locomotion', ['carry', 'farmer', 'suitcase', 'waiter walk', 'sled', 'crawl', 'bear walk']],
  ['Isolation', ['curl', 'extension', 'ext ', 'raise', 'kickback', 'calf', 'shrug', 'pullover', 'external rotation', 'internal rotation', 'abduction', 'adduction', 'scap', 'w y', 'y raise', 't raise', 'y to t', 'sit up', 'situp', 'abs', 'plank', 'hollow', 'dead bug', 'deadbug']],
];

// HIS ABBREVIATIONS. Read off the unclassified list, not invented: RFESS and
// FFESS are rear/front-foot-elevated split squats, SLDL is a single-leg
// deadlift, and each appeared enough times to matter. They go ABOVE the general
// rules, which is why they are spliced into the front of the list below.
const ABBREVIATIONS = [
  ['Lunge', ['rfess', 'ffess']],
  ['Hip Hinge', ['sldl', 'sl dl']],
];
PATTERN_RULES.unshift(...ABBREVIATIONS);

// THE CANONICAL TAXONOMY HAS NO PATTERN FOR JUMPING, AND HE PROGRAMS A LOT OF IT.
//
// CLAUDE.md's Movement Patterns are: Horizontal Push/Pull, Vertical Push/Pull,
// Hip Hinge, Squat, Lunge, Carry, Rotation/Anti-Rotation, Isolation, Olympic.
// Jump, land, pogo and snap-down are none of those - they are Movement TYPES in
// that taxonomy, with no pattern above them. Rather than force them into Squat,
// which would silently overstate how much squatting he prescribes, they are
// counted in their own bucket and reported as a gap in the taxonomy.
const JUMP_WORDS = ['jump', 'pogo', 'hop', 'bound', 'snap down', 'snapdown', 'land', 'landing', 'depth drop', 'plyo'];

// The position vocabulary is his own and it is the more interesting axis, given
// case study 01 found he programs POSITIONS and the movement happens inside one.
const POSITION_RULES = [
  ['Prone', ['prone', 'laying on stomach']],
  ['Supine', ['supine', 'laying on back', 'lying on back']],
  ['Side-Lying', ['side-lying', 'side lying', 'sidelying']],
  ['Quadruped', ['quadruped', 'bear', 'crab', 'all fours', 'bird dog', 'bird-dog']],
  ['Half-Kneeling', ['half-kneeling', 'half kneeling', 'tall kneeling']],
  ['Kneeling', ['kneeling']],
  ['Hanging', ['hanging', 'hang ']],
  ['Seated', ['seated', 'sitting']],
  ['Standing', ['standing', 'wall', 'stand ']],
];

const classify = (title, rules) => {
  const t = ' ' + String(title).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() + ' ';
  for (const [label, words] of rules) if (has(t, ...words)) return label;
  return '';
};

// His own abbreviations, counted - a fact about how he writes, not a taxonomy.
const MARKERS = [
  ['SA (single arm)', ['sa ', ' sa']],
  ['SL (single leg)', ['sl ', ' sl']],
  ['ISO (isometric)', ['iso']],
  ['POS (position)', ['pos']],
  ['deficit', ['deficit']],
  ['paused', ['paused', 'pause']],
  ['banded', ['banded', 'band ']],
  ['tempo/eccentric', ['ecc', 'eccentric', 'tempo']],
  ['wall-assisted', ['wall']],
  ['elevated', ['elevated', 'deficit']],
];

let pat = 0, pos = 0, jump = 0;
const out = rows.map((r) => {
  const isJump = has(' ' + String(r.title).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() + ' ', ...JUMP_WORDS);
  const p = isJump ? 'Jump/Land (NOT IN THE CANONICAL LIST)' : classify(r.title, PATTERN_RULES);
  const b = classify(r.title, POSITION_RULES);
  if (isJump) jump++;
  if (p) pat++;
  if (b) pos++;
  return { ...r, derived_pattern: p || 'UNCLASSIFIED', derived_position: b || 'UNCLASSIFIED', is_jump: isJump ? 1 : 0 };
});
writeFileSync(CORPUS + '/phase1b-rows.jsonl', out.map((r) => JSON.stringify(r)).join('\n') + '\n');

const tally = (fn) => { const m = {}; for (const r of out) { const k = fn(r); m[k] = (m[k] || 0) + 1; } return m; };
const tbl = (m) => Object.entries(m).sort((a, b) => b[1] - a[1])
  .map(([k, v]) => `| ${k} | ${v} | ${(v / out.length * 100).toFixed(1)}% |`).join('\n');

const t = (s) => ' ' + String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() + ' ';
const markerCounts = MARKERS.map(([label, words]) => [label, out.filter((r) => has(t(r.title), ...words)).length])
  .sort((a, b) => b[1] - a[1])
  .map(([k, v]) => `| ${k} | ${v} | ${(v / out.length * 100).toFixed(1)}% |`).join('\n');

const unclassified = out.filter((r) => r.derived_pattern === 'UNCLASSIFIED');
const topUnknown = Object.entries(unclassified.reduce((m, r) => { m[r.title] = (m[r.title] || 0) + 1; return m; }, {}))
  .sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, v]) => `| ${k} | ${v} |`).join('\n');

const md = `# Phase 1b — taxonomy derived from his titles

The library could not supply it (94% blank), so it is derived from the title by
rule. No model and no guessing: ${unclassified.length} rows matched no rule and are
reported as UNCLASSIFIED rather than bucketed into the nearest thing.

| axis | resolved | share |
|---|---|---|
| movement pattern | ${pat} | ${(pat / out.length * 100).toFixed(1)}% |
| body position | ${pos} | ${(pos / out.length * 100).toFixed(1)}% |

Against 12.6% from the library, so the titles carry roughly ${(pat / out.length / 0.126).toFixed(1)}x
the taxonomy the library does. That is a fact about how he NAMES things, and it
is the reason this is possible at all: position first, movement second, a stable
set of abbreviations.

## A gap in the canonical taxonomy, not in his programming

${jump} rows (${(jump / out.length * 100).toFixed(1)}%) are jumps, landings, pogos, bounds or
snap-downs. CLAUDE.md's Movement Patterns list has no pattern for any of them —
it offers them only as Movement TYPES, with nothing above. They are counted in
their own bucket here rather than folded into Squat, which would have silently
overstated how much squatting he prescribes by a fifth of that number.

If the taxonomy is ever revised, this is the missing row.

## Movement pattern

${tbl(tally((r) => r.derived_pattern))}

## Body position — the axis case study 01 says he actually programs

${tbl(tally((r) => r.derived_position))}

## His own vocabulary, counted

${markerCounts}

## The 15 most common titles no rule matched

Read these before adding rules — each one is either a gap in the vocabulary or
an exercise that genuinely has no pattern.

| title | rows |
|---|---|
${topUnknown}
`;
writeFileSync(CORPUS + '/phase1b-summary.md', md);
console.log(md);
