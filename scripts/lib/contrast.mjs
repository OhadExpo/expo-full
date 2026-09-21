// contrast.mjs — the one implementation of "can this text be read".
//
// It grew inside light-dark-parity.mjs, where every one of its exclusions was
// paid for by a false positive that buried a real one: color-mix() grounds
// reported as color(srgb …) rather than rgb(); a gradient background that a
// naive walk fell straight through to document.body; and two pairings that are
// RULED-ON DECISIONS of Ohad's rather than defects (white on brand cyan, and
// the muted grey on the near-black ground).
//
// Copying that into a second gate would mean copying the history too, and the
// two copies would drift the first time one of them learned something. So it
// lives here, injected into the page by whoever needs it — the theme parity
// sweep, and the marketing site, which had never been checked at all.
export const CONTRAST_FN = `
(() => {
  // Chrome reports color-mix()/modern colours as \`color(srgb r g b / a)\` with
  // 0..1 components, NOT rgb(). Parsing only rgb() walked straight past the
  // BHBC deep-navy strip headers to the white card behind them and reported
  // white-on-white — eight false positives per route. Parse both.
  const parse = (c) => {
    const str = String(c || '');
    let m = str.match(/rgba?\\(([^)]+)\\)/);
    if (m) {
      const p = m[1].split(/[,\\s/]+/).filter(Boolean).map(parseFloat);
      return { r: p[0], g: p[1], b: p[2], a: p[3] === undefined ? 1 : p[3] };
    }
    m = str.match(/color\\(srgb\\s+([^)]+)\\)/);
    if (m) {
      const p = m[1].split(/[\\s/]+/).filter(Boolean).map(parseFloat);
      return { r: p[0] * 255, g: p[1] * 255, b: p[2] * 255, a: p[3] === undefined ? 1 : p[3] };
    }
    return null;
  };
  const lum = (c) => {
    const p = parse(c); if (!p) return null;
    if (p.a < 0.35) return null;                              // near-transparent text is decorative
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(p.r) + 0.7152 * f(p.g) + 0.0722 * f(p.b);
  };
  // A GRADIENT IS A BACKGROUND TOO. This walked past background-IMAGE and fell
  // through to document.body, so the BHBC door - which paints its own white
  // gradient and is deliberately light in both themes - was reported as navy
  // #14294F on black at ratio 1.46 in dark mode. Measured on the real page:
  // the text sits on linear-gradient(#FFFFFF, #F3F5F9), about 13:1. The element
  // was fine; the gate was reading the wrong surface, and a gate that cries
  // wolf gets ignored.
  const bgOf = (el) => {
    let n = el;
    while (n && n !== document.documentElement) {
      const cs = getComputedStyle(n);
      const c = cs.backgroundColor;
      const p = parse(c);
      if (p && p.a > 0.5) return c;
      // Approximate a gradient by its first colour stop - far closer to what
      // is actually painted than the body colour underneath it.
      if (cs.backgroundImage && cs.backgroundImage !== 'none') {
        const stop = cs.backgroundImage.match(/rgba?\\([^)]+\\)/);
        if (stop) return stop[0];
      }
      n = n.parentElement;
    }
    return getComputedStyle(document.body).backgroundColor;
  };
  const bad = [];
  for (const el of document.body.querySelectorAll('div,span,button,a,td,th,label,h1,h2,h3')) {
    if (el.children.length) continue;
    const t = (el.textContent || '').trim();
    if (!t || t.length > 60) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.opacity === '0') continue;
    const lf = lum(cs.color), lb = lum(bgOf(el));
    if (lf == null || lb == null) continue;
    const ratio = (Math.max(lf, lb) + 0.05) / (Math.min(lf, lb) + 0.05);
    // Two pairings are RULED-ON DECISIONS, not defects, and reporting them
    // every run buried the ones that were:
    //   white on brand cyan #39BDFF (2.12) - the active nav pill and primary
    //     CTAs. Ohad: the cyan stays bright, the brand wins; a contrast-led
    //     palette was proposed once and rejected outright.
    //   muted grey #444450 on the near-black ground (2.06) - dark-mode
    //     secondary text, same ruling.
    // Anything else under 2.2 is a real finding and still reported. The BHBC
    // amber that this exclusion let surface was exactly that: a token with a
    // light-mode value that the medical labels were simply not using.
    const fg = (cs.color || '').replace(/\\s/g, '');
    const bgRaw = bgOf(el) || '';
    const bgc = bgRaw.replace(/\\s/g, '');
    // Match the PAIRING, not one exact ground: the same muted grey sits on the
    // near-black card, the black page and the demo stage, and pinning exact
    // triples just moved the noise around.
    const bgLum = (() => { const m = bgRaw.match(/[\\d.]+/g); if (!m || m.length < 3) return 255; /* Chrome reports some grounds as color(srgb 0.05 0.09 0.12) - 0..1, not 0..255. */ const v = m.slice(0, 3).map(Number).map((x) => (x <= 1 ? x * 255 : x)); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; })();
    const ruledOn = (/^rgba?\\(255,255,255/.test(fg) && bgc === 'rgb(57,189,255)')
      || (fg === 'rgb(68,68,80)' && bgLum < 40);
    // THE BAR IS A PARAMETER NOW.
    //
    // 2.2 is the "can a human see this at all" line and it is the right default
    // for the regression gates — it only fires on something genuinely broken.
    // But his checklist asks to CHECK contrast, and the standard is WCAG AA:
    // 4.5:1 for body text, 3:1 for large text (>=24px, or >=18.66px bold).
    // Pass MIN=aa to measure against that instead. Reporting is not the same as
    // changing the palette, which is his call and has been ruled on already.
    const big = parseFloat(cs.fontSize) >= 24
      || (parseFloat(cs.fontSize) >= 18.66 && (parseInt(cs.fontWeight, 10) || 400) >= 700);
    const bar = (typeof window !== 'undefined' && window.__CONTRAST_MIN === 'aa') ? (big ? 3 : 4.5) : 2.2;
    if (ratio < bar && !ruledOn) bad.push({ text: t.slice(0, 40), ratio: Math.round(ratio * 100) / 100, color: cs.color, bg: bgOf(el), need: bar, big });
  }
  return bad.slice(0, 8);
})()
`;
