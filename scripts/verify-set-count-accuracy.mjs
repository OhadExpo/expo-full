// verify-set-count-accuracy.mjs - is ANALYSE MY SET's rep number right on REAL
// clips? (#552). Runs the athlete's own pipeline (set-harness.html: the clip's
// length -> setFrameBudget -> captureClipFrames 'lite' -> analyzeClip ->
// summarize, exactly what the portal button calls) on a private set of real
// set clips that were HAND-COUNTED, and compares the number the athlete would
// see with the true count.
//
// BLANK > WRONG. The gate FAILS when any clip shows a number that is not the
// true count - or the true count made of the wrong reps (setup / re-rack
// counted, real reps missed; see verdict()). A blank (no number, the athlete is
// told what to film) is allowed. Ambiguous clips (labels.json ambiguous:true -
// not countable by eye) run but are not scored.
//
// The clips are athletes' own videos, so they never live in the repo (it is
// public): they sit in a private folder with labels.json beside them
//   SET_CLIPS   default %USERPROFILE%/expo-private-backups/set-clips
// No folder or no scorable label = "nothing measured" and exit 1 - this gate
// never passes on nothing.
//
// Live (default): needs a Vite server for the harness and a Chrome to run it in
//   BASE  default http://127.0.0.1:5390   (npx vite --host 127.0.0.1 --port 5390)
//   CDP   default http://127.0.0.1:9447   (chrome --headless=new --remote-debugging-port=9447)
//   RUNS=2  runs per clip (the capture is not bit-repeatable; every run is scored)
//   ONLY=c05.mp4,c16.mp4   a subset
//   SAVE_FRAMES=<dir>      keep each run's captured pose stream (private: stays outside the repo)
// Offline: OFFLINE=<dir of saved captures> re-scores them in Node with the
// current src/ - the same counting code, minutes faster; for iterating a fix.
// Saved landmarks are rounded (5 decimals; 3 in the first captures), which can
// move a borderline rep, so only a LIVE run is the measurement.
//   node scripts/verify-set-count-accuracy.mjs
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { analyzeClip } from '../src/poseLab.js';
import * as SA from '../src/setAnalysis.js';
const { summarize, isUsable } = SA;

const DIR = process.env.SET_CLIPS || (process.env.USERPROFILE || process.env.HOME || '') + '/expo-private-backups/set-clips';   // no username in the public repo
const BASE = process.env.BASE || 'http://127.0.0.1:5390';
const CDP = process.env.CDP || 'http://127.0.0.1:9447';
const RUNS = Math.max(1, parseInt(process.env.RUNS || '1', 10));
const OFFLINE = process.env.OFFLINE || '';
const SAVE = process.env.SAVE_FRAMES || '';
const ONLY = (process.env.ONLY || '').split(',').map((s) => s.trim()).filter(Boolean);
const HARNESS_BUILD = 'set-3';
// QUALITY=full|heavy measures a bigger pose model on the same clips (the athlete's pipeline is lite)
const QUALITY = ['full', 'heavy'].includes(process.env.QUALITY) ? process.env.QUALITY : 'lite';

const nothing = (why) => { console.log(`verify-set-count-accuracy: NOTHING MEASURED - ${why}`); process.exit(1); };

const labelsPath = path.join(DIR, 'labels.json');
if (!fs.existsSync(labelsPath)) nothing(`no labels at ${labelsPath} (the private clip folder is missing)`);
let labels;
try { labels = JSON.parse(fs.readFileSync(labelsPath, 'utf8')).clips || []; } catch (e) { nothing(`labels.json unreadable: ${e.message}`); }
labels = labels.filter((c) => !ONLY.length || ONLY.includes(c.file));
const present = labels.filter((c) => fs.existsSync(path.join(DIR, c.file)));
const scorable = present.filter((c) => !c.ambiguous && Number.isInteger(c.reps) && c.reps > 0);
if (!scorable.length) nothing(`${labels.length} labels, ${present.length} clips on disk, 0 scorable (hand-counted, not ambiguous)`);

// unpack a saved capture ({t, l, w} with [x,y,z,vis] rows) back into poseLab frames
const unpackPts = (rows) => (rows ? rows.map((r) => ({ x: r[0], y: r[1], z: r[2], visibility: r[3] })) : null);
const unpack = (o) => { const fr = o.frames.map((f) => ({ t: f.t, landmarks: unpackPts(f.l), worldLandmarks: unpackPts(f.w) })); if (o.dims) fr.dims = o.dims; return fr; };

// A right NUMBER is only right when the reps it counted are the set's reps:
// every counted rep must sit within 2 s of the hand-noted first..last rep
// (labels.json repT). The right total made of setup/re-rack motion is a wrong
// read that happened to land on the number.
function verdict(truth, read, countedT, repT) {
  const shown = isUsable(read) ? read.reps : null;
  if (shown == null) return { shown: null, kind: 'blank', text: `no count (${read ? read.reason || read.quality : 'null'}${read && read.snr != null ? `, range/jitter ${read.snr}` : ''})` };
  const d = shown - truth;
  if (d === 0) {
    if (Array.isArray(countedT) && Array.isArray(repT) && repT.length) {
      const lo = repT[0] * 1000 - 2000, hi = repT[repT.length - 1] * 1000 + 2000;
      const off = countedT.filter((t) => t < lo || t > hi);
      if (off.length) return { shown, kind: 'wrong', d: 0, text: `WRONG reps (right total, ${off.length} counted outside the set: ${off.map((t) => (t / 1000).toFixed(1)).join(',')}s)` };
    }
    return { shown, kind: 'exact', text: Array.isArray(countedT) ? 'exact' : 'exact (count only)' };
  }
  return { shown, kind: 'wrong', d, text: `WRONG ${d > 0 ? '+' : ''}${d}` };
}

// ---- runs -------------------------------------------------------------------
const results = [];   // {clip, runs: [{shown, kind, text, read, raw}]}
let browser = null, page = null, server = null;

async function liveSetup() {
  const { default: puppeteer } = await import('puppeteer-core');
  // the clips are served from the private folder by this process, CORS on, with
  // byte ranges (the capture seeks), on a port the OS picks
  const TYPES = { '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.m4v': 'video/mp4' };
  server = http.createServer((req, res) => {
    const name = decodeURIComponent((req.url || '/').split('?')[0].slice(1));
    const file = path.join(DIR, path.basename(name));
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Accept-Ranges', 'bytes');
    if (!name || !fs.existsSync(file)) { res.statusCode = 404; res.end(); return; }
    const size = fs.statSync(file).size;
    res.setHeader('Content-Type', TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream');
    const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
    if (m) {
      const a = m[1] ? parseInt(m[1], 10) : 0, b = m[2] ? Math.min(size - 1, parseInt(m[2], 10)) : size - 1;
      res.statusCode = 206; res.setHeader('Content-Range', `bytes ${a}-${b}/${size}`); res.setHeader('Content-Length', b - a + 1);
      fs.createReadStream(file, { start: a, end: b }).pipe(res);
    } else { res.setHeader('Content-Length', size); fs.createReadStream(file).pipe(res); }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try { browser = await puppeteer.connect({ browserURL: CDP, defaultViewport: { width: 800, height: 600 }, protocolTimeout: 3_600_000 }); }
  catch (e) { nothing(`no Chrome at ${CDP} (${e.message})`); }
  page = await browser.newPage();
  try { await page.goto(`${BASE}/set-harness.html`, { waitUntil: 'domcontentloaded', timeout: 30000 }); await page.waitForFunction('window.__ready === true', { timeout: 60000 }); }
  catch (e) { await page.close().catch(() => {}); browser.disconnect(); nothing(`harness not reachable at ${BASE}/set-harness.html (${e.message})`); }
  return `http://127.0.0.1:${server.address().port}`;
}

const clipOrigin = OFFLINE ? null : await liveSetup();
const t0 = Date.now();
for (const c of present) {
  const runs = [];
  for (let k = 1; k <= RUNS; k++) {
    let read = null, raw = null, ms = null, frames = null, countedT;
    if (OFFLINE) {
      const f = path.join(OFFLINE, `${c.file}-run${k}.json`);
      if (!fs.existsSync(f)) { runs.push({ missing: true }); continue; }
      const o = JSON.parse(fs.readFileSync(f, 'utf8'));
      const fr = unpack(o);
      const result = analyzeClip(fr, c.title || '');
      read = summarize(result, { title: c.title || null, model: 'lite' });
      if (typeof SA.readSet === 'function') { const rs = SA.readSet(result); countedT = rs && rs.reps ? rs.reps.map((e) => e.t) : null; }
      raw = result && result.ok !== false ? { repCount: result.repCount, jointRepCount: result.jointRepCount, countMethod: result.countMethod, grade: result.captureQuality && result.captureQuality.grade, bottomsT: (result.reps || []).map((r) => Math.round(fr[r.bottomIdx].t)), rejected: result.rejectedReps } : result;
      frames = fr.length;
    } else {
      const r = await page.evaluate((u, title, keep, q) => window.runSet(u, title, { keepFrames: keep, quality: q }), `${clipOrigin}/${encodeURIComponent(c.file)}`, c.title || '', !!SAVE, QUALITY);
      if (!r || r.harnessBuild !== HARNESS_BUILD) { console.log(`harness build mismatch (got ${r && r.harnessBuild}, want ${HARNESS_BUILD}) - a stale page would test old code`); process.exit(1); }
      read = r.read; raw = r.raw; ms = r.ms; frames = r.frameCount; countedT = r.countedT;
      if (SAVE) { fs.mkdirSync(SAVE, { recursive: true }); fs.writeFileSync(path.join(SAVE, `${c.file}-run${k}.json`), JSON.stringify({ file: c.file, title: c.title, secs: r.secs, maxFrames: r.maxFrames, dims: r.dims, frames: r.frames })); }
    }
    const v = c.ambiguous ? { shown: isUsable(read) ? read.reps : null, kind: 'unscored', text: 'ambiguous - not scored' } : verdict(c.reps, read, countedT, c.repT);
    runs.push({ ...v, read, raw, ms, frames });
    process.stdout.write(`  ${c.file.padEnd(9)} run ${k}: true ${c.ambiguous ? '?' : c.reps}  shown ${v.shown == null ? '-' : v.shown}  ${v.text}${raw && raw.repCount != null ? `   [raw ${raw.repCount} via ${raw.countMethod}, ${raw.grade}, ${frames} fr${ms ? `, ${Math.round(ms / 1000)}s` : ''}]` : ''}\n`);
  }
  results.push({ c, runs });
}
if (page) await page.close().catch(() => {});
if (browser) browser.disconnect();
if (server) server.close();

// ---- table + summary ---------------------------------------------------------
console.log('');
const hdr = ['clip', 'movement', 'true', ...Array.from({ length: RUNS }, (_, i) => `run${i + 1}`), 'verdict'];
const rows = results.map(({ c, runs }) => {
  const kinds = runs.filter((r) => !r.missing).map((r) => r.kind);
  const vtxt = c.ambiguous ? 'not scored (ambiguous)'
    : kinds.includes('wrong') ? runs.filter((r) => r.kind === 'wrong').map((r) => r.text).join(' / ')
      : kinds.length && kinds.every((k) => k === 'exact') ? 'exact'
        : kinds.length && kinds.every((k) => k === 'blank') ? 'no count'
          : kinds.length ? 'exact / no count' : 'no capture';
  return [c.file, c.movement, c.ambiguous ? '?' : String(c.reps), ...runs.map((r) => (r.missing ? 'n/a' : r.shown == null ? '-' : String(r.shown))), vtxt];
});
const w = hdr.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i] ?? '').length)));
console.log(hdr.map((h, i) => h.padEnd(w[i])).join('  '));
for (const r of rows) console.log(r.map((x, i) => String(x ?? '').padEnd(w[i])).join('  '));

const scored = results.filter(({ c }) => !c.ambiguous).flatMap(({ runs }) => runs.filter((r) => !r.missing));
const n = scored.length;
const exact = scored.filter((r) => r.kind === 'exact').length;
const within1 = scored.filter((r) => r.kind === 'exact' || (r.kind === 'wrong' && Math.abs(r.d) === 1)).length;
const wrong = scored.filter((r) => r.kind === 'wrong').length;
const blank = scored.filter((r) => r.kind === 'blank').length;
console.log('');
console.log(`scored runs ${n} (${scorable.length} clips x ${RUNS}${OFFLINE ? ', OFFLINE re-score of saved captures' : `, model ${QUALITY}`}): exact ${exact}, within 1 ${within1}, WRONG NUMBER SHOWN ${wrong}, blank ${blank}   (${Math.round((Date.now() - t0) / 1000)}s)`);
if (!n) nothing('no run produced a read');
if (wrong) { console.log(`verify-set-count-accuracy: FAIL - ${wrong} run(s) showed the athlete a wrong rep count`); process.exit(1); }
console.log(`verify-set-count-accuracy: PASS - no wrong number shown (${exact}/${n} exact, ${blank} blank)`);
