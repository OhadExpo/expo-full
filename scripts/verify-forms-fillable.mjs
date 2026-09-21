// #123 / #124 — EVERY INPUT THAT ASKS FOR SOMETHING MUST BE EASY TO FILL,
// AND MUST SAY WHAT HAPPENS TO IT.
//
// From his checklist: "תהפוך את כל הפורמים לקלים למילוי" and "אישור לתפיסת
// פרטים". The lead form had none of the four things that make an input fill
// itself — no autoComplete, no inputMode, no name, and an error message a
// screen reader never announced — and nothing anywhere said what the address
// would be used for.
//
//   URL=http://127.0.0.1:5188 node scripts/verify-forms-fillable.mjs
import P from 'puppeteer-core';

const BASE = process.env.URL || 'http://127.0.0.1:5188';
const ROUTES = ['/#/', '/#/online', '/#/gym'];
const b = await P.connect({ browserURL: process.env.CDP || 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 300000 });
let bad = 0, inputs = 0, pages = 0;

const page = await b.newPage();
try {
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  for (const r of ROUTES) {
    await page.goto(BASE + r, { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise((res) => setTimeout(res, 2500));
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await new Promise((res) => setTimeout(res, 1800));
    const found = await page.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll('input')) {
        const t = (el.type || '').toLowerCase();
        if (['hidden', 'range', 'checkbox', 'radio', 'submit', 'button'].includes(t)) continue;
        const rect = el.getBoundingClientRect();
        if (rect.width < 2 || rect.height < 2) continue;
        const labelled = !!el.getAttribute('aria-label') || !!el.labels?.length
          || !!(el.id && document.querySelector(`label[for="${el.id}"]`));
        out.push({
          type: t,
          autocomplete: el.getAttribute('autocomplete') || '',
          inputmode: el.getAttribute('inputmode') || '',
          name: el.getAttribute('name') || '',
          labelled,
          // A form that takes contact details has to say what happens to them.
          consentNearby: /used to reply|משמש כדי לחזור/i.test(document.body.innerText || ''),
        });
      }
      return out;
    });
    pages++;
    for (const f of found) {
      inputs++;
      const miss = [];
      if (!f.autocomplete) miss.push('autocomplete');
      if (f.type === 'email' && f.inputmode !== 'email') miss.push('inputmode');
      if (!f.name) miss.push('name');
      if (!f.labelled) miss.push('a label');
      if (f.type === 'email' && !f.consentNearby) miss.push('a consent line');
      if (miss.length) { bad++; console.log(`  FAIL ${r} <input type=${f.type}> missing: ${miss.join(', ')}`); }
      else console.log(`  ok   ${r} <input type=${f.type}> autocomplete=${f.autocomplete} inputmode=${f.inputmode || '-'} labelled, consent shown`);
    }
  }
} catch (e) { console.log('ERROR', e.message); bad++; }
finally { await page.close().catch(() => {}); b.disconnect(); }

console.log(`\n${inputs} input(s) across ${pages} page(s), ${bad} with something missing`);
if (bad || !inputs) process.exitCode = 1;
