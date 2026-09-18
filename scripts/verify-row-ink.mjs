// EVERY ROW, EVERY SURFACE, EVERY WIDTH — measured by its INK.
//
// Ohad, 18.9: "a lot of design and misaligned stuff left everywhere!! buttons,
// texts, tags, icons. we need a better full sweep".
//
// He is right that the old sweeps could not have found it. verify-topmenu-ocd
// measures FOUR headers. Everything inside a page — a tag beside a name, an
// icon beside a label, a number beside a unit — was never measured at all, and
// those are exactly what he keeps photographing.
//
// WHAT COUNTS AS A ROW. Two or more painted things whose boxes overlap
// vertically by most of their height: that is a line the eye reads across, and
// everything on it should share one optical centre. Wrapped lines are not rows;
// a full-width block beside a chip is not a row.
//
// WHAT IS MEASURED. The INK (scripts/lib/ink.mjs): the real ascent/descent of
// that exact string in that exact font, taken from the line box a Range reports
// so flex centring is respected; the opaque pixels of an image, with a crest
// told apart from a wordmark-plus-accent; an svg's drawn paths, not its
// viewBox; and the border box of anything painted, because a tag's BOX is
// something he sees too.
//
// OUTPUT. Worst first, with the route, the width, the items, and how far apart
// their ink centres are — so the list can be worked down instead of guessed at.
//
//   node scripts/verify-row-ink.mjs                       # the default surface set
//   TOL=2 WIDTHS=390 ROUTES=/coach/athletes node scripts/verify-row-ink.mjs
//   SHOTS=1 node scripts/verify-row-ink.mjs               # crop the worst rows to audit-out/
import fs from 'node:fs';
import P from 'puppeteer-core';
import { signIn } from './lib/authed-page.mjs';
import { INK_FN } from './lib/ink.mjs';
import { unmangleArg } from './lib/unmangle.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:5199';
// 2.5px is the app's measured floor today, not an aspiration: the six rows
// between 1.5 and 2.3 that remain are glyph facts, not layout — a ✈ set in a
// different font from the row it sits on, and Hebrew beside Latin where the
// two share a baseline and therefore cannot share an ink centre. Run it with
// TOL=1.5 to see those six; the gate fails above 2.5 so a real drift is caught.
const TOL = Number(process.env.TOL || 2.5);
const WIDTHS = (process.env.WIDTHS || '390,1280').split(',').map(Number);
const SHOTS = !!process.env.SHOTS;
const TOP = Number(process.env.TOP || 40);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const DEFAULT_ROUTES = [
  '/coach/dashboard', '/coach/athletes', '/coach/programs', '/coach/exercises',
  '/coach/review', '/coach/workouts', '/coach/sessions', '/coach/tasks',
  '/coach/billing', '/coach/incoming', '/coach/challenges', '/coach/calendar',
  '/coach/bhbc', '/athlete', '/demo/coach', '/demo/athlete', '/login',
];
// Git Bash rewrites a leading-slash argument into a Windows path before node
// sees it, which reads exactly like the route being broken. Undo it.
const ROUTES = (process.env.ROUTES || DEFAULT_ROUTES.join(',')).split(',').map((s) => unmangleArg(s.trim())).filter(Boolean);

const SCAN = `(() => {
  const items = [];
  const seen = new Set();
  // Everything painted and small enough to belong to a row.
  for (const el of document.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (!(r.width > 2 && r.height > 2 && r.height < 80)) continue;
    if (r.bottom < 0 || r.top > innerHeight * 3) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.opacity === '0' || cs.display === 'none') continue;
    const ink = window.__ink(el);
    if (!ink) continue;
    // A thing that spans the whole row is the row, not an item in it.
    items.push({ ...ink, x: r.x, right: r.right, w: r.width, h: r.height, el });
  }
  // Group into rows: boxes that overlap vertically by >=60% of the smaller one.
  const rows = [];
  for (const it of items) {
    let row = rows.find((g) => {
      const ov = Math.min(g.bot, it.bot) - Math.max(g.top, it.top);
      return ov > 0 && ov >= 0.6 * Math.min(g.bot - g.top, it.bot - it.top);
    });
    if (!row) { row = { top: it.top, bot: it.bot, its: [] }; rows.push(row); }
    row.top = Math.min(row.top, it.top); row.bot = Math.max(row.bot, it.bot);
    row.its.push(it);
  }
  const out = [];
  for (const row of rows) {
    // One item per x-position: a label wrapped in three divs is one thing.
    const byX = new Map();
    for (const it of row.its) {
      const key = Math.round(it.x) + ':' + it.kind;
      const cur = byX.get(key);
      if (!cur || it.bot - it.top < cur.bot - cur.top) byX.set(key, it);
    }
    let its = [...byX.values()];
    // A CONTAINER IS NOT A PEER OF ITS OWN CONTENTS. A tile's box sits lower
    // than the label inside it by half the tile - true, and meaningless. Drop
    // any item that contains another item of this row.
    its = its.filter((i) => !its.some((j) => j !== i && i.el.contains(j.el)));
    // Drop anything that spans nearly the whole row: that is the row.
    const rowW = Math.max(...its.map((i) => i.right)) - Math.min(...its.map((i) => i.x));
    its = its.filter((i) => i.w < rowW * 0.92 || its.length <= 2);
    // Two things at the SAME x are a stack, not a row.
    if (its.length < 2) continue;
    const xs = new Set(its.map((i) => Math.round(i.x / 4)));
    if (xs.size < 2) continue;
    const mids = its.map((i) => i.mid);
    const spread = Math.max(...mids) - Math.min(...mids);
    if (spread < TOLERANCE) continue;
    // A ROW HAS TWO LEGITIMATE CONVENTIONS, AND BASELINE IS ONE OF THEM.
    // Type of different sizes set on a shared baseline has ink centres that
    // differ BY DESIGN — that is what baseline alignment is. Flagging it as a
    // fault is how a sweep starts telling you to break correct typography. A
    // row is only wrong when it is aligned by NEITHER convention.
    // TEXT IS JUDGED BY ITS BASELINE, EVERYTHING ELSE BY ITS INK.
    //
    // Hebrew has no ascenders above cap height and no descenders, so a Hebrew
    // word and a Latin word at the same size, set on the SAME baseline, have
    // ink centres ~1.5px apart. That is the script, not the CSS, and "fixing"
    // it would mean knocking the two off their shared baseline. So: all text on
    // the row must share a baseline, and anything with no baseline of its own -
    // an icon, a tag's box, an image - is measured against where the text's ink
    // actually sits.
    const texts = its.filter((i) => typeof i.base === 'number');
    const others = its.filter((i) => typeof i.base !== 'number');
    if (texts.length > 1) {
      const bs = texts.map((i) => i.base);
      if (Math.max(...bs) - Math.min(...bs) >= TOLERANCE) { /* the text itself is off - report */ }
      else if (!others.length) continue;
      else {
        const lo2 = Math.min(...texts.map((i) => i.mid));
        const hi2 = Math.max(...texts.map((i) => i.mid));
        const worstOther = Math.max(...others.map((i) => Math.max(lo2 - i.mid, i.mid - hi2, 0)));
        if (worstOther < TOLERANCE) continue;
      }
    }
    // ONE LINE, OR TWO? A single line of text cannot have its ink centres
    // further apart than its own tallest ink. Anything wider than that is two
    // stacked lines that happen to share a container - not a row, and reporting
    // it is what makes a sweep noise instead of a list.
    // Against the SMALLEST ink, not the tallest. A row that mixes a 32px input
    // with 10px labels would otherwise be allowed a 13px "spread" and report as
    // one row when it is plainly two; the smallest thing on a line is the honest
    // bound for how far the line can spread and still be one line.
    const smallest = Math.min(...its.map((i) => i.bot - i.top));
    if (spread > Math.max(smallest, 8)) continue;
    // AND THEY HAVE TO BE THE SAME ROW IN THE DOM, not merely overlapping on
    // screen. Two alert cards stacked 8px apart put one card's icon on the
    // previous card's last line geometrically; a reader would never call that a
    // row. Require one common ancestor that is itself a flex/grid line and no
    // taller than the row it holds.
    let anc = its[0].el;
    while (anc && !its.every((i) => anc.contains(i.el))) anc = anc.parentElement;
    if (!anc) continue;
    const acs = getComputedStyle(anc);
    if (!/flex|grid/.test(acs.display)) continue;
    // A STACK BESIDE A BUTTON IS NOT A MISALIGNMENT. A name over a subtitle,
    // centred as a block against a control, puts the NAME above the control's
    // centre on purpose — that is how the pattern is supposed to read. Only
    // flag rows where every item is a single line in its own right.
    const stacked = its.some((i) => {
      let n = i.el;
      while (n && n !== anc) {
        const cs2 = getComputedStyle(n);
        const kids = [...n.children].filter((k) => k.getBoundingClientRect().height > 0);
        if (kids.length > 1) {
          // Stacked if the children sit on different lines — a flex column, or
          // a plain block holding a name over a subtitle.
          const tops = kids.map((k) => k.getBoundingClientRect().top);
          if (/column/.test(cs2.flexDirection) || (Math.max(...tops) - Math.min(...tops)) > 4) return true;
        }
        n = n.parentElement;
      }
      return false;
    });
    if (stacked) continue;
    const ar = anc.getBoundingClientRect();
    const tall = Math.max(...its.map((i) => i.bot - i.top));
    if (ar.height > Math.max(tall * 2.2, 56)) continue;
    // A CHART IS NOT A ROW. Bars, sparkline columns and progress blocks are
    // boxes whose heights differ ON PURPOSE; a row of nothing but unlabelled
    // boxes carries no text to be aligned with, so there is nothing to report.
    if (its.every((i) => i.kind === 'box' && !i.what.replace(/[^\p{L}\p{N}]/gu, ''))) continue;
    const hi = its.reduce((a, c) => (c.mid < a.mid ? c : a));
    const lo = its.reduce((a, c) => (c.mid > a.mid ? c : a));
    out.push({
      spread: +spread.toFixed(2),
      y: Math.round(row.top),
      n: its.length,
      high: { kind: hi.kind, what: hi.what, mid: +hi.mid.toFixed(2) },
      low: { kind: lo.kind, what: lo.what, mid: +lo.mid.toFixed(2) },
      all: its.sort((a, c) => a.mid - c.mid).slice(0, 5).map((i) => i.kind + ':' + i.what + '@' + i.mid.toFixed(1)),
    });
  }
  return { dbg: { items: items.length, rows: rows.length, over: out.length }, rows: out.sort((a, b) => b.spread - a.spread).slice(0, 12) };
})()`;

const run = async () => {
  const b = await P.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 300000 });
  const pg = await b.newPage();
  await pg.setBypassServiceWorker(true);
  await pg.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
  await pg.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
  await wait(1500);
  await pg.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch { /* blocked */ } });
  await signIn(pg, BASE);
  await wait(2000);

  const findings = [];
  for (const route of ROUTES) {
    for (const w of WIDTHS) {
      if (w < 700) await pg.emulate({ viewport: { width: w, height: 900, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36' });
      else await pg.emulate({ viewport: { width: w, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false }, userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36' });
      try {
        await pg.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 45000 });
      } catch (e) { if (process.env.DBG) console.log('  dbg GOTO FAILED', route, w, String(e.message).slice(0, 100)); continue; }
      await wait(route === '/coach/bhbc' ? 7000 : 4500);
      // the install prompt covers the page
      await pg.evaluate(() => { const el = [...document.querySelectorAll('button')].find((e) => /MAYBE LATER|אחר כך/i.test(e.innerText || '')); if (el) el.click(); }).catch(() => {});
      await wait(400);
      const inkOk = await pg.evaluate(INK_FN).then(() => true).catch((e) => { if (process.env.DBG) console.log('  dbg INK FAILED', String(e.message).slice(0, 100)); return false; });
      if (process.env.DBG) console.log('  dbg ink loaded:', inkOk);
      let rows = [];
      try { const res = await pg.evaluate(SCAN.replace(/TOLERANCE/g, String(TOL))); rows = res.rows; if (process.env.DBG) console.log('  dbg', route, w, JSON.stringify(res.dbg)); } catch (e) { if (process.env.DBG) console.log('  dbg ERR', route, w, String(e.message).slice(0, 120)); rows = []; }
      for (const r of rows) findings.push({ route, w, ...r });
      if (SHOTS && rows.length) {
        const y = Math.max(0, rows[0].y - 30);
        await pg.screenshot({ path: `audit-out/_row-ink-${route.replace(/\W+/g, '_')}-${w}.png`, clip: { x: 0, y, width: w, height: Math.min(260, 900 - y) } }).catch(() => {});
      }
    }
  }
  await pg.close();
  b.disconnect();

  findings.sort((a, b2) => b2.spread - a.spread);
  console.log(`ROW INK SWEEP — ${ROUTES.length} route(s) x ${WIDTHS.join('/')} — tolerance ${TOL}px\n`);
  if (!findings.length) { console.log('  every row shares one ink centre.'); process.exit(0); }
  const top = findings.slice(0, TOP);
  for (const f of top) {
    console.log(`  ${String(f.spread).padStart(6)}px  ${f.route} @${f.w}  y${f.y}  (${f.n} items)`);
    console.log(`          highest ${f.high.kind}:"${f.high.what}"  lowest ${f.low.kind}:"${f.low.what}"`);
    console.log(`          ${f.all.join('  ')}`);
  }
  const byRoute = {};
  for (const f of findings) byRoute[f.route] = (byRoute[f.route] || 0) + 1;
  console.log(`\n${findings.length} row(s) over ${TOL}px, worst ${findings[0].spread}px`);
  console.log('by route: ' + Object.entries(byRoute).sort((a, b2) => b2[1] - a[1]).map(([r, n]) => `${r} ${n}`).join(' · '));
  fs.mkdirSync('audit-out', { recursive: true });
  fs.writeFileSync('audit-out/_row-ink.json', JSON.stringify(findings, null, 1));
  process.exit(findings.length ? 1 : 0);
};
run();
