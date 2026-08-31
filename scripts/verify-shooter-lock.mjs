// verify-shooter-lock.mjs — it must follow ONE man, the one shooting.
//
// Ohad, 2026-08-31: "make sure the shot analyzer only follows the shooter with
// the ball even when there are multiple players on the video", and "test it out
// with 10 different videos you find and download".
//
// Two metrics, because either alone can be passed by a broken tracker:
//
//   swaps        steps of the torso centroid larger than 0.15 of the frame
//                between samples less than 0.25s apart. A body cannot move that
//                far that fast; a step like this is the tracker changing its
//                mind about WHICH body. Median real motion is 0.003.
//
//   ballAtHand   share of frames carrying ball candidates where one sits within
//                0.15 of a tracked wrist. Continuity alone would be passed by a
//                tracker that locks steadily onto the wrong player all clip;
//                this is what says the tracked man is the one with the ball.
//
// The corpus is public/testclips/_corpus (gitignored - large). Rebuild it from
// openly-licensed Wikimedia Commons footage; see the handoff memory. Baseline
// measured 2026-08-31 across ten clips including two full-court games:
// 91 swap-sized steps before the lock, 11 after, seven of ten clips at zero.
//
// KNOWN LIMIT, measured rather than assumed: the residual swaps concentrate in
// footage where the subject is genuinely ambiguous. c09 is a WIDE wheelchair
// game - ten-plus players at similar scale, no designated shooter - and at its
// worst step both bodies are near-identical in size (shoulder 0.028 vs 0.037),
// so there is no signal that says which one the tool is meant to follow. That
// is not Ohad's case: he films one athlete deliberately. Tuning against clips
// like c09 would trade his real case for a synthetic one, so do not.
//
//   node scripts/verify-shooter-lock.mjs [port] [label] [clipFilter]
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
const PORT = process.argv[2] || '5202';
const LABEL = process.argv[3] || 'run';
const DIR = 'public/testclips/_corpus';
const ONLY = process.argv[4] || '';   // optional substring filter, e.g. c05
const clips = fs.readdirSync(DIR).filter((f) => f.endsWith('.mp4') && (!ONLY || f.includes(ONLY))).sort();
const b = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 60 * 60 * 1000 });
const rows = [];
for (const c of clips) {
  const url = `/testclips/_corpus/${c}`;
  const page = await b.newPage();
  let row = { clip: c, err: null };
  try {
    await page.goto(`http://127.0.0.1:${PORT}/shot-harness.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction('window.__ready === true', { timeout: 30000 });
    await page.evaluate((u) => window.runHarness(u, { deterministic: 'coarse' }), url);
    row = { ...row, ...await page.evaluate(() => {
      const f = window.__frames;
      const T = [11, 12, 23, 24];
      const cen = (lm) => { let x = 0, y = 0, n = 0; for (const j of T) { const p = lm && lm[j]; if (p && (p.visibility == null || p.visibility > 0.3)) { x += p.x; y += p.y; n++; } } return n ? { x: x / n, y: y / n } : null; };
      const cs = f.map((fr) => cen(fr.landmarks));
      // A SCENE CUT IS NOT A SWAP.
      //
      // Stock footage is edited. c01 is an instructional video that cuts from a
      // low close-up to a wide shot mid-drill: the tracked centroid jumps 0.39
      // of the frame and the shoulder width goes 0.038 -> 0.118. A body cannot
      // triple in size in 167ms, so that is the camera changing, not the
      // tracker changing its mind - same man, different shot. Counting those as
      // swaps blamed the tracker for the editor's work.
      //
      // Ohad films single continuous takes on a phone, so this never fires on
      // his own clips; it only stops the corpus from lying.
      const shoulder = (lm) => { const a2 = lm && lm[11], b2 = lm && lm[12]; return a2 && b2 ? Math.hypot(a2.x - b2.x, a2.y - b2.y) : null; };
      const steps = [];
      let cuts = 0;
      for (let i = 1; i < cs.length; i++) {
        if (!cs[i] || !cs[i - 1]) continue;
        const dt = (f[i].t - f[i - 1].t) / 1000;
        if (dt > 0.25) continue;                 // a long gap may move legitimately
        const s0 = shoulder(f[i - 1].landmarks), s1 = shoulder(f[i].landmarks);
        if (s0 && s1) {
          const ratio = Math.max(s0, s1) / Math.min(s0, s1);
          if (ratio > 1.6) { cuts++; continue; }
        }
        steps.push(Math.hypot(cs[i].x - cs[i - 1].x, cs[i].y - cs[i - 1].y));
      }
      const sorted = [...steps].sort((a, c2) => a - c2);
      const med = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
      // DOES IT FOLLOW THE MAN WITH THE BALL?
      // Continuity alone only proves the tracker does not swap - it could hold
      // steadily onto the wrong player all clip. The ball candidates are carried
      // on the frames, so ask how often one is near the tracked wrists.
      const aspect = (f.dims && f.dims.w && f.dims.h) ? f.dims.w / f.dims.h : 16 / 9;
      let withBlobs = 0, nearHand = 0;
      const WR = [15, 16];
      for (const fr of f) {
        const bl = fr.blobs;
        if (!bl || !bl.length) continue;
        withBlobs++;
        let best = Infinity;
        for (const j of WR) {
          const w = fr.landmarks && fr.landmarks[j];
          if (!w) continue;
          // Blobs are normalised by frame HEIGHT; landmark x is normalised by
          // WIDTH. Comparing them directly would stretch every x distance by the
          // aspect ratio and quietly report the ball as further from the hand
          // than it is.
          for (const q of bl) {
            const d = Math.hypot(q.x - w.x * aspect, q.y - w.y);
            if (d < best) best = d;
          }
        }
        if (best < 0.15) nearHand++;
      }
      return { frames: f.length, steps: steps.length,
        median: +med.toFixed(4),
        max: +(sorted[sorted.length - 1] || 0).toFixed(4),
        swaps: steps.filter((s) => s > 0.15).length,
        cuts,
        blobFrames: withBlobs,
        ballAtHandPct: withBlobs ? Math.round((nearHand / withBlobs) * 100) : null };
    }) };
  } catch (e) { row.err = String(e.message || e).slice(0, 60); }
  await page.close().catch(() => {});
  rows.push(row);
  console.log(`${row.clip}  ${row.err ? 'ERR ' + row.err : `frames ${String(row.frames).padStart(4)} median ${String(row.median).padEnd(7)} max ${String(row.max).padEnd(7)} swaps ${String(row.swaps).padEnd(3)} cuts ${String(row.cuts).padEnd(3)} ballAtHand ${row.ballAtHandPct == null ? 'n/a' : row.ballAtHandPct + '%'} (${row.blobFrames}f)`}`);
}
fs.writeFileSync(`audit-out/corpus-${LABEL}.json`, JSON.stringify(rows, null, 1));
const ok = rows.filter((r) => !r.err);
console.log(`\n${LABEL}: clips ${ok.length}/${rows.length}  total swap-sized steps ${ok.reduce((a, r) => a + r.swaps, 0)}  worst max ${Math.max(0, ...ok.map((r) => r.max)).toFixed(3)}`);
b.disconnect();
