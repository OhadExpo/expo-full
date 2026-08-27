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

### What the fixture actually says — my selector hypothesis is probably wrong

Ran `scripts/replay-ball-candidates.mjs scripts/fixtures/ball-rejected.json`,
which sweeps the blob-size gate and refits every arc it could have chosen:

```
fixture refusal reason: "it barely rose (0.5 ball widths)"
candidate blobs: 92 | size per-mille  min 5.3  med 15.6  max 49.0
frames with >1 candidate: 24 of 28

minSize  0  n=24 ballPx=26.0  REFUSED: it barely rose (0.8 ball widths)
minSize 15  n=24 ballPx=26.0  REFUSED: it barely rose (0.8 ball widths)
minSize 25  n=23 ballPx=26.0  REFUSED: it barely rose (0.8 ball widths)
minSize 35  no track
minSize 45  no track
```

**No candidate arc rises enough, at any blob-size threshold.** That undercuts the
"prefer the arc that starts at the hand and travels furthest vertically" idea I
suggested above — there is no better arc sitting in this candidate set to
prefer. The best available still only climbs 0.8 ball widths against a 1.2
threshold.

So the problem is upstream of selection: on this rep the ball's blobs are not in
the candidate set at all, or only its early, flat portion is. Look at
`motionBlobs` and what the ball looks like on THIS release — likely it overlaps
the shooter or the background for the frames where it climbs.

That is a more useful place to start than the selector, and it was one command
away the whole time. The fixture paid for itself.

### Shot 4, narrowed further — and two wrong paths eliminated

From the deterministic fixture (`scripts/fixtures/ball-rejected-det1.json`),
release at t=14083, wrist at y=0.468:

```
  t       n    nearest-to-wrist (ball ø)   highest blob y
  14083   5     3.0                         0.298
  14183   9     1.5                         0.292
  14283   7     0.2                         0.295   <- something IS at the hand
  14350   2     4.0                         0.302
  14500   3     3.6                         0.325
```

**The highest blob in every frame sits at y ≈ 0.29–0.32 and barely moves.** That
is a near-stationary feature, not a ball. A released ball starts at the wrist
(y = 0.468) and should climb well past 0.29 — nothing in the candidate set does.

Two hypotheses now eliminated:

1. ~~The selector is choosing the wrong arc.~~ The blob-size sweep refuses every
   candidate at every threshold. There is no better arc to choose.
2. ~~The ball leaves the athlete crop.~~ It cannot. Ball detection runs on a
   SEPARATE full-frame canvas (`MW = 270`, whole frame, deliberately never
   moves, so frame-differencing is not confused by a travelling window). The
   pose crop is irrelevant to it.

So the ball's blobs are genuinely absent from `motionBlobs` output on the frames
where it climbs, on THIS rep and not the other ten. The remaining suspects are
about that rep specifically: what the ball passes in front of, and whether at
270 px wide its motion signature falls under the threshold there.

**Next concrete step:** dump the 270 px difference frames for t=14083–14500 and
look at them. That is a visual question and it needs eyes, not more inference —
and it is now cheap, because a deterministic run reproduces those exact frames
every time.

### ROOT CAUSE, found by looking at the actual frames

I dumped the real video frames around shot 4 and looked at them. The answer was
not in any of my three hypotheses.

**There are TWO balls in the air during shot 4's tracking window.**

```
t=14083  (the frame detected as shot 4's RELEASE)
         - an orange ball is ALREADY high at y≈0.29, x≈0.40, against the night sky
         - the shooter is holding a SECOND ball at chest height, hands together
t=14283  - shooter's arm is extended, hands empty
         - the airborne ball has drifted LEFT to x≈0.32, still y≈0.297
t=14383  - shooter's arm is coming down
         - the airborne ball is at x≈0.28, y≈0.30, heading for the rim
```

The airborne ball moves **left toward the hoop at a near-constant height**. That
is a ball at its APEX, from a release that happened *before* 14083. He is
shooting a sequence with more than one ball: the previous shot is still in flight
when the next one begins.

So the tracker is not failing to see the ball. It is seeing **the wrong ball** —
the previous shot's, which by definition barely rises because it is already at
the top of its arc. Hence "it barely rose (0.2 ball widths)" on a rep where the
ball is plainly visible in every frame.

This also explains why the blob-size sweep could not help: the wrong ball is a
perfectly good, well-fitting arc. It is just not this shot's.

**Where to fix it.** `trackBall`'s origin constraint (`maxOriginBalls`) exists
precisely to reject an arc that does not start at the hand, and the stats show
it rejecting 6–14 candidates per attempt. It is not rejecting this one, either
because the tracking window opens before the release (so the previous ball is
near the hand at some frame), or because the tolerance is wide enough for it to
pass. Start by logging which frame the winning arc seeds from, and how far that
seed is from the wrist.

**Why the other ten shots are fine:** in those, the previous ball has already
landed by the time the next release begins. Shot 4 is the one rep where two
balls overlap — which is also why no amount of capture improvement fixed it.

### The origin constraint DOES control the choice — swept against the fixture

`node scripts/probe-ball-origin.mjs scripts/fixtures/ball-rejected-det1.json`:

```
maxOriginBalls   n    ballPx   result
     9          20     25.0    REFUSED: it barely rose (0.2 ball widths)
     7           6     20.8    REFUSED: not falling like a projectile
     5           6     20.8    REFUSED: not falling like a projectile
     3           6     20.8    REFUSED: not falling like a projectile
   1.5           -       -     no track (farFromHand=73)
```

At the shipped value of **9**, the tracker takes a **20-point** arc — the
previous shot's ball, long and clean because it is against an empty night sky.
Tighten the constraint and it switches to a **6-point** arc. So the origin gate
is exactly the lever, and it confirms the two-ball diagnosis from the frames.

**But tightening alone does not fix it.** The 6-point alternative is refused as
"not falling like a projectile" — it is the bare minimum length and not a clean
flight either. That points at a second problem: the ball-tracking window opens at
the DETECTED release (t=14083), and the frames show he does not actually let go
until ≈14283. The window spends its first ~200 ms on a ball still in his hands
while the previous one sails past.

So the real fix is probably both: tighten the origin AND make the window start
at the true release. **I did not change either.** A guess here trades a broken
shot for a broken threshold across the other ten, and the honest state is that I
know the mechanism but not yet the right values.

Two notes for whoever picks this up:
- `scripts/probe-ball-origin.mjs` sweeps this in seconds against the fixture. The
  fixture is normalised; `launchAngle` works in PIXELS, so scale by 1000 — the
  first version of this probe passed normalised coordinates and every arc failed
  the "never travelled sideways" gate, which looks exactly like a tracking bug.
- `replay-ball-candidates.mjs` passes NO origin at all (`trackBall(frames, {})`),
  which is why its blob-size sweep showed the same refusal at every threshold.
  It was never exercising the constraint that matters.

### Checked, and NOT systematic: release detection is right on the other reps

Shot 4's window opening ~200 ms before he lets go raised a much worse
possibility — that release detection is early on every rep, which would skew
every release angle, every timing-vs-apex number and every arc measurement in
the tool.

It does not. I pulled the actual frames at three detected release times and
looked:

| shot | detected release | what the frame shows |
|---|---|---|
| 1 | t=3017 | ball at the hand, arm extending — **correct** |
| 5 | t=18400 | ball at the hand, arm extending, feet off the ground — **correct** |
| 4 | t=14083 | hands together at chest, a SECOND ball already high in the sky |

So the phase detection is sound and the scorecard's angles are measured at the
right instant. **Shot 4 is the anomaly, not the rule** — and the thing that makes
it anomalous is the same thing that breaks its ball track: a second ball in the
air.

Worth noting shot 1 also has a second ball in frame, resting on the ground by his
feet. That one is harmless: it is stationary, so frame-differencing never
produces a blob for it. Only a MOVING second ball causes this.

### Window start alone does not fix it either — and why the fixture cannot close this

`node scripts/probe-ball-window.mjs scripts/fixtures/ball-rejected-det1.json`
sweeps the window start against the origin threshold:

```
dropFirst  t0      maxOrigin   n    result
    0     14083       9       20   REFUSED: it barely rose (0.2 ball widths)
    0     14083       5        6   REFUSED: not falling like a projectile
    8     14283       9       11   REFUSED: it barely rose (0.0 ball widths)
    8     14283       5        -   no track
   10     14333       5        -   no track
```

No combination produces a valid arc. Either the previous ball wins, or nothing
tracks at all.

**But the probe cannot settle this, and the reason is a fixture limitation worth
fixing before the next attempt.** The fixture stores ONE wrist position — the one
at the detected release (t=14083). By t=14283 his arm has fully extended and the
wrist has moved a long way. So every "distance from the hand" the probe computes
after 14083 is measured against a stale hand position, which is exactly why
`maxOrigin=5` reports "no track" from t=14283 onward: the real seed IS near his
hand at that moment, just not near where his hand used to be.

**Next step, concretely:** make `shot-harness.html` dump `series.raw.wristPos`
for the whole window alongside the blobs, not a single point
(`ballDebugFailed.wrist` → `wristTrack`). Then the origin constraint can be
evaluated per frame, the way `trackBall` actually does it inside the app, and
these two probes become conclusive instead of suggestive.

That is a ten-minute change and one harness run. Until then, treat the origin and
window numbers above as **not yet decisive** — the mechanism (two balls, wrong
one chosen) is established from the frames; the right thresholds are not.

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
into a unit test. `scripts/replay-ball-candidates.mjs` already sweeps the blob-size
gate and lists every distinct arc it could have chosen — point it at this file.

### A confound in my own measurement, stated plainly

The 11 / 10 / 9 runs were taken on a machine **I was loading**. By 03:40 the
debug browser had 29 tabs open from the console, mobile and theme sweeps I had
been running all night, plus three stale vite servers.

That does not make the variance unreal — the counts genuinely differed, and the
mechanism (fewer presented frames while MediaPipe runs) is measured, not
inferred. But it does mean **the spread is an upper bound, not the number a
coach on a quiet phone would see.** Ohad analysing one clip on an idle machine
may well get 11 every time.

So the honest statement is: the count is load-sensitive, and I proved it by
being the load. What is NOT established is how often it bites in normal use.
Worth re-running three times on a quiet machine before deciding how much the
deterministic mode is worth.

## A deterministic capture mode now exists — opt-in, default unchanged

`captureShotFrames(src, { deterministic: true })` steps the clip with seeks
instead of reading a playing video, so it sees every frame regardless of machine
load. It was already the fallback path for browsers without
`requestVideoFrameCallback`; it is now reachable deliberately.

```bash
DETERMINISTIC=1 node scripts/shot-harness-run.mjs "/10%20of%2011.mp4" <port>
```

**Nothing in the app passes the flag.** It exists so the trade can be MEASURED
before anyone decides, because the cost is real: a seek on a 60 fps portrait clip
costs 100–175 ms, and there are hundreds of them. That expense is exactly why
playback was chosen originally, and it is why this is not simply switched on.

The question it answers is narrow and worth answering:

- **If three deterministic runs return the same count**, the diagnosis is
  confirmed and what remains is a product decision about how long an analysis is
  allowed to take. A slower analysis that can be trusted on the number beats a
  fast one that cannot.
- **If it still wanders**, the variance is somewhere other than frame sampling,
  and this has ruled out the obvious suspect.

Either answer is worth the runtime. Note the runner's `protocolTimeout` is
raised to 45 minutes for this path — the default kills a seek-stepped run
mid-way and reports a puppeteer error instead of a result.

## MEASURED: deterministic capture found all 11

First deterministic run of the same clip, on the same build:

```
                    frames analysed   effective fps   shots   ball tracks
default (playback)        741              16.4        9-11        10/11
deterministic            2632              58.1          11        10/11
```

```
[shot-capture] {"coarse":2459,"fine":2371,"windows":8,"skipped":0}  out 2632
analyzed 11
  #1  t=3017   ballN 40   deg 68.0      #7  t=27067  ballN 39   deg 66.4
  #2  t=6650   ballN 39   deg 67.5      #8  t=31167  ballN 38   deg 66.3
  #3  t=10317  ballN 25   deg 63.3      #9  t=35417  ballN 42   deg 52.5
  #4  t=14083  ballN 0    REJECTED      #10 t=38667  ballN 39   deg 68.2
  #5  t=18400  ballN 27   deg 62.8      #11 t=42717  ballN 40   deg 63.8
  #6  t=23000  ballN 38   deg 66.4
```

**Three things this establishes.**

1. **All 11 shots, first try.** The default path gave 11, 10 and 9 on three runs.
2. **The ball data got much richer** — 25–42 samples per shot against 13–20
   before. Every angle is fitted on roughly twice the evidence.
3. **Shot 4 is still rejected**, with 3.5× the frames. So its failure is NOT
   frame starvation — it is a genuine tracking problem, exactly as the fixture
   sweep said. Two independent lines of evidence now agree, which is why it is
   worth fixing separately rather than hoping better capture solves it.

**The cost, measured:** 607 s of capture (255 s coarse + 351 s fine) against
161 s on the default path. About 3.8× slower — roughly 10 minutes for a 45-second
clip on this machine.

**This is the trade, and it is Ohad's call:** a ~10-minute analysis whose shot
count can be trusted, or a ~3-minute one that returns 9, 10 or 11. For a tool
whose first number is the shot count, and which a coach runs once per session
rather than continuously, the slower answer looks like the right one — but that
is a product decision, not a technical one.

Worth noting a middle path exists: run the COARSE pass deterministically (it is
what finds the shots, 255 s) and leave the fine pass on playback. That would cost
about 6 minutes instead of 10 and should fix the count, though the ball data
would stay as sparse as before. Not tested.

### Confirmed reproducible — twice, and the second run was under load

```
 #   run1 t   run2 t   delta   ballN 1   ballN 2
 1    3017     3017      0       40        40
 2    6650     6650      0       39        39
 3   10317    10317      0       25        25
 4   14083    14083      0        0         0
 5   18400    18400      0       27        27
 6   23000    23000      0       38        38
 7   27067    27067      0       39        39
 8   31167    31167      0       38        38
 9   35417    35417      0       42        42
10   38667    38667      0       39        39
11   42717    42717      0       40        40
```

**Every shot at the identical millisecond. Every ball-sample count identical.**
Coarse frame count identical too (2459 both runs); the merged total differed by
one frame out of 2632.

And this is the part that matters: **run 2 ran while the mobile audit was
hammering the same browser** — three of that audit's routes timed out from the
load. The capture did not care. That is what load-independence means, and it is
the difference from the default path, where the same clip gave 11, 10 and 9 with
shot times drifting up to 383 ms.

So the diagnosis is settled and the fix is validated. What remains is only the
price: ~10 minutes instead of ~3.

## Do these in order — the second gap blocked the first, and is now UNBLOCKED

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

**Sequence — step 1 is now DONE:**

1. ~~Make capture deterministic~~ — **done and verified.** Two deterministic runs
   returned the same 11 shots at the same millisecond, the second under heavy
   load. `DETERMINISTIC=1` is the stable baseline the selector work needed.
2. NOW the ball-arc selector can be changed against a fixed reference:
   `scripts/fixtures/ball-rejected.json` for fast iteration, and a deterministic
   clip run as the acceptance test. "The other ten are unchanged" is finally a
   statement that can be checked — it means byte-identical shot times and ball
   counts, which is what two deterministic runs already produce.

Note the fixture sweep says the arc simply is not in the candidate set, so start
at `motionBlobs` for that release rather than at the selector.

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
feed them to `scripts/replay-ball-candidates.mjs`, which sweeps the blob-size gate
and lists every distinct arc it could have chosen.

Success is: **11 of 11 ball tracks, with the other ten unchanged** — same
angles, same speeds, same fits.
