# Lens 10 — the next shift: do this, in this order

*Three hours of work, sequenced. Everything below is a start, not a rescue —
the working tree is clean.*

## Before you touch anything (5 minutes)

```bash
git status --short                 # expect nothing under src/ scripts/ docs/
git log --oneline -10
node scripts/audit-handoff.mjs     # should exit 0
npm run build                      # eslint gates it; must pass before you edit
npx vite preview                   # 4173, if it is not already up
```

Start the three page servers only when you need them; they die with their shell:

```bash
node scripts/serve-recap.mjs 4179 &
node scripts/serve-page.mjs audit-out/bhbc-replan.html 4180 &
node scripts/serve-page.mjs audit-out/tonight.html 4181 &
```

## Task 1 — the athlete-facing section (≈45 min)

His words: *"add another section: chances that touch the athlete
ui/expeiernce/portal and also show before after"*.

The screenshots already exist:

```
audit-out/pairs/portal-he-live.png    audit-out/pairs/portal-he-branch.png
audit-out/pairs/pt-zone-he-live.png   audit-out/pairs/pt-zone-he-branch.png
audit-out/pairs/pairs-he.json
```

In `scripts/build-tonight.mjs`, the `LIVE` const and `LIVE_TITLES` map at the
top already read `pairs.json` and render a section per pair. Add a second block
reading `pairs-he.json`, titled for the athlete, with this substance:

- On production an athlete who picks Hebrew **still sees English** — the portal
  renders outside the language provider. On this branch it renders Hebrew. That
  is the largest athlete-visible change in the branch.
- Dates: `27th of August 2026` → `27 באוגוסט 2026`; order never changes.
- Translated: install prompt, meal log, messages, PRs, history headings, the
  mid-session words, READINESS GRAPH, NOTE.
- Nothing new is asked of an athlete, and `readinessAutoreg.js` was not touched.

Verify by looking: rebuild, then
`node scripts/shoot.mjs http://127.0.0.1:4181/ audit-out/tonight-look.png 1400 1000 full 6000`
and READ the image.

## Task 2 — align the pairs (≈30 min)

His words: *"make sure everything on the localhost is aligned right to left for
easy choice of before and after"*.

In the CSS inside `scripts/build-tonight.mjs`:

- both `.shot` panes of a pair: the same fixed height, `overflow:auto`
- an inline script that mirrors `scrollTop` between the two panes of each
  `.pair` (guard the feedback loop with a flag)
- images stay `width:100%` so both render at the same scale

Then look at it again.

## Task 3 — whatever he has asked since (open-ended)

Cue every new ask the moment it arrives. He should never have to repeat himself.

## Task 4 — refresh all three hosts at the END, not before

His words: *"but only after 3 hours have past"*.

```bash
node scripts/shoot-prod-vs-branch.mjs
LANG_APP=he JOBS="athlete:/athlete:portal,pt:/coach/bhbc:pt-zone" node scripts/shoot-prod-vs-branch.mjs
node scripts/build-tonight.mjs
node scripts/build-bhbc-replan.mjs
node scripts/build-recap.mjs
node scripts/audit-handoff.mjs
```

## Task 5 — before you stop

1. Run the gate set in lens 6 for whatever you touched.
2. Update `docs/HANDOFF-2026-09-06.md` §3 (state) and §12 (queue), and re-run
   the audit until it is green.
3. Write a memory file for the session and add ONE line to `MEMORY.md`.
4. Commit everything; leave no uncommitted work in `src/`, `scripts/`, `docs/`.
5. Report: what changed, what was measured, what is still open, what needs him.

## What NOT to do with the time

- Do not deploy.
- Do not start the recap before/after rebuild (task 4 of the master queue) until
  tasks 1 and 2 are done and looked at — he asked for those first.
- Do not add the month grid to the dashboard without asking; it would re-create
  the duplication this replan removed.
