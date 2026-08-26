# Undeployed work — NONE. Everything is on master. (2026-08-26, evening)

`git rev-list --count origin/master..bhbc-hub` = **0**.
`git diff --name-only origin/master bhbc-hub -- src/ expo-il/src/` = **empty**.

**Master is `90fcd8e`** and production is serving it, verified by code marker and
by chunk-hash equality against a local build.

Rollback for the whole of today: `git push origin 6f07c05:master --force`.
The last pre-evening point was `5479db8`.

## What shipped today, in one list

| Area | What |
|---|---|
| **The original bug** | `planCopy.js` — a copied program carries the exercise VIDEO and TITLE onto the row |
| **Shot Analyzer** | session read + outlier verdict; names the rep to watch; a rep counted twice; every tracker refusal explains itself; starved-capture warning; height and shot type remembered; scrubbing re-selects the rep; drills collapsed; legend isolates one line; one joint order everywhere |
| **/try** | renders the REAL athlete portal, not a hand-written copy |
| **Theme** | one page-wide cross-fade instead of 434 competing transitions |
| **Hebrew** | `קיו`→`דימוי`, `הקבלה`→`העדות`, `הרמת יד`→`זווית הזרוע`, RTL units no longer read backwards, `TORSO`→`גו` |
| **Dashboard** | ONLINE NOW lifted above Messages |
| **Audit** | all 103 findings closed; #60 #70 #71 #72 #76 #78 #79 #87 #88 #92 #103 fixed |
| **Harnesses** | three were caught lying and fixed: light/dark measured mid-layout, the mobile audit called a crashed route "ok", prod-smoke tested a build from that morning |

## Verified, not assumed

- all engine suites green · build clean · mobile **28/28** at 390px
- light/dark **geometry parity perfect**: `moved=0, countDelta=0` on all 17 routes
- prod smoke: 12/12 routes clean **on the deployed bundle** (it now refuses to
  report on a cached one)
- `/try` film-a-set walked end to end as a visitor: warm-ups → check-in →
  exercise → upload → sandbox takes over
- Shot Analyzer on Ohad's clip through the real UI: **11 of 11**

## Three things that need Ohad, not code

1. **The three-pointer.** The analyzer's scale is right (it agrees with
   scale-free physics to ~6%), but the tracked arc measures 4.71 m/s of VERTICAL
   velocity, and a 6.75 m three needs 7-8 whatever the camera angle. Either
   those shots are not from the arc, or the camera was not level.
   `docs/shot-scale-open-problem.md`.
2. **Dark-mode contrast.** `--c-td: #444450` on `#0a0a0c` is **2.06:1**, under
   the 3:1 floor, and is the sole cause of the low-contrast flags on six coach
   routes. One token would lift all six — but palette changes are his call.
3. **Three cue rows on Amit.** No cue exists anywhere: not the library, not any
   plan row, not any of the 19 exported sheets, and the canonical library's
   Coaching Notes column is empty for all 384 exercises.

## Undeployed tooling and docs — no runtime effect

37 files (32 scripts, 5 docs): the reconciliation engine (`reconcile-sheet-vs-app.cjs`,
`reconcile-all.cjs`, `apply-sheet-fixes.cjs`, `restore-plan-backups.cjs`,
`import-sheet-block.cjs`, `resync-plan-from-sheet.cjs`), eleven `audit-*.cjs`
scripts, the library backfills, `spotcheck-sheet-vs-app.cjs`, and four docs
(`sheet-reconciliation.md`, `row-coherence.md`, `missing-videos.md`, plus the
updated 08-22 audit statuses).

These are scripts Ohad runs, not code the app loads. They ship whenever the rest
does; nothing waits on them.

## Already live regardless of any deploy

Every DATA repair is in Supabase and is live now:

- 285 video URLs written onto plan rows; **273 filled a blank**, 9 replaced the
  same clip with a cleaned url, **3 replaced a genuinely different clip** (all
  in one Block #4 — listed below for a ruling)
- library video coverage **641 → 879**, cues **806 → 818**
- **456 malformed links repaired** (178 library, 155 rows, 130 warm-ups)
- 34 supersets filled; **8 superset writes reverted** as a correction
- 4 blocks imported that existed only in Drive (Zack Bryant, DJ Burns, Noah
  Carter had no plans at all; Frederic was missing Block #4)
- Ohad's "Block #2 - INT Up" rebuilt — it had held 32 movement-breakdown cells
  instead of exercises
- 38 junk rows removed database-wide

## Needing a decision from Ohad

1. **3 video overwrites** — Block #4: Walking Contralateral DB Lunge,
   Declined-Laying DB Pullover, ATH-POS SA DB Row. The sheet's clip replaced a
   different one that was already there. Revert on request.
2. **16 rows whose NOTES are another exercise's cues** — root cause is library
   content, e.g. "ISO Wide-Grip Deficit Push-Up" carrying Single Leg Hip Thrust
   cues. Cue authoring is Ohad's; every instance is in `docs/row-coherence.md`.
3. **Yuval Gotliv** — his sheet was last modified 2024-08-13, his app plans run
   to 2026-07. **The app is two years newer**; his 114 "gaps" are the sheet
   being historical. Nothing to fix unless Ohad says the sheet is authoritative.
4. **Gym Instagram** — the gym page links `@expo_il`, `CONTACT.instagram` is
   `@ohadaptable`. Which is right for the gym is a content decision.
5. **455 exercises still have no video anywhere** — sources are exhausted (all
   18 sheets, plan rows, twins, and the canonical xlsx, which has no video
   column at all). `docs/missing-videos.md` ranks them by how many plan rows
   each would fix.

## The deploy pipeline itself — CAUGHT UP

Production is now serving `5479db8`, which is master. Nothing is waiting.

Proved two ways rather than asserted:

- **String markers.** Production's chunks contain "That session moved" (#70),
  "Minutes must be more than 0" (#71), "per-goal stop-set cutoff" (the corrected
  Lift Metrics blurb) and "which rep does not" (the analyzer's session read), as
  well as all five of the Shot Analyzer's new strings.
- **Chunk hash.** #72's fix contains no string that survives minification, so
  that one was checked by building `5479db8` locally and comparing: both the
  local build and production serve `BhbcView-CmQyIREI.js`. Identical hash means
  identical bytes, so the deployed bundle IS that commit.

It was not smooth. The pipeline was stopped for most of the day, cleared one
batch in the evening, stopped again for about an hour, then cleared the rest. If
a push appears not to arrive, check by code marker — not by the deploy list, and
not by reloading the page, which the service worker will happily answer from
cache.
