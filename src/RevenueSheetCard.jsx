// REVENUE RECONSTRUCTED FROM THE SHEETS — /coach/billing.
//
// Ohad: "i want everything available to retrack to be logged in expo",
// "make sure it gets updated (the revenue on expo) twice a day forever", and
// (2026-09-13) "the billing is not even close to 10% ready. re-run every
// history field on רשימת מתאמנים and everything you can possibly think of to
// make it 100%".
//
// Two sources, kept apart on purpose because they are different KINDS of fact:
//
//   MONTHLY TOTALS come from ניהול פיננסי and are the only real amounts either
//   sheet records (its older months were recovered from its revision history).
//
//   PER-CLIENT HISTORY comes from every revision of רשימת מתאמנים: each time
//   the payment-date cell changed is a payment; the sessions counter as it
//   stood just before he reset it is what that cycle contained; the rate in
//   force is the rate beside it. Multiplying those gives an ESTIMATE, and it is
//   labelled as one everywhere here, with the method that produced it and how
//   sure it is. Month by month the estimates are set against the real totals so
//   the error is visible, not hidden.
//
// Both tables are owner-only, so for staff and athletes the queries return
// nothing and the card renders nothing at all.
import React, { useEffect, useState, useMemo } from 'react';
import { useT } from './i18n';
import { C, FN, FB } from './theme';
import { supabase } from './supabase';
import { RefinedHeaderStrip } from './ui';
import { fmtNumericDate, monthAbbr } from './dates';

const ILS = (n) => '₪' + Math.round(Number(n || 0)).toLocaleString();

// National Insurance is income but not coaching revenue. It is shown, and it
// is never folded into the training total.
const NOT_COACHING = new Set(['national_insurance']);
const CHANNEL_LABEL = {
  online: 'Online',
  gym_transfer: 'Gym · transfer',
  gym_cash: 'Gym · cash',
  via_parents: 'Via parents',
  bhbc: 'BHBC',
  national_insurance: 'National Insurance',
};
const METHOD_LABEL = { monthly: 'monthly', card: 'card', per_session: 'per session', count: 'count', unknown: 'no amount', attendance: 'attendance', rate: 'rate' };
const CONF_COLOR = { high: C.gn, medium: C.or, low: C.rd };

const monthLabel = (iso) => {
  const [y, m] = String(iso).split('-');
  return monthAbbr(Number(m) - 1) + ' ' + y;
};

export function useSheetRevenue() {
  const [months, setMonths] = useState(null);
  const [events, setEvents] = useState(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      const [m, e] = await Promise.all([
        supabase.from('revenue_month_total').select('*').order('month', { ascending: false }),
        supabase.from('revenue_sheet_event').select('*').in('event_kind', ['payment', 'card_start', 'session', 'rate_change'])
          .order('event_date', { ascending: false }).limit(5000),
      ]);
      if (!alive) return;
      // An RLS refusal and an empty table look the same here, and both mean
      // "show nothing" rather than an error the coach can act on.
      setMonths(m.data || []);
      setEvents(e.data || []);
    })();
    return () => { alive = false; };
  }, []);
  return { months, events };
}

// One client's rows, grouped by TRAINEE when linked, else by the sheet's name.
function groupClients(events) {
  const map = new Map();
  for (const e of events || []) {
    const k = e.trainee_id || 'name:' + e.client_name;
    if (!map.has(k)) map.set(k, { key: k, names: new Set(), trainee_id: e.trainee_id, section: e.section, payments: [], sessions: 0, rates: [], estTotal: 0, unknown: 0, latest: null, rate: null });
    const g = map.get(k);
    g.names.add(e.client_name);
    if (e.event_kind === 'payment' || e.event_kind === 'card_start') {
      g.payments.push(e);
      if (e.amount_est == null) g.unknown++; else g.estTotal += Number(e.amount_est);
      if (!g.latest || e.event_date > g.latest) { g.latest = e.event_date; g.rate = e.rate_text; }
    } else if (e.event_kind === 'session') g.sessions += Number(e.sessions_count || 0);
    else if (e.event_kind === 'rate_change') g.rates.push(e);
  }
  return [...map.values()]
    .map((c) => ({ ...c, payments: c.payments.sort((a, b) => (a.event_date < b.event_date ? 1 : -1)), name: [...c.names][0], alsoKnownAs: [...c.names].slice(1) }))
    .sort((a, b) => ((a.latest || '') < (b.latest || '') ? 1 : -1));
}

function PaymentRows({ payments, tt, td }) {
  return payments.map((p) => (
    <tr key={p.id}>
      <td style={td} dir="ltr">{fmtNumericDate(p.event_date)}</td>
      <td style={{ ...td, color: C.tm }}><bdi>{p.rate_text || '—'}</bdi></td>
      <td style={{ ...td, color: C.tm }}><bdi>{p.counter_before || (p.event_kind === 'card_start' ? tt('card start') : '—')}</bdi></td>
      <td style={{ ...td, textAlign: 'end', fontWeight: 700, color: p.amount_est == null ? C.td : C.tx }} dir="ltr">{p.amount_est == null ? '—' : ILS(p.amount_est)}</td>
      <td style={{ ...td, fontFamily: FN, fontSize: 10, letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
        <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: CONF_COLOR[p.confidence] || C.td, marginInlineEnd: 6, verticalAlign: 'middle' }} title={tt(p.confidence || 'low')} />
        {tt(METHOD_LABEL[p.amount_method] || p.amount_method || 'no amount')}
      </td>
      <td style={{ ...td, color: p.unpaid ? C.rd : C.td, fontSize: 12 }}>
        {p.unpaid ? tt('marked unpaid') : ''}{p.unpaid && p.notes ? ' · ' : ''}<bdi>{p.notes || ''}</bdi>
      </td>
    </tr>
  ));
}

// The same history, for ONE trainee — the billing section of the athlete page.
// Renders nothing for anyone but the owner (the tables answer empty).
export function SheetBillingHistory({ traineeId }) {
  const tt = useT();
  const [rows, setRows] = useState(null);
  useEffect(() => {
    if (!traineeId) return undefined;
    let alive = true;
    supabase.from('revenue_sheet_event').select('*').eq('trainee_id', traineeId).in('event_kind', ['payment', 'card_start', 'session'])
      .order('event_date', { ascending: false }).limit(1000)
      .then(({ data }) => { if (alive) setRows(data || []); });
    return () => { alive = false; };
  }, [traineeId]);
  if (!rows || !rows.length) return null;
  const payments = rows.filter((r) => r.event_kind !== 'session');
  const sessions = rows.filter((r) => r.event_kind === 'session').reduce((a, r) => a + Number(r.sessions_count || 0), 0);
  const est = payments.reduce((a, r) => a + Number(r.amount_est || 0), 0);
  const unknown = payments.filter((r) => r.amount_est == null).length;
  const th = { textAlign: 'start', fontFamily: FN, fontSize: 9, color: C.tm, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700, padding: '6px 10px', borderBottom: `1px solid ${C.cardBd}` };
  const td = { fontFamily: FB, fontSize: 13, color: C.tx, padding: '6px 10px', borderBottom: `1px solid ${C.divider || C.cardBd}` };
  return (
    <div style={{ marginTop: 14, borderTop: `1px solid ${C.cardBd}`, paddingTop: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, alignItems: 'baseline', marginBottom: 8 }}>
        <span style={{ fontFamily: FN, fontSize: 10, color: C.tm, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 }}>{tt('From the sheet')} · {payments.length} {tt('payments')}</span>
        <span style={{ fontFamily: FN, fontSize: 10, color: C.td, letterSpacing: '0.04em' }}>
          {tt('Estimated total')} <b style={{ color: C.tx }}>{ILS(est)}</b>{unknown ? ` (${unknown} ${tt('without an amount')})` : ''} · {sessions} {tt('sessions counted')}
        </span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <th style={th}>{tt('Paid on')}</th><th style={th}>{tt('Rate')}</th><th style={th}>{tt('Cycle')}</th>
            <th style={{ ...th, textAlign: 'end' }}>{tt('Estimated')}</th><th style={th}>{tt('Method')}</th><th style={th}>{tt('Notes')}</th>
          </tr></thead>
          <tbody><PaymentRows payments={payments} tt={tt} td={td} /></tbody>
        </table>
      </div>
      <div style={{ fontFamily: FB, fontSize: 11, color: C.td, marginTop: 8, lineHeight: 1.5 }}>
        {tt('Estimates: the rate beside the date × the sessions counter as it stood when the date changed. The sheet never wrote what was paid; the monthly totals on the billing page are the real amounts.')}
      </div>
    </div>
  );
}

export default function RevenueSheetCard() {
  const tt = useT();
  const PAD = 14;
  const { months, events } = useSheetRevenue();
  const [open, setOpen] = useState(null);

  const byMonth = useMemo(() => {
    const map = new Map();
    for (const r of months || []) {
      if (!map.has(r.month)) map.set(r.month, { month: r.month, rows: [], coaching: 0, other: 0 });
      const g = map.get(r.month);
      g.rows.push(r);
      if (NOT_COACHING.has(r.channel)) g.other += Number(r.amount);
      else g.coaching += Number(r.amount);
    }
    return [...map.values()].sort((a, b) => (a.month < b.month ? 1 : -1));
  }, [months]);

  const clients = useMemo(() => groupClients(events), [events]);

  // Roster estimate per month: Σ amount_est of payments dated in that month.
  const estByMonth = useMemo(() => {
    const m = new Map();
    for (const e of events || []) {
      if (e.event_kind !== 'payment') continue;
      const k = String(e.event_date).slice(0, 7) + '-01';
      const g = m.get(k) || { est: 0, n: 0, unknown: 0 };
      g.n++; if (e.amount_est == null) g.unknown++; else g.est += Number(e.amount_est);
      m.set(k, g);
    }
    return m;
  }, [events]);

  if (months === null || events === null) return null;
  if (!months.length && !events.length) return null;

  const th = { textAlign: 'start', fontFamily: FN, fontSize: 9, color: C.tm, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700, padding: '7px 10px', borderBottom: `1px solid ${C.cardBd}`, whiteSpace: 'normal', lineHeight: 1.25 };
  const td = { fontFamily: FB, fontSize: 13, color: C.tx, padding: '7px 10px', borderBottom: `1px solid ${C.divider || C.cardBd}` };
  const totalPayments = clients.reduce((a, c) => a + c.payments.length, 0);
  const totalSessions = clients.reduce((a, c) => a + c.sessions, 0);

  return (
    <div style={{ background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, padding: PAD, boxShadow: C.cardShadow }}>
      <RefinedHeaderStrip padY={PAD} padX={PAD} marginBottom={12}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span>{tt('From the sheets')}</span>
          <span style={{ fontFamily: FN, fontSize: 10, letterSpacing: '0.06em', opacity: 0.85 }}>
            {byMonth.length} {byMonth.length === 1 ? tt('month') : tt('months')} · {clients.length} {tt('clients')} · {totalPayments} {tt('payments')} · {totalSessions} {tt('sessions counted')}
          </span>
        </div>
      </RefinedHeaderStrip>

      {clients.some((c) => c.payments[0] && c.payments[0].unpaid) && (
        <div style={{ fontFamily: FB, fontSize: 12, color: C.rd, marginBottom: 12, lineHeight: 1.5 }}>
          <span style={{ fontFamily: FN, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, marginInlineEnd: 8 }}>{tt('Marked unpaid on the sheet')}</span>
          {clients.filter((c) => c.payments[0] && c.payments[0].unpaid).map((c) => <bdi key={c.key} style={{ marginInlineEnd: 10 }}>{c.name} · {fmtNumericDate(c.payments[0].event_date)}</bdi>)}
        </div>
      )}

      {byMonth.length > 0 && (
        <div style={{ overflowX: 'auto', marginBottom: 18 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>{tt('Month')}</th>
                {['online', 'gym_transfer', 'gym_cash', 'via_parents', 'bhbc'].map((c) => (
                  <th key={c} style={{ ...th, textAlign: 'end' }}>{tt(CHANNEL_LABEL[c])}</th>
                ))}
                <th style={{ ...th, textAlign: 'end', color: C.ac }}>{tt('Coaching')}</th>
                <th style={{ ...th, textAlign: 'end' }}>{tt('Roster estimate')}</th>
                <th style={{ ...th, textAlign: 'end' }}>{tt('Gap')}</th>
                <th style={{ ...th, textAlign: 'end' }}>{tt(CHANNEL_LABEL.national_insurance)}</th>
              </tr>
            </thead>
            <tbody>
              {byMonth.map((g) => {
                const est = estByMonth.get(g.month);
                // BHBC is a club contract, not a roster client, so the roster
                // estimate is set against coaching MINUS the club.
                const bhbc = Number(g.rows.find((x) => x.channel === 'bhbc')?.amount || 0);
                const base = g.coaching - bhbc;
                const gap = est ? est.est - base : null;
                return (
                  <tr key={g.month}>
                    <td style={{ ...td, fontFamily: FN, fontSize: 12, letterSpacing: '0.04em' }}>{monthLabel(g.month)}</td>
                    {['online', 'gym_transfer', 'gym_cash', 'via_parents', 'bhbc'].map((c) => {
                      const r = g.rows.find((x) => x.channel === c);
                      return (
                        <td key={c} style={{ ...td, textAlign: 'end', color: r && Number(r.amount) ? C.tx : C.td }} dir="ltr">
                          {r ? ILS(r.amount) : '—'}
                        </td>
                      );
                    })}
                    <td style={{ ...td, textAlign: 'end', color: C.ac, fontWeight: 700 }} dir="ltr">{ILS(g.coaching)}</td>
                    <td style={{ ...td, textAlign: 'end', color: est ? C.tx : C.td }} dir="ltr" title={est ? `${est.n} ${tt('payments')}${est.unknown ? ` · ${est.unknown} ${tt('without an amount')}` : ''}` : ''}>
                      {est ? ILS(est.est) : '—'}{est && est.unknown ? <span style={{ color: C.or }}> +{est.unknown}?</span> : null}
                    </td>
                    <td style={{ ...td, textAlign: 'end', color: gap == null ? C.td : Math.abs(gap) <= Math.max(300, base * 0.1) ? C.gn : C.or }} dir="ltr">{gap == null ? '—' : (gap > 0 ? '+' : '') + ILS(gap).replace('₪', '') + ' ₪'}</td>
                    <td style={{ ...td, textAlign: 'end', color: C.tm }} dir="ltr">{g.other ? ILS(g.other) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ fontFamily: FB, fontSize: 11, color: C.td, marginTop: 6, lineHeight: 1.5 }}>
            {tt('Roster estimate = the payments the roster recorded that month, priced at the rate beside each date × the sessions counter when it was reset. Gap = estimate minus the sheet\'s coaching total without the club. A payment dated in one month is often banked in the next.')}
          </div>
        </div>
      )}

      {clients.length > 0 && (
        <>
          <div style={{ fontFamily: FN, fontSize: 10, color: C.tm, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700, marginBottom: 8 }}>
            {tt('Payments recorded per client')} · <span style={{ color: C.td, fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>{tt('tap a row for the full history')}</span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>{tt('Client')}</th>
                  <th style={th}>{tt('Last payment')}</th>
                  <th style={{ ...th, textAlign: 'end' }}>{tt('Payments on record')}</th>
                  <th style={{ ...th, textAlign: 'end' }}>{tt('Estimated total')}</th>
                  <th style={{ ...th, textAlign: 'end' }}>{tt('Sessions counted')}</th>
                  <th style={th}>{tt('Rate')}</th>
                  <th style={th}>{tt('In EXPO')}</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => {
                  const isOpen = open === c.key;
                  return (
                    <React.Fragment key={c.key}>
                      <tr onClick={() => setOpen(isOpen ? null : c.key)} style={{ cursor: 'pointer', background: isOpen ? 'rgba(57,189,255,0.06)' : 'transparent' }}>
                        <td style={{ ...td, fontWeight: 600 }}>
                          <span style={{ display: 'inline-block', width: 14, color: C.ac, fontFamily: FN, fontSize: 10 }}>{isOpen ? '▾' : '▸'}</span>
                          <bdi>{c.name}</bdi>
                          {/* Named, not hidden: seeing the old spelling is how he
                              can tell the two really are the same client. */}
                          {c.alsoKnownAs.length > 0 && (
                            <span style={{ display: 'block', fontSize: 11, color: C.td, fontWeight: 400, paddingInlineStart: 14 }}>
                              <bdi>{c.alsoKnownAs.join(' · ')}</bdi>
                            </span>
                          )}
                        </td>
                        <td style={td} dir="ltr">{c.latest ? fmtNumericDate(c.latest) : '—'}</td>
                        <td style={{ ...td, textAlign: 'end' }} dir="ltr">{c.payments.length}</td>
                        <td style={{ ...td, textAlign: 'end', fontWeight: 700 }} dir="ltr">{ILS(c.estTotal)}{c.unknown ? <span style={{ color: C.or, fontWeight: 400 }}> +{c.unknown}?</span> : null}</td>
                        <td style={{ ...td, textAlign: 'end', color: C.tm }} dir="ltr">{c.sessions || '—'}</td>
                        <td style={{ ...td, color: C.tm }}><bdi>{c.rate || '—'}</bdi></td>
                        {/* A client who pays but has no trainee record is a real gap,
                            not a display problem, so it is named rather than blank. */}
                        <td style={{ ...td, color: c.trainee_id ? C.tm : C.or, fontFamily: FN, fontSize: 10, letterSpacing: '0.06em' }}>
                          {c.trainee_id ? tt('linked') : tt('no record')}
                        </td>
                      </tr>
                      {isOpen && (
                        <tr>
                          <td colSpan={7} style={{ padding: '4px 10px 12px 24px', borderBottom: `1px solid ${C.divider || C.cardBd}` }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                              <thead><tr>
                                <th style={th}>{tt('Paid on')}</th><th style={th}>{tt('Rate')}</th><th style={th}>{tt('Cycle')}</th>
                                <th style={{ ...th, textAlign: 'end' }}>{tt('Estimated')}</th><th style={th}>{tt('Method')}</th><th style={th}>{tt('Notes')}</th>
                              </tr></thead>
                              <tbody><PaymentRows payments={c.payments} tt={tt} td={{ ...td, fontSize: 12, padding: '5px 10px' }} /></tbody>
                            </table>
                            {c.rates.length > 0 && (
                              <div style={{ fontFamily: FB, fontSize: 11, color: C.td, marginTop: 6 }}>
                                {tt('Rate changes')}: {c.rates.slice().reverse().map((r) => `${fmtNumericDate(r.event_date)} ${r.rate_text}`).join(' · ')}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div style={{ fontFamily: FB, fontSize: 11, color: C.td, marginTop: 12, lineHeight: 1.5 }}>
        {tt('Amounts in the month table come from ניהול פיננסי (its older months from the sheet\'s own revision history). Per-client rows come from every revision of רשימת מתאמנים: each change of the payment date is a payment, the counter beside it is the cycle, and the amount is an estimate from rate × counter — green dot when both were on the sheet, orange when one was inferred, red when the sheet gave no way to price it.')}
      </div>
    </div>
  );
}
