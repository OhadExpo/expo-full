// Re-issue the app's OWN request with my date range (string-swap the two day
// numbers in its body - every other field stays exactly as Google built it),
// then find, by value, where the start and end of a KNOWN event sit.
// Known: "Scrimmage vs. Maccabi @hadar-yossef", 2026-09-03 17:00-19:00 Israel.
import P from 'puppeteer-core';
const CAL = process.env.CAL || 'c_96a2ea9f1242d53540e3ae9d3c10d78dc274a394cc03d0c012e12019573433b4@group.calendar.google.com';
const b = await P.connect({ browserURL: process.env.CDP || 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 300000 });
const cdpB = await b.target().createCDPSession();
await cdpB.send('Target.createTarget', { url: 'about:blank#expo-fl', background: true });
const t = await b.waitForTarget((x) => x.type() === 'page' && x.url().endsWith('#expo-fl'), { timeout: 20000 });
const pg = await t.page();
await pg.setViewport({ width: 1400, height: 900 });
let body = null;
pg.on('request', (r) => { if (/sync\.prefetcheventrange/.test(r.url()) && !body) body = r.postData() || null; });
await pg.goto('https://calendar.google.com/calendar/u/0/r/week/2026/9/7', { waitUntil: 'domcontentloaded', timeout: 60000 });
for (let i = 0; i < 50 && !body; i++) await new Promise((r) => setTimeout(r, 400));
console.log('captured its own body:', !!body, body ? body.length : 0);
if (!body) { await pg.close(); b.disconnect(); process.exit(1); }
const out = await pg.evaluate(async (raw, cal) => {
  const dayNum = (y, m, d) => Math.floor(Date.UTC(y, m - 1, d) / 86400000);
  const from = dayNum(2026, 9, 1), to = dayNum(2026, 10, 1);
  // The body carries [null,null,<from>,<to>] - swap just those two numbers.
  const swapped = decodeURIComponent(raw.split('f.req=')[1].split('&')[0])
    .replace(/\[null,null,\d+,\d+\]/, `[null,null,${from},${to}]`);
  const rest = raw.slice(raw.indexOf('&', raw.indexOf('f.req=')));
  const r = await fetch('/calendar/u/0/sync.prefetcheventrange', {
    method: 'POST', credentials: 'include',
    headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8', 'x-is-xhr-request': '1' },
    body: 'f.req=' + encodeURIComponent(swapped) + rest,
  });
  const txt = await r.text();
  if (!r.ok) return { status: r.status, head: txt.slice(0, 160) };
  const j = JSON.parse(txt.replace(/^\)\]\}'\s*/, ''));
  const blocks = [];
  (function walk(x, d) { if (!Array.isArray(x) || d > 14) return; if (x[0] === cal && Array.isArray(x[1])) blocks.push(x[1]); for (const y of x) walk(y, d + 1); })(j, 0);
  const evs = blocks.flat().filter((e) => Array.isArray(e) && typeof e[0] === 'string');
  const target = evs.find((e) => typeof e[5] === 'string' && /Scrimmage vs\. Maccabi/i.test(e[5]));
  // 2026-09-03 17:00 Israel = 14:00Z. Hunt for that instant in any encoding.
  const startMs = Date.UTC(2026, 8, 3, 14, 0), endMs = Date.UTC(2026, 8, 3, 16, 0);
  const hits = [];
  (function hunt(x, path) {
    if (Array.isArray(x)) { x.forEach((v, i) => hunt(v, path + '[' + i + ']')); return; }
    if (typeof x === 'number') {
      if (x === startMs || x === endMs) hits.push({ path, v: x, what: x === startMs ? 'START ms' : 'END ms' });
      if (x === startMs / 1000 || x === endMs / 1000) hits.push({ path, v: x, what: 'sec' });
      if (x === Math.floor(startMs / 60000) || x === Math.floor(endMs / 60000)) hits.push({ path, v: x, what: 'min' });
    }
  })(target || [], '');
  return { status: r.status, events: evs.length, titles: evs.map((e) => e[5]).filter(Boolean).slice(0, 12), found: !!target, hits, rawLen: (target || []).length };
}, body, CAL);
console.log(JSON.stringify(out, null, 1).slice(0, 2400));
await pg.close(); b.disconnect();
