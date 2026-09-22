// HOW MUCH OF THE HEBREW UI IS ACTUALLY IN HEBREW.
//
// Ohad, 22.9: "make the hebrew go from 10% to over 90% on all of our platforms
// avaialbale". Before rewriting anything, measure it - a rewrite aimed at a
// guess lands on a guess.
//
// WHAT IT COUNTS. With the app set to Hebrew, every VISIBLE text node on every
// route, scrolled to the bottom (#149), classified:
//
//   he     contains a Hebrew letter                      -> translated
//   en     Latin letters, no Hebrew, AND the exact text
//          appears as a literal in src/                  -> an UNTRANSLATED UI string
//   data   Latin, but NOT found in src/                  -> a person's name, an
//          email, an exercise title, a plan title. Not ours to translate, and
//          never printed: the repo is public.
//   skip   digits, punctuation, glyphs, and the allowlist below
//
// Coverage = he / (he + en). `data` is excluded from both sides on purpose -
// counting a client's Latin-spelled name as an untranslated string would make
// the number meaningless and would put his roster in a report.
//
//   node scripts/report-hebrew-coverage.mjs [width] [route...]
import fs from 'node:fs';
import path from 'node:path';
import P from 'puppeteer-core';
import * as A from './lib/authed-page.mjs';
import { setWidth } from './lib/viewport.mjs';

const W = Number(process.argv[2]) || 1500;
const BASE = process.env.BASE || 'http://127.0.0.1:5199';
const OUT = process.env.OUT || '';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Terms that stay Latin BY RULE and are not failures:
//  - the brand and the club (EXPO, BHBC, Bnei Herzliya)
//  - units and training shorthand Israelis write in Latin anyway
//  - anything that is an identifier, not language
// The exercise TAXONOMY is frozen English by CLAUDE.md ("canonical - do not
// modify without explicit request"), so its terms are not misses either.
const TAXONOMY = /^(chest|back|shoulders?|arms|core|legs|glutes|full body|olympic|olympic lift|cardio|other|barbell|dumbbell|bodyweight|machine|cable|band|kettlebell|medicine ball|landmine|trx\/suspension|standing|seated|supine|prone|kneeling|half-kneeling|quadruped|side-lying|hanging|push|pull|row|curl|extend|squat|hinge|lunge|rotation|anti-rotation|carry|lateral raise|front raise|pullover|throw|slam|toss|jump|isometric|horizontal push|horizontal pull|vertical push|vertical pull|hip hinge|carry\/loaded locomotion|rotation\/anti-rotation|isolation|bilateral|unilateral|alternating|hamstrings|quadriceps|latissimus dorsi|rhomboids|trapezius|deltoids|biceps|triceps|pectorals|abdominals|erector spinae|hip flexors|calves|adductors|abductors|elbow|scapula|knee|hip|ankle|spine|wrist|shoulder extension|shoulder flexion|elbow flexion|elbow extension|knee extension|knee flexion)$/i;
const ALLOW = /^(expo|bhbc|bnei herzliya|rpe|prs?|1rm|bw|kg|cm|km|ml|vat|id|ok|pdf|csv|png|jpg|url|api|sms|pwa|ai|gps|hr|acwr|rom|emom|amrap|tut|e?mail|whatsapp|zoom|google|apple|ios|android|chrome|supabase|vercel|youtube|instagram|tiktok|facebook|am|pm|[a-z]{1,2})$/i;

// THE TRANSLATOR'S OWN DICTIONARY. A Latin string that IS a key in i18n.js is a
// WIRING bug - the translation exists and the call site did not use it - which
// is a different job from a string nobody has translated yet. Splitting them is
// the difference between a list and a work plan.
const I18N_KEYS = (() => {
  try {
    // BOTH dictionaries: the app's and the marketing site's.
    let src = fs.readFileSync('src/i18n.js', 'utf8');
    try { src += String.fromCharCode(10) + fs.readFileSync('expo-il/src/i18n.js', 'utf8'); } catch (e) { /* optional */ }
    const keys = new Set();
    // Line-shaped on purpose: i18n.js is one `"key": 'value',` per line, and a
    // clever regex over the whole file kept mangling its own escapes.
    for (const line of src.split('\n')) {
      const m = /^\s*(?:"([^"]+)"|'([^']+)')\s*:/.exec(line);
      if (m) keys.add(m[1] || m[2]);
    }
    return keys;
  } catch (e) { return new Set(); }
})();

// Club athletes' names, read from the map BhbcView already keeps for them. They
// are data, not UI - and they are never printed by this gate.
const CLUB_NAMES = (() => {
  const out = new Set();
  try {
    const src = fs.readFileSync('src/BhbcView.jsx', 'utf8');
    for (const m of src.matchAll(/'([A-Z][A-Za-z.'-]+(?: [A-Z][A-Za-z.'-]+)+)':\s*['"][֐-׿]/g)) out.add(m[1]);
  } catch (e) { /* optional */ }
  return out;
})();

// Plan and block titles are data too: "Block #19", "Block Beta", "Day B".
const DATA_SHAPE = /^(block|day [a-z]$|md-\d|week \d)/i;

const srcBlob = (() => {
  const parts = [];
  const walk = (d) => {
    for (const f of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, f.name);
      if (f.isDirectory()) { if (!/node_modules|dist/.test(f.name)) walk(p); }
      // DATA MODULES ARE NOT UI. exerciseData.js and demoTraineeData.js hold
      // 1,470 exercise titles and the demo roster's names, so including them
      // made the gate classify "BB Back Squat" and a demo athlete's name as
      // untranslated UI strings. First run: 174 distinct misses, the top 40 of
      // which were names and exercises. They are data; they are excluded.
      else if (/^(exerciseData|demoTraineeData|.*Corpus)\.jsx?$/.test(f.name)) continue;
      else if (/\.(jsx?|tsx?|css|html)$/.test(f.name)) parts.push(fs.readFileSync(p, 'utf8'));
    }
  };
  walk('src');
  try { walk('expo-il/src'); } catch (e) { /* marketing site optional */ }
  try { parts.push(fs.readFileSync('index.html', 'utf8')); } catch (e) { /* optional */ }
  return parts.join('\n');
})();

const routesFromSurfaces = () => {
  try {
    const md = fs.readFileSync('docs/SURFACES.md', 'utf8');
    return [...new Set([...md.matchAll(/`(\/coach(?![a-z])[a-z0-9/-]*)`/gi)].map((m) => m[1]))].filter((r) => !/:|\/$/.test(r));
  } catch (e) { return ['/coach/dashboard']; }
};
const ROUTES = process.argv.slice(3).length ? process.argv.slice(3) : routesFromSurfaces();

const b = await P.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 300000 });
const pg = await b.newPage();
const misses = new Map();     // string -> Set(routes)
let He = 0, En = 0, Data = 0, dead = 0, measured = 0;
const seen = new Map();       // page signature -> the route that rendered it first
try {
  // FRESH=1 drops whatever session the persistent debug profile is already
  // holding. Without it, asking for the athlete seat lands on the owner's
  // session and the seat guard (correctly) refuses to measure anything.
  if (process.env.FRESH) {
    await pg.goto(BASE + '/login', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
    // THE COOKIE IS THE SEAT, NOT localStorage. src/supabase.js keeps a refresh
    // token in the `expo-rt` cookie and reviveSession() trades it for a new
    // session on boot - deliberately, so an athlete whose storage was evicted
    // never sees a login screen. The side effect: clearing localStorage to
    // switch seats signs you straight back in as whoever you were. Three runs
    // of this gate asked for the athlete and got the owner before this line
    // existed, and only the seat guard stopped them from being believed.
    await pg.deleteCookie({ name: 'expo-rt', url: BASE });
    await pg.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch (e) { /* private mode */ } });
    // RELOAD after clearing. supabase-js keeps the session in memory too, so a
    // clear without a fresh document leaves the old seat live and the guard
    // (rightly) refuses the run.
    await pg.goto(BASE + '/login', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
    await wait(2500);
  }
  // NOAUTH: the marketing site and the public pages have no seat to take.
  // Signing in there would measure the app instead of the site.
  if (!process.env.NOAUTH) await A.signIn(pg, BASE);
  await pg.evaluateOnNewDocument(() => {
    try {
      sessionStorage.setItem('expo-portal-choice', 'trainer');
      localStorage.setItem('expo-lang', 'he');
      localStorage.setItem('expo-collapse:bhbc-lang', JSON.stringify('he'));
      localStorage.setItem('expo-install-snooze-until', String(Date.now() + 86400000));
    } catch (e) { /* private mode */ }
  });
  await setWidth(pg, W, 1100);

  // TABS=1 also walks the tab strip. The athlete portal is ONE route with six
  // tabs (BW, meal log, history, PRs, messages) and a route-only sweep reported
  // 30 strings for the whole portal - the tabs are most of what an athlete
  // actually reads, and none of them were measured.
  // NO \b AFTER A HEBREW WORD. JS word boundaries are ASCII-only, so /^משקל\b/
  // never matches the משקל tab — the first run reported "no tab strip found"
  // on a portal with six visible Hebrew tabs.
  const TAB_RE = /^[▸▾•\s]*(bw|bodyweight|meal|history|prs?|messages|plan|workouts?|משקל|יומן|תפריט|היסטוריה|שיאים|הודעות|תוכנית|אימונים)/i;

  const scrollAll = () => pg.evaluate(async () => {
    for (let i = 0; i < 14; i++) { window.scrollBy(0, window.innerHeight); await new Promise((r) => setTimeout(r, 110)); }
    window.scrollTo(0, 0);
  });

  const snap = () => pg.evaluate(() => {
      const out = [];
      const wk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = wk.nextNode())) {
        const t = (n.nodeValue || '').replace(/\s+/g, ' ').trim();
        if (!t) continue;
        const el = n.parentElement;
        if (!el) continue;
        if (/^(SCRIPT|STYLE|NOSCRIPT|TITLE)$/.test(el.tagName)) continue;
        const bb = el.getBoundingClientRect();
        if (bb.width < 1 || bb.height < 1) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) < 0.05) continue;
        out.push(t);
      }
      const txt = (document.body.innerText || '');
      return { out, shell: txt.length, sig: txt.replace(/\s+/g, ' ').trim().slice(0, 120) };
    });
  // One screen, counted and reported. Returns false when the screen was not a
  // real, new one - so a caller knows the label produced no measurement.
  const record = (label, r) => {
    // NOT A CHARACTER FLOOR. A 300-char floor called /coach/challenges and
    // /coach/bugs dead when they were merely EMPTY, and it calls the login
    // screen dead too - a short page is still a page. What actually means
    // "nothing rendered" is the boot splash, or a body with almost no text
    // nodes at all.
    if (r.out.length < 4 || /^(LOADING|טוען)/i.test(r.sig)) {
      console.log(`${label.padEnd(30)} still on the splash / ${r.out.length} text node(s) - NOT MEASURED`); dead++; return false;
    }
    // TWO ROUTES THAT RENDER THE SAME PAGE ARE ONE MEASUREMENT.
    //
    // A run of /login /intake /try /demo/athlete once reported four results and
    // three of them were the SAME athlete portal: a leftover session meant every
    // path redirected there, and the per-route percentages read like coverage.
    // Identical page text now says so instead of being counted twice.
    if (seen.has(r.sig)) { console.log(`${label.padEnd(30)} SAME PAGE AS ${seen.get(r.sig)} - NOT COUNTED (a redirect, not a route)`); dead++; return false; }
    seen.set(r.sig, label);
    let he = 0, en = 0, data = 0;
    for (const t of r.out) {
      if (/[֐-׿]/.test(t)) { he++; continue; }
      if (!/[A-Za-z]/.test(t)) continue;                       // digits, glyphs, arrows
      if (ALLOW.test(t) || TAXONOMY.test(t)) continue;
      if (/@|https?:|^\+?\d/.test(t)) continue;                // emails, links, phones
      if (CLUB_NAMES.has(t) || DATA_SHAPE.test(t)) { data++; continue; }
      if (I18N_KEYS.has(t) || srcBlob.includes(t)) {
        en++;
        const key = (I18N_KEYS.has(t) ? 'UNWIRED  ' : 'MISSING  ') + t;
        if (!misses.has(key)) misses.set(key, new Set());
        misses.get(key).add(label);
      } else data++;
    }
    He += he; En += en; Data += data; measured++;
    const pct = he + en ? Math.round((he / (he + en)) * 100) : null;
    console.log(`${label.padEnd(30)} ${String(pct === null ? '  -' : pct + '%').padStart(4)} hebrew   ${String(he).padStart(4)} he / ${String(en).padStart(4)} en   (${data} not-ours)`);
    return true;
  };

  for (const route of ROUTES) {
    await pg.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await wait(8000);
    await scrollAll();                         // #149 - see the ENTIRE page.
    await wait(700);
    record(route, await snap());

    if (!process.env.TABS) continue;
    const tabs = await pg.evaluate((src) => {
      const re = new RegExp(src, 'i');
      return [...document.querySelectorAll('button,[role=tab]')]
        .map((b, i) => ({ i, t: (b.textContent || '').replace(/\s+/g, ' ').trim() }))
        .filter((x) => x.t && x.t.length < 22 && re.test(x.t)).slice(0, 8);
    }, TAB_RE.source);
    for (const tab of tabs) {
      const hit = await pg.evaluate((i) => {
        const b = [...document.querySelectorAll('button,[role=tab]')][i];
        if (!b) return false; b.click(); return true;
      }, tab.i);
      if (!hit) continue;
      await wait(3500);
      await scrollAll();
      await wait(500);
      record(`${route} · ${tab.t}`, await snap());
    }
    if (!tabs.length) console.log(`${route.padEnd(30)} (no tab strip found)`);
  }
} catch (e) {
  console.log('THREW: ' + String(e.message || e).slice(0, 200));
} finally { await pg.close().catch(() => {}); b.disconnect(); }

const total = He + En;
// SCREENS, not routes: with TABS=1 one route is several screens, and
// subtracting skipped tabs from ROUTES.length once printed "0 of 1 routes"
// under six measured tabs.
console.log(`\n${measured} screen(s) measured across ${ROUTES.length} route(s) at ${W}px, app language HEBREW. ${dead} screen(s) were a splash, a redirect or a repeat and were NOT counted.`);
console.log(`COVERAGE: ${total ? Math.round((He / total) * 100) : 0}% hebrew - ${He} hebrew string(s) vs ${En} untranslated UI string(s). ${Data} Latin string(s) were data (names, emails, exercise and plan titles) and are excluded from both sides.`);
console.log(`${misses.size} DISTINCT untranslated UI string(s).`);
if (!total) console.log('MEASURED NOTHING - do not read a number into this run.');

const list = [...misses.entries()].sort((a, c) => c[1].size - a[1].size)
  .map(([t, rs]) => `${String(rs.size).padStart(3)}x  ${t}`);
if (OUT) { fs.writeFileSync(OUT, list.join('\n') + '\n'); console.log(`full list -> ${OUT}`); }
else console.log('\nTOP 40:\n' + list.slice(0, 40).join('\n'));
process.exit(dead || !total ? 1 : 0);
