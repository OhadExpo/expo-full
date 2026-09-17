// §3 restamp for 2026-09-12 22:15 — verified with git before writing:
//   HEAD 73d6dd5 (22:11), 31 commits ahead of origin/master (cf884fb),
//   origin/bhbc-hebrew = 73d6dd5, 147 files differ from origin/master,
//   deploy-0911 = bb394e3 pushed, its src differs from the branch in 5 athlete files only.
import fs from 'node:fs';
const f = 'docs/HANDOFF-2026-09-06.md';
let s = fs.readFileSync(f, 'utf8');
const rep = (from, to) => { if (!s.includes(from)) throw new Error('missing: ' + from.slice(0, 60)); s = s.replace(from, to); };
rep('| HEAD | `85b2f89` (2026-09-11, 21:00) |', '| HEAD | `73d6dd5` (2026-09-12, 22:11) |');
rep('| Ahead of `origin/master` | **7 commits** — the athlete-portal remainder only:',
    '| Ahead of `origin/master` | **31 commits** — the athlete-portal remainder PLUS the 09-12 coach work (rows 75–79: nav mirror, RTL codemod, editor OCD, sheet revenue, sync clock, literal gate, club-zone Hebrew), all carried on `deploy-0911` = `bb394e3` (pushed; only `ClientPortal`/`MealLogger`/`TrySandbox`/`auth`/`App` differ, held at production). The remainder itself is still:');
rep('| `origin/bhbc-hebrew` | **backed up** at `5cdcf3d` — pushed 2026-09-07 with his say-so.',
    '| `origin/bhbc-hebrew` | **backed up** at `73d6dd5` — pushed 2026-09-12 22:11 (first push 2026-09-07 with his say-so).');
rep('| Diff vs `origin/master` | **37 files** —', '| Diff vs `origin/master` | **147 files** (3,820+ / 1,004−) —');
fs.writeFileSync(f, s);
console.log('§3 restamped');
