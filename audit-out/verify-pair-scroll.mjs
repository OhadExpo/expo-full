// Does scrolling one pane of a pair move the other? Measured, not assumed.
//   node audit-out/verify-pair-scroll.mjs [url]
import P from 'puppeteer-core';
const URL = process.argv[2] || 'http://127.0.0.1:4181/';
const b = await P.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
const pg = await b.newPage();
await pg.goto(URL, { waitUntil: 'load', timeout: 120000 });
await new Promise((r) => setTimeout(r, 2500));
const res = await pg.evaluate(async () => {
  const out = [];
  for (const pair of document.querySelectorAll('.pair')) {
    const shots = [...pair.querySelectorAll('.shot')];
    if (shots.length < 2) continue;
    const [a, c] = shots;
    const ra = a.scrollHeight - a.clientHeight, rc = c.scrollHeight - c.clientHeight;
    if (ra <= 0 || rc <= 0) { out.push({ id: pair.closest('section')?.id, skipped: 'nothing to scroll', ra, rc }); continue; }
    a.scrollTop = Math.round(ra * 0.5);
    a.dispatchEvent(new Event('scroll'));
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const fa = a.scrollTop / ra, fc = c.scrollTop / rc;
    out.push({ id: pair.closest('section')?.id, ha: a.clientHeight, hc: c.clientHeight, fa: +fa.toFixed(3), fc: +fc.toFixed(3), ok: Math.abs(fa - fc) < 0.01 && a.clientHeight === c.clientHeight });
  }
  return out;
});
for (const r of res) console.log(JSON.stringify(r));
const bad = res.filter((r) => !r.skipped && !r.ok);
console.log(`${res.length - bad.length}/${res.length} pairs mirror`);
await pg.close();
b.disconnect();
process.exit(bad.length ? 1 : 0);
