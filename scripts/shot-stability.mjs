// How repeatable is the shot analyser on ONE clip?
//
// Ohad reads the shot COUNT first. If the same clip answers 11, then 10, then
// 11, nothing below it can be trusted either. The count varies because the
// coarse pass reads a PLAYING video: under MediaPipe load the browser presents
// fewer frames than the source has, so requestVideoFrameCallback simply fires
// less often (measured in shotCapture.js - the busy-skip counter reads zero).
//
// Seeking every frame was tried and measured WORSE (9 of 17 shots, 3x slower).
// This measures the other lever: give the browser more wall-clock per source
// frame by slowing playback, which keeps the normal decode path.
//
//   node scripts/_shot-stability.mjs "/clip.mp4" 3 1 0.5
//       clip, runs per rate, then the rates to compare
import puppeteer from 'puppeteer-core';
import { unmangleArg } from './lib/unmangle.mjs';

const CLIP = unmangleArg(process.argv[2] || '/10%20of%2011.mp4');
const RUNS = parseInt(process.argv[3] || '3', 10);
const RATES = process.argv.slice(4).map(Number).filter((n) => n > 0);
if (!RATES.length) RATES.push(1);

const b = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: { width: 1280, height: 900 }, protocolTimeout: 3_600_000 });
const page = await b.newPage();
await page.goto('http://127.0.0.1:5199/shot-harness.html', { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__ready === true', { timeout: 30000 });

const table = [];
for (const rate of RATES) {
  const runs = [];
  for (let i = 0; i < RUNS; i++) {
    const t0 = Date.now();
    const r = await page.evaluate((u, cr) => window.runHarness(u, { coarseRate: cr }), CLIP, rate, { timeout: 0 });
    const secs = Math.round((Date.now() - t0) / 1000);
    const shots = r && r.analyzed ? r.analyzed.length : 0;
    const angles = r && r.analyzed ? r.analyzed.filter((s) => s.ballDeg != null).length : 0;
    const times = r && r.analyzed ? r.analyzed.map((s) => s.t) : [];
    runs.push({ shots, angles, frames: r && r.ballFramesSeen != null ? r.ballFramesSeen : null, secs, times });
    console.log(`  rate ${rate}  run ${i + 1}/${RUNS}: ${shots} shots, ${angles} with an angle, ${secs}s`);
  }
  const shots = runs.map((r) => r.shots);
  const spread = Math.max(...shots) - Math.min(...shots);
  table.push({ rate, shots, spread, angles: runs.map((r) => r.angles), secs: Math.round(runs.reduce((a, r) => a + r.secs, 0) / runs.length) });
}

console.log('');
console.log('rate   shot counts      spread   angles           avg secs');
for (const t of table) {
  console.log(String(t.rate).padEnd(6) + JSON.stringify(t.shots).padEnd(17)
    + String(t.spread).padEnd(9) + JSON.stringify(t.angles).padEnd(17) + t.secs);
}
console.log('');
console.log('A spread of 0 means the same clip answered the same way every time.');
await page.close();
b.disconnect();
