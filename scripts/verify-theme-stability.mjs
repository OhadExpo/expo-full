// YOUR CHOICE MUST SURVIVE NAVIGATION.
//
// Ohad, 2026-09-02: "when i click on dashboard on expo it automatically turns
// it to light mode... sweep for anything like it, that's a bug, all platform
// search."
//
// The cause was a mount effect: useTheme read user_metadata.theme_pref and
// applied it, and EVERY component calling useTheme ran it, so opening a screen
// that mounted a new consumer snapped the theme back to the stored value. The
// bug class is general — a screen quietly overwriting a choice the user made
// somewhere else — and the only way to find the rest is to make the choice,
// walk every route, and see whether it holds.
//
// The theme is deliberately DIVERGED from what the account holds before the
// walk: local says one thing, the server says another. That is the state a
// failed write leaves behind, and it is the state in which the fault appears.
// Setting it to the same value the server holds would pass no matter what.
//
//   node scripts/verify-theme-stability.mjs [base]
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { signIn } from './lib/authed-page.mjs';

const routesFromManifest = () => {
  try {
    const md = fs.readFileSync('docs/SURFACES.md', 'utf8');
    return [...new Set([...md.matchAll(/`(\/[a-z0-9/-]*)`/gi)].map((m) => m[1]))]
      .filter((r) => !/\/(login|intake)/.test(r));
  } catch { return ['/coach/dashboard', '/coach/athletes', '/coach/bhbc']; }
};

const BASE = process.argv[2] || 'http://127.0.0.1:5199';
const ROUTES = process.argv.length > 3 ? process.argv.slice(3) : routesFromManifest();

const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 600000 });
// A clean context: the debug profile carries whatever theme it was last left
// in, and this test is about what the APP does, not the profile.
const ctx = await (browser.createBrowserContext ? browser.createBrowserContext() : browser.createIncognitoBrowserContext());
const page = await ctx.newPage();
await page.setViewport({ width: 1400, height: 1000 });

let bad = 0;
try {
  await signIn(page, BASE);
  await page.goto(BASE + '/coach/athletes', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await new Promise((r) => setTimeout(r, 9000));

  const remote = await page.evaluate(async () => {
    try {
      const m = await import('/src/supabase.js');
      const { data } = await m.supabase.auth.getUser();
      return (data && data.user && data.user.user_metadata && data.user.user_metadata.theme_pref) || null;
    } catch { return null; }
  });
  // Pick the theme the account does NOT hold, so a stale-preference override
  // has something to override.
  const want = remote === 'dark' ? 'light' : 'dark';
  await page.evaluate((t) => {
    document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem('expo-theme', t); } catch { /* private mode */ }
  }, want);
  console.log('account theme_pref=' + remote + ' — walking every route with the theme set to ' + want.toUpperCase());

  for (const route of ROUTES) {
    await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await new Promise((r) => setTimeout(r, 4500));
    const got = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    // A surface may legitimately pin its own theme for its whole subtree (the
    // athlete portal is always dark, BHBC is its own light zone). Those set it
    // on a WRAPPER, not on the root, so a change at the ROOT is the fault.
    if (got === want) { console.log('ok    ' + route); continue; }
    bad++;
    console.log('FLIP  ' + route + '  theme became ' + got + ' (was ' + want + ')');
    // Put it back so one bad route does not cascade into every route after it.
    await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), want);
  }
} catch (e) {
  console.log('SWEEP ERROR:', String(e.message || e).split('\n')[0]);
  process.exitCode = 1;
} finally {
  await page.close().catch(() => {});
  await ctx.close().catch(() => {});
  browser.disconnect();
}
console.log('\n' + bad + ' route(s) that changed the theme out from under the user');
process.exit(bad ? 1 : 0);
