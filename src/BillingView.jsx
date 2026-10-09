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
import { isClubAthlete } from './clubAthlete';
import { createPortal } from 'react-dom';
import { fmtPrettyDate } from './dates';
import { C, FN, FB } from './theme';
import { supabase } from './supabase';
import { isRefined5b, Btn, Input, toast, confirmToast, useEscClose, stripBtnBase, CollapsibleSection } from './ui';
import { parseTraineeId } from './traineeUtils';
import { normalizePhoneIL } from './whatsappButton';
import { tr, readLang, useT, useTB } from './i18n';
import RevenueSheetCard from './RevenueSheetCard';
import OwedCard from './OwedCard';

const fmtCurrency = (amount, currency = 'ils') => {
  const sym = currency === 'usd' ? '$' : '₪';
  return `${sym}${Number(amount).toLocaleString()}`;
};

export default function BillingView({ trainees, onSelectTrainee }) {
  const tt = useT();
  const tb = useTB();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showRequest, setShowRequest] = useState(false);
  const refined = isRefined5b();
  // PAYMENT REQUESTS keeps its title on one line (#452): + NEW REQUEST rides the
  // CollapsibleSection's `right`, which steps it under the strip itself when the
  // two do not fit side by side (the section runs the same useStripFit)
  const reqPending = requests.filter(r => r.status === 'pending').length;
  const newReqBtn = (
    <button onClick={() => setShowRequest(true)} className="strip-btn-stacks"
      style={{ ...stripBtnBase, flexShrink: 0, border: `1px solid ${refined ? 'var(--c-stripTx)' : C.ac}`, color: refined ? 'var(--c-stripTx)' : C.ac }}>{tb('+ NEW REQUEST')}</button>
  );
  const PAD = 14;

  const traineesById = useMemo(() => Object.fromEntries((trainees || []).map(t => [t.id, t])), [trainees]);

  const [loadError, setLoadError] = useState(null);
  const reload = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      // EVERY PENDING REQUEST, plus the newest 200 of the rest (2.10 #510-R2 L11):
      // OUTSTANDING / OVERDUE are sums over the pending ones, and with one
      // limit(200) over everything an older pending request fell off the page -
      // out of the totals, and impossible to mark paid.
      const [{ data: pend, error: pe }, { data: r, error: re }] = await Promise.all([
        supabase.from('bit_payment_requests').select('*').eq('status', 'pending').order('created_at', { ascending: false }),
        supabase.from('bit_payment_requests').select('*').order('created_at', { ascending: false }).limit(200),
      ]);
      // PostgREST errors don't throw — surface them so an RLS/permission
      // failure doesn't read as "No payment requests yet".
      if (re || pe) { setLoadError((re || pe).message); return; }
      const byId = new Map();
      for (const x of [...(pend || []), ...(r || [])]) byId.set(x.id, x);
      setRequests([...byId.values()].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || ''))));
    } catch (e) { setLoadError(e?.message || 'Could not load billing data.'); }
    finally { setLoading(false); } // never strand the spinner
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const markPaid = async (id) => {
    if (!(await confirmToast('Mark this request as PAID? Use this only after the money has actually arrived.', { okLabel: 'Mark paid', cancelLabel: 'Cancel' }))) return;
    const { data: upd, error } = await supabase.from('bit_payment_requests').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', id).select('id');
    if (error) { toast(`Update failed: ${error.message}`, 'error'); return; }
    // an update RLS refuses matches ZERO rows without an error - it is not paid (#510-R2 L11)
    if (!upd || !upd.length) { toast('Not marked paid - the request was not updated (no permission, or it no longer exists).', 'error'); return; }
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

  if (loading) return <div style={{ padding: 30, textAlign: 'center', color: C.td }}>{tr(readLang(), 'Loading…')}</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* the page's title, as Tasks has one (29.9 #448 audit: Billing had none) */}
      <h2 style={{ margin: 0, fontFamily: FN, fontSize: 13, fontWeight: 700, letterSpacing: '0.18em', color: C.tx, textTransform: 'uppercase' }}>{tt('Billing')}</h2>
      {/* AT-A-GLANCE — outstanding · overdue · collected this month. */}
      {/* Three tiles in two columns always strands one — photographed at 390:
          OUTSTANDING and OVERDUE on a row, COLLECTED MTD alone beside dead
          space. Same "thats not ocd order" as the dashboard's 3 + 1. The shared
          .kpi-grid gives 2 up to 1000px and 4 above it, and an ODD last tile
          stretches across the row instead of sitting half-width next to
          nothing. */}
      <div className="kpi-grid" style={{ display: 'grid', gap: 10 }}>
        {[
          { label: tt('Outstanding'), value: fmtCurrency(summary.outstanding), sub: `${summary.pendingCount} ${tt('pending requests')}`, dot: summary.outstanding > 0 ? C.or : C.gn },   // the tiles count in-app payment REQUESTS - said so, beside the sheet's OWED card (audit #612 A6)
          { label: tt('Overdue'), value: fmtCurrency(summary.overdueAmt), sub: readLang() === 'he' ? `${summary.overdueCount} ${tt('requests')} · ${OVERDUE_DAYS} יום ומעלה` : `${summary.overdueCount} requests · ${OVERDUE_DAYS}+ days`, dot: summary.overdueCount > 0 ? C.rd : C.gn },
          // 'Collected MTD', not 'Collected · This month'. DashboardView made
          // exactly this change for exactly this reason - the long form wraps to
          // two lines and that tile's strip then stands taller than the other
          // two, against the one-uniform-header-height rule (Ohad #261). Billing
          // has the same three tiles and never got the fix; measured 19.9 at
          // 360px in English, where OUTSTANDING and OVERDUE were one line and
          // this one was two. The demo mirrors it, per the parity rule.
          { label: tt('Collected MTD'), value: fmtCurrency(summary.collectedMonth), sub: tt('from payment requests'), dot: C.gn },
        ].map((s, i) => (
          <div key={i} style={{ background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, padding: '14px 18px', boxShadow: C.cardShadow }}>
            {/* TITLE ON THE BODY'S EDGE, DOT AT THE FAR END (Ohad, 26.9: title boxes whose
              text "doesnt start at the same horizontal spot as the rest of the text").
              The status dot used to lead the title, so the words started 13px in from
              the number below them. The dot now sits at the strip's other end, the
              same margin from that edge.
                The strip also takes the app's one strip height (41, flex-centred,
                as RefinedHeaderStrip): as a padded block its words rode 3px low. */}
            <div className="title-strip" style={{ background: 'color-mix(in srgb, var(--c-stripBg, var(--c-sf)) 90%, var(--c-ac))', margin: '-14px -18px 12px', padding: '0 18px', minHeight: 41, boxSizing: 'border-box', display: 'flex', alignItems: 'center', borderBottom: `1px solid ${C.cardBd}` }}>
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 7, width: '100%' }}>
                <span className="kpi-title" style={{ fontFamily: FN, fontSize: 13 /* the dashboard KPI tiles' spec, phone rule included (OCD #494: 12 everywhere) */, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--c-stripTx)', textTransform: 'uppercase' }}>{s.label}</span>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.dot, flexShrink: 0, boxShadow: `0 0 5px ${s.dot}66` }} />
              </span>
            </div>
            <div style={{ fontFamily: FN, fontSize: 26, fontWeight: 800, color: C.tx, letterSpacing: '-0.015em', lineHeight: 1.05 }}>{s.value}</div>
            <div style={{ fontFamily: FN, fontSize: 10, color: C.tm, marginTop: 5, letterSpacing: '0.04em' }}>{s.sub}</div>
          </div>
        ))}
      </div>
      {/* WHAT THE SHEETS RECORD. Owner-only data, so this renders nothing
          for staff or athletes. The manual ledger below is unaffected. */}
      {/* OWED, expanded: every client, every detail (#386). */}
      <OwedCard trainees={trainees} onSelectTrainee={onSelectTrainee} expanded />
      {/* REQUESTS */}
      {/* collapsible like OWED above it (same chrome, same 0 margin: the page
          stacks its cards with a 14px gap). ONE ROW: + NEW REQUEST rides `right`
          and the section steps it under the strip when the two do not fit. */}
      <CollapsibleSection storageKey="billing-requests" padX={PAD} padY={PAD} style={{ marginBottom: 0 }} count={reqPending /* not rendered beside a titleNode; it re-measures the strip when the count changes */}
        right={newReqBtn}
        titleNode={
          <span style={{ display: 'block', width: 'fit-content', maxWidth: '100%', minWidth: 0 /* a block (its own 13px line - inline sat 2px low, box-centring 4.10) that is only as wide as its words: full-width, the strip-fit check read it as the whole strip and + NEW REQUEST stacked under it at every width (4.10 audit) */, overflowWrap: 'break-word', fontFamily: FN, fontWeight: 700, fontSize: 13, letterSpacing: '0.08em' /* the house strip title (OCD #494) */, textTransform: 'uppercase', color: refined ? 'var(--c-stripTx)' : C.tx }}>
            {/* one line on a phone: the count stays, its word steps aside */}
            {tt('PAYMENT REQUESTS')} · {reqPending}<span className="strip-meta"> {readLang() === 'he' ? 'ממתינות' : tt('Waiting')}</span>
          </span>
        }>
        {loadError ? (
          <div style={{ padding: 14, textAlign: 'center', color: C.rd, fontSize: 13 }}>{tt('Couldn’t load billing data:')}{loadError}. <button onClick={reload} style={{ background: 'transparent', border: 'none', color: C.ac, cursor: 'pointer', fontFamily: FN, fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textDecoration: 'underline' }}>{tt("RETRY")}</button>
          </div>
        ) : requests.length === 0 ? (
          <div style={{ padding: 14, textAlign: 'center', color: C.td, fontSize: 13 }}>
            {tt('No payment requests yet')}
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
              border: `1px solid ${tone}`,
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
                {readLang() === 'he' ? 'נוצרה' : 'Created'} {fmtPrettyDate(r.created_at)}{r.paid_at ? ` · ${readLang() === 'he' ? 'שולמה' : 'paid'} ${fmtPrettyDate(r.paid_at)}` : ''}
                {days != null && <span style={{ color: overdue ? C.rd : C.tm, fontWeight: 700 }}> · {days}d{overdue ? ' overdue' : ''}</span>}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {r.status === 'pending' && (
                  <>
                    <button onClick={() => chase(t, r)} title={tt('Send a WhatsApp payment reminder')} style={btnStyle('#25D366')}>◔ {tr(readLang(), 'CHASE')}</button>
                    <button onClick={() => markPaid(r.id)} style={btnStyle(C.gn)}>✓ {tr(readLang(), 'MARK PAID')}</button>
                    <button onClick={() => cancelRequest(r.id)} style={btnStyle(C.rd)}>× {tr(readLang(), 'CANCEL')}</button>
                  </>
                )}
                <button onClick={() => remove(r.id)} style={btnStyle(C.td)}>{tt("DELETE")}</button>
              </div>
            </div>
          );
        })}
      </CollapsibleSection>

      {/* ROSTER STATUS */}
      <CollapsibleSection title={tt('ROSTER STATUS')} storageKey="billing-roster" padX={PAD} padY={PAD} style={{ marginBottom: 0 }}>
        {/* Club athletes are not billed by EXPO - the club pays - so they do
            not belong on a roster-payment list. Ohad, 21.9: "remove the payments
            and billing from all their names". Listing them with NO REQUEST
            beside their name reads as a debt that does not exist. */}
        {/* the section body opens with 12px; a row list starts at the strip so the
            first name sits centred between the strip and its rule, like every
            other row (verify-rule-rhythm FIRSTGAP: 22 above / 10 below, 4.10) */}
        <div style={{ marginTop: -12 }}>
        {(() => {
          // ONLY A REQUEST GETS A ROW (9.10 audit #612 A7: 13 rows of NO REQUEST, ~400px, one fact).
          // The athletes with none share one line at the end, by name.
          const active = (trainees || []).filter(t => t.status === 'Active' && !isClubAthlete(t));
          const withReq = active.filter(t => rosterSummary[t.id]);
          const noReq = active.filter(t => !rosterSummary[t.id]);
          return (<>
        {withReq.map((t, i, arr) => {
          const r = rosterSummary[t.id];
          const tone = !r ? C.td : r.status === 'paid' ? C.gn : r.status === 'canceled' ? C.tm : C.or;
          const labelTxt = !r ? tt('NO REQUEST') : tt((r.status || '').toUpperCase());
          return (
            // No side padding: 6px put every row's text 6px inside the ROSTER
            // STATUS title above it (26.9, "doesnt start at the same horizontal spot").
            // THE NAME FIRST, the status at the end (29.9 #448 audit: a dim NO REQUEST
            // led all 13 rows and a "—" closed each one - three columns, one fact).
            // With a request the amount and date sit beside its status.
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 36, boxSizing: 'border-box', padding: '6px 0', borderBottom: i < arr.length - 1 || noReq.length ? `1px solid ${C.cardBd}` : 'none' }}>
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: C.tx }}><bdi>{t.name}</bdi></span>
              {r && <span style={{ fontFamily: FN, fontSize: 11, color: C.tm, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{fmtCurrency(r.amount, r.currency)} · {fmtPrettyDate(r.created_at)}</span>}
              <span style={{ fontFamily: FN, fontSize: 9, color: tone, fontWeight: 700, letterSpacing: '0.12em', whiteSpace: 'nowrap' }}>{labelTxt}</span>
            </div>
          );
        })}
        {noReq.length > 0 && (
          <div data-no-request="" style={{ display: 'flex', alignItems: 'baseline', gap: 12, minHeight: 36, boxSizing: 'border-box', padding: '10px 0 6px' }}>
            <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: C.tm, lineHeight: 1.6 }}>
              {noReq.map((t, i) => <React.Fragment key={t.id}>{i > 0 && <span style={{ color: C.td }}>{'\u00A0· '}</span>}<bdi style={{ whiteSpace: 'nowrap' }}>{t.name}</bdi></React.Fragment>)}
            </span>
            <span style={{ fontFamily: FN, fontSize: 9, color: C.td, fontWeight: 700, letterSpacing: '0.12em', whiteSpace: 'nowrap' }}>{tt('NO REQUEST')} · {noReq.length}</span>
          </div>
        )}
          </>);
        })()}
        </div>
      </CollapsibleSection>

      {/* FROM THE SHEETS LAST (29.9 #448 audit): ~1,900px of history sat between
          OWED and the two sections a coach acts on, pushing them to y 3300 */}
      <RevenueSheetCard trainees={trainees} />

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
  const tt = useT();
  const [traineeId, setTraineeId] = useState('');
  const [amount, setAmount] = useState(800);
  const [reference, setReference] = useState('');
  const [saving, setSaving] = useState(false);
  // A payment request cannot be addressed to a club athlete either.
  const active = trainees.filter(t => t.status !== 'Archived' && !isClubAthlete(t));
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
    <div onClick={onClose} role="dialog" aria-modal="true" aria-label={tt('New payment request')} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1200, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 20, paddingTop: 60, backdropFilter: 'blur(4px)' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--c-bg)', border: `1px solid ${C.cardBd}`, maxWidth: 480, width: '100%', padding: 22, maxHeight: 'calc(100dvh - 24px)', overflow: 'auto' }}>
        <h3 style={{ margin: '0 0 16px', fontFamily: FN, fontSize: 14, color: C.ac, letterSpacing: '0.12em', fontWeight: 700 }}>+ {tr(readLang(), 'NEW PAYMENT REQUEST')}</h3>
        <div style={{ marginBottom: 10 }}>
          <label style={{ display: 'block', fontFamily: FN, fontSize: 9, color: C.tm, letterSpacing: '0.18em', fontWeight: 700, marginBottom: 4 }}>{tr(readLang(), 'TRAINEE')}</label>
          <select value={traineeId} onChange={e => setTraineeId(e.target.value)}
            style={{ width: '100%', background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, padding: '8px 10px', color: C.tx, fontFamily: FN, fontSize: 12, outline: 'none' }}>
            <option value="">— {tr(readLang(), 'Choose —')}</option>
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
          <Btn variant="ghost" onClick={onClose} disabled={saving}>{tr(readLang(), 'Cancel')}</Btn>
          <Btn onClick={create} disabled={saving} style={{ minWidth: 132, justifyContent: 'center' }}>{tr(readLang(), saving ? 'Creating…' : 'Create request')}</Btn>
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
