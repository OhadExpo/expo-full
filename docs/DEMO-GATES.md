# The browser-driven gates

`npm run build` runs the static gates (lockfile, surfaces, Hebrew, dotted keys,
English literals, security audit, eslint). The gates below are different: they
drive a real browser against a built preview, because what they measure —
painted glyph order, ink versus box, one screen's number against another's —
does not exist until something renders.

None of them can run from `npm run build`. Run them yourself before a demo or a
deploy that touches a demo surface.

## Prerequisites

1. A built preview on `127.0.0.1:5199` (not `localhost` — the two are not the
   same host here, and `vite preview` binds `::1` unless told otherwise):

   ```
   npm run build
   npx vite preview --host 127.0.0.1 --port 5199
   ```

   The gates read `dist`, so **rebuild before running them, and do not rebuild
   while they run** — a mid-run rebuild silently mixes two builds into one
   result.

2. Chrome on the debug port with the persistent profile:

   ```
   chrome.exe --remote-debugging-port=9222 \
     --user-data-dir="C:\Users\Administrator\chrome-debug-budget" --no-first-run
   ```

   Check for leaked pages first — these measurements are timing-sensitive and
   scripts that exit without closing a page pile up:

   ```
   curl -s --noproxy '*' http://127.0.0.1:9222/json/list | grep -c '"type": "page"'
   ```

## The gates

| script | what it measures | typical coverage |
|---|---|---|
| `verify-demo.mjs` | every demo surface renders, in the requested language | 60 combinations |
| `verify-demo-pages.mjs` | covered text, off-screen controls, page h-scroll, clipped ink, dead air, tap targets, controls buried by an overlay, raw values leaking to the screen — **scrolled, not just the first fold** | 120 combinations, ~480 scroll positions |
| `verify-control-heights.mjs` | every bordered control one height per role | 112 combinations, ~1,050 controls |
| `verify-no-text-overflow.mjs` | cut ink, live ellipsis, spill, one-word-per-line | 156 combinations, ~25,000 text nodes |
| `verify-bidi-order.mjs` | the painted glyph order of every atomic numeric token, and Hebrew painted flush to the wrong edge | 24 Hebrew combinations, ~580 tokens |
| `verify-demo-numbers.mjs` | the same quantity shown on two different tabs | 6 comparisons × 2 languages |
| `verify-demo-parity.mjs` | the demo against the real signed-in coach app, tab by tab | 8 coach tabs |
| `verify-contrast.mjs` | WCAG 2.2 AA contrast on every text node, light and dark | 44 combinations, ~8,900 nodes |

### verify-contrast.mjs currently FAILS, and that is a design decision, not a bug

It reports ~370 findings, and they come from only **eight distinct colour
pairs** — the dimmest secondary-text tokens, which sit at about **2.1:1** where
AA wants 4.5:1. Verified three ways before being believed: the computed colours
(`rgb(68,68,80)` on `rgb(10,10,12)`), the arithmetic, and a 3x screenshot of
the painted label.

Raising those tokens changes the look of every screen, and a palette change is
the owner's call — it is deliberately not made here. Do not "fix" the gate by
loosening its threshold; if the palette is accepted as-is, record that decision
next to this line instead.

Note the formula uses the **0.04045** channel threshold from W3C's errata, not
the 0.03928 that circulates in older copies of the spec. The two differ only in
very dark channels, which is exactly this theme.

Each takes `--only <substring>` to run one surface while iterating, e.g.
`node scripts/verify-bidi-order.mjs --only engine`.

In Git Bash, prefix with `MSYS_NO_PATHCONV=1` or a `/`-prefixed argument is
rewritten into a Windows path.

## Two rules these gates are built on

**A zero must say what it measured.** Every gate prints its coverage next to
its result, and fails outright when the coverage is impossible — `verify-bidi-
order.mjs` exits non-zero if it found no at-risk token at all, because a run
that tested nothing is not a pass. An empty log is not a pass either: if a
background run produced no summary line, it did not finish.

**A gate that has never failed is not a gate.** Every one of these was proven
by re-introducing the defect, watching it report the failure, and restoring.
That is not ceremony — it has repeatedly found the gate to be wrong rather than
the code:

- the page sweep excused navigation for hiding four of seven items, and printed
  green over it;
- the height gate compared a box's height to one line-height and so discarded
  fourteen of fifteen controls, then excluded every button with an icon before
  its word;
- the bidi gate's own break test **passed when it should have failed**, because
  its token pattern took only a leading sign — `20+` was read as `20` and the
  plus was never examined;
- the first version of the RTL alignment check flagged the ATTRIBUTE and
  reported ten findings that were all invisible on screen. Measuring the ink
  instead of the attribute drew the line where the reader sees it.

When a break test does not fail, suspect the gate before the code.
