// THE LOGGER'S TOP BAR NEVER PRINTS ONE LABEL OVER ANOTHER (9.10 #585).
//
// The day label ("DAY A · W1") used to be absolutely centred on the bar, outside
// the flow, so nothing could push it aside: a BHBC athlete's crest + EXIT + the
// save tick printed over it at 360, "↻ RESUMED" did at every width, and
// "… SAVING" pushed EXIT off the screen. The bar is now a 1fr | label | 1fr grid.
// This gate proves, on the states that broke it:
//   - the label's VISIBLE ink (the name clipped by its ellipsis box, the whole
//     label clipped by its own box) intersects nothing else in the bar;
//   - the week (" · W1") is fully visible;
//   - the bar does not overflow and EXIT stays on the screen.
//
// Two cases:
//   A. the public demo athlete (anonymous, no DB writes), RESUMED: open Day A,
//      step once (the draft saves to this browser), reload, open again.
//   B. (PREVIEW_PLAN=<plan id>) the owner's PREVIEW of a BHBC athlete's program -
//      the crest is in the bar - after typing one set value, so the save tick is
//      there too. CoachPreviewPortal runs the athlete portal in demoMode with
//      no-op setters: nothing reaches the athlete. Signs the owner in on BASE.
// The pending-upload counter ("· ↑N") is not reachable here without a real
// upload; the 1008a review measured it on a replica of the bar, not this gate.
//
//   BASE=http://127.0.0.1:5341 CDP=http://127.0.0.1:9446 [PREVIEW_PLAN=pl_xxx CDP2=http://127.0.0.1:9222] \
//     node scripts/verify-logger-header-overlap.mjs [widths]
import P from 'puppeteer-core';
import { signIn } from './lib/authed-page.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:5341';
const CDP = process.env.CDP || 'http://127.0.0.1:9446';
const CDP2 = process.env.CDP2 || 'http://127.0.0.1:9222';
const WIDTHS = (process.argv[2] || '320,360,390,430,768').split(',').map(Number);
const PREVIEW_PLAN = process.env.PREVIEW_PLAN || '';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// first=true for the day's START/AGAIN (the FIRST day card - the same day on
// every pass, or the resumed draft is a different day's); otherwise the last
// match (a step's own NEXT sits below everything else)
const click = (page, src, first = false) => page.evaluate((s, f) => {
  const rx = new RegExp(s, 'i');
  const all = [...document.querySelectorAll('button,[role=button]')].filter((x) => rx.test((x.textContent || '').trim()) && (x.textContent || '').length < 40);
  const el = f ? all[0] : all.pop();
  if (el) { el.click(); return (el.textContent || '').trim().slice(0, 40); }
  return null;
}, src, first);

// measured in the page: the label, its visible ink, and every other painted box in the bar
const measure = (page) => page.evaluate(() => {
  // name · W<n> as three flex items (1008b review: a joined " · W2" text run read
  // "· W2 יום א" for a Hebrew day name)
  const label = [...document.querySelectorAll('span')].find((s) => /·\s*W\d+$/.test((s.textContent || '').trim()) && s.children.length === 3);
  if (!label) return { err: 'no day label (a span holding name, "·", "W<n>") in the logger bar' };
  const bar = label.parentElement;
  const box = (el) => { const r = el.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom }; };
  const ink = (el) => { const rg = document.createRange(); rg.selectNodeContents(el); const rs = [...rg.getClientRects()].filter((x) => x.width > 0); if (!rs.length) return null; return { l: Math.min(...rs.map((x) => x.left)), r: Math.max(...rs.map((x) => x.right)), t: Math.min(...rs.map((x) => x.top)), b: Math.max(...rs.map((x) => x.bottom)) }; };
  const clip = (a, c) => a && { l: Math.max(a.l, c.l), r: Math.min(a.r, c.r), t: Math.max(a.t, c.t), b: Math.min(a.b, c.b) };
  const [nameEl, sepEl, weekEl] = label.children;
  const LB = box(label);
  const nameInk = clip(clip(ink(nameEl), box(nameEl)), LB);
  const sepInk = clip(ink(sepEl), LB);
  const weekRaw = ink(weekEl);
  const weekInk = clip(weekRaw, LB);
  const parts = [nameInk, sepInk, weekInk].filter((x) => x && x.r - x.l > 0.5);
  // reading order: the separator sits BETWEEN the name and the week, on the
  // side the label's direction puts it (rtl: name rightmost)
  const rtl = getComputedStyle(label).direction === 'rtl';
  const nB = box(nameEl), sB = box(sepEl), wB = box(weekEl);
  const nameShown = nB.r - nB.l > 0.5;
  const order = !nameShown || (rtl ? (nB.l >= sB.r - 0.5 && sB.l >= wB.r - 0.5) : (nB.r <= sB.l + 0.5 && sB.r <= wB.l + 0.5));
  const gap = nameShown ? Math.round((rtl ? nB.l - sB.r : sB.l - nB.r) * 10) / 10 : null;
  const L = parts.length ? { l: Math.min(...parts.map((x) => x.l)), r: Math.max(...parts.map((x) => x.r)), t: Math.min(...parts.map((x) => x.t)), b: Math.max(...parts.map((x) => x.b)) } : null;
  const hits = [];
  if (L) for (const o of bar.querySelectorAll('span,img,button,svg')) {
    if (o === label || label.contains(o) || o.contains(label)) continue;
    const R = (o.tagName === 'IMG' || o.tagName.toLowerCase() === 'svg') ? box(o) : ink(o);
    if (!R || R.r - R.l <= 0) continue;
    if (R.l < L.r - 0.5 && R.r > L.l + 0.5 && R.t < L.b - 0.5 && R.b > L.t + 0.5) hits.push(`${o.tagName.toLowerCase()} "${(o.textContent || o.getAttribute('alt') || '').trim().slice(0, 20)}" [${Math.round(R.l)}-${Math.round(R.r)}]`);
  }
  const BR = box(bar);
  return {
    label: (label.textContent || '').trim(),
    L: L ? [Math.round(L.l), Math.round(L.r)] : null,
    hits: [...new Set(hits)],
    weekFull: !!(weekRaw && weekInk && weekInk.r - weekInk.l >= weekRaw.r - weekRaw.l - 1),
    order, rtl, gap,
    bundle: ([...document.scripts].map((x) => x.src).find((x) => /index-/.test(x)) || '').split('/').pop(),
    off: L ? Math.round(((L.l + L.r) / 2 - (BR.l + BR.r) / 2) * 10) / 10 : null,
    nameCut: nameEl.scrollWidth > nameEl.clientWidth + 1,
    barOverflow: bar.scrollWidth > bar.clientWidth + 1,
    exitOut: (() => { const ex = [...bar.querySelectorAll('button')].pop(); return ex ? box(ex).r > innerWidth + 0.5 : false; })(),
    resumed: /RESUMED|הופעל מחדש/.test(document.body.innerText),
    crest: !!bar.querySelector('img[src*="bnei-herzliya"]'),
    tick: /✓/.test(bar.innerText),
  };
});

let bad = 0, measured = 0, expected = 0;
const judge = (tag, w, r, need) => {
  if (r.err) { bad++; console.log(`FAIL ${tag} ${w}: ${r.err}`); return; }
  for (const [k, why] of need) if (!r[k]) { bad++; console.log(`FAIL ${tag} ${w}: ${why} - the state this case exists for was not reached`); return; }
  measured++;
  const fails = [];
  if (r.hits.length) fails.push(`"${r.label}" [${r.L}] is overlapped by ${r.hits.join(', ')}`);
  if (!r.weekFull) fails.push(`the week is not fully visible in "${r.label}"`);
  if (!r.order) fails.push(`"${r.label}" is out of reading order (${r.rtl ? 'rtl' : 'ltr'}): the "·" is not between the name and the week`);
  if (r.gap !== null && r.gap < 2) fails.push(`no space between the name and the "·" (${r.gap}px)`);
  if (r.barOverflow) fails.push('the bar overflows its width');
  if (r.exitOut) fails.push('EXIT is past the right edge of the screen');
  if (fails.length) { bad++; console.log(`FAIL ${tag} ${w}: ${fails.join('; ')}`); }
  else console.log(`ok   ${tag} ${w}: "${r.label}" [${r.L}] clear, in ${r.rtl ? 'rtl' : 'ltr'} order, week visible, ${r.off}px from the bar centre${r.nameCut ? ', name truncated to fit' : ''} (${r.bundle})`);
};

// A. demo athlete, resumed - in English AND Hebrew; in Hebrew also with a Hebrew
// day name (SYNTHETIC: the demo's day names are English, so the name's text is
// swapped in place - dir="auto" re-resolves the row's direction from it)
{
  const b = await P.connect({ browserURL: CDP });
  for (const lang of ['en', 'he']) for (const w of WIDTHS) {
    const tag = `demo-${lang}`;
    expected++;
    const page = await b.newPage();
    await page.setViewport({ width: w, height: 860, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    try {
      await page.goto(`${BASE}/demo/athlete?lang=${lang}`, { waitUntil: 'domcontentloaded' }); await wait(5000);
      await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('expo-stepLogger-')) localStorage.removeItem(k); });   // the logger's drafts only (an install-prompt snooze must survive)
      await page.reload({ waitUntil: 'domcontentloaded' }); await wait(5000);
      if (!(await click(page, '^(START|AGAIN|התחל|שוב)$', true))) { bad++; console.log(`FAIL ${tag} ${w}: no START/AGAIN on the demo athlete - nothing measured`); continue; }
      await wait(2500); await click(page, '^(maybe later|אחר כך)'); await click(page, '^(NEXT|הבא|החימום הבא)'); await wait(2000);
      await page.reload({ waitUntil: 'domcontentloaded' }); await wait(5000);
      await click(page, '^(START|AGAIN|RESUME|התחל|שוב)', true); await wait(2500);
      const r = await measure(page);
      if (process.env.SHOT) await page.screenshot({ path: `${process.env.SHOT}/logger-${tag}-${w}.png`, clip: { x: 0, y: 0, width: w, height: 150 } });
      judge(tag, w, r, [['resumed', 'the logger did not resume']]);
      if (lang === 'he') {
        expected++;
        const swapped = await page.evaluate(() => { const l = [...document.querySelectorAll('span')].find((s) => /·\s*W\d+$/.test((s.textContent || '').trim()) && s.children.length === 3); if (!l) return false; l.children[0].textContent = 'יום א — דחיפה'; return true; });
        await wait(300);
        if (!swapped) { bad++; console.log(`FAIL demo-he-name ${w}: no label to swap - nothing measured`); }
        else {
          const r2 = await measure(page);
          if (process.env.SHOT) await page.screenshot({ path: `${process.env.SHOT}/logger-demo-he-name-${w}.png`, clip: { x: 0, y: 0, width: w, height: 150 } });
          judge('demo-he-name', w, r2, [['rtl', 'a Hebrew day name did not make the label RTL']]);
        }
      }
    } finally { await page.close(); }
  }
  await b.disconnect();
}

// B. owner preview of a BHBC athlete: crest + save tick
if (PREVIEW_PLAN) {
  const b = await P.connect({ browserURL: CDP2 });
  let signedIn = false;
  // the coach preview frames the athlete portal with a 12px gutter on each side,
  // so a phone of width w is the preview at w + 24
  for (const w of WIDTHS.filter((x) => x <= 430)) {
    expected++;
    const page = await b.newPage();
    await page.setViewport({ width: w + 24, height: 860, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    try {
      if (!signedIn) { await signIn(page, BASE); signedIn = true; }
      await page.goto(`${BASE}/coach/programs/${PREVIEW_PLAN}/preview?lang=en`, { waitUntil: 'domcontentloaded' }); await wait(9000);
      await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('expo-stepLogger-')) localStorage.removeItem(k); });
      await click(page, '^(AGAIN|START)$', true); await wait(4000);
      for (let i = 0; i < 10; i++) {
        if (await page.$('input[inputmode="numeric"],input[inputmode="decimal"],input[type="number"]')) break;
        await click(page, '^(maybe later|next|start check-in|start workout|skip|continue)'); await wait(1800);
      }
      const inp = await page.$('input[inputmode="numeric"],input[inputmode="decimal"],input[type="number"]');
      if (inp) { await inp.click(); await inp.type('8', { delay: 100 }); await wait(2500); }
      const r = await measure(page);
      if (process.env.SHOT) await page.screenshot({ path: `${process.env.SHOT}/logger-bhbc-${w}.png`, clip: { x: 0, y: 0, width: w, height: 260 } });
      judge('bhbc', w, r, [['crest', 'no club crest in the bar'], ['tick', 'no save tick after typing']]);
    } finally { await page.close(); }
  }
  await b.disconnect();
}

if (!PREVIEW_PLAN) console.log('SKIPPED case B (BHBC crest + save tick): set PREVIEW_PLAN=<a BHBC athlete plan id> - the 360px crest case is NOT measured in this run');
console.log(`LOGGER HEADER OVERLAP: ${measured}/${expected} cases measured in their state, ${bad} failed${PREVIEW_PLAN ? '' : ' (case B skipped)'}`);
process.exit(bad || measured < expected ? 1 : 0);
