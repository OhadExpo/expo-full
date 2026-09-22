// THE DEMO, AS A CLIENT WILL SEE IT.
//
// Ohad, 22.9: "tommrow i have my first client demo. make sure the demo site is
// perfect. a complete perfect working clone of the real app with all of its
// features... both english and hebrew, the design, the features."
//
// Every demo surface, in both languages, at phone and desktop. For each one it
// reports the four things that would embarrass him in front of a client:
//
//   DEAD      the screen rendered almost nothing
//   ERROR     something threw, or a request failed
//   ENGLISH   Latin UI text on a Hebrew screen (data and brand excluded)
//   DEADTAB   a tab that changes nothing when you press it
//
// Signed OUT, in an isolated browser context, because that is how a prospect
// arrives — and because the shared debug profile would otherwise sign the run
// in as the owner and show real client data on a demo screen.
//
//   node scripts/verify-demo.mjs [--shots]
import fs from 'node:fs';
import P from 'puppeteer-core';

const BASE = process.env.BASE || 'http://127.0.0.1:5199';
const SHOTS = process.argv.includes('--shots');
const OUT = 'audit-out/demo';
fs.mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const SURFACES = [
  ['landing', '/demo'],
  ['landing-en', '/demo/en'],
  ['landing-he', '/demo/he'],
  ['coach', '/demo/coach'],
  ['athlete', '/demo/athlete'],
  ['sandbox', '/demo/sandbox'],
  ['try', '/try'],
];
const LANGS = ['en', 'he'];
const WIDTHS = [[390, 844], [1440, 950]];

// Latin that is NOT a translation failure: the brand, the stack, units.
const ALLOW = /^(expo|bhbc|rpe|prs?|1rm|bw|kg|cm|km|vat|id|ok|pdf|csv|url|api|ai|hr|acwr|rom|emom|amrap|tut|e?mail|whatsapp|zoom|google|apple|ios|android|chrome|supabase|vercel|youtube|instagram|mediapipe|lite|full|min|max|am|pm|[a-z]{1,2})$/i;

const src = (() => {
  const parts = [];
  const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    const p = d + '/' + f.name;
    if (f.isDirectory()) { if (!/node_modules|dist/.test(f.name)) walk(p); }
    else if (/\.(jsx?|css)$/.test(f.name) && !/^(exerciseData|demoTraineeData)/.test(f.name)) parts.push(fs.readFileSync(p, 'utf8'));
  } };
  walk('src');
  return parts.join('\n');
})();

const findings = [];
const add = (o) => { findings.push(o); console.log(`${o.kind.padEnd(8)} ${o.id.padEnd(26)} ${o.detail}`); };

const b = await P.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 300000 });
let measured = 0;

for (const [name, route] of SURFACES) {
  for (const lang of LANGS) {
    for (const [w, h] of WIDTHS) {
      const id = `${name}/${lang}/${w}`;
      const ctx = await b.createBrowserContext();
      const pg = await ctx.newPage();
      const errs = [];
      pg.on('pageerror', (e) => errs.push('threw: ' + String(e.message || e).slice(0, 120)));
      pg.on('console', (m) => {
        if (m.type() !== 'error') return;
        const t = m.text();
        // "Failed to load resource" is covered by the response listener below,
        // with the URL attached; keeping both just prints the same fault twice.
        if (/favicon|_vercel\/insights|net::ERR_|Failed to load resource/i.test(t)) return;
        errs.push('console: ' + t.slice(0, 120));
      });
      pg.on('requestfailed', (r) => { if (!/insights|favicon/.test(r.url())) errs.push('request failed: ' + r.url().split('?')[0].slice(-60)); });
      // A console line reading "Failed to load resource: 404" does not say WHAT
      // 404'd, which is useless. Catch the response itself so the finding names
      // the URL — the first run reported a 404 on the landing page and every
      // asset in the source returned 200 when checked by hand.
      pg.on('response', (r) => {
        const u = r.url();
        if (r.status() < 400) return;
        if (/insights|favicon|fonts\.gstatic|hot-update/.test(u)) return;
        errs.push(`HTTP ${r.status()} ${u.replace(BASE, '').split('?')[0].slice(-70)}`);
      });
      try {
        await pg.setViewport({ width: w, height: h, deviceScaleFactor: 2, isMobile: w < 700, hasTouch: w < 700 });
        await pg.evaluateOnNewDocument((L) => { try { localStorage.setItem('expo-lang', L); localStorage.setItem('expo-install-snooze-until', String(Date.now() + 86400000)); } catch (e) { /* private */ } }, lang);
        await pg.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 60000 });
        // WAIT UNTIL IT STOPS GROWING, don't guess a number. A fixed 9s sleep
        // reported /demo/sandbox as DEAD with 135 chars at 1440 — and the same
        // page measured 774 chars at both widths when checked by hand a minute
        // later. The lazy chunk simply had not mounted yet. A phantom is worse
        // than no finding on the night before a client demo.
        let settled = false, prevLen = -1;
        for (let i = 0; i < 24; i++) {
          await wait(700);
          const len = await pg.evaluate(() => (document.body.innerText || '').length);
          if (len === prevLen && len > 0) { settled = true; break; }
          prevLen = len;
        }
        await wait(1200);
        await pg.evaluate(async () => { for (let i = 0; i < 12; i++) { window.scrollBy(0, innerHeight); await new Promise((r) => setTimeout(r, 90)); } window.scrollTo(0, 0); });
        await wait(600);

        const r = await pg.evaluate(() => {
          const txt = (document.body.innerText || '');
          const nodes = [];
          const wk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
          let n;
          while ((n = wk.nextNode())) {
            const t = (n.nodeValue || '').replace(/\s+/g, ' ').trim();
            if (!t || !n.parentElement) continue;
            const bb = n.parentElement.getBoundingClientRect();
            if (bb.width < 1 || bb.height < 1) continue;
            // NOT PAINTED IS NOT SHOWN. tbFor() renders BOTH languages stacked
            // in a grid and hides the other one with visibility:hidden — a
            // width reservation so a label does not resize when the language
            // flips. It still has a box, so a rect test counts it, and the
            // first run reported "LOG OUT" as untranslated on the Hebrew
            // athlete portal when what renders there is יציאה.
            let hidden = false;
            for (let el = n.parentElement; el && el !== document.body; el = el.parentElement) {
              const cs = getComputedStyle(el);
              if (cs.visibility === 'hidden' || cs.opacity === '0' || el.getAttribute('aria-hidden') === 'true') { hidden = true; break; }
            }
            if (hidden) continue;
            nodes.push(t);
          }
          const tabs = [...document.querySelectorAll('button,[role=tab]')]
            .map((x, i) => ({ i, t: (x.textContent || '').replace(/\s+/g, ' ').trim() }))
            .filter((x) => x.t && x.t.length < 26);
          return { chars: txt.length, nodes, tabs: tabs.slice(0, 14), sig: txt.replace(/\s+/g, ' ').slice(0, 90) };
        });

        measured++;
        if (!settled) add({ kind: 'UNSETTLED', id, detail: `still changing after 17s — NOT judged` });
        else if (r.chars < 200) add({ kind: 'DEAD', id, detail: `only ${r.chars} chars on screen` });
        for (const e of [...new Set(errs)].slice(0, 3)) add({ kind: 'ERROR', id, detail: e });

        // /demo/en is English ON PURPOSE — it is the forced-English counterpart
        // of /demo/he, for sharing one language deliberately. Checking it for
        // Hebrew reported 85 "untranslated" strings that are the whole point.
        if (lang === 'he' && name !== 'landing-en') {
          const leaks = [];
          for (const t of r.nodes) {
            if (/[֐-׿]/.test(t)) continue;
            if (!/[A-Za-z]/.test(t)) continue;
            if (ALLOW.test(t) || /@|https?:|^\+?\d/.test(t)) continue;
            if (!src.includes(t)) continue;           // data, not UI
            leaks.push(t);
          }
          const uniq = [...new Set(leaks)];
          if (uniq.length) add({ kind: 'ENGLISH', id, detail: `${uniq.length} untranslated: ${uniq.slice(0, 6).map((x) => JSON.stringify(x.slice(0, 28))).join(' ')}` });
        }

        // A tab that changes nothing is a dead tab.
        if (/coach|athlete/.test(name)) {
          for (const tab of r.tabs.slice(0, 10)) {
            const before = await pg.evaluate(() => (document.body.innerText || '').length);
            const hit = await pg.evaluate((i) => { const x = [...document.querySelectorAll('button,[role=tab]')][i]; if (!x) return false; x.click(); return true; }, tab.i);
            if (!hit) continue;
            await wait(2200);
            const after = await pg.evaluate(() => (document.body.innerText || '').length);
            if (Math.abs(after - before) < 3 && after < 400) add({ kind: 'DEADTAB', id, detail: `"${tab.t}" -> ${after} chars` });
          }
        }

        if (SHOTS) await pg.screenshot({ path: `${OUT}/${name}-${lang}-${w}.png`, fullPage: true });
      } catch (e) {
        add({ kind: 'ERROR', id, detail: 'harness: ' + String(e.message || e).slice(0, 110) });
      } finally { await pg.close().catch(() => {}); await ctx.close().catch(() => {}); }
    }
  }
}
b.disconnect();

fs.writeFileSync(`${OUT}/findings.json`, JSON.stringify(findings, null, 1));
const by = {};
for (const f of findings) by[f.kind] = (by[f.kind] || 0) + 1;
console.log(`\n${measured} of ${SURFACES.length * LANGS.length * WIDTHS.length} surface x language x width combinations measured.`);
console.log(Object.keys(by).length ? Object.entries(by).map(([k, v]) => `  ${k.padEnd(9)} ${v}`).join('\n') : '  none');
console.log(`-> ${OUT}/findings.json`);
process.exit(findings.length ? 1 : 0);
