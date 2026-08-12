// verify-font-parity.mjs — durable guard against the two self-hosted Heebo
// stylesheets drifting apart. EXPO ships two front-ends (the coach/athlete app
// at repo root, and the marketing site in expo-il/), each with its OWN copy of
// public/heebo-fonts.css. Ohad's rule is that Hebrew and English sit at the
// PERFECTLY same vertical height "everywhere on expo" — which depends on the
// Hebrew @font-face carrying `size-adjust: 109%` to match Nord's Latin caps.
//
// A fix landing in one copy but not the other is exactly the parity gap that
// prompted this guard (marketing lagged the coach app until 2026-08-13). This
// asserts BOTH copies carry the adjust on the Hebrew unicode bucket. Pure fs
// read, no build impact. Run: node scripts/verify-font-parity.mjs
import { readFileSync } from 'node:fs';

const FILES = ['public/heebo-fonts.css', 'expo-il/public/heebo-fonts.css'];
// The Hebrew bucket is the @font-face whose unicode-range includes U+0590-05FF.
const HEBREW_RANGE = 'U+0590-05FF';
const EXPECT_ADJUST = 'size-adjust: 109%';

let pass = 0, fail = 0;
const check = (name, cond) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); cond ? pass++ : fail++; };

// Extract the single @font-face block that contains the Hebrew unicode-range.
function hebrewBlock(css) {
  const blocks = css.split('@font-face');
  return blocks.find((b) => b.includes(HEBREW_RANGE)) || '';
}

const adjusts = [];
for (const rel of FILES) {
  let css = '';
  try { css = readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8'); } catch { /* missing */ }
  check(`${rel} exists and is non-empty`, css.length > 0);
  const block = hebrewBlock(css);
  check(`${rel} has a Hebrew @font-face (${HEBREW_RANGE})`, block.length > 0);
  const hasAdjust = block.includes(EXPECT_ADJUST);
  check(`${rel} Hebrew bucket carries "${EXPECT_ADJUST}"`, hasAdjust);
  // Capture the exact size-adjust value for cross-file equality.
  const m = block.match(/size-adjust:\s*([\d.]+%)/);
  adjusts.push(m ? m[1] : null);
}

// Both files must use the SAME value — a future recalibration in one must be
// mirrored in the other, or Hebrew height diverges between the two front-ends.
check('both Heebo stylesheets use the SAME size-adjust value', adjusts[0] && adjusts[0] === adjusts[1]);

console.log(`\n${fail === 0 ? '✓ ALL PASS' : '✗ FAILURES'} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
