// THE WHOLE CLIENT PATH, FROM A SIGNED-OUT PHONE.
//
// Ohad, 21.9: "think and work about a perfect system for me and my clients",
// "make sure there's a full page designed for booking. the clients should
// access that too."
//
// Every part of this was verified on its own and the path as a whole never
// was. It drives the real page at 390, signed out, in Hebrew: find the next
// opening, pick it, fill the form, confirm, and then check the three things a
// client is promised - a confirmation, a calendar file, and a cancel link.
//
// IT WRITES A REAL ROW. The name is printed with the delete statement, because
// a probe row left in production once had to be hunted down by hand.
//
//   node scripts/verify-booking-flow.mjs <slug> [width]
import P from 'puppeteer-core';
import { setWidth } from './lib/viewport.mjs';

const SLUG = process.argv[2] || 'preview-9f3a2c7b';
const W = Number(process.argv[3]) || 390;
const BASE = process.env.BASE || 'http://127.0.0.1:5199';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const NAME = 'GATE ' + Date.now().toString(36).toUpperCase();

const b = await P.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 300000 });
const pg = await b.newPage();
const problems = [];
// SAY WHY IT FAILED, not just that it did. The first run reported two missing
// links; the truth underneath was that no row was ever written and the client
// had been shown nothing at all.
const noise = [];
pg.on('console', (m) => { const t = m.text(); if (/error|failed|denied|violat/i.test(t)) noise.push('console: ' + t.slice(0, 200)); });
pg.on('response', async (r) => {
  try {
    if (!/\/rest\/v1\/|\/rpc\//.test(r.url())) return;
    if (r.status() < 400) return;
    noise.push('HTTP ' + r.status() + ' ' + r.url().split('?')[0].split('/v1/')[1] + ' :: ' + (await r.text()).slice(0, 220));
  } catch (e) { /* body already consumed */ }
});
let cancelUrl = null;
try {
  // SIGNED OUT, like a client. The refresh cookie is the seat, so it goes too.
  await pg.goto(BASE + '/login', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
  await pg.deleteCookie({ name: 'expo-rt', url: BASE });
  await pg.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch (e) { /* private */ } });
  await pg.evaluateOnNewDocument(() => { try { localStorage.setItem('expo-lang', 'he'); } catch (e) { /* private */ } });
  await setWidth(pg, W, 844);
  await pg.goto(BASE + '/book/' + SLUG, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await wait(9000);

  const head = await pg.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 120));
  if (/doesn.t exist|לא קיים/i.test(head)) { problems.push('the page says the booking page does not exist'); throw new Error('no page'); }
  console.log('page: "' + head.slice(0, 70) + '"');

  // 1. A TIME. Either this week has slots, or the next-opening button does.
  let picked = await pg.evaluate(() => {
    const t = [...document.querySelectorAll('button')].filter((x) => /^\d{2}:\d{2}$/.test((x.textContent || '').trim()));
    if (!t.length) return false;
    t[0].click();
    return 'this week';
  });
  if (!picked) {
    const jumped = await pg.evaluate(() => {
      const x = [...document.querySelectorAll('button')].find((e) => /Next opening|הזמן הפנוי הקרוב/i.test(e.textContent || ''));
      if (!x) return false;
      x.click();
      return true;
    });
    if (!jumped) { problems.push('no slots this week AND no next-opening button - a client has nothing to tap'); throw new Error('dead end'); }
    await wait(4500);
    picked = await pg.evaluate(() => {
      const t = [...document.querySelectorAll('button')].filter((x) => /^\d{2}:\d{2}$/.test((x.textContent || '').trim()));
      if (!t.length) return false;
      // The jump is supposed to SELECT the opening, not merely page to its week.
      const already = t.find((x) => /rgb\(57, 189, 255\)/.test(getComputedStyle(x).backgroundColor));
      (already || t[0]).click();
      return already ? 'preselected by the jump' : 'the jump paged there but selected nothing';
    });
    if (!picked) { problems.push('the next-opening button paged to a week with no slots in it'); throw new Error('dead end'); }
  }
  console.log('slot: ' + picked);
  await wait(1500);

  // 2. THE FORM.
  const filled = await pg.evaluate((n) => {
    const set = (el, v) => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    const ins = [...document.querySelectorAll('input')];
    if (!ins.length) return 0;
    set(ins[0], n);
    const ph = ins.find((i) => /phone|טלפון/i.test(i.placeholder || ''));
    if (ph) set(ph, '0500000000');
    return ins.length;
  }, NAME);
  if (!filled) { problems.push('a slot was picked and no booking form appeared'); throw new Error('no form'); }
  await wait(600);

  const sent = await pg.evaluate(() => {
    const x = [...document.querySelectorAll('button')].find((e) => /CONFIRM BOOKING|אישור ההזמנה|מזמין/i.test(e.textContent || ''));
    if (!x || x.disabled) return false;
    x.click();
    return true;
  });
  if (!sent) { problems.push('the confirm button was missing or disabled with a name filled in'); throw new Error('no confirm'); }
  await wait(8000);

  // 3. WHAT THE CLIENT IS PROMISED.
  const after = await pg.evaluate(() => {
    const txt = (document.body.innerText || '');
    const links = [...document.querySelectorAll('a')].map((a) => ({ href: a.getAttribute('href') || '', t: (a.textContent || '').trim() }));
    return {
      // NOT just the word "אישור" — the CONFIRM BUTTON contains it, so the first
      // version of this check passed on a page where nothing had happened.
      confirmed: /BOOKED|נקבע/.test(txt) && !/CONFIRM BOOKING|אישור ההזמנה/i.test(txt),
      ics: links.some((l) => /^data:text\/calendar/i.test(l.href)),
      cancel: (links.find((l) => /\/book\/cancel\//.test(l.href)) || {}).href || null,
      head: txt.replace(/\s+/g, ' ').slice(0, 160),
    };
  });
  console.log('after confirm: "' + after.head.slice(0, 100) + '"');
  if (!after.confirmed) problems.push('the screen after confirming does not read as a confirmation');
  if (!after.ics) problems.push('no calendar file offered - the page promises one');
  if (!after.cancel) problems.push('no cancel link on the confirmation - the page promises one');
  cancelUrl = after.cancel;
} catch (e) {
  if (!problems.length) problems.push('threw: ' + String(e.message || e).slice(0, 140));
} finally { await pg.close().catch(() => {}); b.disconnect(); }

console.log('\nbooked as "' + NAME + '" — DELETE IT with:');
console.log("  delete from bookings where contact_name = '" + NAME + "';");
if (cancelUrl) console.log('cancel screen: ' + cancelUrl);
for (const n of noise) console.log('   ' + n);
for (const p of problems) console.log('FAIL  ' + p);
console.log(problems.length ? '\n' + problems.length + ' break(s) in the client path' : '\n0 - the whole client path works');
process.exit(problems.length ? 1 : 0);
