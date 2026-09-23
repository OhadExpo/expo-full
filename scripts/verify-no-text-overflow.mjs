// NO TEXT OVERFLOW ANYWHERE.
//
// Ohad, 23.9, and only after the control heights were proven clean: "then only
// after re-assuring its perfect everywhere, make sure there's no text overflow
// anywhere." Scope, his list: "phone, mobile, chrome, pwa, safari, light, dark,
// expo, demos, selling sites, bhbc".
//
// FOUR WAYS TEXT GOES WRONG, and this measures all four:
//
//   CUT        the ink is wider or taller than the box painting it, with the
//              overflow hidden or clipped. A letter is literally sliced.
//   ELLIPSIS   a label is being truncated to "Shoulder Horizontal Adducti…".
//              This counts as a FAULT, not a feature: "i cant see some of the
//              words... never do." A container that ellipsises but is NOT
//              currently truncating is fine — the gate only reports the ones
//              actually losing characters right now.
//   SPILL      text painted outside its own container's padding box while the
//              container does not scroll — the classic "text runs out of the
//              card" at 360.
//   ONEWORD    a box so narrow the text breaks to roughly one word per line.
//              He reported this as "1-letter-per-line" in August; it is what a
//              flex child with no min-width does to a Hebrew label.
//
// MEASURED ON THE RANGE, NOT THE ELEMENT. An element's rect is the BOX; the
// ink can be bigger or smaller than it. Range.getClientRects() is what the
// browser actually painted — the same reason the earlier centring work had to
// measure ink rather than boxes.
//
//   node scripts/verify-no-text-overflow.mjs [--only <substring>]
import fs from 'node:fs';
import P from 'puppeteer-core';

const BASE = process.env.BASE || 'http://127.0.0.1:5199';
const ONLY = (() => { const i = process.argv.indexOf('--only'); return i > 0 ? process.argv[i + 1] : null; })();
const OUT = 'audit-out/text-overflow';
fs.mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const COACH_TABS = ['dashboard', 'trainees', 'programs', 'exercises', 'sessions', 'review', 'tasks', 'billing'];
const SURFACES = [
  ['landing', '/demo'],
  ['landing-he', '/demo/he'],
  ...COACH_TABS.map((t) => [`coach-${t}`, t === 'dashboard' ? '/demo/coach' : `/demo/coach/${t}`]),
  ['athlete', '/demo/athlete'],
  ['engine', '/try?embed=1'],
  ['booking', '/book'],
].filter(([n]) => !ONLY || n.includes(ONLY));

const LANGS = ['en', 'he'];
// 360 is the narrowest he has asked about and where one-word-per-line appears.
const WIDTHS = [[360, 800], [390, 844], [1440, 950]];
const THEMES = ['dark', 'light'];

const findings = [];
const add = (o) => { findings.push(o); console.log(`${o.kind.padEnd(9)} ${o.id.padEnd(30)} ${o.detail}`); };

const b = await P.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 300000 });
let measured = 0, nodes = 0;

for (const [name, route] of SURFACES) {
  for (const lang of LANGS) {
    for (const [w, h] of WIDTHS) {
      for (const theme of THEMES) {
        const id = `${name}/${lang}/${w}/${theme}`;
        const ctx = await b.createBrowserContext();
        const pg = await ctx.newPage();
        try {
          await pg.setViewport({ width: w, height: h, deviceScaleFactor: 1, isMobile: w < 700, hasTouch: w < 700 });
          await pg.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: theme }]);
          await pg.evaluateOnNewDocument((L, T) => {
            try {
              if (!localStorage.getItem('expo-lang')) localStorage.setItem('expo-lang', L);
              localStorage.setItem('expo-lang', L);
              localStorage.setItem('expo-theme', T);
              localStorage.setItem('expo-install-snooze-until', String(Date.now() + 86400000));
            } catch (e) { /* private mode */ }
          }, lang, theme);
          await pg.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 60000 });

          let prev = -1, settled = false;
          for (let i = 0; i < 22; i++) {
            await wait(600);
            const len = await pg.evaluate(() => (document.body.innerText || '').length);
            if (len === prev && len > 0) { settled = true; break; }
            prev = len;
          }
          if (!settled) { add({ kind: 'UNSET', id, detail: 'never settled — NOT judged' }); continue; }

          const pageH = await pg.evaluate(() => document.documentElement.scrollHeight);
          const seen = new Set();

          for (let y = 0; y < pageH; y += Math.round(h * 0.85)) {
            await pg.evaluate((yy) => window.scrollTo(0, yy), y);
            await wait(220);
            const r = await pg.evaluate(() => {
              const out = { cut: [], ell: [], spill: [], oneword: [] };
              let counted = 0;
              const vh = innerHeight;
              const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
              let n;
              while ((n = walk.nextNode())) {
                const raw = n.nodeValue || '';
                const t = raw.replace(/\s+/g, ' ').trim();
                if (t.length < 2) continue;
                const el = n.parentElement;
                if (!el) continue;
                const cs = getComputedStyle(el);
                if (cs.visibility === 'hidden' || cs.opacity === '0' || cs.display === 'none') continue;
                const bb = el.getBoundingClientRect();
                if (bb.width < 4 || bb.height < 4) continue;
                if (bb.bottom < 0 || bb.top > vh) continue;
                counted++;

                const rng = document.createRange();
                rng.selectNodeContents(el);
                const rects = [...rng.getClientRects()].filter((x) => x.width > 0 && x.height > 0);
                if (!rects.length) continue;
                const inkL = Math.min(...rects.map((x) => x.left));
                const inkR = Math.max(...rects.map((x) => x.right));
                const inkT = Math.min(...rects.map((x) => x.top));
                const inkB = Math.max(...rects.map((x) => x.bottom));

                const clipsX = /hidden|clip/.test(cs.overflowX);
                const clipsY = /hidden|clip/.test(cs.overflowY);

                // CUT — ink outside a box that clips it.
                const overL = bb.left - inkL, overR = inkR - bb.right;
                const overT = bb.top - inkT, overB = inkB - bb.bottom;
                if ((clipsX && (overL > 1.5 || overR > 1.5)) || (clipsY && (overT > 1.5 || overB > 1.5))) {
                  out.cut.push({ t: t.slice(0, 34), x: Math.round(Math.max(overL, overR)), y: Math.round(Math.max(overT, overB)) });
                  continue;
                }

                // ELLIPSIS — actually truncating right now.
                if (cs.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1) {
                  out.ell.push({ t: t.slice(0, 34), lost: el.scrollWidth - el.clientWidth });
                  continue;
                }

                // SPILL — ink outside a NON-scrolling ancestor's box.
                let p = el.parentElement, spilled = null;
                for (let d = 0; p && d < 4 && !spilled; p = p.parentElement, d++) {
                  const pcs = getComputedStyle(p);
                  if (/auto|scroll/.test(pcs.overflowX) || /auto|scroll/.test(pcs.overflowY)) break;
                  if (pcs.position === 'absolute' || pcs.position === 'fixed') break;
                  const pb = p.getBoundingClientRect();
                  if (pb.width < 8) continue;
                  if (inkR - pb.right > 2 || pb.left - inkL > 2) spilled = Math.round(Math.max(inkR - pb.right, pb.left - inkL));
                }
                if (spilled) { out.spill.push({ t: t.slice(0, 34), by: spilled }); continue; }

                // ONEWORD — 3+ lines and barely a word on each.
                const lineTops = new Set(rects.map((x) => Math.round(x.top)));
                const words = t.split(' ').filter(Boolean).length;
                if (lineTops.size >= 3 && words >= 3 && words / lineTops.size < 1.35 && bb.width < 180) {
                  out.oneword.push({ t: t.slice(0, 34), lines: lineTops.size, words, w: Math.round(bb.width) });
                }
              }
              out.counted = counted;
              return out;
            });
            nodes += r.counted || 0;
            const push = (kind, arr, fmt) => {
              for (const x of arr) {
                const k = kind + '|' + JSON.stringify(x);
                if (seen.has(k)) continue;
                seen.add(k);
                add({ kind, id, detail: fmt(x) });
              }
            };
            push('CUT', r.cut, (x) => `"${x.t}" ink cut by ${x.x}px across / ${x.y}px down`);
            push('ELLIPSIS', r.ell, (x) => `"${x.t}" truncated — ${x.lost}px of the word is not shown`);
            push('SPILL', r.spill, (x) => `"${x.t}" paints ${x.by}px outside its container`);
            push('ONEWORD', r.oneword, (x) => `"${x.t}" ${x.words} words over ${x.lines} lines in ${x.w}px`);
          }
          measured++;
        } catch (e) {
          add({ kind: 'ERROR', id, detail: 'harness: ' + String(e.message || e).slice(0, 110) });
        } finally {
          await pg.close().catch(() => {});
          await ctx.close().catch(() => {});
        }
      }
    }
  }
}
b.disconnect();

fs.writeFileSync(`${OUT}/findings.json`, JSON.stringify(findings, null, 1));
const by = {};
for (const f of findings) by[f.kind] = (by[f.kind] || 0) + 1;
const total = SURFACES.length * LANGS.length * WIDTHS.length * THEMES.length;
console.log(`\n${measured} of ${total} combinations measured, ${nodes} text nodes examined.`);
console.log(Object.keys(by).length ? Object.entries(by).map(([k, v]) => `  ${k.padEnd(9)} ${v}`).join('\n') : '  none');
console.log(`-> ${OUT}/findings.json`);
process.exit(findings.length ? 1 : 0);
