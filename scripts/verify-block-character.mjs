// Fixtures for the block-character classifier (src/lineageAnalysis.js
// classifyBlockCharacter). This is the periodization ZONE a coach reads off the
// programming-arc wave, so a mis-labeled block (a power block called hypertrophy,
// or a high-rep pump block called power) is a wrong programming read. Pins the
// NSCA zone boundaries AND the 2026-08-12 rep-ceiling on POWER.
// Run: node scripts/verify-block-character.mjs
import { classifyBlockCharacter } from '../src/lineageAnalysis.js';

let pass = 0, fail = 0;
const check = (name, cond) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); cond ? pass++ : fail++; };
const ch = (o) => classifyBlockCharacter(o).character;

// ── POWER: explosive intent AND low reps ──
check('explosive + low reps (5) -> power', ch({ explosiveShare: 0.5, avgReps: 5 }) === 'power');
check('heavily explosive (0.7) + 4 reps -> power', ch({ explosiveShare: 0.7, avgReps: 4 }) === 'power');
check('ballistic w/ no rep numbers (avgReps null) + explosive -> power', ch({ explosiveShare: 0.5, avgReps: null }) === 'power');

// ── #130 REP-CEILING: explosive but HIGH reps is NOT power development ──
check('explosive (0.5) but 12 reps -> hypertrophy, NOT power', ch({ explosiveShare: 0.5, avgReps: 12 }) === 'hypertrophy');
check('very explosive (0.7) but 15 reps -> endurance, NOT power', ch({ explosiveShare: 0.7, avgReps: 15 }) === 'endurance');
check('explosive (0.9) but 9 reps (>8) -> hypertrophy, NOT power', ch({ explosiveShare: 0.9, avgReps: 9 }) === 'hypertrophy');
check('explosive (0.5) at 8 reps (ceiling edge) -> still power', ch({ explosiveShare: 0.5, avgReps: 8 }) === 'power');

// ── STRENGTH / HYPERTROPHY / ENDURANCE by rep zone + intensity ──
check('4 reps -> strength', ch({ explosiveShare: 0, avgReps: 4 }) === 'strength');
check('6 reps -> strength (<=6)', ch({ explosiveShare: 0, avgReps: 6 }) === 'strength');
check('10 reps sub-max -> hypertrophy', ch({ explosiveShare: 0, avgReps: 10, heavy: false }) === 'hypertrophy');
check('10 reps HEAVY -> strength', ch({ explosiveShare: 0, avgReps: 10, heavy: true }) === 'strength');
check('15 reps sub-max -> endurance', ch({ explosiveShare: 0, avgReps: 15, heavy: false }) === 'endurance');
check('15 reps HEAVY (accessory-diluted mean) -> strength', ch({ explosiveShare: 0, avgReps: 15, heavy: true }) === 'strength');

// ── NAME override: only in the fuzzy 6-12 non-heavy middle, or when heavy ──
check('data=hypertrophy(10r) but name=strength -> strength (fuzzy override)', ch({ explosiveShare: 0, avgReps: 10, heavy: false, nameChar: 'strength' }) === 'strength');
check('data=strength(10r heavy) name=power -> power (heavy override)', ch({ explosiveShare: 0, avgReps: 10, heavy: true, nameChar: 'power' }) === 'power');
check('data=strength(4r) name=hypertrophy -> strength (data wins, low-rep NOT fuzzy)', ch({ explosiveShare: 0, avgReps: 4, heavy: false, nameChar: 'hypertrophy' }) === 'strength');
check('data=endurance(15r) name=hypertrophy -> endurance (13+ NOT fuzzy, not heavy)', ch({ explosiveShare: 0, avgReps: 15, heavy: false, nameChar: 'hypertrophy' }) === 'endurance');

// ── fallbacks ──
check('no reps + no name + no explosive -> hypertrophy fallback', ch({ explosiveShare: 0, avgReps: null, nameChar: null }) === 'hypertrophy');
check('no reps + name only -> name', ch({ explosiveShare: 0, avgReps: null, nameChar: 'strength' }) === 'strength');

// ── secondary-power threshold: 0.4-0.6 explosive at low reps still reads power (dataChar) ──
check('0.4 explosive + 5 reps -> power (data threshold)', ch({ explosiveShare: 0.4, avgReps: 5 }) === 'power');
check('0.3 explosive + 5 reps -> strength (below data threshold, <=6)', ch({ explosiveShare: 0.3, avgReps: 5 }) === 'strength');

console.log(`\n${fail === 0 ? '✓ ALL PASS' : '✗ FAILURES'} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
