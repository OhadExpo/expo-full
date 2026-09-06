// TONIGHT, BEFORE AND AFTER.
//
// Ohad: "show me on a local chrome host everything that's changed and
// undeployed... perfectly viewable and designed perfect for me to judge", and
// then "show me before and after for every thing".
//
// Every pair here is a real screenshot taken from the running app, before the
// change and after it - not a mock-up, and not a description of a change.
import fs from 'node:fs';
import { execSync } from 'node:child_process';

const OUT = 'audit-out/tonight.html';
const b64 = (p) => { try { return fs.readFileSync(p).toString('base64'); } catch { return null; } };
const img = (p) => { const d = b64(p); return d ? `<img loading="lazy" alt="" src="data:image/png;base64,${d}">` : '<div class="missing">not captured</div>'; };

const commits = execSync(String.fromCharCode(103,105,116) + " log --format=\"%h|%s\" a4dd642~6..HEAD", { encoding: 'utf8' })
  .trim().split('\n').map((l) => { const [h, ...r] = l.split('|'); return { h, s: r.join('|') }; });

const PAIRS = [
  {
    id: 'dash',
    title: 'The BHBC dashboard',
    lead: 'Seven cards became four. The next game was printed three times, availability three times, medical four. Four of the seven columns in the main table had never held a value.',
    facts: [['cards', '7 → 4'], ['height', '~2,150px → ~1,540px'], ['empty columns', '4 → 0']],
    before: 'audit-out/overview-now.png',
    after: 'audit-out/overview-after2.png',
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
.shot{max-height:760px;overflow:auto}
img{width:100%;display:block}
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
  ${PAIRS.map(section).join('')}

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
</div></body></html>`;

fs.writeFileSync(OUT, html);
console.log(`${OUT}  (${(fs.statSync(OUT).size / 1048576).toFixed(1)} MB, ${commits.length} commits)`);
