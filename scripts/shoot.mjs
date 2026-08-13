// scripts/shoot.mjs — Claude's own EYES. Screenshots any route by attaching to
// the ALREADY-RUNNING debug Chrome on :9222 (Ohad's persistent, logged-in
// profile per global CLAUDE.md), so auth'd coach screens work with no login.
//
// Usage:
//   node scripts/shoot.mjs <url> <outfile.png> [width] [height] [full] [waitMs] [selector]
// Examples:
//   node scripts/shoot.mjs http://localhost:4173/#/coach/programs /tmp/a.png 1440 900
//   node scripts/shoot.mjs https://expo-app.co.il/ /tmp/prod.png 390 844 full
//   node scripts/shoot.mjs http://localhost:4173/#/athlete /tmp/b.png 390 844 '' 2500 '.rail'
//
// NEVER calls browser.close() (that would kill Ohad's whole Chrome) — only
// closes the tab it opened and disconnects.

import puppeteer from 'puppeteer-core';

const [, , url, out, w = '1440', h = '900', full = '', waitMs = '1500', selector = ''] = process.argv;
if (!url || !out) {
  console.error('usage: node scripts/shoot.mjs <url> <outfile.png> [width] [height] [full] [waitMs] [selector]');
  process.exit(2);
}

const CDP = 'http://localhost:9222';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function wsEndpoint() {
  const res = await fetch(`${CDP}/json/version`);
  if (!res.ok) throw new Error(`CDP /json/version ${res.status}`);
  const j = await res.json();
  if (!j.webSocketDebuggerUrl) throw new Error('no webSocketDebuggerUrl — is Chrome running with --remote-debugging-port=9222?');
  return j.webSocketDebuggerUrl;
}

(async () => {
  let browser, page;
  try {
    const browserWSEndpoint = await wsEndpoint();
    browser = await puppeteer.connect({ browserWSEndpoint, protocolTimeout: 60000 });
    page = await browser.newPage();
    await page.setViewport({ width: parseInt(w) || 1440, height: parseInt(h) || 900, deviceScaleFactor: 1 });
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 }).catch(async () => {
      // networkidle can hang on a live app with polling; fall back to domcontentloaded
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    });
    if (selector) {
      await page.waitForSelector(selector, { timeout: 8000 }).catch(() => console.error(`(selector "${selector}" not found — shooting anyway)`));
    }
    await sleep(parseInt(waitMs) || 1500);
    await page.screenshot({ path: out, fullPage: full === 'full' || full === 'true' || full === '1' });
    console.log(`OK ${out} @ ${w}x${h}${full ? ' full' : ''} <- ${url}`);
  } catch (e) {
    console.error('SHOOT FAILED:', e.message);
    process.exitCode = 1;
  } finally {
    try { if (page) await page.close(); } catch {}
    try { if (browser) await browser.disconnect(); } catch {} // NOT close()
  }
})();
