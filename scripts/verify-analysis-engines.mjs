// One-command regression suite for the pure, coach-acted analysis engines.
// These produce numbers/reads a coach ACTS on, so they carry standalone fixtures.
// Run: node scripts/verify-analysis-engines.mjs
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const suites = [
  'verify-rom-goniometer.mjs',       // camera goniometer -> clinical ROM degree
  'verify-velocity-profile-1rm.mjs', // load-velocity -> estimated 1RM
  'verify-periodization-balance.mjs',// block history -> periodization read
];

let anyFail = false;
for (const s of suites) {
  process.stdout.write(`\n──────── ${s} ────────\n`);
  const r = spawnSync(process.execPath, [join(here, s)], { encoding: 'utf8' });
  process.stdout.write(r.stdout || '');
  if (r.stderr) process.stdout.write(r.stderr);
  if (r.status !== 0) anyFail = true;
}

process.stdout.write(`\n════════ ${anyFail ? '✗ SUITE FAILED' : '✓ ALL ENGINE SUITES GREEN'} ════════\n`);
process.exit(anyFail ? 1 : 0);
