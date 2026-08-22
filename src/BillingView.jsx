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
import { createPortal } from 'react-dom';
import { fmtPrettyDate } from './dates';
import { C, FN, FB } from './theme';
import { supabase } from './supabase';
import { isRefined5b, RefinedHeaderStrip, Btn, Input, toast, confirmToast, useEscClose, stripBtnBase } from './ui';
import { parseTraineeId } from './traineeUtils';
import { normalizePhoneIL } from './whatsappButton';

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
      // Roll a couple's sub-member payment (tr_x__0/__1) up to the parent id so
      // the ROSTER STATUS row (keyed by the couple's parent t.id) finds it
      // instead of showing 'NO REQUEST' despite a real payment.
      const parsed = parseTraineeId(r.trainee_id);
      const k = parsed ? parsed.parentId : r.trainee_id;
      if (!out[k] || new Date(r.created_at) > new Date(out[k].created_at)) out[k] = r;
    }
    return out;
  }, [requests]);

  const OVERDUE_DAYS = 14;
  const daysSince = (d) => Math.floor((Date.now() - new Date(d).getTime()) / 86400000);

  // Billing at-a-glance — what's owed, what's overdue, what came in this month:
  // the numbers a solo coach acts on (collections). No VAT (Ohad: "vat is useless").
  const summary = useMemo(() => {
    let outstanding = 0, pendingCount = 0, overdueCount = 0, overdueAmt = 0, collectedMonth = 0;
    const now = new Date(); const y = now.getFullYear(), mo = now.getMonth();
    for (const r of requests) {
      const amt = Number(r.amount) || 0;
      if (r.status === 'pending') {
        outstanding += amt; pendingCount++;
        if (daysSince(r.created_at) >= OVERDUE_DAYS) { overdueCount++; overdueAmt += amt; }
      } else if (r.status === 'paid' && r.paid_at) {
        const d = new Date(r.paid_at);
        if (d.getFullYear() === y && d.getMonth() === mo) collectedMonth += amt;
      }
    }
    return { outstanding, pendingCount, overdueCount, overdueAmt, collectedMonth };
  }, [requests]);

  // One-tap WhatsApp payment reminder (masculine-singular Hebrew register).
  // normalizePhoneIL like every other WhatsApp entry point — wa.me rejects the
  // local 05X format the roster stores (audit 08-22).
  const chase = (t, r) => {
    const phone = normalizePhoneIL(t?.phone);
    if (!phone) { toast('No phone number on file for this athlete.', 'warn'); return; }
    const amt = fmtCurrency(r.amount, r.currency);
    const msg = encodeURIComponent(`היי ${t?.name || ''}, תזכורת קטנה לגבי התשלום (${amt})${r.reference ? ` — ${r.reference}` : ''}. תודה!`);
    window.open(`https://wa.me/${phone}?text=${msg}`, '_blank');
  };

  if (loading) return <div style={{ padding: 30, textAlign: 'center', color: C.td }}>Loading…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* AT-A-GLANCE — outstanding · overdue · collected this month. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
        {[
          { label: 'Outstanding', value: fmtCurrency(summary.outstanding), sub: `${summary.pendingCount} pending`, dot: summary.outstanding > 0 ? C.or : C.gn },
          { label: 'Overdue', value: fmtCurrency(summary.overdueAmt), sub: `${summary.overdueCount} · ≥ ${OVERDUE_DAYS}d`, dot: summary.overdueCount > 0 ? C.rd : C.gn },
          { label: 'Collected · This month', value: fmtCurrency(summary.collectedMonth), sub: 'received', dot: C.gn },
        ].map((s, i) => (
          <div key={i} style={{ background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, padding: '14px 18px', boxShadow: C.cardShadow }}>
            <div style={{ background: 'color-mix(in srgb, var(--c-stripBg, var(--c-sf)) 90%, var(--c-ac))', margin: '-14px -18px 12px', padding: '8px 18px', borderBottom: `1px solid ${C.cardBd}` }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.dot, boxShadow: `0 0 5px ${s.dot}66` }} />
                <span style={{ fontFamily: FN, fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', color: '#FFFFFF', textTransform: 'uppercase' }}>{s.label}</span>
              </span>
            </div>
            <div style={{ fontFamily: FN, fontSize: 26, fontWeight: 800, color: C.tx, letterSpacing: '-0.015em', lineHeight: 1.05 }}>{s.value}</div>
            <div style={{ fontFamily: FN, fontSize: 10, color: C.tm, marginTop: 5, letterSpacing: '0.04em' }}>{s.sub}</div>
          </div>
        ))}
      </div>
      {/* REQUESTS */}
      <div style={{ background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, padding: PAD }}>
        <RefinedHeaderStrip padY={PAD} padX={PAD} marginBottom={12}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 700, fontSize: 13, letterSpacing: '0.04em', textTransform: 'uppercase', color: refined ? '#FFFFFF' : C.tx }}>
              PAYMENT REQUESTS ({requests.filter(r => r.status === 'pending').length} pending)
            </span>
            <button onClick={() => setShowRequest(true)}
              style={{ ...stripBtnBase, border: `1px solid ${refined ? '#FFFFFF' : C.ac}`, color: refined ? '#FFFFFF' : C.ac }}>+ NEW REQUEST</button>
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
          // traineesById is keyed by parent id; a payment filed against a couple
          // member (`<parent>__0/__1`) would otherwise miss and render the raw
          // id string as the client name. Fall back to the stripped parent id.
          const t = traineesById[r.trainee_id] || traineesById[String(r.trainee_id || '').replace(/__\d+$/, '')];
          const days = r.status === 'pending' ? daysSince(r.created_at) : null;
          const overdue = days != null && days >= OVERDUE_DAYS;
          const tone = r.status === 'paid' ? C.gn : r.status === 'canceled' ? C.tm : (overdue ? C.rd : C.or);
          return (
            <div key={r.id} style={{
              border: `1px solid ${C.cardBd}`, borderLeft: `3px solid ${tone}`,
              padding: '10px 12px', marginBottom: 8, background: 'var(--c-sf)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, fontFamily: FN, fontSize: 9, color: tone, fontWeight: 700, letterSpacing: '0.12em', border: `1px solid ${tone}`, padding: '2px 8px', minWidth: 84, textAlign: 'center' }}>
                  {(r.status || '').toUpperCase()}
                </span>
                <span style={{ fontWeight: 700, fontSize: 14, color: C.tx }}>{t?.name || r.trainee_id}</span>
                <span style={{ flex: 1 }} />
                <span style={{ fontFamily: FN, fontSize: 16, color: C.ac, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmtCurrency(r.amount, r.currency)}</span>
              </div>
              {r.reference && <div style={{ fontSize: 12, color: C.tm, marginBottom: 6 }}>{r.reference}</div>}
              <div style={{ fontFamily: FN, fontSize: 10, color: C.td, marginBottom: 6 }}>
                Created {fmtPrettyDate(r.created_at)}{r.paid_at ? ` · paid ${fmtPrettyDate(r.paid_at)}` : ''}
                {days != null && <span style={{ color: overdue ? C.rd : C.tm, fontWeight: 700 }}> · {days}d{overdue ? ' overdue' : ''}</span>}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {r.status === 'pending' && (
                  <>
                    <button onClick={() => chase(t, r)} title="Send a WhatsApp payment reminder" style={btnStyle('#25D366')}>◔ CHASE</button>
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
          const labelTxt = !r ? 'NO REQUEST' : (r.status || '').toUpperCase();
          return (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 6px', borderBottom: `1px solid ${C.cardBd}`, flexWrap: 'wrap' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, fontFamily: FN, fontSize: 9, color: tone, fontWeight: 700, letterSpacing: '0.12em', border: `1px solid ${tone}`, padding: '2px 8px', minWidth: 90, textAlign: 'center' }}>
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

  return createPortal((
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
        <div style={{ marginBottom: 12 }}>
          <Input label="Amount (₪)" type="number" value={amount} onChange={e => setAmount(e.target.value)} />
        </div>
        <div style={{ marginBottom: 12 }}>
          <Input label="Reference" value={reference} onChange={e => setReference(e.target.value)} placeholder="May 2026 — 8 sessions" />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <Btn variant="ghost" onClick={onClose} disabled={saving}>Cancel</Btn>
          <Btn onClick={create} disabled={saving} style={{ minWidth: 132, justifyContent: 'center' }}>{saving ? 'Creating…' : 'Create request'}</Btn>
        </div>
      </div>
    </div>
  ), document.body);
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
