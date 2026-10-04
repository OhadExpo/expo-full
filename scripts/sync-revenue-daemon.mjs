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
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startDbWatch } from './db-watchdog.mjs';
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STATE = path.join(REPO, 'audit-out/sheets/daemon.json');
const LOG = path.join(REPO, 'audit-out/sheets/daemon.log');
const SLOTS = [9, 21]; // local hours
const CATCH_UP_MS = 12 * 3600 * 1000;
fs.mkdirSync(path.dirname(STATE), { recursive: true });
const say = (m) => { const s = `${new Date().toISOString()}  ${m}\n`; process.stdout.write(s); fs.appendFileSync(LOG, s); };
// ONE WRITER (pc-migrate 2026-09-27 §2.2): this daemon writes prod, so it runs
// only on the machine named in the User env var EXPO_DAEMON_HOST. A stray start
// anywhere else - or on a machine without the variable - is a logged no-op.
// Case-insensitive: os.hostname() is the mixed-case DNS name (laptop: "OhadTop"),
// while %COMPUTERNAME% and the brief's value are upper-case.
const WANT_HOST = (process.env.EXPO_DAEMON_HOST || '').trim().toUpperCase();
if (!WANT_HOST || os.hostname().toUpperCase() !== WANT_HOST) {
  say(`daemon NOT started: host ${os.hostname()} is not EXPO_DAEMON_HOST (${process.env.EXPO_DAEMON_HOST || 'unset'}) - exiting`);
  process.exit(0);
}
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
    st.lastSlot = slotKey; save(st); runSync(`slot ${now.getHours()}:00`); runLeague(`slot ${now.getHours()}:00`); return;
  }
  if (Date.now() - (st.lastOk || 0) > CATCH_UP_MS && !running) {
    // Only catch up once per hour so a broken sync does not loop.
    if (!st.lastCatchUp || Date.now() - st.lastCatchUp > 3600 * 1000) { st.lastCatchUp = Date.now(); save(st); runSync('catch-up: last OK run older than 12h'); }
  }
}
// GAME STATS, ON THEIR OWN (Ohad 27.9: "every time there's a game you pull the
// stats from basket.co.il on your own immediately!!! rules!"). Every 20 minutes:
// bhbc-log-game --auto exits at once when no finished game is unlogged, and
// otherwise finds the box score on basket.co.il and writes the rows.
// THE LEAGUE FEED IS THE CURRENT SEASON, KEPT CURRENT (27.9, Ohad: "the games
// are not updated. we have newer games logged in"). bhbc-sync-league.mjs with no
// year = the current season. It runs after a game was logged, and at the slots.
let leagueRunning = false;
function runLeague(reason) {
  if (leagueRunning) return;
  leagueRunning = true;
  say(`league sync start (${reason})`);
  const p = spawn(process.execPath, ['scripts/bhbc-sync-league.mjs'], { cwd: REPO, stdio: 'ignore', windowsHide: true });
  p.on('exit', (code) => { leagueRunning = false; say(`league sync exit ${code}`); });
}
let gameRunning = false;
function runGames() {
  if (gameRunning) return;
  gameRunning = true;
  let out = '';
  const p = spawn(process.execPath, ['scripts/bhbc-log-game.mjs', '--auto'], { cwd: REPO, windowsHide: true });
  p.stdout.on('data', (d) => { out += d; });
  p.stderr.on('data', (d) => { out += d; });
  p.on('exit', (code) => {
    gameRunning = false;
    if (!/no finished game waiting/.test(out)) say(`games: exit ${code} ${out.trim().replace(/\s+/g, ' ').slice(0, 600)}`);
    if (/read-back OK/.test(out)) runLeague('a game was logged');
  });
}
// OWED, from the roster sheet, every 20 minutes (#386). It fails soft and says
// so in one line; a cycle with nothing new stays quiet.
let owedRunning = false, owedLast = '';
function runOwed() {
  if (owedRunning) return;
  owedRunning = true;
  let out = '';
  const p = spawn(process.execPath, ['scripts/sync-owed-cycle.mjs'], { cwd: REPO, windowsHide: true });
  p.stdout.on('data', (d) => { out += d; });
  p.stderr.on('data', (d) => { out += d; });
  p.on('exit', () => {
    owedRunning = false;
    const line = out.trim().replace(/\s+/g, ' ').slice(0, 400);
    if (line && line !== owedLast) say(line);
    owedLast = line;
  });
}
say(`daemon up, pid ${process.pid}, slots ${SLOTS.join('/')}:00, games + owed every 20 min`);
tick();
setInterval(tick, 60 * 1000);
runGames();
setInterval(runGames, 20 * 60 * 1000);
runOwed();
setInterval(runOwed, 20 * 60 * 1000);
// THE DATABASE NEVER STAYS DOWN UNNOTICED (4.10 #543): probe every minute, alert Ohad
startDbWatch(say, path.join(REPO, 'audit-out/sheets/db-watchdog.json'));
