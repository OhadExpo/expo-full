// IS THE TEXT VERTICALLY CENTRED INSIDE ITS BORDER? Measured in PIXELS.
//
// Ohad, 16.9, desktop: the athlete roster's status box ("Active", "Inactive")
// and the program editor's pattern-coverage boxes ("Horiz. Push", "Hip Hinge",
// "Squat") — "not vertically center aligned. massive gap. fix it everywhere."
//
// A range rect measures the LINE BOX, and for an all-caps face like Nord the
// line box is not where the ink is: caps have no descenders, so a box that is
// "centred" by line box still rides high. So this screenshots each box at 2x,
// decodes the PNG, and finds the first and last ROW that holds ink inside the
// borders. gapAbove vs gapBelow is the truth.
//
//   ROUTE=/coach/athletes MATCH="^(Active|Inactive|On Hold|Trial)$" node audit-out/probe-ink-center.mjs
import P from 'puppeteer-core';
import { PNG } from 'pngjs';
import fs from 'node:fs';

const BASE = process.env.BASE || 'http://localhost:4173';
const W = Number(process.env.W || 1400);
const ROUTE = process.env.ROUTE || '/coach/athletes';
const LANG = process.env.LANG_APP || 'en';
const MATCH = new RegExp(process.env.MATCH || '^(Active|Inactive|On Hold|Trial)$', 'i');
const CLICK = process.env.CLICK || '';          // regex: click the first element whose text matches, before measuring
const TAG = process.env.TAG || 'ink';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const b = await P.connect({ browserURL: process.env.CDP || 'http://127.0.0.1:9223', defaultViewport: null, protocolTimeout: 300000 });
const pg = await b.newPage();
const cdp = await pg.createCDPSession();
await cdp.send('Network.setBypassServiceWorker', { bypass: true }).catch(() => {});
await cdp.send('Network.setCacheDisabled', { cacheDisabled: true }).catch(() => {});
const DPR = Number(process.env.DPR || 2);
await pg.setViewport({ width: W, height: 1000, deviceScaleFactor: DPR });
await pg.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
await pg.evaluate((l) => { try { localStorage.clear(); sessionStorage.clear(); localStorage.setItem('expo-lang', l); localStorage.setItem('expo-install-snooze-until', String(Date.now() + 864e5)); } catch (e) {} }, LANG);
await pg.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
await wait(4000);
await pg.evaluate(() => {
  const ins = [...document.querySelectorAll('input')];
  const set = (el, v) => { Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
  const e = ins.find((i) => /email/i.test(i.type + i.placeholder + i.name)); const p = ins.find((i) => i.type === 'password');
  if (e) set(e, 'ohadyproductions@gmail.com'); if (p) set(p, '1234');
});
await wait(500);
await pg.evaluate(() => { const x = [...document.querySelectorAll('button')].find((y) => /^\s*(sign\s*in|כניסה)\s*$/i.test(y.textContent || '')); if (x) x.click(); });
await wait(11000);
await pg.evaluate(() => { const b2 = [...document.querySelectorAll('button')].find((x) => /coach|מאמן/i.test((x.textContent || '').trim())); if (b2) b2.click(); });
await wait(5000);
await pg.goto(BASE + ROUTE, { waitUntil: 'domcontentloaded' });
await wait(12000);
for (const step of CLICK.split('>>').filter(Boolean)) {
  const ok = await pg.evaluate((re) => {
    const rx = new RegExp(re, 'i');
    const el = [...document.querySelectorAll('button,a,[role="button"],div,span')].find((x) => x.children.length < 4 && rx.test((x.textContent || '').trim()));
    if (!el) return false; el.scrollIntoView({ block: 'center' }); el.click(); return true;
  }, step);
  console.log('click', step, ok);
  await wait(4000);
}

// Tag every bordered box whose OWN text matches, so we can clip it.
const boxes = await pg.evaluate((src, flags) => {
  const rx = new RegExp(src, flags);
  const out = [];
  let i = 0;
  for (const el of document.querySelectorAll('button,span,div,a,label,select')) {
    const txt = (el.innerText || el.textContent || '').replace(/[▾▼⌄]/g, '').replace(/\s+/g, ' ').trim();
    if (!rx.test(txt)) continue;
    const cs = getComputedStyle(el);
    const bt = parseFloat(cs.borderTopWidth) || 0, bb = parseFloat(cs.borderBottomWidth) || 0;
    if (bt < 0.5 || bb < 0.5) continue;                 // "inside the borders": the box must HAVE them
    const r = el.getBoundingClientRect();
    if (r.height < 12 || r.height > 60 || r.width < 20) continue;
    if (r.bottom < 0 || r.top > innerHeight * 6) continue;
    // skip an outer box when a bordered descendant carries the same text
    if ([...el.querySelectorAll('*')].some((c) => { const s2 = getComputedStyle(c); return (parseFloat(s2.borderTopWidth) || 0) > 0.5 && rx.test((c.innerText || '').replace(/\s+/g, ' ').trim()); })) continue;
    el.setAttribute('data-ink-probe', String(i));
    const inner = [...el.querySelectorAll('*')].find((c) => c.children.length === 0 && (c.textContent || '').trim()) || el;
    out.push({ i, txt, color: getComputedStyle(inner).color, h: +r.height.toFixed(1), bt, bb, font: cs.fontFamily.split(',')[0], size: cs.fontSize, lh: cs.lineHeight, pad: cs.paddingTop + '/' + cs.paddingBottom, display: cs.display, align: cs.alignItems, bg: cs.backgroundColor });
    i++;
    if (i >= 16) break;
  }
  return out;
}, MATCH.source, MATCH.flags);

const results = [];
for (const bx of boxes) {
  const h = await pg.$(`[data-ink-probe="${bx.i}"]`);
  if (!h) continue;
  await h.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await wait(250);
  const rect = await h.boundingBox();
  if (!rect) continue;
  const buf = await pg.screenshot({ clip: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } });
  const png = PNG.sync.read(buf);
  const dpr = png.height / rect.height;
  const px = (x, y) => { const k = (png.width * y + x) << 2; return [png.data[k], png.data[k + 1], png.data[k + 2]]; };
  // INK = pixels close to the label's own text colour. "Different from the
  // background" also catches the border's anti-aliased edge and any tint, which
  // is how the first version read 0px above and 0px below on every box.
  // interior background = the dominant colour of the rows just inside the border
  const counts = new Map();
  const edge0 = Math.ceil(Math.max(bx.bt, bx.bb) * dpr) + 1;
  for (let y = edge0; y < png.height - edge0; y++) for (let x = 0; x < png.width; x++) { const c = px(x, y).join(','); counts.set(c, (counts.get(c) || 0) + 1); }
  const bgc = [...counts.entries()].sort((a, b2) => b2[1] - a[1])[0][0].split(',').map(Number);
  const near = (c) => Math.abs(c[0] - bgc[0]) + Math.abs(c[1] - bgc[1]) + Math.abs(c[2] - bgc[2]) > 60;
  const edge = Math.ceil(Math.max(bx.bt, bx.bb) * dpr) + Math.ceil(2 * dpr);
  const bT = edge, bB = edge;
  let top = -1, bottom = -1;
  const x0 = Math.ceil(6 * dpr), x1 = png.width - Math.ceil(6 * dpr);
  for (let y = bT; y < png.height - bB; y++) {
    let ink = 0;
    for (let x = x0; x < x1; x++) if (near(px(x, y))) ink++;
    if (ink >= 1) { if (top < 0) top = y; bottom = y; }
  }
  // the gaps are measured to the INNER edge of the border, not to the skip margin
  const innerTop = Math.round(bx.bt * dpr), innerBottom = png.height - Math.round(bx.bb * dpr);
  if (top < 0) { results.push({ ...bx, err: 'no ink found' }); continue; }
  const gapAbove = (top - innerTop) / dpr, gapBelow = (innerBottom - 1 - bottom) / dpr;
  const off = (gapBelow - gapAbove) / 2;           // + = ink rides HIGH
  results.push({ txt: bx.txt, h: bx.h, gapAbove: +gapAbove.toFixed(1), gapBelow: +gapBelow.toFixed(1), off: +off.toFixed(1), font: bx.font, size: bx.size, lh: bx.lh, pad: bx.pad, display: bx.display, align: bx.align });
  if (results.length === 1) fs.writeFileSync(`audit-out/${TAG}-first.png`, buf);
}
for (const r of results) console.log(r.err ? `  ${r.txt}  ${r.err}` : `  ${String(r.txt).padEnd(18)} h=${r.h} above=${r.gapAbove} below=${r.gapBelow} OFF=${r.off}  ${r.font} ${r.size} lh=${r.lh} pad=${r.pad} ${r.display}/${r.align}`);
const worst = results.filter((r) => !r.err).reduce((m, r) => Math.max(m, Math.abs(r.off)), 0);
console.log(`\n${results.length} box(es) · worst off-centre ${worst.toFixed(1)}px (+ = ink rides high)`);
await pg.close(); b.disconnect();
