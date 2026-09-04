// THE MORNING RECAP — everything that is built but NOT deployed, on localhost.
//
// Ohad: "create a full recap model like you know i how like in local host
// after the 5 hours to show me what's undeployed and ill check it in the
// morning".
//
// It is written as ONE self-contained file with the screenshots inlined, so it
// opens by double-clicking and needs nothing running. That is not a stylistic
// choice: the app registers a service worker whose navigation fallback returns
// index.html, so /_recap.html served from public/ came back as the portal
// chooser in a browser even though curl got the right 107KB. A copy still goes
// to public/ for convenience, and both are gitignored - a page about
// undeployed work must never ride along to production.
//
// Every commit ahead of the last deployed SHA, with the reason it exists, the
// files it touched, and a LINK straight to the screen it changed - so he can
// click through and judge, instead of reading a list and taking my word for it.
//
//   node scripts/build-recap.mjs [deployedSha]
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const DEPLOYED = process.argv[2] || 'dc80f2d';
const BASE = process.env.RECAP_BASE || 'http://127.0.0.1:5199';
const OUT = 'public/_recap.html';
const STANDALONE = 'audit-out/recap.html';
const SHOTDIR = 'public/_recap';

const git = (c) => execSync(c, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// A file tells you which screen it changed. Longest prefix wins, so a specific
// view beats the generic src/ rule.
const ROUTES = [
  ['src/BillingView.jsx', '/coach/billing'],
  ['src/RevenueSheetCard.jsx', '/coach/billing'],
  ['src/BhbcView.jsx', '/coach/bhbc'],
  ['src/PlansView.jsx', '/coach/programs'],
  ['src/ExercisesView.jsx', '/coach/exercises'],
  ['src/IntakeView.jsx', '/coach/intake'],
  ['src/TraineesView.jsx', '/coach/athletes'],
  ['src/DashboardView.jsx', '/coach'],
  ['src/TraineeDetail.jsx', '/coach/athletes'],
  ['src/WorkoutReview.jsx', '/coach/review'],
  ['src/ClientPortal.jsx', '/athlete'],
  ['src/themes.css', '/coach'],
  ['expo-il/', null],
];
const routeFor = (files) => {
  const hits = new Set();
  for (const f of files) for (const [pre, r] of ROUTES) if (r && f.startsWith(pre)) hits.add(r);
  return [...hits];
};

// Screenshots produced during the work, mapped onto the commit they belong to
// by a keyword in the subject. Only files that exist are copied.
const SHOTS = [
  [/exercises table/i, ['audit-out/ex900-hdr.png']],
  [/intake/i, ['audit-out/intake390-crop.png']],
  [/pdf/i, ['audit-out/p3-1.png', 'audit-out/p3-5.png']],
  [/player popup/i, ['audit-out/bhbc-hist.png', 'audit-out/bhbc-player-390.png']],
  [/revenue/i, ['audit-out/billing2-crop.png']],
];

fs.mkdirSync(SHOTDIR, { recursive: true });
for (const f of fs.readdirSync(SHOTDIR)) fs.rmSync(path.join(SHOTDIR, f), { force: true });

const SEP = '<<<<COMMIT>>>>';
const raw = git(`git log --reverse --format="${SEP}%H%n%h%n%ad%n%s%n%b<<<<END>>>>" --date=format:"%d/%m/%Y %H:%M" ${DEPLOYED}..HEAD`);
const commits = raw.split(SEP).slice(1).map((blk) => {
  const body = blk.split('<<<<END>>>>')[0];
  const [full, short, date, subject, ...rest] = body.split('\n');
  const files = git(`git show --pretty=format: --name-only ${full}`).split('\n').map((x) => x.trim()).filter(Boolean);
  return { full, short, date, subject, body: rest.join('\n').trim(), files };
});

let copied = 0;
for (const c of commits) {
  c.shots = [];
  for (const [re, list] of SHOTS) {
    if (!re.test(c.subject)) continue;
    for (const src of list) {
      if (!fs.existsSync(src)) continue;
      const name = `${c.short}-${path.basename(src)}`;
      fs.copyFileSync(src, path.join(SHOTDIR, name));
      // Inlined so the standalone file carries its own images.
      c.shots.push('data:image/png;base64,' + fs.readFileSync(src).toString('base64'));
      copied++;
    }
  }
  c.routes = routeFor(c.files);
}

// What is waiting on him, kept in its own file so the generator stays generic.
let decisions = [];
try { decisions = JSON.parse(fs.readFileSync('audit-out/recap-decisions.json', 'utf8')); } catch { /* none */ }

const totalFiles = new Set(commits.flatMap((c) => c.files)).size;
const allRoutes = [...new Set(commits.flatMap((c) => c.routes))].sort();

const card = (c, i) => `
  <article class="c" id="${c.short}">
    <header>
      <span class="n">${String(i + 1).padStart(2, '0')}</span>
      <h2>${esc(c.subject)}</h2>
      <span class="sha">${c.short}</span>
    </header>
    <div class="meta">${esc(c.date)} &middot; ${c.files.length} file${c.files.length === 1 ? '' : 's'}</div>
    ${c.routes.length ? `<div class="links">${c.routes.map((r) =>
      `<a href="${BASE}${r}" target="_blank" rel="noopener">${esc(r)}</a>`).join('')}</div>` : ''}
    ${c.body ? `<pre class="why">${esc(c.body.replace(/\nCo-Authored-By:[\s\S]*$/, '').trim())}</pre>` : ''}
    ${c.shots.length ? `<div class="shots">${c.shots.map((s) =>
      `<a href="${s}" target="_blank" rel="noopener"><img src="${s}" alt="" loading="lazy"></a>`).join('')}</div>` : ''}
    <details><summary>${c.files.length} files</summary><ul>${c.files.map((f) => `<li>${esc(f)}</li>`).join('')}</ul></details>
  </article>`;

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>EXPO &middot; undeployed</title>
<style>
  :root{--bg:#0a0a0b;--sf:#141417;--bd:rgba(57,189,255,.28);--ac:#39BDFF;--tx:#F2F4F7;--tm:#9AA3B2;--td:#6B7382;--or:#F26A2B}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--tx);font:15px/1.6 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
  .wrap{max-width:960px;margin:0 auto;padding:28px 18px 90px}
  h1{font-size:26px;letter-spacing:.02em;margin:0 0 4px}
  .sub{color:var(--tm);font-size:13px;margin-bottom:22px}
  .kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:26px}
  .k{background:var(--sf);border:1px solid var(--bd);padding:13px 15px}
  .k b{display:block;font-size:25px;letter-spacing:-.01em}
  .k span{font-size:10px;letter-spacing:.13em;text-transform:uppercase;color:var(--tm)}
  .note{background:var(--sf);border:1px solid var(--bd);border-left:3px solid var(--or);padding:14px 16px;margin-bottom:26px}
  .note h3{margin:0 0 8px;font-size:12px;letter-spacing:.13em;text-transform:uppercase;color:var(--or)}
  .note p{margin:0 0 8px;font-size:14px;color:var(--tm)}
  .note code{background:#000;padding:2px 6px;color:var(--ac);font-size:13px}
  .c{background:var(--sf);border:1px solid var(--bd);margin-bottom:14px}
  .c header{display:flex;align-items:baseline;gap:10px;padding:11px 15px;background:rgba(57,189,255,.09);border-bottom:1px solid var(--bd)}
  .c .n{font-size:11px;color:var(--ac);font-variant-numeric:tabular-nums}
  .c h2{font-size:15px;margin:0;flex:1;font-weight:600}
  .c .sha{font-size:11px;color:var(--td);font-family:ui-monospace,monospace}
  .meta{padding:9px 15px 0;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--td)}
  .links{padding:9px 15px 0;display:flex;flex-wrap:wrap;gap:7px}
  .links a{font-size:12px;color:var(--ac);border:1px solid var(--bd);padding:3px 9px;text-decoration:none}
  .links a:hover{background:rgba(57,189,255,.12)}
  .why{margin:11px 15px;padding:12px 14px;background:#0f0f12;border-left:2px solid var(--bd);
       white-space:pre-wrap;font:13px/1.65 ui-sans-serif,system-ui,sans-serif;color:var(--tm);overflow-x:auto}
  .shots{display:flex;flex-wrap:wrap;gap:9px;padding:0 15px 12px}
  .shots img{max-width:100%;width:420px;border:1px solid var(--bd);display:block;background:#fff}
  details{padding:0 15px 13px;font-size:12px;color:var(--td)}
  details ul{margin:8px 0 0;padding-left:18px}
  .ask{border-left-color:var(--ac)}
  .ask h3{color:var(--ac)}
  .ask-item{padding:10px 0;border-top:1px solid rgba(57,189,255,.16)}
  .ask-item:first-of-type{border-top:none;padding-top:2px}
  .ask-item b{font-size:14px;color:var(--tx)}
  .ask-item p{margin:5px 0 7px}
  .cmd{display:inline-block;background:#000;color:var(--ac);padding:5px 9px;font:12px ui-monospace,monospace;
       border:1px solid var(--bd);user-select:all}
  .toc{background:var(--sf);border:1px solid var(--bd);padding:13px 15px;margin-bottom:22px;
       display:flex;flex-wrap:wrap;gap:6px;align-items:center}
  .toc b{width:100%;font-size:11px;letter-spacing:.13em;text-transform:uppercase;color:var(--tm);margin-bottom:4px}
  .toc a{font-size:11px;color:var(--tm);border:1px solid rgba(57,189,255,.2);padding:3px 8px;text-decoration:none}
  .toc a:hover{color:var(--ac);border-color:var(--ac)}
  a.top{position:fixed;right:16px;bottom:16px;background:var(--ac);color:#04121a;padding:9px 14px;
        text-decoration:none;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}
  @media(max-width:620px){.wrap{padding:18px 12px 80px}.c header{flex-wrap:wrap}}
</style></head><body><div class="wrap">
<h1>Undeployed work</h1>
<div class="sub">Built on <b>${esc(git('git rev-parse --abbrev-ref HEAD').trim())}</b> &middot;
  last deployed <code>${esc(DEPLOYED)}</code> &middot; generated ${esc(new Date().toLocaleString('en-GB'))}</div>

<div class="kpis">
  <div class="k"><b>${commits.length}</b><span>commits ahead</span></div>
  <div class="k"><b>${totalFiles}</b><span>files touched</span></div>
  <div class="k"><b>${allRoutes.length}</b><span>screens affected</span></div>
  <div class="k"><b>${copied}</b><span>screenshots</span></div>
</div>

<div class="note">
  <h3>Nothing here is live</h3>
  <p>Production is still on <code>${esc(DEPLOYED)}</code>. Every commit below is on the branch only,
     waiting for your yes. The links open your local dev server, not the live site.</p>
  <p>Screens touched: ${allRoutes.map((r) => `<a href="${BASE}${r}" target="_blank" rel="noopener" style="color:var(--ac)">${esc(r)}</a>`).join(' &middot; ')}</p>
</div>

${decisions.length ? `<div class="note ask">
  <h3>Waiting on you &middot; ${decisions.length}</h3>
  ${decisions.map((d) => `<div class="ask-item"><b>${esc(d.title)}</b><p>${esc(d.body)}</p>${
    d.action ? `<code class="cmd">${esc(d.action)}</code>` : ''}</div>`).join('')}
</div>` : ''}

<div class="toc"><b>All ${commits.length} commits</b>
  ${commits.map((c, i) => `<a href="#${c.short}">${String(i + 1).padStart(2, '0')} ${esc(c.subject.split(':')[0])}</a>`).join('')}
</div>

${commits.map(card).join('')}
</div><a class="top" href="#">top</a></body></html>`;

fs.writeFileSync(OUT, html);
fs.writeFileSync(STANDALONE, html);
const mb = (fs.statSync(STANDALONE).size / 1048576).toFixed(1);
console.log(`${commits.length} commits, ${totalFiles} files, ${allRoutes.length} screens, ${copied} screenshots`);
console.log(`OPEN THIS:  ${path.resolve(STANDALONE)}   (${mb} MB, self-contained)`);
console.log(`also at:    ${BASE}/_recap.html  (only if the service worker is not registered)`);
