// DO TWO TEXT RUNS ON ONE LINE SHARE A VERTICAL CENTRE?
//
// Ohad, 29.9 22:22 (#463), athlete portal: "warm up and block number are not
// vertically center aligned. you were suppsoe to audit it a while ago".
//
// THE HOLE THIS CLOSES. verify-box-centring (#447) measures a text's ink against
// ITS OWN box's borders. A title and the small count beside it ("WARM-UP · BLOCK
// #9 (4)", "HOME W/O 8 EX", "75 KG") have no border between them, so a count
// riding 2px low of the title's centre passed every gate we had.
//
// HOW IT MEASURES INK. Not the element box (a 13px and a 10px run in one flex row
// can have centred BOXES and uncentred LETTERS): each run's glyphs are measured
// with the font itself - canvas measureText(actualBoundingBoxAscent/Descent) on
// the run's own text, weight, size and family, text-transform applied - and
// placed on the run's real baseline (its text rect, split by the font's
// ascent : descent). Transforms (a translateY lift) are in the rect, so a hand
// calibration is judged by where it actually lands.
//
// PAIRS: two runs that sit side by side (gap <= 28px), overlap vertically, are
// in different elements, and differ in size or family - the case where a shared
// baseline or box centre does NOT make a shared ink centre. Runs inside two
// different BORDERED boxes are not a pair (a button's text is centred in the
// button; box-centring owns that).
//
//   CDP=http://[::1]:9444 BASE=http://127.0.0.1:5247 node scripts/verify-inline-centre.mjs [--only substr] [--widths 390,1440] [--langs en,he]
//   BREAK=1 lifts every run under 11px by 3px - the gate must go red.
import fs from 'node:fs';
import P from 'puppeteer-core';
import * as A from './lib/authed-page.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:5247';
const CDP = process.env.CDP || 'http://[::1]:9444';
const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const ONLY = arg('--only');
const WIDTHS = (arg('--widths') || '390,1440').split(',').map(Number);
const LANGS = (arg('--langs') || 'en,he').split(',');
const TOL = Number(process.env.TOL || 1);
const OUT = 'audit-out/inline-centre';
fs.mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const ROUTES = [
  '/demo/athlete',
  '/demo/coach', '/demo/coach/trainees', '/demo/coach/trainees/t1', '/demo/coach/programs', '/demo/coach/exercises',
  '/demo/coach/sessions', '/demo/coach/review', '/demo/coach/tasks', '/demo/coach/billing',
  '/coach/dashboard', '/coach/athletes', '/coach/programs', '/coach/exercises', '/coach/sessions', '/coach/review',
  '/coach/tasks', '/coach/billing', '/coach/waitlist', '/coach/bhbc/overview', '/coach/bhbc/schedule', '/coach/bhbc/roster',
].filter((r) => !ONLY || r.includes(ONLY));

function measure(tol, brk) {
  const cv = document.createElement('canvas').getContext('2d');
  // PIXEL ink, not measureText's actualBoundingBox (whole pixels - a 1px miss,
  // which is what he sees, read as centred; #463). The run is drawn at 8x in its
  // own font and the inked rows are scanned: 1/8 px resolution.
  const S = 8, inkCache = new Map();
  const pixInk = (txt, font, sizePx) => {
    const k = font + '|' + txt; if (inkCache.has(k)) return inkCache.get(k);
    const big = font.replace(/([\d.]+)px/, (_, v) => `${parseFloat(v) * S}px`);
    const c2 = document.createElement('canvas'); const x = c2.getContext('2d');
    x.font = big; const w = Math.ceil(x.measureText(txt).width) + 20; const H = Math.ceil(sizePx * S * 3);
    c2.width = Math.min(w, 8000); c2.height = H; x.font = big; x.fillStyle = '#000'; x.textBaseline = 'alphabetic';
    const baseY = Math.round(sizePx * S * 2); x.fillText(txt, 10, baseY);
    const d = x.getImageData(0, 0, c2.width, H).data; let top = -1, bot = -1;
    for (let y = 0; y < H && top < 0; y++) for (let i = y * c2.width * 4 + 3, e = i + c2.width * 4; i < e; i += 4) if (d[i] > 60) { top = y; break; }
    for (let y = H - 1; y >= 0 && bot < 0; y--) for (let i = y * c2.width * 4 + 3, e = i + c2.width * 4; i < e; i += 4) if (d[i] > 60) { bot = y + 1; break; }
    const r = top < 0 ? null : { asc: (baseY - top) / S, desc: (bot - baseY) / S };
    inkCache.set(k, r); return r;
  };
  const vis = (el) => { for (let e = el; e && e !== document.body; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return false; } return true; };
  const bw = (cs, s) => cs[`border${s}Style`] !== 'none' && parseFloat(cs[`border${s}Width`]) >= 0.5 && !/rgba\(\d+, \d+, \d+, 0\)|transparent/.test(cs[`border${s}Color`]);
  const boxOf = (el) => { for (let e = el; e && e !== document.body; e = e.parentElement) { const cs = getComputedStyle(e); if ((bw(cs, 'Top') && bw(cs, 'Bottom')) || e.matches('button, [role=button], a, input, select')) return e; if (/flex|grid|block/.test(cs.display) && e !== el && e.getBoundingClientRect().height > 60) return null; } return null; };
  if (brk) for (const el of document.querySelectorAll('span, div')) { if (parseFloat(getComputedStyle(el).fontSize) < 11 && [...el.childNodes].some((n) => n.nodeType === 3 && n.nodeValue.trim())) el.style.transform = 'translateY(-3px)'; }
  const runs = [];
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walk.nextNode())) {
    const raw = (n.nodeValue || '').trim();
    if (!raw || raw.length > 60) continue;
    if (/^[\p{P}\p{S}\s]+$/u.test(raw)) continue;   // only punctuation / symbols ( ) · / ✈: no letter body to centre
    const el = n.parentElement;
    if (!el || el.closest('svg, script, style, [aria-hidden="true"]') || !vis(el)) continue;
    const rg = document.createRange(); rg.selectNodeContents(n);
    const rects = [...rg.getClientRects()].filter((q) => q.width > 0 && q.height > 0);
    if (rects.length !== 1) continue;                     // one line only
    const r = rects[0];
    if (r.bottom < 0 || r.top > innerHeight * 3) continue;
    const cs = getComputedStyle(el);
    let txt = raw;
    if (cs.textTransform === 'uppercase') txt = txt.toUpperCase();
    // HEBREW BY ITS LETTER BODIES (box-centring's rule): a name's ן ק hang below
    // and ל rises above, so raw ink moved the centre with the spelling of each
    // name. Map them to body-only letters and drop the geresh before measuring.
    if (/[֐-׿]/.test(txt)) txt = txt.replace(/[ךןףץקל]/g, (ch) => ({ 'ך': 'כ', 'ן': 'ו', 'ף': 'פ', 'ץ': 'צ', 'ק': 'ה', 'ל': 'ג' }[ch])).replace(/[׳״’'"]/g, '');
    // a suffix INSIDE a bigger run ("63.3" + its "kg") is part of that run - the
    // neighbour compares against the figure, not its unit
    if (el.parentElement && [...el.parentElement.childNodes].some((x) => x.nodeType === 3 && x.nodeValue.trim()) && parseFloat(getComputedStyle(el.parentElement).fontSize) > parseFloat(cs.fontSize)) continue;
    cv.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const m = cv.measureText(txt);
    const fa = m.fontBoundingBoxAscent, fd = m.fontBoundingBoxDescent;
    if (!(fa + fd > 0)) continue;
    const base = r.top + r.height * (fa / (fa + fd));
    const ink = pixInk(txt, cv.font, parseFloat(cs.fontSize));
    if (!ink) continue;
    const top = base - ink.asc, bot = base + ink.desc;
    if (!(bot > top)) continue;
    runs.push({ el, txt: raw.slice(0, 26), l: r.left, rt: r.right, t: r.top, b: r.bottom, c: (top + bot) / 2, size: parseFloat(cs.fontSize), fam: cs.fontFamily.split(',')[0], box: boxOf(el) });
  }
  const out = [];
  const seen = new Set();
  for (let i = 0; i < runs.length; i++) for (let j = 0; j < runs.length; j++) {
    if (i === j) continue;
    const a = runs[i], b = runs[j];
    if (a.el === b.el || a.el.contains(b.el) || b.el.contains(a.el)) continue;
    const gap = b.l - a.rt;
    if (gap < -1 || gap > 28) continue;                    // b right after a
    const ov = Math.min(a.b, b.b) - Math.max(a.t, b.t);
    if (ov < 0.5 * Math.min(a.b - a.t, b.b - b.t)) continue;
    if (Math.abs(a.size - b.size) < 0.5 && a.fam === b.fam) continue;
    if (a.box !== b.box && (a.box || b.box)) continue;   // two different boxes
    // ONE LINE: their nearest common parent is about one line tall. A big date
    // number beside a two-line block ("13" | "vs Ramat Gan" / "League · Mon")
    // is centred on the BLOCK, and comparing it line by line was noise.
    let cp = a.el; while (cp && !cp.contains(b.el)) cp = cp.parentElement;
    if (!cp) continue;
    const cpH = cp.getBoundingClientRect().height;
    if (cpH > 1.6 * Math.max(a.b - a.t, b.b - b.t) + 4) continue;
    const d = b.c - a.c;
    if (Math.abs(d) <= tol) continue;
    const key = `${a.txt}|${b.txt}`;
    if (seen.has(key)) continue; seen.add(key);
    out.push({ a: a.txt, as: a.size, b: b.txt, bs: b.size, d: +d.toFixed(2) });
  }
  return { runs: runs.length, out };
}

const b = await P.connect({ browserURL: CDP, defaultViewport: null, protocolTimeout: 300000 });
const ctx = await b.createBrowserContext();
const pg = await ctx.newPage();
let bad = 0, pairsMeasured = 0;
const report = [];
try {
  await pg.evaluateOnNewDocument(() => { try { sessionStorage.setItem('expo-portal-choice', 'trainer'); localStorage.setItem('expo-install-snooze-until', String(Date.now() + 86400000)); } catch (e) { /* private */ } });
  if (ROUTES.some((r) => r.startsWith('/coach'))) {
    let ok = false; for (let k = 0; k < 3 && !ok; k++) { await A.signIn(pg, BASE); ok = await A.assertAuthed(pg, BASE); }
    if (!ok) throw new Error('not signed in - the /coach routes would measure a login screen');
  }
  for (const lang of LANGS) {
    await pg.evaluateOnNewDocument((l) => { try { localStorage.setItem('expo-lang', l); } catch (e) { /* private */ } }, lang);
    for (const w of WIDTHS) {
      const phone = w < 700;
      await pg.emulate({ viewport: { width: w, height: 900, deviceScaleFactor: 2, isMobile: phone, hasTouch: phone }, userAgent: phone ? 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0 Mobile Safari/537.36' : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0 Safari/537.36' });
      for (const route of ROUTES) {
        await pg.goto(BASE + route, { waitUntil: 'domcontentloaded' });
        let prev = -1; for (let i = 0; i < 20; i++) { await wait(600); const len = await pg.evaluate(() => document.body.innerText.length); if (len === prev && len > 200) break; prev = len; }
        await pg.evaluate(() => document.fonts && document.fonts.ready);
        const r = await pg.evaluate(measure, TOL, !!process.env.BREAK);
        const id = `${route} ${lang} ${w}`;
        pairsMeasured += r.runs;
        if (r.runs < 10) { bad++; console.log(`${id}: only ${r.runs} text runs - NOT measured`); continue; }
        report.push({ id, ...r });
        bad += r.out.length;
        console.log(`${id}: ${r.runs} runs, ${r.out.length} off`);
        for (const f of r.out.slice(0, 12)) console.log(`   "${f.a}" ${f.as}px | "${f.b}" ${f.bs}px   ${f.d > 0 ? '+' : ''}${f.d}px`);
        if (r.out.length > 12) console.log(`   ... ${r.out.length - 12} more`);
      }
    }
  }
} finally {
  fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 1));
  await ctx.close(); b.disconnect();
}
console.log(`\n${bad} same-line pairs off centre by > ${TOL}px (${pairsMeasured} runs measured)${process.env.BREAK ? ' (BREAK run: must be > 0)' : ''}`);
process.exit(bad ? 1 : 0);
