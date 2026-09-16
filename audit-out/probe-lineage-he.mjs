// probe-lineage-he.mjs — the coach's Training Analysis page (TrainingLineageV2)
// in Hebrew and English, desktop and a real phone emulation, via /demo/coach
// (mock data only). Opens every section, screenshots the page, and reports
// every Latin run left in the Hebrew text so a missed string cannot hide.
//   BASE=http://127.0.0.1:4173 node audit-out/probe-lineage-he.mjs <outdir>
import P from 'puppeteer-core';
import fs from 'node:fs';
const BASE = process.env.BASE || 'http://127.0.0.1:4173';
const OUT = process.argv[2] || 'audit-out/lineage-he';
fs.mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await P.connect({ browserURL: process.env.CDP || 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 300000 });

async function clickText(pg, re) {
  return pg.evaluate((src) => {
    const rx = new RegExp(src);
    const el = [...document.querySelectorAll('button, a, [role="button"], [role="tab"]')].find((e) => rx.test((e.innerText || '').trim()) && e.offsetParent !== null);
    if (el) { el.click(); return (el.innerText || '').trim(); }
    return null;
  }, re.source);
}

const results = [];
for (const lang of ['he', 'en']) {
  for (const vp of [{ name: 'desk', width: 1400, height: 900, mobile: false }, { name: 'phone', width: 390, height: 844, mobile: true }]) {
    const pg = await b.newPage();
    await pg.emulate({ viewport: { width: vp.width, height: vp.height, deviceScaleFactor: vp.mobile ? 3 : 1, isMobile: vp.mobile, hasTouch: vp.mobile }, userAgent: vp.mobile ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' : (await b.userAgent()) });
    await pg.goto(`${BASE}/demo/coach?lang=${lang}`, { waitUntil: 'domcontentloaded' });
    await wait(6000);
    await clickText(pg, /^(ATHLETES|מתאמנים)/);
    await wait(1200);
    const nav = await clickText(pg, /^(PROGRAMS|Programs|תוכניות)$/);
    await wait(1500);
    const view = await clickText(pg, /^(ANALYSIS|Analysis|ניתוח.*)$/);
    if (!nav || !view) console.error(lang, vp.name, 'visible controls:', await pg.evaluate(() => [...document.querySelectorAll('button, a, [role="button"], [role="tab"]')].filter((e) => e.offsetParent).map((e) => (e.innerText || '').trim().replace(/\s+/g, ' ')).filter(Boolean).slice(0, 45).join(' | ')));
    await wait(2500);
    // The real app puts dir="rtl" on .app-root in Hebrew; the demo does not.
    // RTL=1 applies it to #root so the page is judged the way the app shows it.
    if (process.env.RTL === '1' && lang === 'he') await pg.evaluate(() => { document.getElementById('root').setAttribute('dir', 'rtl'); });
    await wait(300);
    // open every collapsed section (strip headers are role=button with aria-expanded / a chevron)
    for (let i = 0; i < 3; i++) {
      await pg.evaluate(() => {
        document.querySelectorAll('.lin-hd[role="button"]').forEach((h) => {
          const exp = h.getAttribute('aria-expanded');
          if (exp === 'false') h.click();
        });
      });
      await wait(400);
    }
    // the arc + key-lifts headers have no aria-expanded: open if their body is missing
    await pg.evaluate(() => {
      document.querySelectorAll('.lin-hd[role="button"]:not([aria-expanded])').forEach((h) => {
        const next = h.nextElementSibling;
        if (!next) h.click();
      });
    });
    await wait(800);
    const info = await pg.evaluate(() => {
      const hd = document.querySelector('.lin-hd');
      const root = hd ? hd.closest('div[style*="max-width: 980px"]') || hd.parentElement.parentElement : null;
      if (!root) return { found: false };
      const text = root.innerText || '';
      const latin = (text.match(/[A-Za-z][A-Za-z'’.\-]{2,}(?:\s+[A-Za-z][A-Za-z'’.\-]*)*/g) || []);
      const r = root.getBoundingClientRect();
      return { found: true, chars: text.length, latin: [...new Set(latin)], dir: getComputedStyle(root).direction, overflowX: document.documentElement.scrollWidth > window.innerWidth, top: r.top + window.scrollY, height: r.height };
    });
    const file = `${OUT}/lineage-${lang}-${vp.name}.png`;
    if (info.found) {
      await pg.screenshot({ path: file, fullPage: true });
    }
    results.push({ lang, vp: vp.name, nav, view, ...info, file });
    await pg.close();
  }
}
b.disconnect();
console.log(JSON.stringify(results, null, 2));
