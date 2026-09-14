// What does the embed agenda actually carry per row - is the END time there?
import P from 'puppeteer-core';
const ID = process.env.CAL || 'c_96a2ea9f1242d53540e3ae9d3c10d78dc274a394cc03d0c012e12019573433b4@group.calendar.google.com';
const b = await P.connect({ browserURL: process.env.CDP || 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 300000 });
const cdpB = await b.target().createCDPSession();
await cdpB.send('Target.createTarget', { url: 'about:blank#expo-caldom', background: true });
const t = await b.waitForTarget((x) => x.type() === 'page' && x.url().endsWith('#expo-caldom'), { timeout: 20000 });
const pg = await t.page();
await pg.setViewport({ width: 1400, height: 1200 });
await pg.goto(`https://calendar.google.com/calendar/htmlembed?src=${encodeURIComponent(ID)}&ctz=Asia%2FJerusalem&mode=AGENDA&dates=20260901%2F20261001`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 6000));
const out = await pg.evaluate(() => {
  const rows = [...document.querySelectorAll('tr, .rb-n, [class]')].slice(0, 0);
  const byClass = {};
  for (const el of document.querySelectorAll('*')) {
    const c = (el.className && String(el.className)) || '';
    if (!c || c.length > 40) continue;
    byClass[c] = (byClass[c] || 0) + 1;
  }
  const titled = [...document.querySelectorAll('[title]')].slice(0, 8).map((e) => ({ tag: e.tagName, cls: String(e.className).slice(0, 30), title: e.getAttribute('title').slice(0, 90), text: (e.innerText || '').replace(/\s+/g, ' ').slice(0, 60) }));
  const links = [...document.querySelectorAll('a[href*="eid="]')].slice(0, 5).map((a) => ({ href: a.href.slice(0, 120), text: (a.innerText || '').replace(/\s+/g, ' ').slice(0, 60) }));
  return { classes: Object.entries(byClass).sort((a, b2) => b2[1] - a[1]).slice(0, 14), titled, links, range: (document.body.innerText || '').split('\n').slice(0, 3) };
});
console.log(JSON.stringify(out, null, 1).slice(0, 2600));
await pg.close(); b.disconnect();
