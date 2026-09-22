// BEFORE / AFTER pairs for the recap.
//
// Ohad: "i want more before and after pictures and less words".
//
// A commit message can claim a fix; a pair of pictures shows it. There is no
// stored "before", so each one is REPRODUCED: revert exactly the lines that
// fixed it, shoot the same view at the same width, restore, shoot again. The
// restore is unconditional - it runs even if the shot throws - because leaving
// a reverted fix in the tree would be far worse than having no picture.
//
//   node scripts/build-before-after.mjs [id...]
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import P from 'puppeteer-core';
import * as A from './lib/authed-page.mjs';
import { setWidth } from './lib/viewport.mjs';

const APP = 'http://127.0.0.1:5199';
// expo-il's BUILT preview. 5174 (its dev server) is not running, and a pair
// aimed at a refused port produced two identical shots of nothing.
const IL = 'http://127.0.0.1:5188';
// The BUILT app. A pair that has to CLICK through the UI cannot use the dev
// server: writing the "before" edit triggers an HMR reload, and a reload
// mid-click throws "Execution context was destroyed". Building each state is
// slower and completely deterministic.
const PREVIEW = 'http://127.0.0.1:4173';
const OUT = 'audit-out/beforeafter';
fs.mkdirSync(OUT, { recursive: true });

// Each pair names the file to touch, the exact edit that UNDOES the fix, and
// the view to photograph. `crop` is [x, y, w, h] on the captured image.
const PAIRS = [
  {
    id: 'marketing-slash',
    title: 'Marketing · a Hebrew list ran outside its card',
    file: 'expo-il/src/App.jsx',
    // BOTH call sites. The undo used to touch only the first one, which is on a
    // different surface from the page being photographed (the programme detail
    // card is the second), so the "before" came back identical to the "after"
    // and the pair proved nothing for weeks.
    undo: [['<span><SlashBreak text={h} /></span>', '<span>{h}</span>'],
           ['<span style={{ minWidth: 0 }}><SlashBreak text={h} /></span>', '<span style={{ minWidth: 0 }}>{h}</span>']],
    url: IL + '/#/programs/foundation-12', w: 900, h: 900, lang: 'he', il: true, built: true,
    crop: [0, 355, 900, 130],
  },
  {
    id: 'exercises-table',
    title: 'Exercises · the header read "SECONDAR MEDIA"',
    file: 'src/ExercisesView.jsx',
    undo: [['@media (min-width: 701px) and (max-width: 1200px) {', '@media (min-width: 99990px) and (max-width: 99999px) {']],
    url: APP + '/coach/exercises', w: 900, h: 620, auth: true, built: true,
    // The header row is the whole point of this one.
    crop: [0, 395, 900, 120],
  },
  {
    id: 'intake-email',
    title: 'Intake · the email hung outside the card on a phone',
    // That fix had TWO halves and a "before" must undo both: without the
    // themes.css rule the buttons still drop to their own line, the text gets
    // the full card, and it wraps fine - so undoing only the overflow-wrap
    // produced a "before" that was already fixed.
    file: 'src/IntakeView.jsx',
    also: ['src/themes.css'],
    undo: [["marginTop: 4, overflowWrap: 'anywhere' }}>", 'marginTop: 4 }}>']],
    alsoUndo: [['.iv-sub-main { flex: 1 1 100% !important; }', '']],
    url: APP + '/coach/intake', w: 390, h: 800, auth: true, built: true,
    // The submission row, not the banner above it.
    crop: [0, 360, 390, 190],
  },
  {
    id: 'bhbc-history',
    title: 'BHBC player popup · Full history had no card',
    file: 'src/BhbcView.jsx',
    undo: [["<span style={{ fontFamily: FN, fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.tx }}>{tr('Full history')}</span>",
            "<span style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.tm }}>{tr('Full history')}</span>"]],
    url: APP + '/coach/bhbc', w: 1500, h: 1100, auth: true, bhbcPlayer: true, built: true,
    crop: [410, 520, 700, 420],
  },
  {
    id: 'athlete-offline',
    title: 'Athlete · no signal showed "BLOCK 0", not "offline"',
    file: 'src/ClientPortal.jsx',
    // Two halves, and the "before" needs both: without the snapshot the
    // programme is gone, and without the sentence the athlete is shown
    // "TypeError: Failed to fetch".
    undo: [
      ['    return Array.isArray(v) ? v : null;', '    return null;'],
      [`            setPlansLoadError(networkish
              ? "We can't reach the server right now. Your program will be here when you're back online."
              : (msg || 'Could not load your programs.'));`,
       `            setPlansLoadError(msg || 'Could not load your programs.');`],
    ],
    url: APP + '/athlete', w: 390, h: 844, athlete: true, cutBackend: true, built: true,
    crop: [0, 0, 390, 520],
  },
  {
    id: 'bhbc-brand',
    title: 'BHBC · the program popup was an EXPO dialog',
    file: 'src/BhbcView.jsx',
    // Undo BOTH halves of the branding: the club bar and the navy hairline.
    // With only one undone the "before" is already half-fixed.
    // The WHOLE component goes back, not just one prop. Removing only
    // headerStyle left the crest in place and the title styled white on a white
    // bar - an invisible title and a blank close button, which is a broken
    // hybrid that never existed rather than the "before" it claims to be.
    undo: [
      [`const BModal = ({ children, title, ...rest }) => (
  <Modal
    themeAttr="light"
    title={<><img src="/logos/bhbc-logo.png" alt="" style={{ height: 20, width: 'auto', display: 'block' }} />{title}</>}
    headerStyle={{ background: NAVY, borderBottom: \`3px solid \${ORANGE}\`, color: '#fff' }}
    titleStyle={{ color: '#fff' }}
    closeStyle={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.35)', color: '#fff' }}
    {...rest}
  ><div style={TOKENS}>{children}</div></Modal>
);`,
       `const BModal = ({ children, ...rest }) => (
  <Modal themeAttr="light" {...rest}><div style={TOKENS}>{children}</div></Modal>
);`],
      [`  '--c-cardBd': 'rgba(30,61,116,0.26)',`, `  '--c-cardBd': 'color-mix(in srgb, #1E3D74 20%, var(--c-bd))',`],
    ],
    url: APP + '/coach/bhbc', w: 1500, h: 1000, auth: true, bhbcProgram: true, built: true,
    crop: [400, 55, 700, 620],
  },
  {
    id: 'bhbc-collapse',
    title: 'BHBC · the boxes could not be collapsed',
    file: 'src/BhbcView.jsx',
    // The undo removes the handle AND the chevron, so the "before" is the card
    // as it was: no control, and a click on the strip does nothing. The shoot
    // step clicks the strips either way - which is exactly the point of the
    // pair.
    undo: [
      [`      onHeaderClick={() => setOpen((v) => !v)}
      headerAriaExpanded={open}
`, ''],
      ['>{open ? children : null}</BaseCard>', '>{children}</BaseCard>'],
    ],
    url: PREVIEW + '/coach/bhbc', w: 1500, h: 1000, auth: true, bhbcTab: 'Medical', collapseAll: true, built: true,
    crop: [0, 60, 1500, 460],
  },
  {
    id: 'bhbc-medical-lastrow',
    title: 'BHBC · a rule under the last name, inside the card border',
    file: 'src/BhbcView.jsx',
    undo: [['        .bhbc-inj-row:last-child{border-bottom:none!important;padding-bottom:2px!important}', '']],
    url: PREVIEW + '/coach/bhbc', w: 1500, h: 1000, auth: true, bhbcTab: 'Medical', built: true,
    crop: [140, 620, 1220, 180],
  },
  {
    id: 'bhbc-attendance',
    title: 'BHBC · "no load yet" about an athlete who trained 27 times',
    file: 'src/BhbcView.jsx',
    // Undo = the card falls back to the bare "no load yet" branch again.
    undo: [["                  : (att && att.n > 0", "                  : (false"]],
    url: PREVIEW + '/coach/bhbc', w: 1500, h: 1000, auth: true, bhbcTab: 'Roster', built: true,
    crop: [150, 170, 1200, 200],
  },
  {
    id: 'bhbc-rtp-overdue',
    title: 'BHBC · an RTP target 11 days past read like a plan',
    file: 'src/BhbcView.jsx',
    undo: [["{(() => { const od = rtpOverdueDays(inj, today); return od ?", "{(() => { const od = 0; return od ?"]],
    url: PREVIEW + '/coach/bhbc', w: 1500, h: 1000, auth: true, bhbcTab: 'Overview', built: true,
    crop: [150, 230, 1250, 260],
  },
  // 'portal-hebrew' was defined here and REMOVED. The pair needs a rebuild per
  // state, and after a rebuild the service worker reloads the page; on the
  // ATHLETE path that lands both shots on the boot splash - two identical EXPO
  // logos - however long the shoot waits. A picture that shows nothing is worse
  // than no picture, and the fix it would illustrate is proven in the commit by
  // an A/B of the rendered text instead.
  {
    id: 'tasks-autobody',
    title: 'Tasks, in Hebrew · the auto-task bodies stayed English',
    file: 'src/TasksV8View.jsx',
    undo: [["return readLang() === 'he' ? localiseAutoBody(core) : core;", 'return core;']],
    url: APP + '/coach/tasks', w: 1400, h: 900, auth: true, appLang: 'he', built: true,
    crop: [0, 60, 1400, 560],
  },
  {
    id: 'dashboard-dashes',
    title: 'Dashboard, no signal · the KPIs read zero, not "unknown"',
    file: 'src/DashboardView.jsx',
    undo: [['const unknown = (rows) => (!online || dataIncomplete) && (!Array.isArray(rows) || rows.length === 0);', 'const unknown = () => false;']],
    url: APP + '/coach', w: 1400, h: 900, auth: true, cutBackend: true, built: true,
    crop: [0, 60, 1400, 360],
  },
  {
    id: 'roster-offline',
    title: 'Athletes, no signal · the roster was empty',
    file: 'src/useSupaStore.js',
    undo: [['rosterOk = !!em && TRAINER_EMAILS.includes(em);', 'rosterOk = false;']],
    url: APP + '/coach/athletes', w: 1400, h: 900, auth: true, cutBackend: true, built: true,
    crop: [0, 60, 1400, 520],
  },
  {
    id: 'bw-bidi',
    title: 'Athlete, in Hebrew · the bodyweight unit split from its number',
    file: 'src/ClientPortal.jsx',
    undo: [[`<span dir="ltr" style={{unicodeBidi:'isolate'}}>{lb}KG</span>`, '{lb}KG']],
    url: APP + '/athlete', w: 390, h: 844, athlete: true, appLang: 'he', built: true,
    crop: [0, 470, 390, 160],
  },
  {
    id: 'coach-offline',
    title: 'Coach · 20 seconds of "Loading data..." with no signal',
    file: 'src/App.jsx',
    // Put the splash back on the raw storesReady gate and take the notice away.
    undo: [
      ['  if (!storesReady && !bootDeadline) return (', '  if (!storesReady) return ('],
      ['      {dataIncomplete && <div style={{background:`color-mix(in srgb, ${C.ac} 14%, ${C.bg})`,',
       '      {false && <div style={{background:`color-mix(in srgb, ${C.ac} 14%, ${C.bg})`,'],
    ],
    url: APP + '/coach', w: 1500, h: 1000, auth: true, cutBackend: true, built: true,
    crop: [0, 0, 1500, 420],
  },
  // ── 21.09 ────────────────────────────────────────────────────────────
  {
    id: 'tap-targets',
    title: 'Club zone · every control was 24-30px on a phone',
    file: 'src/themes.css',
    // Take the floor away again. One swap, because the whole fix is one rule.
    undo: [['  button, [role="button"] { min-height: 40px; }', '  button, [role="button"] { min-height: 0; }']],
    url: PREVIEW + '/coach/bhbc', w: 390, h: 844, auth: true, built: true, mobile: true,
    crop: [0, 0, 390, 430],
  },
  {
    id: 'roster-position',
    title: 'Manage roster · the position read "POINT G..." on a phone',
    file: 'src/themes.css',
    undo: [['  .bhbc-manage-meta{grid-column:3;justify-content:space-between;gap:8px;flex-wrap:wrap}',
            '  .bhbc-manage-meta{grid-column:3;justify-content:space-between;gap:8px}']],
    url: PREVIEW + '/coach/bhbc', w: 390, h: 844, auth: true, built: true, mobile: true,
    clickText: 'Manage roster',
    crop: [0, 120, 390, 560],
  },
  {
    id: 'kpi-edge',
    title: 'Dashboard · the number hugged the wrong edge in Hebrew',
    file: 'src/DashboardView.jsx',
    // justifyContent is the fix; textAlign is the dead code it replaced.
    undo: [["justifyContent: he ? 'flex-end' : 'flex-start' }}>{s.value}", "textAlign: he ? 'right' : 'left' }}>{s.value}"]],
    url: PREVIEW + '/coach/dashboard', w: 484, h: 700, auth: true, built: true, appLang: 'he',
    crop: [0, 80, 484, 320],
  },

  {
    id: 'filter-spine',
    title: 'Exercises · the filter rail lost its spine on the line that needed it',
    file: 'src/themes.css',
    undo: [
      ['.ex-filtrow { display: flex; align-items: flex-start; gap: 14px; }',
       '.ex-filtrow { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 14px; }'],
      ['.ex-filtrow-c { flex: 1 1 0; min-width: 0; display: flex; flex-wrap: wrap; align-items: center; gap: 4px 14px; }',
       '.ex-filtrow-c { display: contents; }'],
      ['  .ex-filtrow { display: block; }', '  .ex-filtrow { display: flex; }'],
    ],
    url: APP + '/coach/exercises', w: 390, h: 1000, auth: true, built: true, mobile: true,
    // CSS pixels - the cropper derives the 2x from the capture. The rail sits
    // between the unclassified banner and the table header.
    crop: [0, 400, 390, 260],
  },
  {
    id: 'review-columns',
    title: 'Review · three identical cards put the same field at three different x',
    file: 'src/WorkoutReview.jsx',
    also: ['src/ui.jsx'],
    undo: [['.wr-day-card .wr-meta{ width: 100% !important; display: grid !important; grid-template-columns: 5em 1fr auto auto !important; align-items: center !important; gap: 0 6px !important; }',
            '.wr-day-card .wr-meta{ width: 100% !important; justify-content: space-between !important; gap: 6px !important; }']],
    alsoUndo: [["<div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end', minWidth: 0, maxWidth: '100%' }}>",
                "<div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end', marginInlineStart: 'auto', minWidth: 0, maxWidth: '100%' }}>"]],
    url: APP + '/coach/review', w: 390, h: 1000, auth: true, built: true, mobile: true,
    // The athlete strip AND the three day cards under it: one crop shows both
    // the hole beside the button and the columns that did not line up.
    crop: [0, 180, 390, 360],
  },
  {
    id: 'intake-text',
    title: 'Intake · a centred filter, and a separator left dangling at a line end',
    file: 'src/IntakeView.jsx',
    also: ['src/themes.css'],
    undo: [["style={{ textAlign: 'start', height: 30, boxSizing: 'border-box', background: 'var(--c-sf)'",
            "style={{ height: 30, boxSizing: 'border-box', background: 'var(--c-sf)'"]],
    // The revert has to reproduce the ORIGINAL text run, spaces and all. A first
    // version only set `display: inline`, and because JSX drops the newlines
    // between the spans the dots came out with no spacing - the run got narrower,
    // fitted on one line, and the dangling separator the pair exists to show
    // never appeared. The margin puts the " · " back.
    alsoUndo: [['.intake-tally { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 7px; }',
                '.intake-tally { display: inline; }'],
               ['  .intake-tally-dot { display: none; }', '  .intake-tally-dot { display: inline; margin: 0 4px; }']],
    url: APP + '/coach/intake', w: 390, h: 800, auth: true, built: true, mobile: true,
    // The tally and the filter field - the two things that changed.
    crop: [0, 100, 390, 190],
  },
  {
    id: 'strip-chevron-light',
    title: 'Light theme · the collapse chevron was white on a pale cyan strip',
    file: 'src/DashboardView.jsx',
    undo: [["<span aria-hidden style={{ color: 'var(--c-stripTx)', fontSize: 12, lineHeight: 1, transform: allAthletesOpen",
            "<span aria-hidden style={{ color: '#FFFFFF', fontSize: 12, lineHeight: 1, transform: allAthletesOpen"]],
    // LIGHT on purpose: in dark the strip is dark and white is correct, so the
    // pair would show the same picture twice. Measured at 1.13:1 by
    // light-dark-parity — the label beside it was already on --c-stripTx and
    // only the chevron was hard-coded.
    // ?theme=light, not a localStorage key: public/boot-theme.js reads the query
    // and applies it BEFORE paint. Writing a storage key does not hold — the
    // app's own theme hook overwrites it on mount, and the first version of
    // this pair came back byte-identical because both shots rendered DARK,
    // where a white chevron is correct and the fix changes nothing.
    url: APP + '/coach/dashboard?theme=light', w: 390, h: 844, auth: true, built: true, mobile: true,
    scrollTo: 3200,
    crop: [300, 228, 82, 58],
  },
  {
    id: 'demo-hebrew',
    title: 'The coach demo · 91 English strings on a page whose Hebrew was already written',
    file: 'src/App.jsx',
    // Both call sites — the route table is walked twice, once before the auth
    // gate (so a signed-in coach can open the demo for a prospect) and once
    // after. Undoing only one of them leaves the other serving the fix, and the
    // "before" comes back identical to the "after".
    undo: [['<CoachLanding lang={readLang()} />', '<CoachLanding lang="en" />']],
    // appLang, not lang: `lang` sets the MARKETING site's language key. /demo is
    // the app, and the whole point of the fix is that it now follows expo-lang.
    url: APP + '/demo', w: 390, h: 900, appLang: 'he', built: true, mobile: true,
    // The hero: the kicker, the headline and the first paragraph.
    crop: [0, 60, 390, 330],
  },
  {
    id: 'greeting-script',
    title: 'Portal picker · "HEY אוהד" was two languages in four characters',
    file: 'src/auth.jsx',
    // Shot with the app in ENGLISH on purpose: that is the state where the bug
    // showed. With the UI already Hebrew both versions render היי and the pair
    // would prove nothing.
    undo: [["direction: dirForName(name, readLang())", "direction: readLang() === 'he' ? 'rtl' : 'ltr'"],
           ["tr(langForName(name, readLang()), 'HEY')", "tr(readLang(), 'HEY')"]],
    url: APP + '/', w: 390, h: 800, appLang: 'en', auth: true, noPortalChoice: true, built: true, mobile: true,
    crop: [0, 100, 390, 80],
  },
];

const only = process.argv.slice(2);
const jobs = only.length ? PAIRS.filter((p) => only.includes(p.id)) : PAIRS;

const b = await P.connect({ browserURL: (process.env.CDP || 'http://127.0.0.1:9222'), defaultViewport: null, protocolTimeout: 300000 });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function shoot(job, label) {
  const pg = await b.newPage();
  try {
    if (job.lang) await pg.evaluateOnNewDocument((l) => { try { localStorage.setItem('expo-il-lang', l); } catch (e) {} }, job.lang);
    // appLang sets the APP's language, which must be in place BEFORE the first
    // document: App reads it at mount and writes it straight back, so a later
    // setItem is overwritten by the 'en' it booted with.
    if (job.auth) {
      // authed-page.signIn RETURNS EARLY when a session already exists, so after
      // any athlete-seat run it silently keeps that seat and a "coach" URL
      // renders the portal instead. That is exactly how the exercises pair came
      // back showing an athlete's programme. Clear first, then sign in, then
      // refuse to shoot if this is not the coach.
      await pg.goto(APP + '/login', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
      await pg.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch (e) {} });
      await A.signIn(pg, APP);
      const isCoach = await pg.evaluate(() => /dashboard|athletes|billing|ראשי|מתאמנים|תשלומים/i.test(document.body.innerText.slice(0, 600)));
      if (!isCoach) throw new Error('not on the coach seat after sign-in');
    }
    if (job.athlete) {
      // Same trap as the coach seat, the other way round: clear, sign in as the
      // athlete, and refuse to shoot if this is not their portal.
      await pg.goto(APP + '/login', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
      await pg.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch (e) {} });
      await pg.goto(APP + '/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
      await wait(3500);
      await pg.evaluate(() => {
        const ins = [...document.querySelectorAll('input')];
        const e = ins.find((i) => /email/i.test(i.type + i.placeholder + i.name));
        const p = ins.find((i) => i.type === 'password');
        const set = (el, v) => {
          Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, v);
          el.dispatchEvent(new Event('input', { bubbles: true }));
        };
        if (e) set(e, 'diego@diegoday.com'); if (p) set(p, '1234');
      });
      await wait(400);
      await pg.evaluate(() => {
        const btn = [...document.querySelectorAll('button')].find((x) => /^\s*(sign\s*in|כניסה)\s*$/i.test(x.textContent || ''));
        if (btn) btn.click();
      });
      await wait(9000);
    }
    // The app's language goes in AFTER the sign-in (the sign-in helpers know the
    // English login only) and BEFORE the first document of the view: App reads
    // it at mount and writes it straight back.
    if (job.appLang) await pg.evaluateOnNewDocument((l) => { try { localStorage.setItem('expo-lang', l); } catch (e) {} }, job.appLang);

    // The install prompt mounts a few seconds after load and covers a phone-width
    // view; snoozing it in storage keeps it out of every shot.
    await pg.evaluateOnNewDocument(() => { try { localStorage.setItem('expo-install-snooze-until', String(Date.now() + 86400000)); } catch (e) {} });
    // PICK THE COACH SEAT BEFORE THE PAGE ASKS.
    //
    // signIn() clears storage, which throws away the portal choice — and this
    // account is dual-role, so the app quite correctly stops at "CHOOSE YOUR
    // PORTAL / HEY אוהד" instead of the URL that was asked for. The first
    // tap-targets pair photographed that picker twice and looked like a
    // working before/after of nothing. sessionStorage, because that is where
    // PORTAL_CHOICE_KEY lives (src/auth.jsx).
    // noPortalChoice: the picker IS the view being photographed (the greeting
    // lives on it), so pre-choosing a portal would skip straight past it.
    if (job.auth && !job.noPortalChoice) await pg.evaluateOnNewDocument(() => { try { sessionStorage.setItem('expo-portal-choice', 'trainer'); } catch (e) {} });
    await setWidth(pg, job.w, job.h);
    await pg.goto(job.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    if (job.cutBackend) {
      // One good load first - that is what fills the snapshot - and only then
      // cut Supabase off and reload. Shell fine, data layer gone: the state a
      // phone with no signal is actually in.
      await wait(12000);
      await pg.setRequestInterception(true);
      pg.on('request', (r) => {
        if (/supabase\.(co|in)/.test(r.url())) { r.abort('failed').catch(() => {}); return; }
        r.continue().catch(() => {});
      });
      await pg.goto(job.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await wait(15000);
    }
    // The install prompt (Hebrew or English) covers a phone-width portal; both
    // shots of the bw-bidi pair came back as the prompt. Dismiss it first.
    await pg.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((e) => /^\s*(אחר כך|later|not now|maybe later|לא עכשיו)\s*$/i.test(e.textContent || ''));
      if (b) b.click();
    }).catch(() => {});
    await wait(600);
    if (job.clickText) {
      await wait(4000);
      await pg.evaluate((t) => {
        const el = [...document.querySelectorAll('button,a,[role=tab],[role=button]')].find((e) => (e.textContent || '').trim() === t);
        if (el) el.click();
      }, job.clickText);
      await wait(2500);
    }
    for (let k = 0; k < 60; k++) {
      await wait(400);
      if (await pg.evaluate(() => document.querySelectorAll('*').length > 300
        && !/^\s*loading/i.test(document.body.innerText.trim()))) break;
    }
    await wait(2500);
    // A BUILT job has just had its bundle replaced, so the page it lands on may
    // still be the boot splash while the service worker reloads and the app
    // hydrates. Both shots of the portal pair came back as the EXPO logo.
    if (job.built) {
      for (let k = 0; k < 30; k++) {
        await wait(1000);
        const ready = await pg.evaluate(() => !/^\s*$/.test(document.body.innerText || '') && document.body.innerText.length > 200).catch(() => false);
        if (ready) break;
      }
      await wait(3000);
    }
    await pg.evaluate(() => {
      const x = [...document.querySelectorAll('button,a')].find((e) => /maybe later|dismiss/i.test(e.textContent || ''));
      if (x) x.click();
    });
    if (job.bhbcTab) {
      // The builder EDITS A SOURCE FILE to make the "before", and the dev
      // server reloads the page when it does. A reload mid-evaluate throws
      // "Execution context was destroyed", which killed both of these pairs on
      // their first run - so every step here tolerates it and tries again.
      await wait(4000);
      for (let k = 0; k < 30; k++) {
        await wait(1000);
        const done = await pg.evaluate((want) => {
          const tabs = [...document.querySelectorAll('.bhbc-tab')];
          const names = tabs.map((e) => (e.textContent || '').trim().toLowerCase());
          if (!names.includes(want.toLowerCase())) return true;   // the current tab is renamed out of the list
          const t = tabs.find((e) => (e.textContent || '').trim().toLowerCase() === want.toLowerCase());
          if (t) t.click();
          return false;
        }, job.bhbcTab).catch(() => false);
        if (done) break;
      }
      await wait(4000);
    }
    if (job.collapseAll) {
      // Click every strip. With the fix in place they shut; without it nothing
      // happens, which is the before.
      for (let attempt = 0; attempt < 3; attempt++) {
        const ok = await pg.evaluate(() => {
          const strips = [...document.querySelectorAll('[role="button"][aria-expanded]')];
          for (const s of strips) s.click();
          return strips.length;
        }).catch(() => 0);
        if (ok) break;
        await wait(2500);
      }
      await wait(2000);
    }
    if (job.bhbcProgram) {
      // Roster -> a player -> View program. The tab switch is CONFIRMED by the
      // strip renaming the current tab out of the list, because a blind click
      // at a fixed delay lands before the zone has rendered.
      for (let k = 0; k < 30; k++) {
        await wait(1000);
        const onRoster = await pg.evaluate(() => {
          const tabs = [...document.querySelectorAll('.bhbc-tab')];
          if (tabs.some((e) => /^overview$/i.test((e.textContent || '').trim()))) return true;
          const t = tabs.find((e) => /^\s*roster\s*$/i.test((e.textContent || '').trim()));
          if (t) t.click();
          return false;
        });
        if (onRoster) break;
      }
      await wait(2500);
      await pg.evaluate(() => {
        // #35 Noah Carter - a MULTI-DAY block, so the day picker is in shot.
        const cards = [...document.querySelectorAll('.bhbc-card')].filter((e) => /#\d+/.test(e.textContent || ''));
        const c = cards.find((e) => /#35/.test(e.textContent || '')) || cards[0];
        if (c) c.click();
      });
      await wait(3500);
      await pg.evaluate(() => {
        const btn = [...document.querySelectorAll('button,a')].find((e) => /view program/i.test((e.textContent || '').trim()));
        if (btn) btn.click();
      });
      await wait(4000);
    }
    if (job.bhbcPlayer) {
      await pg.evaluate(() => {
        const t = [...document.querySelectorAll('.bhbc-tab')].find((e) => /^roster$/i.test((e.textContent || '').trim()));
        if (t) t.click();
      });
      await wait(3000);
      await pg.evaluate(() => {
        const c = [...document.querySelectorAll('.bhbc-card')].find((e) => /#\d+/.test(e.textContent || ''));
        if (c) c.click();
      });
      await wait(3000);
    }
    // scrollTo: the shot is the VIEWPORT, not the full page. A crop aimed at
    // y=3439 on a 4814px dashboard photographed the top 844px twice and the
    // pair came back byte-identical — "the undo never reached the page" when in
    // fact the fix was simply off-screen. Scroll first; crop viewport-relative.
    if (job.scrollTo != null) {
      await pg.evaluate((y) => window.scrollTo(0, y), job.scrollTo);
      await wait(900);
    }
    await wait(1200);
    const f = path.join(OUT, `${job.id}-${label}.png`);
    await pg.screenshot({ path: f });
    return f;
  } finally { await pg.close().catch(() => {}); }
}

// A shot can be interrupted by a reload it did not ask for: on the BUILT app the
// service worker notices the fresh bundle and reloads the page under us, which
// throws "Execution context was destroyed". That is a one-off per build, so the
// answer is to let it happen and take the picture again.
async function shootRetry(job, label) {
  try {
    return await shoot(job, label);
  } catch (e) {
    if (!/Execution context was destroyed|Target closed/i.test(String(e.message || e))) throw e;
    console.log(`     ${job.id} ${label}: reloaded under us, retaking`);
    await wait(6000);
    return await shoot(job, label);
  }
}

// A PAIR THAT SHOWS THE SAME PICTURE TWICE IS WORSE THAN NO PAIR.
//
// Every "before" here is REPRODUCED by undoing the fix, so the whole thing
// rests on the undo actually reaching the running page. Once 5199 and 4173 both
// began serving the BUILT bundle, a job without `built: true` edited a source
// file nobody was reading: the two shots came out byte-identical and the recap
// showed a fix photographed twice in its FIXED state. Two of the eighteen pairs
// on disk were exactly that. So measure it - a pair must differ, and by more
// than render noise.
// `npm run build` runs the whole gate chain, which is both slow and WRONG here:
// a "before" is a deliberately reverted fix, and a revert can legitimately fail
// a gate (the surface manifest, the Hebrew check), which would throw and lose
// the pair. Build the bundle only.
const buildCmd = (job) => (job.il ? 'npm --prefix expo-il run build' : 'npm run build:nocheck');

const MIN_DIFF_PCT = 0.05;
// MEASURE INSIDE THE CROP, WHICH IS THE PART THE PAIR IS ABOUT.
//
// Measured across the whole page, bhbc-history came out at 0.037% and was
// dropped - but the undo had worked perfectly. The fix is one label's size,
// weight and colour, and a label is a rounding error on a 1500x1100 screenshot.
// The crop is the author saying "this is the region that changed", so that is
// the region to judge. Without a crop the whole image is the region.
function pairDiff(id, crop, cssW) {
  const bp = `${OUT}/${id}-before.png`, ap = `${OUT}/${id}-after.png`;
  if (!fs.existsSync(bp) || !fs.existsSync(ap)) return { ok: false, why: 'one of the two shots is missing' };
  const bb = fs.readFileSync(bp), ab = fs.readFileSync(ap);
  if (bb.equals(ab)) return { ok: false, why: 'the two files are byte-identical - the undo never reached the page' };
  const B = PNG.sync.read(bb), A = PNG.sync.read(ab);
  if (B.width !== A.width || B.height !== A.height) return { ok: true, pct: 100, why: `different sizes (${B.width}x${B.height} vs ${A.width}x${A.height})` };
  // The 390px shots come back at 2x and the desktop ones at 1x, so derive the
  // scale from the capture rather than assuming - the same trap the cropper hit.
  const sc = cssW ? Math.max(1, Math.round(B.width / cssW)) : 1;
  const x0 = crop ? Math.max(0, Math.round(crop[0] * sc)) : 0;
  const y0 = crop ? Math.max(0, Math.round(crop[1] * sc)) : 0;
  const x1 = crop ? Math.min(B.width, Math.round((crop[0] + crop[2]) * sc)) : B.width;
  const y1 = crop ? Math.min(B.height, Math.round((crop[1] + crop[3]) * sc)) : B.height;
  const w = x1 - x0, h = y1 - y0;
  if (w < 20 || h < 20) return { ok: false, why: `the crop box is empty on a ${B.width}x${B.height} capture` };
  let n = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (B.width * y + x) * 4;
      if (Math.abs(B.data[i] - A.data[i]) > 8 || Math.abs(B.data[i + 1] - A.data[i + 1]) > 8 || Math.abs(B.data[i + 2] - A.data[i + 2]) > 8) n++;
    }
  }
  const pct = (n / (w * h)) * 100;
  const where = crop ? `inside the ${w}x${h} crop` : 'across the whole shot';
  return { ok: pct >= MIN_DIFF_PCT, pct, why: `${pct.toFixed(3)}% of pixels differ ${where} (floor ${MIN_DIFF_PCT}%)` };
}

for (const job of jobs) {
  const src = fs.readFileSync(job.file, 'utf8');
  const src2 = job.also ? fs.readFileSync(job.also[0], 'utf8') : null;
  let broke = true;
  try {
    let mod = src;
    for (const [from, to] of job.undo) {
      if (!mod.includes(from)) { console.log(`SKIP ${job.id}: anchor not found in ${job.file}`); broke = false; break; }
      mod = mod.replace(from, to);
    }
    if (!broke) continue;
    fs.writeFileSync(job.file, mod);
    // THE SECOND FILE HAS TO BE ON DISK BEFORE THE BUILD, NOT AFTER IT.
    //
    // This used to write `also` after the build ran, so for a `built` job the
    // bundle was compiled from the reverted FIRST file and the unreverted
    // second one - half a "before". review-columns undoes a WorkoutReview rule
    // and a ui.jsx one, and its first picture showed the meta drift with the
    // strip already fixed, under a title that promised both.
    if (src2) {
      let m2 = src2;
      for (const [from, to] of (job.alsoUndo || [])) m2 = m2.replace(from, to);
      fs.writeFileSync(job.also[0], m2);
    }
    if (job.built) { console.log(`     building "before" for ${job.id}...`); execSync(buildCmd(job), { stdio: 'ignore' }); }
    await wait(6000);                       // let the dev server pick it up
    await shootRetry(job, 'before');
    fs.writeFileSync(job.file, src);        // RESTORE before the after-shot
    if (src2) fs.writeFileSync(job.also[0], src2);   // BOTH files, then build
    if (job.built) { console.log(`     rebuilding "after" for ${job.id}...`); execSync(buildCmd(job), { stdio: 'ignore' }); }
    broke = false;
    await wait(6000);
    await shootRetry(job, 'after');
    const d = pairDiff(job.id, job.crop, job.w);
    if (!d.ok) console.log(`FAIL ${job.id}: the pair shows the SAME thing twice - ${d.why}`);
    else console.log(`ok   ${job.id}  (${d.why})`);
  } catch (e) {
    console.log(`FAIL ${job.id}: ${String(e.message || e).slice(0, 90)}`);
  } finally {
    // Unconditional: a reverted fix must never survive this script.
    if (fs.readFileSync(job.file, 'utf8') !== src) {
      fs.writeFileSync(job.file, src);
      console.log(`     restored ${job.file}`);
    }
    if (src2 && fs.readFileSync(job.also[0], 'utf8') !== src2) {
      fs.writeFileSync(job.also[0], src2);
      console.log(`     restored ${job.also[0]}`);
    }
  }
}

// Record what was produced so the recap can pick it up.
const made = fs.readdirSync(OUT).filter((f) => f.endsWith('.png'));
// Index EVERY pair on disk, not just this run's - otherwise running one id
// wipes the others out of the recap.
// Index only the pairs that PROVE something. A pair whose two shots are the
// same picture is dropped with its reason printed - it would otherwise sit in
// the recap looking like evidence.
const checked = PAIRS
  .filter((j) => made.includes(j.id + '-before.png') && made.includes(j.id + '-after.png'))
  .map((j) => ({ j, d: pairDiff(j.id, j.crop, j.w) }));
const dropped = checked.filter((x) => !x.d.ok);
const index = checked.filter((x) => x.d.ok).map(({ j }) => ({ id: j.id, title: j.title, w: j.w, crop: j.crop }));
fs.writeFileSync('audit-out/beforeafter/index.json', JSON.stringify(index, null, 1));
for (const x of dropped) console.log(`DROPPED ${x.j.id}: ${x.d.why}`);
console.log(`${index.length} pair(s) indexed -> ${OUT}` + (dropped.length ? `; ${dropped.length} dropped for showing the same picture twice` : ''));
if (dropped.length) process.exitCode = 1;
b.disconnect();
