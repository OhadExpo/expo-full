// One OWED refresh: roster sheet -> audit-out/sheets/roster.xlsx -> revenue_owed.
// The daemon runs this every 20 minutes (Ohad 28.9, #386: "this should be synced
// automatically all the time").
//
// FAILS SOFT (Ohad 28.9, #389: "even when the internet stops ... keep working when
// the internet is back"): no network, no Chrome, a sheet that will not load - each
// is one logged line and exit 0, and the next cycle simply tries again. The table
// keeps the last good sync, and the card shows its age.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROSTER = '18TdfofxAOd1d_EkOjbhYOBjWflqlfkAzY8sI52xJnOc';
const say = (m) => console.log(m);
const want = (process.env.EXPO_DAEMON_HOST || '').trim().toUpperCase();
if (process.env.EXPO_ALLOW_ANY_HOST !== '1' && (!want || os.hostname().toUpperCase() !== want)) { say(`owed: not this host`); process.exit(0); }

const chromeUp = async () => { try { return (await fetch('http://127.0.0.1:9222/json/version', { signal: AbortSignal.timeout(2500) })).ok; } catch { return false; } };
const run = (args) => new Promise((res) => {
  let out = '';
  const p = spawn(process.execPath, args, { cwd: REPO, windowsHide: true });
  p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', (d) => { out += d; });
  const t = setTimeout(() => { try { p.kill(); } catch { /* gone */ } }, 4 * 60 * 1000);
  p.on('exit', (code) => { clearTimeout(t); res({ code, out: out.trim().replace(/\s+/g, ' ') }); });
});

// No internet: nothing to do this cycle.
try { await fetch('https://docs.google.com/', { method: 'HEAD', signal: AbortSignal.timeout(8000) }); }
catch { say('owed: offline - skipped, next cycle retries'); process.exit(0); }

if (!(await chromeUp())) {
  // The same persistent, signed-in profile the rest of the tooling uses. Never
  // kills a running Chrome.
  const exe = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'].find((p) => fs.existsSync(p));
  if (exe) spawn(exe, ['--remote-debugging-port=9222', `--user-data-dir=${path.join(os.homedir(), 'chrome-debug-budget')}`, '--no-first-run', '--no-default-browser-check', 'about:blank'], { detached: true, stdio: 'ignore' }).unref();
  for (let i = 0; i < 20 && !(await chromeUp()); i++) await new Promise((r) => setTimeout(r, 1000));
  if (!(await chromeUp())) { say('owed: debug Chrome not reachable - skipped, next cycle retries'); process.exit(0); }
}

const f = await run(['scripts/fetch-sheet-xlsx.mjs', ROSTER, 'audit-out/sheets/roster.xlsx']);
if (f.code !== 0) { say(`owed: sheet fetch failed (${f.out.slice(0, 200)}) - next cycle retries`); process.exit(0); }
const s = await run(['scripts/sync-owed.mjs']);
say(s.code === 0 ? `owed: ${s.out.slice(0, 240)}` : `owed: write failed (${s.out.slice(0, 240)}) - next cycle retries`);
process.exit(0);
