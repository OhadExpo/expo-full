# The Shot Analyzer's absolute scale is wrong by ~1.75x — open

Ohad, 2026-08-26: *"IT'S a 3 pointer (the 10/11 video) and the tool didn't auto
choose it."* Chasing that turned up something bigger than the missing
auto-select.

## The measurement

On his own three-point clip, the tracker reads a median **5.3–5.5 m/s at
63–64 degrees**. Solving the projectile from a ~2.3 m release to a 3.05 m rim:

| | |
|---|---|
| what those numbers describe | a **1.7–1.9 m** shot |
| speed a 6.75 m three needs at that angle | **9.35 m/s** |
| speed a 4.6 m free throw needs | **7.82 m/s** |

So the absolute readings are low by roughly **1.75x**. The launch ANGLE and the
rep-to-rep SPREAD are unaffected — both survive a wrong scale — but every metre
and every m/s should be treated as uncalibrated until this is found.

**This is why the shot type is not auto-detected.** Picking it from this physics
would label his three a free throw with total confidence. It is remembered
instead.

## What has been ruled out, with evidence

**The time base.** `shotCapture.js` stamps every frame with
`meta.mediaTime` from `requestVideoFrameCallback` — real video time, not an
assumed frame interval. Speed scales linearly with the time base, so a 1.75x
error would need the clock to be 33-43% out. It is not.

**The aspect ratio.** This was the strongest candidate. Normalised coordinates
are x/width and y/height, `buildSeries` multiplies pose x by the aspect so both
axes share one unit, and its own comment says the ball fit should share it too —
which it does not. On a 9:16 clip that mismatch is 1.78x, and a jump shot's ball
travels mostly horizontally. The number matched almost exactly.

It is still wrong. Applying the scaling moved speed only **5.30 -> 5.10 m/s**
and pushed the launch angle **63 -> 74 degrees**. 74 degrees is not a jump shot;
real release angles sit near 45-55. The correction made the geometry less
plausible, so the ball blobs are already in a consistent unit system. Reverted,
with the experiment recorded in the code so nobody re-runs it.

**A uniform spatial scale error.** Cannot be the cause: the scale is derived
from gravity (`mPerPx = 9.81 / gPx`), so multiplying every pixel measure by any
constant cancels out of the speed entirely.

## What is still worth trying

- The gravity fit itself. `gPx = -2a` from a quadratic over ~18-22 samples of a
  ~1 s arc. If the tracked arc is a fragment near the apex, `a` can come out
  high; a high `a` gives a small `mPerPx` and a low speed. Worth measuring the
  fitted `a` against the arc's span.
- Whether the tracked blob is the ball at all on some reps. The motion blob is
  the union of two ball positions, so it reads wider than the ball; if it is
  sometimes locking onto a limb the velocity would be systematically low.
- The two-pass ROI capture. If blob coordinates are relative to the ROI crop
  while the origin is full-frame, distances mix units. The origin gate compares
  them directly, so this would show up there first.

## Not to be trusted until fixed

`ballSpeedMs`, `ballRiseM`, and anything derived from them — including the
session spread THRESHOLD in m/s (`TIGHT.speedMs`), which was calibrated against
these same readings. The angle spread and the outlier verdict are unaffected.
