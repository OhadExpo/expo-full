import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { C, FN, FB, FH } from './theme';

// ── Copied from PlansView.jsx (module-level helpers, not exported there) ──
// Training emphasis from the volume-weighted mean reps (NSCA goal table).
function emphasisFromReps(avgReps) {
  if (avgReps == null || !isFinite(avgReps)) return { key: 'mixed', label: 'Mixed', reps: '', pct: '' };
  if (avgReps <= 5.5) return { key: 'strength', label: 'Max strength', reps: '≤5', pct: '85–100%' };
  if (avgReps <= 8)   return { key: 'func',     label: 'Strength',     reps: '6–8',  pct: '80–85%' };
  if (avgReps <= 12)  return { key: 'hyper',    label: 'Hypertrophy',  reps: '8–12', pct: '67–80%' };
  return { key: 'endur', label: 'Endurance', reps: '12+', pct: '<67%' };
}
// %1RM proxy from reps — Epley inverse. 10 reps → 75% (matches Zatsiorsky's
// elite 10RM≈75%), 5→85.7, 3→90.9, 12→71.4.
function pctFromReps(reps) {
  if (reps == null || !isFinite(reps) || reps <= 0) return null;
  return Math.round(100 / (1 + reps / 30));
}
// Phase → display metadata. Palette stays inside the brand (cyan family +
// neutrals + one warm for peak/warning); readable on both themes.
const PHASE_META = {
  Accumulation: { code: 'ACC', color: '#5aa9c9', label: 'Accumulation', hint: 'Volume base' },
  Hypertrophy:  { code: 'HYP', color: '#39BDFF', label: 'Hypertrophy',  hint: 'Muscle · volume' },
  Strength:     { code: 'STR', color: '#3f7ce0', label: 'Strength',     hint: 'Heavy · low reps' },
  Power:        { code: 'PWR', color: '#8b7cf0', label: 'Power',        hint: 'Fast · explosive' },
  Peak:         { code: 'PK',  color: '#f0b429', label: 'Peak',         hint: 'Realize · test' },
  Deload:       { code: 'DL',  color: '#8a8f98', label: 'Deload',       hint: 'Recover' },
  Mixed:        { code: 'MIX', color: '#6b7280', label: 'Mixed',        hint: 'Mixed emphasis' },
};
const phaseMeta = (p) => PHASE_META[p] || PHASE_META.Mixed;
// Shorter labels for the matrix so the two Horizontal/Vertical lanes don't both
// truncate to an ambiguous "HORIZONTA…".
const PAT_SHORT = { 'Horizontal Push': 'Horiz. Push', 'Horizontal Pull': 'Horiz. Pull', 'Vertical Push': 'Vert. Push', 'Vertical Pull': 'Vert. Pull' };
const patLabel = (p) => PAT_SHORT[p] || p;
// Hebrew detector (same regex as PlansView) — picks FH for Hebrew athlete names.
const isHebrew = (s) => /[֐-׿]/.test(s || '');

// ── GOAL PRESCRIPTIONS — grounded in scratchpad/books/SYNTHESIS-programming-
// reference.md (17-source S&C corpus synthesis: RP, Prilepin/Sheiko, Zatsiorsky,
// Issurin, Mujika/Bosquet, NSCA, Koevoets, Chad Wesley Smith). volBias is a
// multiplier applied to the athlete's own latest-block set count to target the
// next block's total working sets; rest/rep/%1RM bands are the corpus's
// cross-book converging ranges (see intensityNote for the citation trail).
const GOAL_PRESCRIPTIONS = {
  'Hypertrophy': {
    repRange: '6–12', pctRange: '65–80% 1RM', restSec: '60–90s', volBias: 1.05,
    intensityNote: 'Weekly sets 15–20/pattern (RP), up to ~30 for advanced athletes; A:D ratio 4:1 typical for hypertrophy blocks (RP, Bompa). Hold or raise volume while intensity climbs — letting both volume and %1RM taper together mid-block is RP\'s named failure mode for this goal.',
  },
  'Max Strength': {
    repRange: '1–6', pctRange: '75–95% 1RM', restSec: '3–5 min', volBias: 0.9,
    intensityNote: 'Prilepin\'s chart: 70% zone → ~18 total lifts optimal, 80% → ~15, 90% → 7–10 (Sheiko, Koevoets, Easy Strength all cite this directly). A:D ratio 3:1 default.',
  },
  'Power/Speed': {
    repRange: '1–5', pctRange: '30–85% 1RM (bimodal: ballistic 30–50%, loaded 70–85%)', restSec: '3–5 min (full CNS recovery)', volBias: 0.65,
    intensityNote: 'Zatsiorsky, Thibaudeau and NSCA converge on this bimodal band. Track bar speed, not 1RM — velocity is the FIRST metric to degrade under fatigue, 1RM the last (Zatsiorsky\'s sensitivity order).',
  },
  'Peak': {
    repRange: '1–3', pctRange: '85–100%+ 1RM', restSec: '3–5 min', volBias: 0.5,
    intensityNote: 'Taper: 8–14 days, cut volume 41–61%, HOLD intensity and frequency (Mujika/Bosquet meta-analysis, n=380+ — the strongest cross-book convergence in this corpus). Expect ~0.5–6% performance gain, target ~3%.',
  },
  'Work Capacity': {
    repRange: '12–20+', pctRange: '<65% 1RM', restSec: '30–60s', volBias: 1.1,
    intensityNote: 'GPP/accumulation-style base-building (Issurin, Bompa) — high volume, low intensity, builds the capacity later phases draw down. Not a named goal in the RP/Prilepin tables — treated here as EXPO\'s label for an accumulation/conditioning-biased block.',
  },
  'Deload': {
    repRange: 'hold prior reps', pctRange: 'hold or lightly trim intensity', restSec: 'as normal', volBias: 0.5,
    intensityNote: 'RP\'s deload recipe: cut VOLUME first (roughly 50–70% of the prior week), not intensity — cutting weight while raising reps "for a pump" can leave cumulative fatigue higher than before the deload.',
  },
  'Fat-loss': {
    repRange: '8–15', pctRange: '60–75% 1RM', restSec: '30–60s (density-driven)', volBias: 0.95,
    intensityNote: 'Structure only — fat loss is driven mainly by nutrition/energy balance, outside this corpus\'s scope. Shorter rest raises session density without changing the underlying strength rep/%1RM logic above.',
  },
};
const GOAL_LIST = ['Hypertrophy', 'Max Strength', 'Power/Speed', 'Peak', 'Work Capacity', 'Deload', 'Fat-loss'];
// Map the lineage's detected next-phase onto a default goal selection.
const GOAL_FROM_PHASE = {
  Hypertrophy: 'Hypertrophy', Accumulation: 'Hypertrophy',
  Strength: 'Max Strength', Power: 'Power/Speed',
  Peak: 'Peak', Deload: 'Deload', Mixed: 'Hypertrophy',
};

// ── 6-tab MAIN-MOVEMENT axis — mirrors the exercise library's 6 catalog tabs
// (Upper/Lower × Bilateral/Unilateral/Plyo), NOT the movement-pattern taxonomy
// used by the lineage matrix above. Classified from the exercise TITLE.
const PLYO_RE = /jump|hop|bound|pogo|depth|broad|throw|slam|toss|med.?ball|plyo|skater/i;
const UNI_RE = /lunge|split|single|1[- ]?arm|one[- ]?arm|pistol|step[- ]?up|bulgarian|\bsl\b|b[- ]?stance/i;
const UPPER_RE = /press|bench|row|pull|curl|push[- ]?up|chin|dip|raise|fly|pulldown|overhead|tricep|bicep|face[- ]?pull/i;
const LOWER_RE = /squat|hinge|deadlift|rdl|lunge|hip|glute|calf|leg|hamstring|nordic|thrust/i;
const BUCKETS = ['Upper·BI', 'Upper·UNI', 'Upper·PLYO', 'Lower·BI', 'Lower·UNI', 'Lower·PLYO'];
const BUCKET_LABEL = {
  'Upper·BI': 'Upper · Bilateral', 'Upper·UNI': 'Upper · Unilateral', 'Upper·PLYO': 'Upper · Plyo',
  'Lower·BI': 'Lower · Bilateral', 'Lower·UNI': 'Lower · Unilateral', 'Lower·PLYO': 'Lower · Plyo',
};
function classifyBucket(title) {
  const t = (title || '').toLowerCase();
  if (!t) return 'Other';
  const upperKw = UPPER_RE.test(t), lowerKw = LOWER_RE.test(t);
  let side = null;
  if (upperKw && !lowerKw) side = 'Upper';
  else if (lowerKw && !upperKw) side = 'Lower';
  else if (upperKw && lowerKw) side = 'Lower'; // rare overlap (e.g. "hip thrust" style rows) — lower-body keyword wins
  if (!side) return 'Other';
  const quality = PLYO_RE.test(t) ? 'PLYO' : (UNI_RE.test(t) ? 'UNI' : 'BI');
  return `${side}·${quality}`;
}
// Pull the athlete's latest-block exercises out of `plans`, handling both known
// plan shapes: top-level p.days OR p.data.days, and per-day d.exercises OR d.ex,
// and per-exercise ex.title/ex.sets OR the compact ex.sets-as-ex.s form.
function latestBlockExercises(model, plans, exMap) {
  if (!model?.blocks?.length || !plans?.length) return [];
  const latestId = model.blocks[model.blocks.length - 1].id;
  const plan = plans.find(p => p.id === latestId);
  if (!plan) return [];
  const days = plan.data?.days || plan.days || [];
  const out = [];
  days.filter(Boolean).forEach(d => {
    // Same null-element guard as the portal (audit #42): ex.exerciseId on a null
    // entry throws and takes the whole report with it.
    const exList = (d.exercises || d.ex || []).filter(Boolean);
    exList.forEach(ex => {
      const lib = ex.exerciseId ? exMap.get(ex.exerciseId) : null;
      const title = (ex.title || lib?.title || '').trim();
      const sets = Number(ex.sets ?? ex.s) || 0;
      if (!sets) return;
      out.push({ title, sets });
    });
  });
  return out;
}
function exById(exercises) {
  const m = new Map();
  (exercises || []).forEach(e => { if (e && e.id) m.set(e.id, e); });
  return m;
}
// Days/week from the athlete's latest block — count of days carrying ≥1 exercise.
function deriveDaysPerWeek(model, plans) {
  if (!model?.blocks?.length || !plans?.length) return 4;
  const latestId = model.blocks[model.blocks.length - 1].id;
  const plan = plans.find(p => p.id === latestId);
  if (!plan) return 4;
  const days = plan.data?.days || plan.days || [];
  const n = days.filter(Boolean).filter(d => (d.exercises || d.ex || []).filter(Boolean).length > 0).length;
  return n >= 2 && n <= 6 ? n : 4;
}

// Weekly progression: ramp from the athlete's current volume toward the target,
// capped at rampCap growth per week (10% general / 5% post-injury), with an
// optional deload last week (RP recipe: cut to ~50% of target, hold intensity).
function buildWeeklyPlan({ baseSets, target, weeks, rampCap, deloadLastWeek, flat }) {
  const out = [];
  if (flat || !baseSets) {
    for (let w = 1; w <= weeks; w++) {
      const isLast = w === weeks && deloadLastWeek;
      out.push({ week: w, sets: isLast ? Math.round((target || 0) * 0.5) : Math.round(target || 0), deload: isLast });
    }
    return out;
  }
  const loadingWeeks = deloadLastWeek ? Math.max(1, weeks - 1) : weeks;
  let prev = baseSets;
  for (let w = 1; w <= loadingWeeks; w++) {
    let val;
    if (w === 1) val = baseSets;
    else if (target >= baseSets) val = Math.min(target, Math.round(prev * (1 + rampCap)));
    else val = Math.max(target, Math.round(prev * (1 - rampCap)));
    out.push({ week: w, sets: val, deload: false });
    prev = val;
  }
  if (deloadLastWeek) out.push({ week: weeks, sets: Math.round((target || prev) * 0.5), deload: true });
  return out;
}

// ── PERIODIZATION MODELS — grounded in scratchpad/books/SYNTHESIS-programming-
// reference.md §1/§7 (Issurin, Dietz-Triphasic, Zatsiorsky, NSCA/Haff, Koevoets).
// The GOAL prescription above still sets the block's total-set TARGET; a model
// only reshapes the WEEK-BY-WEEK path to that target (and, for 4/5, rotates a
// weekly emphasis label instead of a volume ramp). weeklyShape's 5th arg
// (rampCap) is an addition beyond the brief's 4-arg signature — Linear/Block
// both need it to reuse the existing 10%/5% ramp math; the other three models
// don't ramp off baseSets by design (that's the point of "non-linear").
function splitEven(weeks, labels) {
  if (!weeks || weeks <= 0) return [];
  const n = labels.length;
  const per = Math.floor(weeks / n);
  const rem = weeks - per * n;
  const out = [];
  labels.forEach((lab, i) => { for (let k = 0; k < per + (i < rem ? 1 : 0); k++) out.push(lab); });
  while (out.length < weeks) out.push(labels[labels.length - 1]);
  return out.slice(0, weeks);
}
// Issurin's stage skeleton, weighted so accumulation gets the bulk of the
// block (corpus: accumulation 3–6wk vs. transmutation 2–4wk vs. realization
// 1–3wk) — realization is always exactly the final week.
function blockPhaseSplit(weeks) {
  if (!weeks || weeks <= 0) return [];
  if (weeks === 1) return ['Realization'];
  if (weeks === 2) return ['Accumulation', 'Realization'];
  const accCount = Math.max(1, Math.round((weeks - 1) * 0.6));
  const transCount = Math.max(1, weeks - 1 - accCount);
  const labels = [...Array(accCount).fill('Accumulation'), ...Array(transCount).fill('Transmutation'), 'Realization'];
  while (labels.length < weeks) labels.splice(labels.length - 1, 0, 'Transmutation');
  return labels.slice(0, weeks);
}
const PERIODIZATION_MODELS = {
  Linear: {
    label: 'Linear',
    desc: 'Classic Matveyev ramp — steady week-to-week progression toward the target as intensity implicitly climbs.',
    note: 'Even NSCA\'s Haff calls "linear" a bit of a misnomer — the classic Matveyev lineage already contains its own micro-variation. It remains the safest default: novices don\'t need to care which model they run (Koevoets, Rippetoe, Yessis all agree periodization model barely matters below intermediate training age).',
    weeklyShape(baseSets, target, weeks, deloadLastWeek, rampCap) {
      return buildWeeklyPlan({ baseSets, target, weeks, rampCap: rampCap ?? 0.10, deloadLastWeek, flat: false })
        .map(w => ({ ...w, emphasis: w.deload ? 'Deload' : null }));
    },
  },
  Block: {
    label: 'Block (Issurin)',
    desc: 'Concentrated, unidirectional loading — an accumulation surge, a transmutation convergence, then a realization taper.',
    note: 'Issurin\'s block model trains one quality at a time to exploit residual training effects: gains persist for weeks after a block ends, so the next block can load a different quality without losing the last one — the mechanistic case that gives block periodization its edge over blended models.',
    weeklyShape(baseSets, target, weeks, deloadLastWeek, rampCap) {
      if (!weeks || weeks <= 0) return [];
      const rc = rampCap ?? 0.10;
      const base = baseSets || target || 0;
      const t = target || base || 0;
      const surge = Math.round(t * 1.1);
      const phases = blockPhaseSplit(weeks);
      const out = [];
      let prev = base;
      phases.forEach((phase, i) => {
        const week = i + 1;
        const isLast = week === weeks;
        let sets;
        if (phase === 'Accumulation') {
          sets = (i === 0 && base) ? base : Math.min(surge, Math.round((prev || t) * (1 + rc)));
        } else if (phase === 'Transmutation') {
          sets = Math.round(((prev || surge) + t) / 2);
        } else {
          sets = deloadLastWeek ? Math.round(t * 0.5) : Math.round(t * 0.85);
        }
        out.push({ week, sets, deload: phase === 'Realization' && !!deloadLastWeek && isLast, emphasis: phase });
        prev = sets;
      });
      return out;
    },
  },
  Undulating: {
    label: 'Undulating (DUP)',
    desc: 'Volume alternates high/moderate week to week around the same weekly average — a deliberately non-linear stimulus instead of a smooth ramp.',
    note: 'Trained-athlete studies (Rhea 2002, Monteiro 2009, Peterson 2008, per Koevoets) show DUP edging out linear models specifically once an athlete is past novice — though NSCA\'s Haff calls the broader linear-vs-undulating literature genuinely mixed, not settled either way.',
    weeklyShape(baseSets, target, weeks, deloadLastWeek, rampCap) {
      if (!weeks || weeks <= 0) return [];
      const t = target || baseSets || 0;
      const loadingWeeks = deloadLastWeek ? Math.max(1, weeks - 1) : weeks;
      const out = [];
      for (let week = 1; week <= loadingWeeks; week++) {
        const high = week % 2 === 1;
        out.push({ week, sets: Math.round(t * (high ? 1.15 : 0.85)), deload: false, emphasis: high ? 'Volume' : 'Intensity' });
      }
      if (deloadLastWeek) out.push({ week: weeks, sets: Math.round(t * 0.5), deload: true, emphasis: 'Deload' });
      return out;
    },
  },
  Conjugate: {
    label: 'Conjugate (Westside)',
    desc: 'Concurrent max-effort / dynamic-effort / repetition-method work every week — volume stays roughly flat, the weekly emphasis rotates.',
    note: 'Zatsiorsky\'s accommodation principle ("soon ripe, soon rotten") is the reason the max-effort exercise itself should rotate every 1–3 weeks even while the weekly volume target holds flat — here the METHOD cycles, not the load.',
    weeklyShape(baseSets, target, weeks, deloadLastWeek, rampCap) {
      if (!weeks || weeks <= 0) return [];
      const t = target || baseSets || 0;
      const EMPH = ['Max Effort', 'Dynamic Effort', 'Repetition Method'];
      const loadingWeeks = deloadLastWeek ? Math.max(1, weeks - 1) : weeks;
      const out = [];
      for (let week = 1; week <= loadingWeeks; week++) out.push({ week, sets: t, deload: false, emphasis: EMPH[(week - 1) % EMPH.length] });
      if (deloadLastWeek) out.push({ week: weeks, sets: Math.round(t * 0.5), deload: true, emphasis: 'Deload' });
      return out;
    },
  },
  Triphasic: {
    label: 'Triphasic (Dietz)',
    desc: 'Eccentric, then isometric, then concentric emphasis across the block\'s thirds — volume holds, the training stimulus shifts.',
    note: 'Dietz runs the same accumulation → transmutation → realization skeleton as Issurin/Bompa, but splits the emphasis by muscle-action phase (eccentric strength, then isometric strength, then concentric/explosive expression) rather than by a volume ramp — general phase length runs 4–6 weeks in the source material.',
    weeklyShape(baseSets, target, weeks, deloadLastWeek, rampCap) {
      if (!weeks || weeks <= 0) return [];
      const t = target || baseSets || 0;
      const phases = splitEven(weeks, ['Eccentric', 'Isometric', 'Concentric']);
      const out = [];
      phases.forEach((phase, i) => {
        const week = i + 1;
        const deload = !!deloadLastWeek && week === weeks;
        out.push({ week, sets: deload ? Math.round(t * 0.5) : t, deload, emphasis: deload ? 'Deload' : phase });
      });
      return out;
    },
  },
};
const MODEL_LIST = ['Linear', 'Block', 'Undulating', 'Conjugate', 'Triphasic'];

const stripHead = (label) => (
  <div style={{ background: 'color-mix(in srgb, var(--c-stripBg, var(--c-sf)) 88%, var(--c-ac))', borderBottom: `1px solid ${C.cardBd}`, padding: '7px 12px', fontFamily: FN, fontSize: 13, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>{label}</div>
);
const kpi = (label, value, sub, accent) => {
  // Long text values (e.g. "65–80% 1RM", "hold prior reps") shrink + wrap instead
  // of truncating at 22px; pure numbers / short codes stay big.
  const longText = typeof value === 'string' && value.length > 6 && /[a-zA-Z]/.test(value);
  return (
    <div style={{ flex: '1 1 0', minWidth: 110, border: `1px solid ${C.cardBd}`, background: 'var(--c-sf2)', padding: '9px 12px' }}>
      <div style={{ fontFamily: FN, fontSize: longText ? 13 : 22, fontWeight: 700, lineHeight: longText ? 1.25 : 1, color: accent || C.tx, fontVariantNumeric: 'tabular-nums', ...(longText ? {} : { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }) }}>{value}</div>
      <div style={{ fontFamily: FN, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.tm, marginTop: 5 }}>{label}</div>
      {sub != null && <div style={{ fontFamily: FB, fontSize: 10, color: C.td, marginTop: 2 }}>{sub}</div>}
    </div>
  );
};
const section = (title, children, key) => (
  <div key={key} style={{ border: `1px solid ${C.cardBd}`, background: 'var(--c-sf)', marginBottom: 14 }}>
    {stripHead(title)}
    <div style={{ padding: 14 }}>{children}</div>
  </div>
);

export function NextBlockReport({ model, plans, exercises, traineeName, onClose }) {
  const heb = isHebrew(traineeName);
  const nextPlan = model?.nextPlan;
  const exMap = useMemo(() => exById(exercises), [exercises]);

  const [goal, setGoal] = useState(() => GOAL_FROM_PHASE[nextPlan?.suggestedPhase] || 'Hypertrophy');
  const [blockLen, setBlockLen] = useState(4);
  const [daysPerWeek, setDaysPerWeek] = useState(() => deriveDaysPerWeek(model, plans));
  const [deloadMode, setDeloadMode] = useState('auto'); // 'none' | 'last-week' | 'auto'
  const [postInjury, setPostInjury] = useState(false);
  const [periModel, setPeriModel] = useState('Linear');
  const [copied, setCopied] = useState(false);

  const calc = useMemo(() => {
    if (!model || !nextPlan) return null;
    const rx = GOAL_PRESCRIPTIONS[goal] || GOAL_PRESCRIPTIONS.Hypertrophy;
    const baseSets = model.stats?.latestSets || 0;
    const rawTarget = Math.round(baseSets * rx.volBias);
    // ACWR ceiling only bites on the way UP (spike risk) — chronic approximated
    // as the athlete's own latest-block set count, per the lineage's own model.
    const acwrCap = Math.round(baseSets * 1.3);
    const target = (rawTarget > baseSets && baseSets > 0) ? Math.min(rawTarget, acwrCap) : rawTarget;
    const rampCap = postInjury ? 0.05 : 0.10;
    const isDeloadGoal = goal === 'Deload';
    const wantsDeloadLast = deloadMode === 'last-week' || (deloadMode === 'auto' && !isDeloadGoal && !!nextPlan.deloadDue);
    const modelDef = PERIODIZATION_MODELS[periModel] || PERIODIZATION_MODELS.Linear;
    // The "Deload" GOAL is its own flat/low-volume recipe (RP: cut volume,
    // hold intensity) — it overrides the periodization MODEL's shape, since a
    // deload block has nothing left to periodize.
    const weekly = isDeloadGoal
      ? buildWeeklyPlan({ baseSets, target, weeks: blockLen, rampCap, deloadLastWeek: wantsDeloadLast, flat: true })
          .map(w => ({ ...w, emphasis: w.deload ? 'Deload' : 'Recovery' }))
      : modelDef.weeklyShape(baseSets, target, blockLen, wantsDeloadLast, rampCap);
    // ACWR = spike risk, so it must read the PEAK week, not the last week (the
    // last week is usually the deload/low week and would understate the spike).
    const peakWeekSets = weekly.length ? Math.max(...weekly.map(w => w.sets || 0)) : target;
    const projectedAcwr = baseSets > 0 ? +(((peakWeekSets || target)) / baseSets).toFixed(2) : null;

    // 6-tab main-movement axis, latest block only. Titles that map to neither
    // Upper nor Lower (core, anti-rotation, loaded carries) go to an "Other" tally
    // so the bucket column reconciles with the total-set count instead of silently
    // dropping sets. Empty buckets only get a coverage floor on BUILDING goals — a
    // deload/peak block shouldn't invent new volume.
    const latestEx = latestBlockExercises(model, plans, exMap);
    const current = {}; BUCKETS.forEach(b => { current[b] = 0; });
    let otherSets = 0;
    latestEx.forEach(e => { const b = classifyBucket(e.title); if (current[b] != null) current[b] += e.sets; else otherSets += e.sets; });
    const building = rx.volBias >= 0.9;
    const buckets = BUCKETS.map(b => {
      const cur = current[b];
      const tgt = cur > 0 ? Math.max(1, Math.round(cur * rx.volBias)) : (building ? 3 : 0);
      return { key: b, label: BUCKET_LABEL[b], current: cur, target: tgt, gap: cur === 0 };
    });
    if (otherSets > 0) buckets.push({ key: 'Other', label: 'Other · core / carry', current: otherSets, target: Math.max(1, Math.round(otherSets * rx.volBias)), gap: false, isOther: true });

    return { rx, baseSets, target, rampCap, weekly, projectedAcwr, buckets, modelDef, modelOverridden: isDeloadGoal };
  }, [model, nextPlan, goal, blockLen, deloadMode, postInjury, periModel, plans, exMap]);

  const buildReportText = () => {
    if (!model || !nextPlan || !calc) return '';
    const L = [];
    L.push(`EXPO · Next-block report — ${traineeName || ''}${nextPlan.nextNum != null ? ` · #${nextPlan.nextNum}` : ''}`);
    L.push(`Goal: ${goal} · Phase: ${phaseMeta(nextPlan.suggestedPhase).label} · Model: ${calc.modelOverridden ? 'Deload override' : (calc.modelDef?.label || periModel)} · ${blockLen}wk · ${daysPerWeek}d/wk${postInjury ? ' · post-injury (5% ramp cap)' : ''}`);
    L.push('');
    L.push('PRESCRIPTION');
    L.push(`Total working sets target: ~${calc.target} (from ${calc.baseSets} last block)`);
    L.push(`Rep range: ${calc.rx.repRange} · Intensity: ${calc.rx.pctRange} · Rest: ${calc.rx.restSec}`);
    L.push(calc.modelOverridden ? 'Periodization model: N/A — the Deload goal overrides the model (flat volume cut, hold intensity).' : `Periodization model: ${calc.modelDef?.label || periModel} — ${calc.modelDef?.desc || ''}`);
    L.push('Weekly progression:');
    calc.weekly.forEach(w => {
      const tag = w.deload ? ' (deload)' : (w.emphasis ? ` — ${w.emphasis}` : '');
      L.push(`  Week ${w.week}: ~${w.sets} sets${tag}`);
    });
    L.push('');
    L.push('MAIN MOVEMENTS (6-tab axis, latest block → target)');
    calc.buckets.forEach(b => L.push(`  ${b.label}: ${b.current} → ${b.target} sets${b.gap ? '  [empty — floor applied]' : ''}`));
    L.push('');
    L.push('BALANCE & SAFETY');
    L.push(`Push:Pull ${nextPlan.pushPull != null ? nextPlan.pushPull : '—'} (${nextPlan.pushSets ?? '—'} push / ${nextPlan.pullSets ?? '—'} pull sets, recent blocks)`);
    L.push(`Projected load ratio (ACWR): ${calc.projectedAcwr != null ? calc.projectedAcwr : '—'} (0.8–1.3 = low risk, ≥1.5 = exponentially elevated — most-common-practice number, not gospel)`);
    L.push(`Coverage gaps: ${nextPlan.coverageGaps?.length ? nextPlan.coverageGaps.join(', ') : 'none — every primary pattern covered'}`);
    L.push('Minimum 48h between heavy loading of the same pattern.');
    L.push('');
    L.push('RATIONALE');
    L.push(calc.rx.intensityNote);
    if (!calc.modelOverridden && calc.modelDef?.note) L.push(calc.modelDef.note);
    L.push('Note: block vs. undulating periodization has no settled winner in the literature — block has the stronger mechanistic case, undulating a slight edge in newer trained-athlete meta-analyses. Treat as a legitimate coach\'s-choice call, not a solved question.');
    L.push('');
    L.push('This report prescribes structure only (phase, volume, per-movement set targets, rep bands, timing) — it never names specific exercises or loads. That stays the coach\'s call.');
    return L.join('\n');
  };
  const copyReport = () => {
    const text = buildReportText();
    if (!text) return;
    try {
      const r = navigator.clipboard?.writeText(text);
      if (r && typeof r.then === 'function') {
        r.then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); }).catch(() => { /* denied — no false toast */ });
      }
    } catch { /* clipboard unavailable — no false success */ }
  };

  const topStrip = (
    <div style={{ position: 'sticky', top: 0, zIndex: 2, background: 'color-mix(in srgb, var(--c-stripBg, var(--c-sf)) 88%, var(--c-ac))', borderBottom: `1px solid ${C.cardBd}`, padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexShrink: 0 }}>
      <div style={{ fontFamily: FN, fontSize: 13, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#fff', display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <span>Next Block Report</span>
        <span style={{ color: C.tm }}>·</span>
        <span style={{ fontFamily: heb ? FH : FN, color: '#39BDFF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{traineeName}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <button onClick={onClose} style={{ height: 26, padding: '0 12px', border: `1px solid ${C.cardBd}`, background: 'transparent', color: C.tx, fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' }}>← Back</button>
        <button onClick={onClose} aria-label="Close" style={{ width: 26, height: 26, border: `1px solid ${C.cardBd}`, background: 'transparent', color: C.tx, fontFamily: FN, fontSize: 14, cursor: 'pointer', lineHeight: 1 }}>×</button>
      </div>
    </div>
  );

  if (!model || !nextPlan || !calc) {
    return createPortal(
      <div style={{ position: 'fixed', inset: 0, zIndex: 1300, background: 'rgba(6,8,10,0.97)', display: 'flex', flexDirection: 'column' }}>
        {topStrip}
        <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
          <div style={{ border: `1px solid ${C.cardBd}`, background: 'var(--c-sf)', padding: '48px 24px', textAlign: 'center', color: C.tm, fontFamily: FB, fontSize: 13 }}>
            No training analysis to project a next block from yet — this athlete needs at least one logged block with exercise content.
          </div>
        </div>
      </div>,
      document.body,
    );
  }

  const seg = (label, value, onChange, options) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <div style={{ fontFamily: FN, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.tm }}>{label}</div>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
        {options.map(([v, l]) => {
          const on = value === v;
          return (
            <button key={String(v)} onClick={() => onChange(v)} style={{ height: 26, padding: '0 10px', border: `1px solid ${on ? '#39BDFF' : C.cardBd}`, background: on ? '#39BDFF' : 'transparent', color: on ? '#06131b' : C.tx, fontFamily: FN, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.04em', cursor: 'pointer' }}>{l}</button>
          );
        })}
      </div>
    </div>
  );

  const phaseM = phaseMeta(nextPlan.suggestedPhase);
  const acwrTone = calc.projectedAcwr == null ? C.tm : (calc.projectedAcwr >= 0.8 && calc.projectedAcwr <= 1.3) ? C.gn : calc.projectedAcwr > 1.5 ? C.rd : C.or;

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 1300, background: 'rgba(6,8,10,0.97)', display: 'flex', flexDirection: 'column' }}>
      {topStrip}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px 16px 40px' }}>
        <div style={{ maxWidth: 980, margin: '0 auto' }}>

          {/* (1) Header — goal · phase · #next · length */}
          {section(<span>Overview</span>, (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {kpi('Goal', goal)}
              {kpi('Model', calc.modelOverridden ? 'Deload override' : (calc.modelDef?.label || periModel))}
              {kpi('Phase', phaseM.label, phaseM.hint, phaseM.color)}
              {kpi('Next block', nextPlan.nextNum != null ? `#${nextPlan.nextNum}` : '—')}
              {kpi('Length', `${blockLen}wk`, `${daysPerWeek}d/wk`)}
            </div>
          ))}

          {/* Controls */}
          {section('Parameters', (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {seg('Goal', goal, setGoal, GOAL_LIST.map(g => [g, g]))}
              {seg('Periodization model', periModel, setPeriModel, MODEL_LIST.map(m => [m, PERIODIZATION_MODELS[m].label]))}
              <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                {seg('Block length', blockLen, setBlockLen, [[3, '3wk'], [4, '4wk'], [6, '6wk']])}
                {seg('Days / week', daysPerWeek, setDaysPerWeek, [2, 3, 4, 5, 6].map(n => [n, String(n)]))}
                {seg('Deload', deloadMode, setDeloadMode, [['none', 'None'], ['last-week', 'Last week'], ['auto', 'Auto']])}
                {seg('Post-injury', postInjury, setPostInjury, [[false, 'Off'], [true, 'On (5% cap)']])}
              </div>
            </div>
          ))}

          {/* (2) Prescription summary */}
          {section('Prescription', (
            <div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
                {kpi('Total sets target', calc.target, `from ${calc.baseSets} last block`, '#39BDFF')}
                {kpi('Rep range', calc.rx.repRange, calc.rx.pctRange)}
                {kpi('Rest', calc.rx.restSec)}
                {kpi('Ramp cap', `${Math.round(calc.rampCap * 100)}%`, postInjury ? 'post-injury' : 'general', postInjury ? C.or : C.tx)}
              </div>
              <div style={{ fontFamily: FN, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.tm, marginBottom: 4 }}>Weekly progression</div>
              {calc.modelOverridden && (
                <div style={{ fontFamily: FB, fontSize: 11, color: C.td, marginBottom: 8, lineHeight: 1.4 }}>Deload goal overrides the periodization model — flat volume cut, intensity held.</div>
              )}
              {!calc.modelOverridden && calc.modelDef?.desc && (
                <div style={{ fontFamily: FB, fontSize: 11, color: C.td, marginBottom: 8, lineHeight: 1.4 }}>{calc.modelDef.label} — {calc.modelDef.desc}</div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${calc.weekly.length || 1}, 1fr)`, gap: 6 }}>
                {calc.weekly.map(w => (
                  <div key={w.week} style={{ border: `1px solid ${w.deload ? C.or : C.cardBd}`, background: 'var(--c-sf2)', padding: '8px 6px', textAlign: 'center' }}>
                    <div style={{ fontFamily: FN, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.tm }}>Wk {w.week}</div>
                    <div style={{ fontFamily: FN, fontSize: 18, fontWeight: 700, color: w.deload ? C.or : C.tx, marginTop: 3, fontVariantNumeric: 'tabular-nums' }}>{w.sets}</div>
                    {w.emphasis && <div style={{ fontFamily: FN, fontSize: 7.5, letterSpacing: '0.06em', textTransform: 'uppercase', color: w.deload ? C.or : C.tm, marginTop: 2, lineHeight: 1.2 }}>{w.emphasis}</div>}
                  </div>
                ))}
              </div>
              {!calc.baseSets && (
                <div style={{ fontFamily: FB, fontSize: 11, color: C.td, marginTop: 8 }}>No prior block volume to ramp from — showing a flat starting-point target instead of a progression.</div>
              )}
            </div>
          ))}

          {/* (3) Main movements — 6-tab axis */}
          {section('Main movements', (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(140px,1fr) 80px 80px 1fr', gap: 0, fontFamily: FN, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.tm, padding: '0 4px 6px', borderBottom: `1px solid ${C.cardBd}` }}>
                <div>Bucket</div><div style={{ textAlign: 'right' }}>Current</div><div style={{ textAlign: 'right' }}>Target</div><div style={{ paddingLeft: 10 }}>Note</div>
              </div>
              {calc.buckets.map((b, i) => (
                <div key={b.key} style={{ display: 'grid', gridTemplateColumns: 'minmax(140px,1fr) 80px 80px 1fr', gap: 0, alignItems: 'center', padding: '7px 4px', background: i % 2 ? 'transparent' : 'var(--c-sf2)' }}>
                  <div style={{ fontFamily: FB, fontSize: 12.5, color: C.tx }}>{b.label}</div>
                  <div style={{ fontFamily: FN, fontSize: 13, fontVariantNumeric: 'tabular-nums', color: C.tm, textAlign: 'right' }}>{b.current}</div>
                  <div style={{ fontFamily: FN, fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: '#39BDFF', textAlign: 'right' }}>{b.target}</div>
                  <div style={{ paddingLeft: 10, fontFamily: FB, fontSize: 11, color: b.gap ? C.rd : C.td }}>{b.gap ? 'empty this block — floor target applied' : ''}</div>
                </div>
              ))}
            </div>
          ))}

          {/* (4) Balance & safety */}
          {section('Balance & safety', (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {kpi('Push:Pull', nextPlan.pushPull != null ? nextPlan.pushPull : '—', `${nextPlan.pushSets ?? '—'} push / ${nextPlan.pullSets ?? '—'} pull`)}
                {kpi('Projected ACWR', calc.projectedAcwr != null ? calc.projectedAcwr.toFixed(2) : '—', '0.8–1.3 optimal', acwrTone)}
                {kpi('Coverage gaps', nextPlan.coverageGaps?.length || 0, nextPlan.coverageGaps?.length ? nextPlan.coverageGaps.join(', ') : 'none', nextPlan.coverageGaps?.length ? C.rd : C.gn)}
              </div>
              <div style={{ fontFamily: FB, fontSize: 12, color: C.td, lineHeight: 1.5 }}>Minimum 48h between heavy loading of the same movement pattern.</div>
            </div>
          ))}

          {/* (5) Rationale */}
          {section('Rationale', (
            <div style={{ fontFamily: FB, fontSize: 13, color: C.tx, lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>{calc.rx.intensityNote}</div>
              {!calc.modelOverridden && calc.modelDef?.note && <div style={{ color: C.td, fontSize: 12 }}>{calc.modelDef.note}</div>}
              <div style={{ color: C.td, fontSize: 12 }}>Note: block vs. undulating periodization has no settled winner in the literature — block periodization has the stronger mechanistic case (concentrated stimulus, Issurin's residual-effects math), undulating shows a slight edge in newer meta-analytic literature for trained athletes. Treat this as a legitimate coach's-choice call, not a solved question.</div>
            </div>
          ))}

          {/* (6) Copy */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
            <button onClick={copyReport} style={{ height: 30, padding: '0 14px', border: `1px solid ${copied ? C.gn : '#39BDFF'}`, background: copied ? 'transparent' : '#39BDFF', color: copied ? C.gn : '#06131b', fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer' }}>
              {copied ? 'Copied ✓' : '⧉ Copy full report'}
            </button>
          </div>

          <div style={{ fontFamily: FB, fontSize: 11, color: C.td, textAlign: 'center', padding: '4px 0 0' }}>
            This report prescribes structure only — phase, volume, per-movement set targets, rep bands, timing. It never names specific exercises or loads; that stays the coach's call.
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
