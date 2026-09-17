// Make sure something is listening on the debug port, and that it is SIGNED IN.
//
// Two failures seen in the wild, both on 14/15.9:
//   - nothing running at all (the daemon's 10:45 slot);
//   - a normal Chrome owning the profile without a debug port, so launching the
//     same profile only hands argv to the running instance and nothing binds;
//   - his Chrome closing mid-run, which killed the calendar step at 00:30 with
//     ECONNREFUSED after the rest of the sync had already succeeded.
//
// The signed-in profile has a CLONE (made for the revision harvest) that is
// just as signed in, so when the main one is busy or absent the clone is
// started off-screen instead.
import fs from 'node:fs';
import { spawn } from 'node:child_process';

const PROFILE = process.env.CHROME_PROFILE || 'C:\\Users\\Administrator\\chrome-debug-budget';
const CLONE = process.env.CHROME_PROFILE_CLONE || 'C:\\Users\\Administrator\\chrome-debug-harvest';
const EXES = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
              'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'];

export async function chromeUp(port = 9222) {
  try { const r = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(2500) }); return r.ok; } catch { return false; }
}

async function waitUp(port, secs) {
  for (let i = 0; i < secs; i++) { await new Promise((r) => setTimeout(r, 1000)); if (await chromeUp(port)) return true; }
  return chromeUp(port);
}

/** Returns a one-line note about what it did, or throws if no Chrome can be had. */
export async function ensureDebugChrome({ port = 9222, log = () => {} } = {}) {
  if (await chromeUp(port)) return 'already up';
  const exe = EXES.find((p) => fs.existsSync(p));
  if (!exe) throw new Error('chrome.exe not found');
  const start = (dir, offscreen) => spawn(exe, [`--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, '--no-first-run',
    '--no-default-browser-check', ...(offscreen ? ['--window-position=-32000,-32000'] : []), 'about:blank'],
  { detached: true, stdio: 'ignore' }).unref();

  log('debug Chrome not answering, starting the signed-in profile');
  start(PROFILE, false);
  if (await waitUp(port, 20)) return 'started the main profile';

  if (fs.existsSync(CLONE)) {
    log('that profile is busy (a Chrome without a debug port owns it) - starting the signed-in clone');
    for (const lock of ['SingletonLock', 'lockfile', 'DevToolsActivePort']) { try { fs.rmSync(`${CLONE}\\${lock}`, { force: true }); } catch { /* noop */ } }
    start(CLONE, true);
    if (await waitUp(port, 25)) return 'started the clone';
  }
  throw new Error('no Chrome opened a debug port on ' + port);
}
