// Replace §4c of the handoff (a bash-mangled first draft) with the real text.
import fs from 'node:fs';
const f = 'docs/HANDOFF-2026-09-06.md';
let s = fs.readFileSync(f, 'utf8');
const nl = s.includes('\r\n') ? '\r\n' : '\n';
s = s.split('\r\n').join('\n');
const start = s.indexOf('## 4c · What happened in the night of 09-07 → 09-08');
const end = s.indexOf('## 5 · His sheet, read in full');
if (start < 0 || end < 0 || end < start) throw new Error('section bounds not found');
const body = `## 4c · What happened in the night of 09-07 → 09-08 (23:50 → the last 30 minutes)

He reset the timer twice (23:50, 00:22) and went to sleep. In order:

1. **His four lifts** (Zack Bryant 30, עמית מנחם 30, עמית גרשון 60, Nathan Knight 60 on 2026-09-07) — \`scripts/bhbc-log-lift.mjs\`, snapshot first, 4/4 verified, the weight-room tab reads *4 lifted today · 180 min*. Two roster names are stored in Hebrew now; \`audit-out/list-bhbc-roster.mjs\` prints them.
2. **Four reproducible before/after pairs** (tasks-autobody, dashboard-dashes, roster-offline, bw-bidi) in \`scripts/build-before-after.mjs\`; the recap at :4179 shows 13. The builder learned three things: the app language goes in AFTER sign-in, the install prompt is snoozed in storage, the coach-seat check reads Hebrew nav words.
3. **Looking at the dashboard pair found a real bug:** with the wifi up and Supabase unreachable the banner said OFFLINE while Collected MTD said ₪0 and three red toasts stacked. \`unknown()\` keys on \`dataIncomplete\` now; the five payment tiles dash; a failing LOAD is quiet behind the banner, a failing SAVE still toasts (in Hebrew when the app is); the athletes empty state says the server could not be reached.
4. **The last labels**: tasks placeholders / Auto-Alerts / Done (hotkeys re-anchored to \`data-hotkey\`), the BW tab, the floor chip, the day cards' exercise count, the messages composer, the PRs and history empty states, the notifications copy, SETS / REPS inside a workout. Every athlete tab now reads 1 Latin word (his name); inside a workout 5 (day + exercise names).
5. **Demo parity**: \`/demo/athlete\` rendered above the language provider (always English); wrapped, and \`?lang=he|en\` is honoured and kept, so expo-il.co.il can hand a Hebrew reader a Hebrew demo. The coach demo and \`/try\` have no translator — §15.4b item 4 is his decision.
6. **The intake form** spoke in slash forms (מלא/י, פרט/י, דרג/י); the instruction verbs are masculine now, the status choices stay.
7. **Sweeps on the final build**: 14 gates green (23:12–23:46), console 35 routes (one preview-only 404), light/dark parity on ten routes, phone width in Hebrew from three seats (0 cut off), four offline gates, the 22-route coverage sweep (§13e), the club zone tab by tab (roster 38 · schedule 40 · weight room 17 · medical 44 · games 159 — names, positions, league data; \`audit-out/perf/bhbc-coverage-0908.log\`).
8. **Not deployed.** Every commit pushed to \`origin/bhbc-hebrew\` as it landed.

`;
s = s.slice(0, start) + body + s.slice(end);
fs.writeFileSync(f, s.split('\n').join(nl));
console.log('§4c rewritten, ' + body.length + ' chars');
