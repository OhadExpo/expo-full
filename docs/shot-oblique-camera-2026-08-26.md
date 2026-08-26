# Why the three-pointer measured 5.3 m/s — ANSWERED: the shot was filmed at an angle

Ohad, 2026-08-26: *"IT'S a 3 pointer (the 10/11 video) and the tool didn't auto
choose it."* Chasing that produced two wrong conclusions before the right one.
Both wrong ones are kept here, because the way they failed is the useful part.

## The answer

**The ball recedes from the camera.** Its apparent size shrinks **1.45-1.63x**
across the tracked flight, and apparent size scales as 1/distance. So the shot
is not in the image plane.

A 2D projection of a receding flight cannot see the component along the view
axis. It therefore **under-reads the speed** and **over-reads the launch angle**
— and no fit can detect it, because a receding parabola is still a perfect
parabola (r2 0.987).

One fact explains every observation:

| observation | explained by recession |
|---|---|
| speed 5.3 m/s where a three needs 9.3 | the away-component is invisible |
| angle 63 degrees where a three is ~50 | horizontal travel is foreshortened |
| x(t) fits a QUADRATIC at r2 0.9994 | perspective, on an axis that should be linear |
| blob shrinks 48 -> 25 per-mille | the ball is getting further away |

The analyzer now measures this from the ball's own apparent size and says so.
It is **measured, never gated**: the launch angle SPREAD and the rep-to-rep
verdict survive an oblique camera, and refusing the reading would throw away
the coachable half — the half that was right all along.

## The two wrong answers, and why they failed

**1. "The scale is 1.75x low."** Wrong: it assumed the clip was a 6.75 m three
and blamed the instrument for disagreeing. Killed by a scale-free check —
time-to-apex is 0.48 s, which gives 4.71 m/s vertical and 5.28 m/s total at the
measured angle, against the analyzer's 5.6. It agrees with physics that uses no
pixels at all, to about 6%.

**2. "The tracking window ends too early."** Wrong: refitting over
500/700/900/1100/1400 ms windows, the 700 ms window already contains the apex at
r2 0.998. Widening it moves the answer 5.3 -> 5.6 while the fit DEGRADES to
0.987 — the extra samples drift off the parabola rather than completing it.

Also eliminated with evidence:

- **The aspect ratio.** Blobs are already isotropic — `shotCapture` divides both
  x and y by MH ("the same isotropic unit"). Applying a correction anyway pushed
  the angle 63 -> 74, which is not a jump shot.
- **The blob choice.** Sweeping a minimum blob size across all 120 candidates
  (25 of 30 frames offer more than one) returns the same arc every time,
  5.1-5.6 m/s at 60-65 degrees, even when forced onto genuinely ball-sized blobs.
- **The time base.** `meta.mediaTime` is real video time.

## What this means in practice

For accurate metres and m/s, film **square to the shot** — the camera looking
across the flight, not down it. The app already says "film side-on"; this is the
measurement that proves why it matters, and the analyzer now tells the coach
when a clip breaks the rule.

Shot type is still not auto-detected, and now for a good reason: on an oblique
clip the physics that would pick it is exactly the part that is unreliable.

## Tools

- `scripts/_replay-ball.mjs <harness-output>` — replays the real `trackBall` and
  `launchAngle` offline against candidates dumped by a live run.
- `scripts/_replay-window.mjs` — refits over different tracking windows.
- `scripts/_replay-candidates.mjs` — sweeps the blob-size gate.
- `scripts/_replay-tilt.mjs` — fits x(t) quadratically to test for camera tilt.
- `shot-harness.html` emits `ballDebug` (`harnessBuild: balldebug-2`).
