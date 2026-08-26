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

## SECOND GAP, found on the repeat run — the count is not deterministic

Two runs of the SAME clip, same build, minutes apart:

```
run A   11 shots   3000  6733 10350 14100 18400 23017 27067 31183 35300 38867 42700
run B   10 shots         6883 10317 13717 18500 23000 27150 31233 35300 38900 42817
```

The ten shared shots line up within about 100 ms — ordinary frame-sampling
jitter, nothing to worry about. **Run B simply never saw the first shot at
3.0 s.**

This matters more than the ball-track gap. Ohad's original complaint was "it
only recognized 6 out of 11". A tool that answers 11 one minute and 10 the next,
on the same video, cannot be trusted on the number no matter how good the
mechanics scoring is.

The first shot sits 3 seconds into the clip, and it is the one that disappears.
That points at capture WARM-UP: the pose model, the video decode and the first
frames all stabilise over the opening seconds, so the dip/release window of an
early shot can arrive incomplete. Nothing in the analysis code is random — the
detector is deterministic given the same frames — so the variation has to be in
which frames the capture managed to sample.

Where to look:
- `src/shotCapture.js` — does it start sampling before the model is warm, and
  are early frames dropped rather than retried?
- The capture-quality banner already warns below 18 fps; that is a whole-clip
  average, so a slow first two seconds hides inside a healthy mean.

Suggested check before any fix: run the harness three times and record the
count each time. If the first shot is the only one that ever disappears, warm-up
is confirmed and the fix is to discard or re-sample the opening frames rather
than to loosen any detection gate.

## Fixture for the rejected shot

`scripts/fixtures/ball-rejected.json` now holds the real candidate blobs for the
rejected shot (index 3 in run B, t = 13717, the same rep as index 4 in run A),
captured straight from the pipeline: every candidate blob per frame for 30
frames after release, plus the wrist position and the refusal reason.

That turns the ball-selector work from a five-minute harness run per attempt
into a unit test. `scripts/_replay-candidates.mjs` already sweeps the blob-size
gate and lists every distinct arc it could have chosen — point it at this file.

## Why this was not attempted tonight

Ball tracking is delicate — 48 assertions in `verify-ball-track.mjs` and ten
currently-working shots that a selection change could break. Tuning it needs a
full harness run per attempt (~5 min) and a careful before/after on all eleven
reps, which is daylight work with Ohad able to look at the result, not a 2am
change.

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
