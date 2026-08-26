// Light/dark parity sweep. Ohad's rule: layout must be IDENTICAL in both
// themes, only colour differs (reference_theme_geometry_parity). This measures
// the geometry of every route in both themes and reports any element whose box
// moves or resizes when only the theme changes — plus contrast offenders where
// text lands on a background it cannot be read against.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const OUT = process.env.AUDIT_OUT || (process.argv[2] || '.');
const BASE = process.argv[3] || 'http://localhost:5199';
// Routes come from docs/SURFACES.md, which states outright that any audit or
// sweep MUST enumerate from it rather than from memory. The hand-written list
// this replaced carried 17 routes while the manifest describes 43 - so
// /coach/bugs, /coach/challenges, /coach/waitlist, /coach/smart-import,
// /coach/intake, /coach/calendar, /demo/he, /intake/he and /login had never
// been checked for theme parity at all.
function routesFromManifest() {
  try {
    const md = fs.readFileSync('docs/SURFACES.md', 'utf8');
    const out = new Set();
    for (const m of md.matchAll(/\|\s*`([^`]+)`/g)) {
      for (const part of m[1].split(',')) {
        const p = part.trim().replace(/`/g, '');
        if (p.startsWith('/') && !p.includes('*') && !p.includes('<') && !p.includes(':')) out.add(p);
      }
    }
    return [...out].sort();
  } catch {
    console.log('! could not read docs/SURFACES.md - pass routes explicitly.');
    return [];
  }
}
const ROUTES = process.argv.length > 4 ? process.argv.slice(4) : routesFromManifest();

const b = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', protocolTimeout: 180000 });
const page = await b.newPage();
await page.setViewport({ width: 1440, height: 950 });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Load the route with ?theme=… so public/boot-theme.js applies it BEFORE paint.
// Setting data-theme from the outside does not hold: the app's own theme hook
// re-applies the attribute after mount, so the sample could silently be taken in
// the wrong theme — and then "geometry identical" would be trivially true and
// completely meaningless.
const loadIn = async (route, theme) => {
  const url = `${BASE}${route}${route.includes('?') ? '&' : '?'}theme=${theme}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 40000 });
  await page.waitForFunction(() => !/LOADING DATA/i.test(document.body.innerText), { timeout: 40000 }).catch(() => {});
  await wait(2600);
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
    if (ratio < 2.2) bad.push({ text: t.slice(0, 40), ratio: Math.round(ratio * 100) / 100, color: cs.color, bg: bgOf(el) });
  }
  return bad.slice(0, 8);
});

const report = [];
for (const route of ROUTES) {
  try {
    const dInfo = await loadIn(route, 'dark');
    const gDark = await geometry();
    const cDark = await contrast();

    const lInfo = await loadIn(route, 'light');
    const gLight = await geometry();
    const cLight = await contrast();

    // If the two loads did not actually differ, every comparison below is
    // worthless — say so loudly instead of reporting a green that means nothing.
    if (dInfo.attr === lInfo.attr || dInfo.bodyBg === lInfo.bodyBg) {
      console.log(`SKIP   ${route.padEnd(26)} theme did not change (dark=${dInfo.attr}/${dInfo.bodyBg} light=${lInfo.attr}/${lInfo.bodyBg})`);
      report.push({ route, skipped: true, dInfo, lInfo });
      continue;
    }

    const moved = [];
    for (const k of Object.keys(gDark)) {
      const a = gDark[k], c = gLight[k];
      if (!c) continue;
      const d = Math.max(Math.abs(a[0] - c[0]), Math.abs(a[1] - c[1]), Math.abs(a[2] - c[2]), Math.abs(a[3] - c[3]));
      if (d > 1) moved.push({ k, dark: a, light: c, delta: d });
    }
    moved.sort((x, y) => y.delta - x.delta);
    const onlyDark = Object.keys(gDark).length - Object.keys(gLight).length;

    const status = (moved.length || cLight.length || cDark.length) ? 'DRIFT' : 'ok';
    console.log(`${status.padEnd(6)} ${route.padEnd(26)} moved=${moved.length} countDelta=${onlyDark} lowContrast(light)=${cLight.length} (dark)=${cDark.length}`);
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
