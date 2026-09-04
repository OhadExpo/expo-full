// THE MARKETING SITE HAS NEVER BEEN SWEPT THIS SESSION.
//
// expo-il is a separate Vite root on its own port with HASH routing, so the
// app's route sweep never touches it - and it is the surface a prospect meets
// first. Ohad's rules apply to it exactly as they do to the app: no clipped
// words, no sideways scroll, and every width including a phone.
//
//   node audit-out/sweep-il.mjs
import P from 'puppeteer-core';
import { setWidth } from '../scripts/lib/viewport.mjs';

const BASE = process.env.IL_BASE || 'http://127.0.0.1:5174';
const WIDTHS = [1500, 900, 390];

const b = await P.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 300000 });
const pg = await b.newPage();

// Discover a real program id so the detail view is covered too, rather than
// asserting the catalog is the whole site.
await pg.goto(BASE + '/#/online', { waitUntil: 'domcontentloaded', timeout: 45000 });
await new Promise((r) => setTimeout(r, 6000));
const progs = await pg.evaluate(() => [...new Set([...document.querySelectorAll('a[href*="#/programs/"]')]
  .map((a) => (a.getAttribute('href') || '').split('#/programs/')[1]).filter(Boolean))].slice(0, 2));
const ROUTES = ['/#/', '/#/online', '/#/gym', ...progs.map((p) => '/#/programs/' + p)];
console.log('routes: ' + ROUTES.join(' '));

const hits = [];
const skipped = [];
let visited = 0;
for (const W of WIDTHS) {
  for (const r of ROUTES) {
    try {
      await setWidth(pg, W, 950);
      // Hash routes do not reload; go to about:blank first so each is a fresh
      // paint and a stale view cannot be measured as the next one.
      await pg.goto('about:blank');
      await pg.goto(BASE + r, { waitUntil: 'domcontentloaded', timeout: 30000 });
      visited++;
      await new Promise((x) => setTimeout(x, 6000));
      const res = await pg.evaluate((VW) => {
        const out = { clip: [], docW: document.documentElement.scrollWidth };
        for (const el of document.querySelectorAll('*')) {
          const cs = getComputedStyle(el);
          if (cs.display === 'none' || cs.visibility === 'hidden') continue;
          let hasText = false;
          for (const n of el.childNodes) if (n.nodeType === 3 && n.textContent.trim()) hasText = true;
          if (!hasText) continue;
          const over = el.scrollWidth - el.clientWidth;
          if (over > 1 && !['auto', 'scroll'].includes(cs.overflowX) && cs.textOverflow !== 'ellipsis') {
            out.clip.push({ t: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 34), over });
          }
        }
        return out;
      }, W);
      if (res.clip.length || res.docW > W + 1) {
        hits.push({ r, W });
        console.log(`HIT ${String(W).padEnd(5)} ${r}  docW=${res.docW} clipped=${res.clip.length}`);
        for (const c of res.clip.slice(0, 3)) console.log(`      +${c.over}px "${c.t}"`);
      }
    } catch (e) { skipped.push(W + ' ' + r + ' (' + String(e.message || e).slice(0, 40) + ')'); }
  }
}
console.log('');
if (skipped.length) console.log('NOT VISITED: ' + skipped.join(', '));
console.log(hits.length
  ? `${hits.length} of ${visited} route/width combinations with clipped text or sideways scroll`
  : `0 - marketing site clean, ${visited} route/width combinations visited`);
await pg.close();
b.disconnect();
