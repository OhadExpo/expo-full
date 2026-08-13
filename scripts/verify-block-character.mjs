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

// ── secondary-power threshold (#131): power-LEANING data needs a MAJORITY (>=0.5)
//    explosive share. A 0.4 (minority) block is a strength block with power
//    accessories, not a power emphasis — was over-called power. ──
check('0.5 explosive + 5 reps -> power (data floor, majority explosive)', ch({ explosiveShare: 0.5, avgReps: 5 }) === 'power');
check('0.4 explosive + 5 reps -> strength (minority explosive, NOT power) [#131]', ch({ explosiveShare: 0.4, avgReps: 5 }) === 'strength');
check('0.49 explosive + 5 reps -> strength (just below the 0.5 floor)', ch({ explosiveShare: 0.49, avgReps: 5 }) === 'strength');
check('0.3 explosive + 5 reps -> strength (well below data threshold, <=6)', ch({ explosiveShare: 0.3, avgReps: 5 }) === 'strength');

// ── multi-signal upgrade (#223): intensity + confidence, honest "mixed" ──
import { classifyBlockCharacter as CBC } from '../src/lineageAnalysis.js';
const full = (name, inp, want) => { const r = CBC(inp); const ok = Object.entries(want).every(([k, v]) => r[k] === v); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); ok ? pass++ : fail++; };
// Ohad's case: mid-rep blocks with NO intensity programmed must NOT read confident
// hypertrophy — they're low-confidence/mixed (inferred from reps alone).
full('7.4r, no %/RPE -> mixed/low (not confident)', { avgReps: 7.4 }, { mixed: true, confidence: 'low' });
full('8.6r, no %/RPE -> mixed/low', { avgReps: 8.6 }, { mixed: true, confidence: 'low' });
// With intensity, it classifies confidently + correctly.
full('3r @ 90% -> strength, high, not mixed', { avgReps: 3, avgPct: 90 }, { character: 'strength', confidence: 'high', mixed: false });
full('10r @ 70% high-vol -> hypertrophy, not mixed', { avgReps: 10, avgPct: 70, volumeLevel: 'high' }, { character: 'hypertrophy', mixed: false });
full('7r @ RPE 8.5 -> strength (heavy, not hypertrophy)', { avgReps: 7, avgRpe: 8.5 }, { character: 'strength', mixed: false });
full('15r @ 55% -> endurance, not mixed', { avgReps: 15, avgPct: 55 }, { character: 'endurance', mixed: false });

console.log(`\n${fail === 0 ? '✓ ALL PASS' : '✗ FAILURES'} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
