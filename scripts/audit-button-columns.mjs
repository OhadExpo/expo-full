// Ohad: "make sure all buttons no matter the tag (for each column) are the
// same horizontal size". A column = buttons sharing a left edge down a screen.
import P from 'puppeteer-core';
import * as A from '../scripts/lib/authed-page.mjs';
const W = parseInt(process.argv[2] || '1500', 10);
const b = await P.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
const pg = await b.newPage();
await pg.setViewport({ width: W, height: 1100 });
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
        const counts = {};
        for (const i of list) counts[i.t] = (counts[i.t] || 0) + 1;
        if (!Object.values(counts).some((n) => n >= 2)) continue;
        const ws = [...new Set(list.map((i) => i.w))];
        if (ws.length === 1) continue;
        const spread = Math.max(...ws) - Math.min(...ws);
        if (spread < 2) continue;
        out.push({ x: String(x), n: list.length, spread, widths: ws.slice(0, 6), sample: list.slice(0, 4).map((i) => i.t + ':' + i.w) });
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
