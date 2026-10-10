// verify-rail-scroll-smooth.mjs - THE TOP MENUS SCROLL WITHOUT WORK ON EVERY FRAME (9.10 #607).
//
// Ohad, 9.10: "scrolling on the top menu's on all platforms doesnt feel smooth".
// Two causes, both measurable:
//   1. scroll-snap-type: x mandatory on every top rail - the browser pulls the
//      rail onto an item edge on every scroll, fighting the finger's momentum;
//   2. the no-slice mask (useRailTrailMask) re-measured every item and rewrote
//      the rail's clip-path / edge plates on EVERY scroll event, so items at the
//      edge popped in and out instead of sliding.
// This drives each rail like a finger (small scrollLeft steps, one per frame) on
// a phone and counts, DURING the gesture: writes to the rail's / plates' style
// (each one a visible pop), style recalcs and layouts. Then it checks the rail
// at REST still slices nothing (the no-slice rule stays). And the snap type.
//
//   BASE=http://127.0.0.1:5348 CDP=http://127.0.0.1:9444 node scripts/verify-rail-scroll-smooth.mjs
import P from 'puppeteer-core';
const { BASE, CDP } = process.env;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const RAILS = [
  { name: 'coach top menu', route: '/coach/dashboard', seat: 'owner', sel: '.hdr-rail', rail: '.hdr-rail' },
  { name: 'BHBC top menu', route: '/coach/bhbc', seat: 'owner', sel: '.bhbc-header-inner', rail: '.bhbc-header-inner' },
  { name: 'demo top menu', route: '/demo/coach', seat: null, sel: '.cd-hdr', rail: '.cd-hdr' },
];
const b = await P.connect({ browserURL: CDP, defaultViewport: null });
const pg = await b.newPage();
let fails = 0, measured = 0;
try {
  await pg.emulate({ viewport: { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true }, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0 Mobile Safari/537.36' });
  const A = await import('./lib/authed-page.mjs?owner');
  let ok = false; for (let k = 0; k < 3 && !ok; k++) { await A.signIn(pg, BASE); ok = await A.assertAuthed(pg, BASE, '/coach/dashboard'); }
  if (!ok) throw new Error('owner not signed in');
  const cdp = await pg.createCDPSession(); await cdp.send('Performance.enable');
  const metric = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
  for (const R of RAILS) {
    await pg.goto(BASE + R.route, { waitUntil: 'networkidle2' }); await wait(3500);
    await pg.evaluate(() => { const x = [...document.querySelectorAll('button')].find((e) => /^(maybe later|אחר כך)$/i.test((e.innerText || '').trim())); if (x) x.click(); });
    await wait(800);
    const info = await pg.evaluate((sel) => {
      const el = [...document.querySelectorAll(sel)].find((e) => e.scrollWidth > e.clientWidth + 4) || null;
      if (!el) return null;
      el.setAttribute('data-rail-probe', '1');
      // count style writes on the scroller and on any absolutely-placed plate beside it
      window.__writes = 0;
      const mo = new MutationObserver((ms) => { window.__writes += ms.length; });
      mo.observe(el.parentElement || el, { attributes: true, attributeFilter: ['style'], subtree: true });
      window.__mo = mo;
      return { snap: getComputedStyle(el).scrollSnapType, range: el.scrollWidth - el.clientWidth };
    }, R.sel);
    if (!info) { console.log(`SKIP ${R.name}: no scrollable rail at 390`); continue; }
    measured++;
    const m0 = await metric();
    // a finger: 40 frames, 6px each, out and back
    for (let i = 0; i < 40; i++) { await pg.evaluate(() => { const el = document.querySelector('[data-rail-probe]'); el.scrollLeft += (document.dir === 'rtl' ? -6 : 6); }); await wait(16); }
    for (let i = 0; i < 40; i++) { await pg.evaluate(() => { const el = document.querySelector('[data-rail-probe]'); el.scrollLeft -= (document.dir === 'rtl' ? -6 : 6); }); await wait(16); }
    const mid = await pg.evaluate(() => window.__writes);
    const m1 = await metric();
    await wait(600);   // settle: the no-slice mask is allowed to act now
    const atRest = await pg.evaluate(() => {
      const el = document.querySelector('[data-rail-probe]'); const r = el.getBoundingClientRect();
      const cp = getComputedStyle(el).clipPath;
      // an item cut by the rail's visible edge with no clip/plate hiding it = a slice at rest
      const plates = [...(el.parentElement || el).querySelectorAll('*')].filter((n) => getComputedStyle(n).position === 'absolute' && n.offsetWidth > 0 && !el.contains(n));
      let sliced = 0;
      for (const it of el.querySelectorAll('button, a')) {
        const q = it.getBoundingClientRect(); if (q.width < 1) continue;
        const cutR = q.left < r.right - 0.5 && q.right > r.right + 0.5; const cutL = q.left < r.left - 0.5 && q.right > r.left + 0.5;
        if ((cutR || cutL) && cp === 'none' && !plates.some((p) => { const pq = p.getBoundingClientRect(); return pq.left <= Math.max(q.left, r.left) + 1 && pq.right >= Math.min(q.right, r.right) - 1; })) sliced++;
      }
      window.__mo.disconnect();
      return { sliced };
    });
    const recalc = Math.round(m1.RecalcStyleCount - m0.RecalcStyleCount), lay = Math.round(m1.LayoutCount - m0.LayoutCount);
    const okSnap = !/mandatory/.test(info.snap);
    const okWrites = mid <= 4;   // a release at the start and nothing per frame
    const okRest = atRest.sliced === 0;
    if (!(okSnap && okWrites && okRest)) fails++;
    console.log(`${okSnap && okWrites && okRest ? 'ok  ' : 'FAIL'} ${R.name.padEnd(16)} snap "${info.snap}"${okSnap ? '' : ' (mandatory fights the finger)'} | style writes during 80 frames: ${mid}${okWrites ? '' : ' (per-frame work)'} | recalcs ${recalc}, layouts ${lay} | items sliced at rest: ${atRest.sliced}`);
  }
} finally { await pg.close(); b.disconnect(); }
console.log(measured ? `\nRAIL SCROLL: ${measured} rail(s) measured, ${fails} failed` : '\nRAIL SCROLL: NOTHING MEASURED');
process.exit(!measured || fails ? 1 : 0);
