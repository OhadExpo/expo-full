// RULE RHYTHM - three of Ohad's standing rules, measured on the ink (29.9):
//
//   CENTRE  (#404 "all text inside two upper and lower borders should be vertically
//           center aligned", #397 #403 #416): a box whose top AND bottom are drawn
//           rules (its own borders, or the next row's top rule) has its text ink
//           centred between them - |space above - space below| <= 1.5px.
//   LASTRULE (#419 "no bottom border ever, anywhere"): the last row of a list draws
//           no bottom rule of its own when the list's box ends right under it
//           (<= 16px) - the box edge is the end.
//   FIRSTGAP (#418 "very empty space above his row ... the first name after each
//           title"): under a title strip, strip -> first row's ink is not more than
//           the list's own row -> row ink spacing + 4px.
//
// Ink, not boxes: Range.getClientRects() over the box's text, excluding text inside
// a nested bordered box (that box is judged on its own). Rows are only judged when
// they carry text and are 20-140px tall.
//
//   BASE=http://127.0.0.1:5234 CDP=http://[::1]:9444 node scripts/verify-rule-rhythm.mjs [--only a,b] [--widths 390,768,1440] [--lang en,he]
// Exit 1 on any finding; writes audit-out/rule-rhythm/findings.json.
import fs from 'node:fs';
import P from 'puppeteer-core';
import { setWidth } from './lib/viewport.mjs';
import { signIn } from './lib/authed-page.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:5234';
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const ONLY = arg('--only', null);
const WIDTHS = arg('--widths', '390,768,1440').split(',').map(Number);
const LANGS = arg('--lang', 'en,he').split(',');
const OUT = process.env.OUT || 'audit-out/rule-rhythm';
fs.mkdirSync(OUT, { recursive: true });
const ROUTES = [
  ...['overview', 'roster', 'schedule', 'practices', 'lifts', 'medical', 'games', 'activity'].map((t) => [`bhbc-${t}`, `/coach/bhbc/${t}`]),
  ...['dashboard', 'athletes', 'programs', 'exercises', 'sessions', 'review', 'tasks', 'billing', 'calendar', 'challenges', 'intake', 'waitlist'].map((t) => [`app-${t}`, `/coach/${t}`]),
].filter(([n]) => !ONLY || ONLY.split(',').some((o) => n.includes(o)));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await P.connect({ browserURL: process.env.CDP || 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 300000 });
const findings = []; let measured = 0;

for (const lang of LANGS) for (const W of WIDTHS) {
  const H = W <= 620 ? 844 : W < 1200 ? 1024 : 950;
  const ctx = await b.createBrowserContext(); const pg = await ctx.newPage();
  await setWidth(pg, W, H, { tablet: W > 620 && W < 1200 });
  await pg.evaluateOnNewDocument((L) => { try { localStorage.setItem('expo-lang', L); localStorage.setItem('expo-collapse:bhbc-lang', JSON.stringify(L)); localStorage.setItem('expo-install-snooze-until', String(Date.now() + 864e5)); } catch (e) {} }, lang);
  await signIn(pg, BASE);
  for (const [name, route] of ROUTES) {
    const id = `${name}/${lang}/${W}`;
    try {
      await pg.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 60000 });
      let prev = -1; for (let i = 0; i < 25; i++) { await wait(600); const len = await pg.evaluate(() => document.body.innerText.length); if (len === prev && len > 200) break; prev = len; }
      const pageH = await pg.evaluate(() => document.documentElement.scrollHeight);
      const seen = new Set();
      for (let y = 0; y < pageH; y += Math.round(H * 0.85)) {
        await pg.evaluate((yy) => window.scrollTo(0, yy), y); await wait(250);
        const r = await pg.evaluate(() => {
          const out = [];
          const vis = (el) => { const cs = getComputedStyle(el); return cs.display !== 'none' && cs.visibility !== 'hidden' && +cs.opacity > 0; };
          const bw = (cs, side) => (cs[`border${side}Style`] !== 'none' && parseFloat(cs[`border${side}Width`]) >= 0.5 && !/rgba\(\d+, \d+, \d+, 0\)|transparent/.test(cs[`border${side}Color`]));
          const bordered = (el) => { const cs = getComputedStyle(el); return bw(cs, 'Top') && bw(cs, 'Bottom'); };
          const inkOf = (el) => {
            let t = Infinity, bb = -Infinity, n = 0;
            const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
            let node;
            while ((node = walk.nextNode())) {
              if (!(node.nodeValue || '').trim()) continue;
              let p = node.parentElement, skip = false;
              for (; p && p !== el; p = p.parentElement) { if (!vis(p)) { skip = true; break; } if (bordered(p) || getComputedStyle(p).position === 'absolute') { skip = true; break; } }
              if (skip) continue;
              const rg = document.createRange(); rg.selectNodeContents(node);
              for (const x of rg.getClientRects()) if (x.width > 0 && x.height > 0) { t = Math.min(t, x.top); bb = Math.max(bb, x.bottom); n++; }
            }
            return n ? { t, b: bb } : null;
          };
          const lab = (el) => `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : ''} ${(el.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 30)}`;
          const vh = innerHeight;
          for (const el of document.querySelectorAll('body *')) {
            if (!vis(el)) continue;
            const rb = el.getBoundingClientRect();
            if (rb.height < 20 || rb.height > 140 || rb.width < 60 || rb.bottom < 0 || rb.top > vh) continue;
            if (el.querySelector('.title-strip') || el.classList.contains('title-strip')) continue; // a card, not a row
            const cs = getComputedStyle(el);
            // the rules above / below this box
            let top = null, bot = null;
            if (bw(cs, 'Top')) top = rb.top + parseFloat(cs.borderTopWidth);
            if (bw(cs, 'Bottom')) bot = rb.bottom - parseFloat(cs.borderBottomWidth);
            const nx = el.nextElementSibling;
            if (top != null && bot == null && nx && vis(nx) && bw(getComputedStyle(nx), 'Top')) { const nb = nx.getBoundingClientRect(); if (Math.abs(nb.top - rb.bottom) <= 1.5) bot = rb.bottom; }
            if (top != null && bot != null && bot - top >= 18 && rb.height <= 90) {
              const ink = inkOf(el);
              if (ink && ink.t >= top - 1 && ink.b <= bot + 1) {
                const above = ink.t - top, below = bot - ink.b;
                if (Math.abs(above - below) > 1.5 && !el.closest('svg')) out.push({ k: 'CENTRE', t: lab(el), d: `${above.toFixed(1)} above / ${below.toFixed(1)} below` });
              }
            }
            // LASTRULE: a row that is its parent's last visible child, with its own bottom rule, while the parent ends within 16px
            if (bw(cs, 'Bottom') && !bw(cs, 'Top') && el.parentElement && ![...el.parentElement.children].slice([...el.parentElement.children].indexOf(el) + 1).some(vis)) {
              const sib = [...el.parentElement.children].filter(vis);
              if (sib.length >= 2 && sib.every((s) => bw(getComputedStyle(s), 'Bottom'))) {
                let box = el.parentElement, end = null;
                let tail = false;
                for (let i = 0, cur = el; box && i < 4; i++, cur = box, box = box.parentElement) {
                  // content after the row inside the box = the row is not the list's end
                  if (i > 0 && [...box.children].slice([...box.children].indexOf(cur) + 1).some(vis)) { tail = true; break; }
                  const bcs = getComputedStyle(box); const bb2 = box.getBoundingClientRect();
                  if (bw(bcs, 'Bottom') || bcs.backgroundColor !== getComputedStyle(box.parentElement || box).backgroundColor) { end = bb2.bottom; break; }
                }
                if (tail) end = null;
                if (end != null && end - rb.bottom <= 16 && end - rb.bottom >= 0) out.push({ k: 'LASTRULE', t: lab(el), d: `own bottom rule ${Math.round(end - rb.bottom)}px above the box edge` });
              }
            }
          }
          // FIRSTGAP: strip -> first row ink vs row -> row ink
          for (const strip of document.querySelectorAll('.title-strip')) {
            const sb = strip.getBoundingClientRect(); if (sb.bottom < 0 || sb.top > vh) continue;
            const body = strip.nextElementSibling; if (!body || !vis(body)) continue;
            // descend to the first element with 3+ visible children that are rows
            let list = body;
            for (let i = 0; i < 6 && list; i++) { const kids = [...list.children].filter(vis); if (kids.length >= 2 && kids.every((k) => k.getBoundingClientRect().height < 140)) break; list = kids[0]; }
            if (!list) continue;
            const kids = [...list.children].filter(vis);
            if (kids.length < 2 || list.getBoundingClientRect().top - sb.bottom > 60) continue;
            // FIRSTGAP asks whether the space above the first row is EMPTY
            // (#418). A bordered control's border is painted ink: a SYNC NOW
            // box 8px under the strip is not 21px of empty space because its
            // label sits in the middle of it (29.9, calendar AVAILABILITY - the
            // row read 21 / 8 while its visible edges were 8 / 9). So here the
            // row's extent is its text ink plus the border boxes nested in it.
            const inkBoxes = (el) => {
              const i0 = inkOf(el); let t = i0 ? i0.t : Infinity, bb = i0 ? i0.b : -Infinity;
              // a border counts only when it SHOWS: the box and every ancestor up to
              // the row visible, nothing on the way positioned out of flow, and a
              // border colour that differs from the background behind it
              // (audit round 2: an invisible sizing border must not read as ink)
              const shows = (d) => {
                for (let x = d; x && x !== el; x = x.parentElement) {
                  const k = getComputedStyle(x);
                  if (!vis(x) || k.position === 'absolute' || k.position === 'fixed') return false;
                }
                const k = getComputedStyle(d);
                let bg = 'rgba(0, 0, 0, 0)';
                for (let x = d.parentElement; x; x = x.parentElement) { const c = getComputedStyle(x).backgroundColor; if (!/rgba\(\d+, \d+, \d+, 0\)|transparent/.test(c)) { bg = c; break; } }
                return k.borderTopColor !== bg && k.borderBottomColor !== bg;
              };
              for (const d of el.querySelectorAll('*')) {
                if (!bordered(d) || !shows(d)) continue;
                const r = d.getBoundingClientRect(); if (!r.width || !r.height) continue;
                t = Math.min(t, r.top); bb = Math.max(bb, r.bottom);
              }
              return Number.isFinite(t) ? { t, b: bb } : null;
            };
            const inks = kids.slice(0, 2).map(inkBoxes);
            if (inks.some((x) => !x)) continue;
            // the first row is centred between the strip and its own bottom rule
            // (the next row's top rule), like every row below it
            const k0 = kids[0], c0 = getComputedStyle(k0), r0 = k0.getBoundingClientRect();
            if (r0.height > 90) continue; // a tile grid, not a row list
            if (bw(c0, 'Top')) continue; // a boxed tile is judged by CENTRE, not here
            // a LIST is rows separated by rules; a row of controls is not one
            if (!kids.every((k) => { const kc = getComputedStyle(k); return bw(kc, 'Bottom') || bw(kc, 'Top'); }) && !kids.slice(0, -1).every((k) => bw(getComputedStyle(k), 'Bottom'))) continue;
            const rule0 = bw(c0, 'Bottom') ? r0.bottom - parseFloat(c0.borderBottomWidth) : (bw(getComputedStyle(kids[1]), 'Top') ? kids[1].getBoundingClientRect().top : null);
            if (rule0 != null) {
              const above = inks[0].t - sb.bottom, below = rule0 - inks[0].b;
              if (Math.abs(above - below) > 2) out.push({ k: 'FIRSTGAP', t: lab(strip), d: `first row ${above.toFixed(1)} under the strip / ${below.toFixed(1)} over its rule` });
            }
          }
          return out;
        });
        for (const f of r) { const key = f.k + f.t + f.d; if (seen.has(key)) continue; seen.add(key); findings.push({ id, ...f }); console.log(`${f.k.padEnd(9)} ${id.padEnd(28)} "${f.t}" ${f.d}`); }
      }
      measured++;
    } catch (e) { findings.push({ id, k: 'ERROR', d: String(e.message || e).slice(0, 100) }); console.log(`ERROR     ${id} ${String(e.message || e).slice(0, 100)}`); }
  }
  await ctx.close();
}
b.disconnect();
fs.writeFileSync(`${OUT}/findings.json`, JSON.stringify(findings, null, 1));
const by = {}; for (const f of findings) by[f.k] = (by[f.k] || 0) + 1;
console.log(`\n${measured} of ${ROUTES.length * WIDTHS.length * LANGS.length} measured.`, Object.entries(by).map(([k, v]) => `${k} ${v}`).join(' · ') || 'none');
process.exit(findings.length ? 1 : 0);
