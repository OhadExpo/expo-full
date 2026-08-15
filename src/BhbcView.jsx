// BhbcView.jsx — /coach/bhbc — Bnei Herzliya BC team S&C zone.
//
// A fully separate ZONE (no EXPO coach nav) entered from Athletes ▾ → BHBC.
// Staff-gated; players use the normal athlete portal. One home for the pro-
// basketball S&C operation: roster, per-athlete + team LOAD / ACWR / readiness.
//
// DESIGN: EXPO's rules (card/strip system, uniform 41px strips, Nord, sharp
// corners, stroke ruling, light/dark parity) recolored to the club palette by
// overriding the theme CSS tokens on the wrapper — navy #1E3D74 (structure),
// orange #F26A2B (accent, used sparingly), white. Palette sampled from the real
// crest (public/logos/bhbc-logo.png). Semantic ACWR band colors are status-only,
// never the brand. Load math: src/acwrEngine.js (validated vs the corpus).

import React, { useMemo, useState, useCallback, Suspense, lazy } from 'react';
import { C, FN, FB } from './theme';
import { Card, CollapsibleSection, Btn, Input, Modal, EmptyState, toast } from './ui';
import { ThemeToggle } from './ThemeToggle';
import { acwrFromDaily, sessionLoad } from './acwrEngine';
import { readinessAutoreg } from './readinessAutoreg';

// EXPO's own group/single session logger — reused INSIDE the BHBC portal, scoped
// to the BHBC roster. It writes to client_workouts (athlete-visible), so a BHBC
// session syncs to each player's portal + EXPO review, exactly like the main app.
const SessionsView = lazy(() => import('./SessionsView'));

const NAVY = '#1E3D74', NAVY_DEEP = '#14294F', ORANGE = '#F26A2B', ORANGE_DEEP = '#D9541A';
// Scoped theme override — reskins EXPO's components to BHBC while keeping their
// geometry + light/dark behaviour. Strips go navy (white title text stays legible)
// in both themes; card hairlines get a navy tint blended into the theme border.
const TOKENS = {
  '--c-ac': NAVY,
  '--c-stripBg': NAVY,
  '--c-cardBd': 'color-mix(in srgb, #1E3D74 42%, var(--c-bd))',
};
const BAND = { detrained: '#4F9DE0', low: '#37B27C', elevated: '#E0A73A', high: '#DE4E3B', none: '#7C828B' };

const todayISO = () => new Date().toISOString().slice(0, 10);
const daysAgoISO = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
const flag = (nat) => String(nat || '').split('/').map((c) => ({ USA: '🇺🇸', ISR: '🇮🇱' }[c.trim()] || '')).join('');
const heightM = (cm) => (cm ? (cm / 100).toFixed(2) + 'm' : '');
const emptyRec = () => ({ loads: {}, sessions: {}, readiness: {}, availability: {} });
// Availability codes (Ohad's BHBC sheet legend). Semantic status colors.
const AVAIL = {
  1: { label: 'Full', color: '#37B27C' },
  2: { label: 'Limited', color: '#E0A73A' },
  3: { label: 'Non-contact', color: '#4F9DE0' },
  4: { label: 'Out · Med', color: '#DE4E3B' },
  5: { label: 'Out · Personal', color: '#7C828B' },
};

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const parseISO = (iso) => new Date(String(iso) + 'T00:00:00');
const dow = (iso) => DOW[parseISO(iso).getDay()];
const monDay = (iso) => { const d = parseISO(iso); return `${d.getDate()} ${MON[d.getMonth()]}`; };
const dayDiff = (a, b) => Math.round((parseISO(a) - parseISO(b)) / 86400000);
const FX_COLOR = { game: ORANGE, practice: NAVY, lift: '#5A6B85' };
const FX_LABEL = { game: 'Game', practice: 'Practice', lift: 'Weights' };

// ---- primitives ----

function Sparkline({ series, w = 100, h = 26, color = ORANGE }) {
  const vals = (series || []).map((v) => v || 0);
  const n = vals.length; const max = Math.max(1, ...vals);
  if (!n) return <div style={{ width: w, height: h }} />;
  // No load yet → a faint baseline, not a solid line that reads as an error.
  if (!vals.some((v) => v > 0)) return (
    <svg width={w} height={h} style={{ display: 'block' }} aria-hidden="true">
      <line x1="0" y1={h - 3} x2={w} y2={h - 3} stroke="currentColor" strokeWidth="1" strokeDasharray="2 3" opacity="0.28" />
    </svg>
  );
  const step = n > 1 ? w / (n - 1) : 0;
  const pts = vals.map((v, i) => [i * step, h - (v / max) * (h - 4) - 2]);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const last = pts[n - 1];
  return (
    <svg width={w} height={h} style={{ display: 'block' }} aria-hidden="true">
      <path d={`${line} L${w},${h} L0,${h} Z`} fill={color} opacity="0.12" />
      <path d={line} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r="2.3" fill={color} />
    </svg>
  );
}

function BandPill({ band, value }) {
  const c = band.color;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: FN, fontSize: 11, fontWeight: 700,
      letterSpacing: '0.03em', color: c, background: `color-mix(in srgb, ${c} 13%, transparent)`,
      border: `1px solid color-mix(in srgb, ${c} 38%, transparent)`, borderRadius: 0, padding: '3px 8px', whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: c, flexShrink: 0 }} />
      {value != null && <span style={{ fontVariantNumeric: 'tabular-nums' }}>{value}</span>}
      {band.label}
    </span>
  );
}

const Jersey = ({ n, size = 30 }) => (
  <span style={{
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: size, height: size,
    background: NAVY, color: '#fff', fontFamily: FN, fontWeight: 800, fontSize: size * 0.42,
    fontVariantNumeric: 'tabular-nums', flexShrink: 0,
  }}>{n ?? '–'}</span>
);

// ---- component ----

export default function BhbcView({ trainees = [], setTrainees, bhbcLoads = {}, setBhbcLoads, bhbcFixtures = [], planIndex = [], exercises = [], clientWorkouts = [], setClientWorkouts, workouts = [], setWorkouts, onDecrementSession, onOpenTrainee, onExit }) {
  const [manageOpen, setManageOpen] = useState(false);
  const [logFor, setLogFor] = useState(null);
  const [detailFor, setDetailFor] = useState(null);
  const [view, setView] = useState('overview');   // overview | schedule | roster
  const [schedMode, setSchedMode] = useState('calendar'); // calendar | list
  const [sessionMode, setSessionMode] = useState('group'); // group | single

  const roster = useMemo(
    () => trainees.filter((t) => t && t.team === 'BHBC' && t.status !== 'Archived')
      .sort((a, b) => (a.jersey ?? 999) - (b.jersey ?? 999)),
    [trainees]
  );
  const today = todayISO();
  const last14 = useMemo(() => Array.from({ length: 14 }, (_, i) => daysAgoISO(13 - i)), []);
  const last28 = useMemo(() => Array.from({ length: 28 }, (_, i) => daysAgoISO(27 - i)), []);

  const rows = useMemo(() => roster.map((t) => {
    const rec = bhbcLoads[t.id] || emptyRec();
    const acwr = acwrFromDaily(rec.loads || {}, today);
    const series = last14.map((d) => (rec.loads && rec.loads[d]) || 0);
    const rdates = Object.keys(rec.readiness || {}).sort();
    const readiness = readinessAutoreg((rdates.length ? rec.readiness[rdates[rdates.length - 1]] : null) || {});
    const avail = (rec.availability && rec.availability[today]) || 1;
    return { t, acwr, series, readiness, avail };
  }), [roster, bhbcLoads, today, last14]);

  const team = useMemo(() => {
    const wr = rows.filter((r) => r.acwr.ratio != null);
    return {
      n: rows.length,
      avg: wr.length ? wr.reduce((s, r) => s + r.acwr.ratio, 0) / wr.length : null,
      flagged: rows.filter((r) => ['high', 'elevated'].includes(r.acwr.band.key)).length,
      week: Math.round(rows.reduce((s, r) => s + (r.acwr.acute || 0), 0)),
      teamSeries: last14.map((d) => roster.reduce((s, t) => s + ((bhbcLoads[t.id]?.loads?.[d]) || 0), 0)),
    };
  }, [rows, roster, bhbcLoads, last14]);

  const fx = useMemo(() => {
    const items = (bhbcFixtures || []).slice().sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
    const upcoming = items.filter((f) => f.date >= today);
    const nextGame = upcoming.find((f) => f.type === 'game') || null;
    const byDay = [];
    for (const f of upcoming) {
      let g = byDay.find((d) => d.date === f.date);
      if (!g) { g = { date: f.date, items: [] }; byDay.push(g); }
      g.items.push(f);
    }
    return { byDay: byDay.slice(0, 8), nextGame };
  }, [bhbcFixtures, today]);

  const setTeam = useCallback((id, on) => {
    setTrainees((prev) => prev.map((t) => t.id === id ? { ...t, team: on ? 'BHBC' : undefined } : t));
  }, [setTrainees]);

  const cycleAvail = useCallback((id, current) => {
    setBhbcLoads((prev) => {
      const rec = prev[id] ? { ...prev[id] } : emptyRec();
      rec.availability = { ...(rec.availability || {}), [today]: (current % 5) + 1 };
      return { ...prev, [id]: rec };
    });
  }, [setBhbcLoads, today]);

  const logSession = useCallback(({ athleteId, date, type, minutes, rpe, readiness }) => {
    const load = sessionLoad(minutes, rpe);
    setBhbcLoads((prev) => {
      const rec = prev[athleteId] ? { ...prev[athleteId] } : emptyRec();
      rec.loads = { ...(rec.loads || {}) }; rec.sessions = { ...(rec.sessions || {}) }; rec.readiness = { ...(rec.readiness || {}) };
      if (load > 0) {
        rec.loads[date] = (rec.loads[date] || 0) + load;
        rec.sessions[date] = [...(rec.sessions[date] || []), { type, min: Number(minutes) || 0, rpe: Number(rpe) || 0, load }];
      }
      const r = readiness || {};
      if (r.pain || r.sleep || r.energy) rec.readiness[date] = { ...(rec.readiness[date] || {}), ...r };
      return { ...prev, [athleteId]: rec };
    });
    toast('Logged');
  }, [setBhbcLoads]);

  const rowGrid = '28px minmax(116px,1.5fr) 112px 46px 130px minmax(104px,1.1fr) 92px';

  return (
    <div style={{ ...TOKENS, minHeight: '100vh', background: 'var(--c-bg)', color: C.tx, fontFamily: FB }}>
      {/* ---- ZONE TOP BAR ---- */}
      <header style={{ position: 'sticky', top: 0, zIndex: 50, background: NAVY, borderBottom: `2px solid ${ORANGE}` }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px', height: 62, display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: '#fff', padding: '5px 7px', flexShrink: 0 }}>
            <img src="/logos/bhbc-logo.png" alt="Bnei Herzliya BC" style={{ height: 36, width: 'auto', display: 'block' }} />
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: FN, fontWeight: 800, fontSize: 16, color: '#fff', letterSpacing: '0.03em', lineHeight: 1 }}>BNEI HERZLIYA</div>
            <div style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: ORANGE, marginTop: 5 }}>S&amp;C · 2026/27</div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
            <ThemeToggle size={30} />
            {onExit && <button onClick={onExit} title="Back to EXPO coach" style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#fff', background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.28)', borderRadius: 0, padding: '7px 12px', cursor: 'pointer' }}>‹ EXPO</button>}
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 24px 72px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* ---- TOOLBAR ---- */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: C.td }}>Squad · {roster.length}</div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Btn variant="ghost" onClick={() => setManageOpen(true)}>Manage roster</Btn>
            <Btn onClick={() => setLogFor('new')} style={{ background: ORANGE, borderColor: ORANGE, color: '#fff' }}>+ Log session</Btn>
          </div>
        </div>

        {roster.length === 0 ? (
          <Card header="Roster">
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '28px 16px' }}>
              <img src="/logos/bhbc-logo.png" alt="" style={{ height: 68, opacity: 0.9, marginBottom: 8 }} />
              <div style={{ fontFamily: FN, fontWeight: 700, fontSize: 15, color: C.tx }}>No athletes on the roster yet</div>
              <div style={{ fontFamily: FB, fontSize: 13, color: C.td, marginBottom: 14, textAlign: 'center', maxWidth: 320 }}>Add the squad to start tracking load, availability and readiness.</div>
              <Btn onClick={() => setManageOpen(true)} style={{ background: ORANGE, borderColor: ORANGE, color: '#fff' }}>Add athletes</Btn>
            </div>
          </Card>
        ) : (
          <>
            {/* ---- SUB-NAV (tool tabs) — gives the zone "order" ---- */}
            <div style={{ display: 'flex', gap: 2, borderBottom: `1px solid ${C.cardBd}`, flexWrap: 'wrap' }}>
              {[['overview', 'Overview'], ['schedule', 'Schedule'], ['sessions', 'Sessions'], ['roster', 'Roster']].map(([k, label]) => {
                const active = view === k;
                return (
                  <button key={k} onClick={() => setView(k)} style={{ fontFamily: FN, fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: active ? C.tx : C.td, background: 'transparent', border: 'none', borderBottom: active ? `2px solid ${ORANGE}` : '2px solid transparent', padding: '10px 16px', marginBottom: -1, cursor: 'pointer' }}>{label}</button>
                );
              })}
            </div>

            {view === 'overview' && (
              <>
                <TodayPanel today={today} fixtures={bhbcFixtures} fx={fx} rows={rows} onSessions={() => setView('sessions')} onLog={() => setLogFor('new')} />
                <TeamSnapshotCard team={team} />
                <LoadBoard rows={rows} rowGrid={rowGrid} cycleAvail={cycleAvail} onOpen={setDetailFor} />
              </>
            )}

            {view === 'schedule' && (
              <ScheduleTool fx={fx} fixtures={bhbcFixtures} today={today} mode={schedMode} setMode={setSchedMode} onLog={() => setLogFor('new')} />
            )}

            {view === 'roster' && (
              <RosterGrid rows={rows} onOpen={setDetailFor} />
            )}

            {view === 'sessions' && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ display: 'inline-flex', border: `1px solid ${C.cardBd}` }}>
                    {[['group', 'Group'], ['single', 'Single']].map(([k, l]) => (
                      <button key={k} onClick={() => setSessionMode(k)} style={{ fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: sessionMode === k ? '#fff' : C.td, background: sessionMode === k ? NAVY : 'transparent', border: 'none', padding: '7px 16px', cursor: 'pointer' }}>{l}</button>
                    ))}
                  </div>
                  <span style={{ fontFamily: FB, fontSize: 11.5, color: C.td }}>Logs each athlete's work to their history &amp; portal — synced with EXPO.</span>
                </div>
                <Suspense fallback={<div style={{ padding: 24, textAlign: 'center', color: C.td, fontFamily: FB }}>Loading session logger…</div>}>
                  <SessionsView mode={sessionMode} trainees={roster} planIndex={planIndex} exercises={exercises} clientWorkouts={clientWorkouts} setClientWorkouts={setClientWorkouts} workouts={workouts} setWorkouts={setWorkouts} onDecrementSession={onDecrementSession} />
                </Suspense>
              </>
            )}

          </>
        )}
      </main>

      <style>{`
        .bhbc-row{transition:background 120ms}
        .bhbc-row:hover{background:color-mix(in srgb, ${NAVY} 6%, transparent)}
        .bhbc-card:hover{transform:translateY(-2px);box-shadow:0 6px 18px rgba(6,16,37,0.14)}
      `}</style>

      {/* ---- MANAGE ROSTER MODAL ---- */}
      <Modal open={manageOpen} onClose={() => setManageOpen(false)} title="Manage roster">
        <div style={{ fontFamily: FB, fontSize: 12.5, color: C.td, marginBottom: 12 }}>
          Tag athletes into Bnei Herzliya. They keep their normal athlete portal — this scopes who appears in the <span style={{ fontFamily: FN, color: NAVY, fontWeight: 700 }}>BHBC</span> zone.
        </div>
        <div style={{ maxHeight: 360, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {trainees.filter((t) => t.status !== 'Archived').sort((a, b) => (b.team === 'BHBC' ? 1 : 0) - (a.team === 'BHBC' ? 1 : 0)).map((t) => {
            const on = t.team === 'BHBC';
            return (
              <label key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', border: `0.25px solid ${C.cardBd}`, borderLeft: on ? `3px solid ${ORANGE}` : '3px solid transparent', background: on ? `color-mix(in srgb, ${NAVY} 6%, transparent)` : 'transparent', cursor: 'pointer' }}>
                <input type="checkbox" checked={on} onChange={(e) => setTeam(t.id, e.target.checked)} style={{ accentColor: NAVY, width: 16, height: 16 }} />
                {on && t.jersey != null && <Jersey n={t.jersey} size={22} />}
                <span style={{ fontFamily: FN, fontSize: 13, fontWeight: on ? 700 : 500, color: C.tx }}>{t.name}</span>
                {on && t.position && <span style={{ fontFamily: FB, fontSize: 11, color: C.td, marginLeft: 'auto' }}>{t.position}</span>}
              </label>
            );
          })}
        </div>
      </Modal>

      {/* ---- LOG SESSION MODAL ---- */}
      {logFor && (
        <LogModal open={!!logFor} initialAthlete={logFor === 'new' ? (roster[0]?.id || '') : logFor} roster={roster} fixtures={bhbcFixtures}
          onClose={() => setLogFor(null)} onSave={(payload) => { logSession(payload); setLogFor(null); }} />
      )}

      {/* ---- ATHLETE DETAIL (in-zone) ---- */}
      {detailFor && (() => {
        const row = rows.find((r) => r.t.id === detailFor);
        if (!row) return null;
        return <AthleteModal row={row} rec={bhbcLoads[detailFor]} days28={last28}
          onClose={() => setDetailFor(null)}
          onLog={() => { setLogFor(detailFor); setDetailFor(null); }}
          onOpenExpo={onOpenTrainee ? () => onOpenTrainee(detailFor) : null}
          onCycleAvail={() => cycleAvail(detailFor, row.avail)} />;
      })()}
    </div>
  );
}

function BarChart({ series, w = 460, h = 88 }) {
  const vals = (series || []).map((v) => v || 0);
  const n = vals.length || 1;
  const max = Math.max(1, ...vals);
  const bw = w / n;
  const hasData = vals.some((v) => v > 0);
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: 'block', height: 88 }} aria-hidden="true">
      <line x1="0" y1={h - 1} x2={w} y2={h - 1} stroke="currentColor" opacity="0.16" />
      {!hasData && <line x1="0" y1={h - 3} x2={w} y2={h - 3} stroke="currentColor" strokeDasharray="3 4" opacity="0.3" />}
      {vals.map((v, i) => { const bh = hasData ? (v / max) * (h - 6) : 0; return <rect key={i} x={i * bw + 1} y={h - bh - 1} width={Math.max(1, bw - 2)} height={bh} fill={ORANGE} opacity={v > 0 ? 0.9 : 0} />; })}
    </svg>
  );
}

function AthleteModal({ row, rec, days28, onClose, onLog, onOpenExpo, onCycleAvail }) {
  const { t, acwr, avail, readiness } = row;
  const loads = (rec && rec.loads) || {};
  const series28 = days28.map((d) => loads[d] || 0);
  const rc = readiness.level === 'red' ? '#DE4E3B' : readiness.level === 'amber' ? '#E0A73A' : readiness.level === 'green' ? '#37B27C' : '#7C828B';
  const av = AVAIL[avail];
  const sessions = rec && rec.sessions ? Object.entries(rec.sessions).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 6) : [];
  return (
    <Modal open onClose={onClose} wide title={`#${t.jersey ?? '—'} · ${t.name}`}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: FB, fontSize: 12.5, color: C.td }}>{t.position || '—'} · {heightM(t.heightCm)} {flag(t.nationality)}</span>
          <button onClick={onCycleAvail} title="Click to change availability" style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: FN, fontSize: 11, fontWeight: 700, color: av.color, background: `color-mix(in srgb, ${av.color} 13%, transparent)`, border: `1px solid color-mix(in srgb, ${av.color} 38%, transparent)`, padding: '4px 10px', cursor: 'pointer' }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: av.color }} />{av.label}</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 1, background: C.cardBd, border: `1px solid ${C.cardBd}` }}>
          {[['ACWR', acwr.ratio != null ? acwr.ratio.toFixed(2) : '—', acwr.ratio != null ? acwr.band.color : C.tx], ['7-day load', acwr.acute ? Math.round(acwr.acute) : '—', C.tx], ['28-day', acwr.chronic ? Math.round(acwr.chronic) : '—', C.td]].map(([k, v, c]) => (
            <div key={k} style={{ background: 'var(--c-sf)', padding: '12px 14px' }}>
              <div style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.tm }}>{k}</div>
              <div style={{ fontFamily: FN, fontWeight: 800, fontSize: 22, color: c, marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>{v}</div>
            </div>
          ))}
        </div>
        <div>
          <div style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.tm, marginBottom: 6 }}>28-day load</div>
          <div style={{ color: ORANGE }}><BarChart series={series28} /></div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: rc, flexShrink: 0 }} />
          <span style={{ fontFamily: FB, fontSize: 12.5, color: C.td }}>{readiness.level === 'unknown' ? 'No readiness check-in logged' : readiness.headline}</span>
        </div>
        {sessions.length > 0 && (
          <div>
            <div style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.tm, marginBottom: 6 }}>Recent sessions</div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {sessions.map(([d, arr]) => (
                <div key={d} style={{ display: 'flex', gap: 10, padding: '7px 0', borderBottom: `0.25px solid ${C.cardBd}`, fontFamily: FN, fontSize: 12 }}>
                  <span style={{ color: C.td, width: 52, fontVariantNumeric: 'tabular-nums' }}>{d.slice(5)}</span>
                  <span style={{ color: C.tx, minWidth: 0 }}>{arr.map((s) => `${s.type} ${s.min}′@${s.rpe}`).join(' · ')}</span>
                  <span style={{ marginLeft: 'auto', color: ORANGE_DEEP, fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{Math.round(loads[d] || 0)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          {onOpenExpo && <Btn variant="ghost" onClick={onOpenExpo}>Open full profile in EXPO ›</Btn>}
          <Btn onClick={onLog} style={{ background: NAVY, borderColor: NAVY, color: '#fff' }}>Log session</Btn>
        </div>
      </div>
    </Modal>
  );
}

// band helpers (mirror acwrEngine bands for the snapshot tile)
function bandKey(r) { if (r == null) return 'none'; if (r < 0.8) return 'detrained'; if (r <= 1.3) return 'low'; if (r < 1.5) return 'elevated'; return 'high'; }
function acwrLabel(r) { return { detrained: 'undertrained', low: 'sweet spot', elevated: 'elevated', high: 'danger', none: '' }[bandKey(r)]; }

function TodayPanel({ today, fixtures, fx, rows, onSessions, onLog }) {
  const todayFx = (fixtures || []).filter((f) => f.date === today).slice().sort((a, b) => a.start.localeCompare(b.start));
  const next = fx.byDay[0];
  const av = { full: 0, mod: 0, out: 0 };
  rows.forEach((r) => { if (r.avail <= 1) av.full++; else if (r.avail <= 3) av.mod++; else av.out++; });
  const gd = fx.nextGame ? dayDiff(today, fx.nextGame.date) : null;
  const gdLabel = gd == null ? null : gd === 0 ? 'GAME DAY' : gd < 0 ? `${-gd} day${gd === -1 ? '' : 's'} to game` : null;
  const chip = (f, i) => (
    <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, border: `1px solid ${C.cardBd}`, borderLeft: `3px solid ${FX_COLOR[f.type] || NAVY}`, padding: '6px 11px', background: 'var(--c-sf)' }}>
      <span style={{ fontFamily: FN, fontSize: 12, color: C.tx, fontVariantNumeric: 'tabular-nums' }}>{f.start}</span>
      <span style={{ fontFamily: FN, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: FX_COLOR[f.type] || NAVY }}>{FX_LABEL[f.type] || 'Session'}</span>
      <span style={{ fontFamily: FN, fontSize: 10, color: C.td }}>{f.minutes}′</span>
    </span>
  );
  return (
    <Card header={`Today · ${dow(today)} ${monDay(today)}`} headerRight={gdLabel ? <span style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#fff' }}>{gdLabel}</span> : null}>
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ flex: '2 1 300px', minWidth: 240 }}>
          <div style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.tm, marginBottom: 8 }}>Sessions</div>
          {todayFx.length ? (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{todayFx.map(chip)}</div>
          ) : next ? (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontFamily: FB, fontSize: 12.5, color: C.td }}>None today · next {dow(next.date)} {monDay(next.date)}</span>
              {next.items.slice(0, 3).map(chip)}
            </div>
          ) : <span style={{ fontFamily: FB, fontSize: 12.5, color: C.td }}>No sessions scheduled.</span>}
        </div>
        <div style={{ flex: '1 1 150px' }}>
          <div style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.tm, marginBottom: 8 }}>Availability</div>
          <div style={{ display: 'flex', gap: 16, fontFamily: FN }}>
            {[['#37B27C', av.full, 'available'], ['#E0A73A', av.mod, 'limited'], ['#DE4E3B', av.out, 'out']].map(([c, n, l]) => (
              <div key={l} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <span style={{ fontSize: 22, fontWeight: 800, color: n ? c : C.td, fontVariantNumeric: 'tabular-nums' }}>{n}</span>
                <span style={{ fontSize: 9, color: C.td, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{l}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Btn onClick={onSessions} style={{ background: NAVY, borderColor: NAVY, color: '#fff' }}>Start session ›</Btn>
          <Btn variant="ghost" onClick={onLog}>Quick log</Btn>
        </div>
      </div>
    </Card>
  );
}

function TeamSnapshotCard({ team }) {
  const cells = [
    { k: 'Squad', v: team.n, sub: 'athletes', c: C.tx },
    { k: 'Avg ACWR', v: team.avg != null ? team.avg.toFixed(2) : '—', sub: team.avg != null ? acwrLabel(team.avg) : 'no load logged', c: team.avg != null ? BAND[bandKey(team.avg)] : C.tx },
    { k: 'Flagged', v: team.flagged, sub: 'elevated / danger', c: team.flagged ? BAND.high : C.tx },
    { k: '7-day load', v: team.week ? team.week.toLocaleString() : '—', sub: 'team sRPE', c: C.tx, spark: team.teamSeries },
  ];
  return (
    <Card header="Team Snapshot" padding={0}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        {cells.map((s, i) => (
          <div key={s.k} style={{ padding: '16px 18px', borderLeft: i ? `1px solid ${C.cardBd}` : 'none', display: 'flex', flexDirection: 'column', gap: 8, minHeight: 92 }}>
            <div style={{ fontFamily: FN, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.tm }}>{s.k}</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ fontFamily: FN, fontWeight: 800, fontSize: 28, lineHeight: 1, color: s.c, fontVariantNumeric: 'tabular-nums' }}>{s.v}</div>
              {s.spark && <Sparkline series={s.spark} w={72} h={26} />}
            </div>
            <div style={{ fontFamily: FB, fontSize: 11, color: C.td }}>{s.sub}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function LoadBoard({ rows, rowGrid, cycleAvail, onOpen }) {
  return (
    <CollapsibleSection title="Load & Injury Risk" count={rows.length} storageKey="bhbc-load" defaultOpen leftStripe={ORANGE}>
      <div style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: 660 }}>
          <div style={{ display: 'grid', gridTemplateColumns: rowGrid, gap: 12, padding: '2px 2px 10px', fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.13em', textTransform: 'uppercase', color: C.tm, borderBottom: `1px solid ${C.cardBd}` }}>
            <div>#</div><div>Athlete</div><div>ACWR</div><div>7d</div><div>Availability</div><div>Readiness</div><div style={{ textAlign: 'right' }}>14-day</div>
          </div>
          {rows.map(({ t, acwr, series, readiness, avail }) => {
            const rc = readiness.level === 'red' ? BAND.high : readiness.level === 'amber' ? BAND.elevated : readiness.level === 'green' ? BAND.low : BAND.none;
            return (
              <div key={t.id} onClick={() => onOpen(t.id)} style={{ display: 'grid', gridTemplateColumns: rowGrid, gap: 12, alignItems: 'center', padding: '11px 2px', borderBottom: `0.25px solid ${C.cardBd}`, borderLeft: `2px solid ${acwr.band.color}`, paddingLeft: 10, marginLeft: -12, cursor: 'pointer' }} className="bhbc-row">
                <Jersey n={t.jersey} size={26} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: FN, fontWeight: 700, fontSize: 13.5, color: C.tx, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</div>
                  <div style={{ fontFamily: FB, fontSize: 10.5, color: C.td }}>{t.position || '—'}</div>
                </div>
                <div>{acwr.ratio != null ? <BandPill band={acwr.band} value={acwr.ratio.toFixed(2)} /> : <span style={{ fontFamily: FN, fontSize: 10.5, color: C.tm, letterSpacing: '0.06em' }}>· baseline</span>}</div>
                <div style={{ fontFamily: FN, fontSize: 13, color: C.tx, fontVariantNumeric: 'tabular-nums' }}>{acwr.acute ? Math.round(acwr.acute) : '—'}</div>
                <div>
                  <button onClick={(e) => { e.stopPropagation(); cycleAvail(t.id, avail); }} title="Click to change availability" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: FN, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.03em', color: AVAIL[avail].color, background: `color-mix(in srgb, ${AVAIL[avail].color} 13%, transparent)`, border: `1px solid color-mix(in srgb, ${AVAIL[avail].color} 38%, transparent)`, borderRadius: 0, padding: '4px 9px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: AVAIL[avail].color, flexShrink: 0 }} />{AVAIL[avail].label}
                  </button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: rc, flexShrink: 0 }} />
                  <span style={{ fontFamily: FB, fontSize: 11, color: C.td, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{readiness.level === 'unknown' ? 'no check-in' : readiness.headline}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}><Sparkline series={series} /></div>
              </div>
            );
          })}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.cardBd}`, fontFamily: FN, fontSize: 9.5, color: C.td }}>
        {[[BAND.low, '0.8–1.3 sweet spot'], [BAND.elevated, '>1.3 elevated'], [BAND.high, '≥1.5 danger'], [BAND.detrained, '<0.8 undertrained']].map(([c, l]) => (
          <span key={l} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, letterSpacing: '0.04em' }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: c }} />{l}</span>
        ))}
        <span style={{ marginLeft: 'auto', color: C.tm }}>ACWR = 7-day ÷ 28-day sRPE · Gabbett 2016</span>
      </div>
    </CollapsibleSection>
  );
}

function RosterGrid({ rows, onOpen }) {
  return (
    <CollapsibleSection title="Roster" count={rows.length} storageKey="bhbc-roster" defaultOpen leftStripe={NAVY}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(232px, 1fr))', gap: 12 }}>
        {rows.map(({ t, acwr }) => (
          <div key={t.id} onClick={() => onOpen(t.id)} className="bhbc-card" style={{ position: 'relative', overflow: 'hidden', background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderLeft: `3px solid ${acwr.band.color}`, padding: '13px 15px', cursor: 'pointer', transition: 'transform 160ms, box-shadow 160ms' }}>
            <div aria-hidden="true" style={{ position: 'absolute', right: 10, top: 8, fontFamily: FN, fontWeight: 800, fontSize: 42, lineHeight: 1, color: NAVY, opacity: 0.08, fontVariantNumeric: 'tabular-nums' }}>{t.jersey ?? ''}</div>
            <div style={{ position: 'relative' }}>
              <div style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', color: ORANGE_DEEP, fontVariantNumeric: 'tabular-nums' }}>#{t.jersey ?? '—'}</div>
              <div style={{ fontFamily: FN, fontWeight: 700, fontSize: 15, color: C.tx, marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</div>
              <div style={{ fontFamily: FB, fontSize: 11, color: C.td, marginTop: 4 }}>{t.position || '—'}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, paddingTop: 10, borderTop: `0.25px solid ${C.cardBd}` }}>
                <span style={{ fontFamily: FN, fontSize: 11, color: C.tm, fontVariantNumeric: 'tabular-nums' }}>{heightM(t.heightCm)}</span>
                <span style={{ fontSize: 12 }}>{flag(t.nationality)}</span>
                <span style={{ marginLeft: 'auto' }}>{acwr.ratio != null ? <BandPill band={acwr.band} value={acwr.ratio.toFixed(2)} /> : <span style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.tm }}>baseline</span>}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </CollapsibleSection>
  );
}

function ScheduleTool({ fx, fixtures, today, mode, setMode }) {
  const toggle = (
    <div style={{ display: 'inline-flex', border: '1px solid rgba(255,255,255,0.32)' }}>
      {[['calendar', 'Calendar'], ['list', 'List']].map(([k, l]) => (
        <button key={k} onClick={() => setMode(k)} style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: mode === k ? NAVY : '#fff', background: mode === k ? '#fff' : 'transparent', border: 'none', padding: '5px 12px', cursor: 'pointer' }}>{l}</button>
      ))}
    </div>
  );
  return (
    <Card header="Schedule" headerRight={toggle}>
      {mode === 'calendar' ? <ScheduleMonth fixtures={fixtures} today={today} /> : <ScheduleList fx={fx} today={today} />}
    </Card>
  );
}

function ScheduleList({ fx, today }) {
  if (!fx.byDay.length) return <div style={{ fontFamily: FB, fontSize: 13, color: C.td, padding: '20px 0', textAlign: 'center' }}>No upcoming sessions.</div>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {fx.byDay.map((d) => {
        const isToday = d.date === today;
        const gd = fx.nextGame ? dayDiff(d.date, fx.nextGame.date) : null;
        const gdLabel = gd == null ? null : gd === 0 ? 'GAME DAY' : gd < 0 ? `GD${gd}` : `GD+${gd}`;
        return (
          <div key={d.date} style={{ display: 'flex', gap: 14, padding: '12px 2px', borderBottom: `0.25px solid ${C.cardBd}`, alignItems: 'flex-start' }}>
            <div style={{ width: 84, flexShrink: 0 }}>
              <div style={{ fontFamily: FN, fontWeight: 800, fontSize: 13, color: isToday ? ORANGE_DEEP : C.tx }}>{dow(d.date)}{isToday ? ' · today' : ''}</div>
              <div style={{ fontFamily: FN, fontSize: 11, color: C.td, marginTop: 2 }}>{monDay(d.date)}</div>
              {gdLabel && <div style={{ marginTop: 6, display: 'inline-block', fontFamily: FN, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.08em', color: gd === 0 ? '#fff' : C.tm, background: gd === 0 ? ORANGE : 'transparent', border: gd === 0 ? 'none' : `1px solid ${C.cardBd}`, padding: '2px 6px' }}>{gdLabel}</div>}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', flex: 1 }}>
              {d.items.map((f, i) => (
                <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 9, border: `1px solid ${C.cardBd}`, borderLeft: `3px solid ${FX_COLOR[f.type] || NAVY}`, padding: '6px 11px', background: 'var(--c-sf)' }}>
                  <span style={{ fontFamily: FN, fontSize: 12, color: C.tx, fontVariantNumeric: 'tabular-nums' }}>{f.start}</span>
                  <span style={{ fontFamily: FN, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: FX_COLOR[f.type] || NAVY }}>{FX_LABEL[f.type] || 'Session'}</span>
                  <span style={{ fontFamily: FN, fontSize: 10, color: C.td, fontVariantNumeric: 'tabular-nums' }}>{f.minutes}′</span>
                  {f.location && <span style={{ fontFamily: FB, fontSize: 10, color: C.tm }}>· {f.location}</span>}
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ScheduleMonth({ fixtures, today }) {
  const anchor = parseISO(today);
  const y = anchor.getFullYear(), m = anchor.getMonth();
  const first = new Date(y, m, 1);
  const gridStart = new Date(y, m, 1 - first.getDay());
  const isoOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const byDate = {};
  for (const f of fixtures || []) { (byDate[f.date] = byDate[f.date] || []).push(f); }
  const weeks = [];
  for (let w = 0; w < 6; w++) {
    const row = [];
    for (let d = 0; d < 7; d++) { const dt = new Date(gridStart); dt.setDate(gridStart.getDate() + w * 7 + d); row.push(dt); }
    weeks.push(row);
  }
  const cell = (dt) => {
    const di = isoOf(dt);
    const inMonth = dt.getMonth() === m;
    const isToday = di === today;
    const items = (byDate[di] || []).slice().sort((a, b) => a.start.localeCompare(b.start));
    return (
      <div key={di} style={{ minHeight: 94, border: `0.5px solid ${C.cardBd}`, padding: '6px 7px', background: isToday ? `color-mix(in srgb, ${ORANGE} 9%, var(--c-sf))` : 'var(--c-sf)', opacity: inMonth ? 1 : 0.38, display: 'flex', flexDirection: 'column', gap: 3, overflow: 'hidden' }}>
        <div style={{ fontFamily: FN, fontSize: 11, fontWeight: isToday ? 800 : 600, color: isToday ? ORANGE_DEEP : C.td, fontVariantNumeric: 'tabular-nums' }}>{dt.getDate()}</div>
        {items.slice(0, 4).map((f, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, fontFamily: FN, fontSize: 9.5, minWidth: 0 }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: FX_COLOR[f.type] || NAVY, flexShrink: 0 }} />
            <span style={{ color: C.tm, fontVariantNumeric: 'tabular-nums' }}>{f.start}</span>
            <span style={{ color: C.tx, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{FX_LABEL[f.type] || 'Session'}</span>
          </div>
        ))}
        {items.length > 4 && <div style={{ fontFamily: FN, fontSize: 9, color: C.td }}>+{items.length - 4} more</div>}
      </div>
    );
  };
  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ minWidth: 620 }}>
        <div style={{ fontFamily: FN, fontWeight: 800, fontSize: 14, color: C.tx, marginBottom: 8, letterSpacing: '0.02em' }}>{MON[m]} {y}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 4 }}>
          {DOW.map((d) => <div key={d} style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.tm, textAlign: 'center', padding: '4px 0' }}>{d}</div>)}
        </div>
        {weeks.map((week, i) => <div key={i} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>{week.map(cell)}</div>)}
      </div>
    </div>
  );
}

function LogModal({ open, initialAthlete, roster, fixtures = [], onClose, onSave }) {
  const [athleteId, setAthleteId] = useState(initialAthlete);
  const [date, setDate] = useState(todayISO());
  const [type, setType] = useState('Practice');
  const [minutes, setMinutes] = useState('');
  const [rpe, setRpe] = useState('');
  const [pain, setPain] = useState(''); const [sleep, setSleep] = useState(''); const [energy, setEnergy] = useState('');
  const preview = sessionLoad(minutes, rpe);
  const canSave = athleteId && (preview > 0 || pain || sleep || energy);
  const selStyle = { fontFamily: FB, fontSize: 13, color: C.tx, background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderRadius: 0, padding: '9px 10px', width: '100%' };
  const lab = { fontSize: 9, fontWeight: 700, color: C.tm, textTransform: 'uppercase', letterSpacing: '0.18em', fontFamily: FN, textAlign: 'center' };
  return (
    <Modal open={open} onClose={onClose} title="Log a session">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={lab}>Athlete</label>
          <select value={athleteId} onChange={(e) => setAthleteId(e.target.value)} style={selStyle}>
            {roster.length === 0 && <option value="">— add roster first —</option>}
            {roster.map((t) => <option key={t.id} value={t.id}>{t.jersey != null ? `#${t.jersey} ` : ''}{t.name}</option>)}
          </select>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={lab}>Type</label>
            <select value={type} onChange={(e) => setType(e.target.value)} style={selStyle}>
              {['Practice', 'Game', 'Lift', 'Shootaround', 'Travel', 'Recovery'].map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Input label="Minutes" type="number" inputMode="numeric" min="0" value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder="75" />
          <Input label="Session RPE (0–10)" type="number" inputMode="decimal" min="0" max="10" step="0.5" value={rpe} onChange={(e) => setRpe(e.target.value)} placeholder="7" />
        </div>
        <div style={{ fontFamily: FN, fontSize: 11, color: C.td, textAlign: 'center', letterSpacing: '0.04em' }}>
          sRPE load = <span style={{ color: ORANGE_DEEP, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{preview || 0}</span> units
        </div>
        {(() => {
          const day = fixtures.filter((f) => f.date === date);
          if (!day.length) return null;
          return (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.tm }}>From calendar</span>
              {day.map((f, i) => (
                <button key={i} type="button" onClick={() => { setMinutes(String(f.minutes)); setType(f.type === 'lift' ? 'Lift' : f.type === 'game' ? 'Game' : 'Practice'); }}
                  style={{ fontFamily: FN, fontSize: 10, color: FX_COLOR[f.type] || NAVY, background: 'transparent', border: `1px solid ${C.cardBd}`, borderLeft: `3px solid ${FX_COLOR[f.type] || NAVY}`, padding: '4px 8px', cursor: 'pointer' }}>
                  {f.start} {FX_LABEL[f.type] || 'Session'} {f.minutes}′
                </button>
              ))}
            </div>
          );
        })()}
        <div style={{ borderTop: `1px solid ${C.cardBd}`, paddingTop: 10 }}>
          <div style={{ ...lab, marginBottom: 8, letterSpacing: '0.16em' }}>Readiness (optional)</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <Input label="Pain 0–10" type="number" min="0" max="10" value={pain} onChange={(e) => setPain(e.target.value)} />
            <Input label="Sleep 0–10" type="number" min="0" max="10" value={sleep} onChange={(e) => setSleep(e.target.value)} />
            <Input label="Energy 0–10" type="number" min="0" max="10" value={energy} onChange={(e) => setEnergy(e.target.value)} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn disabled={!canSave} onClick={() => onSave({ athleteId, date, type, minutes, rpe, readiness: { pain, sleep, energy } })}
            style={{ background: canSave ? NAVY : undefined, borderColor: canSave ? NAVY : undefined, color: canSave ? '#fff' : undefined }}>Save</Btn>
        </div>
      </div>
    </Modal>
  );
}
