// verify-sheet-parse.mjs - the direct (no-AI) program-sheet reader (5.10 #554).
// Pure, no network. Builds small workbooks in memory with SheetJS - synthetic
// exercise and athlete names only (the repo is public) - and checks the rules:
// per-day headers, hyperlinked videos, warm-up, superset GROUPS, merged cells,
// '>' waves, and above all: a blank cell stays blank (never 3, never '8-12').
// Every sheet is checked twice: as built, and after a real .xlsx write/read.
//   node scripts/verify-sheet-parse.mjs
//   BREAK=1 node scripts/verify-sheet-parse.mjs   -> the old CLI parser (its 3 /
//   '8-12' defaults, row-letter supersets, no merges) is swapped in: must FAIL.
import XLSX from 'xlsx';
import { createRequire } from 'node:module';
import * as real from '../src/sheetProgramParse.js';
import { suggestMatches } from '../src/exerciseMatch.js';

const require = createRequire(import.meta.url);

// The CLI parser (scripts/drive-import-core.cjs) adapted to this module's output
// shape - what the screen would show if it ran the old code.
function cliParse(ws, sheetName) {
  const core = require('./drive-import-core.cjs');
  const { blockName, exercises, days, warmup } = core.parseSingleSheet(ws, sheetName);
  const byId = new Map(exercises.map((e) => [e.id, e]));
  return {
    name: blockName, warmup, weeks: 4, warnings: [],
    days: days.map((d) => ({ name: d.name, exercises: d.ex.map((e) => {
      const lib = byId.get(e.eid) || {};
      const out = { title: lib.title, sets: e.s, reps: e.r, tempo: e.tempo || '', rest: '', notes: '' };
      if (lib.videoLink) out.videoUrl = lib.videoLink;
      if (e.wk) out.wk = e.wk;
      if (e.superset) out.superset = e.superset;
      return out;
    }) })),
  };
}
const parseSheetProgram = process.env.BREAK ? cliParse : real.parseSheetProgram;
const { hasDayHeader, rankMatches, buildLibIndex, autoLinkId, guessAthleteId, draftToPlanRow, AUTO_LINK_SCORE } = real;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m); } };
const V1 = 'https://youtu.be/AAAAAAAAAAA', V2 = 'https://youtu.be/BBBBBBBBBBB', V3 = 'https://youtu.be/CCCCCCCCCCC', VW = 'https://youtu.be/WWWWWWWWWWW';

// ── a two-day program sheet ───────────────────────────────────────────────
const H = ['#', '', 'Video', 'Tempo', 'Sets', 'Reps', 'Rest', 'Notes'];
const aoa = [
  ['Block Seven (stale A1 copy)'],
  ['Warm-up'],
  ['', 'Band Pull Apart (2x15)', 'Cat Cow (5 reps)', 'Warm-up notes: easy'],
  [...H.slice(0, 1), 'Day A - Lower', ...H.slice(2)],
  ['1', 'Goblet Squats', 'vid', '3010', 3, '8', '90s', 'Knees out'],
  ['2a', 'DB RDL', '', '', 3, '10>8>6>5>4', '', ''],
  ['2b', 'Side Plank Hold', '', '', '', '30s', '', ''],
  ['3', 'Walking Lunge', '', '', '', '12', '', ''],
  ['', 'Rest Off', '', '', '', '', '', ''],
  [...H.slice(0, 1), 'Day B - Upper', ...H.slice(2)],
  ['1', 'Bench Press', '', 'none', 4, '6', '2 min', ''],
  ['2', 'Pull Up', V3, '', 3, '', '', ''],
];
function buildProgramSheet() {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws.E7 = { t: 's', v: '' }; // the merged-away cell under the 2a sets value
  ws['!merges'] = [{ s: { r: 5, c: 4 }, e: { r: 6, c: 4 } }, { s: { r: 3, c: 1 }, e: { r: 3, c: 2 } }];
  ws.C5.l = { Target: V1 };            // hyperlinked "vid" cell
  ws.B11.l = { Target: V2 };           // hyperlinked exercise NAME (no video cell)
  ws.B3.l = { Target: VW };            // hyperlinked warm-up cell
  return ws;
}
const roundTrip = (ws, name) => {
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, name);
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return XLSX.read(buf, { type: 'buffer' }).Sheets[name];
};

for (const [label, ws] of [['in memory', buildProgramSheet()], ['after .xlsx write/read', roundTrip(buildProgramSheet(), 'Block 7')]]) {
  console.log(`\n-- two-day sheet, ${label}`);
  ok(hasDayHeader(ws), 'the sheet is recognised as a direct-read program (has a # day header)');
  const p = parseSheetProgram(ws, 'Block 7');
  const A = p.days[0] || { exercises: [] }, B = p.days[1] || { exercises: [] };
  const ex = (d, t) => d.exercises.find((e) => e.title === t) || {};
  ok(p.name === 'Block 7', 'the block is named after the tab, not the stale A1 cell');
  ok(p.days.length === 2 && A.name === 'Day A - Lower' && B.name === 'Day B - Upper', 'two days, named from their own # header rows');
  ok(A.exercises.length === 4 && B.exercises.length === 2, 'Day A has 4 exercises, Day B 2 (the Rest/Off row is not one)');
  ok(ex(A, 'Goblet Squats').sets === 3 && ex(A, 'Goblet Squats').reps === '8' && ex(A, 'Goblet Squats').tempo === '3010', 'sets / reps / tempo come from the columns the header names');
  ok(ex(A, 'Goblet Squats').rest === '90s' && ex(A, 'Goblet Squats').notes === 'Knees out', 'rest and notes columns are read too');
  ok(ex(A, 'Goblet Squats').videoUrl === V1, 'a hyperlinked video cell gives the row its video URL');
  ok(ex(B, 'Bench Press').videoUrl === V2, 'a hyperlinked exercise name gives the row its video URL');
  ok(ex(B, 'Pull Up').videoUrl === V3, 'a plain URL typed in the video column is the video');
  ok(ex(A, 'Walking Lunge').sets === '', 'a BLANK sets cell stays blank (never 3)');
  ok(ex(B, 'Pull Up').reps === '', 'a BLANK reps cell stays blank (never 8-12)');
  ok(!p.days.some((d) => d.exercises.some((e) => e.reps === '8-12')), 'no row anywhere carries an invented 8-12');
  ok(ex(B, 'Bench Press').tempo === '', 'a "none" tempo is blank');
  ok(ex(A, 'Side Plank Hold').sets === 3, 'a sets value MERGED down over the superset reaches the second row');
  ok(ex(A, 'DB RDL').superset === 'A' && ex(A, 'Side Plank Hold').superset === 'A', '"2a" and "2b" are ONE superset group (same letter)');
  ok(!ex(A, 'Goblet Squats').superset && !ex(A, 'Walking Lunge').superset, 'unlettered rows are in no superset');
  ok(JSON.stringify(ex(A, 'DB RDL').wk) === JSON.stringify(['10', '8', '6', '5', '4']), 'a "10>8>6>5>4" reps wave becomes the per-week reps');
  ok(p.weeks === 5, 'weeks cover the longest wave (5)');
  ok(p.warmup.length === 2 && p.warmup[0].t === 'Band Pull Apart' && p.warmup[0].rx === '2x15', 'the warm-up grid above the first day is read (name + prescription)');
  ok(p.warmup[0].vid === VW && !p.warmup[1].vid, 'a hyperlinked warm-up cell keeps its video; the other has none');
}

// ── a day header that does not name its columns ───────────────────────────
console.log('\n-- unlabelled columns');
{
  const ws = XLSX.utils.aoa_to_sheet([['#', 'Day 1', '', '', '', '', ''], ['1', 'Step Up', 'x', 'y', 'z', 'q', 'r']]);
  const p = parseSheetProgram(ws, 'Loose');
  const e = (p.days[0] || { exercises: [{}] }).exercises[0] || {};
  ok(e.title === 'Step Up' && e.sets === '' && e.reps === '' && e.tempo === '', 'columns no header named are NOT read by position (no guessing)');
  ok(p.warnings.some((w) => w.code === 'unlabelled-columns'), 'and the coach is told the day had no Sets/Reps header');
}

// ── not a program sheet ───────────────────────────────────────────────────
console.log('\n-- a plain exercise list');
{
  const ws = XLSX.utils.aoa_to_sheet([['Title', 'Video', 'Category'], ['Hip Thrust', V1, 'Glutes']]);
  ok(!hasDayHeader(ws), 'a sheet with no # day header stays on the AI path');
}

// ── library matching ──────────────────────────────────────────────────────
console.log('\n-- matching');
const lib = [
  { id: 'l1', title: 'Dumbbell RDL', videoLink: V1, cues: 'Hinge, soft knees' },
  { id: 'l2', title: 'Barbell RDL', videoLink: '' },
  { id: 'l3', title: 'Goblet Squat', videoLink: V2 },
  { id: 'l4', title: 'Reverse Lunge', videoLink: '' },
  { id: 'l5', title: 'DB Row', videoLink: '' },
  { id: 'l6', title: 'Dumbbell Row', videoLink: '' },
  { id: 'l7', title: 'Bench Press', videoLink: '' },
];
const idx = buildLibIndex(lib);
const titles = ['DB RDL', 'Goblet Squats', 'Walking Lunge', 'DB Rows', 'Bench Press', 'Pull Up', 'dumbbell rdl'];
ok(titles.every((t) => JSON.stringify(rankMatches(t, idx, 5).map((m) => [m.ex.id, m.score, m.why])) === JSON.stringify(suggestMatches(t, lib, 5).map((m) => [m.ex.id, m.score, m.why]))),
  'the once-tokenized ranker returns exactly what suggestMatches returns');
ok(AUTO_LINK_SCORE === 96, 'auto-link threshold is "same meaning" (96) or better');
ok(autoLinkId(rankMatches('DB RDL', idx)) === 'l1', '"DB RDL" links to "Dumbbell RDL" (same meaning), no duplicate created');
ok(autoLinkId(rankMatches('Goblet Squats', idx)) === 'l3', '"Goblet Squats" links to "Goblet Squat" (plural)');
ok(autoLinkId(rankMatches('Walking Lunge', idx)) === '', '"Walking Lunge" is NOT auto-linked to "Reverse Lunge" (coach picks)');
ok(rankMatches('Walking Lunge', idx)[0]?.ex.id === 'l4', '...but "Reverse Lunge" is offered');
ok(autoLinkId(rankMatches('DB Rows', idx)) === '', 'two library duplicates tied at the top are the coach\'s call, not auto');
ok(autoLinkId(rankMatches('Pull Up', idx)) === '', 'no match at all is never auto-linked');

console.log('\n-- athlete guess');
const roster = [{ id: 't1', name: 'Avi Synthetic' }, { id: 't2', name: 'Avi Testman' }, { id: 't3', name: 'Noa Example' }];
ok(guessAthleteId(roster, 'Noa Example - Block 3.xlsx Block 3') === 't3', 'a full name in the file name picks that athlete');
ok(guessAthleteId(roster, 'Testman program.xlsx') === 't2', 'a surname only one athlete has picks that athlete');
ok(guessAthleteId(roster, 'Avi block 2.xlsx') === '', 'a first name two athletes share picks nobody');
ok(guessAthleteId(roster, 'Block 9.xlsx') === '', 'no name -> nobody');

console.log('\n-- the plan row');
{
  const p = parseSheetProgram(buildProgramSheet(), 'Block 7');
  const byTitle = { 'DB RDL': lib[0], 'Goblet Squats': lib[2], 'Bench Press': lib[6] };
  let n = 0;
  const row = draftToPlanRow(p, { resolve: (t) => byTitle[t] || null, traineeId: 't3', planId: 'plan_x', makeId: () => String(++n), now: '2026-10-05T00:00:00.000Z' });
  const rows = row.data.days.flatMap((d) => d.exercises);
  const r = (t) => rows.find((x) => x.title === t) || {};
  ok(row.trainee_id === 't3', 'the plan is committed to the chosen athlete (trainee_id set)');
  ok(r('Dumbbell RDL').exerciseId === 'l1', 'a linked row carries the library id and the library title snapshot');
  ok(r('Dumbbell RDL').notes === 'Hinge, soft knees' && r('Dumbbell RDL').videoUrl === V1, 'a linked row with no sheet note/video snapshots the library cues/video (athletes cannot read the library)');
  ok(r('Goblet Squat').videoUrl === V1, 'the sheet\'s own video wins over the library video');
  ok(r('Walking Lunge').sets === '' && r('Walking Lunge').rest === '', 'blank sets / rest stay blank in the row written');
  ok(rows.every((x) => x.sets !== 3 || ['Goblet Squat', 'Dumbbell RDL', 'Side Plank Hold', 'Pull Up'].includes(x.title)), 'no row gets a 3 the sheet did not have');
  ok(row.data.weeks === 5 && row.data.warmup.length === 2, 'weeks and warm-up are written with the plan');
}

console.log(`\n${pass} passed, ${fail} failed${process.env.BREAK ? ' (BREAK=1: the old CLI parser)' : ''}`);
process.exit(fail ? 1 : 0);
