// 390px, the width he actually holds: the billing card (month table + a client
// expanded) and the club zone's tabs. Reports anything wider than the screen.
//   node audit-out/probe-390-bhbc-billing.mjs
import P from 'puppeteer-core';
import * as A from '../scripts/lib/authed-page.mjs';
const BASE = process.env.BASE || 'http://127.0.0.1:4173';
const W = Number(process.env.W || 390);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await P.connect({ browserURL: process.env.CDP || 'http://127.0.0.1:9223', defaultViewport: null, protocolTimeout: 300000 });
const pg = await b.newPage();
await pg.emulate({ viewport: { width: W, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 3 }, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
await pg.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
// Clear FIRST: the helper keeps whatever session the profile holds, and a
// leftover physio session renders the club zone on every coach route - a run
// that skipped this measured the zone twice and called one of them /billing.
await pg.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch (e) {} });
await pg.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
await wait(2500);
await A.signIn(pg, BASE);
await wait(3000);
await pg.evaluate(() => { const b2 = [...document.querySelectorAll('button,a')].find((x) => /coach|מאמן/i.test((x.textContent || '').trim())); if (b2) b2.click(); });
await wait(3000);
await pg.evaluate(() => { try { localStorage.setItem('expo-lang', 'he'); localStorage.setItem('expo-install-snooze-until', String(Date.now() + 86400000)); } catch (e) {} });

const overflow = () => pg.evaluate(() => {
  const w = document.documentElement.clientWidth;
  const bad = [];
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    // A deliberately scrollable box is fine; its CHILD sticking out of the
    // viewport is not.
    const over = Math.round(Math.max(r.right - w, -r.left));
    if (over > 2) {
      const scroller = el.closest('[style*="overflow"],[class*="scroll"]');
      if (scroller && scroller !== el && getComputedStyle(scroller).overflowX !== 'visible') continue;
      bad.push({ tag: el.tagName, cls: String(el.className).slice(0, 24), over, text: (el.innerText || '').replace(/\s+/g, ' ').slice(0, 40) });
    }
  }
  return { w, scrollW: document.documentElement.scrollWidth, bad: bad.slice(0, 8) };
});

for (const [name, route, after] of [
  ['billing', '/coach/billing', async () => {
    await pg.evaluate(() => { const r = [...document.querySelectorAll('tr')].find((t) => /יוני 2026|Jun 2026/.test(t.textContent || '')); if (r) r.click(); });
    await wait(1200);
    await pg.evaluate(() => { const r = [...document.querySelectorAll('tr')].find((t) => /עמית יהודאי/.test(t.textContent || '')); if (r) r.click(); });
    await wait(1200);
  }],
  ['bhbc', '/coach/bhbc', async () => { await wait(2000); }],
]) {
  await pg.goto(BASE + route, { waitUntil: 'domcontentloaded' });
  await wait(9000);
  if (after) await after();
  const o = await overflow();
  console.log(`${name.padEnd(8)} viewport=${o.w} scrollWidth=${o.scrollW} ${o.scrollW > o.w + 2 ? 'PAGE SCROLLS SIDEWAYS' : 'ok'} · elements past the edge: ${o.bad.length}`);
  for (const x of o.bad) console.log(`   +${x.over}px ${x.tag}.${x.cls} "${x.text}"`);
  await pg.screenshot({ path: `audit-out/m390-${name}.png` });
}
await pg.close(); b.disconnect();
