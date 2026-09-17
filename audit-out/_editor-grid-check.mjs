// Program editor: the GRP control vs the SETS box (gap), and the pattern-coverage tags (ink centring).
import P from 'puppeteer-core';
import { signIn } from '../scripts/lib/authed-page.mjs';
const BASE = process.env.BASE || 'http://127.0.0.1:4173';
const W = Number(process.env.W || 1400);
const LANG = process.env.LANG_ || 'en';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await P.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 300000 });
const pg = await b.newPage(); await pg.setBypassServiceWorker(true); await pg.setViewport({ width: W, height: 1000 });
await pg.goto(BASE, { waitUntil: 'domcontentloaded' }); await wait(1200);
await pg.evaluate(() => { for (const k of Object.keys(localStorage)) if (/^sb-.*-auth-token$/.test(k)) localStorage.removeItem(k); });
await signIn(pg, BASE);
await pg.evaluate(() => { const el = [...document.querySelectorAll('button, a')].find((e) => /ניהול|COACH|Manage/i.test(e.innerText || '') && e.offsetParent); if (el) el.click(); });
await wait(2000);
const PLAN = process.env.PLAN || 'pl_4acc7jnrmtylajzy';
await pg.goto(`${BASE}/coach/programs/${PLAN}?lang=${LANG}`, { waitUntil: 'domcontentloaded' }); await wait(9000);
const m = await pg.evaluate(() => {
  const sel = [...document.querySelectorAll('select')].find((s) => [...s.options].map((o) => o.text.trim()).join('') .match(/^—?ABCDE/));
  let grp = null;
  if (sel) {
    const r = sel.getBoundingClientRect();
    // the next cell to its inline-end is the SETS input
    const all = [...document.querySelectorAll('input, select')].map((e) => ({ e, r: e.getBoundingClientRect() })).filter((x) => Math.abs(x.r.top - r.top) < 6 && x.r.left > r.left);
    all.sort((a, b2) => a.r.left - b2.r.left);
    const next = all[0];
    grp = { grpRect: [Math.round(r.left), Math.round(r.right)], nextRect: next ? [Math.round(next.r.left), Math.round(next.r.right)] : null, gap: next ? Math.round(next.r.left - r.right) : null, grpWidth: Math.round(r.width) };
  }
  // pattern coverage tags: cap-ink centring inside the badge box
  const tags = [...document.querySelectorAll('.pattern-cov-grid > *')].slice(0, 4).map((t) => {
    const r = t.getBoundingClientRect(); const cs = getComputedStyle(t);
    return { text: (t.innerText || '').trim().slice(0, 18), h: Math.round(r.height), padTop: cs.paddingTop, padBottom: cs.paddingBottom, align: cs.alignItems, textBox: cs.textBoxTrim || cs.textBox || 'n/a' };
  });
  return { opened: !!sel, grp, tags };
});
console.log(JSON.stringify(m, null, 1));
await pg.screenshot({ path: `audit-out/shots-0917/editor-grid-${LANG}-${W}.png`, clip: { x: 0, y: 0, width: Math.min(W, 1400), height: 700 } });
await pg.close(); b.disconnect();
