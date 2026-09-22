// Light/dark parity sweep. Ohad's rule: layout must be IDENTICAL in both
// themes, only colour differs (reference_theme_geometry_parity). This measures
// the geometry of every route in both themes and reports any element whose box
// moves or resizes when only the theme changes — plus contrast offenders where
// text lands on a background it cannot be read against.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { setWidth } from './lib/viewport.mjs';
import { CONTRAST_FN } from './lib/contrast.mjs';

const OUT = process.env.AUDIT_OUT || (process.argv[2] || '.');
const BASE = process.argv[3] || 'http://localhost:5199';
// THE ROUTES COME FROM THE MANIFEST, not from a list that falls behind it.
// A hand-written list had 17 entries while docs/SURFACES.md names 23 coach
// routes, and /coach/calendar was one of the six it never covered — which is
// exactly where a white button on a pale-cyan strip survived all day.
const coachRoutes = () => {
  try {
    const md = fs.readFileSync('docs/SURFACES.md', 'utf8');
    return [...new Set([...md.matchAll(/`(\/coach(?![a-z])[a-z0-9/-]*)`/gi)].map((m) => m[1]))].filter((r) => !/:|\/$/.test(r));
  } catch (e) { return ['/coach/dashboard']; }
};
const ROUTES = process.argv.length > 4 ? process.argv.slice(4)
  : [...coachRoutes(), '/athlete', '/demo/coach', '/demo/athlete', '/try'];

const b = await puppeteer.connect({ browserURL: (process.env.CDP || 'http://127.0.0.1:9222'), protocolTimeout: 180000 });
const page = await b.newPage();
// WIDTH from the environment. The sweep only ever ran at 1440, and a theme
// fault that only exists in the phone layout (a strip that becomes a column,
// a chip that wraps onto a different background) could never be seen there.
const W = Number(process.env.W) || 1440;
await setWidth(page, W, W < 700 ? 844 : 950);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Load the route with ?theme=… so public/boot-theme.js applies it BEFORE paint.
// Setting data-theme from the outside does not hold: the app's own theme hook
// re-applies the attribute after mount, so the sample could silently be taken in
// the wrong theme — and then "geometry identical" would be trivially true and
// completely meaningless.
// Sample the element count and document height until two consecutive samples
// agree. Cheap, and it is the actual property that matters: nothing has moved.
//
// AND IT SAYS WHEN IT GAVE UP. The first version returned the last sample after
// 15 tries with no signal that the page had never stopped moving, so the
// comparison went ahead on a half-rendered page and reported it as drift.
// Measured 22.9 at 390: /coach/review-tools came back moved=2, countDelta=-93,
// root 844 tall in dark and 950 in light — which is not a theme fault at all,
// it is the pose lab still mounting in one of the two passes. A phantom finding
// is worse than no finding: it is indistinguishable from a real one.
let settledOk = true;
const settle = async (tries = 26, gapMs = 400) => {
  let prev = null;
  for (let i = 0; i < tries; i++) {
    // AND NOTHING IS STILL ANIMATING. Element count and page height both go
    // still while a section is part-way through its 260ms grid-template-rows
    // transition, so the old signature could call a page settled mid-animation
    // — /coach/dashboard reported moved=20 with a 1517px delta once in four
    // runs and was clean the other three. getAnimations() is the actual signal.
    const sig = await page.evaluate(() => {
      const running = document.getAnimations
        ? document.getAnimations().filter((a) => a.playState === 'running').length
        : 0;
      return document.querySelectorAll('*').length + ':' + Math.round(document.body.scrollHeight)
        + ':' + Math.round(document.body.scrollWidth) + ':anim' + running;
    });
    if (sig === prev) return sig;
    prev = sig;
    await wait(gapMs);
  }
  settledOk = false;
  return prev;
};

const loadIn = async (route, theme) => {
  // settledOk is per ROUTE: it is cleared before the dark pass and read after the
  // light one, so either pass failing to settle disqualifies the comparison.
  const url = `${BASE}${route}${route.includes('?') ? '&' : '?'}theme=${theme}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 40000 });
  await page.waitForFunction(() => !/LOADING DATA/i.test(document.body.innerText), { timeout: 40000 }).catch(() => {});
  await wait(1200);
  // Then wait until the layout actually STOPS changing.
  //
  // A fixed sleep is a guess, and on 2026-08-26 it guessed wrong: /coach/dashboard
  // reported moved=16, countDelta=-5 — a textbook geometry drift — and an
  // immediate re-run of the same route was completely clean. Async data had
  // landed after the sleep on one pass and before it on the other, so light and
  // dark were measured on two different pages and the comparison faithfully
  // reported the difference. A phantom finding is worse than no finding here:
  // it is indistinguishable from a real one.
  await settle();

  // Some zones deliberately force their own theme on mount, so the URL preview
  // param never sticks there. /coach/bhbc is one: "The club zone OPENS WHITE,
  // always" (Ohad) - the crest and navy palette were built on white. That is
  // correct app behaviour, but it made this harness SKIP the route, and a
  // skipped route silently stopped guarding "the dark and white modes are
  // always the same". A coach can still reach dark in there via the header
  // toggle, so reach it the same way the coach does.
  const applied = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  if (applied !== theme) {
    await page.evaluate(() => {
      const el = [...document.querySelectorAll('button')]
        .find((x) => /^switch to (dark|light) mode$/i.test(x.getAttribute('aria-label') || '') && x.offsetParent);
      if (el) el.click();
    });
    // Toggling re-renders the whole zone. Measuring before it comes back gave
    // a 96px-tall 'dark' page against a 2600px light one and reported it as
    // geometry drift - a phantom finding, which is worse than none because it
    // is indistinguishable from a real one. Wait for the theme to LAND and the
    // content to return before believing anything.
    await page.waitForFunction((t) => document.documentElement.getAttribute('data-theme') === t, { timeout: 8000 }, theme).catch(() => {});
    await page.waitForFunction(() => document.body.scrollHeight > 400, { timeout: 15000 }).catch(() => {});
    await wait(1200);
    await settle();
  }

  // PROVE the theme actually applied before measuring anything.
  return page.evaluate(() => ({
    attr: document.documentElement.getAttribute('data-theme'),
    bodyBg: getComputedStyle(document.body).backgroundColor,
    accent: getComputedStyle(document.documentElement).getPropertyValue('--c-ac').trim(),
  }));
};

// Geometry fingerprint: every reasonably-sized element's box, keyed by a stable
// path. Colour is deliberately excluded — only layout must match.
const geometry = () => page.evaluate(() => {
  const out = {};
  const pathOf = (el) => {
    const parts = [];
    let n = el, depth = 0;
    while (n && n !== document.body && depth < 12) {
      const p = n.parentElement;
      if (!p) break;
      parts.push(`${n.tagName}:${[...p.children].indexOf(n)}`);
      n = p; depth++;
    }
    return parts.reverse().join('/');
  };
  for (const el of document.body.querySelectorAll('div,span,button,table,section,header,nav,input,svg')) {
    const r = el.getBoundingClientRect();
    if (r.width < 6 || r.height < 6) continue;
    out[pathOf(el)] = [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)];
  }
  return out;
});

// Text that cannot be read against what is behind it.
const contrast = () => page.evaluate(CONTRAST_FN);

// Geometry is only comparable once the page has STOPPED moving. An async render
// landing between the two samples once reported 1198 moved elements on a route
// that is actually identical — a verifier that cries wolf also masks a real
// drift. Sample until two consecutive reads agree.
// TWO consecutive identical samples is not settled; it is a coin flip that
// came up heads twice. /athlete measured moved=26 with spans of the SAME height
// at the SAME position but different WIDTHS (116 vs 253) - the same element
// holding different TEXT, i.e. async data that landed between the two passes,
// which geometry() cannot see and the old signature could not either. Three in
// a row, and text length is part of what has to hold still.
const settledGeometry = async () => {
  let prev = await geometry();
  let prevTxt = await page.evaluate(() => (document.body.innerText || '').length);
  let same = 0;
  for (let i = 0; i < 10; i++) {
    await wait(600);
    const next = await geometry();
    const nextTxt = await page.evaluate(() => (document.body.innerText || '').length);
    if (JSON.stringify(next) === JSON.stringify(prev) && nextTxt === prevTxt) {
      if (++same >= 3) return next;
    } else { same = 0; }
    prev = next; prevTxt = nextTxt;
  }
  return prev;
};

// WARM UP THE FIRST ROUTE AND THROW IT AWAY.
// /coach/dashboard reported the identical phantom twice now - moved=16,
// countDelta=-5, with one element 1490px tall in dark and 35px in light -
// and re-running that route ALONE is clean every time. It is the FIRST route
// in the list, so its dark pass loads on cold caches and an empty store,
// settle() stabilises, and a late section then renders before the light pass.
// That is not a theme difference; it is the first load being slower than the
// second. A phantom that reproduces at the same numbers is worse than a
// random one: it reads exactly like a real finding.
if (ROUTES.length) {
  try { await loadIn(ROUTES[0], 'dark'); await settledGeometry(); }
  catch (e) { /* the loop below will report it properly */ }
}

const report = [];
for (const route of ROUTES) {
  try {
    settledOk = true;                 // per route; either pass failing clears it
    const dInfo = await loadIn(route, 'dark');
    const gDark = await settledGeometry();
    const cDark = await contrast();

    const lInfo = await loadIn(route, 'light');
    const gLight = await settledGeometry();
    const cLight = await contrast();

    // If the two loads did not actually differ, every comparison below is
    // worthless — say so loudly instead of reporting a green that means nothing.
    if (dInfo.attr === lInfo.attr || dInfo.bodyBg === lInfo.bodyBg) {
      console.log(`SKIP   ${route.padEnd(26)} theme did not change (dark=${dInfo.attr}/${dInfo.bodyBg} light=${lInfo.attr}/${lInfo.bodyBg})`);
      report.push({ route, skipped: true, dInfo, lInfo });
      continue;
    }

    // A SAME-THEME baseline, because settling within one load is not enough.
    // /coach/athletes shifts ~40 elements down by exactly 2px on roughly one
    // load in three, and it does it light-against-LIGHT - so it is run-to-run
    // variation, not a theme difference. Without this baseline the harness
    // reported it as dark-mode drift, which is precisely the complaint it
    // exists to catch, and a verifier that invents that finding is worse than
    // none: it is indistinguishable from the real thing.
    await loadIn(route, 'light');
    const gLight2 = await settledGeometry();
    const noise = new Set();
    for (const k of Object.keys(gLight2)) {
      const a = gLight2[k], c = gLight[k];
      if (!c) { noise.add(k); continue; }
      const d = Math.max(Math.abs(a[0] - c[0]), Math.abs(a[1] - c[1]), Math.abs(a[2] - c[2]), Math.abs(a[3] - c[3]));
      if (d > 1) noise.add(k);
    }

    const moved = [];
    for (const k of Object.keys(gDark)) {
      const a = gDark[k], c = gLight[k];
      if (!c || noise.has(k)) continue;
      const d = Math.max(Math.abs(a[0] - c[0]), Math.abs(a[1] - c[1]), Math.abs(a[2] - c[2]), Math.abs(a[3] - c[3]));
      if (d > 1) moved.push({ k, dark: a, light: c, delta: d });
    }
    moved.sort((x, y) => y.delta - x.delta);
    const onlyDark = Object.keys(gDark).length - Object.keys(gLight).length;
    const noisy = noise.size;

    // UNSETTLED is not DRIFT. If either pass never stopped mutating, the two
    // samples are of two different pages and any difference between them says
    // nothing about the theme.
    const status = !settledOk ? 'UNSET' : ((moved.length || cLight.length || cDark.length) ? 'DRIFT' : 'ok');
    console.log(`${status.padEnd(6)} ${route.padEnd(26)} ${!settledOk ? 'the page never stopped changing — NOT COMPARED' : `moved=${moved.length} countDelta=${onlyDark} noise=${noisy} lowContrast(light)=${cLight.length} (dark)=${cDark.length}`}`);
    if (moved.length) console.log('        worst:', JSON.stringify(moved.slice(0, 2)));
    if (cLight.length) console.log('        light:', JSON.stringify(cLight.slice(0, 3)));
    if (cDark.length) console.log('        dark: ', JSON.stringify(cDark.slice(0, 3)));
    report.push({ route, moved: moved.slice(0, 10), countDelta: onlyDark, contrastLight: cLight, contrastDark: cDark });
  } catch (e) {
    console.log(`ERROR  ${route}  ${String(e).slice(0, 80)}`);
  }
}
fs.writeFileSync(`${OUT}/light_dark_parity.json`, JSON.stringify(report, null, 1));
await page.close();
await b.disconnect();
