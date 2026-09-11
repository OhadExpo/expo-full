// Measure the line box of Nord vs Heebo at the same size, on the running app,
// so the Heebo face can be given ascent/descent overrides that match Nord.
//   CDP=http://127.0.0.1:9223 node audit-out/probe-font-metrics.mjs [base]
import P from 'puppeteer-core';
const BASE = process.argv[2] || 'http://127.0.0.1:4173';
const b = await P.connect({ browserURL: process.env.CDP || 'http://127.0.0.1:9222', defaultViewport: null });
const ctx = await b.createBrowserContext();
const pg = await ctx.newPage();
await pg.goto(BASE + '/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 4000));
const out = await pg.evaluate(async () => {
  await document.fonts.ready;
  const probe = (family, text, weight) => {
    const s = document.createElement('span');
    s.textContent = text; s.style.cssText = `font-family:${family};font-size:100px;line-height:normal;font-weight:${weight};position:absolute;top:-9999px;left:0;white-space:nowrap`;
    document.body.appendChild(s);
    const r = s.getBoundingClientRect();
    // baseline via an inline-block zero-height marker
    const m = document.createElement('span'); m.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline'; s.appendChild(m);
    const base = m.getBoundingClientRect().top - r.top;
    s.remove();
    return { h: Math.round(r.height * 10) / 10, ascent: Math.round(base * 10) / 10, descent: Math.round((r.height - base) * 10) / 10 };
  };
  const res = {};
  for (const w of [400, 700]) {
    res[`nord-${w}`] = probe("'Nord'", 'ABCgjp', w);
    res[`heebo-${w}`] = probe("'Heebo'", 'אבגלףק', w);
    res[`mixed-${w}`] = probe("'Nord','Heebo'", 'ABC אבג', w);
    res[`stack-he-${w}`] = probe("'Nord','Heebo'", 'אבגלףק', w);
  }
  res.loaded = [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family + ' ' + f.weight).join(', ');
  return res;
});
console.log(JSON.stringify(out, null, 1));
await ctx.close(); b.disconnect();
