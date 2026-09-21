// Which text fields are CENTRED, and should they be?
//
// index.html:69 sets `input,select,textarea{text-align:center}` for the whole
// app. That is right for the set-entry cells - a grid of "kg", "reps", "3010",
// "7-8" reads as a column only when the numbers are centred - and wrong for a
// search box, a filter, a composer or a notes area, where centred text has no
// edge to scan down and looks like a mistake. The app is currently BOTH: on
// /coach/tasks the search field overrides to start and the composer right below
// it does not.
//
// This reports every field a human types a SENTENCE into that still renders
// centred. It judges by the placeholder, which is the only signal in the DOM
// for what a field is for, and prints what it skipped so the zero means
// something.
import P from 'puppeteer-core';
import * as A from './lib/authed-page.mjs';
import { setWidth } from './lib/viewport.mjs';

const ROUTES = process.argv.slice(2).length ? process.argv.slice(2) : [
  '/coach/dashboard', '/coach/athletes', '/coach/exercises', '/coach/exercise-classify',
  '/coach/exercise-matching', '/coach/exercise-cleanup', '/coach/programs', '/coach/workouts',
  '/coach/review', '/coach/tasks', '/coach/intake', '/coach/waitlist', '/coach/billing',
  '/coach/chat-audit', '/coach/challenges', '/coach/sessions', '/coach/calendar',
  '/coach/bugs', '/coach/smart-import', '/demo/coach',
];
// A field is FREE TEXT when its placeholder reads like a sentence or a named
// thing, not a unit or a number. Anything shorter than this is a set cell.
const FREE = /search|filter|find|type |write|note|message|comment|email|name|title|describe|reason|focus|\.\.\.|…/i;
const b = await P.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 300000 });
const pg = await b.newPage();
await A.signIn(pg, 'http://127.0.0.1:5199');
await pg.evaluateOnNewDocument(() => { try { sessionStorage.setItem('expo-portal-choice', 'trainer'); localStorage.setItem('expo-lang', 'en'); localStorage.setItem('expo-install-snooze-until', String(Date.now() + 86400000)); } catch (e) {} });
await setWidth(pg, 1500, 1100);
let centred = 0, seen = 0, freeSeen = 0, dead = 0;
for (const route of ROUTES) {
  await pg.goto('http://127.0.0.1:5199' + route, { waitUntil: 'domcontentloaded' });
  await new Promise((r) => setTimeout(r, 7000));
  const r = await pg.evaluate((src) => {
    const FREE = new RegExp(src, 'i');
    const out = { all: 0, free: 0, hits: [], bodyLen: (document.body.innerText || '').length };
    for (const el of document.querySelectorAll('input, textarea')) {
      const t = (el.getAttribute('type') || '').toLowerCase();
      if (['checkbox', 'radio', 'button', 'submit', 'file', 'range', 'color', 'hidden'].includes(t)) continue;
      if (!el.getBoundingClientRect().width) continue;
      out.all++;
      const ph = el.placeholder || el.getAttribute('aria-label') || '';
      const isFree = el.tagName === 'TEXTAREA' || (ph.length >= 5 && FREE.test(ph));
      if (!isFree) continue;
      out.free++;
      if (getComputedStyle(el).textAlign === 'center') out.hits.push({ tag: el.tagName.toLowerCase(), type: t || '(none)', ph: ph.slice(0, 44), w: Math.round(el.getBoundingClientRect().width) });
    }
    // "Did the app render?" is the presence of the coach SHELL, not a word
    // count. A 300-char floor called /coach/challenges and /coach/bugs dead when
    // both had rendered perfectly and were simply EMPTY - "No challenges yet",
    // "No open reports." A coverage check that fails on a legitimately quiet
    // screen sends the reader hunting a bug that is not there.
    out.shell = /DASHBOARD/i.test(document.body.innerText || '') && !!document.querySelector('nav, header, main');
    return out;
  }, FREE.source);
  if (!r.shell) { console.log(`${route.padEnd(26)} THE COACH SHELL DID NOT RENDER (${r.bodyLen} chars) - not measured`); dead++; continue; }
  seen += r.all; freeSeen += r.free; centred += r.hits.length;
  console.log(`${route.padEnd(26)} ${String(r.all).padStart(3)} field(s), ${String(r.free).padStart(2)} free-text, ${r.hits.length} centred`);
  for (const h of r.hits) console.log(`      <${h.tag} type=${h.type} ${h.w}px> "${h.ph}"`);
}
console.log(`\n${ROUTES.length - dead} of ${ROUTES.length} routes measured${dead ? ` (${dead} did not render)` : ''}: ${seen} visible fields, ${freeSeen} of them free-text, ${centred} centred`);
await pg.close(); b.disconnect();
process.exit(dead || centred ? 1 : 0);
