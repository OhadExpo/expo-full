// THE EXPORTED BLOCK, AS PAPER.
//
// The PDF export is window.print() over a print stylesheet, so the only honest
// way to look at it is to render it the way the print pipeline does: mount the
// sheet, switch the page to print media, and write the actual PDF plus a page
// image. window.print() is stubbed out first - a real dialog blocks the tab and
// every later command with it.
//
//   node scripts/shoot-plan-pdf.mjs [planName]
import fs from 'node:fs';
import P from 'puppeteer-core';
import * as A from './lib/authed-page.mjs';

const APP = process.env.BASE || 'http://127.0.0.1:5199';
const OUT = 'audit-out/pdf';
fs.mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const b = await P.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 300000 });
const pg = await b.newPage();
try {
  await pg.goto(APP + '/login', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  await pg.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch (e) { /* ignore */ } });
  await A.signIn(pg, APP);
  await pg.setViewport({ width: 1500, height: 1000, deviceScaleFactor: 1 });
  await pg.goto(APP + '/coach/programs', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await wait(9000);

  // Open the first block in the list.
  const opened = await pg.evaluate(() => {
    const row = [...document.querySelectorAll('button,div[role="button"],a')]
      .find((e) => /block|#\d/i.test((e.textContent || '').trim()) && (e.textContent || '').trim().length < 60);
    if (!row) return null;
    row.click();
    return (row.textContent || '').trim().slice(0, 40);
  });
  console.log('opened:', opened || '(nothing)');
  await wait(7000);

  // Stub the dialog BEFORE anything can call it.
  await pg.evaluate(() => { window.__printed = 0; window.print = () => { window.__printed++; }; });

  const clicked = await pg.evaluate(() => {
    const more = [...document.querySelectorAll('button')].find((e) => /^\s*(⋯|more)\s*$/i.test((e.textContent || '').trim()));
    if (more) more.click();
    return !!more;
  });
  await wait(1200);
  const hit = await pg.evaluate(() => {
    const el = [...document.querySelectorAll('button,div,li,a')].find((e) => /^\s*export pdf\s*$/i.test((e.textContent || '').trim()));
    if (!el) return false;
    el.click();
    return true;
  });
  console.log(`more menu: ${clicked}, export pdf: ${hit}`);
  if (!hit) { console.log('FAILED: no Export PDF item found'); process.exit(1); }
  await wait(4000);

  const printed = await pg.evaluate(() => window.__printed);
  const dom = await pg.evaluate(() => {
    const el = document.querySelector('.plan-print');
    const toast = (document.body.innerText || '').match(/Save failed.{0,60}/);
    return { present: !!el, kids: el ? el.children.length : 0, toast: toast ? toast[0] : null };
  });
  console.log(`window.print() calls: ${printed}; .plan-print present: ${dom.present} (${dom.kids} children)${dom.toast ? ' TOAST: ' + dom.toast : ''}`);

  // The PDF itself is written under print media, which is the real artefact.
  // But a PRINT-media screenshot comes back blank in this Chrome, so the sheet
  // is also previewed by lifting the print rules OUT of their @media block and
  // applying them on screen - the same declarations, so the picture and the
  // paper cannot drift.
  const css = fs.readFileSync('src/themes.css', 'utf8');
  const at = css.indexOf('@media print {');
  let depth = 0, end = at;
  for (let i = css.indexOf('{', at); i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  const printRules = css.slice(css.indexOf('{', at) + 1, end)
    .replace(/@page[^}]*}/g, '')
    .replace(/body \* \{ visibility: hidden !important; }/, '');
  await pg.addStyleTag({ content: printRules + '.plan-print{display:block!important;position:static!important}' });
  const lifted = await pg.evaluate(() => {
    // The sheet is rendered INSIDE the app tree, so hiding the body's children
    // hid the sheet with them - which is why this photographed a blank page.
    // Lift it to the body first, then hide everything else: the screen
    // equivalent of `body * { visibility: hidden }` on paper.
    const sheet = document.querySelector('.plan-print');
    if (!sheet) return 'no sheet';
    document.body.appendChild(sheet);
    for (const el of document.body.children) if (el !== sheet) el.style.display = 'none';
    sheet.style.display = 'block';
    return (sheet.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 120);
  });
  console.log(`sheet text: "${lifted}"`);
  await wait(1500);
  const sheet = await pg.evaluate(() => {
    const t = (document.body.innerText || '').replace(/\s+/g, ' ').trim();
    return { chars: t.length, head: t.slice(0, 160) };
  });
  console.log(`sheet: ${sheet.chars} chars`);
  console.log(`  "${sheet.head}"`);
  // A page image too - a PDF cannot be looked at directly here.
  await pg.setViewport({ width: 794, height: 1123, deviceScaleFactor: 2 });   // A4 at 96dpi
  await wait(1200);
  // fullPage: the print layout stacks day-cards down the document, so a
  // viewport-sized shot photographs whichever slice happens to be scrolled to.
  await pg.screenshot({ path: `${OUT}/block-full.png`, fullPage: true });
  await pg.screenshot({ path: `${OUT}/block-page1.png` });
  // The PDF goes LAST: pg.pdf() runs a real print, which fires afterprint,
  // which is what the export listens for to unmount the sheet. Called first,
  // it deleted the very thing every screenshot after it tried to photograph.
  await pg.pdf({ path: `${OUT}/block.pdf`, format: 'A4', printBackground: true,
                 margin: { top: '12mm', bottom: '15mm', left: '11mm', right: '11mm' } });
  console.log(`wrote ${OUT}/block.pdf + two page images`);
} finally {
  await pg.emulateMediaType(null).catch(() => {});
  await pg.close().catch(() => {});
  b.disconnect();
}
