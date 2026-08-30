// verify-shot-height-live.mjs — the height box must reach the numbers.
//
// Ohad, 2026-08-30: "the top analyzer of hand/shot type doesnt work, and the
// height still doesnt get updated when i log it." His screenshot showed
// HEIGHT 177 in the box and ENTER HEIGHT on the jump-rise card at once.
//
// The maths was never wrong: the same frames scored with statureCm 177 return
// jump rise 42 cm. The gate was wrong. All three controls only re-scored
// `if (phase === 'results')`, and analyze() closed over the height as it stood
// at upload - so a height typed WHILE the clip was analysing was dropped
// twice. That is exactly when a coach types it, because that is the minute the
// box is on screen with nothing else to do.
//
// Two scenarios, because they fail differently:
//   after  - type it once results are up. This path always worked.
//   during - type it mid-analysis. This is the one that lost it.
//
//   node scripts/verify-shot-height-live.mjs [base] [after|during]
import puppeteer from 'puppeteer-core';
import { signIn } from './lib/authed-page.mjs';

const BASE = process.argv[2] || 'http://127.0.0.1:5199';
const MODE = (process.argv[3] || 'after').toLowerCase();
const CLIP = process.cwd() + '/public/testclips/clip02.mp4';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const b = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
const page = await b.newPage();
await page.setViewport({ width: 1500, height: 1000 });
let bad = 0;

const jumpRise = () => page.evaluate(() => {
  const m = (document.body.innerText || '').match(/Jump rise[^\n]*\n?([^\n]*)/i);
  return m ? (m[0] || '').replace(/\n/g, ' ').trim().slice(0, 40) : '(no jump rise row)';
});

// Focus and blur for REAL. React routes onBlur through focusout, which a
// synthetic new Event('blur') never fires - an earlier version of this check
// dispatched one and reported a working app as broken.
const typeHeight = () => page.evaluate(() => {
  const el = [...document.querySelectorAll('input')].find((x) => x.inputMode === 'numeric' || /cm/i.test(x.placeholder || ''));
  if (!el) return false;
  el.focus();
  const d = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value');
  d.set.call(el, '177');
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.blur();
  return true;
});

const waitForResults = async () => {
  for (let i = 0; i < 90; i++) {
    await wait(5000);
    if (await page.evaluate(() => /Jump rise/i.test(document.body.innerText || ''))) return true;
  }
  return false;
};

try {
  await signIn(page, BASE);
  // A remembered height would hide the very bug being tested.
  await page.evaluate(() => { try { localStorage.removeItem('expo-shot-stature'); } catch { /* private */ } });

  await page.goto(`${BASE}/coach/review-tools`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await wait(9000);
  // The tool row is a clickable DIV, not a button, and the word OPEN inside it
  // is a bare span - so target the SMALLEST element holding both.
  const opened = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('div')].filter((e) => {
      const t = e.innerText || '';
      return /SHOT ANALYZER|SHOT ANALYSER/i.test(t) && /open/i.test(t) && e.offsetParent;
    });
    const row = rows.sort((x, y) => (x.innerText || '').length - (y.innerText || '').length)[0];
    if (row) { row.click(); return true; }
    return false;
  });
  if (!opened) { console.log('FAIL - no OPEN row for the Shot Analyzer'); process.exit(1); }
  await wait(6000);

  const input = await page.$('input[type=file]');
  if (!input) { console.log('FAIL - no file input; the tool did not open'); process.exit(1); }
  await input.uploadFile(CLIP);
  console.log(`[${MODE}] uploaded, analysing (real pose, allow several minutes)...`);

  if (MODE === 'chips') {
    // "the top analyzer of hand/shot type doesnt work" - a chip that changes
    // nothing on screen IS broken, whatever the state says.
    if (!(await waitForResults())) { console.log('FAIL - analysis never produced results'); process.exit(1); }
    const snap = () => page.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' '));
    const clickChip = (rx) => page.evaluate((src) => {
      const re = new RegExp(src, 'i');
      const el = [...document.querySelectorAll('button')].find((x) => re.test((x.textContent || '').trim()) && x.offsetParent);
      if (!el) return null;
      el.click();
      return (el.textContent || '').trim().slice(0, 14);
    }, rx.source);

    for (const [label, rx] of [['hand', /^L$|^LEFT/], ['shot type', /^3PT|THREE/]]) {
      const before = await snap();
      const hit = await clickChip(rx);
      if (!hit) { console.log(`FAIL - no ${label} chip on screen`); bad = 1; continue; }
      await wait(2500);
      const changed = (await snap()) !== before;
      console.log(`${label.padEnd(10)} clicked "${hit}" -> ${changed ? 'PASS readings changed' : 'FAIL nothing changed'}`);
      if (!changed) bad = 1;
    }
    await page.screenshot({ path: 'audit-out/shot-height-chips.png' });
    await page.close().catch(() => {});
    b.disconnect();
    process.exit(bad);
  }

  if (MODE === 'during') {
    // Type it while the progress bar is still moving, then never touch the
    // screen again. Whatever the card says next is what the coach would see.
    await wait(6000);
    const phaseNow = await page.evaluate(() => /Jump rise/i.test(document.body.innerText || '') ? 'results' : 'analysing');
    if (!(await typeHeight())) { console.log('FAIL - no height input during analysis'); process.exit(1); }
    console.log(`typed 177 while phase = ${phaseNow}`);
    if (!(await waitForResults())) { console.log('FAIL - analysis never produced results'); process.exit(1); }
  } else {
    if (!(await waitForResults())) { console.log('FAIL - analysis never produced results'); process.exit(1); }
    console.log('with no height :', await jumpRise());
    if (!(await typeHeight())) { console.log('FAIL - no height input on screen'); process.exit(1); }
    await wait(2500);
  }

  const after = await jumpRise();
  console.log('reads          :', after);
  const gotNumber = /\d+\s*cm/i.test(after);
  console.log(gotNumber ? `PASS - [${MODE}] the height reaches the numbers` : `FAIL - [${MODE}] card still reads "${after}"`);
  if (!gotNumber) bad = 1;
  await page.screenshot({ path: `audit-out/shot-height-${MODE}.png` });
} catch (e) {
  console.log('ERROR:', String(e.message || e).split('\n')[0]);
  bad = 1;
} finally {
  await page.close().catch(() => {});
  b.disconnect();
}
process.exit(bad);
