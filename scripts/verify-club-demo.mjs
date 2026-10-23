// A CLUB DEMO IS CLEAN (team version #904, A8). For every zone page of /demo/club/<slug>, signed OUT, in a fresh
// browser context:
//   - zero requests to the database (any supabase.co REST / RPC / realtime / storage call fails the gate)
//   - zero console errors and page errors
//   - not one word of the live club on screen (Herzliya / BHBC / the Herzliya crest)
//   - the page is FULL: the zone rendered, the demo banner is there, the text is longer than a stub
// and a full-page screenshot per page into <out> to LOOK at.
//
//   node scripts/verify-club-demo.mjs [slug=netanya] [out=audit-out/club-demo]   (BASE, WIDTHS, LANGS, THEMES env)
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync } from 'node:fs';

const slug = process.argv[2] || 'netanya';
const OUT = process.argv[3] || `audit-out/club-demo-${slug}`;
const BASE = process.env.BASE || 'http://127.0.0.1:5392';
const PAGES = (process.env.PAGES || 'overview,roster,schedule,practices,lifts,medical,games,activity').split(',');
const WIDTHS = (process.env.WIDTHS || '390,820,1440').split(',').map(Number);
const LANGS = (process.env.LANGS || 'en,he').split(',');
const THEMES = (process.env.THEMES || 'light,dark').split(',');
const SHOTS = process.env.SHOTS !== '0';
const LIVE = /herzliy|הרצליה|\bBHBC\b|bnei/i;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(OUT, { recursive: true });

const br = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
let fails = 0, checked = 0;
for (const lang of LANGS) for (const theme of THEMES) for (const w of WIDTHS) {
  const ctx = await br.createBrowserContext(); const p = await ctx.newPage();
  await p.evaluateOnNewDocument((l, th) => { try { sessionStorage.setItem('bhbc-lang-session', l); localStorage.setItem('expo-collapse:bhbc-theme', JSON.stringify(th)); sessionStorage.setItem('club-tour-closed', '1'); } catch { /* */ } }, lang, theme);
  await p.setViewport({ width: w, height: w < 600 ? 844 : 900, isMobile: w < 600, hasTouch: w < 1100, deviceScaleFactor: 1 });
  const db = [], errs = [];
  p.on('request', (r) => { const u = r.url(); if (/supabase\.co|\/rest\/v1\/|\/rpc\/|\/realtime\/|\/storage\/v1\//.test(u)) db.push(`${r.method()} ${u.slice(0, 120)}`); });
  p.on('console', (m) => { if (m.type() === 'error' && !/ERR_BLOCKED_BY_CLIENT|favicon|chrome-extension:/i.test(m.text())) errs.push(m.text().slice(0, 200)); });   // an ad-blocker in the debug profile refusing analytics is not the page's error
  p.on('pageerror', (e) => errs.push('PAGEERROR ' + String(e.message || e).slice(0, 200)));
  for (const pg of PAGES) {
    db.length = 0; errs.length = 0;
    await p.goto(`${BASE}/demo/club/${slug}/${pg}`, { waitUntil: 'domcontentloaded' });
    await p.waitForFunction(() => document.querySelector('.bhbc-zone') && document.querySelector('[data-demo-banner]'), { timeout: 25000, polling: 500 }).catch(() => {});
    await wait(2500);
    const r = await p.evaluate((liveSrc) => {
      const live = new RegExp(liveSrc, 'i');
      const text = document.body.innerText || '';
      const hits = (text.match(new RegExp(liveSrc, 'gi')) || []).slice(0, 5);
      const imgs = [...document.images].map((i) => i.getAttribute('src') || '').filter((s) => /herzliya|bhbc/i.test(s));
      const title = document.title;
      return { len: text.length, hits, imgs, title, zone: !!document.querySelector('.bhbc-zone'), banner: !!document.querySelector('[data-demo-banner]'), path: location.pathname, hscroll: document.documentElement.scrollWidth > innerWidth + 1, liveTitle: live.test(title) };
    }, LIVE.source);
    const bad = [];
    if (!r.zone || !r.banner) bad.push('zone/banner missing');
    if (r.len < 400) bad.push(`only ${r.len} chars`);
    if (r.hits.length) bad.push('live club words: ' + r.hits.join(', '));
    if (r.imgs.length) bad.push('live crest: ' + r.imgs[0]);
    if (r.liveTitle) bad.push('title: ' + r.title);
    if (r.hscroll) bad.push('page scrolls sideways');
    if (!r.path.startsWith(`/demo/club/${slug}/${pg}`)) bad.push('url ' + r.path);
    if (db.length) bad.push(`${db.length} db requests: ${db[0]}`);
    if (errs.length) bad.push(`${errs.length} console errors: ${errs[0]}`);
    checked++;
    const tag = `${lang}-${theme}-${w}-${pg}`;
    if (bad.length) { fails++; console.log('FAIL', tag, '|', bad.join(' | ')); } else console.log('ok  ', tag, r.len, 'chars');
    if (SHOTS) writeFileSync(`${OUT}/${tag}.png`, await p.screenshot({ fullPage: true }));
  }
  await ctx.close();
}
br.disconnect();
console.log(`${checked} pages checked, ${fails} failed`);
process.exit(fails ? 1 : 0);
