// The demo's camera-tool list must mirror the real launcher's.
//
// It has drifted before: the demo listed four tools while ReviewToolsView
// shipped five, so a prospect was shown a smaller product than exists. And the
// descriptions drift more quietly than the list does — the analyzer gained a
// whole session-level read while both blurbs still described a single shot.
//
// Ohad's standing rule is that marketing and demo parity ships with EVERY app
// change. This makes the camera-tool half of that mechanical.
import fs from 'node:fs';

const real = fs.readFileSync(new URL('../src/ReviewToolsView.jsx', import.meta.url), 'utf8');
const demo = fs.readFileSync(new URL('../src/CoachDemo.jsx', import.meta.url), 'utf8');

let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  if (cond) pass++; else { fail++; console.log(`  x ${name}${detail ? '\n     ' + detail : ''}`); }
};

// Pull { key, label, measures } out of each registry.
function entries(src) {
  const out = new Map();
  for (const m of src.matchAll(/\{\s*key:\s*'([a-z]+)',\s*label:\s*'([^']+)'[\s\S]{0,400}?measures:\s*'([^']*)'/g)) {
    out.set(m[1], { label: m[2], measures: m[3] });
  }
  return out;
}
const R = entries(real), D = entries(demo);

console.log(`CAMERA TOOL PARITY\n\nreal launcher: ${R.size} tools, demo: ${D.size} tools`);
ok('the checker found tools at all', R.size >= 4 && D.size >= 4, `real ${R.size}, demo ${D.size}`);

for (const [key, r] of R) {
  const d = D.get(key);
  ok(`the demo offers "${key}"`, !!d, d ? '' : `the real launcher has ${key} and the demo does not`);
  if (!d) continue;
  ok(`"${key}" has the same label`, d.label === r.label, `real "${r.label}" vs demo "${d.label}"`);
  ok(`"${key}" describes the same thing`, d.measures === r.measures,
    `real   "${r.measures}"\n     demo   "${d.measures}"`);
}
for (const key of D.keys()) {
  ok(`the demo does not invent "${key}"`, R.has(key), `the demo shows ${key} and the real launcher does not`);
}


// Each description must fit ONE line in the tool list.
//
// A row that wraps is not a cosmetic nit: every other row in that list is a
// single line, so a two-line row breaks the rhythm, pushes its text ~400px
// further right than any of its neighbours and leaves the OPEN control floating
// against a taller block. That is exactly what happened when the Shot Analyzer
// blurb grew to 154 characters to describe the session read.
//
// The cap is measured, not guessed: "Bar speed (VBT) + per-goal stop-set cutoff
// - ROM/tempo/collapse - L/R symmetry" is 78 characters and was screenshotted
// on one line at 1440px; 154 wrapped. 80 leaves the proven one intact with no
// meaningful extrapolation.
const ONE_LINE_MAX = 80;
for (const [key, r] of R) {
  ok(`"${key}" description fits one line (<= ${ONE_LINE_MAX} chars)`, r.measures.length <= ONE_LINE_MAX,
    `${r.measures.length} chars: "${r.measures}"`);
}

console.log(`\nCAMERA TOOL PARITY: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
