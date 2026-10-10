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
//   BALLPASS=seek node scripts/shot-stability.mjs "/clip.mp4" 3 0.5
//       the same, with the opt-in seek ball pass (shotCapture seekBallPass);
//       compare the angles column against a run without it
import puppeteer from 'puppeteer-core';
import { unmangleArg } from './lib/unmangle.mjs';

const CLIP = unmangleArg(process.argv[2] || '/10%20of%2011.mp4');
const RUNS = parseInt(process.argv[3] || '3', 10);
const RATES = process.argv.slice(4).map(Number).filter((n) => n > 0);
const BALLPASS = ['seek', 'seek+det'].includes(process.env.BALLPASS) ? process.env.BALLPASS : null;   // 'seek+det' = + the trained ball detector (#638)
if (BALLPASS) console.log(`  ball pass: ${BALLPASS} (angles from frame-by-frame seeks around each release${BALLPASS === 'seek+det' ? ', plus a trained ball detector' : ''})`);
if (!RATES.length) RATES.push(1);

const b = await puppeteer.connect({ browserURL: (process.env.CDP || 'http://127.0.0.1:9222'), defaultViewport: { width: 1280, height: 900 }, protocolTimeout: 3_600_000 });
const page = await b.newPage();
await page.goto('http://127.0.0.1:5199/shot-harness.html', { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__ready === true', { timeout: 30000 });
// THROTTLE=3 slows the page's CPU 3x - a slower laptop than this PC (#475)
if (Number(process.env.THROTTLE) > 1) { const cdp = await page.createCDPSession(); await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.THROTTLE) }); console.log(`  CPU throttled ${process.env.THROTTLE}x`); }

const table = [];
for (const rate of RATES) {
  const runs = [];
  for (let i = 0; i < RUNS; i++) {
    const t0 = Date.now();
    const r = await page.evaluate((u, cr, bp) => window.runHarness(u, { coarseRate: cr, ...(bp ? { ballPass: bp } : null) }), CLIP, rate, BALLPASS, { timeout: 0 });
    const secs = Math.round((Date.now() - t0) / 1000);
    const shots = r && r.analyzed ? r.analyzed.length : 0;
    const angles = r && r.analyzed ? r.analyzed.filter((s) => s.ballDeg != null).length : 0;
    const seekShots = r && r.analyzed ? r.analyzed.filter((s) => s.ballSrc === 'seek').length : 0;
    const times = r && r.analyzed ? r.analyzed.map((s) => s.t) : [];
    // the harness must have RUN the pass that was asked for - a silent 'off' compares the baseline with itself
    const ranMode = r && r.stats && r.stats.ballPass ? r.stats.ballPass.mode : null;
    if (BALLPASS && ranMode !== BALLPASS) { console.log(`  ball pass asked ${BALLPASS}, the capture ran ${ranMode} - not a measurement`); process.exit(1); }
    runs.push({ shots, angles, seekShots, degs: r && r.analyzed ? r.analyzed.map((s) => s.ballDeg) : [], frames: r && r.ballFramesSeen != null ? r.ballFramesSeen : null, secs, times });
    console.log(`  rate ${rate}  run ${i + 1}/${RUNS}: ${shots} shots, ${angles} with an angle, ${secs}s${BALLPASS ? `  seek-read ${seekShots}/${shots} ballPass=${JSON.stringify(r && r.stats ? r.stats.ballPass : null)}` : ''}  deg=${JSON.stringify(r && r.analyzed ? r.analyzed.map((s) => s.ballDeg) : [])}  t=${JSON.stringify(times.map((x) => x == null ? null : +Number(x).toFixed(2)))}  stats=${JSON.stringify(r && r.stats ? { coarse: r.stats.coarse, recovered: r.stats.recovered, capped: r.stats.recoveryCapped, recoverMs: r.stats.recoverMs, holes: r.stats.holes, planned: r.stats.planned, tried: r.stats.tried, msCoarse: r.stats.msCoarse } : null)}`);
  }
  const shots = runs.map((r) => r.shots);
  const spread = Math.max(...shots) - Math.min(...shots);
  // ANGLE REPEATABILITY, per shot: the worst max-min of one shot's launch angle
  // across runs, over the shots that got an angle on EVERY run. Only defined
  // when the runs agree on the shot count - otherwise index i is not one shot.
  let degSpread = null;
  if (!spread && runs.length > 1) {
    for (let i = 0; i < shots[0]; i++) {
      const d = runs.map((r) => r.degs[i]);
      if (d.some((x) => x == null)) continue;
      degSpread = Math.max(degSpread || 0, Math.max(...d) - Math.min(...d));
    }
  }
  table.push({ rate, shots, spread, angles: runs.map((r) => r.angles), degSpread: degSpread == null ? null : +degSpread.toFixed(1), secs: Math.round(runs.reduce((a, r) => a + r.secs, 0) / runs.length) });
}

console.log('');
console.log('rate   shot counts      spread   angles           deg spread  avg secs');
for (const t of table) {
  console.log(String(t.rate).padEnd(6) + JSON.stringify(t.shots).padEnd(17)
    + String(t.spread).padEnd(9) + JSON.stringify(t.angles).padEnd(17) + String(t.degSpread).padEnd(12) + t.secs);
}
console.log('');
console.log('A spread of 0 means the same clip answered the same way every time.');
await page.close();
b.disconnect();
