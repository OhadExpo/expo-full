// Mobile overflow audit — 390x844, every coach/athlete/demo route.
// Reports document scrollWidth vs innerWidth + the elements that poke past
// the viewport (ignoring ones inside a horizontal scroller). Full-page
// screenshot per route. Usage: node scripts/_tmp_mobile_audit.mjs [base] [routes...]
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const SP = process.env.AUDIT_OUT || 'C:/Users/ADMINI~1/AppData/Local/Temp/claude/C--Users-Administrator-Desktop-expo-full/5eaed3a7-6e52-4110-b142-fbc1967bff69/scratchpad';
const BASE = process.argv[2] || 'http://localhost:5173';
const DEFAULT_ROUTES = [
  '/coach/dashboard', '/coach/athletes', '/coach/programs', '/coach/programs/pl_fkx3okgxmt4hsj2r',
  '/coach/exercises', '/coach/exercise-matching', '/coach/exercise-classify', '/coach/exercise-cleanup',
  '/coach/review', '/coach/review-tools', '/coach/workouts', '/coach/sessions', '/coach/sessions-single',
  '/coach/intake', '/coach/waitlist', '/coach/chat-audit', '/coach/smart-import', '/coach/tasks',
  '/coach/bugs', '/coach/challenges', '/coach/calendar', '/coach/billing', '/coach/bhbc',
  '/athlete', '/demo/coach', '/demo/athlete', '/try', '/demo',
];
const routes = process.argv.length > 3 ? process.argv.slice(3) : DEFAULT_ROUTES;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const j = await (await fetch('http://localhost:9222/json/version')).json();
const browser = await puppeteer.connect({ browserWSEndpoint: j.webSocketDebuggerUrl, protocolTimeout: 120000 });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
const report = [];
for (const r of routes) {
  const slug = r.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'root';
  try {
    await page.goto(BASE + r, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => !/LOADING DATA/i.test(document.body.innerText), { timeout: 40000 }).catch(() => {});
    await sleep(2500);
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
      return { iw, sw: de.scrollWidth, bsw: document.body.scrollWidth, title: document.title, offenders: offenders.slice(0, 10), text: document.body.innerText.slice(0, 80).replace(/\s+/g, ' ') };
    });
    await page.screenshot({ path: `${SP}/ma_${slug}.png`, fullPage: true });
    const status = (m.sw > m.iw + 1 || m.bsw > m.iw + 1 || m.offenders.length) ? 'OVERFLOW' : 'ok';
    console.log(`${status.padEnd(8)} ${r}  sw=${m.sw} bsw=${m.bsw} iw=${m.iw}  ${m.offenders.slice(0, 3).map(o => `<${o.tag}${o.id ? '#' + o.id : ''} +${o.over} "${o.txt.slice(0, 24)}">`).join(' ')}`);
    report.push({ route: r, status, ...m });
  } catch (e) {
    console.log(`ERROR    ${r}  ${e.message.slice(0, 80)}`);
    report.push({ route: r, status: 'ERROR', error: e.message });
  }
}
fs.writeFileSync(`${SP}/mobile_audit.json`, JSON.stringify(report, null, 1));
await page.close(); await browser.disconnect();
