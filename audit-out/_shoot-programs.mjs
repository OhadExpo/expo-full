// #551: the phone Programs list as he sees it (owner seat, real phone emulation), en + he
import P from 'puppeteer-core';
import { setWidth } from '../scripts/lib/viewport.mjs';
const { signIn, assertAuthed } = await import('../scripts/lib/authed-page.mjs');
const BASE = process.env.BASE || 'http://127.0.0.1:5320';
const VIEW = process.env.VIEW || 'table';
const OUT = process.env.OUT || 'audit-out/look-1004/prog';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await P.connect({ browserURL: process.env.CDP || 'http://127.0.0.1:9444', defaultViewport: null, protocolTimeout: 180000 });
for (const L of (process.env.LANGS || 'en,he').split(',')) {
  const ctx = await b.createBrowserContext(); const pg = await ctx.newPage();
  await setWidth(pg, Number(process.env.W || 390), 844);
  await pg.setBypassServiceWorker(true);
  await pg.evaluateOnNewDocument((L, V) => { try { sessionStorage.setItem('expo-portal-choice', 'trainer'); localStorage.setItem('expo-lang', L); localStorage.setItem('expo-collapse:programs-view-mode', JSON.stringify(V)); localStorage.setItem('expo-install-snooze-until', String(Date.now() + 86400000)); } catch (e) {} }, L, VIEW);
  let authed = false; for (let k = 0; k < 3 && !authed; k++) { await signIn(pg, BASE); authed = await assertAuthed(pg, BASE); }
  await pg.goto(BASE + '/coach/programs', { waitUntil: 'domcontentloaded' });
  await pg.waitForSelector('.prog-phone-list, .prog-striphdr', { timeout: 30000 }).catch(() => {});
  await wait(2500);
  const el = await pg.$(VIEW === 'table' ? '.prog-phone-list' : '.prog-striphdr');
  if (el) { await el.evaluate((e) => e.scrollIntoView({ block: 'start' })); await wait(400); }
  await pg.screenshot({ path: `${OUT}-${VIEW}-${L}.png`, clip: el ? await el.boundingBox().then((bb) => ({ x: 0, y: bb.y, width: 390, height: VIEW === 'table' ? Math.min(1200, bb.height) : 1100 })) : undefined });
  console.log('shot', `${OUT}-${VIEW}-${L}.png`, authed);
  await ctx.close();
}
await b.disconnect();
