// trainingMonotony.js — Foster Training Monotony & Strain from logged tonnage.
//
// A SECOND injury/illness lens that ACWR structurally can't see: ACWR is a
// week-over-week RATIO (this week's load vs the chronic average), so a lifter who
// grinds the SAME load every single day sits at ACWR ~1.0 and looks fine — while
// the monotony of it is exactly what Foster found predicts illness/overuse. This
// reads the WITHIN-week distribution: hard/easy variation is protective, a flat
// daily load is the risk.
//   • Monotony = mean daily load / SD of daily load across a 7-day microcycle,
//     REST DAYS COUNTED AS 0 (a rest day is variation, and lowers monotony).
//   • Strain   = weekly load × monotony (high volume AND monotonous = worst).
//   • Foster 1998, "Monitoring training in athletes with reference to overtraining
//     syndrome" (Med Sci Sports Exerc): monotony >2.0 is the classic caution line.
//
// MARKET GAP: wellness apps log session-RPE; none compute Foster monotony/strain
// off the SESSION TONNAGE a coach already has. Pairs with tonnageACWR in the
// Load & Volume card — ACWR answers "did load spike?", this answers "is it a
// monotonous grind?". Pure + honest (a partial week returns 'thin', never a
// fabricated ratio). GREENLIGHT-GATED: no UI until Ohad approves.

const num = (x) => (x == null || x === '' || isNaN(+x) ? null : +x);
const ms = (d) => { const t = Date.parse(d); return Number.isFinite(t) ? t : NaN; };

// sessions: [{ date, exercises:[{ sets:[{ load, reps, done }] }] }] (same shape
// tonnageACWR reads). nowMs optional (defaults to the latest session date).
// Returns { state:'ok'|'thin', monotony, strain, weeklyLoad, band, trainingDays,
//   dailyLoads:[7], haveDays } — dailyLoads oldest→newest for a UI sparkline.
export function trainingMonotony(sessions, nowMs) {
  const dayMs = 86400000;
  const sess = (sessions || []).map((s) => {
    let t = 0;
    for (const ex of s.exercises || []) for (const st of ex.sets || []) {
      const l = num(st.load), r = num(st.reps);
      if (l != null && r != null && st.done !== false) t += l * r;
    }
    return { t, date: ms(s.date) };
  }).filter((s) => Number.isFinite(s.date) && s.t > 0);

  if (!sess.length) return { state: 'thin', reason: 'no logged tonnage yet', trainingDays: 0, haveDays: 0 };
  const now = nowMs || Math.max(...sess.map((s) => s.date));

  // Bucket the trailing 7 calendar days into per-DAY tonnage (a day can hold two
  // sessions — sum them). Day index 0 = 6 days ago … 6 = the `now` day.
  const startDay = Math.floor((now - 6 * dayMs) / dayMs);
  const daily = new Array(7).fill(0);
  let anyInWindow = false;
  for (const s of sess) {
    const di = Math.floor(s.date / dayMs) - startDay;
    if (di >= 0 && di <= 6) { daily[di] += s.t; anyInWindow = true; }
  }
  if (!anyInWindow) return { state: 'thin', reason: 'no sessions in the last 7 days', trainingDays: 0, haveDays: 0, dailyLoads: daily };

  const trainingDays = daily.filter((d) => d > 0).length;
  // Monotony needs a real DISTRIBUTION — <2 training days can't characterise
  // within-week variation, and a single spike among zeros reads as LOW monotony
  // (safe direction) but isn't a meaningful "grind" signal. Gate to >=2 days.
  if (trainingDays < 2) {
    return { state: 'thin', reason: 'need >=2 training days in the week for a monotony read', trainingDays, haveDays: trainingDays, dailyLoads: daily };
  }

  const mean = daily.reduce((a, b) => a + b, 0) / 7;
  const variance = daily.reduce((a, b) => a + (b - mean) ** 2, 0) / 7; // population SD (Foster)
  const sd = Math.sqrt(variance);
  const weeklyLoad = Math.round(daily.reduce((a, b) => a + b, 0));
  // Foster monotony is mean/SD — unbounded as SD -> 0. Its ACTIONABLE range is
  // ~0.5-2.5; a near-flat week maths out to 30+, which is no more informative than
  // "extreme grind" yet would swamp any strain trend, and would read absurdly next
  // to the all-identical (SD=0) case. Cap at one sensible ceiling so the SD=0 and
  // near-SD=0 cases AGREE and the number stays interpretable. `capped` flags it.
  const CAP = 3;
  const rawMon = sd < 1e-9 ? Infinity : mean / sd;
  const capped = rawMon > CAP;
  const monotony = capped ? CAP : +rawMon.toFixed(2);
  const band = monotony >= 2.0 ? 'high' : monotony >= 1.5 ? 'moderate' : 'varied';
  return {
    state: 'ok',
    monotony,
    strain: Math.round(weeklyLoad * monotony),
    weeklyLoad,
    band,
    trainingDays,
    haveDays: trainingDays,
    dailyLoads: daily.map((d) => Math.round(d)),
    capped,
  };
}
