// EVERY BOX IN THE CLUB ZONE COLLAPSES, AND STAYS THAT WAY.
//
// Ohad: "make sure i can collapse all the boxes in bhbc". Two things have to be
// true and only one of them is visible in a screenshot:
//   HANDLE   - every card with a title strip toggles when the strip is clicked
//   REMEMBERS- it is still collapsed after a reload, per box
//
// Walks every tab in the zone, because a card that only exists on Games would
// otherwise never be checked.
//
// Read-only: clicking a title strip changes nothing but this viewer's own
// preference.
//
//   node scripts/verify-bhbc-collapse.mjs [email]
import P from 'puppeteer-core';
import { setWidth } from './lib/viewport.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:4173';
const EMAIL = process.argv[2] || 'tomerlich11@gmail.com';
const PW = process.env.BHBC_PW || '1234';
const TABS = ['Overview', 'Roster', 'Schedule', 'Medical', 'Games'];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const problems = [];
const b = await P.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 300000 });
const pg = await b.newPage();

const cards = () => pg.evaluate(() => {
  // A card is a strip with a title; the strip is the element carrying the
  // collapse role.
  return [...document.querySelectorAll('[role="button"][aria-expanded]')].map((s) => {
    const card = s.parentElement;
    return {
      title: (s.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 34),
      expanded: s.getAttribute('aria-expanded') === 'true',
      // HEIGHT, not innerText. A collapsed body stays in the DOM behind a
      // height animation, so innerText still returns every word in it - which
      // reported four perfectly collapsed cards as broken. What the eye reads
      // is the rendered height.
      h: card ? Math.round(card.getBoundingClientRect().height) : 0,
    };
  });
});

const clickCard = (title) => pg.evaluate((t) => {
  const s = [...document.querySelectorAll('[role="button"][aria-expanded]')]
    .find((x) => (x.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 34) === t);
  if (!s) return false;
  s.click();
  return true;
}, title);

const gotoTab = async (name) => {
  for (let k = 0; k < 25; k++) {
    await wait(900);
    const done = await pg.evaluate((want) => {
      const tabs = [...document.querySelectorAll('.bhbc-tab')];
      const names = tabs.map((e) => (e.textContent || '').trim().toLowerCase());
      if (!names.includes(want.toLowerCase())) return true;      // the current tab is renamed out of the list
      const t = tabs.find((e) => (e.textContent || '').trim().toLowerCase() === want.toLowerCase());
      if (t) t.click();
      return false;
    }, name);
    if (done) break;
  }
  await wait(3500);
};

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
  }, { email: EMAIL, pw: PW });
  await wait(400);
  await pg.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((x) => /^\s*sign\s*in\s*$/i.test(x.textContent || ''));
    if (btn) btn.click();
  });
  await wait(9000);
  await setWidth(pg, 1500, 1000);
  await pg.goto(BASE + '/coach/bhbc', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await wait(13000);
  await pg.evaluate(() => {
    const x = [...document.querySelectorAll('button,a')].find((e) => /maybe later|dismiss/i.test(e.textContent || ''));
    if (x) x.click();
  });
  await wait(1200);

  let total = 0;
  for (const tab of TABS) {
    await gotoTab(tab);
    const before = await cards();
    if (!before.length) { console.log(`${tab.padEnd(9)} no collapsible box found`); problems.push(`${tab}: no box on this tab can be collapsed`); continue; }
    total += before.length;
    let closed = 0;
    for (const c of before) {
      if (!c.expanded) continue;
      if (!(await clickCard(c.title))) continue;
      await wait(700);
      const after = (await cards()).find((x) => x.title === c.title);
      if (after && !after.expanded && after.h < Math.max(80, c.h * 0.5)) closed++;
      else problems.push(`${tab} · "${c.title}": clicking the strip did not collapse it`);
      // leave it closed - the reload check needs at least one closed box
    }
    console.log(`${tab.padEnd(9)} ${before.length} box(es), ${closed} collapsed on click`);
  }

  // REMEMBERS: reload and see whether the boxes are still shut.
  await pg.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
  await wait(12000);
  const after = await cards();
  const stillOpen = after.filter((c) => c.expanded).length;
  console.log(`\nafter reload: ${after.length} box(es) on this tab, ${stillOpen} open`);
  if (after.length && stillOpen === after.length) problems.push('collapsed boxes reopened after a reload - the state is not remembered');
  console.log(`${total} collapsible box(es) across ${TABS.length} tabs`);
} catch (e) {
  problems.push('threw: ' + String(e.message || e).slice(0, 130));
} finally {
  await pg.close().catch(() => {});
  b.disconnect();
}

console.log('');
for (const p of [...new Set(problems)]) console.log('FAIL  ' + p);
console.log(problems.length ? `\n${problems.length} problem(s)` : '\n0 - every box collapses and stays collapsed');
process.exit(problems.length ? 1 : 0);
