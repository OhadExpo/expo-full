// verify-shot-preflight-ui.mjs — the preflight has to appear ON THE SCREEN,
// with the reason and a way past it, within seconds of picking a clip.
//
// The module is verified separately (verify-clip-preflight.mjs, against the
// documented ground truth on clip02). This one proves the SCREEN: a coach who
// picks a clip that cannot be measured sees why, in his own language, before
// the five-minute capture starts - and can still overrule it.
//
//   node scripts/verify-shot-preflight-ui.mjs
import P from 'puppeteer-core';
import { signIn, assertAuthed } from './lib/authed-page.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:5202';
const CLIP = process.env.CLIP_FILE || 'public/testclips/_corpus/c06.mp4';  // 0/12 frames tracked
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const b = await P.connect({ browserURL: (process.env.CDP || 'http://127.0.0.1:9222'), defaultViewport: null, protocolTimeout: 900000 });
const pg = await b.newPage();
await pg.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
let bad = 0;
try {
  await signIn(pg, BASE);
  await assertAuthed(pg, BASE);
  await pg.goto(BASE + '/coach/review-tools', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await wait(6000);

  // Open the Shot Analyzer.
  const opened = await pg.evaluate(() => {
    // The tile is a role=button DIV whose aria-label starts with the tool name.
    // Matching on "any element containing the text" clicked the page container
    // and the check still said "found it" - the tool never opened.
    const el = [...document.querySelectorAll('[role=button]')]
      .find((e) => e.offsetParent && /^shot analyz|^ניתוח זריק/i.test(e.getAttribute('aria-label') || ''));
    if (!el) return false;
    el.click();
    return true;
  });
  if (!opened) { console.log('FAILED: could not find the Shot Analyzer tile on /coach/review-tools.'); bad++; }
  await wait(5000);

  const input = await pg.$('input[type=file][accept^="video"]');
  if (!input) { console.log('FAILED: no video file input on the Shot Analyzer screen.'); bad++; }
  else {
    const t0 = Date.now();
    await input.uploadFile(CLIP);
    // The whole point is that this is FAST. Anything past 40s and a coach has
    // already put the phone away.
    let seen = null;
    for (let i = 0; i < 40; i++) {
      await wait(1000);
      seen = await pg.evaluate(() => {
        const txt = (document.body.innerText || '');
        return {
          preflight: /CANNOT BE MEASURED|אי אפשר למדוד/i.test(txt),
          anyway: !!([...document.querySelectorAll('button')].find((e) => /ANALYSE ANYWAY|לנתח בכל זאת/i.test(e.innerText || ''))),
          refilm: !!([...document.querySelectorAll('button')].find((e) => /FILM IT AGAIN|לצלם שוב/i.test(e.innerText || ''))),
          // Any reason, not one clip's wording: a gate pinned to c06's
          // sentence reports "no reason shown" on every other clip.
          reason: (txt.match(/(No one could be tracked|could only be tracked in|will leave the top|fills only|is very dark|is only [0-9]+x[0-9]+)[^\n]*/i) || [])[0] || null,
          measured: /MEASURED|מדדנו/i.test(txt),
          raw: txt.replace(/\s+/g, ' ').slice(0, 180),
          // A warning that is painted the same colour as every other heading
          // does not read as a warning. Check the pixels, not the source.
          titleColor: (() => {
            const h = [...document.querySelectorAll('div')].find((e) => /CANNOT BE MEASURED|אי אפשר למדוד/i.test((e.textContent || '')) && !e.children.length);
            return h ? getComputedStyle(h).color : null;
          })(),
        };
      });
      if (seen.preflight) break;
    }
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    if (!seen || !seen.preflight) {
      console.log(`FAILED: the preflight screen never appeared within 40s of picking a clip with 0/12 frames tracked.`);
      console.log('  page said: ' + (seen ? seen.raw : '(nothing)'));
      bad++;
    } else {
      console.log(`preflight shown after ${secs}s`);
      if (!seen.reason) { console.log('FAILED: the screen does not say WHY - no reason line found.'); bad++; }
      else console.log('  reason: ' + seen.reason.slice(0, 120));
      if (!seen.measured) { console.log('FAILED: the numbers behind the verdict are not shown, so it cannot be argued with.'); bad++; }
      if (!seen.anyway) { console.log('FAILED: no way to overrule it - a preflight must never be a hard stop.'); bad++; }
      if (!seen.refilm) { console.log('FAILED: no way back to pick another clip.'); bad++; }
      console.log('  title colour: ' + seen.titleColor);
      if (seen.titleColor && /57, *189, *255/.test(seen.titleColor)) {
        console.log('FAILED: the warning heading is painted the brand cyan - it reads as a normal heading.');
        bad++;
      }
      await pg.screenshot({ path: 'audit-out/shot-preflight-390.png' });
      console.log('  audit-out/shot-preflight-390.png');
    }
  }
} catch (e) {
  console.log('FAILED: ' + String(e.message || e).slice(0, 180));
  bad++;
}
await pg.close();
b.disconnect();
console.log(bad ? `${bad} problem(s)` : '0 - the preflight screen works');
process.exit(bad ? 1 : 0);
