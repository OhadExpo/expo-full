// EVERY BORDERED CONTROL, THE SAME HEIGHT.
//
// Ohad, 23.9: "make sure all the buttons, tags, and search/bars/text boxes
// (everything that we have with borders - anywhere) is the same vertical
// height. massive full seep everywhere." Scope, his list: "phone, mobile,
// chrome, pwa, safari, light, dark, expo, demos, selling sites, bhbc".
//
// This MEASURES it. A ragged control row is the thing he has reported more
// than any other and it is invisible to reading the source, because the height
// comes from padding + font + line-height + border on four different elements
// written months apart.
//
// WHAT COUNTS AS A CONTROL: a button, a link styled as one, an input, a select,
// a textarea, or anything with role=button/tab — that PAINTS A BORDER. A
// borderless text link is not a control for this purpose; he said "everything
// that we have with borders".
//
// WHAT IS DELIBERATELY EXCLUDED, and why each one would be a false positive:
//   - a control whose box wraps to more than one text line. Height follows the
//     text there; that is a layout question, not a consistency one.
//   - anything inside a chart, an svg, or a video transport.
//   - a control with an explicit aspect-ratio or an equal width and height
//     (icon squares, the ✓/✕ pair, avatars) — those are square by intent.
//   - checkboxes and radios, which the browser sizes.
//
// GROUPING: controls are bucketed by ROLE, because a page legitimately has more
// than one size — a primary CTA is not a filter chip. Within a bucket, on one
// screen, they must agree. The report prints every distinct height per bucket
// with a count and an example, so a "2 heights" finding names both.
//
//   node scripts/verify-control-heights.mjs [--only <substring>] [--tolerance N]
import fs from 'node:fs';
import P from 'puppeteer-core';

const BASE = process.env.BASE || 'http://127.0.0.1:5199';
const ONLY = (() => { const i = process.argv.indexOf('--only'); return i > 0 ? process.argv[i + 1] : null; })();
const TOL = (() => { const i = process.argv.indexOf('--tolerance'); return i > 0 ? Number(process.argv[i + 1]) : 1; })();
const OUT = 'audit-out/control-heights';
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
  ['intake', '/intake'],
].filter(([n]) => !ONLY || n.includes(ONLY));

const LANGS = ['en', 'he'];
const WIDTHS = [[390, 844], [1440, 950]];
const THEMES = ['dark', 'light'];

const findings = [];
const add = (o) => { findings.push(o); console.log(`${o.kind.padEnd(8)} ${o.id.padEnd(34)} ${o.detail}`); };

const b = await P.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 300000 });
let measured = 0, controls = 0;

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

          const r = await pg.evaluate((tol) => {
            const px = (v) => Math.round(parseFloat(v) || 0);
            const buckets = {};
            const seen = new Set();
            for (const el of document.querySelectorAll('button,input,select,textarea,a,[role=button],[role=tab]')) {
              if (seen.has(el)) continue;
              seen.add(el);
              const cs = getComputedStyle(el);
              if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue;
              const tag = el.tagName.toLowerCase();
              const type = (el.getAttribute('type') || '').toLowerCase();
              if (tag === 'input' && /checkbox|radio|range|color|file|hidden/.test(type)) continue;
              if (tag === 'textarea') continue;                     // grows by design
              if (el.closest('svg,canvas,video,[data-chart]')) continue;

              // Must PAINT a border on at least one side.
              const bw = ['Top', 'Right', 'Bottom', 'Left'].map((s) => px(cs[`border${s}Width`]));
              const anyBorder = bw.some((x) => x >= 1);
              if (!anyBorder) continue;

              const bb = el.getBoundingClientRect();
              if (bb.width < 8 || bb.height < 6) continue;   // hairline dividers, not controls
              if (bb.bottom < -2000 || bb.top > 20000) continue;
              if (cs.aspectRatio && cs.aspectRatio !== 'auto') continue;
              if (Math.abs(bb.width - bb.height) <= 2) continue;    // square by intent

              // MULTI-LINE TEXT: height follows the text there, not a
              // convention, so it is out of scope. Count actual LINE BOXES.
              //
              // The first version of this compared the box's inner height to
              // one line-height, which flagged every normal button: a control
              // with `height: 32` around 12px text is 60% "taller than its
              // text" and is exactly what a consistent control looks like.
              // That heuristic threw away 14 of 15 bordered controls on the
              // billing tab and the gate then reported "none".
              // Count DISTINCT LINE TOPS, not rects: a label written as
              // {'◔ '}{tr('CHASE')} is two text nodes and therefore two
              // client rects on ONE line, and counting rects excluded every
              // button in the product that has an icon in front of its word.
              const rng = document.createRange();
              rng.selectNodeContents(el);
              const tops = new Set();
              for (const rect of rng.getClientRects()) if (rect.height > 0) tops.add(Math.round(rect.top));
              if (tops.size > 1) continue;

              // Bucket by ROLE, not by tag: a page may legitimately have a
              // primary CTA taller than a filter chip.
              let role;
              if (tag === 'input' || tag === 'select') role = 'field';
              else if (el.getAttribute('role') === 'tab') role = 'tab';
              else role = 'button';
              const key = role;
              (buckets[key] = buckets[key] || []).push({
                h: Math.round(bb.height),
                t: (el.textContent || el.getAttribute('aria-label') || el.getAttribute('placeholder') || tag).trim().slice(0, 26),
              });
            }
            const out = {};
            for (const [k, arr] of Object.entries(buckets)) {
              const by = {};
              for (const x of arr) by[x.h] = by[x.h] || { n: 0, eg: x.t };
              for (const x of arr) by[x.h].n++;
              const hs = Object.keys(by).map(Number).sort((a, c) => a - c);
              // Collapse heights within the tolerance into their neighbour.
              const groups = [];
              for (const hh of hs) {
                const g = groups.find((gg) => Math.abs(gg.h - hh) <= tol);
                if (g) { g.n += by[hh].n; } else groups.push({ h: hh, n: by[hh].n, eg: by[hh].eg });
              }
              out[k] = { total: arr.length, groups };
            }
            return out;
          }, TOL);

          measured++;
          for (const [role, info] of Object.entries(r)) {
            controls += info.total;
            if (info.groups.length <= 1) continue;
            const shown = info.groups.map((g) => `${g.h}px x${g.n} (e.g. "${g.eg}")`).join('  |  ');
            add({ kind: 'RAGGED', id: `${id} ${role}`, detail: `${info.groups.length} heights among ${info.total}: ${shown}` });
          }
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
console.log(`\n${measured} of ${total} surface x language x width x theme combinations, ${controls} bordered controls measured (tolerance ${TOL}px).`);
console.log(Object.keys(by).length ? Object.entries(by).map(([k, v]) => `  ${k.padEnd(8)} ${v}`).join('\n') : '  none');
console.log(`-> ${OUT}/findings.json`);
process.exit(findings.length ? 1 : 0);
