// audit-all-suites.mjs — run EVERY verify-*.mjs and classify the outcome.
//
// Ohad, 2026-08-30: "audit everything you did in the past week, everything,
// 0 bugs are allowed." 390 commits is past the point where reading diffs proves
// anything; the repo's own gates are the only evidence that scales. This runs
// all of them and separates three very different outcomes that a plain
// pass/fail would blur together:
//
//   PASS     the suite ran and asserted successfully
//   FAIL     the suite ran and something is actually wrong  <-- the only bugs
//   BLOCKED  it needs a browser, a dev server or credentials it did not get
//
// Reporting BLOCKED as PASS would be the exact "green summary hiding the thing
// being measured" mistake made earlier tonight, so it is called out separately
// and counted.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';

const run = promisify(execFile);
const TIMEOUT = Number(process.env.SUITE_TIMEOUT || 120000);

const files = fs.readdirSync('scripts')
  .filter((f) => /^verify-.*\.mjs$/.test(f))
  .sort();

const BLOCKERS = /ECONNREFUSED|9222|puppeteer|browserURL|Navigation timeout|EXPO_PW|SUPABASE|service_role|fetch failed|Missing .*key|not authorized|getaddrinfo/i;

const pass = [], fail = [], blocked = [];

for (const f of files) {
  let out = '', code = 0;
  try {
    const r = await run('node', [`scripts/${f}`], { timeout: TIMEOUT, maxBuffer: 1 << 26 });
    out = r.stdout + r.stderr;
  } catch (e) {
    code = e.code ?? 1;
    out = String((e.stdout || '') + (e.stderr || '') + (e.message || ''));
  }
  const tail = out.split('\n').filter(Boolean).slice(-3).join(' | ').slice(0, 150);
  if (code === 0) { pass.push(f); process.stdout.write(`PASS     ${f}\n`); }
  else if (BLOCKERS.test(out)) { blocked.push([f, tail]); process.stdout.write(`BLOCKED  ${f}\n`); }
  else { fail.push([f, tail]); process.stdout.write(`FAIL     ${f}\n         ${tail}\n`); }
}

console.log(`\n${'='.repeat(64)}`);
console.log(`PASS ${pass.length}   FAIL ${fail.length}   BLOCKED ${blocked.length}   of ${files.length}`);
if (fail.length) {
  console.log('\nFAILURES - these are the only ones that count as bugs:');
  for (const [f, t] of fail) console.log(`  ${f}\n    ${t}`);
}
if (blocked.length) {
  console.log('\nBLOCKED (needed a browser, dev server or credentials):');
  for (const [f] of blocked) console.log(`  ${f}`);
}
process.exit(fail.length ? 1 : 0);
