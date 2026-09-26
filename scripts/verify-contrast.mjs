// TEXT A BUYER CANNOT READ.
//
// The demo is a dark theme with a lot of dimmed secondary text — sub-labels
// under every KPI, axis labels, "2 or fewer left", the strip captions. Dimming
// is how the hierarchy works, and it is also exactly how text falls below the
// contrast floor without anyone noticing on a good monitor in a dark room.
// Ohad demos on a laptop, in daylight, to someone else.
//
// Every other gate in this repo measures geometry. None of them can tell you
// the text is there but unreadable.
//
// THE THRESHOLDS (WCAG 2.2 AA):
//   4.5:1  normal text
//   3.0:1  large text — 18pt / 14pt bold, which the spec glosses as ~24px and
//          ~18.5px
//   3.0:1  non-text: control borders, state indicators, chart marks
//
// THE FORMULA, and the detail almost every copy of it gets wrong:
//   ratio = (L1 + 0.05) / (L2 + 0.05)
//   L     = 0.2126R + 0.7152G + 0.0722B
//   channel: c <= 0.04045 ? c/12.92 : ((c+0.055)/1.055)^2.4
// The threshold is 0.04045, NOT the 0.03928 that circulates in older copies of
// the spec — W3C's own errata supersedes it. (The two differ only in a sliver
// of very dark channels, which is precisely this theme.)
//
// WCAG 3 / APCA is deliberately NOT used as the gate: its current Working
// Draft still carries a literal placeholder where the contrast measure goes.
//
// WHAT IT SKIPS, and why each is not a dodge:
//   - text over an image or gradient, where there is no single background to
//     measure. It reports these separately as UNMEASURED rather than passing
//     them silently — a zero has to say what it could not see.
//   - disabled controls and pure decoration, which the spec exempts.
//
//   node scripts/verify-contrast.mjs [--only <substring>]
import fs from 'node:fs';
import P from 'puppeteer-core';

const BASE = process.env.BASE || 'http://127.0.0.1:5199';
const ONLY = (() => { const i = process.argv.indexOf('--only'); return i > 0 ? process.argv[i + 1] : null; })();
const OUT = 'audit-out/contrast';
fs.mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const COACH_TABS = ['dashboard', 'trainees', 'programs', 'exercises', 'sessions', 'review', 'tasks', 'billing'];
const SURFACES = [
  ['landing', '/demo'],
  ...COACH_TABS.map((t) => [`coach-${t}`, t === 'dashboard' ? '/demo/coach' : `/demo/coach/${t}`]),
  // CLICK-GATED SCREENS MUST BE IN THE LIST. The athlete drill-in is the
  // deepest screen in the demo and the one a coach studies hardest, and every
  // gate walked past it for weeks because a sweep loads a route and reads the
  // page — this screen only appeared after you opened an athlete. That is how
  // it kept a fabricated assessment, an English payments ledger and a
  // hardcoded April date. It has a URL; use it.
  ['athlete-detail', '/demo/coach/trainees/t1'],
  ['athlete-couple', '/demo/coach/trainees/t3'],
  ['athlete-overdue', '/demo/coach/trainees/t2'],
  ['athlete', '/demo/athlete'],
  ['engine', '/try?embed=1'],
].filter(([n]) => !ONLY || n.includes(ONLY));

const LANGS = ['en', 'he'];
const THEMES = ['dark', 'light'];

const findings = [];
const add = (o) => { findings.push(o); console.log(`${o.kind.padEnd(10)} ${o.id.padEnd(26)} ${o.detail}`); };

const b = await P.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 300000 });
let measured = 0, nodes = 0, unmeasured = 0;

for (const [name, route] of SURFACES) {
  for (const lang of LANGS) {
    for (const theme of THEMES) {
      const id = `${name}/${lang}/${theme}`;
      const ctx = await b.createBrowserContext();
      const pg = await ctx.newPage();
      try {
        await pg.setViewport({ width: 1440, height: 950, deviceScaleFactor: 1 });
        await pg.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: theme }]);
        await pg.evaluateOnNewDocument((L, T) => {
          try {
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

        for (let y = 0; y < pageH; y += 800) {
          await pg.evaluate((yy) => window.scrollTo(0, yy), y);
          await wait(200);
          const r = await pg.evaluate(() => {
            const lin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
            const lum = ([r, g, b]) => 0.2126 * lin(r / 255) + 0.7152 * lin(g / 255) + 0.0722 * lin(b / 255);
            const ratio = (a, b) => {
              const la = lum(a), lb = lum(b);
              return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
            };
            const parse = (s) => {
              const m = String(s).match(/rgba?\(([^)]+)\)/);
              if (!m) return null;
              const p = m[1].split(',').map((x) => parseFloat(x));
              return { rgb: [p[0], p[1], p[2]], a: p.length > 3 ? p[3] : 1 };
            };
            const over = (fg, bg, a) => fg.map((c, i) => c * a + bg[i] * (1 - a));

            // Walk up for the first opaque background; report if we cannot find one.
            const bgOf = (el) => {
              let e = el;
              while (e) {
                const cs = getComputedStyle(e);
                if (cs.backgroundImage && cs.backgroundImage !== 'none') return null;
                const p = parse(cs.backgroundColor);
                if (p && p.a >= 0.999) return p.rgb;
                if (p && p.a > 0) return null;   // translucent stack: not a single colour
                e = e.parentElement;
              }
              return [255, 255, 255];
            };

            const out = [];
            let counted = 0, skipped = 0;
            const vh = innerHeight;
            const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
            let n;
            while ((n = walk.nextNode())) {
              const t = (n.nodeValue || '').replace(/\s+/g, ' ').trim();
              if (t.length < 2) continue;
              const el = n.parentElement;
              if (!el) continue;
              const cs = getComputedStyle(el);
              if (cs.visibility === 'hidden' || cs.display === 'none') continue;
              const op = parseFloat(cs.opacity);
              if (op === 0) continue;
              const bb = el.getBoundingClientRect();
              if (bb.width < 4 || bb.height < 4) continue;
              if (bb.bottom < 0 || bb.top > vh) continue;
              if (el.closest('[disabled],[aria-disabled="true"]')) continue;

              const bg = bgOf(el);
              if (!bg) { skipped++; continue; }
              const f = parse(cs.color);
              if (!f) { skipped++; continue; }
              // element opacity multiplies the text's effective alpha
              const fg = over(f.rgb, bg, Math.min(1, f.a * (isNaN(op) ? 1 : op)));
              counted++;

              const px = parseFloat(cs.fontSize);
              const bold = parseInt(cs.fontWeight, 10) >= 700;
              const large = px >= 24 || (bold && px >= 18.5);
              const need = large ? 3.0 : 4.5;
              const got = ratio(fg, bg);
              if (got < need - 0.05) {
                out.push({ t: t.slice(0, 34), got: Math.round(got * 100) / 100, need, px: Math.round(px * 10) / 10, bold });
              }
            }
            return { out, counted, skipped };
          });
          nodes += r.counted || 0;
          unmeasured += r.skipped || 0;
          for (const x of r.out) {
            const k = x.t + '|' + x.got;
            if (seen.has(k)) continue;
            seen.add(k);
            add({ kind: 'CONTRAST', id, detail: `"${x.t}" ${x.got}:1 against its background, needs ${x.need}:1 (${x.px}px${x.bold ? ' bold' : ''})` });
          }
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
b.disconnect();

fs.writeFileSync(`${OUT}/findings.json`, JSON.stringify(findings, null, 1));
const by = {};
for (const f of findings) by[f.kind] = (by[f.kind] || 0) + 1;
const total = SURFACES.length * LANGS.length * THEMES.length;
console.log(`\n${measured} of ${total} surface x language x theme combinations, ${nodes} text nodes measured, ${unmeasured} skipped for having no single background colour.`);
console.log(Object.keys(by).length ? Object.entries(by).map(([k, v]) => `  ${k.padEnd(10)} ${v}`).join('\n') : '  none');
if (!nodes) {
  console.log('FAIL: no text node was measurable — the gate cannot have tested anything.');
  process.exit(1);
}
console.log(`-> ${OUT}/findings.json`);
process.exit(findings.length ? 1 : 0);
