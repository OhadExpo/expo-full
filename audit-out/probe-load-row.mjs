// The load board's rows at phone width: do the two controls share one column
// edge, and how tall is each row?
import P from 'puppeteer-core';
const BASE = process.env.BASE || 'http://127.0.0.1:4173';
const W = Number(process.env.W || 390);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await P.connect({ browserURL: process.env.CDP || 'http://127.0.0.1:9223', defaultViewport: null, protocolTimeout: 300000 });
const pg = await b.newPage();
const cdp = await pg.createCDPSession();
await cdp.send('Network.setBypassServiceWorker', { bypass: true }).catch(() => {});
await cdp.send('Network.setCacheDisabled', { cacheDisabled: true }).catch(() => {});
await pg.setViewport({ width: W, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await pg.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
await pg.evaluate(() => { try { localStorage.clear(); localStorage.setItem('expo-lang', 'he'); localStorage.setItem('bhbc-lang', 'he'); localStorage.setItem('expo-install-snooze-until', String(Date.now() + 864e5)); } catch (e) {} });
await pg.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
await wait(3500);
await pg.evaluate(() => {
  const ins = [...document.querySelectorAll('input')];
  const set = (el, v) => { Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
  const e = ins.find((i) => /email/i.test(i.type + i.placeholder + i.name)); const p = ins.find((i) => i.type === 'password');
  if (e) set(e, 'ohadyproductions@gmail.com'); if (p) set(p, '1234');
});
await wait(400);
await pg.evaluate(() => { const x = [...document.querySelectorAll('button')].find((y) => /^\s*(sign\s*in|כניסה)\s*$/i.test(y.textContent || '')); if (x) x.click(); });
await wait(10000);
await pg.evaluate(() => { const b2 = [...document.querySelectorAll('button')].find((x) => /coach|מאמן/i.test((x.textContent || '').trim())); if (b2) b2.click(); });
await wait(4000);
await pg.goto(BASE + '/coach/bhbc', { waitUntil: 'domcontentloaded' });
await wait(12000);
await pg.evaluate(() => { const b2 = [...document.querySelectorAll('button')].find((x) => /^\s*עב\s*$/.test((x.textContent || '').trim())); if (b2) b2.click(); });
await wait(3000);
const out = await pg.evaluate(() => {
  const rows = [...document.querySelectorAll('.bhbc-load-row')];
  return rows.map((r) => {
    const rect = r.getBoundingClientRect();
    const med = r.querySelector('[data-lbl="actions"] button');
    const av = r.querySelector('[data-lbl="Availability"] button, [data-lbl="Availability"] span');
    const load = r.querySelector('[data-lbl="last lift"], [data-lbl="ACWR"]');
    const name = (r.querySelector('div [style*="font-weight: 700"], div') || {}).textContent || '';
    return {
      name: name.replace(/\s+/g, ' ').trim().slice(0, 18),
      h: Math.round(rect.height),
      medX: med ? Math.round(med.getBoundingClientRect().left) : null,
      medRight: med ? Math.round(med.getBoundingClientRect().right) : null,
      avX: av ? Math.round(av.getBoundingClientRect().left) : null,
      avW: av ? Math.round(av.getBoundingClientRect().width) : null,
      loadRight: load ? Math.round(load.getBoundingClientRect().right) : null,
      over: Math.round(rect.right) > innerWidth + 1,
    };
  });
});
const u = (k) => [...new Set(out.map((r) => r[k]))];
console.log(JSON.stringify(out, null, 1));
console.log('rows', out.length, '| med left values:', u('medX'), '| avail left:', u('avX'), 'w:', u('avW'), '| load right:', u('loadRight'), '| heights:', u('h'));
await pg.close(); b.disconnect();
