// verify-text-overlap.mjs - NO TWO PIECES OF TEXT PAINT OVER EACH OTHER (5.10 #568).
//
// Ohad's phone: in the club zone week planner the word SHOOTAROUND was painted
// straight over the minutes token "60′" (src/BhbcView.jsx EventChip - a nowrap
// span with min-width:0 shrank while its text could not, and the overflow ran
// under its sibling). "Text overflow. Why is this basic mistake happening all
// around our platforms? Fix it anywhere."
//
// verify-no-text-overflow measures a text run against ITS OWN box (cut,
// ellipsis, spill, one-word). This gate measures text against OTHER TEXT: every
// pair of text runs, from different elements, whose painted rectangles cross.
//
// WHAT IS MEASURED, per surface x width x language, after fonts have loaded and
// every collapsed section ([aria-expanded="false"]) has been opened:
//   - every text node in the document (not inside script/style/svg/noscript/
//     template, not aria-hidden, not whitespace), its painted rectangles taken
//     from Range.getClientRects() - the ink, not the element box;
//   - only VISIBLE runs: offsetParent not null (or position:fixed), effective
//     opacity > 0.05, visibility not hidden, and the run clipped to every
//     overflow-clipping ancestor (hidden/clip/auto/scroll) - a run that lies
//     entirely outside its clip is not on screen and is not compared;
//   - OVERLAP: two runs from different elements, neither an ancestor of the
//     other, in the same overlay layer (a fixed sheet / a big absolute popover
//     legitimately paints over the page; a small absolute badge does not get
//     that pass), whose visible rectangles intersect by MORE THAN 2px in BOTH
//     axes;
//   - CLIPPED (a separate category, reported, does not fail the gate): a run
//     whose rect extends more than 2px past the left or right edge of an
//     ancestor with overflow-x hidden/clip - letters are being cut off.
// Findings are deduped by (surface, width, lang, textA, textB).
//
// BREAK=1 drops the ancestor check, the overlay-layer check, the clipping and
// the 2px tolerance (nested inline runs, touching neighbours, overlays over the
// page and scrolled-away text then all count) - a sanity check that the
// comparison runs at all. The REAL break test is deploy cut 1004r, which still
// carries the SHOOTAROUND bug: this gate must report it there (it does: "60" x
// "Shootaround" 16x12px on /coach/bhbc/practices en@390).
//
//   CDP=http://127.0.0.1:9444 BASE=http://127.0.0.1:5321 node scripts/verify-text-overlap.mjs [--widths 390,768] [--lang en,he] [--only bhbc]
//   env: PORT (BASE = http://127.0.0.1:PORT), WIDTHS, LANGS, ONLY, SEATS (owner,athlete,public), PAGE_TIMEOUT, OUT, BREAK
// Headless CDP on :9444 only - never the visible :9222 profile (a hidden tab of
// the visible Chrome paints no frames). Each (lang, width) gets a throwaway
// browser context that is closed in `finally`: the signed-in session dies with
// it, and no auth.signOut() is ever issued (a bare signOut is GLOBAL and logs
// Ohad out of every device; nothing here signs out any seat).
// Exit 1 on any overlap, or when nothing was measured.
import fs from 'node:fs';
import P from 'puppeteer-core';
import { setWidth } from './lib/viewport.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const PORT = process.env.PORT || '5321';
const BASE = process.env.BASE || `http://127.0.0.1:${PORT}`;
const CDP = process.env.CDP || 'http://127.0.0.1:9444';
if (/:9222\b/.test(CDP)) { console.log('refusing to drive the visible :9222 profile - use the headless :9444'); process.exit(1); }
const WIDTHS = (arg('--widths', process.env.WIDTHS || '360,390,412,768,1024,1440')).split(',').map((s) => Number(s.trim())).filter(Boolean);
const LANGS = (arg('--lang', process.env.LANGS || 'en,he')).split(',').map((s) => s.trim()).filter(Boolean);
const ONLY = arg('--only', process.env.ONLY || null);
const SEATS = (process.env.SEATS || 'owner,athlete,public').split(',');
const PAGE_TIMEOUT = Number(process.env.PAGE_TIMEOUT || 60000);
const BREAK = process.env.BREAK === '1';
const OUT = process.env.OUT || 'audit-out/text-overlap';
fs.mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- surfaces: the coach routes in docs/SURFACES.md, the club zone's own tab URLs,
// the athlete portal, the public demo ----
const coachRoutes = (() => {
  const md = fs.readFileSync('docs/SURFACES.md', 'utf8');
  return [...new Set([...md.matchAll(/`(\/coach(?:\/[a-z0-9/-]*)?)`/gi)].map((m) => m[1]))].filter((r) => !/:/.test(r) && r !== '/coach/bhbc');
})();
const BHBC = ['overview', 'roster', 'schedule', 'practices', 'lifts', 'medical', 'games', 'activity'].map((t) => `/coach/bhbc/${t}`);
const DEMO = ['/demo', '/demo/coach', ...['trainees', 'programs', 'exercises', 'sessions', 'review', 'tasks', 'billing'].map((t) => `/demo/coach/${t}`), '/demo/athlete', '/try'];
const SURFACES = [
  ...[...coachRoutes, ...BHBC].map((url) => ({ seat: 'owner', url })),
  { seat: 'athlete', url: '/athlete' },
  ...DEMO.map((url) => ({ seat: 'public', url })),
].filter((s) => SEATS.includes(s.seat)).filter((s) => !ONLY || ONLY.split(',').some((o) => s.url.includes(o)));

// ---- runs in the page ----
const EXPAND = () => {
  let n = 0;
  for (const el of document.querySelectorAll('[aria-expanded="false"]')) {
    // a menu/popover trigger opens an OVERLAY, not a section: leave those shut
    if (el.closest('nav, header, .hdr-scroll, [role="menu"], [role="menubar"], [role="listbox"]') || el.getAttribute('aria-haspopup')) continue;
    const r = el.getBoundingClientRect(); if (r.width < 4 || r.height < 4) continue;
    el.click(); n++;
  }
  return n;
};

const MEASURE = (BREAK) => {
  const TOL = BREAK ? 0 : 2;
  const vw = innerWidth;
  const skipSel = 'script, style, svg, noscript, template, title, select, option, textarea, [aria-hidden="true"]';
  const clipCache = new Map(), opCache = new Map(), layerCache = new Map();
  const padBox = (a) => { const r = a.getBoundingClientRect(), cs = getComputedStyle(a); return { l: r.left + (parseFloat(cs.borderLeftWidth) || 0), t: r.top + (parseFloat(cs.borderTopWidth) || 0), r: r.right - (parseFloat(cs.borderRightWidth) || 0), b: r.bottom - (parseFloat(cs.borderBottomWidth) || 0) }; };
  // the visible clip of an element: the intersection of every clipping ancestor's padding box; plus the hidden/clip x-edges (for CLIPPED)
  const clipOf = (el) => {
    if (clipCache.has(el)) return clipCache.get(el);
    let box = { l: -1e9, t: -1e9, r: 1e9, b: 1e9 }; const hardX = []; let scroller = false;
    // from the text's OWN element up: an ellipsis title clips its own overflow, so the ink past its box is not on screen (5.10: 37 false hits on Programs)
    for (let a = el; a && a !== document.documentElement; a = a.parentElement) {
      const cs = getComputedStyle(a);
      const cx = /(hidden|clip|auto|scroll)/.test(cs.overflowX), cy = /(hidden|clip|auto|scroll)/.test(cs.overflowY);
      if (!cx && !cy) continue;
      const p = padBox(a);
      // past a sideways SCROLLER the text is reachable by a swipe, not cut: a hidden edge above it is not a CLIPPED finding
      if (cx) { box.l = Math.max(box.l, p.l); box.r = Math.min(box.r, p.r); if (/(auto|scroll)/.test(cs.overflowX) && a.scrollWidth > a.clientWidth + 1) scroller = true; else if (!scroller && a !== el && /(hidden|clip)/.test(cs.overflowX)) hardX.push({ a, l: p.l, r: p.r }); }  /* its own edge is an intended truncation (ellipsis), not CLIPPED */
      if (cy) { box.t = Math.max(box.t, p.t); box.b = Math.min(box.b, p.b); }
    }
    const v = { box, hardX }; clipCache.set(el, v); return v;
  };
  const opacityOf = (el) => {
    if (opCache.has(el)) return opCache.get(el);
    let o = 1; for (let a = el; a && a !== document.documentElement; a = a.parentElement) { o *= +getComputedStyle(a).opacity; if (o <= 0.05) break; }
    opCache.set(el, o); return o;
  };
  // an overlay LAYER: the nearest fixed ancestor, or an absolute ancestor that covers a quarter of the screen (sheet, drawer, popover)
  const layerOf = (el) => {
    if (layerCache.has(el)) return layerCache.get(el);
    let L = null;
    for (let a = el; a && a !== document.body; a = a.parentElement) {
      const acs = getComputedStyle(a), pos = acs.position;
      if (pos === 'fixed') { L = a; break; }
      // a PINNED (sticky) cell with an opaque background covers whatever scrolls under it - by design, not an overlap
      if (pos === 'sticky' && !/^(rgba\(0, 0, 0, 0\)|transparent)$/.test(acs.backgroundColor) && !/rgba\([^)]*, 0(\.\d+)?\)$/.test(acs.backgroundColor)) { L = a; break; }
      if (pos === 'absolute') { const r = a.getBoundingClientRect(); if (r.width * r.height > vw * innerHeight * 0.25) { L = a; break; } }
    }
    layerCache.set(el, L); return L;
  };
  const runs = []; const clipped = []; let textNodes = 0;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = (node.nodeValue || '').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const el = node.parentElement; if (!el || el.closest(skipSel)) continue;
    textNodes++;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    if (el.offsetParent === null && cs.position !== 'fixed' && el !== document.body) continue;
    if (opacityOf(el) <= 0.05) continue;
    const rg = document.createRange(); rg.selectNodeContents(node);
    const rects = [...rg.getClientRects()].filter((x) => x.width > 0.5 && x.height > 0.5);
    if (!rects.length) continue;
    const { box: realBox, hardX } = clipOf(el);
    const box = BREAK ? { l: -1e9, t: -1e9, r: 1e9, b: 1e9 } : realBox;   // BREAK: compare raw ink, unclipped
    const vis = [];
    for (const x of rects) {
      const l = Math.max(x.left, box.l), t = Math.max(x.top, box.t), r = Math.min(x.right, box.r), b = Math.min(x.bottom, box.b);
      if (r - l > 0.5 && b - t > 0.5) vis.push({ l, t, r, b });
      // CLIPPED: letters past a hard x-edge, while some of the run is still on screen
      for (const h of hardX) {
        const over = Math.max(h.l - x.left, x.right - h.r);
        if (over > TOL && x.right > h.l && x.left < h.r && r - l > 0.5 && b - t > 0.5) { clipped.push({ text: text.slice(0, 40), px: Math.round(over), by: h.a.tagName.toLowerCase() + (h.a.className && typeof h.a.className === 'string' ? '.' + h.a.className.split(' ')[0] : '') }); break; }
      }
    }
    if (!vis.length) continue;
    runs.push({ el, text: text.slice(0, 40), rects: vis, layer: layerOf(el), top: Math.min(...vis.map((v) => v.t)), bottom: Math.max(...vis.map((v) => v.b)) });
  }
  // pairs: bucket by 64px rows so a 3,000-run page is not 4.5M comparisons
  const buckets = new Map();
  runs.forEach((ru, i) => { for (let k = Math.floor(ru.top / 64); k <= Math.floor(ru.bottom / 64); k++) { if (!buckets.has(k)) buckets.set(k, []); buckets.get(k).push(i); } });
  const seen = new Set(); const overlaps = [];
  for (const idx of buckets.values()) {
    for (let p = 0; p < idx.length; p++) for (let q = p + 1; q < idx.length; q++) {
      const i = idx[p], j = idx[q]; const key = i < j ? i + ':' + j : j + ':' + i; if (seen.has(key)) continue; seen.add(key);
      const A = runs[i], B = runs[j];
      if (A.el === B.el) continue;
      if (!BREAK && (A.el.contains(B.el) || B.el.contains(A.el))) continue;
      if (!BREAK && A.layer !== B.layer) continue;
      let best = null;
      for (const a of A.rects) for (const b of B.rects) {
        const w = Math.min(a.r, b.r) - Math.max(a.l, b.l), h = Math.min(a.b, b.b) - Math.max(a.t, b.t);
        if (w > TOL && h > TOL && (!best || w * h > best.w * best.h)) best = { w, h, x: Math.max(a.l, b.l), y: Math.max(a.t, b.t) };
      }
      if (best) overlaps.push({ a: A.text, b: B.text, w: Math.round(best.w), h: Math.round(best.h), x: Math.round(best.x), y: Math.round(best.y), ca: A.el.className && typeof A.el.className === 'string' ? A.el.className.split(' ')[0] : A.el.tagName.toLowerCase(), cb: B.el.className && typeof B.el.className === 'string' ? B.el.className.split(' ')[0] : B.el.tagName.toLowerCase() });
    }
  }
  return { textNodes, runs: runs.length, overlaps, clipped };
};

async function settle(pg, route) {
  let prev = -1, same = 0;
  for (let i = 0; i < 30; i++) {
    await wait(400);
    const len = await pg.evaluate(() => (document.body && document.body.innerText || '').length).catch(() => -2);
    if (len === prev && len > 0) { if (++same >= 2) break; } else same = 0;
    prev = len;
  }
  for (let i = 0; i < 20; i++) { if (await pg.evaluate(() => (document.body.innerText || '').replace(/\s+/g, '').length >= 40 && !/LOADING DATA/.test(document.body.innerText.slice(0, 300))).catch(() => false)) break; await wait(500); }
  if (route.includes('/bhbc')) for (let i = 0; i < 20; i++) { if (await pg.evaluate(() => document.querySelectorAll('.bhbc-hdr-tabs button').length > 2).catch(() => false)) break; await wait(500); }
  await pg.evaluate(() => (document.fonts && document.fonts.ready ? document.fonts.ready.then(() => true) : true)).catch(() => {});
  await wait(600);
}

async function freshPage(ctx, lang, w) {
  const pg = await ctx.newPage();
  await pg.setBypassServiceWorker(true).catch(() => {});
  await setWidth(pg, w, w <= 620 ? 844 : 950);
  await pg.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]).catch(() => {});
  await pg.evaluateOnNewDocument((L) => {
    try {
      localStorage.setItem('expo-lang', L);
      localStorage.setItem('expo-collapse:bhbc-lang', JSON.stringify(L));
      localStorage.setItem('expo-theme', 'dark');
      localStorage.setItem('expo-install-snooze-until', String(Date.now() + 86400000));
      sessionStorage.setItem('expo-portal-choice', 'trainer');
    } catch (e) {}
  }, lang);
  return pg;
}

const t0 = Date.now();
const b = await P.connect({ browserURL: CDP, defaultViewport: null, protocolTimeout: 300000 });
const findings = []; const clippedAll = []; const measuredViews = []; const skipped = [];
let textRuns = 0, textNodesTotal = 0;
const planned = SURFACES.length * WIDTHS.length * LANGS.length;
const seenKeys = new Set();

try {
  for (const lang of LANGS) {
    for (const w of WIDTHS) {
      for (const seat of ['owner', 'athlete', 'public']) {
        const list = SURFACES.filter((s) => s.seat === seat);
        if (!list.length) continue;
        const ctx = await b.createBrowserContext();
        let pg = null;
        try {
          pg = await freshPage(ctx, lang, w);
          if (seat !== 'public') {
            // authed-page reads EXPO_EMAIL at module load: a cache-busted import per seat (the box-fit pattern)
            process.env.EXPO_EMAIL = seat === 'athlete' ? 'diego@diegoday.com' : 'ohadyproductions@gmail.com';
            const A = await import('./lib/authed-page.mjs?' + seat + lang + w);
            let who = null;
            try { who = await A.signIn(pg, BASE); } catch (e) { who = { signedIn: false, note: String(e.message || e).slice(0, 100) }; }
            if (!who || !who.signedIn) { for (const s of list) skipped.push(`${s.url} ${lang}@${w} - could not sign in as ${seat} (${(who && who.note) || '?'}) - NOT measured`); continue; }
          }
          for (const s of list) {
            const where = `${s.url} ${lang}@${w}`;
            try {
              await pg.goto(BASE + s.url, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT });
              await settle(pg, s.url);
              const st = await pg.evaluate(() => ({ iw: innerWidth, login: !!document.querySelector('input[type="password"]'), ink: (document.body.innerText || '').replace(/\s+/g, '').length }));
              if (st.iw !== w) { skipped.push(`${where} - viewport is ${st.iw}, asked ${w} - NOT measured`); continue; }
              if (seat !== 'public' && st.login) { skipped.push(`${where} - the login screen came back - NOT measured`); continue; }
              if (st.ink < 40) { skipped.push(`${where} - only ${st.ink} characters on screen - NOT measured`); continue; }
              // BREAK_CSS: a stylesheet injected after load, to prove the CLIPPED side catches a cut (memory: prove a gate by breaking the fix)
              if (process.env.BREAK_CSS) { await pg.addStyleTag({ content: process.env.BREAK_CSS }); await wait(400); }
              // open every collapsed section (nested ones appear after the first round)
              let opened = 0;
              for (let k = 0; k < 3; k++) { const n = await pg.evaluate(EXPAND); opened += n; if (!n) break; await wait(700); }
              await pg.evaluate(() => (document.fonts && document.fonts.ready ? document.fonts.ready.then(() => true) : true)).catch(() => {});
              await wait(300);
              const m = await pg.evaluate(MEASURE, BREAK);
              measuredViews.push(`${where} runs=${m.runs} opened=${opened}`);
              textRuns += m.runs; textNodesTotal += m.textNodes;
              for (const o of m.overlaps) {
                const [ta, tb] = [o.a, o.b].sort();
                const key = `${s.url}|${w}|${lang}|${ta}|${tb}`; if (seenKeys.has(key)) continue; seenKeys.add(key);
                findings.push({ surface: s.url, lang, width: w, a: ta, b: tb, w: o.w, h: o.h, x: o.x, y: o.y, ca: o.ca, cb: o.cb });
                console.log(`OVERLAP ${s.url} ${lang}@${w} "${ta}" x "${tb}" ${o.w}x${o.h}px  (at ${o.x},${o.y}; ${o.ca} / ${o.cb})`);
              }
              const cseen = new Set();
              for (const c of m.clipped) { const k = `${c.text}|${c.by}`; if (cseen.has(k)) continue; cseen.add(k); clippedAll.push({ surface: s.url, lang, width: w, ...c }); console.log(`CLIPPED ${s.url} ${lang}@${w} "${c.text}" ${c.px}px past ${c.by}`); }
            } catch (e) {
              skipped.push(`${where} - ${String(e.message || e).slice(0, 110)} - NOT measured`);
              await pg.close().catch(() => {});
              pg = await freshPage(ctx, lang, w);
            }
          }
        } catch (e) {
          skipped.push(`${seat} ${lang}@${w} - context failed: ${String(e.message || e).slice(0, 110)} - NOT measured`);
        } finally {
          if (pg) await pg.close().catch(() => {});
          await ctx.close().catch(() => {});
        }
      }
      console.log(`  ... ${lang}@${w}: ${measuredViews.length} views, ${textRuns} text runs, ${findings.length} overlaps, ${clippedAll.length} clipped so far (${Math.round((Date.now() - t0) / 1000)}s)`);
    }
  }
} finally {
  await b.disconnect();
}

fs.writeFileSync(`${OUT}/findings.json`, JSON.stringify({ overlaps: findings, clipped: clippedAll }, null, 1));
fs.writeFileSync(`${OUT}/measured.json`, JSON.stringify(measuredViews, null, 1));
const surfacesMeasured = new Set(measuredViews.map((v) => v.split(' ')[0])).size;
if (BREAK) console.log('\n*** BREAK TEST - ancestor check and 2px tolerance OFF: this run is expected to flood ***');
console.log(`\ncoverage: ${measuredViews.length} of ${planned} planned surface x width x language views (seats ${SEATS.join(',')}; widths ${WIDTHS.join(',')}; langs ${LANGS.join(',')}; ${BASE} via ${CDP}; ${Math.round((Date.now() - t0) / 1000)}s)${skipped.length ? `; ${skipped.length} NOT MEASURED` : ''} -> ${OUT}/`);
if (skipped.length) { console.log('  NOT MEASURED (nothing is claimed about these):'); for (const s of skipped.slice(0, 40)) console.log(`    ${s}`); if (skipped.length > 40) console.log(`    ... and ${skipped.length - 40} more`); }
console.log(`TEXT OVERLAP: ${findings.length} overlaps, ${clippedAll.length} clipped across ${surfacesMeasured} surfaces x ${WIDTHS.length} widths x ${LANGS.length} langs, ${textRuns} text runs measured`);
if (!measuredViews.length || !textRuns) { console.log('FAIL: measured nothing - a zero here is not a pass'); process.exit(1); }
process.exit(findings.length ? 1 : 0);
