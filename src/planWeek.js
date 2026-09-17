// THE ATHLETE'S CURRENT WEEK - one rule, shared by the portal, the single logger and the
// group logger, so all three agree on which week an athlete is in.
//
// Scan weeks, then days: open on the week of the FIRST un-logged (week, day). A partly
// finished week stays put (W1 day1 done, day2 not -> W1). A finished week advances
// (Ohad 17.9: "if he logged all workouts for a certain week - next week now").
//
// Daily-routine days (kind:'daily') are excluded: they are logged as often as the athlete
// likes and are not a weekly requirement, so counting them as un-logged pinned a mixed
// plan's week forever, and they must never advance a week either.
import { isLogOfPlan } from './planLogMatch.js';

export function deriveWeekIdx(plan, cw, dupNames) {
  const planWeeks = Number(plan?.weeks) || 4;
  // Exclude daily-routine days (kind:'daily') from the week-advancement scan —
  // they're logged unlimited times and are NOT a weekly requirement, so counting
  // them as "un-logged" pinned a mixed plan's week forever (and made a non-active
  // plan re-log every set under week 1). Mirrors the header's d.kind !== 'daily'.
  const dayNames = (plan?.days || []).filter(d => d.kind !== 'daily' && plan?.kind !== 'daily').map(d => d.name).filter(Boolean);
  const logs = (cw || []).filter(w => isLogOfPlan(w, plan, dupNames));
  const done = new Set(logs.map(w => `${Number(w.week) || 1}|${w.dayName}`));
  const maxWk = logs.length ? Math.max(...logs.map(w => Number(w.week) || 1)) : 1;
  let nextWk = Math.max(1, maxWk);
  if (dayNames.length) {
    outer: for (let w = Math.max(1, maxWk); w <= planWeeks; w++) {
      for (const dn of dayNames) { if (!done.has(`${w}|${dn}`)) { nextWk = w; break outer; } }
    }
  } else {
    nextWk = Math.min(planWeeks, maxWk + (logs.length ? 1 : 0) || 1);
  }
  return Math.max(0, Math.min(planWeeks, nextWk) - 1);
}
