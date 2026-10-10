// HEADER ROWS ARE ONE ROW (2.10 #519, Ohad on Medical > Active injuries at 390:
// "reported by is badly designed should fit better or only one row... Fix it
// everywhere that might have the same problem"). Every sortable / column header
// row: one row, no label on two lines, no ink cut at its box edge (a pinned cell
// or a few px of spill counts; a real sideways scroller does not) - at phone
// widths, en + he, every BHBC tab + the coach routes.
// Break-proven 2.10: flags the live Medical wrap ("Reported by") and the cut
// "ATTENDE" header on Practice Attendance at 360.
//   BASE=http://127.0.0.1:5199 node scripts/verify-header-rows.mjs [widths]   (ONLY=<route regex>)
import puppeteer from 'puppeteer-core';
import { setWidth } from '../scripts/lib/viewport.mjs';
import { signIn, assertAuthed } from '../scripts/lib/authed-page.mjs';

const base = process.env.BASE || 'http://127.0.0.1:5199';
const wArg = process.argv[2] || '360,390';
const WIDTHS = wArg.split(',').map(Number);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const BHBC = ['overview', 'roster', 'schedule', 'practices', 'lifts', 'medical', 'games', 'activity'];
const COACH = ['/coach/dashboard', '/coach/athletes', '/coach/billing', '/coach/sessions', '/coach/workouts', '/coach/library', '/coach/plans', '/coach/tasks'];
const j = await (await fetch(`${process.env.CDP || 'http://127.0.0.1:9222'}/json/version`)).json();
const browser = await puppeteer.connect({ browserWSEndpoint: j.webSocketDebuggerUrl, protocolTimeout: 90000, defaultViewport: null });
const ctx = await browser.createBrowserContext();
const page = await ctx.newPage();
const scan = () => page.evaluate(() => {
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
  const rows = new Set();
  for (const e of document.querySelectorAll('[aria-label^="Sort by"], [title^="Sort by"], [aria-label^="מיון"], .bhbc-sortbar, .bhbc-inj-head, .bhbc-load-head, thead tr')) {
    const row = e.matches('.bhbc-sortbar, .bhbc-inj-head, .bhbc-load-head, thead tr') ? e : e.parentElement;
    if (row && vis(row)) rows.add(row);
  }
  const out = [];
  for (const row of rows) {
    const kids = [...row.children].filter(vis);
    if (kids.length < 2) continue;
    const name = kids.map((k) => (k.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 14)).join(' | ').slice(0, 90);
    const tops = kids.map((k) => Math.round(k.getBoundingClientRect().top));
    const hs = kids.map((k) => k.getBoundingClientRect().height);
    if (Math.max(...tops) - Math.min(...tops) > 6) out.push(`WRAP ${name}`);
    // a label broken onto two lines inside its own cell
    // A DESIGNED stack is not a broken label: a cell holding a [data-stack] (the attendance grid's
    // weekday over its date, #629 - 'Su 4' cannot fit a 22px day column on one line) is two lines
    // on purpose, and passes only while the row stays one standard row (36px)
    kids.forEach((k) => { const t = (k.textContent || '').trim(); if (!t) return; if (k.querySelector('[data-stack]') && row.getBoundingClientRect().height <= 37) return; const lh = parseFloat(getComputedStyle(k).fontSize) * 1.6; const r = document.createRange(); r.selectNodeContents(k); const lines = new Set([...r.getClientRects()].filter((q) => q.width > 1).map((q) => Math.round(q.top))); if (lines.size > 1 && k.getBoundingClientRect().height > lh) out.push(`2-LINE "${t.slice(0, 24)}" in ${name}`); });
    kids.forEach((k) => { if (k.scrollWidth > k.clientWidth + 1 && getComputedStyle(k).overflow !== 'visible') out.push(`CLIP "${(k.textContent || '').trim().slice(0, 24)}"`); });
    let clip = row.parentElement; while (clip && clip !== document.body && getComputedStyle(clip).overflowX === 'visible') clip = clip.parentElement;
    // a SCROLLER is not a cut: a wide table that scrolls sideways shows the rest on a swipe
    // ...unless the overflow is a few px (ink spilling, not a designed scroll) or the
    // cell is PINNED (sticky): a pinned cell never scrolls into view
    const realScroll = clip && clip !== document.body && /auto|scroll/.test(getComputedStyle(clip).overflowX) && clip.scrollWidth - clip.clientWidth > 12;
    const box = clip && clip !== document.body ? clip.getBoundingClientRect() : { left: 0, right: innerWidth };
    kids.forEach((k) => { const pinned = getComputedStyle(k).position === 'sticky'; const cr = realScroll && !pinned ? { left: -1e9, right: 1e9 } : box; const r = document.createRange(); r.selectNodeContents(k); const ink = [...r.getClientRects()].filter((q) => q.width > 1); if (ink.some((q) => q.right > cr.right + 1 || q.left < cr.left - 1)) out.push(`CUT "${(k.textContent || '').trim().slice(0, 24)}" at the box edge`); });
    const rr = row.getBoundingClientRect();
    const sc = row.closest('[style*="overflow-x: auto"], [style*="overflow: auto"]');
    if (!sc && rr.right > innerWidth + 1) out.push(`PAST-SCREEN ${name} right=${Math.round(rr.right)}`);
    void hs;
  }
  return [...new Set(out)];
});
let fails = 0, rowsSeen = 0;
try {
  await setWidth(page, 1440, 900);
  await signIn(page, base);
  if (!(await assertAuthed(page, base, '/coach/dashboard'))) throw new Error('not signed in');
  await page.evaluate(() => { try { localStorage.setItem('expo-install-snooze-until', String(Date.now() + 864e5)); } catch { /* */ } });
  for (const lang of ['en', 'he']) {
    await page.goto(`${base}/coach/bhbc/overview`, { waitUntil: 'domcontentloaded' }); await wait(3000);
    await page.evaluate((lang) => { const re = lang === 'he' ? /^\s*עב\s*$/ : /^\s*EN\s*$/i; const b = [...document.querySelectorAll('button')].find((e) => re.test(e.textContent || '')); if (b) b.click(); }, lang);
    await wait(1200);
    for (const W of WIDTHS) {
      const routes = [...BHBC.map((t) => `/coach/bhbc/${t}`), ...(lang === 'en' ? COACH : [])];
      for (const r of routes.filter((x) => !process.env.ONLY || new RegExp(process.env.ONLY).test(x))) {
        await page.goto(`${base}${r}`, { waitUntil: 'domcontentloaded' });
        await setWidth(page, W, 844);
        await wait(3500);
        const found = await scan();
        rowsSeen += 1;
        if (found.length) { fails += found.length; console.log(`FAIL ${lang} ${W} ${r}\n   ${found.join('\n   ')}`); }
      }
    }
  }
  await page.goto(`${base}/coach/bhbc/overview`, { waitUntil: 'domcontentloaded' }); await wait(2500);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((e) => /^\s*EN\s*$/i.test(e.textContent || '')); if (b) b.click(); }); await wait(800);
} catch (e) { console.log('ERR', e.message); fails += 1; } finally {
  await page.close().catch(() => {}); await ctx.close().catch(() => {}); browser.disconnect();
}
console.log(`${fails ? 'FAIL' : 'PASS'} header rows: ${fails} findings over ${rowsSeen} page views`);
process.exit(fails ? 1 : 0);
