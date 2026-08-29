// bhbcReturnLoad.js — the one alert worth having: LOAD crossed with MEDICAL.
//
// The two halves of the BHBC zone never talk to each other. The load board
// knows an athlete's 7-day load; the medical board knows he came back from an
// ankle six days ago. Neither knows both, so the single most predictable
// re-injury pattern in team sport — a returning athlete ramped straight back
// to his pre-injury volume — is invisible in a zone that has all the data.
//
// Deliberately ONE alert type. A board of twelve warnings is ignored by week
// two, and the point of this is that it gets read.
//
// Pure: no React, no store access, no clock. `today` is passed in, so the
// whole thing is testable — see scripts/verify-return-load.mjs.

/** Days between two ISO dates (b - a), or null if either is unusable. */
export function dayGap(aISO, bISO) {
  if (!aISO || !bISO) return null;
  const a = Date.parse(aISO + 'T00:00:00Z'), b = Date.parse(bISO + 'T00:00:00Z');
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 86400000);
}

/** ISO date `n` days before `iso`. */
export function shiftISO(iso, n) {
  const t = Date.parse(iso + 'T00:00:00Z');
  if (!Number.isFinite(t)) return null;
  return new Date(t - n * 86400000).toISOString().slice(0, 10);
}

/** Sum of a daily-load map over the `days` days ending on `endISO` inclusive. */
export function sumDays(loads, endISO, days) {
  let total = 0;
  for (let i = 0; i < days; i++) {
    const d = shiftISO(endISO, i);
    const v = d && loads ? loads[d] : 0;
    if (typeof v === 'number' && Number.isFinite(v)) total += v;
  }
  return total;
}

/**
 * When did he come back? An injury record has no "returned on" field — it has
 * `resolved`, a `progress` log (newest first) and `updatedAt`. The last thing
 * written to a resolved injury IS the moment it was closed, so that is the
 * return date, with updatedAt as the fallback when nothing was logged.
 */
export function returnDateOf(injury) {
  if (!injury || !injury.resolved) return null;
  const p = (injury.progress || []).map((x) => x && x.date).filter(Boolean).sort();
  if (p.length) return p[p.length - 1];
  if (typeof injury.updatedAt === 'string' && injury.updatedAt.length >= 10) return injury.updatedAt.slice(0, 10);
  return null;
}

// How much of his own pre-injury week an athlete should be doing, by how long
// he has been back. These are the conservative end of return-to-play practice
// and they agree with the project's own rule that post-injury weekly volume
// rises ~5% at a time rather than ~10%. They are a PROMPT TO LOOK, not a law:
// the alert says what the numbers are and leaves the decision with the coach.
export const RAMP = [
  { throughDay: 7, cap: 0.6 },
  { throughDay: 14, cap: 0.8 },
  { throughDay: 28, cap: 1.0 },
];

export function capForDay(daysBack) {
  for (const r of RAMP) if (daysBack <= r.throughDay) return r.cap;
  return null; // past 28 days he is simply back
}

/**
 * Athletes who are back from injury and already loading faster than their own
 * pre-injury baseline says they should.
 *
 * @param roster  [{ id, name }]
 * @param loads   { [athleteId]: { loads: { 'YYYY-MM-DD': number } } }
 * @param medical { [athleteId]: { injuries: [...] } }
 * @param today   ISO date
 */
export function returnToLoadFlags({ roster = [], loads = {}, medical = {}, today, minBaseline = 60 }) {
  if (!today) return [];
  const out = [];
  for (const t of roster) {
    if (!t || !t.id) continue;
    const injuries = ((medical[t.id] || {}).injuries || []).filter((i) => i && i.resolved);
    // The most recent return only. An older injury from November is not the
    // reason today's load matters.
    let latest = null, latestBack = null;
    for (const inj of injuries) {
      const rd = returnDateOf(inj);
      const back = dayGap(rd, today);
      if (back == null || back < 0 || back > 28) continue;
      if (latestBack == null || back < latestBack) { latest = inj; latestBack = back; }
    }
    if (!latest) continue;

    const rec = loads[t.id] || {};
    const daily = rec.loads || {};
    const weekLoad = sumDays(daily, today, 7);

    // His baseline is HIS OWN pre-injury week, not a squad average: a 12-minute
    // bench player and a 32-minute starter have nothing to say to each other.
    const onset = latest.onsetDate;
    if (!onset) continue;
    const preEnd = shiftISO(onset, 1);          // the day before he got hurt
    const baseline = sumDays(daily, preEnd, 28) / 4;
    if (!(baseline >= minBaseline)) continue;   // too little history to judge

    const cap = capForDay(latestBack);
    if (cap == null) continue;
    const pct = weekLoad / baseline;
    if (pct <= cap) continue;

    out.push({
      id: t.id,
      name: t.name || t.id,
      bodyPart: latest.bodyPart || null,
      daysBack: latestBack,
      weekLoad: Math.round(weekLoad),
      baseline: Math.round(baseline),
      pct: Math.round(pct * 100),
      cap: Math.round(cap * 100),
      severity: pct > cap * 1.25 ? 'high' : 'watch',
    });
  }
  // Worst overshoot first — the list is meant to be read top-down and stopped.
  return out.sort((a, b) => (b.pct - b.cap) - (a.pct - a.cap));
}
