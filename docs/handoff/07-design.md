# Lens 7 — design: the taste rules and why the zone looks like this

## Two brands in one app

**EXPO** — dark, `#0a0a0b` ground, cyan `#39BDFF` accent. The cyan never
deepens: brand wins over contrast maths.

**Bnei Herzliya** — the club zone is **always light**, whatever theme EXPO is in.
Navy `#1E3D74`, deep navy `#14294F`, orange `#F26A2B`, deep orange `#D9541A`.

```js
const TOKENS = {
  '--c-ac': NAVY_DEEP,
  '--c-stripBg': NAVY_DEEP,
  '--c-cardBd': 'rgba(30,61,116,0.26)',   // a NAVY hairline, not a mix with EXPO's
  '--c-bd':     'rgba(30,61,116,0.22)',
  '--bhbc-amber-text': '#8A6410',          // the LIGHT-page amber, pinned
};
```

Two decisions in that block are scars worth keeping:

- Mixing 20% navy into `--c-bd` left EXPO's cyan showing through every card edge,
  which made the club's program popup read as an EXPO dialog wearing a club
  title. The hairline is its own navy now.
- `--bhbc-amber-text` is declared twice on `:root` — `#8A6410` for a light page,
  `#E0A73A` for a dark one. With EXPO in dark mode the zone picked the dark-page
  amber and painted it on white: **2.15:1**, unreadable, on every "limited"
  count and every overdue flag. It is pinned where the zone decides its colours.
- **Every BHBC modal carries these tokens.** A modal is portalled to `body` and
  would otherwise inherit EXPO's.

## Ohad's standing taste rules

| Rule | Why it exists |
| --- | --- |
| No icons or emoji — "just colors" | a warning triangle in front of every injured athlete was noise |
| Plain colored text, not badges, for tight alignment | badge components add invisible padding |
| Measure the **ink**, not the box | he reported one pill three times; the box was centred to 0.00px while the glyphs rode 0.6px high |
| Every card gets a strip header | `RefinedHeaderStrip` by default |
| Uniform strips: 13px, 0.04em, 14/14 padding | |
| Fixed-size toggles reserve the widest label | a resizing control reads as a flash bug |
| ≤0.5px borders do not render — screenshot-verify | |
| Layout identical light/dark; only colour differs | |
| RTL: the forward arrow is `←` at the logical end | and `‹` where `›` would be |
| Hebrew sits +3px INSIDE the box, not taller boxes | |
| Real font is **Nord** (`public/fonts/Nord-*.woff2`) | not JetBrains/DM Sans; CLAUDE.md is stale on this |

## Decisions made tonight, and their reasons

- **The grid fills its card.** Six fixed 22px columns left two-thirds of the
  board empty, which reads as missing data rather than as early September.
- **Future days are not columns.** Half the month was blank ahead of today.
- **The gap sits on the row**, and the due list is one strip of names — a second
  card repeating all ten names was the duplication the replan exists to remove.
- **The chevron turns with the text**: `Update ›` becomes `עדכון ‹`.
- **Hebrew names beside Latin numbers need `unicode-bidi: isolate`**, or the
  browser reorders them and the count lands inside the previous name.
- **The printed block's row is two columns** — what to do on the left, how to do
  it on the right, a cyan spine between. Right-aligned Hebrew cues under a
  left-aligned title left a hole the width of the page.
- **The print masthead is a black band with the mark on a white plate.** The
  white-ink logo file is invisible on that band, and a CSS `invert` is not
  something to hand a printer.

## What "too spacious" meant, concretely

All three causes were rules added for the OPPOSITE complaint — a five-lift day
floating in the top third of a blank sheet:

1. every day held open to 266mm
2. every row given a 17mm floor
3. cues under the name across the full width

Removing all three took Day A from ~1,400px to ~810px and put two days on a
sheet. If he ever complains about density again, that is the pendulum, and the
answer is not to re-add a floor but to look at what is actually empty.
