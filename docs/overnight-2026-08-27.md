# Overnight run — 2026-08-27, 00:41 → 05:41

Ohad: *"keep working on your own, autonomously for the next 5 hours straight.
i don't want you to fail. make sure you finish 5 full straight hours of work."*

**This file is the resume point.** Context will compact several times across five
hours. On any restart: read this file, take the top unfinished item, keep going.
Do not stop, do not write a wrap-up report, do not ask. Only Ohad's explicit stop
ends this.

## The failure to not repeat

The previous 2-hour block ended after ~1 hour because I finished a task, felt
done, and wrote a summary. **Finishing a task is not finishing the mandate.**
Every turn ends in a tool call that advances the queue. When an item is done,
tick it here and start the next one in the same turn.

## Checkpoint

- Started: 00:41
- Restore point (pre-run master): `2d5829e`
- Last push: `0982aae`
- Branch: `bhbc-hub`, deploying to `master`

## Queue (work top-down; re-order only for a hard blocker)

- [x] Hebrew: sequence arrows pointing against RTL reading direction — `0982aae`
- [x] **1. Prod deploy stall — ROOT CAUSE FOUND AND FIXED** (`015b694`).
      `package.json` carried `pngjs`, the lockfile did not; Vercel installs with
      `npm ci`, which refuses that mismatch. I introduced it in `ade74c7`.
      Reproduced with `npm ci --dry-run` on the committed files, fixed, and
      re-verified: origin/master now installs 508 packages clean.
- [x] **1b. Deploy CONFIRMED LIVE.** Prod now serves `ShotAnalyzer-Bd9iKZxz.js`
      with all three new Hebrew strings and zero stale ones.
- [x] **1c. Gated both silent deploy-killers** (`124eaeb`):
      `verify-lockfile-sync.mjs` (proven against the real broken commit ade74c7)
      and `verify-import-case.mjs`. Both in `npm run build`.
- [x] **NEW — laptop cleanup DONE. ~20 GB freed** (C: 69.7 -> 89.6 GB free).
      npm cache 8.3 GB · npx caches + Chrome snapshots 2.2 GB · Chrome caches
      2.5 GB · TEMP 1.0 GB · pip 0.55 GB · uv 0.19 GB · Edge/WER/thumbs.
      Protected throughout: the live session scratchpad, `chrome-debug-budget`
      (stays logged in), Documents, and the three protected project folders.
      Side effect found and repaired: an interrupted `npm install` had emptied
      `node_modules/.bin` (78 binaries restored, build green again).
      STILL NEEDS HIS DECISION, not touched: DriveFS cache 6.9 GB (may hold
      pending uploads), Downloads 4.3 GB, ms-playwright 1.9 GB (deleting breaks
      the Playwright MCP until re-download), old scratch chrome profiles ~1.3 GB.
- [x] ~~laptop cleanup original note~~ (Ohad, 00:45: *"clean my laptop windows sometime
      in between from useless files for more space and faster operation"*).
      MEASURE first, then delete only unambiguously safe categories: temp, caches,
      Windows Update leftovers, old logs, npm/pip caches. NEVER touch
      `Desktop\expo-full`, `EXPO`, `Ohad Medical`, or anything that looks like
      source or data. Report bytes freed.
- [ ] ~~old item 1~~ (superseded) Prod is 5+ commits behind and has been since
      before tonight. Serves `ShotAnalyzer-Dulx_QZE.js`. Try every path that does
      not need Ohad: Supabase/Vercel MCP OAuth, an empty commit to re-trigger the
      hook, checking whether the build fails rather than never starts.
      Harness: `scripts/_watch-prod-hebrew.mjs`.
- [ ] **2. BHBC RLS migration, still unapplied.** A regular coach can write the
      medical board AND the 1,326-row shared exercise library.
      `scripts/migrations/2026-08-26-bhbc-coach-write-scope.sql` is written and
      committed; `scripts/verify-bhbc-write-scope.mjs` sits at 5/8. Blocked on
      service key / MCP OAuth — retry, this is the highest-severity open item.
- [ ] **3. Hebrew, finish the sweep.** ~250 short strings (2–4 words) never put
      in front of the judge. The best finds so far came from exactly this class
      (`בעקבי`, `שכיבות שמיכה`). Gate: `npm run build` runs `verify-hebrew.mjs`.
- [ ] **4. Shot Analyzer — "we're at 20% of how good i want it to be."** His
      words. Biggest open product item. See `project_shot_analyzer_2026_08_24`.
- [ ] **5. Resume the platform bug audit.** 103 findings on disk, waves 1–2 shipped,
      wave 3 half-done, **6 finder sets never read, verify phase never ran**.
      See `project_platform_bug_audit_2026_08_22` for the journal path.
- [ ] **6. Task queue from 08-22** — `project_task_queue_2026_08_22`, 10 asks;
      item 10 (full mobile sweep) is meant to run LAST.
- [ ] **7. Light/dark parity sweep** — rolling; pickup list in
      `project_light_dark_parity_sweep`.

## Gotchas found during this run

- **The dev server hangs when launched from a backgrounded Bash task.** It
  prints "ready in 726ms", listens on `[::1]`, and then never answers a single
  request — no error in its log. Chrome hangs on it too, so it is not a curl
  artifact. Launching it detached with its own console works instantly:
  `Start-Process cmd.exe '/c npx vite --port 5210 --strictPort > log 2>&1'`.
  Almost certainly the task's stdout pipe blocking. NOT a problem with Ohad's
  dev setup - do not report it as one.
- `git commit -m` with a message containing quotes or em-dashes gets torn apart
  by the shell. Write the message to a file and use `-F`.
- Heredocs here collapse `
` and `\` inside Python/JS string literals. For
  anything with escapes, use the Write/Edit tools instead.

## For Ohad to decide (measured, deliberately NOT changed)

**`spreadOf` uses population SD, not sample SD.** `src/shotSession.js:17`
divides by `n`, which describes the reps you filmed. Dividing by `n-1` is the
unbiased estimate of how variable the SHOOTER is, which is what the verdict
("your release angle moves between reps") actually claims. Switching would widen
every spread and make some sessions flip from tight to not-tight:

| shots | spread reads wider |
|---|---|
| 3 | +22.5% |
| 5 | +11.8% |
| 11 | +4.9% |
| 20 | +2.6% |

The TIGHT thresholds were calibrated against the current formula, so changing
one without the other silently re-grades his shooting. Left alone on purpose —
it needs a decision plus re-calibration, not a 2am edit.

## Standing rules for this run

- Branch `bhbc-hub`; he has authorised deploying this work to `master`.
- Never touch `src/exerciseData.js` or any cue text — cue authoring is his.
- Snapshot before any data change; record the SHA before any deploy.
- Verify from the real seat; screenshot before claiming anything visual.
- Re-derive every number before writing it down. Tonight the first count was
  wrong twice and a vocabulary table said the exact opposite of the truth.
