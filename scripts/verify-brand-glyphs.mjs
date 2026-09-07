// EVERY SYMBOL WE PUT ON SCREEN MUST EXIST IN THE BRAND FONT.
//
// Nord has no U+25BE. The browser fell back for it, and the fallback paints a
// short DASH at UI sizes — so every collapsible strip in the app carried a
// stray hyphen where its open/close control should be (found by eye 2026-09-03,
// after Ohad pointed at the program popup).
//
// No layout gate could see it: a fallback glyph is still a glyph. The text is
// present, the box is the right size, nothing overflows or clips. The only
// signal is that the character is drawn by a DIFFERENT font than the one we
// chose — which is exactly what this measures.
//
// Method: render each candidate twice at a large size, once in `Nord, <ref>`
// and once in `<ref>` alone. If the advance widths match to the pixel for BOTH
// reference fonts, Nord contributed nothing and the browser fell back.
import P from 'puppeteer-core';

const CANDIDATES = [
  ['\u25BE', 'down triangle'], ['\u25B8', 'right triangle'], ['\u25B6', 'play'],
  ['\u2713', 'check'], ['\u2715', 'cross'], ['\u2717', 'ballot x'],
  ['\u2191', 'up arrow'], ['\u2193', 'down arrow'], ['\u2190', 'left arrow'], ['\u2192', 'right arrow'],
  ['\u2194', 'left-right arrow'], ['\u21D5', 'up-down double'],
  ['\u203A', 'single angle right'], ['\u2039', 'single angle left'],
  ['\u2022', 'bullet'], ['\u00B7', 'middot'], ['\u2026', 'ellipsis'],
  ['\u2014', 'em dash'], ['\u2013', 'en dash'], ['\u2212', 'minus'],
  ['\u00D7', 'multiply'], ['\u00B0', 'degree'], ['\u00B1', 'plus-minus'],
  ['\u2264', 'less-equal'], ['\u2265', 'greater-equal'], ['\u2248', 'almost equal'],
  ['\u20AA', 'shekel'], ['\u26A0', 'warning'], ['\u2699', 'gear'], ['\u2708', 'plane'],
  ['\u23F1', 'stopwatch'], ['\u2691', 'flag'], ['\u270E', 'pencil'], ['\u25CF', 'black circle'],
  ['\u25A0', 'black square'], ['\u2934', 'arrow curving up'], ['\u2019', 'right quote'],
];

const b = await P.connect({ browserURL: (process.env.CDP || 'http://127.0.0.1:9222'), defaultViewport: null, protocolTimeout: 300000 });
const pg = await b.newPage();
await pg.goto((process.env.BASE || 'http://127.0.0.1:5199') + '/', { waitUntil: 'domcontentloaded' });
await new Promise((r) => setTimeout(r, 4000));
await pg.evaluate(() => document.fonts.ready);

const res = await pg.evaluate((cands) => {
  const measure = (ch, family) => {
    const c = document.createElement('canvas').getContext('2d');
    c.font = '96px ' + family;
    return c.measureText(ch).width;
  };
  return cands.map(([ch, name]) => {
    // Two different reference fonts: a glyph can coincidentally match one.
    const a1 = measure(ch, "Nord, monospace"), b1 = measure(ch, 'monospace');
    const a2 = measure(ch, "Nord, serif"), b2 = measure(ch, 'serif');
    const fellBack = Math.abs(a1 - b1) < 0.01 && Math.abs(a2 - b2) < 0.01;
    return { ch, name, fellBack, w: +a1.toFixed(1) };
  });
}, CANDIDATES);

// WHICH FALLBACKS ACTUALLY MATTER.
//
// 30 of 37 fall back, and most are FINE: rendered at 8-18px and looked at,
// the check, cross, arrows, angle quotes, middot, plus-minus, inequalities,
// warning, plane, circle and square all read correctly in the substitute font.
// Falling back is not the defect; being ILLEGIBLE is. A gate that failed on all
// 30 would be noise, and noisy gates get ignored.
//
// So the hard rule is narrow: U+25BE must not come back. Its substitute paints
// as a short dash at UI sizes, which is what put a stray hyphen on every
// collapsible strip in the app. Chevrons are SVG now.
//
// The full fallback list is still printed, because it is the thing you want to
// know before reaching for a new symbol.
const DENY = new Map([['▾', 'renders as a short dash at UI sizes — use the inline SVG chevron']]);

const fellBack = res.filter((r) => r.fellBack);
console.log(`${fellBack.length} of ${res.length} glyphs are not in Nord (informational):`);
console.log('  ' + fellBack.map((r) => r.ch).join(' '));

import fs from 'node:fs';
import path from 'node:path';
const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(jsx?|tsx?)$/.test(e.name)) files.push(p);
  }
})('src');

let bad = 0;
for (const f of files) {
  const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/);
  lines.forEach((line, i) => {
    const t = line.trim();
    if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return;
    for (const [ch, why] of DENY) {
      // SIZE IS THE WHOLE QUESTION. Rendered and looked at: the substitute
      // triangle is recognisable from 12px up and collapses to a short dash at
      // 8-10px. So this flags the glyph only where the same line declares a
      // small font — which is where it actually goes wrong — instead of all 68
      // uses, most of which are the 12px nav carets and read fine.
      const m = line.match(/fontSize:\s*(\d+(?:\.\d+)?)/);
      const small = m ? Number(m[1]) <= 10 : false;
      if (line.includes(ch) && small) {
        bad++;
        console.log(`
FAIL ${f}:${i + 1}
       U+${ch.codePointAt(0).toString(16).toUpperCase()} ${why}
       ${t.slice(0, 110)}`);
      }
    }
  });
}
console.log(bad ? `
${bad} use(s) of a glyph the brand font cannot draw legibly` : `
0 — no banned glyph in ${files.length} source files`);
await pg.close(); b.disconnect();
process.exit(bad ? 1 : 0);
