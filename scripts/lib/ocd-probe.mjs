// The OCD probe, shared by scripts/ocd-sweep.mjs and its break test.
//
// It lives here so the break test exercises the SAME code the sweep runs.
// A break test against a copy proves nothing about the thing that shipped,
// and six of these rules report zero on a real page - that zero is only
// worth anything once each rule has been shown to go red on a planted defect.
export const PROBE = () => {
  const out = [];
  const seen = new Set();
  const add = (kind, el, detail) => {
    const id = kind + '|' + (el ? el.tagName + (typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/)[0] : '') : '') + '|' + detail.slice(0, 40);
    if (seen.has(id)) return;
    seen.add(id);
    out.push({ kind, el: el ? (el.tagName + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/)[0] : '')) : '-',
      t: el ? (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 34) : '', detail });
  };
  // CLIPPED OUT OF EXISTENCE STILL COUNTS AS INVISIBLE.
  //
  // The first full sweep returned 402 COLLIDE findings and not one was real. A
  // collapsed CollapsibleSection is `height:0; overflow:hidden`, and its
  // children keep reporting their own geometry — every one of them stacked at
  // the same y inside a zero-height box, so they all "overlap" each other. The
  // Games tab was photographed with 60 collisions on it and has none.
  //
  // Only CLIPPING ancestors are considered, never the viewport: an element
  // outside the viewport is the OFFSCREEN finding, and filtering those here
  // would blind that rule instead.
  const clippedAway = (e) => {
    const r = e.getBoundingClientRect();
    for (let p = e.parentElement; p; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (!/hidden|clip|auto|scroll/.test(s.overflow + s.overflowY + s.overflowX)) continue;
      const pr = p.getBoundingClientRect();
      if (pr.height < 1 || pr.width < 1) return true;
      if (r.bottom <= pr.top + 0.5 || r.top >= pr.bottom - 0.5) return true;
      if (r.right <= pr.left + 0.5 || r.left >= pr.right - 0.5) return true;
    }
    return false;
  };
  const vis = (e) => {
    const s = getComputedStyle(e);
    if (s.visibility === 'hidden' || s.display === 'none' || s.opacity === '0') return false;
    const r = e.getBoundingClientRect();
    if (!(r.width > 0.5 && r.height > 0.5)) return false;
    return !clippedAway(e);
  };
  const all = [...document.querySelectorAll('body *')].filter(vis);
  const leaves = all.filter((e) => !e.children.length && (e.textContent || '').trim());
  const VW = document.documentElement.clientWidth;
  // DIRECTION IS PER-CONTAINER, NOT PER-DOCUMENT.
  //
  // The coach app sets dir on `.app-root`, not on <html> or <body>, so a
  // document-level check reads 'ltr' on a fully Hebrew page — and every
  // start/end measurement in RAGGED and EDGEFLIP was then computed against the
  // wrong edge in Hebrew. Caught because the findings said "hug the left
  // (start) edge" on RTL screens, where start is the right.
  // Each rule now asks the container it is looking at.
  const dirOf = (el) => (getComputedStyle(el).direction === 'rtl');
  const rtl = dirOf(document.querySelector('.app-root') || document.body);

  // SIDEWAYS
  if (document.documentElement.scrollWidth > VW + 1) {
    add('SIDEWAYS', document.documentElement, `page is ${document.documentElement.scrollWidth}px wide in a ${VW}px window`);
  }

  // CLIPPED — natural text width against the box that holds it.
  const ghost = document.createElement('div');
  ghost.style.cssText = 'position:fixed;left:-99999px;top:0;white-space:pre;width:max-content;visibility:hidden';
  document.body.appendChild(ghost);
  for (const e of leaves) {
    const s = getComputedStyle(e);
    if (!/hidden|clip/.test(s.overflow + s.overflowX)) continue;
    if (s.whiteSpace !== 'nowrap' && s.textOverflow !== 'ellipsis') continue;
    if (s.textOverflow === 'ellipsis') continue;              // an ellipsis is a choice, not a slice
    ghost.style.font = s.font; ghost.style.fontSize = s.fontSize; ghost.style.fontFamily = s.fontFamily;
    ghost.style.fontWeight = s.fontWeight; ghost.style.letterSpacing = s.letterSpacing;
    ghost.textContent = e.textContent || '';
    const natural = ghost.getBoundingClientRect().width;
    const over = natural - e.clientWidth;
    if (over > 1) add('CLIPPED', e, `needs ${natural.toFixed(0)}px, has ${e.clientWidth}px — over by ${over.toFixed(0)}`);
  }
  ghost.remove();

  // OFFSCREEN — but NOT inside a horizontal scroller.
  //
  // The first run reported 13 per screen and every one was a tab in the zone's
  // nav strip, which scrolls sideways on purpose: "Activity" is 464px past the
  // right edge because you swipe to it. A rule that cannot tell a scroller from
  // an overflow reports the design as the defect.
  const inScroller = (e) => {
    for (let p = e.parentElement; p; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (/auto|scroll/.test(s.overflowX) && p.scrollWidth > p.clientWidth + 1) return true;
    }
    return false;
  };
  for (const e of all) {
    const r = e.getBoundingClientRect();
    if (r.width > VW * 1.5) continue;                          // full-bleed wrappers are not the finding
    const outR = r.right - VW, outL = -r.left;
    if (outR <= 1.5 && outL <= 1.5) continue;
    if (inScroller(e)) continue;
    add('OFFSCREEN', e, `${outR > 1.5 ? `${outR.toFixed(0)}px past the right` : `${outL.toFixed(0)}px past the left`} edge`);
  }

  // TINYTAP — one finding per repeated control, not one per instance.
  //
  // The first run listed the zone's eight nav tabs separately, all 30px tall:
  // that is ONE decision to fix, not eight findings, and 21 lines of noise
  // buries the things that are actually wrong. Keyed by class + size, and the
  // bar is 32px - below that a thumb genuinely misses; 32-44 is tight but is a
  // choice the design makes all over and flagging it drowns everything else.
  const tapSeen = new Map();
  for (const e of all) {
    if (!/^(BUTTON|A)$/.test(e.tagName) && e.getAttribute('role') !== 'button') continue;
    if (!(e.textContent || '').trim() && !e.querySelector('svg,img')) continue;
    const r = e.getBoundingClientRect();
    if (r.height >= 32 && r.width >= 32) continue;
    const key = (typeof e.className === 'string' ? e.className.trim() : '') + '|' + Math.round(r.width) + 'x' + Math.round(r.height);
    tapSeen.set(key, (tapSeen.get(key) || 0) + 1);
    if (tapSeen.get(key) > 1) continue;
    add('TINYTAP', e, `${r.width.toFixed(0)}x${r.height.toFixed(0)}`);
  }

  // COLLIDE — and the two must actually be on top of each other ON SCREEN.
  //
  // Overlapping rectangles are not overlapping text. With a modal open the page
  // behind it is still rendered and still has geometry, so every label in the
  // dialog "overlapped" a label on the page underneath: 57 findings on one
  // modal, none of them visible. Two boxes only collide if, at the point where
  // they cross, one of them is what the user would actually touch.
  // THE INK, NOT THE BOX.
  //
  // The last surviving collision was a task title's line box overlapping a
  // chip's border box by 10px, on a screen where the two are plainly one above
  // the other. A line box carries half-leading above and below the glyphs and a
  // chip's box starts above its border, so two elements that do not touch can
  // still report ten pixels of overlap. Inset each rect by its own half-leading
  // and compare what is actually painted — the rule Ohad already made me learn
  // once for centring complaints.
  const inkBox = (el) => {
    const cs = getComputedStyle(el);
    const fs = parseFloat(cs.fontSize) || 12;
    // The TEXT's own line boxes, not the element box: that drops a chip's
    // padding and border, which is most of what made two stacked things look
    // like they overlapped. `line-height: normal` parses to NaN, which is why
    // the first attempt at this silently fell back to the raw box and changed
    // nothing — so the half-leading comes from each line rect's own height.
    let rects;
    try { const rg = document.createRange(); rg.selectNodeContents(el); rects = [...rg.getClientRects()]; }
    catch { return el.getBoundingClientRect(); }
    rects = rects.filter((x) => x.width > 0.5 && x.height > 0.5);
    if (!rects.length) return null;
    let top = Infinity, bottom = -Infinity, left = Infinity, right = -Infinity;
    for (const x of rects) {
      const pad = Math.max(0, (x.height - fs) / 2);
      top = Math.min(top, x.top + pad);
      bottom = Math.max(bottom, x.bottom - pad);
      left = Math.min(left, x.left);
      right = Math.max(right, x.right);
    }
    if (!(bottom > top) || !(right > left)) return null;
    return { top, bottom, left, right, width: right - left, height: bottom - top };
  };
  const topmostAt = (x, y) => { try { return document.elementFromPoint(x, y); } catch { return null; } };
  // WHICH LAYER IS THIS ELEMENT PAINTED IN?
  //
  // elementFromPoint alone was not enough: with a modal open, the topmost thing
  // at the overlap IS one of the two (the dialog's own label), so the pair
  // still passed and 26 phantom collisions survived. Two elements can only
  // collide if they are painted in the SAME layer — the nearest positioned
  // ancestor that creates a stacking context. A dialog and the page behind it
  // never are.
  const layerOf = (e) => {
    for (let p = e.parentElement; p; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (s.position === 'fixed' || s.position === 'sticky') return p;
      if (s.position !== 'static' && s.zIndex !== 'auto') return p;
      if (s.transform !== 'none' || s.filter !== 'none' || s.willChange === 'transform') return p;
    }
    return document.body;
  };
  for (let i = 0; i < leaves.length; i++) {
    for (let j = i + 1; j < leaves.length; j++) {
      if (leaves[i].contains(leaves[j]) || leaves[j].contains(leaves[i])) continue;
      const a = inkBox(leaves[i]), c = inkBox(leaves[j]);
      if (!a || !c) continue;
      const h = Math.min(a.right, c.right) - Math.max(a.left, c.left);
      const v = Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top);
      if (h <= 2 || v <= 2) continue;
      const cx = (Math.max(a.left, c.left) + Math.min(a.right, c.right)) / 2;
      const cy = (Math.max(a.top, c.top) + Math.min(a.bottom, c.bottom)) / 2;
      if (cx < 0 || cy < 0 || cx > VW) continue;              // off screen, not a collision
      const top = topmostAt(cx, cy);
      if (!top) continue;
      if (layerOf(leaves[i]) !== layerOf(leaves[j])) continue;  // different layers, e.g. a modal over the page
      const hitsOne = leaves[i].contains(top) || top.contains(leaves[i])
        || leaves[j].contains(top) || top.contains(leaves[j]);
      if (!hitsOne) continue;                                  // something else is over both
      add('COLLIDE', leaves[i], `overlaps "${(leaves[j].textContent || '').trim().slice(0, 18)}" by ${v.toFixed(0)}px`);
    }
  }

  // RAGGED — sibling blocks starting at different insets from their parent.
  for (const p of all) {
    const kids = [...p.children].filter((k) => vis(k) && (k.textContent || '').trim());
    if (kids.length < 3) continue;
    const pr = p.getBoundingClientRect();
    if (pr.width < 120) continue;
    const ps = getComputedStyle(p);
    if (ps.display !== 'block' && ps.display !== 'flex') continue;
    if (ps.display === 'flex' && ps.flexDirection !== 'column') continue;
    // CENTRED IS NOT RAGGED.
    //
    // A centred stack has every row at a different inset BY DEFINITION - that
    // is what centring is - so this rule flagged the whole athlete card, whose
    // body is centred on purpose. "Fixing" that would have been another blanket
    // change of the kind he already rejected once today. A group is ragged only
    // if it is trying to line up and failing, so: if the rows are centred
    // within the container (their start and end insets mirror each other),
    // leave them alone.
    const centred = kids.every((k) => {
      const r = k.getBoundingClientRect();
      const s1 = r.left - pr.left, s2 = pr.right - r.right;
      return Math.abs(s1 - s2) <= 2;
    });
    if (centred) continue;
    const pRtl = dirOf(p);
    const ins = kids.map((k) => { const r = k.getBoundingClientRect(); return pRtl ? pr.right - r.right : r.left - pr.left; });
    const lo = Math.min(...ins), hi = Math.max(...ins);
    if (hi - lo > 6) add('RAGGED', p, `${kids.length} rows start between ${lo.toFixed(0)} and ${hi.toFixed(0)}px in — spread ${(hi - lo).toFixed(0)}px`);
  }

  // UNEVEN — CONTROLS on one line at different heights.
  //
  // Narrowed after triage. The first version flagged any flex row whose
  // children differed in height, which is not a defect: a row legitimately
  // holds a 21px name beside a 28px status chip, and what matters there is
  // whether they are ALIGNED, not whether they match. 64 findings, none of
  // them wrong on screen.
  //
  // Two buttons or chips side by side at different heights IS sloppy, and it
  // is a rule Ohad has already stated for himself ("changing labels reserve
  // widest-label width; resize = flash bug"). So: interactive siblings only.
  const isControl = (e) => /^(BUTTON|A|SELECT|INPUT)$/.test(e.tagName)
    || e.getAttribute('role') === 'button'
    || /chip|btn|button|tag|pill/i.test(typeof e.className === 'string' ? e.className : '');
  for (const p of all) {
    const ps = getComputedStyle(p);
    if (ps.display !== 'flex' || ps.flexDirection === 'column') continue;
    const kids = [...p.children].filter((k) => vis(k) && (k.textContent || '').trim() && isControl(k));
    if (kids.length < 2) continue;
    const rs = kids.map((k) => k.getBoundingClientRect());
    const sameRow = rs.every((r) => Math.abs(r.top - rs[0].top) < 4);
    if (!sameRow) continue;
    const hs = rs.map((r) => r.height);
    const lo = Math.min(...hs), hi = Math.max(...hs);
    if (hi - lo > 3 && lo > 12) add('UNEVEN', p, `${kids.length} control(s) on one row, heights ${lo.toFixed(0)}–${hi.toFixed(0)}`);
  }

  // ORPHAN — a TILE grid whose last row is short.
  //
  // Only grids whose tracks are all the same width, which is what a
  // repeat(auto-fit, minmax(...)) tile grid resolves to. The first run flagged
  // the roster's data rows, whose columns are deliberately unequal (a 28px
  // jersey against a 1.5fr name) and which wrap on a phone by design.
  for (const p of all) {
    const ps = getComputedStyle(p);
    if (ps.display !== 'grid') continue;
    const tracks = ps.gridTemplateColumns.split(' ').filter(Boolean).map(parseFloat);
    if (tracks.length < 3 || tracks.some((n) => !Number.isFinite(n))) continue;
    if (Math.max(...tracks) - Math.min(...tracks) > 2) continue;   // not a tile grid
    const cols = tracks.length;
    const kids = [...p.children].filter(vis);
    if (kids.length <= cols) continue;
    const rem = kids.length % cols;
    if (rem !== 0) add('ORPHAN', p, `${kids.length} tiles in ${cols} equal columns — last row holds ${rem}`);
  }

  // EDGEFLIP — a text block whose ink hugs the wrong edge for the direction.
  for (const p of all) {
    const kids = [...p.children].filter((k) => vis(k) && (k.textContent || '').trim());
    if (kids.length < 2) continue;
    const pr = p.getBoundingClientRect();
    if (pr.width < 100) continue;
    // A STACK, NOT A ROW OR A GRID.
    //
    // EDGEFLIP asks "is one item on the opposite edge from its siblings", and
    // that question only means anything when the siblings are stacked one above
    // another. In a multi-column grid the children sit at different insets
    // BECAUSE they are in different columns — the medical board's four count
    // tiles were reported this way. So: every child must occupy its own row.
    const rects = kids.map((k) => k.getBoundingClientRect());
    let stacked = true;
    for (let a2 = 0; a2 < rects.length && stacked; a2++) {
      for (let b2 = a2 + 1; b2 < rects.length; b2++) {
        const ov = Math.min(rects[a2].bottom, rects[b2].bottom) - Math.max(rects[a2].top, rects[b2].top);
        if (ov > Math.min(rects[a2].height, rects[b2].height) * 0.5) { stacked = false; break; }
      }
    }
    if (!stacked) continue;
    const pRtl = dirOf(p);
    const startGap = (r) => (pRtl ? pr.right - r.right : r.left - pr.left);
    const endGap = (r) => (pRtl ? r.left - pr.left : pr.right - r.right);
    let atStart = 0, atEnd = 0, flipped = null;
    for (const k of kids) {
      const r = k.getBoundingClientRect();
      if (r.width > pr.width * 0.92) continue;                  // full-width rows tell us nothing
      if (startGap(r) < 4) atStart++;
      else if (endGap(r) < 4) { atEnd++; flipped = k; }
    }
    if (atStart >= 2 && atEnd >= 1 && flipped) {
      add('EDGEFLIP', flipped, `${atStart} sibling(s) hug the ${pRtl ? 'right' : 'left'} (start) edge, this one hugs the other`);
    }
  }

  return { findings: out, vw: VW, chars: (document.body.innerText || '').replace(/\s+/g, ' ').trim().length, rtl };
};
