// The starved-capture warning must fire on the rate we ANALYSED, not the rate
// the phone filmed at.
//
// WHY. Ohad's clip is a 60 fps portrait phone video. One run of it analysed
// only 741 frames across 45.3 s — 16.4 fps effective — and reported 9 shots
// instead of 11. The warning that exists precisely to say "shots can be MISSED
// at this rate" stayed silent, because it was keyed on `result.fps`, which is
// the SOURCE video's frame rate whenever capture can measure it. 60 is not
// below 18, so the guard could never fire for the failure it was written for.
//
// This pins the rule: warn on effFps, fall back to fps only when effFps is
// missing. Measured numbers below are from the real run, not invented.
const THRESHOLD = 18;

// The exact expression used in ShotAnalyzer.jsx.
const shouldWarn = (result) => {
  const rate = result.effFps != null ? result.effFps : result.fps;
  if (rate == null || rate >= THRESHOLD) return false;
  return true;
};

let pass = 0, fail = 0;
const check = (name, cond) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); cond ? pass++ : fail++; };

// The real run: 60 fps source, 741 frames over 45.3 s, 9 shots found of 11.
const realStarvedRun = { fps: 60, effFps: 16.4, frameCount: 741 };
check('the real 9-of-11 run warns', shouldWarn(realStarvedRun) === true);
check('...and would NOT have warned on source fps alone', 60 >= THRESHOLD);

// A healthy capture must stay quiet.
check('a full-rate capture stays silent', shouldWarn({ fps: 60, effFps: 58.9, frameCount: 2600 }) === false);
check('exactly at the threshold is fine', shouldWarn({ fps: 60, effFps: 18, frameCount: 800 }) === false);
check('just under the threshold warns', shouldWarn({ fps: 60, effFps: 17.9, frameCount: 800 }) === true);

// Fallback: older results carry no effFps at all.
check('falls back to fps when effFps is absent', shouldWarn({ fps: 12, effFps: null, frameCount: 300 }) === true);
check('fallback stays silent on a good fps', shouldWarn({ fps: 60, effFps: null, frameCount: 2600 }) === false);

// Missing everything must not throw or warn spuriously.
check('no rate at all does not warn', shouldWarn({ fps: null, effFps: null }) === false);

// A slow SOURCE video is still worth warning about.
check('a genuinely 12fps video warns', shouldWarn({ fps: 12, effFps: 11.8, frameCount: 540 }) === true);

console.log(`\nSTARVED GUARD: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
