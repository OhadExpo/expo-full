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
import { useT, readLang } from './i18n';
import { C, FN, FB } from './theme';
import { supabase } from './supabase';
import { CollapsibleSection, ScrollFade } from './ui';
import { fmtNumericDate, monthAbbr } from './dates';
import { noDangle } from './script';

// Nord cannot draw U+25BE — the fallback paints a short dash at 10px, which is
// what verify-brand-glyphs forbids. Same inline chevron the strip headers use,
// rotated instead of swapped, so open and closed are the same 11x7 mark.
const Chev = ({ open }) => (
  <svg aria-hidden width="11" height="7" viewBox="0 0 9 6" fill="none" style={{
    color: C.ac, display: 'inline-block', width: 14, flexShrink: 0,
    // closed points INTO the row: right in English, left in Hebrew (29.9 #448 audit)
    transform: open ? 'rotate(0deg)' : (readLang() === 'he' ? 'rotate(90deg)' : 'rotate(-90deg)'), transition: 'transform 180ms ease',
  }}>
    <path d="M1 1l3.5 3.5L8 1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

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

// A ROW THE SHEET SHIFTED ONE COLUMN (9.10 #609, Ohad: "300 שח as a name
// doesnt make sense"): its name cell holds a price and its rate cell the
// client's name. Read back in place, so the payment joins its client instead of
// a "client" called 300 ש"ח. Only when the rate cell really is a name.
const PRICE = /^\s*[0-9.,]+\s*(ש["״׳']?ח|₪)?\s*$/;
const NAMEISH = /^[^0-9]*[A-Za-z\u0590-\u05FF][^0-9]*$/;
const unshift = (e) => (e && PRICE.test(e.client_name || '') && NAMEISH.test(e.rate_text || '')
  ? { ...e, client_name: e.rate_text, rate_text: e.client_name } : e);

export function useSheetRevenue() {
  const [months, setMonths] = useState(null);
  const [events, setEvents] = useState(null);
  const [health, setHealth] = useState(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      const [m, e, newest, count] = await Promise.all([
        supabase.from('revenue_month_total').select('*').order('month', { ascending: false }),
        // EVERY EVENT, PAGED (#510-R2 L12): limit(5000) is silently cut to the
        // API's 1000-row maximum - history past it simply vanished
        (async () => {
          const all = [];
          for (let from = 0; from < 20000; from += 1000) {
            const page = await supabase.from('revenue_sheet_event').select('*').in('event_kind', ['payment', 'card_start', 'session', 'rate_change'])
              .order('event_date', { ascending: false }).order('id', { ascending: true }).range(from, from + 999);
            if (page.error) return { data: all.length ? all : null, error: page.error };
            all.push(...(page.data || []));
            if (!page.data || page.data.length < 1000) break;
          }
          return { data: all, error: null };
        })(),
        supabase.from('revenue_cell_history').select('rev,rev_time,imported_at').order('rev', { ascending: false }).limit(1),
        supabase.from('revenue_cell_history').select('rev', { count: 'exact', head: true }),
      ]);
      if (!alive) return;
      // An RLS refusal and an empty table look the same here, and both mean
      // "show nothing" rather than an error the coach can act on.
      setMonths(m.data || []);
      setEvents((e.data || []).map(unshift));
      const top = newest.data && newest.data[0];
      setHealth(top ? { newestRev: top.rev, newestTime: top.rev_time, harvestedAt: top.imported_at, cells: count.count || 0 } : null);
    })();
    return () => { alive = false; };
  }, []);
  return { months, events, health };
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
    <tr key={p.id} style={{ height: 'var(--btn-h)' }}>
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
  // Attendance by month, newest first, the last eight months that have any.
  const byMonth = new Map();
  for (const r of rows) if (r.event_kind === 'session') { const k = String(r.event_date).slice(0, 7); byMonth.set(k, (byMonth.get(k) || 0) + Number(r.sessions_count || 0)); }
  const attendance = [...byMonth.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, 8);
  const th = { textAlign: 'start', fontFamily: FN, fontSize: 9, color: C.tm, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700, padding: '6px 10px', borderBottom: `1px solid ${C.cardBd}` };
  const td = { fontFamily: FB, fontSize: 13, color: C.tx, padding: '6px 10px', borderBottom: `1px solid ${C.divider || C.cardBd}` };
  return (
    <div style={{ marginTop: 14, borderTop: `1px solid ${C.cardBd}`, paddingTop: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, alignItems: 'baseline', marginBottom: 8 }}>
        <span style={{ fontFamily: FN, fontSize: 10, color: C.tm, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 }}>{tt('Payment history')} · {payments.length} {tt('payments')}</span>
        <span style={{ fontFamily: FN, fontSize: 10, color: C.td, letterSpacing: '0.04em' }}>
          {tt('Estimated total')} <b style={{ color: C.tx }}>{ILS(est)}</b>{unknown ? ` (${unknown} ${tt('without an amount')})` : ''} · {sessions} {tt('sessions counted')}
        </span>
      </div>
      {attendance.length > 0 && (
        <div style={{ fontFamily: FN, fontSize: 10, color: C.td, letterSpacing: '0.04em', marginBottom: 8 }}>
          {tt('Sessions by month')}: {attendance.map(([m, n]) => `${monthAbbr(Number(m.slice(5, 7)) - 1)} ${n}`).join(' · ')}
        </div>
      )}
      <ScrollFade>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <th style={th}>{tt('Paid on')}</th><th style={th}>{tt('Rate')}</th><th style={th}>{tt('Cycle')}</th>
            <th style={{ ...th, textAlign: 'end' }}>{tt('Estimated')}</th><th style={th}>{tt('Method')}</th><th style={th}>{tt('Notes')}</th>
          </tr></thead>
          <tbody><PaymentRows payments={payments} tt={tt} td={td} /></tbody>
        </table>
      </ScrollFade>
      <div style={{ fontFamily: FB, fontSize: 11, color: C.td, marginTop: 8, lineHeight: 1.5 }}>
        {tt('Estimates: the rate beside the date × the sessions counter as it stood when the date changed. The sheet never wrote what was paid; the monthly totals on the billing page are the real amounts.')}
      </div>
    </div>
  );
}

// One table for both lists (active / inactive): the same columns, so the two read alike.
function ClientsTable({ list, open, setOpen, statusOf, tt, th, td }) {
  return (
    <ScrollFade>
      <table className="rs-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={th}>{tt('Client')}</th>
            <th style={th}>{tt('Last payment')}</th>
            <th style={{ ...th, textAlign: 'end' }}>{tt('Payments on record')}</th>
            <th style={{ ...th, textAlign: 'end' }}>{tt('Estimated total')}</th>
            <th style={{ ...th, textAlign: 'end' }}>{tt('No amount')}</th>
            <th style={{ ...th, textAlign: 'end' }}>{tt('Sessions counted')}</th>
            <th style={th}>{tt('Rate')}</th>
            <th style={th}>{tt('In EXPO')}</th>
          </tr>
        </thead>
        <tbody>
          {list.map((c) => {
            const isOpen = open === c.key;
            const st = statusOf(c);
            return (
              <React.Fragment key={c.key}>
                <tr onClick={() => setOpen(isOpen ? null : c.key)} style={{ cursor: 'pointer', height: 'var(--btn-h)', background: isOpen ? 'rgba(57,189,255,0.06)' : 'transparent' }}>
                  <td style={{ ...td, fontWeight: 600 }}>
                    <Chev open={isOpen} />
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
                  <td style={{ ...td, textAlign: 'end', fontWeight: 700 }} dir="ltr">{ILS(c.estTotal)}</td>
                  <td style={{ ...td, textAlign: 'end', color: c.unknown ? C.tx : C.td }} dir="ltr">{c.unknown || '—'}</td>
                  <td style={{ ...td, textAlign: 'end', color: C.tm }} dir="ltr">{c.sessions || '—'}</td>
                  <td style={{ ...td, color: C.tm }}><bdi>{c.rate || '—'}</bdi></td>
                  {/* what EXPO knows of him, in words: Active / Archived / no record */}
                  <td style={{ ...td, color: C.tm, fontFamily: FN, fontSize: 10, letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>
                    {st ? tt(st) : tt('no record')}
                  </td>
                </tr>
                {isOpen && (
                  <tr>
                    <td colSpan={8} style={{ padding: '4px 10px 12px 24px', borderBottom: `1px solid ${C.divider || C.cardBd}` }}>
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
    </ScrollFade>
  );
}

export default function RevenueSheetCard({ trainees = [] }) {
  const tt = useT();
  const PAD = 14;
  const { months, events, health } = useSheetRevenue();
  const [open, setOpen] = useState(null);
  const [openMonth, setOpenMonth] = useState(null);

  const byMonth = useMemo(() => {
    const map = new Map();
    for (const r of months || []) {
      if (!map.has(r.month)) map.set(r.month, { month: r.month, rows: [], coaching: 0, other: 0 });
      const g = map.get(r.month);
      g.rows.push(r);
      // a missing amount is no money, not NaN (NaN rendered as ₪0 for the whole month, #510-R2 L12)
      if (NOT_COACHING.has(r.channel)) g.other += Number(r.amount) || 0;
      else g.coaching += Number(r.amount) || 0;
    }
    return [...map.values()].sort((a, b) => (a.month < b.month ? 1 : -1));
  }, [months]);

  const clients = useMemo(() => groupClients(events), [events]);
  const [showInactive, setShowInactive] = useState(false);
  // active = linked to a trainee whose status is Active (the Dashboard's own rule)
  const byId = useMemo(() => new Map((trainees || []).map((t) => [t.id, t])), [trainees]);
  const statusOf = (c) => { const t = c.trainee_id && byId.get(c.trainee_id); return t ? (t.status || 'Active') : null; };
  const activeClients = clients.filter((c) => statusOf(c) === 'Active');
  const inactiveClients = clients.filter((c) => statusOf(c) !== 'Active');

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

  // one row per header (27.9 #328 gate: 11 headers broke onto 2-3 rows at 390);
  // the table scrolls sideways in its ScrollFade instead
  const th = { textAlign: 'start', fontFamily: FN, fontSize: 9, color: C.tm, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700, padding: '7px 10px', borderBottom: `1px solid ${C.cardBd}`, whiteSpace: 'nowrap', lineHeight: 1.25 };
  const td = { fontFamily: FB, fontSize: 13, color: C.tx, padding: '7px 10px', borderBottom: `1px solid ${C.divider || C.cardBd}` };
  const totalPayments = clients.reduce((a, c) => a + c.payments.length, 0);
  const totalSessions = clients.reduce((a, c) => a + c.sessions, 0);

  return (
    // collapsible like OWED / REQUESTS / ROSTER on the same page (0 margin: Billing
    // stacks its cards with a 14px gap). ONE ROW: the meta rides `right` as
    // .strip-meta, which steps aside on a phone.
    <CollapsibleSection title={tt('Income history')} storageKey="billing-from-sheets" padX={PAD} padY={PAD} style={{ marginBottom: 0 }}
      right={
        <span className="strip-meta" style={{ flex: '0 1 auto', minWidth: 0, textAlign: 'end', fontFamily: FN, fontSize: 10, letterSpacing: '0.06em', opacity: 0.85, color: 'var(--c-stripTx)' }}>
          {byMonth.length} {byMonth.length === 1 ? tt('month') : tt('months')} · {clients.length} {tt('clients')} · {totalPayments} {tt('payments')} · {totalSessions} {tt('sessions counted')}
        </span>
      }>
      {health && (
        <div style={{ fontFamily: FN, fontSize: 10, color: C.td, letterSpacing: '0.04em', marginBottom: 12 }}>
          {/* One string, then noDangle: built as JSX fragments the separators
              were plain text nodes and a wrap could land straight after one.
              Two DANGLE findings on this line alone (en and he). */}
          {noDangle(`${tt('History')}: ${health.cells.toLocaleString()} ${tt('cells')} · ${tt('newest revision')} r${health.newestRev}${health.newestTime ? ' · ' + fmtNumericDate(health.newestTime) : ''} · ${tt('last harvested')} ${fmtNumericDate(health.harvestedAt)}`)}
        </div>
      )}

      {clients.some((c) => c.payments[0] && c.payments[0].unpaid) && (
        <div style={{ fontFamily: FB, fontSize: 12, color: C.rd, marginBottom: 12, lineHeight: 1.5 }}>
          <span style={{ fontFamily: FN, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, marginInlineEnd: 8 }}>{tt('Marked unpaid on the sheet')}</span>
          {clients.filter((c) => c.payments[0] && c.payments[0].unpaid).map((c) => <bdi key={c.key} style={{ marginInlineEnd: 10 }}>{c.name} · {fmtNumericDate(c.payments[0].event_date)}</bdi>)}
        </div>
      )}

      {byMonth.length > 0 && (
        <ScrollFade style={{ marginBottom: 18 }}>
          {/* The first column starts on the card title's edge (26.9, #215): its
              10px cell padding put MONTH and CLIENT 10px inside "From the
              sheets". Child combinators leave the nested history tables alone;
              the class out-ranks index.html's phone cell rule. */}
          <style>{`.rs-table > thead > tr > th:first-child, .rs-table > tbody > tr > td:first-child { padding-inline-start: 0 !important; }`}</style>
          <table className="rs-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>{tt('Month')}</th>
                {['online', 'gym_transfer', 'gym_cash', 'via_parents', 'bhbc'].map((c) => (
                  <th key={c} style={{ ...th, textAlign: 'end' }}>{noDangle(tt(CHANNEL_LABEL[c]))}</th>
                ))}
                <th style={{ ...th, textAlign: 'end', color: C.ac }}>{tt('Coaching income')}</th>
                <th style={{ ...th, textAlign: 'end' }}>{tt('Roster estimate')}</th>
                <th style={{ ...th, textAlign: 'end' }}>{tt('No amount')}</th>
                <th style={{ ...th, textAlign: 'end' }}>{tt('Gap')}</th>
                <th style={{ ...th, textAlign: 'end' }}>{noDangle(tt(CHANNEL_LABEL.national_insurance))}</th>
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
                const isOpenM = openMonth === g.month;
                const monthPays = (events || []).filter((e) => e.event_kind === 'payment' && String(e.event_date).slice(0, 7) === g.month.slice(0, 7)).sort((a, b) => (a.event_date < b.event_date ? 1 : -1));
                return (
                  <React.Fragment key={g.month}>
                  <tr onClick={() => setOpenMonth(isOpenM ? null : g.month)} style={{ cursor: 'pointer', height: 'var(--btn-h)', background: isOpenM ? 'rgba(57,189,255,0.06)' : 'transparent' }}>
                    <td style={{ ...td, fontFamily: FN, fontSize: 12, letterSpacing: '0.04em', whiteSpace: 'nowrap' }}><Chev open={isOpenM} />{monthLabel(g.month)}</td>
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
                      {est ? ILS(est.est) : '—'}
                    </td>
                    {/* THE PAYMENTS WITH NO PRICE ARE A COLUMN, NOT A "+1?" (9.10 #608, Ohad: "+1? and the
                        yellow numbers is not easy to understand ... it makes the column un-aligned"):
                        the estimate column holds money only, on one edge, and the gap is plain ink. */}
                    <td style={{ ...td, textAlign: 'end', color: est && est.unknown ? C.tx : C.td }} dir="ltr">{est && est.unknown ? est.unknown : '—'}</td>
                    <td style={{ ...td, textAlign: 'end', color: gap == null ? C.td : C.tx }} dir="ltr">{gap == null ? '—' : (gap > 0 ? '+' : gap < 0 ? '−' : '') + ILS(Math.abs(gap))}</td>
                    <td style={{ ...td, textAlign: 'end', color: C.tm }} dir="ltr">{g.other ? ILS(g.other) : '—'}</td>
                  </tr>
                  {isOpenM && (
                    <tr>
                      <td colSpan={11} style={{ padding: '4px 10px 12px 24px', borderBottom: `1px solid ${C.divider || C.cardBd}` }}>
                        {monthPays.length === 0 ? (
                          <div style={{ fontFamily: FB, fontSize: 12, color: C.td }}>{tt('The roster recorded no payment dated this month.')}</div>
                        ) : (
                          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead><tr>
                              <th style={th}>{tt('Client')}</th><th style={th}>{tt('Paid on')}</th><th style={th}>{tt('Rate')}</th><th style={th}>{tt('Cycle')}</th>
                              <th style={{ ...th, textAlign: 'end' }}>{tt('Estimated')}</th><th style={th}>{tt('Method')}</th>
                            </tr></thead>
                            <tbody>
                              {monthPays.map((p) => (
                                <tr key={p.id} style={{ height: 'var(--btn-h)' }}>
                                  <td style={{ ...td, fontSize: 12, padding: '5px 10px', fontWeight: 600 }}><bdi>{p.client_name}</bdi></td>
                                  <td style={{ ...td, fontSize: 12, padding: '5px 10px' }} dir="ltr">{fmtNumericDate(p.event_date)}</td>
                                  <td style={{ ...td, fontSize: 12, padding: '5px 10px', color: C.tm }}><bdi>{p.rate_text || '—'}</bdi></td>
                                  <td style={{ ...td, fontSize: 12, padding: '5px 10px', color: C.tm }}><bdi>{p.counter_before || '—'}</bdi></td>
                                  <td style={{ ...td, fontSize: 12, padding: '5px 10px', textAlign: 'end', fontWeight: 700, color: p.amount_est == null ? C.td : C.tx }} dir="ltr">{p.amount_est == null ? '—' : ILS(p.amount_est)}</td>
                                  <td style={{ ...td, padding: '5px 10px', fontFamily: FN, fontSize: 10, letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
                                    <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: CONF_COLOR[p.confidence] || C.td, marginInlineEnd: 6, verticalAlign: 'middle' }} />
                                    {tt(METHOD_LABEL[p.amount_method] || p.amount_method || 'no amount')}{p.unpaid ? <span style={{ color: C.rd }}> · {tt('marked unpaid')}</span> : null}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </td>
                    </tr>
                  )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
          <div style={{ fontFamily: FB, fontSize: 11, color: C.td, marginTop: 6, lineHeight: 1.5 }}>
            {tt('Roster estimate = the payments the roster recorded that month, priced at the rate beside each date × the sessions counter when it was reset. Gap = estimate minus the sheet\'s coaching total without the club. A payment dated in one month is often banked in the next.')}
          </div>
        </ScrollFade>
      )}

      {activeClients.length > 0 && (
        <>
          <div style={{ fontFamily: FN, fontSize: 10, color: C.tm, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700, marginBottom: 8 }}>
            {tt('Payments recorded per client')} · <span style={{ color: C.td, fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>{tt('tap a row for the full history')}</span>
          </div>
          <ClientsTable list={activeClients} open={open} setOpen={setOpen} statusOf={statusOf} tt={tt} th={th} td={td} />
        </>
      )}

      {/* NOT LINKED OR NOT ACTIVE = ITS OWN TABLE, CLOSED (9.10 #610, Ohad: an inactive
          table, collapsed by default but expandable). Same columns as the table above. */}
      {inactiveClients.length > 0 && (
        <div style={{ marginTop: activeClients.length ? 18 : 0 }}>
          <button type="button" onClick={() => setShowInactive((v) => !v)} aria-expanded={showInactive}
            style={{ display: 'flex', alignItems: 'center', width: '100%', height: 'var(--btn-h)', padding: 0, background: 'transparent', border: 'none', borderBottom: `1px solid ${C.cardBd}`, cursor: 'pointer', fontFamily: FN, fontSize: 10, color: C.tm, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700, textAlign: 'start' }}>
            <Chev open={showInactive} />
            <span>{tt('Inactive clients')} · {inactiveClients.length}</span>
            <span style={{ color: C.td, fontWeight: 400, textTransform: 'none', letterSpacing: 0, marginInlineStart: 8 }}>{tt('not linked in EXPO, or not active')}</span>
          </button>
          {showInactive && <div style={{ marginTop: 8 }}><ClientsTable list={inactiveClients} open={open} setOpen={setOpen} statusOf={statusOf} tt={tt} th={th} td={td} /></div>}
        </div>
      )}

      <div style={{ fontFamily: FB, fontSize: 11, color: C.td, marginTop: 12, lineHeight: 1.5 }}>
        {tt('Amounts in the month table come from ניהול פיננסי (its older months from the sheet\'s own revision history). Per-client rows come from every revision of רשימת מתאמנים: each change of the payment date is a payment, the counter beside it is the cycle, and the amount is an estimate from rate × counter — green dot when both were on the sheet, orange when one was inferred, red when the sheet gave no way to price it.')}
      </div>
    </CollapsibleSection>
  );
}
