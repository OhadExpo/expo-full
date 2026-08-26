// Run every pure-node verify-*.mjs and report one number.
//
// WHY. `npm test` ran ONE file out of 71 on disk. Everything else only ran when
// somebody remembered its name, which means a suite that grew all year was
// mostly never executed together. Tonight alone the full sweep is what proved
// the median fix did not disturb detection, and what caught a harness crashing
// on a missing argument.
//
// Scope: pure-node only. Anything needing a browser or the network is SKIPPED
// by name, because a green run must mean "the logic is sound", not "the dev
// server happened to be up". Those live in the audit-* scripts and are run
// explicitly.
//
//   node scripts/run-suite.mjs          all of them
//   node scripts/run-suite.mjs shot     only names containing "shot"
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

// Needs a browser, a live server, or credentials — not part of the pure suite.
const NEEDS_WORLD = [
  'verify-shot-figure',       // needs an expo-il preview + debug Chrome
  'verify-prod-current',      // hits production
  'verify-bhbc-write-scope',  // signs in to Supabase
];

const filter = process.argv[2] || '';
const all = fs.readdirSync('scripts')
  .filter((f) => /^verify-.*\.mjs$/.test(f))
  .map((f) => f.replace(/\.mjs$/, ''))
  .filter((n) => !NEEDS_WORLD.includes(n))
  .filter((n) => !filter || n.includes(filter))
  .sort();

let green = 0;
const red = [];
const started = Date.now();

for (const name of all) {
  try {
    execFileSync(process.execPath, [`scripts/${name}.mjs`], { stdio: 'pipe', timeout: 150000 });
    green++;
  } catch (e) {
    const out = String((e.stdout || '') + (e.stderr || ''));
    const line = out.split('\n').reverse().find((l) => /passed|failed|FAIL|violation|Error/.test(l)) || '';
    red.push({ name, line: line.trim().slice(0, 90), code: e.status });
  }
}

const secs = Math.round((Date.now() - started) / 1000);
console.log(`\nSUITE: ${green} green, ${red.length} red — ${all.length} files in ${secs}s`);
if (NEEDS_WORLD.length && !filter) {
  console.log(`(skipped, they need a browser/server/credentials: ${NEEDS_WORLD.join(', ')})`);
}
for (const r of red) console.log(`  x ${r.name} (exit ${r.code})  ${r.line}`);
process.exit(red.length ? 1 : 0);
