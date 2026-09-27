// EVERY SMALL DOT SITS ON THE INK CENTRE OF THE WORDS BESIDE IT.
//
// Ohad, 27.9: the small status / leading dots ("● Injured", "• Due",
// "· 3 sessions") must sit vertically centred on the text next to them. Same
// rule as every other centring complaint of his: MEASURE THE INK, NOT THE BOX
// (memory: feedback_measure_the_ink_not_the_box). `align-items:center` puts a
// 6px dot on the centre of the LINE BOX, and the glyphs of the word next to it
// ride above that centre, so a flex row that reads 0.00px aligned in the
// inspector still looks like a dot hanging low.
//
// WHAT IS A DOT (each <= 12px):
//   element   a leaf with no text, 2-12px, square within 1.5px, round
//             (border-radius >= 50%, or a px radius >= half its side) and
//             painting a background or border; or a <= 12px <svg> whose only
//             shapes are circles/ellipses.
//   ::before  getComputedStyle(el, '::before') with real content, round and
//             painting, <= 12px - OR whose content string starts with a dot
//             glyph. A pseudo-element has no rect, so it is measured through
//             a PROBE: a real <span> given every computed property of the
//             pseudo, inserted as the host's first child (exactly where
//             ::before renders) while the real ::before is display:none'd,
//             measured, and removed in the same task (React never sees it).
//   glyph     a text node whose first non-space character is one of
//             ● • · ° ⬤ and that is LEADING (no text before it in its element).
// ...and it must be followed ON THE SAME LINE by text: the next text in
// document order (within three ancestors), whose line rect overlaps the dot
// vertically and starts within 24px of it on either side (so RTL counts).
//
// HOW THE INK CENTRE IS APPROXIMATED (documented, because it is a model):
//   baseline   = the text Range's line rect BOTTOM minus the font's descent
//                (canvas measureText(...).fontBoundingBoxDescent, same font
//                string as the element). Chrome's Range rect for a text run is
//                the font's content area, so bottom - descent is the baseline.
//   cap height = canvas measureText('H').actualBoundingBoxAscent.
//   ink centre = midpoint of (baseline - cap height) and baseline.
//   So it models the CAP band, which is what the eye centres a dot on in the
//   app's uppercase labels. For lowercase-only text the x-height band is lower
//   (the model reads the dot as slightly low) and for Hebrew the 'H' of the
//   primary font stands in for the Hebrew letters' height - see limitations.
// Dot centre: the dot's box centre (element, svg shape, ::before probe); for a
// GLYPH dot, its baseline minus half its own ink (actualBoundingBoxAscent -
// actualBoundingBoxDescent of that glyph in that font).
// FAIL when |dot centre - ink centre| > TOL (default 1px).
//
//   node scripts/verify-dot-centring.mjs                  (local preview :5199)
//   TOL=1.5 WIDTHS=390 LANGS=he node scripts/verify-dot-centring.mjs
//   BASE=https://expo-app.co.il node scripts/verify-dot-centring.mjs
import { runSweep } from './lib/gate-sweep.mjs';

const TOL = Number(process.env.TOL || 1);

function measureDots() {
  const GLYPHS = '●•·°⬤';
  const cv = document.createElement('canvas');
  const cx = cv.getContext('2d');
  const fontOf = (cs) => `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  const shown = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0.5 && r.height > 0.5;
  };
  const transparent = (c) => !c || c === 'transparent' || /rgba\(\d+,\s*\d+,\s*\d+,\s*0\)/.test(c);
  const paintsCs = (cs) => !transparent(cs.backgroundColor) || (cs.backgroundImage && cs.backgroundImage !== 'none')
    || ['Top', 'Right', 'Bottom', 'Left'].some((s) => parseFloat(cs['border' + s + 'Width']) > 0 && cs['border' + s + 'Style'] !== 'none' && !transparent(cs['border' + s + 'Color']));
  const roundCs = (cs, w, h) => ['borderTopLeftRadius', 'borderBottomRightRadius'].every((k) => {
    const v = String(cs[k] || '0').split(' ')[0];
    return v.endsWith('%') ? parseFloat(v) >= 50 : parseFloat(v) >= Math.min(w, h) / 2 - 0.5;
  });
  const desc = (el) => {
    if (!el || !el.tagName) return '?';
    const cls = [...(el.classList || [])].slice(0, 3).map((c) => '.' + c).join('');
    return el.tagName.toLowerCase() + cls;
  };
  // The text beside the dot: the cap-band ink centre of its first line.
  const inkOf = (node, rect) => {
    const cs = getComputedStyle(node.parentElement);
    cx.font = fontOf(cs);
    const m = cx.measureText('H');
    const baseline = rect.bottom - m.fontBoundingBoxDescent;
    const cap = m.actualBoundingBoxAscent;
    return { mid: baseline - cap / 2, baseline, cap };
  };
  const firstRect = (range) => [...range.getClientRects()].find((r) => r.width > 0.5 && r.height > 0.5) || null;
  const beside = (dot, tr) => {
    if (!tr) return false;
    const vOverlap = Math.min(dot.bottom, tr.bottom) - Math.max(dot.top, tr.top);
    if (vOverlap <= 0) return false;
    const after = tr.left - dot.right, before = dot.left - tr.right;   // LTR: text right of the dot; RTL: left of it
    return (after >= -1 && after <= 24) || (before >= -1 && before <= 24);
  };
  // Next non-empty visible text node after `node` (document order), within 3 ancestors.
  const nextText = (node) => {
    let scope = node.parentElement || node;
    for (let k = 0; k < 3 && scope.parentElement && scope !== document.body; k++) scope = scope.parentElement;
    const tw = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = tw.nextNode())) {
      if (node.contains && node.contains(n)) continue;
      if (!(node.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING)) continue;
      if (!n.nodeValue.trim() || !n.parentElement || !shown(n.parentElement)) continue;
      return n;
    }
    return null;
  };
  const rangeOfText = (n, from = 0) => {
    const t = n.nodeValue;
    let i = from;
    while (i < t.length && /\s/.test(t[i])) i++;
    if (i >= t.length) return null;
    const rg = document.createRange();
    rg.setStart(n, i);
    rg.setEnd(n, t.length);
    return rg;
  };
  const results = [];
  const judge = (kind, host, dotRect, dotMid, textNode, textRange) => {
    const tr = textRange ? firstRect(textRange) : null;
    if (!beside(dotRect, tr)) return;
    const ink = inkOf(textNode, tr);
    results.push({
      kind, host: desc(host), text: textRange.toString().trim().replace(/\s+/g, ' ').slice(0, 24),
      off: Math.round((dotMid - ink.mid) * 100) / 100, dotMid: Math.round(dotMid * 10) / 10, inkMid: Math.round(ink.mid * 10) / 10,
    });
  };
  const all = [...document.querySelectorAll('body *')];

  // 1. element dots + svg circle dots
  for (const el of all) {
    const tag = el.tagName.toLowerCase();
    if (tag !== 'svg' && el.closest('svg')) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2 || r.width > 12 || r.height > 12) continue;
    if (Math.abs(r.width - r.height) > 1.5) continue;
    if (!shown(el)) continue;
    let dotRect = null;
    if (tag === 'svg') {
      const shapes = [...el.querySelectorAll('path, rect, line, polyline, polygon, circle, ellipse, text, image, use')];
      if (!shapes.length || !shapes.every((s) => /^(circle|ellipse)$/.test(s.tagName.toLowerCase()))) continue;
      const bs = shapes.map((s) => s.getBoundingClientRect());
      dotRect = { top: Math.min(...bs.map((b) => b.top)), bottom: Math.max(...bs.map((b) => b.bottom)), left: Math.min(...bs.map((b) => b.left)), right: Math.max(...bs.map((b) => b.right)) };
    } else {
      if (el.children.length || (el.textContent || '').trim()) continue;
      if (/^(img|input|select|textarea|video|canvas|iframe|button)$/.test(tag)) continue;
      const cs = getComputedStyle(el);
      if (!roundCs(cs, r.width, r.height) || !paintsCs(cs)) continue;
      dotRect = r;
    }
    const tn = nextText(el);
    if (!tn) continue;
    judge(tag === 'svg' ? 'svg dot' : 'element dot', el, dotRect, (dotRect.top + dotRect.bottom) / 2, tn, rangeOfText(tn));
  }

  // 2. ::before dots, measured through a probe span with the pseudo's computed style
  const style = document.createElement('style');
  style.textContent = '[data-dot-probe-host]::before{display:none!important}';
  document.head.appendChild(style);
  try {
    for (const el of all) {
      if (el.closest('svg')) continue;
      const pcs = getComputedStyle(el, '::before');
      const content = pcs.content;
      if (!content || content === 'none' || content === 'normal' || pcs.display === 'none') continue;
      const str = /^["']/.test(content) ? content.slice(1, -1).replace(/\\([0-9a-f]{1,6})\s?/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/\\(.)/g, '$1') : null;
      if (str === null) continue;   // counter()/attr()/url(): not a dot we can reason about
      const w = parseFloat(pcs.width), h = parseFloat(pcs.height);
      const glyph = str.trim() && GLYPHS.includes(str.trim()[0]);
      const boxDot = !str.trim() && w >= 2 && h >= 2 && w <= 12 && h <= 12 && Math.abs(w - h) <= 1.5 && roundCs(pcs, w, h) && paintsCs(pcs);
      if (!glyph && !boxDot) continue;
      if (!shown(el)) continue;
      // getComputedStyle is LIVE: read everything before the host attribute hides the pseudo.
      const pFont = fontOf(pcs);
      const span = document.createElement('span');
      for (const p of pcs) { if (p === 'content') continue; try { span.style.setProperty(p, pcs.getPropertyValue(p)); } catch (e) { /* read-only */ } }
      span.textContent = str;
      el.setAttribute('data-dot-probe-host', '');
      el.insertBefore(span, el.firstChild);
      try {
        const sr = span.getBoundingClientRect();
        let dotMid = null, dotRect = sr;
        if (glyph) {
          const tn = span.firstChild;
          const gi = str.search(/\S/);
          const rg = document.createRange();
          rg.setStart(tn, gi); rg.setEnd(tn, gi + 1);
          const gr = firstRect(rg);
          if (gr) {
            cx.font = pFont;
            const hm = cx.measureText('H');
            const gm = cx.measureText(str[gi]);
            const base = gr.bottom - hm.fontBoundingBoxDescent;
            dotMid = base - (gm.actualBoundingBoxAscent - gm.actualBoundingBoxDescent) / 2;
            dotRect = gr;
          }
        } else if (sr.width > 0 && sr.height > 0) {
          dotMid = (sr.top + sr.bottom) / 2;
        }
        if (dotMid !== null) {
          const tn = nextText(span);
          if (tn) judge(glyph ? '::before glyph' : '::before dot', el, dotRect, dotMid, tn, rangeOfText(tn));
        }
      } finally {
        span.remove();
        el.removeAttribute('data-dot-probe-host');
      }
    }
  } finally {
    style.remove();
  }

  // 3. glyph dots leading a text node
  const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = tw.nextNode())) {
    const t = n.nodeValue;
    const gi = t.search(/\S/);
    if (gi < 0 || !GLYPHS.includes(t[gi])) continue;
    const pe = n.parentElement;
    if (!pe || pe.closest('svg, script, style') || !shown(pe)) continue;
    // LEADING: nothing but whitespace before it in its element.
    const pre = document.createRange();
    pre.setStart(pe, 0); pre.setEnd(n, gi);
    if (pre.toString().trim()) continue;
    const gr0 = document.createRange();
    gr0.setStart(n, gi); gr0.setEnd(n, gi + 1);
    const gr = firstRect(gr0);
    if (!gr) continue;
    const cs = getComputedStyle(pe);
    cx.font = fontOf(cs);
    const hm = cx.measureText('H');
    const gm = cx.measureText(t[gi]);
    const base = gr.bottom - hm.fontBoundingBoxDescent;
    const dotMid = base - (gm.actualBoundingBoxAscent - gm.actualBoundingBoxDescent) / 2;
    let textNode = n, rg = rangeOfText(n, gi + 1);
    if (!rg) { textNode = nextText(n); rg = textNode ? rangeOfText(textNode) : null; }
    if (!rg) continue;
    judge(`glyph "${t[gi]}"`, pe, gr, dotMid, textNode, rg);
  }
  return results;
}

await runSweep({
  name: 'DOT-CENTRING',
  async measure(pg) {
    const res = await pg.evaluate(measureDots);
    // A list of twenty identical rows is one fault, not twenty.
    const groups = new Map();
    for (const d of res) {
      if (Math.abs(d.off) <= TOL) continue;
      const k = `${d.kind}|${d.host}|${Math.round(d.off * 2) / 2}`;
      const g = groups.get(k);
      if (g) g.n++; else groups.set(k, { ...d, n: 1 });
    }
    const failures = [...groups.values()].map((d) => ({
      what: `DOT ${d.off > 0 ? 'LOW' : 'HIGH'} by ${Math.abs(d.off).toFixed(2)}px  ${d.kind} in ${d.host}${d.n > 1 ? `  x${d.n}` : ''}`,
      detail: `beside "${d.text}": dot centre y ${d.dotMid}, text cap-band ink centre y ${d.inkMid} (tolerance ${TOL}px)`,
    }));
    return { elements: res.length, failures };
  },
});
