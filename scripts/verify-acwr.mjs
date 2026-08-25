// verify-acwr.mjs — proves the ACWR engine against the corpus's OWN worked
// example (Turner & Comfort, Advanced S&C ch.9, Table 9.1 / Blanch & Gabbett
// 2016) plus band thresholds, sRPE, daily windows, and Foster monotony/strain.
// Run: node scripts/verify-acwr.mjs
import { sessionLoad, acwrBand, acwrFromDaily, weeklyACWR, monotonyStrain } from '../src/acwrEngine.js';

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; } else { fail++; console.log('  ✗ FAIL:', name); } };
const near = (a, b, eps = 0.01) => a != null && b != null && Math.abs(a - b) <= eps;

// 1) sRPE = minutes × RPE, junk → 0
ok('sRPE 60×7=420', sessionLoad(60, 7) === 420);
ok('sRPE guards blank→0', sessionLoad('', 7) === 0 && sessionLoad(60, 0) === 0 && sessionLoad(-5, 7) === 0);

// 2) CORPUS worked example — weekly loads 10,12,14,15,14,20,25,22 →
//    ACWR (acute÷mean-of-trailing-4-incl-current) for weeks 4..8 =
//    1.18, 1.02, 1.27, 1.35, 1.09  (1.35 flagged as a spike). This is the
//    book's own Table 9.1 validation case.
const weeks = [10, 12, 14, 15, 14, 20, 25, 22];
const expected = { 3: 1.18, 4: 1.02, 5: 1.27, 6: 1.35, 7: 1.09 };
for (const i of Object.keys(expected)) {
  const r = weeklyACWR(weeks, Number(i));
  ok(`corpus ACWR week${Number(i) + 1} ≈ ${expected[i]}`, near(Math.round(r.ratio * 100) / 100, expected[i]));
}
// the 1.35 week must read "elevated" (>1.3, <1.5), the 1.02/1.09 weeks "low"
ok('week7 (1.35) → elevated band', weeklyACWR(weeks, 6).band.key === 'elevated');
ok('week5 (1.02) → low band', weeklyACWR(weeks, 4).band.key === 'low');

// 3) Band thresholds (corpus): <0.8 detrained · 0.8–1.3 low · >1.3–<1.5 elevated · ≥1.5 high
ok('band 0.7 detrained', acwrBand(0.7).key === 'detrained');
ok('band 0.8 low (boundary in)', acwrBand(0.8).key === 'low');
ok('band 1.3 low (boundary in)', acwrBand(1.3).key === 'low');
ok('band 1.31 elevated', acwrBand(1.31).key === 'elevated');
ok('band 1.5 high (boundary in)', acwrBand(1.5).key === 'high');
ok('band null → none', acwrBand(null).key === 'none' && acwrBand(NaN).key === 'none');

// 4) Daily-window ACWR: a flat 100/day load → acute7=700, chronic28=2800,
//    chronicWeekly=700, ratio=1.0 (steady state = sweet spot).
const flat = {};
for (let d = 1; d <= 28; d++) flat[`2026-01-${String(d).padStart(2, '0')}`] = 100;
const dr = acwrFromDaily(flat, '2026-01-28');
ok('daily flat: acute7=700', dr.acute === 700);
ok('daily flat: ratio≈1.0', near(dr.ratio, 1.0));
ok('daily flat: low band', dr.band.key === 'low');
// high chronic base BUFFERS a short spike (corpus: high chronic load is
// protective) — a 4-day bump on top of steady 100/day stays sub-danger.
const bump = { '2026-02-01': 200, '2026-02-02': 200, '2026-02-03': 200, '2026-02-04': 200 };
ok('high chronic base buffers a spike (ratio < 1.5)', acwrFromDaily({ ...flat, ...bump }, '2026-02-04').ratio < 1.5);
// LOW chronic base + a hard acute week → danger (the actual injury pattern):
// 3 weeks light (50/day) then a heavy week (200/day).
const risky = {};
for (let d = 1; d <= 21; d++) risky[`2026-03-${String(d).padStart(2, '0')}`] = 50;
for (let d = 22; d <= 28; d++) risky[`2026-03-${String(d).padStart(2, '0')}`] = 200;
const sr = acwrFromDaily(risky, '2026-03-28');
ok('low chronic base + heavy week → ratio ≥ 1.5 (danger)', sr.ratio >= 1.5 && sr.band.key === 'high');
ok('no data → ratio null', acwrFromDaily({}, '2026-01-28').ratio === null);

// 5) Foster monotony + strain. Loads [400,0,300,0,500,0,0]: mean=171.4, and
//    strain = monotony × weekLoad. Even → high monotony; varied → lower.
const ms = monotonyStrain([400, 0, 300, 0, 500, 0, 0]);
ok('monotony computed', ms.monotony != null && ms.monotony > 0);
ok('strain = monotony × weekLoad', near(ms.strain, ms.monotony * ms.weekLoad, 0.001));
// An IDENTICAL-load week is the most monotonous week there is (sd = 0, so
// Foster's mean/SD is infinite). It used to return null and was reported as
// "no data", so it never tripped the >= 2 flag — audit 08-22 #62. This test
// previously tolerated that null, which is how it survived.
const flatWk = monotonyStrain([200, 200, 200, 200, 200, 200, 200]);
ok('identical-load week yields a monotony value, not null', flatWk.monotony != null);
ok('and it is flagged as high (>= 2)', flatWk.monotony >= 2);
ok('flat week → higher monotony than spiky', flatWk.monotony > ms.monotony);
ok('and its strain follows monotony x weekLoad', near(flatWk.strain, flatWk.monotony * flatWk.weekLoad, 0.001));
// Zero load all week is genuinely nothing to report.
ok('all-zero week stays null', monotonyStrain([0, 0, 0, 0, 0, 0, 0]).monotony === null);
ok('empty → nulls', monotonyStrain([]).monotony === null);

console.log(`\nverify-acwr: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
