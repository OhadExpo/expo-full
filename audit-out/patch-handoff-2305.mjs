import fs from 'node:fs';
const f = 'docs/HANDOFF-2026-09-06.md';
let s = fs.readFileSync(f, 'utf8');
const nl = s.includes('\r\n') ? '\r\n' : '\n';
s = s.split('\r\n').join('\n');
const rep = (from, to, n = 1) => { const c = s.split(from).length - 1; if (c !== n) throw new Error(`expected ${n}, got ${c}: ${from.slice(0, 60)}`); s = s.split(from).join(to); };
// 13e: the final numbers
rep(`commits after \`bd3a939\`.\n`, `commits after \`bd3a939\`.

The numbers at the end of the shift (Latin words per route, owner seat, app in
Hebrew; what remains is names, e-mails, months, exercise names and file formats):

| route | before | after |
| --- | --- | --- |
| /coach (dashboard) | 177 | 39 |
| /coach/tasks | 244 | 12 |
| /coach/billing | 143 | 18 |
| /coach/review-tools | 44 | 15 |
| /coach/exercise-cleanup | 209 | 68 |
| /coach/calendar | 43 | 10 |
| /coach/sessions | 43 | 30 |
| /coach/smart-import | 39 | 11 |
| /coach/intake | 17 | 8 |
| /coach/bugs | 10 | 2 |

Auto-task bodies are stored in English (their idempotency keys depend on the
text) and re-said in Hebrew at render by \`src/autoTaskHe.js\` — ten templates,
names kept inside bidi isolates; anything the coach typed passes through untouched.
`);
// 15.4b: items 1 and 3 are done
rep(`1. **The exercise-cleanup tool in Hebrew** — \`/coach/exercise-cleanup\` reads 209
   Latin UI words (NUMBERS, SET, REP, NOTE, SUPERSET, WARMUP, MARKER, FLAGGED…)
   and its view has no translator at all. Owner-only, dense, a session of its own.`,
`1. ~~**The exercise-cleanup tool in Hebrew**~~ — DONE 2026-09-07 late: 209 → 68
   Latin words, the 68 are exercise names (\`src/ExerciseCleanupView.jsx\` has a
   translator; the reasons go through \`tt(r.reason)\`).`);
rep(`3. **Auto-task bodies** are stored English text ("Call … skipped", "Chase
   payment") in \`coach_notes.body\`; translating them means translating at
   write time in \`autoTasks.js\`, and the existing rows stay as they are.`,
`3. ~~**Auto-task bodies**~~ — DONE 2026-09-07 late, the other way round: the
   stored English stays (idempotency keys depend on it); \`src/autoTaskHe.js\`
   re-says the ten templates in Hebrew at render (\`displayBodyOf\` in both
   \`TasksV8View.jsx\` and \`taskFormat.js\`). Tasks page 244 → 12 Latin words.`);
// ledger row 56 numbers + three new rows
rep(`dashboard 177→44, tasks 244→54, billing 143→18, review 44→15 Latin words;`, `dashboard 177→39, tasks 244→12, billing 143→18, review 44→15 Latin words;`);
const i56 = s.indexOf('\n| 56 |'); if (i56 < 0) throw new Error('row 56 missing');
const end56 = s.indexOf('\n', i56 + 1);
s = s.slice(0, end56) + `
| 57 | "keep going" (×2, during the three hours) | **done** — the sweep continued route by route; see §13e for the numbers |
| 58 | "update the local host chrome for me to judge before deploying with the rules we had" | **done** — :4179 recap / :4180 replan / :4181 tonight rebuilt on the final build (16 pairs mirrored + the six small coach routes), and opened in the persistent debug Chrome (9222, \`chrome-debug-budget\`, launched beside his own Chrome, nothing killed) |
| 59 | "no way you stopped working after 12 minutes. you have a ful hour of work!" | **done** — worked through to ~23:50: the last labels on sessions / bugs / smart-import, the exercise-cleanup tool, the auto-task bodies, the host refresh, this handoff |` + s.slice(end56);
fs.writeFileSync(f, s.split('\n').join(nl));
console.log('handoff patched');
