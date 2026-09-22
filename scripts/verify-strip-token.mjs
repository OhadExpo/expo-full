// NOTHING ON A STRIP IS HARD-CODED WHITE.
//
// The cyan header strip is `--c-stripBg`: near-black in dark, #E3F4FE in light.
// Text and borders on it belong to `--c-stripTx`, which follows. A literal
// #FFFFFF looks right in dark and is an invisible control in light.
//
// Six of these were found on 22.9, one at a time, each by a different route
// finally being looked at: the dashboard's collapse chevron (measured at
// 1.13:1), the plan editor's day chevron, + ADD RULE on /coach/calendar, the
// unclassified count on /coach/exercise-classify, the INTAKE section title, and
// the exercise card title. The light/dark sweep can only see what a route
// renders by default, so it will never find the next one either.
//
// This is static and cheap, so it can run on every build: any white literal
// written within a few lines of a stripBg background is a finding.
//
//   node scripts/verify-strip-token.mjs
import fs from 'node:fs';
import path from 'node:path';

const WHITE = /(?:color|borderColor|border)\s*:\s*['"`][^'"`]*(?:#fff(?:fff)?\b|rgba?\(\s*255\s*,\s*255\s*,\s*255)/i;
// ONLY the variable itself. Triggering on RefinedHeaderStrip or on a nearby
// --c-stripTx swept in the club zone's Card headers, which are NAVY and
// ORANGE solids where white is correct — two false positives out of the
// first sixteen, and a gate that cries wolf about a brand colour is a gate
// people stop reading.
const STRIP = /--c-stripBg|stripBg,|stripBg\)|RefinedHeaderStrip/;
// ...but NOT the club zone's Card headers. `leftStripe={NAVY}` / `{ORANGE}`
// means a brand solid, where white IS the correct colour. Dropping
// RefinedHeaderStrip from the trigger to dodge those two was an
// over-correction: it also stopped catching two REAL ones on the dashboard,
// both hard white inside a <RefinedHeaderStrip>. Exclude the brand solids by
// name instead of excluding the component.
const BRAND_SOLID = /leftStripe=\{(NAVY|ORANGE)/;
// How far a style object can run past the line that names the strip background.
const REACH = 4;

const files = [];
(function walk(d) {
  for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, f.name);
    if (f.isDirectory()) { if (!/node_modules|dist/.test(f.name)) walk(p); }
    else if (/\.jsx?$/.test(f.name)) files.push(p);
  }
})('src');

const hits = [];
let scanned = 0;
for (const p of files) {
  const lines = fs.readFileSync(p, 'utf8').split('\n');
  scanned++;
  for (let i = 0; i < lines.length; i++) {
    if (!STRIP.test(lines[i])) continue;
    if (BRAND_SOLID.test(lines[i])) continue;
    for (let j = i; j < Math.min(i + REACH, lines.length); j++) {
      if (!WHITE.test(lines[j])) continue;
      // A comment explaining the history is not a style.
      if (/^\s*(\/\/|\*|\{\s*\/\*)/.test(lines[j])) continue;
      hits.push(`${p}:${j + 1}  ${lines[j].trim().slice(0, 110)}`);
    }
  }
}

for (const h of hits) console.log('FAIL  ' + h);
console.log(`\n${scanned} source file(s) scanned for a white literal within ${REACH} lines of a strip background.`);
console.log(hits.length
  ? `${hits.length} hard-coded white(s) on a strip — use var(--c-stripTx)`
  : '0 - every strip uses the token');
process.exit(hits.length ? 1 : 0);
