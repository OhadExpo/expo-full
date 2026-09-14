// Replay the Calendar app's own event-range call from a background tab, for a
// range I choose, and find where the start/end times sit in each event array.
import P from 'puppeteer-core';
const CAL = process.env.CAL || 'c_96a2ea9f1242d53540e3ae9d3c10d78dc274a394cc03d0c012e12019573433b4@group.calendar.google.com';
const b = await P.connect({ browserURL: process.env.CDP || 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 300000 });
const cdpB = await b.target().createCDPSession();
await cdpB.send('Target.createTarget', { url: 'about:blank#expo-rp', background: true });
const t = await b.waitForTarget((x) => x.type() === 'page' && x.url().endsWith('#expo-rp'), { timeout: 20000 });
const pg = await t.page();
await pg.setViewport({ width: 1400, height: 900 });
let secid = null;
pg.on('request', (r) => { const m = r.url().match(/[?&]secid=([^&]+)/); if (m && !secid) secid = m[1]; });
await pg.goto('https://calendar.google.com/calendar/u/0/r/week/2026/9/7', { waitUntil: 'domcontentloaded', timeout: 60000 });
for (let i = 0; i < 40 && !secid; i++) await new Promise((r) => setTimeout(r, 500));
console.log('secid captured:', !!secid);
const out = await pg.evaluate(async (cal, secid) => {
  const d0 = Math.floor(Date.UTC(2026, 8, 1) / 86400000);   // 1 Sep 2026
  const d1 = Math.floor(Date.UTC(2026, 9, 1) / 86400000);   // 1 Oct 2026
  const freq = [[[null, cal], [null, null, d0, d1], [null, 3, null, null, null, null, null, null, null, 'WEB', null, 1], [null, 1, 1, 1, 1, null, 0, 0]]];
  const body = 'f.req=' + encodeURIComponent(JSON.stringify(freq)) + '&cwuik=10&hl=en&secid=' + secid;
  const r = await fetch('/calendar/u/0/sync.prefetcheventrange', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8', 'x-is-xhr-request': '1' }, body });
  const txt = await r.text();
  if (!r.ok) return { status: r.status, head: txt.slice(0, 200) };
  let j; try { j = JSON.parse(txt.replace(/^\)\]\}'\s*/, '')); } catch (e) { return { status: r.status, parse: String(e), head: txt.slice(0, 200) }; }
  // Walk for the calendar block: ["<cal id>", [ [event], [event], … ] ]
  const found = [];
  (function walk(x, depth) {
    if (!Array.isArray(x) || depth > 12) return;
    if (typeof x[0] === 'string' && x[0] === cal && Array.isArray(x[1])) found.push(x[1]);
    for (const y of x) walk(y, depth + 1);
  })(j, 0);
  const evs = found.flat().filter((e) => Array.isArray(e) && typeof e[0] === 'string');
  return { status: r.status, len: txt.length, blocks: found.length, events: evs.length, sample: evs.slice(0, 3).map((e) => e.map((v) => (Array.isArray(v) ? '[' + v.length + ']' : v)).slice(0, 40)) };
}, CAL, secid);
console.log(JSON.stringify(out, null, 1).slice(0, 3000));
await pg.close(); b.disconnect();
