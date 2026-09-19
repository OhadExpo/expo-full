// PASS 2 OF THE MOBILE AUDIT — LOOK AT THE PHONE SCREEN, IN HIS STATE.
//
// Every phone complaint he has ever made passed the rect gates first: the
// dropdown that opened off-screen, the text at one letter per line, the 3px
// logo, the money card contradicting itself. They were all one second of
// LOOKING, and none of them was reachable by a route sweep, because a route
// sweep photographs the page as it LANDS - menus shut, sections collapsed,
// nothing open.
//
// So this opens things first. For each surface it clicks the thing a coach
// actually clicks on a phone - the burger, the ⋮, a submenu, a collapsed
// section - waits, and shoots. Then I read the PNGs.
//
//   node scripts/phone-eyes.mjs [width] [lang]
//
// Output: audit-out/phone-eyes/<lang>-<width>-<name>.png
import fs from 'node:fs';
import P from 'puppeteer-core';
import { signIn } from './lib/authed-page.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:5199';
const W = Number(process.argv[2] || 390);
const LANG = process.argv[3] || 'he';
const DIR = 'audit-out/phone-eyes';
fs.mkdirSync(DIR, { recursive: true });

// name, route, and what to OPEN before shooting. Each opener is a list of
// strings; the first visible clickable whose text contains one is clicked.
const SHOTS = [
  ['dashboard-landing', '/coach/dashboard', []],
  ['dashboard-more', '/coach/dashboard', ['⋮']],
  ['athletes-submenu', '/coach/athletes', ['Athletes', 'מתאמנים']],
  ['sessions-open', '/coach/sessions', []],
  ['bhbc-landing', '/coach/bhbc', []],
  ['bhbc-roster', '/coach/bhbc', ['Roster', 'סגל']],
  ['bhbc-weightroom', '/coach/bhbc', ['Weight Room', 'חדר כוח']],
  ['bhbc-medical', '/coach/bhbc', ['Medical', 'רפואי']],
  ['bhbc-schedule', '/coach/bhbc', ['Schedule', 'לוח']],
  ['bhbc-games', '/coach/bhbc', ['Games', 'משחקים']],
  ['programs', '/coach/programs', []],
  ['billing', '/coach/billing', []],
  ['tasks', '/coach/tasks', []],
  ['athlete-portal', '/athlete', []],
  ['demo-athlete', '/demo/athlete', []],
  ['demo-coach', '/demo/coach', []],
];

const b = await P.connect({ browserURL: process.env.CDP || 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 300000 });
const page = await b.newPage();
let shot = 0;
try {
  await signIn(page, BASE);
  await page.evaluate((l) => {
    localStorage.setItem('expo-lang', l);
    localStorage.setItem('expo-collapse:bhbc-lang', JSON.stringify(l));
  }, LANG);
  await page.setViewport({ width: W, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });

  for (const [name, route, openers] of SHOTS) {
    await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await new Promise((r) => setTimeout(r, 4500));
    for (const want of openers) {
      const hit = await page.evaluate((txt) => {
        const els = [...document.querySelectorAll('button,[role="tab"],a,summary,[role="button"]')];
        const vis = els.filter((e) => {
          const r = e.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden';
        });
        const t = vis.find((e) => (e.textContent || '').trim().includes(txt));
        if (!t) return null;
        t.click();
        return (t.textContent || '').trim().slice(0, 30);
      }, want);
      if (hit) { await new Promise((r) => setTimeout(r, 2500)); break; }
    }
    const file = `${DIR}/${LANG}-${W}-${name}.png`;
    // TOP=1 shoots the VIEWPORT, not the page. A 22,000px full-page PNG is
    // unreadable when you actually look at it, and the menu-open cases are
    // exactly the ones that need reading - the complaint is always about what
    // is on screen when the menu opens, not about the page's whole length.
    await page.screenshot({ path: file, fullPage: process.env.TOP !== '1' });
    // A screenshot of a blank page is not evidence of anything, so say how much
    // was on it. A tiny one means the surface did not render and the "look" was
    // as empty as the gate sweeps of /book/ were.
    const chars = await page.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' ').trim().length);
    const h = await page.evaluate(() => document.documentElement.scrollHeight);
    const sideways = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    console.log(`${String(chars).padStart(5)} chars · ${String(h).padStart(5)}px tall${sideways ? ' · SCROLLS SIDEWAYS' : ''}  ${name}`);
    shot++;
  }
} catch (e) {
  console.log('ERROR', e.message);
  process.exitCode = 1;
} finally { await page.close().catch(() => {}); b.disconnect(); }
console.log(`\n${shot} of ${SHOTS.length} surfaces photographed at ${W}px in ${LANG} → ${DIR}/`);
