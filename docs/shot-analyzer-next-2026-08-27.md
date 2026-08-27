# Shot analyzer — measured state, and the next real target

Ohad: *"we're at 20% of how good i want it to be."*

Measured on his 11-shot clip (`10 of 11.mp4`) through the real MediaPipe
pipeline, 2026-08-27 01:55, via `node scripts/shot-harness-run.mjs "/10%20of%2011.mp4" <port>`:

## Where it actually stands

- **Detection: 11 of 11.** No missed shots, no phantom twelfth. The duplicate
  that used to appear 933 ms after the eleventh stays merged.
- **Ball track: 10 of 11.** Nine shots fit an arc at r² ≥ 0.989 over 14–20
  points.
- **Scores: 62–75**, which is a believable spread for one shooter in one
  session.
- **Every shot reads `oblique: true`**, recede 1.44–1.99. The camera angle
  finding from 08-26 is consistent across the whole clip, not a one-rep fluke.

## The one real gap: shot 4 (t = 14100 ms)

```
"why": { "failed": "track rejected",
         "why": "it barely rose (0.1 ball widths)",
         "frames": 19, "fit": 0.998, "ballPx": 26.0,
         "stats": { "seeds": 99, "kept": 10, "tooShort": 86,
                    "badFit": 2, "tooSparse": 1, "farFromHand": 14 } }
```

Read that carefully before touching anything:

- 99 seeds, 86 rejected as **too short**, 10 arcs kept. So candidates existed.
- The arc that won has **fit 0.998 over 19 frames** — an excellent fit — but
  rises only 0.1 ball widths, so the rise gate rejects it as not-a-shot.
- The origin probe shows the ball genuinely leaving the hand on this rep:
  `6.9 1.8 1.1 2.1 2.1 2.1 3.7 5.0 4.8 7.3 12.6 7.5` ball-diameters from the
  shooting hand, frame by frame after release.

So a real arc is there and the tracker is locking onto a flatter object
instead — most likely something near-stationary that fits a line beautifully.
The fix is probably in **candidate selection**, not in the rise gate: prefer the
arc whose origin starts AT the hand and whose vertical travel is largest, rather
than the best pure r².

## SECOND GAP — the count is not deterministic. This is the bigger one.

Three runs of the SAME clip, same build, minutes apart:

```
run A   11 shots   3000 6733 10350 14100 18400 23017 27067 31183 35300 38867 42700
run B   10 shots        6883 10317 13717 18500 23000 27150 31233 35300 38900 42817
run C    9 shots   3033 6650 10417 ...
```

**11, then 10, then 9.** Run B lost the first shot entirely; run C saw the
first shot and lost two others. Where runs share a shot they agree within about
100 ms, which is ordinary frame-sampling jitter — so the detector is not
wandering. Different runs are simply being handed different frames.

This matters more than the ball-track gap, and more than any scoring tweak.
Ohad's original complaint was "it only recognized 6 out of 11". A tool that
answers 11, then 10, then 9 for the same video cannot be trusted on the count,
however good the mechanics scoring is — and the count is the first number he
looks at.

Nothing in the analysis code is random. `detectShots` is deterministic given
the same series, and the unit suites pass every time. So the variance lives in
CAPTURE — and it has now been measured rather than guessed at.

**Measured, on the run that found 9:**

```
[shot-capture] {"coarse":693,"fine":644,"windows":7,"duration":45.3,
                "skipped":0,"skipRatio":0}   analyzed 9
```

- source video: **60 fps**
- frames actually analysed: **741 over 45.3 s → 16.4 fps effective**
- frames discarded by our own busy-flag: **zero**

So we are not throwing frames away. The browser is presenting roughly 16 a
second while MediaPipe runs, and `requestVideoFrameCallback` fires that much
less often. The loss is upstream of our loop, exactly as the note at the top of
`shotCapture.js` has said all along. (I first blamed the `busy` flag in
`playThrough` and committed that as fact; the counter I added to prove it
returned zero and disproved me.)

**What was fixed as a result.** The starved-capture banner was keyed on
`result.fps`, which is the SOURCE rate — 60 — so it could never fire. It now
keys on `effFps`, the rate actually analysed. That 9-shot run would now warn.
Pinned by `scripts/verify-starved-guard.mjs`.

**What is still open.** Warning is the honest half; the count is still hostage
to machine load. Making it reliable means decoding deterministically instead of
sampling a playing video — stepping frames with a seek loop (the fallback path
already in `playThrough`, rejected originally because a seek costs 100–175 ms
on a 60 fps portrait clip) or decoding via WebCodecs. That is a real piece of
work and wants Ohad's call on the speed/reliability trade.

**Do not tune detection thresholds against this.** The gates are not the
problem; two of these three runs prove the same thresholds find 11. Chasing the
count by loosening gates would trade a missed shot for a phantom one.

## Fixture for the rejected shot

`scripts/fixtures/ball-rejected.json` now holds the real candidate blobs for the
rejected shot (index 3 in run B, t = 13717, the same rep as index 4 in run A),
captured straight from the pipeline: every candidate blob per frame for 30
frames after release, plus the wrist position and the refusal reason.

That turns the ball-selector work from a five-minute harness run per attempt
into a unit test. `scripts/_replay-candidates.mjs` already sweeps the blob-size
gate and lists every distinct arc it could have chosen — point it at this file.

## Do these in order — the second gap BLOCKS the first

It is tempting to fix the ball-track rejection first, because it is small and
well understood. It cannot be validated yet, and that is the real reason it was
not attempted tonight — not that the code is delicate.

Success for the selector change is defined as **"11 of 11 ball tracks, with the
other ten unchanged"**. That comparison needs a stable baseline. The baseline
currently moves by two shots between runs of the same clip:

```
run A  11 shots      run B  10 shots      run C  9 shots
```

So if a selector change is followed by a run that finds 10, there is no way to
tell whether the change broke a shot or the capture simply dropped frames
again. Any A/B against a ±2 baseline is noise, and a "verified" claim off it
would be worthless.

**Sequence:**

1. Make capture deterministic — seek-step or WebCodecs decoding, so the same
   clip always yields the same frames and therefore the same count. Verify by
   running it three times and getting one number three times.
2. THEN change the ball-arc selector, with `scripts/fixtures/ball-rejected.json`
   for fast iteration and the now-stable clip run as the acceptance test.

Doing it the other way round means tuning against a moving target.

## Why this was not attempted tonight

Ball tracking is delicate — 48 assertions in `verify-ball-track.mjs` and ten
currently-working shots a selection change could break. But the deciding reason
is the one above: **the acceptance test is not measurable yet.** With the shot
count swinging 9–11 between runs, "the other ten are unchanged" cannot be
established, so any fix would ship on a claim I could not stand behind.

## How to pick it up

```bash
# start the dev server IN THE REPO (Start-Process does not inherit cwd):
#   cmd /c 'cd /d C:\Users\Administrator\Desktop\expo-full && npx vite --port 5212 --strictPort'
MSYS_NO_PATHCONV=1 node scripts/shot-harness-run.mjs "/10%20of%2011.mp4" 5212
```

The harness prints per-shot `why` for every rejection, plus `BALLFRAMES` for the
first shot. To debug shot 4 specifically, make it dump that shot's frames and
feed them to `scripts/_replay-candidates.mjs`, which sweeps the blob-size gate
and lists every distinct arc it could have chosen.

Success is: **11 of 11 ball tracks, with the other ten unchanged** — same
angles, same speeds, same fits.
