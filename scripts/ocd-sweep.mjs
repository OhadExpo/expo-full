// #106 — THE OCD SWEEP. Every surface, phone width, both languages, both themes.
//
// Ohad: "a full trillion token design of bhbc and expo. mobile. chrome.
// hebrew. english. dark. light. ocd. design. titles. texts. boxes. tags.
// buttons. everything".
//
// This does not judge taste. It measures the defect classes he has actually
// pointed at, each one reduced to a number a machine can check:
//
//   SIDEWAYS    the page scrolls horizontally at all.
//   CLIPPED     a text node's NATURAL width exceeds the box that holds it, so
//               a glyph is being sliced ("₪2,30C"). Measured with an offscreen
//               clone - Range.getClientRects() is clipped BY overflow:hidden
//               and can never see this.
//   OFFSCREEN   a visible element sticks out past the viewport edge.
//   TINYTAP     a button or link under 40px in either dimension.
//   COLLIDE     two text leaves whose boxes overlap - text with no space of
//               its own.
//   RAGGED      siblings in one container that start at different insets from
//               the container's own start edge. This is the asymmetry he keeps
//               photographing.
//   UNEVEN      chips/buttons side by side in one row at different heights.
//   ORPHAN      a grid whose last row holds fewer items than it has columns,
//               with 3+ columns - the "3 + 1" that is not OCD order.
//   EDGEFLIP    in RTL, a text block whose ink hugs the LEFT edge while its
//               siblings hug the right (the KPI defect), and the mirror in LTR.
//
// Every finding carries the element, the numbers, and the surface, so the fix
// lands on the right element - three clipping "fixes" once went to the wrong
// one because the summary line did not say which.
//
//   node scripts/ocd-sweep.mjs [--zone|--expo|--all] [--w 390] [--only NAME]
//
// Writes audit-out/ocd/<lang>-<theme>-<surface>.png and a findings JSON.
import fs from 'node:fs';
import P from 'puppeteer-core';
import { signIn } from './lib/authed-page.mjs';
import { PROBE } from './lib/ocd-probe.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:5199';
const W = Number((process.argv.find((a) => a.startsWith('--w=')) || '').slice(4)) || 390;
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7);
const SCOPE = process.argv.includes('--expo') ? 'expo' : process.argv.includes('--all') ? 'all' : 'zone';
const SHOOT = !process.argv.includes('--no-shot');
const DIR = 'audit-out/ocd';
fs.mkdirSync(DIR, { recursive: true });

// A surface is a route plus, optionally, the thing to click to reach the view
// that actually has the complaint on it. A route sweep photographs pages as
// they LAND - tabs unopened, modals shut - and every phone defect he has ever
// reported was behind one of those clicks.
const ZONE = [
  ['zone-overview', '/coach/bhbc', []],
  ['zone-roster', '/coach/bhbc', ['Roster', 'סגל']],
  ['zone-schedule', '/coach/bhbc', ['Schedule', 'לו']],
  ['zone-weightroom', '/coach/bhbc', ['Weight Room', 'חדר כוח']],
  ['zone-medical', '/coach/bhbc', ['Medical', 'רפואי']],
  ['zone-games', '/coach/bhbc', ['Games', 'משחקים']],
  ['zone-sessions', '/coach/bhbc', ['Sessions', 'אימונים']],
  ['zone-activity', '/coach/bhbc', ['Activity', 'פעילות']],
  ['zone-modal-practice', '/coach/bhbc', ['+ LOG PRACTICE', '+ רישום אימון']],
  ['zone-modal-roster', '/coach/bhbc', ['MANAGE ROSTER', 'ניהול הסגל']],
];
const EXPO = [
  ['expo-dashboard', '/coach/dashboard', []],
  ['expo-athletes', '/coach/athletes', []],
  ['expo-programs', '/coach/programs', []],
  ['expo-exercises', '/coach/exercises', []],
  ['expo-sessions', '/coach/sessions', []],
  ['expo-review', '/coach/review', []],
  ['expo-tasks', '/coach/tasks', []],
  ['expo-billing', '/coach/billing', []],
  ['expo-intake', '/coach/intake', []],
  ['expo-waitlist', '/coach/waitlist', []],
];
let SURFACES = SCOPE === 'expo' ? EXPO : SCOPE === 'all' ? [...ZONE, ...EXPO] : ZONE;
if (ONLY) SURFACES = SURFACES.filter((s) => s[0].includes(ONLY));

// ---------------------------------------------------------------- the driver
const b = await P.connect({ browserURL: process.env.CDP || 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 300000 });
const all = [];
let measured = 0, skipped = 0;
for (const LANG of ['en', 'he']) {
  for (const THEME of ['dark', 'light']) {
    const page = await b.newPage();
    try {
      await signIn(page, BASE);
      await page.evaluate((l) => {
        localStorage.setItem('expo-lang', l);
        localStorage.setItem('expo-collapse:bhbc-lang', JSON.stringify(l));
      }, LANG);
      await page.setViewport({ width: W, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
      for (const [name, route, openers] of SURFACES) {
        await page.goto(`${BASE}${route}${route.includes('?') ? '&' : '?'}theme=${THEME}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await new Promise((r) => setTimeout(r, 4600));
        for (const label of ['אחר כך', 'Later', 'Maybe later', 'Dismiss', 'Not now']) {
          const gone = await page.evaluate((t) => {
            const x = [...document.querySelectorAll('button')].find((e) => (e.textContent || '').trim() === t);
            if (!x) return false; x.click(); return true;
          }, label);
          if (gone) { await new Promise((r) => setTimeout(r, 1200)); break; }
        }
        let opened = null;
        for (const want of openers) {
          opened = await page.evaluate((txt) => {
            const els = [...document.querySelectorAll('button,[role="tab"],a,summary,[role="button"]')]
              .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
            // CASE-INSENSITIVE, because textContent is not what is on screen.
            // The zone's buttons read "MANAGE ROSTER" and "+ LOG PRACTICE"
            // only because CSS uppercases them; textContent is "Manage roster"
            // and "+ Log practice". Matching the uppercase literal opened
            // neither modal in English — four combinations silently skipped,
            // and the modals are exactly where the complaints are. Hebrew has
            // no case, so it matched there and the hole was invisible.
            const needle = txt.toLowerCase();
            const t = els.find((e) => (e.textContent || '').trim().toLowerCase().includes(needle));
            if (!t) return null; t.click(); return (t.textContent || '').trim().slice(0, 24);
          }, want);
          if (opened) { await new Promise((r) => setTimeout(r, 2600)); break; }
        }
        // A finding list is worthless if the window was not the width claimed,
        // or the surface never opened. Say so instead of reporting a zero.
        const res = await page.evaluate(PROBE);
        if (Math.abs(res.vw - W) > 3) { console.log(`  SKIP ${LANG}/${THEME}/${name}: window is ${res.vw}px, not ${W}`); skipped++; continue; }
        if (openers.length && !opened) { console.log(`  SKIP ${LANG}/${THEME}/${name}: never opened (${openers.join(' / ')})`); skipped++; continue; }
        if (res.chars < 120) { console.log(`  SKIP ${LANG}/${THEME}/${name}: only ${res.chars} chars rendered`); skipped++; continue; }
        measured++;
        if (SHOOT) await page.screenshot({ path: `${DIR}/${LANG}-${THEME}-${name}.png`, fullPage: true });
        for (const f of res.findings) all.push({ ...f, lang: LANG, theme: THEME, surface: name });
        const byKind = {};
        for (const f of res.findings) byKind[f.kind] = (byKind[f.kind] || 0) + 1;
        console.log(`  ${LANG}/${THEME}/${name.padEnd(20)} ${res.chars} chars · ${res.findings.length} finding(s)`
          + (res.findings.length ? '  ' + Object.entries(byKind).map(([k, n]) => `${k}:${n}`).join(' ') : ''));
      }
    } catch (e) { console.log(`ERROR ${LANG}/${THEME}: ${e.message}`); }
    finally { await page.close().catch(() => {}); }
  }
}
b.disconnect();

const total = SURFACES.length * 4;
const byKind = {};
for (const f of all) byKind[f.kind] = (byKind[f.kind] || 0) + 1;
console.log(`\n${measured} of ${total} surface x language x theme combinations measured (${skipped} skipped), ${all.length} finding(s)`);
console.log(Object.entries(byKind).sort((a, c) => c[1] - a[1]).map(([k, n]) => `  ${k.padEnd(10)} ${n}`).join('\n') || '  none');
fs.writeFileSync(`${DIR}/findings-${W}.json`, JSON.stringify({ w: W, measured, skipped, total, findings: all }, null, 1));
console.log(`\nwritten ${DIR}/findings-${W}.json`);
if (skipped) process.exitCode = 1;
