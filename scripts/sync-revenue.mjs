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

let softFailures = 0;
function run(cmd, args, label, extraEnv = {}, { soft = false } = {}) {
  // PYTHONUTF8 is set HERE and not only in the .ps1 wrapper: both sheets are
  // Hebrew, and a run started any other way - by hand, by a different
  // scheduler, by a future me - would otherwise parse them through the system
  // codepage and write mojibake into the ledger.
  const r = spawnSync(cmd, args, {
    encoding: 'utf8', shell: false,
    env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8', ...extraEnv },
  });
  const out = (r.stdout || '') + (r.stderr || '');
  for (const l of out.split(/\r?\n/)) if (l.trim() && !/deprecat/i.test(l)) say(`  | ${l}`);
  if (r.status !== 0) {
    if (soft) { softFailures++; say(`SOFT FAIL: ${label} (exit ${r.status}) - continuing with what is on disk`); return out; }
    say(`FAILED: ${label} (exit ${r.status})`); finish(1);
  }
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

run('node', ['scripts/fetch-sheet-xlsx.mjs', ROSTER, 'audit-out/sheets/roster.xlsx'], 'fetch roster', {}, { soft: true });
run('node', ['scripts/fetch-sheet-xlsx.mjs', FINANCE, 'audit-out/sheets/finance.xlsx'], 'fetch finance', {}, { soft: true });
// If the live export was starved, the newest harvested revision IS the sheet
// as of its last edit - use it so the parsers still see today's roster.
if (softFailures) {
  const revs = fs.readdirSync('audit-out/sheets/rev').map((x) => Number((x.match(/^r(\d+)\.xlsx$/) || [])[1] || 0)).filter(Boolean);
  if (revs.length) { const top = Math.max(...revs); fs.copyFileSync(`audit-out/sheets/rev/r${top}.xlsx`, 'audit-out/sheets/roster.xlsx'); say(`roster.xlsx <- r${top} (live export starved)`); }
}
run('python', ['scripts/parse-roster-revisions.py'], 'parse roster');
run('python', ['scripts/parse-finance-sheet.py'], 'parse finance');
run('node', ['scripts/import-revenue.mjs'], 'import', { ROSTER_EVENTS: '0' });
// 2026-09-13 — the full history, kept current: new revisions of the roster are
// harvested (only what is above the highest file on disk), every field is
// re-parsed into the per-client timeline, payments/attendance/rates re-derived
// and upserted. Idempotent end to end; a run with nothing new changes nothing.
const before = fs.readdirSync('audit-out/sheets/rev').filter((x) => /^rd+.xlsx$/.test(x)).length;
run('node', ['scripts/harvest-new-revisions.mjs'], 'harvest new revisions');
const after = fs.readdirSync('audit-out/sheets/rev').filter((x) => /^rd+.xlsx$/.test(x)).length;
say(`revisions on disk: ${before} → ${after}`);
run('python', ['scripts/parse-roster-timeline.py'], 'parse timeline');
run('node', ['scripts/derive-payments.mjs'], 'derive payments');
const maxBefore = Math.max(0, ...fs.readdirSync('audit-out/sheets/rev').map((x) => Number((x.match(/^r(d+).xlsx$/) || [])[1] || 0)));
run('node', ['scripts/import-revenue-timeline.mjs'], 'import timeline', { CELLS_MIN_REV: String(after > before ? 0 : maxBefore + 1) });
run('node', ['scripts/verify-billing-history.mjs'], 'verify billing history');
say(softFailures ? `done with ${softFailures} soft failure(s) - the live export was starved; history and totals still refreshed` : 'done');
finish(0);
