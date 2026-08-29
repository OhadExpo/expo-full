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
    const t0 = Date.now();
    let out = '';
    try {
      const r = await run('node', ['scripts/shot-harness-run.mjs', clip, PORT], { timeout: 900000, maxBuffer: 1 << 28 });
      out = r.stdout + r.stderr;
    } catch (e) {
      out = String((e.stdout || '') + (e.stderr || '') + (e.message || ''));
    }
    const secs = Math.round((Date.now() - t0) / 1000);
    const m = out.match(/analyzed (\d+)/);
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
  const uniq = [...new Set(counts.filter((c) => c != null))];
  const stable = uniq.length <= 1;
  const avg = Math.round(rs.reduce((a, r) => a + (r.secs || 0), 0) / rs.length);
  console.log(`${clip.padEnd(34)} counts=[${counts.join(',')}] ${rs.length > 1 ? (stable ? 'STABLE' : 'UNSTABLE') : ''} avg ${avg}s`);
}
