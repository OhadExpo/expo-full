// WHAT'S LEFT — THE ATHLETE PORTAL.
//
// Ohad, 09-11: "deploy everything except athlete portal changes … whatever is
// left: show me what's left to review regarding undeployed athlete portal on a
// local chromehost". The deploy went out at 19:45 (cf884fb → master), with
// ClientPortal, MealLogger, the login and the athlete tree's language provider
// held at production. This page is only that remainder: every pair is
// production as it stands right now (left) beside this branch (right), from an
// athlete's seat, in Hebrew, at the width a phone actually has.
//
//   node scripts/build-athlete-left.mjs   → audit-out/athlete-left.html
//   node scripts/serve-page.mjs audit-out/athlete-left.html 4182
import fs from 'node:fs';
import { execSync } from 'node:child_process';

const OUT = 'audit-out/athlete-left.html';
const b64 = (p) => { try { return fs.readFileSync(p).toString('base64'); } catch { return null; } };
const img = (p) => { const d = b64(p); return d ? `<img alt="" src="data:image/png;base64,${d}">` : '<div class="missing">not captured</div>'; };
const readPairs = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return []; } };
const fwd = (p) => p.split(String.fromCharCode(92)).join('/');
const git = (args) => { try { return execSync('git ' + args, { encoding: 'utf8' }).trim(); } catch { return ''; } };

const PROD = git('rev-parse --short origin/master');
const BRANCH = git('rev-parse --short HEAD');
const BRANCH_NAME = git('branch --show-current');
const ATHLETE_FILES = ['src/ClientPortal.jsx', 'src/MealLogger.jsx', 'src/auth.jsx', 'src/App.jsx'];
const stat = git(`diff origin/master..HEAD --stat -- ${ATHLETE_FILES.join(' ')}`).split('\n').filter((l) => l.includes('|')).map((l) => l.trim());

const ALL = [
  ...readPairs('audit-out/pairs/pairs-he.json'),
  ...readPairs('audit-out/pairs/pairs-he-phone.json'),
  ...readPairs('audit-out/pairs/pairs-athlete-more.json'),
  ...readPairs('audit-out/pairs/pairs-demo.json'),
];
const byName = Object.fromEntries(ALL.map((p) => [p.name, p]));

// Order and words for each pair. Every caption states what to judge, not what
// changed in the code.
const PAIRS = [
  ['portal', 'The program tab, desktop', 'The tabs, the block header, the week strip, the warm-up card and every exercise row in Hebrew. Production renders the portal outside the language provider, so an athlete who picked Hebrew still gets English there.'],
  ['portal-phone', 'The program tab, on a phone', 'The width an athlete actually holds. Judge the tab strip (six tabs, two rows), the BW line ("משקל · 75KG", not "75 · משקלKG"), the unread-notes banner, and that no exercise row carries a FOCUS line.'],
  ['history-phone', 'History', 'Past workouts, the readiness check-in words, and the reviewed-workout notes from the coach — with the FOCUS label gone (09-11: "i don\'t want any focus anywhere there").'],
  ['prs-phone', 'PRs', 'The records tab. The session-count picker moved out of the input because it clipped mid-word at this width.'],
  ['bw-phone', 'Bodyweight', 'Weigh-ins, the trend line and its empty state ("תרשום לפחות שתי שקילות כדי לראות מגמה").'],
  ['messages-phone', 'Messages', 'The athlete\'s thread with the coach: the empty state, the reply box, the voice note.'],
  ['meal-phone', 'The meal log', 'Day labels, totals, the save button and every error string. The weekday reads he-IL.'],
  ['demo-athlete-he', 'The public demo of the athlete portal', 'What a prospect from the Hebrew marketing site meets at /demo/athlete. Production after the 09-11 deploy: the demo banner in Hebrew, and beneath it the portal in English with FOCUS lines — the demo renders the same ClientPortal the athletes get, which was held at production by your order. This branch: the whole demo in Hebrew, no FOCUS.'],
];

// What the branch changes for an athlete, file by file — the review list.
const ROWS = [
  ['The portal in Hebrew at all', 'src/App.jsx', 'the athlete tree inside <LangCtx.Provider>', 'The single largest athlete-visible difference. Everything below depends on it. Production: English whatever the athlete chose.'],
  ['Login in Hebrew', 'src/auth.jsx', 'the language toggle on the login page', 'Held at English for the deploy (the toggle is hidden there). On this branch an athlete can sign in in Hebrew.'],
  ['Tabs, headings, mid-session words', 'src/ClientPortal.jsx · src/i18n.js', 'תוכנית · משקל · יומן אוכל · היסטוריה · שיאים · הודעות', 'Warm-up flow, bodyweight and history headings, readiness check-in, the logger\'s buttons.'],
  ['No FOCUS anywhere', 'src/ClientPortal.jsx · src/TrySandbox.jsx', 'the per-exercise FOCUS line and the logger\'s "COACH\'S FOCUS" label removed', '09-11: "i don\'t want any focus anywhere there and never asked for it". Coach notes still reach the athlete as EXERCISE NOTE / FROM YOUR COACH.'],
  ['Opens offline', 'src/ClientPortal.jsx', 'a plan snapshot per client + an OFFLINE notice on all six tabs', 'No network, the last plan still opens, and the athlete is told the data is not live. Production shows nothing.'],
  ['Demo videos load on tap', 'src/ClientPortal.jsx · src/VideoEmbed.jsx', 'YouTube iframe → poster + tap to play', '"Yuvi\'s videos take a while to load": the full player was fetched per exercise opened; now a 37KB poster until the tap.'],
  ['Unread-notes banner', 'src/ClientPortal.jsx', '"17 new notes from Ohad · View in History →" in Hebrew', 'Was the last English line on the Hebrew program tab; the arrow turns with the text.'],
  ['Bodyweight line', 'src/ClientPortal.jsx', '"84.2 · משקלKG" → "משקל · 84.2KG"', 'A Hebrew label beside a Latin unit needs the unit isolated, or the bidi algorithm splits it.'],
  ['Meal log', 'src/MealLogger.jsx', 'error strings, day labels, totals, the save button — Hebrew', 'Every visible string, including the AI-analysis failures.'],
  ['Update notice, busy signal', 'src/ClientPortal.jsx', 'window.__expoWorkoutActive while a set is being logged', 'The notice rules themselves are deployed (grace, once per bundle, 24h snooze, idle auto-apply); only the "never during a workout" signal from the logger waits here.'],
];

const css = `
:root{--bg:#0B0C0E;--sf:#121417;--tx:#F2F4F7;--td:#98A2B3;--tm:#667085;--cy:#39BDFF;--bd:#23272E;--green:#37B27C;--orange:#F26A2B}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--tx);font-family:"DM Sans",-apple-system,Segoe UI,Roboto,sans-serif;line-height:1.5}
.wrap{max-width:1500px;margin:0 auto;padding:0 22px 90px}
header.top{border-bottom:1px solid var(--bd);padding:26px 0 20px;margin-bottom:24px;background:#0E1013}
header.top .wrap{padding-bottom:0;display:flex;align-items:baseline;gap:14px;flex-wrap:wrap}
h1{font-family:"Nord",sans-serif;font-size:20px;letter-spacing:.10em;text-transform:uppercase;margin:0;font-weight:800}
h1 .cy{color:var(--cy)}
header.top p{margin:0;color:var(--tm);font-size:13px}
section{margin:34px 0 0}
h2{font-family:"Nord",sans-serif;font-size:13px;letter-spacing:.14em;text-transform:uppercase;margin:0 0 6px;color:#fff}
.lead{color:var(--td);font-size:14px;max-width:78ch;margin:0 0 12px}
.facts{display:flex;gap:22px;flex-wrap:wrap;margin:0 0 14px;padding:0;list-style:none}
.facts li{font-family:"Nord",sans-serif;font-size:12px;letter-spacing:.04em}
.facts b{display:block;font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:var(--tm);font-weight:700;margin-bottom:3px}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.pair.phone{grid-template-columns:430px 430px;justify-content:start}
@media(max-width:1000px){.pair,.pair.phone{grid-template-columns:1fr}}
figure{margin:0;background:var(--sf);border:1px solid var(--bd)}
figcaption{font-family:"Nord",sans-serif;font-size:10px;letter-spacing:.14em;text-transform:uppercase;padding:8px 11px;border-bottom:1px solid var(--bd);color:var(--tm)}
figure.after figcaption{color:var(--cy)}
.shot{height:760px;overflow:auto;scrollbar-width:thin}
img{width:100%;display:block}
.missing{padding:40px 14px;text-align:center;color:var(--tm);font-size:12px}
.note{margin:12px 0 0;color:var(--tm);font-size:12.5px;max-width:80ch}
table{width:100%;border-collapse:collapse;font-size:13px;margin-top:8px}
th{font-family:"Nord",sans-serif;font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:var(--tm);text-align:start;padding:7px 9px;border-bottom:1px solid var(--bd)}
td{padding:9px;border-bottom:1px solid var(--bd);vertical-align:top;color:var(--td)}
td.k{color:var(--tx);font-weight:600}
td.v{font-family:"Nord",sans-serif;color:var(--cy);white-space:nowrap}
code{color:var(--cy);font-size:11.5px}
.bar{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px}
.bar a{font-family:"Nord",sans-serif;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--cy);text-decoration:none;border:1px solid var(--bd);padding:7px 11px}
.bar a:hover{border-color:var(--cy)}
.deployed{border:1px solid var(--green);padding:12px 14px;margin:0 0 6px;color:var(--td);font-size:13px}
.deployed b{color:var(--green);font-family:"Nord",sans-serif;font-size:10px;letter-spacing:.14em;text-transform:uppercase;display:block;margin-bottom:4px}
`;

const pairSection = ([name, title, lead]) => {
  const p = byName[name];
  const phone = /phone|demo/.test(name);
  return `
<section id="${name}">
  <h2>${title}</h2>
  <p class="lead">${lead} ${p ? `<span style="color:var(--tm)">${p.seat} · ${p.route}${p.tab ? ' · ' + p.tab.split('|')[0] : ''}</span>` : ''}</p>
  <div class="pair${phone ? ' phone' : ''}">
    <figure><figcaption>Production now · expo-app.co.il · ${PROD}</figcaption><div class="shot">${p?.before ? img(fwd(p.before.file)) : '<div class="missing">not captured</div>'}</div></figure>
    <figure class="after"><figcaption>This branch · ${BRANCH_NAME} · ${BRANCH}</figcaption><div class="shot">${p?.after ? img(fwd(p.after.file)) : '<div class="missing">not captured</div>'}</div></figure>
  </div>
</section>`;
};

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>What's left — the athlete portal</title>
<style>
@font-face{font-family:"Nord";src:url("/fonts/Nord-Bold.woff2") format("woff2");font-weight:700 900;font-display:swap}
@font-face{font-family:"Nord";src:url("/fonts/Nord-Regular.woff2") format("woff2");font-weight:400 600;font-display:swap}
${css}
</style></head><body>
<header class="top"><div class="wrap">
  <h1>What's left <span class="cy">· the athlete portal</span></h1>
  <p>Everything else went to production on 11 September at 19:45. This is the remainder, from an athlete's seat, in Hebrew.</p>
</div></header>
<div class="wrap">
  <div class="deployed"><b>Deployed 11 Sep 19:45 · master ${PROD}</b>
    Coach app, club zone, marketing, demo, Hebrew audit, buttons, fonts, update-notice rules, compare redesign — all live. Held back by your order: the athlete portal's experience. Files still different on this branch: ${stat.length ? stat.map((s) => `<code>${s.split('|')[0].trim()}</code>`).join(' · ') : 'none'}.
  </div>
  <div class="bar">
    <a href="http://127.0.0.1:4181/">Tonight, before and after →</a>
    <a href="http://127.0.0.1:4179/">The full list →</a>
    <a href="http://127.0.0.1:4180/">The BHBC replan →</a>
  </div>
  <section>
    <h2>How to read this</h2>
    <p class="lead">Left is expo-app.co.il as it stands right now — the athlete portal exactly as before the deploy. Right is this branch served locally. Same athlete seat (Amit), same route, same width, the language set to Hebrew before the first document, taken minutes apart.</p>
  </section>
  ${PAIRS.map(pairSection).join('')}

  <section>
    <h2>What an athlete would get — the review list</h2>
    <p class="lead">Each row is one decision. Nothing here is on production.</p>
    <table><thead><tr><th>Change</th><th>Where</th><th>What</th><th>Why</th></tr></thead><tbody>
    ${ROWS.map(([a, b, c, d]) => `<tr><td class="k">${a}</td><td class="v">${b}</td><td>${c}</td><td>${d}</td></tr>`).join('')}
    </tbody></table>
    <p class="note">To ship it: on ${BRANCH_NAME}, <code>git push origin ${BRANCH_NAME}:master</code>. Restore point for the whole 09-11 deploy: <code>dc80f2d</code>; for this remainder alone, <code>${PROD}</code>.</p>
  </section>
</div></body></html>`;
fs.writeFileSync(OUT, html);
console.log(`${OUT} · ${(fs.statSync(OUT).size / 1024 / 1024).toFixed(1)} MB · pairs captured ${PAIRS.filter(([n]) => byName[n]?.after).length}/${PAIRS.length}`);
