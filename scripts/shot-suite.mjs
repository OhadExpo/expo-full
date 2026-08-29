// shot-suite.mjs — run the shot engine over a SET of clips and report a table.
//
// Two things this exists for:
//   1. The detector has only ever been measured on one clip. One clip cannot
//      tell you whether a threshold is right or merely fitted to that footage.
//   2. The count has to be STABLE. Ohad saw 11, then 10, then 9 on the same
//      video; a number that changes when you press the button twice is worse
//      than no number.
//
// Chrome dies partway through a batch - each clip is thousands of MediaPipe
// inferences in one tab - so this restarts it between clips rather than
// pretending a shared browser survives the run.
//
//   node scripts/shot-suite.mjs <port> <clip> [clip...]        one pass each
//   node scripts/shot-suite.mjs <port> --repeat 3 <clip>       stability check
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';

const run = promisify(execFile);
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PROFILE = 'C:\\Users\\Administrator\\chrome-debug-budget';

const argv = process.argv.slice(2);
const PORT = argv.shift() || '5192';
let repeat = 1;
const ri = argv.indexOf('--repeat');
if (ri >= 0) { repeat = Number(argv[ri + 1]) || 1; argv.splice(ri, 2); }
const clips = argv;
if (!clips.length) { console.log('usage: node scripts/shot-suite.mjs <port> [--repeat n] <clip...>'); process.exit(2); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function chromeUp() {
  try {
    const r = await fetch('http://127.0.0.1:9222/json/version', { signal: AbortSignal.timeout(2500) });
    return r.ok;
  } catch { return false; }
}

async function killChrome() {
  try { await run('taskkill', ['/F', '/IM', 'chrome.exe'], { timeout: 20000 }); } catch { /* none running */ }
  await sleep(1500);
}

async function ensureChrome({ fresh = false } = {}) {
  if (fresh) await killChrome();
  else if (await chromeUp()) return true;
  spawn(CHROME, [
    '--remote-debugging-port=9222',
    `--user-data-dir=${PROFILE}`,
    '--no-first-run', '--no-default-browser-check',
    '--proxy-bypass-list=<-loopback>',
    'about:blank',
  ], { detached: true, stdio: 'ignore' }).unref();
  for (let i = 0; i < 20; i++) { await sleep(1000); if (await chromeUp()) return true; }
  return false;
}

const rows = [];
for (const clip of clips) {
  for (let k = 0; k < repeat; k++) {
    // A fresh browser per clip: a tab that has already chewed through several
    // thousand pose inferences is where the CDP connection drops.
    const ok = await ensureChrome({ fresh: true });
    if (!ok) { rows.push({ clip, pass: k + 1, shots: null, secs: null, note: 'chrome would not start' }); continue; }
    // Prime the file before timing anything. A hard-killed Chrome comes back
    // with a cold cache and the first read of a 40 MB clip blew the harness's
    // 45 s metadata timeout twice in three passes - a measurement artefact that
    // looks exactly like the engine failing. Pulling the bytes once puts every
    // pass on the same footing, and it is also the honest model of the product,
    // where the coach's clip is already on his device.
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}${clip}`, { signal: AbortSignal.timeout(120000) });
      const b = await r.arrayBuffer();
      process.stdout.write(`  primed ${(b.byteLength / 1e6).toFixed(1)} MB\n`);
    } catch (e) {
      process.stdout.write(`  prime failed: ${String(e.message || e).slice(0, 60)}\n`);
    }

    const t0 = Date.now();
    let out = '';
    try {
      const r = await run('node', ['scripts/shot-harness-run.mjs', clip, PORT], { timeout: 900000, maxBuffer: 1 << 28 });
      out = r.stdout + r.stderr;
    } catch (e) {
      out = String((e.stdout || '') + (e.stderr || '') + (e.message || ''));
    }
    const secs = Math.round((Date.now() - t0) / 1000);
    // Keep the whole transcript. A pass that disagrees with its neighbours is
    // the only interesting pass, and without its frame counts and drop stats
    // there is nothing to diagnose it with afterwards - which is how a 17/17/10
    // result turned into guesswork.
    try {
      const tag = `${clip.replace(/[^a-z0-9]+/gi, '_')}_p${k + 1}`;
      fs.mkdirSync('audit-out/passes', { recursive: true });
      fs.writeFileSync(`audit-out/passes/${tag}.txt`, out);
    } catch { /* diagnostics are best-effort */ }
    const m = out.match(/analyzed (\d+)/);
    const frames = out.match(/"frameCount":(\d+)/);
    const skipped = out.match(/"skipped":\s*(\d+)/);
    if (frames || skipped) {
      process.stdout.write(`  frames=${frames ? frames[1] : '?'} skipped=${skipped ? skipped[1] : '?'}\n`);
    }
    const fail = out.match(/FAILED: ([^\n]{0,90})/);
    rows.push({ clip, pass: k + 1, shots: m ? Number(m[1]) : null, secs, note: m ? '' : (fail ? fail[1] : 'no result') });
    console.log(`${clip}  pass ${k + 1}  shots=${m ? m[1] : '-'}  ${secs}s  ${m ? '' : rows[rows.length - 1].note}`);
  }
}

console.log('\n--- summary ---');
const byClip = new Map();
for (const r of rows) {
  if (!byClip.has(r.clip)) byClip.set(r.clip, []);
  byClip.get(r.clip).push(r);
}
for (const [clip, rs] of byClip) {
  const counts = rs.map((r) => r.shots);
  // A pass that FAILED is not evidence of stability. Filtering nulls out
  // reported [7,null,null] as STABLE, which is exactly the kind of green light
  // that hides the bug being measured.
  const uniq = [...new Set(counts)];
  const stable = uniq.length === 1 && uniq[0] != null;
  const failed = counts.filter((c) => c == null).length;
  const avg = Math.round(rs.reduce((a, r) => a + (r.secs || 0), 0) / rs.length);
  const verdict = rs.length > 1 ? (stable ? 'STABLE' : 'UNSTABLE') : '';
  console.log(`${clip.padEnd(34)} counts=[${counts.map((c) => (c == null ? 'FAIL' : c)).join(',')}] ${verdict}${failed ? ` (${failed} failed)` : ''} avg ${avg}s`);
}
