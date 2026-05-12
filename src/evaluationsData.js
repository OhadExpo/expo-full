// Data layer for trainee_evaluations.
//
// Reads: ordered list of evals per trainee (newest first). Writes: create
// + update by id. The trainee detail surface fetches once, then patches
// state optimistically when the editor saves so the side-by-side view
// reflects edits without a re-fetch round-trip.

import { useEffect, useState, useCallback } from 'react';
import { supabase } from './supabase';

const newId = () => 'eval_' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36).slice(-4);

export function useTraineeEvaluations(traineeId) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!traineeId) { setRows([]); setLoading(false); return; }
    const { data, error } = await supabase
      .from('trainee_evaluations')
      .select('*')
      .eq('trainee_id', traineeId)
      .order('eval_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) {
      console.warn('trainee_evaluations fetch failed:', error.message);
      setRows([]);
    } else {
      setRows(data || []);
    }
    setLoading(false);
  }, [traineeId]);

  useEffect(() => { setLoading(true); refetch(); }, [refetch]);

  const create = useCallback(async (input) => {
    if (!traineeId || !input.eval_date) return null;
    const row = {
      id: newId(),
      trainee_id: traineeId,
      eval_date: input.eval_date,
      eval_time: input.eval_time || null,
      age: input.age != null ? Number(input.age) : null,
      height_cm: input.height_cm != null ? Number(input.height_cm) : null,
      weight_kg: input.weight_kg != null ? Number(input.weight_kg) : null,
      scores: input.scores || {},
      rom: input.rom || {},
      notes: input.notes || null,
    };
    const { error } = await supabase.from('trainee_evaluations').insert(row);
    if (error) { console.warn('trainee_evaluations insert failed:', error.message); return null; }
    setRows(prev => [row, ...prev]);
    return row;
  }, [traineeId]);

  const update = useCallback(async (id, patch) => {
    const dbPatch = { ...patch };
    if ('age' in dbPatch && dbPatch.age !== null) dbPatch.age = Number(dbPatch.age) || null;
    if ('height_cm' in dbPatch && dbPatch.height_cm !== null) dbPatch.height_cm = Number(dbPatch.height_cm) || null;
    if ('weight_kg' in dbPatch && dbPatch.weight_kg !== null) dbPatch.weight_kg = Number(dbPatch.weight_kg) || null;
    const { error } = await supabase.from('trainee_evaluations').update(dbPatch).eq('id', id);
    if (error) { console.warn('trainee_evaluations update failed:', error.message); return; }
    setRows(prev => prev.map(r => r.id === id ? { ...r, ...dbPatch } : r));
  }, []);

  const remove = useCallback(async (id) => {
    const { error } = await supabase.from('trainee_evaluations').delete().eq('id', id);
    if (error) { console.warn('trainee_evaluations delete failed:', error.message); return; }
    setRows(prev => prev.filter(r => r.id !== id));
  }, []);

  return { rows, loading, refetch, create, update, remove };
}
