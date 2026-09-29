// verify-strip-title-fit.mjs - a strip's title is ONE line, whole, never squeezed.
//
// Ohad, 29.9 (#452, his phone, the athlete page): "ASSIGNED PROGRAMS (1)" came
// out ONE LETTER PER LINE - the strip's buttons kept their width and the title
// column was left ~20px - with "Fix this everywhere that it happen anywhere on
// our website". Standing rule (26.9): a title box is ONE row, always.
//
// For every title strip on every surface (.title-strip, the program cards'
// .prog-striphdr, and any element that paints the strip background with a
// title in it), the title text must sit on ONE line and nothing in the strip may
// be painted outside the strip. Multi-line = a finding; so is a title narrower
// than its own longest word (letters stacking).
//
//   BASE=http://127.0.0.1:5234 node scripts/verify-strip-title-fit.mjs [--widths 360,390,768] [--lang en,he] [--only a,b]
// Exit 1 on any finding, or if it measured no strips.
import fs from 'node:fs';
import P from 'puppeteer-core';
import { signIn, assertAuthed } from './lib/authed-page.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:5234';
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const WIDTHS = arg('--widths', '360,390,768').split(',').map(Number);
const LANGS = arg('--lang', 'en,he').split(',');
const ONLY = arg('--only', null);
const OUT = process.env.OUT || 'audit-out/strip-title-fit';
fs.mkdirSync(OUT, { recursive: true });

const coachRoutes = (() => {
  try {
    const md = fs.readFileSync('docs/SURFACES.md', 'utf8');
    return [...new Set([...md.matchAll(/`(\/coach[a-z0-9/-]*)`/gi)].map((m) => m[1]))];
  } catch { return ['/coach/dashboard']; }
})();
// the athlete page is where he saw it: open the first athlete's detail too
const SURFACES = [
  ...coachRoutes.map((r) => ({ id: 'app' + r.replace(/\//g, '-'), url: r })),
  { id: 'app-athlete-detail', url: '/coach/athletes', openFirst: true },
  ...['/demo/coach', '/demo/coach/trainees', '/demo/coach/programs', '/demo/coach/exercises', '/demo/coach/sessions', '/demo/coach/review', '/demo/coach/tasks', '/demo/coach/billing', '/demo/athlete', '/try']
    .map((r) => ({ id: 'pub' + r.replace(/\//g, '-'), url: r })),
].filter((s) => !ONLY || ONLY.split(',').some((o) => s.id.includes(o)));

const MEASURE = () => {
  const vis = (el) => { const cs = getComputedStyle(el); return cs.display !== 'none' && cs.visibility !== 'hidden'; };
  const strips = [...document.querySelectorAll('.title-strip, .prog-striphdr, [data-strip]')].filter((el) => vis(el) && el.getBoundingClientRect().width > 100);
  const out = []; let measured = 0;
  for (const st of strips) {
    const sr = st.getBoundingClientRect();
    if (sr.bottom < 0) continue;
    // the title: the first text inside the strip that is not inside a button / select / link
    const walk = document.createTreeWalker(st, NodeFilter.SHOW_TEXT);
    let node, titleEl = null;
    while ((node = walk.nextNode())) {
      if (!node.textContent.trim()) continue;
      const p = node.parentElement;
      if (!p || p.closest('button, select, a, input, label')) continue;   // a control's label is not the title
      if (getComputedStyle(p).visibility === 'hidden' || p.closest('[aria-hidden="true"]')) continue;
      { const rgv = document.createRange(); rgv.selectNodeContents(node); if (![...rgv.getClientRects()].some((r) => r.width > 0.5)) continue; }   // not rendered (display:none copy)
      titleEl = p; break;
    }
    if (!titleEl) continue;
    measured++;
    const rg = document.createRange(); rg.selectNodeContents(titleEl);
    const rects = [...rg.getClientRects()].filter((r) => r.width > 0.5 && r.height > 0.5);
    const tops = []; for (const r of rects) if (!tops.some((t) => Math.abs(t - r.top) <= 3)) tops.push(r.top);
    const txt = (titleEl.innerText || titleEl.textContent || '').replace(/\s+/g, ' ').trim();
    const tr = titleEl.getBoundingClientRect();
    const spill = [...st.querySelectorAll('*')].some((d) => { const r = d.getBoundingClientRect(); return r.width > 0 && (r.right > sr.right + 1.5 || r.left < sr.left - 1.5) && vis(d); });
    if (tops.length > 1 || spill) {
      out.push({ title: txt.slice(0, 40), lines: tops.length, titleW: Math.round(tr.width), stripW: Math.round(sr.width), spill, cls: String(st.className || '').split(' ')[0] });
    }
  }
  return { out, measured };
};

const b = await P.connect({ browserURL: process.env.CDP || 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 300000 });
const pg = await b.newPage();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const findings = []; let measured = 0, combos = 0;
try {
  await pg.evaluateOnNewDocument(() => { try { sessionStorage.setItem('expo-portal-choice', 'trainer'); localStorage.setItem('expo-install-snooze-until', String(Date.now() + 86400000)); } catch (e) {} });
  // signed in for REAL, or nothing measured means anything (the shared Chrome's
  // sign-in is flaky: it can report success and land on /login)
  let authed = false;
  for (let k = 0; k < 3 && !authed; k++) { await signIn(pg, BASE); authed = await assertAuthed(pg, BASE, '/coach/dashboard'); }
  if (!authed) { console.log('FAIL: could not sign in - nothing measured'); process.exit(1); }
  for (const lang of LANGS) {
    await pg.evaluateOnNewDocument((l) => { try { localStorage.setItem('expo-lang', l); localStorage.setItem('expo-collapse:bhbc-lang', JSON.stringify(l)); } catch (e) {} }, lang);
    for (const w of WIDTHS) {
      const phone = w < 700;
      await pg.emulate({ viewport: { width: w, height: 844, deviceScaleFactor: phone ? 3 : 1, isMobile: true, hasTouch: phone },
        userAgent: phone ? 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0 Mobile Safari/537.36' : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0 Safari/537.36' });
      for (const s of SURFACES) {
        const id = `${s.id}/${lang}/${w}`;
        try {
          await pg.goto(BASE + s.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
          for (let k = 0; k < 30; k++) { await wait(500); if (await pg.evaluate(() => !/LOADING DATA/.test(document.body.innerText.slice(0, 200)))) break; }
          // wait for the page to SETTLE: the strip count the same on two looks a
          // second apart (a roster renders its 26 cards after the data lands; a
          // fixed pause measured 0 strips on one run and a mid-render wrap on another)
          { let last = -1; for (let k = 0; k < 20; k++) { await wait(1000); const n = await pg.evaluate(() => document.querySelectorAll('.title-strip, .prog-striphdr, [data-strip]').length); if (n > 0 && n === last) break; last = n; } }
          await wait(800);
          if (s.openFirst) { await pg.evaluate(() => { const c = document.querySelector('.tv-cards-grid > *'); if (c) c.click(); }); let last = -1; for (let k = 0; k < 20; k++) { await wait(1000); const n = await pg.evaluate(() => document.querySelectorAll('.title-strip').length); if (n > 0 && n === last && /\/coach\/athletes\/./.test(pg.url())) break; last = n; } }
          const r = await pg.evaluate(MEASURE);
          combos++; measured += r.measured;
          for (const f of r.out) { findings.push({ id, ...f }); console.log(`${f.lines > 1 ? 'WRAP ' : ''}${f.spill ? 'SPILL ' : ''}${id.padEnd(34)} "${f.title}" ${f.lines} line(s), title ${f.titleW}px in a ${f.stripW}px ${f.cls}`); }
        } catch (e) { console.log(`ERROR ${id} ${String(e).slice(0, 100)}`); }
      }
    }
  }
} finally { await pg.close(); b.disconnect(); }
fs.writeFileSync(`${OUT}/findings.json`, JSON.stringify(findings, null, 1));
console.log(`\n${combos} of ${SURFACES.length * WIDTHS.length * LANGS.length} surface x width x language, ${measured} strips measured. Titles not on one line / squeezed / spilling: ${findings.length}`);
if (!measured) { console.log('FAIL: measured nothing'); process.exit(1); }
process.exit(findings.length ? 1 : 0);
