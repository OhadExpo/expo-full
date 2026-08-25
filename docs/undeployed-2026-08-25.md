# What is on `bhbc-hub` and NOT on `master` — 2026-08-25

Derived from `git diff origin/master origin/bhbc-hub`, not from memory. Every
row below was checked against the actual diff.

**Deployed today** (master `6f07c05` → `80414ce`, rollback with
`git push origin 6f07c05:master --force`):
the Shot Analyzer in full, the BHBC zone, and the marketing parity that ships
with the analyzer. Verified file-by-file: `ballTrack.js`, `shotAnalysis.js`,
`shotCapture.js`, `shotI18n.js`, `ShotAnalyzer.jsx`, `BhbcView.jsx`,
`acwrEngine.js` and `expo-il/src/App.jsx` are **identical** on master and the
branch.

---

## Undeployed app code — 12 files

Each is a fix, each has a finding number, each is verified live in code before
it was written. None of them touches the Shot Analyzer or BHBC.

| File | What it fixes | Who feels it |
|---|---|---|
| `src/planCopy.js` **(new)** | **The original bug.** A copied program now carries the exercise VIDEO and TITLE onto the row. Proven on Omer's Block #3: 4 rows carried a video before, 30 after. | Any athlete receiving a copied program |
| `src/PlansView.jsx` | Uses `planCopy`; **#89** per-week grids no longer hide and then truncate weeks beyond `plan.weeks` | Coach editing a wave-loaded block |
| `src/WorkoutsView.jsx` | **#102** the in-person logger dropped the coach's per-row video on old-shape plans (174 of 209) | Coach logging in person |
| `src/usePlansStore.js` | **#98** stale-request guard — a slow earlier fetch could overwrite the program the coach actually opened | Coach switching programs quickly |
| `src/TraineesView.jsx` | **#97** the roster edit modal wrote its open-time snapshot back, silently reverting live fields (session counters, availability) | Any concurrent change while the modal is open |
| `src/TraineeDetail.jsx` | **#95** the couple portal-visibility toggle wrote a key the portal never reads — the switch moved, nothing happened | Couples with parent-assigned plans |
| `src/SessionsView.jsx` | **#91** group finish compacted set arrays, so a skipped set shifted every later set in next week's ghost; **#93** the same athlete could be added twice | Group sessions |
| `src/ReviewToolsView.jsx` | **#90** camera target reps ignored the wave and showed the same target every week; Lift Metrics label now names what the tool measures | Camera tools |
| `src/liftDetect.js` | **#86** "Tricep Kickback" counted reps on the HIP, so reps sat at 0 with no error | Rep counting |
| `src/CoachDemo.jsx` | **#75** a chip border was the literal text `${C.cardBd}` — invalid CSS, borderless; **#77** an unknown athlete id rendered a blank page | Prospects in the demo |
| `src/demoTraineeData.js` | **#80** UTC dates showed "yesterday" between midnight and 03:00 | Demo visitors at night |
| `src/TrySandbox.jsx` | The same UTC drift — **not in the audit**, found by grepping for the pattern | `/try` visitors at night |

## Undeployed tooling and docs — no runtime effect

30 files: the reconciliation engine (`reconcile-sheet-vs-app.cjs`,
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

Production had not been tracking `master` for most of the day — proven by a code
marker, not a header: prod's `BhbcView` chunk contained **0** occurrences of a
CSS token that `6f07c05` introduced. Builds and tests pass locally, so it is a
Vercel-side stop. **This still needs Ohad's dashboard**, and today's push will
only reach athletes once it clears.
