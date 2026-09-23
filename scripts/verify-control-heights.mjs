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
import { signIn, looksLikeLogin } from './lib/authed-page.mjs';

const SITE = (() => { const i = process.argv.indexOf('--site'); return i > 0 ? process.argv[i + 1] : 'app'; })();
const BASE = process.env.BASE || (SITE === 'il' ? 'http://127.0.0.1:5174' : 'http://127.0.0.1:5199');
const AUTHED = SITE === 'coach';
const ONLY = (() => { const i = process.argv.indexOf('--only'); return i > 0 ? process.argv[i + 1] : null; })();
const TOL = (() => { const i = process.argv.indexOf('--tolerance'); return i > 0 ? Number(process.argv[i + 1]) : 1; })();
const OUT = 'audit-out/control-heights';
fs.mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const COACH_TABS = ['dashboard', 'trainees', 'programs', 'exercises', 'sessions', 'review', 'tasks', 'billing'];
const IL_SURFACES = [
  ['il-online', '/#/online'],
  ['il-coaches', '/#/coaches'],
  ['il-chooser', '/#/'],
  ['il-gym', '/#/gym'],
];
// --site coach: the REAL coach app, signed in as the owner, and the BHBC zone.
// His scope list (23.9) names "expo" and "bhbc" beside the demos and the
// sales site; a gate that only reached the public pages was measuring a
// third of the product. These need a seat, so the page is signed in ONCE per
// language x width x theme and the surfaces are visited in that page.
const COACH_SURFACES = [
  ['coach-dashboard', '/coach'],
  ['coach-athletes', '/coach/athletes'],
  ['coach-programs', '/coach/programs'],
  ['coach-exercises', '/coach/exercises'],
  ['coach-sessions', '/coach/sessions'],
  ['coach-review', '/coach/review'],
  ['coach-review-tools', '/coach/review-tools'],
  ['coach-tasks', '/coach/tasks'],
  ['coach-billing', '/coach/billing'],
  ['coach-calendar', '/coach/calendar'],
  ['coach-waitlist', '/coach/waitlist'],
  ['coach-intake', '/coach/intake'],
  ['coach-workouts', '/coach/workouts'],
  ['coach-challenges', '/coach/challenges'],
  ['bhbc', '/coach/bhbc'],
];
const APP_SURFACES = [
  ['landing', '/demo'],
  ['landing-he', '/demo/he'],
  ...COACH_TABS.map((t) => [`coach-${t}`, t === 'dashboard' ? '/demo/coach' : `/demo/coach/${t}`]),
  ['athlete', '/demo/athlete'],
  ['engine', '/try?embed=1'],
  // /book and /intake WITHOUT their slug / locale fall through to the login
  // page. The first runs of this gate listed them bare, so "booking" and
  // "intake" were the login fields measured twice and the booking page was
  // never measured at all (24.9). The login page is a surface in its own right.
  ['booking', '/book/preview-9f3a2c7b'],
  ['intake', '/intake/he'],
  ['login', '/login'],
];
const SURFACES = (SITE === 'il' ? IL_SURFACES : SITE === 'coach' ? COACH_SURFACES : APP_SURFACES).filter(([n]) => !ONLY || n.includes(ONLY));

const LANGS = ['en', 'he'];
const WIDTHS = [[390, 844], [1440, 950]];
const THEMES = ['dark', 'light'];

const findings = [];
const add = (o) => { findings.push(o); console.log(`${o.kind.padEnd(8)} ${o.id.padEnd(34)} ${o.detail}`); };

const b = await P.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 300000 });
let measured = 0, controls = 0, rowsSeen = 0;
const seats = new Map();   // --site coach: one signed-in page per lang x width x theme
const tolRow = 1;

for (const [name, route] of SURFACES) {
  for (const lang of LANGS) {
    for (const [w, h] of WIDTHS) {
      for (const theme of THEMES) {
        const id = `${name}/${lang}/${w}/${theme}`;
        const seatKey = `${lang}/${w}/${theme}`;
        let ctx, pg;
        try {
          if (AUTHED && seats.has(seatKey)) {
            ({ ctx, pg } = seats.get(seatKey));
          } else {
            ctx = await b.createBrowserContext();
            pg = await ctx.newPage();
            await pg.setViewport({ width: w, height: h, deviceScaleFactor: 1, isMobile: w < 700, hasTouch: w < 700 });
            await pg.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: theme }]);
            await pg.evaluateOnNewDocument((L, T) => {
              try {
                localStorage.setItem('expo-lang', L);
                localStorage.setItem('expo-theme', T);
                localStorage.setItem('expo-install-snooze-until', String(Date.now() + 86400000));
              } catch (e) { /* private mode */ }
            }, lang, theme);
            if (AUTHED) {
              const who = await signIn(pg, BASE);
              if (!who || !who.signedIn) { add({ kind: 'NOSEAT', id, detail: 'could not sign in: ' + ((who && who.note) || '?') + ' — NOT judged' }); continue; }
              seats.set(seatKey, { ctx, pg });
            }
          }
          await pg.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 60000 });

          // The real app loads its data after boot; give it longer to settle.
          let prev = -1, settled = false;
          for (let i = 0; i < (AUTHED ? 45 : 22); i++) {
            await wait(600);
            const len = await pg.evaluate(() => (document.body.innerText || '').length);
            if (len === prev && len > 0) { settled = true; break; }
            prev = len;
          }
          if (!settled) { add({ kind: 'UNSET', id, detail: 'never settled — NOT judged' }); continue; }
          if (AUTHED) {
            // A zero must say what it measured: a coach route that came back as
            // the login screen is not a clean coach route.
            const txt = await pg.evaluate(() => (document.body.innerText || '').slice(0, 600));
            if (looksLikeLogin(txt)) { add({ kind: 'NOSEAT', id, detail: 'the login screen came back — NOT judged' }); continue; }
          }

          const r = await pg.evaluate((tol) => {
            const px = (v) => Math.round(parseFloat(v) || 0);
            const buckets = {};
            const seen = new Set();
            // HIS RULE, VERBATIM (23.9): "all the buttons, tags, and search
            // bars/text boxes (everything that we have with borders -
            // anywhere) is the same vertical height." The first version of
            // this gate walked only button/input/select/a/[role], so a
            // bordered SPAN or DIV — the COACH VIEW chip at 22px, the W1..W4
            // week pills at 20px — was never measured, and it reported clean
            // while he was looking straight at them (24.9). It now walks
            // EVERY element that paints a border on all four sides and is
            // shaped like a control. Cards and panels are excluded by shape
            // (tall, or containing other bordered boxes), not by tag.
            for (const el of document.querySelectorAll('*')) {
              if (seen.has(el)) continue;
              seen.add(el);
              const cs = getComputedStyle(el);
              if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue;
              const tag = el.tagName.toLowerCase();
              if (/^(html|body|svg|path|circle|rect|line|polyline|g|canvas|video|img|table|thead|tbody|tr|td|th|hr|br|style|script)$/.test(tag)) continue;
              const type = (el.getAttribute('type') || '').toLowerCase();
              if (tag === 'input' && /checkbox|radio|range|color|file|hidden/.test(type)) continue;
              if (tag === 'textarea') continue;                     // grows by design
              if (el.closest('svg,canvas,video,[data-chart]')) continue;

              // Must PAINT a border on ALL FOUR sides — that is what "has a
              // border" means to the eye. A card with only a top hairline or
              // a row with only a bottom rule is not a control.
              const bw = ['Top', 'Right', 'Bottom', 'Left'].map((s) => px(cs[`border${s}Width`]));
              const bst = ['Top', 'Right', 'Bottom', 'Left'].map((s) => cs[`border${s}Style`]);
              const bcol = ['Top', 'Right', 'Bottom', 'Left'].map((s) => cs[`border${s}Color`]);
              const paints = bw.every((x, i) => x >= 1 && bst[i] !== 'none' && bst[i] !== 'hidden' && !/rgba\(\d+, \d+, \d+, 0\)/.test(bcol[i]));
              if (!paints) continue;

              const bb = el.getBoundingClientRect();
              if (bb.width < 16 || bb.height < 12) continue;  // hairlines and dots, not controls
              if (bb.height > 64) continue;                    // a card or a panel, by shape
              if (bb.bottom < -2000 || bb.top > 20000) continue;
              if (cs.aspectRatio && cs.aspectRatio !== 'auto') continue;
              if (Math.abs(bb.width - bb.height) <= 2) continue;    // square by intent
              // A bordered box whose only content is a drawing (a sparkline
              // tile, a framed logo) is a picture frame, not a control.
              if (!(el.textContent || '').trim() && el.querySelector('svg,canvas,img,video')) continue;
              // A box that contains another painted box is a container, not a control.
              if ([...el.querySelectorAll('*')].some((c) => {
                const k = getComputedStyle(c);
                return ['Top', 'Right', 'Bottom', 'Left'].every((sd) => px(k[`border${sd}Width`]) >= 1 && k[`border${sd}Style`] !== 'none');
              })) continue;

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
              // Line tops are grouped with a 3px tolerance. Exact rounding
              // split a letter-spaced 18px tag into "two lines" (its glyph
              // rects differ by a pixel) and the gate skipped it as
              // multi-line — so a sales-site page with twelve distinct
              // bordered heights reported clean (24.9).
              const tops = [];
              for (const rect of rng.getClientRects()) {
                if (rect.height <= 0) continue;
                if (!tops.some((t) => Math.abs(t - rect.top) <= 3)) tops.push(rect.top);
              }
              if (tops.length > 1) continue;

              // ONE bucket. The earlier version bucketed by role — button,
              // field, tab — and so a 22px chip beside 36px buttons was not a
              // fault to it. He did not ask for one height per role.
              const role = (tag === 'input' || tag === 'select') ? 'field'
                : el.getAttribute('role') === 'tab' ? 'tab'
                : (tag === 'button' || tag === 'a' || el.getAttribute('role') === 'button') ? 'button'
                : 'tag';
              const key = 'control';
              (buckets[key] = buckets[key] || []).push({
                h: Math.round(bb.height),
                t: role + ':' + (el.textContent || el.getAttribute('aria-label') || el.getAttribute('placeholder') || tag).trim().slice(0, 26),
              });
            }
            // TABLE / LIST ROWS: at least the control height, and the text ink
            // centred in the row. Measured on the ink (Range rects), not the
            // box — a row whose box is centred but whose glyphs ride high is
            // exactly the fault he reports.
            const rows = [];
            for (const tr of document.querySelectorAll('tr, [role=row]')) {
              const cs = getComputedStyle(tr);
              if (cs.display === 'none') continue;
              const bb = tr.getBoundingClientRect();
              if (bb.height < 4 || bb.width < 40) continue;
              if (bb.bottom < -2000 || bb.top > 20000) continue;
              if (tr.closest('thead')) continue;
              // TEXT NODES ONLY. A Range over the whole row returns the border
              // boxes of the CELLS as well as the glyph rects, so "ink" spanned
              // the full row height and the offset was 0.0 on every row — the
              // check passed a roster whose name cell was pinned to the top with
              // 42px of air under it (break test, 24.9). The glyphs are the ink;
              // walk them.
              const rects = [];
              const tw = document.createTreeWalker(tr, NodeFilter.SHOW_TEXT);
              let node;
              while ((node = tw.nextNode())) {
                if (!node.nodeValue || !node.nodeValue.trim()) continue;
                const pe = node.parentElement;
                if (!pe) continue;
                const pcs = getComputedStyle(pe);
                if (pcs.display === 'none' || pcs.visibility === 'hidden') continue;
                const rg = document.createRange();
                rg.selectNodeContents(node);
                for (const x of rg.getClientRects()) if (x.height > 0 && x.width > 0) rects.push(x);
              }
              if (!rects.length) continue;
              const inkT = Math.min(...rects.map((x) => x.top)), inkB = Math.max(...rects.map((x) => x.bottom));
              const off = ((inkT + inkB) / 2) - ((bb.top + bb.bottom) / 2);
              rows.push({ h: Math.round(bb.height), off: Math.round(off * 10) / 10, t: (tr.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 26) });
            }
            const out = {};
            out.__rows = rows;
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
          const CTRL = 36;
          for (const row of (r.__rows || [])) {
            rowsSeen++;
            if (row.h < CTRL - tolRow) add({ kind: 'ROWSHORT', id, detail: `row ${row.h}px, under the ${CTRL}px control height: "${row.t}"` });
            else if (Math.abs(row.off) > 1.5) add({ kind: 'ROWCENTRE', id, detail: `text ink sits ${row.off > 0 ? 'below' : 'above'} the row centre by ${Math.abs(row.off)}px: "${row.t}"` });
          }
          delete r.__rows;
          for (const [role, info] of Object.entries(r)) {
            controls += info.total;
            if (info.groups.length <= 1) continue;
            const shown = info.groups.map((g) => `${g.h}px x${g.n} (e.g. "${g.eg}")`).join('  |  ');
            add({ kind: 'RAGGED', id: `${id} ${role}`, detail: `${info.groups.length} heights among ${info.total}: ${shown}` });
          }
        } catch (e) {
          add({ kind: 'ERROR', id, detail: 'harness: ' + String(e.message || e).slice(0, 110) });
        } finally {
          if (!AUTHED && pg) { await pg.close().catch(() => {}); await ctx.close().catch(() => {}); }
        }
      }
    }
  }
}
for (const { ctx, pg } of seats.values()) { await pg.close().catch(() => {}); await ctx.close().catch(() => {}); }
b.disconnect();

fs.writeFileSync(`${OUT}/findings.json`, JSON.stringify(findings, null, 1));
const by = {};
for (const f of findings) by[f.kind] = (by[f.kind] || 0) + 1;
const total = SURFACES.length * LANGS.length * WIDTHS.length * THEMES.length;
console.log(`\n${measured} of ${total} surface x language x width x theme combinations, ${controls} bordered controls measured (tolerance ${TOL}px), ${rowsSeen} table rows checked.`);
console.log(Object.keys(by).length ? Object.entries(by).map(([k, v]) => `  ${k.padEnd(8)} ${v}`).join('\n') : '  none');
console.log(`-> ${OUT}/findings.json`);
process.exit(findings.length ? 1 : 0);
