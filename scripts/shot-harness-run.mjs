// Drives shot-harness.html in the persistent debug Chrome so the REAL
// MediaPipe pipeline runs against a real clip and reports how many shots it
// finds, where it rejects the rest, and how the peak-prominence threshold
// changes the count. Diagnostic only — never part of the app build.
import puppeteer from 'puppeteer-core';

const CLIP = process.argv[2] || '/10%20of%2011.mp4';
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
  if (r.error) console.log('error:', r.error);
}
await page.close();
await b.disconnect();
