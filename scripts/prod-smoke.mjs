// Production smoke test. Loads the LIVE site (not the dev server), bypassing
// the service worker so a cached bundle can't fake a pass, and checks that every
// key surface renders without a runtime error.
import puppeteer from 'puppeteer-core';

const BASE = process.argv[2] || 'https://expo-app.co.il';
const ROUTES = process.argv.length > 3 ? process.argv.slice(3) : [
  '/', '/coach/dashboard', '/coach/athletes', '/coach/programs', '/coach/review-tools',
  '/coach/tasks', '/coach/bhbc', '/athlete', '/demo', '/demo/coach', '/demo/athlete', '/try',
];

const b = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', protocolTimeout: 120000 });
const page = await b.newPage();
await page.setViewport({ width: 1440, height: 950 });
// A stale SW would serve the OLD bundle and every check below would be a lie.
const client = await page.createCDPSession();
await client.send('Network.setBypassServiceWorker', { bypass: true });
// AND disable the HTTP cache. Bypassing only the service worker still let the
// browser serve a cached index.html, so a run reported an OLDER bundle than the
// one curl proved was live — a verification that quietly checks yesterday's
// build is worse than no verification.
await client.send('Network.setCacheDisabled', { cacheDisabled: true });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let bad = 0;

for (const route of ROUTES) {
  const errs = [];
  const onErr = (e) => errs.push(String(e).slice(0, 120));
  const onConsole = (m) => { if (m.type() === 'error') { const t = m.text(); if (!/favicon|manifest|Failed to load resource/i.test(t)) errs.push('console: ' + t.slice(0, 120)); } };
  page.on('pageerror', onErr);
  page.on('console', onConsole);
  try {
    const resp = await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await wait(4000);
    const info = await page.evaluate(() => ({
      len: document.body.innerText.trim().length,
      title: document.title,
      blank: document.body.innerText.trim().length < 30,
      bundle: [...document.querySelectorAll('script[src]')].map((s) => s.src).find((s) => /assets\/index-/.test(s)) || '',
    }));
    const status = resp ? resp.status() : 0;
    const ok = status < 400 && !info.blank && errs.length === 0;
    if (!ok) bad++;
    console.log(`${(ok ? 'ok' : 'FAIL').padEnd(5)} ${route.padEnd(22)} http=${status} textLen=${info.len} ${info.bundle.split('/').pop()}`);
    if (errs.length) console.log('       errors:', JSON.stringify(errs.slice(0, 3)));
  } catch (e) {
    bad++;
    console.log(`FAIL  ${route.padEnd(22)} ${String(e).slice(0, 90)}`);
  }
  page.off('pageerror', onErr);
  page.off('console', onConsole);
}

console.log(bad === 0 ? '\nPROD SMOKE: all routes clean' : `\nPROD SMOKE: ${bad} route(s) need attention`);
await page.close();
await b.disconnect();
process.exit(bad ? 1 : 0);
