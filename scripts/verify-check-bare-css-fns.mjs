// Regression test for the build-gate detector scripts/check-bare-css-fns.js.
// The gate exists to catch a real crash class: a template like `${C.ac}HEX`
// getting rewritten to a bare `rgba(...)` JS call → ReferenceError black-screen.
// A naive quote scanner also DESYNCED on JSX-text apostrophes ("it's"), then
// mis-flagged legit quoted rgba('...') strings — 19 false positives that turned
// the gate RED and blocked deploys (fixed 2026-08-13). This pins BOTH: real bare
// calls still caught, and quoted/compound/template/contraction cases ignored.
// Run: node scripts/verify-check-bare-css-fns.mjs
import { findBareCalls } from './check-bare-css-fns.js';

let pass = 0, fail = 0;
const check = (name, cond) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); cond ? pass++ : fail++; };
const count = (src) => findBareCalls('t.jsx', src).length;

// --- REAL bare calls: must be flagged (these crash on render) ---
check('bare object value flagged',        count(`const s = { background: rgba(0,0,0,0.5) };`) === 1);
check('bare ternary branch flagged',      count(`const s = { color: c ? rgb(1,2,3) : '#fff' };`) === 1);
check('bare arrow return flagged',        count(`const f = () => hsla(1,2,3,0.4);`) === 1);
check('bare after = flagged',             count(`const c = rgba(9,9,9,0.9);`) === 1);
check('two bare calls -> two flags',      count(`const s = { a: rgb(1,2,3), b: rgba(0,0,0,0.1) };`) === 2);

// --- SAFE: must NOT be flagged ---
check('simple quoted string ok',          count(`const s = { background: 'rgba(0,0,0,0.5)' };`) === 0);
check('compound quoted string ok',        count(`const s = { border: '1px solid rgba(9,9,9,0.9)' };`) === 0);
check('template literal ok',              count('const s = { boxShadow: `0 0 8px rgba(0,0,0,0.3)` };') === 0);
check('double-quoted string ok',          count(`const s = { background: "rgba(0,0,0,0.5)" };`) === 0);
check('identifier myrgba() ok',           count(`const x = myrgba(1,2,3);`) === 0);
check('gradient inside string ok',        count(`const s = { background: 'linear-gradient(90deg, rgba(0,0,0,0.5), transparent)' };`) === 0);

// --- THE REGRESSION: JSX-text apostrophes must not desync the scan and turn a
// later quoted rgba('...') into a false positive. This is the exact 19-false-
// positive shape that turned the gate RED. ---
const jsxDesyncBait = [
  `function C() {`,
  `  const box = { border: '1px solid rgba(255,255,255,0.3)' };`,
  `  return <div style={box}>it's the coach's tool, don't worry, athlete's set</div>;`,
  `}`,
  `const after = { color: 'rgba(255,255,255,0.5)' };`,
].join('\n');
check('JSX contractions do NOT desync -> quoted rgba after them stays clean', count(jsxDesyncBait) === 0);

// possessive/contraction inside a comment must also not desync
check('apostrophe in comment ok',         count(`// don't break the coach's flow\nconst s = { c: 'rgba(1,2,3,0.4)' };`) === 0);

console.log(`\n${fail === 0 ? '✓ ALL PASS' : '✗ FAILURES'} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
