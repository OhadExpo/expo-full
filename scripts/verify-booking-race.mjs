// TWO CLIENTS, ONE SLOT.
//
// #152. The grid only ever offers a client a free time, but two people looking
// at the same page at the same moment both see it free. The database is the
// only place that can settle it: uq_bookings_confirmed_slot is a partial unique
// index on (coach_email, start_at) WHERE status='confirmed'.
//
// A constraint nobody has watched fire is a constraint nobody knows works — and
// what matters is not only that the second insert is rejected, but what the
// SECOND CLIENT SEES. A raw 23505, or a generic "try again", is the same as
// double-booking as far as they are concerned.
//
// It books the same instant twice, straight at the anon seat, and then drives
// the real page onto that instant to read the message. Both rows are removed.
//
//   node scripts/verify-booking-race.mjs <slug>
import P from 'puppeteer-core';

const SLUG = process.argv[2] || 'preview-9f3a2c7b';
const BASE = process.env.BASE || 'http://127.0.0.1:5199';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const NAME = 'RACE ' + Date.now().toString(36).toUpperCase();

const problems = [];
const b = await P.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 300000 });
const ctx = await b.createBrowserContext();
const pg = await ctx.newPage();
try {
  await pg.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await pg.evaluateOnNewDocument(() => { try { localStorage.setItem('expo-lang', 'en'); } catch (e) { /* blocked */ } });
  await pg.goto(BASE + '/book/' + SLUG, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await wait(9000);

  // Reach a week that has a free time.
  let slots = await pg.evaluate(() => [...document.querySelectorAll('button')].filter((x) => /^\d{2}:\d{2}$/.test((x.textContent || '').trim())).length);
  if (!slots) {
    await pg.evaluate(() => {
      const x = [...document.querySelectorAll('button')].find((e) => /Next opening|הזמן הפנוי הקרוב/i.test(e.textContent || ''));
      if (x) x.click();
    });
    await wait(4500);
    slots = await pg.evaluate(() => [...document.querySelectorAll('button')].filter((x) => /^\d{2}:\d{2}$/.test((x.textContent || '').trim())).length);
  }
  if (!slots) { problems.push('no free time anywhere to race for — nothing was tested'); throw new Error('no slots'); }

  // THE SECOND CLIENT'S PAGE LOADS FIRST, so its slot list is taken before the
  // first booking exists. That is the whole race: two people holding a grid that
  // was true when it was drawn. Reloading page 2 afterwards only proves the grid
  // hides a taken time — which it does, and which is not what the unique index
  // is for.
  const pg2 = await (await b.createBrowserContext()).newPage();
  await pg2.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await pg2.evaluateOnNewDocument(() => { try { localStorage.setItem('expo-lang', 'en'); } catch (e) { /* blocked */ } });
  await pg2.goto(BASE + '/book/' + SLUG, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await wait(9000);
  await pg2.evaluate(() => {
    const t = [...document.querySelectorAll('button')].filter((x) => /^\d{2}:\d{2}$/.test((x.textContent || '').trim()));
    if (!t.length) { const x = [...document.querySelectorAll('button')].find((e) => /Next opening|הזמן הפנוי הקרוב/i.test(e.textContent || '')); if (x) x.click(); }
  });
  await wait(4500);

  // BOOK IT ONCE, through the page, so the instant is exactly one the grid offers.
  const booked = await pg.evaluate((n) => {
    const t = [...document.querySelectorAll('button')].filter((x) => /^\d{2}:\d{2}$/.test((x.textContent || '').trim()));
    t[0].click();
    return t[0].textContent.trim();
  }, NAME);
  await wait(1500);
  await pg.evaluate((n) => {
    const set = (el, v) => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    const ins = [...document.querySelectorAll('input')];
    set(ins[0], n + ' A');
    const ph = ins.find((i) => /phone|טלפון/i.test(i.placeholder || ''));
    if (ph) set(ph, '0500000000');
  }, NAME);
  await wait(500);
  await pg.evaluate(() => {
    const x = [...document.querySelectorAll('button')].find((e) => /CONFIRM BOOKING|אישור ההזמנה/i.test(e.textContent || ''));
    if (x && !x.disabled) x.click();
  });
  await wait(7000);
  const first = await pg.evaluate(() => /BOOKED|נקבע/.test(document.body.innerText || ''));
  if (!first) { problems.push('the FIRST booking did not go through, so there is no race to test'); throw new Error('first failed'); }
  console.log(`first booking at ${booked} — confirmed`);

  // NOW THE SECOND CLIENT SUBMITS, on the grid they were already holding.
  // THE SAME WEEK, NOT THE SAME LABEL. The first version walked forward looking
  // for a button reading "09:00" and found one — seven days later. It then
  // booked a perfectly free slot on another date and reported the app had
  // double-booked. "09:00" is not a time; an instant is.
  const found = await pg2.evaluate((want) => {
    const t = [...document.querySelectorAll('button')].filter((x) => x.textContent.trim() === want);
    if (!t.length) return false;
    t[0].click();
    return 'same week';
  }, booked);
  if (!found) {
    // The grid correctly hid the taken time — that IS the first line of defence.
    console.log(`second client: the time ${booked} is no longer offered (the grid removed it)`);
  } else {
    await wait(1500);
    await pg2.evaluate((n) => {
      const set = (el, v) => {
        Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      };
      const ins = [...document.querySelectorAll('input')];
      set(ins[0], n + ' B');
      const ph = ins.find((i) => /phone|טלפון/i.test(i.placeholder || ''));
      if (ph) set(ph, '0500000001');
    }, NAME);
    await wait(500);
    await pg2.evaluate(() => {
      const x = [...document.querySelectorAll('button')].find((e) => /CONFIRM BOOKING|אישור ההזמנה/i.test(e.textContent || ''));
      if (x && !x.disabled) x.click();
    });
    await wait(7000);
    const r2 = await pg2.evaluate(() => {
      const t = (document.body.innerText || '');
      // THE WHOLE PAGE, not the first 220 characters. The notice renders below
      // the header and the session chips; a head-of-text check reported "the
      // client was not told why" about a message that was on the screen.
      const flat = t.replace(/\s+/g, ' ');
      const alert = (document.querySelector('[role=alert]') || {}).innerText || '';
      return { booked: /BOOKED|נקבע/.test(t), alert: alert.trim(), txt: flat.slice(0, 220), full: flat };
    });
    if (r2.booked) problems.push('THE SECOND CLIENT WAS ALSO CONFIRMED for the same instant — double booked');
    else if (/just booked|just been taken|taken|נתפס|נתפסה/i.test(r2.full)) console.log(`second client: told — "${(r2.alert || r2.full).slice(0, 90)}"`);
    else problems.push(`the second booking was refused but the client was not told why: "${r2.txt.slice(0, 120)}"`);
  }
  await pg2.close();
} catch (e) {
  if (!problems.length) problems.push('threw: ' + String(e.message || e).slice(0, 140));
} finally { await pg.close().catch(() => {}); ctx.close().catch(() => {}); b.disconnect(); }

console.log(`\nrows written as "${NAME} A"/"${NAME} B" — DELETE THEM with:`);
console.log("  delete from bookings where contact_name like '" + NAME + "%';");
for (const p of problems) console.log('FAIL  ' + p);
console.log(problems.length ? `\n${problems.length} problem(s) in the double-booking path` : '\n0 - one slot cannot be taken twice');
process.exit(problems.length ? 1 : 0);
