// PHASE 1 of "become Ohad the coach" — mechanical extraction, no interpretation.
//
// The plan says this is a SCRIPT and not agents, and that everything downstream
// cites row ids from this table. So: one flat row per prescribed exercise, a
// stable id, and every field taken literally off the record. Nothing here
// decides what anything MEANS.
//
// Reads only the SEALED-SPLIT TRAIN set. It must never touch
// HOLDOUT-plans.SEALED.json — that is opened once, in Phase 4.
//
//   node scripts/ohad-phase1-extract.mjs
//
// Writes (private — athlete names):
//   <corpus>/phase1-rows.jsonl     one JSON object per prescribed exercise
//   <corpus>/phase1-rows.tsv       the same, flat, for eyeballing and grep
//   <corpus>/phase1-summary.md     counts, so the next phase starts from facts
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const CORPUS = 'C:/Users/Administrator/expo-private-backups/coaching/corpus-frozen-20260919';
const J = (f) => JSON.parse(readFileSync(CORPUS + '/' + f, 'utf8'));

const plans = J('TRAIN-plans.json');
const lib = J('library-exercises.json');
const names = Object.fromEntries(J('trainees-idmap.json').map((t) => [t.id, t.name]));
const libById = Object.fromEntries(lib.filter((e) => e && e.id).map((e) => [e.id, e]));
// Titles are what the plan row actually carries; the library id is often blank
// (the athlete-title rule: a plan row's `title` is the only name an athlete can
// read). So match on a normalised title as well, or most rows lose their
// taxonomy.
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const libByTitle = {};
for (const e of lib) { const k = norm(e && (e.title || e.name)); if (k && !libByTitle[k]) libByTitle[k] = e; }

// Literal readings only. "3" is sets. "> " is his progression marker, not a
// number. "6 e" is six PER SIDE. None of that is interpreted here beyond
// recording which shape it is, because the shape is a fact and the reason is not.
const repShape = (r) => {
  const s = String(r == null ? '' : r).trim();
  if (!s) return 'blank';
  if (s === '>') return 'progression-marker';
  if (/^\d+\s*(e|each)$/i.test(s)) return 'per-side';
  if (/sec/i.test(s)) return 'time';
  if (/breath/i.test(s)) return 'breaths';
  if (/^\d+\s*\+\s*\d+/.test(s)) return 'compound';
  if (/^\d+$/.test(s)) return 'reps';
  if (/^\d+\s*-\s*\d+$/.test(s)) return 'rep-range';
  return 'other';
};

const rows = [];
for (const p of plans) {
  const days = (p.data && p.data.days) || [];
  days.forEach((d, di) => {
    const ex = (d.exercises || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
    ex.forEach((e, oi) => {
      const t = e.title || e.ex || '';
      const l = libById[e.exerciseId] || libByTitle[norm(t)] || null;
      const notes = e.notes || e.n || '';
      rows.push({
        // Deterministic: the same corpus always produces the same id, so a
        // Phase 2 finding can be re-checked against a re-extraction.
        row_id: 'r_' + createHash('sha1').update(p.id + '|' + (d.id || di) + '|' + (e.id || oi)).digest('hex').slice(0, 12),
        plan_id: p.id,
        block: p.name || p.block || '',
        athlete_id: p.trainee_id,
        athlete: names[p.trainee_id] || p.trainee_id,
        plan_updated: p.updated_at || '',
        day_index: di,
        day_name: d.name || '',
        day_kind: d.kind || '',
        position_in_day: oi,
        declared_order: e.order == null ? '' : e.order,
        title: t,
        exercise_id: e.exerciseId || '',
        matched_library: l ? (l.id || '') : '',
        category: l ? (l.category || '') : '',
        pattern: l ? (l.movementPattern || l.pattern || '') : '',
        movement: l ? (l.movementType || '') : '',
        laterality: l ? (l.laterality || '') : '',
        equipment: l ? (l.resistanceType || '') : '',
        position: l ? (l.bodyPosition || '') : '',
        sets: e.sets == null ? '' : e.sets,
        reps: e.reps == null ? '' : e.reps,
        reps_shape: repShape(e.reps),
        tempo: e.tempo || '',
        rest: e.rest || '',
        load: e.load || '',
        rpe: e.rpe || '',
        superset: e.superset || '',
        per_week: Array.isArray(e.wk) ? e.wk.join('|') : (e.wk == null ? '' : String(e.wk)),
        has_video: e.videoUrl || e.videoLink ? 1 : 0,
        note_lines: notes ? notes.split('\n').filter((x) => x.trim()).length : 0,
        note_chars: notes.length,
        note: notes,
      });
    });
  });
}

const COLS = Object.keys(rows[0] || {});
writeFileSync(CORPUS + '/phase1-rows.jsonl', rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
writeFileSync(CORPUS + '/phase1-rows.tsv',
  [COLS.join('\t'), ...rows.map((r) => COLS.map((c) => String(r[c]).split('\n').join(' / ').split('\t').join(' ')).join('\t'))].join('\n') + '\n');

const tally = (fn) => { const m = {}; for (const r of rows) { const k = fn(r) || '(blank)'; m[k] = (m[k] || 0) + 1; } return m; };
const top = (m, n) => Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, n)
  .map(([k, v]) => `| ${k} | ${v} | ${(v / rows.length * 100).toFixed(1)}% |`).join('\n');

const matched = rows.filter((r) => r.matched_library).length;
const md = `# Phase 1 — extraction summary

${rows.length} prescribed exercises, from ${plans.length} TRAIN plans across
${new Set(rows.map((r) => r.athlete_id)).size} athletes. Deterministic: re-running
this script reproduces every row_id.

${matched} rows (${(matched / rows.length * 100).toFixed(1)}%) were MATCHED to a library
exercise, by library id first and normalised title second.

**Matched is not classified, and the difference matters to Phase 2.** Only
${rows.filter((r) => r.pattern).length} rows (${(rows.filter((r) => r.pattern).length / rows.length * 100).toFixed(1)}%) come back with a movement
pattern, because the library's taxonomy fields are almost entirely empty — 75 of
1,332 exercises are classified (5.6%), against 61% that carry cues and 66% that
carry a video. The classification screen exists and is live; the work has not
been done.

So any pattern-level reasoning downstream has to be DERIVED FROM THE TITLE, not
read off the library, and Phase 2 must not be designed around a taxonomy that is
94% blank. Recording it here rather than letting a later phase discover it as a
wall.

## How he doses — the fields, counted

| field | filled | share |
|---|---|---|
| rest | ${rows.filter((r) => r.rest).length} | ${(rows.filter((r) => r.rest).length / rows.length * 100).toFixed(1)}% |
| note | ${rows.filter((r) => r.note_chars).length} | ${(rows.filter((r) => r.note_chars).length / rows.length * 100).toFixed(1)}% |
| tempo | ${rows.filter((r) => r.tempo).length} | ${(rows.filter((r) => r.tempo).length / rows.length * 100).toFixed(1)}% |
| superset | ${rows.filter((r) => r.superset).length} | ${(rows.filter((r) => r.superset).length / rows.length * 100).toFixed(1)}% |
| load | ${rows.filter((r) => r.load).length} | ${(rows.filter((r) => r.load).length / rows.length * 100).toFixed(1)}% |
| rpe | ${rows.filter((r) => r.rpe).length} | ${(rows.filter((r) => r.rpe).length / rows.length * 100).toFixed(1)}% |

## Set counts

${top(tally((r) => 'sets = ' + r.sets), 8)}

## What the reps field actually holds

${top(tally((r) => r.reps_shape), 8)}

## Movement pattern, where the taxonomy resolved

${top(tally((r) => r.pattern), 12)}

## Equipment

${top(tally((r) => r.equipment), 12)}

Files: phase1-rows.jsonl (${rows.length} lines), phase1-rows.tsv, this summary.
`;
writeFileSync(CORPUS + '/phase1-summary.md', md);
console.log(md);
