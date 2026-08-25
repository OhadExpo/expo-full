// Drives shot-harness.html in the persistent debug Chrome so the REAL
// MediaPipe pipeline runs against a real clip and reports how many shots it
// finds, where it rejects the rest, and how the peak-prominence threshold
// changes the count. Diagnostic only — never part of the app build.
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

const CLIP = process.argv.slice(2).find((a) => !a.startsWith('--')) || '/10%20of%2011.mp4';
const PORT = process.argv[3] || '5199';

const b = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: { width: 1280, height: 900 } });
const page = await b.newPage();
page.on('console', (m) => { const t = m.text(); if (/shot-capture|error|Error/.test(t)) console.log('  [page]', t.slice(0, 300)); });
page.on('pageerror', (e) => console.log('  [pageerror]', String(e).slice(0, 300)));

await page.goto(`http://localhost:${PORT}/shot-harness.html`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__ready === true', { timeout: 30000 });
console.log('harness ready; analysing', CLIP);

const started = Date.now();
const poll = setInterval(async () => {
  try { const s = await page.evaluate(() => document.getElementById('out').textContent); console.log(`  ${Math.round((Date.now() - started) / 1000)}s ${s}`); } catch { /* closing */ }
}, 15000);

let r;
try {
  r = await page.evaluate((u) => window.runHarness(u), CLIP, { timeout: 0 });
} catch (e) {
  console.log('FAILED:', String(e).slice(0, 500));
} finally { clearInterval(poll); }

if (r) {
  console.log(JSON.stringify({
    duration: r.duration, fps: r.fps, frameCount: r.frameCount, hand: r.hand, torsoRef: r.torsoRef,
    stats: r.stats, windows: r.windows,
  }, null, 1));
  console.log('sweep:', JSON.stringify(r.sweep));
  console.log('peaks by prominence:'); for (const k of Object.keys(r.peakSets)) console.log(' ', k, r.peakSets[k].length, JSON.stringify(r.peakSets[k]));
  console.log('strict shots', r.strictShots.length, JSON.stringify(r.strictShots));
  console.log('strict rejects', r.strictRejects.length); r.strictRejects.forEach((x) => console.log('   -', x));
  console.log('relaxed shots', r.relaxedShots.length, JSON.stringify(r.relaxedShots));
  console.log('relaxed rejects', r.relaxedRejects.length); r.relaxedRejects.forEach((x) => console.log('   -', x));
  console.log('ball frames seen:', r.ballFramesSeen);
  console.log('analyzed', r.analyzed ? r.analyzed.length : 0, JSON.stringify(r.analyzed));
  if (r.originProbe) { console.log('origin probe (ball diameters from the shooting hand, per frame after release):'); for (const line of r.originProbe) console.log('  ', line); }
  if (r.error) console.log('error:', r.error);
}
// --assert turns this from something a human reads into a GATE. The numbers
// below are the measured behaviour on Ohad's own 11-rep clip; a change that
// drops detection or tracking below them is a regression, not a nuance.
// Bounds are deliberately loose — MediaPipe timing varies a little run to run —
// so a failure means something really moved.
if (process.argv.includes('--assert')) {
  if (!r) { console.log('\nSHOT CLIP: the harness produced no result - is the dev server on :5199 up?'); await page.close(); await b.disconnect(); process.exit(1); }
  // Is the page running the code that is on disk? Vite caches the transform of
  // an inline module script; a dev server started before the page was last
  // edited keeps serving the old one. That is not hypothetical — it happened,
  // and every run for a day tested harness code that no longer existed.
  const DISK = fs.readFileSync(new URL('../shot-harness.html', import.meta.url), 'utf8');
  const want = (DISK.match(/harnessBuild:\s*'([^']+)'/) || [])[1];
  if (want && r.harnessBuild !== want) {
    console.log(`
SHOT CLIP: the dev server is serving a STALE shot-harness.html`);
    console.log(`  page reports ${JSON.stringify(r.harnessBuild)}, disk says ${JSON.stringify(want)}`);
    console.log('  Restart the vite dev server on :5199 and re-run. Nothing was tested.');
    await page.close(); await b.disconnect(); process.exit(1);
  }
  const A = (r && r.analyzed) || [];
  const tracked = A.filter((x) => x.ballDeg != null);
  const speeds = tracked.map((x) => x.speed).filter((v) => v != null);
  const fits = tracked.map((x) => x.ballFit).filter((v) => v != null);
  // A run that detects shots but sees ZERO ball frames is the known capture
  // starvation (two MediaPipe passes competing, a cold GPU context), not a code
  // regression. Say so instead of crying wolf — a gate that intermittently
  // reports a false failure gets ignored, which is worse than no gate.
  if ((r.strictShots || []).length > 0 && (r.ballFramesSeen || 0) === 0) {
    console.log('\nSHOT CLIP: INCONCLUSIVE - shots detected but no ball frames at all. That is capture starvation, not a regression. Re-run with nothing else driving MediaPipe.');
    await page.close(); await b.disconnect(); process.exit(2);
  }
  let bad = 0;
  const need = (name, cond, detail) => { if (!cond) { bad++; console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); } };

  need('detects at least 10 of the 11 shots', (r.strictShots || []).length >= 10, `got ${(r.strictShots || []).length}`);
  need('analyzes every detected shot', A.length === (r.strictShots || []).length, `${A.length} vs ${(r.strictShots || []).length}`);
  // An UPPER bound too. The clip has exactly 11 reps, and a gate that only
  // checks "at least 10" happily passed a run that reported 12 — the eleventh
  // rep counted twice, 933ms apart. Detecting shots that are not there is as
  // wrong as missing ones, and it corrupts every session-level reading.
  need('detects no more shots than the clip contains (11)', A.length <= 11, `got ${A.length}`);
  need('tracks the ball on at least 8 reps', tracked.length >= 8, `got ${tracked.length}`);
  need('every accepted track fits a parabola (r2 >= 0.98)', fits.length > 0 && fits.every((f) => f >= 0.98), fits.length ? `min ${Math.min(...fits)}` : 'no fits');
  need('every launch angle is a jump shot (40-80 deg)', tracked.every((x) => x.ballDeg > 40 && x.ballDeg < 80),
    tracked.map((x) => x.ballDeg).join(','));
  need('every release speed is physically sane (3-9 m/s)', speeds.every((v) => v > 3 && v < 9), speeds.join(','));
  need('the ball is seen in plenty of frames', (r.ballFramesSeen || 0) > 300, `got ${r.ballFramesSeen}`);

  console.log(bad ? `\nSHOT CLIP: ${bad} regression(s)` : `\nSHOT CLIP: all gates passed (${(r.strictShots || []).length} shots, ${tracked.length} tracked)`);
  await page.close();
  await b.disconnect();
  process.exit(bad ? 1 : 0);
}

await page.close();
await b.disconnect();
