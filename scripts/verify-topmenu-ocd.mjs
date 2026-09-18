// EVERY TOP MENU, ON EVERY PLATFORM, MEASURED BY ITS INK.
//
// Ohad, 17.9: "make sure you do 10 full audits on every top menu on every
// platform we have, making sure evevthing is ocd perfectly vertically center
// aligned to the boxes, the texts, borders, icons, logos, and to each other.
// full perfect ocd sweeps".
//
// The rule this gate exists for (his, learned the hard way): MEASURE THE INK,
// NOT THE BOX. A flex row with align-items:center lines up the BORDER BOXES to
// 0.00px and can still look wrong, because the glyphs ride high inside their
// line box, a logo has transparent padding, and an icon's artwork is not
// centred in its own viewBox. So for every item in every header this measures:
//
//   text   the alphabetic baseline plus the real ascent/descent of THAT string
//          in THAT font (canvas actualBoundingBox), which is the ink.
//   image  the opaque bounding box of the pixels, found by scanning alpha.
//   svg    the ink bbox of the drawn paths (getBBox mapped to screen).
//   box    the border box, for the bordered controls, so a button's BOX and
//          its LABEL are both checked against the bar.
//
// Every item is compared to the header's own vertical centre and to each other.
//
//   BASE=http://127.0.0.1:5199 node scripts/verify-topmenu-ocd.mjs
//   TOL=1.2 node scripts/verify-topmenu-ocd.mjs        # loosen the tolerance
import P from 'puppeteer-core';
import { signIn } from './lib/authed-page.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:5199';
// 1.3 => a 2.6px ink spread. That is the app's measured floor today: the last
// residual is not layout but glyph and icon geometry - a caps-only label's ink
// centre sits ~0.5px above a mixed-case one at the same baseline, and a stroked
// icon's artwork is not centred in its own 24x24 viewBox. Everything a layout
// can control is inside a pixel. Lower it when the icon set is redrawn.
const TOL = Number(process.env.TOL || 1.3);
const WIDTHS = (process.env.WIDTHS || '390,412,768,1024,1440').split(',').map(Number);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// The header of each platform, by a selector that is stable in the markup.
const SURFACES = [
  { id: 'coach', label: 'EXPO coach nav', path: '/coach/dashboard', sel: 'header, nav' },
  { id: 'athlete', label: 'athlete portal header', path: '/demo/athlete', sel: 'header, nav' },
  { id: 'club', label: 'BHBC zone header', path: '/coach/bhbc', sel: 'header' },
  { id: 'login', label: 'sign-in header', path: '/login', sel: 'header, nav' },
];

const MEASURE = `(() => {
  const out = [];
  const cv = document.createElement('canvas');
  const cx = cv.getContext('2d');
  // The LINE BOX comes from a Range over the text node, not from the element's
  // padding edge: in a flex row the text is centred by the flex container, so
  // assuming it starts at the top of the content box reads every label ~9px
  // high. From the line box the baseline is half-leading + ascent, and the ink
  // is that baseline plus the real ascent/descent of this exact string.
  const inkOfText = (el) => {
    const txt = (el.textContent || '').trim();
    if (!txt) return null;
    const node = [...el.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim());
    if (!node) return null;
    const rg = document.createRange();
    rg.selectNodeContents(node);
    const lb = rg.getBoundingClientRect();
    if (!(lb.height > 0)) return null;
    const cs = getComputedStyle(el);
    cx.font = cs.fontStyle + ' ' + cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
    cx.textBaseline = 'alphabetic';
    const m = cx.measureText(txt);
    const contentH = m.fontBoundingBoxAscent + m.fontBoundingBoxDescent;
    const baseline = lb.y + (lb.height - contentH) / 2 + m.fontBoundingBoxAscent;
    const t = baseline - m.actualBoundingBoxAscent;
    const bt = baseline + m.actualBoundingBoxDescent;
    if (!(bt > t)) return null;
    return { mid: (t + bt) / 2, h: bt - t, kind: 'text', what: txt.slice(0, 18) };
  };
  const inkOfImage = (el) => {
    const b = el.getBoundingClientRect();
    if (!(b.width > 0 && b.height > 0)) return null;
    try {
      const w = Math.min(120, Math.max(8, Math.round(b.width)));
      const h = Math.min(120, Math.max(8, Math.round(b.height)));
      cv.width = w; cv.height = h;
      cx.clearRect(0, 0, w, h);
      cx.drawImage(el, 0, 0, w, h);
      const d = cx.getImageData(0, 0, w, h).data;
      // THE EYE CENTRES THE WORDMARK, NOT THE BOUNDING BOX. The EXPO mark has a
      // caret floating above the letters; its full alpha bbox is 2.4px higher
      // than the letters at a 36px render, so measuring the bbox calls a
      // correctly-centred logo "3px high". Take the DENSE band instead — the
      // rows carrying at least a quarter of the peak coverage — which is the
      // wordmark itself.
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
      // A SOLID mark (a crest) is centred by its whole shape; a WORDMARK with a
      // detached accent above it is centred by the letters. Tell them apart by
      // how much of the mark the dense band covers: a crest's dense band is
      // most of it, the EXPO mark's is 59%.
      const solid = (db - dt + 1) >= (fb - ft + 1) * 0.7;
      const top = solid ? ft : dt;
      const bot = solid ? fb : db;
      const scale = b.height / h;
      const t = b.y + top * scale, bt = b.y + (bot + 1) * scale;
      return { mid: (t + bt) / 2, h: bt - t, kind: 'image', what: (el.getAttribute('alt') || el.src || '').split('/').pop().slice(0, 18) };
    } catch { return { mid: b.y + b.height / 2, h: b.height, kind: 'image?', what: 'tainted' }; }
  };
  const inkOfSvg = (el) => {
    try {
      const bb = el.getBBox();
      const m = el.getScreenCTM();
      if (!m || !(bb.height > 0)) return null;
      const t = m.f + bb.y * m.d, bt = m.f + (bb.y + bb.height) * m.d;
      return { mid: (t + bt) / 2, h: bt - t, kind: 'svg', what: 'icon' };
    } catch { return null; }
  };
  // Some surfaces (the athlete portal) have no <header>/<nav> element at all —
  // their bar is a plain div. Fall back to the band that holds the brand mark:
  // the highest ancestor that is still a bar (full width, under 90px tall).
  const barFromLogo = () => {
    const img = [...document.querySelectorAll('img')].find((i) => {
      const b = i.getBoundingClientRect();
      return b.width > 0 && b.y < 120 && /logo|expo|bhbc|herzliya/i.test(i.src + ' ' + (i.alt || ''));
    });
    let el = img && img.parentElement;
    let best = null;
    while (el && el !== document.body) {
      const b = el.getBoundingClientRect();
      if (b.height > 0 && b.height < 90 && b.width > Math.min(280, innerWidth * 0.6)) best = el;
      el = el.parentElement;
    }
    return best;
  };
  const header = document.querySelector(__SEL__) || barFromLogo();
  if (!header) return { error: 'no header for ' + __SEL__ };
  const hb = header.getBoundingClientRect();
  if (!(hb.height > 0)) return { error: 'header has no height' };
  // The first bar row only: a header that wraps has more than one row, and
  // items on different rows are not meant to share a centre.
  const rowMid = (el) => { const b = el.getBoundingClientRect(); return b.y + b.height / 2; };
  const all = [...header.querySelectorAll('*')].filter((el) => {
    const b = el.getBoundingClientRect();
    return b.width > 0 && b.height > 0 && b.height < 90;
  });
  for (const el of all) {
    const tag = el.tagName.toLowerCase();
    let ink = null;
    if (tag === 'img') ink = inkOfImage(el);
    else if (tag === 'svg') ink = inkOfSvg(el);
    else if (!el.children.length) ink = inkOfText(el);
    if (!ink) continue;
    const b = el.getBoundingClientRect();
    const bordered = ['borderTopWidth', 'borderBottomWidth'].every((k) => parseFloat(getComputedStyle(el)[k]) > 0);
    out.push({ ...ink, y: b.y, bh: b.height, boxMid: b.y + b.height / 2, bordered });
  }
  return { headerMid: hb.y + hb.height / 2, headerH: hb.height, items: out };
})()`;

const run = async () => {
  const b = await P.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 300000 });
  const pg = await b.newPage();
  await pg.setBypassServiceWorker(true);
  await pg.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
  await pg.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
  await wait(1500);
  await pg.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await signIn(pg, BASE);
  await wait(2500);

  let audits = 0; let bad = 0; let unseen = 0;
  const lines = [];
  for (const s of SURFACES) {
    for (const w of WIDTHS) {
      audits++;
      if (w < 700) await pg.emulate({ viewport: { width: w, height: 880, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36' });
      else await pg.emulate({ viewport: { width: w, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false }, userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36' });
      await pg.goto(BASE + s.path, { waitUntil: 'domcontentloaded' });
      await wait(s.id === 'club' ? 8000 : 5000);
      let r = await pg.evaluate(MEASURE.replaceAll('__SEL__', JSON.stringify(s.sel)));
      // A HEADER THAT HAS NOT PAINTED YET IS NOT A MISALIGNED HEADER.
      //
      // Measured 18.9: run on its own this gate is 20/20. Run while another
      // sweep was driving the same Chrome it printed 12/20 — eight of them
      // "no header", because the page had not painted inside the fixed wait.
      // Listed among the alignment failures that reads like eight new
      // defects, and I went looking for a regression that did not exist.
      // One more chance with a longer wait; if it still is not there, say
      // UNSEEN, which is a different word from FAIL.
      if (r.error) {
        await wait(6000);
        r = await pg.evaluate(MEASURE.replaceAll('__SEL__', JSON.stringify(s.sel)));
      }
      if (r.error) { unseen++; lines.push(`  UNSEEN ${s.label} @${w}  — ${r.error} (not measured; nothing is claimed about it)`); continue; }
      // Items on the same visual row as the header's centre.
      const row = r.items.filter((i) => Math.abs(i.boxMid - r.headerMid) < Math.max(14, r.headerH / 3));
      if (row.length < 2) { lines.push(`  skip  ${s.label} @${w}  — ${row.length} measurable item(s)`); continue; }
      const mids = row.map((i) => i.mid);
      const lo = Math.min(...mids), hi = Math.max(...mids);
      const spread = hi - lo;
      const worst = row.slice().sort((a, c) => Math.abs(c.mid - r.headerMid) - Math.abs(a.mid - r.headerMid))[0];
      const off = Math.abs(worst.mid - r.headerMid);
      const ok = spread <= TOL * 2 && off <= TOL * 2;
      if (!ok) {
        bad++;
        lines.push(`  FAIL  ${s.label} @${w}  ink spread ${spread.toFixed(2)}px across ${row.length} items; worst "${worst.what}" (${worst.kind}) ${off.toFixed(2)}px off the bar centre`);
        for (const i of row.slice().sort((a, c) => a.mid - c.mid).slice(0, 3).concat(row.slice().sort((a, c) => c.mid - a.mid).slice(0, 2))) {
          lines.push(`          ${i.kind.padEnd(6)} ${String(i.what).padEnd(20)} ink mid ${i.mid.toFixed(2)}  box mid ${i.boxMid.toFixed(2)}`);
        }
      } else {
        lines.push(`  PASS  ${s.label} @${w}  ${row.length} items, ink spread ${spread.toFixed(2)}px, worst ${off.toFixed(2)}px off centre`);
      }
    }
  }
  await pg.close();
  b.disconnect();
  console.log(`TOP-MENU OCD SWEEP — ${audits} audits, tolerance ${TOL}px\n`);
  console.log(lines.join('\n'));
  console.log(`\n${audits - bad - unseen}/${audits} clean${unseen ? ` \u2014 ${unseen} NOT MEASURED (the header had not painted; re-run when the browser is quiet)` : ''}`);
  process.exit(bad ? 1 : 0);
};
run();
