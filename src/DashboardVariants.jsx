// Three full Dashboard redesigns. Same data, three completely different
// visual systems. Toggleable via sessionStorage('expo-dash-variant') or
// the URL ?dash=A|B|C; whichever value is set, App.jsx renders the
// corresponding component instead of the default DashboardView.
//
//   A — BOLD / SPORT       hero numbers, cyan-filled header, energetic
//   B — EDITORIAL          generous whitespace, narrative summary, magazine
//   C — DENSE / TERMINAL   info-rich grid, sparkline-style data, pro feel
//
// All three use the BSG palette: cyan #39BDFF + white + black, plus
// supporting grays and the functional rd/gn/or for data states. Each
// variant is fully self-contained — picking one and removing the
// others is a single-file delete.

import React, { useMemo } from 'react';
import { C, FN, FB } from './theme';
import { traineeIdsFor } from './traineeUtils';
import { WhatsAppCheckInButton, normalizePhoneIL } from './whatsappButton';

const CYAN = '#39BDFF';
const BLACK = '#000000';
const WHITE = '#FFFFFF';

// Shared data hook — derives every metric the variants need from the
// same input set. Living here so the variants stay focused on layout.
function useDashboardData({ trainees, planCounts, workouts, clientWorkouts, payments, presence }) {
  return useMemo(() => {
    const enriched = trainees.map(t => {
      const ids = new Set(traineeIdsFor(t.id));
      const tPay = payments.filter(p => ids.has(p.traineeId));
      const tWorkInPerson = workouts.filter(w => ids.has(w.traineeId) && w.status === 'completed');
      const tWorkPortal = (clientWorkouts || []).filter(w => ids.has(w.clientId));
      const tWork = [...tWorkInPerson, ...tWorkPortal];
      const totalPaid = tPay.reduce((a, p) => a + (parseFloat(p.amount) || 0), 0);
      const lastPay = tPay.sort((a, b) => new Date(b.date) - new Date(a.date))[0];
      const lastWorkout = tWork.sort((a, b) => new Date(b.date) - new Date(a.date))[0];
      return { ...t, totalPaid, lastPay, lastWorkout, workoutCount: tWork.length, planCount: planCounts[t.id] || 0 };
    });
    const now = new Date();

    const active = trainees.filter(t => t.status === 'Active').length;
    const totalCount = trainees.filter(t => t.status !== 'Archived').length;
    const monthlyRate = trainees.filter(t => t.status === 'Active').reduce((a, t) => a + (parseFloat(t.monthly) || 0), 0);
    const thisMonthPaid = payments.filter(p => {
      const d = new Date(p.date);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear() && p.status === 'Paid';
    }).reduce((a, p) => a + (parseFloat(p.amount) || 0), 0);
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthPaid = payments.filter(p => {
      const d = new Date(p.date);
      return d.getMonth() === lastMonth.getMonth() && d.getFullYear() === lastMonth.getFullYear() && p.status === 'Paid';
    }).reduce((a, p) => a + (parseFloat(p.amount) || 0), 0);
    const revDelta = lastMonthPaid > 0 ? Math.round(((thisMonthPaid - lastMonthPaid) / lastMonthPaid) * 100) : null;
    const lowSessions = enriched.filter(t => t.sessionsRemaining > 0 && t.sessionsRemaining <= 2).length;

    const expiring = enriched.filter(t => t.status === 'Active' && t.sessionsRemaining > 0 && t.sessionsRemaining <= 2);
    const dropoutRisk = enriched.filter(t => {
      if (t.status !== 'Active') return false;
      if (!t.lastWorkout) return true;
      const daysSince = Math.floor((now - new Date(t.lastWorkout.date)) / 86400000);
      return daysSince >= 14;
    });
    const ONLINE_MS = 2 * 60 * 1000;
    const onlineNow = enriched.filter(t => traineeIdsFor(t.id).some(id => presence?.[id] && (now.getTime() - presence[id]) < ONLINE_MS));

    const overduePayment = enriched.map(t => {
      if (t.status !== 'Active') return null;
      const monthly = parseFloat(t.monthly) || 0;
      if (monthly <= 0) return null;
      const latestPayDate = t.lastPay ? new Date(t.lastPay.date) : (t.lastPayment ? new Date(t.lastPayment) : null);
      if (!latestPayDate || isNaN(latestPayDate.getTime())) {
        return { ...t, daysOverdue: null, neverPaid: true };
      }
      const days = Math.floor((now - latestPayDate) / 86400000);
      if (days >= 30) return { ...t, daysOverdue: days, neverPaid: false };
      return null;
    }).filter(Boolean).sort((a, b) => (b.daysOverdue || 9999) - (a.daysOverdue || 9999));

    return { enriched, now, active, totalCount, monthlyRate, thisMonthPaid, revDelta, lowSessions, expiring, dropoutRisk, onlineNow, overduePayment };
  }, [trainees, planCounts, workouts, clientWorkouts, payments, presence]);
}

// ============================================================================
// A — BOLD / SPORT
// Cyan-filled hero band, GIANT KPI numbers, energetic typography. Brand cyan
// dominates as a stripe; cards are white with thick black side-bars; status
// is communicated via filled colored chips. Reads as a sports performance
// dashboard.
// ============================================================================
export function DashboardA({ trainees, planCounts, workouts, clientWorkouts, payments, presence, onSelectTrainee }) {
  const d = useDashboardData({ trainees, planCounts, workouts, clientWorkouts, payments, presence });

  const Kpi = ({ label, value, sub, accent }) => (
    <div style={{ background: WHITE, padding: '24px 24px 22px', borderTop: `4px solid ${accent || BLACK}`, position: 'relative' }}>
      <div style={{ fontFamily: FN, fontSize: 10, fontWeight: 800, color: BLACK, letterSpacing: '0.18em', marginBottom: 12 }}>{label}</div>
      <div style={{ fontFamily: FN, fontSize: 56, fontWeight: 900, color: BLACK, lineHeight: 0.9, letterSpacing: '-0.04em' }}>{value}</div>
      {sub && <div style={{ fontFamily: FN, fontSize: 11, fontWeight: 700, color: accent || BLACK, marginTop: 8, letterSpacing: '0.04em' }}>{sub}</div>}
    </div>
  );

  return (
    <div style={{ background: WHITE, margin: '-12px -12px 0', minHeight: '100vh' }}>
      {/* Cyan hero band — page-wide */}
      <div style={{ background: CYAN, padding: '28px 32px 32px', borderBottom: `4px solid ${BLACK}` }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginBottom: 4 }}>
            <h1 style={{ margin: 0, fontFamily: FN, fontSize: 48, fontWeight: 900, color: BLACK, letterSpacing: '-0.03em', lineHeight: 1 }}>TODAY</h1>
            <span style={{ fontFamily: FN, fontSize: 14, fontWeight: 700, color: BLACK, opacity: 0.7 }}>{d.now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
          </div>
          <div style={{ fontFamily: FB, fontSize: 14, color: BLACK, opacity: 0.75 }}>{d.active} active · {d.dropoutRisk.length} at risk · {d.overduePayment.length} overdue · {d.onlineNow.length} online now</div>
        </div>
      </div>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 32px 60px' }}>
        {/* KPI grid — 4 across, BIG numbers */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32, border: `2px solid ${BLACK}` }}>
          <div style={{ borderRight: `2px solid ${BLACK}` }}><Kpi label="ACTIVE" value={d.active} sub={`OF ${d.totalCount}`} accent={C.gn} /></div>
          <div style={{ borderRight: `2px solid ${BLACK}` }}><Kpi label="MONTHLY" value={`₪${(d.monthlyRate / 1000).toFixed(1)}K`} sub="RECURRING" accent={CYAN} /></div>
          <div style={{ borderRight: `2px solid ${BLACK}` }}><Kpi label="COLLECTED" value={`₪${d.thisMonthPaid}`} sub={d.revDelta != null ? `${d.revDelta >= 0 ? '+' : ''}${d.revDelta}% MOM` : 'NO PRIOR'} accent={d.revDelta >= 0 ? C.gn : C.rd} /></div>
          <Kpi label="LOW SESSIONS" value={d.lowSessions} sub={d.lowSessions > 0 ? 'TOP UP' : 'ALL CLEAR'} accent={d.lowSessions > 0 ? C.or : C.gn} />
        </div>

        {/* Big two-column urgency stack */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: 16 }}>
          <UrgencyPanelA title="OVERDUE" tone={C.rd} list={d.overduePayment} renderRight={t => t.neverPaid ? 'NEVER PAID' : `${t.daysOverdue}D OVERDUE`} onSelect={onSelectTrainee} />
          <UrgencyPanelA title="DORMANT 14+D" tone={C.or} list={d.dropoutRisk} renderRight={t => t.lastWorkout ? `${Math.floor((d.now - new Date(t.lastWorkout.date)) / 86400000)}D AGO` : 'NEVER TRAINED'} onSelect={onSelectTrainee} showWhatsApp={true} />
          {d.expiring.length > 0 && <UrgencyPanelA title="EXPIRING" tone={C.or} list={d.expiring} renderRight={t => `${t.sessionsRemaining} LEFT`} onSelect={onSelectTrainee} />}
          {d.onlineNow.length > 0 && <UrgencyPanelA title="ONLINE NOW" tone={C.gn} list={d.onlineNow} renderRight={() => '● LIVE'} onSelect={onSelectTrainee} />}
        </div>
      </div>
    </div>
  );
}

function UrgencyPanelA({ title, tone, list, renderRight, onSelect, showWhatsApp }) {
  return (
    <div style={{ background: WHITE, border: `2px solid ${BLACK}`, position: 'relative' }}>
      <div style={{ background: tone, color: WHITE, padding: '10px 16px', fontFamily: FN, fontSize: 12, fontWeight: 800, letterSpacing: '0.18em', display: 'flex', justifyContent: 'space-between' }}>
        <span>{title}</span><span>{list.length}</span>
      </div>
      <div>
        {list.slice(0, 8).map((t, i) => (
          <div key={t.id} onClick={() => onSelect && onSelect(t.id)}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderTop: i > 0 ? `1px solid rgba(0,0,0,0.08)` : 'none', cursor: onSelect ? 'pointer' : 'default' }}>
            <span style={{ flex: 1, fontFamily: FB, fontSize: 14, fontWeight: 600, color: BLACK }}>{t.name}</span>
            <span style={{ fontFamily: FN, fontSize: 11, fontWeight: 700, color: tone, letterSpacing: '0.06em' }}>{renderRight(t)}</span>
            {showWhatsApp && t.phone && normalizePhoneIL(t.phone) && (
              <WhatsAppCheckInButton name={t.name} phone={t.phone} days={t.lastWorkout ? Math.floor((Date.now() - new Date(t.lastWorkout.date)) / 86400000) : null} />
            )}
          </div>
        ))}
        {list.length > 8 && <div style={{ padding: '10px 16px', fontFamily: FN, fontSize: 10, fontWeight: 700, color: BLACK, opacity: 0.5, letterSpacing: '0.1em', textAlign: 'center' }}>+ {list.length - 8} MORE</div>}
      </div>
    </div>
  );
}

// ============================================================================
// B — EDITORIAL
// Magazine cover. Big serif-feeling display headline ("Hi Ohad."), generous
// whitespace, status communicated via long-form sentences ("3 athletes are
// overdue on payment"). Cyan as decorative ribbon and pull-quote accent.
// Cards are minimal — borderless on warm white, separated by spacing alone.
// ============================================================================
export function DashboardB({ trainees, planCounts, workouts, clientWorkouts, payments, presence, onSelectTrainee }) {
  const d = useDashboardData({ trainees, planCounts, workouts, clientWorkouts, payments, presence });

  return (
    <div style={{ background: '#FAF7F0', margin: '-12px -12px 0', minHeight: '100vh', color: BLACK }}>
      <div style={{ maxWidth: 880, margin: '0 auto', padding: '64px 32px 80px' }}>
        {/* Hero — magazine headline */}
        <div style={{ marginBottom: 56 }}>
          <div style={{ fontFamily: FN, fontSize: 11, fontWeight: 800, color: CYAN, letterSpacing: '0.24em', marginBottom: 12 }}>EXPO · DAILY DIGEST</div>
          <h1 style={{ margin: 0, fontFamily: FB, fontSize: 64, fontWeight: 700, color: BLACK, lineHeight: 0.96, letterSpacing: '-0.04em' }}>
            Today, <span style={{ background: `linear-gradient(transparent 65%, ${CYAN} 65%)`, padding: '0 4px' }}>{d.active} athletes</span> are training with you.
          </h1>
          <p style={{ marginTop: 28, fontFamily: FB, fontSize: 19, lineHeight: 1.55, color: '#000000B3' }}>
            {d.thisMonthPaid > 0 ? `You've collected ₪${d.thisMonthPaid.toLocaleString()} this month` : 'No payments collected this month yet'}
            {d.revDelta != null && d.revDelta !== 0 && <span> — {d.revDelta >= 0 ? 'up' : 'down'} <strong style={{ color: d.revDelta >= 0 ? C.gn : C.rd }}>{Math.abs(d.revDelta)}%</strong> versus last month</span>}.
            Recurring rate sits at <strong>₪{d.monthlyRate.toLocaleString()}</strong>.
            {d.overduePayment.length > 0 && <> {d.overduePayment.length} {d.overduePayment.length === 1 ? 'athlete is' : 'athletes are'} overdue on payment.</>}
            {d.dropoutRisk.length > 0 && <> {d.dropoutRisk.length} haven't trained in 14+ days.</>}
          </p>
        </div>

        {/* Cyan ribbon divider */}
        <div style={{ height: 4, background: CYAN, width: 96, marginBottom: 48 }} />

        {/* KPI numbers — restrained, large */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 32, marginBottom: 64 }}>
          {[
            { label: 'Active', value: d.active, sub: `of ${d.totalCount}` },
            { label: 'Monthly', value: `₪${d.monthlyRate.toLocaleString()}` },
            { label: 'Collected', value: `₪${d.thisMonthPaid.toLocaleString()}` },
            { label: 'At risk', value: d.dropoutRisk.length },
          ].map(k => (
            <div key={k.label}>
              <div style={{ fontFamily: FN, fontSize: 11, fontWeight: 700, color: '#00000080', letterSpacing: '0.12em', marginBottom: 8, textTransform: 'uppercase' }}>{k.label}</div>
              <div style={{ fontFamily: FB, fontSize: 40, fontWeight: 700, color: BLACK, letterSpacing: '-0.02em', lineHeight: 1 }}>{k.value}</div>
              {k.sub && <div style={{ fontFamily: FB, fontSize: 14, color: '#00000080', marginTop: 6 }}>{k.sub}</div>}
            </div>
          ))}
        </div>

        {/* Lists — borderless, generous spacing */}
        {d.overduePayment.length > 0 && (
          <SectionB title="Overdue payment" subtitle={`${d.overduePayment.length} ${d.overduePayment.length === 1 ? 'athlete' : 'athletes'}`} list={d.overduePayment} renderMeta={t => t.neverPaid ? 'never paid' : `${t.daysOverdue} days overdue`} metaColor={C.rd} onSelect={onSelectTrainee} />
        )}
        {d.dropoutRisk.length > 0 && (
          <SectionB title="Haven't trained" subtitle={`14+ days · ${d.dropoutRisk.length} ${d.dropoutRisk.length === 1 ? 'athlete' : 'athletes'}`} list={d.dropoutRisk} renderMeta={t => t.lastWorkout ? `${Math.floor((d.now - new Date(t.lastWorkout.date)) / 86400000)} days ago` : 'never trained'} metaColor={C.or} onSelect={onSelectTrainee} />
        )}
      </div>
    </div>
  );
}

function SectionB({ title, subtitle, list, renderMeta, metaColor, onSelect }) {
  return (
    <section style={{ marginBottom: 56 }}>
      <div style={{ marginBottom: 24, display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <h2 style={{ margin: 0, fontFamily: FB, fontSize: 24, fontWeight: 700, color: BLACK, letterSpacing: '-0.01em' }}>{title}</h2>
        <span style={{ fontFamily: FN, fontSize: 12, color: '#00000080', letterSpacing: '0.04em' }}>· {subtitle}</span>
      </div>
      <div>
        {list.slice(0, 10).map(t => (
          <div key={t.id} onClick={() => onSelect && onSelect(t.id)}
            style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 0', borderBottom: '1px solid rgba(0,0,0,0.08)', cursor: onSelect ? 'pointer' : 'default' }}>
            <span style={{ flex: 1, fontFamily: FB, fontSize: 17, color: BLACK }}>{t.name}</span>
            <span style={{ fontFamily: FB, fontSize: 14, color: metaColor, fontStyle: 'italic' }}>{renderMeta(t)}</span>
          </div>
        ))}
        {list.length > 10 && <div style={{ padding: '14px 0', fontFamily: FB, fontSize: 13, color: '#00000080' }}>+ {list.length - 10} more</div>}
      </div>
    </section>
  );
}

// ============================================================================
// C — DENSE / TERMINAL
// Bloomberg-feel pro tool. Black bg, monospace data, cyan as the data highlight.
// 3-column grid with maximum info density. Status pills, sparklines (count-only),
// no hand-holding. Each section is a tile in the grid, not a card.
// ============================================================================
export function DashboardC({ trainees, planCounts, workouts, clientWorkouts, payments, presence, onSelectTrainee }) {
  const d = useDashboardData({ trainees, planCounts, workouts, clientWorkouts, payments, presence });

  const cellStyle = { background: '#0F1419', border: '1px solid rgba(57,189,255,0.20)', padding: '12px 14px' };
  const labelStyle = { fontFamily: FN, fontSize: 9, fontWeight: 700, color: CYAN, letterSpacing: '0.18em', marginBottom: 6 };
  const valueStyle = { fontFamily: FN, fontSize: 22, fontWeight: 700, color: WHITE, letterSpacing: '0.02em' };

  return (
    <div style={{ background: BLACK, color: WHITE, margin: '-12px -12px 0', minHeight: '100vh', padding: '20px 24px' }}>
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        {/* Top status strip */}
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', borderBottom: `1px solid ${CYAN}`, paddingBottom: 12, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 16 }}>
            <span style={{ fontFamily: FN, fontSize: 20, fontWeight: 800, color: CYAN, letterSpacing: '0.04em' }}>EXPO TERMINAL</span>
            <span style={{ fontFamily: FN, fontSize: 11, color: '#FFFFFF80', letterSpacing: '0.12em' }}>{d.now.toISOString().slice(0, 16).replace('T', ' ')} UTC</span>
          </div>
          <div style={{ display: 'flex', gap: 24, fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em' }}>
            <span>● ACTIVE <span style={{ color: C.gn }}>{d.active}</span></span>
            <span>● OVERDUE <span style={{ color: C.rd }}>{d.overduePayment.length}</span></span>
            <span>● DORMANT <span style={{ color: C.or }}>{d.dropoutRisk.length}</span></span>
            <span>● ONLINE <span style={{ color: C.gn }}>{d.onlineNow.length}</span></span>
          </div>
        </div>

        {/* KPI strip — 6 dense cells */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8, marginBottom: 16 }}>
          <div style={cellStyle}><div style={labelStyle}>ACTIVE</div><div style={valueStyle}>{d.active}<span style={{ fontSize: 12, color: '#FFFFFF66' }}>/{d.totalCount}</span></div></div>
          <div style={cellStyle}><div style={labelStyle}>MRR</div><div style={valueStyle}>₪{(d.monthlyRate / 1000).toFixed(1)}K</div></div>
          <div style={cellStyle}><div style={labelStyle}>COLLECTED</div><div style={{ ...valueStyle, color: d.thisMonthPaid > 0 ? C.gn : '#FFFFFF80' }}>₪{d.thisMonthPaid}</div></div>
          <div style={cellStyle}><div style={labelStyle}>MOM Δ</div><div style={{ ...valueStyle, color: d.revDelta >= 0 ? C.gn : C.rd }}>{d.revDelta != null ? `${d.revDelta >= 0 ? '+' : ''}${d.revDelta}%` : '—'}</div></div>
          <div style={cellStyle}><div style={labelStyle}>LOW SES</div><div style={{ ...valueStyle, color: d.lowSessions > 0 ? C.or : C.gn }}>{d.lowSessions}</div></div>
          <div style={cellStyle}><div style={labelStyle}>AT RISK</div><div style={{ ...valueStyle, color: d.dropoutRisk.length > 0 ? C.or : C.gn }}>{d.dropoutRisk.length}</div></div>
        </div>

        {/* 3-column data grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          <DataTileC title="OVERDUE PAYMENT" data={d.overduePayment} renderRow={t => ({ left: t.name, right: t.neverPaid ? 'NVR' : `${t.daysOverdue}D`, color: C.rd })} onSelect={onSelectTrainee} />
          <DataTileC title="DORMANT 14+D" data={d.dropoutRisk} renderRow={t => ({ left: t.name, right: t.lastWorkout ? `${Math.floor((d.now - new Date(t.lastWorkout.date)) / 86400000)}D` : 'NVR', color: C.or })} onSelect={onSelectTrainee} />
          <DataTileC title="EXPIRING" data={d.expiring} renderRow={t => ({ left: t.name, right: `${t.sessionsRemaining}L`, color: C.or })} onSelect={onSelectTrainee} />
        </div>

        {/* Active athletes table — full width */}
        <div style={{ marginTop: 16, ...cellStyle, padding: 0 }}>
          <div style={{ padding: '10px 14px', borderBottom: `1px solid rgba(57,189,255,0.20)`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={labelStyle}>ALL ATHLETES</span>
            <span style={{ fontFamily: FN, fontSize: 9, color: '#FFFFFF80', letterSpacing: '0.12em' }}>{d.enriched.length} ROWS</span>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: FN, fontSize: 11 }}>
            <thead>
              <tr style={{ color: CYAN, letterSpacing: '0.12em' }}>
                {['ATHLETE', 'STATUS', 'FORMAT', 'PROG', 'SES', 'MO', 'PAID', 'LAST PAY'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '8px 14px', borderBottom: '1px solid rgba(57,189,255,0.20)', fontSize: 9, fontWeight: 700 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {d.enriched.filter(t => t.status !== 'Archived').slice(0, 14).map(t => (
                <tr key={t.id} onClick={() => onSelectTrainee && onSelectTrainee(t.id)} style={{ cursor: onSelectTrainee ? 'pointer' : 'default' }}>
                  <td style={{ padding: '8px 14px', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: 12, color: WHITE }}>{t.name}</td>
                  <td style={{ padding: '8px 14px', borderBottom: '1px solid rgba(255,255,255,0.05)', color: t.status === 'Active' ? C.gn : t.status === 'Inactive' ? '#FFFFFF66' : C.or }}>{t.status?.toUpperCase()}</td>
                  <td style={{ padding: '8px 14px', borderBottom: '1px solid rgba(255,255,255,0.05)', color: '#FFFFFF99' }}>{(t.format || '—').toUpperCase()}</td>
                  <td style={{ padding: '8px 14px', borderBottom: '1px solid rgba(255,255,255,0.05)', textAlign: 'right' }}>{t.planCount || '—'}</td>
                  <td style={{ padding: '8px 14px', borderBottom: '1px solid rgba(255,255,255,0.05)', textAlign: 'right' }}>{t.sessionsRemaining ?? '—'}</td>
                  <td style={{ padding: '8px 14px', borderBottom: '1px solid rgba(255,255,255,0.05)', textAlign: 'right', color: parseFloat(t.monthly) > 0 ? CYAN : '#FFFFFF66' }}>{parseFloat(t.monthly) ? `₪${parseFloat(t.monthly)}` : '—'}</td>
                  <td style={{ padding: '8px 14px', borderBottom: '1px solid rgba(255,255,255,0.05)', textAlign: 'right' }}>{t.totalPaid ? `₪${t.totalPaid}` : '—'}</td>
                  <td style={{ padding: '8px 14px', borderBottom: '1px solid rgba(255,255,255,0.05)', color: '#FFFFFF80' }}>{t.lastPay ? new Date(t.lastPay.date).toLocaleDateString('en-GB') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function DataTileC({ title, data, renderRow, onSelect }) {
  return (
    <div style={{ background: '#0F1419', border: '1px solid rgba(57,189,255,0.20)' }}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(57,189,255,0.20)', display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, color: CYAN, letterSpacing: '0.18em' }}>{title}</span>
        <span style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, color: WHITE, letterSpacing: '0.12em' }}>{data.length}</span>
      </div>
      <div style={{ maxHeight: 280, overflowY: 'auto' }}>
        {data.length === 0 ? (
          <div style={{ padding: '16px 14px', fontFamily: FN, fontSize: 10, color: '#FFFFFF66', letterSpacing: '0.1em' }}>NO MATCHES</div>
        ) : (
          data.map(t => {
            const r = renderRow(t);
            return (
              <div key={t.id} onClick={() => onSelect && onSelect(t.id)}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 14px', borderBottom: '1px solid rgba(255,255,255,0.05)', cursor: onSelect ? 'pointer' : 'default', fontFamily: FN }}>
                <span style={{ fontSize: 12, color: WHITE, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.left}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: r.color, letterSpacing: '0.04em', marginLeft: 8 }}>{r.right}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
