// THE TWO AUDIENCES THAT MUST NEVER BE STALLED.
//
// Ohad, 2026-09-02: "make sure nothing that you ever interrupts with the athlete
// experince on expo and the physical therapists on bhbc. they should never be
// affected or stalled."
//
// Everything else here measures whether a screen is PRETTY. This one measures
// whether the two live audiences can still do their job, and it runs after every
// deploy. A coach-side design change is not worth an athlete who cannot see his
// programme or a PT who cannot record an injury.
//
//   ATHLETE   signs in as a real trainee, on a phone, and checks the portal
//             renders their actual programme - not a shell, not an error.
//   PT        opens the BHBC medical board and checks the injury rows render
//             with their content AND that the write path is still reachable
//             (the UPDATE control exists and opens the editor).
//
// It never WRITES. The PT check opens the editor and closes it with Cancel.
//
//   node scripts/verify-live-audiences.mjs [base]
import puppeteer from 'puppeteer-core';
import { signIn } from './lib/authed-page.mjs';

const BASE = process.argv[2] || 'http://127.0.0.1:5199';
const ATHLETE = process.env.EXPO_ATHLETE || 'diego@diegoday.com';

const IPHONE = {
  viewport: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
};

let fails = 0;
const ok = (m) => console.log('  ok    ' + m);
const bad = (m) => { fails++; console.log('  FAIL  ' + m); };

const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 300000 });

// ---- 1. THE ATHLETE ------------------------------------------------------
console.log('=== ATHLETE on a phone (' + ATHLETE + ') ===');
{
  // A clean context: the debug profile is signed in as the OWNER, and a login
  // form on top of that session just lands on the coach dashboard - the
  // "athlete seat" would be a fiction.
  const ctx = await (browser.createBrowserContext ? browser.createBrowserContext() : browser.createIncognitoBrowserContext());
  const pg = await ctx.newPage();
  try {
    await pg.emulate(IPHONE);
    await pg.goto(BASE + '/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await new Promise((r) => setTimeout(r, 4000));
    await pg.evaluate((email) => {
      const set = (el, v) => {
        const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        s.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true }));
      };
      const ins = [...document.querySelectorAll('input')];
      const e = ins.find((i) => /email/i.test(i.type + i.name + i.placeholder + (i.autocomplete || '')));
      const p = ins.find((i) => i.type === 'password');
      if (e) set(e, email);
      if (p) set(p, '1234');
      const btn = [...document.querySelectorAll('button')].find((x) => /sign in|log in|enter|כניסה/i.test(x.textContent || ''));
      if (btn) btn.click();
    }, ATHLETE);
    await new Promise((r) => setTimeout(r, 14000));
    const r = await pg.evaluate(() => ({
      url: location.pathname,
      len: (document.body.innerText || '').length,
      hasProgramme: /block|day\s|warm|week/i.test(document.body.innerText || ''),
      overflows: document.documentElement.scrollWidth > window.innerWidth + 1,
      errorish: /something went wrong|failed to load|error/i.test(document.body.innerText || ''),
    }));
    if (!r.url.includes('/athlete')) bad('did not land on the portal (' + r.url + ')');
    else ok('lands on ' + r.url);
    if (r.len < 300) bad('portal is nearly empty (' + r.len + ' chars) - a shell, not a programme');
    else ok('portal rendered ' + r.len + ' characters');
    if (!r.hasProgramme) bad('no programme content found on the portal');
    else ok('programme content present');
    if (r.overflows) bad('portal scrolls sideways on a phone');
    else ok('no sideways scroll');
    if (r.errorish) bad('portal is showing an error');
    else ok('no error state');
  } catch (e) {
    bad('athlete check threw: ' + String(e.message || e).split('\n')[0]);
  } finally {
    await pg.close().catch(() => {});
    await ctx.close().catch(() => {});
  }
}

// ---- 2. THE PHYSICAL THERAPIST ------------------------------------------
console.log('');
console.log('=== PHYSICAL THERAPIST on the BHBC medical board ===');
{
  const pg = await browser.newPage();
  try {
    await pg.setViewport({ width: 1400, height: 1000 });
    await signIn(pg, BASE);
    await pg.goto(BASE + '/coach/bhbc', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await new Promise((r) => setTimeout(r, 13000));
    await pg.evaluate(() => {
      const e = [...document.querySelectorAll('button')].find((x) => /^medical$/i.test((x.textContent || '').trim()));
      if (e) e.click();
    });
    await new Promise((r) => setTimeout(r, 3500));
    const board = await pg.evaluate(() => {
      const txt = document.body.innerText || '';
      const updates = [...document.querySelectorAll('button,a')].filter((x) => /update|report/i.test(x.textContent || ''));
      return {
        hasBoard: /injury board|active injuries/i.test(txt),
        injuryRows: (txt.match(/·\s*(overuse|sprain|strain|contusion|other)/gi) || []).length,
        updateControls: updates.length,
      };
    });
    if (!board.hasBoard) bad('the medical board did not render');
    else ok('injury board rendered');
    if (!board.injuryRows) bad('no injury rows rendered - the PT cannot see their caseload');
    else ok(board.injuryRows + ' injury row(s) rendered');
    if (!board.updateControls) bad('no UPDATE control - the PT cannot record anything');
    else ok(board.updateControls + ' write control(s) reachable');

    // Can the editor actually open? Opened and cancelled, never saved.
    const opened = await pg.evaluate(async () => {
      const btn = [...document.querySelectorAll('button,a')].find((x) => /update|report/i.test(x.textContent || ''));
      if (!btn) return 'no control';
      btn.click();
      await new Promise((r) => setTimeout(r, 2500));
      const isOpen = /body part|current status|onset/i.test(document.body.innerText || '');
      const cancel = [...document.querySelectorAll('button')].find((x) => /^cancel$/i.test((x.textContent || '').trim()));
      if (cancel) cancel.click();
      return isOpen ? 'opens' : 'did not open';
    });
    if (opened !== 'opens') bad('the injury editor ' + opened);
    else ok('injury editor opens (and was cancelled, nothing written)');
  } catch (e) {
    bad('PT check threw: ' + String(e.message || e).split('\n')[0]);
  } finally {
    await pg.close().catch(() => {});
  }
}

browser.disconnect();
console.log('');
console.log(fails === 0
  ? 'LIVE AUDIENCES OK — the athlete can read his programme and the PT can record.'
  : 'LIVE AUDIENCES: ' + fails + ' failure(s) above. Roll back before investigating.');
process.exit(fails ? 1 : 0);
