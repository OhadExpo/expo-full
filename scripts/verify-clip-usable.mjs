// verify-clip-usable.mjs — can this clip answer the ball question at all?
//
// The launch angle is unmeasurable when the release happens outside the frame,
// and that is a property of the FOOTAGE, not of the tracker. Measured on
// clip02: release is labelled correctly, 0-3 frames from the wrist's apex, but
// the shooting wrist is at y = -0.016 / 0.038 / 0.019 / -0.017 at that instant.
// Normalised y is 0 at the top edge, so negative is above it - the ball leaves
// the hand outside the picture.
//
// Run this BEFORE tuning anything ball-related against a clip. If the wrist at
// release is under ~0.03 the clip cannot answer the question, and any threshold
// fitted to it is fitted to noise. Two sessions were spent on the tracker
// before this was measured.
//
//   node scripts/verify-clip-usable.mjs [clip] [port]
import puppeteer from 'puppeteer-core';
const CLIP = process.argv[2] || '/testclips/clip02.mp4';
const PORT = process.argv[3] || '5202';
const b = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 60 * 60 * 1000 });
const page = await b.newPage();
await page.goto(`http://127.0.0.1:${PORT}/shot-harness.html`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__ready === true', { timeout: 30000 });
console.log('capturing', CLIP, '...');
await page.evaluate((c) => window.runHarness(c, { deterministic: 'coarse' }), CLIP);
const out = await page.evaluate(async () => {
  const M = await import('/src/shotAnalysis.js');
  const f = window.__frames;
  const hand = M.detectShootingHand(f) || 'R';
  const r = M.analyzeShotClip(f, { hand, statureCm: 190 });
  const WJ = hand === 'L' ? 15 : 16;
  return (r.shots || []).map((s) => {
    const c = s.cycle;
    const from = Math.max(0, c.dip - 5), to = Math.min(f.length - 1, c.release + 25);
    let topI = -1, topY = Infinity;
    for (let i = from; i <= to; i++) {
      const w = f[i].landmarks && f[i].landmarks[WJ];
      if (w && w.y < topY) { topY = w.y; topI = i; }
    }
    const relW = f[c.release] && f[c.release].landmarks && f[c.release].landmarks[WJ];
    return {
      shot: s.index,
      releaseIdx: c.release, wristTopIdx: topI,
      framesAfterApex: topI >= 0 ? c.release - topI : null,
      msAfterApex: topI >= 0 ? Math.round(f[c.release].t - f[topI].t) : null,
      wristYatRelease: relW ? +relW.y.toFixed(3) : null,
      wristYatTop: +topY.toFixed(3),
    };
  });
});
for (const s of out) console.log(`shot ${s.shot}: release at frame ${s.releaseIdx}, wrist apex at ${s.wristTopIdx} -> release is ${s.framesAfterApex} frames (${s.msAfterApex}ms) after the apex; wrist y ${s.wristYatRelease} vs apex ${s.wristYatTop}`);
await page.close().catch(() => {}); b.disconnect();
