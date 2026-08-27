// Mobile overflow audit — 390x844, every coach/athlete/demo route.
// Reports document scrollWidth vs innerWidth + the elements that poke past
// the viewport (ignoring ones inside a horizontal scroller). Full-page
// screenshot per route. Usage: node scripts/_tmp_mobile_audit.mjs [base] [routes...]
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { signIn, assertAuthed } from './lib/authed-page.mjs';
// AUDIT_OUT used to default to a scratchpad path belonging to a session that
// ended long ago, so screenshots silently went nowhere useful.
const SP = process.env.AUDIT_OUT || './audit-out';
const BASE = process.argv[2] || 'http://localhost:5173';

// Routes come from docs/SURFACES.md, which says outright: "Any audit, sweep,
// regression check, or 'review everything' task MUST enumerate from this file,
// not from memory." A hand-written list drifts the moment a route is added —
// this one silently missed /demo/he, /intake/he, /login and the /coaches/*
// aliases. One parameterised route is kept by hand because the manifest cannot
// supply a real id.
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
    out.add('/coach/programs/pl_fkx3okgxmt4hsj2r'); // a real plan, for the editor
    return [...out].sort();
  } catch {
    console.log('! could not read docs/SURFACES.md — pass routes explicitly.');
    return [];
  }
}
const routes = process.argv.length > 3 ? process.argv.slice(3) : routesFromManifest();
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Wait until the page STOPS changing before measuring.
//
// A fixed sleep is a guess and it guessed wrong: a run reported 27/28 naming no
// route, and two immediate re-runs were 28/28. Whatever was still laying out
// when the measurement fired produced a phantom overflow. Same class as the
// light/dark harness, fixed the same way — a phantom finding is worse than
// none, because it cannot be told apart from a real one.
const settle = async (page, tries = 12, gapMs = 300) => {
  let prev = null;
  for (let i = 0; i < tries; i++) {
    const sig = await page.evaluate(() => document.querySelectorAll('*').length + ':' +
      Math.round(document.documentElement.scrollWidth) + ':' + Math.round(document.body.scrollHeight));
    if (sig === prev) return;
    prev = sig;
    await new Promise((r) => setTimeout(r, gapMs));
  }
};
const j = await (await fetch('http://localhost:9222/json/version')).json();
const browser = await puppeteer.connect({ browserWSEndpoint: j.webSocketDebuggerUrl, protocolTimeout: 120000 });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });

// Sign in and PROVE it. Unauthenticated, every coach route redirects and this
// sweep measures the same small login page over and over — which is exactly how
// it once reported "37/37 routes fit a phone" while having looked at one page
// thirty-seven times. A login screen always fits; that number meant nothing.
await signIn(page, BASE);
if (!(await assertAuthed(page, BASE))) { await page.close(); await browser.disconnect(); process.exit(2); }

// This app routes on window.location.pathname, NOT the hash — a URL like
// /#/coach/bhbc renders the portal chooser, not the page. Use real paths.
// A dual-role account still meets the chooser on a cold profile; the choice
// survives a reload, so click through it once and carry on.
async function enterCoach(page, url, sleepFn) {
  const onChooser = await page.evaluate(() => /CHOOSE YOUR PORTAL/i.test(document.body.innerText));
  if (!onChooser) return false;
  // The chooser card is a real <button> ("ManageCoachTasks, athletes & plans
  // ENTER") — a synthetic click on the inner text node does nothing.
  for (const h of await page.$$('button')) {
    const txt = await h.evaluate((n) => (n.textContent || '').trim());
    if (/^Manage/i.test(txt)) { await h.click(); break; }
  }
  await sleepFn(1800);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleepFn(2800);
  return true;
}

const report = [];
for (const r of routes) {
  const slug = r.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'root';
  try {
    await page.goto(BASE + r, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => !/LOADING DATA/i.test(document.body.innerText), { timeout: 40000 }).catch(() => {});
    await sleep(2500);
    await enterCoach(page, BASE + r, sleep);
    await page.waitForFunction(() => !/LOADING DATA/i.test(document.body.innerText), { timeout: 40000 }).catch(() => {});
    // dashboard: make sure the Tasks section is expanded so the board is measured
    if (/dashboard/.test(r)) {
      await page.evaluate(() => {
        const h = [...document.querySelectorAll('*')].find(e => e.children.length === 0 && /^TASKS \(\d+\)$/i.test((e.textContent || '').trim()));
        if (!h) return;
        // if no "TO DO"/"OPEN FULL TASKS" visible, click the header to expand
        if (!/OPEN FULL TASKS/i.test(document.body.innerText)) (h.closest('button') || h).click();
      });
      await sleep(800);
    }
    // Settle FIRST: measure a page that has stopped moving, not one mid-layout.
    await settle(page);
    const m = await page.evaluate(() => {
      const iw = window.innerWidth;
      const de = document.documentElement;
      const inScroller = (el) => { let p = el.parentElement; while (p && p !== document.body) { const cs = getComputedStyle(p); if (/(auto|scroll)/.test(cs.overflowX) || /(auto|scroll)/.test(cs.overflow)) return true; p = p.parentElement; } return false; };
      const offenders = [];
      for (const el of document.body.querySelectorAll('*')) {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        const over = Math.max(rect.right - iw, -rect.left);
        if (over <= 1) continue;
        const cs = getComputedStyle(el);
        if (cs.position === 'fixed' && cs.visibility === 'hidden') continue;
        if (inScroller(el)) continue;
        offenders.push({ over: Math.round(over), tag: el.tagName.toLowerCase(), cls: (el.className && el.className.baseVal === undefined ? String(el.className) : '').slice(0, 40), id: el.id, txt: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40), l: Math.round(rect.left), r: Math.round(rect.right), w: Math.round(rect.width) });
      }
      offenders.sort((a, b) => b.over - a.over);
      // de-dup: keep the OUTERMOST offenders by dropping those whose parent is also an offender with same over
      return { iw, broke: /EXPO HIT A RENDER ERROR|SOMETHING BROKE/i.test(document.body.innerText), thin: document.body.innerText.trim().length < 40, sw: de.scrollWidth, bsw: document.body.scrollWidth, title: document.title, offenders: offenders.slice(0, 10), text: document.body.innerText.slice(0, 80).replace(/\s+/g, ' ') };
    });
    await page.screenshot({ path: `${SP}/ma_${slug}.png`, fullPage: true });
    // A page that CRASHED does not overflow, so it used to be reported as 'ok'.
    // That is exactly how a broken /try passed this audit on 2026-08-26 while
    // showing nothing but the render-error card. A blank or crashed route is a
    // failure, not a pass.
    const status = m.broke ? 'RENDER-ERROR'
      : m.thin ? 'BLANK'
      : (m.sw > m.iw + 1 || m.bsw > m.iw + 1 || m.offenders.length) ? 'OVERFLOW'
      : 'ok';
    console.log(`${status.padEnd(8)} ${r}  sw=${m.sw} bsw=${m.bsw} iw=${m.iw}  ${m.offenders.slice(0, 3).map(o => `<${o.tag}${o.id ? '#' + o.id : ''} +${o.over} "${o.txt.slice(0, 24)}">`).join(' ')}`);
    report.push({ route: r, status, ...m });
  } catch (e) {
    console.log(`ERROR    ${r}  ${e.message.slice(0, 80)}`);
    report.push({ route: r, status: 'ERROR', error: e.message });
  }
}
fs.writeFileSync(`${SP}/mobile_audit.json`, JSON.stringify(report, null, 1));
await page.close(); await browser.disconnect();
