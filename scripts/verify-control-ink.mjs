// verify-control-ink.mjs - EVERY CONTROL'S INK ON ITS OWN CENTRE (10.10 #644/#645, Ohad: "Make sure all the text is symmetrical and aligned
// vertically and horizontally" -> "Then queue do to it everywhere on all platforms including all").
//
// Measured by PIXELS, not boxes: for every centred control (buttons, chip-grid cells, joined segments,
// strip buttons) the element is screenshotted and the painted letters found against the control's own
// background. Left gap vs right gap and top gap vs bottom gap give the ink's offset from the box's
// centre. A font's line box is NOT the ink (the 'ACTIVE' pill read centred by its box and was not -
// memory feedback_measure_the_ink_not_the_box), so nothing here reads getBoundingClientRect of text.
//
//   BASE=http://127.0.0.1:5371 node scripts/verify-control-ink.mjs             # all surfaces below
//   ONLY=/coach/review,/demo/coach  WIDTHS=390  LANGS=he  TOL=1                  # a subset
//
// Owner seat for /coach/*, the fixture athlete for /athlete, no seat for /demo and the public pages.
// Exit 1 when any control's ink sits more than TOL css px off its centre (either axis). A control
// that is deliberately start-aligned (a text-align:start label inside a button) is skipped: only
// controls whose computed text-align / justify-content centre their content are measured.
import P from 'puppeteer-core';
import { PNG } from 'pngjs';
import { signIn } from './lib/authed-page.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:5199';
const CDP = process.env.CDP || 'http://127.0.0.1:9222';
const TOL = Number(process.env.TOL || 1);
const WIDTHS = (process.env.WIDTHS || '360,390,1440').split(',').map(Number);
const LANGS = (process.env.LANGS || 'en,he').split(',');
const SURFACES = (process.env.ONLY ? process.env.ONLY.split(',') : [
  '/demo', '/demo/coach', '/demo/coach/review', '/demo/coach/tasks', '/demo/coach/billing', '/demo/athlete',
  '/coach/dashboard', '/coach/athletes', '/coach/programs', '/coach/exercises', '/coach/exercise-matching',
  '/coach/exercise-classify', '/coach/exercise-cleanup', '/coach/review', '/coach/review-tools', '/coach/sessions',
  '/coach/tasks', '/coach/billing', '/coach/calendar', '/coach/bhbc', '/login',
]);
const MAX_PER_PAGE = Number(process.env.MAX || 60);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function inkBox(buf) {
  const png = PNG.sync.read(buf);
  const { width: w, height: h, data } = png;
  if (w < 8 || h < 8) return null;
  const key = (i) => `${data[i] >> 3},${data[i + 1] >> 3},${data[i + 2] >> 3}`;
  const count = new Map();
  for (let y = 2; y < h - 2; y++) for (let x = 2; x < w - 2; x++) { const k = key((y * w + x) * 4); count.set(k, (count.get(k) || 0) + 1); }
  const bg = [...count.entries()].sort((a, b) => b[1] - a[1])[0][0].split(',').map(Number);
  let x0 = w, x1 = -1, y0 = h, y1 = -1;
  for (let y = 3; y < h - 3; y++) for (let x = 3; x < w - 3; x++) {
    const i = (y * w + x) * 4;
    const d = Math.abs((data[i] >> 3) - bg[0]) + Math.abs((data[i + 1] >> 3) - bg[1]) + Math.abs((data[i + 2] >> 3) - bg[2]);
    if (d > 6) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < 0) return null;
  return { left: x0, right: w - 1 - x1, top: y0, bottom: h - 1 - y1 };
}

const b = await P.connect({ browserURL: CDP, defaultViewport: null, protocolTimeout: 300000 });
const fails = []; let measured = 0;
try {
  for (const W of WIDTHS) for (const L of LANGS) {
    const mobile = W < 700;
    const ctx = await b.createBrowserContext(); const pg = await ctx.newPage();
    await pg.emulate({ viewport: { width: W, height: mobile ? 844 : 900, deviceScaleFactor: 2, isMobile: mobile, hasTouch: mobile }, userAgent: mobile ? 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0 Mobile Safari/537.36' : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0 Safari/537.36' });
    try {
      if (SURFACES.some((s) => s.startsWith('/coach'))) await signIn(pg, BASE);
      await pg.evaluate((l) => { try { localStorage.setItem('expo-lang', l); localStorage.setItem('expo-collapse:bhbc-lang', JSON.stringify(l)); localStorage.setItem('expo-install-snooze-until', String(Date.now() + 864e5)); } catch { /* */ } }, L);
      for (const route of SURFACES) {
        await pg.goto(BASE + route, { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
        await wait(4500);
        const handles = await pg.$$('button, [role=button], .chip-grid > *, .joined-buttons > *');
        let n = 0;
        for (const el of handles) {
          if (n >= MAX_PER_PAGE) break;
          const info = await el.evaluate((e) => {
            const r = e.getBoundingClientRect(); const cs = getComputedStyle(e);
            const txt = (e.innerText || '').replace(/\s+/g, ' ').trim();
            const centred = (cs.textAlign === 'center' || /center/.test(cs.justifyContent)) && cs.visibility !== 'hidden' && +cs.opacity > 0.3;
            return { ok: centred && txt.length > 0 && txt.length < 32 && r.width > 16 && r.height > 14 && r.height < 70 && r.bottom > 0 && r.top < innerHeight * 3, txt, w: r.width, h: r.height };
          }).catch(() => null);
          if (!info || !info.ok) continue;
          await el.evaluate((e) => e.scrollIntoView({ block: 'center', inline: 'center' })).catch(() => {});
          const buf = await el.screenshot().catch(() => null); if (!buf) continue;
          const k = inkBox(buf); if (!k) continue;
          n++; measured++;
          const dx = (k.left - k.right) / 4, dy = (k.top - k.bottom) / 4;   // css px at dpr 2; + = ink right / low
          if (Math.abs(dx) > TOL || Math.abs(dy) > TOL) fails.push(`${W} ${L} ${route} "${info.txt}" x ${dx.toFixed(2)} y ${dy.toFixed(2)} (box ${Math.round(info.w)}x${Math.round(info.h)})`);
        }
        console.log(`${W} ${L} ${route}: ${n} measured`);
      }
    } finally { await ctx.close(); }
  }
} finally { b.disconnect(); }
for (const f of fails.slice(0, 120)) console.log('  OFF ' + f);
if (!measured) { console.log('INK CENTRING: NOTHING MEASURED - wrong BASE or seat?'); process.exit(1); }
console.log(fails.length ? `INK CENTRING: ${fails.length} control(s) more than ${TOL}px off centre (of ${measured} measured)` : `INK CENTRING: all ${measured} centred within ${TOL}px`);
process.exit(fails.length ? 1 : 0);
