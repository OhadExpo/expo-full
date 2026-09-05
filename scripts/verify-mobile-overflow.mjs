// NOTHING IS CUT OFF THE EDGE OF A PHONE.
//
// This exists because it found one: the SAVE button on the athlete's Bodyweight
// tab ended at x=362 in a 360 viewport, so 2px of a control an athlete taps was
// simply clipped. The page did not scroll, so no document-level check would ever
// have seen it.
//
// It walks all three seats at the two widths that matter, and reports the
// element by name and by pixel - "1 offender" is not actionable, "button
// 282..362 SAVE" is.
//
// Two things it deliberately does NOT flag:
//   - anything inside a horizontal SCROLLER. The club zone's header is a
//     swipeable strip by design; its tabs legitimately sit past the edge, and a
//     naive check calls that broken (it did, for an hour).
//   - a page that scrolls sideways is caught too, via scrollWidth, because a
//     document wider than the viewport is a different defect with the same
//     cause.
//
// Read-only.
//
//   SEAT=athlete|owner|pt W=360 node scripts/verify-mobile-overflow.mjs [route...]
import fs from 'node:fs';
import P from 'puppeteer-core';
import { setWidth } from './lib/viewport.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:4173';
const SEAT = (process.env.SEAT || 'athlete').toLowerCase();
const W = Number(process.env.W || 390);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const SEATS = {
  owner:   { email: 'ohadyproductions@gmail.com', pw: process.env.OWNER_PW || '1234' },
  athlete: { email: 'diego@diegoday.com',         pw: process.env.ATHLETE_PW || '1234' },
  pt:      { email: 'tomerlich11@gmail.com',      pw: process.env.BHBC_PW || '1234' },
};
const who = SEATS[SEAT];
if (!who) { console.log(`unknown seat "${SEAT}" - owner | athlete | pt`); process.exit(1); }

const coachRoutes = () => {
  try {
    const md = fs.readFileSync('docs/SURFACES.md', 'utf8');
    return [...new Set([...md.matchAll(/`(\/coach(?![a-z])[a-z0-9/-]*)`/gi)].map((m) => m[1]))].filter((r) => !/:|\/$/.test(r));
  } catch { return ['/coach']; }
};
const ROUTES = process.argv.length > 2 ? process.argv.slice(2)
  : (SEAT === 'owner' ? coachRoutes() : SEAT === 'pt' ? ['/coach/bhbc'] : ['/athlete']);

const problems = [];
const b = await P.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 300000 });
const pg = await b.newPage();

const look = () => pg.evaluate(() => {
  const w = document.documentElement.clientWidth;
  const bad = [];
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    // Inside a horizontal scroller, sitting past the edge is the design.
    let p = el.parentElement, inScroller = false;
    while (p && p !== document.body) {
      const cs = getComputedStyle(p);
      if (/(auto|scroll)/.test(cs.overflowX) || /(auto|scroll)/.test(cs.overflow)) { inScroller = true; break; }
      p = p.parentElement;
    }
    if (inScroller) continue;
    // PARKED OFF-SCREEN IS NOT CLIPPED. A `<video>` at left:-9999px is a
    // standard way to hide an element, and flagging it teaches everyone to
    // ignore this gate. Only something with a foot on the screen can be cut:
    // it must overlap the viewport at all.
    if (r.right <= 0 || r.left >= w) continue;
    if (r.right > w + 1 || r.left < -1) {
      bad.push(`${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.slice(0, 18) : ''} ${Math.round(r.left)}..${Math.round(r.right)} "${(el.textContent || '').trim().slice(0, 30)}"`);
    }
  }
  return { w, scrollW: document.documentElement.scrollWidth, bad: bad.slice(0, 4) };
});

try {
  await pg.goto(BASE + '/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await pg.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch (e) { /* ignore */ } });
  await pg.goto(BASE + '/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await wait(3500);
  await pg.evaluate(({ email, pw }) => {
    const ins = [...document.querySelectorAll('input')];
    const e = ins.find((i) => /email/i.test(i.type + i.placeholder + i.name));
    const p = ins.find((i) => i.type === 'password');
    const set = (el, v) => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    if (e) set(e, email); if (p) set(p, pw);
  }, { email: who.email, pw: who.pw });
  await wait(400);
  await pg.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((x) => /^\s*sign\s*in\s*$/i.test(x.textContent || ''));
    if (btn) btn.click();
  });
  await wait(9000);
  await setWidth(pg, W, 800);
  console.log(`seat ${SEAT} at ${W}px - ${ROUTES.length} route(s)\n`);

  for (const route of ROUTES) {
    await pg.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await wait(9000);
    await pg.evaluate(() => {
      const x = [...document.querySelectorAll('button,a')].find((e) => /maybe later|dismiss/i.test(e.textContent || ''));
      if (x) x.click();
    }).catch(() => {});
    await wait(800);
    const r = await look();
    const wide = r.scrollW > r.w + 1;
    console.log(`${(r.bad.length || wide ? 'BAD ' : 'ok  ')} ${route.padEnd(26)} scrollW ${r.scrollW}/${r.w}  ${r.bad.length} past the edge`);
    for (const x of r.bad) console.log('      ' + x);
    if (wide) problems.push(`${route}: the page itself is ${r.scrollW - r.w}px wider than the phone`);
    for (const x of r.bad) problems.push(`${route}: ${x}`);

    // The athlete's tabs are not routes, and the defect this gate was written
    // for was on one of them.
    if (SEAT === 'athlete' && route === '/athlete') {
      const tabs = await pg.evaluate(() => [...document.querySelectorAll('button')]
        .map((x) => (x.textContent || '').trim())
        .filter((t) => /^(.\s*)?(bw|meal log|history|prs|messages)/i.test(t)).slice(0, 6));
      for (const t of tabs) {
        const hit = await pg.evaluate((l) => {
          const x = [...document.querySelectorAll('button')].find((e) => (e.textContent || '').trim() === l);
          if (x) x.click();
          return !!x;
        }, t);
        if (!hit) continue;
        await wait(3000);
        const rt = await look();
        console.log(`${(rt.bad.length ? 'BAD ' : 'ok  ')}   tab ${t.padEnd(22)} ${rt.bad.length} past the edge`);
        for (const x of rt.bad) { console.log('      ' + x); problems.push(`athlete tab "${t}": ${x}`); }
      }
    }
  }
} catch (e) {
  problems.push('threw: ' + String(e.message || e).slice(0, 120));
} finally {
  await pg.close().catch(() => {});
  b.disconnect();
}

console.log('');
for (const p of [...new Set(problems)]) console.log('FAIL  ' + p);
console.log(problems.length ? `\n${problems.length} thing(s) cut off at ${W}px` : `\n0 - nothing is cut off at ${W}px`);
process.exit(problems.length ? 1 : 0);
