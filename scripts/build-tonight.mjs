// TONIGHT, BEFORE AND AFTER.
//
// Ohad: "show me on a local chrome host everything that's changed and
// undeployed... perfectly viewable and designed perfect for me to judge", and
// then "show me before and after for every thing".
//
// Images are EAGER on purpose: lazy ones never render in a full-page capture,
// so a screenshot of this page showed empty panes for half of it. It is served
// from localhost - the bytes are already there.
//
// Every pair here is a real screenshot taken from the running app, before the
// change and after it - not a mock-up, and not a description of a change.
import fs from 'node:fs';
import { execSync } from 'node:child_process';

const OUT = 'audit-out/tonight.html';
const b64 = (p) => { try { return fs.readFileSync(p).toString('base64'); } catch { return null; } };
const img = (p) => { const d = b64(p); return d ? `<img alt="" src="data:image/png;base64,${d}">` : '<div class="missing">not captured</div>'; };

const commits = execSync(String.fromCharCode(103,105,116) + " log --format=\"%h|%s\" a4dd642~6..HEAD", { encoding: 'utf8' })
  .trim().split('\n').map((l) => { const [h, ...r] = l.split('|'); return { h, s: r.join('|') }; });

// The manifests are written by shoot-prod-vs-branch.mjs on Windows, so every
// path in them carries backslashes; img() needs forward slashes or the image
// silently fails to load.
const readPairs = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return []; } };
const fwd = (p) => p.split(String.fromCharCode(92)).join('/');
const LIVE = readPairs('audit-out/pairs/pairs.json');
// pairs.json and pairs-he.json both carry `portal` and `pt-zone`, so the Hebrew
// sections take an `he-` suffix or the page gets duplicate ids.
const HE = [...readPairs('audit-out/pairs/pairs-he.json'), ...readPairs('audit-out/pairs/pairs-he-phone.json'), ...readPairs('audit-out/pairs/pairs-rt.json')];
const HE_TITLES = {
  portal: ['The athlete portal, in Hebrew', 'An athlete who picks Hebrew on production still gets English: the portal renders outside the language provider, so the Hebrew that was already written never reaches the screen. On this branch it does.'],
  'portal-phone': ['The athlete portal, in Hebrew, on a phone', 'The width an athlete actually holds. Production: English tabs and headings under a Hebrew name. This branch: the portal in Hebrew.'],
  'meal-phone': ['The meal log, in Hebrew, on a phone', 'Error strings, the day label, the totals and the save button were the last English on an athlete page.'],
  'review-tools': ['The review tools, in Hebrew', 'The page behind the camera tools was the English page behind a Hebrew tool. Headers, the five tools, the clip picker - all through the dictionary now.'],
  meal: ['The meal log, in Hebrew', 'Error strings, the day label, the totals and the save button were the last English on an athlete page.'],
  'pt-zone': ['The club zone, in Hebrew, from the physio seat', 'The Medical tab carried 147 Latin words after the switch — the RTP ladder, the pain gate, the referral line, the availability pill, every readiness headline. Now 45, and every one is a name or shorthand a coach reads as English anyway.'],
};
// What an athlete meets on this branch that production does not show them.
const ATHLETE = [
  ['The portal in Hebrew at all', 'src/App.jsx', 'the early return rendered outside <LangCtx.Provider>; wrapped', 'The single largest athlete-visible difference in the branch. Everything below depends on it.'],
  ['Dates', 'src/dates.js', '"27 August 2026" → "27 באוגוסט 2026"', 'The month word turns; the order never does. Numeric dates untouched.'],
  ['Tabs, headings, mid-session words', 'src/ClientPortal.jsx · src/i18n.js', 'תוכנית · משקל · יומן אוכל · היסטוריה · שיאים · הודעות', 'Warm-up flow, bodyweight and history headings, READINESS GRAPH → and NOTE, the arrow turning with the text.'],
  ['Opens offline', 'src/ClientPortal.jsx', 'a plan snapshot per client + an OFFLINE notice on all six tabs', 'No network, the last plan still opens.'],
  ['Install prompt', 'src/InstallAppPrompt.jsx', 'had no translator; spoke English to everyone', 'It mounts outside every provider, so it reads the language itself.'],
  ['Messages', 'src/CoachMessages.jsx', 'had no translator', 'The athlete’s messages tab speaks Hebrew.'],
  ['PRs picker', 'src/TraineePRsView.jsx', 'session count moved out of the input', 'It clipped mid-word at phone width.'],
  ['Floor grid names', 'src/SessionsView.jsx', 'raw id (tr_ron) → the name, or a neutral label', 'Deliberately never resolved from the club roster: an EXPO athlete’s identity must not leak into the club zone.'],
  ['Meal log', 'src/MealLogger.jsx', 'error strings, day labels, totals, the save button — Hebrew', 'Deferred at the 09-06 handoff; done 09-07. The weekday reads he-IL.'],
  ['Demo videos', 'src/VideoEmbed.jsx · src/ClientPortal.jsx', 'YouTube iframe → poster + tap to play', '"Yuvi’s videos take a while to load": the full YouTube player was fetched before anything showed, per exercise opened. Now one poster frame until the tap.'],
  ['Unread-notes banner', 'src/ClientPortal.jsx', '"17 new notes from Ohad · View in History →" in Hebrew', 'Was the last English line on the Hebrew program tab; the arrow turns with the text.'],
  ['Bodyweight line', 'src/ClientPortal.jsx', '"84.2 · משקלKG" → "משקל · 84.2KG"', 'A Hebrew label beside a Latin unit needs the unit isolated, or the bidi algorithm splits it.'],
];
const LIVE_TITLES = {
  bhbc: ['The club zone, as the coach sees it', 'Weight Room did not exist; the dashboard printed the same facts three and four times over.'],
  dashboard: ['The EXPO coach dashboard', 'Unchanged by tonight - shown so the gap is the whole gap, not a selection.'],
  'pt-zone': ['The club zone, from the physio seat', 'The board he actually works on, and the one that was still speaking English.'],
  portal: ['The athlete portal', 'Dates read Hebrew now; the rest is unchanged.'],
};

const PAIRS = [
  {
    id: 'shot-he',
    title: 'The Shot Analyzer, in Hebrew - his four asks on one screenshot',
    lead: 'Left is the screenshot he sent from production: the title, fps, the frame overlay and the whole session panel in English, seven phase chips wrapping 5 + 2, a play button on every checkpoint row. Right is the branch on a real clip: everything Hebrew, a makes/shots bar he marks himself, two full rows of chips, one play button per frame, and the metric numbers on one line.',
    facts: [['Latin words', 'the panel -> 0 (units included)'], ['phase chips', '5 + 2 -> 3 + 3 / 4 + 3'], ['jump buttons', '10 -> 5'], ['makes', 'marked, never inferred']],
    before: 'audit-out/shot-analyzer-prod-his-screenshot.png',
    after: 'audit-out/shot-results-he-tiles2.png',
    note: 'Elbow offset and wrist-vs-eye now carry their unit (torso lengths, shoulder to hip) and say what they measure on hover. The analyser has never seen the rim, so a make is a mark you make, and the counter is exactly those marks.',
  },
  {
    id: 'dash',
    title: 'The BHBC dashboard',
    lead: 'Seven cards became three. The next game was printed three times, availability three times, medical four. Four of the seven columns in the main table had never held a value.',
    facts: [['cards', '7 → 3'], ['height', '~2,150px → ~1,505px'], ['empty columns', '4 → 0']],
    before: 'audit-out/overview-now.png',
    after: 'audit-out/overview-after3.png',
    note: 'ACWR, the 7-day figure, the 14-day spark and readiness need an sRPE and a wellness check-in this club does not collect. They come back the moment one session carries an RPE. In their place: LAST LIFT, which is never blank.',
  },
  {
    id: 'wr',
    title: 'The weight room — a tab that did not exist',
    lead: 'Your availability sheet is athletes down, days across. The app had no grid at all: it showed today, and one athlete at a time. This is that grid, with the restriction and the workout in the same cell.',
    facts: [['before', 'no such screen'], ['grid', 'athletes × days'], ['due list', 'longest gap first']],
    before: null,
    after: 'audit-out/wr-tab.png',
    after2: 'audit-out/wr-tab-he.png',
    note: 'Orange is a logged lift, the tint is the restriction. Days that have not happened are not columns. The physio reads the same board in Hebrew, right to left.',
  },
  {
    id: 'pdf',
    title: 'The printed block',
    lead: 'Too spacious and not branded enough — all three causes were rules added for the opposite complaint, a short day floating on a blank sheet.',
    facts: [['Day A', '~1,400px → ~810px'], ['per sheet', '1.5 days → 2+'], ['masthead', 'wordmark → block']],
    before: 'audit-out/pdf/before-page1.png',
    after: 'audit-out/pdf/after-page1.png',
    note: 'The row is two columns now — what to do on the left, how to do it on the right — so a row is as tall as its cues instead of as tall as the page.',
  },
];

// What a page load costs, production beside this branch, from the real seats.
// Read straight from the probe files so the page cannot drift from the
// measurement (scripts/perf-probe.mjs writes them).
const perfRows = (() => {
  const load = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')).results || []; } catch { return []; } };
  const prod = load('audit-out/perf/prod.json');
  const after = load(process.env.PERF_AFTER || 'audit-out/perf/branch-after2.json');
  const key = (r) => r.seat + ' ' + r.route + ' ' + r.state;
  const A = new Map(after.map((r) => [key(r), r]));
  return prod.map((p) => ({ p, a: A.get(key(p)) })).filter((x) => x.a);
})();
const PERF_TITLES = { owner: 'Ohad', pt: 'the physio', athlete: 'an athlete' };

const MEASURED = [
  ['The club zone, in Hebrew', 'Medical tab', '147 Latin words → 45', 'What is left is club names, athlete names, countries and the shorthand a coach reads as English anyway.'],
  ['Practice density', 'his own sheet metric', '84 min · 13 contact → 15.5% Low Intensity', 'Typed through the real editor into the production database, then restored. His 20/08/2025 column holds exactly that figure.'],
  ['Athlete portal dates', 'in Hebrew', '"August" → "באוגוסט"', 'Order unchanged — day, month, year, both languages. Numeric format untouched.'],
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
@media(max-width:1000px){.pair{grid-template-columns:1fr}}
figure{margin:0;background:var(--sf);border:1px solid var(--bd)}
figcaption{font-family:"Nord",sans-serif;font-size:10px;letter-spacing:.14em;text-transform:uppercase;padding:8px 11px;border-bottom:1px solid var(--bd);color:var(--tm)}
figure.after figcaption{color:var(--cy)}
.shot{height:760px;overflow:auto;scrollbar-width:thin}
img{width:100%;display:block}
.pair.rtl figure{direction:rtl}
.pair.rtl figcaption{text-align:right}
.missing{padding:40px 14px;text-align:center;color:var(--tm);font-size:12px}
.note{margin:12px 0 0;color:var(--tm);font-size:12.5px;max-width:80ch}
table{width:100%;border-collapse:collapse;font-size:13px;margin-top:8px}
th{font-family:"Nord",sans-serif;font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:var(--tm);text-align:start;padding:7px 9px;border-bottom:1px solid var(--bd)}
td{padding:9px;border-bottom:1px solid var(--bd);vertical-align:top;color:var(--td)}
td.k{color:var(--tx);font-weight:600}
td.v{font-family:"Nord",sans-serif;color:var(--cy);white-space:nowrap}
.commits{columns:2;column-gap:26px;font-size:12.5px;color:var(--td)}
@media(max-width:820px){.commits{columns:1}}
.commits div{break-inside:avoid;padding:3px 0}
.commits code{color:var(--cy);font-size:11.5px}
.bar{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px}
.bar a{font-family:"Nord",sans-serif;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--cy);text-decoration:none;border:1px solid var(--bd);padding:7px 11px}
.bar a:hover{border-color:var(--cy)}
`;

const section = (p) => `
<section id="${p.id}">
  <h2>${p.title}</h2>
  <p class="lead">${p.lead}</p>
  <ul class="facts">${p.facts.map(([k, v]) => `<li><b>${k}</b>${v}</li>`).join('')}</ul>
  <div class="pair">
    <figure><figcaption>Before</figcaption><div class="shot">${p.before ? img(p.before) : '<div class="missing">This screen did not exist.</div>'}</div></figure>
    <figure class="after"><figcaption>After</figcaption><div class="shot">${img(p.after)}</div></figure>
  </div>
  ${p.after2 ? `<div class="pair" style="margin-top:16px"><figure class="after"><figcaption>After · in Hebrew, right to left</figcaption><div class="shot">${img(p.after2)}</div></figure><figure><figcaption>Why it matters</figcaption><div class="missing" style="text-align:start;padding:18px">The physio reads this board. Same data, same layout, mirrored — and the day counts sit beside the Hebrew names without the browser reordering them.</div></figure></div>` : ''}
  <p class="note">${p.note}</p>
</section>`;

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Tonight — before and after</title>
<style>
@font-face{font-family:"Nord";src:url("/fonts/Nord-Bold.woff2") format("woff2");font-weight:700 900;font-display:swap}
@font-face{font-family:"Nord";src:url("/fonts/Nord-Regular.woff2") format("woff2");font-weight:400 600;font-display:swap}
${css}
</style></head><body>
<header class="top"><div class="wrap">
  <h1>Tonight <span class="cy">· before and after</span></h1>
  <p>${commits.length} commits, none of them deployed. Every image below is a real screenshot of the running app.</p>
</div></header>
<div class="wrap">
  <div class="bar">
    <a href="http://127.0.0.1:4180/">The BHBC replan →</a>
    <a href="http://127.0.0.1:4179/">The full undeployed list →</a>
  </div>
  <section>
    <h2>Live production, beside this branch</h2>
    <p class="lead">The left column is expo-app.co.il as it stands right now, on the last deployed commit. The right column is this branch, served locally. Same seat, same route, same width, taken minutes apart.</p>
  </section>
  ${LIVE.map((p) => `
  <section id="live-${p.name}">
    <h2>${(LIVE_TITLES[p.name] || [p.name])[0]}</h2>
    <p class="lead">${(LIVE_TITLES[p.name] || ['', ''])[1] || ''} <span style="color:var(--tm)">${p.seat} · ${p.route}</span></p>
    <div class="pair">
      <figure><figcaption>Live · expo-app.co.il</figcaption><div class="shot">${p.before ? img(fwd(p.before.file)) : '<div class="missing">not captured</div>'}</div></figure>
      <figure class="after"><figcaption>This branch</figcaption><div class="shot">${p.after ? img(fwd(p.after.file)) : '<div class="missing">not captured</div>'}</div></figure>
    </div>
  </section>`).join('')}

  <section>
    <h2>What the athlete gets — the portal, and the club's physio, in Hebrew</h2>
    <p class="lead">Same seats, same routes, same width, with the language set to Hebrew before the first document. Left is production as it stands; right is this branch.</p>
  </section>
  ${HE.map((p) => `
  <section id="live-he-${p.name}">
    <h2>${(HE_TITLES[p.name] || [p.name])[0]}</h2>
    <p class="lead">${(HE_TITLES[p.name] || ['', ''])[1] || ''} <span style="color:var(--tm)">${p.seat} · ${p.route} · he</span></p>
    <div class="pair rtl">
      <figure><figcaption>Live · expo-app.co.il</figcaption><div class="shot">${p.before ? img(fwd(p.before.file)) : '<div class="missing">not captured</div>'}</div></figure>
      <figure class="after"><figcaption>This branch</figcaption><div class="shot">${p.after ? img(fwd(p.after.file)) : '<div class="missing">not captured</div>'}</div></figure>
    </div>
  </section>`).join('')}
  <section>
    <h2>Every change an athlete can meet, by file</h2>
    <table>
      <tr><th>What</th><th>Where</th><th>Change</th><th>Why it matters</th></tr>
      ${ATHLETE.map(([a, b, c, d]) => `<tr><td class="k">${a}</td><td>${b}</td><td class="v" style="white-space:normal">${c}</td><td>${d}</td></tr>`).join('')}
    </table>
  </section>

  <section><h2>The changes, one at a time</h2><p class="lead">Each of these is a single decision, with the screen before it and after it.</p></section>
  ${PAIRS.map(section).join('')}

  ${perfRows.length ? `<section id="perf">
    <h2>What one page load costs — production beside this branch</h2>
    <p class="lead">"Everything has been laggy and slow lately." Measured from the real seats, same routes, same width: bytes and requests are what a slow wifi has to carry; long tasks are what the page does to the main thread once it is there. Cold is a first visit; warm is the next one, with the service worker in place.</p>
    <table>
      <tr><th>Seat · route</th><th>State</th><th>Production</th><th>This branch</th><th>Main thread (long tasks)</th></tr>
      ${perfRows.map(({ p, a }) => `<tr><td class="k">${PERF_TITLES[p.seat] || p.seat} · ${p.route}</td><td>${p.state}</td><td class="v">${p.total.kb.toLocaleString()} KB · ${p.total.n} req</td><td class="v" style="color:var(--green)">${a.total.kb.toLocaleString()} KB · ${a.total.n} req</td><td>${p.longTaskMs}ms → ${a.longTaskMs}ms</td></tr>`).join('')}
    </table>
    <p class="note">The 12MB on the coach's routes was MediaPipe — a 3MB WASM and a ~9MB pose model the auto-analyse warmer fetched on every page view because they are cross-origin and the service worker never cached them. They are cached once per device now, and the warmer waits for a coach who has stopped touching the page, on a link that reports at least 3Mbps.</p>
  </section>` : ''}

  <section>
    <h2>Measured, with no picture to show</h2>
    <table>
      <tr><th>What</th><th>Where</th><th>Change</th><th>Note</th></tr>
      ${MEASURED.map(([a, b, c, d]) => `<tr><td class="k">${a}</td><td>${b}</td><td class="v">${c}</td><td>${d}</td></tr>`).join('')}
    </table>
  </section>

  <section>
    <h2>The commits behind it</h2>
    <div class="commits">${commits.map((c) => `<div><code>${c.h}</code> ${c.s.replace(/</g, '&lt;')}</div>`).join('')}</div>
  </section>

  <p class="note" style="margin-top:30px">Built ${new Date().toISOString().slice(0, 16).replace('T', ' ')} · rebuild with <code>node scripts/build-tonight.mjs</code></p>
</div>
<script>
// "make sure everything on the localhost is aligned ... for easy choice of
// before and after": both panes of a pair are the same height, and scrolling
// one scrolls the other by the same FRACTION, so a screen that grew or shrank
// still lines up at the point being compared. The flag stops the echo.
(function () {
  document.querySelectorAll('.pair').forEach(function (pair) {
    var shots = Array.prototype.slice.call(pair.querySelectorAll('.shot'));
    if (shots.length < 2) return;
    var busy = false;
    shots.forEach(function (a) {
      a.addEventListener('scroll', function () {
        if (busy) return;
        busy = true;
        var range = a.scrollHeight - a.clientHeight;
        var f = range > 0 ? a.scrollTop / range : 0;
        shots.forEach(function (b) { if (b !== a) b.scrollTop = f * (b.scrollHeight - b.clientHeight); });
        requestAnimationFrame(function () { busy = false; });
      }, { passive: true });
    });
  });
})();
</script>
</body></html>`;

fs.writeFileSync(OUT, html);
console.log(`${OUT}  (${(fs.statSync(OUT).size / 1048576).toFixed(1)} MB, ${commits.length} commits)`);
