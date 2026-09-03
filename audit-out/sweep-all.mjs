import P from 'puppeteer-core';
import * as A from '../scripts/lib/authed-page.mjs';
import { setWidth } from '../scripts/lib/viewport.mjs';
// EVERY static route in docs/SURFACES.md, not a hand-picked 14. The
// parameterised ones (/coach/athletes/:id, /p/:token, /book/:slug, /sign/:id)
// need a live id and are swept separately.
const ROUTES = [
  '/coach', '/coach/dashboard', '/coach/athletes', '/coach/programs', '/coach/exercises',
  '/coach/exercise-matching', '/coach/exercise-classify', '/coach/exercise-cleanup',
  '/coach/sessions', '/coach/sessions-single', '/coach/workouts', '/coach/review',
  '/coach/review-tools', '/coach/tasks', '/coach/billing', '/coach/calendar',
  '/coach/challenges', '/coach/waitlist', '/coach/intake', '/coach/bhbc',
  '/coach/smart-import', '/coach/bugs', '/coach/chat-audit',
  '/athlete', '/login', '/try',
  '/demo', '/demo/coach', '/demo/athlete', '/demo/he', '/demo/sandbox',
  '/coaches/demo', '/coaches/demo/coach', '/coaches/demo/trainee', '/coaches/try',
  '/intake/he',
];
const WIDTHS = [1500, 900, 390];
const b = await P.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 300000 });
const pg = await b.newPage();
await A.signIn(pg, 'http://127.0.0.1:5199');
const hits = [];
const skipped = [];
let visited = 0;
for (const W of WIDTHS) {
  for (const r of ROUTES) {
    await setWidth(pg, W, 950);
    try { await pg.goto('http://127.0.0.1:5199' + r, { waitUntil: 'domcontentloaded', timeout: 30000 }); }
    catch { skipped.push(W + ' ' + r); continue; }
    visited++;
    try {
    await new Promise(x => setTimeout(x, 6000));
    await pg.evaluate(() => { const x = [...document.querySelectorAll('button,a')].find(e => /maybe later|dismiss/i.test(e.textContent || '')); if (x) x.click(); });
    const res = await pg.evaluate((VW) => {
      const out = { clip: [], spill: 0 };
      for (const el of document.querySelectorAll('*')) {
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') continue;
        let hasText = false;
        for (const n of el.childNodes) if (n.nodeType === 3 && n.textContent.trim()) hasText = true;
        if (hasText) {
          const over = el.scrollWidth - el.clientWidth;
          if (over > 1 && !['auto','scroll'].includes(cs.overflowX) && cs.textOverflow !== 'ellipsis') {
            out.clip.push({ t: (el.textContent||'').replace(/\s+/g,' ').trim().slice(0, 34), over });
          }
        }
      }
      out.docW = document.documentElement.scrollWidth;
      return out;
    }, W);
    if (res.clip.length || res.docW > W + 1) {
      hits.push({ r, W, clip: res.clip.slice(0, 3), docW: res.docW });
      console.log(`HIT ${String(W).padEnd(5)} ${r}  docW=${res.docW} clipped=${res.clip.length}`);
      for (const c of res.clip.slice(0, 3)) console.log(`      +${c.over}px "${c.t}"`);
    }
    // One route that hangs must not throw away the other 107 measurements.
    } catch (e) { skipped.push(W + ' ' + r + ' (' + String(e.message || e).slice(0, 40) + ')'); visited--; }
  }
}
console.log('');
if (skipped.length) console.log('NOT VISITED (nav failed): ' + skipped.join(', '));
console.log(hits.length
  ? `${hits.length} of ${visited} route/width combinations with clipped text or page overflow`
  : `0 - no clipped text, no page overflow, ${visited} route/width combinations visited`);
await pg.close(); b.disconnect();
