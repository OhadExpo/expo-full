// Fixtures for readinessAutoreg (src/readinessAutoreg.js) — the check-in → session
// nudge engine. A coach would BACK OFF an athlete's load off this, so the pain
// gate (0-3 train / 4-5 modify / 6+ stop), the sleep+energy read, the regression
// lever, and the honest 'unknown' all have to be right. Run:
//   node scripts/verify-readiness-autoreg.mjs
import { readinessAutoreg, fieldQuality } from '../src/readinessAutoreg.js';

let pass = 0, fail = 0;
const check = (name, cond) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); cond ? pass++ : fail++; };

// ── fieldQuality: named + numeric, pain inverted + threshold-mapped ──
check('pain none -> 3 (best)', fieldQuality('pain', 'none') === 3);
check('pain high -> 0 (worst)', fieldQuality('pain', 'high') === 0);
check('pain numeric 5 -> 1 (modify band)', fieldQuality('pain', '5') === 1);
check('pain numeric 6 -> 0 (stop band)', fieldQuality('pain', '6') === 0);
check('pain numeric 3 -> 2 (trainable)', fieldQuality('pain', '3') === 2);
check('sleep high -> 3', fieldQuality('sleep', 'high') === 3);
check('energy numeric 8 -> 2', fieldQuality('energy', '8') === 2);
check('blank -> null', fieldQuality('pain', '') === null);

// ── the gate: pain overrides everything ──
const painHigh = readinessAutoreg({ pain: 'high', sleep: 'high', energy: 'high' });
check('pain 6+ -> red, do NOT load (even with great sleep/energy)', painHigh.level === 'red' && painHigh.loadAdjustPct === null);
check('pain 6+ regresses FREQUENCY (stop), never trains through', painHigh.regress === 'frequency');
const painMod = readinessAutoreg({ pain: 'moderate', sleep: 'high', energy: 'high' });
check('pain 4-5 -> amber, modify ~-10%, intensity lever (even with great sleep)', painMod.level === 'amber' && painMod.loadAdjustPct === -10 && painMod.regress === 'intensity');
check('pain numeric 7 -> red (threshold, not linear)', readinessAutoreg({ pain: '7' }).level === 'red');

// ── pain clear: sleep + energy drive the effort read ──
check('pain clear + great sleep/energy -> green, as planned', (() => { const r = readinessAutoreg({ pain: 'none', sleep: 'high', energy: 'high' }); return r.level === 'green' && r.loadAdjustPct === 0; })());
check('pain clear + moderate -> amber, trim VOLUME first (-5%)', (() => { const r = readinessAutoreg({ pain: 'none', sleep: 'moderate', energy: 'mild' }); return r.level === 'amber' && r.regress === 'volume' && r.loadAdjustPct === -5; })());
check('pain clear + run-down -> amber, back off INTENSITY (~-12%), keep frequency', (() => { const r = readinessAutoreg({ pain: 'none', sleep: 'none', energy: 'low' }); return r.level === 'amber' && r.regress === 'intensity' && r.loadAdjustPct === -12; })());
check('mild pain + good sleep/energy -> green (pain 0-3 trainable)', readinessAutoreg({ pain: 'mild', sleep: 'high', energy: 'high' }).level === 'green');

// ── honest thin state ──
check('no check-in -> unknown, no fabricated number', (() => { const r = readinessAutoreg({}); return r.level === 'unknown' && r.loadAdjustPct === null; })());
check('pain clear, no sleep/energy -> green by-feel (no fake precision)', (() => { const r = readinessAutoreg({ pain: 'none' }); return r.level === 'green' && r.loadAdjustPct === 0; })());

console.log(`\n${fail === 0 ? '✓ ALL PASS' : '✗ FAILURES'} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
