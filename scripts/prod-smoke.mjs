// Production smoke test. Loads the LIVE site (not the dev server), bypassing
// the service worker so a cached bundle can't fake a pass, and checks that every
// key surface renders without a runtime error.
import puppeteer from 'puppeteer-core';
import { setWidth } from './lib/viewport.mjs';

const BASE = process.argv[2] || 'https://expo-app.co.il';
const ROUTES = process.argv.length > 3 ? process.argv.slice(3) : [
  '/', '/coach/dashboard', '/coach/athletes', '/coach/programs', '/coach/review-tools',
  '/coach/tasks', '/coach/bhbc', '/athlete', '/demo', '/demo/coach', '/demo/athlete', '/try',
];

const b = await puppeteer.connect({ browserURL: (process.env.CDP || 'http://127.0.0.1:9222'), protocolTimeout: 120000 });
const page = await b.newPage();
await setWidth(page, 1440, 950);
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
// THE BUILD THAT IS LIVE NOW (15.10: three deploys in a row, the first run right after Vercel's 'success' met the EDGE
// still serving the previous index.html on some paths for about a minute - an old bundle whose chunks are gone, a MIME
// error, a FAIL that was the swap and not the build). A route that lands on another bundle waits 20 s and loads again.
const liveBundle = await fetch(`${BASE}/?cb=${Date.now()}`, { cache: 'no-store' })
  .then((r) => r.text()).then((h) => (h.match(/assets\/(index-[A-Za-z0-9_-]+\.js)/) || [])[1] || '').catch(() => '');
console.log(`live bundle: ${liveBundle || '(not read)'}`);
const bundleNow = () => page.evaluate(() => ([...document.querySelectorAll('script[src]')].map((s) => s.src).find((s) => /assets\/index-/.test(s)) || '').split('/').pop());

for (const route of ROUTES) {
  const errs = [];
  const onErr = (e) => errs.push(String(e).slice(0, 120));
  const onConsole = (m) => { if (m.type() === 'error') { const t = m.text(); if (!/favicon|manifest|Failed to load resource/i.test(t)) errs.push('console: ' + t.slice(0, 120)); } };
  page.on('pageerror', onErr);
  page.on('console', onConsole);
  try {
    const load = async () => { const r = await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 45000 }); await wait(4000); return r; };
    let resp = await load();
    if (liveBundle && (await bundleNow()) !== liveBundle) {
      console.log(`      ${route} came back on ${await bundleNow()} (live: ${liveBundle}) - the edge is still swapping; once more in 20 s`);
      await wait(20000); errs.length = 0; resp = await load();
    }
    let info = await page.evaluate(() => ({
      len: document.body.innerText.trim().length,
      title: document.title,
      blank: document.body.innerText.trim().length < 30,
      bundle: [...document.querySelectorAll('script[src]')].map((s) => s.src).find((s) => /assets\/index-/.test(s)) || '',
    }));
    const status = resp ? resp.status() : 0;
    const stale = !!liveBundle && info.bundle.split('/').pop() !== liveBundle;   // a pass on yesterday's build is not a pass
    if (stale) errs.push(`still on an older bundle than the live ${liveBundle}`);
    let ok = status < 400 && !info.blank && errs.length === 0;
    // one more load 20 s later before a FAIL counts (16.10: right after a deploy the first run still flagged 2-3 routes on
    // the SAME bundle - a chunk the edge had not yet served). A route that passes on the retry says so; a real fault fails twice.
    if (!ok) {
      console.log(`      ${route} failed once (${JSON.stringify(errs.slice(0, 2))}) - once more in 20 s`);
      await wait(20000); errs.length = 0;
      const r2 = await load();
      const b2 = await bundleNow();
      const blank2 = await page.evaluate(() => document.body.innerText.trim().length < 30);
      if (liveBundle && b2 !== liveBundle) errs.push(`still on an older bundle than the live ${liveBundle}`);
      ok = (r2 ? r2.status() : 0) < 400 && !blank2 && errs.length === 0;
      if (ok) console.log(`      ${route} passed on the retry`);
      resp = r2;
      info = await page.evaluate(() => ({ len: document.body.innerText.trim().length, bundle: [...document.querySelectorAll('script[src]')].map((s) => s.src).find((s) => /assets\/index-/.test(s)) || '' }));
    }
    if (!ok) bad++;
    console.log(`${(ok ? 'ok' : 'FAIL').padEnd(5)} ${route.padEnd(22)} http=${resp ? resp.status() : 0} textLen=${info.len} ${info.bundle.split('/').pop()}`);
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
