// AN ATHLETE IN A GYM BASEMENT.
//
// The portal is a PWA with an offline layer (offlineQueue.js, blobQueue.js, a
// service worker precache) and nothing here has ever cut the network to see
// what actually happens. Athletes train in basements; this is not a theoretical
// state.
//
// Three things are checked, in the order they matter:
//   RENDERS  - the portal still shows the athlete's programme offline, from
//              cache, rather than a blank page or a browser error.
//   SAYS SO  - it tells them it is offline instead of silently showing stale
//              data as if it were live.
//   SURVIVES - no uncaught error, and it recovers when the network returns.
//
// Read-only: it never logs a set. The point is what the athlete SEES, and a
// smoke test that queued a write would be writing to their data.
//
//   node scripts/verify-athlete-offline.mjs [email]
import P from 'puppeteer-core';
import { setWidth } from './lib/viewport.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:4173';   // the BUILT app: the SW only runs there
const EMAIL = process.argv[2] || 'diego@diegoday.com';
const PW = process.env.ATHLETE_PW || '1234';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const problems = [];
let phase = 'startup';
const b = await P.connect({ browserURL: (process.env.CDP || 'http://127.0.0.1:9222'), defaultViewport: null, protocolTimeout: 300000 });
const pg = await b.newPage();
const cdp = await pg.createCDPSession();
await cdp.send('Network.enable');

pg.on('pageerror', (e) => problems.push(`[${phase}] page error: ${String(e.message).slice(0, 130)}`));

const offline = (on) => cdp.send('Network.emulateNetworkConditions', {
  offline: on, latency: 0, downloadThroughput: on ? 0 : -1, uploadThroughput: on ? 0 : -1,
});

try {
  phase = 'sign-in';
  await pg.goto(BASE + '/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await pg.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch (e) {} });
  await pg.goto(BASE + '/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await wait(3500);
  await pg.evaluate(({ email, pw }) => {
    const ins = [...document.querySelectorAll('input')];
    const e = ins.find((i) => /email/i.test(i.type + i.placeholder + i.name));
    const p = ins.find((i) => i.type === 'password');
    const set = (el, v) => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    if (e) set(e, email); if (p) set(p, pw);
  }, { email: EMAIL, pw: PW });
  await wait(400);
  await pg.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((x) => /^\s*sign\s*in\s*$/i.test(x.textContent || ''));
    if (btn) btn.click();
  });
  await wait(9000);

  phase = 'online';
  await setWidth(pg, 390, 844);
  await pg.goto(BASE + '/athlete', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await wait(12000);
  await pg.evaluate(() => {
    const x = [...document.querySelectorAll('button,a')].find((e) => /maybe later|dismiss/i.test(e.textContent || ''));
    if (x) x.click();
  });
  await wait(1000);
  const onlineText = await pg.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' ').trim());
  if (!/block|program/i.test(onlineText)) { console.log('FAILED: portal did not load online; nothing to compare against'); process.exit(1); }
  const swReady = await pg.evaluate(() => !!(navigator.serviceWorker && navigator.serviceWorker.controller));
  console.log(`online : ${onlineText.length} chars, service worker ${swReady ? 'controlling' : 'NOT controlling'}`);
  if (!swReady) {
    // NOT A DEFECT, AND NOT TESTABLE HERE. A service worker needs a secure
    // context, and neither local option gives one that also registers:
    //   127.0.0.1  - secure, but App.jsx deliberately skips the registrar on
    //                localhost so a stale cache cannot haunt development.
    //   LAN IP     - the app would register, but plain HTTP is not a secure
    //                context and the browser refuses outright. Measured: zero
    //                registrations across three loads on both.
    // So the offline path exists only where the app is served over HTTPS.
    // Point this at production to check it for real - it only navigates and
    // reads, it never writes:
    //     BASE=https://expo-app.co.il node scripts/verify-athlete-offline.mjs
    console.log('');
    console.log('SKIP  no service worker on this origin, so there is nothing to test offline.');
    console.log('      A SW needs a secure context. 127.0.0.1 is secure but the app skips');
    console.log('      registration there on purpose; the LAN IP registers but is plain HTTP,');
    console.log('      which the browser refuses. Run it against HTTPS to check this for real:');
    console.log('        BASE=https://expo-app.co.il node scripts/verify-athlete-offline.mjs');
    await offline(false).catch(() => {});
    await pg.close().catch(() => {});
    b.disconnect();
    process.exit(0);
  }

  phase = 'offline-reload';
  await offline(true);
  await wait(1500);
  await pg.reload({ waitUntil: 'domcontentloaded', timeout: 60000 }).catch((e) => {
    problems.push(`[offline-reload] the page would not load at all: ${String(e.message).slice(0, 70)}`);
  });
  // A long settle on purpose: an offline load has to wait out the failed
  // network attempts before the cached shell finishes rendering.
  await wait(12000);
  const off = await pg.evaluate(() => {
    const t = (document.body.innerText || '').replace(/\s+/g, ' ').trim();
    return {
      len: t.length,
      head: t.slice(0, 110),
      programme: /block|program|warm-?up/i.test(t),
      saysOffline: /offline|no connection|לא מקוון|אין חיבור|reconnect/i.test(t),
      chromeError: /ERR_INTERNET_DISCONNECTED|No internet|site can'?t be reached/i.test(t),
    };
  });
  console.log(`offline: ${off.len} chars | programme ${off.programme ? 'visible' : 'GONE'} | says offline: ${off.saysOffline}`);
  console.log(`         "${off.head.slice(0, 88)}"`);
  if (off.chromeError) problems.push('[offline] the browser error page - the service worker served nothing');
  else if (!off.programme) problems.push(`[offline] the athlete's programme is gone offline (${off.len} chars)`);
  if (!off.saysOffline) problems.push('[offline] nothing tells the athlete they are offline - stale data reads as live');

  phase = 'back-online';
  await offline(false);
  await wait(2000);
  await pg.reload({ waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  await wait(12000);
  const back = await pg.evaluate(() => /block|program/i.test(document.body.innerText || ''));
  if (!back) problems.push('[back-online] the portal did not recover when the network returned');
  console.log(`recover: ${back ? 'portal is back' : 'STILL BROKEN'}`);
} catch (e) {
  problems.push(`[${phase}] threw: ${String(e.message || e).slice(0, 130)}`);
} finally {
  await offline(false).catch(() => {});
  await pg.close().catch(() => {});
  b.disconnect();
}

console.log('');
const uniq = [...new Set(problems)];
for (const p of uniq) console.log('FAIL  ' + p);
console.log(uniq.length ? `\n${uniq.length} problem(s) offline` : '\n0 - the portal survives a dead network');
process.exit(uniq.length ? 1 : 0);
