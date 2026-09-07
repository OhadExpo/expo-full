// THE PAGE MUST NOT CHANGE THEME AFTER IT IS PAINTED.
//
// Ohad: "when i first log in to expo/bhbc there's sometimes glitches with
// light/dark mode." The cause was that useTheme reads user_metadata.theme_pref
// from Supabase on mount and applies it if it differs — a NETWORK round-trip,
// so the flip lands after the page is already on screen. It only fires when the
// local and remote values disagree (a first login on this device, or a toggle
// made on another), which is exactly why it was intermittent.
//
// This forces the disagreement: it sets localStorage to the OPPOSITE of the
// stored session's preference, reloads, and watches data-theme for any change
// after first paint.
import P from 'puppeteer-core';
import * as A from './lib/authed-page.mjs';
import { setWidth } from './lib/viewport.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:5199';
const b = await P.connect({ browserURL: (process.env.CDP || 'http://127.0.0.1:9222'), defaultViewport: null, protocolTimeout: 300000 });
const pg = await b.newPage();
await A.signIn(pg, BASE);
await setWidth(pg, 1400, 900);
let bad = 0;
for (const route of ['/coach', '/coach/bhbc', '/athlete']) {
  await pg.goto(BASE + route, { waitUntil: 'domcontentloaded' });
  await new Promise((r) => setTimeout(r, 6000));
  // Force local and remote apart, the way a second device does.
  const forced = await pg.evaluate(() => {
    let remote = null;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !/^sb-.*-auth-token$/.test(k)) continue;
      let raw = localStorage.getItem(k);
      if (raw && raw.indexOf('base64-') === 0) raw = atob(raw.slice(7));
      try {
        const sess = JSON.parse(raw);
        const u = sess && (sess.user || (sess.currentSession && sess.currentSession.user));
        const t = u && u.user_metadata && u.user_metadata.theme_pref;
        if (t === 'light' || t === 'dark') { remote = t; break; }
      } catch (e) { /* ignore */ }
    }
    if (!remote) return null;
    localStorage.setItem('expo-theme', remote === 'dark' ? 'light' : 'dark');
    return remote;
  });
  if (!forced) { console.log(`skip  ${route} — no theme_pref on the stored session to disagree with`); continue; }
  // Watch data-theme from the very first paint.
  await pg.evaluateOnNewDocument(() => {
    window.__themeChanges = [];
    const push = () => window.__themeChanges.push(document.documentElement.getAttribute('data-theme'));
    document.addEventListener('DOMContentLoaded', () => {
      push();
      new MutationObserver(push).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    });
  });
  await pg.goto(BASE + route, { waitUntil: 'domcontentloaded' });
  await new Promise((r) => setTimeout(r, 8000));
  const changes = await pg.evaluate(() => window.__themeChanges || []);
  const distinct = [...new Set(changes)];
  const ok = distinct.length <= 1;
  if (!ok) bad++;
  console.log(`${ok ? 'ok   ' : 'FAIL '} ${route}  remote=${forced}  data-theme after paint: ${JSON.stringify(changes)}`);
}
console.log(bad ? `\n${bad} route(s) that flip theme after painting` : '\n0 routes — the theme never changes after the page is painted');
await pg.close(); b.disconnect();
process.exit(bad ? 1 : 0);
