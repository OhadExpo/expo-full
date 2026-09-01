// A CONTROL THAT LOOKS CLICKABLE MUST VISIBLY DO SOMETHING.
//
// Ohad, 2026-09-01: "this type of shit shouldnt happen anywhere. sweep all
// platforms." The trigger was the BHBC availability cell: it wrote a value the
// board then clamped away, so four clicks in five changed nothing on screen and
// the control looked broken. That class of bug is invisible to every other gate
// here - the pixels are fine, the text fits, nothing overflows. The only way to
// find it is to click the thing and look at what changed.
//
// SAFETY, and this is not optional: the dev server talks to the PRODUCTION
// Supabase. A blind click sweep would create, edit and delete real rows for real
// athletes. So every mutating request to Supabase is aborted at the network
// layer for the whole run, and anything whose label reads destructive is never
// clicked at all. Local state still updates on click, which is exactly what
// "did the UI respond" measures.
//
//   node scripts/audit-dead-controls.mjs [base] [width] [route...]
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { signIn, assertAuthed } from './lib/authed-page.mjs';
import { unmangleArg } from './lib/unmangle.mjs';

// Same manifest the other gates enumerate from, so this sweep covers exactly
// the surfaces SURFACES.md claims exist.
const routesFromManifest = () => {
  try {
    const md = fs.readFileSync('docs/SURFACES.md', 'utf8');
    return [...new Set([...md.matchAll(/`(\/[a-z0-9/-]*)`/gi)].map((m) => m[1]))]
      .filter((r) => !/\/(login|intake)/.test(r));
  } catch { return ['/coach/bhbc', '/coach/dashboard', '/athlete']; }
};

const BASE = process.argv[2] || 'http://127.0.0.1:5199';
const W = parseInt(process.argv[3] || '1500', 10);
const ROUTES = (process.argv.length > 4 ? process.argv.slice(4) : routesFromManifest()).map(unmangleArg);

// Never clicked, even with writes blocked: these destroy local state, sign out,
// or open something this harness cannot get back from.
const NEVER = 'delete|remove|discard|clear all|log ?out|sign ?out|exit|reset|revoke|unassign|archive|deactivate';
// Controls that legitimately show nothing: they act on the clipboard or the
// filesystem, where a DOM diff is the wrong instrument.
// Controls that legitimately show nothing: they act on the clipboard, the
// filesystem, or a native picker, where a DOM diff is the wrong instrument.
const CLIPBOARD = /copy|export|download|print|share|pick file|choose file|upload|browse/i;

const SIG = () => {
  // Text is the obvious signal, but a toggle can change only its own active
  // styling, so the signature carries button state and colour too.
  const txt = document.body.innerText || '';
  let h = 0;
  for (let i = 0; i < txt.length; i++) { h = (h * 31 + txt.charCodeAt(i)) | 0; }
  const btns = [...document.querySelectorAll('button,[role="button"],[role="tab"]')]
    .map((el) => (el.getAttribute('aria-pressed') || '') + (el.getAttribute('aria-selected') || '')
      + (el.className || '').toString().slice(0, 20)
      + getComputedStyle(el).backgroundColor + getComputedStyle(el).borderColor)
    .join('|');
  let h2 = 0;
  for (let i = 0; i < btns.length; i++) { h2 = (h2 * 31 + btns.charCodeAt(i)) | 0; }
  // ...and a response can be neither text nor a button. Accepting a match dims
  // its card to opacity 0.6 and recolours its left stripe; watching only text
  // and button styling reported "Skip" as dead when it plainly is not. Fading,
  // stripes and selection borders all count as the UI answering.
  let h3 = 0;
  const visual = [...document.querySelectorAll('div,section,article,li,tr')].slice(0, 600)
    .map((el, i) => { const cs = getComputedStyle(el); return cs.opacity !== '1' ? i + cs.opacity + cs.borderLeftColor + cs.backgroundColor : (cs.borderLeftWidth !== '0px' ? i + cs.borderLeftColor : ''); })
    .join('');
  for (let i = 0; i < visual.length; i++) { h3 = (h3 * 31 + visual.charCodeAt(i)) | 0; }
  return [h, h2, h3, txt.length, document.querySelectorAll('*').length, location.href].join(':');
};

const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 600000 });
const page = await browser.newPage();
await page.setViewport({ width: W, height: 1100 });

// --- the safety net -------------------------------------------------------
await page.setRequestInterception(true);
let blockedWrites = 0;
page.on('request', (req) => {
  const method = req.method();
  const url = req.url();
  const mutating = method === 'POST' || method === 'PATCH' || method === 'PUT' || method === 'DELETE';
  if (url.includes('supabase.co') && mutating && !url.includes('/auth/v1/')) {
    blockedWrites++;
    req.abort().catch(() => {});
    return;
  }
  req.continue().catch(() => {});
});

let total = 0;
try {
  await signIn(page, BASE);
  await assertAuthed(page, '/coach/dashboard');

  for (const route of ROUTES) {
    await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await new Promise((r) => setTimeout(r, 4500));

    const tabs = await page.evaluate(() => [...document.querySelectorAll('button')]
      .map((x) => (x.textContent || '').trim())
      .filter((t) => /^(overview|roster|schedule|medical|sessions|games)$/i.test(t)));

    for (const tab of (tabs.length ? tabs : [null])) {
      if (tab) {
        await page.evaluate((l) => {
          const el = [...document.querySelectorAll('button')].find((x) => (x.textContent || '').trim() === l);
          if (el) el.click();
        }, tab);
        await new Promise((r) => setTimeout(r, 2200));
      }
      const where = route + (tab ? ' · ' + tab : '');

      const labels = await page.evaluate((neverSrc) => {
        const never = new RegExp(neverSrc, 'i');
        return [...document.querySelectorAll('button,[role="button"]')]
          .filter((el) => {
            const r = el.getBoundingClientRect();
            if (r.width < 8 || r.height < 8) return false;
            if (el.disabled) return false;
            const cs = getComputedStyle(el);
            if (cs.visibility === 'hidden' || cs.display === 'none' || cs.pointerEvents === 'none') return false;
            // A control already in its SELECTED state is supposed to do nothing
            // when clicked - the tab you are already on, the filter already
            // applied. Reporting those as dead would bury the real ones.
            if (el.getAttribute('aria-selected') === 'true' || el.getAttribute('aria-pressed') === 'true') return false;
            const t = (el.textContent || '').trim();
            return t.length > 0 && t.length < 40 && !never.test(t);
          })
          .map((el) => (el.textContent || '').trim())
          .filter((t, i, a) => a.indexOf(t) === i)
          .slice(0, 40);
      }, NEVER);

      const dead = [];
      for (const label of labels) {
        const before = await page.evaluate(SIG);
        const clicked = await page.evaluate((l) => {
          const el = [...document.querySelectorAll('button,[role="button"]')]
            .find((x) => (x.textContent || '').trim() === l && !x.disabled);
          if (!el) return false;
          el.click();
          return true;
        }, label);
        if (!clicked) continue;
        // Sample EARLY and late. A refresh that flashes "REFRESHING..." for
        // half a second is answering the user, but a single sample at 750ms
        // lands after it has settled back and calls the button dead.
        await new Promise((r) => setTimeout(r, 220));
        const early = await page.evaluate(SIG);
        await new Promise((r) => setTimeout(r, 600));
        const after = await page.evaluate(SIG);
        if (before === after && before === early) dead.push(label);

        // Back to a clean slate: close whatever opened, and return to this
        // route/tab if the click navigated away.
        await page.keyboard.press('Escape').catch(() => {});
        await new Promise((r) => setTimeout(r, 250));
        const moved = await page.evaluate((r0) => !location.href.includes(r0), route);
        if (moved) {
          await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 45000 });
          await new Promise((r) => setTimeout(r, 4000));
          if (tab) {
            await page.evaluate((l) => {
              const el = [...document.querySelectorAll('button')].find((x) => (x.textContent || '').trim() === l);
              if (el) el.click();
            }, tab);
            await new Promise((r) => setTimeout(r, 2000));
          }
        }
      }

      const real = dead.filter((d) => !CLIPBOARD.test(d));
      const ignored = dead.filter((d) => CLIPBOARD.test(d));
      if (!real.length) {
        console.log('OK    ' + where + '  (' + labels.length + ' controls'
          + (ignored.length ? ', ' + ignored.length + ' clipboard/export ignored' : '') + ')');
        continue;
      }
      total += real.length;
      console.log('FAIL  ' + where + '  (' + real.length + ' of ' + labels.length + ' changed nothing)');
      for (const d of real.slice(0, 8)) console.log('        DEAD  "' + d + '"');
    }
  }
} catch (e) {
  console.log('SWEEP ERROR:', String(e.message || e).split('\n')[0]);
  process.exitCode = 1;
} finally {
  await page.close().catch(() => {});
  browser.disconnect();
}
console.log('\n' + total + ' control(s) that changed nothing when clicked, at ' + W + 'px');
console.log('(' + blockedWrites + ' Supabase writes blocked during the run - nothing was persisted)');
process.exit(total ? 1 : 0);
