// Ohad: "make sure all buttons no matter the tag (for each column) are the
// same horizontal size". A column = buttons sharing a left edge down a screen.
import P from 'puppeteer-core';
import * as A from '../scripts/lib/authed-page.mjs';
const W = parseInt(process.argv[2] || '1500', 10);
const b = await P.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
const pg = await b.newPage();
const applyViewport = async (pg, w) => {
  // Real device below 700px - a plain setViewport is a narrow desktop, not a phone.
  if (w <= 700) {
    await pg.emulate({
      viewport: { width: w, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    });
    return;
  }
  await pg.setViewport({ width: w, height: 1100 });
};
await applyViewport(pg, W);
await A.signIn(pg, 'http://127.0.0.1:5199');
const ROUTES = ['/coach/bhbc', '/coach/athletes', '/coach/programs', '/coach/dashboard', '/coach/exercises'];
let total = 0;
for (const route of ROUTES) {
  await pg.goto('http://127.0.0.1:5199' + route, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 9000));
  const tabs = await pg.evaluate(() => [...document.querySelectorAll('button')].map((x) => (x.textContent || '').trim())
    .filter((t) => /^(overview|roster|schedule|medical|sessions|games)$/i.test(t)));
  for (const tab of (tabs.length ? tabs : [null])) {
    if (tab) {
      await pg.evaluate((l) => { const e = [...document.querySelectorAll('button')].find((x) => (x.textContent || '').trim() === l); if (e) e.click(); }, tab);
      await new Promise((r) => setTimeout(r, 2200));
    }
    const bad = await pg.evaluate(() => {
      const cols = new Map();
      document.querySelectorAll('button').forEach((e) => {
        const r = e.getBoundingClientRect();
        if (r.width < 24 || r.height < 14 || r.width > 400) return;
        const t = (e.textContent || '').trim();
        if (!t) return;
        // Group by x AND by MATERIAL. Ohad's rule is that controls of the same
        // material line up; a bordered box button and an underline text button
        // are deliberately different things (his control-material rule), and
        // comparing them called a correct screen broken.
        const cs = getComputedStyle(e);
        const bordered = parseFloat(cs.borderTopWidth) > 0 && cs.borderTopStyle !== 'none';
        const filled = cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent';
        const material = (bordered ? 'B' : '') + (filled ? 'F' : '') + Math.round(r.height);
        const key = Math.round(r.left / 4) * 4 + '|' + material;
        if (!cols.has(key)) cols.set(key, []);
        cols.get(key).push({ t: t.slice(0, 14), w: Math.round(r.width), y: Math.round(r.top), p: e.parentElement });
      });
      const out = [];
      for (const [x, list] of cols) {
        if (list.length < 3) continue;
        // A WRAPPED ROW is not a column. When a flex row wraps at phone width its
        // items line up on the same left edge and look exactly like one - that is
        // how the filter pills on /coach/exercises and the wrapped action row on
        // /coach/programs got reported. A real column puts one button in each row,
        // so its members have DIFFERENT parents; a wrapped row shares one.
        if (new Set(list.map((i) => i.p)).size < 2) continue;
        // And a stack of DIFFERENT controls is not a column either. Three filter
        // pills - "Unclassified", "Movement", "Primary Muscle" - sit on one left
        // edge at 390 and are 157/91/145px wide because they are different names,
        // not one control resizing. The rule is about the SAME action repeating
        // down a list (Edit/Edit/Edit, MED/MED), so require a label to repeat.
        // Normalise the CONTENT out of the label. His rule is about one control
        // resizing as its content changes - "18 previous" and "3 previous" are
        // the same control, and that pair is exactly the defect this gate was
        // built for (102/106/110px on 09-01). Keying on the raw label would
        // make them different controls and the gate would never see it again.
        const norm = (t) => t.replace(/\d+/g, '#').trim();
        const counts = {};
        for (const i of list) { i.k = norm(i.t); counts[i.k] = (counts[i.k] || 0) + 1; }
        if (!Object.values(counts).some((n) => n >= 2)) continue;
        // The complaint is ONE control changing width with its own content -
        // "changing labels reserve the widest-label width; resize reads as a
        // flash bug". So the spread that matters is within a SINGLE label, not
        // across the column. /coach/programs at 390 wraps PORTAL (93, a toggle)
        // and Share (96, a text button) onto one left edge across two cards;
        // each label is perfectly consistent with itself and nothing resizes.
        let worst = null;
        for (const [label, n] of Object.entries(counts)) {
          if (n < 2) continue;
          const lw = [...new Set(list.filter((i) => i.k === label).map((i) => i.w))];
          if (lw.length === 1) continue;
          const sp = Math.max(...lw) - Math.min(...lw);
          if (sp < 2) continue;
          if (!worst || sp > worst.spread) worst = { label, spread: sp, widths: lw.slice(0, 6) };
        }
        if (!worst) continue;
        out.push({ x: String(x), n: list.length, spread: worst.spread, widths: worst.widths, sample: list.filter((i) => i.k === worst.label).slice(0, 4).map((i) => i.t + ':' + i.w) });
      }
      return out.sort((a, c) => c.spread - a.spread).slice(0, 4);
    });
    const where = route + (tab ? ' · ' + tab : '');
    if (!bad.length) { console.log('OK    ' + where); continue; }
    total += bad.length;
    console.log('FAIL  ' + where + '  (' + bad.length + ')');
    for (const c of bad) console.log('        x=' + String(c.x).padStart(4) + '  n=' + c.n + '  spread ' + String(c.spread).padStart(3) + 'px  ' + JSON.stringify(c.sample));
  }
}
console.log('\n' + total + ' button column(s) whose buttons differ in width at ' + W + 'px');
await pg.close();
b.disconnect();
