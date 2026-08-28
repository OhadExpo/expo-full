// Apply a mechanical edit ATOMICALLY: patch, validate, and roll back if the
// file no longer parses. Nothing downstream ever sees a broken file.
//
// WHY THIS EXISTS. Ohad, 2026-08-28: "you should never make mistakes or errors
// at all. that's why we have rules" — after I spliced JSX by string index,
// left a dangling fragment, and announced "first fixing the parse error I just
// created". The error itself was cheap; announcing it as a step in the work is
// what wasted his trust.
//
// The rule that prevents it: an edit is not finished when the bytes are
// written, it is finished when the file still parses. So the two are one
// operation and the second half is not optional.
//
// Usage:  node scripts/safe-edit.mjs <file> <patch.mjs>
// where patch.mjs default-exports (src: string) => string
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const [, , file, patchFile] = process.argv;
if (!file || !patchFile) {
  console.log('usage: node scripts/safe-edit.mjs <file> <patch.mjs>');
  process.exit(2);
}
const before = fs.readFileSync(file, 'utf8');
// Windows needs a file:// URL — a bare 'C:\...' path is rejected by the ESM loader.
const patch = (await import(pathToFileURL(path.resolve(patchFile)).href)).default;

let after;
try {
  after = patch(before);
} catch (e) {
  console.log(`REFUSED — the patch itself threw: ${String(e).slice(0, 200)}`);
  console.log('file untouched.');
  process.exit(1);
}
if (typeof after !== 'string' || !after.length) {
  console.log('REFUSED — patch did not return a non-empty string. file untouched.');
  process.exit(1);
}
if (after === before) {
  console.log('NO-OP — patch matched nothing. file untouched, and that is a FAILURE:');
  console.log('  a patch that silently matches nothing is how a "fix" ships without fixing anything.');
  process.exit(1);
}

fs.writeFileSync(file, after);
try {
  // The only question that matters: does it still parse?
  execFileSync('npx', ['eslint', file], { stdio: 'pipe', shell: process.platform === 'win32' });
  const d = after.length - before.length;
  console.log(`OK — ${file} patched and still parses (${d >= 0 ? '+' : ''}${d} bytes).`);
} catch (e) {
  fs.writeFileSync(file, before);
  const out = (e.stdout || e.output?.join('') || '').toString();
  console.log(`ROLLED BACK — the edit broke ${file}, so it was reverted. Nothing is half-applied.`);
  console.log(out.split('\n').filter((l) => /error/i.test(l)).slice(0, 4).join('\n'));
  process.exit(1);
}
