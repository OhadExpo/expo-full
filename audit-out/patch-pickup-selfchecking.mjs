// §0 must not carry SHAs. Production moved twice in the forty minutes it took
// to write this handoff (79caf4c → a422dd5, another session shipping small
// fixes on his yes), so a stamped table is stale before it is read. Replace it
// with the commands that print the truth, and keep only what does not rot.
import fs from 'node:fs';
const f = 'docs/HANDOFF-2026-09-06.md';
let s = fs.readFileSync(f, 'utf8');
const start = s.indexOf('| | |\n| --- | --- |\n| Production |');
if (start < 0) throw new Error('state table not found');
const end = s.indexOf('\n\n', s.indexOf('| Rollback |', start));
if (end < 0) throw new Error('table end not found');
const block = `**Run this first — it prints the truth, and the truth moves:** other sessions
ship small fixes on his yes while a long one works (production moved twice in
the forty minutes it took to write this section), so nothing here states a SHA.

\`\`\`bash
git fetch -q origin
echo "production : $(git log -1 --format='%h %s' origin/master | cut -c1-60)"
echo "his branch : $(git rev-parse --short origin/bhbc-hebrew)  (+$(git rev-list --count origin/master..origin/bhbc-hebrew) commits)"
echo "candidate  : $(git rev-parse --short origin/deploy-0911)"
git diff --stat origin/bhbc-hebrew origin/deploy-0911 -- src/ | tail -1   # MUST be 5 files
git merge-base --is-ancestor origin/master origin/deploy-0911 && echo "deploy = fast-forward" || echo "production moved: cherry-pick it onto the candidate FIRST (never merge master into bhbc-hebrew - see the trap below)"
\`\`\`

| | |
| --- | --- |
| Production | \`origin/master\`. Since 2026-09-15 00:14 it has been getting single fixes cherry-picked onto it on his explicit yes (the portal's LOGGED chip, then the rails' edge fade) - so it is AHEAD of the 09-11 deploy tree in small ways the candidate may not have yet |
| His branch | \`bhbc-hebrew\` - everything since 11 Sep, always pushed |
| Deploy candidate | \`deploy-0911\` - the same tree with the athlete portal held at production. Built green and smoked on all 12 routes at 01:20 on 15.9 |
| Rollback | whatever \`origin/master\` was before the deploy · \`dc80f2d\` (pre-09-11) |`;
s = s.slice(0, start) + block + s.slice(end);
fs.writeFileSync(f, s);
console.log('§0 is self-checking now');
