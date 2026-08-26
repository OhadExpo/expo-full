# Ball speed: the SCALE is right. The tracked arc is not a three-pointer. — open

**This document previously claimed the absolute scale was 1.75x low. That was
wrong, and the correction matters more than the original claim.**

Ohad, 2026-08-26: *"IT'S a 3 pointer (the 10/11 video) and the tool didn't auto
choose it."*

## What the first pass concluded, and why it was wrong

The analyzer reads ~5.3-5.6 m/s at 63-65 degrees on his clip. Solving the
projectile, that describes a ~1.7-1.9 m shot, while a 6.75 m three needs
9.35 m/s. From that I concluded the scale was under-reading by 1.75x.

**That reasoning assumed the answer.** It took "this is a 6.75 m three" as
given and blamed the instrument for disagreeing.

## The check that settles it, because it involves no pixels

Replaying the real tracker offline on candidates captured from a live run
(`scripts/_replay-ball.mjs`), the arc **turns over inside the tracked window** —
peak at sample 14 of 29, **0.48 s** after release.

Time-to-apex is **scale-free**. It does not care about frame size, pixel units,
aspect ratio, or the ball's apparent width:

| | |
|---|---|
| measured time to apex | **0.48 s** |
| therefore vertical velocity (`g·t`) | **4.71 m/s** |
| at the measured 63 degrees, total speed | **5.28 m/s** |
| what the analyzer reports | **5.6 m/s** |

**The analyzer agrees with scale-free physics to about 6%.** The scale is not
broken.

For comparison, a 6.75 m three at that angle needs 9.31 m/s and would peak at
**0.85 s** — nearly twice the 0.48 s actually measured. The launch angle is
scale-free too: it is the ratio of two pixel velocities.

## So the real question is for Ohad

The instrument is coherent, the scale is right, no window or tracking choice
changes the answer. What it measures is a ~5.3 m/s arc peaking in 0.48 s.

**The decisive number is the vertical velocity: 4.71 m/s.** It comes from
time-to-apex alone, so it is immune to pixel units, to the ball's apparent size,
and to how obliquely the camera sees the HORIZONTAL travel. A 6.75 m three needs
roughly 7-8 m/s of vertical velocity whatever the camera angle; 4.7 m/s peaks
about 1.1 m above the release and cannot reach the rim from the arc.

So one of these is true, and only Ohad can say which:

1. The shots in that clip are not from the three-point line.
2. The camera is not level. A tilted camera mixes horizontal into the vertical
   axis and would corrupt the apex timing too.

Everything below has been eliminated with evidence:

- ~~**The tracker is not following the ball's true flight.**~~ **Ruled out.**
  Sweeping a minimum blob size over the candidates
  (`scripts/_replay-candidates.mjs`) — 120 candidate blobs, 25 of 30 frames
  offering more than one — every gate returns the same arc: 5.1-5.6 m/s at
  60-65 degrees. Even forcing genuinely ball-sized blobs (min 35 per-mille,
  ballPx 43.8) gives 5.1 m/s at 60.7 with r2 0.996. There is no faster arc
  hiding in the data for the tracker to have missed.
- ~~**The window ends too early.**~~ **Ruled out.** Refitting the same
  candidates over 500/700/900/1100/1400 ms windows
  (`scripts/_replay-window.mjs`): the 700 ms window already contains the apex
  and fits at r2 0.998. Widening it nudges the answer 5.3 -> 5.5 -> 5.6 while
  the fit DEGRADES to 0.987, so the extra samples are drifting off the
  parabola rather than completing it. It converges near 5.6, not 9.3.
- **The shots in that clip are not all threes.**

## Ruled out, with evidence

- **The time base** — `shotCapture` stamps frames with `meta.mediaTime` from
  `requestVideoFrameCallback`, real video time.
- **A uniform spatial error** — impossible by construction: the scale comes from
  gravity (`mPerPx = 9.81 / gPx`), so any constant pixel factor cancels.
- **The aspect ratio** — blobs are already isotropic. `shotCapture` divides BOTH
  x and y by MH ("Reported in FRAME-HEIGHT fractions, the same isotropic unit"),
  and `wristPos` is scaled to match. Applying an aspect correction anyway moved
  speed only 5.30 -> 5.10 and pushed the angle 63 -> 74 degrees, which is not a
  jump shot. Tested and reverted; the experiment is recorded in the code.

## What still stands

Shot type is **not** auto-detected. Not because the ruler is broken — it is not
— but because the tracked arc does not currently describe the shot Ohad says he
took, and until that is understood, deriving the shot type from it would be
guessing with extra steps. It is remembered instead.

The angle and the rep-to-rep spread never depended on any of this: both are
ratios, and both survive a wrong scale and an oblique camera.

## Tools

- `scripts/_replay-ball.mjs <harness-output>` replays the real `trackBall` and
  `launchAngle` on candidates dumped by a live run, so this can be investigated
  in seconds instead of a three-minute MediaPipe pass.
- `shot-harness.html` emits `ballDebug` with every blob candidate per frame plus
  the wrist origin (`harnessBuild: balldebug-2`).
