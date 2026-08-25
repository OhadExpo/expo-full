# What is on `bhbc-hub` and NOT on `master` — updated 2026-08-26

Derived from `git diff origin/master bhbc-hub`, run at the time of writing, not
from memory. The counts below are that diff's output.

**Master is `70b9dcd`.** Rollback for the whole of this deploy sequence is
`git push origin 6f07c05:master --force`.

**Deployed since 6f07c05** — the Shot Analyzer in full, the BHBC zone, and the
marketing parity that ships with them. 21 commits (`git rev-list --count
6f07c05..origin/master`), ending with these six from 2026-08-26:

| SHA | What |
|---|---|
| `f4f6deb` | names the rep to watch; fixes `verdictOk` defined twice, which made a single shot report "repeatable across the session" |
| `9267107` | codebase-wide gate for a key defined twice in one object |
| `68d81dc` | marketing: the site never mentioned the session read |
| `bca4229` | stops blaming the session for one odd rep |
| `80431ae` | a rep counted twice (933ms apart); every tracker refusal now names itself; the harness refuses to run against a stale dev-server transform |
| `70b9dcd` | an unread ball says why instead of showing three em dashes |

Verified file-by-file: `ballTrack.js`, `shotSession.js`, `shotI18n.js`,
`ShotAnalyzer.jsx`, `shotAnalysis.js`, `shotCapture.js`, `shot-harness.html`
and `expo-il/src/i18n.js` are **identical** on master and `bhbc-hub`, and
`git diff origin/master bhbc-hub` shows **no change at all** outside `src/`,
`scripts/` and `docs/`.

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

36 files (31 scripts, 5 docs): the reconciliation engine (`reconcile-sheet-vs-app.cjs`,
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
