// IS THE DEMO A PERFECT COPY OF THE REAL APP?
//
// Ohad, 23.9: "make sure the demo is 1:1 with the real app" and "keep making
// sure the demo is designed exactly like expo with all the features. a perfect
// copy".
//
// WHY THIS NEEDS A GATE. /demo/athlete renders the REAL ClientPortal in
// demoMode, so it cannot drift. /demo/coach is CoachDemo.jsx — a standalone
// re-implementation that shares NO components with the coach app, which means
// it drifts by eye the moment either side changes, and nobody notices until a
// prospect is looking at it.
//
// WHAT IT COMPARES. For each tab it loads the REAL screen (signed in as the
// owner) and the DEMO screen, and extracts a shape signature from each:
//
//   sections  the strip/section headings — the screen's skeleton
//   controls  every button and link label — the features on offer
//   columns   table headers — what the data view shows
//
// Then it reports, per tab:
//
//   MISSING   the real app has it, the demo does not. A feature he would be
//             selling that the demo cannot show.
//   EXTRA     the demo has it and the real app does not. Worse than missing:
//             it is a promise the product does not keep.
//
// WHAT IT CANNOT SEE, stated so the zero is honest: pixel styling, spacing and
// colour. It compares STRUCTURE and FEATURES. The control-height and page
// sweeps cover the visual side.
//
// The real app needs a session, so this runs in the SHARED debug profile (the
// one that stays signed in), not an isolated context — and it therefore reads
// REAL client data, which is why it prints only labels, never row content.
//
//   node scripts/verify-demo-parity.mjs [--only <tab>]
import fs from 'node:fs';
import P from 'puppeteer-core';

const BASE = process.env.BASE || 'http://127.0.0.1:5199';
const ONLY = (() => { const i = process.argv.indexOf('--only'); return i > 0 ? process.argv[i + 1] : null; })();
const OUT = 'audit-out/demo-parity';
fs.mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// real route -> demo route
const TABS = [
  ['dashboard', '/coach/dashboard', '/demo/coach'],
  ['athletes', '/coach/athletes', '/demo/coach/trainees'],
  ['programs', '/coach/programs', '/demo/coach/programs'],
  ['exercises', '/coach/exercises', '/demo/coach/exercises'],
  ['review', '/coach/review', '/demo/coach/review'],
  ['billing', '/coach/billing', '/demo/coach/billing'],
].filter(([n]) => !ONLY || n.includes(ONLY));

// Labels that are DATA, not structure: an athlete's name, a number, a date.
// Comparing those would report every real client as "missing from the demo",
// which is the point of a demo.
const isData = (s) => (
  /^[\d\s.,:/%+₪-]+$/.test(s)            // pure numbers / money / dates
  || /[֐-׿]/.test(s) === false && /^[A-Z][a-z]+ [A-Z][a-z]+$/.test(s)   // Latin personal name
  || s.length > 42
);

// Normalise away the differences that are NOT drift:
//   - case: the demo uppercases its nav, the app does not
//   - a trailing count badge: "Athletes32" vs "ATHLETES8" is the same control
//     with a different fixture size
//   - a leading icon glyph and trailing arrow
//   - a parenthesised count: "▶ Video (17)" vs "▶ Video (402)" is one flag chip
const norm = (s) => String(s || '')
  .replace(/\s+/g, ' ')
  .trim()
  .replace(/[←-⇿■-➿⬀-⯿∅]/g, '')   // arrows, geometric icons, the empty-set glyph
  .replace(/\s*\([\d,]+\)$/, '')                                // a parenthesised count
  .replace(/\d+$/, '')                                         // a trailing count badge
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase();

const findings = [];
const add = (o) => { findings.push(o); console.log(`${o.kind.padEnd(8)} ${o.tab.padEnd(12)} ${o.detail}`); };

const b = await P.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 300000 });

const shapeOf = async (pg, url) => {
  await pg.goto(BASE + url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  let prev = -1;
  for (let i = 0; i < 26; i++) {
    await wait(700);
    const len = await pg.evaluate(() => (document.body.innerText || '').length);
    if (len === prev && len > 0) break;
    prev = len;
  }
  await wait(900);
  return pg.evaluate(() => {
    const t = (x) => String(x || '').replace(/\s+/g, ' ').trim();
    const controls = new Set();
    for (const el of document.querySelectorAll('button,a,[role=button],[role=tab]')) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const s = t(el.textContent) || t(el.getAttribute('aria-label')) || t(el.getAttribute('title'));
      if (s) controls.add(s);
    }
    const columns = new Set();
    for (const th of document.querySelectorAll('th')) { const s = t(th.textContent); if (s) columns.add(s); }
    const sections = new Set();
    for (const h of document.querySelectorAll('h1,h2,h3,h4,[class*=strip] span,[class*=Strip] span')) {
      const s = t(h.textContent); if (s && s.length < 44) sections.add(s);
    }
    return { controls: [...controls], columns: [...columns], sections: [...sections], chars: (document.body.innerText || '').length };
  });
};

// The real app needs the signed-in profile; the demo does not care.
const pg = await b.newPage();
await pg.setViewport({ width: 1440, height: 950, deviceScaleFactor: 1 });
await pg.evaluateOnNewDocument(() => { try { localStorage.setItem('expo-lang', 'en'); } catch (e) { /* private */ } });

// Prove we are actually signed in before believing a single "missing".
await pg.goto(BASE + '/coach/dashboard', { waitUntil: 'domcontentloaded', timeout: 60000 });
await wait(6000);
const signedIn = await pg.evaluate(() => !/sign[\s-]?in|התחברות/i.test((document.body.innerText || '').slice(0, 400)));
if (!signedIn) {
  console.log('NOT SIGNED IN on the real coach app — every finding would be a phantom.');
  console.log('Open http://127.0.0.1:5199/coach in the debug Chrome and sign in, then re-run.');
  await pg.close();
  b.disconnect();
  process.exit(2);
}
console.log('signed in on the real coach app — comparing.\n');

let compared = 0;
for (const [tab, realUrl, demoUrl] of TABS) {
  try {
    const real = await shapeOf(pg, realUrl);
    const demo = await shapeOf(pg, demoUrl);
    compared++;
    for (const kind of ['sections', 'controls', 'columns']) {
      const R = new Set(real[kind].map(norm).filter((s) => s && !isData(s)));
      const D = new Set(demo[kind].map(norm).filter((s) => s && !isData(s)));
      const missing = [...R].filter((s) => !D.has(s));
      const extra = [...D].filter((s) => !R.has(s));
      if (missing.length) add({ kind: 'MISSING', tab, detail: `${kind}: ${missing.length} in the app, not in the demo — ${missing.slice(0, 8).map((s) => JSON.stringify(s)).join(' ')}` });
      if (extra.length) add({ kind: 'EXTRA', tab, detail: `${kind}: ${extra.length} in the demo, not in the app — ${extra.slice(0, 8).map((s) => JSON.stringify(s)).join(' ')}` });
    }
    console.log(`  ${tab}: real ${real.chars} chars / demo ${demo.chars} chars`);
  } catch (e) {
    add({ kind: 'ERROR', tab, detail: String(e.message || e).slice(0, 120) });
  }
}
await pg.close();
b.disconnect();

fs.writeFileSync(`${OUT}/findings.json`, JSON.stringify(findings, null, 1));
const by = {};
for (const f of findings) by[f.kind] = (by[f.kind] || 0) + 1;
console.log(`\n${compared} of ${TABS.length} tab pairs compared.`);
console.log(Object.keys(by).length ? Object.entries(by).map(([k, v]) => `  ${k.padEnd(8)} ${v}`).join('\n') : '  none');
console.log(`-> ${OUT}/findings.json`);
process.exit(findings.length ? 1 : 0);
