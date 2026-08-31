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

## Two levers measured, both dead

Both were swept on a single capture so every value scored identical frames.

**`originBias`** (prefer a track that starts near the hand) — the knob that was
left in the code specifically for this question:

    bias   0  1  2  4  8  16
    angles 1/5 for every value, and the SAME angle each time (65 degrees)

It cannot help, and the diagnosis above says why: the losing fragments already
start 0.8–2.6 ball widths from the hand, well inside the window. Biasing toward
the hand cannot change a winner that is already at the hand.

**`riseBias`** (prefer a track that actually ascends) — added because rise is
the property that separates a released ball from other nearby motion:

    bias   0  1  2  4  8  16  32
    angles 0/6 for every value (deterministic capture)

Also nothing. A selection term can only reorder the candidates that exist. If
no candidate rises, reordering is a no-op.

## Where the fault actually is

Candidate GENERATION, not selection. The funnel discards 700–900 of roughly
1000 seeds as `tooShort` before scoring ever runs, and the surviving fragments
are the late, flat ones. The ball's ascent is not in the candidate set — which
is consistent with the note already in ballTrack.js that on this framing the
ascent happens largely above the frame.

Next session should look at seed linking and the `tooShort` cutoff, NOT at the
gates and NOT at these two knobs. They are measured dead ends.

## Capture nondeterminism

The default capture samples a playing video and loses frames under load: the
same clip gave 5 shots with 1 angle on one run and 5 shots with 0 on the next,
with identical code. Any before/after claim about the ball MUST use
`runHarness(url, { deterministic: 'coarse' })`, or it is comparing two
different sets of frames and the result means nothing.

---

# ROOT CAUSE FOUND — supersedes the "candidate generation" conclusion above

The section above ends by pointing at candidate generation and the `tooShort`
cutoff. That was the right next place to look and it was wrong. Keep reading
before touching the tracker.

## The measurement that settled it

Release is labelled CORRECTLY. On clip02 it lands 0–3 frames from the shooting
wrist's apex, which is where the ball leaves a jump shot:

| shot | release frame | wrist apex | gap | **wrist y at release** |
|---|---|---|---|---|
| 1 | 158 | 158 | 0 frames | **−0.016** |
| 2 | 296 | 295 | 33 ms | 0.038 |
| 3 | 430 | 429 | 33 ms | 0.019 |
| 4 | 644 | 641 | 100 ms | **−0.017** |

Normalised y is 0 at the top edge. **Negative means above it.** At the instant
of release the shooting hand is at, or past, the top of the picture. The ball
leaves the hand outside the frame, and the launch is therefore not in the
footage at all.

## Why every algorithmic lead dead-ended

Because they were all downstream of missing data:

- `originBias` 0→16: identical results. Nothing to re-rank.
- `riseBias` 0→32: identical results. No candidate rises because the rising part
  is off-screen.
- A clean-room tracker, written from scratch, anchored at the hand and
  predicting forward: built chains of 11, 7 and 6 points — and every one had a
  rise of **exactly 0.00 ball widths**, first point highest. Two independent
  implementations agreeing that the arc never rises is not two bugs. It is the
  data.

The blobs that do appear near the top of frame are the ball clipped at the edge,
not the arc.

## What shipped instead

The analyzer now says so. When the shooting wrist is at or above the top edge at
release, the ball panel explains that the release happened above the frame and
asks for the camera to be tilted up, in English and Hebrew, instead of printing
a dash. Verified on the real tool from the coach's seat with clip02.

That is the only actionable fix: **no tracker can recover an arc that was never
filmed.** Tuning the gates to produce a number here would have produced a
confident wrong number.

## If someone still wants to improve the tracker

Do it on footage where the release is INSIDE the frame. Confirm that first with
`scripts/verify-clip-usable.mjs` — if `wrist y at release` is under ~0.03, the clip
cannot answer the question and any tuning done against it is fitting noise.
