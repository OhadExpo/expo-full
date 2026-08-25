# Drive sheet ↔ EXPO reconciliation

The Drive sheets are the source of truth for a program. This is how to check
that EXPO matches them, and how to repair it when it does not.

Built 2026-08-25 after a program copied from Omer Sadeh to Amit Gershon arrived
with no videos.

## Run it

```bash
# 1. download every sheet + audit (needs the debug Chrome on :9222)
node scripts/reconcile-all.cjs

# re-audit without re-downloading
node scripts/reconcile-all.cjs <sheetsDir> --skip-download

# 2. apply what is safely applicable (dry run first — it always is)
node scripts/apply-sheet-fixes.cjs <sheetsDir>/_fixes.json
node scripts/apply-sheet-fixes.cjs <sheetsDir>/_fixes.json --apply

# 3. check the claim with something that shares no logic with the audit
node scripts/spotcheck-sheet-vs-app.cjs <sheetsDir> 60
```

Sheets download through the logged-in Chrome, so nothing large passes through a
model's context. Drive names them `"<Name> - Training Program"` in English — a
Hebrew `מעקב` search will not find most of them.

## What each column means

| column | meaning |
|---|---|
| `missingBlock` | a sheet tab with exercises and no matching plan |
| `missingDay` | a sheet day that matched no app day |
| `missingRow` | a sheet exercise with no app row |
| `extraRow` | an app row the sheet does not list — **informational**, usually a warm-up added in the app. Not counted in the total. |
| `sets` `reps` `tempo` | the prescription disagrees |
| `superset` | the sheet's `3a/3b` grouping is missing or wrong in EXPO |
| `warmup` | a warm-up step or its video is missing |
| `url` | the video disagrees or is absent |

## What gets written, and what deliberately does not

`apply-sheet-fixes.cjs` writes **only** `videoUrl`, `superset`, and warm-up
video/step. Every plan is backed up to disk first and every write is verified by
reading it back.

**Sets, reps and tempo are never auto-written.** They are the actual
prescription, and a parser that is 95% right would quietly corrupt someone's
programming. They stay in the report for a human to rule on.

## Traps — do not re-derive these

Each of these made the audit report gaps that did not exist. They cost hours.

1. **`>` in a Sets cell is a ditto mark**, not a value — 334 phantom gaps.
2. **`SuperSet:` / `Backoff Set:` / `^ Super Exercies ^` are labels**, not
   exercises. They are not skipped: the sheet's `3a/3b` numbering reconciles
   against EXPO's A–E `superset` field, which found 34 real supersets missing.
3. **Rows must join on TITLE, not position.** A day whose exercises are simply
   ordered differently read as dozens of mismatches.
4. **Sheet titles have typos** — `Suppoted`, `Thorasic`, `Golbet`. Needs a
   prefix key *and* an anagram key (Golbet/Goblet are anagrams; a prefix key
   misses that).
5. **A 5-digit reps value is an Excel date serial.** Sheets turns `6-8` into a
   date. The APP is correct in those cases.
6. **Days must match on CONTENT, not the label.** "Day A" exists in every block.
7. **Not every block is `Block #N`** — `Phase 9`, `Comeback Block`.
8. **`plans.data.days` contains DUPLICATE day ids.** Addressing a day by id
   resolves several days to the first one. **Address days by INDEX.**
9. **History/log tabs are records, not programs.**
10. **Warm-ups live in `plan.data.warmup` ({t, rx, vid})**, not on a day. The
    audit ignored them entirely and reported zero while real warm-up videos
    were missing.

## The rule that matters

An audit that keeps being made more forgiving must be checked by something that
shares none of its assumptions. `spotcheck-sheet-vs-app.cjs` pulls hyperlinked
video ids straight out of the raw sheets and asks whether the athlete's plans
contain them. **It is what found the warm-up blind spot while the audit was
reporting zero gaps.** Run it after any change to the reconciler.

## Related audits

```bash
node scripts/audit-video-coverage.cjs      # what an athlete actually sees
node scripts/audit-cue-coverage.cjs        # coaching guidance, same shape
node scripts/audit-library-video-urls.cjs  # structurally broken links
node scripts/audit-plan-video-urls.cjs     # same, on plan rows + warm-ups
node scripts/audit-plan-shape.cjs          # nothing corrupted a plan
node scripts/audit-data-health.cjs         # orphans, couples, dead ids
node scripts/audit-junk-plan-rows.cjs      # rows that are not exercises
node scripts/report-missing-videos.cjs     # ranked by how many rows each fixes
```
