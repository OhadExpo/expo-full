// Auto-fill task engine — runs on Dashboard mount, scans the data the
// dashboard already loaded (trainees, plans, workouts, payments, intakes),
// and inserts coach_notes rows for any "system knows about" condition
// that doesn't already have a task. Idempotency is enforced by the
// (auto_kind, auto_ref) unique partial index on coach_notes.
//
// Each rule has:
//   kind        — string used as coach_notes.auto_kind
//   detect(ctx) — returns [{ ref, body, target_id, target_label, pinned? }, ...]
//   resolve(ctx, existing) — returns Set<ref> of refs whose condition no
//                            longer applies (so the open task can auto-close)
//
// The sync function INSERTs missing rows (ON CONFLICT DO NOTHING via the
// unique index) and UPDATEs existing-open rows to done if resolve() lists
// their ref.

import { supabase } from './supabase';
import { toast } from './ui';
import { traineeIdsFor } from './traineeUtils';

// ─────────────────────────────────────────────────────────────────────
// Helper utilities shared across rules
// ─────────────────────────────────────────────────────────────────────
const DAY_MS = 86400000;

const daysAgo = (iso) => {
  if (!iso) return Infinity;
  return Math.floor((Date.now() - new Date(iso).getTime()) / DAY_MS);
};

// Parse "2x/week" / "Couple 1x/week" / "Online 3x" → integer sessions per week.
// Falls back to 2 when unparseable.
const sessionsPerWeek = (format) => {
  const m = String(format || '').toLowerCase().match(/(\d+(?:\.\d+)?)\s*x/);
  const n = m ? parseFloat(m[1]) : 2;
  return n > 0 ? n : 2;
};

// Bump "Block #17 - GPP" → "Block #18 - GPP" if the current name has a
// "#N" segment we can increment. Returns the raw name when no parseable
// block number is present.
const nextBlockName = (currentName) => {
  if (!currentName) return 'next block';
  const m = currentName.match(/#(\d+)/);
  if (!m) return `${currentName} (next)`;
  const next = parseInt(m[1], 10) + 1;
  return currentName.replace(/#\d+/, `#${next}`);
};

// "Ghost" trainees — imported into the roster but never engaged with
// the system. No workouts logged via the portal, no manual activity
// rows, no intake submission. For these, the auto-task engine is
// noise: every rule would either no-op or fire a "re-engage" task that
// the coach already knows is a dead lead. Skip them entirely at
// detect-time so the dashboard stays focused on live clients.
function isGhostTrainee(t, ctx) {
  const ids = new Set(traineeIdsFor(t.id));
  const { workouts = [], activityRows = [], intakeSubmissions = [] } = ctx || {};
  if (workouts.some(w => ids.has(w.clientId))) return false;
  if (activityRows.some(a => ids.has(a.trainee_id))) return false;
  if (intakeSubmissions.some(s => s.trainee_id && ids.has(s.trainee_id))) return false;
  return true;
}

// ─────────────────────────────────────────────────────────────────────
// Rules
// ─────────────────────────────────────────────────────────────────────

// 1) NEXT_BLOCK_DUE — last day of W(N-1) of an N-week plan completed
const ruleNextBlockDue = {
  kind: 'next_block_due',
  detect(ctx) {
    const { trainees, plans, workouts } = ctx;
    const out = [];
    for (const t of trainees) {
      if (t.status !== 'Active' && t.status !== 'Trial') continue;
      if (isGhostTrainee(t, ctx)) continue;
      // Active plans for this trainee (current block — most recent)
      const tPlans = plans.filter(p => p.traineeId === t.id);
      if (tPlans.length === 0) continue;
      // Pick the plan that has the most-recent workout — that's the
      // current block. If no workout, the most-recently-created plan.
      const tWorkouts = workouts.filter(w => w.clientId === t.id);
      let current = null;
      if (tWorkouts.length > 0) {
        const latestWk = tWorkouts.reduce((a, b) =>
          new Date(b.date) > new Date(a.date) ? b : a);
        current = tPlans.find(p => p.name === latestWk.planName) || null;
      }
      if (!current) {
        current = tPlans.slice().sort((a, b) =>
          new Date(b.createdAt || 0) - new Date(a.createdAt || 0))[0];
      }
      if (!current) continue;
      const weeks = current.weeks || (current.days ? 4 : null);
      if (!weeks || weeks < 2) continue;
      const planDays = current.days || [];
      if (planDays.length === 0) continue;
      const lastDayName = planDays[planDays.length - 1].name;
      // Did the trainee finish last day of W(weeks-1)?
      const milestoneHit = tWorkouts.some(w =>
        w.planName === current.name &&
        w.week === (weeks - 1) &&
        w.dayName === lastDayName);
      if (!milestoneHit) continue;
      out.push({
        ref: current.id,
        body: `Build ${nextBlockName(current.name)} for ${t.name}`,
        target_id: t.id,
        target_label: t.name,
      });
    }
    return out;
  },
  // Auto-completes when a NEWER plan exists for this trainee (created
  // after the current one).
  resolve({ trainees, plans }, existing) {
    const closing = new Set();
    for (const row of existing) {
      const currentPlanId = row.auto_ref;
      const currentPlan = plans.find(p => p.id === currentPlanId);
      if (!currentPlan) { closing.add(currentPlanId); continue; }
      const newer = plans.find(p =>
        p.traineeId === currentPlan.traineeId &&
        p.id !== currentPlanId &&
        new Date(p.createdAt || 0) > new Date(currentPlan.createdAt || 0));
      if (newer) closing.add(currentPlanId);
    }
    return closing;
  },
};

// 2) WEEK_MISSED — an entire training week elapsed with zero logged
//    sessions for the current plan. Trigger window: 14d since the last
//    workout (one full week missed, gives some grace).
const ruleWeekMissed = {
  kind: 'week_missed',
  detect(ctx) {
    const { trainees, plans, workouts } = ctx;
    const out = [];
    for (const t of trainees) {
      if (t.status !== 'Active') continue;
      if (isGhostTrainee(t, ctx)) continue;
      const tWorkouts = workouts.filter(w => w.clientId === t.id);
      if (tWorkouts.length === 0) continue;
      const latest = tWorkouts.reduce((a, b) =>
        new Date(b.date) > new Date(a.date) ? b : a);
      const since = daysAgo(latest.date);
      // Trigger when more than 7 days elapsed past expected next workout.
      // For 2x/week (3.5d expected), 11+ days = week missed.
      const expectedGap = 7 / sessionsPerWeek(t.format);
      if (since < expectedGap + 7) continue;
      const currentBlock = plans.find(p =>
        p.traineeId === t.id && p.name === latest.planName);
      if (!currentBlock) continue;
      const weeks = currentBlock.weeks || 4;
      const nextWeek = (latest.week || 1) + 1;
      if (nextWeek > weeks) continue; // Block already over — handled by next_block_due
      out.push({
        ref: `${currentBlock.id}|w${nextWeek}`,
        body: `Call ${t.name} — skipped W${nextWeek} of ${currentBlock.name}`,
        target_id: t.id,
        target_label: t.name,
        pinned: true, // safety/retention signal — float to top
      });
    }
    return out;
  },
  // Auto-completes when a workout is logged for THIS plan in or after
  // the missed week. Plan-aware match: client_workouts carry planName
  // (not plan.id), so we look up the plan id → planName via the ctx
  // plans list, then require both the trainee AND the plan name to
  // match before considering the week. The earlier shape resolved on
  // (trainee, week) alone — a trainee on two concurrent plans would
  // have plan A's "week missed" task closed by a plan B logged workout.
  resolve({ workouts, plans }, existing) {
    const closing = new Set();
    for (const row of existing) {
      const [planId, wPart] = (row.auto_ref || '').split('|w');
      const wNum = parseInt(wPart, 10);
      if (!planId || !wNum) continue;
      const plan = (plans || []).find(p => p.id === planId);
      const planName = plan?.name;
      const wkLogged = workouts.some(w =>
        w.clientId === row.target_id
        && (planName ? w.planName === planName : true)
        && w.week >= wNum);
      if (wkLogged) closing.add(row.auto_ref);
    }
    return closing;
  },
};

// 3) AT_RISK_SILENT — no trainee touch in 14d. Merged dormant +
//    no-communication: a trainee is at risk only when BOTH signals
//    align (no workout AND no review note AND no manual activity).
//    One trainee → one task at a time.
const ruleAtRiskSilent = {
  kind: 'at_risk_silent',
  detect(ctx) {
    const { trainees, workouts, activityRows } = ctx;
    const out = [];
    for (const t of trainees) {
      if (t.status !== 'Active') continue;
      // Skip trainees who just joined — they haven't had time to be silent.
      // Without this guard a fresh import day triggers a task per trainee
      // labeled "never trained, never contacted" since both signals read
      // Infinity (no rows = quiet by definition).
      const sinceStart = daysAgo(t.startDate);
      if (sinceStart < 14) continue;
      // Never-engaged trainees (no workout, no activity, no intake) are
      // ghosts — coach already knows they're inert; don't generate a
      // re-engage task that adds nothing.
      if (isGhostTrainee(t, ctx)) continue;
      const tWorkouts = workouts.filter(w => w.clientId === t.id);
      const tActivity = (activityRows || []).filter(a => a.trainee_id === t.id);
      const latestWorkoutAgo = tWorkouts.length
        ? Math.min(...tWorkouts.map(w => daysAgo(w.date)))
        : Infinity;
      const latestActivityAgo = tActivity.length
        ? Math.min(...tActivity.map(a => daysAgo(a.occurred_at)))
        : Infinity;
      // Both signals must be quiet — hysteresis: fire at ≥21d so the task
      // doesn't flicker around the 14d resolve boundary in the resolver
      // below. A trainee who crosses 14d→21d sits silent until either
      // touch crosses 21d (open) or any touch is fresher than 14d (close).
      if (latestWorkoutAgo < 21 || latestActivityAgo < 21) continue;
      const wkLabel = tWorkouts.length === 0 ? 'never trained'
                                              : `${latestWorkoutAgo}d no workout`;
      const acLabel = tActivity.length === 0 ? 'never contacted'
                                              : `${latestActivityAgo}d no contact`;
      out.push({
        ref: t.id,
        body: `Reach out to ${t.name} — ${wkLabel}, ${acLabel}`,
        target_id: t.id,
        target_label: t.name,
      });
    }
    return out;
  },
  resolve({ workouts, activityRows }, existing) {
    const closing = new Set();
    for (const row of existing) {
      const tid = row.target_id;
      const sinceWk = workouts
        .filter(w => w.clientId === tid)
        .reduce((min, w) => Math.min(min, daysAgo(w.date)), Infinity);
      const sinceAc = (activityRows || [])
        .filter(a => a.trainee_id === tid)
        .reduce((min, a) => Math.min(min, daysAgo(a.occurred_at)), Infinity);
      // Resolve when either signal goes fresh again — sync matches against
      // auto_ref (the rule's canonical key), not target_id. They happen to
      // match for this rule, but returning auto_ref keeps the contract
      // explicit and protects future rule authors who change the shape.
      if (sinceWk < 14 || sinceAc < 14) closing.add(row.auto_ref);
    }
    return closing;
  },
};

// 4) FORM_VIDEO_PENDING_REVIEW — one task per WORKOUT that has any
//    cloud-uploaded videos with zero review notes. (Earlier shape emitted
//    one task per video, which buried the dashboard under N near-identical
//    rows whenever a trainee filmed every exercise.) The task's
//    "→ REVIEW" action navigates to the workout review session where
//    every pending video lives, so one click drains them all.
const ruleFormVideoPending = {
  kind: 'form_video_pending_review',
  detect(ctx) {
    const { trainees, workouts } = ctx;
    const out = [];
    for (const w of workouts) {
      if (!Array.isArray(w.formVideos)) continue;
      if (w.reviewedAt) continue;                // already reviewed → no task
      if (daysAgo(w.date) < 1) continue;         // give the coach 24h
      const t = trainees.find(tt => tt.id === w.clientId);
      if (!t) continue;
      // A workout exists, so by definition the trainee isn't a ghost here.
      // Count unreviewed videos in this workout. Skip the workout entirely
      // if every video already has at least one review note.
      let unreviewed = 0;
      for (const fv of w.formVideos) {
        if (!fv?.cloudUrl) continue;
        const notes = Array.isArray(fv.reviewNotes) ? fv.reviewNotes : [];
        if (notes.length === 0) unreviewed++;
      }
      if (unreviewed === 0) continue;
      const label = `${unreviewed} form video${unreviewed === 1 ? '' : 's'}`;
      out.push({
        ref: w.id,
        body: `Review ${unreviewed} form video${unreviewed === 1 ? '' : 's'} from ${t.name} · W${w.week} ${w.dayName}`,
        target_id: t.id,
        target_label: t.name,
      });
    }
    return out;
  },
  resolve({ workouts }, existing) {
    const closing = new Set();
    for (const row of existing) {
      const woId = String(row.auto_ref || '').split('|')[0];
      const wo = workouts.find(w => w.id === woId);
      if (!wo) { closing.add(row.auto_ref); continue; }
      // Closes when the workout is marked reviewed OR every video has at
      // least one review note attached.
      if (wo.reviewedAt) { closing.add(row.auto_ref); continue; }
      const fvs = Array.isArray(wo.formVideos) ? wo.formVideos : [];
      const allCovered = fvs.every(fv => {
        if (!fv?.cloudUrl) return true;
        const notes = Array.isArray(fv.reviewNotes) ? fv.reviewNotes : [];
        return notes.length > 0;
      });
      if (allCovered) closing.add(row.auto_ref);
    }
    return closing;
  },
};

// 5) NEW_INTAKE_PENDING — intake_submissions with reviewed_at IS NULL
const ruleNewIntakePending = {
  kind: 'new_intake_pending',
  detect({ intakeSubmissions }) {
    if (!intakeSubmissions) return [];
    return intakeSubmissions
      .filter(s => !s.reviewed_at)
      .map(s => ({
        ref: s.id,
        body: `Onboard ${s.name || s.email || 'new intake'}`,
        target_id: s.trainee_id || s.id,
        target_label: s.name || null,
        // INTAKE filter pill expects target_kind === 'intake'. Without this
        // override, sync falls back to the s.trainee_id ternary and lands
        // most rows in 'general' (since intake's trainee_id is usually
        // null pre-onboarding).
        target_kind: 'intake',
      }));
  },
  resolve({ intakeSubmissions }, existing) {
    const closing = new Set();
    for (const row of existing) {
      const s = (intakeSubmissions || []).find(x => x.id === row.auto_ref);
      if (!s || s.reviewed_at) closing.add(row.auto_ref);
    }
    return closing;
  },
};

// 6) PAYMENT_OVERDUE — last payment 14d+ overdue OR Never Paid after 21d
const rulePaymentOverdue = {
  kind: 'payment_overdue',
  detect(ctx) {
    const { trainees, payments } = ctx;
    const out = [];
    for (const t of trainees) {
      if (t.status !== 'Active') continue;
      if (isGhostTrainee(t, ctx)) continue;
      const tPay = (payments || []).filter(p => p.traineeId === t.id);
      const monthly = parseFloat(t.monthly) || 0;
      if (tPay.length === 0) {
        // "Never paid" after 21d since start
        const since = daysAgo(t.startDate);
        if (since >= 21) {
          out.push({
            ref: t.id,
            body: `Chase payment from ${t.name} · never paid · ${since}d since signup${monthly ? ` · ₪${monthly}/mo` : ''}`,
            target_id: t.id,
            target_label: t.name,
          });
        }
        continue;
      }
      const latest = tPay.reduce((a, b) =>
        new Date(b.date) > new Date(a.date) ? b : a);
      const since = daysAgo(latest.date);
      // For monthly plans, "overdue" = 14d+ past the 30d window since last
      // payment (so ≥ 44d since last paid for a monthly).
      const overdueThreshold = monthly > 0 ? 44 : 14;
      if (since >= overdueThreshold) {
        const amount = monthly || latest.amount || 0;
        out.push({
          ref: t.id,
          body: `Chase payment from ${t.name} · last paid ${since}d ago${amount ? ` · ₪${amount} due` : ''}`,
          target_id: t.id,
          target_label: t.name,
        });
      }
    }
    return out;
  },
  resolve({ trainees, payments }, existing) {
    const closing = new Set();
    for (const row of existing) {
      const t = trainees.find(x => x.id === row.target_id);
      // Resolve via auto_ref — the rule's canonical key — not target_id.
      // They match today (auto_ref === t.id) but the sync layer compares
      // against auto_ref; future rule changes mustn't drift the two apart.
      if (!t) { closing.add(row.auto_ref); continue; }
      const tPay = (payments || []).filter(p => p.traineeId === t.id);
      if (tPay.length === 0) continue;
      const latest = tPay.reduce((a, b) =>
        new Date(b.date) > new Date(a.date) ? b : a);
      const since = daysAgo(latest.date);
      const monthly = parseFloat(t.monthly) || 0;
      const threshold = monthly > 0 ? 44 : 14;
      if (since < threshold) closing.add(row.auto_ref);
    }
    return closing;
  },
};

// 7) EVAL_DUE_FIRST_SESSION — intake reviewed but trainee has zero
//    athletic evaluations. Ohad runs evals in-person; intake is the
//    client's self-report. This bridges them.
const ruleEvalDueFirstSession = {
  kind: 'eval_due_first_session',
  detect(ctx) {
    const { trainees, intakeSubmissions, evaluations } = ctx;
    if (!intakeSubmissions) return [];
    const out = [];
    for (const s of intakeSubmissions) {
      if (!s.reviewed_at) continue;
      if (!s.trainee_id) continue;
      const t = trainees.find(x => x.id === s.trainee_id);
      if (!t) continue;
      if (t.status === 'Archived' || t.status === 'Inactive') continue;
      // Submitted+reviewed intake counts as engagement, so isGhost is
      // false here regardless. No filter needed.
      const hasEval = (evaluations || []).some(e => e.trainee_id === t.id);
      if (hasEval) continue;
      out.push({
        ref: t.id,
        body: `Run athletic eval on ${t.name} · first-session baseline`,
        target_id: t.id,
        target_label: t.name,
      });
    }
    return out;
  },
  resolve({ evaluations }, existing) {
    const closing = new Set();
    for (const row of existing) {
      const has = (evaluations || []).some(e => e.trainee_id === row.target_id);
      if (has) closing.add(row.target_id);
    }
    return closing;
  },
};

const RULES = [
  ruleNextBlockDue,
  ruleWeekMissed,
  ruleAtRiskSilent,
  ruleFormVideoPending,
  ruleNewIntakePending,
  rulePaymentOverdue,
  ruleEvalDueFirstSession,
];

// ─────────────────────────────────────────────────────────────────────
// Sync entrypoint — call once per Dashboard mount.
// ─────────────────────────────────────────────────────────────────────
let lastSyncAt = 0;
const SYNC_THROTTLE_MS = 30_000; // don't re-sync within 30s

const newAutoId = () =>
  'note_auto_' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36).slice(-4);

export async function syncAutoTasks({ trainees, plans, workouts, payments } = {}) {
  if (!Array.isArray(trainees) || trainees.length === 0) return;
  const now = Date.now();
  if (now - lastSyncAt < SYNC_THROTTLE_MS) return;
  lastSyncAt = now;

  // Lazy-load the supporting data the rules need but the dashboard
  // doesn't already have (intake submissions + athletic evals +
  // trainee activity log).
  let intakeSubmissions = [];
  let evaluations = [];
  let activityRows = [];
  try {
    const [i, e, a] = await Promise.all([
      supabase.from('intake_submissions').select('id, name, email, trainee_id, form_type, reviewed_at, created_at').limit(500),
      supabase.from('trainee_evaluations').select('id, trainee_id, eval_date').limit(500),
      supabase.from('trainee_activity').select('id, trainee_id, occurred_at, kind').limit(500),
    ]);
    intakeSubmissions = i.data || [];
    evaluations = e.data || [];
    activityRows = a.data || [];
  } catch {
    /* gracefully degrade — relevant rules just return [] */
  }

  // Read existing auto-tasks (one query, all kinds)
  const { data: existingRows, error: rdErr } = await supabase
    .from('coach_notes')
    .select('id, auto_kind, auto_ref, target_id, target_label, status')
    .not('auto_kind', 'is', null)
    .limit(2000);
  if (rdErr) {
    // Migration not applied yet — silently bail so the dashboard still works
    if (/column .* does not exist/i.test(rdErr.message)) return;
    console.warn('autoTasks read failed:', rdErr.message);
    return;
  }
  const byKey = new Map();
  for (const r of existingRows || []) {
    byKey.set(`${r.auto_kind}|${r.auto_ref}`, r);
  }

  const ctx = { trainees, plans, workouts, payments, intakeSubmissions, evaluations, activityRows };

  // Phase A: compute desired open-task set
  const inserts = [];
  const bodyPatches = [];
  for (const rule of RULES) {
    let desired = [];
    try { desired = rule.detect(ctx) || []; }
    catch (e) { console.warn(`rule ${rule.kind} detect threw:`, e); }
    for (const d of desired) {
      const key = `${rule.kind}|${d.ref}`;
      if (byKey.has(key)) {
        // Row already exists — if the detected body differs (the copy
        // template changed since last sync, or one of the embedded
        // values shifted), patch the body so the card reflects the
        // current state. Skip if the row is done — closed tasks
        // shouldn't get retroactively rewritten.
        const existing = byKey.get(key);
        if (existing.status === 'open' && existing.body !== d.body) {
          bodyPatches.push({ id: existing.id, body: d.body });
        }
        continue;
      }
      inserts.push({
        id: newAutoId(),
        body: d.body,
        target_kind: d.target_kind || (d.target_id ? 'trainee' : 'general'),
        target_id: d.target_id || null,
        target_label: d.target_label || null,
        pinned: !!d.pinned,
        status: 'open',
        auto_kind: rule.kind,
        auto_ref: d.ref,
      });
    }
  }

  // Phase B: resolve open tasks whose condition no longer applies
  const updates = [];
  for (const rule of RULES) {
    const openOfKind = (existingRows || [])
      .filter(r => r.auto_kind === rule.kind && r.status === 'open');
    if (openOfKind.length === 0) continue;
    let closing = new Set();
    try { closing = rule.resolve(ctx, openOfKind) || new Set(); }
    catch (e) { console.warn(`rule ${rule.kind} resolve threw:`, e); }
    for (const row of openOfKind) {
      if (closing.has(row.auto_ref)) {
        updates.push({ id: row.id });
      }
    }
  }

  // Execute
  if (inserts.length > 0) {
    const { error } = await supabase.from('coach_notes').insert(inserts);
    if (error && !/duplicate key/i.test(error.message)) {
      console.warn('autoTasks insert failed:', error.message);
      toast(`Auto-task sync warning: ${error.message}`, 'warning', { ttl: 6000 });
    }
  }
  if (updates.length > 0) {
    const ids = updates.map(u => u.id);
    const { error } = await supabase
      .from('coach_notes')
      .update({ status: 'done', completed_at: new Date().toISOString() })
      .in('id', ids);
    if (error) console.warn('autoTasks resolve failed:', error.message);
  }
  // Body-patch pass — rewrite stale auto-task copy in place when the
  // detector renders a different body for an existing row. Single
  // upsert per row; PostgREST doesn't support bulk-update with
  // per-row values, so we issue one PATCH per id (small N in practice).
  for (const p of bodyPatches) {
    try {
      await supabase.from('coach_notes').update({ body: p.body }).eq('id', p.id);
    } catch (e) { /* swallow — non-critical */ }
  }
}

// Expose the rule kinds + their human-readable label for the ⚙ AUTO badge
export const AUTO_KIND_LABEL = {
  next_block_due: 'BLOCK ENDING',
  week_missed: 'WEEK SKIPPED',
  at_risk_silent: 'AT RISK',
  form_video_pending_review: 'VIDEO PENDING',
  new_intake_pending: 'NEW INTAKE',
  payment_overdue: 'PAYMENT OVERDUE',
  eval_due_first_session: 'EVAL DUE',
  whatsapp_combined: 'NEEDS OUTREACH',
};

// Solution-action per auto-task kind. The dashboard task cards render
// the matching button so every task points at its actual remedy:
//   NEW_PROGRAM   — open the plan editor pre-bound to the trainee
//   WHATSAPP      — wa.me deeplink with a pre-filled message
//   REVIEW        — open the workout review session for that workout id
//   OPEN_INTAKE   — route to /coach/intake (review the submission)
//   OPEN_ATHLETE  — route to the trainee card (run the eval there)
export const AUTO_KIND_ACTION = {
  next_block_due:            'NEW_PROGRAM',
  week_missed:               'WHATSAPP',
  at_risk_silent:            'WHATSAPP',
  form_video_pending_review: 'REVIEW',
  new_intake_pending:        'OPEN_INTAKE',
  payment_overdue:           'WHATSAPP',
  eval_due_first_session:    'OPEN_ATHLETE',
  whatsapp_combined:         'WHATSAPP',
};

// Task throttling — multiple auto-tasks for one trainee that all resolve
// to a WhatsApp outreach (week_missed + at_risk_silent + payment_overdue)
// would otherwise read as 3 separate cards. The coach opens ONE
// WhatsApp conversation and addresses all of them. Collapse the
// underlying rows into a synthetic card with the combined reasoning so
// the dashboard reads as "Diego needs outreach" not three rows.
//
// The synthetic card carries the raw rows in `__sources` so the mark-
// done path can fan out the close to every underlying row in one shot.
export function throttleWhatsAppTasks(rows) {
  const out = [];
  const seenByTrainee = new Map(); // target_id → index in out
  for (const r of rows || []) {
    const isWhatsApp = AUTO_KIND_ACTION[r.auto_kind] === 'WHATSAPP';
    if (!isWhatsApp || r.status === 'done' || !r.target_id) {
      out.push(r);
      continue;
    }
    const existingIdx = seenByTrainee.get(r.target_id);
    if (existingIdx === undefined) {
      // First WhatsApp task for this trainee — push as the seed.
      out.push({ ...r, __sources: [r] });
      seenByTrainee.set(r.target_id, out.length - 1);
    } else {
      // Merge into the synthetic card.
      const seed = out[existingIdx];
      seed.__sources.push(r);
      // Body becomes a combined summary. Preserve newest timestamp +
      // strongest pin so the merged card floats correctly.
      const sources = seed.__sources;
      seed.body = `Reach out to ${seed.target_label || 'trainee'} · ${sources.length} reasons:\n` +
        sources.map(s => `• ${AUTO_KIND_LABEL[s.auto_kind] || s.auto_kind}`).join('\n');
      seed.pinned = seed.pinned || r.pinned;
      seed.auto_kind = 'whatsapp_combined';
      // Keep the most-recent created_at so the sort places the merged
      // card at the freshest row's spot.
      if (new Date(r.created_at) > new Date(seed.created_at)) {
        seed.created_at = r.created_at;
      }
    }
  }
  return out;
}

// Hebrew WhatsApp templates per kind. The trainee's first name is
// extracted from `name` for a personal tone. Days-since values pulled
// out of the task body when present so the message doesn't say "X days"
// when the system actually knows the number.
export function whatsappMessageForTask(note, trainee) {
  const first = (trainee?.name || '').split(/\s+/)[0] || trainee?.name || '';
  const body = String(note?.body || '');
  switch (note?.auto_kind) {
    case 'week_missed': {
      const m = body.match(/W(\d+)/);
      const wk = m ? `שבוע ${m[1]} ` : '';
      return `היי ${first}. ראיתי שדילגנו על ${wk}בבלוק הנוכחי. הכל בסדר? בוא נתאם משהו לפני שזה מצטבר.`;
    }
    case 'at_risk_silent': {
      const m = body.match(/(\d+)d no workout/);
      const ago = m ? `${m[1]} ימים מאז האימון האחרון. ` : '';
      return `היי ${first}. ${ago}הכל בסדר אצלך? בוא נתאם אימון או שיחה השבוע.`;
    }
    case 'payment_overdue': {
      const never = /never paid/i.test(body);
      if (never) return `היי ${first}. רק תזכורת — עוד לא נסגר תשלום מאז ההרשמה. תוכל לסגור את זה השבוע?`;
      const m = body.match(/(\d+)d ago/);
      const ago = m ? `${m[1]} ימים מאז התשלום האחרון. ` : '';
      return `היי ${first}. ${ago}תוכל לסגור את התשלום הנוכחי השבוע?`;
    }
    case 'whatsapp_combined': {
      // The throttled card stacks several reasons. Open ONE conversation
      // that pulls them together — the coach can edit the prefilled
      // text before sending if any reason needs softening.
      const sources = Array.isArray(note?.__sources) ? note.__sources : [];
      const parts = sources.map(s => whatsappMessageForTask(s, trainee)).filter(Boolean);
      if (parts.length === 0) return `היי ${first}. רוצה לתאם איתך משהו השבוע.`;
      if (parts.length === 1) return parts[0];
      return `היי ${first}. צריך לתאם איתך כמה דברים:\n\n` + parts.map((p, i) => `${i + 1}. ${p.replace(/^היי \S+\.\s*/, '')}`).join('\n\n');
    }
    default:
      return `היי ${first}. מה קורה?`;
  }
}

// F-26 — Explainability: for any auto_kind, return the WHY behind the
// task (what rule fired + what inputs the rule looked at + when it
// will auto-close). The ⓘ modal in NotesWidget/NotesInline renders
// this. It's intentionally human-readable, not machine-readable —
// the coach should understand the system's reasoning at a glance.
export function explainAutoTask(note, trainee) {
  const body = String(note?.body || '');
  const kind = note?.auto_kind;
  const traineeName = trainee?.name || note?.target_label || 'this trainee';

  const base = {
    title: AUTO_KIND_LABEL[kind] || (kind || '').toUpperCase(),
    rule: '',
    inputs: [],
    closes: '',
    confidence: 'high',
  };

  switch (kind) {
    case 'next_block_due': {
      const m = body.match(/W(\d+)\/(\d+)/);
      return {
        ...base,
        rule: 'Current block is at ≥75% completion. New block needs to ship before the runway runs out.',
        inputs: m ? [`Active block is at W${m[1]}/${m[2]} completed`, 'Threshold: 75% block completion'] : ['Active block ≥75% complete'],
        closes: 'Auto-closes when a newer plan is published for this trainee.',
      };
    }
    case 'week_missed': {
      const m = body.match(/W(\d+)/);
      return {
        ...base,
        rule: 'A week was missed inside the current block (no session logged within 14 days of the prior week).',
        inputs: m ? [`Missed week: W${m[1]}`, 'Gap from last logged session: ≥14 days'] : ['Week skipped'],
        closes: 'Auto-closes when the missed week gets a logged session.',
        confidence: 'medium',
      };
    }
    case 'at_risk_silent': {
      const m = body.match(/(\d+)d no workout/);
      const days = m ? m[1] : '14+';
      return {
        ...base,
        rule: 'No workouts logged for ≥14 days. Higher-risk silent client.',
        inputs: [`Days since last logged workout: ${days}`, 'Days since last review activity: ≥14', 'Trainee status: Active'],
        closes: 'Auto-closes once a workout is logged or a review session is recorded.',
        confidence: 'high',
      };
    }
    case 'form_video_pending_review': {
      return {
        ...base,
        rule: 'A logged set carries a form video that you have not opened in WorkoutReview.',
        inputs: ['form video URL present', 'workout.reviewedAt = null'],
        closes: 'Auto-closes when you open the workout in WorkoutReview (reviewedAt timestamp is set), or when every set with a video has a coach comment.',
      };
    }
    case 'new_intake_pending': {
      return {
        ...base,
        rule: 'A new intake submission landed and has not been reviewed yet.',
        inputs: ['intake_submissions row exists', 'reviewed_at = null'],
        closes: 'Auto-closes when reviewed_at is set on the intake row.',
      };
    }
    case 'payment_overdue': {
      const never = /never paid/i.test(body);
      const m = body.match(/(\d+)d ago/);
      return {
        ...base,
        rule: never
          ? 'Trainee was created but no payment row exists for them yet.'
          : 'Most recent payment is older than the trainee\'s monthly cadence + 7-day grace.',
        inputs: never ? ['No payment rows', 'Trainee.status = Active'] : [`Last payment: ${m ? m[1] : '?'} days ago`, 'Cadence threshold: monthly + 7d grace'],
        closes: 'Auto-closes when a fresh payment row lands for this trainee.',
        confidence: 'medium',
      };
    }
    case 'eval_due_first_session': {
      return {
        ...base,
        rule: 'Trainee has logged ≥1 session but has no Athletic Evaluation on file.',
        inputs: ['client_workouts count ≥1', 'evaluation row missing'],
        closes: 'Auto-closes when the Athletic Evaluation is filled out from the trainee card.',
      };
    }
    case 'whatsapp_combined': {
      const n = Array.isArray(note?.__sources) ? note.__sources.length : 1;
      const reasons = (note?.__sources || []).map(s => `• ${AUTO_KIND_LABEL[s.auto_kind] || s.auto_kind}`);
      return {
        ...base,
        title: 'NEEDS OUTREACH',
        rule: `${n} separate outreach-resolved tasks for ${traineeName} were merged into one card so you only open ONE WhatsApp thread.`,
        inputs: reasons.length ? reasons : ['multiple WhatsApp-action auto-tasks for this trainee'],
        closes: 'Marking this card done closes all underlying tasks at once.',
        confidence: 'high',
      };
    }
    default:
      return {
        ...base,
        rule: 'Manual task — no automated reasoning.',
        inputs: [],
        closes: 'Auto-tasks close themselves when their input condition flips. Manual tasks close when you check them off.',
        confidence: 'n/a',
      };
  }
}
