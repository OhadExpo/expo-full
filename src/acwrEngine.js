// acwrEngine.js — session-RPE load + acute:chronic workload ratio (ACWR),
// monotony and strain for the BHBC team-monitoring surface (/bhbc).
//
// WHY: injury risk in team sport is best predicted not by absolute load but by
// the acute:chronic workload ratio — this week's load relative to the athlete's
// rolling 4-week load. Grounded in Ohad's Alexandria corpus:
//   • ACWR "sweet spot" 0.8–1.3 = low risk; ≥1.5 = risk climbs exponentially
//     (Blanch & Gabbett 2016, in Turner & Comfort, Advanced S&C, ch.9).
//   • High CHRONIC load is protective — a low chronic load means today's session
//     carries more relative risk (Hulin 2014). The danger pattern is a spike
//     after reduced training (travel / illness) — exactly the BCL road-trip case.
//   • Monotony = mean daily load ÷ SD; Strain = monotony × weekly load
//     (Foster 1998 — general sports-science reference, not from the corpus).
// Pure + dependency-free + honest: no data → null (never a fabricated ratio).
// Validated against the corpus's own worked example in scripts/verify-acwr.mjs.

// Session-RPE load (Foster): duration(min) × session RPE(0–10). Guards junk to 0.
export function sessionLoad(minutes, rpe) {
  const m = Number(minutes);
  const r = Number(rpe);
  if (!Number.isFinite(m) || !Number.isFinite(r) || m <= 0 || r <= 0) return 0;
  return m * r;
}

// Whole-day index (UTC days since epoch) from a 'YYYY-MM-DD' string. Used only
// for windowed sums; explicit-arg Date is deterministic (no Date.now()).
function dayNum(iso) {
  const t = new Date(String(iso) + 'T00:00:00Z').getTime();
  return Number.isFinite(t) ? Math.floor(t / 86400000) : NaN;
}

// Sum the loads whose date falls in the trailing `days`-day window ending at
// (and including) `asOfISO`. `daily` = { 'YYYY-MM-DD': loadNumber }.
export function sumWindow(daily, asOfISO, days) {
  const end = dayNum(asOfISO);
  if (!Number.isFinite(end)) return 0;
  let sum = 0;
  for (const [d, v] of Object.entries(daily || {})) {
    const n = dayNum(d);
    if (Number.isFinite(n) && n <= end && n > end - days) sum += Number(v) || 0;
  }
  return sum;
}

// Band for a ratio. Semantic status colors (NOT the brand cyan) — used only on
// the risk chips, per the control-material rule. Legible on both light + dark.
export function acwrBand(ratio) {
  if (ratio == null || !Number.isFinite(ratio)) return { key: 'none', label: 'No data', color: '#8A9099' };
  if (ratio < 0.8) return { key: 'detrained', label: 'Undertrained', color: '#4F9DE0' };
  if (ratio <= 1.3) return { key: 'low', label: 'Sweet spot', color: '#37B27C' };
  if (ratio < 1.5) return { key: 'elevated', label: 'Elevated', color: '#E0A73A' };
  return { key: 'high', label: 'Danger', color: '#DE4E3B' };
}

// Daily-resolution ACWR. acute = trailing `acute`-day load sum; chronic load is
// normalized to the acute window scale (28-day total ÷ 4 = avg weekly load), so
// the ratio is dimensionless. Returns ratio=null when there is no chronic base.
export function acwrFromDaily(daily, asOfISO, { acute = 7, chronic = 28 } = {}) {
  const a = sumWindow(daily, asOfISO, acute);
  const c = sumWindow(daily, asOfISO, chronic);
  const chronicWeekly = c / (chronic / acute); // e.g. 28d total ÷ 4 = weekly avg
  const ratio = chronicWeekly > 0 ? a / chronicWeekly : null;
  return { acute: a, chronic: c, chronicWeekly, ratio, band: acwrBand(ratio) };
}

// Weekly-resolution ACWR — reproduces the corpus's own method exactly:
// acute = this week's load; chronic = MEAN of the trailing `chronicWeeks`
// weeks INCLUDING this one; ratio = acute ÷ chronic. `weekLoads` is oldest→newest.
export function weeklyACWR(weekLoads, i, { chronicWeeks = 4 } = {}) {
  if (!Array.isArray(weekLoads) || i < 0 || i >= weekLoads.length) {
    return { acute: null, chronic: null, ratio: null, band: acwrBand(null) };
  }
  const start = Math.max(0, i - chronicWeeks + 1);
  const window = weekLoads.slice(start, i + 1).map((x) => Number(x) || 0);
  const chronic = window.reduce((s, x) => s + x, 0) / window.length;
  const acute = Number(weekLoads[i]) || 0;
  const ratio = chronic > 0 ? acute / chronic : null;
  return { acute, chronic, ratio, band: acwrBand(ratio) };
}

// Foster monotony + strain over a set of daily loads (rest days = 0 count).
// monotony = mean ÷ SD (population SD); strain = monotony × total week load.
export function monotonyStrain(dailyLoads) {
  const arr = (dailyLoads || []).map((x) => Number(x) || 0);
  const n = arr.length;
  if (!n) return { mean: 0, sd: 0, monotony: null, strain: null, weekLoad: 0 };
  const weekLoad = arr.reduce((s, x) => s + x, 0);
  const mean = weekLoad / n;
  const variance = arr.reduce((s, x) => s + (x - mean) ** 2, 0) / n;
  const sd = Math.sqrt(variance);
  const monotony = sd > 0 ? mean / sd : null;
  const strain = monotony != null ? monotony * weekLoad : null;
  return { mean, sd, monotony, strain, weekLoad };
}
