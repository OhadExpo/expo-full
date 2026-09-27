// verify-title-one-row.mjs — every title, label, chip and caption is ONE row.
//
// Ohad, 27.9 (#328/#329/#331): "Friday to starter need to fit in one row. Same
// rule everywhere for titles" / "Font size must be the same everywhere ... You
// should just use different wording" / "full words if they fit". So a label
// that breaks onto a second line is a fault, and the fix is WORDING (or a
// full-or-short word), never a smaller font.
//
// What counts as a title here: a SHORT run of text (2..40 characters) styled
// as a label - bold (>= 700), uppercase, or letter-spaced (>= 0.04em) - whose
// element holds only inline content. Sentences are excluded by the length cap
// and by the style test (body copy is regular weight, no tracking).
// A title is on two rows when its text's line boxes sit at two different tops.
// NOT titles, and counted as skipped so the zero says what it left out:
//   - 6+ words: a sentence (his intake form's questions, help lines);
//   - a 20px+ headline of 4+ words (marketing hero lines are sentences).
//
// Groups identical findings (a list of twenty rows is one fault). Uses the
// shared harness (lib/gate-sweep.mjs): routes x en/he x widths, a zero says
// what it measured, BREAK_CSS proves the gate.
//
//   node scripts/verify-title-one-row.mjs          (WIDTHS=390 LANGS=he ONLY=bhbc ...)
import { runSweep } from './lib/gate-sweep.mjs';

const skippedText = { sentences: 0, headlines: 0 };
process.on('exit', () => console.log(`  not titles (left out on purpose): ${skippedText.sentences} sentences of 6+ words, ${skippedText.headlines} headlines of 20px+`));

function measureTitles() {
  const shown = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0.5 && r.height > 0.5;
  };
  const desc = (el) => {
    const cls = [...(el.classList || [])].slice(0, 2).map((c) => '.' + c).join('');
    const p = el.parentElement;
    const pc = p ? p.tagName.toLowerCase() + [...(p.classList || [])].slice(0, 1).map((c) => '.' + c).join('') : '';
    return `${pc} > ${el.tagName.toLowerCase()}${cls}`;
  };
  const INLINE = new Set(['inline', 'inline-block', 'inline-flex', 'contents']);
  const out = [];
  let n = 0, sentences = 0, headlines = 0;
  for (const el of document.querySelectorAll('body *')) {
    if (['SCRIPT', 'STYLE', 'SVG', 'svg', 'TEXTAREA', 'INPUT', 'OPTION', 'SELECT', 'CANVAS', 'VIDEO'].includes(el.tagName)) continue;
    if (el.closest('svg, [contenteditable="true"], [data-allow-wrap]')) continue;
    // own text only: the element must have a non-empty direct text node
    if (![...el.childNodes].some((c) => c.nodeType === 3 && c.nodeValue.trim())) continue;
    // and only inline children (a block child makes it a container, not a title)
    if ([...el.children].some((c) => !INLINE.has(getComputedStyle(c).display))) continue;
    const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
    if (text.length < 2 || text.length > 40) continue;
    if (!shown(el)) continue;
    const cs = getComputedStyle(el);
    const ls = cs.letterSpacing === 'normal' ? 0 : parseFloat(cs.letterSpacing) / (parseFloat(cs.fontSize) || 16);
    const label = parseInt(cs.fontWeight, 10) >= 700 || cs.textTransform === 'uppercase' || ls >= 0.04;
    if (!label) continue;
    const words = text.split(' ').filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
    if (words >= 6) { sentences++; continue; }
    if (parseFloat(cs.fontSize) >= 20 && words >= 4) { headlines++; continue; }
    n++;
    const rg = document.createRange();
    rg.selectNodeContents(el);
    // one ROW = rects whose vertical spans overlap. Comparing tops read a 40px
    // number and its 13px "/ 8" on the same baseline as two rows.
    const rows = [];
    for (const r of rg.getClientRects()) {
      if (r.width < 0.5 || r.height < 0.5) continue;
      const row = rows.find((q) => r.top < q.bottom - 2 && q.top < r.bottom - 2);
      if (row) { row.top = Math.min(row.top, r.top); row.bottom = Math.max(row.bottom, r.bottom); } else rows.push({ top: r.top, bottom: r.bottom });
    }
    const tops = rows;
    if (tops.length > 1) out.push({ host: desc(el), text: text.slice(0, 32), rows: tops.length, w: Math.round(el.getBoundingClientRect().width), fs: cs.fontSize });
  }
  return { n, out, sentences, headlines };
}

await runSweep({
  name: 'TITLE ONE ROW',
  async measure(pg) {
    const { n, out, sentences, headlines } = await pg.evaluate(measureTitles);
    skippedText.sentences += sentences; skippedText.headlines += headlines;
    const groups = new Map();
    for (const f of out) {
      const k = `${f.host}|${f.text}`;
      const g = groups.get(k);
      if (g) g.n++; else groups.set(k, { ...f, n: 1 });
    }
    const failures = [...groups.values()].map((f) => ({
      what: `TWO ROWS  "${f.text}"  (${f.rows} rows in ${f.w}px, ${f.fs})  ${f.host}${f.n > 1 ? `  x${f.n}` : ''}`,
      detail: 'a title / label / chip on more than one row: reword it or give it a short form - never a smaller font',
    }));
    return { elements: n, failures };
  },
});
