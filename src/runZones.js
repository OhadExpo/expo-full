// PACES FROM HIS OWN TEST (23.10 #914 / #898 step 3, Ohad: "what is smarter and better for the runner? best program").
// A runner's training paces come from one honest number - how fast he can hold a continuous all-out effort - not from
// paces typed by hand. Daniels & Gilbert (1979): the oxygen cost of running at a speed and the share of VO2max a
// runner can hold for a duration give his VDOT from any race or time trial; every training pace is a share of it
// (Daniels, Daniels' Running Formula, 3rd ed., 2014). Checked against the published table: 5 km in 19:57 = VDOT 50.0,
// threshold 4:15 /km, interval 3:55 /km.
//
// Only a CONTINUOUS MAXIMAL effort can set them. A paced session ('5 x 1 km at 5:00-5:05' with walking rests) tells how
// he held a pace he was given, not how fast he can go - turning it into a VDOT would invent his fitness. So: a test
// day (runKind 'test') whose main work is one continuous piece of 1.5 km or more, with no pace range handed to him.
// Pure: no React, no Supabase.

// oxygen cost (ml/kg/min) of running at v metres per minute
const vo2At = (v) => -4.60 + 0.182258 * v + 0.000104 * v * v;
// the share of VO2max a runner holds for t minutes
const pctMax = (t) => 0.8 + 0.1894393 * Math.exp(-0.012778 * t) + 0.2989558 * Math.exp(-0.1932605 * t);
// the speed (m/min) whose oxygen cost is vo2
const vAt = (vo2) => (-0.182258 + Math.sqrt(0.182258 ** 2 + 4 * 0.000104 * (vo2 + 4.60))) / (2 * 0.000104);

export const vdotFrom = (metres, seconds) => {
  if (!(metres > 0 && seconds > 0)) return null;
  const t = seconds / 60;
  const v = vo2At(metres / t) / pctMax(t);
  return isFinite(v) && v > 15 && v < 90 ? v : null;
};
// s/km at a share of VDOT
export const paceAt = (vdot, share) => 60000 / vAt(vdot * share);

// Daniels' training intensities as shares of VDOT. Each range runs fast -> slow (lo = the faster pace in s/km).
export const ZONES = [
  { key: 'E', en: 'Easy', he: 'קל', fast: 0.70, slow: 0.62, use: ['easy', 'long'] },
  { key: 'M', en: 'Marathon', he: 'מרתון', fast: 0.83, slow: 0.79, use: [] },
  { key: 'T', en: 'Threshold', he: 'סף', fast: 0.88, slow: 0.86, use: ['tempo'] },
  { key: 'I', en: 'Interval', he: 'אינטרוולים', fast: 1.0, slow: 0.97, use: ['intervals'] },
  { key: 'R', en: 'Repetition', he: 'חזרות קצרות', fast: 1.08, slow: 1.05, use: [] },
];
export const zonesFor = (vdot) => ZONES.map((z) => ({ ...z, lo: Math.round(paceAt(vdot, z.fast)), hi: Math.round(paceAt(vdot, z.slow)) }));

const continuous = (seg) => {
  const p = seg && seg.plan;
  if (!p) return false;
  const sets = parseInt(p.sets, 10) || 1;
  return sets === 1 || !String(p.rest || '').trim();
};

// a = analyzeRunner(...). Returns { zones, vdot, source } from the newest usable test, or { zones: null, why, test }.
export function runnerZones(a) {
  if (!a) return null;
  // any running block's test, newest first (a.tests) - the test that closes one block prices the next
  const tests = (a.tests || (a.runs || []).filter((r) => r.kind === 'test')).slice().sort((x, y) => new Date(y.date) - new Date(x.date));
  for (const r of tests) {
    const main = (r.segs || []).filter((s) => s.role === 'main' && s.logged && s.km > 0);
    if (main.length !== 1) continue;
    const s = main[0];
    if (!continuous(s) || s.target) continue;          // a paced or broken-up piece is not a maximal effort
    if (s.km < 1.5 || !(s.sec > 0)) continue;
    const vdot = vdotFrom(s.km * 1000, s.sec);
    if (!vdot) continue;
    return { vdot: Math.round(vdot * 10) / 10, zones: zonesFor(vdot), source: { date: r.date, km: s.km, sec: s.sec, pace: s.sec / s.km, dayName: r.dayName } };
  }
  const last = tests[0];
  if (last) {
    const m = (last.segs || []).find((s) => s.role === 'main' && s.plan) || null;
    return { zones: null, why: 'paced', test: { date: last.date, dayName: last.dayName, sets: m && m.plan ? m.plan.sets : null, reps: m && m.plan ? m.plan.reps : null, tempo: m && m.plan ? m.plan.tempo : null } };
  }
  return { zones: null, why: 'none', test: null };
}
