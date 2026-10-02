// verify-bhbc-cell-boxes.mjs - THE BHBC ZONE HAS ONE BOX HEIGHT (2.10 #509).
//
// Ohad, 2.10: "the tables in scheduele and lifts are very bad in bhbc" and
// "a lot more buttons inside cells that are designed bad all around bhbc. work
// it out once a for all". Measured before the fix: 165 painted boxes off the
// spec across the eight tabs - MD tags 16px, S&C/CANCEL faces 22 inside 26
// buttons inside 36 chips, schedule-list chips 28, week chips 39, a wrapped
// game chip 54, the Month/Week/List group 28, attendance rows 26-27.
//
// THE SPEC, measured on every tab (Schedule in all three modes) at 1440 + 390:
//   - anything in the zone that paints a full box (border on four sides, or a
//     filled control) is 36 (--btn-h)
//   - a title strip is 41; a control nested IN a strip is the nested height
//     (26, 32 on a touch screen - --btn-h-in, Ohad 26.9)
//   - a segment of a segmented group is measured as the group
//   - every grid/list row (.hl-rows) is at least 36
// An action inside a row is a SEGMENT of the row (segBtn) and draws no box, so
// it is not counted - that is the rule this gate holds.
//
// Proven both ways on 2.10: the fix 0 off-spec; the live build (7640eac7) 69 at
// 1440 alone.
//
//   BASE=http://127.0.0.1:5199 node scripts/verify-bhbc-cell-boxes.mjs [widths]
import puppeteer from 'puppeteer-core';
import { setWidth } from './lib/viewport.mjs';
import { signIn, assertAuthed } from './lib/authed-page.mjs';

const base = process.env.BASE || 'http://127.0.0.1:5199';
const wArg = process.argv[2] || '1440,390';
const WIDTHS = wArg.split(',').map(Number);
const TABS = (process.env.TABS || 'overview,roster,schedule,practices,lifts,medical,games,activity').split(',');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const j = await (await fetch('http://127.0.0.1:9222/json/version')).json();
const browser = await puppeteer.connect({ browserWSEndpoint: j.webSocketDebuggerUrl, protocolTimeout: 90000, defaultViewport: null });
const page = await browser.newPage();
let bad = 0, total = 0;
try {
  await setWidth(page, 1440, 900);
  await signIn(page, base);
  if (!(await assertAuthed(page, base, '/coach/bhbc/overview'))) throw new Error('not signed in');
  for (const W of WIDTHS) for (const t of TABS) {
    await page.goto(`${base}/coach/bhbc/${t}`, { waitUntil: 'domcontentloaded' });
    await setWidth(page, W, W > 600 ? 900 : 844);
    await wait(3500);
    if (process.env.BREAK_CSS) await page.addStyleTag({ content: process.env.BREAK_CSS });   // the break test: prove a broken layout is caught
    // A ZERO MUST SAY WHAT IT MEASURED: wait until the tab has painted its title strips (a loading screen has none)
    for (let k = 0; k < 20 && !(await page.evaluate(() => document.querySelectorAll('.bhbc-zone .title-strip').length).catch(() => 0)); k++) await wait(500);
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((e) => /^\s*(maybe later)\s*$/i.test(e.textContent || '')); if (b) b.click(); });
    const modes = t === 'schedule' ? ['Month', 'Week', 'List'] : [''];
    for (const m of modes) {
      if (m) { await page.evaluate((m) => { const b = [...document.querySelectorAll('button')].find((e) => (e.textContent || '').trim().toLowerCase() === m.toLowerCase()); if (b) b.click(); }, m); await wait(900); }
      const res = await page.evaluate(() => {
        const zone = document.querySelector('.bhbc-zone') || document.body;
        const out = []; let n = 0;
        const seen = new Set();
        const vis = (cs, s) => parseFloat(cs[`border${s}Width`]) > 0 && cs[`border${s}Style`] !== 'none' && !/rgba\(\d+, \d+, \d+, 0\)|transparent/.test(cs[`border${s}Color`]);
        for (const e of zone.querySelectorAll('*')) {
          if (e.closest('svg,.bhbc-header-inner,[role=dialog]')) continue;
          if (e.closest('[aria-hidden="true"]')) continue;
          const cs = getComputedStyle(e);
          if (cs.visibility === 'hidden' || cs.display === 'none') continue;
          const r = e.getBoundingClientRect();
          if (r.width < 4 || r.height < 8 || r.height > 60) continue;
          const sides = ['Top', 'Bottom', 'Left', 'Right'].filter((s) => vis(cs, s)).length;
          const bg = cs.backgroundColor;
          const filled = bg && !/rgba\(\d+, \d+, \d+, 0\)|transparent/.test(bg) && e.parentElement && getComputedStyle(e.parentElement).backgroundColor !== bg;
          const isCtl = /^(BUTTON|A|INPUT|SELECT|TEXTAREA)$/.test(e.tagName) || /^(button|tab)$/.test(e.getAttribute('role') || '');
          if (sides < 4 && !(isCtl && filled)) continue;
          const txt = (e.innerText || e.value || '').replace(/\s+/g, ' ').trim();
          if (!txt && !isCtl) continue;
          if (Math.abs(r.width - r.height) < 2 && r.width <= 40) continue;
          if (e.closest('.bhbc-cal-cell') && e.classList.contains('bhbc-cal-cell')) continue;
          const key = Math.round(r.top) + ':' + Math.round(r.left);
          if (seen.has(key)) continue; seen.add(key);
          n++;
          const h = Math.round(r.height * 10) / 10;
          // the spec: a title strip is 41; a control nested IN a strip is the
          // nested height (26, 32 on touch); everything else that paints a box is 36
          if (e.parentElement && e.parentElement.closest('[data-strip-toggle]') && e.hasAttribute('data-strip-toggle') && e.tagName === 'BUTTON') continue;   // a segment of a segmented group: the group is the control
          // a FILLED segment (#514: the logged S&C is tinted) is still the row's own
          // segment when it spans the chip's whole inner height - a state of the row,
          // not a box drawn inside it. A shorter fill is a box in a box and stays caught.
          if (e.classList.contains('bhbc-seg') && sides < 4) { const chip = e.closest('.bhbc-chip'); if (chip && Math.abs(h - chip.clientHeight) <= 1) continue; }
          const nested = !!e.parentElement && !!e.parentElement.closest('.title-strip');
          const want = e.classList.contains('title-strip') ? 41 : nested ? (matchMedia('(pointer: coarse)').matches ? 32 : 26) : 36;
          if (Math.abs(h - want) > 1) out.push({ tag: e.tagName.toLowerCase(), h, w: Math.round(r.width), txt: txt.slice(0, 34), cls: String(e.className || '').slice(0, 30) });
        }
        // grid rows (Lifts, Practice Attendance, every .hl-rows list) never under 36
        for (const r of zone.querySelectorAll('.hl-rows > *')) { const h = r.getBoundingClientRect().height; if (h && h < 35.5) out.push({ tag: 'row', h: Math.round(h * 10) / 10, w: Math.round(r.getBoundingClientRect().width), txt: (r.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 34), cls: 'hl-rows' }); }
        return { list: out, n };
      });
      total += res.n; const list = res.list;
      if (!res.n) { bad++; console.log(`${W} ${t}${m ? '/' + m : ''}: UNMEASURED - nothing painted a box, the tab never loaded`); continue; }
      const label = `${W} ${t}${m ? '/' + m : ''}`;
      if (list.length) { bad += list.length; console.log(`
${label}: ${list.length} of ${res.n}`); for (const r of list.slice(0, 40)) console.log(`   ${r.h}px  ${r.w}w  <${r.tag}${r.cls ? '.' + r.cls : ''}> ${r.txt}`); }
      else console.log(`${label}: 0 of ${res.n}`);
    }
  }
} finally {
  await page.close().catch(() => {});
  browser.disconnect();
}
console.log(`
BHBC BOXES OFF THE SPEC: ${bad} of ${total} measured`);
process.exit(bad ? 1 : 0);
