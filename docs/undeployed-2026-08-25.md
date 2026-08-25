# What is on `bhbc-hub` and NOT on `master` — updated 2026-08-26

Every count and file below comes from `git diff origin/master bhbc-hub`, run at
the time of writing. Nothing here is carried forward from an earlier version of
this document.

**Master is `5479db8`.** Rollback for the whole of this deploy sequence is
`git push origin 6f07c05:master --force`.

**Deployed today** — the Shot Analyzer in full, the BHBC zone, the marketing and
demo parity that ships with them, and three BHBC/accessibility fixes from the
audit. `git diff origin/master bhbc-hub` shows **no change at all** outside
`src/`, `scripts/` and `docs/`, and `BhbcView.jsx`, `bhbcSession.js`,
`ballTrack.js`, `shotSession.js`, `shotI18n.js`, `ShotAnalyzer.jsx`,
`shotAnalysis.js`, `shotCapture.js`, `shot-harness.html`, `expo-il/src/i18n.js`
and `expo-il/src/App.jsx` are all **identical** on master and the branch.

Verified live in production by code marker rather than by a deploy dashboard:
the `ShotAnalyzer` chunk production serves contains "Release speed", "Clean
mechanics", "of the reps repeat", "watch rep" and "could not be followed" — all
five of today's strings.

---

## Undeployed app code — 14 files

Each is a fix with a finding number, each traced in live code before it was
written. **None touches the Shot Analyzer or the BHBC zone.**

| File | What it fixes | Who feels it |
|---|---|---|
| `src/planCopy.js` **(new)** | **The original bug.** A copied program now carries the exercise VIDEO and TITLE onto the row. Proven on Omer's Block #3: 4 rows carried a video before, 30 after. | Any athlete receiving a copied program |
| `src/PlansView.jsx` | Uses `planCopy`; **#89** per-week grids no longer truncate weeks beyond `plan.weeks`; **#88** Save Program could silently lose the coach's last edit by racing the autosave | Coach editing any program |
| `src/WorkoutsView.jsx` | **#102** the in-person logger dropped the coach's per-row video on old-shape plans (174 of 209); **#103** values typed during the ~1s channel-join window never reached an already-open athlete portal, and were then blanked by the athlete's own finish | Coach logging in person |
| `src/SessionsView.jsx` | **#91** group finish compacted set arrays; **#93** the same athlete could be added twice; **#92** a stale `planIndex` capped the auto-week at 8 instead of the block's real length | Group sessions |
| `src/NextBlockReport.jsx` | **#87** a stray un-numbered plan was read as the athlete's current block, so the volume target and the whole "current" column came off the wrong program | Any athlete with an un-numbered side plan |
| `src/CoachDemo.jsx` | **#75** a chip border was the literal text `${C.cardBd}`; **#77** an unknown athlete id rendered a blank page; **#78** a grid chip that could not compress ran off the card; **#76** the PROGRAMS tab left the previous program detail on screen | Prospects in the demo |
| `src/CoachLanding.jsx` | **#79** switching the landing page to Hebrew was counted as a demo-open in the funnel, inflating the one conversion rate the page measures | Your analytics |
| `src/usePlansStore.js` | **#98** stale-request guard — a slow earlier fetch could overwrite the program the coach actually opened | Coach switching programs quickly |
| `src/TraineesView.jsx` | **#97** the roster edit modal wrote its open-time snapshot back, reverting live fields | Any concurrent change while the modal is open |
| `src/TraineeDetail.jsx` | **#95** the couple portal-visibility toggle wrote a key the portal never reads | Couples with parent-assigned plans |
| `src/ReviewToolsView.jsx` | **#90** camera target reps ignored the wave and showed the same target every week | Camera tools |
| `src/liftDetect.js` | **#86** "Tricep Kickback" counted reps on the HIP, so reps sat at 0 with no error | Rep counting |
| `src/demoTraineeData.js` | **#80** UTC dates showed "yesterday" between midnight and 03:00 | Demo visitors at night |
| `src/TrySandbox.jsx` | The same UTC drift — **not in the audit**, found by grepping for the pattern | `/try` visitors at night |

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

## The deploy pipeline itself

**This is the one thing on the list that needs Ohad and cannot be done from
here.** GitHub `master` is correct at `70b9dcd`. Production is not serving it.

Measured, not inferred: production's index bundle has been `index-C78d7_ro.js`
across every check today, through three separate pushes to `master`, and the
`ShotAnalyzer` chunk it resolves to (`ShotAnalyzer-BPEkNVrJ.js`) contains **0**
occurrences of the string "Release speed" — a label that has been in the source
since yesterday. The pipeline cleared its backlog once mid-afternoon and then
stopped again.

Builds and every test suite pass locally on the exact tree that was pushed, so
this is Vercel-side. Until it clears, none of today's work reaches anyone —
including the fix that stops a single shot being described as "repeatable
across the session". **Open the Vercel dashboard.**
