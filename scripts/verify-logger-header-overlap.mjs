// THE LOGGER'S TOP BAR NEVER PRINTS ONE LABEL OVER ANOTHER (9.10 #585).
//
// The day label ("DAY A · W1") is absolutely centred on the bar, outside the
// flow, so nothing can push it aside. A resumed workout put "↻ RESUMED" in the
// right cluster beside the crest and EXIT, and at 390 the cluster reached into
// the centre: the two labels printed on top of each other. It shows only while
// a resumed session's pill is up, so every static sweep missed it.
//
// This gate reaches that state for real on the public demo athlete (anonymous,
// nothing written to the database): open Day A, step once (the draft is saved
// to this browser), reload, open Day A again -> resumed. Then, at each width,
// the day label's ink box must not intersect any other text or image in the bar.
//
//   BASE=http://127.0.0.1:5341 CDP=http://127.0.0.1:9446 node scripts/verify-logger-header-overlap.mjs
import P from 'puppeteer-core';

const BASE = process.env.BASE || 'http://127.0.0.1:5341';
const CDP = process.env.CDP || 'http://127.0.0.1:9446';
const WIDTHS = (process.argv[2] || '360,390,430').split(',').map(Number);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const clickText = (page, re) => page.evaluate((src) => {
  const rx = new RegExp(src, 'i');
  const el = [...document.querySelectorAll('button,[role=button]')].find((x) => rx.test((x.textContent || '').trim()));
  if (el) { el.click(); return (el.textContent || '').trim().slice(0, 40); }
  return null;
}, re.source);

let bad = 0, measured = 0;
const b = await P.connect({ browserURL: CDP });
for (const w of WIDTHS) {
  const page = await b.newPage();
  await page.setViewport({ width: w, height: 860, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  try {
    await page.goto(BASE + '/demo/athlete', { waitUntil: 'domcontentloaded' });
    await wait(5000);
    await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (/session|draft|wk/i.test(k)) localStorage.removeItem(k); });
    const first = await clickText(page, /^(START|AGAIN)$/);
    if (!first) { bad++; console.log(`FAIL ${w}: no START/AGAIN on the demo athlete - nothing measured`); continue; }
    await wait(2500);
    await clickText(page, /^NEXT/);
    await wait(2000);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await wait(5000);
    await clickText(page, /^(START|AGAIN|RESUME)/);
    await wait(2500);
    const r = await page.evaluate(() => {
      const label = [...document.querySelectorAll('span')].find((s) => /·\s*W\d+$/.test((s.textContent || '').trim()));
      if (!label) return { err: 'no day label in the logger bar' };
      const bar = label.parentElement;
      const BR = bar.getBoundingClientRect();
      const resumed = /RESUMED|הופעל מחדש/.test(document.body.innerText);
      const ink = (el) => { const rg = document.createRange(); rg.selectNodeContents(el); const rs = [...rg.getClientRects()].filter((x) => x.width > 0); if (!rs.length) return null; return { l: Math.min(...rs.map((x) => x.left)), r: Math.max(...rs.map((x) => x.right)), t: Math.min(...rs.map((x) => x.top)), b: Math.max(...rs.map((x) => x.bottom)) }; };
      const L0 = ink(label); const LB = label.getBoundingClientRect(); const L = L0 && { ...L0, l: Math.max(L0.l, LB.left), r: Math.min(L0.r, LB.right) };
      const others = [...bar.querySelectorAll('span,img,button,svg')].filter((e) => e !== label && !label.contains(e) && !e.contains(label));
      const hits = [];
      for (const o of others) {
        const box = o.tagName === 'IMG' || o.tagName === 'svg' ? o.getBoundingClientRect() : ink(o);
        if (!box || (box.width === 0 && box.r - box.l === 0)) continue;
        const R = 'r' in box ? box : { l: box.left, r: box.right, t: box.top, b: box.bottom };
        if (R.l < L.r - 0.5 && R.r > L.l + 0.5 && R.t < L.b - 0.5 && R.b > L.t + 0.5) hits.push(`${o.tagName.toLowerCase()} "${(o.textContent || o.getAttribute('alt') || '').trim().slice(0, 20)}" [${Math.round(R.l)}-${Math.round(R.r)}]`);
      }
      return { resumed, label: (label.textContent || '').trim(), L: [Math.round(L.l), Math.round(L.r)], hits: [...new Set(hits)], off: Math.round(((L.l + L.r) / 2 - (BR.left + BR.right) / 2) * 10) / 10, cut: [label, ...label.children].some((e) => e.scrollWidth > e.clientWidth + 1), week: /W\d+/.test(label.innerText), barOverflow: bar.scrollWidth > bar.clientWidth + 1 };
    });
    if (process.env.SHOT) await page.screenshot({ path: `${process.env.SHOT}/logger-resumed-${w}.png`, clip: { x: 0, y: 0, width: w, height: 150 } });
    if (r.err) { bad++; console.log(`FAIL ${w}: ${r.err}`); continue; }
    if (!r.resumed) { bad++; console.log(`FAIL ${w}: the logger did not resume - the state this gate exists for was not reached`); continue; }
    measured++;
    if (r.hits.length) { bad++; console.log(`FAIL ${w}: "${r.label}" [${r.L.join('-')}] is overlapped by ${r.hits.join(', ')}`); }
    else if (!r.week) { bad++; console.log(`FAIL ${w}: the week number is not visible in "${r.label}"`); }
    else if (r.barOverflow) { bad++; console.log(`FAIL ${w}: the bar overflows its width`); }
    else console.log(`ok   ${w}: resumed, "${r.label}" [${r.L.join('-')}] clear of everything else in the bar; ${r.off}px from the bar centre${r.cut ? ', TRUNCATED to fit' : ''}`);
  } finally { await page.close(); }
}
await b.disconnect();
console.log(`LOGGER HEADER OVERLAP: ${measured}/${WIDTHS.length} widths measured in the resumed state, ${bad} failed`);
process.exit(bad ? 1 : 0);
