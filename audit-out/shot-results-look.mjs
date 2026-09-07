// LOOK at the Shot Analyzer's results screen, in Hebrew and English, from the
// owner seat, on a real clip. Slow (a full MediaPipe pass) but it is the only
// honest way to see the checkpoint rows, the phase chips and the makes bar.
//   CDP=http://127.0.0.1:9223 CLIP=public/testclips/clip02.mp4 node audit-out/shot-results-look.mjs
import P from 'puppeteer-core';
import path from 'node:path';
import { setWidth } from '../scripts/lib/viewport.mjs';
const BASE = process.env.BASE || 'http://127.0.0.1:4173';
const CLIP = path.resolve(process.env.CLIP || 'public/testclips/clip02.mp4');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await P.connect({ browserURL: (process.env.CDP || 'http://127.0.0.1:9222'), defaultViewport: null, protocolTimeout: 900000 });

for (const lang of (process.env.LANGS || 'he,en').split(',')) {
  const pg = await b.newPage();
  await pg.evaluateOnNewDocument((l) => { try { localStorage.setItem('expo-lang', l); } catch (e) { /* ignore */ } }, lang);
  try {
    await pg.goto(BASE + '/login', { waitUntil: 'domcontentloaded', timeout: 90000 });
    await pg.evaluate((l) => { try { localStorage.clear(); sessionStorage.clear(); localStorage.setItem('expo-lang', l); } catch (e) { /* ignore */ } }, lang);
    await pg.goto(BASE + '/login', { waitUntil: 'domcontentloaded', timeout: 90000 });
    await wait(3500);
    await pg.evaluate(() => {
      const ins = [...document.querySelectorAll('input')];
      const e = ins.find((i) => /email/i.test(i.type + i.placeholder + i.name));
      const p = ins.find((i) => i.type === 'password');
      const set = (el, v) => { Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
      if (e) set(e, 'ohadyproductions@gmail.com'); if (p) set(p, '1234');
    });
    await wait(400);
    await pg.evaluate(() => { const x = [...document.querySelectorAll('button')].find((y) => /^\s*(sign\s*in|כניסה)\s*$/i.test(y.textContent || '')); if (x) x.click(); });
    await wait(9000);
    await setWidth(pg, 1400, 1000);
    await pg.goto(BASE + '/coach/review-tools', { waitUntil: 'domcontentloaded', timeout: 90000 });
    await wait(12000);
    await pg.evaluate(() => { const x = [...document.querySelectorAll('button,a')].find((e) => /maybe later|dismiss|אחר כך/i.test(e.textContent || '')); if (x) x.click(); }).catch(() => {});
    // Open the shot tool.
    // Each tool row ends in an '→ OPEN' button; the analyser is the last row.
    const opened = await pg.evaluate(() => { const opens = [...document.querySelectorAll('button,a,span')].filter((e) => /^(open|פתח)/i.test((e.textContent || '').trim()) && (e.textContent || '').length < 12); const el = opens[opens.length - 1]; if (!el) return null; el.click(); return (el.textContent || '').trim() + ' (' + opens.length + ' rows)'; });
    console.log(`${lang}: opened "${opened}"`);
    await wait(3000);
    // The analyser keeps its OWN language switch (עב / EN) in its header.
    if (lang === 'he') { const t = await pg.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => (x.textContent || '').trim() === 'עב'); if (!b) return false; b.click(); return true; }); console.log(`${lang}: analyser switched to Hebrew: ${t}`); await wait(1500); }
    // Feed the clip through the file input.
    const input = await pg.$('input[type="file"]');
    if (!input) { console.log(`${lang}: no file input on the shot tool`); await pg.screenshot({ path: `audit-out/shot-results-${lang}-nofile.png` }); continue; }
    await input.uploadFile(CLIP);
    console.log(`${lang}: clip handed over, waiting for the results...`);
    let ready = false;
    for (let i = 0; i < 180; i++) {
      await wait(5000);
      ready = await pg.evaluate(() => /\/\s*100|\/ 100|100\s*\//.test(document.body.innerText || '') && !!document.querySelector('.shot-check-row'));
      if (ready) break;
    }
    console.log(`${lang}: results ${ready ? 'on screen' : 'NOT on screen after 15 min'}`);
    const text = await pg.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' '));
    const latin = (text.match(/[A-Za-z]{3,}/g) || []).filter((w) => !/^(EXPO|EN|FPS|PPG|RTP|Google|BHBC|MD|SEC|ECC)$/i.test(w));
    console.log(`${lang}: ${latin.length} Latin words${lang === 'he' && latin.length ? ' - ' + [...new Set(latin)].slice(0, 25).join(', ') : ''}`);
    const jumps = await pg.evaluate(() => [...document.querySelectorAll('.shot-check-row button')].filter((b) => /▸/.test(b.textContent || '')).length);
    const rows = await pg.evaluate(() => document.querySelectorAll('.shot-check-row').length);
    console.log(`${lang}: ${rows} checkpoint rows, ${jumps} jump buttons`);
    // The eight metric tiles: every number's top edge, so a wrapped label
    // cannot push one number below the others' unnoticed.
    const tops = await pg.evaluate(() => [...document.querySelectorAll('.shot-metric-v')].map((e) => Math.round(e.getBoundingClientRect().top)));
    const rowsOf = {}; for (const t of tops) { const k = Math.round(t / 40); rowsOf[k] = rowsOf[k] || []; rowsOf[k].push(t); }
    const spread = Object.values(rowsOf).map((r) => Math.max(...r) - Math.min(...r));
    console.log(`${lang}: metric numbers tops ${JSON.stringify(tops)} - within-row spread ${JSON.stringify(spread)}px`);
    await pg.screenshot({ path: `audit-out/shot-results-${lang}.png` });
    await pg.screenshot({ path: `audit-out/shot-results-${lang}-full.png`, fullPage: true });
  } catch (e) {
    console.log(`${lang}: FAILED ${String(e.message).slice(0, 140)}`);
  } finally {
    await pg.close().catch(() => {});
  }
}
b.disconnect();
