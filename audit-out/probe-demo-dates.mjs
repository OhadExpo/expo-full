// NOT TRUSTED YET - do not cite this as a passing gate.
// It reports 863 characters for /demo/athlete, the SAME number as /try, while
// a direct single-page check of that route sees 33,583 bytes of real portal.
// So it is very likely still measuring the wrong document. What IS established
// by hand: /demo/athlete renders the full portal, with and without expo-lang
// set. Finish this probe before it is added to the board.
//
// The demo surfaces render the REAL portal, so a change to the date helper
// reaches them too. No login: these are the public pages a prospect sees.
import P from 'puppeteer-core';
import { setWidth } from '../scripts/lib/viewport.mjs';
const BASE = 'http://127.0.0.1:4173';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await P.connect({ browserURL: (process.env.CDP || 'http://127.0.0.1:9222'), defaultViewport: null, protocolTimeout: 300000 });
const bad = [];
for (const lang of ['en', 'he']) {
  const pg = await b.newPage();
    // SET the language, do NOT clear storage: the demo seeds itself into
  // localStorage, and clearing on every document left /demo/athlete with an
  // empty page - the probe broke it, not the app.
  await pg.evaluateOnNewDocument((l) => { try { localStorage.setItem('expo-lang', l); } catch (e) { /* ignore */ } }, lang);
  // Size the window BEFORE navigating. Measuring straight after a resize
  // caught an empty frame and reported the demo portal as broken twice.
  await setWidth(pg, 1400, 900);
  for (const route of ['/demo/athlete', '/demo/coach', '/try']) {
    await pg.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 60000 });
    // 9s was not enough for a cold demo page - it measured 8 characters and
    // called the app broken. A hand check at 12s saw the whole portal.
    await wait(15000);
    // Measure EVERY frame and keep the largest, and save what was on screen:
    // the 863-character reading that made this probe distrust itself was the
    // same number for two different routes, which is a measurement of the
    // wrong document, not of the app. A picture settles which.
    const perFrame = [];
    for (const fr of pg.frames()) {
      try { perFrame.push(await fr.evaluate(() => {
      const t = document.body.innerText || '';
      return {
        len: t.length,
        bad: [...new Set((t.match(/Invalid Date|NaN|\[object Object\]|undefined/g) || []))],
        dates: [...new Set((t.match(/\d{1,2}(st|nd|rd|th)? (of )?[A-Za-z\u0590-\u05FF]{3,12},? \d{4}/g) || []))].slice(0, 3),
      };
      })); } catch (e) { /* detached frame */ }
    }
    const r = perFrame.sort((x, y) => y.len - x.len)[0] || { len: 0, bad: [], dates: [] };
    r.bad = [...new Set(perFrame.flatMap((x) => x.bad))];
    await pg.screenshot({ path: 'audit-out/demo-' + lang + route.replace(/\W+/g, '-') + '.png' }).catch(() => {});
    const ok = r.len > 400 && !r.bad.length;
    console.log((ok ? 'ok  ' : 'BAD ') + lang + '  ' + route.padEnd(15) + String(r.len).padStart(6) + ' chars  dates: ' + (r.dates.join(' | ') || '(none on this page)') + (r.bad.length ? '   ' + r.bad.join(',') : ''));
    if (!ok) bad.push(lang + ' ' + route + ': ' + (r.bad.join(',') || 'rendered almost nothing'));
  }
  await pg.close();
}
b.disconnect();
console.log('');
for (const x of bad) console.log('FAIL  ' + x);
console.log(bad.length ? bad.length + ' demo page(s) broken' : '0 - the demo surfaces render in both languages');
process.exit(bad.length ? 1 : 0);
