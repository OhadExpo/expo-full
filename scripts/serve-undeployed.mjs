// WHAT IS UNDEPLOYED, COMPUTED ON EVERY REQUEST.
//
// Ohad, 19.9: "where's my local chrome host with what's undeployed yet that
// should always be updated?"
//
// The old page was a hand-edited HTML file served by python http.server. It was
// accurate at the moment I wrote it and stale the moment I committed anything -
// which is exactly the thing he is objecting to. This asks git at request time,
// so a refresh is always the truth and nobody has to remember to regenerate it.
//
//   node scripts/serve-undeployed.mjs [port]      # default 8920
//
// Reads only. It never writes, never pushes, never checks anything out.
import http from 'node:http';
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const PORT = Number(process.argv[2] || 8920);
const REPO = process.cwd();
const NOTES = 'C:/Users/Administrator/expo-private-backups/queue';

const git = (a) => { try { return execSync('git ' + a, { cwd: REPO, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim(); } catch { return ''; } };
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// The three athlete view files the deploy holds at production, plus App.jsx.
const HELD = ['src/ClientPortal.jsx', 'src/MealLogger.jsx', 'src/TrySandbox.jsx'];

function collect() {
  git('fetch origin --quiet');
  const prod = git('rev-parse --short origin/master');
  const branch = git('rev-parse --short bhbc-hebrew');
  const cand = git('rev-parse --short deploy-0919');
  const ahead = Number(git('rev-list --count origin/master..bhbc-hebrew') || 0);
  const candAhead = Number(git('rev-list --count origin/master..deploy-0919') || 0);

  // What the candidate holds back from the branch — this is "what is left AFTER
  // the deploy", and it must be exactly the athlete portal.
  const heldFiles = git('diff --name-only bhbc-hebrew deploy-0919 -- src/').split('\n').filter(Boolean);
  const heldIdentical = HELD.filter((f) => !git(`diff --cached origin/master deploy-0919 -- ${f}`) && !git(`diff origin/master deploy-0919 -- ${f}`));
  const langWraps = (git('show deploy-0919:src/App.jsx').match(/if \(isClient\) return \(<LangCtx\.Provider/g) || []).length;

  // Every undeployed commit, newest first.
  const log = git('log --format=%h\x1f%s\x1f%ad --date=format:%d.%m %H:%M origin/master..bhbc-hebrew')
    .split('\n').filter(Boolean).map((l) => { const [h, s, d] = l.split('\x1f'); return { h, s, d }; });

  // Which files the deploy would change in production, grouped by area.
  const files = git('diff --name-only origin/master deploy-0919').split('\n').filter(Boolean);
  const area = (f) => (f.startsWith('expo-il/') ? 'marketing' : f.startsWith('src/') ? 'app' : f.startsWith('scripts/') ? 'scripts' : f.startsWith('docs/') ? 'docs' : 'other');
  const byArea = {};
  for (const f of files) (byArea[area(f)] ||= []).push(f);

  const notes = fs.existsSync(NOTES) ? fs.readdirSync(NOTES).filter((f) => f.endsWith('.md')).sort() : [];
  return { prod, branch, cand, ahead, candAhead, heldFiles, heldIdentical, langWraps, log, byArea, notes, at: new Date().toLocaleString('en-GB') };
}

const page = (d) => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="60">
<title>Undeployed — EXPO</title><style>
:root{--bg:#0a0a0b;--sf:#121316;--bd:#23262d;--tx:#f0f0f4;--tm:#9a9aa8;--td:#6b6b78;--ac:#39BDFF;--ok:#37B27C;--warn:#E0A73A;--bad:#DE4E3B}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--tx);font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;padding:0 16px 70px}
main{max-width:860px;margin:0 auto}header{padding:26px 0 12px}
h1{font-size:22px;margin:0 0 4px}h1 span{color:var(--ac)}
.sub{color:var(--tm);font-size:13px}
h2{font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--tm);margin:26px 0 10px;font-weight:700}
.row{background:var(--sf);border:1px solid var(--bd);border-left:3px solid var(--ac);padding:13px 15px;margin-bottom:10px}
.row.ok{border-left-color:var(--ok)}.row.warn{border-left-color:var(--warn)}
.row b{display:block;font-size:15px;margin-bottom:5px}
.row p{margin:5px 0;font-size:14px;color:var(--tm)}
pre{background:#0d0e11;border:1px solid var(--bd);padding:9px 11px;overflow-x:auto;font-size:12.5px;color:var(--ac);margin:8px 0 2px}
code{color:var(--ac);font-size:13px}
table{width:100%;border-collapse:collapse;font-size:13px;margin-top:8px}
th{text-align:start;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--td);font-weight:700;padding:6px 8px;border-bottom:1px solid var(--bd)}
td{padding:6px 8px;border-bottom:1px solid var(--bd);color:var(--tm);vertical-align:top}
td.n{color:var(--tx);font-variant-numeric:tabular-nums;white-space:nowrap}
.muted{color:var(--td);font-size:12.5px}.ok{color:var(--ok)}.bad{color:var(--bad)}
.cl{columns:2;column-gap:24px;font-size:12.5px;color:var(--tm)}
@media(max-width:700px){.cl{columns:1}}
.cl div{break-inside:avoid;padding:2px 0}.cl code{font-size:11.5px}
a{color:var(--ac)}
</style></head><body><main>
<header><h1>Un<span>deployed</span></h1>
<div class="sub">computed live from git · ${esc(d.at)} · refreshes itself every 60s</div>
<div class="sub" style="margin-top:8px">
  <a href="http://127.0.0.1:8921/">decisions waiting for you →</a> ·
  <a href="http://127.0.0.1:4182/">what the deploy leaves behind →</a>
</div></header>

<div class="row ${d.ahead ? 'warn' : 'ok'}">
  <b>${d.ahead} commit${d.ahead === 1 ? '' : 's'} are not live</b>
  <table>
    <tr><td>production</td><td class="n"><code>${esc(d.prod)}</code></td></tr>
    <tr><td>branch <span class="muted">bhbc-hebrew</span></td><td class="n"><code>${esc(d.branch)}</code> · ${d.ahead} ahead</td></tr>
    <tr><td>candidate <span class="muted">deploy-0919</span></td><td class="n"><code>${esc(d.cand)}</code> · ${d.candAhead} ahead</td></tr>
  </table>
  <pre>! cd /c/Users/Administrator/Desktop/expo-full &amp;&amp; git push origin deploy-0919:master</pre>
  <p class="muted">rollback <code>git push --force-with-lease origin ${esc(d.prod)}:master</code></p>
</div>

<div class="row ${d.heldFiles.length === 4 && d.langWraps === 0 ? 'ok' : 'warn'}">
  <b>The athlete portal is held ${d.heldFiles.length === 4 && d.langWraps === 0 ? '— proven' : '— CHECK THIS'}</b>
  <table>
    <tr><td>files the candidate holds back</td><td class="n">${d.heldFiles.length} ${d.heldFiles.length === 4 ? '<span class="ok">(4 = right)</span>' : '<span class="bad">(should be 4)</span>'}</td></tr>
    <tr><td>views byte-identical to production</td><td class="n">${d.heldIdentical.length} / 3 ${d.heldIdentical.length === 3 ? '<span class="ok">✓</span>' : '<span class="bad">✗</span>'}</td></tr>
    <tr><td>language-provider wraps on the athlete tree</td><td class="n">${d.langWraps} ${d.langWraps === 0 ? '<span class="ok">✓ held</span>' : '<span class="bad">✗ would ship</span>'}</td></tr>
  </table>
  <p class="muted">${d.heldFiles.map((f) => `<code>${esc(f)}</code>`).join(' · ')}</p>
  <p><a href="http://127.0.0.1:4182/">See what the deploy leaves behind →</a> <span class="muted">(production beside the branch, athlete seat, phone width)</span></p>
</div>

<h2>What the deploy would change in production</h2>
${Object.entries(d.byArea).map(([a, fs2]) => `<div class="row"><b>${esc(a)} — ${fs2.length} file${fs2.length === 1 ? '' : 's'}</b><div class="cl">${fs2.map((f) => `<div><code>${esc(f)}</code></div>`).join('')}</div></div>`).join('')}

<h2>Every undeployed commit, newest first</h2>
<div class="row"><div class="cl">
${d.log.map((c) => `<div><code>${esc(c.h)}</code> <span class="muted">${esc(c.d)}</span> ${esc(c.s)}</div>`).join('')}
</div></div>

<h2>Notes waiting for you</h2>
<div class="row"><div class="cl">${d.notes.map((n) => `<div><code>${esc(n)}</code></div>`).join('')}</div>
<p class="muted">in <code>expo-private-backups/queue/</code></p></div>

</main></body></html>`;

http.createServer((req, res) => {
  if (req.url === '/favicon.ico') { res.writeHead(204); return res.end(); }
  let body;
  try { body = page(collect()); } catch (e) { body = `<pre>${esc(e.stack || e.message)}</pre>`; }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}).listen(PORT, '127.0.0.1', () => console.log(`undeployed → http://127.0.0.1:${PORT}/  (live, recomputed every request)`));
