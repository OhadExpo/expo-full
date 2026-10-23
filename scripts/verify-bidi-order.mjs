// #789 "lines with both english and hebrew are perfect ocd. everywhere" - a MEASURED gate, not a pattern guess.
// Every paragraph that mixes Hebrew with numbers or Latin is judged by WHERE its pieces actually land:
//   - a block's expected order is the PAGE language: Hebrew page = right to left, English page = left to right;
//   - an isolate (<bdi>, an element with dir=, unicode-bidi isolate/plaintext) is ONE unit inside its parent, and is
//     judged on its own as well - by its first strong letter (dir=auto / bdi), so Hebrew content forced dir=ltr
//     ("78.3 ק״ג" read as "ק״ג 78.3") is caught;
//   - the pieces (a Hebrew word with its geresh, a number group, a Latin phrase) must sit at decreasing x for right
//     to left, increasing x for left to right. Consecutive pieces of the "other" direction merge into one run first
//     (an English phrase inside a Hebrew line reads left to right inside itself).
// Every non-GET to Supabase is blocked.
// Usage: NO_DB=1 BASE=http://127.0.0.1:5392 CDP=http://127.0.0.1:9444 ROUTES="demo/athlete/program?lang=he,..." WIDTHS="390,820,1440"
//        node scripts/verify-bidi-order.mjs        (exit 1 when any line reads backwards)
// Proved by breaking (15.10): production's old code read 51 lines backwards on the demo athlete + /try at 390; the fixed
// code 0. NO_DB=1 blocks every Supabase call (the demo needs none) - a sweep then adds zero load to the shared DB.
import P from 'puppeteer-core';
import fs from 'node:fs';
const BASE = process.env.BASE || 'http://127.0.0.1:5392';
const ROUTES = (process.env.ROUTES || 'demo/athlete/program?lang=he').split(',');
const WIDTHS = (process.env.WIDTHS || '390').split(',').map(Number);
const SETTLE = Number(process.env.SETTLE || 6000);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await P.connect({ browserURL: process.env.CDP || 'http://127.0.0.1:9444', defaultViewport: null, protocolTimeout: 180000 });
const pg = await b.newPage();
await pg.setRequestInterception(true);
const blocked = [];
pg.on('request', (r) => {
  // NO_DB=1: demo surfaces run on fixtures - block EVERY Supabase call, so a sweep adds zero load to the shared DB
  if (process.env.NO_DB === '1' && /supabase\.co/.test(r.url())) { blocked.push('nodb'); return r.abort(); }
  if (/supabase\.co\/(rest|functions)/.test(r.url()) && !['GET', 'HEAD', 'OPTIONS'].includes(r.method()) && !/rpc\/(get_|is_|my_)/.test(r.url())) { blocked.push(r.method()); return r.abort(); }
  r.continue().catch(() => {});
});
// ZONE_LANG=he|en: the BHBC zone has its OWN language toggle ('bhbc-lang-session' in sessionStorage since #954b), set before every load
if (process.env.ZONE_LANG) await pg.evaluateOnNewDocument((l) => { try { sessionStorage.setItem('bhbc-lang-session', l); localStorage.setItem('expo-install-snooze-until', String(Date.now() + 864e5)); } catch { /* storage blocked */ } }, process.env.ZONE_LANG);
const all = [];
let pages = 0, judged = 0, bad = 0;
try {
  for (const route of ROUTES) for (const w of WIDTHS) {
    await pg.setViewport({ width: w, height: 900, isMobile: w < 1000, hasTouch: w < 1000, deviceScaleFactor: 1 });
    const url = route.startsWith('http') ? route : `${BASE}/${route}`;
    await pg.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 }); await wait(SETTLE);
    const res = await pg.evaluate(() => {
      const HE = /[֐-׿]/, LAT = /[A-Za-z]/;
      const TOK = /[֐-׿][֐-׿'"׳״]*|\d+(?:[.,:]\d+)*|[A-Za-z]+(?:['’][A-Za-z]+)*/g;
      let pageHe = false;
      try { pageHe = document.body.dataset.lang === 'he' || /(^|[?&])lang=he\b/.test(location.search) || (!/(^|[?&])lang=en\b/.test(location.search) && localStorage.getItem('expo-lang') === 'he'); } catch { /* storage blocked */ }
      if (/^he/i.test(document.documentElement.lang || '') || document.documentElement.dir === 'rtl' || document.body.dir === 'rtl') pageHe = !/(^|[?&])lang=en\b/.test(location.search) && !/^en/i.test(document.documentElement.lang || '');
      if (document.querySelector('.bhbc-zone')) pageHe = document.querySelector('.bhbc-zone').getAttribute('dir') === 'rtl';
      const disp = (e) => getComputedStyle(e).display;
      const isBlock = (e) => { const d = disp(e); return !/^inline/.test(d) && d !== 'contents'; };
      const isIso = (e) => e.tagName === 'BDI' || e.hasAttribute('dir') || /isolate|plaintext/.test(getComputedStyle(e).unicodeBidi);
      const firstStrong = (txt) => { const m = /[A-Za-z֐-׿]/.exec(txt); return m ? (HE.test(m[0]) ? 'rtl' : 'ltr') : null; };
      // the first strong letter the way dir=auto finds it: nested isolates (bdi, dir=) are skipped
      const autoDir = (el) => { const w = document.createTreeWalker(el, NodeFilter.SHOW_ALL, { acceptNode: (n) => (n !== el && n.nodeType === 1 && (n.tagName === 'BDI' || n.hasAttribute('dir')) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) }); for (let n = w.nextNode(); n; n = w.nextNode()) if (n.nodeType === 3) { const d = firstStrong(n.nodeValue); if (d) return d; } return null; };
      const expectedOf = (el, isBlk) => {
        if (isBlk && !el.hasAttribute('dir') && el.tagName !== 'BDI') return pageHe ? 'rtl' : 'ltr';   // a block reads in the PAGE language
        const d = (el.getAttribute('dir') || '').toLowerCase();
        const fs0 = firstStrong(el.textContent);
        if (el.tagName === 'BDI' || d === 'auto' || /plaintext/.test(getComputedStyle(el).unicodeBidi)) return autoDir(el) || (pageHe ? 'rtl' : 'ltr');
        if (d === 'rtl') return 'rtl';                       // an explicit RTL line (a Hebrew page's row) reads right to left
        if (d === 'ltr') return autoDir(el) === 'rtl' ? 'rtl' : 'ltr';   // HEBREW forced LTR is judged as Hebrew ("78.3 ק״ג")
        return getComputedStyle(el).direction;
      };
      const out = []; let lines = 0, ranges = 0; window.__dbg = [];
      const paras = [...document.querySelectorAll('body *')].filter((e) => e.getClientRects().length && !['SCRIPT', 'STYLE', 'TEXTAREA', 'SELECT', 'OPTION', 'svg'].includes(e.tagName) && ((isBlock(e) && [...e.childNodes].some((n) => (n.nodeType === 3 && n.nodeValue.trim()) || (n.nodeType === 1 && !isBlock(n) && n.textContent.trim()))) || (!isBlock(e) && isIso(e) && e.textContent.trim())));
      for (const para of paras) {
        const blk = isBlock(para);
        const toks = [];
        const walk = (node) => {
          for (const c of node.childNodes) {
            if (c.nodeType === 3) { for (const m of c.nodeValue.matchAll(TOK)) { const r = document.createRange(); r.setStart(c, m.index); r.setEnd(c, m.index + m[0].length); const rc = [...r.getClientRects()][0]; if (!rc || !rc.width) continue; toks.push({ s: m[0], he: HE.test(m[0]), x: rc.left, r: rc.right, y: Math.round(rc.top + rc.height / 2) }); } }
            else if (c.nodeType === 1 && !isBlock(c) && disp(c) !== 'none') {
              if (isIso(c)) { const rcs = [...c.getClientRects()].filter((q) => q.width); if (!rcs.length || !c.textContent.trim()) continue; const rc = rcs[0]; toks.push({ s: '[' + c.textContent.trim().slice(0, 30) + ']', he: firstStrong(c.textContent) === 'rtl', iso: true, x: rc.left, r: rc.right, y: Math.round(rc.top + rc.height / 2) }); }
              else walk(c);
            }
          }
        };
        walk(para);
        if (toks.length < 2) continue;
        const exp = expectedOf(para, blk);
        const groups = [];
        for (const t of toks) { const g = groups.find((gg) => Math.abs(gg.y - t.y) <= 4); if (g) g.t.push(t); else groups.push({ y: t.y, t: [t] }); }
        for (const g of groups) {
          const t = g.t;
          if (t.length < 2 || !t.some((k) => k.he) || !t.some((k) => !k.he)) continue;   // only mixed lines
          lines++;
          // merge runs of the opposite direction (they read inside themselves the other way)
          const runs = [];
          for (const k of t) {
            const last = runs[runs.length - 1];
            const other = exp === 'rtl' ? !k.he : k.he;
            const lastOther = last && (exp === 'rtl' ? !last.he : last.he);
            if (other && lastOther && !k.iso && !last.iso && (exp === 'rtl' ? k.x >= last.r - 1 : k.r <= last.x + 1)) { last.s += ' ' + k.s; last.x = Math.min(last.x, k.x); last.r = Math.max(last.r, k.r); }
            else runs.push({ ...k });
          }
          if (window.__dbg) window.__dbg.push({ exp, runs: runs.map((q) => q.s + '@' + Math.round(q.x)).join(' ') });   // DEBUG=1 prints every judged line
          for (let i = 1; i < runs.length; i++) {
            const wrong = exp === 'rtl' ? runs[i].x > runs[i - 1].x + 1 : runs[i].x < runs[i - 1].x - 1;
            if (wrong) { const r0 = para.getBoundingClientRect(); out.push({ expect: exp, line: t.map((k) => k.s).join(' ').slice(0, 90), pair: `${runs[i - 1].s} | ${runs[i].s}`, at: [Math.round(r0.left), Math.round(r0.top + scrollY)], tag: para.tagName.toLowerCase() + (blk ? '' : '(iso)') }); break; }
          }
        }
      }
      // A TIME RANGE reads left to right in both languages ('5:45–5:55'): inside a Hebrew line
      // the two numbers are separate weak runs and the bidi algorithm can swap them (15.10, Yehu's day card printed
      // '5:55—5:45 · דופק עד 142'). The merge above hides that, so every range is measured on its own: first part leftmost.
      // TIMES only (m:ss / h:mm, a pace or a clock range): a prose range of whole numbers ('כאב 0–10') swaps by design
      const RANGE = /(\d{1,2}:\d{2})\s*[–—-]\s*(\d{1,2}:\d{2})/g;
      const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = tw.nextNode(); n; n = tw.nextNode()) {
        const pe = n.parentElement; if (!pe || !pe.getClientRects().length || pe.closest('script,style,svg,textarea') || getComputedStyle(pe).visibility === 'hidden') continue;
        for (const m of n.nodeValue.matchAll(RANGE)) {
          const xOf = (off, len) => { const r = document.createRange(); r.setStart(n, off); r.setEnd(n, off + len); const q = [...r.getClientRects()].filter((z) => z.width)[0]; return q ? q : null; };
          const a = xOf(m.index, m[1].length), z = xOf(m.index + m[0].length - m[2].length, m[2].length);
          if (!a || !z || Math.abs(a.top - z.top) > 4) continue;   // wrapped across lines: not judged
          ranges++;
          if (a.left > z.left + 1) { const r0 = pe.getBoundingClientRect(); out.push({ expect: 'range ltr', line: pe.textContent.trim().slice(0, 90), pair: `${m[1]} | ${m[2]}`, at: [Math.round(r0.left), Math.round(r0.top + scrollY)], tag: pe.tagName.toLowerCase() + '(range)' }); }
        }
      }
      return { path: location.pathname + location.search, pageHe, lines, ranges, out, text: document.body.innerText.length, dbg: window.__dbg };
    });
    pages++; judged += res.lines; bad += res.out.length;
    all.push({ route, w, ...res });
    console.log(`${res.out.length ? 'WRONG' : 'ok   '} ${route} @${w}  page ${res.pageHe ? 'he' : 'en'}  ${res.lines} mixed lines + ${res.ranges} time ranges judged  ${res.out.length} read backwards  (landed ${res.path}, ${res.text} chars)`);
    for (const o of res.out.slice(0, 15)) console.log('        ', JSON.stringify(o));
    if (process.env.DEBUG === '1') for (const d of res.dbg) console.log('      judged', JSON.stringify(d));
  }
} finally { await pg.close().catch(() => {}); b.disconnect(); }
fs.writeFileSync(process.env.OUT || 'audit-out/bidi-order.json', JSON.stringify(all, null, 1));
if (bad > 0) process.exitCode = 1;
console.log(`\n${pages} pages, ${judged} mixed lines judged, ${bad} read backwards; blocked writes ${blocked.length}`);
