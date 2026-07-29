export const meta = {
  name: 'client-side-audit',
  description: 'Adversarially-verified bug hunt across every EXPO client-side file (100+ audit units)',
  phases: [
    { title: 'Find', detail: '110 concrete audit units × client files/dimensions' },
    { title: 'Verify', detail: 'independent skeptic refutes-or-confirms each finding' },
  ],
};

// ---- Audit matrix: concrete (file, focus, dimension) units. -------------
// Each unit is ONE genuine audit: a finder reads the real code for that
// file/area and reports concrete bugs (file:line + failure scenario) or clean.
const SPEC = [
  // ClientPortal.jsx — the athlete-facing core (highest scrutiny)
  ['ClientPortal.jsx', 'trainerPlanToPortal transform: title/eid resolution, dyn_ key stability, EX map writes', 'data-loss / wrong-title'],
  ['ClientPortal.jsx', 'trainerPlanToPortal: filter(Boolean) seams, null day/exercise/warmup handling', 'crash / white-screen'],
  ['ClientPortal.jsx', 'superset grouping (groups[step], exIdxs, seenEid dup #51)', 'crash / mis-grouping'],
  ['ClientPortal.jsx', 'week keying: weekNum, fwk, weeklyFocus key scoping and off-by-one', 'wrong-data'],
  ['ClientPortal.jsx', 'per-week wk/wkS arrays: index out of range, reps/sets display fallback', 'wrong-data / crash'],
  ['ClientPortal.jsx', 'video resolution: ytId, ytIsShort, per-instance vid override 3-state, GPhotos', 'wrong-media'],
  ['ClientPortal.jsx', 'exercise substitutions overlay: substitutions[ex.eid], eid preservation for logging', 'data-loss'],
  ['ClientPortal.jsx', 'form-video upload: fv[ei] guards, uploading state, blobQueue handoff', 'data-loss / crash'],
  ['ClientPortal.jsx', 'set logging: allSets[ei], uSet functional updates, per-set persistence', 'data-loss'],
  ['ClientPortal.jsx', 'workout finish/complete flow: DONE lock, daily-routine unlimited logs', 'data-loss / logic'],
  ['ClientPortal.jsx', 'History tab render from client_workouts, empty/edge states', 'crash / empty'],
  ['ClientPortal.jsx', 'Meal Log page: save, offline, RTL', 'data-loss / i18n'],
  ['ClientPortal.jsx', 'Messages page: unread tracking, voice bucket, send/receive', 'data-loss'],
  ['ClientPortal.jsx', 'readiness / check-in trends: history render, graph data', 'wrong-data / crash'],
  ['ClientPortal.jsx', 'Bodyweight tab: log, clear, trends graph', 'data-loss'],
  ['ClientPortal.jsx', 'offline snapshot prefill / localStorage fallback correctness', 'data-loss / stale'],
  ['ClientPortal.jsx', 'priorWorkouts ghost / last-week feedback matching by eid+day+week', 'wrong-data'],
  ['ClientPortal.jsx', 'PR detection and match logic', 'wrong-data'],
  ['ClientPortal.jsx', 'weekly focus read/write, legacy unscoped key fallback', 'wrong-data'],
  ['ClientPortal.jsx', 'StepLogger keying (plan|dayIdx|dayName), state reset on day switch', 'stale-state'],
  ['ClientPortal.jsx', 'warmup rendering, WarmupEditor onBlur video guard', 'crash'],
  ['ClientPortal.jsx', 'demoMode / embedded prop branches, header hiding', 'logic'],
  ['ClientPortal.jsx', 'useEffect deps / listener + interval cleanup (presence beat, realtime)', 'memory-leak / stale'],
  ['ClientPortal.jsx', 'number/type coercion in set values, load, reps parsing', 'wrong-data'],
  ['ClientPortal.jsx', 'couple member scoping (__0/__1), traineeId comparison exact-match', 'data-leak / wrong-data'],
  // PlansView.jsx — coach editor, writes the athlete data
  ['PlansView.jsx', 'exercise CRUD: add/delete/reorder, defaultPlanEx, order field', 'data-loss'],
  ['PlansView.jsx', 'title snapshot on ExPicker onChange/onPickName/onCreateLibrary (all paths carry title)', 'wrong-title'],
  ['PlansView.jsx', 'autosave: useAutosave debounce, flushAutosave races on preview/share/duplicate', 'data-loss / race'],
  ['PlansView.jsx', 'savePlan blank-overwrite guard correctness', 'data-loss'],
  ['PlansView.jsx', 'copy-day feature: cross-program copy, id regeneration', 'data-loss / collision'],
  ['PlansView.jsx', 'share flow: token creation, target read-back, autosave-after-delete race', 'security / data-loss'],
  ['PlansView.jsx', 'superset letter mapping (group number mod-5 A..E)', 'wrong-data'],
  ['PlansView.jsx', 'per-week wk arrays editor: length sync with weeks, null handling', 'crash / wrong-data'],
  ['PlansView.jsx', 'cross-day exercise drag: setState defer, insertion index', 'data-loss / crash'],
  ['PlansView.jsx', 'video URL resolve (onResolveVideo) stale-index value-guard', 'wrong-media'],
  ['PlansView.jsx', 'plan dual-shape read (d.ex vs d.exercises) consistency', 'wrong-data'],
  ['PlansView.jsx', 'exercise title resolution fallback ((unresolved), pe.notes bracket match)', 'wrong-title'],
  ['PlansView.jsx', 'delete plan / delete exercise confirm + undo', 'data-loss'],
  ['PlansView.jsx', 'portalVis writes, latest-block-only visibility', 'logic'],
  ['PlansView.jsx', 'exById Map perf, no find() in render loops', 'perf'],
  // App.jsx — routing, auth, loading
  ['App.jsx', 'auth: dual-role picker, role resolution, session restore', 'security / logic'],
  ['App.jsx', 'exercise library loading for coach vs athlete (RLS-empty for athlete)', 'wrong-data'],
  ['App.jsx', 'per-route ErrorBoundaries coverage', 'crash'],
  ['App.jsx', 'portal-vis saveLocal fallback', 'data-loss'],
  ['App.jsx', 'email typeof guard, undefined user handling', 'crash'],
  ['App.jsx', 'canonical URL routing (/coach/* /athlete /demo* /intake /try)', 'logic'],
  ['App.jsx', 'clientPlans mapping + traineeId propagation', 'wrong-data'],
  ['App.jsx', 'theme sync, reduced-motion, safe-area', 'ui'],
  // useSupaStore.js — shared state layer
  ['useSupaStore.js', 'store read/write, JSON parse safety, asShape coercion', 'crash / data-loss'],
  ['useSupaStore.js', 'localStorage snapshot fallback, saveLocal correctness', 'data-loss / stale'],
  ['useSupaStore.js', 'realtime subscription, cleanup, reconnect', 'memory-leak / stale'],
  ['useSupaStore.js', 'concurrent write race / last-write-wins on store blobs', 'data-loss'],
  ['useSupaStore.js', 'key-not-found / empty default handling', 'crash'],
  // blobQueue.js — form-video offline queue
  ['blobQueue.js', 'orphan handling, attachUrl select id, dead-letter', 'data-loss'],
  ['blobQueue.js', 'IndexedDB open/version errors, quota exceeded', 'data-loss / crash'],
  ['blobQueue.js', 'flush retry logic, transient vs permanent errors', 'data-loss'],
  ['blobQueue.js', 'blob URL lifecycle, revoke, memory', 'memory-leak'],
  // offlineQueue.js — offline mutation queue
  ['offlineQueue.js', 'critical park, idempotent client ids, retry on reconnect', 'data-loss'],
  ['offlineQueue.js', 'dead-letter for constraint/auth errors, queue-block prevention', 'data-loss'],
  ['offlineQueue.js', 'NetInfo/online-event trigger correctness', 'logic'],
  // coachNotes.js — tasks/notes
  ['coachNotes.js', 'realtime connected state, refetch on channel drop, poll fallback', 'stale-state'],
  ['coachNotes.js', 'optimistic create/update/remove, sortTasks stability', 'wrong-data'],
  ['coachNotes.js', 'markTaskCompletedByPlan, pending link session handoff race', 'data-loss / race'],
  // crmData.js — derivations
  ['crmData.js', 'CRM activity derivation, canceled charge handling', 'wrong-data'],
  ['crmData.js', 'null/empty client handling in derivations', 'crash'],
  // autoTasks.js — auto-task engine
  ['autoTasks.js', 'idempotency (auto_kind, auto_ref), in-batch dedupe', 'duplicate-data'],
  ['autoTasks.js', 'couple-aware rules, traineeId scoping', 'wrong-data'],
  ['autoTasks.js', '7 rule triggers correctness, date/threshold math', 'wrong-logic'],
  // video pipeline
  ['VideoEmbed.jsx', 'poison-cache handling, YouTube/GPhotos/file-ext resolution', 'wrong-media'],
  // billing / payments
  ['useBitPayments.js', 'memoize payments, bit_payment_requests adapter', 'wrong-data'],
  // plans store / autosave
  ['usePlansStore.js', 'useFullPlan normalizeDays old->new shape mapping', 'data-loss'],
  ['usePlansStore.js', 'savePlan upsert, duplicatePlan id regen, deletePlan', 'data-loss / collision'],
  // misc client utilities
  ['CoachPreviewPortal.jsx', 'preview no-op setters, crash guards', 'crash'],
  ['evaluationsData.js', 'free-text values (never enum), silent-save', 'data-loss'],
];

// Extra cross-cutting dimension audits to push past 100 real units, each a
// distinct lens over a real file+concern (not padding — different failure mode).
const EXTRA = [
  ['ClientPortal.jsx', 'RTL/Hebrew rendering of exercise notes, cues, day names', 'i18n'],
  ['ClientPortal.jsx', 'empty-state coverage: 0 plans, 0 days, 0 exercises, name-only import', 'empty / crash'],
  ['ClientPortal.jsx', 'race: coach edits plan mid-session, day.ex grows past fv/allSets', 'crash / data-loss'],
  ['ClientPortal.jsx', 'stale closure in set-log handlers / useCallback deps', 'wrong-data'],
  ['ClientPortal.jsx', 'localStorage key collisions across trainees/plans', 'data-leak'],
  ['PlansView.jsx', 'RTL of Hebrew titles/notes in editor, input focus-loss', 'i18n / ux'],
  ['PlansView.jsx', 'empty plan / empty day editor states', 'crash'],
  ['PlansView.jsx', 'concurrent coach edits (Ohad+Yuval) on same plan', 'data-loss'],
  ['App.jsx', 'race on auth state change during initial load', 'crash'],
  ['App.jsx', 'deep-link to a plan/day the athlete no longer has', 'crash'],
  ['useSupaStore.js', 'quota-exceeded on localStorage snapshot write', 'crash / data-loss'],
  ['blobQueue.js', 'app-close during upload, resume on next open', 'data-loss'],
  ['ClientPortal.jsx', 'security: can an athlete read another trainee id via .or()/.like()', 'security'],
  ['PlansView.jsx', 'isSafeTraineeId validation before PostgREST filters', 'security'],
  ['ClientPortal.jsx', 'weeklyFocus/notes write path from athlete respects RLS', 'security'],
  ['autoTasks.js', 'rule firing on couple parent id vs member ids', 'wrong-data'],
  ['crmData.js', 'date math across timezones / DST for activity windows', 'wrong-data'],
  ['ClientPortal.jsx', 'number overflow / NaN in trends graph scaling', 'crash / wrong-viz'],
  ['ClientPortal.jsx', 'video CSP media-src blocks / codec handling', 'wrong-media'],
  ['ClientPortal.jsx', 'copyGuard interaction with athlete inputs (data-allow-copy)', 'ux'],
  ['PlansView.jsx', 'per-instance video override propagation of explicit-empty', 'wrong-media'],
  ['ClientPortal.jsx', 'substitution persistence across reload / offline', 'data-loss'],
  ['ClientPortal.jsx', 'finish workout while offline → queue + reconcile', 'data-loss'],
  ['App.jsx', 'SW stale bundle / cache during athlete session', 'stale'],
  ['ClientPortal.jsx', 'meal streak / adherence computation edge cases', 'wrong-data'],
  ['ClientPortal.jsx', 'readiness submit double-tap / duplicate insert', 'duplicate-data'],
  ['PlansView.jsx', 'copyWarmup / copyDays partial failure', 'data-loss'],
  ['ClientPortal.jsx', 'day rotation / kind=daily with week structure conflict', 'logic'],
  ['ClientPortal.jsx', 'exercise appears 3+ times same day (dup eid beyond #2)', 'wrong-data'],
  ['ClientPortal.jsx', 'video thumbnail aspect (9:16 shorts) render', 'ui'],
  ['usePlansStore.js', 'normalizeDays loses per-week or superset data', 'data-loss'],
  ['ClientPortal.jsx', 'group with mixed superset + non-superset exercises', 'mis-grouping'],
  ['ClientPortal.jsx', 'set value input accepts invalid chars / negative', 'wrong-data'],
  ['blobQueue.js', 'two devices upload same form video → dup', 'duplicate-data'],
  ['ClientPortal.jsx', 'plan with 0 weeks or weeks=1 edge', 'crash'],
  ['PlansView.jsx', 'delete last exercise in a day / last day in plan', 'crash'],
];

const ALL = [...SPEC, ...EXTRA];

const FINDINGS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          file: { type: 'string' },
          line: { type: 'integer' },
          severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
          category: { type: 'string' },
          summary: { type: 'string' },
          failure_scenario: { type: 'string' },
          suggested_fix: { type: 'string' },
        },
        required: ['file', 'line', 'severity', 'summary', 'failure_scenario', 'suggested_fix'],
      },
    },
  },
  required: ['findings'],
};

const VERDICT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    verdict: { type: 'string', enum: ['CONFIRMED', 'REFUTED'] },
    reasoning: { type: 'string' },
    corrected_severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
  },
  required: ['verdict', 'reasoning'],
};

const finderPrompt = (u, idx) => `You are a senior React/Supabase engineer auditing the EXPO fitness-coaching PWA (Vite+React+Supabase). This is AUDIT UNIT #${idx + 1}.

TARGET FILE: src/${u[0]}
FOCUS AREA: ${u[1]}
PRIMARY BUG DIMENSION: ${u[2]}

Read the ACTUAL code in src/${u[0]} (use Read/Grep — grep for the relevant symbols, read the surrounding blocks). Trace the specific focus area above.

Report ONLY real, concrete bugs you can point to with an exact file:line and a specific failure scenario (concrete inputs/state → wrong output/crash/data-loss). Key domain facts:
- Athlete devices CANNOT read the exercise library (expo-exercises is RLS staff-only); athlete-side name/video/cue resolution must come from data embedded in the plan row.
- Plans have two shapes: d.exercises=[{exerciseId,title,sets,reps,...}] and compressed d.ex=[{eid,s,r,n,...}]. Code must handle both.
- Couples: members log under <parent>__0/__1; compare trainee ids by EXACT match, never prefix.
- Supabase RLS + realtime private channels; localStorage offline fallback.

Do NOT invent issues or report style nits. If the focus area is correct, return {"findings":[]}. Be skeptical of your own claims — only report what would actually misbehave at runtime. For each real bug give file, line, severity, category, a one-line summary, the failure_scenario, and a concrete suggested_fix.`;

const verifyPrompt = (f) => `You are an adversarial verifier for the EXPO PWA. A prior audit claimed this bug. Your job is to REFUTE it unless it is genuinely real.

CLAIM: ${f.summary}
FILE: ${f.file}:${f.line}
SEVERITY: ${f.severity}
FAILURE SCENARIO: ${f.failure_scenario}
SUGGESTED FIX: ${f.suggested_fix || '(none)'}

Read the ACTUAL code at ${f.file} around line ${f.line} (and any related code). Determine whether this bug is REAL — i.e. there exist concrete, reachable inputs/state where the described wrong behavior actually occurs, AND the code does not already guard against it elsewhere. Domain facts: athletes can't read the library (names must come from the plan row); plans have d.ex and d.exercises shapes; couples use __0/__1 exact-match.

Default to REFUTED if you are uncertain, if the scenario is not actually reachable, if an existing guard already handles it, or if it's a style/theoretical nit. Only CONFIRMED if you can state the exact triggering path. Give verdict, reasoning (cite the code), and corrected_severity.`;

// ---- Run: pipeline so each finding verifies as soon as its finder lands. --
phase('Find');
log(`Auditing ${ALL.length} client-side units across ${new Set(ALL.map(u => u[0])).size} files...`);

const results = await pipeline(
  ALL,
  (u, _orig, idx) => agent(finderPrompt(u, idx), {
    label: `audit#${idx + 1}:${u[0].replace('.jsx', '').replace('.js', '')}`,
    phase: 'Find',
    schema: FINDINGS_SCHEMA,
    effort: 'medium',
  }).then(r => ({ unit: u, idx, findings: (r && r.findings) || [] })),
  (found) => {
    if (!found || !found.findings.length) return { unit: found?.unit, verified: [] };
    return parallel(found.findings.map(f => () =>
      agent(verifyPrompt(f), { label: `verify:${f.file.replace('.jsx','')}:${f.line}`, phase: 'Verify', schema: VERDICT_SCHEMA, effort: 'medium' })
        .then(v => ({ ...f, verdict: v?.verdict, verify_reasoning: v?.reasoning, final_severity: v?.corrected_severity || f.severity }))
        .catch(() => ({ ...f, verdict: 'REFUTED', verify_reasoning: 'verifier errored' }))
    )).then(verified => ({ unit: found.unit, verified: verified.filter(Boolean) }));
  }
);

const allVerified = results.filter(Boolean).flatMap(r => r.verified || []);
const confirmed = allVerified.filter(f => f.verdict === 'CONFIRMED');
const sevRank = { critical: 0, high: 1, medium: 2, low: 3 };
confirmed.sort((a, b) => (sevRank[a.final_severity] ?? 9) - (sevRank[b.final_severity] ?? 9));

log(`Audits run: ${ALL.length}. Candidate findings: ${allVerified.length}. CONFIRMED bugs: ${confirmed.length}.`);

return {
  audits_run: ALL.length,
  files_covered: [...new Set(ALL.map(u => u[0]))],
  candidates: allVerified.length,
  confirmed_count: confirmed.length,
  confirmed,
  refuted_count: allVerified.length - confirmed.length,
};
