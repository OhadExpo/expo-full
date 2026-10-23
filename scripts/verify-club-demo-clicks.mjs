// EVERY BUTTON IN A DEMO CLUB (team version #904, the #889 rule on the demo): on every zone page, press every visible
// button / link / role=button one at a time (the page reloaded between presses, so each starts from the seed) and
// record what it did - URL change, a dialog, a toast, the text changed - or that it did NOTHING (dead), plus any console
// error and ANY database request. A demo writes in memory, so pressing everything is safe.
//   node scripts/verify-club-demo-clicks.mjs [slug=netanya]   (BASE, W, LANG env)
import puppeteer from 'puppeteer-core';
const slug = process.argv[2] || 'netanya';
const BASE = process.env.BASE || 'http://127.0.0.1:5392';
const W = Number(process.env.W || 1440);
const LANG = process.env.LANG_ZONE || 'en';
const PAGES = (process.env.PAGES || 'overview,roster,schedule,practices,lifts,medical,games,activity').split(',');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 120000 });
const ctx = await b.createBrowserContext(); const p = await ctx.newPage();
await p.setViewport({ width: W, height: 900, isMobile: W < 600, hasTouch: W < 1100 });
await p.evaluateOnNewDocument((l) => { try { sessionStorage.setItem('club-tour-closed', '1'); localStorage.setItem('expo-collapse:bhbc-lang', JSON.stringify(l)); } catch { /* */ } window.__dlg = 0; }, LANG);
p.on('dialog', (d) => d.dismiss().catch(() => {}));
const db = [], errs = [];
p.on('request', (r) => { if (/supabase\.co|\/rest\/v1\/|\/rpc\/|\/storage\/v1\//.test(r.url())) db.push(`${r.method()} ${r.url().slice(0, 90)}`); });
p.on('pageerror', (e) => errs.push('PAGEERROR ' + String(e.message).slice(0, 140)));
p.on('console', (m) => { if (m.type() === 'error' && !/ERR_BLOCKED_BY_CLIENT|favicon|chrome-extension:/i.test(m.text())) errs.push(m.text().slice(0, 140)); });
const load = async (pg) => { await p.goto(`${BASE}/demo/club/${slug}/${pg}`, { waitUntil: 'domcontentloaded' }); await p.waitForFunction(() => document.querySelector('.bhbc-zone'), { timeout: 20000, polling: 300 }).catch(() => {}); await wait(1800); };
const listControls = () => p.evaluate(() => {
  const vis = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 2 && r.height > 2 && cs.visibility !== 'hidden' && cs.display !== 'none' && !e.disabled; };
  const els = [...document.querySelectorAll('.bhbc-zone button, .bhbc-zone a[href], .bhbc-zone [role=button], .bhbc-zone [role=tab]')].filter(vis);
  return els.map((e, i) => { e.setAttribute('data-clk', String(i)); return { i, label: (e.getAttribute('aria-label') || e.textContent || e.getAttribute('title') || e.tagName).trim().replace(/\s+/g, ' ').slice(0, 40) }; });
});
const sig = () => p.evaluate(() => `${location.pathname}${location.search}|${document.querySelectorAll('[role=dialog], .modal, [data-toast], .toast').length}|${document.body.innerText.length}|${(document.body.innerText.match(/\d+/g) || []).slice(0, 60).join(',')}`);
let total = 0, dead = [], bad = 0;
for (const pg of PAGES) {
  await load(pg);
  const ctrls = await listControls();
  for (const c of ctrls) {
    if (/^(en|עב|he)$/i.test(c.label)) continue;   // the language toggle is swept by the gates in both languages
    await load(pg); await listControls();
    const before = await sig(); const nDb = db.length, nErr = errs.length;
    const clicked = await p.evaluate((i) => { const e = document.querySelector(`[data-clk="${i}"]`); if (!e) return false; e.scrollIntoView({ block: 'center' }); e.click(); return true; }, c.i);
    await wait(700);
    const after = await sig().catch(() => 'nav');
    total++;
    const did = clicked && after !== before;
    const flags = [];
    if (!clicked) flags.push('GONE');
    else if (!did) flags.push('DEAD');
    if (db.length > nDb) flags.push(`DB:${db[nDb]}`);
    if (errs.length > nErr) flags.push(`ERR:${errs[nErr]}`);
    if (flags.length) { if (flags.some((f) => f !== 'GONE')) bad++; console.log(pg.padEnd(10), c.label.padEnd(40), flags.join(' | ')); if (flags.includes('DEAD')) dead.push(`${pg}: ${c.label}`); }
  }
}
console.log(`${total} presses on ${PAGES.length} pages · ${dead.length} did nothing · ${db.length} database requests · ${errs.length} errors`);
await ctx.close(); b.disconnect();
process.exit(db.length || errs.length ? 1 : 0);
