// NO NEW DEAD VARIABLE IN WHAT THIS BRANCH CHANGED (29.9 #436).
//
// A break test was committed by accident on 21.9 (c7543ed9):
//     const v = raw ? JSON.parse(raw) : null;
//     return null;
// and the athlete portal's basement fallback returned nothing for a week, in
// production. `v` - assigned and never read - is exactly what eslint's
// no-unused-vars reports, but the rule was off: the codebase carries ~900 old
// unused locals, too many to gate on at once. So this is a RATCHET: an unused
// local is refused only on a line the branch CHANGED against production
// (origin/master). Old ones are left alone; new ones cannot land.
//
// Where there is no production ref to compare with (a shallow CI clone) it says
// so and passes - it guards the working checkout, where commits are made.
import { execSync } from 'node:child_process';
import { ESLint } from 'eslint';

const BASE_REF = process.env.UNUSED_BASE || 'origin/master';
const sh = (c) => execSync(c, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
let diff;
try { sh(`git rev-parse --verify ${BASE_REF}`); diff = sh(`git diff -U0 ${BASE_REF} -- src expo-il/src`); }
catch { console.log(`no-new-unused: no ${BASE_REF} here (shallow clone?) - skipped`); process.exit(0); }

// changed line numbers per file (the new side of every hunk)
const changed = new Map();
let file = null;
for (const line of diff.split('\n')) {
  const f = line.match(/^\+\+\+ b\/(.+)$/); if (f) { file = /\.(jsx?|mjs)$/.test(f[1]) ? f[1] : null; continue; }
  const h = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
  if (h && file) { const a = +h[1], n = h[2] == null ? 1 : +h[2]; if (!changed.has(file)) changed.set(file, new Set()); for (let i = 0; i < n; i++) changed.get(file).add(a + i); }
}
if (!changed.size) { console.log('no-new-unused: nothing changed against ' + BASE_REF); process.exit(0); }

const eslint = new ESLint({ overrideConfig: { rules: { 'no-unused-vars': ['error', { vars: 'local', args: 'none', caughtErrors: 'none', ignoreRestSiblings: true, varsIgnorePattern: '^(_|[A-Z])' }] } } });
// A variable dies when its USE is edited away - the declaration line itself is
// usually untouched. So per changed file: the unused names in the production
// copy vs the branch copy; a name that is new (or appears more often) is refused.
const unusedIn = async (text, filePath) => {
  const [r] = await eslint.lintText(text, { filePath });
  const out = [];
  for (const m of (r && r.messages) || []) if (m.ruleId === 'no-unused-vars') { const n = (m.message.match(/^'([^']+)'/) || [])[1]; if (n) out.push({ n, line: m.line }); }
  return out;
};
const hits = [];
for (const file of changed.keys()) {
  let base = '';
  try { base = sh(`git show ${BASE_REF}:${file}`); } catch { base = ''; }
  let head = '';
  try { head = (await import('node:fs')).readFileSync(file, 'utf8'); } catch { continue; }
  const before = await unusedIn(base, file), after = await unusedIn(head, file);
  const count = (list) => list.reduce((m, x) => m.set(x.n, (m.get(x.n) || 0) + 1), new Map());
  const cb = count(before);
  const seen = new Map();
  for (const x of after) { const k = (seen.get(x.n) || 0) + 1; seen.set(x.n, k); if (k > (cb.get(x.n) || 0)) hits.push(`${file}:${x.line}  '${x.n}' is assigned but never read`); }
}
if (hits.length) {
  console.log(`NO-NEW-UNUSED: ${hits.length} new unused local(s) against ${BASE_REF} - a leftover break test looks exactly like this:`);
  for (const h of hits) console.log('  ' + h);
  process.exit(1);
}
console.log(`no-new-unused: ${changed.size} changed file(s) vs ${BASE_REF}, 0 new unused locals`);
