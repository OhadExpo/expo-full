// OWED — who owes, how much, and every detail behind it (Ohad 28.9, #386).
//
// One card, three sources, one row per client:
//   SHEET    revenue_owed: the roster sheet's sessions since the last payment,
//            priced by his rule (lower price = personal, higher = couple, per
//            session). Online rows carry no amount - his rule does not cover
//            them - only "due since".
//   REQUESTS bit_payment_requests still pending (the old OUTSTANDING tile).
//   OVERDUE  the dashboard's own monthly-overdue list (passed in).
// Tapping a row opens every detail; BILLING opens the billing page, where the
// same card renders expanded. OWNER-ONLY: revenue_owed is RLS-locked to the
// owner and the dashboard renders this only for isOwner.
import React, { useEffect, useMemo, useState } from 'react';
import { C, FN, FB } from './theme';
import { CollapsibleSection, Modal } from './ui';
import { supabase } from './supabase';
import { useT, readLang } from './i18n';
import { fmtNumericDate } from './dates';

const ils = (n) => `₪${Math.round(n).toLocaleString('en-US')}`;
const DAY = 86400000;
const daysSince = (iso) => { if (!iso) return null; const t = Date.parse(iso); return Number.isFinite(t) ? Math.floor((Date.now() - t) / DAY) : null; };

function useOwedData() {
  const [state, setState] = useState({ rows: [], requests: [], loaded: false, error: null });
  useEffect(() => {
    let dead = false;
    const load = async () => {
      const [a, b] = await Promise.all([
        supabase.from('revenue_owed').select('*').order('amount', { ascending: false, nullsFirst: false }),
        supabase.from('bit_payment_requests').select('id, trainee_id, amount, reference, created_at').eq('status', 'pending').order('created_at', { ascending: false }).limit(500),
      ]);
      if (dead) return;
      setState({ rows: a.data || [], requests: b.data || [], loaded: true, error: a.error ? a.error.message : null });
    };
    load();
    // The daemon rewrites the table every 20 minutes; re-read on the same beat
    // and whenever the tab comes back into view.
    const t = setInterval(load, 5 * 60 * 1000);
    const onVis = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { dead = true; clearInterval(t); document.removeEventListener('visibilitychange', onVis); };
  }, []);
  return state;
}

// One entry per client: sheet row + pending requests + overdue flag.
function mergeOwed(rows, requests, overdue, trainees) {
  const byKey = new Map();
  const he = readLang() === 'he';
  const nameOf = (id) => { const t = (trainees || []).find((x) => x.id === id); return t ? (he ? (t.nameLocal || t.name) : t.name) : null; };
  const get = (key, name, tid) => {
    if (!byKey.has(key)) byKey.set(key, { key, name, traineeId: tid || null, sheet: null, requests: [], overdue: null });
    return byKey.get(key);
  };
  // every client the SHEET covers, owing or not: a sheet row with nothing owed
  // is the sheet saying "paid up", and it must silence the app's overdue flag
  // (1.10 code review: a paid-up client read "OVERDUE 243d" / "NEVER PAID")
  const coveredBySheet = new Set(rows.map((r) => r.trainee_id).filter(Boolean));
  for (const r of rows) {
    const onlineDue = r.section === 'online' && r.prices && r.prices.month && (daysSince(r.last_payment) ?? 0) > 31;
    if (!(r.amount > 0) && !onlineDue) continue;
    get(r.trainee_id || `sheet:${r.client_name}`, (!he && nameOf(r.trainee_id)) || r.client_name, r.trainee_id).sheet = { ...r, onlineDue };
  }
  for (const q of requests) get(q.trainee_id || `req:${q.id}`, nameOf(q.trainee_id) || q.reference || '—', q.trainee_id).requests.push(q);
  for (const o of overdue || []) {
    if (o.id && coveredBySheet.has(o.id) && !byKey.has(o.id)) continue;
    const e = byKey.get(o.id) || (!o.id ? null : get(o.id, (he ? (o.nameLocal || o.name) : (nameOf(o.id) || o.name || o.nameLocal)), o.id));   // the name in the UI's language, as the other two sources (AUDIT-470)
    // A client the SHEET covers is judged by the sheet's own last payment: the
    // app's payment list lags it (it read "overdue 243 days" for a client the
    // sheet shows paid 23 days ago).
    // ...and so is one that ALSO has a pending request (it already has a row, from the
    // request, with no sheet on it) - the sheet still says paid up (1.10 audit)
    if (e && !e.sheet && !coveredBySheet.has(o.id)) e.overdue = { days: o.daysOverdue, never: o.neverPaid };
  }
  const list = [...byKey.values()].map((e) => ({
    ...e,
    amount: (e.sheet && e.sheet.amount > 0 ? e.sheet.amount : 0) + e.requests.reduce((a, q) => a + (parseFloat(q.amount) || 0), 0),
  }));
  list.sort((a, b) => b.amount - a.amount || String(a.name).localeCompare(String(b.name)));
  return list;
}

const tagStyle = (color) => ({ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', color, border: `1px solid ${color}`, height: 20, boxSizing: 'border-box', display: 'inline-flex', alignItems: 'center', padding: '0 6px', whiteSpace: 'nowrap', lineHeight: 'normal' });

// ONE tag per row at most, the one thing the amount does not already say.
function Tag({ e, tt }) {
  if (e.overdue) return <span style={tagStyle(C.rd)}>{e.overdue.never ? tt('NEVER PAID') : `${tt('OVERDUE')} ${e.overdue.days}${tt('d')}`}</span>;
  if (e.requests.length) return <span style={tagStyle(C.ac)}>{tt('REQUEST PENDING')}</span>;
  if (e.sheet && e.sheet.onlineDue) return <span style={tagStyle(C.or)}>{tt('MONTH DUE')}</span>;
  return null;
}

// dd/mm, the year only when it is not this year
const shortDate = (iso) => { if (!iso) return '—'; const [y, m, d] = iso.slice(0, 10).split('-'); return y === String(new Date().getFullYear()) ? `${d}/${m}` : `${d}/${m}/${y.slice(2)}`; };
// A summary is a few FACTS joined by " · ". On a phone the line is wider than
// the row (29.9: "4 PERSONAL · 6 COUPLE · SINCE 30" - the date cut in half), so
// it may wrap, but only BETWEEN facts: the spaces inside a fact, and the one
// before each dot, are non-breaking - a fact and a date are never split.
const NB = '\u00a0';
const glue = (t) => String(t).replace(/ /g, NB);
const facts = (parts) => parts.map(glue).join(`${NB}· `);
function summaryLine(e, tt) {
  const s = e.sheet;
  if (s && s.section === 'in_person' && s.sessions_by) {
    const b = s.sessions_by, parts = [];
    if (b.personal) parts.push(`${b.personal} ${tt('personal')}`);
    if (b.couple) parts.push(`${b.couple} ${tt('couple')}`);
    // the sheet's own word for the kind ("אתלטיקה") in Hebrew; "other" in English
    if (b.other) parts.push(`${b.other} ${readLang() === 'he' && b.otherKind ? b.otherKind : tt('other')}`);
    return facts([...parts, `${tt('since')} ${shortDate(s.last_payment)}`]);
  }
  if (s && s.onlineDue) return facts([`${tt('Monthly')} ${s.prices.month}`, `${tt('last paid')} ${shortDate(s.last_payment)}`]);
  if (e.requests.length) return `${e.requests.length} ${tt('Pending requests')}`;
  // "ago", or it reads as "paid for the last 12 days" (AUDIT-470)
  if (e.overdue) return e.overdue.never ? tt('No payment recorded') : (readLang() === 'he' ? `שילם לפני ${e.overdue.days} ימים` : `last paid ${e.overdue.days} days ago`);
  return '';
}

function Row({ k, v, ltr }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 12, alignItems: 'center', minHeight: 36, borderBottom: `1px solid ${C.cardBd}` }}>
      <span style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', color: 'var(--c-tm)' }}>{k}</span>
      <span dir={ltr ? 'ltr' : 'auto'} style={{ fontFamily: FB, fontSize: 13, color: C.tx, textAlign: 'end', unicodeBidi: 'isolate' }}>{v}</span>
    </div>
  );
}
function Detail({ e, tt, onClose, onOpenBilling, onSelectTrainee }) {
  const s = e.sheet;
  return (
    <Modal open onClose={onClose} title={<bdi>{e.name}</bdi>}>
      <div data-owed-detail style={{ display: 'flex', flexDirection: 'column' }}>
        <Row k={tt('OWED')} v={e.amount > 0 ? ils(e.amount) : '—'} ltr />
        {s && <>
          <Row k={tt('SOURCE')} v={s.section === 'online' ? tt('Roster sheet · online') : tt('Roster sheet · in person')} />
          <Row k={tt('LAST PAYMENT')} v={`${fmtNumericDate(s.last_payment)}${daysSince(s.last_payment) != null ? ` · ${daysSince(s.last_payment)} ${tt('days')}` : ''}`} />
          {s.sessions_text && <Row k={tt('SESSIONS SINCE')} v={<bdi>{s.sessions_text}</bdi>} />}
          {s.price_text && <Row k={tt('PRICE')} v={<bdi>{s.price_text}</bdi>} />}
          {s.prices && s.prices.personal != null && <Row k={tt('PRICE RULE')} v={`${tt('personal')} ${s.prices.personal} · ${tt('couple')} ${s.prices.couple}`} />}
          <Row k={tt('CALCULATION')} v={<bdi dir="ltr">{s.amount > 0 ? `${s.method} = ${ils(s.amount)}` : s.method}</bdi>} />
          {s.sheet_updated && <Row k={tt('SHEET')} v={<bdi>{s.sheet_updated}</bdi>} />}
        </>}
        {e.requests.map((q) => <Row key={q.id} k={tt('REQUEST PENDING')} v={`${ils(parseFloat(q.amount) || 0)} · ${fmtNumericDate(q.created_at)}`} />)}
        {e.overdue && <Row k={tt('OVERDUE')} v={e.overdue.never ? tt('No payment recorded') : `${e.overdue.days} ${tt('days')}`} />}
        <div style={{ display: 'grid', gridTemplateColumns: e.traineeId && onSelectTrainee ? '1fr 1fr' : '1fr', gap: 8, marginTop: 16 }}>
          {e.traineeId && onSelectTrainee && <button type="button" onClick={() => { onClose(); onSelectTrainee(e.traineeId); }} style={btn(false)}>{tt('ATHLETE PAGE')}</button>}
          {onOpenBilling && <button type="button" onClick={() => { onClose(); onOpenBilling(); }} style={btn(true)}>{tt('BILLING')} {readLang() === 'he' ? '←' : '→'}</button>}
        </div>
      </div>
    </Modal>
  );
}
const btn = (primary) => ({ height: 36, boxSizing: 'border-box', background: 'transparent', border: `1px solid ${primary ? C.ac : C.cardBd}`, color: primary ? C.ac : C.tx, fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', cursor: 'pointer', lineHeight: 'normal', padding: '0 12px' });

export default function OwedCard({ trainees = [], overdue = [], onOpenBilling, onSelectTrainee, expanded = false }) {
  const tt = useT();
  const { rows, requests, loaded, error } = useOwedData();
  const list = useMemo(() => mergeOwed(rows, requests, overdue, trainees), [rows, requests, overdue, trainees]);
  const [open, setOpen] = useState(null);
  const total = list.reduce((a, e) => a + e.amount, 0);
  const synced = rows.reduce((m, r) => (r.synced_at > m ? r.synced_at : m), '');
  const ageMin = synced ? Math.round((Date.now() - Date.parse(synced)) / 60000) : null;
  const stale = ageMin != null && ageMin > 90;
  const syncLabel = ageMin == null ? tt('not synced yet') : ageMin < 2 ? tt('synced just now') : ageMin < 60 ? `${tt('synced')} ${ageMin}${tt('m ago')}` : `${tt('synced')} ${Math.round(ageMin / 60)}${tt('h ago')}`;

  return (
    <CollapsibleSection title={tt('Owed')} storageKey={expanded ? 'billing-owed' : 'dash-owed'} count={loaded ? list.length : undefined} style={{ marginBottom: 20 }}
      right={<span data-owed-total style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: 'color-mix(in srgb, var(--c-stripTx) 75%, transparent)', whiteSpace: 'nowrap' }}><bdi dir="ltr">{ils(total)}</bdi></span>}>
      <div data-owed-card>
        {error && <div style={{ fontFamily: FB, fontSize: 12, color: C.rd, marginBottom: 8 }}>{tt('Could not read the owed list')}: {error}</div>}
        {!loaded ? <div style={{ fontFamily: FN, fontSize: 10, letterSpacing: '0.14em', color: 'var(--c-td)', minHeight: 36, display: 'flex', alignItems: 'center' }}>{tt('Loading…')}</div>
          : list.length === 0 ? <div style={{ fontFamily: FN, fontSize: 10, letterSpacing: '0.14em', color: 'var(--c-td)', minHeight: 36, display: 'flex', alignItems: 'center' }}>{tt('Nobody owes anything')}</div>
          : (
            <div role="list" className="app-list" style={{ display: 'flex', flexDirection: 'column' }}>
              {(expanded ? list : list.slice(0, 8)).map((e) => (
                <button key={e.key} type="button" role="listitem" data-owed-row onClick={() => setOpen(e)}
                  style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gridTemplateRows: '24px minmax(20px, auto)', columnGap: 12, rowGap: 4, alignItems: 'center', minHeight: 68, boxSizing: 'border-box', padding: '10px 0', background: 'transparent', border: 'none', borderBottom: `1px solid ${C.cardBd}`, textAlign: 'start', cursor: 'pointer', color: C.tx, width: '100%' }}>
                  <span style={{ fontFamily: FB, fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', minWidth: 0, overflow: 'hidden' }}><bdi>{e.name}</bdi></span>
                  {/* no amount (a monthly client): the MONTH DUE tag takes the amount's
                      place, one tier like every other row (29.9 #448 audit: "—" over
                      the tag made those rows two-tier on the right) */}
                  {e.amount > 0
                    ? <span dir="ltr" style={{ justifySelf: 'end', fontFamily: FN, fontSize: 16, fontWeight: 800, fontVariantNumeric: 'tabular-nums', lineHeight: 'normal', color: C.or }}>{ils(e.amount)}</span>
                    : <span style={{ justifySelf: 'end' }}><Tag e={e} tt={tt} /></span>}
                  <span data-owed-summary style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--c-tm)', minWidth: 0, lineHeight: 1.6 }}>{summaryLine(e, tt)}</span>
                  <span style={{ justifySelf: 'end' }}>{e.amount > 0 ? <Tag e={e} tt={tt} /> : null}</span>
                </button>
              ))}
            </div>
          )}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', alignItems: 'center', gap: 12, marginTop: 12 }}>
          <span style={{ fontFamily: FN, fontSize: 9, letterSpacing: '0.1em', color: stale ? C.rd : 'var(--c-td)' }}>{tt('From the roster sheet')} · {syncLabel}</span>
          {!expanded && onOpenBilling && <button type="button" data-owed-billing onClick={onOpenBilling} style={btn(true)}>{list.length > 8 ? `${tt('ALL')} ${list.length}` : tt('BILLING')} {readLang() === 'he' ? '←' : '→'}</button>}
        </div>
      </div>
      {open && <Detail e={open} tt={tt} onClose={() => setOpen(null)} onOpenBilling={expanded ? null : onOpenBilling} onSelectTrainee={onSelectTrainee} />}
    </CollapsibleSection>
  );
}
