// THE POPUPS WERE NEVER MEASURED (#473, found by the 30.9 queue reconciliation).
//
// strip-title-fit, no-text-overflow and box-centring walk PAGES; not one of them
// opens a popup - and the club zone's real work happens in popups (log a lift,
// log S&C, minutes played, an injury, the athlete card, the program, game
// details, manage roster). Every green battery said nothing about them.
//
// This opens each one (read-only: it never types, never saves - Escape closes)
// at 360 / 768 / 1440 in English and Hebrew and measures INSIDE the dialog:
//   PANEL   the dialog panel is wider than the screen
//   SPILL   a text element runs past the panel's edge
//   CLIP    a text element is cut (scrollWidth > clientWidth with overflow hidden)
//   WRAP    the popup's title breaks onto a second line
//   OFF     a control's text sits more than 1.5px off its box centre
// A popup that does not open is NOT MEASURED - red, never a quiet pass.
//
//   CDP=http://[::1]:9444 BASE=http://127.0.0.1:5262 node scripts/verify-popups.mjs [--only lift,athlete] [--widths 360,1440] [--langs en,he]
import fs from 'node:fs';
import P from 'puppeteer-core';
import * as A from './lib/authed-page.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:5262';
const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const ONLY = arg('--only');
const WIDTHS = (arg('--widths') || '360,768,1440').split(',').map(Number);
const LANGS = (arg('--langs') || 'en,he').split(',');
const OUT = 'audit-out/popups';
fs.mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// how to open each popup: a route + a click (by button text, or a selector)
const POPUPS = [
  { id: 'lift', route: '/coach/bhbc/lifts', text: /^(Log lift|רישום כוח אישי)$/i },
  { id: 'roster', route: '/coach/bhbc/roster', text: /^(Manage roster|ניהול הסגל)$/i },
  { id: 'athlete', route: '/coach/bhbc/overview', sel: '.bhbc-load-row' },
  { id: 'program', route: '/coach/bhbc/overview', sel: '.bhbc-load-row', then: /^(View program|תוכנית האימון)/i },
  { id: 'injury', route: '/coach/bhbc/medical', text: /^(View ›|‹ צפייה)$/ },
  { id: 'game', route: '/coach/bhbc/schedule', text: /^(Edit|עריכה)$/i },
  { id: 'sc', route: '/coach/bhbc/practices', sel: '.bhbc-sc-btn' },
  { id: 'minutes', route: '/coach/bhbc/games', after: /^(MINUTES PLAYED|דקות משחק)/i },
].filter((p) => !ONLY || ONLY.split(',').includes(p.id));

function measure() {
  const dlgs = [...document.querySelectorAll('[role="dialog"]')].filter((d) => d.getBoundingClientRect().height > 0);
  const dlg = dlgs[dlgs.length - 1];
  if (!dlg) return null;
  // the PANEL = the dialog's widest bordered/background child that is not the full-screen scrim
  const vw = document.documentElement.clientWidth;
  const cand = [...dlg.querySelectorAll('div')].filter((d) => { const r = d.getBoundingClientRect(); const cs = getComputedStyle(d); return r.width > 200 && r.width <= vw + 2 && r.height > 80 && cs.backgroundColor !== 'rgba(0, 0, 0, 0)'; });
  const panel = cand.sort((a, b) => b.getBoundingClientRect().width * b.getBoundingClientRect().height - a.getBoundingClientRect().width * a.getBoundingClientRect().height)[0] || dlg;
  const pr = panel.getBoundingClientRect();
  const out = [];
  if (pr.width > vw + 1) out.push({ k: 'PANEL', t: '', d: `${Math.round(pr.width)}px on a ${vw}px screen` });
  const vis = (el) => { for (let e = el; e && e !== dlg; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') return false; } return true; };
  const lab = (el) => (el.innerText || el.value || el.placeholder || '').replace(/\s+/g, ' ').trim().slice(0, 36);
  // any scrolling container inside the panel: its content may legitimately run past the panel
  const inScroller = (el) => { for (let e = el.parentElement; e && e !== panel; e = e.parentElement) { const cs = getComputedStyle(e); if (/(auto|scroll)/.test(cs.overflowX)) return true; } return false; };
  for (const el of panel.querySelectorAll('*')) {
    if (!vis(el) || el.closest('svg')) continue;
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.nodeValue.trim());
    if (!own) continue;
    const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) continue;
    if (!inScroller(el) && (r.right > pr.right + 1 || r.left < pr.left - 1)) out.push({ k: 'SPILL', t: lab(el), d: `${Math.round(Math.max(r.right - pr.right, pr.left - r.left))}px past the panel` });
    const cs = getComputedStyle(el);
    if (el.scrollWidth > el.clientWidth + 1 && /hidden|clip/.test(cs.overflowX) && cs.textOverflow !== 'ellipsis') out.push({ k: 'CLIP', t: lab(el), d: `${el.scrollWidth - el.clientWidth}px cut` });
  }
  // the title
  const tid = dlg.getAttribute('aria-labelledby'); const title = tid && document.getElementById(tid);
  // TEXT lines only: the title holds the club crest image, whose box read as a
  // "second line" when the whole element was measured
  if (title) {
    const tops = new Set(); const tw = document.createTreeWalker(title, NodeFilter.SHOW_TEXT); let tn;
    while ((tn = tw.nextNode())) { if (!tn.nodeValue.trim() || !vis(tn.parentElement)) continue; const rg = document.createRange(); rg.selectNodeContents(tn); for (const q of rg.getClientRects()) if (q.width > 0) tops.add(Math.round(q.top + q.height / 2)); }
    const lines = [...tops].sort((x, y) => x - y).filter((v, i, arr) => i === 0 || v - arr[i - 1] > 4).length;
    if (lines > 1) out.push({ k: 'WRAP', t: lab(title), d: `${lines} lines` });
  }
  // controls: text centred in the box
  const T = /rgba\(\d+, \d+, \d+, 0\)|transparent/;
  for (const el of panel.querySelectorAll('button, [role="button"], select, input[type="text"], input[type="number"], input:not([type])')) {
    if (!vis(el)) continue;
    const r = el.getBoundingClientRect(); if (r.height < 18 || r.height > 60 || r.width < 16) continue;
    const cs = getComputedStyle(el);
    const top = parseFloat(cs.borderTopWidth) || 0, bot = parseFloat(cs.borderBottomWidth) || 0;
    if (!(top >= 0.5 && bot >= 0.5 && !T.test(cs.borderTopColor))) continue;   // a boxed control only
    let t = Infinity, b = -Infinity;
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let n;
    while ((n = walk.nextNode())) { if (!n.nodeValue.trim()) continue; const rg = document.createRange(); rg.selectNodeContents(n); for (const q of rg.getClientRects()) if (q.width > 0) { t = Math.min(t, q.top); b = Math.max(b, q.bottom); } }
    if (!(b > t)) continue;
    if (new Set([...el.querySelectorAll('*')].map((x) => Math.round(x.getBoundingClientRect().top))).size > 3) continue;   // multi-line content
    const above = t - (r.top + top), below = (r.bottom - bot) - b;
    if (Math.abs(above - below) > 1.5) out.push({ k: 'OFF', t: lab(el), d: `${above.toFixed(1)} above / ${below.toFixed(1)} below` });
  }
  return { panelW: Math.round(pr.width), out };
}

const b = await P.connect({ browserURL: process.env.CDP || 'http://[::1]:9444', defaultViewport: null, protocolTimeout: 300000 });
const ctx = await b.createBrowserContext();
const pg = await ctx.newPage();
const findings = []; let measured = 0, notOpened = 0;
try {
  await pg.evaluateOnNewDocument(() => { try { sessionStorage.setItem('expo-portal-choice', 'trainer'); localStorage.setItem('expo-install-snooze-until', String(Date.now() + 86400000)); } catch (e) { /* private */ } });
  let ok = false; for (let k = 0; k < 3 && !ok; k++) { await A.signIn(pg, BASE); ok = await A.assertAuthed(pg, BASE); }
  if (!ok) throw new Error('not signed in - NOT measured');
  for (const lang of LANGS) {
    await pg.evaluateOnNewDocument((l) => { try { localStorage.setItem('expo-lang', l); localStorage.setItem('expo-collapse:bhbc-lang', JSON.stringify(l)); } catch (e) { /* private */ } }, lang);
    for (const w of WIDTHS) {
      const phone = w < 700;
      await pg.emulate({ viewport: { width: w, height: phone ? 844 : 900, deviceScaleFactor: phone ? 2 : 1, isMobile: phone, hasTouch: phone }, userAgent: phone ? 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0 Mobile Safari/537.36' : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0 Safari/537.36' });
      for (const p of POPUPS) {
        const id = `${p.id}/${lang}/${w}`;
        try {
          await pg.goto(BASE + p.route, { waitUntil: 'domcontentloaded', timeout: 60000 });
          let prev = -1; for (let i = 0; i < 20; i++) { await wait(700); const n = await pg.evaluate(() => document.body.innerText.length); if (n === prev && n > 300) break; prev = n; }
          if (await pg.evaluate(() => !!document.querySelector('input[type="password"]'))) throw new Error('landed on the sign-in page');
          const clicked = await pg.evaluate((src, sel, after) => {
            if (sel) { const el = [...document.querySelectorAll(sel)].find((e) => e.getBoundingClientRect().height > 0); if (el) { el.click(); return true; } return false; }
            if (after) {
              const re = new RegExp(after, 'i');
              const head = [...document.querySelectorAll('div, span')].find((e) => re.test((e.innerText || '').trim()) && e.childElementCount < 3);
              if (!head) return false;
              const all = [...document.querySelectorAll('button, [role="button"]')].filter((e) => e.getBoundingClientRect().height > 0 && (head.compareDocumentPosition(e) & Node.DOCUMENT_POSITION_FOLLOWING));
              if (all[0]) { all[0].click(); return true; } return false;
            }
            const re = new RegExp(src, 'i');
            const el = [...document.querySelectorAll('button, [role="button"]')].find((e) => re.test((e.innerText || '').trim()) && e.getBoundingClientRect().height > 0);
            if (el) { el.click(); return true; } return false;
          }, p.text ? p.text.source : null, p.sel || null, p.after ? p.after.source : null);
          if (!clicked) throw new Error('opener not found');
          await wait(1500);
          if (p.then) {
            const ok2 = await pg.evaluate((src) => { const re = new RegExp(src, 'i'); const el = [...document.querySelectorAll('[role="dialog"] button, [role="dialog"] [role="button"]')].find((e) => re.test((e.innerText || '').trim())); if (el) { el.click(); return true; } return false; }, p.then.source);
            if (!ok2) throw new Error('second step not found');
            await wait(1800);
          }
          const r = await pg.evaluate(measure);
          if (!r) throw new Error('no dialog opened');
          measured++;
          await pg.screenshot({ path: `${OUT}/${p.id}-${lang}-${w}.png` });
          for (const f of r.out) { findings.push({ id, ...f }); console.log(`${f.k.padEnd(6)} ${id.padEnd(20)} "${f.t}" ${f.d}`); }
          if (!r.out.length) console.log(`ok     ${id.padEnd(20)} panel ${r.panelW}px`);
        } catch (e) { notOpened++; findings.push({ id, k: 'NOT', d: String(e.message || e).slice(0, 80) }); console.log(`NOT    ${id.padEnd(20)} ${String(e.message || e).slice(0, 80)} - NOT measured`); }
        await pg.keyboard.press('Escape').catch(() => {}); await wait(300); await pg.keyboard.press('Escape').catch(() => {}); await wait(300);
      }
    }
  }
} finally {
  fs.writeFileSync(`${OUT}/findings.json`, JSON.stringify(findings, null, 1));
  await ctx.close(); b.disconnect();
}
const total = POPUPS.length * WIDTHS.length * LANGS.length;
console.log(`\n${measured} of ${total} popup x width x language measured${notOpened ? ` (${notOpened} NOT opened)` : ''}. Findings: ${findings.filter((f) => f.k !== 'NOT').length}`);
process.exit(findings.length ? 1 : 0);
