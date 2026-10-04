// verify-floating-content.mjs - NOTHING FLOATS IN A RESERVED BOX (4.10 #550).
//
// Ohad, photographed on a phone: "6 days is randomly spaced in the middle. Not
// aligned with the rest of the boxes or text in the same box - fix it everywhere
// it may happen all over the platforms". The cause: a status pill with a fixed
// min-width (so "18D AGO" and "TRAINED TODAY" are the same size) that pushed its
// words to its far END. At the end of a strip that is right; once the strip
// WRAPPED on a phone the pill sat beside the ANALYSIS button, and a short label
// floated mid-row inside its own empty box.
//
// The rule: a flex box that pushes its content to its end (justify-content
// flex-end/end, any direction, LTR or RTL) and has >= 8px of EMPTY space on its
// start side must itself end on its row's edge - otherwise the content floats.
// "Its row" = the nearest ancestor at least 55% of the viewport wide.
//
//   BASE=... node scripts/verify-floating-content.mjs   (lib/gate-sweep.mjs harness)
import { runSweep } from './lib/gate-sweep.mjs';

function measureFloat() {
  const out = []; let measured = 0;
  const vw = innerWidth;
  const shown = (el) => { const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight * 6; };
  for (const el of document.querySelectorAll('body *')) {
    if (el.closest('svg, table, [data-demo-chrome], [aria-hidden="true"]')) continue;
    const cs = getComputedStyle(el);
    if (!/flex/.test(cs.display) || /column/.test(cs.flexDirection)) continue;   // a ROW of content
    if (!/^(flex-end|end|right)$/.test(cs.justifyContent)) continue;
    if (!shown(el)) continue;
    measured++;
    const r = el.getBoundingClientRect();
    if (r.width > vw * 0.55) continue;                 // a row itself, not a box in one
    // the content's ink extent
    const rg = document.createRange(); rg.selectNodeContents(el);
    const rects = [...rg.getClientRects()].filter((x) => x.width > 0.5 && x.height > 0.5);
    if (!rects.length || !el.innerText.trim()) continue;
    const inkL = Math.min(...rects.map((x) => x.left)), inkR = Math.max(...rects.map((x) => x.right));
    // the READING direction around it: a number row may be direction:ltr on purpose
    // (so "₪8,181" does not flip) and pushed right - the START of a Hebrew line
    const rtl = getComputedStyle(el.parentElement || el).direction === 'rtl';
    // which PHYSICAL side the box packs its content to: its end, in its own direction
    // ('right' always means the right edge, whatever the direction)
    const side = cs.justifyContent === 'right' ? 'right' : (cs.direction === 'rtl' ? 'left' : 'right');
    if ((rtl && side === 'right') || (!rtl && side === 'left')) continue;   // packed to the reading START: aligned, not floating
    // the empty space is on the other physical side
    const empty = side === 'right' ? inkL - (r.left + (parseFloat(cs.paddingLeft) || 0)) : (r.right - (parseFloat(cs.paddingRight) || 0)) - inkR;
    if (empty < 8) continue;
    // the row: nearest ancestor at least 55% of the viewport wide
    let row = el.parentElement;
    while (row && row.getBoundingClientRect().width < vw * 0.55) row = row.parentElement;
    if (!row) continue;
    const rr = row.getBoundingClientRect(), rcs = getComputedStyle(row);
    const rowEnd = rtl ? rr.left + (parseFloat(rcs.paddingLeft) || 0) : rr.right - (parseFloat(rcs.paddingRight) || 0);
    // content edge to content edge: the box's OWN end padding is not distance from the row's edge
    const boxEnd = rtl ? r.left + (parseFloat(cs.paddingLeft) || 0) : r.right - (parseFloat(cs.paddingRight) || 0);
    const offEdge = Math.abs(rowEnd - boxEnd);
    // the boxes between it and its row may pad that edge (a table cell's padding):
    // the edge it should reach is the row's edge MINUS those paddings and borders
    let inset = 0;
    for (let a = el.parentElement; a && a !== row; a = a.parentElement) {
      const acs = getComputedStyle(a), ar = a.getBoundingClientRect();
      const aEnd = rtl ? ar.left : ar.right;
      // only an ancestor that itself reaches the row's edge contributes its padding
      if (Math.abs(aEnd - (rtl ? rr.left : rr.right)) - inset > 6 + (parseFloat(rtl ? rcs.paddingLeft : rcs.paddingRight) || 0)) continue;
      inset += (parseFloat(rtl ? acs.paddingLeft : acs.paddingRight) || 0) + (parseFloat(rtl ? acs.borderLeftWidth : acs.borderRightWidth) || 0);
    }
    if (offEdge - inset <= 6) continue;                // the box ends on its row's edge (padding aside): right where it is
    // ...or its content HUGS the next thing in the row (a reserved date slot whose chip
    // sits against its task title, #207): aligned to that, not floating
    // a column PINNED (sticky) to the end of a sideways-scrolling table is at the
    // visible edge by design - its row is wider than the screen
    let pinned = false; for (let a = el; a && a !== row; a = a.parentElement) if (getComputedStyle(a).position === 'sticky') { pinned = true; break; }
    if (pinned) continue;
    let nx = el.nextElementSibling; while (nx && !shown(nx)) nx = nx.nextElementSibling;
    if (nx) { const q = nx.getBoundingClientRect(); const gap = side === 'right' ? q.left - inkR : inkL - q.right; if (gap >= -1 && gap <= 16 && q.bottom > r.top && q.top < r.bottom) continue; }
    const chain = []; for (let a = el; a && chain.length < 7; a = a.parentElement) { const q = a.getBoundingClientRect(), qs = getComputedStyle(a); chain.push(`${a.tagName.toLowerCase()}.${(typeof a.className === 'string' ? a.className.split(' ')[0] : '')} end${Math.round(rtl ? q.left : q.right)} pad${parseFloat(rtl ? qs.paddingLeft : qs.paddingRight) || 0} w${Math.round(q.width)}${a === row ? ' =ROW' : ''}`); if (a === row) break; }
    out.push({ chain: chain.join(' > '), measured: 0, text: el.innerText.trim().replace(/\s+/g, ' ').slice(0, 30), empty: Math.round(empty), offEdge: Math.round(offEdge), cls: (el.className && typeof el.className === 'string' ? el.className.split(' ')[0] : el.tagName.toLowerCase()) });
  }
  return { out, measured };
}

await runSweep({
  name: 'FLOATING-CONTENT',
  async measure(pg) {
    const { out: res, measured } = await pg.evaluate(measureFloat);
    const groups = new Map();
    for (const d of res) { const k = `${d.cls}|${d.text.replace(/\d+/g, '#')}`; const g = groups.get(k); if (g) g.n++; else groups.set(k, { ...d, n: 1 }); }
    const failures = [...groups.values()].map((d) => ({
      what: `FLOATS "${d.text}"${d.n > 1 ? `  x${d.n}` : ''}`,
      detail: `${d.empty}px empty before it inside its own box (${d.cls}), and the box ends ${d.offEdge}px short of its row's edge` + (process.env.CHAIN ? `
           ${d.chain}` : ''),
    }));
    return { elements: measured, failures };   // every end-pushed box measured, not just the failures
  },
});
