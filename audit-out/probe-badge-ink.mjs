// Every PATTERN COVERAGE badge in the program editor, measured in pixels:
// rows of ink vs the rows inside the border. Also the roster status boxes.
import P from 'puppeteer-core';
import { PNG } from 'pngjs';
const BASE = process.env.BASE || 'https://expo-app.co.il';
const ROUTE = process.env.ROUTE || '/coach/programs/pl_byw92s63mu3zk04d';
const DPR = Number(process.env.DPR || 1);
const MATCH = new RegExp(process.env.MATCH || '(HORIZONTAL|VERTICAL|HIP HINGE|SQUAT|LUNGE|CARRY|ROTATION)', 'i');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await P.connect({ browserURL: 'http://127.0.0.1:9223', defaultViewport: null, protocolTimeout: 300000 });
const pg = await b.newPage();
const cdp = await pg.createCDPSession();
await cdp.send('Network.setBypassServiceWorker', { bypass: true }).catch(() => {});
await cdp.send('Network.setCacheDisabled', { cacheDisabled: true }).catch(() => {});
await pg.setViewport({ width: Number(process.env.W || 1400), height: 900, deviceScaleFactor: DPR });
await pg.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
await pg.evaluate((l) => { try { localStorage.clear(); localStorage.setItem('expo-lang', l); localStorage.setItem('expo-install-snooze-until', String(Date.now() + 864e5)); } catch (e) {} }, process.env.LANG_APP || 'en');
await pg.goto(BASE + '/login', { waitUntil: 'domcontentloaded' }); await wait(4000);
await pg.evaluate(() => { const ins = [...document.querySelectorAll('input')]; const set = (el, v) => { Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); }; const e = ins.find((i) => /email/i.test(i.type + i.placeholder + i.name)); const p = ins.find((i) => i.type === 'password'); if (e) set(e, 'ohadyproductions@gmail.com'); if (p) set(p, '1234'); });
await wait(500); await pg.evaluate(() => { const x = [...document.querySelectorAll('button')].find((y) => /^\s*(sign\s*in|כניסה)\s*$/i.test(y.textContent || '')); if (x) x.click(); });
await wait(11000); await pg.evaluate(() => { const b2 = [...document.querySelectorAll('button')].find((x) => /coach|מאמן/i.test((x.textContent || '').trim())); if (b2) b2.click(); });
await wait(5000); await pg.goto(BASE + ROUTE, { waitUntil: 'domcontentloaded' }); await wait(13000);
const n = await pg.evaluate((src) => {
  const rx = new RegExp(src, 'i'); let i = 0;
  for (const el of document.querySelectorAll('span,div,button')) {
    const cs = getComputedStyle(el);
    if ((parseFloat(cs.borderTopWidth) || 0) < 0.5) continue;
    const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
    if (!rx.test(t) || t.length > 40) continue;
    const r = el.getBoundingClientRect(); if (r.height < 10 || r.height > 60) continue;
    el.setAttribute('data-bi', String(i++));
  }
  return i;
}, MATCH.source);
const rows = [];
for (let i = 0; i < n; i++) {
  const h = await pg.$(`[data-bi="${i}"]`); await h.evaluate((el) => el.scrollIntoView({ block: 'center' })); await wait(150);
  const rect = await h.boundingBox();
  const info = await h.evaluate((el) => { const cs = getComputedStyle(el); return { t: (el.textContent || '').replace(/\s+/g, ' ').trim(), bt: parseFloat(cs.borderTopWidth), bb: parseFloat(cs.borderBottomWidth), lh: cs.lineHeight, pad: cs.paddingTop + '/' + cs.paddingBottom, disp: cs.display, ai: cs.alignItems, h: el.getBoundingClientRect().height }; });
  const png = PNG.sync.read(await pg.screenshot({ clip: rect }));
  const d = png.height / rect.height;
  const px = (x, y) => { const k = (png.width * y + x) << 2; return [png.data[k], png.data[k + 1], png.data[k + 2]]; };
  const bg = px(Math.round(png.width * 0.02) + Math.ceil(2 * d), Math.round(png.height / 2));
  const inT = Math.round(info.bt * d), inB = png.height - Math.round(info.bb * d);
  let top = -1, bot = -1;
  for (let y = inT; y < inB; y++) { let k = 0; for (let x = Math.ceil(4 * d); x < png.width - Math.ceil(4 * d); x++) { const c = px(x, y); if (Math.abs(c[0] - bg[0]) + Math.abs(c[1] - bg[1]) + Math.abs(c[2] - bg[2]) > 70) k++; } if (k) { if (top < 0) top = y; bot = y; } }
  const above = (top - inT) / d, below = (inB - 1 - bot) / d;
  rows.push({ t: info.t.slice(0, 26), h: +info.h.toFixed(1), above: +above.toFixed(1), below: +below.toFixed(1), off: +((below - above) / 2).toFixed(1), lh: info.lh, pad: info.pad, disp: info.disp + '/' + info.ai });
}
for (const r of rows) console.log(`  ${r.t.padEnd(26)} h=${r.h} above=${r.above} below=${r.below} OFF=${r.off}  lh=${r.lh} pad=${r.pad} ${r.disp}`);
console.log(`${rows.length} badges · worst ${Math.max(0, ...rows.map((r) => Math.abs(r.off))).toFixed(1)}px (+ = ink rides high)`);
await pg.close(); b.disconnect();
