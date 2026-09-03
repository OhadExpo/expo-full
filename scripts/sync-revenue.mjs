// THE TWICE-DAILY REVENUE SYNC.
//
// Ohad: "make sure it gets updated (the revenue on expo) twice a day forever".
//
// One run = pull both sheets, parse them, upsert into EXPO. It reads the LIVE
// sheets, not the revision history: the 2,605-revision backfill is a one-off
// (harvest-roster-revisions.mjs) and must never run on a schedule. A new
// payment shows up as a new date, the tables have natural unique keys, and so
// every run is idempotent - which is also what makes EXPO accumulate the
// history the roster sheet destroys each time it is edited.
//
// Why the browser: neither the Drive connector nor the mcp-gsheets service
// account can reach these files. The roster is owned by a different account
// and has never been shared with the service account, and the connector has no
// permission scope to grant one. The signed-in debug profile can read both.
// If that profile is ever signed out, this job fails LOUDLY rather than
// writing a partial or empty picture.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROSTER = '18TdfofxAOd1d_EkOjbhYOBjWflqlfkAzY8sI52xJnOc';
const FINANCE = '1MUrTOPMZ3XscIylR_6qdZzYH3IcWK1-f3zgUK8Sqmhw';
const CHROME_PROFILE = 'C:\\Users\\Administrator\\chrome-debug-budget';
const LOG = 'audit-out/sheets/sync.log';

fs.mkdirSync('audit-out/sheets', { recursive: true });
const started = new Date();
const lines = [];
const say = (m) => { const s = `${new Date().toISOString()}  ${m}`; console.log(s); lines.push(s); };

function run(cmd, args, label) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', shell: false });
  const out = (r.stdout || '') + (r.stderr || '');
  for (const l of out.split(/\r?\n/)) if (l.trim() && !/deprecat/i.test(l)) say(`  | ${l}`);
  if (r.status !== 0) { say(`FAILED: ${label} (exit ${r.status})`); finish(1); }
  return out;
}

function finish(code) {
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  lines.push(`${new Date().toISOString()}  ${code ? 'FAILED' : 'OK'} in ${secs}s`);
  // Keep the log bounded; it runs twice a day forever.
  let prev = '';
  try { prev = fs.readFileSync(LOG, 'utf8'); } catch { /* first run */ }
  const all = (prev + lines.join('\n') + '\n\n').split('\n');
  fs.writeFileSync(LOG, all.slice(Math.max(0, all.length - 4000)).join('\n'));
  process.exit(code);
}

async function chromeUp() {
  try {
    const r = await fetch('http://127.0.0.1:9222/json/version', { signal: AbortSignal.timeout(2500) });
    return r.ok;
  } catch { return false; }
}

say('--- revenue sync ---');
if (!(await chromeUp())) {
  // Start the SAME persistent profile the rest of the tooling uses; it is the
  // one that stays signed in. Never kill a Chrome that is already running -
  // this job can fire while Ohad is working.
  say('debug Chrome not answering on 9222, starting it');
  const exe = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
               'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe']
    .find((p) => fs.existsSync(p));
  if (!exe) { say('FAILED: chrome.exe not found'); finish(1); }
  spawn(exe, [`--remote-debugging-port=9222`, `--user-data-dir=${CHROME_PROFILE}`, '--no-first-run',
              '--no-default-browser-check', 'about:blank'], { detached: true, stdio: 'ignore' }).unref();
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    if (await chromeUp()) break;
  }
  if (!(await chromeUp())) { say('FAILED: Chrome did not open a debug port'); finish(1); }
}
say('debug Chrome is up');

run('node', ['scripts/fetch-sheet-xlsx.mjs', ROSTER, 'audit-out/sheets/roster.xlsx'], 'fetch roster');
run('node', ['scripts/fetch-sheet-xlsx.mjs', FINANCE, 'audit-out/sheets/finance.xlsx'], 'fetch finance');
run('python', ['scripts/parse-roster-revisions.py'], 'parse roster');
run('python', ['scripts/parse-finance-sheet.py'], 'parse finance');
run('node', ['scripts/import-revenue.mjs'], 'import');
say('done');
finish(0);
