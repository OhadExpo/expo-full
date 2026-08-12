// Fixtures for staleWeight (src/lineageAnalysis.js) — the STALE flag that gates a
// "deload / change the lift" verdict the coach acts on. A false stale brands a
// lift stuck when it's progressing (wrong deload); a missed stale hides a real
// plateau. Pins the ±2.5% flat band, the RPE hard/easy split, and the #94
// rep-progression guard (flat load + rising reps is progress, not stuck).
// Run: node scripts/verify-stale-weight.mjs
import { staleWeight } from '../src/lineageAnalysis.js';

let pass = 0, fail = 0;
const check = (name, cond) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); cond ? pass++ : fail++; };
const S = (loads, reps, rpes) => loads.map((load, i) => ({ load, reps: reps ? reps[i] : 5, rpe: rpes ? rpes[i] : null }));

// --- thin gate ---
check('2 sessions -> thin', staleWeight(S([100, 100])).state === 'thin');
check('3 sessions but a null load -> thin', staleWeight([{ load: 100 }, { load: null }, { load: 100 }]).state === 'thin');
check('empty -> thin', staleWeight([]).state === 'thin');

// --- rising load is NOT stale ---
check('loads 100/105/110 (rising >2.5%) -> not stale', staleWeight(S([100, 105, 110])).stale === false);
check('loads 100/103/100 (one jump >2.5%) -> not stale', staleWeight(S([100, 103, 100])).stale === false);

// --- flat within ±2.5% band IS stale (reps not rising) ---
check('loads 100/100/100 flat -> stale', staleWeight(S([100, 100, 100], [5, 5, 5])).stale === true);
check('loads 100/102/98 (within 2.5%) -> stale', staleWeight(S([100, 102, 98], [5, 5, 5])).stale === true);

// --- RPE hard/easy split ---
check('flat + RPE 7->8 rising -> stale HARD', staleWeight(S([100, 100, 100], [5, 5, 5], [7, 7.5, 8])).mode === 'hard');
check('flat + RPE 8->7 falling -> stale EASY', staleWeight(S([100, 100, 100], [5, 5, 5], [8, 7.5, 7])).mode === 'easy');
check('flat + no RPE -> stale, mode unknown', staleWeight(S([100, 100, 100], [5, 5, 5])).mode === 'unknown');

// --- #94 rep-progression guard: flat load + rising reps = progress, NOT stuck ---
check('flat load but reps 5->7 rising -> NOT stale (rep progression)', staleWeight(S([100, 100, 100], [5, 6, 7])).stale === false);
check('flat load + reps 5->6 (+1) -> NOT stale', staleWeight(S([100, 100, 100], [5, 5, 6])).stale === false);
check('flat load + reps flat -> still stale', staleWeight(S([100, 100, 100], [5, 5, 5])).stale === true);

console.log(`\n${fail === 0 ? '✓ ALL PASS' : '✗ FAILURES'} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
