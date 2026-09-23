// THE PAINTED GLYPH ORDER MUST MATCH THE SOURCE STRING.
//
// This is the one class of Hebrew fault that reads perfectly in the code and
// wrong on the screen, and it has shipped three times:
//
//   "2 / 10 · L knee"   painted as   "L KNEE · 10 / 2"
//   "+972 54..."        painted with the + on the wrong end
//   "+13%"              the sign detaching from its number
//
// WHY IT HAPPENS (Unicode Annex #9, verified against UnicodeData.txt):
//   +  -        bidi class ES  (European Number Separator)
//   %  $  ₪  °  bidi class ET  (European Number Terminator)
//   /  ,  .  :  bidi class CS  (Common Number Separator)
//   ≥  ·  |     bidi class ON  (Other Neutral)
// Rule W4 folds an ES or CS into a number ONLY when it sits directly between
// two numbers of the same type — a space breaks that adjacency, and a leading
// sign has nothing before it at all. W6 then turns it into Other Neutral, and
// N2 hands it the paragraph direction. In an RTL paragraph it moves to the
// other end, or the whole run order reverses.
//
// WHY THIS GATE MEASURES PIXELS AND NOT THE STRING. The DOM still holds
// "2 / 10" after the browser has painted "10 / 2" — textContent cannot see the
// fault. Only the geometry can. So this walks each character with its own
// Range, sorts by x, and compares the result to the source. That is the same
// method that found all three bugs above by hand; this makes it a gate.
//
// WHAT IT DOES *NOT* FLAG, and why that took a second version. The first cut
// compared the whole text node's painted order to its source, and it reported
// 44 faults that were all correct Hebrew: in an RTL paragraph a separator
// BETWEEN two runs is supposed to move. "שלב 1 ·" really does paint as "·1"
// left-to-right, and "2 · מעל 14 יום" really does paint as "14·2" — reversing
// run order is what RTL is.
//
// So the unit of judgement is one ATOMIC NUMERIC TOKEN — a number with the
// sign, currency, percent or ratio that belongs to it. Inside that token the
// characters must paint in source order AND stay contiguous; between tokens,
// anything may move. That is the difference between "+13%" coming apart (a
// bug) and a bullet changing sides (not one).
//
// One more distinction the data forced: a hyphen after a Hebrew letter is the
// prefix in "ב-30%", not a minus sign, and it is SUPPOSED to stay with the
// letter. A leading sign only joins the number when what precedes it is not a
// Hebrew letter.
//
//   node scripts/verify-bidi-order.mjs [--only <substring>]
import fs from 'node:fs';
import P from 'puppeteer-core';

const BASE = process.env.BASE || 'http://127.0.0.1:5199';
const ONLY = (() => { const i = process.argv.indexOf('--only'); return i > 0 ? process.argv[i + 1] : null; })();
const OUT = 'audit-out/bidi-order';
fs.mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const COACH_TABS = ['dashboard', 'trainees', 'programs', 'exercises', 'sessions', 'review', 'tasks', 'billing'];
const SURFACES = [
  ['landing-he', '/demo/he'],
  ...COACH_TABS.map((t) => [`coach-${t}`, t === 'dashboard' ? '/demo/coach' : `/demo/coach/${t}`]),
  ['athlete', '/demo/athlete'],
  ['engine', '/try?embed=1'],
  ['booking', '/book'],
].filter(([n]) => !ONLY || n.includes(ONLY));

// Only RTL matters — an LTR paragraph cannot produce this fault.
const WIDTHS = [[390, 844], [1440, 950]];

const findings = [];
const add = (o) => { findings.push(o); console.log(`${o.kind.padEnd(9)} ${o.id.padEnd(26)} ${o.detail}`); };

const b = await P.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 300000 });
let measured = 0, nodes = 0, risky = 0;

for (const [name, route] of SURFACES) {
  for (const [w, h] of WIDTHS) {
    const id = `${name}/he/${w}`;
    const ctx = await b.createBrowserContext();
    const pg = await ctx.newPage();
    try {
      await pg.setViewport({ width: w, height: h, deviceScaleFactor: 1, isMobile: w < 700, hasTouch: w < 700 });
      await pg.evaluateOnNewDocument(() => {
        try {
          localStorage.setItem('expo-lang', 'he');
          localStorage.setItem('expo-install-snooze-until', String(Date.now() + 86400000));
        } catch (e) { /* private mode */ }
      });
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
        await wait(200);
        const r = await pg.evaluate(() => {
          // An atomic numeric token: a ratio (2 / 10, 9:30), or a number
          // with the currency / sign / percent glued to it.
          // The trailing sign is part of the token too. The first version took
          // only a LEADING sign, so "20+" was read as the token "20" and the
          // plus was never looked at — the break test caught that by passing
          // when it should have failed. A trailing "-" is only a sign when a
          // digit does not follow it, otherwise "20-30" is a range.
          const TOKEN = /\d+\s*[/:]\s*\d+|[₪$]\s*\d[\d,.]*|[+\-]?\d[\d,.]*\s*(?:[%₪$°]|\+|-(?!\d))?/gu;
          const HEB = /[֐-׿]/;
          const out = [];
          const ltrBlocks = [];
          let counted = 0, risked = 0;
          const vh = innerHeight;
          const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
          let n;
          while ((n = walk.nextNode())) {
            const raw = n.nodeValue || '';
            if (raw.trim().length < 2) continue;
            const el = n.parentElement;
            if (!el) continue;
            const cs = getComputedStyle(el);
            if (cs.visibility === 'hidden' || cs.opacity === '0' || cs.display === 'none') continue;
            const bb = el.getBoundingClientRect();
            if (bb.width < 4 || bb.height < 4) continue;
            if (bb.bottom < 0 || bb.top > vh) continue;
            counted++;

            // HEBREW PAINTED FLUSH TO THE WRONG EDGE. The engine shipped
            // with no base direction on its root at all, so the h1 computed
            // `direction: ltr` and a three-line Hebrew paragraph sat flush
            // LEFT with the ragged edge on the right — backwards, and
            // invisible to every other gate because nothing was clipped,
            // overflowing or reordered.
            //
            // The first version of this check flagged the ATTRIBUTE — any
            // Hebrew in a direction:ltr block — and reported ten findings in
            // the athlete portal that were not visible faults at all: its root
            // is LTR too, but every Hebrew block there is centred or fills its
            // box, so nothing sits on the wrong edge. Measuring the attribute
            // finds latent debt; measuring the INK finds what the reader sees.
            // This measures the ink: Hebrew whose ink hugs the left edge while
            // real slack is left over on the right.
            {
              const letters = raw.replace(/[^\p{L}]/gu, '');
              const heb = (raw.match(/[֐-׿]/g) || []).length;
              const centred = cs.textAlign === 'center' || cs.textAlign === 'right' || cs.textAlign === 'end';
              if (letters.length >= 6 && heb / letters.length > 0.7 && cs.direction === 'ltr' && !centred) {
                const rg2 = document.createRange();
                rg2.selectNodeContents(el);
                const rr = [...rg2.getClientRects()].filter((x) => x.width > 0);
                if (rr.length) {
                  const inkL = Math.min(...rr.map((x) => x.left));
                  const inkR = Math.max(...rr.map((x) => x.right));
                  const slackRight = bb.right - inkR, slackLeft = inkL - bb.left;
                  if (slackRight > 24 && slackLeft < 6) {
                    ltrBlocks.push({ t: raw.replace(/\s+/g, ' ').trim().slice(0, 46), tag: el.tagName, slack: Math.round(slackRight) });
                  }
                }
              }
            }

            TOKEN.lastIndex = 0;
            let m;
            while ((m = TOKEN.exec(raw))) {
              let start = m.index, text = m[0];
              // "ב-30%" — that hyphen belongs to the Hebrew prefix, not the number.
              if (/^[+\-]/.test(text) && start > 0 && HEB.test(raw[start - 1])) {
                start += 1; text = text.slice(1);
              }
              if (!/\d/.test(text) || text.replace(/\s/g, '').length < 2) continue;
              risked++;

              const chars = [];
              for (let i = 0; i < text.length; i++) {
                if (!/\S/.test(text[i])) continue;
                const rg = document.createRange();
                rg.setStart(n, start + i); rg.setEnd(n, start + i + 1);
                const rect = rg.getBoundingClientRect();
                if (rect.width === 0 && rect.height === 0) continue;
                chars.push({ c: text[i], x: rect.left, r: rect.right, y: Math.round(rect.top) });
              }
              if (chars.length < 2) continue;
              // A token that wrapped across two lines is a different fault
              // (the overflow gate owns that); do not judge its order here.
              if (new Set(chars.map((c) => c.y)).size > 1) continue;

              const expected = chars.map((c) => c.c).join('');
              const sorted = [...chars].sort((a, b) => a.x - b.x);
              const painted = sorted.map((c) => c.c).join('');
              if (painted !== expected) {
                out.push({ src: raw.replace(/\s+/g, ' ').trim().slice(0, 40), exp: expected, got: painted, why: 'reordered' });
                continue;
              }
              // Contiguous: nothing painted between the token's own glyphs.
              let gap = 0;
              for (let i = 1; i < sorted.length; i++) gap = Math.max(gap, sorted[i].x - sorted[i - 1].r);
              if (gap > 6) {
                out.push({ src: raw.replace(/\s+/g, ' ').trim().slice(0, 40), exp: expected, got: expected, why: `split by ${Math.round(gap)}px` });
              }
            }
          }
          return { out, ltrBlocks, counted, risked };
        });
        nodes += r.counted || 0;
        risky += r.risked || 0;
        for (const x of r.ltrBlocks || []) {
          const k = 'L|' + x.t;
          if (seen.has(k)) continue;
          seen.add(k);
          add({ kind: 'ALIGN', id, detail: `<${x.tag.toLowerCase()}> "${x.t}" — Hebrew painted flush LEFT with ${x.slack}px of slack on the right` });
        }
        for (const x of r.out) {
          const k = JSON.stringify(x);
          if (seen.has(k)) continue;
          seen.add(k);
          add({ kind: 'BIDI', id, detail: x.why === 'reordered'
            ? `"${x.src}" — the token "${x.exp}" painted as "${x.got}"`
            : `"${x.src}" — the token "${x.exp}" was ${x.why}` });
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
b.disconnect();

fs.writeFileSync(`${OUT}/findings.json`, JSON.stringify(findings, null, 1));
const by = {};
for (const f of findings) by[f.kind] = (by[f.kind] || 0) + 1;
const total = SURFACES.length * WIDTHS.length;
// A zero has to say what it measured. If nothing was at risk, the run proved
// nothing and must not read as a pass.
console.log(`\n${measured} of ${total} Hebrew surface x width combinations, ${nodes} text nodes, ${risky} atomic numeric tokens inside them.`);
console.log(Object.keys(by).length ? Object.entries(by).map(([k, v]) => `  ${k.padEnd(9)} ${v}`).join('\n') : '  none');
if (!risky) {
  console.log('FAIL: no numeric token was found at all — the gate cannot have tested anything.');
  process.exit(1);
}
console.log(`-> ${OUT}/findings.json`);
process.exit(findings.length ? 1 : 0);
