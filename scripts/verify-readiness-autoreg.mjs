// Fixtures for readinessAutoreg (src/readinessAutoreg.js) — the check-in → session
// nudge engine. A coach BACKS OFF an athlete's load off this, so the pain gate
// (0-3 train / 4-5 modify / 6+ stop), the MISSING-pain safety (never green a day
// pain wasn't logged), and the sleep+energy read all have to be right. Strings
// are the REAL portal values: pain none/mild/moderate/high · sleep poor/ok/good/
// great · energy low/ok/good/high. Run: node scripts/verify-readiness-autoreg.mjs
import { readinessAutoreg, fieldQuality } from '../src/readinessAutoreg.js';

let pass = 0, fail = 0;
const check = (name, cond) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); cond ? pass++ : fail++; };

// ── fieldQuality: real strings, source-of-truth scale (poor=0..great=3), pain inverted+threshold ──
check('pain none -> 3 (best)', fieldQuality('pain', 'none') === 3);
check('pain high -> 0 (worst)', fieldQuality('pain', 'high') === 0);
check('pain numeric 5 -> 1 (modify band)', fieldQuality('pain', '5') === 1);
check('pain numeric 6 -> 0 (stop band)', fieldQuality('pain', '6') === 0);
check('sleep poor -> 0 (matches checkinQuality scale, not 1)', fieldQuality('sleep', 'poor') === 0);
check('sleep good -> 2', fieldQuality('sleep', 'good') === 2);
check('sleep great -> 3', fieldQuality('sleep', 'great') === 3);
check('energy low -> 0', fieldQuality('energy', 'low') === 0);
check('energy high -> 3', fieldQuality('energy', 'high') === 3);
check('blank -> null', fieldQuality('pain', '') === null);

// ── SAFETY-CRITICAL: pain NOT logged must never green / recommend a PR ──
const noPain = readinessAutoreg({ sleep: 'great', energy: 'high' }); // pain omitted
check('SAFETY: pain unlogged + great sleep/energy -> NOT green', noPain.level !== 'green');
check('SAFETY: pain unlogged -> no load increase, flags confirm', noPain.loadAdjustPct === 0 && /pain wasn't logged|confirm/i.test(noPain.note));
check('SAFETY: pain unlogged -> never says "full send" / "PR"', !/full send|PR attempt/i.test(noPain.note));

// ── pain gate ──
const painHigh = readinessAutoreg({ pain: 'high', sleep: 'great', energy: 'high' });
check('pain 6+ -> red, do NOT load (overrides great sleep/energy)', painHigh.level === 'red' && painHigh.loadAdjustPct === null && painHigh.regress === 'frequency');
const painMod = readinessAutoreg({ pain: 'moderate', sleep: 'great', energy: 'high' });
check('pain 4-5 -> amber, modify ~-10%, intensity', painMod.level === 'amber' && painMod.loadAdjustPct === -10 && painMod.regress === 'intensity');
check('pain numeric 7 -> red', readinessAutoreg({ pain: '7' }).level === 'red');

// ── mild pain: trainable, but honest note + NO PR language ──
const mild = readinessAutoreg({ pain: 'mild', sleep: 'great', energy: 'high' });
check('mild pain + good markers -> green (trainable)', mild.level === 'green');
check('mild pain note reflects the pain + drops "PR fair game"', /mild pain/i.test(mild.note) && !/PR attempt|full send/i.test(mild.note));

// ── pain clear: sleep + energy drive the read (corrected scale) ──
check('none + great/high -> green full send (PR ok)', (() => { const r = readinessAutoreg({ pain: 'none', sleep: 'great', energy: 'high' }); return r.level === 'green' && /PR/i.test(r.note); })());
check('none + good/good -> green (good=2, scale fix; was wrongly amber)', readinessAutoreg({ pain: 'none', sleep: 'good', energy: 'good' }).level === 'green');
check('none + ok/ok -> amber, trim VOLUME (-5%)', (() => { const r = readinessAutoreg({ pain: 'none', sleep: 'ok', energy: 'ok' }); return r.level === 'amber' && r.regress === 'volume' && r.loadAdjustPct === -5; })());
check('none + poor/low -> amber, back off INTENSITY (~-12%)', (() => { const r = readinessAutoreg({ pain: 'none', sleep: 'poor', energy: 'low' }); return r.level === 'amber' && r.regress === 'intensity' && r.loadAdjustPct === -12; })());

  // ── PR-day needs BOTH markers: a single good effort read (the other unlogged)
  //    is still green (pain clear) but must NOT greenlight a PR attempt — same
  //    don't-over-claim-on-partial-data discipline as the missing-pain gate. ──
  const oneMarker = readinessAutoreg({ pain: 'none', energy: 'good' }); // sleep unlogged
  check('none + energy good, sleep UNLOGGED -> green but NO PR', oneMarker.level === 'green' && oneMarker.loadAdjustPct === 0 && !/PR attempt|full send/i.test(oneMarker.note));
  check('none + sleep good, energy UNLOGGED -> green but NO PR', (() => { const r = readinessAutoreg({ pain: 'none', sleep: 'good' }); return r.level === 'green' && !/PR attempt|full send/i.test(r.note); })());
  check('none + energy high ONLY (avg 3) -> still no PR off one marker', !/PR attempt/i.test(readinessAutoreg({ pain: 'none', energy: 'high' }).note));
  check('PR greenlight requires BOTH sleep AND energy logged', /PR attempt/i.test(readinessAutoreg({ pain: 'none', sleep: 'great', energy: 'high' }).note));

// ── honest thin states ──
check('no check-in -> unknown', (() => { const r = readinessAutoreg({}); return r.level === 'unknown' && r.loadAdjustPct === null; })());
check('none pain, no sleep/energy -> green by-feel', (() => { const r = readinessAutoreg({ pain: 'none' }); return r.level === 'green' && r.loadAdjustPct === 0; })());
check('run-down note does not assert an unlogged field', (() => { const r = readinessAutoreg({ pain: 'none', sleep: 'poor' }); return !/AND low energy/i.test(r.note); })());

console.log(`\n${fail === 0 ? '✓ ALL PASS' : '✗ FAILURES'} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
