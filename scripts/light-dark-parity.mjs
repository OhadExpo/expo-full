// Light/dark parity sweep. Ohad's rule: layout must be IDENTICAL in both
// themes, only colour differs (reference_theme_geometry_parity). This measures
// the geometry of every route in both themes and reports any element whose box
// moves or resizes when only the theme changes — plus contrast offenders where
// text lands on a background it cannot be read against.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const OUT = process.env.AUDIT_OUT || (process.argv[2] || '.');
const BASE = process.argv[3] || 'http://localhost:5199';
const ROUTES = process.argv.length > 4 ? process.argv.slice(4) : [
  '/coach/dashboard', '/coach/athletes', '/coach/programs', '/coach/exercises',
  '/coach/exercise-matching', '/coach/exercise-cleanup', '/coach/review',
  '/coach/review-tools', '/coach/workouts', '/coach/sessions', '/coach/tasks',
  '/coach/billing', '/coach/bhbc', '/athlete', '/demo/coach', '/demo/athlete', '/try',
];

const b = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', protocolTimeout: 180000 });
const page = await b.newPage();
await page.setViewport({ width: 1440, height: 950 });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Load the route with ?theme=… so public/boot-theme.js applies it BEFORE paint.
// Setting data-theme from the outside does not hold: the app's own theme hook
// re-applies the attribute after mount, so the sample could silently be taken in
// the wrong theme — and then "geometry identical" would be trivially true and
// completely meaningless.
// Sample the element count and document height until two consecutive samples
// agree. Cheap, and it is the actual property that matters: nothing has moved.
const settle = async (tries = 15, gapMs = 350) => {
  let prev = null;
  for (let i = 0; i < tries; i++) {
    const sig = await page.evaluate(() => document.querySelectorAll('*').length + ':' + Math.round(document.body.scrollHeight) + ':' + Math.round(document.body.scrollWidth));
    if (sig === prev) return sig;
    prev = sig;
    await wait(gapMs);
  }
  return prev;
};

const loadIn = async (route, theme) => {
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
const contrast = () => page.evaluate(() => {
  // Chrome reports color-mix()/modern colours as `color(srgb r g b / a)` with
  // 0..1 components, NOT rgb(). Parsing only rgb() walked straight past the
  // BHBC deep-navy strip headers to the white card behind them and reported
  // white-on-white — eight false positives per route. Parse both.
  const parse = (c) => {
    const str = String(c || '');
    let m = str.match(/rgba?\(([^)]+)\)/);
    if (m) {
      const p = m[1].split(/[,\s/]+/).filter(Boolean).map(parseFloat);
      return { r: p[0], g: p[1], b: p[2], a: p[3] === undefined ? 1 : p[3] };
    }
    m = str.match(/color\(srgb\s+([^)]+)\)/);
    if (m) {
      const p = m[1].split(/[\s/]+/).filter(Boolean).map(parseFloat);
      return { r: p[0] * 255, g: p[1] * 255, b: p[2] * 255, a: p[3] === undefined ? 1 : p[3] };
    }
    return null;
  };
  const lum = (c) => {
    const p = parse(c); if (!p) return null;
    if (p.a < 0.35) return null;                              // near-transparent text is decorative
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(p.r) + 0.7152 * f(p.g) + 0.0722 * f(p.b);
  };
  const bgOf = (el) => {
    let n = el;
    while (n && n !== document.documentElement) {
      const c = getComputedStyle(n).backgroundColor;
      const p = parse(c);
      if (p && p.a > 0.5) return c;
      n = n.parentElement;
    }
    return getComputedStyle(document.body).backgroundColor;
  };
  const bad = [];
  for (const el of document.body.querySelectorAll('div,span,button,a,td,th,label,h1,h2,h3')) {
    if (el.children.length) continue;
    const t = (el.textContent || '').trim();
    if (!t || t.length > 60) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.opacity === '0') continue;
    const lf = lum(cs.color), lb = lum(bgOf(el));
    if (lf == null || lb == null) continue;
    const ratio = (Math.max(lf, lb) + 0.05) / (Math.min(lf, lb) + 0.05);
    // Two pairings are RULED-ON DECISIONS, not defects, and reporting them
    // every run buried the ones that were:
    //   white on brand cyan #39BDFF (2.12) - the active nav pill and primary
    //     CTAs. Ohad: the cyan stays bright, the brand wins; a contrast-led
    //     palette was proposed once and rejected outright.
    //   muted grey #444450 on the near-black ground (2.06) - dark-mode
    //     secondary text, same ruling.
    // Anything else under 2.2 is a real finding and still reported. The BHBC
    // amber that this exclusion let surface was exactly that: a token with a
    // light-mode value that the medical labels were simply not using.
    const fg = (cs.color || '').replace(/\s/g, '');
    const bgRaw = bgOf(el) || '';
    const bgc = bgRaw.replace(/\s/g, '');
    // Match the PAIRING, not one exact ground: the same muted grey sits on the
    // near-black card, the black page and the demo stage, and pinning exact
    // triples just moved the noise around.
    const bgLum = (() => { const m = bgRaw.match(/[\d.]+/g); if (!m || m.length < 3) return 255; /* Chrome reports some grounds as color(srgb 0.05 0.09 0.12) - 0..1, not 0..255. */ const v = m.slice(0, 3).map(Number).map((x) => (x <= 1 ? x * 255 : x)); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; })();
    const ruledOn = (/^rgba?\(255,255,255/.test(fg) && bgc === 'rgb(57,189,255)')
      || (fg === 'rgb(68,68,80)' && bgLum < 40);
    if (ratio < 2.2 && !ruledOn) bad.push({ text: t.slice(0, 40), ratio: Math.round(ratio * 100) / 100, color: cs.color, bg: bgOf(el) });
  }
  return bad.slice(0, 8);
});

// Geometry is only comparable once the page has STOPPED moving. An async render
// landing between the two samples once reported 1198 moved elements on a route
// that is actually identical — a verifier that cries wolf also masks a real
// drift. Sample until two consecutive reads agree.
const settledGeometry = async () => {
  let prev = await geometry();
  for (let i = 0; i < 6; i++) {
    await wait(600);
    const next = await geometry();
    if (JSON.stringify(next) === JSON.stringify(prev)) return next;
    prev = next;
  }
  return prev;
};

const report = [];
for (const route of ROUTES) {
  try {
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

    const status = (moved.length || cLight.length || cDark.length) ? 'DRIFT' : 'ok';
    console.log(`${status.padEnd(6)} ${route.padEnd(26)} moved=${moved.length} countDelta=${onlyDark} noise=${noisy} lowContrast(light)=${cLight.length} (dark)=${cDark.length}`);
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
