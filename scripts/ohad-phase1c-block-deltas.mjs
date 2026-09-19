// PHASE 1c — what changed from one block to the next, per athlete.
//
// A single block shows what he prescribed. The DELTA between consecutive blocks
// for the same athlete is the closest deterministic thing to a DECISION: what
// he kept, what he dropped, what he brought in, and how the dose moved on the
// exercises he kept. Phase 2's agents should be asking "why this change",
// citing a row id - not re-deriving the changes themselves, which is arithmetic.
//
// Blocks are ordered by the number in their name ("Block #23" -> 23) and only
// then by date, because the plans were bulk-imported and share an updated_at.
//
//   node scripts/ohad-phase1c-block-deltas.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const CORPUS = 'C:/Users/Administrator/expo-private-backups/coaching/corpus-frozen-20260919';
const rows = readFileSync(CORPUS + '/phase1b-rows.jsonl', 'utf8').trim().split('\n').map((l) => JSON.parse(l));

const blockNum = (name) => {
  const m = String(name || '').match(/#\s*(\d+)/);
  return m ? Number(m[1]) : null;
};
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// group: athlete -> block -> rows
const byAthlete = {};
for (const r of rows) {
  const n = blockNum(r.block);
  if (n == null) continue;            // unnumbered blocks cannot be sequenced
  (byAthlete[r.athlete] ||= {});
  (byAthlete[r.athlete][n] ||= []).push(r);
}

const deltas = [];
let pairs = 0;
for (const [athlete, blocks] of Object.entries(byAthlete)) {
  const nums = Object.keys(blocks).map(Number).sort((a, b) => a - b);
  for (let i = 1; i < nums.length; i++) {
    const a = blocks[nums[i - 1]], b = blocks[nums[i]];
    // Consecutive only. A gap means blocks are missing from the TRAIN split
    // (the hold-out took some), and a delta across a gap is not a decision.
    if (nums[i] !== nums[i - 1] + 1) continue;
    pairs++;
    const A = new Map(a.map((r) => [norm(r.title), r]));
    const B = new Map(b.map((r) => [norm(r.title), r]));
    const kept = [], dropped = [], added = [];
    for (const [k, r] of A) (B.has(k) ? kept : dropped).push(r);
    for (const [k, r] of B) if (!A.has(k)) added.push(r);
    const moved = [];
    for (const r of kept) {
      const y = B.get(norm(r.title));
      const ch = [];
      if (String(r.sets) !== String(y.sets)) ch.push(`sets ${r.sets}->${y.sets}`);
      if (String(r.reps) !== String(y.reps)) ch.push(`reps ${r.reps}->${y.reps}`);
      if (String(r.tempo) !== String(y.tempo)) ch.push(`tempo "${r.tempo}"->"${y.tempo}"`);
      if (String(r.rest) !== String(y.rest)) ch.push(`rest ${r.rest}->${y.rest}`);
      if (ch.length) moved.push({ title: r.title, from_row: r.row_id, to_row: y.row_id, changes: ch });
    }
    deltas.push({
      athlete, from_block: nums[i - 1], to_block: nums[i],
      size_from: a.length, size_to: b.length,
      kept: kept.length, dropped: dropped.length, added: added.length,
      redosed: moved.length,
      dropped_titles: dropped.map((r) => r.title),
      added_titles: added.map((r) => r.title),
      moved,
    });
  }
}
writeFileSync(CORPUS + '/phase1c-deltas.json', JSON.stringify(deltas, null, 1));

const sum = (f) => deltas.reduce((t, d) => t + f(d), 0);
const pct = (n, d) => d ? (n / d * 100).toFixed(1) + '%' : '-';
const totalKept = sum((d) => d.kept), totalDropped = sum((d) => d.dropped), totalAdded = sum((d) => d.added);
const carried = totalKept + totalDropped;

// Which exercises survive the most block boundaries? Those are his staples, and
// a staple is a decision he re-made every time he could have dropped it.
const survive = {};
for (const d of deltas) for (const m of d.moved) survive[m.title] = (survive[m.title] || 0) + 1;
const keptTitles = {};
for (const d of deltas) {
  const droppedSet = new Set(d.dropped_titles);
  for (const t of d.added_titles) if (!droppedSet.has(t)) { /* new arrival */ }
}
for (const r of rows) keptTitles[r.title] = (keptTitles[r.title] || 0) + 1;
const staples = Object.entries(keptTitles).sort((a, b) => b[1] - a[1]).slice(0, 15)
  .map(([k, v]) => `| ${k} | ${v} |`).join('\n');

const changeKinds = {};
for (const d of deltas) for (const m of d.moved) for (const c of m.changes) {
  const k = c.split(' ')[0]; changeKinds[k] = (changeKinds[k] || 0) + 1;
}
const kinds = Object.entries(changeKinds).sort((a, b) => b[1] - a[1])
  .map(([k, v]) => `| ${k} | ${v} |`).join('\n');

const shrink = deltas.filter((d) => d.size_to < d.size_from).length;
const grow = deltas.filter((d) => d.size_to > d.size_from).length;
const same = deltas.filter((d) => d.size_to === d.size_from).length;

const md = `# Phase 1c — block-to-block deltas

${deltas.length} consecutive block pairs across ${new Set(deltas.map((d) => d.athlete)).size} athletes.
Only genuinely consecutive numbers are compared: a gap means the hold-out took a
block, and a delta across a gap is not a decision he made.

## How much of a block survives into the next one

| | rows | share of the outgoing block |
|---|---|---|
| kept | ${totalKept} | ${pct(totalKept, carried)} |
| dropped | ${totalDropped} | ${pct(totalDropped, carried)} |
| brought in | ${totalAdded} | — |

Of the ${totalKept} he kept, **${sum((d) => d.redosed)} were re-dosed** (${pct(sum((d) => d.redosed), totalKept)}).
So the rest were carried forward UNCHANGED, which matches what case study 01 saw
in the daily routine: a working exercise is repeated verbatim and progressed by
the smallest possible thing, or not at all.

## Does a block get bigger or smaller?

| | pairs |
|---|---|
| smaller | ${shrink} |
| same size | ${same} |
| bigger | ${grow} |

## When he re-doses, which dial does he turn?

${kinds}

## His most-prescribed exercises across the whole TRAIN corpus

| exercise | rows |
|---|---|
${staples}

Full per-pair detail, with row ids on both sides of every change, is in
phase1c-deltas.json. Phase 2 cites those ids; it does not recompute this.
`;
writeFileSync(CORPUS + '/phase1c-summary.md', md);
console.log(md);
