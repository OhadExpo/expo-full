// HOW WIDE A LABEL NEEDS ITS BOX (14.10 #751, Ohad: "8 is bad" - names broke one word a line in narrow columns).
// The narrowest width at which each text wraps into few enough lines - one or two words a line, never one:
//   1-2 words  -> its longest word (two words may take two lines)
//   3-4 words  -> 2 lines;  5+ words -> words / 1.35 lines (the overflow gate's ONEWORD line: 3+ lines under 1.35 a line)
// MEASURED through a canvas in the box's own font (a character count missed Nord's capitals by 2px). `ls` = the
// letter-spacing in px per character (Hebrew pages add 0.02em to everything - themes.css body[data-lang=he]).
// Returns the largest need over `texts`, in px; a long unbroken token claims at most `tokenMax` (it breaks inside
// itself at any width).
let _ctx = null;
function ctx() {
  if (_ctx !== null) return _ctx;
  try { _ctx = document.createElement('canvas').getContext('2d') || false; } catch { _ctx = false; }
  return _ctx;
}

export function wrapNeed(texts, { font, ls = 0, perChar = 7.7, tokenMax = 100 } = {}) {
  const c = ctx(); if (c) c.font = font;
  const wid = (t) => (c ? c.measureText(t).width + ls * t.length : t.length * perChar);
  const one = (text) => {
    const w = String(text || '').split(/\s+/).filter(Boolean);
    if (!w.length) return 0;
    if (w.length < 3) return Math.min(tokenMax, Math.max(...w.map(wid)));
    const lines = Math.max(2, Math.floor(w.length / 1.35));
    // the browser breaks greedily: the narrowest width whose greedy wrap needs `lines` lines or fewer
    const fits = (W) => { let n = 1, cur = ''; for (const x of w) { const t = cur ? cur + ' ' + x : x; if (wid(t) <= W) cur = t; else { n++; cur = x; } } return n <= lines; };
    let lo = Math.max(...w.map(wid)), hi = wid(w.join(' '));
    if (fits(lo)) return lo;
    for (let it = 0; it < 14; it++) { const mid = (lo + hi) / 2; if (fits(mid)) hi = mid; else lo = mid; }
    return hi;
  };
  let m = 0; for (const t of texts || []) m = Math.max(m, one(t));
  return m;
}
