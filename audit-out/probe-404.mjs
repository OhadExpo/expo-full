// Which request 404s on a route? The console sweep says "one 404 per route" and no URL.
import P from 'puppeteer-core';
const b = await P.connect({ browserURL: process.env.CDP || 'http://127.0.0.1:9222', defaultViewport: null });
const pg = await b.newPage();
const bad = [];
pg.on('response', (r) => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url()); });
await pg.goto(process.argv[2] || 'http://127.0.0.1:4173/login', { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
await new Promise((r) => setTimeout(r, 4000));
console.log(bad.length ? bad.join('\n') : 'no 4xx/5xx responses');
await pg.close(); b.disconnect();
