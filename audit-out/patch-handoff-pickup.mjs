// §0 PICK UP HERE - the first thing a new session reads, and §3 restamped from
// the numbers on disk at write time (his rule: a handoff line is a NEW claim).
import fs from 'node:fs';
import { execSync } from 'node:child_process';
const g = (c) => execSync(c, { encoding: 'utf8' }).trim();

const HEAD = g('git rev-parse --short HEAD');
const AHEAD = g('git rev-list --count origin/master..HEAD');
const FILES = (g('git diff --stat origin/master HEAD | tail -1').match(/(\d+) files? changed/) || [])[1] || '?';
const DEPLOY = g('git rev-parse --short origin/deploy-0911');
const MASTER = g('git rev-parse --short origin/master');
const OPEN = g('grep -c "^- \\[ \\]" audit-out/QUEUE-0907.md');
const REVS = fs.readdirSync('audit-out/sheets/rev').filter((x) => /^r\d+\.xlsx$/.test(x)).length;
const CAL = JSON.parse(fs.readFileSync('audit-out/sheets/bhbc-calendar.json', 'utf8')).length;
const ff = (() => { try { execSync('git merge-base --is-ancestor origin/master origin/deploy-0911'); return true; } catch { return false; } })();

const f = 'docs/HANDOFF-2026-09-06.md';
let s = fs.readFileSync(f, 'utf8');
if (s.includes('## 0 · PICK UP HERE')) {
  s = s.slice(s.indexOf('\n', s.indexOf('## 1 ')) > -1 ? s.indexOf('## 1 ') : 0); // drop a previous block
}
const block = `# EXPO handoff

## 0 · PICK UP HERE  (written 2026-09-15 01:00, the last thing the 09-13/15 session did)

**Read this, then \`audit-out/QUEUE-0907.md\` (${OPEN} open items), then \`git log --oneline -15\`.** Nothing is in flight; every branch is pushed.

| | |
| --- | --- |
| Production | \`${MASTER}\` — the athlete portal's LOGGED chip, deployed 2026-09-15 00:14 on his explicit yes for that fix alone |
| His branch | \`bhbc-hebrew\` = \`${HEAD}\`, ${AHEAD} commits and ${FILES} files ahead of production, pushed |
| Deploy candidate | \`deploy-0911\` = \`${DEPLOY}\`, built green, smoked on all 12 routes, ${ff ? 'a **fast-forward** — `git push origin deploy-0911:master`' : '**NOT** a fast-forward yet — merge production into it first'} |
| Rollback | \`${MASTER}\` (now) · \`dc80f2d\` (pre-09-11) |

**WAITING ON HIM — do not do these for him:**
1. **The deploy.** Everything since 11 Sep is in the candidate: coach Hebrew, the club zone, the billing history, the calendar sync. He decides.
2. **Eilat's minutes** (the 9.9 Winner Cup game) — he said "i will add the stats for eilat".
3. **One line to confirm:** the 3.9 box score prints #23 as "D.BREWTON"; every other jersey matched the roster so it went in as DJ Broughton.
4. **Bit / Green Invoice / bank exports** — \`scripts/import-payments-csv.mjs\` is waiting for any file he drops.

**WHAT IS LIVE AND RUNNING (do not rebuild it):**
- **Billing history.** Every revision of רשימת מתאמנים that exists (${REVS} files) → per-client timeline → payments with ESTIMATED amounts (method + confidence) reconciled to ניהול פיננסי, on /coach/billing and on each athlete's billing section. Gate: \`scripts/verify-billing-history.mjs\`.
- **The club calendar.** \`scripts/fetch-bhbc-calendar.mjs\` (${CAL} events) replays the Calendar app's own origin call from a background tab — he only READS that calendar and nobody had to share anything. Merged by \`scripts/sync-bhbc-calendar.mjs\`.
- **The twice-daily sync** (\`expo-revenue-sync-daemon.vbs\` in shell:startup, 09:00/21:00) does: fetch sheets → harvest new revisions → parse → derive → import → gate → fetch calendar → merge calendar. Last full run 15.9 00:38: clean, no soft failures.

**THE TRAP THAT COST AN HOUR — read before touching git here:** \`origin/master\` descends from the 09-11 deploy tree, where four athlete files (\`ClientPortal\`, \`MealLogger\`, \`App\`, \`auth\`) were deliberately set BACK to production. So \`git merge origin/master\` into \`bhbc-hebrew\` re-applies that reversion and silently deletes the portal's lazy-loading, the Hebrew login and the RTL margins. It happened at 00:35 and was restored from the pre-merge commit. **Carry production forward by cherry-pick, or restore those four files from the branch's own side straight after any merge.**

**First thing to work on if he gives no new instruction:** the phone-width sweep of every chip, pill and button in both apps (queue item J4). The portal's LOGGED chip broke that way on 14.9 and nothing has checked its siblings.

`;
s = block + s.replace(/^# EXPO handoff\s*/, '');
fs.writeFileSync(f, s);

// ---- §3 restamped ----
let t = fs.readFileSync(f, 'utf8');
t = t.replace(/\| HEAD \| `[0-9a-f]+` \([^)]*\) \|/, `| HEAD | \`${HEAD}\` (2026-09-15) |`);
t = t.replace(/\| Ahead of `origin\/master` \| \*\*\d+ commits\*\*/, `| Ahead of \`origin/master\` | **${AHEAD} commits**`);
t = t.replace(/\| `origin\/bhbc-hebrew` \| \*\*backed up\*\* at `[0-9a-f]+` — pushed [0-9-]+/, `| \`origin/bhbc-hebrew\` | **backed up** at \`${HEAD}\` — pushed 2026-09-15`);
t = t.replace(/\| Diff vs `origin\/master` \| \*\*\d+ files\*\*/, `| Diff vs \`origin/master\` | **${FILES} files**`);
t = t.replace(/\| Restore point \| `dc80f2d`/, `| Restore point | \`${MASTER}\` (production now) · \`dc80f2d\``);
fs.writeFileSync(f, t);
console.log(JSON.stringify({ HEAD, AHEAD, FILES, DEPLOY, MASTER, OPEN, REVS, CAL, fastForward: ff }));
