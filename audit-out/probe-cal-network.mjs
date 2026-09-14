// What does the Calendar web app itself ask for? Whatever it is, a background
// tab on the same origin can ask for it too - that is the permissionless feed.
import P from 'puppeteer-core';
const b = await P.connect({ browserURL: process.env.CDP || 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 300000 });
const cdpB = await b.target().createCDPSession();
await cdpB.send('Target.createTarget', { url: 'about:blank#expo-net', background: true });
const t = await b.waitForTarget((x) => x.type() === 'page' && x.url().endsWith('#expo-net'), { timeout: 20000 });
const pg = await t.page();
await pg.setViewport({ width: 1500, height: 1000 });
const seen = [];
pg.on('request', (r) => { const u = r.url(); if (/calendar\.google\.com/.test(u) && /event|batchexecute|viewer|data/i.test(u) && !/\.(js|css|png|woff2?|ico)(\?|$)/.test(u)) seen.push({ m: r.method(), u: u.slice(0, 220) }); });
await pg.goto('https://calendar.google.com/calendar/u/0/r/week/2026/9/7', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 12000));
const uniq = [...new Map(seen.map((x) => [x.u.split('?')[0] + x.m, x])).values()];
for (const x of uniq.slice(0, 14)) console.log(x.m, x.u);
console.log('---total', seen.length);
await pg.close(); b.disconnect();
