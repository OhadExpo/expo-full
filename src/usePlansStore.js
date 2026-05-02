// usePlansStore.js — Plans stored in dedicated Supabase table (not store blob)
// List view loads only metadata; full plan data loads on demand
import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { supabase } from './supabase';
import { uid } from './theme';

// Drive-imported plans store exercises as d.ex = [{eid, s, r, tempo, superset, n, wk}]
// to save space. The trainer PlanEditor expects d.exercises = [{id, exerciseId, sets,
// reps, tempo, superset, notes, ...}]. Normalize on load so the editor sees one shape;
// saving writes back the trainer shape, which ClientPortal also accepts post-fix.
function normalizeDays(days) {
  return (days || []).map(d => {
    const hasTrainerShape = Array.isArray(d.exercises);
    const src = hasTrainerShape ? d.exercises : (Array.isArray(d.ex) ? d.ex : []);
    const exercises = src.map((e, i) => ({
      id: e.id || uid(),
      exerciseId: e.exerciseId || e.eid || '',
      sets: e.sets ?? e.s ?? 3,
      reps: e.reps ?? e.r ?? '',
      load: e.load ?? '',
      rpe: e.rpe ?? '',
      tempo: e.tempo ?? '',
      rest: e.rest ?? '90',
      notes: e.notes ?? e.n ?? '',
      order: e.order ?? i,
      superset: e.superset ?? '',
      wk: e.wk ?? null,
      wkS: e.wkS ?? null,
      // Per-exercise URL override. '' or undefined → fall back to library
      // videoLink at render time. Editing this never touches the library row.
      videoUrl: e.videoUrl ?? e.vid ?? '',
      title: e.title,
    }));
    return { id: d.id || uid(), name: d.name || d.n || '', exercises };
  });
}

// Plan index: lightweight list for PlansView, Dashboard counts, etc.
export function usePlanIndex() {
  const [index, setIndex] = useState([]);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    try {
      // is_template_purchase is selected via "*" so the read path doesn't break
      // before the SQL migration runs (Postgres ignores unknown columns in
      // SELECT *; an explicit column would 400 on a pre-migration DB). The
      // gate falls back to data.isTemplatePurchase + name prefix below.
      const { data } = await supabase
        .from('plans')
        .select('*')
        .order('created_at', { ascending: false });
      if (data) {
        const enriched = data.map(p => {
          const days = p.data?.days || [];
          return {
            id: p.id,
            name: p.name,
            traineeId: p.trainee_id,
            phase: p.phase,
            active: p.active,
            createdAt: p.created_at,
            updatedAt: p.updated_at,
            weeks: p.data?.weeks || 4,
            // Template-purchase flag: prefer the typed column once the
            // migration has run, fall back to JSONB blob, then to the
            // legacy name-prefix detection so behaviour is stable across
            // the rollout window.
            isTemplatePurchase:
              p.is_template_purchase === true
              || p.data?.isTemplatePurchase === true
              || /^(\[expo\]|expo · |expo - )/i.test(p.name || ''),
            dayCount: days.length,
            exerciseCount: days.reduce((a, d) => a + ((d.exercises || d.ex || []).length), 0),
            dayNames: days.map(d => d.name),
          };
        });
        setIndex(enriched);
      }
    } catch (e) { console.error('usePlanIndex load error:', e); }
    setLoaded(true);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  return { index, loaded, reload };
}

// Full plan loader: fetches single plan data for editing
export function useFullPlan() {
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (planId) => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('plans')
        .select('*')
        .eq('id', planId)
        .single();
      if (data) {
        // Convert from DB format to app format
        setPlan({
          id: data.id,
          name: data.name,
          traineeId: data.trainee_id,
          phase: data.phase || '',
          notes: data.notes || '',
          active: data.active,
          createdAt: data.created_at,
          days: normalizeDays(data.data?.days),
          warmup: data.data?.warmup || [],
          weeks: data.data?.weeks || 4,
          // Template-purchase flag — same precedence as in usePlanIndex.
          isTemplatePurchase:
            data.is_template_purchase === true
            || data.data?.isTemplatePurchase === true
            || /^(\[expo\]|expo · |expo - )/i.test(data.name || ''),
        });
      }
    } catch (e) { console.error('useFullPlan load error:', e); }
    setLoading(false);
  }, []);

  const clear = useCallback(() => setPlan(null), []);

  return { plan, loading, load, clear, setPlan };
}

// Save plan to Supabase plans table.
//
// Template-purchase flag: written into data JSONB so the read path works on
// any DB regardless of whether the SQL migration has run. Once the column
// exists (see scripts/migrations/2026-04-27-plans-is-template-purchase.sql)
// we also try to write the typed column; if that 400s on an unmigrated DB
// we retry without the column so coach saves never break.
export async function savePlan(plan) {
  const isTemplate =
    plan.isTemplatePurchase === true
    || /^(\[expo\]|expo · |expo - )/i.test(plan.name || '');
  const baseRow = {
    id: plan.id,
    name: plan.name || '',
    trainee_id: plan.traineeId || '',
    phase: plan.phase || '',
    notes: plan.notes || '',
    active: plan.active !== false,
    created_at: plan.createdAt || new Date().toISOString(),
    updated_at: new Date().toISOString(),
    data: {
      days: plan.days || [],
      warmup: plan.warmup || [],
      weeks: plan.weeks || 4,
      isTemplatePurchase: isTemplate,
    },
  };
  const rowWithCol = { ...baseRow, is_template_purchase: isTemplate };
  let { error } = await supabase.from('plans').upsert(rowWithCol);
  if (error && /column .*is_template_purchase/i.test(error.message || '')) {
    // Pre-migration DB — fall back to JSONB-only write.
    ({ error } = await supabase.from('plans').upsert(baseRow));
  }
  if (error) console.error('savePlan error:', error);
  return !error;
}

// Delete plan from Supabase plans table
export async function deletePlan(planId) {
  const { error } = await supabase.from('plans').delete().eq('id', planId);
  if (error) console.error('deletePlan error:', error);
  return !error;
}

// Duplicate plan
export async function duplicatePlan(plan) {
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  const newPlan = {
    ...plan,
    id: 'pl_' + uid(),
    name: plan.name + ' (copy)',
    createdAt: new Date().toISOString(),
  };
  return await savePlan(newPlan) ? newPlan : null;
}
