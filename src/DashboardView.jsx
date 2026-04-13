import React, { useState } from 'react';
import { C, FN, FB, EXPO_ICON } from './theme';
import { Badge, baseInput } from './ui';

export default function DashboardView({ trainees, plans, workouts, payments, onSelectTrainee }) {
  const [sort, setSort] = useState('name');
  const [dir, setDir] = useState(1);
  const [filter, setFilter] = useState('');

  const statusColor = { Active: C.gn, "On Hold": C.or, Inactive: C.td, Trial: C.ac };

  const enriched = trainees.map(t => {
    const tPay = payments.filter(p => p.traineeId === t.id);
    const tWork = workouts.filter(w => w.traineeId === t.id && w.status === 'completed');
    const tPlans = plans.filter(p => p.traineeId === t.id);
    const totalPaid = tPay.reduce((a, p) => a + (parseFloat(p.amount) || 0), 0);
    const lastPay = tPay.sort((a, b) => new Date(b.date) - new Date(a.date))[0];
    const lastWorkout = tWork.sort((a, b) => new Date(b.date) - new Date(a.date))[0];
    return { ...t, totalPaid, lastPay, lastWorkout, workoutCount: tWork.length, planCount: tPlans.length };
  });

  const filtered = enriched.filter(t => !filter || t.name.toLowerCase().includes(filter.toLowerCase()));
  const sorted = [...filtered].sort((a, b) => {
    if (sort === 'name') return a.name.localeCompare(b.name) * dir;
    if (sort === 'status') return a.status.localeCompare(b.status) * dir;
    if (sort === 'sessions') return ((a.sessionsRemaining || 0) - (b.sessionsRemaining || 0)) * dir;
    if (sort === 'paid') return (a.totalPaid - b.totalPaid) * dir;
    if (sort === 'lastPay') return ((a.lastPay ? new Date(a.lastPay.date).getTime() : 0) - (b.lastPay ? new Date(b.lastPay.date).getTime() : 0)) * dir;
    if (sort === 'workouts') return (a.workoutCount - b.workoutCount) * dir;
    return 0;
  });

  const toggleSort = (key) => { if (sort === key) setDir(d => d * -1); else { setSort(key); setDir(1); } };
  const SH = ({ k, label }) => (
    <th onClick={() => toggleSort(k)} style={{ textAlign: 'left', padding: '10px 12px', fontSize: 10, fontFamily: FN, color: sort === k ? C.ac : C.td, textTransform: 'uppercase', letterSpacing: '0.05em', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
      {label} {sort === k ? (dir === 1 ? '↑' : '↓') : ''}
    </th>
  );

  // Summary stats
  const active = trainees.filter(t => t.status === 'Active').length;
  const archivedCount = trainees.filter(t => t.status === 'Archived').length;
  const monthlyRate = trainees.filter(t=>t.status==='Active').reduce((a,t) => a + (parseFloat(t.monthly)||0), 0);
  const now = new Date();
  const thisMonthPaid = payments.filter(p => { const d=new Date(p.date); return d.getMonth()===now.getMonth() && d.getFullYear()===now.getFullYear() && p.status==='Paid'; }).reduce((a,p) => a + (parseFloat(p.amount)||0), 0);
  const totalAllPaid = payments.filter(p=>p.status==='Paid').reduce((a,p) => a + (parseFloat(p.amount)||0), 0);
  const lowSessions = enriched.filter(t => t.sessionsRemaining > 0 && t.sessionsRemaining <= 2).length;

  return (
    <div>
      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Active Clients', value: active, total: trainees.length, color: C.gn },
          { label: 'Monthly Rate', value: `₪${monthlyRate.toLocaleString()}/MO`, color: C.ac },
          { label: 'Paid This Month', value: thisMonthPaid>0?`₪${thisMonthPaid.toLocaleString()}`:'₪0', color: thisMonthPaid>0?C.gn:C.td },
          { label: 'Total Collected', value: totalAllPaid>0?`₪${totalAllPaid.toLocaleString()}`:'₪0', color: totalAllPaid>0?C.ac:C.td },
          { label: 'Total Workouts', value: enriched.reduce((a, t) => a + t.workoutCount, 0), color: C.pu },
          { label: 'Low Sessions', value: lowSessions, color: lowSessions > 0 ? C.or : C.gn },
        ].map((s, i) => (
          <div key={i} style={{ background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 10, padding: '16px 20px' }}>
            <div style={{ fontSize: 10, fontFamily: FN, color: C.td, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{s.label}</div>
            <div style={{ fontSize: 24, fontWeight: 700, fontFamily: FN, color: s.color }}>{s.value}
              {s.total !== undefined && <span style={{ fontSize: 13, color: C.td, fontWeight: 400 }}> / {s.total}</span>}</div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div style={{ marginBottom: 14 }}>
        <input placeholder="Filter clients..." value={filter} onChange={e => setFilter(e.target.value)}
          style={{ ...baseInput, maxWidth: 300, paddingLeft: 12 }} />
      </div>

      {/* Client table */}
      {sorted.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: C.td }}>No clients yet. Import your trainee list.</div>
      ) : (
        <div style={{ overflowX: 'auto', background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 10 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: FB, fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${C.bd}` }}>
                <SH k="name" label="Client" />
                <SH k="status" label="Status" />
                <th style={{ textAlign: 'left', padding: '10px 12px', fontSize: 10, fontFamily: FN, color: C.td, textTransform: 'uppercase' }}>Format</th>
                <th style={{ textAlign: 'left', padding: '10px 12px', fontSize: 10, fontFamily: FN, color: C.td, textTransform: 'uppercase' }}>Package</th>
                <SH k="sessions" label="Sessions" />
                <SH k="paid" label="Total Paid" />
                <SH k="lastPay" label="Last Payment" />
                <SH k="workouts" label="Workouts" />
                <th style={{ textAlign: 'left', padding: '10px 12px', fontSize: 10, fontFamily: FN, color: C.td, textTransform: 'uppercase' }}>Plans</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(t => (
                <tr key={t.id} onClick={() => onSelectTrainee(t.id)}
                  style={{ borderBottom: `1px solid ${C.bd}`, cursor: 'pointer', transition: 'background 0.1s' }}
                  onMouseEnter={e => e.currentTarget.style.background = C.sf2}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <td style={{ padding: '12px', fontWeight: 600, color: C.tx }}>{t.name}</td>
                  <td style={{ padding: '12px' }}><Badge color={statusColor[t.status] || C.td}>{t.status}</Badge></td>
                  <td style={{ padding: '12px', color: C.tm, fontSize: 12 }}>{t.format}</td>
                  <td style={{ padding: '12px', color: C.tm, fontSize: 12 }}>{t.package}{t.packagePrice ? ` · ₪${parseInt(t.packagePrice).toLocaleString()}` : ''}</td>
                  <td style={{ padding: '12px' }}>
                    {t.sessionsRemaining > 0 ? (
                      <span style={{ fontFamily: FN, fontWeight: 700, fontSize: 14, color: t.sessionsRemaining <= 2 ? C.rd : C.gn }}>{t.sessionsRemaining}</span>
                    ) : <span style={{ color: C.td, fontSize: 12 }}>—</span>}
                  </td>
                  <td style={{ padding: '12px', fontFamily: FN, fontWeight: 600, color: parseFloat(t.monthly) > 0 ? C.gn : C.td }}>
                    {parseFloat(t.monthly) > 0 ? `₪${parseInt(t.monthly).toLocaleString()}/MO` : '—'}
                  </td>
                  <td style={{ padding: '12px', color: C.tm, fontSize: 12 }}>
                    {t.lastPayment ? new Date(t.lastPayment).toLocaleDateString('he-IL') : '—'}
                  </td>
                  <td style={{ padding: '12px', fontFamily: FN, color: t.workoutCount > 0 ? C.ac : C.td }}>
                    {t.workoutCount || '—'}
                  </td>
                  <td style={{ padding: '12px', fontFamily: FN, color: t.planCount > 0 ? C.ac : C.td }}>
                    {t.planCount || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
