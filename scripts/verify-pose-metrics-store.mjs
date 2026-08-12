// Fixtures for the Bar-Speed Vault read functions (src/poseMetricsStore.js) — the
// INJURY-WATCH (getAthleteAsymmetryTrend: is a limb's L/R gap widening?), warm-up
// READINESS (getLoadVelocityRef: today's bar speed vs the athlete's speed at that
// load), and the velocity-loss vault trend. A false widening flag is a wrong
// clinical call, so pin the noise guards: median-not-max, drift thresholds by
// point count, flag needs >=2 films + a persistent/widening gap, ±3% load band,
// same-lift-only joint series. Seeds the vault directly (tests the READS, not the
// MediaPipe write path). Run: node scripts/verify-pose-metrics-store.mjs

const _mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (_mem.has(k) ? _mem.get(k) : null),
  setItem: (k, v) => { _mem.set(k, String(v)); },
  removeItem: (k) => { _mem.delete(k); },
  clear: () => { _mem.clear(); },
};
const { getAthleteAsymmetryTrend, getLoadVelocityRef, getAthleteVault, savePoseMetric } = await import('../src/poseMetricsStore.js');

let pass = 0, fail = 0;
const check = (name, cond) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); cond ? pass++ : fail++; };
const seed = (vault) => { _mem.clear(); localStorage.setItem('expo-pose-metrics', JSON.stringify(vault)); };
const knee = (date, pct) => ({ date, asymRows: [{ joint: 'knee', pct, weaker: 'L' }] });

// ── getAthleteAsymmetryTrend — the injury-watch ──
seed({ a: { 'back squat': { title: 'Back Squat', entries: [knee('2026-05-01', 10), knee('2026-05-08', 15), knee('2026-05-22', 22)] } } });
const wide = getAthleteAsymmetryTrend('a');
check('asym: knee 10->15->22 -> drift widening', wide.joints[0].drift === 'widening');
check('asym: current 22 -> flagged (>=18)', wide.joints[0].flag === true && wide.anyFlag === true);
check('asym: films = distinct dates (3)', wide.films === 3);

seed({ a: { 'back squat': { title: 'Back Squat', entries: [knee('2026-05-01', 10), knee('2026-05-08', 11), knee('2026-05-22', 12)] } } });
const stable = getAthleteAsymmetryTrend('a');
check('asym: 10->11->12 -> stable, NOT flagged', stable.joints[0].drift === 'stable' && stable.joints[0].flag === false);

seed({ a: { 'back squat': { title: 'Back Squat', entries: [knee('2026-05-01', 5), knee('2026-05-08', 10), knee('2026-05-22', 14)] } } });
const wideMid = getAthleteAsymmetryTrend('a');
check('asym: widening to 14 (>=12 & widening) -> flagged even below 18', wideMid.joints[0].flag === true);

seed({ a: { 'back squat': { title: 'Back Squat', entries: [knee('2026-05-01', 25)] } } });
check('asym: single film (even at 25%) -> NOT flagged (needs a trend)', getAthleteAsymmetryTrend('a').joints[0].flag === false);

// median of same-date screens (robust to one off-angle 2D reading), not the max
seed({ a: { 'back squat': { title: 'Back Squat', entries: [
  { date: '2026-05-01', asymRows: [{ joint: 'knee', pct: 20, weaker: 'L' }] },
  { date: '2026-05-01', asymRows: [{ joint: 'knee', pct: 10, weaker: 'L' }] },
  knee('2026-05-08', 12)] } } });
check('asym: same-date screens medianed (20&10 -> 15), not maxed', getAthleteAsymmetryTrend('a').joints[0].series[0].pct === 15);

// never pool a joint across DIFFERENT lifts (squat knee != deadlift knee)
seed({ a: {
  'back squat': { title: 'Back Squat', entries: [knee('2026-05-01', 10), knee('2026-05-08', 12)] },
  'deadlift': { title: 'Deadlift', entries: [knee('2026-05-01', 8), knee('2026-05-08', 9)] },
} });
check('asym: knee kept per-lift (2 separate series, never pooled)', getAthleteAsymmetryTrend('a').joints.length === 2);

check('asym: no vault -> empty, no flag', getAthleteAsymmetryTrend('nobody').anyFlag === false);

// ── getLoadVelocityRef — warm-up readiness ──
seed({ a: { 'back squat': { title: 'Back Squat', entries: [
  { date: '2026-05-01', load: 100, bestMean: 0.50, reps: 5 },
  { date: '2026-05-08', load: 100, bestMean: 0.60, reps: 5 },
  { date: '2026-05-15', load: 100, bestMean: 0.70, reps: 5 },
  { date: '2026-05-18', load: 130, bestMean: 0.40, reps: 3 }, // out of ±3% band
] } } });
const ref = getLoadVelocityRef('a', 'Back Squat', 100, '2026-05-25');
check('ref: median prior velocity at ~same load (0.6, not max 0.7)', ref.refVel === 0.60 && ref.n === 3);
check('ref: loads outside ±3% excluded (130kg ignored)', ref.n === 3);
check('ref: excludes TODAY\'s own film', getLoadVelocityRef('a', 'Back Squat', 100, '2026-05-15').n === 2);
check('ref: no comparable history -> null', getLoadVelocityRef('a', 'Back Squat', 200, '2026-05-25') === null);

// ── getAthleteVault — velocity-loss trend ──
seed({ a: { 'back squat': { title: 'Back Squat', entries: [
  { date: '2026-05-01', lossPct: 10 }, { date: '2026-05-08', lossPct: 20 } ] },
  'bench': { title: 'Bench', entries: [{ date: '2026-05-01', lossPct: 20 }, { date: '2026-05-08', lossPct: 10 }, { date: '2026-05-15', lossPct: 8 }] } } });
const vault = getAthleteVault('a');
check('vault: richest history first (Bench 3 before Squat 2)', vault[0].title === 'Bench' && vault[0].count === 3);
check('vault: rising velocity-loss -> trend worse', vault.find((l) => l.title === 'Back Squat').trend === 'worse');
check('vault: falling velocity-loss -> trend better', vault.find((l) => l.title === 'Bench').trend === 'better');

// ── #150 same-day clip collision: a second DIFFERENT clip of the same lift filmed
//    the same day must COEXIST (was silently clobbered); re-analysing the SAME
//    clip must REPLACE; the vault trend collapses same-day clips to one point ──
const mkAnalysis = (bestMean, lossPct) => ({
  velocity: { bestMean, finalLossPct: lossPct },
  romTempo: { maxRom: 100 }, jointRom: [], repCount: 5, kind: 'squat',
  captureQuality: { grade: 'good' },
});
const rawEntries = (cid, ex) => (JSON.parse(localStorage.getItem('expo-pose-metrics') || '{}')[cid] || {})[ex]?.entries || [];
_mem.clear();
savePoseMetric({ clientId: 'z', exercise: 'Squat', date: '2026-06-01', analysis: mkAnalysis(0.60, 20), clipKey: 'urlA' });
savePoseMetric({ clientId: 'z', exercise: 'Squat', date: '2026-06-01', analysis: mkAnalysis(0.70, 30), clipKey: 'urlB' });
check('#150 two DIFFERENT clips same day COEXIST (2 entries, not clobbered)', rawEntries('z', 'squat').length === 2);
savePoseMetric({ clientId: 'z', exercise: 'Squat', date: '2026-06-01', analysis: mkAnalysis(0.65, 25), clipKey: 'urlA' });
check('#150 re-analysing the SAME clip REPLACES (still 2 entries)', rawEntries('z', 'squat').length === 2);
check('#150 re-analysed clip A updated to bestMean 0.65', rawEntries('z', 'squat').find((e) => e.clip === 'urlA').bestMean === 0.65);
check('#150 vault collapses same-day clips to ONE date-point', getAthleteVault('z')[0].count === 1);
// legacy same-day entry (no clip id) + a new clip id -> coexist (nothing lost on migration)
seed({ y: { squat: { title: 'Squat', entries: [{ date: '2026-06-01', lossPct: 15, bestMean: 0.5 }] } } });
savePoseMetric({ clientId: 'y', exercise: 'Squat', date: '2026-06-01', analysis: mkAnalysis(0.6, 20), clipKey: 'urlNew' });
check('#150 legacy id-less same-day entry preserved when a new clip lands', rawEntries('y', 'squat').length === 2);
// vault collapse must not fake a 2-point trend from two same-day clips alone
seed({ w: { squat: { title: 'Squat', entries: [
  { date: '2026-06-01', lossPct: 10, bestMean: 0.5 }, { date: '2026-06-01', lossPct: 40, bestMean: 0.7 } ] } } });
check('#150 two same-day clips only -> ONE point, trend flat (no fake trend)', getAthleteVault('w')[0].count === 1 && getAthleteVault('w')[0].trend === 'flat');

console.log(`\n${fail === 0 ? '✓ ALL PASS' : '✗ FAILURES'} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
