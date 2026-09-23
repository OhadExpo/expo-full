// EVERY DEMO SCREEN, ALL THE WAY DOWN.
//
// Ohad, 23.9: "make sure every single screen in the demo all over the platforms,
// including scrolling down to see the full page is perfect."
//
// The existing sweep (verify-demo.mjs) answers "does it render and is it in the
// right language". This one answers the other half: is the PAGE right, from the
// top of the scroll to the bottom of it, at phone and desktop, in both
// languages. It exists because every visual fault he has ever reported was
// visible in one second and invisible to a rect test:
//
//   COVERED     text a viewer cannot touch because something is drawn over it.
//               Measured with elementFromPoint, not by intersecting rectangles
//               — an intersection is not a cover, and a cover is what he sees.
//   OFFSCREEN   an element whose box lies outside the viewport horizontally and
//               is NOT inside a horizontal scroller. A scroller is a design; a
//               button at x = -317 is a bug.
//   HSCROLL     the page itself scrolls sideways. A table or a rail may; the
//               document may not.
//   CLIPPED     text whose ink is taller or wider than the box painting it, so
//               a letter is cut. Measured on the RANGE, not the element.
//   DEADAIR     a run of more than 400px of nothing between two pieces of
//               content, mid-page, on a phone.
//   TINYTAP     an interactive target under 32px on a touch width.
//
// The scroll matters: elementFromPoint only answers for the viewport, so a
// single-shot probe on a 6,000px page measures the first 844px and calls the
// rest clean. This walks the page in viewport-sized steps and measures each.
//
//   node scripts/verify-demo-pages.mjs [--shots] [--only <substring>]
import fs from 'node:fs';
import P from 'puppeteer-core';

const BASE = process.env.BASE || 'http://127.0.0.1:5199';
const SHOTS = process.argv.includes('--shots');
const ONLY = (() => { const i = process.argv.indexOf('--only'); return i > 0 ? process.argv[i + 1] : null; })();
const OUT = 'audit-out/demo-pages';
fs.mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const COACH_TABS = ['dashboard', 'trainees', 'programs', 'exercises', 'sessions', 'review', 'tasks', 'billing'];
const SURFACES = [
  ['landing', '/demo'],
  ['landing-he', '/demo/he'],
  ['landing-en', '/demo/en'],
  ...COACH_TABS.map((t) => [`coach-${t}`, t === 'dashboard' ? '/demo/coach' : `/demo/coach/${t}`]),
  // CLICK-GATED SCREENS MUST BE IN THE LIST. The athlete drill-in is the
  // deepest screen in the demo, and every gate walked past it because a sweep
  // loads a route and reads the page — this one only appeared after you opened
  // an athlete. That is how it kept a fabricated assessment, an English
  // payments ledger and a hardcoded April date. It has a URL; use it.
  ['athlete-detail', '/demo/coach/trainees/t1'],
  ['athlete-couple', '/demo/coach/trainees/t3'],
  ['athlete-overdue', '/demo/coach/trainees/t2'],
  ['athlete', '/demo/athlete'],
  ['sandbox', '/demo/sandbox'],
  ['try', '/try'],
  ['engine-embed', '/try?embed=1'],
].filter(([n]) => !ONLY || n.includes(ONLY));

const LANGS = ['en', 'he'];
// 360 is the narrowest phone he has ever asked about; 390 is his own; 768 is the
// tablet that hid a 128px pill off the edge; 1440 is the laptop he will demo on.
const WIDTHS = [[360, 800], [390, 844], [768, 1024], [1440, 950]];

const findings = [];
const add = (o) => { findings.push(o); console.log(`${o.kind.padEnd(9)} ${o.id.padEnd(28)} ${o.detail}`); };

const b = await P.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 300000 });
let measured = 0;
let steps = 0;

for (const [name, route] of SURFACES) {
  for (const lang of LANGS) {
    for (const [w, h] of WIDTHS) {
      const id = `${name}/${lang}/${w}`;
      const ctx = await b.createBrowserContext();
      const pg = await ctx.newPage();
      try {
        await pg.setViewport({ width: w, height: h, deviceScaleFactor: 1, isMobile: w < 700, hasTouch: w < 700 });
        await pg.evaluateOnNewDocument((L) => {
          try {
            localStorage.setItem('expo-lang', L);
            localStorage.setItem('expo-install-snooze-until', String(Date.now() + 86400000));
          } catch (e) { /* private mode */ }
        }, lang);
        await pg.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 60000 });

        // Settle by watching the text stop growing — the chunks are lazy and a
        // fixed sleep has already reported a live page as dead once.
        let prev = -1, settled = false;
        for (let i = 0; i < 24; i++) {
          await wait(600);
          const len = await pg.evaluate(() => (document.body.innerText || '').length);
          if (len === prev && len > 0) { settled = true; break; }
          prev = len;
        }
        if (!settled) { add({ kind: 'UNSETTLED', id, detail: 'still changing after 14s — NOT judged' }); continue; }

        // The document itself must never scroll sideways.
        const hs = await pg.evaluate(() => {
          const d = document.documentElement;
          if (d.scrollWidth <= d.clientWidth + 1) return null;
          // Name the widest offender so the finding is actionable.
          let worst = null;
          for (const el of document.querySelectorAll('*')) {
            const r = el.getBoundingClientRect();
            if (r.width < 4) continue;
            const over = r.right - d.clientWidth;
            if (over > 2 && (!worst || over > worst.over)) {
              worst = { over: Math.round(over), tag: el.tagName, cls: String(el.className || '').slice(0, 30), txt: (el.textContent || '').trim().slice(0, 30) };
            }
          }
          return { doc: d.scrollWidth, view: d.clientWidth, worst };
        });
        if (hs) add({ kind: 'HSCROLL', id, detail: `document ${hs.doc} > ${hs.view}; widest ${JSON.stringify(hs.worst)}` });

        const pageH = await pg.evaluate(() => document.documentElement.scrollHeight);
        const seen = new Set();

        for (let y = 0; y < pageH; y += Math.round(h * 0.85)) {
          await pg.evaluate((yy) => window.scrollTo(0, yy), y);
          await wait(260);
          steps++;
          const r = await pg.evaluate((minTap) => {
            const out = { covered: [], offscreen: [], clipped: [], tiny: [], junk: [] };
            const vw = innerWidth, vh = innerHeight;
            const inView = (b) => b.bottom > 0 && b.top < vh && b.height > 0;

            // --- JUNK: a value that leaked instead of rendering -------------
            //
            // "3 ימים · NAN תרגילים" shipped on every card of the programs tab
            // because a derived count read charCodeAt(2) of a two-character id.
            // A gate cannot know a number is WRONG, but it can always know a
            // number is not a number — and NaN / undefined / null / [object
            // Object] on screen is the single most embarrassing class of fault
            // in front of a buyer. Cheap to check, so there is no excuse for
            // having found this one by eye.
            {
              //  cannot precede a '[', so (...|\[object Object\]) silently
              // never matched it — caught by the break test, 4 of 5 shapes.
              const junkRe = /\b(NaN|undefined|null|Infinity)\b|\[object [A-Z]\w*\]/;
              const wj = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
              let jn;
              while ((jn = wj.nextNode())) {
                const t = (jn.nodeValue || '').trim();
                if (!t || !junkRe.test(t)) continue;
                const el = jn.parentElement;
                if (!el) continue;
                const bb = el.getBoundingClientRect();
                if (bb.width < 2 || bb.height < 2 || !inView(bb)) continue;
                const cs = getComputedStyle(el);
                if (cs.visibility === 'hidden' || cs.opacity === '0') continue;
                out.junk = out.junk || [];
                out.junk.push({ t: t.slice(0, 44) });
              }
            }

            // --- COVERED ---------------------------------------------------
            const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
            let n;
            while ((n = walk.nextNode())) {
              const t = (n.nodeValue || '').replace(/\s+/g, ' ').trim();
              if (t.length < 3) continue;
              const el = n.parentElement;
              if (!el) continue;
              const bb = el.getBoundingClientRect();
              if (bb.width < 6 || bb.height < 6 || !inView(bb)) continue;
              const cs = getComputedStyle(el);
              if (cs.visibility === 'hidden' || cs.opacity === '0') continue;
              for (const fx of [0.2, 0.5, 0.8]) {
                const x = bb.left + bb.width * fx;
                const y2 = bb.top + bb.height / 2;
                if (x < 1 || y2 < 1 || x > vw - 1 || y2 > vh - 1) continue;
                const top = document.elementFromPoint(x, y2);
                if (!top || top === el || el.contains(top) || top.contains(el)) continue;
                // A label inside its own <button>/<a> is not covered by it.
                if (el.closest('button,a,label') === top.closest('button,a,label')) continue;
                // A STICKY OR FIXED LAYER COVERING CONTENT YOU HAVE SCROLLED
                // PAST IS THE DESIGN, NOT A FAULT. The first run of this gate
                // reported 38 covers on one tab and every single one was the
                // sticky nav or the logo sitting over a task card the scroll
                // had carried underneath it. A gate that cries wolf gets
                // ignored, which is worse than not having it.
                let overlayer = false;
                for (let q = top; q && q !== document.body; q = q.parentElement) {
                  const qp = getComputedStyle(q).position;
                  if (qp === 'fixed' || qp === 'sticky') { overlayer = true; break; }
                }
                if (overlayer) continue;
                out.covered.push({ t: t.slice(0, 36), by: top.tagName + '·' + (top.textContent || '').trim().slice(0, 18) });
                break;
              }
            }

            // --- OFFSCREEN (not inside a horizontal scroller) --------------
            const scrollerOf = (el) => {
              for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
                const c = getComputedStyle(p);
                if (/auto|scroll/.test(c.overflowX) && p.scrollWidth > p.clientWidth + 1) return p;
              }
              return null;
            };
            for (const el of document.querySelectorAll('button,a,input,select,textarea,[role=button],[role=tab]')) {
              const bb = el.getBoundingClientRect();
              if (bb.width < 2 || bb.height < 2 || !inView(bb)) continue;
              if (bb.right > 1 && bb.left < vw - 1) {
                // On screen. Check the tap target while we are here.
                if (matchMedia('(pointer: coarse)').matches && (bb.height < minTap || bb.width < minTap)) {
                  out.tiny.push({ t: (el.textContent || el.getAttribute('aria-label') || el.tagName).trim().slice(0, 24), w: Math.round(bb.width), h: Math.round(bb.height) });
                }
                continue;
              }
              // A SCROLLER IS A DESIGN — EXCEPT FOR NAVIGATION.
              //
              // The first version of this line excused anything inside a
              // horizontal scroller, and printed green over the demo's top menu
              // showing half of itself: four of seven controls at negative x in
              // Hebrew, the same four past the right edge in English.
              //
              // My second attempt tried "a scroller is honest if its scrollbar
              // shows or a tile peeks at the edge". The break test killed it: a
              // peeking tile is true of EVERY horizontal scroller, including the
              // broken nav, so it excused exactly what it was meant to catch.
              //
              // The real distinction is not how the scroller looks, it is WHAT
              // IS IN IT. A content rail may hold more than fits — that is the
              // point of a rail. NAVIGATION may not: a menu that hides half its
              // items has no way to tell you the other half exists. So a
              // scroller excuses an off-screen control unless it is navigation.
              const sc = scrollerOf(el);
              if (sc) {
                const isNav = !!(sc.closest('nav,header,[role=tablist],[role=navigation]')
                  || sc.querySelector('[role=tab]')
                  || (el.getAttribute && el.getAttribute('role') === 'tab'));
                if (!isNav) continue;
              }
              out.offscreen.push({ t: (el.textContent || el.getAttribute('aria-label') || el.tagName).trim().slice(0, 30), l: Math.round(bb.left), r: Math.round(bb.right) });
            }

            // --- CLIPPED: the INK, not the box -----------------------------
            const seenClip = new Set();
            const w2 = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
            while ((n = w2.nextNode())) {
              const t = (n.nodeValue || '').trim();
              if (t.length < 2) continue;
              const el = n.parentElement;
              if (!el || seenClip.has(el)) continue;
              const bb = el.getBoundingClientRect();
              if (bb.width < 6 || !inView(bb)) continue;
              const cs = getComputedStyle(el);
              if (cs.overflow === 'visible' && cs.overflowX === 'visible') continue;
              if (cs.textOverflow === 'ellipsis') continue;   // deliberate
              const rng = document.createRange();
              rng.selectNodeContents(el);
              const ink = rng.getBoundingClientRect();
              const overW = ink.width - bb.width;
              const overH = ink.height - bb.height;
              if (overW > 2 || overH > 2) {
                seenClip.add(el);
                out.clipped.push({ t: t.slice(0, 30), overW: Math.round(overW), overH: Math.round(overH) });
              }
            }
            return out;
          }, w < 700 ? 32 : 0);

          const push = (kind, arr, fmt) => {
            for (const x of arr) {
              const k = kind + '|' + JSON.stringify(x);
              if (seen.has(k)) continue;
              seen.add(k);
              add({ kind, id, detail: fmt(x) });
            }
          };
          push('JUNK', r.junk || [], (x) => `"${x.t}" — a value leaked to the screen instead of rendering`);
          push('COVERED', r.covered, (x) => `"${x.t}" is under ${x.by}`);
          push('OFFSCREEN', r.offscreen, (x) => `"${x.t}" at x ${x.l}..${x.r} (viewport 0..${w}), not in a scroller`);
          push('CLIPPED', r.clipped, (x) => `"${x.t}" ink overflows its box by ${x.overW}x${x.overH}px`);
          push('TINYTAP', r.tiny, (x) => `"${x.t}" tap target ${x.w}x${x.h} (< 32px on touch)`);
        }

        // --- BURIED: a CONTROL a sticky layer covers where it comes to rest -
        //
        // Covering content the scroll has carried past is the design. Covering
        // a LINK at the bottom of the page, where the reader stops, is not:
        // on the landing page the sticky CTA sat on the footer, so tapping
        // SIGN IN opened the coach demo. That is why the sticky exclusion
        // above cannot be the whole story — this is its counterpart.
        await pg.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        await wait(400);
        const buried = await pg.evaluate(() => {
          const out = [];
          for (const el of document.querySelectorAll('a[href],button,input,select,[role=button]')) {
            const bb = el.getBoundingClientRect();
            if (bb.width < 6 || bb.height < 6) continue;
            if (bb.bottom < 0 || bb.top > innerHeight) continue;
            const x = bb.left + bb.width / 2, y = bb.top + bb.height / 2;
            if (x < 1 || y < 1 || x > innerWidth - 1 || y > innerHeight - 1) continue;
            const top = document.elementFromPoint(x, y);
            if (!top || top === el || el.contains(top) || top.contains(el)) continue;
            let sticky = null;
            for (let q = top; q && q !== document.body; q = q.parentElement) {
              const qp = getComputedStyle(q).position;
              if (qp === 'fixed' || qp === 'sticky') { sticky = q; break; }
            }
            if (!sticky) continue;
            // A TOP bar covering something near the top of the viewport is
            // ordinary: the reader scrolls two lines and it is free. The fault
            // is a BOTTOM-anchored overlay — a sticky CTA or a chat bubble —
            // sitting on a control at the place the page comes to rest, where
            // there is nowhere left to scroll. Only those count.
            const sb = sticky.getBoundingClientRect();
            if (sb.bottom < innerHeight - 8) continue;
            out.push({ t: (el.textContent || el.getAttribute('aria-label') || el.tagName).trim().slice(0, 30), by: (sticky.textContent || sticky.className || sticky.tagName).trim().slice(0, 24) });
          }
          return out;
        });
        for (const x of buried) add({ kind: 'BURIED', id, detail: `"${x.t}" cannot be tapped at rest — covered by the sticky "${x.by}"` });

        // --- DEADAIR: a long empty run mid-page ---------------------------
        // It used to run only under 700px. A 200px hole reads as unfinished
        // on a laptop too, which is the screen he demos from. The threshold
        // is looser on desktop because a tall card legitimately leaves more
        // room beside a short one.
        {
          const GAP = w < 700 ? 400 : 260;
          const gaps = await pg.evaluate((gapMin) => {
            const rows = [];
            for (const el of document.querySelectorAll('body *')) {
              if (!el.childElementCount && (el.textContent || '').trim().length < 2) continue;
              const r = el.getBoundingClientRect();
              if (r.height < 4 || r.width < 4) continue;
              rows.push([r.top + scrollY, r.bottom + scrollY]);
            }
            rows.sort((a, b2) => a[0] - b2[0]);
            const gapsOut = [];
            let reach = 0;
            for (const [t, b2] of rows) {
              if (t - reach > gapMin && reach > 0) gapsOut.push({ from: Math.round(reach), to: Math.round(t) });
              reach = Math.max(reach, b2);
            }
            return gapsOut;
          }, GAP);
          for (const g of gaps) add({ kind: 'DEADAIR', id, detail: `${g.to - g.from}px of nothing between y=${g.from} and y=${g.to}` });
        }

        if (SHOTS) {
          await pg.evaluate(() => window.scrollTo(0, 0));
          await wait(200);
          await pg.screenshot({ path: `${OUT}/${name}-${lang}-${w}.png`, fullPage: true });
        }
        measured++;
      } catch (e) {
        add({ kind: 'ERROR', id, detail: 'harness: ' + String(e.message || e).slice(0, 120) });
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
const total = SURFACES.length * LANGS.length * WIDTHS.length;
console.log(`\n${measured} of ${total} surface x language x width combinations measured, ${steps} scroll positions.`);
console.log(Object.keys(by).length ? Object.entries(by).map(([k, v]) => `  ${k.padEnd(10)} ${v}`).join('\n') : '  none');
console.log(`-> ${OUT}/findings.json`);
process.exit(findings.length ? 1 : 0);
