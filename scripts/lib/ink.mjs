// MEASURE THE INK, NOT THE BOX — the shared browser-side measurer.
//
// Ohad has reported the same class of fault a dozen times ("the tag is still
// not aligned", "the logo isn't the same vertical height", "ocd perfectly
// vertically center aligned to the boxes, the texts, borders, icons, logos,
// and to each other"). Every time, a rect-based check read clean, because
// `align-items:center` lines up BORDER BOXES perfectly while the things the eye
// actually sees sit somewhere else inside them:
//
//   text   glyphs ride high in their line box (no descenders in caps), and in a
//          flex row the line box is centred by the container — so measuring
//          from the padding edge is wrong by ~9px, not by a rounding error.
//   image  a wordmark with a caret above it has a bounding box 2-3px higher
//          than its letters; a crest is centred by its whole shape. Telling
//          those apart is the difference between a real finding and a false one.
//   svg    the artwork inside a 24x24 viewBox is usually not centred in it.
//
// This module is the one implementation of that measurement, injected into the
// page by every sweep that needs it, so no two gates can disagree about what
// "centred" means.
export const INK_FN = `
(() => {
  const cv = document.createElement('canvas');
  const cx = cv.getContext('2d');

  // The LINE BOX from a Range over the text node — it respects flex centring.
  const inkText = (el) => {
    const node = [...el.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim());
    if (!node) return null;
    const txt = node.textContent.trim();
    if (!txt) return null;
    const rg = document.createRange();
    rg.selectNodeContents(node);
    const lb = rg.getBoundingClientRect();
    if (!(lb.height > 0 && lb.width > 0)) return null;
    const cs = getComputedStyle(el);
    cx.font = cs.fontStyle + ' ' + cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
    cx.textBaseline = 'alphabetic';
    const m = cx.measureText(txt);
    const contentH = m.fontBoundingBoxAscent + m.fontBoundingBoxDescent;
    const baseline = lb.y + (lb.height - contentH) / 2 + m.fontBoundingBoxAscent;
    const t = baseline - m.actualBoundingBoxAscent;
    const b = baseline + m.actualBoundingBoxDescent;
    if (!(b > t)) return null;
    return { mid: (t + b) / 2, top: t, bot: b, kind: 'text', what: txt.slice(0, 20) };
  };

  // Opaque pixels. A SOLID mark (a crest) is centred by its whole shape; a
  // WORDMARK with a detached accent is centred by its letters. The dense band's
  // share of the full ink height tells them apart.
  const inkImage = (el) => {
    const b = el.getBoundingClientRect();
    if (!(b.width > 0 && b.height > 0)) return null;
    try {
      const w = Math.min(120, Math.max(8, Math.round(b.width)));
      const h = Math.min(120, Math.max(8, Math.round(b.height)));
      cv.width = w; cv.height = h;
      cx.clearRect(0, 0, w, h);
      cx.drawImage(el, 0, 0, w, h);
      const d = cx.getImageData(0, 0, w, h).data;
      const cover = [];
      for (let y = 0; y < h; y++) {
        let n = 0;
        for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 24) n++;
        cover.push(n);
      }
      const peak = Math.max(...cover);
      if (!peak) return null;
      let ft = -1, fb = -1, dt = -1, db = -1;
      for (let y = 0; y < h; y++) {
        if (cover[y] > 0) { if (ft < 0) ft = y; fb = y; }
        if (cover[y] >= peak * 0.25) { if (dt < 0) dt = y; db = y; }
      }
      if (ft < 0) return null;
      const solid = (db - dt + 1) >= (fb - ft + 1) * 0.7;
      const top = solid ? ft : dt;
      const bot = solid ? fb : db;
      const scale = b.height / h;
      const t = b.y + top * scale, bt = b.y + (bot + 1) * scale;
      return { mid: (t + bt) / 2, top: t, bot: bt, kind: 'image', what: (el.getAttribute('alt') || el.src || '').split('/').pop().slice(0, 20) };
    } catch { return null; }
  };

  const inkSvg = (el) => {
    try {
      const bb = el.getBBox();
      const m = el.getScreenCTM();
      if (!m || !(bb.height > 0)) return null;
      const t = m.f + bb.y * m.d, b = m.f + (bb.y + bb.height) * m.d;
      return { mid: (t + b) / 2, top: t, bot: b, kind: 'svg', what: 'icon' };
    } catch { return null; }
  };

  // A BORDERED control is a thing the eye sees in its own right — a tag, a
  // pill, an input. Its BOX is ink too, and Ohad names it separately ("the
  // boxes, the texts, borders, icons, logos, and to each other").
  const inkBox = (el) => {
    const cs = getComputedStyle(el);
    const bt = parseFloat(cs.borderTopWidth) || 0;
    const bb = parseFloat(cs.borderBottomWidth) || 0;
    const painted = (bt > 0 && bb > 0) || (cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent');
    if (!painted) return null;
    const r = el.getBoundingClientRect();
    if (!(r.height > 6 && r.width > 6)) return null;
    return { mid: r.y + r.height / 2, top: r.y, bot: r.bottom, kind: 'box', what: (el.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 20) || el.tagName.toLowerCase() };
  };

  window.__ink = (el) => {
    const tag = el.tagName.toLowerCase();
    if (tag === 'img') return inkImage(el);
    if (tag === 'svg') return inkSvg(el);
    if (!el.children.length) return inkText(el) || inkBox(el);
    return inkBox(el);
  };
  return true;
})()
`;
