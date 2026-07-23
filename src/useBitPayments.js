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

import { useCallback, useEffect, useMemo, useState } from 'react';
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
  currency: row.currency || 'ils',   // carried through (was dropped) so totals can be currency-aware; all current inserts are 'ils'
  date: (row.paid_at || row.created_at || new Date().toISOString()).slice(0, 10),
  status: STATUS_LABEL[row.status] || row.status,
  // The Bit-app integration is gone (2026-06-12); rows are plain ledger
  // entries with no collection method recorded. Kept for shape compat.
  method: '',
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

  // Memoized on `rows`: a fresh array every render (adapt is a module-level
  // pure fn) gave every consumer an unstable reference, so effects keyed on
  // `payments` (e.g. DashboardView's outstanding-tile fetch) re-ran on EVERY
  // parent render — query amplification. Stable identity unless rows change.
  const payments = useMemo(() => rows.map(adapt), [rows]);

  const addPayment = useCallback(async ({ traineeId, amount, date, notes, status }) => {
    // Honor the form's Status selector (was hard-coded 'paid', so every
    // recorded payment counted as collected money regardless of choice).
    const inv = status ? Object.entries(STATUS_LABEL).find(([, v]) => v === status) : null;
    const dbStatus = inv ? inv[0] : (status ? status.toLowerCase() : 'paid');
    const row = {
      trainee_id: traineeId,
      amount: Number(amount) || 0,
      currency: 'ils',
      reference: notes || null,
      status: dbStatus,
    };
    // paid_at / paid_amount only make sense once money actually arrived — the
    // adapter reads them as the canonical date/amount. For pending/canceled
    // rows leave them null so they fall back to created_at and aren't counted.
    if (dbStatus === 'paid') {
      row.paid_amount = Number(amount) || 0;
      row.paid_at = date ? new Date(date + 'T12:00:00Z').toISOString() : new Date().toISOString();
    }
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
    // Write BOTH amount + paid_amount so every reader agrees: adapt() prefers
    // paid_amount, but BillingView ledger/roster + the Dashboard Outstanding tile
    // read the raw `amount` column — leaving them out of sync under-counted
    // outstanding after an edit. (Safe: paid_amount<amount 'Partial' logic isn't
    // implemented — Partial was removed from the selector.)
    if (patch.amount != null) { dbPatch.paid_amount = Number(patch.amount); dbPatch.amount = Number(patch.amount); }
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
