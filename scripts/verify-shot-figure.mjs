// verify-shot-figure — drives the marketing site's SHOT card through its phases
// and checks the figure behaves like a jump shot.
//
// Needs a running preview of expo-il plus the debug Chrome on :9222, so it is
// NOT part of `npm test` (which is pure node). Run it when the mock changes:
//   cd expo-il && npx vite preview --port 4182 --strictPort &
//   node scripts/verify-shot-figure.mjs http://localhost:4182/#/online
//
// Reads the REAL rendered SVG at a series of phases and checks it behaves like
// a jump shot: the body dips then rises, the
// arm extends, the ball leaves the hand and arcs. Cheaper and far more reliable
// than judging a mock from screenshots.
import puppeteer from 'puppeteer-core';
const [, , url] = process.argv;
const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222', defaultViewport: null });
const page = await browser.newPage();
await page.setViewport({ width: 1000, height: 900 });
await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise(r => setTimeout(r, 1000));
await page.evaluate(() => {
  const g = document.querySelector('.fv-inside-grid');
  const card = g.children[3];
  (card.querySelector('[role="button"], button') || card.firstElementChild).click();
});
await new Promise(r => setTimeout(r, 800));

const rows = [];
for (const pct of [0, 15, 30, 45, 62, 83, 92, 100]) {
  await page.evaluate((v) => {
    const el = document.querySelector('[role="dialog"] input[type="range"]');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(el, String(v));
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, pct);
  await new Promise(r => setTimeout(r, 120));
  const row = await page.evaluate(() => {
    // The modal also contains icon SVGs (the close button) — the figure is the
    // one drawn in the 100x140 body space.
    const svg = [...document.querySelectorAll('[role="dialog"] svg')]
      .find(s2 => (s2.getAttribute('viewBox') || '').trim() === '0 0 100 140');
    if (!svg) return { err: 'no figure svg', svgs: [...document.querySelectorAll('[role="dialog"] svg')].map(s2 => s2.getAttribute('viewBox')) };
    const circles = [...svg.querySelectorAll('circle')];
    // The ball is the r=4.6 circle; joints are r=1.6; the head is r=6.
    const ball = circles.find(c => Math.abs(+c.getAttribute('r') - 4.6) < 0.01);
    const head = circles.find(c => Math.abs(+c.getAttribute('r') - 6) < 0.01);
    const dlg = document.querySelector('[role="dialog"]');
    const badges = [...dlg.querySelectorAll('div')]
      .map(d => d.textContent.trim())
      .filter(t => /^(ELBOW \d+°|DIP|SET|RELEASE|FOLLOW)$/.test(t));
    return {
      ballX: +(+ball.getAttribute('cx')).toFixed(1),
      ballY: +(+ball.getAttribute('cy')).toFixed(1),
      headY: +(+head.getAttribute('cy')).toFixed(1),
      badges: [...new Set(badges)],
      arc: !!svg.querySelector('path[stroke-dasharray]'),
    };
  });
  if (row.err) { console.log('PROBE:', JSON.stringify(row)); break; }
  rows.push({ pct, ...row });
}
console.log(JSON.stringify(rows, null, 0).replace(/},/g, '},\n'));

// ---- assertions -----------------------------------------------------------
let bad = 0;
const at = (p) => rows.find(r => r.pct === p);
const check = (name, ok) => { if (!ok) { bad++; console.log('  FAIL ' + name); } };
check('every value is a real number', rows.every(r => [r.ballX, r.ballY, r.headY].every(Number.isFinite)));
check('the body dips before it rises', at(30).headY > at(0).headY && at(100).headY < at(30).headY);
check('the ball starts held, near the head height', Math.abs(at(0).ballY - at(0).headY) < 30);
check('the ball travels forward after the release', at(100).ballX > at(83).ballX + 10);
check('the ball is above where it left the hand', at(100).ballY < at(83).ballY);
// The defect this probe actually caught: at the first tuning the ball climbed
// past y=0 and flew off the top of the phone.
check('the ball never leaves the frame', rows.every(r => r.ballY - 4.6 >= 0 && r.ballY + 4.6 <= 140 && r.ballX - 4.6 >= 0 && r.ballX + 4.6 <= 100));
check('the head stays in frame', rows.every(r => r.headY - 6 >= 0));
check('no flight arc before the release', at(62).arc === false);
check('an arc is drawn after the release', at(100).arc === true);
check('phase reads DIP early', at(15).badges.includes('DIP'));
check('phase reads SET at the set point', at(45).badges.includes('SET'));
check('phase reads RELEASE at the release', at(83).badges.includes('RELEASE'));
check('phase reads FOLLOW after', at(100).badges.includes('FOLLOW'));
const elbowOf = (p) => Number((at(p).badges.find(b => b.startsWith('ELBOW')) || '0').replace(/\D/g, ''));
check('the elbow opens from the set point to the release', elbowOf(83) > elbowOf(45) + 30);
check('the elbow never exceeds a straight arm', rows.every(r => elbowOf(r.pct) <= 180));
console.log(bad ? `\nSHOT FIGURE: ${bad} failed` : '\nSHOT FIGURE: all checks passed');
await page.close();
await browser.disconnect();
process.exit(bad ? 1 : 0);
