// RUN THE GATES AND SHOW THE BOARD.
//
// The repo has ~100 verify-* scripts. Most need a video or a long browser
// session; this runs the STATIC ones - no puppeteer, no clip - so a full pass
// costs minutes rather than hours and can be run before every handoff.
//
// The point is evidence, not reassurance: the board goes into the morning
// recap so a claim that "nothing is broken" is something he can read the
// output of.
//
//   node scripts/gate-board.mjs [--all] [--timeout 180]
import { execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const TIMEOUT = Number((process.argv.find((a) => a.startsWith('--timeout='))||'').split('=')[1] || 180) * 1000;
const INCLUDE_BROWSER = process.argv.includes('--all');
const OUT = 'audit-out/gate-board.json';

const files = fs.readdirSync('scripts')
  .filter((f) => /^(verify-|check-).*\.(mjs|py)$/.test(f))
  .sort();

const needsBrowser = (f) => {
  const p = path.join('scripts', f);
  const src = fs.readFileSync(p, 'utf8');
  return /puppeteer|browserURL|9222/.test(src);
};
const needsClip = (f) => /\.(mjs|py)$/.test(f) && /\.mp4|CLIP|clip/i.test(fs.readFileSync(path.join('scripts', f), 'utf8').slice(0, 2500));

const chosen = files.filter((f) => INCLUDE_BROWSER || (!needsBrowser(f) && !needsClip(f)));
console.log(`${files.length} gates found, running ${chosen.length}${INCLUDE_BROWSER ? '' : ' static'} (per-gate timeout ${TIMEOUT / 1000}s)\n`);

const results = [];
for (const f of chosen) {
  const isPy = f.endsWith('.py');
  const t0 = Date.now();
  const r = spawnSync(isPy ? 'python' : 'node', [path.join('scripts', f)], {
    encoding: 'utf8', timeout: TIMEOUT,
    env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' },
  });
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  const out = ((r.stdout || '') + (r.stderr || '')).split('\n').filter((l) => l.trim() && !/deprecat/i.test(l));
  // The LAST line is often a hint or a next-step suggestion rather than the
  // verdict (verify-prod-current ends on "node scripts/verify-lockfile-sync.mjs",
  // which tells you nothing about what it found). Prefer a line that states a
  // result, and fall back to the last line only when none does.
  const verdict = out.find((l) => /PROD IS BEHIND|passed,|violation|^0 -|^ok |ALL PASS|FAIL/i.test(l));
  const last = verdict || out[out.length - 1] || '';
  const status = r.error && r.error.code === 'ETIMEDOUT' ? 'TIMEOUT'
    : r.status === 0 ? 'pass' : 'FAIL';
  results.push({ gate: f, status, secs: Number(secs), summary: last.slice(0, 110) });
  const mark = status === 'pass' ? 'ok  ' : status === 'FAIL' ? 'FAIL' : 'time';
  console.log(`${mark} ${f.padEnd(36)} ${String(secs).padStart(6)}s  ${last.slice(0, 80)}`);
}

const pass = results.filter((r) => r.status === 'pass').length;
const fail = results.filter((r) => r.status === 'FAIL');
const to = results.filter((r) => r.status === 'TIMEOUT');
fs.writeFileSync(OUT, JSON.stringify({ when: new Date().toISOString(), pass, results }, null, 1));
console.log('');
console.log(`${pass}/${results.length} pass` + (fail.length ? `, ${fail.length} FAIL` : '') + (to.length ? `, ${to.length} timed out` : ''));
for (const f of fail) console.log(`  FAIL ${f.gate}: ${f.summary}`);
for (const f of to) console.log(`  TIME ${f.gate}`);
console.log(`-> ${OUT}`);
process.exit(fail.length ? 1 : 0);
