# What is on `bhbc-hub` and NOT on `master` — updated 2026-08-26 (evening)

Every file and count below comes from `git diff origin/master bhbc-hub`, run at
the time of writing. Nothing is carried forward.

**Master is `5479db8`, and production is level with it** (verified earlier by
string marker and by chunk hash). **The branch is 78 commits ahead: 21 app
files, 36 scripts, 6 docs.**

Rollback for the whole deploy sequence: `git push origin 6f07c05:master --force`.

---

## Undeployed app code — 21 files

### Athlete-facing
| File | What changes | Risk |
|---|---|---|
| `src/planCopy.js` **(new)** | **The original bug.** A copied program carries the exercise VIDEO and TITLE onto the row. Proven on Omer’s Block #3: 4 rows carried a video before, 30 after. | New file; nothing imports it on master |
| `src/ClientPortal.jsx` | One new optional prop `onFilmSet`. In demo mode a surface that wants the clip gets it; **no change to any real athlete path** | Low — additive, default null |
| `src/WorkoutsView.jsx` | **#102** the logger dropped the coach’s per-row video on old-shape plans (174 of 209); **#103** values typed during the ~1s channel-join window never reached an open portal and were then blanked | Low |
| `src/ClientPortal.jsx` + `src/usePlansStore.js` | **#98** stale-request guard — a slow fetch could overwrite the program the coach opened | Low |

### Coach-facing
| File | What changes |
|---|---|
| `src/PlansView.jsx` | uses `planCopy`; **#89** week grids no longer truncate; **#88** Save Program could silently lose the last edit by racing the autosave |
| `src/SessionsView.jsx` | **#91** group finish compacted set arrays; **#93** duplicate athlete; **#92** stale `planIndex` capped the auto-week at 8 |
| `src/NextBlockReport.jsx` | **#87** a stray un-numbered plan was read as the athlete’s current block |
| `src/TraineesView.jsx` | **#97** the roster modal wrote its open-time snapshot back |
| `src/TraineeDetail.jsx` | **#95** couple portal-visibility toggle wrote a key the portal never reads |
| `src/ReviewToolsView.jsx` | **#90** camera target reps ignored the wave; Shot Analyzer blurb shortened to one line |
| `src/liftDetect.js` | **#86** "Tricep Kickback" counted reps on the HIP |

### Theme, demo and marketing
| File | What changes |
|---|---|
| `src/hooks/useTheme.js` + `src/themes.css` | **the light/dark switch** — one page-wide 380ms cross-fade instead of 434 competing element transitions |
| `src/TrySandbox.jsx` + `src/DemoTraineePortal.jsx` | **/try renders the REAL portal** instead of a drifted hand-written copy |
| `src/CoachDemo.jsx` | **#75** literal `${C.cardBd}` border; **#77** blank page on unknown id; **#78** chip could not compress; **#76** PROGRAMS tab left the detail on screen |
| `src/CoachLanding.jsx` | **#79** switching to Hebrew counted as a demo-open in the funnel |
| `src/ShotAnalyzer.jsx` + `src/shotI18n.js` | Hebrew corrections (incl. `הרמת יד` → `זווית הזרוע`) and prose units |
| `src/demoTraineeData.js` | **#80** UTC dates showed "yesterday" between midnight and 03:00 |
| `expo-il/src/i18n.js` | analyzer copy trimmed so the card stops running 2× its neighbours |

---

## Verified before this list was written

- `node scripts/verify-analysis-engines.mjs` — **all suites green** (54 groups)
- `npm run build` — clean, eslint gate included
- `node scripts/audit-mobile-fit.mjs` — **28/28 routes clean at 390px**, with the
  audit now failing a crashed or blank route rather than calling it "ok"
- `/try` screenshotted against `/athlete` — anatomically identical
- theme switch measured: 3 animations mid-switch (the cross-fade’s own), 0 after

## Known, deliberately not done

- **`ClientPortalMock` is still in `TrySandbox.jsx`, unrendered.** Deleting its
  633 lines built and linted clean and then crashed `/try` at runtime. It comes
  out on its own with its own verify pass.
- **The `/try` film-a-set entry is now deeper** — a visitor reaches it through
  the day view like a real athlete, instead of a red button on every row. That
  is the accuracy-over-funnel trade you chose; say the word if you want it
  surfaced again.
- 27 em-dashes remain across the Hebrew strings.

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
