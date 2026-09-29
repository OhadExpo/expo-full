// ARE THE DEMO'S BOXES THE SAME HEIGHT AS THE REAL APP'S?
//
// Ohad, 29.9 (#460): "i feel like some of the boxes in the demo are not the
// same vertical size as in the real app".
//
// verify-demo-parity compares STRUCTURE (headings, labels, columns) and says
// so: it cannot see a size. This one measures. For each coach page it loads the
// REAL screen (signed in as the owner, read-only) and the DEMO screen at the
// same width + language, collects every box - title strip, button, input,
// tag/chip (a small bordered element), table row - and pairs them:
//
//   MISMATCH  the same box (kind + label, digits folded to #) exists on both
//             and the demo's height is not one the real page gives it (> 1px).
//   ODD       a demo box with no twin whose height matches NO box of that kind
//             on the real page - a size the real app never draws.
//
// It prints labels and heights only (the real page holds client data).
//   CDP=http://[::1]:9444 BASE=http://127.0.0.1:5246 node scripts/verify-demo-box-heights.mjs [--only tab] [--widths 390,1440] [--langs en,he]
//   BREAK=1 grows every demo button by 6px - the gate must go red.
import fs from 'node:fs';
import P from 'puppeteer-core';
import * as A from './lib/authed-page.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:5246';
const CDP = process.env.CDP || 'http://[::1]:9444';
const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const ONLY = arg('--only');
const WIDTHS = (arg('--widths') || '390,1440').split(',').map(Number);
const LANGS = (arg('--langs') || 'en,he').split(',');
const OUT = 'audit-out/demo-box-heights';
fs.mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// [name, real route, demo route, open-an-athlete?]
const PAGES = [
  ['dashboard', '/coach/dashboard', '/demo/coach'],
  ['athletes', '/coach/athletes', '/demo/coach/trainees'],
  ['athlete', '/coach/athletes', '/demo/coach/trainees', true],
  ['programs', '/coach/programs', '/demo/coach/programs'],
  ['exercises', '/coach/exercises', '/demo/coach/exercises'],
  ['sessions', '/coach/sessions', '/demo/coach/sessions'],
  ['review', '/coach/review', '/demo/coach/review'],
  ['tasks', '/coach/tasks', '/demo/coach/tasks'],
  ['billing', '/coach/billing', '/demo/coach/billing'],
].filter(([n]) => !ONLY || n === ONLY);

function collect() {
  const T = /rgba\(0, 0, 0, 0\)|transparent/;
  // a <select> is keyed by the option it shows (a demo span printing the same
  // word is its twin); every key is folded the same way AFTER it is chosen
  const key = (e) => String((e.tagName === 'SELECT' ? (e.selectedOptions[0] && e.selectedOptions[0].text) : '')
    || e.innerText || e.getAttribute('placeholder') || e.getAttribute('aria-label') || e.getAttribute('title') || e.value || '')
    .replace(/\s+/g, ' ').trim().toUpperCase().replace(/\d+([.,]\d+)?/g, '#').slice(0, 40);
  const out = [];
  for (const e of document.querySelectorAll('body *')) {
    // demo-only chrome (the COACH VIEW badge, the footer) has no twin in the real app
    if (e.closest('[data-demo-banner], [data-demo-chrome], [role="status"], svg')) continue;
    const r = e.getBoundingClientRect();
    if (r.height < 8 || r.width < 8 || r.height > 90) continue;
    const cs = getComputedStyle(e);
    if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) continue;
    const tag = e.tagName;
    let kind = null;
    // a logo is judged by the MARK's own height (its wrapper differs by structure:
    // the real header's also holds the nav text, the demo's is a bare link)
    if (tag === 'IMG') { if (e.getAttribute('alt')) out.push({ kind: 'logo', k: e.getAttribute('alt').toUpperCase(), h: Math.round(r.height * 2) / 2 }); continue; }
    if (e.classList.contains('title-strip')) kind = 'strip';
    else if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') { if (e.type === 'checkbox' || e.type === 'radio' || e.type === 'hidden') continue; kind = 'input'; }
    else if ((tag === 'A' || tag === 'BUTTON') && e.querySelector(':scope > img') && !(e.innerText || '').trim()) continue; // judged by its mark (kind logo)
    else if (tag === 'BUTTON' || e.getAttribute('role') === 'button' || e.getAttribute('role') === 'tab' || (tag === 'A' && e.getAttribute('href'))) {
      if (e.querySelector('.title-strip') || e.closest('.title-strip') && e.getAttribute('role') === 'button' && !e.matches('button')) continue;
      kind = 'btn';
    }
    else if (tag === 'TR') kind = 'row';
    else {
      const sides = ['Top', 'Bottom', 'Left', 'Right'].filter((s) => parseFloat(cs[`border${s}Width`]) >= 0.5 && !T.test(cs[`border${s}Color`])).length;
      if (sides === 4 && r.height <= 40 && (e.innerText || '').trim()) kind = 'tag';
    }
    if (!kind) continue;
    out.push({ kind, k: key(e), h: Math.round(r.height * 2) / 2 });
  }
  return out;
}

const b = await P.connect({ browserURL: CDP, defaultViewport: null, protocolTimeout: 300000 });
const ctx = await b.createBrowserContext();
const pg = await ctx.newPage();
let bad = 0;
const report = [];
try {
  await pg.evaluateOnNewDocument(() => { try { sessionStorage.setItem('expo-portal-choice', 'trainer'); localStorage.setItem('expo-install-snooze-until', String(Date.now() + 86400000)); } catch (e) { /* private */ } });
  let ok = false; for (let k = 0; k < 3 && !ok; k++) { await A.signIn(pg, BASE); ok = await A.assertAuthed(pg, BASE); }
  if (!ok) throw new Error('not signed in - a zero here would measure nothing');
  for (const lang of LANGS) {
    await pg.evaluateOnNewDocument((l) => { try { localStorage.setItem('expo-lang', l); } catch (e) { /* private */ } }, lang);
    for (const w of WIDTHS) {
      const phone = w < 700;
      await pg.emulate({ viewport: { width: w, height: 900, deviceScaleFactor: 2, isMobile: phone, hasTouch: phone }, userAgent: phone ? 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0 Mobile Safari/537.36' : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0 Safari/537.36' });
      for (const [name, real, demo, openAthlete] of PAGES) {
        const side = {};
        for (const [which, route] of [['real', real], ['demo', demo]]) {
          await pg.goto(BASE + route, { waitUntil: 'domcontentloaded' });
          await wait(which === 'real' ? 7000 : 3500);
          if (openAthlete) {
            const G = which === 'demo' ? '.cd-cards-grid > div' : '.tv-cards-grid > *';
            for (let k = 0; k < 30; k++) { if (await pg.evaluate((g) => document.querySelectorAll(g).length > 0, G)) break; await wait(500); }
            await pg.evaluate((g) => { const c = document.querySelector(g); if (c) c.click(); }, G);
            for (let k = 0; k < 20; k++) { await wait(600); if (await pg.evaluate(() => !!document.querySelector('.td-actions'))) break; }
            await wait(1500);
            // the click must have OPENED the athlete page, or the list gets measured as it (AUDIT-470)
            if (!(await pg.evaluate(() => !!document.querySelector('.td-actions')))) { side[which] = []; continue; }
          }
          if (which === 'demo' && process.env.BREAK) await pg.evaluate(() => { for (const x of document.querySelectorAll('button')) x.style.minHeight = `${x.getBoundingClientRect().height + 6}px`; });
          side[which] = await pg.evaluate(collect);
          // a real page caught mid-load (billing read 16 boxes, not 88) is not a
          // measurement: wait and read again before judging anything on it
          for (let k = 0; k < 3 && which === 'real' && side.real.length < 40; k++) { await wait(4000); side.real = await pg.evaluate(collect); }
        }
        const id = `${name} ${lang} ${w}`;
        if (!side.real.length || !side.demo.length) { bad++; console.log(`${id}: EMPTY real=${side.real.length} demo=${side.demo.length}`); continue; }
        const byKey = (list) => { const m = new Map(); for (const x of list) { const k = `${x.kind}|${x.k}`; if (!m.has(k)) m.set(k, new Set()); m.get(k).add(x.h); } return m; };
        const R = byKey(side.real), D = byKey(side.demo);
        // the same label under ANOTHER kind is still its twin: the real priority
        // control is a <select>, the demo's a span - same box, different tag
        const RL = new Map(); for (const x of side.real) { if (!x.k) continue; if (!RL.has(x.k)) RL.set(x.k, new Set()); RL.get(x.k).add(x.h); }
        const kindH = {}; for (const x of side.real) (kindH[x.kind] ||= new Set()).add(x.h);
        const near = (h, set) => [...set].some((v) => Math.abs(v - h) <= 1);
        const found = [];
        for (const [k, hs] of D) {
          const [kind, label] = k.split('|');
          if (R.has(k)) {
            for (const h of hs) if (!near(h, R.get(k))) found.push({ type: 'MISMATCH', kind, label, demo: h, real: [...R.get(k)] });
          } else if (label && RL.has(label)) {
            for (const h of hs) if (!near(h, RL.get(label))) found.push({ type: 'MISMATCH', kind, label, demo: h, real: [...RL.get(label)] });
          } else {   // labelled rows too: fixture names never equal real names, so a row was never judged (AUDIT-470)
            // no box of that kind on the real page at all = nothing to compare (the
            // demo's opened PR row; a real page with no open row) - not a finding
            if (!kindH[kind] || !kindH[kind].size) continue;
            for (const h of hs) if (!near(h, kindH[kind])) found.push({ type: 'ODD', kind, label, demo: h, realKind: [...(kindH[kind] || [])].sort((a, c) => a - c) });
          }
        }
        report.push({ id, real: side.real.length, demo: side.demo.length, found });
        bad += found.length;
        console.log(`${id}: real ${side.real.length} boxes, demo ${side.demo.length}, ${found.length} off`);
        for (const f of found) console.log(`   ${f.type.padEnd(8)} ${f.kind.padEnd(5)} "${f.label}" demo ${f.demo}px vs real ${JSON.stringify(f.real || f.realKind)}`);
      }
    }
  }
} finally {
  fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 1));
  await ctx.close(); b.disconnect();
}
console.log(`\n${bad} demo box heights differ from the real app${process.env.BREAK ? ' (BREAK run: must be > 0)' : ''}`);
process.exit(bad ? 1 : 0);
