// NO DEAD AIR AT THE END OF A SIDEWAYS SCROLLER.
//
// Ohad, 27.9: "extra white space ... useless" - a table, rail or strip that
// scrolls sideways and, once you reach its end, shows an empty band after the
// last thing in it. You swiped for nothing. It comes from a trailing padding
// or margin, a min-width wider than the content, a spacer, or a column sized
// for text that is not there - none of which is visible in the source.
//
// WHAT IT CHECKS: every element with overflow-x auto/scroll and
// scrollWidth > clientWidth + 2 (html/body excluded - a page that scrolls
// sideways is a different fault). Each one is scrolled to its FAR END:
//   LTR  fully right  (scrollLeft = scrollWidth - clientWidth)
//   RTL  fully left   (Chrome's RTL scrollLeft is 0 at the start and goes
//                      NEGATIVE toward the end, so scrollLeft = -(sW - cW))
// then the gap between the far edge of its content and its far INNER edge
// (the padding box: rect + clientLeft .. + clientWidth, so a border or a
// scrollbar is not counted as air) is measured. FAIL when the gap > MAXGAP
// (default 16px). Its scroll position is restored afterwards.
//
// "CONTENT" is what PAINTS, not what occupies space: glyphs (Range rects over
// every text node), images/svg/canvas/video/form controls, and any element
// that draws a background, border, outline or shadow. A bare wrapper or spacer
// box is space, not content - otherwise a min-width wrapper would measure the
// gap as zero every time. Each rect is clipped by any nested clipping box
// between it and the scroller, so content hidden inside an inner scroller does
// not count as reaching the edge.
//
//   node scripts/verify-scroller-tail.mjs                 (local preview :5199)
//   MAXGAP=24 WIDTHS=390 ONLY=bhbc node scripts/verify-scroller-tail.mjs
//   BASE=https://expo-app.co.il node scripts/verify-scroller-tail.mjs
import { runSweep } from './lib/gate-sweep.mjs';

const MAXGAP = Number(process.env.MAXGAP || 16);

async function measureTails(MAXGAP) {
  const shown = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0.5 && r.height > 0.5;
  };
  const transparent = (c) => !c || c === 'transparent' || /rgba\(\d+,\s*\d+,\s*\d+,\s*0\)/.test(c);
  const paints = (cs) => {
    if (!transparent(cs.backgroundColor) || cs.backgroundImage !== 'none') return true;
    if (cs.boxShadow && cs.boxShadow !== 'none') return true;
    if (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0 && !transparent(cs.outlineColor)) return true;
    return ['Top', 'Right', 'Bottom', 'Left'].some((s) => parseFloat(cs['border' + s + 'Width']) > 0 && cs['border' + s + 'Style'] !== 'none' && !transparent(cs['border' + s + 'Color']));
  };
  const desc = (el) => {
    const cls = [...(el.classList || [])].map((c) => '.' + c).join('');
    const role = el.getAttribute('role') ? `[role=${el.getAttribute('role')}]` : '';
    return el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + cls + role;
  };
  const snippet = (el) => ((el && (el.textContent || el.getAttribute && (el.getAttribute('aria-label') || el.getAttribute('alt')))) || '').trim().replace(/\s+/g, ' ').slice(0, 30);
  const REPLACED = /^(img|svg|canvas|video|iframe|input|select|textarea|progress|meter)$/;
  // a timer, not requestAnimationFrame: the gate's tabs are not focused and an
  // unfocused tab never runs animation frames - the rAF wait hung every page
  const frame = () => new Promise((r) => setTimeout(r, 40));
  const INF = { l: -1e9, r: 1e9, t: -1e9, b: 1e9 };
  const isect = (a, b) => ({ l: Math.max(a.l, b.l), r: Math.min(a.r, b.r), t: Math.max(a.t, b.t), b: Math.min(a.b, b.b) });

  const scrollers = [...document.querySelectorAll('body *')].filter((el) => {
    const cs = getComputedStyle(el);
    return (cs.overflowX === 'auto' || cs.overflowX === 'scroll') && el.scrollWidth > el.clientWidth + 2 && shown(el);
  });
  const out = [];
  for (const sc of scrollers) {
    const rtl = getComputedStyle(sc).direction === 'rtl';
    const saved = sc.scrollLeft;
    const max = sc.scrollWidth - sc.clientWidth;
    sc.scrollTo({ left: rtl ? -max : max, behavior: 'instant' });
    await frame();
    await new Promise((r) => setTimeout(r, 120));   // let a scroll-snap settle where the user would land
    const reached = sc.scrollLeft;
    const sr = sc.getBoundingClientRect();
    const innerL = sr.left + sc.clientLeft, innerR = innerL + sc.clientWidth;

    // Clip for an element's own box: every clipping ancestor strictly inside the scroller.
    const clipMemo = new Map();
    const clipFor = (el) => {
      if (clipMemo.has(el)) return clipMemo.get(el);
      const p = el.parentElement;
      let c = INF;
      if (p && p !== sc && sc.contains(p)) {
        c = clipFor(p);
        const pcs = getComputedStyle(p);
        if (pcs.overflowX !== 'visible' || pcs.overflowY !== 'visible') {
          const pr = p.getBoundingClientRect();
          const box = { l: pr.left + p.clientLeft, r: pr.left + p.clientLeft + p.clientWidth, t: pr.top + p.clientTop, b: pr.top + p.clientTop + p.clientHeight };
          c = isect(c, pcs.overflowX !== 'visible' ? { ...INF, l: box.l, r: box.r } : INF);
          c = isect(c, pcs.overflowY !== 'visible' ? { ...INF, t: box.t, b: box.b } : INF);
        }
      }
      clipMemo.set(el, c);
      return c;
    };
    let far = null, farEl = null, counted = 0, partial = false;
    const take = (rect, clip, el) => {
      const c = isect({ l: rect.left, r: rect.right, t: rect.top, b: rect.bottom }, clip);
      if (!(c.r - c.l > 0.5 && c.b - c.t > 0.5)) return;
      counted++;
      const edge = rtl ? c.l : c.r;
      if (far === null || (rtl ? edge < far : edge > far)) { far = edge; farEl = el; }
    };
    const els = sc.querySelectorAll('*');
    if (els.length > 8000) partial = true;
    let i = 0;
    for (const el of els) {
      if (++i > 8000) break;
      if (el.closest('svg') && el.tagName.toLowerCase() !== 'svg') continue;   // an svg is judged as one picture
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue;
      if (cs.position === 'fixed') continue;                                   // does not scroll with the content
      const tag = el.tagName.toLowerCase();
      if (REPLACED.test(tag) || paints(cs)) {
        const r = el.getBoundingClientRect();
        if (r.width > 0.5 && r.height > 0.5) take(r, clipFor(el), el);
      }
      for (const n of el.childNodes) {
        if (n.nodeType !== 3 || !n.nodeValue.trim()) continue;
        const rg = document.createRange();
        rg.selectNodeContents(n);
        const clip = isect(clipFor(el), (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') ? (() => { const r = el.getBoundingClientRect(); return { l: r.left + el.clientLeft, r: r.left + el.clientLeft + el.clientWidth, t: r.top + el.clientTop, b: r.top + el.clientTop + el.clientHeight }; })() : INF);
        for (const r of rg.getClientRects()) if (r.width > 0.5 && r.height > 0.5) take(r, clip, el);
      }
    }
    // Text directly inside the scroller itself.
    for (const n of sc.childNodes) {
      if (n.nodeType !== 3 || !n.nodeValue.trim()) continue;
      const rg = document.createRange();
      rg.selectNodeContents(n);
      for (const r of rg.getClientRects()) if (r.width > 0.5 && r.height > 0.5) take(r, INF, sc);
    }
    const gap = far === null ? sc.clientWidth : (rtl ? far - innerL : innerR - far);
    out.push({
      sc: desc(sc), text: snippet(sc).slice(0, 24), rtl, gap: Math.round(gap * 10) / 10,
      sW: sc.scrollWidth, cW: sc.clientWidth, reached: Math.round(reached), wanted: Math.round(rtl ? -max : max),
      last: farEl ? `${desc(farEl)} "${snippet(farEl)}"` : 'no painted content at all', counted, partial,
    });
    sc.scrollTo({ left: saved, behavior: 'instant' });
  }
  await frame();
  return out;
}

await runSweep({
  name: 'SCROLLER-TAIL',
  async measure(pg) {
    const res = await pg.evaluate(measureTails, MAXGAP);
    if (process.env.DEBUG) console.log(JSON.stringify(res, null, 1));
    const failures = [];
    for (const s of res) {
      if (s.gap <= MAXGAP) continue;
      failures.push({
        what: `TAIL GAP ${s.gap}px  ${s.sc}${s.text ? ` "${s.text}"` : ''}`,
        detail: `${s.rtl ? 'RTL, scrolled fully LEFT' : 'LTR, scrolled fully RIGHT'} (scrollLeft ${s.reached}${s.reached !== s.wanted ? `, asked ${s.wanted} - snap or clamp` : ''}; scrollWidth ${s.sW}, clientWidth ${s.cW}); last content: ${s.last}; ${s.counted} painted rects${s.partial ? ' (first 8000 elements only)' : ''}; max ${MAXGAP}px`,
      });
    }
    return { elements: res.length, failures };
  },
});
