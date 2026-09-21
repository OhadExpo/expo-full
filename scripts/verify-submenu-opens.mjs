// #105 — ONE TAP MUST OPEN THE TOP-MENU SUBMENU, AND A CLICK MUST NOT UNDO A HOVER.
//
// Ohad, 20.9: "submenus on expo top menu not working good". Traced on the
// built app and it was never touch-specific:
//     start        aria-expanded=false
//     after HOVER  true
//     after CLICK  FALSE
// Hover opened the panel and clicking the trigger — the obvious next move —
// closed it. On a phone the browser fires an emulated mouseenter before the
// click, so the panel opened and shut inside one tap and never appeared.
//
// This checks both input types. It asserts what is UNDER the tap point first:
// an earlier version of this scrolled the trigger into view, read the rect in
// the same tick, and tapped the sticky header instead — reporting a working
// menu as broken.
import P from 'puppeteer-core';
import { signIn } from './lib/authed-page.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:5199';
const b = await P.connect({ browserURL: process.env.CDP || 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 300000 });
let fail = 0, ran = 0;

const trigger = () => {
  const t = [...document.querySelectorAll('[data-submenu-id] button')].find((q) => /athletes|מתאמנים/i.test(q.textContent || ''));
  return t || null;
};

// WHAT THIS CAN AND CANNOT PROVE.
//
// The mouse path is the reported regression and it is fully measurable here.
// The TOUCH path is not: neither page.touchscreen.tap() nor elementHandle.tap()
// delivers a single event to this trigger under Chrome's mobile emulation —
// zero pointerdown, zero touchstart, zero click, with elementFromPoint
// confirming the trigger is the topmost element at that exact point. That is a
// harness limitation, not a statement about the app, and reporting it as a
// failing product test would be a lie in the other direction. The touch
// behaviour is correct BY CONSTRUCTION (pointerenter is ignored for
// pointerType 'touch', so a tap reaches the click handler with the menu still
// closed and opens it) and wants one check on a real phone.
for (const [label, mobile] of [['mouse, hover then click', false]]) {
  const page = await b.newPage();
  try {
    await signIn(page, BASE);
    await page.evaluate(() => localStorage.setItem('expo-lang', 'en'));
    await page.setViewport(mobile
      ? { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
      : { width: 1280, height: 900, deviceScaleFactor: 1 });
    await page.goto(BASE + '/coach/dashboard', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await new Promise((r) => setTimeout(r, 5000));
    await page.evaluate(() => { const e = [...document.querySelectorAll('button')].find((q) => (q.textContent || '').trim() === 'Later'); if (e) e.click(); });
    await new Promise((r) => setTimeout(r, 1200));

    const box = await page.evaluate((fn) => {
      // eslint-disable-next-line no-new-func
      const t = new Function('return (' + fn + ')()')();
      if (!t) return null;
      const r = t.getBoundingClientRect();
      const x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2);
      const under = document.elementFromPoint(x, y);
      return { x, y, hits: !!(under && t.contains(under)), label: (t.textContent || '').trim().slice(0, 16) };
    }, trigger.toString());
    ran++;
    if (!box) { fail++; console.log(`  FAIL ${label}: no submenu trigger on the page`); continue; }
    if (!box.hits) { fail++; console.log(`  FAIL ${label}: something else is on top of the trigger at ${box.x},${box.y}`); continue; }

    if (mobile) await page.touchscreen.tap(box.x, box.y);
    else { await page.mouse.move(box.x, box.y); await new Promise((r) => setTimeout(r, 400)); await page.mouse.down(); await page.mouse.up(); }
    await new Promise((r) => setTimeout(r, 900));

    const after = await page.evaluate((fn) => {
      // eslint-disable-next-line no-new-func
      const t = new Function('return (' + fn + ')()')();
      const panels = [...document.querySelectorAll('body > div')]
        .filter((d) => getComputedStyle(d).position === 'fixed' && Number(getComputedStyle(d).zIndex) >= 100000)
        .map((d) => (d.textContent || '').trim().slice(0, 40));
      return { expanded: t ? t.getAttribute('aria-expanded') : null, panels };
    }, trigger.toString());

    const ok = after.expanded === 'true' && after.panels.length > 0;
    if (!ok) fail++;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}: "${box.label}" -> expanded=${after.expanded}, panel="${after.panels[0] || 'none'}"`);
  } catch (e) { fail++; console.log(`  ERROR ${label}: ${e.message}`); }
  finally { await page.close().catch(() => {}); }
}
b.disconnect();
console.log(`\n${ran} input type(s) checked, ${fail} failing`);
if (fail || ran !== 1) process.exitCode = 1;
