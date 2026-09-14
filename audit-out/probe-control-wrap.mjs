// EVERY CONTROL THAT WRAPS INSIDE ITS BORDER, OR SPILLS OUT OF IT.
//
// Ohad, 2026-09-14, from his phone: "logged is spilling. it should be one row
// not two like the other buttons, and fit inside the borders … full sweep
// anywhere this is a very very horrible mistake since it was on an actual
// athlete screen."
//
// A control here is a button, or any bordered span/div carrying short text -
// a chip, a pill, a tab, a badge. Three faults are measured, never eyeballed:
//   WRAP      its text renders on more than one line (distinct rect tops)
//   CLIP      scrollWidth exceeds clientWidth: the text is wider than the box
//   INK-OUT   a text rect crosses the element's own border edge
// A control that is genuinely multi-line by design (height > 56) is skipped.
//
//   SEAT=athlete EMAIL=roeyh@hotmail.com W=390 ROUTES=/athlete node audit-out/probe-control-wrap.mjs
//   SEAT=owner W=1400 ROUTES=/coach,/coach/athletes node audit-out/probe-control-wrap.mjs
import P from 'puppeteer-core';
import fs from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:4173';
const W = Number(process.env.W || 390);
const H = Number(process.env.H || 844);
const SEAT = process.env.SEAT || 'athlete';
const EMAIL = process.env.EMAIL || (SEAT === 'owner' ? 'ohadyproductions@gmail.com' : SEAT === 'pt' ? 'tomerlich11@gmail.com' : 'roeyh@hotmail.com');
const ROUTES = (process.env.ROUTES || '/athlete').split(',');
const LANG = process.env.LANG_APP || '';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const b = await P.connect({ browserURL: process.env.CDP || 'http://127.0.0.1:9223', defaultViewport: null, protocolTimeout: 300000 });
const pg = await b.newPage();
// A registered service worker will happily serve YESTERDAY's app: the first run
// of this probe against production measured a bundle that predated the deploy
// and reported the bug as still live. Bypass the worker and the HTTP cache.
const cdpPg = await pg.createCDPSession();
await cdpPg.send('Network.setBypassServiceWorker', { bypass: true }).catch(() => {});
await cdpPg.send('Network.setCacheDisabled', { cacheDisabled: true }).catch(() => {});
await pg.setViewport({ width: W, height: H, deviceScaleFactor: 2, isMobile: W < 500, hasTouch: W < 500 });
if (LANG) await pg.evaluateOnNewDocument((l) => { try { localStorage.setItem('expo-lang', l); } catch (e) {} }, LANG);
await pg.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
await pg.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch (e) {} });
if (LANG) await pg.evaluate((l) => { try { localStorage.setItem('expo-lang', l); } catch (e) {} }, LANG);
await pg.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
await wait(3500);
await pg.evaluate((email) => {
  const ins = [...document.querySelectorAll('input')];
  const e = ins.find((i) => /email/i.test(i.type + i.placeholder + i.name));
  const p = ins.find((i) => i.type === 'password');
  const set = (el, v) => { Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
  if (e) set(e, email); if (p) set(p, '1234');
}, EMAIL);
await wait(400);
await pg.evaluate(() => { const x = [...document.querySelectorAll('button')].find((y) => /^\s*(sign\s*in|כניסה)\s*$/i.test(y.textContent || '')); if (x) x.click(); });
await wait(9000);
// A dual-role account lands on a chooser; take the seat we asked for.
await pg.evaluate((seat) => {
  const want = seat === 'athlete' ? /athlete|מתאמן/i : /coach|מאמן/i;
  const b2 = [...document.querySelectorAll('button')].find((x) => want.test((x.textContent || '').trim()));
  if (b2) b2.click();
}, SEAT);
await wait(2500);

const MEASURE = () => {
  const out = [];
  const scanned = [];
  const seen = new Set();
  const lineTops = (el) => {
    const rects = [];
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      if (!n.textContent.trim()) continue;
      const r = document.createRange();
      r.selectNodeContents(n);
      for (const rc of r.getClientRects()) { if (rc.width < 0.5 || rc.height < 0.5) continue; rects.push(rc); }
    }
    // Same line = vertical overlap of at least half the shorter run.
    const bands = [];
    for (const rc of [...rects].sort((x, y) => x.top - y.top)) {
      const band = bands.find((bd) => {
        const ov = Math.min(bd.bottom, rc.bottom) - Math.max(bd.top, rc.top);
        return ov >= Math.min(bd.bottom - bd.top, rc.height) * 0.5;
      });
      if (band) { band.top = Math.min(band.top, rc.top); band.bottom = Math.max(band.bottom, rc.bottom); }
      else bands.push({ top: rc.top, bottom: rc.bottom });
    }
    return { lines: bands.length, rects };
  };
  for (const el of document.querySelectorAll('button, a, span, div')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue;
    const box = el.getBoundingClientRect();
    if (box.width < 8 || box.height < 8 || box.height > 56) continue;
    const bw = ['Top', 'Right', 'Bottom', 'Left'].map((s) => parseFloat(cs['border' + s + 'Width']) || 0);
    const bordered = bw.some((x) => x > 0);
    const isBtn = el.tagName === 'BUTTON' || el.getAttribute('role') === 'button' || el.getAttribute('role') === 'tab';
    if (!bordered && !isBtn) continue;
    const txt = (el.textContent || '').replace(/\s+/g, ' ').trim();
    if (!txt || txt.length > 42) continue;
    // A bordered box this small carrying this little text IS a control, whether
    // the label sits in its own text node or in a span inside it.
    const key = txt + '|' + Math.round(box.x) + '|' + Math.round(box.y);
    if (seen.has(key)) continue;
    seen.add(key);
    scanned.push(key);
    const { lines, rects } = lineTops(el);
    const clip = el.scrollWidth - el.clientWidth;
    const inkOut = rects.some((r) => r.right > box.right - bw[1] + 0.6 || r.left < box.left + bw[3] - 0.6
      || r.bottom > box.bottom - bw[2] + 0.6 || r.top < box.top + bw[0] - 0.6);
    const faults = [];
    if (lines > 1) faults.push('WRAP');
    if (clip > 1) faults.push('CLIP+' + clip);
    if (inkOut) faults.push('INK-OUT');
    if (!faults.length) continue;
    out.push({ text: txt.slice(0, 40), tag: el.tagName, cls: String(el.className || '').slice(0, 26), x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.width), h: Math.round(box.height), lines, faults: faults.join(',') });
  }
  return { items: out, scanned: scanned.length };
};

// A measure that cannot fail is not a measure. Inject a chip built exactly like
// the one that reached his screen - bordered, short label, no nowrap, squeezed -
// and require the measure to flag it.
const SELFTEST = () => {
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:0;top:0;width:54px;z-index:2147483647;opacity:0.01;pointer-events:none';
  const chip = document.createElement('span');
  chip.setAttribute('data-selftest', '1');
  chip.style.cssText = 'display:inline-flex;align-items:center;height:24px;box-sizing:border-box;padding:3px 7px;border:1px solid #39BDFF;font-size:8px;letter-spacing:0.18em';
  chip.textContent = '1 LOGGED';
  host.appendChild(chip);
  document.body.appendChild(host);
  return () => host.remove();
};

const all = [];
for (const route of ROUTES) {
  await pg.goto(BASE + route, { waitUntil: 'domcontentloaded' });
  await wait(9000);
  await pg.evaluate(() => { const x = [...document.querySelectorAll('button,a')].find((e) => /maybe later|dismiss/i.test(e.textContent || '')); if (x) x.click(); });
  await wait(600);
  // Scroll the page so lazy sections mount and measure again.
  await pg.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)); } window.scrollTo(0, 0); });
  await wait(1200);
  if (process.env.SHOT) { await pg.screenshot({ path: process.env.SHOT.replace('{route}', route.replace(/W+/g, '-')) }); console.log('   shot', process.env.SHOT.replace('{route}', route.replace(/W+/g, '-'))); }
  await pg.evaluate(SELFTEST);
  const probe = await pg.evaluate(MEASURE);
  const caught = probe.items.some((x) => x.text === '1 LOGGED' && /WRAP/.test(x.faults));
  await pg.evaluate(() => { const h = document.querySelector('[data-selftest]'); if (h && h.parentElement) h.parentElement.remove(); });
  if (!caught) { console.log('SELF-TEST FAILED on ' + route + ': the injected broken chip was not flagged - the measure is not measuring'); process.exitCode = 1; }
  const res = await pg.evaluate(MEASURE);
  const found = res.items;
  for (const f of found) all.push({ route, w: W, seat: SEAT, ...f });
  console.log(`${route.padEnd(22)} ${String(res.scanned).padStart(4)} scanned · ${String(found.length).padStart(3)} faulty`);
  for (const f of found) console.log(`    ${f.faults.padEnd(14)} "${f.text}" ${f.tag} ${f.w}x${f.h} lines=${f.lines} @${f.x},${f.y}`);
}
const OUT = process.env.OUT || 'audit-out/control-wrap.json';
const prev = fs.existsSync(OUT) && process.env.APPEND ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : [];
fs.writeFileSync(OUT, JSON.stringify([...prev, ...all], null, 0));
console.log(`\n${all.length} faulty control(s) across ${ROUTES.length} route(s) at ${W}px · ${OUT}`);
await pg.close();
b.disconnect();
