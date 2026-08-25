// Mobile audit for surfaces the route sweep CANNOT reach: things behind a
// click. audit-mobile-fit.mjs walks routes, so the Shot Analyzer (inside
// Review > Tools) and the BHBC tabs (state, not routes) were never measured —
// and those are exactly the screens that changed most.
//
// Usage: node scripts/audit-mobile-nested.mjs [base]
import puppeteer from 'puppeteer-core';

const BASE = process.argv[2] || 'http://localhost:4173';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const j = await (await fetch('http://localhost:9222/json/version')).json();
const browser = await puppeteer.connect({ browserWSEndpoint: j.webSocketDebuggerUrl, protocolTimeout: 120000 });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });

const measure = () => page.evaluate(() => {
  const iw = window.innerWidth;
  const bad = [];
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) continue;
    if (r.right <= iw + 1 && r.left >= -1) continue;
    // Ignore anything living inside a deliberate horizontal scroller.
    let p = el.parentElement, inScroller = false;
    while (p && p !== document.body) {
      const ov = getComputedStyle(p).overflowX;
      if ((ov === 'auto' || ov === 'scroll') && p.scrollWidth > p.clientWidth + 1) { inScroller = true; break; }
      p = p.parentElement;
    }
    if (inScroller) continue;
    bad.push({
      tag: el.tagName.toLowerCase(),
      cls: String(el.className || '').slice(0, 44),
      txt: (el.textContent || '').trim().slice(0, 30),
      left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width),
    });
  }
  // Keep only the outermost offenders — a wide parent drags its children along.
  const out = bad.filter((b, i) => !bad.some((o, k) => k !== i && o.left <= b.left && o.right >= b.right && o.w > b.w));
  return {
    iw, sw: document.documentElement.scrollWidth, bsw: document.body.scrollWidth,
    count: out.length, items: out.slice(0, 6),
    // Proof of WHICH screen was measured — without it an audit that never left
    // the portal chooser reports everything clean.
    here: document.body.innerText.replace(/\s+/g, ' ').slice(0, 60),
  };
});

const clickText = (needle) => page.evaluate((n) => {
  const el = [...document.querySelectorAll('button,[role="button"],a,div')]
    .find(e => (e.textContent || '').trim().toUpperCase() === n.toUpperCase() && e.getBoundingClientRect().width > 0);
  if (el) { el.click(); return true; }
  return false;
}, needle);


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

let fails = 0;
const report = (name, m) => {
  const overflow = m.sw > m.iw || m.bsw > m.iw || m.count > 0;
  if (overflow) fails++;
  console.log(`${overflow ? 'OVERFLOW' : 'ok      '} ${name}  sw=${m.sw} bsw=${m.bsw} bad=${m.count}  | ${m.here}`);
  for (const it of m.items) console.log(`           ${it.tag}.${it.cls} "${it.txt}" left=${it.left} right=${it.right} w=${it.w}`);
};

// ── Shot Analyzer — opened from Review > Tools ────────────────────────────
await page.goto(`${BASE}/coach/review-tools`, { waitUntil: 'networkidle2', timeout: 60000 });
await sleep(2500);
await enterCoach(page, `${BASE}/coach/review-tools`, sleep);
if (await clickText('SHOT ANALYZER')) {
  await sleep(3500);
  // Prove the analyzer actually OPENED. The coach nav looks identical whether
  // the tool launched or the click missed, so a clean measurement of the
  // launcher would otherwise be reported as a clean measurement of the tool.
  const opened = await page.evaluate(() => /RECORD|FROM GALLERY|CHECKPOINT|SHOOTING HAND/i.test(document.body.innerText));
  if (!opened) {
    console.log('SKIP     review-tools > SHOT ANALYZER (clicked, but the tool did not open)');
  } else {
    report('review-tools > SHOT ANALYZER [open]', await measure());
  }
} else {
  console.log('SKIP     review-tools > SHOT ANALYZER (launcher entry not found)');
}

// ── BHBC tabs — state, not routes ────────────────────────────────────────
for (const tab of ['Overview', 'Roster', 'Schedule', 'Medical', 'Games']) {
  await page.goto(`${BASE}/coach/bhbc`, { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(2200);
  await enterCoach(page, `${BASE}/coach/bhbc`, sleep);
  const ok = await clickText(tab);
  await sleep(1600);
  report(`bhbc > ${tab}${ok ? '' : ' (tab not found — measured default)'}`, await measure());
}

// -- MODALS — the same blind spot as the tabs, one level deeper -----------
// A modal is never a route either, so nothing has ever measured one at 390px.
const openModal = async (path, tab, trigger, name, needle) => {
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(2200);
  await enterCoach(page, `${BASE}${path}`, sleep);
  if (tab) { await clickText(tab); await sleep(1400); }
  const hit = await page.evaluate((t) => {
    const re = new RegExp(t, 'i');
    const el = [...document.querySelectorAll('button,[role="button"],a,tr,div')]
      .find(e => re.test((e.textContent || '').trim()) && e.getBoundingClientRect().width > 0 && e.children.length < 8);
    if (!el) return false;
    (el.closest('button,[role="button"],tr') || el).click();
    return true;
  }, trigger);
  await sleep(2200);
  if (!hit) { console.log(`SKIP     ${name} (no trigger matching /${trigger}/)`); return; }
  const open = await page.evaluate((n) => new RegExp(n, 'i').test(document.body.innerText), needle);
  if (!open) { console.log(`SKIP     ${name} (trigger clicked, modal did not open)`); return; }
  report(`${name} [open]`, await measure());
};

await openModal('/coach/bhbc', null, 'CHECK-IN', 'bhbc > wellness check-in', 'sleep|energy|pain');
await openModal('/coach/bhbc', null, 'LOG PRACTICE', 'bhbc > log practice', 'minutes|rpe|roster');
// The roster row has no stable text to match on — click the row itself.
{
  const path = `${BASE}/coach/bhbc`;
  await page.goto(path, { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(2200);
  await enterCoach(page, path, sleep);
  await clickText('Roster');
  await sleep(1600);
  const hit = await page.evaluate(() => {
    // RosterGrid renders athlete CARDS (.bhbc-card), not the .bhbc-row used
    // by the board views.
    const row = document.querySelector('.bhbc-card') || document.querySelector('.bhbc-row');
    if (!row) return false;
    row.click();
    return true;
  });
  await sleep(2200);
  const open = hit && await page.evaluate(() => /READINESS|FULL HISTORY|BODYWEIGHT|SESSIONS/i.test(document.body.innerText));
  if (!open) console.log('SKIP     bhbc > athlete detail (row not found or modal did not open)');
  else report('bhbc > athlete detail [open]', await measure());
}

console.log(fails ? `\n${fails} surface(s) overflow at 390px` : '\nall nested surfaces clear at 390px');
await page.close();
await browser.disconnect();
process.exit(fails ? 1 : 0);
