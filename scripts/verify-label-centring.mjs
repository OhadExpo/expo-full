// A CENTRED CONTROL MUST BE CENTRED BY ITS INK.
//
// Ohad, 2026-09-02: "manage roster and log practice buttons are not centered
// horizontally and it looks bad. same sweep for this everywhere."
//
// The box being centred is not the point and never was - his standing rule is
// measure the INK, not the box. A label can sit dead centre by layout and still
// read off, because an icon, a chevron, asymmetric padding or a trailing space
// shifts the GLYPHS inside it. This measures the glyph run with a Range and
// compares its centre to the control's own centre.
//
// Only controls that are TRYING to centre are judged: text-align center, or a
// flex box with justify-content center. A left-aligned label is not a defect.
//
//   node scripts/verify-label-centring.mjs [base] [width] [route...]
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { signIn } from './lib/authed-page.mjs';
import { listTabs, clickTab } from './lib/tabs.mjs';
import { unmangleArg } from './lib/unmangle.mjs';

const routesFromManifest = () => {
  try {
    const md = fs.readFileSync('docs/SURFACES.md', 'utf8');
    return [...new Set([...md.matchAll(/`(\/[a-z0-9/-]*)`/gi)].map((m) => m[1]))].filter((r) => !/\/(login|intake)/.test(r));
  } catch { return ['/coach/bhbc', '/coach/dashboard']; }
};

const BASE = process.argv[2] || 'http://127.0.0.1:5199';
const W = parseInt(process.argv[3] || '1500', 10);
const ROUTES = (process.argv.length > 4 ? process.argv.slice(4) : routesFromManifest()).map(unmangleArg);
const TOL = 1.0;

const MEASURE = () => {
  const out = [];
  const seen = new Set();
  for (const el of document.querySelectorAll('button,[role="button"],a')) {
    const r = el.getBoundingClientRect();
    if (r.width < 24 || r.height < 12) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    // Is it even trying to centre?
    const centring = cs.textAlign === 'center'
      || ((cs.display.includes('flex')) && cs.justifyContent === 'center');
    if (!centring) continue;
    const text = (el.textContent || '').trim();
    if (!text || text.length > 40) continue;
    // The INK of the label, not the element box.
    let ink = null;
    try {
      const range = document.createRange();
      range.selectNodeContents(el);
      const b = range.getBoundingClientRect();
      if (b.width > 0) ink = b;
    } catch { /* detached */ }
    if (!ink) continue;
    // An element whose ink spans the whole control has nothing to centre.
    if (ink.width >= r.width - 2) continue;
    const boxMid = r.left + r.width / 2;
    const inkMid = ink.left + ink.width / 2;
    const off = inkMid - boxMid;
    if (Math.abs(off) <= 1.0) continue;
    const key = text + '|' + Math.round(r.width);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ text: text.slice(0, 28), off: +off.toFixed(2), w: Math.round(r.width) });
  }
  return out.sort((a, b) => Math.abs(b.off) - Math.abs(a.off)).slice(0, 8);
};

const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 600000 });
const page = await browser.newPage();
if (W < 700) {
  await page.emulate({
    viewport: { width: W, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });
} else {
  await page.setViewport({ width: W, height: 1100 });
}

let total = 0;
try {
  await signIn(page, BASE);
  for (const route of ROUTES) {
    await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await new Promise((r) => setTimeout(r, 4500));
    const tabs = await listTabs(page);
    for (const tab of (tabs.length ? tabs : [null])) {
      if (tab) {
        const how = await clickTab(page, tab, 2500);
        if (how !== 'ok') {
          await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 45000 });
          await new Promise((r) => setTimeout(r, 4000));
          if (how === 'navigated') continue;
        }
      }
      const where = route + (tab ? ' · ' + tab : '');
      const hits = await page.evaluate(MEASURE);
      if (!hits.length) { console.log('OK    ' + where); continue; }
      total += hits.length;
      console.log('FAIL  ' + where + '  (' + hits.length + ' label(s) off centre)');
      for (const h of hits) console.log('        ' + String(h.off).padStart(7) + 'px  "' + h.text + '"  (w ' + h.w + ')');
    }
  }
} catch (e) {
  console.log('SWEEP ERROR:', String(e.message || e).split('\n')[0]);
  process.exitCode = 1;
} finally {
  await page.close().catch(() => {});
  browser.disconnect();
}
console.log('\n' + total + ' centred control(s) whose INK is off centre by more than ' + TOL + 'px at ' + W + 'px');
process.exit(total ? 1 : 0);
