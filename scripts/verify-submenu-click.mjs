// THE TOP-MENU SUBMENUS WORK. #216 (26.9): every top-menu submenu item, clicked the way a person clicks —
// pointerdown, mousedown, pointerup, mouseup, click, dispatched in the page
// (CDP mouse input does not reach pages in the attached Chrome). Must navigate.
import P from 'puppeteer-core';
import { signIn } from './lib/authed-page.mjs';
import { setWidth } from './lib/viewport.mjs';
const BASE = process.env.BASE || 'http://127.0.0.1:5199';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const press = (sel, idx, label) => ({ sel, idx, label });
const b = await P.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 120000 });
let tried = 0, bad = 0;
const perWidth = {};   // a width that measured nothing is a FAIL, not a skip
for (const w of [1440, 390]) {
  const ctx = await b.createBrowserContext(); const pg = await ctx.newPage();
  try {
    await setWidth(pg, w, 900);
    await pg.evaluateOnNewDocument(() => { try { localStorage.setItem('expo-lang', 'en'); localStorage.setItem('expo-install-snooze-until', String(Date.now() + 86400000)); } catch (e) {} });
    perWidth[w] = 0;
    const who = await signIn(pg, BASE); if (!who || !who.signedIn) { console.log(`FAIL ${w}: NO SEAT — nothing measured at this width`); continue; }
    await pg.goto(BASE + '/coach/dashboard', { waitUntil: 'domcontentloaded' }); await setWidth(pg, w, 900); await wait(4000);
    const n = await pg.evaluate(() => document.querySelectorAll('div[data-submenu-id] > button[aria-expanded]').length);
    for (let i = 0; i < n; i++) {
      await pg.goto(BASE + '/coach/dashboard', { waitUntil: 'domcontentloaded' });
      for (let k = 0; k < 30; k++) { await wait(500); if (await pg.evaluate((n) => document.querySelectorAll('div[data-submenu-id] > button[aria-expanded]').length >= n, n)) break; }
      const r = await pg.evaluate(async (i) => {
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        // A person's press and release are separate tasks ~80ms apart, so the
        // app re-renders between mousedown and click. Dispatching all five in
        // one task hid the bug (the old code passed that way).
        const human = async (el) => { const bb = el.getBoundingClientRect(); const o = { bubbles: true, cancelable: true, composed: true, clientX: bb.x + bb.width / 2, clientY: bb.y + bb.height / 2, button: 0, pointerType: 'mouse', isPrimary: true };
          el.dispatchEvent(new PointerEvent('pointerdown', o)); el.dispatchEvent(new MouseEvent('mousedown', o)); await sleep(80);
          const t = el.isConnected ? el : document.elementFromPoint(o.clientX, o.clientY) || document.body;
          t.dispatchEvent(new PointerEvent('pointerup', o)); t.dispatchEvent(new MouseEvent('mouseup', o)); t.dispatchEvent(new MouseEvent('click', o)); };
        const trig = document.querySelectorAll('div[data-submenu-id] > button[aria-expanded]')[i];
        if (!trig) return { tlabel: '#' + i, err: 'trigger not rendered' };
        const tlabel = trig.innerText.replace(/\s+/g, ' ').trim();
        await human(trig); await sleep(400);
        if (trig.getAttribute('aria-expanded') !== 'true') return { tlabel, err: 'did not open' };
        const items = [...document.querySelectorAll('[role=menuitem]')];
        const it = items.find((x) => x.getAttribute('aria-current') !== 'page');
        if (!it) return { tlabel, err: 'no item' };
        const ilabel = it.innerText.replace(/\s+/g, ' ').trim();
        const before = location.pathname;
        await human(it); await sleep(1200);
        return { tlabel, ilabel, before, after: location.pathname };
      }, i);
      tried++; perWidth[w]++;
      const ok = !r.err && r.after !== r.before;
      if (!ok) bad++;
      console.log(`${ok ? 'ok  ' : 'FAIL'} ${w} "${r.tlabel}" -> "${r.ilabel || ''}" ${r.err || `${r.before} -> ${r.after}`}`);
    }
  } finally { await ctx.close(); }
}
console.log(`\nSUBMENU CLICK — ${tried} menus x 2 widths, ${bad} failing`);
await b.disconnect();
const empty = Object.entries(perWidth).filter(([, n]) => !n).map(([w]) => w);
for (const w of empty) console.log(`FAIL  width ${w}: 0 menus clicked — the zero there is not a pass`);
process.exit(bad || !tried || empty.length ? 1 : 0);
