// verify-shot-determinism.mjs — the same clip must give the same answer.
//
// CLAUDE.md's standing "actually next": the analyzer returned a different shot
// count on repeat runs of one clip - 11, then 10, then 9 - because the default
// capture samples a PLAYING video and drops frames under load. The count is the
// first number a coach reads, and a number that moves is worse than a number
// that is slightly wrong: he cannot tell which run to believe.
//
// This does NOT assert a particular count. Ground truth for a clip is a
// separate argument. It asserts that N runs agree with each other - count AND
// per-shot release times - which is the property that was actually broken.
//
//   node scripts/verify-shot-determinism.mjs [clip] [port] [runs]
import puppeteer from 'puppeteer-core';

const CLIP = process.argv[2] || '/testclips/clip02.mp4';
const PORT = process.argv[3] || '5199';
const RUNS = Number(process.argv[4] || 3);

const b = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 60 * 60 * 1000 });
const results = [];
let bad = 0;

try {
  for (let n = 1; n <= RUNS; n++) {
    const page = await b.newPage();
    try {
      await page.goto(`http://127.0.0.1:${PORT}/shot-harness.html`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction('window.__ready === true', { timeout: 30000 });
      // Deterministic capture: seek frame by frame instead of sampling a
      // playing video. Without this the comparison below is meaningless -
      // two runs would be looking at two different sets of frames.
      //
      // It buys REPEATABILITY, not completeness, and the difference matters.
      // Measured 2026-09-01 on Ohad's own 17-shot clip (60 fps portrait):
      // deterministic captured 1541 frames and found 9 shots in 1445s, while
      // the default playback path captured 2286 and found all 17 in 487s. A
      // seek is expensive there and the fixed step under-samples the source.
      // So use this gate to prove a change did not add VARIANCE - never as
      // evidence that a shot count is correct.
      await page.evaluate((c) => window.runHarness(c, { deterministic: 'coarse' }), CLIP);
      const r = await page.evaluate(async () => {
        const M = await import('/src/shotAnalysis.js');
        const f = window.__frames;
        const res = M.analyzeShotClip(f, { hand: M.detectShootingHand(f) || 'R', statureCm: 190 });
        return {
          frames: f.length,
          shots: (res.shots || []).length,
          releases: (res.shots || []).map((s) => Math.round(f[s.cycle.release].t)),
        };
      });
      results.push(r);
      console.log(`run ${n}: ${r.shots} shots, ${r.frames} frames, releases ${JSON.stringify(r.releases)}`);
    } finally { await page.close().catch(() => {}); }
  }

  const counts = [...new Set(results.map((r) => r.shots))];
  console.log('');
  if (counts.length === 1) console.log(`PASS - all ${RUNS} runs agree on ${counts[0]} shots`);
  else { console.log(`FAIL - shot count varies across runs: ${JSON.stringify(counts)}`); bad = 1; }

  // Release times are compared with a TOLERANCE, not for equality. Even the
  // deterministic path drops the odd frame - measured 764 / 761 / 753 frames
  // over three runs of the same clip - so a release can land one or two frames
  // either side. Demanding bit-identical timestamps would make this gate fail
  // forever, and a gate that can never pass gets ignored, which is worse than
  // not having one. What must hold is that it is the SAME shots at the SAME
  // moments to within a frame or two.
  const TOL_MS = 100;
  let worst = 0;
  if (counts.length === 1) {
    for (let i = 0; i < results[0].releases.length; i++) {
      const vals = results.map((r) => r.releases[i]);
      worst = Math.max(worst, Math.max(...vals) - Math.min(...vals));
    }
    if (worst <= TOL_MS) console.log(`PASS - release times agree within ${worst}ms (tolerance ${TOL_MS}ms)`);
    else { console.log(`FAIL - release times spread ${worst}ms across runs`); bad = 1; }
  }
} catch (e) {
  console.log('ERROR:', String(e.message || e).split('\n')[0]);
  bad = 1;
} finally { b.disconnect(); }

process.exit(bad);
