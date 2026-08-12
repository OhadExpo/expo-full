// Fixtures for synthesizeVerdict — the "if you read one thing" headline, the
// single most prominent coach-acted output in the whole Analysis report. Pins the
// fatigue/deload gating (main lifts only, thin-data guard) and the progressing
// consistency with the responding-split. Run: node scripts/verify-verdict.mjs
import { synthesizeVerdict } from '../src/lineageAnalysis.js';

let pass = 0, fail = 0;
const check = (name, cond) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); cond ? pass++ : fail++; };
const staple = (o) => ({ isMain: true, ballistic: false, trend: { dir: 'up', state: 'ok' }, stale: { stale: false }, ...o });
const okData = { sessionPct: 90, setsPct: 80, loggedSessions: 8 };
const calm = { adh: okData, region: { lower: { pct: 5 }, upper: { pct: 5 } }, acwr: { state: 'ok', band: 'ok' }, velocity: { state: 'thin' } };

// --- "progressing" must exclude stale + ballistic + accessories (match the
// responding-split, or the headline contradicts the detail) ---
check('clean-up main -> responding',
  synthesizeVerdict({ ...calm, staples: [staple({ title: 'Squat' })] }).headline.includes('responding'));
check('stale-but-up main -> NOT "keep progressing" (was a cross-section contradiction)',
  synthesizeVerdict({ ...calm, staples: [staple({ title: 'Squat', stale: { stale: true, mode: 'easy' } })] }).headline.includes('Steady'));
check('only ballistic climbing -> Steady (kg isnt the read on a jump)',
  synthesizeVerdict({ ...calm, staples: [staple({ title: 'DB Jump', ballistic: true })] }).headline.includes('Steady'));

// --- fatigue/deload is gated to MAIN, non-ballistic lifts (reviews H1/H3) ---
check('accessory e1RM dropping -> NOT a deload',
  synthesizeVerdict({ ...calm, staples: [staple({ title: 'Curl', isMain: false, trend: { dir: 'down', state: 'ok' } })] }).tone === 'ok');
check('ballistic e1RM dropping -> NOT a deload',
  synthesizeVerdict({ ...calm, staples: [staple({ title: 'Speed Squat', ballistic: true, trend: { dir: 'down', state: 'ok' } })] }).tone === 'ok');
check('MAIN lift dropping (enough data) -> deload warn',
  (() => { const v = synthesizeVerdict({ ...calm, staples: [staple({ title: 'Bench', trend: { dir: 'down', state: 'ok' } })] }); return v.tone === 'warn' && /deload/i.test(v.headline); })());
check('hard-stale MAIN lift -> deload + change-the-lift, not just add weight',
  (() => { const v = synthesizeVerdict({ ...calm, staples: [staple({ title: 'Deadlift', stale: { stale: true, mode: 'hard' } })] }); return v.tone === 'warn' && /change the Deadlift/i.test(v.headline); })());

// --- thin-data gate: fatigue signal but <3 logged sessions -> log first, NOT deload ---
check('fatigue signal + <3 logs -> info "log before you deload", never deload',
  (() => { const v = synthesizeVerdict({ ...calm, adh: { sessionPct: 90, setsPct: 80, loggedSessions: 2 }, staples: [staple({ title: 'Bench', trend: { dir: 'down', state: 'ok' } })] }); return v.tone === 'info' && /logging before you deload/i.test(v.headline); })());

// --- low adherence (no fatigue) -> check-in first ---
check('low adherence -> info "get him training"',
  (() => { const v = synthesizeVerdict({ ...calm, adh: { sessionPct: 50, setsPct: 80, loggedSessions: 6 }, staples: [staple({ title: 'Squat' })] }); return v.tone === 'info' && /get him training/i.test(v.headline); })());

// --- confidence tiers from data density ---
check('confidence high (sessionPct>=70 & setsPct>=60)',
  synthesizeVerdict({ ...calm, staples: [staple({ title: 'Squat' })] }).confidence === 'high');
check('confidence low (<3 logs)',
  synthesizeVerdict({ ...calm, adh: { sessionPct: 40, setsPct: 30, loggedSessions: 2 }, staples: [staple({ title: 'Squat' })] }).confidence === 'low');

console.log(`\n${fail === 0 ? '✓ ALL PASS' : '✗ FAILURES'} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
