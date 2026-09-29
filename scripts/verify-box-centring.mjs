// verify-box-centring.mjs — everything inside a box sits on the box's centre.
//
// Ohad, 29.9 (#447): "make sure all the text in every title box is vertically
// center aligned with in the top and bottom borders. so is buttons and tags and
// icons. everything everywhere. no misses!!"
//
// verify-text-centring already measures the LETTERS, but only inside buttons /
// links that declare flex centring and carry a short label, at one width, in one
// language. This is the general form of the same measurement:
//
//   the BOX     any visible element that draws a top AND bottom edge - a border on
//               both sides, or a painted background that differs from what is
//               behind it (title strips, tags, pills, chips, buttons);
//   ITS CONTENT the union of everything the eye sees inside it that belongs to it:
//               the letters (canvas glyph metrics on the Range's baseline - the
//               scripts/lib/ink.mjs method), SVG icons (their artwork's bbox),
//               images (opaque pixels, via lib/ink.mjs), and the boxes of any
//               nested bordered controls (a COPY button in a strip is the strip's
//               content; the button's own letters are judged when the button is);
//   THE TEST    space above the content (inside the top border) vs space below it
//               (inside the bottom border): the centre offset is half the
//               difference. Over TOL is a finding.
//
// Skipped on purpose, and COUNTED so a zero says what it measured:
//   - multi-line content (a wrapped label is top-aligned by design),
//   - native fields (input / select / textarea: the browser draws their text),
//   - boxes whose content overflows them (a clipping bug, judged elsewhere).
//
//   BASE=http://127.0.0.1:5234 node scripts/verify-box-centring.mjs [--widths 390,1440] [--lang en,he] [--only a,b] [--tol 0.75]
// Exit 1 on any finding; writes audit-out/box-centring/findings.json.
import fs from 'node:fs';
import P from 'puppeteer-core';
import { signIn, assertAuthed } from './lib/authed-page.mjs';
import { INK_FN } from './lib/ink.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:5234';
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const WIDTHS = arg('--widths', '390,1440').split(',').map(Number);
const LANGS = arg('--lang', 'en,he').split(',');
const ONLY = arg('--only', null);
const TOL = Number(arg('--tol', '0.75'));
const OUT = process.env.OUT || 'audit-out/box-centring';
fs.mkdirSync(OUT, { recursive: true });

// Every coach surface in the manifest, plus the public demo + sandbox.
const coachRoutes = (() => {
  try {
    const md = fs.readFileSync('docs/SURFACES.md', 'utf8');
    return [...new Set([...md.matchAll(/`(\/coach[a-z0-9/-]*)`/gi)].map((m) => m[1]))];
  } catch { return ['/coach/dashboard', '/coach/bhbc']; }
})();
const SURFACES = [
  ...coachRoutes.map((r) => ({ id: 'app' + r.replace(/\//g, '-'), url: r, auth: true })),
  // #467 (29.9, his words: "add a vertical measure and fix for every button and
  // tag we have anywhere on all platforms"): EVERY demo page (the athlete page,
  // sessions and tasks were never walked), the sign-in page, and the marketing
  // site (MARKETING_BASE, a separate build: expo-il)
  ...['/demo', '/demo/he', '/demo/coach', '/demo/coach/trainees', '/demo/coach/trainees/t1', '/demo/coach/programs', '/demo/coach/exercises', '/demo/coach/sessions', '/demo/coach/review', '/demo/coach/tasks', '/demo/coach/billing', '/demo/athlete', '/try', '/login']
    .map((r) => ({ id: 'pub' + r.replace(/\//g, '-'), url: r, auth: false })),
  ...(process.env.MARKETING_BASE ? ['/', '/#/online', '/#/gym', '/#/terms'].map((r) => ({ id: 'mkt' + (r.replace(/[\/#]+/g, '-').replace(/-$/, '') || '-chooser'), url: r, auth: false, base: process.env.MARKETING_BASE })) : []),
].filter((s) => !ONLY || ONLY.split(',').some((o) => s.id.includes(o)));

const MEASURE = (tol) => {
  const vis = (el) => { const cs = getComputedStyle(el); return cs.display !== 'none' && cs.visibility !== 'hidden' && +cs.opacity > 0.05; };
  const transparent = (c) => !c || c === 'transparent' || /rgba\(\d+, \d+, \d+, 0\)/.test(c);
  const bgBehind = (el) => { for (let x = el.parentElement; x; x = x.parentElement) { const c = getComputedStyle(x).backgroundColor; if (!transparent(c)) return c; } return 'rgb(0, 0, 0)'; };
  const edge = (cs, side) => cs[`border${side}Style`] !== 'none' && parseFloat(cs[`border${side}Width`]) >= 0.5 && !transparent(cs[`border${side}Color`]);
  // a BOX: both horizontal edges drawn, or a painted fill that differs from what is behind it
  const isBox = (el) => {
    if (!vis(el)) return false;
    const tag = el.tagName.toLowerCase();
    if (/^(input|select|textarea|svg|img|video|canvas|option|html|body)$/.test(tag)) return false;
    const r = el.getBoundingClientRect();
    if (r.height < 14 || r.height > 70 || r.width < 14) return false;
    const cs = getComputedStyle(el);
    if (edge(cs, 'Top') && edge(cs, 'Bottom')) return true;
    const bg = cs.backgroundColor;
    return !transparent(bg) && bg !== bgBehind(el);
  };
  const cv = document.createElement('canvas'); const cx = cv.getContext('2d');
  // the letters of one text node: baseline from the Range line box (respects flex
  // centring), ascent / descent from canvas actualBoundingBox (the glyphs)
  const textInk = (node) => {
    const txt = node.textContent.trim(); if (!txt) return null;
    const rg = document.createRange(); rg.selectNodeContents(node);
    const rects = [...rg.getClientRects()].filter((x) => x.width > 0 && x.height > 0);
    if (!rects.length) return null;
    const tops = []; for (const x of rects) if (!tops.some((t) => Math.abs(t - x.top) <= 3)) tops.push(x.top);
    if (tops.length > 1) return { multi: true };
    const lb = rg.getBoundingClientRect();
    const cs = getComputedStyle(node.parentElement);
    cx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    // measure the letters as SHOWN: text-transform uppercase draws capitals, and
    // lowercase ascenders / descenders measured from the raw text skewed every
    // uppercase label (29.9 first run)
    let shown = cs.textTransform === 'uppercase' ? txt.toUpperCase() : cs.textTransform === 'lowercase' ? txt.toLowerCase() : txt;
    // HEBREW BY LETTER BODIES: the eye centres Hebrew on the bodies of its
    // letters. The finals ך ן ף ץ and ק drop below the line and ל rises above it;
    // measured as ink they read 1.5px low ("נקה", "בדיקה") or 1.5px high ("לוח",
    // "הכל") while the word sits centred. Each is measured as its body twin.
    if (/[\u0590-\u05FF]/.test(shown)) shown = shown.replace(/[ךןףץקל]/g, (c) => ({ 'ך': 'כ', 'ן': 'ו', 'ף': 'פ', 'ץ': 'צ', 'ק': 'ה', 'ל': 'ג' }[c])).replace(/[\u05F3\u05F4\u2019'"]/g, '');   // geresh / gershayim ride above the bodies too
    const m = cx.measureText(shown);
    const contentH = m.fontBoundingBoxAscent + m.fontBoundingBoxDescent;
    const base = lb.y + (lb.height - contentH) / 2 + m.fontBoundingBoxAscent;
    const t = base - m.actualBoundingBoxAscent, b = base + m.actualBoundingBoxDescent;
    return b > t ? { top: t, bot: b } : null;
  };
  const svgInk = (svg) => { try { const bb = svg.getBBox(); const m = svg.getScreenCTM(); if (!m || !(bb.height > 0)) return null; return { top: m.f + bb.y * m.d, bot: m.f + (bb.y + bb.height) * m.d }; } catch { return null; } };
  const out = []; let measured = 0, skipped = { multi: 0, overflow: 0, empty: 0 };
  const boxes = [...document.querySelectorAll('body *')].filter(isBox);
  const boxSet = new Set(boxes);
  const owner = (n) => { for (let x = n.nodeType === 3 ? n.parentElement : n.parentElement; x; x = x.parentElement) if (boxSet.has(x)) return x; return null; };
  for (const el of boxes) {
    const r = el.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight * 6) continue;
    const cs = getComputedStyle(el);
    const inTop = r.top + (parseFloat(cs.borderTopWidth) || 0), inBot = r.bottom - (parseFloat(cs.borderBottomWidth) || 0);
    let t = Infinity, b = -Infinity, multi = false, n = 0, chart = false; const parts = [];
    const take = (k) => { if (!k) return; if (k.multi) { multi = true; return; } t = Math.min(t, k.top); b = Math.max(b, k.bot); n++; parts.push(k); };
    // letters owned by this box
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walk.nextNode())) {
      if (!node.textContent.trim() || owner(node) !== el) continue;
      let hidden = false; for (let x = node.parentElement; x && x !== el; x = x.parentElement) if (!vis(x) || getComputedStyle(x).position === 'absolute') { hidden = true; break; }
      if (!hidden) take(textInk(node));
    }
    // icons, images and nested boxes owned by this box
    for (const d of el.querySelectorAll('svg, img, *')) {
      if (d === el || owner(d) !== el || !vis(d)) continue;
      const tag = d.tagName.toLowerCase();
      // a CHART (a wide svg, no text in the box) draws data, not a glyph to centre:
      // the waveform on the marketing page read "10.4px off" where its line sat
      if (tag === 'svg') { const q = d.getBoundingClientRect(); if (q.height >= 24 && q.width > 3 * q.height && !(el.innerText || '').trim()) { chart = true; continue; } take(svgInk(d)); }
      else if (tag === 'img') take(window.__ink(d));
      else if (boxSet.has(d) && getComputedStyle(d).position !== 'absolute') { const q = d.getBoundingClientRect(); take({ top: q.top, bot: q.bottom }); }
    }
    // two pieces of content one ABOVE the other (no vertical overlap) = a stack
    // (a kanban column's header over its cards), not one line to centre
    if (!multi && parts.some((a) => parts.some((q) => q !== a && q.top > a.bot + 1))) multi = true;
    if (multi) { skipped.multi++; continue; }
    if (!n || chart) { skipped.empty++; continue; }
    if (t < inTop - 1 || b > inBot + 1) { skipped.overflow++; continue; }
    measured++;
    const above = t - inTop, below = inBot - b, off = (above - below) / 2;
    if (Math.abs(off) > tol) {
      const lab = (el.innerText || el.getAttribute('aria-label') || el.tagName).replace(/\s+/g, ' ').trim().slice(0, 34);
      out.push({ what: `${el.tagName.toLowerCase()}${typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/)[0] : ''} "${lab}"`, off: Math.round(off * 100) / 100, above: Math.round(above * 10) / 10, below: Math.round(below * 10) / 10, h: Math.round(r.height) });
    }
  }
  return { out, measured, skipped };
};

const b = await P.connect({ browserURL: (process.env.CDP || 'http://127.0.0.1:9222'), defaultViewport: null, protocolTimeout: 300000 });
const pg = await b.newPage();
const findings = []; let measured = 0, combos = 0, errors = 0; const skippedAll = { multi: 0, overflow: 0, empty: 0 };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  await pg.evaluateOnNewDocument(() => { try { sessionStorage.setItem('expo-portal-choice', 'trainer'); localStorage.setItem('expo-install-snooze-until', String(Date.now() + 86400000)); } catch (e) {} });
  // signed in for REAL (a zero measured on /login means nothing)
  let authed = false;
  for (let k = 0; k < 3 && !authed; k++) { await signIn(pg, BASE); authed = await assertAuthed(pg, BASE, '/coach/dashboard'); }
  if (!authed) { console.log('FAIL: could not sign in - nothing measured'); process.exit(1); }
  for (const lang of LANGS) {
    await pg.evaluateOnNewDocument((l) => { try { localStorage.setItem('expo-lang', l); localStorage.setItem('expo-collapse:bhbc-lang', JSON.stringify(l)); } catch (e) {} }, lang);
    for (const w of WIDTHS) {
      const phone = w < 700;
      await pg.emulate({ viewport: { width: w, height: phone ? 844 : 950, deviceScaleFactor: phone ? 3 : 1, isMobile: true, hasTouch: phone },
        userAgent: phone ? 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0 Mobile Safari/537.36' : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0 Safari/537.36' });
      for (const s of SURFACES) {
        const id = `${s.id}/${lang}/${w}`;
        try {
          await pg.goto((s.base || BASE) + s.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
          // settle: the page's box count the same on two looks a second apart
          for (let k = 0; k < 30; k++) { await wait(500); if (await pg.evaluate(() => !/LOADING DATA/.test(document.body.innerText.slice(0, 200)))) break; }
          { let last = -1; for (let k = 0; k < 20; k++) { await wait(1000); const n = await pg.evaluate(() => document.querySelectorAll('button, .title-strip, [data-strip]').length); if (n > 0 && n === last) break; last = n; } }
          if (s.auth && /\/login/.test(pg.url())) throw new Error('landed on /login - signed out');
          // BREAK=1: push the first title strip's letters 4px down - the gate must report it
          if (process.env.BREAK) await pg.evaluate(() => { const st = [...document.querySelectorAll('.title-strip')].find((x) => x.getBoundingClientRect().height > 0); if (st) { st.style.paddingTop = (parseFloat(getComputedStyle(st).paddingTop) + 8) + 'px'; st.style.boxSizing = 'border-box'; } });
          await pg.evaluate(INK_FN);
          const r = await pg.evaluate(MEASURE, TOL);
          combos++; measured += r.measured; for (const k of Object.keys(skippedAll)) skippedAll[k] += r.skipped[k];
          const seen = new Set();
          for (const f of r.out) { const key = f.what + f.off; if (seen.has(key)) continue; seen.add(key); findings.push({ id, ...f }); console.log(`OFF ${String(f.off).padStart(5)}px  ${id.padEnd(34)} ${f.what}  (above ${f.above} / below ${f.below}, h ${f.h})`); }
        } catch (e) { errors++; console.log(`ERROR ${id} ${String(e).slice(0, 100)}`); }
      }
    }
  }
} finally { await pg.close(); b.disconnect(); }
fs.writeFileSync(`${OUT}/findings.json`, JSON.stringify(findings, null, 1));
console.log(`\n${combos} of ${SURFACES.length * WIDTHS.length * LANGS.length} surface x width x language measured, ${measured} boxes measured against their own content (skipped: ${skippedAll.multi} multi-line, ${skippedAll.overflow} overflowing, ${skippedAll.empty} empty). Off centre by more than ${TOL}px: ${findings.length}`);
if (!measured) { console.log('FAIL: measured nothing'); process.exit(1); }
// a surface that errored (signed out, a crash) was NOT measured: not a pass (AUDIT-470)
if (errors) { console.log(`FAIL: ${errors} surface(s) not measured`); process.exit(1); }
process.exit(findings.length ? 1 : 0);
