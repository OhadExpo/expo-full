// WHY IS IT SLOW - measured from the real seat, not guessed.
//
// Ohad, 2026-09-07: "the app and the desktop expo and bhbc and all platforms
// have been very laggy and slow lately ... maybe its just my wifi".
//
// So the probe separates the two: BYTES and REQUEST COUNT are what a slow
// link has to carry (network-independent facts about the app); LONG TASKS
// and time-to-content on localhost are what the app itself costs with no
// network in the way. Both are recorded cold (caches cleared) and warm
// (second visit, service worker and HTTP cache in place).
//
//   node scripts/perf-probe.mjs                      # branch on :4173, default jobs
//   BASE=https://expo-app.co.il node scripts/perf-probe.mjs
//   JOBS="owner:/coach,pt:/coach/bhbc" node scripts/perf-probe.mjs
//
// Writes audit-out/perf/<tag>.json and prints one line per route per state.
import fs from 'node:fs';
import path from 'node:path';
import P from 'puppeteer-core';
import { setWidth } from './lib/viewport.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:4173';
const TAG = process.env.TAG || (BASE.includes('expo-app.co.il') ? 'prod' : 'branch');
const W = Number(process.env.W || 1400);
const OUT = 'audit-out/perf';
fs.mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const SEATS = {
  owner: { email: 'ohadyproductions@gmail.com', pw: '1234' },
  staff: { email: process.env.STAFF || 'yuval@expo.co.il', pw: '1234' },
  pt: { email: 'tomerlich11@gmail.com', pw: '1234' },
  athlete: { email: process.env.ATHLETE || 'amit@enoshy.com', pw: '1234' },
};
const JOBS = (process.env.JOBS || 'owner:/coach,owner:/coach/athletes,owner:/coach/bhbc,pt:/coach/bhbc,athlete:/athlete')
  .split(',').map((x) => { const [seat, route] = x.split(':'); return { seat, route }; });

const b = await P.connect({ browserURL: (process.env.CDP || 'http://127.0.0.1:9222'), defaultViewport: null, protocolTimeout: 300000 });

const classify = (u, type) => {
  if (/supabase\.co\/rest\//.test(u)) return 'rest';
  if (/supabase\.co\/storage\//.test(u)) return 'storage';
  if (/supabase\.co\/realtime\//.test(u)) return 'realtime';
  if (/supabase\.co\/auth\//.test(u)) return 'auth';
  if (/\.(mp4|webm|mov|m4v)(\?|$)/i.test(u) || type === 'Media') return 'media';
  if (type === 'Script') return 'script';
  if (type === 'Stylesheet') return 'css';
  if (type === 'Font') return 'font';
  if (type === 'Image') return 'image';
  if (type === 'Document') return 'html';
  return 'other';
};

async function signIn(pg, who) {
  await pg.goto(BASE + '/login', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await pg.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch (e) { /* ignore */ } });
  await pg.goto(BASE + '/login', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await wait(3500);
  await pg.evaluate(({ email, pw }) => {
    const ins = [...document.querySelectorAll('input')];
    const e = ins.find((i) => /email/i.test(i.type + i.placeholder + i.name));
    const p = ins.find((i) => i.type === 'password');
    const set = (el, v) => { Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
    if (e) set(e, email); if (p) set(p, pw);
  }, who);
  await wait(400);
  await pg.evaluate(() => { const x = [...document.querySelectorAll('button')].find((y) => /^\s*sign\s*in\s*$/i.test(y.textContent || '')); if (x) x.click(); });
  await wait(8000);
}

async function measure(pg, route, state) {
  const cdp = await pg.target().createCDPSession();
  await cdp.send('Network.enable');
  await cdp.send('Performance.enable');
  if (state === 'cold') {
    await cdp.send('Network.clearBrowserCache');
    // A cold visit is one where the service worker has nothing yet.
    await pg.evaluate(async () => { try { const rs = await navigator.serviceWorker.getRegistrations(); for (const r of rs) await r.unregister(); const ks = await caches.keys(); for (const k of ks) await caches.delete(k); } catch (e) { /* ignore */ } });
  }
  const reqs = new Map();
  cdp.on('Network.requestWillBeSent', (e) => { reqs.set(e.requestId, { url: e.request.url, type: e.type, t0: e.timestamp, bytes: 0, fromSW: false, fromCache: false }); });
  cdp.on('Network.responseReceived', (e) => { const r = reqs.get(e.requestId); if (r) { r.fromSW = !!e.response.fromServiceWorker; r.fromCache = !!e.response.fromDiskCache || !!e.response.fromPrefetchCache; r.status = e.response.status; r.mime = e.response.mimeType; } });
  cdp.on('Network.loadingFinished', (e) => { const r = reqs.get(e.requestId); if (r) { r.bytes = e.encodedDataLength; r.t1 = e.timestamp; } });

  await pg.evaluateOnNewDocument(() => {
    window.__lt = []; window.__lcp = 0;
    try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push(Math.round(e.duration)); }).observe({ type: 'longtask', buffered: true }); } catch (e) { /* ignore */ }
    try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lcp = Math.round(e.startTime); }).observe({ type: 'largest-contentful-paint', buffered: true }); } catch (e) { /* ignore */ }
  });
  const t0 = Date.now();
  await pg.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 120000 });
  // Time to CONTENT: the body text stops growing for 1.5s (a spinner is not content).
  // The first visit after a rebuild can be measured while the service worker
  // swaps bundles and the shell reloads (a blank page of 15 chars read as
  // "stable"). Never call a page stable until it has real content; give it
  // 40s to get there.
  let last = -1, stableSince = 0, ttc = null;
  for (let i = 0; i < 80; i++) {
    await wait(500);
    const n = await pg.evaluate(() => (document.body.innerText || '').length).catch(() => -1);
    if (n !== last) { last = n; stableSince = Date.now(); if (n > 200 && ttc == null) ttc = Date.now() - t0; }
    else if (n > 200 && Date.now() - stableSince > 1500 && i > 6) break;
  }
  await wait(1500);
  const nav = await pg.evaluate(() => {
    const n = performance.getEntriesByType('navigation')[0] || {};
    const m = performance.memory || {};
    return { ttfb: Math.round(n.responseStart || 0), dcl: Math.round(n.domContentLoadedEventEnd || 0), load: Math.round(n.loadEventEnd || 0), lcp: window.__lcp, longTasks: window.__lt.length, longTaskMs: window.__lt.reduce((a, x) => a + x, 0), worst: Math.max(0, ...window.__lt), heapMB: m.usedJSHeapSize ? +(m.usedJSHeapSize / 1048576).toFixed(1) : null, chars: (document.body.innerText || '').length };
  });
  const list = [...reqs.values()];
  const by = {};
  for (const r of list) { const k = classify(r.url, r.type); by[k] = by[k] || { n: 0, kb: 0, sw: 0 }; by[k].n++; by[k].kb += r.bytes / 1024; if (r.fromSW || r.fromCache) by[k].sw++; }
  for (const k of Object.keys(by)) by[k].kb = Math.round(by[k].kb);
  const total = { n: list.length, kb: Math.round(list.reduce((a, r) => a + r.bytes, 0) / 1024), cached: list.filter((r) => r.fromSW || r.fromCache).length };
  const heaviest = list.sort((a, c) => c.bytes - a.bytes).slice(0, 12).map((r) => ({ kb: Math.round(r.bytes / 1024), ms: r.t1 && r.t0 ? Math.round((r.t1 - r.t0) * 1000) : null, sw: r.fromSW, url: r.url.replace(/^https?:\/\/[^/]+/, '').slice(0, 110) }));
  const rest = list.filter((r) => classify(r.url, r.type) === 'rest').map((r) => ({ kb: Math.round(r.bytes / 1024), ms: r.t1 && r.t0 ? Math.round((r.t1 - r.t0) * 1000) : null, url: r.url.replace(/^.*\/rest\/v1\//, '').slice(0, 120) }));
  await cdp.detach().catch(() => {});
  return { route, state, ttc, ...nav, total, by, heaviest, rest };
}

const results = [];
for (const job of JOBS) {
  const pg = await b.newPage();
  try {
    await signIn(pg, SEATS[job.seat]);
    await setWidth(pg, W, 1000);
    for (const state of ['cold', 'warm']) {
      const r = await measure(pg, job.route, state);
      results.push({ seat: job.seat, ...r });
      console.log(`${TAG.padEnd(6)} ${job.seat.padEnd(7)} ${job.route.padEnd(16)} ${state.padEnd(4)}  ttc ${String(r.ttc).padStart(5)}ms  lcp ${String(r.lcp).padStart(5)}  reqs ${String(r.total.n).padStart(3)} (${r.total.cached} cached)  ${String(r.total.kb).padStart(5)} KB  longtasks ${r.longTasks} = ${r.longTaskMs}ms (worst ${r.worst})  heap ${r.heapMB}MB`);
    }
  } catch (e) {
    console.log(`${job.seat} ${job.route}: FAILED ${String(e.message).slice(0, 120)}`);
  } finally {
    await pg.close().catch(() => {});
  }
}
const file = path.join(OUT, `${TAG}.json`);
fs.writeFileSync(file, JSON.stringify({ base: BASE, at: new Date().toISOString(), results }, null, 2));
console.log(`-> ${file}`);
b.disconnect();
