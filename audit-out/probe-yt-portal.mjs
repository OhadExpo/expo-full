// What does opening ONE exercise in the athlete portal cost, from Yuval's seat?
// Ohad, 2026-09-07: "yuvi's videos take a while to load". Yuval's block is
// YouTube links end to end, so the number that matters is what YouTube pulls
// the moment an exercise opens - before he has tapped play.
//
//   BASE=http://127.0.0.1:4173 node audit-out/probe-yt-portal.mjs
import fs from 'node:fs';
import P from 'puppeteer-core';
import { setWidth } from '../scripts/lib/viewport.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:4173';
const EMAIL = process.env.EMAIL || 'yuvalberkovitch@gmail.com';
const TAG = process.env.TAG || 'before';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const YT = /youtube\.com|ytimg\.com|googlevideo\.com|doubleclick\.net|google\.com\/js|gstatic\.com|youtube-nocookie/i;

const b = await P.connect({ browserURL: (process.env.CDP || 'http://127.0.0.1:9222'), defaultViewport: null, protocolTimeout: 300000 });
const pg = await b.newPage();
// Yuval is dual-role; land straight on the athlete portal.
await pg.evaluateOnNewDocument(() => { try { localStorage.setItem('expo-portal-choice', 'client'); } catch (e) { /* ignore */ } });
try {
  await pg.goto(BASE + '/login', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await pg.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch (e) { /* ignore */ } });
  await pg.goto(BASE + '/login', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await wait(3500);
  await pg.evaluate((email) => {
    const ins = [...document.querySelectorAll('input')];
    const e = ins.find((i) => /email/i.test(i.type + i.placeholder + i.name));
    const p = ins.find((i) => i.type === 'password');
    const set = (el, v) => { Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
    if (e) set(e, email); if (p) set(p, '1234');
  }, EMAIL);
  await wait(400);
  await pg.evaluate(() => { const x = [...document.querySelectorAll('button')].find((y) => /^\s*(sign\s*in|כניסה)\s*$/i.test(y.textContent || '')); if (x) x.click(); });
  await wait(9000);
  await setWidth(pg, 390, 844);
  await pg.goto(BASE + '/athlete', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await wait(12000);
  // A role picker may still be up if the choice key was not honoured.
  await pg.evaluate(() => { const x = [...document.querySelectorAll('button')].find((y) => /athlete|client|portal/i.test(y.textContent || '') && !/coach/i.test(y.textContent || '')); if (x && /choose|which|who/i.test(document.body.innerText)) x.click(); }).catch(() => {});
  await wait(2000);
  // The install prompt sits over the exercise list on a fresh profile and ate
  // the first run's click: 0 requests, no iframe, and a screenshot of a modal.
  for (let i = 0; i < 3; i++) {
    const dismissed = await pg.evaluate(() => { const x = [...document.querySelectorAll('button,a')].find((e) => /maybe later|dismiss|לא עכשיו|אולי אחר כך/i.test(e.textContent || '')); if (x) { x.click(); return true; } return false; }).catch(() => false);
    if (!dismissed) break;
    await wait(1200);
  }

  const cdp = await pg.target().createCDPSession();
  await cdp.send('Network.enable');
  const reqs = new Map();
  cdp.on('Network.requestWillBeSent', (e) => { if (YT.test(e.request.url)) reqs.set(e.requestId, { url: e.request.url, t0: e.timestamp, bytes: 0 }); });
  cdp.on('Network.loadingFinished', (e) => { const r = reqs.get(e.requestId); if (r) { r.bytes = e.encodedDataLength; r.t1 = e.timestamp; } });

  // The demo video renders inside a STARTED day (the warm-up step, then each
  // exercise step) - the program list itself shows no player. Press the first
  // START, which opens step 1 with its video. On the test fixture (Diego) this
  // writes nothing but his own presence timestamp, which is what the fixture
  // is for.
  const opened = await pg.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => /^\s*(start|התחלה|התחל)\s*$/i.test(b.textContent || ''));
    if (!btn) return null;
    btn.click();
    return (btn.textContent || '').trim();
  });
  await wait(2500);
  // Some blocks start on a warm-up step with no demo; walk forward until a
  // player (iframe or facade) is on screen, at most four steps.
  for (let i = 0; i < 4; i++) {
    const has = await pg.evaluate(() => !!document.querySelector('iframe[src*="youtube"], img[src*="ytimg.com"], video'));
    if (has) break;
    await pg.evaluate(() => { const n = [...document.querySelectorAll('button')].find((b) => /next|הבא|→|←/i.test(b.textContent || '') && !/back|חזרה/i.test(b.textContent || '')); if (n) n.click(); });
    await wait(2000);
  }
  const t0 = Date.now();
  await wait(10000);
  const list = [...reqs.values()];
  const bytes = list.reduce((a, r) => a + r.bytes, 0);
  const iframe = await pg.evaluate(() => { const f = document.querySelector('iframe[src*="youtube"]'); const img = document.querySelector('img[src*="ytimg.com"]'); return { iframe: !!f, facade: !!img, chars: (document.body.innerText || '').length }; });
  const done = list.filter((r) => r.t1).map((r) => r.t1);
  const started = list.map((r) => r.t0);
  const span = done.length ? Math.round((Math.max(...done) - Math.min(...started)) * 1000) : null;
  const out = { tag: TAG, base: BASE, opened, requests: list.length, kb: Math.round(bytes / 1024), spanMs: span, ...iframe, at: new Date().toISOString() };
  console.log(JSON.stringify(out));
  for (const r of list.sort((a, c) => c.bytes - a.bytes).slice(0, 8)) console.log('   ', String(Math.round(r.bytes / 1024)).padStart(5), 'KB', r.url.replace(/^https?:\/\//, '').slice(0, 100));
  fs.mkdirSync('audit-out/perf', { recursive: true });
  fs.writeFileSync(`audit-out/perf/yt-portal-${TAG}.json`, JSON.stringify({ ...out, top: list.sort((a, c) => c.bytes - a.bytes).slice(0, 25) }, null, 2));
  await pg.screenshot({ path: `audit-out/perf/yt-portal-${TAG}.png` });
  void t0;
} finally {
  await pg.close().catch(() => {});
  b.disconnect();
}
