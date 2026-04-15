// usePlansStore.js — Plans stored in dedicated Supabase table (not store blob)
// List view loads only metadata; full plan data loads on demand
import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { supabase } from './supabase';

// Plan index: lightweight list for PlansView, Dashboard counts, etc.
export function usePlanIndex() {
  const [index, setIndex] = useState([]);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('plans')
        .select('id, name, trainee_id, phase, active, created_at, data')
        .order('created_at', { ascending: false });
      if (data) {
        // Compute day/exercise counts from data without storing full nested arrays in state
        const enriched = data.map(p => {
          const days = p.data?.days || [];
          return {
            id: p.id,
            name: p.name,
            traineeId: p.trainee_id,
            phase: p.phase,
            active: p.active,
            createdAt: p.created_at,
            dayCount: days.length,
            exerciseCount: days.reduce((a, d) => a + (d.exercises?.length || 0), 0),
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
          days: data.data?.days || [],
          warmup: data.data?.warmup || [],
        });
      }
    } catch (e) { console.error('useFullPlan load error:', e); }
    setLoading(false);
  }, []);

  const clear = useCallback(() => setPlan(null), []);

  return { plan, loading, load, clear, setPlan };
}

// Save plan to Supabase plans table
export async function savePlan(plan) {
  const row = {
    id: plan.id,
    name: plan.name || '',
    trainee_id: plan.traineeId || '',
    phase: plan.phase || '',
    notes: plan.notes || '',
    active: plan.active !== false,
    created_at: plan.createdAt || new Date().toISOString(),
    updated_at: new Date().toISOString(),
    data: { days: plan.days || [], warmup: plan.warmup || [] },
  };
  const { error } = await supabase.from('plans').upsert(row);
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
