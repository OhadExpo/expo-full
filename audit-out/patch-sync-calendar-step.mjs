// The twice-daily sync also refreshes the club zone from the club calendar,
// and survives a Chrome that is running WITHOUT the debug port.
//
// Ohad's 10:45 run on 14.9 failed in 8 seconds: "debug Chrome not answering on
// 9222, starting it" → "Chrome did not open a debug port". That is what happens
// when a normal Chrome already owns that profile - the new process just hands
// its argv to the running instance and exits, so nothing ever binds 9222.
// The signed-in profile was CLONED for the harvest (chrome-debug-harvest); if
// the main one is busy, the clone is launched instead and it is just as
// signed-in.
import fs from 'node:fs';
const f = 'scripts/sync-revenue.mjs';
let s = fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const rep = (a, b, l) => { const n = s.split(a).length - 1; if (n !== 1) throw new Error(l + ' x' + n); s = s.replace(a, b); console.log('ok', l); };

rep(`  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    if (await chromeUp()) break;
  }
  if (!(await chromeUp())) { say('FAILED: Chrome did not open a debug port'); finish(1); }`,
`  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    if (await chromeUp()) break;
  }
  if (!(await chromeUp())) {
    // A normal Chrome already owns that profile: the launch above only handed
    // its arguments to the running instance, which has no debug port. The
    // CLONE of the same signed-in profile is free, so use it.
    const clone = 'C:\\\\Users\\\\Administrator\\\\chrome-debug-harvest';
    if (fs.existsSync(clone)) {
      say('profile busy (a Chrome without a debug port owns it) - starting the signed-in clone');
      for (const lock of ['SingletonLock', 'lockfile', 'DevToolsActivePort']) { try { fs.rmSync(\`\${clone}\\\\\${lock}\`, { force: true }); } catch { /* noop */ } }
      spawn(exe, ['--remote-debugging-port=9222', \`--user-data-dir=\${clone}\`, '--no-first-run',
                  '--no-default-browser-check', '--window-position=-32000,-32000', 'about:blank'], { detached: true, stdio: 'ignore' }).unref();
      for (let i = 0; i < 25; i++) { await new Promise((r) => setTimeout(r, 1000)); if (await chromeUp()) break; }
    }
  }
  if (!(await chromeUp())) { say('FAILED: Chrome did not open a debug port'); finish(1); }`, 'chrome clone fallback');

rep(`run('node', ['scripts/verify-billing-history.mjs'], 'verify billing history');`,
`run('node', ['scripts/verify-billing-history.mjs'], 'verify billing history');

// ---- the club zone, from the club's Google Calendar ----
// Soft: a calendar hiccup must never cost him the revenue refresh.
run('node', ['scripts/fetch-bhbc-calendar.mjs'], 'fetch club calendar', {}, { soft: true });
if (fs.existsSync('audit-out/sheets/bhbc-calendar.json')) {
  run('node', ['scripts/sync-bhbc-calendar.mjs', 'audit-out/sheets/bhbc-calendar.json'], 'sync club calendar', {}, { soft: true });
}`, 'calendar steps');
fs.writeFileSync(f, s);
