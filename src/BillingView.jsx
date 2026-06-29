// /coach/billing — manual payment ledger.
//
// Rows live in `bit_payment_requests` (legacy table name from the retired
// Bit-app integration — the bitpay.co.il deep links 302'd to a Poalim
// error page and Bit exposes no usable request API, so the whole Bit
// surface was removed 2026-06-12). The flow now:
//   1. Coach creates a payment request (trainee + amount + reference).
//   2. Coach collects however they like (Bit chat, cash, transfer) and
//      marks the row paid when the money arrives.
// The same rows feed dashboard revenue, overdue alerts, and auto-tasks
// via useBitPayments.
//
// Stripe is NOT used. The earlier subscriptions + invoices tables stay
// dormant in the DB for future use; this surface only reads/writes
// bit_payment_requests.

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { fmtPrettyDate } from './dates';
import { C, FN, FB } from './theme';
import { supabase } from './supabase';
import { isRefined5b, RefinedHeaderStrip, Btn, Input, toast, confirmToast, useEscClose } from './ui';

const fmtCurrency = (amount, currency = 'ils') => {
  const sym = currency === 'usd' ? '$' : '₪';
  return `${sym}${Number(amount).toLocaleString()}`;
};

export default function BillingView({ trainees }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showRequest, setShowRequest] = useState(false);
  const refined = isRefined5b();
  const PAD = 14;

  const traineesById = useMemo(() => Object.fromEntries((trainees || []).map(t => [t.id, t])), [trainees]);

  const [loadError, setLoadError] = useState(null);
  const reload = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const { data: r, error: re } = await supabase
        .from('bit_payment_requests').select('*').order('created_at', { ascending: false }).limit(200);
      // PostgREST errors don't throw — surface them so an RLS/permission
      // failure doesn't read as "No payment requests yet".
      if (re) { setLoadError(re.message); return; }
      setRequests(r || []);
    } catch (e) { setLoadError(e?.message || 'Could not load billing data.'); }
    finally { setLoading(false); } // never strand the spinner
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const markPaid = async (id) => {
    if (!(await confirmToast('Mark this request as PAID? Use this only after the money has actually arrived.', { okLabel: 'Mark paid', cancelLabel: 'Cancel' }))) return;
    const { error } = await supabase.from('bit_payment_requests').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', id);
    if (error) { toast(`Update failed: ${error.message}`, 'error'); return; }
    setRequests(prev => prev.map(r => r.id === id ? { ...r, status: 'paid', paid_at: new Date().toISOString() } : r));
  };

  const cancelRequest = async (id) => {
    if (!(await confirmToast('Cancel this payment request?', { okLabel: 'Cancel request', cancelLabel: 'Keep' }))) return;
    const { error } = await supabase.from('bit_payment_requests').update({ status: 'canceled' }).eq('id', id);
    if (error) { toast(`Update failed: ${error.message}`, 'error'); return; }
    setRequests(prev => prev.map(r => r.id === id ? { ...r, status: 'canceled' } : r));
  };

  const remove = async (id) => {
    if (!(await confirmToast('Delete this request from the log?', { okLabel: 'Delete', cancelLabel: 'Cancel' }))) return;
    const { error } = await supabase.from('bit_payment_requests').delete().eq('id', id);
    if (error) { toast(`Delete failed: ${error.message}`, 'error'); return; }
    setRequests(prev => prev.filter(r => r.id !== id));
  };

  // Roster snapshot — for each active trainee, the most-recent request
  // (any status) so the coach can see "pending / paid / overdue" at a
  // glance without scrolling.
  const rosterSummary = useMemo(() => {
    const out = {};
    for (const r of requests) {
      const k = r.trainee_id;
      if (!out[k] || new Date(r.created_at) > new Date(out[k].created_at)) out[k] = r;
    }
    return out;
  }, [requests]);

  if (loading) return <div style={{ padding: 30, textAlign: 'center', color: C.td }}>Loading…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* REQUESTS */}
      <div style={{ background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, padding: PAD }}>
        <RefinedHeaderStrip padY={PAD} padX={PAD} marginBottom={12}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 700, fontSize: 13, letterSpacing: '0.04em', textTransform: 'uppercase', color: refined ? '#FFFFFF' : C.tx }}>
              PAYMENT REQUESTS ({requests.filter(r => r.status === 'pending').length} pending)
            </span>
            <button onClick={() => setShowRequest(true)}
              style={{
                background: 'transparent',
                border: `1px solid ${refined ? '#FFFFFF' : C.ac}`,
                color: refined ? '#FFFFFF' : C.ac,
                padding: '4px 12px', fontFamily: FN, fontSize: 10, fontWeight: 700,
                letterSpacing: '0.12em', cursor: 'pointer',
              }}>+ NEW REQUEST</button>
          </div>
        </RefinedHeaderStrip>
        {loadError ? (
          <div style={{ padding: 14, textAlign: 'center', color: C.rd, fontSize: 13 }}>
            Couldn’t load billing data: {loadError}. <button onClick={reload} style={{ background: 'transparent', border: 'none', color: C.ac, cursor: 'pointer', fontFamily: FN, fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textDecoration: 'underline' }}>RETRY</button>
          </div>
        ) : requests.length === 0 ? (
          <div style={{ padding: 14, textAlign: 'center', color: C.td, fontSize: 13 }}>
            No payment requests yet. Tap "+ NEW REQUEST" to create one.
          </div>
        ) : requests.map(r => {
          const t = traineesById[r.trainee_id];
          const tone = r.status === 'paid' ? C.gn : r.status === 'canceled' ? C.tm : C.or;
          return (
            <div key={r.id} style={{
              border: `1px solid ${C.cardBd}`, borderLeft: `3px solid ${tone}`,
              padding: '10px 12px', marginBottom: 8, background: 'var(--c-sf)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: FN, fontSize: 9, color: tone, fontWeight: 700, letterSpacing: '0.12em', border: `1px solid ${tone}`, padding: '2px 8px', minWidth: 84, textAlign: 'center' }}>
                  {r.status.toUpperCase()}
                </span>
                <span style={{ fontWeight: 700, fontSize: 14, color: C.tx }}>{t?.name || r.trainee_id}</span>
                <span style={{ flex: 1 }} />
                <span style={{ fontFamily: FN, fontSize: 16, color: C.ac, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmtCurrency(r.amount, r.currency)}</span>
              </div>
              {r.reference && <div style={{ fontSize: 12, color: C.tm, marginBottom: 6 }}>{r.reference}</div>}
              <div style={{ fontFamily: FN, fontSize: 10, color: C.td, marginBottom: 6 }}>
                Created {fmtPrettyDate(r.created_at)}{r.paid_at ? ` · paid ${fmtPrettyDate(r.paid_at)}` : ''}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {r.status === 'pending' && (
                  <>
                    <button onClick={() => markPaid(r.id)} style={btnStyle(C.gn)}>✓ MARK PAID</button>
                    <button onClick={() => cancelRequest(r.id)} style={btnStyle(C.rd)}>× CANCEL</button>
                  </>
                )}
                <button onClick={() => remove(r.id)} style={btnStyle(C.td)}>DELETE</button>
              </div>
            </div>
          );
        })}
      </div>

      {/* ROSTER STATUS */}
      <div style={{ background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, padding: PAD }}>
        <RefinedHeaderStrip padY={PAD} padX={PAD} marginBottom={12}>
          <span style={{ fontWeight: 700, fontSize: 13, letterSpacing: '0.04em', textTransform: 'uppercase', color: refined ? '#FFFFFF' : C.tx }}>
            ROSTER STATUS
          </span>
        </RefinedHeaderStrip>
        {(trainees || []).filter(t => t.status === 'Active').map(t => {
          const r = rosterSummary[t.id];
          const tone = !r ? C.td : r.status === 'paid' ? C.gn : r.status === 'canceled' ? C.tm : C.or;
          const labelTxt = !r ? 'NO REQUEST' : r.status.toUpperCase();
          return (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 6px', borderBottom: `1px solid ${C.cardBd}` }}>
              <span style={{ fontFamily: FN, fontSize: 9, color: tone, fontWeight: 700, letterSpacing: '0.12em', border: `1px solid ${tone}`, padding: '2px 8px', minWidth: 90, textAlign: 'center' }}>
                {labelTxt}
              </span>
              <span style={{ flex: 1, fontSize: 13, color: C.tx }}>{t.name}</span>
              <span style={{ fontFamily: FN, fontSize: 11, color: C.tm, fontVariantNumeric: 'tabular-nums' }}>
                {r ? `${fmtCurrency(r.amount, r.currency)} · ${fmtPrettyDate(r.created_at)}` : '—'}
              </span>
            </div>
          );
        })}
      </div>

      {showRequest && (
        <RequestModal
          trainees={trainees || []}
          onClose={() => setShowRequest(false)}
          onCreated={() => { setShowRequest(false); reload(); }} />
      )}
    </div>
  );
}

function RequestModal({ trainees, onClose, onCreated }) {
  const [traineeId, setTraineeId] = useState('');
  const [amount, setAmount] = useState(800);
  // VAT is a per-request choice. Whole-number percent; 18% = Israeli VAT.
  const [vatPct, setVatPct] = useState(18);
  const [reference, setReference] = useState('');
  const [saving, setSaving] = useState(false);
  const active = trainees.filter(t => t.status !== 'Archived');
  useEscClose(true, () => { if (!saving) onClose(); }); // Escape closes (not mid-save)

  const create = async () => {
    if (!traineeId) { toast('Pick a trainee.', 'warn'); return; }
    if (!amount || amount <= 0) { toast('Amount must be positive.', 'warn'); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from('bit_payment_requests').insert({
        trainee_id: traineeId,
        amount: Number(amount),
        currency: 'ils',
        reference: reference.trim() || null,
        status: 'pending',
      });
      if (error) throw error;
      toast('Payment request created.', 'success');
      onCreated();
    } catch (e) {
      toast(`Create failed: ${e?.message || e}`, 'error', { ttl: 6000 });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div onClick={onClose} role="dialog" aria-modal="true" aria-label="New payment request" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1200, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 20, paddingTop: 60, backdropFilter: 'blur(4px)' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--c-bg)', border: `1px solid ${C.cardBd}`, maxWidth: 480, width: '100%', padding: 22, maxHeight: '80vh', overflow: 'auto' }}>
        <h3 style={{ margin: '0 0 16px', fontFamily: FN, fontSize: 14, color: C.ac, letterSpacing: '0.12em', fontWeight: 700 }}>+ NEW PAYMENT REQUEST</h3>
        <div style={{ marginBottom: 10 }}>
          <label style={{ display: 'block', fontFamily: FN, fontSize: 9, color: C.tm, letterSpacing: '0.18em', fontWeight: 700, marginBottom: 4 }}>TRAINEE</label>
          <select value={traineeId} onChange={e => setTraineeId(e.target.value)}
            style={{ width: '100%', background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, padding: '8px 10px', color: C.tx, fontFamily: FN, fontSize: 12, outline: 'none' }}>
            <option value="">— Choose —</option>
            {active.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 4 }}>
          <Input label="Amount (₪)" type="number" value={amount} onChange={e => setAmount(e.target.value)} />
          <Input label="VAT %" type="number" value={vatPct} onChange={e => setVatPct(e.target.value)} />
        </div>
        {Number(vatPct) > 0 && Number(amount) > 0 && (
          <div style={{ fontFamily: FN, fontSize: 10, color: C.tm, marginBottom: 12, letterSpacing: '0.04em' }}>
            incl. {vatPct}% VAT · ≈ ₪{(Number(amount) / (1 + Number(vatPct) / 100)).toFixed(0)} pre-VAT
          </div>
        )}
        <div style={{ marginBottom: 12 }}>
          <Input label="Reference" value={reference} onChange={e => setReference(e.target.value)} placeholder="May 2026 — 8 sessions" />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <Btn variant="ghost" onClick={onClose} disabled={saving}>Cancel</Btn>
          <Btn onClick={create} disabled={saving} style={{ minWidth: 132, justifyContent: 'center' }}>{saving ? 'Creating…' : 'Create request'}</Btn>
        </div>
      </div>
    </div>
  );
}

function pillStyle(color) {
  return {
    padding: '4px 10px', background: 'transparent', border: `1px solid ${color}`, color,
    fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em',
    textDecoration: 'none', cursor: 'pointer', height: 24,
    display: 'inline-flex', alignItems: 'center',
  };
}
function btnStyle(color) {
  return { ...pillStyle(color), cursor: 'pointer' };
}
