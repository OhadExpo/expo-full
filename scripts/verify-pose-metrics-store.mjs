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
const { getAthleteAsymmetryTrend, getLoadVelocityRef, getAthleteVault, savePoseMetric, isVelocityLossLift } = await import('../src/poseMetricsStore.js');

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

// ── #171 BAR SPEED gated to grinding LOADED lifts, never a ballistic/reactive
//    drill — velocity-loss on a pogo/jump/snap-down is nonsense that erodes trust ──
check('#171 BB RDL is velocity-valid', isVelocityLossLift('BB RDL') === true);
check('#171 Back Squat is velocity-valid', isVelocityLossLift('Back Squat') === true);
check('#171 DB Bench Press is velocity-valid', isVelocityLossLift('DB Bench Press') === true);
check('#171 Weighted SL Snap-Down excluded', isVelocityLossLift('Weighted SL Snap-Down') === false);
check('#171 SL Pogo Lateral Jump excluded', isVelocityLossLift('SL Pogo Lateral Jump') === false);
check('#171 Depth Jump excluded', isVelocityLossLift('Depth Jump') === false);
check('#171 MB Chest Throw excluded', isVelocityLossLift('MB Chest Throw') === false);
check('#171 Box Jump excluded', isVelocityLossLift('Box Jump') === false);
check('#171 Broad Jump excluded', isVelocityLossLift('Broad Jump') === false);
// write path: a ballistic clip with no bilateral L/R read stores NOTHING (velocity
// gated off, no symmetry) — it never becomes a bar-speed point.
_mem.clear();
check('#171 plyo (velocity gated, no L/R) stores nothing',
  savePoseMetric({ clientId: 'p', exercise: 'Box Jump', date: '2026-07-01', analysis: mkAnalysis(0.9, 50), clipKey: 'u1' }) === null);
// a valid grinding lift still stores its velocity normally
check('#171 grinding lift still stores velocity',
  savePoseMetric({ clientId: 'p', exercise: 'BB RDL', date: '2026-07-01', analysis: mkAnalysis(0.6, 12), clipKey: 'u2' })?.bestMean === 0.6);
// read path: even legacy velocity wrongly stored on a ballistic lift is dropped
seed({ q: {
  'sl pogo lateral jump': { title: 'SL Pogo Lateral Jump', entries: [{ date: '2026-07-01', lossPct: 50, bestMean: 0.9 }, { date: '2026-07-08', lossPct: 55, bestMean: 0.8 }] },
  'bb rdl': { title: 'BB RDL', entries: [{ date: '2026-07-01', lossPct: 12, bestMean: 0.6 }] },
} });
const gated = getAthleteVault('q');
check('#171 vault drops the legacy-stored pogo, keeps BB RDL', gated.length === 1 && gated[0].title === 'BB RDL');

// ── review H1: a manual (no-clip) save must NOT wipe clip-stamped auto entries ──
_mem.clear();
savePoseMetric({ clientId: 'h', exercise: 'BB Squat', date: '2026-08-01', analysis: mkAnalysis(0.60, 20), clipKey: 'auto1' });
savePoseMetric({ clientId: 'h', exercise: 'BB Squat', date: '2026-08-01', analysis: mkAnalysis(0.58, 25), clipKey: 'auto2' });
savePoseMetric({ clientId: 'h', exercise: 'BB Squat', date: '2026-08-01', analysis: mkAnalysis(0.62, 18) }); // manual, NO clipKey
const hEntries = rawEntries('h', 'bb squat');
check('H1 manual no-clip save coexists, keeps both auto clips (3 entries)', hEntries.length === 3);
check('H1 re-doing a no-clip save replaces only the prior no-clip (still 3)',
  (savePoseMetric({ clientId: 'h', exercise: 'BB Squat', date: '2026-08-01', analysis: mkAnalysis(0.61, 19) }), rawEntries('h', 'bb squat').length) === 3);

// ── review M1: the day's velocity-LOSS = the most-fatigued set, not the fastest clip's ──
seed({ m: { 'bb squat': { title: 'BB Squat', entries: [
  { date: '2026-08-01', bestMean: 0.70, lossPct: 5 },   // warm-up: fastest, low fatigue
  { date: '2026-08-01', bestMean: 0.55, lossPct: 35 },  // top set: slower, high fatigue
] } } });
const mv = getAthleteVault('m')[0];
check('M1 collapsed day reports the WORKING set fatigue (loss 35, not warm-up 5)', mv.entries[0].lossPct === 35);
check('M1 collapsed day keeps the fastest bestMean for readiness (0.70)', mv.entries[0].bestMean === 0.70);

// ── review M2/L1: Olympic lifts, KB swing, wall ball, and gerund plyos excluded ──
check('M2 Power Clean excluded', isVelocityLossLift('Power Clean') === false);
check('M2 Hang Snatch excluded', isVelocityLossLift('Hang Snatch') === false);
check('M2 Push Jerk excluded', isVelocityLossLift('Push Jerk') === false);
check('M2 Kettlebell Swing excluded', isVelocityLossLift('Kettlebell Swing') === false);
check('M2 Wall Ball excluded', isVelocityLossLift('Wall Ball') === false);
check('M2 carve-out: Snatch-Grip RDL stays velocity-valid', isVelocityLossLift('Snatch-Grip RDL') === true);
check('M2 carve-out: Clean-Grip Deadlift stays velocity-valid', isVelocityLossLift('Clean-Grip Deadlift') === true);
check('L1 Box Jumping (gerund) excluded', isVelocityLossLift('Box Jumping') === false);
check('L1 Single-Leg Bounding (gerund) excluded', isVelocityLossLift('Single-Leg Bounding') === false);

console.log(`\n${fail === 0 ? '✓ ALL PASS' : '✗ FAILURES'} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
