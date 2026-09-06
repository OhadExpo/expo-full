# Lens 2 — the auditor

*Every claim, and the evidence behind it. Nothing here is asserted from memory.*

## How to re-derive everything

```bash
node scripts/audit-handoff.mjs      # re-checks the master handoff, exits non-zero on a mismatch
```

## Claims and their evidence

| Claim | How it was established |
| --- | --- |
| The sheet is athletes × days with a 1–5 restriction code | `audit-out/bhbc-sheet/August.csv`, read directly |
| 84 min practice, 13 min contact, 15.5%, Low Intensity, Q1 on 20/08/2025 | same file, one column group |
| The app now reproduces that exact figure | `audit-out/test-density.mjs` typed it through the real editor and read `15.5% Low Intensity · Q1` off the screen |
| The trial left no trace | same script restored `expo-bhbc-fixtures` and re-read it: 33 fixtures, 0 with `contactMin` |
| Two lifts logged today, 30 min each | `scripts/bhbc-log-lift.mjs` wrote them and read them back; a direct query confirms DJ Burns and Nathan Knight |
| 1 Sep shows "9 lifted · 108 min" | 9 athletes × 12 min in the store — the UI line is arithmetic on real rows |
| The Medical tab went 147 → 45 Latin words in Hebrew | `audit-out/probe-bhbc-coverage.mjs`, before and after |
| The dashboard went 7 cards → 3 | full-page screenshots `overview-now.png` → `overview-after3.png` |
| Nothing internal reaches the screen | `verify-no-raw-values.mjs` across owner (23 routes), athlete, pt — in English and Hebrew |
| The club zone survives with no backend | `verify-pt-no-backend.mjs` |
| Nothing is cut off at 390px | `verify-mobile-overflow.mjs`, owner and pt |
| The marketing site is clean | `verify-marketing-site.mjs`, 54 route/width/language combinations |

## Claims that were WRONG and were corrected

The audit is worth having because it found these in my own first draft:

1. "428 files changed" — that was `git diff --stat` scoped to `src` and
   `scripts`. The whole tree is 510+.
2. "The note lanes are almost always empty" — counted: 45 filled cells across
   five months, and January, the narrowest grid, is the most annotated.
3. "February dropped the PT lane" — January dropped it, and earlier.
4. "`readinessAutoreg.js` untouched" — true of tonight only; it differs from
   master by +96 lines from an earlier session.

And one bad **source**: the month CSVs had been pulled through gviz by sheet
name, which is lossy on a merged-cell sheet — August came back nearly empty. The
quotes had been read from a different, complete export. Fixed: true exports by
pinned gid, and the downloader now shouts if two months are byte-identical.

## The audit was broken on purpose

Three false claims were planted and the audit re-run. Two were caught. The third
— "roster 11" — was not, because the pass read the database and printed the
truth without checking that the *document* agreed. That hole is closed; the same
lie now fails.

## What the audit cannot check

- Whether the Hebrew *reads well* to a native speaker. It checks coverage, not
  register. `verify-hebrew.mjs` enforces known bad patterns only.
- Whether a design decision is right. Screenshots are looked at by eye.
- Whether production is healthy — nothing from this branch is on it.
