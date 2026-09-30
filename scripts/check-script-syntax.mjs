// EVERY GATE PARSES (29.9 #436). scripts/verify-athlete-no-backend.mjs (security
// gate G02, "the athlete seat has no back-end reach") carried a syntax error -
// an apostrophe inside a single-quoted string - and so measured nothing from
// the day it was written until 29.9. Behind that silence the athlete portal's
// basement fallback had been disabled in production for a week. A gate that
// cannot run must fail the build, not stay quiet.
//
// Every script a gate chain runs is parsed in-process by esbuild (a node
// --check per file took 20 s for 600 scripts). Workflow scripts (wf-*.mjs) use
// the workflow runtime's top-level return and are not node modules; *.tmp.*
// probes are scratch.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { transformSync } from 'esbuild';

const dir = path.dirname(fileURLToPath(import.meta.url));
const files = [
  ...fs.readdirSync(dir).filter((f) => /\.(mjs|js)$/.test(f) && !/^wf-/.test(f) && !/\.tmp\./.test(f)).map((f) => path.join(dir, f)),
  ...fs.readdirSync(path.join(dir, 'lib')).filter((f) => /\.(mjs|js)$/.test(f)).map((f) => path.join(dir, 'lib', f)),
];
const bad = [];
for (const f of files) {
  try {
    transformSync(fs.readFileSync(f, 'utf8'), { loader: 'js', format: 'esm', target: 'esnext', logLevel: 'silent' });
  } catch (e) {
    const m = (e.errors && e.errors[0]) || {};
    bad.push(`${path.relative(process.cwd(), f)}:${m.location ? m.location.line : '?'}: ${m.text || String(e.message).split('\n')[0]}`);
  }
}
if (bad.length) {
  console.log(`SCRIPT SYNTAX: ${bad.length} script(s) do not parse - a gate that cannot run measures nothing:`);
  for (const b of bad) console.log('  ' + b);
  process.exit(1);
}
console.log(`script syntax: ${files.length} scripts parse`);
