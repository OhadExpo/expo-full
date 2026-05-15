// Single source of truth for payments: bit_payment_requests.
//
// The rest of the app (DashboardView, TraineesView, autoTasks, TraineeDetail)
// was written against an `expo-payments` JSONB store with rows shaped like
// { id, traineeId, amount, date, status: 'Paid' | ..., method, notes }.
// This hook reads bit_payment_requests and adapts each row to that exact
// shape, so downstream consumers don't change. The legacy expo-payments
// store has been retired; this is the only data path.
//
// The adapter:
//   - emits one row per Bit request, regardless of status
//   - maps DB statuses to the legacy capitalized form ('paid' → 'Paid')
//   - uses paid_at (if present) as the canonical `date` so monthly totals
//     bucket by when the money actually arrived, not when the request was
//     opened. Falls back to created_at for pending/canceled rows.
//   - prefers paid_amount over amount when the actual collected amount
//     differs from the request (partial payments).
//
// Mutations:
//   addPayment({ traineeId, amount, date, notes }) — inserts a paid row
//     directly (no Bit deep-link). Used by TraineeDetail's add-payment
//     form so coaches can record cash / bank-transfer payments in the
//     same ledger.
//   updatePayment(id, patch) — UPDATE on bit_payment_requests
//   removePayment(id) — DELETE on bit_payment_requests

import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';

const STATUS_LABEL = {
  paid: 'Paid',
  pending: 'Pending',
  canceled: 'Canceled',
};

const adapt = (row) => ({
  id: row.id,
  traineeId: row.trainee_id,
  amount: row.paid_amount != null ? Number(row.paid_amount) : Number(row.amount),
  date: (row.paid_at || row.created_at || new Date().toISOString()).slice(0, 10),
  status: STATUS_LABEL[row.status] || row.status,
  method: 'Bit',
  notes: row.reference || '',
  createdAt: row.created_at,
});

export default function useBitPayments() {
  const [rows, setRows] = useState([]);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    const { data, error } = await supabase
      .from('bit_payment_requests')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1000);
    if (error) {
      console.warn('useBitPayments reload failed:', error.message);
      return;
    }
    setRows(data || []);
    setLoaded(true);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  useEffect(() => {
    const channel = supabase
      .channel('bit_payment_requests:all')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bit_payment_requests' }, () => {
        reload();
      })
      .subscribe();
    return () => { try { supabase.removeChannel(channel); } catch {} };
  }, [reload]);

  const payments = rows.map(adapt);

  const addPayment = useCallback(async ({ traineeId, amount, date, notes }) => {
    const paidAt = date ? new Date(date + 'T12:00:00Z').toISOString() : new Date().toISOString();
    const row = {
      trainee_id: traineeId,
      amount: Number(amount) || 0,
      paid_amount: Number(amount) || 0,
      currency: 'ils',
      reference: notes || null,
      status: 'paid',
      paid_at: paidAt,
    };
    const { data, error } = await supabase.from('bit_payment_requests').insert(row).select().single();
    if (error) {
      console.warn('addPayment failed:', error.message);
      throw error;
    }
    setRows((prev) => [data, ...prev]);
    return adapt(data);
  }, []);

  const updatePayment = useCallback(async (id, patch) => {
    const dbPatch = {};
    if (patch.amount != null) dbPatch.paid_amount = Number(patch.amount);
    if (patch.notes != null) dbPatch.reference = patch.notes;
    if (patch.date != null) dbPatch.paid_at = new Date(patch.date + 'T12:00:00Z').toISOString();
    if (patch.status != null) {
      const inv = Object.entries(STATUS_LABEL).find(([, v]) => v === patch.status);
      dbPatch.status = inv ? inv[0] : patch.status.toLowerCase();
    }
    const { data, error } = await supabase.from('bit_payment_requests').update(dbPatch).eq('id', id).select().single();
    if (error) {
      console.warn('updatePayment failed:', error.message);
      throw error;
    }
    setRows((prev) => prev.map((r) => (r.id === id ? data : r)));
  }, []);

  const removePayment = useCallback(async (id) => {
    const { error } = await supabase.from('bit_payment_requests').delete().eq('id', id);
    if (error) {
      console.warn('removePayment failed:', error.message);
      throw error;
    }
    setRows((prev) => prev.filter((r) => r.id !== id));
  }, []);

  return { payments, loaded, reload, addPayment, updatePayment, removePayment };
}
