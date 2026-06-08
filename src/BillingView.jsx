// /coach/billing — Bit (Israeli P2P payment app) integration.
//
// Bit has no recurring-billing API. The realistic flow:
//   1. Coach configures their Bit phone number once.
//   2. For any trainee + amount, coach taps "Request via Bit" → generates
//      a pending row in `bit_payment_requests` + a deep link the athlete
//      taps to open the Bit app with phone + amount pre-filled.
//   3. Coach manually marks paid when the money arrives (Bit doesn't
//      push webhooks). The athlete also gets a "✓ Paid" button on their
//      side so they can self-confirm, which logs a confirmation but
//      doesn't auto-finalize (coach still verifies).
//
// Stripe is NOT used. The earlier subscriptions + invoices tables stay
// dormant in the DB for future use; this surface only reads/writes
// bit_payment_requests.

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { fmtPrettyDate } from './dates';
import { C, FN, FB } from './theme';
import { supabase } from './supabase';
import { isRefined5b, RefinedHeaderStrip, Btn, Input, toast, confirmToast, useEscClose } from './ui';
import { normalizePhoneIL } from './whatsappButton';

const fmtCurrency = (amount, currency = 'ils') => {
  const sym = currency === 'usd' ? '$' : '₪';
  return `${sym}${Number(amount).toLocaleString()}`;
};

function bitDeepLink(phone, amount, reference) {
  // The Bit app uses several URL schemes. The most-widely-honored
  // shareable form is the bitpay.co.il share link; the bit:// scheme
  // opens the native app on iOS/Android when installed. Build both —
  // the athlete-side UI picks the right one at click time.
  const p = normalizePhoneIL(phone) || '';
  const a = Math.max(0, Math.round(Number(amount) || 0));
  const ref = encodeURIComponent(reference || '');
  // Web share (always works as a fallback):
  const web = `https://www.bitpay.co.il/app/me/${p}?amount=${a}&reference=${ref}`;
  // Native deep link (works on devices with Bit installed):
  const native = `bit://payment-request?to=${p}&amount=${a}&reference=${ref}`;
  return { web, native };
}

export default function BillingView({ trainees }) {
  const [settings, setSettings] = useState(null);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draftSettings, setDraftSettings] = useState(null);
  const [showRequest, setShowRequest] = useState(false);
  const refined = isRefined5b();
  const PAD = 14;
  const coachEmail = 'ohadyproductions@gmail.com';

  const traineesById = useMemo(() => Object.fromEntries((trainees || []).map(t => [t.id, t])), [trainees]);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: s }, { data: r }] = await Promise.all([
        supabase.from('coach_payment_settings').select('*').eq('coach_email', coachEmail).maybeSingle(),
        supabase.from('bit_payment_requests').select('*').order('created_at', { ascending: false }).limit(200),
      ]);
      const seed = s || { coach_email: coachEmail, bit_phone: '', bit_display_name: 'אוהד', currency: 'ils', vat_rate: 0.18, default_monthly: 800 };
      setSettings(s);
      setDraftSettings(seed);
      setRequests(r || []);
    } catch { /* a thrown read leaves prior data in place */ }
    finally { setLoading(false); } // never strand the spinner
  }, []);

  // Save-button dirty check. The four user-editable fields are bit_phone,
  // bit_display_name, default_monthly, vat_rate. Compare draft to the
  // persisted row (or to the in-app defaults if there's no row yet) so
  // "Save" stays inert until the form actually has something to save.
  const isDirty = useMemo(() => {
    if (!draftSettings) return false;
    const baseline = settings || { bit_phone: '', bit_display_name: 'אוהד', default_monthly: 800, vat_rate: 0.18 };
    const same = (a, b) => (a ?? '') === (b ?? '');
    const sameNum = (a, b) => Number(a) === Number(b);
    return !(
      same(draftSettings.bit_phone, baseline.bit_phone) &&
      same(draftSettings.bit_display_name, baseline.bit_display_name) &&
      sameNum(draftSettings.default_monthly, baseline.default_monthly) &&
      sameNum(draftSettings.vat_rate, baseline.vat_rate)
    );
  }, [draftSettings, settings]);

  useEffect(() => { reload(); }, [reload]);

  const saveSettings = async () => {
    if (!draftSettings.bit_phone?.trim()) { toast('Bit phone is required.', 'warn'); return; }
    // Cleared-field defaults: typing "0" should persist as 0, but an empty
    // field (null) should fall back to the in-app default rather than
    // tripping a DB NOT NULL constraint.
    const row = {
      ...draftSettings,
      default_monthly: draftSettings.default_monthly == null ? 800 : draftSettings.default_monthly,
      vat_rate: draftSettings.vat_rate == null ? 0.18 : draftSettings.vat_rate,
      updated_at: new Date().toISOString(),
    };
    const { error } = settings
      ? await supabase.from('coach_payment_settings').update(row).eq('coach_email', coachEmail)
      : await supabase.from('coach_payment_settings').insert(row);
    if (error) { toast(`Save failed: ${error.message}`, 'error'); return; }
    toast('Bit settings saved.', 'success', { ttl: 3000 });
    reload();
  };

  const markPaid = async (id) => {
    if (!(await confirmToast('Mark this request as PAID? Use this only after the money has actually arrived on Bit.', { okLabel: 'Mark paid', cancelLabel: 'Cancel' }))) return;
    const { error } = await supabase.from('bit_payment_requests').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', id);
    if (error) { toast(`Update failed: ${error.message}`, 'error'); return; }
    setRequests(prev => prev.map(r => r.id === id ? { ...r, status: 'paid', paid_at: new Date().toISOString() } : r));
  };

  const cancelRequest = async (id) => {
    if (!(await confirmToast('Cancel this Bit request?', { okLabel: 'Cancel request', cancelLabel: 'Keep' }))) return;
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
      {/* SETTINGS */}
      <div style={{ background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, padding: PAD }}>
        <RefinedHeaderStrip padY={PAD} padX={PAD} marginBottom={12}>
          <span style={{ fontWeight: 700, fontSize: 13, letterSpacing: '0.04em', textTransform: 'uppercase', color: refined ? '#FFFFFF' : C.tx }}>BIT SETTINGS</span>
        </RefinedHeaderStrip>
        {/* Settings = identity only (phone + name). Default amount + VAT
            live in the New Request modal now — they're per-request choices,
            not global config. */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 10 }}>
          <Input label="Your Bit phone" value={draftSettings?.bit_phone || ''} onChange={e => setDraftSettings({ ...draftSettings, bit_phone: e.target.value })} placeholder="054-XXX-XXXX" />
          <Input label="Display name on Bit" value={draftSettings?.bit_display_name || ''} onChange={e => setDraftSettings({ ...draftSettings, bit_display_name: e.target.value })} placeholder="אוהד" />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <span style={{ fontSize: 11, color: C.td, lineHeight: 1.5 }}>
            Bit doesn't expose a recurring-billing API. You request → athlete pays → you mark paid manually.
            The deep link below pre-fills phone + amount on the athlete's Bit app.
          </span>
          <Btn onClick={saveSettings} disabled={!isDirty}
            style={isDirty ? undefined : { opacity: 0.4, cursor: 'not-allowed', pointerEvents: 'none' }}>
            Save
          </Btn>
        </div>
      </div>

      {/* REQUESTS */}
      <div style={{ background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, padding: PAD }}>
        <RefinedHeaderStrip padY={PAD} padX={PAD} marginBottom={12}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 700, fontSize: 13, letterSpacing: '0.04em', textTransform: 'uppercase', color: refined ? '#FFFFFF' : C.tx }}>
              PAYMENT REQUESTS ({requests.filter(r => r.status === 'pending').length} pending)
            </span>
            <button onClick={() => setShowRequest(true)} disabled={!settings?.bit_phone}
              style={{
                background: 'transparent',
                border: `1px solid ${settings?.bit_phone ? (refined ? '#FFFFFF' : C.ac) : C.cardBd}`,
                color: settings?.bit_phone ? (refined ? '#FFFFFF' : C.ac) : C.td,
                padding: '4px 12px', fontFamily: FN, fontSize: 10, fontWeight: 700,
                letterSpacing: '0.12em', cursor: settings?.bit_phone ? 'pointer' : 'default',
              }}>+ NEW REQUEST</button>
          </div>
        </RefinedHeaderStrip>
        {requests.length === 0 ? (
          <div style={{ padding: 14, textAlign: 'center', color: C.td, fontSize: 13 }}>
            No payment requests yet. {settings?.bit_phone ? 'Tap "+ NEW REQUEST" to create one.' : 'Configure your Bit phone above first.'}
          </div>
        ) : requests.map(r => {
          const t = traineesById[r.trainee_id];
          const tone = r.status === 'paid' ? C.gn : r.status === 'canceled' ? C.tm : C.or;
          const link = bitDeepLink(settings?.bit_phone, r.amount, r.reference);
          return (
            <div key={r.id} style={{
              border: `1px solid ${C.cardBd}`, borderLeft: `3px solid ${tone}`,
              padding: '10px 12px', marginBottom: 8, background: 'var(--c-sf)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: FN, fontSize: 9, color: tone, fontWeight: 700, letterSpacing: '0.12em', border: `1px solid ${tone}`, padding: '2px 8px' }}>
                  {r.status.toUpperCase()}
                </span>
                <span style={{ fontWeight: 700, fontSize: 14, color: C.tx }}>{t?.name || r.trainee_id}</span>
                <span style={{ flex: 1 }} />
                <span style={{ fontFamily: FN, fontSize: 16, color: C.ac, fontWeight: 700 }}>{fmtCurrency(r.amount, r.currency)}</span>
              </div>
              {r.reference && <div style={{ fontSize: 12, color: C.tm, marginBottom: 6 }}>{r.reference}</div>}
              <div style={{ fontFamily: FN, fontSize: 10, color: C.td, marginBottom: 6 }}>
                Created {new Date(r.created_at).toLocaleString()}{r.paid_at ? ` · paid ${new Date(r.paid_at).toLocaleString()}` : ''}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {r.status === 'pending' && (
                  <>
                    <a href={link.native} target="_blank" rel="noopener noreferrer"
                      style={pillStyle('#128C7E')}>OPEN BIT (NATIVE) →</a>
                    <a href={link.web} target="_blank" rel="noopener noreferrer"
                      style={pillStyle(C.ac)}>SHARE BIT LINK →</a>
                    <button onClick={() => markPaid(r.id)} style={btnStyle(C.gn)}>✓ MARK PAID</button>
                    <button onClick={() => cancelRequest(r.id)} style={btnStyle(C.rd)}>× CANCEL</button>
                  </>
                )}
                <button onClick={() => remove(r.id)} style={btnStyle(C.td)}>🗑 DELETE</button>
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
              <span style={{ fontFamily: FN, fontSize: 11, color: C.tm }}>
                {r ? `${fmtCurrency(r.amount, r.currency)} · ${fmtPrettyDate(r.created_at)}` : '—'}
              </span>
            </div>
          );
        })}
      </div>

      {showRequest && (
        <RequestModal
          trainees={trainees || []}
          defaultAmount={settings?.default_monthly}
          defaultVat={settings?.vat_rate}
          onClose={() => setShowRequest(false)}
          onCreated={() => { setShowRequest(false); reload(); }} />
      )}
    </div>
  );
}

function RequestModal({ trainees, defaultAmount, defaultVat, onClose, onCreated }) {
  const [traineeId, setTraineeId] = useState('');
  const [amount, setAmount] = useState(defaultAmount || 800);
  // VAT is a per-request choice now (moved out of global settings). Stored as
  // a whole-number percent in the field; defaultVat comes in as a fraction.
  const [vatPct, setVatPct] = useState(Math.round((defaultVat ?? 0.18) * 100));
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
    <div onClick={onClose} role="dialog" aria-modal="true" aria-label="New Bit request" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1200, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 20, paddingTop: 60, backdropFilter: 'blur(4px)' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--c-bg)', border: `1px solid ${C.cardBd}`, maxWidth: 480, width: '100%', padding: 22, maxHeight: '80vh', overflow: 'auto' }}>
        <h3 style={{ margin: '0 0 16px', fontFamily: FN, fontSize: 14, color: C.ac, letterSpacing: '0.12em', fontWeight: 700 }}>+ NEW BIT REQUEST</h3>
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
