// Crops of the Hebrew gym page sections whose copy changed on 17.9 (390px phone).
import P from 'puppeteer-core';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await P.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
const pg = await b.newPage();
await pg.emulate({ viewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
await pg.goto('http://127.0.0.1:4174/he#/gym', { waitUntil: 'domcontentloaded' }); await wait(4000);
const needles = ['שלושה עמודי תווך', 'רק 4–7 בקבוצה', 'כמה עולה חודש', 'המיקום המדויק', 'מתיחות בסוף'];
let i = 0;
for (const n of needles) {
  const box = await pg.evaluate((needle) => {
    const el = [...document.querySelectorAll('h1,h2,h3,h4,p,div,span,li,button,summary')].filter((e) => (e.textContent || '').includes(needle)).sort((a, b) => a.textContent.length - b.textContent.length)[0];
    if (!el) return null;
    const host = el.closest('section') || el.parentElement;
    host.scrollIntoView({ block: 'start' });
    return true;
  }, n);
  if (!box) { console.log('not found', n); continue; }
  await wait(900);
  await pg.screenshot({ path: `audit-out/shots-0917/mk-gym-${i++}.png` });
  console.log('shot', n);
}
await pg.close(); b.disconnect();
