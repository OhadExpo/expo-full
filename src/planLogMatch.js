// planLogMatch.js — does a logged workout belong to THIS plan?
//
// The athlete portal merges BOTH members of a couple into one view (plans are
// fetched across the parent id and both member ids) while every workout row is
// saved under the shared parent client_id with only plan_name + day_name + week.
// When the two members hold identically-named plans with identical day names —
// exactly what the Neta+Tom repair produced — one member's log marked the
// other's day done, advanced the other's derived week, and ghosted one member's
// loads into the other's set rows (platform audit 2026-08-22 #31, verified).
//
// The plan id breaks that tie. It is deliberately NOT the primary key of the
// match: matching on the id whenever both sides have one would regress the
// ordinary case — delete a block and recreate it under the same name (a
// re-import, a rebuild) and every existing log would suddenly belong to no plan,
// restarting the derived week at 1 and clearing every done badge. The name has
// always been the link and stays the link.
//
// `dupNames` is the set of plan names appearing MORE THAN ONCE in what the
// portal is currently showing. Only there does the id get to decide, and only
// when both sides actually carry one.

export function isLogOfPlan(w, plan, dupNames) {
  if (!w || !plan) return false;
  if (w.planName !== plan.name) return false;
  if (dupNames && dupNames.has(plan.name) && w.planId && plan.id) return w.planId === plan.id;
  return true;
}

/** Plan names that appear more than once in `plans`. */
export function duplicatePlanNames(plans) {
  const seen = new Map();
  for (const p of plans || []) { if (p && p.name) seen.set(p.name, (seen.get(p.name) || 0) + 1); }
  return new Set([...seen.entries()].filter(([, c]) => c > 1).map(([n]) => n));
}
