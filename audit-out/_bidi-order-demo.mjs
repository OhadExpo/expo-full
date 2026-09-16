// Visual order (left→right) of the phone number and a signed delta on the Hebrew demo roster.
import P from 'puppeteer-core';
const w = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await P.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
const pg = await b.newPage(); await pg.setViewport({ width: 1400, height: 900 });
await pg.goto('http://127.0.0.1:4173/demo/coach?lang=he', { waitUntil: 'domcontentloaded' }); await w(6000);
await pg.evaluate(() => { const el = [...document.querySelectorAll('nav button, header button')].find((e) => /מתאמנים/.test(e.innerText)); el && el.click(); }); await w(2000);
const r = await pg.evaluate(() => {
  const order = (node) => { const g = []; const tw = document.createTreeWalker(node, NodeFilter.SHOW_TEXT); let n; while ((n = tw.nextNode())) for (let i = 0; i < n.data.length; i++) { if (!/[0-9+\-.]/.test(n.data[i])) continue; const rg = document.createRange(); rg.setStart(n, i); rg.setEnd(n, i + 1); g.push([rg.getBoundingClientRect().x, n.data[i]]); } return g.sort((a, c) => a[0] - c[0]).map((x) => x[1]).join(''); };
  const phone = [...document.querySelectorAll('div')].find((d) => /^\+972\d+$/.test((d.textContent || '').trim()));
  const delta = [...document.querySelectorAll('span[dir="ltr"]')].find((s) => /^[+-]?\d+\.\d$/.test((s.textContent || '').trim()));
  return { dir: document.querySelector('[data-theme="dark"]')?.getAttribute('dir'), phone: phone && order(phone), delta: delta && order(delta), deltaText: delta && delta.textContent.trim() };
});
console.log(JSON.stringify(r));
await pg.close(); b.disconnect();
