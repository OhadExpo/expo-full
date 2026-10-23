// THE LIVE CLUB LOOKS THE SAME (team version #904). The zone now wears a club config; Herzliya's must render
// pixel-identical to the zone before the config existed.
//
//   node scripts/verify-club-pixel-parity.mjs shoot <dir>     - screenshot every zone page (en + he, light + dark,
//                                                               390 + 1440) into <dir>
//   node scripts/verify-club-pixel-parity.mjs diff <a> <b>    - compare two shoots; exit 1 on any page that differs
//
// Shoot <a> on the code BEFORE a change and <b> after, minutes apart (the zone shows live data). READ-ONLY: signs in
// as the owner and only navigates.
import puppeteer from 'puppeteer-core';
import { PNG } from 'pngjs';
import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { signIn } from './lib/authed-page.mjs';

const [mode, a, b] = process.argv.slice(2);
const BASE = process.env.BASE || 'http://127.0.0.1:5392';
const PAGES = (process.env.PAGES || 'overview,roster,schedule,practices,lifts,medical,games,activity').split(',');
const WIDTHS = (process.env.WIDTHS || '390,1440').split(',').map(Number);
const LANGS = (process.env.LANGS || 'en,he').split(',');
const THEMES = (process.env.THEMES || 'light,dark').split(',');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

if (mode === 'shoot') {
  mkdirSync(a, { recursive: true });
  const br = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
  let n = 0;
  for (const lang of LANGS) for (const theme of THEMES) {
    const ctx = await br.createBrowserContext(); const p = await ctx.newPage();
    await p.evaluateOnNewDocument((l, th) => { try { sessionStorage.setItem('bhbc-lang-session', l); localStorage.setItem('expo-collapse:bhbc-theme', JSON.stringify(th)); localStorage.setItem('expo-gate-run', '1'); } catch { /* */ } }, lang, theme);
    await p.setViewport({ width: 1440, height: 900 });
    await signIn(p, BASE);
    for (const w of WIDTHS) {
      await p.setViewport({ width: w, height: 900, isMobile: w < 600, hasTouch: w < 600 });
      for (const pg of PAGES) {
        let ok = false;
        for (let tryN = 0; tryN < 3 && !ok; tryN++) {
          try {
            await p.goto(`${BASE}/coach/bhbc/${pg}`, { waitUntil: 'domcontentloaded' });
            await p.waitForFunction(() => document.querySelector('.bhbc-zone') && document.body.innerText.length > 400, { timeout: 30000, polling: 500 });
            await wait(4500);
            // every image decoded (the crest raced the shot: 412 px of "difference" that was a half-painted logo)
            await p.evaluate(() => Promise.race([new Promise((r) => setTimeout(r, 4000)), Promise.all([...document.images].map((i) => (i.complete ? (i.decode ? i.decode().catch(() => {}) : null) : new Promise((r) => { i.onload = r; i.onerror = r; }))))]));   // decode() never settles in a hidden tab: 4 s cap
            ok = true;
          } catch (e) { console.log('retry', pg, String(e.message || e).slice(0, 80)); }
        }
        // caret, transitions and the settle-in motion off: only layout + colour are compared
        await p.addStyleTag({ content: '*,*::before,*::after{transition:none!important;animation:none!important;caret-color:transparent!important}' });
        await wait(300);
        const buf = await p.screenshot({ fullPage: true });
        writeFileSync(`${a}/${lang}-${theme}-${w}-${pg}.png`, buf); n++;
      }
    }
    await ctx.close();
  }
  br.disconnect();
  console.log(`shot ${n} pages into ${a}`);
} else if (mode === 'diff') {
  let bad = 0, same = 0;
  for (const f of readdirSync(a).filter((x) => x.endsWith('.png'))) {
    if (!existsSync(`${b}/${f}`)) { console.log('MISSING', f); bad++; continue; }
    const A = PNG.sync.read(readFileSync(`${a}/${f}`)), B = PNG.sync.read(readFileSync(`${b}/${f}`));
    if (A.width !== B.width || A.height !== B.height) { console.log('SIZE', f, `${A.width}x${A.height}`, '->', `${B.width}x${B.height}`); bad++; continue; }
    let d = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    for (let y = 0; y < A.height; y++) for (let x = 0; x < A.width; x++) {
      const i = (y * A.width + x) * 4;
      if (Math.abs(A.data[i] - B.data[i]) + Math.abs(A.data[i + 1] - B.data[i + 1]) + Math.abs(A.data[i + 2] - B.data[i + 2]) > 6) { d++; if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
    }
    if (d) { console.log('DIFF', f, d, 'px in', `${x0},${y0}..${x1},${y1}`); bad++; } else same++;
  }
  console.log(`${same} identical, ${bad} differ`);
  process.exit(bad ? 1 : 0);
} else { console.log('usage: shoot <dir> | diff <a> <b>'); process.exit(2); }
