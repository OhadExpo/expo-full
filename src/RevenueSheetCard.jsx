// REVENUE RECONSTRUCTED FROM THE SHEETS — /coach/billing.
//
// Ohad: "i want everything available to retrack to be logged in expo" and
// "make sure it gets updated (the revenue on expo) twice a day forever".
//
// Two sources, kept apart on purpose because they are different KINDS of fact:
//
//   MONTHLY TOTALS come from ניהול פיננסי and are the only real amounts either
//   sheet records. They reconcile to that sheet's own סך הכנסות.
//
//   PAYMENT DATES come from רשימת מתאמנים, which stores one date per client and
//   overwrites it, so the history behind them was recovered from the file's own
//   revisions. It records WHEN a client paid and the rate in force, never how
//   much: the sheet holds a rate and a count of sessions performed SINCE the
//   payment, and multiplying those would be inventing revenue. So this shows
//   dates and rates, and no per-client money.
//
// Both tables are owner-only, so for staff and athletes the queries return
// nothing and the card renders nothing at all.
import React, { useEffect, useState, useMemo } from 'react';
import { useT } from './i18n';
import { C, FN, FB } from './theme';
import { supabase } from './supabase';
import { RefinedHeaderStrip } from './ui';
import { fmtNumericDate, monthAbbr } from './dates';

const ILS = (n) => '₪' + Number(n || 0).toLocaleString();

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

const monthLabel = (iso) => {
  const [y, m] = String(iso).split('-');
  return monthAbbr(Number(m) - 1) + ' ' + y;
};

export default function RevenueSheetCard() {
  const tt = useT();
  const PAD = 14;
  const [months, setMonths] = useState(null);
  const [events, setEvents] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [m, e] = await Promise.all([
        supabase.from('revenue_month_total').select('*').order('month', { ascending: false }),
        supabase.from('revenue_sheet_event').select('*').eq('event_kind', 'payment_date')
          .order('event_date', { ascending: false }).limit(1000),
      ]);
      if (!alive) return;
      // An RLS refusal and an empty table look the same here, and both mean
      // "show nothing" rather than an error the coach can act on.
      setMonths(m.data || []);
      setEvents(e.data || []);
    })();
    return () => { alive = false; };
  }, []);

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

  const clients = useMemo(() => {
    // Group by TRAINEE, not by the name in the sheet. A couple gets written
    // both ways over the years - "חיליק ומיה יניב" in 2024, "מיה וחילק יניב" in
    // 2026 - and keying on the string listed the same clients twice with their
    // payments split between the rows. Anyone with no EXPO record still keys on
    // their name, because that is all they have.
    const map = new Map();
    for (const e of events || []) {
      const k = e.trainee_id || 'name:' + e.client_name;
      if (!map.has(k)) map.set(k, { key: k, names: new Set(), trainee_id: e.trainee_id, section: e.section, rate: e.rate_text, dates: [] });
      const g = map.get(k);
      g.names.add(e.client_name);
      g.dates.push(e.event_date);
      // The rate that goes with the most recent date is the current one.
      if (!g.latest || e.event_date > g.latest) { g.latest = e.event_date; g.rate = e.rate_text; }
    }
    return [...map.values()]
      // Events arrive newest-first, so the FIRST spelling inserted is the
      // current one. Taking the last showed the oldest name as the headline
      // and listed today's spelling underneath it as an alias - backwards.
      .map((c) => ({ ...c, dates: [...new Set(c.dates)].sort().reverse(), name: [...c.names][0], alsoKnownAs: [...c.names].slice(1) }))
      .sort((a, b) => (a.dates[0] < b.dates[0] ? 1 : -1));
  }, [events]);

  if (months === null) return null;
  if (!months.length && !events.length) return null;

  const th = { textAlign: 'start', fontFamily: FN, fontSize: 9, color: C.tm, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700, padding: '7px 10px', borderBottom: `1px solid ${C.cardBd}`, whiteSpace: 'normal', lineHeight: 1.25 };
  const td = { fontFamily: FB, fontSize: 13, color: C.tx, padding: '7px 10px', borderBottom: `1px solid ${C.divider || C.cardBd}` };

  return (
    <div style={{ background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, padding: PAD, boxShadow: C.cardShadow }}>
      <RefinedHeaderStrip padY={PAD} padX={PAD} marginBottom={12}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span>{tt('From the sheets')}</span>
          <span style={{ fontFamily: FN, fontSize: 10, letterSpacing: '0.06em', opacity: 0.85 }}>
            {byMonth.length} {byMonth.length === 1 ? tt('month') : tt('months')} · {clients.length} {tt('clients')}
          </span>
        </div>
      </RefinedHeaderStrip>

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
                <th style={{ ...th, textAlign: 'end' }}>{tt(CHANNEL_LABEL.national_insurance)}</th>
              </tr>
            </thead>
            <tbody>
              {byMonth.map((g) => (
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
                  <td style={{ ...td, textAlign: 'end', color: C.tm }} dir="ltr">{g.other ? ILS(g.other) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {clients.length > 0 && (
        <>
          <div style={{ fontFamily: FN, fontSize: 10, color: C.tm, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700, marginBottom: 8 }}>
            {tt('Payments recorded per client')}
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>{tt('Client')}</th>
                  <th style={th}>{tt('Last payment')}</th>
                  <th style={{ ...th, textAlign: 'end' }}>{tt('Payments on record')}</th>
                  <th style={th}>{tt('Rate')}</th>
                  <th style={th}>{tt('In EXPO')}</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => (
                  <tr key={c.key}>
                    <td style={{ ...td, fontWeight: 600 }}>
                      <bdi>{c.name}</bdi>
                      {/* Named, not hidden: seeing the old spelling is how he
                          can tell the two really are the same client. */}
                      {c.alsoKnownAs.length > 0 && (
                        <span style={{ display: 'block', fontSize: 11, color: C.td, fontWeight: 400 }}>
                          <bdi>{c.alsoKnownAs.join(' · ')}</bdi>
                        </span>
                      )}
                    </td>
                    <td style={td} dir="ltr">{fmtNumericDate(c.dates[0])}</td>
                    <td style={{ ...td, textAlign: 'end' }} dir="ltr">{c.dates.length}</td>
                    <td style={{ ...td, color: C.tm }}><bdi>{c.rate || '—'}</bdi></td>
                    {/* A client who pays but has no trainee record is a real gap,
                        not a display problem, so it is named rather than blank. */}
                    <td style={{ ...td, color: c.trainee_id ? C.tm : C.or, fontFamily: FN, fontSize: 10, letterSpacing: '0.06em' }}>
                      {c.trainee_id ? tt('linked') : tt('no record')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div style={{ fontFamily: FB, fontSize: 11, color: C.td, marginTop: 12, lineHeight: 1.5 }}>
        {tt("Amounts come from ניהול פיננסי. Dates come from רשימת מתאמנים, which keeps only the latest one per client — the earlier ones were recovered from the sheet's own revision history. Per-client amounts are deliberately not shown: the sheet records a rate and the sessions performed since a payment, which is not what was paid.")}
      </div>
    </div>
  );
}
