// HARVEST THE ROSTER'S REVISION HISTORY.
//
// Ohad: "go over the entire history of רשימת מתאמנים available on sheets and
// update all the history for each client for the revenue. i want everything
// available to retrack to be logged in expo."
//
// The sheet holds ONE date per client - "תאריך תשלום אחרון" - and overwrites it
// on every payment, so the cells carry no history at all. The file's own
// revisions do: 2,605 of them, back to 2016. /export?format=xlsx&revision=N
// returns the exact grid as it stood, so the history is recoverable in full.
//
// Downloads run through the signed-in browser. An in-page fetch cannot be used
// (/export 302s to googleusercontent, so CORS blocks reading the body), and a
// tab that navigates and then waits cost ~17s per file, because a download
// navigation never settles and every file paid a timeout. Download EVENTS are
// what make it fast: the tab is told to navigate and never waited on, and the
// completed event says when the file is there.
//
// Parallel tabs were tried and abandoned. setDownloadBehavior is browser-wide
// in practice, so a file could settle in another worker's folder and be filed
// under the wrong revision - a silent correctness bug, and worse than slow.
//
// Downloading is kept separate from parsing on purpose: the schema changed
// several times over five years, so the parser will be rewritten more than
// once and must not cost another 2,605 downloads. Resumable - files already on
// disk are skipped, so an interrupted run continues where it stopped.
import P from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';

const ID = process.env.SHEET_ID || '18TdfofxAOd1d_EkOjbhYOBjWflqlfkAzY8sI52xJnOc';
const MAX = Number(process.env.MAX_REV || 2605);
const STEP = Number(process.argv[2] || 4);
const ONLY = process.argv[3] ? process.argv[3].split(',').map(Number) : null;
const dir = path.resolve('audit-out/sheets/rev');
fs.mkdirSync(dir, { recursive: true });

const want = ONLY || (() => {
  const a = [];
  for (let r = 1; r <= MAX; r += STEP) a.push(r);
  if (a[a.length - 1] !== MAX) a.push(MAX);
  return a;
})();
const todo = want.filter((r) => !fs.existsSync(path.join(dir, `r${r}.xlsx`)));
console.log(`${want.length} revisions wanted, ${want.length - todo.length} already on disk, ${todo.length} to fetch`);
if (!todo.length) process.exit(0);

const b = await P.connect({ browserURL: (process.env.CDP || 'http://127.0.0.1:9222'), defaultViewport: null, protocolTimeout: 300000 });

const pg = await b.newPage();
await pg.goto(`https://docs.google.com/spreadsheets/d/${ID}/edit`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
if (!/Google Sheets/.test(await pg.title())) { console.log('sheet not reachable: ' + (await pg.title())); process.exit(1); }

// Browser.* events are emitted on the BROWSER target, not on a page session,
// so the download listener has to be attached there or nothing ever arrives.
// The guid ties each finished file to the request that asked for it.
const bcdp = await b.target().createCDPSession();
await bcdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dir, eventsEnabled: true });
let waiting = null;
const pending = new Map();
// A revision number that does not exist returns an HTML error page, which
// NAVIGATES instead of downloading. Waiting the full completion timeout on
// those cost 20s each and, since roughly a third of the numbers in the range
// are not real revisions, made the whole pass ~10s per file. began() resolves
// as soon as a download starts, so a miss now costs 3s instead of 20.
bcdp.on('Browser.downloadProgress', (e) => {
  const w = pending.get(e.guid);
  if (!w) return;
  if (e.state === 'completed') { pending.delete(e.guid); w.resolve(w.file); }
  else if (e.state === 'canceled') { pending.delete(e.guid); w.resolve(null); }
});
bcdp.on('Browser.downloadWillBegin', (e) => {
  // The file lands under its SUGGESTED filename, not the guid - every
  // revision arrives as the same "רשימת מתאמנים.xlsx" - so the name has to be
  // captured here and the file renamed the moment it completes.
  if (waiting) { waiting.file = e.suggestedFilename; pending.set(e.guid, waiting); waiting.began(true); waiting = null; }
});
let ok = 0, miss = 0, done = 0;
const t0 = Date.now();
for (const rev of todo) {
  const w = {};
  const p = new Promise((resolve) => { w.resolve = resolve; });
  const began = new Promise((resolve) => { w.began = resolve; });
  waiting = w;
  // The navigation always rejects with ERR_ABORTED - it is a download, not a
  // page - so it is fired and never awaited; the completed event is the signal.
  pg.goto(`https://docs.google.com/spreadsheets/d/${ID}/export?format=xlsx&id=${ID}&revision=${rev}`).catch(() => {});
  // 3s here was WRONG and it biased the sample. Google throttles sustained
  // exports to ~10s per file, so a slow-but-valid revision never began within
  // 3s and was recorded as "does not exist" - which is why an every-10th pass
  // returned only 64 of 244 and left 50-revision holes (~38 days, longer than
  // a payment date survives) exactly in the years that have client data.
  // A real miss is an HTML error page and returns fast anyway.
  const started = await Promise.race([began, new Promise((r) => setTimeout(() => r(false), 12000))]);
  const name = started
    ? await Promise.race([p, new Promise((r) => setTimeout(() => r(undefined), 20000))])
    : undefined;
  waiting = null;
  let filed = false;
  if (name) {
    const src = path.join(dir, name);
    if (fs.existsSync(src) && fs.readFileSync(src).subarray(0, 2).toString('latin1') === 'PK') {
      fs.renameSync(src, path.join(dir, `r${rev}.xlsx`));
      filed = true;
    } else if (fs.existsSync(src)) fs.rmSync(src);
  }
  if (filed) ok++; else miss++;
  done++;
  if (done % 50 === 0) {
    const per = (Date.now() - t0) / done / 1000;
    console.log(`  ${done}/${todo.length}  ${per.toFixed(2)}s each  ~${Math.round(per * (todo.length - done) / 60)}min left`);
  }
}
console.log(`done: ${ok} fetched, ${miss} unavailable`);
await pg.close();
b.disconnect();
