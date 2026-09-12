// The twice-a-day clock for scripts/sync-revenue.mjs, as a user-level process.
//
// Windows Task Scheduler refused to register a task from this account
// (0x80070005 "Access is denied", inside and outside the tool sandbox, for
// both Register-ScheduledTask and schtasks), so the schedule lives here: a
// small loop started from the user's Startup folder that runs the sync at
// 09:00 and 21:00 local time, and catches up once if the machine was asleep
// through a slot (last successful run older than 12 hours).
//
//   node scripts/sync-revenue-daemon.mjs          (foreground)
//   scripts/sync-revenue-daemon.cmd               (what Startup launches, minimised)
// State: audit-out/sheets/daemon.json  Log: audit-out/sheets/daemon.log
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STATE = path.join(REPO, 'audit-out/sheets/daemon.json');
const LOG = path.join(REPO, 'audit-out/sheets/daemon.log');
const SLOTS = [9, 21]; // local hours
const CATCH_UP_MS = 12 * 3600 * 1000;
fs.mkdirSync(path.dirname(STATE), { recursive: true });
const say = (m) => { const s = `${new Date().toISOString()}  ${m}\n`; process.stdout.write(s); fs.appendFileSync(LOG, s); };
const load = () => { try { return JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch { return { lastOk: 0, lastSlot: '' }; } };
const save = (st) => fs.writeFileSync(STATE, JSON.stringify(st));
let running = false;
function runSync(reason) {
  if (running) return;
  running = true;
  say(`sync start (${reason})`);
  const p = spawn(process.execPath, ['scripts/sync-revenue.mjs'], { cwd: REPO, stdio: 'ignore', windowsHide: true });
  p.on('exit', (code) => {
    running = false;
    const st = load();
    if (code === 0) { st.lastOk = Date.now(); say('sync OK'); } else say(`sync FAILED exit ${code}`);
    save(st);
  });
}
function tick() {
  const now = new Date();
  const st = load();
  const slotKey = `${now.toDateString()}@${now.getHours()}`;
  if (SLOTS.includes(now.getHours()) && st.lastSlot !== slotKey) {
    st.lastSlot = slotKey; save(st); runSync(`slot ${now.getHours()}:00`); return;
  }
  if (Date.now() - (st.lastOk || 0) > CATCH_UP_MS && !running) {
    // Only catch up once per hour so a broken sync does not loop.
    if (!st.lastCatchUp || Date.now() - st.lastCatchUp > 3600 * 1000) { st.lastCatchUp = Date.now(); save(st); runSync('catch-up: last OK run older than 12h'); }
  }
}
say(`daemon up, pid ${process.pid}, slots ${SLOTS.join('/')}:00`);
tick();
setInterval(tick, 60 * 1000);
