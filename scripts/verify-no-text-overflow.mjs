// NO TEXT OVERFLOW ANYWHERE.
//
// Ohad, 23.9, and only after the control heights were proven clean: "then only
// after re-assuring its perfect everywhere, make sure there's no text overflow
// anywhere." Scope, his list: "phone, mobile, chrome, pwa, safari, light, dark,
// expo, demos, selling sites, bhbc".
//
// FOUR WAYS TEXT GOES WRONG, and this measures all four:
//
//   CUT        the ink is wider or taller than the box painting it, with the
//              overflow hidden or clipped. A letter is literally sliced.
//   ELLIPSIS   a label is being truncated to "Shoulder Horizontal Adducti…".
//              This counts as a FAULT, not a feature: "i cant see some of the
//              words... never do." A container that ellipsises but is NOT
//              currently truncating is fine — the gate only reports the ones
//              actually losing characters right now.
//   SPILL      text painted outside its own container's padding box while the
//              container does not scroll — the classic "text runs out of the
//              card" at 360.
//   ONEWORD    a box so narrow the text breaks to roughly one word per line.
//              He reported this as "1-letter-per-line" in August; it is what a
//              flex child with no min-width does to a Hebrew label.
//
// MEASURED ON THE RANGE, NOT THE ELEMENT. An element's rect is the BOX; the
// ink can be bigger or smaller than it. Range.getClientRects() is what the
// browser actually painted — the same reason the earlier centring work had to
// measure ink rather than boxes.
//
//   node scripts/verify-no-text-overflow.mjs [--only <substring>]
//
// TABLET + THE REAL APP (28.9 #380, Ohad: "audit all overflowing text on tablet
// view"). The list above is the demo; the signed-in app was never in it.
//   WIDTHS=tablet   768x1024, 820x1180, 1024x768, 1024x1366, 1180x820 as a
//                   TOUCH tablet (tablet UA), not a narrow desktop
//   SET=app         the signed-in coach app + BHBC (owner seat, from SURFACES.md)
//   SET=athlete     the athlete portal (EXPO_EMAIL = the fixture athlete)
//   THEMES=dark     one theme (layout is identical across themes - memory
//                   reference_theme_geometry_parity - so a width sweep can halve)
//   CDP=<url>       the browser to drive (headless: http://[::1]:9444 - a
//                   hidden tab of the visible Chrome paints no frames)
import fs from 'node:fs';
import P from 'puppeteer-core';
import { setWidth } from './lib/viewport.mjs';
import { signIn } from './lib/authed-page.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:5199';
// --only OR env ONLY (12.10: ONLY=... in the env was silently ignored and a 'four screen' run became a full sweep against prod)
const ONLY = (() => { const i = process.argv.indexOf('--only'); return i > 0 ? process.argv[i + 1] : process.env.ONLY || null; })();
const OUT = process.env.OUT || 'audit-out/text-overflow';
// A PAUSE BEFORE EVERY PAGE (11.10): the app pages all read the PRODUCTION database (a preview and the dev
// server too). Two full sweeps back to back, unpaced, sent 3,105 requests in 7 minutes and the database
// stopped taking connections (memory feedback_load_budget_one_heavy_thing). PACE_MS=0 for the old speed.
const PACE_MS = process.env.PACE_MS != null ? +process.env.PACE_MS : 2500;
fs.mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const COACH_TABS = ['dashboard', 'trainees', 'programs', 'exercises', 'sessions', 'review', 'tasks', 'billing'];
const SET = process.env.SET || 'demo';
const BHBC_TABS = ['overview', 'roster', 'schedule', 'practices', 'lifts', 'medical', 'games', 'activity'];
const APP_SURFACES = [
  ...['dashboard', 'athletes', 'trainees', 'programs', 'exercises', 'sessions', 'sessions-single', 'workouts', 'review', 'review-tools', 'tasks', 'billing', 'calendar', 'challenges', 'intake', 'waitlist', 'smart-import', 'exercise-matching', 'exercise-classify', 'exercise-cleanup', 'exercise-videos', 'bugs', 'chat-audit']
    .map((t) => [`app-${t}`, `/coach/${t}`]),
  // a remembered sub-view would make a tab measure whatever the LAST page left open, so the views a tab holds are
  // each tapped explicitly (12.10: the week view's cut venue and the warm-up sub-view were never swept)
  ...BHBC_TABS.map((t) => [`bhbc-${t}`, `/coach/bhbc/${t}`, t === 'schedule' ? '^(MONTH|חודש)$' : t === 'games' ? '^(GAMES|משחקים)$' : null]),
  ['bhbc-schedule-week', '/coach/bhbc/schedule', '^(WEEK|שבוע)$'],
  ['bhbc-schedule-list', '/coach/bhbc/schedule', '^(LIST|רשימה)$'],
  ['bhbc-games-warmup', '/coach/bhbc/games', '^(GAME WARM-UP|חימום למשחק)$'],
  // the athlete card (a modal): 'row:' taps the player's own ROW, not a button - the Lifts rows open it at every width
  ['bhbc-athlete-card', '/coach/bhbc/lifts', 'row:Bryant|ברייאנט'],
  // the zone's forms (opening one writes nothing): Log lift, Log S&C session, Report injury
  ['bhbc-form-lift', '/coach/bhbc/lifts', '^(LOG LIFT|רישום כוח אישי)$'],
  ['bhbc-form-sc', '/coach/bhbc/practices', '^(LOG S&C SESSION|רישום כוח קבוצתי)$'],
  ['bhbc-form-injury', '/coach/bhbc/medical', '^(\\+ REPORT|\\+ דיווח)$'],
  // the detail screens a coach reaches by a click have URLs, so they are surfaces (the fixture athlete and his latest plan)
  ['app-athlete-detail', '/coach/athletes/tr_diego'],
  ['app-athlete-preview', '/coach/athletes/tr_diego/preview'],
  ['app-program-editor', '/coach/programs/plan_ww15cnz51jnmo91eocg'],
  ['app-program-preview', '/coach/programs/plan_ww15cnz51jnmo91eocg/preview'],
  // the athlete page's dialogs - each tap was probed with every database write BLOCKED: each opens one dialog, 0 writes (12.10)
  ['app-dlg-payment', '/coach/athletes/tr_diego', '^(\\+ ADD PAYMENT|\\+ הוסף תשלום)$'],
  ['app-dlg-contract', '/coach/athletes/tr_diego', '^(CONTRACT|חוזה)$'],
  ['app-dlg-history-log', '/coach/athletes/tr_diego', '^(\\+ LOG|\\+ רישום)$'],
  ['app-dlg-evaluation', '/coach/athletes/tr_diego', '^(\\+ NEW EVALUATION|\\+ הערכה חדשה)$'],
  ['app-dlg-new-program', '/coach/athletes/tr_diego', '^(\\+ New Program|\\+ תוכנית חדשה)$'],
  // the other tabs' dialogs, each probed with writes blocked (12.10). NEVER tap '+ New Program' / '+ ASSIGN PROGRAM' on
  // /coach/programs: they CREATE a plan on the tap. Twin-label buttons hold both languages, in either order by UI language.
  ['app-dlg-add-exercise', '/coach/exercises', '^\\+ (Add Exercise|Add|הוסף תרגיל|הוסף)$'],
  ['app-dlg-start-session', '/coach/sessions', '^(\\+ START SESSION|\\+ התחל אימון)$'],
  ['app-dlg-payment-request', '/coach/billing', '^\\+ (NEW REQUEST|בקשה חדשה)(\\+ (NEW REQUEST|בקשה חדשה))?$'],
  ['app-dlg-new-challenge', '/coach/challenges', '^\\+ (NEW CHALLENGE|אתגר חדש)(\\+ (NEW CHALLENGE|אתגר חדש))?$'],
  ['app-dlg-intake-link', '/coach/intake', '^\\+ (Generate Link|קישור חדש)(\\+ (Generate Link|קישור חדש))?$'],
];
// the portal's tabs, each tapped (12.10: only PROGRAM, the default, was ever swept). Run as the fixture athlete:
// EXPO_EMAIL=diego@diegoday.com SET=athlete (opening Messages / History can mark coach notes read - test data only)
const ATHLETE_SURFACES = [
  ['portal', '/', '^(PROGRAM|תוכנית)$'],
  ['portal-bw', '/', '^(BW|משקל)$'],
  ['portal-meal', '/', '^(MEAL LOG|יומן אוכל)$'],
  ['portal-history', '/', '^(HISTORY|היסטוריה)( \\(\\d+\\))?$'],
  ['portal-prs', '/', '^(PRs|שיאים)$'],
  ['portal-messages', '/', '^(MESSAGES|הודעות)$'],
];
const DEMO_SURFACES = [
  ['landing', '/demo'],
  ['landing-he', '/demo/he'],
  ...COACH_TABS.map((t) => [`coach-${t}`, t === 'dashboard' ? '/demo/coach' : `/demo/coach/${t}`]),
  // CLICK-GATED SCREENS MUST BE IN THE LIST. The athlete drill-in is the
  // deepest screen in the demo and the one a coach studies hardest, and every
  // gate walked past it for weeks because a sweep loads a route and reads the
  // page — this screen only appeared after you opened an athlete. That is how
  // it kept a fabricated assessment, an English payments ledger and a
  // hardcoded April date. It has a URL; use it.
  ['athlete-detail', '/demo/coach/trainees/t1'],
  ['athlete-couple', '/demo/coach/trainees/t3'],
  ['athlete-overdue', '/demo/coach/trainees/t2'],
  ['athlete', '/demo/athlete'],
  ['engine', '/try?embed=1'],
  ['booking', '/book'],
  // the public intake form; with no ?t= it renders the whole form as a preview and submits nothing (12.10: never swept)
  ['intake-form-he', '/intake/he'],
  ['intake-form-en', '/intake/en'],
  // the public shared-program page; the fixture token lives OUTSIDE this public repo (SHARE_TOKEN=..., a test athlete's plan).
  // Every open bumps that share's view_count, so never point it at a real client's share.
  ...(process.env.SHARE_TOKEN ? [['program-share', `/p/${process.env.SHARE_TOKEN}`]] : []),
];
const SURFACES = (SET === 'app' ? APP_SURFACES : SET === 'athlete' ? ATHLETE_SURFACES : DEMO_SURFACES).filter(([n]) => !ONLY || ONLY.split(',').some((o) => n.includes(o)));
const SIGNED = SET === 'app' || SET === 'athlete';

const LANGS = ['en', 'he'];
// 360 is the narrowest he has asked about and where one-word-per-line appears.
const TABLET = process.env.WIDTHS === 'tablet';
const WIDTHS = TABLET ? [[768, 1024], [820, 1180], [1024, 768], [1024, 1366], [1180, 820]] : [[360, 800], [390, 844], [1440, 950]];
const THEMES = process.env.THEMES ? process.env.THEMES.split(',') : ['dark', 'light'];

const findings = [];
const add = (o) => { findings.push(o); console.log(`${o.kind.padEnd(9)} ${o.id.padEnd(30)} ${o.detail}`); };
// text nodes each page was judged on, written to nodes.json: the baseline a later run is compared with (#670 -
// pages loaded during a database stall read ~40% of their usual count and were still judged clean, 11.10)
const pageNodes = {};
// BASELINE=<a good run's nodes.json>: a page reading under half its own baseline is NOT judged (a stalled or empty load)
const BASELINE = process.env.BASELINE ? JSON.parse(fs.readFileSync(process.env.BASELINE, 'utf8')) : null;

const b = await P.connect({ browserURL: process.env.CDP || 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 300000 });
let measured = 0, nodes = 0;

// Signed-in sets sign in ONCE per language x width x theme and walk every route
// in that one context; the demo set keeps one fresh context per combination.
const signedCtx = new Map();
// the debug + break-test hooks, for BOTH paths (11.10: they sat in the signed path only, so on the demo
// set DEBUG_PATH and PLANT silently did nothing)
// BLOCK_WRITES=1: a sweep never writes. Every PostgREST write (PATCH/PUT/DELETE, POST to a table - an /rpc/ POST is a read
// here: get_shared_program, verify_intake_token) is ABORTED and listed at the end, so a page that writes on open is named, not run.
const blockedWrites = [];
async function gateHooks(pg) {
  if (process.env.BLOCK_WRITES) {
    await pg.setRequestInterception(true);
    pg.on('request', (r) => {
      const u = r.url(), m = r.method();
      if (/\/rest\/v1\//.test(u) && (m === 'PATCH' || m === 'PUT' || m === 'DELETE' || (m === 'POST' && !/\/rest\/v1\/rpc\//.test(u)))) {
        blockedWrites.push(`${m} ${u.replace(/^.*\/rest\/v1\//, '').slice(0, 90)}`); r.abort();
      } else r.continue();
    });
  }
  if (process.env.DEBUG_PATH) await pg.evaluateOnNewDocument(() => { window.__gateDebugPath = true; });
  // PLANT=1: a known spill inside an ABSOLUTE box, to prove the gate still sees one (break test, 11.10)
  if (process.env.PLANT) await pg.evaluateOnNewDocument(() => { addEventListener('DOMContentLoaded', () => { const d = document.createElement('div'); d.style.cssText = 'position:absolute;left:20px;top:160px;width:60px;z-index:99999;font:12px sans-serif;white-space:nowrap;background:#fff;color:#000'; d.innerHTML = '<span>PLANTED SPILL TEXT</span>'; document.body.appendChild(d); }); });
}
async function pageFor(lang, w, h, theme) {
  if (!SIGNED) { const ctx = await b.createBrowserContext(); return { ctx, pg: await ctx.newPage(), fresh: true }; }
  const key = `${lang}|${w}|${theme}`;
  if (signedCtx.has(key)) return signedCtx.get(key);
  const ctx = await b.createBrowserContext(); const pg = await ctx.newPage();
  await setWidth(pg, w, h, { tablet: TABLET });
  await pg.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: theme }]);
  await gateHooks(pg);
  await pg.evaluateOnNewDocument((L, T) => { try { localStorage.setItem('expo-lang', L); localStorage.setItem('expo-collapse:bhbc-lang', JSON.stringify(L)); localStorage.setItem('expo-shot-lang', L); localStorage.setItem('expo-theme', T); localStorage.setItem('expo-install-snooze-until', String(Date.now() + 86400000)); } catch (e) { /* private mode */ } }, lang, theme);
  await signIn(pg, BASE);
  const v = { ctx, pg, fresh: false };
  signedCtx.set(key, v);
  return v;
}
for (const lang of LANGS) {
  for (const [w, h] of WIDTHS) {
    for (const theme of THEMES) {
      for (const [name, route, tap] of SURFACES) {
        // the HEIGHT too on a tablet: 1024x768 and 1024x1366 shared one id - their findings merged and nodes.json added the two (12.10)
        const id = `${name}/${lang}/${TABLET ? `${w}x${h}` : w}/${theme}`;
        const { ctx, pg, fresh } = await pageFor(lang, w, h, theme);
        try {
          if (fresh) await setWidth(pg, w, h, { tablet: TABLET });   // emulate: setViewport() is ignored on the attached Chrome above the phone breakpoint (scripts/lib/viewport.mjs)
          if (fresh) await gateHooks(pg);
          await pg.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: theme }]);
          await pg.evaluateOnNewDocument((L, T) => {
            try {
              if (!localStorage.getItem('expo-lang')) localStorage.setItem('expo-lang', L);
              localStorage.setItem('expo-lang', L);
              // the club zone and the Shot Analyzer keep their OWN language keys
              localStorage.setItem('expo-collapse:bhbc-lang', JSON.stringify(L));
              localStorage.setItem('expo-shot-lang', L);
              localStorage.setItem('expo-theme', T);
              localStorage.setItem('expo-install-snooze-until', String(Date.now() + 86400000));
            } catch (e) { /* private mode */ }
          }, lang, theme);
          if (PACE_MS > 0) await wait(PACE_MS);
          await pg.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 60000 });

          let prev = -1, settled = false;
          for (let i = 0; i < 22; i++) {
            await wait(600);
            const len = await pg.evaluate(() => (document.body.innerText || '').length);
            if (len === prev && len > 0) { settled = true; break; }
            prev = len;
          }
          if (!settled) { add({ kind: 'UNSET', id, detail: 'never settled — NOT judged' }); continue; }
          // A PAGE THAT IS STILL LOADING IS NOT A CLEAN PAGE (12.10): right after a fresh sign-in a loading state held still
          // for 600 ms and was judged - three BHBC tabs 'passed' on 2 text nodes. Fewer than 10 = wait up to 10 s more, then UNSET.
          // (20 flagged real small pages: Sessions / Challenges / Smart Import read 17-18 on every combination, 12.10)
          {
            const tn = () => pg.evaluate(() => { const wk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let k = 0, n; while ((n = wk.nextNode())) if ((n.nodeValue || '').trim().length > 1) k++; return k; });
            let k = await tn();
            for (let tries = 0; k < 10 && tries < 10; tries++) { await wait(1000); k = await tn(); }
            if (k < 10) { add({ kind: 'UNSET', id, detail: `only ${k} text nodes on the page after 10 s - a loading or empty screen, NOT judged` }); continue; }
          }
          // a sub-view: tap its button (the LAST match - the top nav can carry the same word), then let it settle
          if (tap) {
            const hit = await pg.evaluate((t) => {
              if (t.startsWith('row:')) { const re = new RegExp(t.slice(4), 'i'); const rows = [...document.querySelectorAll('[role="button"]')].filter((x) => x.offsetHeight > 20 && x.offsetHeight < 140 && re.test(x.textContent || '')); const r = rows.sort((a, b) => a.offsetHeight - b.offsetHeight)[0]; if (r) r.click(); return !!r; }
              const all = [...document.querySelectorAll('button, [role="tab"]')].filter((x) => new RegExp(t, 'i').test((x.textContent || '').trim())); const b2 = all[all.length - 1]; if (b2) b2.click(); return !!b2;
            }, tap);
            if (!hit) { add({ kind: 'UNSET', id, detail: `no button for ${tap} - the sub-view was NOT judged` }); continue; }
            await wait(2500);
          }

          const pageH = await pg.evaluate(() => document.documentElement.scrollHeight);
          const seen = new Set();

          for (let y = 0; y < pageH; y += Math.round(h * 0.85)) {
            await pg.evaluate((yy) => window.scrollTo(0, yy), y);
            await wait(220);
            const r = await pg.evaluate(() => {
              const out = { cut: [], ell: [], spill: [], oneword: [] };
              let counted = 0;
              const vh = innerHeight;
              const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
              let n;
              while ((n = walk.nextNode())) {
                const raw = n.nodeValue || '';
                const t = raw.replace(/\s+/g, ' ').trim();
                if (t.length < 2) continue;
                const el = n.parentElement;
                if (!el) continue;
                const cs = getComputedStyle(el);
                if (cs.visibility === 'hidden' || cs.opacity === '0' || cs.display === 'none') continue;
                const bb = el.getBoundingClientRect();
                if (bb.width < 4 || bb.height < 4) continue;
                if (bb.bottom < 0 || bb.top > vh) continue;
                counted++;

                // the ink of THIS text node, not the element's whole contents (11.10): a hidden child - the
                // sort arrow BHBC Lifts keeps at visibility:hidden beside a day number - was read as ink,
                // and '10' "spilled" 4px for weeks. Child text is walked as its own node anyway.
                const rng = document.createRange();
                rng.selectNodeContents(n);
                const rects = [...rng.getClientRects()].filter((x) => x.width > 0 && x.height > 0);
                if (!rects.length) continue;
                const inkL = Math.min(...rects.map((x) => x.left));
                const inkR = Math.max(...rects.map((x) => x.right));
                const inkT = Math.min(...rects.map((x) => x.top));
                const inkB = Math.max(...rects.map((x) => x.bottom));

                const clipsX = /hidden|clip/.test(cs.overflowX);
                const clipsY = /hidden|clip/.test(cs.overflowY);

                // CUT — ink outside a box that clips it.
                const overL = bb.left - inkL, overR = inkR - bb.right;
                const overT = bb.top - inkT, overB = inkB - bb.bottom;
                if ((clipsX && (overL > 1.5 || overR > 1.5)) || (clipsY && (overT > 1.5 || overB > 1.5))) {
                  out.cut.push({ t: t.slice(0, 34), x: Math.round(Math.max(overL, overR)), y: Math.round(Math.max(overT, overB)) });
                  continue;
                }

                // ELLIPSIS — actually truncating right now.
                if (cs.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1) {
                  out.ell.push({ t: t.slice(0, 34), lost: el.scrollWidth - el.clientWidth });
                  continue;
                }

                // SPILL — ink outside a NON-scrolling ancestor's box.
                let p = el.parentElement, spilled = null;
                for (let d = 0; p && d < 4 && !spilled; p = p.parentElement, d++) {
                  const pcs = getComputedStyle(p);
                  if (/auto|scroll/.test(pcs.overflowX) || /auto|scroll/.test(pcs.overflowY)) break;
                  // an absolute / fixed box is still the box its text must fit: measure it, THEN stop - above it the
                  // layout is no longer the text's (11.10 review: a popover's or badge's overflow was never judged)
                  const pinned = pcs.position === 'absolute' || pcs.position === 'fixed';
                  const pb = p.getBoundingClientRect();
                  if (pb.width >= 8 && (inkR - pb.right > 2 || pb.left - inkL > 2)) spilled = Math.round(Math.max(inkR - pb.right, pb.left - inkL));
                  if (pinned) break;
                }
                if (spilled) { out.spill.push({ t: t.slice(0, 34), by: spilled, path: window.__gateDebugPath ? [el, el.parentElement, el.parentElement && el.parentElement.parentElement].filter(Boolean).map((e) => { const q = e.getBoundingClientRect(); return `${e.tagName.toLowerCase()}.${String(e.className || '').split(' ')[0]}[${Math.round(q.left)}..${Math.round(q.right)}]`; }).join(' < ') + ` ink ${Math.round(inkL)}..${Math.round(inkR)}` : undefined }); continue; }

                // ONEWORD — 3+ lines and barely a word on each.
                const lineTops = new Set(rects.map((x) => Math.round(x.top)));
                const words = t.split(' ').filter(Boolean).length;
                if (lineTops.size >= 3 && words >= 3 && words / lineTops.size < 1.35 && bb.width < 180) {
                  out.oneword.push({ t: t.slice(0, 34), lines: lineTops.size, words, w: Math.round(bb.width) });
                }
              }
              out.counted = counted;
              return out;
            });
            nodes += r.counted || 0;
            pageNodes[id] = (pageNodes[id] || 0) + (r.counted || 0);
            const push = (kind, arr, fmt) => {
              for (const x of arr) {
                const k = kind + '|' + JSON.stringify(x);
                if (seen.has(k)) continue;
                seen.add(k);
                add({ kind, id, detail: fmt(x) });
              }
            };
            push('CUT', r.cut, (x) => `"${x.t}" ink cut by ${x.x}px across / ${x.y}px down`);
            push('ELLIPSIS', r.ell, (x) => `"${x.t}" truncated — ${x.lost}px of the word is not shown`);
            push('SPILL', r.spill, (x) => `"${x.t}" paints ${x.by}px outside its container${x.path ? ` (${x.path})` : ''}`);
            push('ONEWORD', r.oneword, (x) => `"${x.t}" ${x.words} words over ${x.lines} lines in ${x.w}px`);
          }
          // A signed-in route that lands on the login screen was NOT measured.
          if (SIGNED && await pg.evaluate(() => !!document.querySelector('input[type="password"]'))) { add({ kind: 'UNSET', id, detail: 'landed on the login screen - NOT judged' }); continue; }
          if (BASELINE && BASELINE[id] > 0 && (pageNodes[id] || 0) < 0.5 * BASELINE[id]) { add({ kind: 'UNSET', id, detail: `read ${pageNodes[id] || 0} text nodes, under half its baseline ${BASELINE[id]} - a stalled or empty load, NOT judged` }); continue; }
          measured++;
        } catch (e) {
          add({ kind: 'ERROR', id, detail: 'harness: ' + String(e.message || e).slice(0, 110) });
        } finally {
          if (fresh) { await pg.close().catch(() => {}); await ctx.close().catch(() => {}); }
        }
      }
    }
  }
}
for (const { ctx } of signedCtx.values()) await ctx.close().catch(() => {});
b.disconnect();

fs.writeFileSync(`${OUT}/findings.json`, JSON.stringify(findings, null, 1));
fs.writeFileSync(`${OUT}/nodes.json`, JSON.stringify(pageNodes, null, 1));
const by = {};
for (const f of findings) by[f.kind] = (by[f.kind] || 0) + 1;
const total = SURFACES.length * LANGS.length * WIDTHS.length * THEMES.length;
console.log(`\n${measured} of ${total} combinations measured, ${nodes} text nodes examined.`);
if (process.env.BLOCK_WRITES) console.log(`writes blocked: ${blockedWrites.length}${blockedWrites.length ? ' - ' + [...new Set(blockedWrites)].slice(0, 8).join(' | ') : ''}`);
console.log(Object.keys(by).length ? Object.entries(by).map(([k, v]) => `  ${k.padEnd(9)} ${v}`).join('\n') : '  none');
console.log(`-> ${OUT}/findings.json`);
process.exit(findings.length ? 1 : 0);
