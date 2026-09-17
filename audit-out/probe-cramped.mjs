// THE "ONE LETTER PER LINE" PROBE.
//
// Ohad, 15.9, on the MANAGE ROSTER dialog at phone width: "wtf is this mess."
// Every name rendered one character per line and the row ran past the dialog
// with its own scrollbar. The control-wrap probe could not see it — that one
// measures CONTROLS (chips, pills, buttons ≤56px tall), and this was a whole
// row of a modal. He found it with his eyes, which is the thing to stop.
//
// Two faults, both measured, never eyeballed:
//   CRAMPED   a text node rendering on 3+ lines at ≤3.5 characters per line —
//             the signature of a flex/grid column squeezed below its content
//   RUNAWAY   an element whose content is wider than its box by >8px while
//             nothing in its ancestry is an intentional horizontal scroller
//
// A rail that is MEANT to scroll sideways (the zone's tabs, the coach header,
// a wide table in its own overflow box) is not a fault, so an element inside an
// overflow-x auto/scroll ancestor is skipped.
//
//   SEAT=owner W=390 ROUTES=/coach/bhbc node audit-out/probe-cramped.mjs
import P from 'puppeteer-core';
import fs from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:4173';
const W = Number(process.env.W || 390);
const H = Number(process.env.H || 844);
const SEAT = process.env.SEAT || 'owner';
const EMAIL = process.env.EMAIL || (SEAT === 'owner' ? 'ohadyproductions@gmail.com' : SEAT === 'pt' ? 'tomerlich11@gmail.com' : 'roeyh@hotmail.com');
const ROUTES = (process.env.ROUTES || '/coach/bhbc').split(',');
const LANG = process.env.LANG_APP || 'he';
const OPEN = process.env.OPEN || '';   // a regex of button labels to click on each route
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const MEASURE = () => {
  const out = [];
  const scrolls = new Set();
  for (const el of document.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    if (cs.overflowX === 'auto' || cs.overflowX === 'scroll') scrolls.add(el);
  }
  const inScroller = (el) => { for (let p = el; p; p = p.parentElement) if (scrolls.has(p)) return true; return false; };
  const bands = (rects) => {
    const bs = [];
    for (const rc of [...rects].sort((a, b) => a.top - b.top)) {
      const b = bs.find((x) => Math.min(x.bottom, rc.bottom) - Math.max(x.top, rc.top) >= Math.min(x.bottom - x.top, rc.height) * 0.5);
      if (b) { b.top = Math.min(b.top, rc.top); b.bottom = Math.max(b.bottom, rc.bottom); }
      else bs.push({ top: rc.top, bottom: rc.bottom });
    }
    return bs.length;
  };
  // CRAMPED — per TEXT NODE, so a column squeezed to nothing is caught even
  // when its parent looks fine.
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    const txt = (n.textContent || '').trim();
    if (txt.length < 6) continue;
    const el = n.parentElement;
    if (!el) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue;
    if (cs.writingMode && cs.writingMode !== 'horizontal-tb') continue;   // deliberately vertical
    const r = document.createRange();
    r.selectNodeContents(n);
    const rects = [...r.getClientRects()].filter((rc) => rc.width > 0.4 && rc.height > 0.4);
    if (rects.length < 3) continue;
    const lines = bands(rects);
    if (lines < 3) continue;
    const perLine = txt.length / lines;
    if (perLine > 3.5) continue;
    const box = el.getBoundingClientRect();
    out.push({ kind: 'CRAMPED', text: txt.slice(0, 30), lines, perLine: Math.round(perLine * 10) / 10, tag: el.tagName, cls: String(el.className || '').slice(0, 24), x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.width) });
  }
  // RUNAWAY — content wider than its box, outside any intentional scroller.
  for (const el of document.querySelectorAll('div,section,form,ul,table,li')) {
    const over = el.scrollWidth - el.clientWidth;
    if (over <= 8) continue;
    const cs = getComputedStyle(el);
    if (cs.overflowX === 'auto' || cs.overflowX === 'scroll' || cs.overflowX === 'hidden') continue;
    if (inScroller(el)) continue;
    // A DELIBERATE BLEED is not a runaway. The platform's card strips cancel
    // the card's own padding with a negative inline margin (margin: -14px -18px)
    // so the strip reaches the card's edge; inside a wrapper that has no
    // padding, that reads as 18px of overflow and it is exactly what was asked
    // for. Skip when the widest child is bled outward on purpose.
    const bled = [...el.children].some((c) => {
      const s2 = getComputedStyle(c);
      return (parseFloat(s2.marginLeft) || 0) < -0.5 || (parseFloat(s2.marginRight) || 0) < -0.5;
    });
    if (bled) continue;
    const box = el.getBoundingClientRect();
    if (box.width < 40 || box.height < 12) continue;
    out.push({ kind: 'RUNAWAY', text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 30), over, tag: el.tagName, cls: String(el.className || '').slice(0, 24), x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.width) });
  }
  return out;
};

// A measure that cannot fail is not a measure: inject a column squeezed the way
// the dialog's was and require the run to catch it.
const SELFTEST = () => {
  const host = document.createElement('div');
  host.setAttribute('data-cramped-selftest', '1');
  host.style.cssText = 'position:fixed;left:0;top:0;width:300px;height:60px;display:flex;z-index:2147483647;opacity:0.01;pointer-events:none';
  const fixed = document.createElement('span');
  fixed.style.cssText = 'flex:0 0 288px';
  fixed.textContent = 'x';
  const squeezed = document.createElement('span');
  squeezed.style.cssText = 'flex:1 1 auto;min-width:0;overflow-wrap:break-word;font-size:12px';
  squeezed.textContent = 'DAESHON FRANCIS';
  host.appendChild(fixed); host.appendChild(squeezed);
  document.body.appendChild(host);
  return () => host.remove();
};

const b = await P.connect({ browserURL: process.env.CDP || 'http://127.0.0.1:9223', defaultViewport: null, protocolTimeout: 300000 });
const pg = await b.newPage();
const cdp = await pg.createCDPSession();
await cdp.send('Network.setBypassServiceWorker', { bypass: true }).catch(() => {});
await cdp.send('Network.setCacheDisabled', { cacheDisabled: true }).catch(() => {});
await pg.setViewport({ width: W, height: H, deviceScaleFactor: 2, isMobile: W < 500, hasTouch: W < 500 });
await pg.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
await pg.evaluate((l) => { try { localStorage.clear(); sessionStorage.clear(); localStorage.setItem('expo-lang', l); localStorage.setItem('bhbc-lang', l); localStorage.setItem('expo-install-snooze-until', String(Date.now() + 864e5)); } catch (e) {} }, LANG);
await pg.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
await wait(3500);
await pg.evaluate((em) => {
  const ins = [...document.querySelectorAll('input')];
  const set = (el, v) => { Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
  const e = ins.find((i) => /email/i.test(i.type + i.placeholder + i.name)); const p = ins.find((i) => i.type === 'password');
  if (e) set(e, em); if (p) set(p, '1234');
}, EMAIL);
await wait(400);
await pg.evaluate(() => { const x = [...document.querySelectorAll('button')].find((y) => /^\s*(sign\s*in|כניסה)\s*$/i.test(y.textContent || '')); if (x) x.click(); });
await wait(10000);
if (SEAT !== 'athlete') await pg.evaluate(() => { const b2 = [...document.querySelectorAll('button')].find((x) => /coach|מאמן/i.test((x.textContent || '').trim())); if (b2) b2.click(); });
await wait(4000);

let total = 0;
const all = [];
for (const route of ROUTES) {
  await pg.goto(BASE + route, { waitUntil: 'domcontentloaded' });
  await wait(11000);
  if (LANG === 'he') { await pg.evaluate(() => { const b2 = [...document.querySelectorAll('button')].find((x) => /^\s*עב\s*$/.test((x.textContent || '').trim())); if (b2) b2.click(); }); await wait(2500); }
  if (OPEN) {
    const opened = await pg.evaluate((re) => { const rx = new RegExp(re, 'i'); const el = [...document.querySelectorAll('button')].find((x) => rx.test((x.textContent || '').trim())); if (!el) return false; el.click(); return true; }, OPEN);
    await wait(2500);
    if (!opened) console.log(`   (no button matching /${OPEN}/ on ${route})`);
  }
  const clean = await pg.evaluate(SELFTEST);
  const withTest = await pg.evaluate(MEASURE);
  const caught = withTest.some((x) => x.kind === 'CRAMPED' && /DAESHON/.test(x.text));
  await pg.evaluate((fn) => { const h = document.querySelector('[data-cramped-selftest]'); if (h) h.remove(); void fn; }, null);
  void clean;
  if (!caught) { console.log(`SELF-TEST FAILED on ${route} — the measure did not catch an injected cramped column`); process.exitCode = 2; }
  const hits = (await pg.evaluate(MEASURE)).filter((x) => !/DAESHON FRANCIS/.test(x.text) || x.kind !== 'CRAMPED');
  console.log(`${route.padEnd(24)} ${String(hits.length).padStart(3)} faulty`);
  for (const h of hits.slice(0, 8)) console.log(`    ${h.kind.padEnd(8)} "${h.text}" ${h.tag} ${h.cls} @${h.x},${h.y} w${h.w}${h.lines ? ` lines=${h.lines} perLine=${h.perLine}` : ''}${h.over ? ` over=${h.over}` : ''}`);
  total += hits.length;
  all.push({ route, hits });
}
fs.writeFileSync('audit-out/cramped.json', JSON.stringify(all, null, 1));
console.log(`\n${total} cramped/runaway element(s) across ${ROUTES.length} route(s) at ${W}px${OPEN ? ` (opened /${OPEN}/)` : ''} · audit-out/cramped.json`);
await pg.close();
b.disconnect();
