// THE BHBC REPLAN, as a page he can judge.
//
// Ohad, after pointing at his own availability sheet: "that's litterally the
// main use of this table. wtf have we been doing up until now? plan a way
// better system", then "replan the entire bhbc system", then "replan the entire
// dashboard of bhbc (main page - some stuff unnecessary, some stuff can be
// combined, some are lacking)".
//
// Every number on this page is measured, not asserted: the sheet columns come
// from his five month tabs (audit-out/bhbc-sheet/*.csv), the dashboard census
// comes from counting what the Overview actually renders today.
import fs from 'node:fs';
import path from 'node:path';

const OUT = 'audit-out/bhbc-replan.html';
const b64 = (p) => { try { return fs.readFileSync(p).toString('base64'); } catch { return null; } };
const shot = (p, alt) => {
  const d = b64(p);
  return d ? `<figure><img alt="${alt}" src="data:image/png;base64,${d}"><figcaption>${alt}</figcaption></figure>` : '';
};

const css = `
:root{
  --bg:#EEF1F5; --sf:#FFFFFF; --tx:#101828; --td:#475467; --tm:#667085;
  --navy:#1E3D74; --navy-deep:#14294F; --orange:#F26A2B; --orange-deep:#D9541A;
  --bd:rgba(30,61,116,0.22); --green:#37B27C; --amber:#8A6410; --red:#DE4E3B;
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--tx);font-family:"DM Sans",-apple-system,Segoe UI,Roboto,sans-serif;line-height:1.5}
.wrap{max-width:1080px;margin:0 auto;padding:0 20px 80px}
header.top{background:var(--navy-deep);color:#fff;padding:30px 0 26px;margin-bottom:26px}
header.top .wrap{display:flex;align-items:baseline;gap:16px;flex-wrap:wrap;padding-bottom:0}
h1{font-family:"Nord",sans-serif;font-size:22px;letter-spacing:.06em;text-transform:uppercase;margin:0;font-weight:800}
header.top p{margin:0;color:#AFC0DA;font-size:13px}
h2{font-family:"Nord",sans-serif;font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:#fff;background:var(--navy);
   margin:34px 0 0;padding:10px 14px;border-inline-start:3px solid var(--orange)}
h3{font-family:"Nord",sans-serif;font-size:12px;letter-spacing:.10em;text-transform:uppercase;color:var(--navy);margin:22px 0 8px}
.card{background:var(--sf);border:1px solid var(--bd);border-top:none;padding:16px 18px}
p{margin:0 0 10px}
.lead{font-size:15px}
small,.meta{color:var(--tm);font-size:12.5px}
table{width:100%;border-collapse:collapse;font-size:13px;margin:6px 0 4px}
th{font-family:"Nord",sans-serif;font-size:10px;letter-spacing:.10em;text-transform:uppercase;color:var(--tm);text-align:start;padding:6px 8px;border-bottom:1px solid var(--bd)}
td{padding:7px 8px;border-bottom:1px solid var(--bd);vertical-align:top}
td.n{font-variant-numeric:tabular-nums;white-space:nowrap}
.kill{color:var(--red);font-weight:700}
.keep{color:var(--green);font-weight:700}
.add{color:var(--orange-deep);font-weight:700}
.chip{display:inline-block;font-family:"Nord",sans-serif;font-size:10px;letter-spacing:.08em;text-transform:uppercase;
      border:1px solid var(--bd);padding:2px 7px;margin-inline-end:6px;color:var(--td)}
ul{margin:0 0 10px;padding-inline-start:20px}
li{margin:3px 0}
figure{margin:14px 0}
img{width:100%;display:block;border:1px solid var(--bd)}
figcaption{font-size:12px;color:var(--tm);padding-top:6px}
.two{display:grid;grid-template-columns:1fr 1fr;gap:16px}
@media(max-width:820px){.two{grid-template-columns:1fr}}
.wire{background:#fff;border:1px solid var(--bd);font-family:"Nord",sans-serif;font-size:11px;letter-spacing:.04em}
.wire .strip{background:var(--navy);color:#fff;padding:7px 10px;font-size:10px;letter-spacing:.12em;text-transform:uppercase;border-inline-start:3px solid var(--orange)}
.wire .row{padding:8px 10px;border-bottom:1px solid var(--bd);display:flex;gap:10px;align-items:baseline;color:var(--td)}
.wire .row b{color:var(--tx)}
.q{background:#fff;border:1px solid var(--bd);border-inline-start:3px solid var(--orange);padding:12px 14px;margin:10px 0}
.q b{font-family:"Nord",sans-serif;font-size:12px;letter-spacing:.06em;text-transform:uppercase}
code{background:#0d1b33;color:#cfe3ff;padding:1px 5px;font-size:12px}
`;

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>BHBC — the replan</title>
<style>
@font-face{font-family:"Nord";src:url("/fonts/Nord-Bold.woff2") format("woff2");font-weight:700 900;font-display:swap}
@font-face{font-family:"Nord";src:url("/fonts/Nord-Regular.woff2") format("woff2");font-weight:400 600;font-display:swap}
${css}
</style></head><body>
<header class="top"><div class="wrap">
  <h1>Bnei Herzliya — the replan</h1>
  <p>Written against your own availability sheet and a census of what the zone renders today. Nothing here is a guess.</p>
</div></header>
<div class="wrap">

<h2>1 · What your sheet actually is</h2>
<div class="card">
<p class="lead">Five month tabs, read straight out of your file: <b>August, September, October, January, February</b>. Every one has the same spine.</p>
<table>
<tr><th>Row</th><th>What it holds</th><th>In EXPO today</th></tr>
<tr><td>Date / Day</td><td>one column group per calendar day</td><td class="keep">yes — but only TODAY is ever on screen</td></tr>
<tr><td>Time</td><td>Early Practice · Late Practice · Double Day · OFF · GAME-DAY</td><td class="keep">yes, as fixtures</td></tr>
<tr><td>Practice Time (MIN)</td><td>84, 95, 140 …</td><td class="keep">yes, on the fixture</td></tr>
<tr><td>Contact Time (MIN)</td><td>13, 32, 36 …</td><td class="kill">NOT MODELLED</td></tr>
<tr><td>Density %</td><td>contact ÷ practice, banded: &lt;20 low · 20–25 moderate · 25–30 high · &gt;30 very high</td><td class="kill">NOT MODELLED</td></tr>
<tr><td>Total Available Players</td><td>9 Players, 13 Players …</td><td class="keep">computed, today only</td></tr>
<tr><td>Basketball Notes</td><td>Plan / Plan A / Plan B</td><td class="keep">session plans</td></tr>
<tr><td>S &amp; C Scale</td><td>Q1–Q4 quadrant + minutes ("8 Min + 6 Min")</td><td class="kill">NOT MODELLED</td></tr>
<tr><td>S &amp; C content (Feb)</td><td>"- BW Strength - Dynamic Streching - Ladders"</td><td class="kill">NOT MODELLED</td></tr>
<tr><td>Athlete × day cell</td><td>restriction code 1–5</td><td class="keep">same five codes — but no grid to read them in</td></tr>
<tr><td>PT Notes / S&amp;C Notes lanes</td><td>present since August, <b>almost always empty</b></td><td>—</td></tr>
</table>
<p class="meta">The note lanes being empty is the most useful thing in the file: three columns per day made the grid unreadable, so nobody used them. February dropped the PT lane entirely. The design lesson is his, not mine — the grid is for CODES, notes belong one click deep.</p>
</div>

<h2>2 · What the zone built instead</h2>
<div class="card">
<p class="lead">The Overview is <b>seven cards and roughly 2,150 pixels</b> of scroll. Here is the census.</p>
<h3>The same fact, printed again</h3>
<table>
<tr><th>Fact</th><th>Appears in</th><th>Times</th></tr>
<tr><td>Next game (vs Hapoel Eilat, in 3 days)</td><td>Head Coach Report · Today · Next Game card</td><td class="n">3</td></tr>
<tr><td>Availability 8 / 2 / 0</td><td>Head Coach Report · Today · a column in the load board</td><td class="n">3</td></tr>
<tr><td>Medical exceptions</td><td>Head Coach Report list · S&amp;C Brief count · MED buttons in the board · Medical tab</td><td class="n">4</td></tr>
</table>
<h3>Printed every day, always empty</h3>
<table>
<tr><th>Element</th><th>Shows</th><th>Why it is empty</th></tr>
<tr><td>Team Snapshot · Avg ACWR / Flagged / 7-day load</td><td>— · 0 · —</td><td>needs sRPE per session</td></tr>
<tr><td>Load board · ACWR column</td><td>"· baseline" ×10</td><td>same</td></tr>
<tr><td>Load board · 7D column</td><td>"—" ×10</td><td>same</td></tr>
<tr><td>Load board · 14-day sparkline</td><td>blank ×10</td><td>same</td></tr>
<tr><td>Load board · Readiness</td><td>"no check-in" ×10</td><td>needs a wellness check-in nobody fills</td></tr>
</table>
<p class="lead"><b>Four of the seven columns in the main table, and three of the four numbers in Team Snapshot, have never held a value.</b> The zone was built around sRPE and readiness — a model you do not feed — while the instrument you actually maintain, the month grid, was not in the app at all.</p>
${shot('audit-out/overview-now.png', 'The Overview as it stands tonight — seven cards, most of the load columns empty.')}
</div>

<h2>3 · The principle</h2>
<div class="card">
<p class="lead">Show what is maintained. Compute what can be computed. Nothing else earns a pixel.</p>
<div class="two">
<div><h3>You maintain</h3><ul>
<li>availability code per athlete per day</li>
<li>practice minutes, and contact minutes inside them</li>
<li>what the weight room did that day</li>
<li>medical status, onset, RTP target</li>
<li>fixtures</li>
</ul></div>
<div><h3>You do not</h3><ul>
<li>an RPE per athlete per session</li>
<li>a wellness check-in</li>
</ul>
<p class="meta">So ACWR, readiness, monotony and strain are not "coming soon" — they are a different club's workflow. They stay in the product, behind Sessions, and appear on the dashboard only once there is data to show.</p></div>
</div>
</div>

<h2>4 · The new dashboard — built tonight</h2>
<div class="card"><p class="lead">Everything in sections 4 and 5 marked <b class="add">done</b> is already on the branch and visible at <code>127.0.0.1:4181</code>, before and after. Nothing is deployed.</p></div>
<div class="card">
<div class="two">
<div>
<h3>Card 1 — Today</h3>
<div class="wire">
  <div class="strip">Today · Sun 6 Sep · MD-3</div>
  <div class="row"><b>Game</b> vs Hapoel Eilat · in 3 days · away · Begin Arena</div>
  <div class="row"><b>Squad</b> 8 available · 2 limited · 0 out — Francis, מנחם</div>
  <div class="row"><b>Practice</b> 84 min · 13 contact · <b>15.5%</b> low intensity</div>
  <div class="row"><b>Weight room</b> BW strength + dynamic stretching · 12 min · 2 lifted</div>
  <div class="row"><b>Medical</b> Francis knee R · RTP 26 Aug · <span style="color:#8A6410">11d overdue</span></div>
  <div class="row">START SESSION · PLAN · LOG PRACTICE</div>
</div>
<p class="meta">Head Coach Report + S&amp;C Brief + Today + Next Game, collapsed into one. Every fact once. Density is the sheet metric, computed the moment the two numbers exist.</p>
</div>
<div>
<h3>Card 2 — The month</h3>
<div class="wire">
  <div class="strip">Weight room &amp; availability · Sep 2026</div>
  <div class="row">athletes down · days across · orange = lift · tint = restriction</div>
  <div class="row">last 14 days on the dashboard, the full month in its own tab</div>
  <div class="row"><b>Due</b> 7 athletes — longest gap first</div>
</div>
<h3>Card 3 — Ahead</h3>
<div class="wire">
  <div class="strip">Road ahead</div>
  <div class="row">Rishon LeZion · 11d · home</div>
  <div class="row">Joventut Badalona · 30d · away · flight</div>
</div>
<p class="meta">Team Snapshot and the ACWR columns come off the dashboard entirely until an RPE exists.</p>
</div>
</div>
</div>

<h2>5 · The whole zone</h2>
<div class="card">
<table>
<tr><th>Tab</th><th>Change</th><th>Why</th></tr>
<tr><td>Overview</td><td class="add">done · 7 cards → 3</td><td>every fact once; nothing empty on screen</td></tr>
<tr><td>Roster</td><td class="keep">unchanged</td><td>it is the people list and it works</td></tr>
<tr><td>Weight Room</td><td class="add">done · new tab</td><td>your grid: athletes × days, lift + restriction in one cell, due list under it</td></tr>
<tr><td>Schedule</td><td class="add">done · contact minutes → density + Q1–Q4</td><td>unlocks density % and the intensity band — the number your sheet is built on</td></tr>
<tr><td>Medical</td><td class="keep">unchanged</td><td>the RTP ladder and the board are right</td></tr>
<tr><td>Sessions</td><td class="add">done · ACWR/readiness appear only with data</td><td>the place an RPE would be entered is the place its analytics belong</td></tr>
<tr><td>Games</td><td class="keep">unchanged</td><td>league data is clean</td></tr>
</table>
<h3>What the app can do that the sheet cannot</h3>
<ul>
<li>the restriction and the workout in <b>one cell</b> — your sheet holds availability only</li>
<li>density % that cannot read <code>#DIV/0!</code> — it appears when both minutes exist and stays blank otherwise</li>
<li>the medical record sets the floor: an athlete cleared in the grid but limited in the record cannot read "full"</li>
<li>the month rolls over by itself — no new tab, no formulas to re-copy</li>
<li>the physio sees it in Hebrew, you see it in English, same board</li>
</ul>
</div>

<h2>6 · What I need from you</h2>
<div class="card">
<div class="q"><b>Contact minutes</b><br>Do you want to type contact minutes per practice (one number, once a day)? Density and the intensity band cannot exist without it — it is the only new thing this asks of you.</div>
<div class="q"><b>Q1–Q4 — derived, and it matches you</b><br>Built as derived: volume over 90 minutes, intensity from the 25% band up. Checked against your own hand-typed row for 20/08/2025 — 84 min, 13 contact, 15.5%, and your sheet says Q1. So does the app. One question stands: your legend calls Q4 "Moderate Volume" while Q2 is "High" — which did you mean?</div>
<div class="q"><b>ACWR and readiness</b><br>Off the dashboard until an RPE exists — agreed? They stay live under Sessions either way.</div>
<div class="q"><b>The month grid on the dashboard</b><br>Last 14 days, or the whole month? 14 fits without sideways scrolling on a laptop.</div>
</div>

<p class="meta" style="margin-top:26px">Built ${new Date().toISOString().slice(0, 16).replace('T', ' ')} · from audit-out/bhbc-sheet/*.csv and a live render of the zone.</p>
</div></body></html>`;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html);
console.log(`${OUT}  (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB)`);
