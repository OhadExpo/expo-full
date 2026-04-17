import React, { useState, useMemo } from 'react';
import { C, FN, FB, EXPO_ICON } from './theme';
import { Badge, baseInput } from './ui';

export default function DashboardView({ trainees, planCounts, workouts, payments, presence, onSelectTrainee }) {
  const [sort, setSort] = useState('name');
  const [dir, setDir] = useState(1);
  const [filter, setFilter] = useState('');

  const statusColor = { Active: C.gn, "On Hold": C.or, Inactive: C.td, Trial: C.ac };

  const enriched = useMemo(() => trainees.map(t => {
    const tPay = payments.filter(p => p.traineeId === t.id);
    const tWork = workouts.filter(w => w.traineeId === t.id && w.status === 'completed');
    const totalPaid = tPay.reduce((a, p) => a + (parseFloat(p.amount) || 0), 0);
    const lastPay = tPay.sort((a, b) => new Date(b.date) - new Date(a.date))[0];
    const lastWorkout = tWork.sort((a, b) => new Date(b.date) - new Date(a.date))[0];
    return { ...t, totalPaid, lastPay, lastWorkout, workoutCount: tWork.length, planCount: planCounts[t.id] || 0 };
  }), [trainees, payments, workouts, planCounts]);

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

  // Last month's income for comparison
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthPaid = payments.filter(p => { const d=new Date(p.date); return d.getMonth()===lastMonth.getMonth() && d.getFullYear()===lastMonth.getFullYear() && p.status==='Paid'; }).reduce((a,p) => a + (parseFloat(p.amount)||0), 0);
  const revDelta = lastMonthPaid > 0 ? Math.round(((thisMonthPaid - lastMonthPaid) / lastMonthPaid) * 100) : null;

  // Dropout risk: active clients who haven't trained in 14+ days
  const DROPOUT_DAYS = 14;
  const dropoutRisk = enriched.filter(t => {
    if (t.status !== 'Active') return false;
    if (!t.lastWorkout) return true; // never trained
    const daysSince = Math.floor((now - new Date(t.lastWorkout.date)) / 86400000);
    return daysSince >= DROPOUT_DAYS;
  });

  // Expiring packages: active with ≤2 sessions
  const expiring = enriched.filter(t => t.status === 'Active' && t.sessionsRemaining > 0 && t.sessionsRemaining <= 2);

  // Online now
  const ONLINE_MS = 2 * 60 * 1000;
  const onlineNow = enriched.filter(t => presence?.[t.id] && (now.getTime() - presence[t.id]) < ONLINE_MS);

  return (
    <div>
      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, marginBottom: 20 }}>
        {[
          { label: 'Active Clients', value: active, total: trainees.filter(t=>t.status!=='Archived').length, color: C.gn },
          { label: 'Online Now', value: onlineNow.length, color: onlineNow.length > 0 ? C.gn : C.td },
          { label: 'Low Sessions', value: lowSessions, color: lowSessions > 0 ? C.or : C.gn },
          { label: 'Dropout Risk', value: dropoutRisk.length, color: dropoutRisk.length > 0 ? C.rd : C.gn },
          { label: 'Estimated Monthly', value: `₪${monthlyRate.toLocaleString()}`, color: C.ac },
          { label: 'Collected This Month', value: `₪${thisMonthPaid.toLocaleString()}`, sub: revDelta !== null ? `${revDelta >= 0 ? '+' : ''}${revDelta}% vs last month` : null, subColor: revDelta >= 0 ? C.gn : C.rd, color: thisMonthPaid>0?C.gn:C.td },
        ].map((s, i) => (
          <div key={i} style={{ background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 10, padding: '14px 18px' }}>
            <div style={{ fontSize: 10, fontFamily: FN, color: C.td, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, fontFamily: FN, color: s.color }}>{s.value}
              {s.total !== undefined && <span style={{ fontSize: 12, color: C.td, fontWeight: 400 }}> / {s.total}</span>}</div>
            {s.sub && <div style={{ fontSize: 10, fontFamily: FN, color: s.subColor, marginTop: 4 }}>{s.sub}</div>}
          </div>
        ))}
      </div>

      {/* Alert sections */}
      {(onlineNow.length > 0 || expiring.length > 0 || dropoutRisk.length > 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12, marginBottom: 20 }}>
          {onlineNow.length > 0 && (
            <div style={{ background: C.sf, border: `1px solid ${C.gn}30`, borderRadius: 10, padding: '14px 18px' }}>
              <div style={{ fontSize: 10, fontFamily: FN, color: C.gn, textTransform: 'uppercase', marginBottom: 8 }}>🟢 Online Now</div>
              {onlineNow.map(t => (
                <div key={t.id} onClick={() => onSelectTrainee(t.id)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', cursor: 'pointer', color: C.tx, fontSize: 13 }}>
                  <span style={{display:'inline-block',width:6,height:6,borderRadius:'50%',background:C.gn,boxShadow:`0 0 4px ${C.gn}`}} />
                  {t.name}
                </div>
              ))}
            </div>
          )}
          {expiring.length > 0 && (
            <div style={{ background: C.sf, border: `1px solid ${C.or}30`, borderRadius: 10, padding: '14px 18px' }}>
              <div style={{ fontSize: 10, fontFamily: FN, color: C.or, textTransform: 'uppercase', marginBottom: 8 }}>⚠ Expiring Packages</div>
              {expiring.map(t => (
                <div key={t.id} onClick={() => onSelectTrainee(t.id)} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', cursor: 'pointer', fontSize: 13 }}>
                  <span style={{ color: C.tx }}>{t.name}</span>
                  <span style={{ fontFamily: FN, fontWeight: 700, color: C.rd, fontSize: 12 }}>{t.sessionsRemaining} LEFT</span>
                </div>
              ))}
            </div>
          )}
          {dropoutRisk.length > 0 && (
            <div style={{ background: C.sf, border: `1px solid ${C.rd}30`, borderRadius: 10, padding: '14px 18px' }}>
              <div style={{ fontSize: 10, fontFamily: FN, color: C.rd, textTransform: 'uppercase', marginBottom: 8 }}>🔻 Dropout Risk (14+ days)</div>
              {dropoutRisk.map(t => {
                const days = t.lastWorkout ? Math.floor((now - new Date(t.lastWorkout.date)) / 86400000) : '∞';
                return (
                  <div key={t.id} onClick={() => onSelectTrainee(t.id)} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', cursor: 'pointer', fontSize: 13 }}>
                    <span style={{ color: C.tx }}>{t.name}</span>
                    <span style={{ fontFamily: FN, color: C.rd, fontSize: 11 }}>{days === '∞' ? 'Never trained' : `${days}d ago`}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

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
                <th style={{ textAlign: 'left', padding: '10px 12px', fontSize: 10, fontFamily: FN, color: C.td, textTransform: 'uppercase' }}>Programs</th>
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

      {/* Payment summary */}
      {totalAllPaid>0&&<div style={{marginTop:24}}>
        <div style={{background:C.sf,border:`1px solid ${C.bd}`,borderRadius:10,padding:"14px 20px",maxWidth:300}}>
          <div style={{fontSize:10,fontFamily:FN,color:C.td,textTransform:"uppercase",marginBottom:4}}>Total Collected (All Time)</div>
          <div style={{fontSize:18,fontWeight:700,fontFamily:FN,color:C.ac}}>₪{totalAllPaid.toLocaleString()}</div>
        </div>
      </div>}
    </div>
  );
}
