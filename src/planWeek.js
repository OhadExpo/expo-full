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

// A DAY OF ONE WEEK (16.10 #850): day.onlyWeek = N puts the day in week N only (a block whose week 2 runs are not
// week 1's). No onlyWeek = every week, as before.
// a daily-routine day is logged any time, so it is in every week whatever onlyWeek says (it cannot be lost by a toggle)
export const dayInWeek = (d, week) => !d || d.kind === 'daily' || d.onlyWeek == null || d.onlyWeek === '' || Number(d.onlyWeek) === Number(week);
// sessions planned over weeks 1..n (the days of each week, daily-routine days excluded by the caller if it wants)
export function plannedSessions(days, n) {
  let c = 0;
  for (let w = 1; w <= n; w++) for (const d of days || []) if (dayInWeek(d, w)) c++;
  return c;
}

export function deriveWeekIdx(plan, cw, dupNames) {
  const planWeeks = Number(plan?.weeks) || 4;
  // Exclude daily-routine days (kind:'daily') from the week-advancement scan —
  // they're logged unlimited times and are NOT a weekly requirement, so counting
  // them as "un-logged" pinned a mixed plan's week forever (and made a non-active
  // plan re-log every set under week 1). Mirrors the header's d.kind !== 'daily'.
  const weekDays = (plan?.days || []).filter(d => d.kind !== 'daily' && plan?.kind !== 'daily' && d.name);
  const dayNames = weekDays.map(d => d.name);
  const logs = (cw || []).filter(w => isLogOfPlan(w, plan, dupNames));
  const done = new Set(logs.map(w => `${Number(w.week) || 1}|${w.dayName}`));
  const maxWk = logs.length ? Math.max(...logs.map(w => Number(w.week) || 1)) : 1;
  let nextWk = Math.max(1, maxWk);
  if (dayNames.length) {
    outer: for (let w = Math.max(1, maxWk); w <= planWeeks; w++) {
      for (const d of weekDays) { if (dayInWeek(d, w) && !done.has(`${w}|${d.name}`)) { nextWk = w; break outer; } }   // only the days of week w (#850)
    }
  } else {
    nextWk = Math.min(planWeeks, maxWk + (logs.length ? 1 : 0) || 1);
  }
  return Math.max(0, Math.min(planWeeks, nextWk) - 1);
}
