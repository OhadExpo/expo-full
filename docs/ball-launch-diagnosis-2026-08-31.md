# Ball launch angle — measured diagnosis, 2026-08-31

Status: root cause narrowed with numbers. No fix applied, deliberately.

## What was believed

"Launch angle is null on every shot." Cause unknown; an apex fix had shipped
unmeasured.

## What is actually true

Measured on `public/testclips/clip02.mp4`, scored offline from one capture so
every shot sees identical frames:

| shot | angle | fit | samples | climb (ball widths) | x-gap from hand | anchored |
|------|-------|-----|---------|---------------------|-----------------|----------|
| 1 | **65.3°** | 0.924 | 8 | — | — | — |
| 2 | null | 1.000 | 7 | 0.03 | 0.80 | no |
| 3 | null | 0.969 | 7 | 0.00 | 2.63 | no |
| 4 | null | 0.969 | 10 | 0.07 | 1.56 | no |
| 5 | null | 0.997 | 6 | — | — | — |

So it is 1 of 5, not 0 of 5. Four are refused by the rise gate
(`climb < 1.2 ball widths`) or the gravity gate.

## The hypothesis this kills

The obvious read is "the gates are too strict — loosen them." The numbers say
otherwise, and this is the important part:

- The hand-anchor rescue exists precisely for a track that starts after the
  ascent. It did not fire on any of them (`anchored: false`).
- It was **not** blocked by the horizontal guard: that allows 6 ball widths and
  the measured gaps are 0.80, 2.63 and 1.56.
- The only other condition is `originUp < base` — the hand must sit BELOW the
  first tracked point. It does not.

The tracked arc therefore begins *below the shooting hand* and rises by
essentially nothing (0.00–0.07 ball widths). A ball that was just released does
neither. The tracker is locked onto something that is not the shot: the ball
after it comes back down, another player, or body motion.

The high fit numbers are not evidence against this. A quadratic fits 7 points
that lie almost on a straight line perfectly — shot 2 reports fit 1.000, which
is a warning sign, not a good sign.

**Loosening the rise gate would not have produced correct angles. It would have
produced confident angles measured off the wrong object**, which is worse than
reporting none: a coach cannot tell a wrong number from a right one.

## What the funnel shows

Per shot, roughly 800–1000 seed blobs collapse to 7–14 kept. `tooShort` removes
the overwhelming majority (746, 887, 315), `farFromHand` a few hundred more.
The surviving fragment is short and late.

## What to do next (not done here)

Fix the SELECTION, not the gates: among candidate tracks, prefer the one that
starts at the hand at release and rises, rather than the longest or best-fitting
fragment. Only once the right object is being followed do the gate thresholds
mean anything.

## How to reproduce

    MSYS_NO_PATHCONV=1 node scripts/_probe-ball.mjs /testclips/clip02.mp4 5202

`MSYS_NO_PATHCONV=1` is not optional. Without it Git Bash rewrites
`/testclips/clip02.mp4` into `C:/Program Files/Git/testclips/clip02.mp4`, the
clip fails to load, and the harness reports "Could not read that video." That
cost six runs tonight and looked exactly like an intermittent decoder fault.
