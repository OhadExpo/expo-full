// verify-partner-media.mjs - Elad's sandbox shows the REAL videos, voice notes and photos (#478).
//
// His copy of the rows points at the same storage files as the owner's. As the
// partner, it walks the pages that show media (review, workouts, every athlete),
// collects every <video>/<audio>/<img> source that lives in Supabase storage,
// and fetches each from HIS page (his session, his signed URLs). A 4xx is a
// video he would see as broken.
//
//   CDP=http://[::1]:9444 BASE=http://127.0.0.1:5270 node scripts/verify-partner-media.mjs
import fs from 'node:fs';
import P from 'puppeteer-core';

process.env.EXPO_EMAIL = process.env.EXPO_EMAIL || 'eladeluz24@gmail.com';
const { signIn, assertAuthed } = await import('./lib/authed-page.mjs');
const BASE = process.env.BASE || 'http://127.0.0.1:5270';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const src0 = fs.readFileSync('src/supabase.js', 'utf8');
const { createClient } = await import('@supabase/supabase-js');
const db = createClient(src0.match(/SUPA_URL = '([^']+)'/)[1], src0.match(/SUPA_PUBLISHABLE_KEY = '([^']+)'/)[1], { auth: { persistSession: false } });
await db.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });
const { data: tr } = await db.from('store').select('value').eq('key', 'expo-trainees');
await db.auth.signOut({ scope: 'local' });
const athletes = ((tr && tr[0] && tr[0].value) || []).filter((t) => t && t.id && !t.bhbcGhost && t.status !== 'archived').map((t) => '/coach/athletes/' + t.id);
const pages = ['/coach/review', '/coach/workouts', '/coach/sessions', ...athletes];

const b = await P.connect({ browserURL: process.env.CDP || 'http://[::1]:9444', defaultViewport: null, protocolTimeout: 300000 });
const ctx = await b.createBrowserContext();
const pg = await ctx.newPage();
await pg.setViewport({ width: 1366, height: 900 });
const seen = new Map();   // url -> first page
const bad = [];
pg.on('response', (rs) => { const u = rs.url(); if (/supabase\.co\/storage\//.test(u) && rs.status() >= 400) bad.push(rs.status() + ' ' + u.replace(/^.*\/object\//, '').slice(0, 80)); });
let fails = 0;
try {
  await pg.evaluateOnNewDocument(() => { try { sessionStorage.setItem('expo-portal-choice', 'trainer'); localStorage.setItem('expo-lang', 'en'); } catch (e) {} });
  let ok = false; for (let k = 0; k < 3 && !ok; k++) { await signIn(pg, BASE); ok = await assertAuthed(pg, BASE); }
  if (!ok) throw new Error('could not sign in');
  console.log('seat sandbox flag:', await pg.evaluate(() => window.__expoSandbox));
  for (const r of pages) {
    await pg.goto(BASE + r, { waitUntil: 'domcontentloaded' });
    await wait(5000);
    for (let pass = 0; pass < 3; pass++) { const n = await pg.evaluate(() => { const c = [...document.querySelectorAll('.title-strip[aria-expanded="false"]')]; c.forEach((x) => x.click()); return c.length; }); if (!n) break; await wait(1200); }
    await wait(1500);
    const urls = await pg.evaluate(() => [...document.querySelectorAll('video, audio, source, img')].map((e) => e.currentSrc || e.src || e.getAttribute('src') || '').filter((u) => /supabase\.co\/storage\//.test(u)));
    for (const u of urls) if (!seen.has(u)) seen.set(u, r);
  }
  // fetch each from HIS page: his session, same origin rules as the app
  const results = [];
  for (const [u, r] of seen) {
    const st = await pg.evaluate(async (url) => { try { const x = await fetch(url, { headers: { Range: 'bytes=0-1023' } }); return x.status; } catch (e) { return 'ERR ' + e.message; } }, u);
    results.push({ u, r, st });
    if (!(st === 200 || st === 206)) { fails++; console.log(`BROKEN ${st} on ${r}: ${u.replace(/^.*\/object\//, '').slice(0, 90)}`); }
  }
  const kinds = results.reduce((a, x) => { const k = /\.(mp4|mov|webm)/i.test(x.u) ? 'video' : /\.(webm|m4a|mp3|ogg|wav)/i.test(x.u) ? 'audio' : 'image'; a[k] = (a[k] || 0) + 1; return a; }, {});
  console.log(`${pages.length} pages, ${results.length} storage files shown (${JSON.stringify(kinds)}), ${fails} broken; storage 4xx seen while browsing: ${bad.length}${bad.length ? ' e.g. ' + bad[0] : ''}`);
  if (!results.length) { fails++; console.log('FAIL: measured no media at all - not a pass'); }
  if (bad.length) fails++;
} catch (e) { fails++; console.log('FAIL: ' + e.message); }
finally { await ctx.close(); b.disconnect(); }
process.exit(fails ? 1 : 0);
