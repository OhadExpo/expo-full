// verify-db-watchdog.mjs - the watchdog's decisions, with a scripted probe (no
// network, nothing sent): it alerts Ohad ONLY after 3 straight "gateway up,
// database down" minutes, never when this PC is offline, repeats every 5 minutes
// while down, tells him once when it is back - and never restarts anything.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as W from './db-watchdog.mjs';

let pass = 0, fail = 0;
const ok = (m, c, got = '') => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m + (got !== '' ? '  got ' + JSON.stringify(got) : '')); } };

async function run(seq) {
  const file = path.join(os.tmpdir(), `wd-${Math.random().toString(36).slice(2)}.json`);
  fs.writeFileSync(file, '{}');
  const pushes = []; let t = 1e12, i = 0;
  const probe = async () => seq[i++] || { gatewayUp: true, dbOk: true, detail: '' };
  const tick = W.startDbWatch(() => {}, file, { manual: true, probe, now: () => t, push: async (_s, title, body) => { pushes.push(title + ' | ' + body); } });
  for (let k = 0; k < seq.length; k++) { await tick(); t += 60000; }
  fs.unlinkSync(file);
  return pushes;
}
const DOWN = { gatewayUp: true, dbOk: false, detail: 'db timeout' };
const UP = { gatewayUp: true, dbOk: true, detail: 'ok' };
const OFFLINE = { gatewayUp: false, dbOk: false, detail: 'pc offline' };

ok('the module has no way to restart anything', typeof W.restartProject === 'undefined');
let p = await run([DOWN, DOWN]);
ok('2 bad minutes: no alert yet', p.length === 0, p);
p = await run([DOWN, DOWN, DOWN]);
ok('3 bad minutes with the gateway up: Ohad is alerted once', p.length === 1 && /not answering/.test(p[0]), p);
p = await run([DOWN, DOWN, DOWN, UP]);
ok('...and told once more when it answers again', p.length === 2 && /answering again/.test(p[1]), p);
p = await run(Array(10).fill(DOWN));
ok('still down after 10 minutes: re-alerted every 5 minutes (at 3, 5, 10)', p.length === 3, p.length);
p = await run(Array(5).fill(OFFLINE));
ok('this PC offline (gateway unreachable): no alert, no action', p.length === 0, p);
p = await run([DOWN, UP, DOWN, UP, DOWN, UP]);
ok('flapping (never 3 in a row): no alarm', p.filter((x) => /not answering/.test(x)).length === 0, p);
p = await run([UP, UP, UP]);
ok('healthy: nobody is told anything', p.length === 0, p);

console.log(`DB WATCHDOG: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
