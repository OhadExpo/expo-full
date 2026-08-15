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

import React, { useMemo, useState, useEffect, useCallback, Suspense, lazy } from 'react';
import { C, FN, FB } from './theme';
import { Card, CollapsibleSection, Btn, Input, Modal, EmptyState, toast } from './ui';
import { ThemeToggle } from './ThemeToggle';
import { acwrFromDaily, sessionLoad } from './acwrEngine';
import { readinessAutoreg } from './readinessAutoreg';

// EXPO's own group/single session logger — reused INSIDE the BHBC portal, scoped
// to the BHBC roster. It writes to client_workouts (athlete-visible), so a BHBC
// session syncs to each player's portal + EXPO review, exactly like the main app.
const SessionsView = lazy(() => import('./SessionsView'));
// EXPO's read-only program/portal preview — shown INSIDE the BHBC zone so coaches
// can view an athlete's program here instead of jumping to the EXPO coach app.
const CoachPreviewPortal = lazy(() => import('./CoachPreviewPortal'));

const NAVY = '#1E3D74', NAVY_DEEP = '#14294F', ORANGE = '#F26A2B', ORANGE_DEEP = '#D9541A';
// Scoped theme override — reskins EXPO's components to BHBC while keeping their
// geometry + light/dark behaviour. Strips go navy (white title text stays legible)
// in both themes; card hairlines get a navy tint blended into the theme border.
const TOKENS = {
  '--c-ac': NAVY,
  '--c-stripBg': NAVY,
  '--c-cardBd': 'color-mix(in srgb, #1E3D74 20%, var(--c-bd))',
};
const BAND = { detrained: '#4F9DE0', low: '#37B27C', elevated: '#E0A73A', high: '#DE4E3B', none: '#7C828B' };
// ONE section-title treatment everywhere (must match CollapsibleSection's title:
// FN / 13 / 700 / 0.08em / uppercase / white). Card headers are plain strings by
// default, so pass them through this to keep every strip title identical.
const secTitle = (t) => <span style={{ fontFamily: FN, fontSize: 13, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t}</span>;

const todayISO = () => new Date().toISOString().slice(0, 10);
const daysAgoISO = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
// Nationality as text (flag emoji doesn't render on Windows Chrome → shows "US"
// letters at a wrong baseline and breaks row alignment).
const flag = (nat) => String(nat || '').split('/').map((c) => c.trim()).filter(Boolean).join(' · ');
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
const FX_COLOR = { game: ORANGE, practice: '#4E7FCB', lift: '#6C7A93' };
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

export default function BhbcView({ trainees = [], setTrainees, bhbcLoads = {}, setBhbcLoads, bhbcFixtures = [], setBhbcFixtures, league = {}, medical = {}, setMedical, planIndex = [], exercises = [], clientWorkouts = [], setClientWorkouts, workouts = [], setWorkouts, onDecrementSession, portalVis = {}, bwLog = [], weeklyFocus = {}, onOpenTrainee, onExit, coach = false, onSignOut, canMedical = true, onLocalWrite }) {
  // Broadcast a change to other open zones after any local write (shared-sheet sync).
  const notify = useCallback(() => { if (onLocalWrite) onLocalWrite(); }, [onLocalWrite]);
  const [manageOpen, setManageOpen] = useState(false);
  const [newAthlete, setNewAthlete] = useState('');
  const [logFor, setLogFor] = useState(null);
  const [detailFor, setDetailFor] = useState(null);
  const [practiceOpen, setPracticeOpen] = useState(false);
  const [checkinOpen, setCheckinOpen] = useState(false);
  const [gameEdit, setGameEdit] = useState(false);
  const [programFor, setProgramFor] = useState(null);
  const [injuryFor, setInjuryFor] = useState(null); // { athleteId, injuryId? } | null
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

  // Per-player landing/arrival date — some sign late, first practices optional.
  const setArrival = useCallback((id, date) => {
    setTrainees((prev) => prev.map((t) => t.id === id ? { ...t, arrival: date || undefined } : t));
  }, [setTrainees]);

  const cycleAvail = useCallback((id, current) => {
    setBhbcLoads((prev) => {
      const rec = prev[id] ? { ...prev[id] } : emptyRec();
      rec.availability = { ...(rec.availability || {}), [today]: (current % 5) + 1 };
      return { ...prev, [id]: rec };
    });
    notify();
  }, [setBhbcLoads, today, notify]);

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
    toast('Logged'); notify();
  }, [setBhbcLoads, notify]);

  // Bulk: log one session's load for the WHOLE available squad (a team all does
  // the same practice). Skips anyone marked Out that day. Feeds every athlete's ACWR.
  const logTeamSession = useCallback(({ date, type, minutes, rpe }) => {
    const load = sessionLoad(minutes, rpe);
    if (load <= 0) { toast('Add minutes + RPE'); return; }
    let n = 0;
    setBhbcLoads((prev) => {
      const next = { ...prev };
      roster.forEach((t) => {
        const rec = next[t.id] ? { ...next[t.id] } : emptyRec();
        const av = (rec.availability && rec.availability[date]) || 1;
        if (av >= 4) return; // Out (medical/personal) → skip
        rec.loads = { ...(rec.loads || {}) };
        rec.sessions = { ...(rec.sessions || {}) };
        rec.loads[date] = (rec.loads[date] || 0) + load;
        rec.sessions[date] = [...(rec.sessions[date] || []), { type, min: Number(minutes) || 0, rpe: Number(rpe) || 0, load, team: true }];
        next[t.id] = rec;
        n++;
      });
      return next;
    });
    toast(`Logged for ${n} athletes`); notify();
  }, [setBhbcLoads, roster, notify]);

  // The sheet-like per-practice save: availability + load + bodyweight + note for
  // the whole squad in one write (Ohad: "a smart easy system for each practice
  // like the BHBC schedule sheet"). Load = minutes × (per-athlete RPE or team RPE);
  // Out athletes get availability recorded but no load.
  const savePractice = useCallback(({ date, minutes, teamRpe, intensity, entries }) => {
    setBhbcLoads((prev) => {
      const next = { ...prev };
      Object.entries(entries).forEach(([id, e]) => {
        const rec = next[id] ? { ...next[id] } : emptyRec();
        rec.availability = { ...(rec.availability || {}), [date]: e.avail };
        const rpe = Number(e.rpe || teamRpe);
        const load = e.avail < 4 ? sessionLoad(minutes, rpe) : 0;
        if (load > 0) {
          rec.loads = { ...(rec.loads || {}), [date]: (rec.loads?.[date] || 0) + load };
          rec.sessions = { ...(rec.sessions || {}) };
          rec.sessions[date] = [...(rec.sessions[date] || []), { type: 'Practice', min: Number(minutes) || 0, rpe, load, intensity, note: e.note || '', team: true }];
        }
        if (e.bw) rec.bw = { ...(rec.bw || {}), [date]: Number(e.bw) };
        if (e.note) rec.notes = { ...(rec.notes || {}), [date]: e.note };
        next[id] = rec;
      });
      return next;
    });
    toast('Practice saved'); notify();
  }, [setBhbcLoads, notify]);

  // Squad morning wellness check-in → readiness[date] per athlete, feeding the
  // readinessAutoreg engine (so the Load board + athlete cards show a real
  // session nudge before athletes have their own portal accounts).
  const saveCheckin = useCallback(({ date, entries }) => {
    setBhbcLoads((prev) => {
      const next = { ...prev };
      Object.entries(entries).forEach(([id, e]) => {
        const hasAny = e.sleep || e.energy || (e.pain !== '' && e.pain != null);
        if (!hasAny) return;
        const rec = next[id] ? { ...next[id] } : emptyRec();
        rec.readiness = { ...(rec.readiness || {}), [date]: { ...((rec.readiness || {})[date] || {}), ...(e.sleep ? { sleep: e.sleep } : {}), ...(e.energy ? { energy: e.energy } : {}), ...(e.pain !== '' && e.pain != null ? { pain: e.pain } : {}) } };
        next[id] = rec;
      });
      return next;
    });
    toast('Check-in saved'); notify();
  }, [setBhbcLoads, notify]);

  const updateGame = useCallback((g, patch) => {
    if (!setBhbcFixtures) return;
    setBhbcFixtures((prev) => (prev || []).map((f) => (f.date === g.date && f.start === g.start && f.type === 'game') ? { ...f, ...patch } : f));
    toast('Game updated'); notify();
  }, [setBhbcFixtures, notify]);

  // ---- Medical / injury record (Ohad + physical therapist) ----
  // Saving an injury/progress entry can also set the athlete's availability that
  // day, so the medical record and the load board stay in sync.
  const saveInjury = useCallback(({ athleteId, injury }) => {
    if (!setMedical) return;
    setMedical((prev) => {
      const rec = { ...(prev || {}) };
      const a = { injuries: [...((rec[athleteId] && rec[athleteId].injuries) || [])] };
      const idx = a.injuries.findIndex((i) => i.id === injury.id);
      if (idx >= 0) a.injuries[idx] = injury; else a.injuries.unshift(injury);
      rec[athleteId] = a;
      return rec;
    });
    // Mirror the current status into availability for today (Out/Limited/etc).
    const statusToAvail = { available: 1, limited: 2, 'non-contact': 3, out: 4 };
    const av = statusToAvail[injury.status];
    if (av && setBhbcLoads && !injury.resolved) {
      setBhbcLoads((prev) => {
        const r = prev[athleteId] ? { ...prev[athleteId] } : emptyRec();
        r.availability = { ...(r.availability || {}), [today]: av };
        return { ...prev, [athleteId]: r };
      });
    }
    toast('Medical record saved'); notify();
  }, [setMedical, setBhbcLoads, today, notify]);

  const rowGrid = '28px minmax(116px,1.5fr) 112px 46px 130px minmax(104px,1.1fr) 92px';

  return (
    <div className="bhbc-zone" style={{ ...TOKENS, minHeight: '100vh', background: 'var(--c-bg)', color: C.tx, fontFamily: FB }}>
      {/* ---- ZONE TOP BAR ---- */}
      <header style={{ position: 'sticky', top: 0, zIndex: 50, background: NAVY, borderBottom: `2px solid ${ORANGE}` }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px', height: 62, display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: '#fff', padding: '5px 9px', flexShrink: 0 }}>
            <img src="/logos/bhbc-logo.png" alt="Bnei Herzliya BC" style={{ height: 44, width: 'auto', display: 'block' }} />
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: FN, fontWeight: 800, fontSize: 16, color: '#fff', letterSpacing: '0.03em', lineHeight: 1 }}>BNEI HERZLIYA</div>
            <div style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: ORANGE, marginTop: 5 }}>S&amp;C · 2026/27</div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
            <ThemeToggle size={30} style={{ color: '#fff', border: '1px solid rgba(255,255,255,0.4)' }} />
            {onExit && <button onClick={onExit} title="Back to EXPO coach" style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#fff', background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.28)', borderRadius: 0, padding: '7px 12px', cursor: 'pointer' }}>‹ EXPO</button>}
            {coach && onSignOut && <button onClick={onSignOut} title="Sign out" style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#fff', background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.28)', borderRadius: 0, padding: '7px 12px', cursor: 'pointer' }}>Sign out</button>}
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 24px 72px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* ---- TOOLBAR ---- */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: C.td }}>Squad · {roster.length}</div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {!coach && <Btn variant="ghost" onClick={() => setManageOpen(true)}>Manage roster</Btn>}
            <Btn variant="ghost" onClick={() => setCheckinOpen(true)}>Check-in</Btn>
            <Btn onClick={() => setPracticeOpen(true)} style={{ background: ORANGE, borderColor: ORANGE, color: '#fff' }}>+ Log practice</Btn>
          </div>
        </div>

        {roster.length === 0 ? (
          <Card header={secTitle('Roster')}>
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
              {[['overview', 'Overview'], ['roster', 'Roster'], ['schedule', 'Schedule'], ['medical', 'Medical'], ['sessions', 'Sessions'], ['games', 'Games']].map(([k, label]) => {
                const active = view === k;
                return (
                  <button key={k} onClick={() => setView(k)} style={{ fontFamily: FN, fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: active ? C.tx : C.td, background: 'transparent', border: 'none', borderBottom: active ? `2px solid ${ORANGE}` : '2px solid transparent', padding: '10px 16px', marginBottom: -1, cursor: 'pointer' }}>{label}</button>
                );
              })}
            </div>

            {view === 'overview' && (
              <>
                <TodayPanel today={today} fixtures={bhbcFixtures} fx={fx} rows={rows} onSessions={() => setView('sessions')} onLog={() => setPracticeOpen(true)} />
                {fx.nextGame && <NextGamePanel nextGame={fx.nextGame} today={today} onEdit={() => setGameEdit(true)} />}
                <FixturesAheadPanel fixtures={bhbcFixtures} today={today} />
                <TeamSnapshotCard team={team} />
                <LoadBoard rows={rows} rowGrid={rowGrid} cycleAvail={cycleAvail} medical={medical} onOpen={setDetailFor} />
              </>
            )}

            {view === 'schedule' && (
              <>
                {fx.nextGame && <NextGamePanel nextGame={fx.nextGame} today={today} onEdit={() => setGameEdit(true)} />}
                <ScheduleTool fx={fx} fixtures={bhbcFixtures} today={today} mode={schedMode} setMode={setSchedMode} onLog={() => setLogFor('new')} />
              </>
            )}

            {view === 'roster' && (
              <RosterGrid rows={rows} medical={medical} league={league} onOpen={setDetailFor} />
            )}

            {view === 'games' && (
              <LeagueView league={league} roster={roster} fixtures={bhbcFixtures} onOpen={setDetailFor} />
            )}

            {view === 'medical' && (
              <MedicalView roster={roster} medical={medical} canMedical={canMedical} onReport={(aid) => setInjuryFor({ athleteId: aid })} onEdit={(aid, iid) => setInjuryFor({ athleteId: aid, injuryId: iid })} onOpen={setDetailFor} />
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
        /* Legible secondary text: brighter muted/dim greys, theme-aware, scoped to
           the zone (Ohad: dark-mode grey text was too faded). */
        .bhbc-zone{ --c-tm:#6B727B; --c-td:#5F666F; }
        @media (prefers-color-scheme: dark){ :root:not([data-theme="light"]):not([data-theme="5b"]) .bhbc-zone{ --c-tm:#AEB4BD; --c-td:#B6BCC5; } }
        :root[data-theme="dark"] .bhbc-zone{ --c-tm:#AEB4BD; --c-td:#B6BCC5; }
        .bhbc-row{transition:background 120ms}
        .bhbc-row:hover{background:color-mix(in srgb, ${NAVY} 6%, transparent)}
        .bhbc-card:hover{transform:translateY(-2px);box-shadow:0 6px 18px rgba(6,16,37,0.14)}
      `}</style>

      {/* ---- PROGRAM VIEW (EXPO's read-only program, shown in-zone for coaches) ---- */}
      {programFor && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'var(--c-bg)', overflowY: 'auto' }}>
          <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: C.td, fontFamily: FB }}>Loading program…</div>}>
            <CoachPreviewPortal traineeId={programFor} trainees={trainees} exercises={exercises} portalVis={portalVis} clientWorkouts={clientWorkouts} bwLog={bwLog} weeklyFocus={weeklyFocus} onBack={() => setProgramFor(null)} showAllBlocks />
          </Suspense>
        </div>
      )}

      {/* ---- PRACTICE ENTRY (the sheet-like daily entry) ---- */}
      {practiceOpen && (
        <PracticeEntryModal roster={roster} bhbcLoads={bhbcLoads} fixtures={bhbcFixtures}
          onClose={() => setPracticeOpen(false)} onSave={(p) => { savePractice(p); setPracticeOpen(false); }} />
      )}

      {checkinOpen && (
        <WellnessModal roster={roster} bhbcLoads={bhbcLoads}
          onClose={() => setCheckinOpen(false)} onSave={(p) => { saveCheckin(p); setCheckinOpen(false); }} />
      )}

      {gameEdit && fx.nextGame && (
        <GameEditModal game={fx.nextGame} onClose={() => setGameEdit(false)} onSave={(patch) => { updateGame(fx.nextGame, patch); setGameEdit(false); }} />
      )}

      {injuryFor && canMedical && (() => {
        const ath = roster.find((t) => t.id === injuryFor.athleteId);
        if (!ath) return null;
        const existing = injuryFor.injuryId ? ((medical[injuryFor.athleteId] || {}).injuries || []).find((i) => i.id === injuryFor.injuryId) : null;
        return <InjuryModal athlete={ath} injury={existing} onClose={() => setInjuryFor(null)} onSave={(injury) => { saveInjury({ athleteId: injuryFor.athleteId, injury }); setInjuryFor(null); }} />;
      })()}

      {/* ---- MANAGE ROSTER MODAL ---- */}
      <Modal open={manageOpen} onClose={() => setManageOpen(false)} title="Manage roster">
        <div style={{ fontFamily: FB, fontSize: 12.5, color: C.td, marginBottom: 12 }}>
          Tag athletes into Bnei Herzliya. They keep their normal athlete portal — this scopes who appears in the <span style={{ fontFamily: FN, color: NAVY, fontWeight: 700 }}>BHBC</span> zone.
        </div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
          <input value={newAthlete} onChange={(e) => setNewAthlete(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && newAthlete.trim()) { setTrainees((prev) => [...prev, { id: 'tr_bh_' + Math.random().toString(36).slice(2, 9), name: newAthlete.trim(), team: 'BHBC', status: 'Active', createdAt: new Date().toISOString() }]); setNewAthlete(''); toast('Added'); } }}
            placeholder="Add a new athlete — full name" style={{ flex: 1, fontFamily: FB, fontSize: 13, color: C.tx, background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderRadius: 0, padding: '9px 10px' }} />
          <Btn disabled={!newAthlete.trim()} onClick={() => { setTrainees((prev) => [...prev, { id: 'tr_bh_' + Math.random().toString(36).slice(2, 9), name: newAthlete.trim(), team: 'BHBC', status: 'Active', createdAt: new Date().toISOString() }]); setNewAthlete(''); toast('Added'); }}
            style={{ background: newAthlete.trim() ? NAVY : undefined, borderColor: newAthlete.trim() ? NAVY : undefined, color: newAthlete.trim() ? '#fff' : undefined }}>+ Add</Btn>
        </div>
        <div style={{ maxHeight: 360, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {trainees.filter((t) => t.status !== 'Archived').sort((a, b) => (b.team === 'BHBC' ? 1 : 0) - (a.team === 'BHBC' ? 1 : 0)).map((t) => {
            const on = t.team === 'BHBC';
            return (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', border: `0.25px solid ${C.cardBd}`, borderLeft: on ? `3px solid ${ORANGE}` : '3px solid transparent', background: on ? `color-mix(in srgb, ${NAVY} 6%, transparent)` : 'transparent' }}>
                <input type="checkbox" checked={on} onChange={(e) => setTeam(t.id, e.target.checked)} style={{ accentColor: NAVY, width: 16, height: 16, cursor: 'pointer' }} />
                {on && t.jersey != null && <Jersey n={t.jersey} size={22} />}
                <span style={{ fontFamily: FN, fontSize: 13, fontWeight: on ? 700 : 500, color: C.tx }}>{t.name}</span>
                {on && (
                  <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    {t.position && <span style={{ fontFamily: FB, fontSize: 11, color: C.td }}>{t.position}</span>}
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }} title="Landing / arrival date">
                      <span style={{ fontFamily: FN, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.tm }}>Lands</span>
                      <input type="date" value={t.arrival || ''} onChange={(e) => setArrival(t.id, e.target.value)} style={{ fontFamily: FN, fontSize: 11, color: C.tx, background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderRadius: 0, padding: '3px 6px' }} />
                    </span>
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </Modal>

      {/* ---- LOG SESSION MODAL ---- */}
      {logFor && (
        <LogModal open={!!logFor} initialAthlete={logFor === 'new' ? (roster[0]?.id || '') : logFor} roster={roster} fixtures={bhbcFixtures}
          availableCount={rows.filter((r) => (r.avail || 1) < 4).length}
          onClose={() => setLogFor(null)} onSave={(payload) => { (payload.scope === 'squad' ? logTeamSession : logSession)(payload); setLogFor(null); }} />
      )}

      {/* ---- ATHLETE DETAIL (in-zone) ---- */}
      {detailFor && (() => {
        const row = rows.find((r) => r.t.id === detailFor);
        if (!row) return null;
        return <AthleteModal row={row} rec={bhbcLoads[detailFor]} days28={last28}
          workouts={(clientWorkouts || []).filter((w) => String(w.clientId || '').split('__')[0] === detailFor)}
          leaguePlayer={leaguePlayerFor(league, row.t.name)} leagueSeason={league.season}
          injuries={activeInjuries(medical, detailFor)}
          onInjury={canMedical ? (() => { const a = activeInjuries(medical, detailFor); setInjuryFor({ athleteId: detailFor, injuryId: a[0] && a[0].id }); setDetailFor(null); }) : null}
          onClose={() => setDetailFor(null)}
          onLog={() => { setLogFor(detailFor); setDetailFor(null); }}
          onOpenExpo={onOpenTrainee ? () => onOpenTrainee(detailFor) : null}
          onViewProgram={() => { setProgramFor(detailFor); setDetailFor(null); }}
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

function AthleteModal({ row, rec, days28, workouts = [], leaguePlayer, leagueSeason, injuries = [], onInjury, onClose, onLog, onOpenExpo, onViewProgram, onCycleAvail }) {
  const { t, acwr, avail, readiness } = row;
  const loads = (rec && rec.loads) || {};
  const rc = readiness.level === 'red' ? '#DE4E3B' : readiness.level === 'amber' ? '#E0A73A' : readiness.level === 'green' ? '#37B27C' : '#7C828B';
  const av = AVAIL[avail];
  // Unified activity: sRPE practice/quick logs + detailed gym sessions (client_workouts).
  const activity = [];
  Object.entries((rec && rec.sessions) || {}).forEach(([d, arr]) => (arr || []).forEach((s) => activity.push({ date: d, label: `${s.type} ${s.min} min @ RPE ${s.rpe}`, load: s.load })));
  (workouts || []).forEach((w) => { const d = String(w.date || w.completedAt || '').slice(0, 10); const nEx = (w.exercises || []).length; const nSets = (w.exercises || []).reduce((a, e) => a + (e.sets || []).length, 0); if (d) activity.push({ date: d, label: `Gym · ${nEx} lift${nEx === 1 ? '' : 's'}, ${nSets} set${nSets === 1 ? '' : 's'}`, load: null }); });
  Object.entries((rec && rec.bw) || {}).forEach(([d, kg]) => activity.push({ date: d, label: `Bodyweight ${kg} kg`, load: null }));
  Object.entries((rec && rec.availability) || {}).forEach(([d, code]) => { if (code > 1) activity.push({ date: d, label: `Availability · ${AVAIL[code].label}`, load: null }); });
  Object.entries((rec && rec.notes) || {}).forEach(([d, n]) => { if (n) activity.push({ date: d, label: `Note — ${n}`, load: null }); });
  // League games fold into the same timeline, so the full history covers court + gym.
  (leaguePlayer && leaguePlayer.log ? leaguePlayer.log : []).forEach((g) => { if (g.date) activity.push({ date: g.date, game: { opp: g.opp && !isBH(g.opp) ? g.opp.replace(/\s*\(.*$/, '') : '—', pts: g.pts, reb: g.reb, ast: g.ast, min: g.min }, load: null }); });
  activity.sort((a, b) => b.date.localeCompare(a.date));
  return (
    <Modal open onClose={onClose} wide title={`#${t.jersey ?? '—'} · ${t.name}`}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: FB, fontSize: 12.5, color: C.td }}>{t.position || '—'} · {heightM(t.heightCm)} {flag(t.nationality)}</span>
          <button onClick={onCycleAvail} title="Click to change availability" style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: FN, fontSize: 11, fontWeight: 700, color: av.color, background: `color-mix(in srgb, ${av.color} 13%, transparent)`, border: `1px solid color-mix(in srgb, ${av.color} 38%, transparent)`, padding: '4px 10px', cursor: 'pointer' }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: av.color }} />{av.label}</button>
        </div>
        {leaguePlayer && (() => {
          const lastG = (leaguePlayer.log || []).length ? [...leaguePlayer.log].sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0] : null;
          const ago = lastG && lastG.date ? dayDiff(todayISO(), lastG.date) : null;
          const agoLabel = ago == null ? '' : ago === 0 ? 'today' : ago === 1 ? 'yesterday' : ago < 31 ? `${ago} days ago` : ago < 60 ? 'last month' : `${Math.round(ago / 30)} months ago`;
          const avg = [['PPG', leaguePlayer.ppg], ['RPG', leaguePlayer.rpg], ['APG', leaguePlayer.apg], ['MPG', leaguePlayer.mpg], ['3P%', leaguePlayer.tpp + '%'], ['FT%', leaguePlayer.ftp + '%'], ['PIR', leaguePlayer.pirpg], ['GP', leaguePlayer.gp]];
          return (
            <div style={{ border: `1px solid ${C.cardBd}`, borderLeft: `3px solid ${ORANGE}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: NAVY }}>
                <span style={{ fontFamily: FN, fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#fff' }}>League Stats</span>
                {leagueSeason && <span style={{ fontFamily: FN, fontSize: 9.5, fontWeight: 700, color: ORANGE, letterSpacing: '0.06em' }}>{leagueSeason}</span>}
              </div>
              {lastG && (
                <div style={{ padding: '10px 12px', borderBottom: `1px solid ${C.cardBd}`, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.tm }}>Last game{agoLabel ? ` · ${agoLabel}` : ''}</div>
                    <div style={{ fontFamily: FN, fontSize: 13, fontWeight: 700, color: C.tx, marginTop: 3 }}>vs {lastG.opp && !isBH(lastG.opp) ? lastG.opp.replace(/\s*\(.*$/, '') : '—'}</div>
                  </div>
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 14 }}>
                    {[['PTS', lastG.pts], ['REB', lastG.reb], ['AST', lastG.ast], ["MIN", lastG.min]].map(([k, v]) => (
                      <div key={k} style={{ textAlign: 'center' }}>
                        <div style={{ fontFamily: FN, fontWeight: 800, fontSize: 18, color: k === 'PTS' ? ORANGE_DEEP : C.tx, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{v}</div>
                        <div style={{ fontFamily: FN, fontSize: 8, fontWeight: 700, letterSpacing: '0.08em', color: C.tm, marginTop: 3 }}>{k}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)' }}>
                {avg.map(([k, v], i) => (
                  <div key={k} style={{ padding: '10px 12px', borderRight: (i % 4 !== 3) ? `1px solid ${C.cardBd}` : 'none', borderTop: i >= 4 ? `1px solid ${C.cardBd}` : 'none' }}>
                    <div style={{ fontFamily: FN, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.tm }}>{k}</div>
                    <div style={{ fontFamily: FN, fontWeight: 800, fontSize: 16, color: C.tx, marginTop: 3, fontVariantNumeric: 'tabular-nums' }}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 1, background: C.cardBd, border: `1px solid ${C.cardBd}` }}>
          {[['ACWR', acwr.ratio != null ? acwr.ratio.toFixed(2) : '—', acwr.ratio != null ? acwr.band.color : C.tx], ['7-day load', acwr.acute ? Math.round(acwr.acute) : '—', C.tx], ['28-day', acwr.chronic ? Math.round(acwr.chronic) : '—', C.td]].map(([k, v, c]) => (
            <div key={k} style={{ background: 'var(--c-sf)', padding: '10px 12px' }}>
              <div style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.tm }}>{k}</div>
              <div style={{ fontFamily: FN, fontWeight: 800, fontSize: 22, color: c, marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>{v}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: rc, flexShrink: 0 }} />
          <span style={{ fontFamily: FB, fontSize: 12.5, color: C.td }}>{readiness.level === 'unknown' ? 'No readiness check-in logged' : readiness.headline}</span>
        </div>
        {/* Medical / injury — shown on the athlete's profile too, not only the Medical tab */}
        <div style={{ border: `1px solid ${C.cardBd}`, borderLeft: `3px solid ${injuries.length ? '#DE4E3B' : '#37B27C'}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderBottom: injuries.length ? `1px solid ${C.cardBd}` : 'none' }}>
            <span style={{ fontFamily: FN, fontSize: 10.5, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.tx }}>Medical</span>
            {!injuries.length && <StatusPill status="available" small />}
            {onInjury && <button onClick={onInjury} style={{ marginLeft: 'auto', fontFamily: FN, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: NAVY, background: 'transparent', border: `1px solid ${C.cardBd}`, padding: '4px 10px', cursor: 'pointer' }}>{injuries.length ? 'Update' : '+ Report injury'}</button>}
          </div>
          {injuries.map((inj) => {
            const days = inj.onsetDate ? dayDiff(todayISO(), inj.onsetDate) : null;
            const lastP = (inj.progress || [])[0];
            return (
              <div key={inj.id} style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <StatusPill status={inj.status} small />
                <span style={{ fontFamily: FB, fontSize: 12.5, color: C.tx }}>{[inj.bodyPart, inj.side && inj.side !== 'N/A' ? inj.side : '', inj.type].filter(Boolean).join(' · ')}</span>
                <span style={{ fontFamily: FN, fontSize: 10.5, color: C.td, fontVariantNumeric: 'tabular-nums' }}>{days != null ? `${days}d` : ''}{inj.pain != null && inj.pain !== '' ? ` · pain ${inj.pain}` : ''}{inj.rtpTarget ? ` · RTP ${inj.rtpTarget.slice(5)}` : ''}</span>
                {lastP && <span style={{ fontFamily: FB, fontSize: 11, color: C.tm, width: '100%' }}>Latest ({lastP.date.slice(5)}): {lastP.note}</span>}
              </div>
            );
          })}
        </div>
        <div>
          <div style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.tm, marginBottom: 6 }}>Full history{activity.length ? ` (${activity.length})` : ''}</div>
          {activity.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', maxHeight: 118, overflowY: 'auto' }}>
              {activity.map((a, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, padding: '7px 0', borderBottom: `0.25px solid ${C.cardBd}`, fontFamily: FN, fontSize: 12 }}>
                  <span style={{ color: a.game ? ORANGE_DEEP : C.td, width: 62, fontVariantNumeric: 'tabular-nums', flexShrink: 0, fontWeight: a.game ? 700 : 400 }}>{a.date.slice(5)}</span>
                  {a.game ? (
                    <span style={{ color: C.tx, minWidth: 0, flex: 1, display: 'flex', gap: 8, alignItems: 'baseline' }} dir="ltr">
                      <span style={{ fontWeight: 600 }}>Game</span>
                      <span style={{ unicodeBidi: 'isolate', direction: 'rtl', color: C.td }}>{a.game.opp}</span>
                      <span style={{ marginLeft: 'auto', fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: ORANGE_DEEP, whiteSpace: 'nowrap' }}>{a.game.pts}p · {a.game.reb}r · {a.game.ast}a · {a.game.min}′</span>
                    </span>
                  ) : (
                    <span style={{ color: C.tx, minWidth: 0 }}>{a.label}</span>
                  )}
                  {a.load != null && <span style={{ marginLeft: 'auto', color: ORANGE_DEEP, fontVariantNumeric: 'tabular-nums', fontWeight: 700, flexShrink: 0 }}>{Math.round(a.load)}</span>}
                </div>
              ))}
            </div>
          ) : <div style={{ fontFamily: FB, fontSize: 12.5, color: C.td, padding: '6px 0' }}>No history logged yet.</div>}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          {onOpenExpo && <Btn variant="ghost" onClick={onOpenExpo}>Open in EXPO ›</Btn>}
          <Btn variant="ghost" onClick={onLog}>Log session</Btn>
          {onViewProgram && <Btn onClick={onViewProgram} style={{ background: NAVY, borderColor: NAVY, color: '#fff' }}>View program</Btn>}
        </div>
      </div>
    </Modal>
  );
}

// band helpers (mirror acwrEngine bands for the snapshot tile)
function bandKey(r) { if (r == null) return 'none'; if (r < 0.8) return 'detrained'; if (r <= 1.3) return 'low'; if (r < 1.5) return 'elevated'; return 'high'; }
function acwrLabel(r) { return { detrained: 'undertrained', low: 'sweet spot', elevated: 'elevated', high: 'danger', none: '' }[bandKey(r)]; }

// Squad wellness check-in — sleep / energy / pain per athlete → feeds the
// readinessAutoreg engine (session nudge on the load board + athlete profile).
function WellnessModal({ roster, bhbcLoads, onClose, onSave }) {
  const [date, setDate] = useState(todayISO());
  const [entries, setEntries] = useState({});
  useEffect(() => {
    const e = {};
    roster.forEach((t) => { const r = ((bhbcLoads[t.id] || {}).readiness || {})[date] || {}; e[t.id] = { sleep: r.sleep || '', energy: r.energy || '', pain: r.pain ?? '' }; });
    setEntries(e);
  }, [date]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (id, k, v) => setEntries((prev) => ({ ...prev, [id]: { ...prev[id], [k]: (prev[id] && prev[id][k]) === v ? '' : v } }));
  const SLEEP = [['poor', 'Poor'], ['ok', 'OK'], ['good', 'Good'], ['great', 'Great']];
  const ENERGY = [['low', 'Low'], ['ok', 'OK'], ['good', 'Good'], ['high', 'High']];
  const inp = { fontFamily: FN, fontSize: 12, color: C.tx, background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderRadius: 0, padding: '0 8px', width: '100%', height: 30, boxSizing: 'border-box', textAlign: 'center' };
  const Seg = ({ id, k, opts }) => (
    <div style={{ display: 'inline-flex', border: `1px solid ${C.cardBd}` }}>
      {opts.map(([val, label]) => {
        const on = (entries[id] || {})[k] === val;
        return <button key={val} type="button" onClick={() => set(id, k, val)} style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, color: on ? '#fff' : C.td, background: on ? NAVY : 'transparent', border: 'none', padding: '5px 8px', cursor: 'pointer', minWidth: 34 }}>{label}</button>;
      })}
    </div>
  );
  const count = Object.values(entries).filter((e) => e.sleep || e.energy || (e.pain !== '' && e.pain != null)).length;
  const cols = '24px 1.3fr auto auto 62px';
  return (
    <Modal open onClose={onClose} wide title="Wellness check-in">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'end', gap: 12, flexWrap: 'wrap' }}>
          <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <span style={{ fontFamily: FB, fontSize: 11.5, color: C.td, paddingBottom: 8 }}>Sleep · energy · pain (0–10). Pain gates the session; sleep + energy set the effort. Tap a value again to clear.</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 10, padding: '0 2px 8px', fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.tm, borderBottom: `1px solid ${C.cardBd}` }}>
          <div>#</div><div>Athlete</div><div style={{ textAlign: 'center' }}>Sleep</div><div style={{ textAlign: 'center' }}>Energy</div><div style={{ textAlign: 'center' }}>Pain</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', maxHeight: 380, overflowY: 'auto' }}>
          {roster.map((t) => (
            <div key={t.id} style={{ display: 'grid', gridTemplateColumns: cols, gap: 10, alignItems: 'center', padding: '7px 2px', borderBottom: `0.25px solid ${C.cardBd}` }}>
              <Jersey n={t.jersey} size={22} />
              <div style={{ fontFamily: FN, fontSize: 12.5, fontWeight: 700, color: C.tx, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</div>
              <div style={{ display: 'flex', justifyContent: 'center' }}><Seg id={t.id} k="sleep" opts={SLEEP} /></div>
              <div style={{ display: 'flex', justifyContent: 'center' }}><Seg id={t.id} k="energy" opts={ENERGY} /></div>
              <input type="number" min="0" max="10" value={(entries[t.id] || {}).pain} onChange={(e) => set(t.id, 'pain', e.target.value === '' ? '' : Number(e.target.value))} placeholder="—" style={inp} />
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontFamily: FN, fontSize: 10.5, color: C.td, marginRight: 'auto' }}>{count} of {roster.length} filled</span>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn disabled={!count} onClick={() => onSave({ date, entries })} style={{ background: count ? NAVY : undefined, borderColor: count ? NAVY : undefined, color: count ? '#fff' : undefined }}>Save check-in</Btn>
        </div>
      </div>
    </Modal>
  );
}

function PracticeEntryModal({ roster, bhbcLoads, fixtures, onClose, onSave }) {
  const [date, setDate] = useState(() => {
    const up = (fixtures || []).filter((f) => f.date >= todayISO()).sort((a, b) => a.date.localeCompare(b.date));
    const p = up.find((f) => f.type === 'practice') || up[0];
    return p ? p.date : todayISO();
  });
  const dayFx = (fixtures || []).filter((f) => f.date === date).slice().sort((a, b) => a.start.localeCompare(b.start));
  const [minutes, setMinutes] = useState('');
  const [teamRpe, setTeamRpe] = useState('');
  const [intensity, setIntensity] = useState('');
  const [entries, setEntries] = useState({});
  useEffect(() => {
    const e = {};
    roster.forEach((t) => { const rec = bhbcLoads[t.id] || {}; e[t.id] = { avail: (rec.availability && rec.availability[date]) || 1, rpe: '', bw: '', note: '' }; });
    setEntries(e);
    const list = (fixtures || []).filter((f) => f.date === date);
    const prac = list.find((f) => f.type === 'practice') || list[0];
    setMinutes(prac ? String(prac.minutes) : '');
  }, [date]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (id, k, v) => setEntries((prev) => ({ ...prev, [id]: { ...prev[id], [k]: v } }));
  const inp = { fontFamily: FN, fontSize: 12, color: C.tx, background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderRadius: 0, padding: '0 8px', width: '100%', height: 32, boxSizing: 'border-box' };
  const canSave = Number(minutes) > 0 && Number(teamRpe) > 0;
  const cols = '24px 1.4fr 116px 56px 66px 1.5fr';
  return (
    <Modal open onClose={onClose} wide title="Log practice">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.9fr 0.9fr 1.3fr', gap: 10, alignItems: 'end' }}>
          <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <Input label="Minutes" type="number" value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder="75" />
          <Input label="Team RPE" type="number" min="0" max="10" step="0.5" value={teamRpe} onChange={(e) => setTeamRpe(e.target.value)} placeholder="7" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 9, fontWeight: 700, color: C.tm, textTransform: 'uppercase', letterSpacing: '0.18em', fontFamily: FN, textAlign: 'center' }}>Intensity</label>
            <select value={intensity} onChange={(e) => setIntensity(e.target.value)} style={inp}>
              <option value="">—</option>
              {['Low', 'Moderate', 'High', 'Very High'].map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
        </div>
        {dayFx.length > 0 && <div style={{ fontFamily: FN, fontSize: 10.5, color: C.td }}>From calendar: {dayFx.map((f) => `${f.start} ${FX_LABEL[f.type] || 'Session'} ${f.minutes} min`).join('  ·  ')}</div>}
        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 560 }}>
            <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 8, padding: '0 0 8px', fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.tm, borderBottom: `1px solid ${C.cardBd}` }}>
              <div>#</div><div>Athlete</div><div>Availability</div><div>RPE</div><div>BW kg</div><div>Note</div>
            </div>
            {roster.map((t) => {
              const e = entries[t.id] || { avail: 1, rpe: '', bw: '', note: '' };
              const av = AVAIL[e.avail];
              return (
                <div key={t.id} style={{ display: 'grid', gridTemplateColumns: cols, gap: 8, alignItems: 'center', padding: '7px 0', borderBottom: `0.25px solid ${C.cardBd}` }}>
                  <Jersey n={t.jersey} size={22} />
                  <div style={{ fontFamily: FN, fontSize: 12.5, fontWeight: 700, color: C.tx, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</div>
                  <button type="button" onClick={() => set(t.id, 'avail', (e.avail % 5) + 1)} title="Click to change availability" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%', height: 32, boxSizing: 'border-box', fontFamily: FN, fontSize: 10, fontWeight: 700, color: av.color, background: `color-mix(in srgb, ${av.color} 13%, transparent)`, border: `1px solid color-mix(in srgb, ${av.color} 38%, transparent)`, padding: '0 6px', cursor: 'pointer', whiteSpace: 'nowrap' }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: av.color, flexShrink: 0 }} />{av.label}</button>
                  <input type="number" value={e.rpe} onChange={(ev) => set(t.id, 'rpe', ev.target.value)} placeholder={teamRpe || 'RPE'} style={inp} />
                  <input type="number" value={e.bw} onChange={(ev) => set(t.id, 'bw', ev.target.value)} placeholder="—" style={inp} />
                  <input value={e.note} onChange={(ev) => set(t.id, 'note', ev.target.value)} placeholder="note" style={inp} />
                </div>
              );
            })}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontFamily: FN, fontSize: 10.5, color: C.td, marginRight: 'auto' }}>Load = minutes × RPE (per-athlete or team). Out athletes: availability only.</span>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn disabled={!canSave} onClick={() => onSave({ date, minutes, teamRpe, intensity, entries })} style={{ background: canSave ? NAVY : undefined, borderColor: canSave ? NAVY : undefined, color: canSave ? '#fff' : undefined }}>Save practice</Btn>
        </div>
      </div>
    </Modal>
  );
}

function GameEditModal({ game, onClose, onSave }) {
  const [opponent, setOpponent] = useState(game.opponent || '');
  const [venue, setVenue] = useState(game.venue || '');
  const [home, setHome] = useState(game.home == null ? '' : game.home ? 'home' : 'away');
  return (
    <Modal open onClose={onClose} title="Game details">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontFamily: FB, fontSize: 12.5, color: C.td }}>{dow(game.date)} {monDay(game.date)} · {game.start}</div>
        <Input label="Opponent" value={opponent} onChange={(e) => setOpponent(e.target.value)} placeholder="e.g. Maccabi Tel Aviv" />
        <Input label="Venue" value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="e.g. Hayovel Arena" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 9, fontWeight: 700, color: C.tm, textTransform: 'uppercase', letterSpacing: '0.18em', fontFamily: FN, textAlign: 'center' }}>Home / Away</label>
          <div style={{ display: 'inline-flex', border: `1px solid ${C.cardBd}`, alignSelf: 'center' }}>
            {[['home', 'Home'], ['away', 'Away'], ['', '—']].map(([k, l]) => (
              <button key={k} type="button" onClick={() => setHome(k)} style={{ fontFamily: FN, fontSize: 11, fontWeight: 700, color: home === k ? '#fff' : C.td, background: home === k ? NAVY : 'transparent', border: 'none', padding: '7px 16px', cursor: 'pointer' }}>{l}</button>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn onClick={() => onSave({ opponent: opponent.trim(), venue: venue.trim(), home: home === '' ? null : home === 'home' })} style={{ background: NAVY, borderColor: NAVY, color: '#fff' }}>Save</Btn>
        </div>
      </div>
    </Modal>
  );
}

// Home/Away chip — form + label (never color alone).
function HAChip({ home }) {
  if (home == null) return null;
  const isHome = home === true;
  const c = isHome ? NAVY : ORANGE_DEEP;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: FN, fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: c, background: `color-mix(in srgb, ${c} 12%, transparent)`, border: `1px solid color-mix(in srgb, ${c} 40%, transparent)`, padding: '2px 7px', whiteSpace: 'nowrap' }}>
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{isHome ? 'H' : 'A'}</span>{isHome ? 'Home' : 'Away'}
    </span>
  );
}

// Travel legs for European games (jet-lag / travel-load planning).
function TravelStrip({ travel }) {
  if (!travel) return null;
  const leg = (l, dir) => {
    if (!l) return null;
    const d = l.date ? `${dow(l.date)} ${monDay(l.date)}` : '';
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: FN, fontSize: 10.5, color: C.td }}>
        <span style={{ fontFamily: FN, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.tm }}>{dir}</span>
        <span style={{ color: C.tx, fontVariantNumeric: 'tabular-nums' }}>{d}</span>
        <span>{l.tbd ? 'TBD' : `${l.label} · ${l.flight} ${l.dep}`}</span>
      </span>
    );
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.cardBd}` }}>
      <span style={{ fontFamily: FN, fontSize: 12, color: ORANGE_DEEP }} aria-hidden="true">✈</span>
      {leg(travel.out, 'Out')}
      {leg(travel.back, 'Back')}
    </div>
  );
}

// Road ahead — the next few games after the imminent one, so the coach can see
// congestion + travel and plan the microcycle. Flags tight turnarounds (≤3 days
// between games = elevated load risk).
function FixturesAheadPanel({ fixtures, today }) {
  const games = (fixtures || []).filter((f) => f.type === 'game' && f.date >= today).sort((a, b) => a.date.localeCompare(b.date)).slice(1, 5);
  if (!games.length) return null;
  let prevDate = (fixtures || []).filter((f) => f.type === 'game' && f.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0]?.date;
  return (
    <Card padding={18} leftStripe={NAVY} header={secTitle('Road Ahead')}>
      <div>
        {games.map((g, i) => {
          const days = dayDiff(g.date, today);
          const gap = prevDate ? dayDiff(g.date, prevDate) : null; prevDate = g.date;
          const tight = gap != null && gap <= 3;
          return (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '46px 1fr auto', gap: 12, alignItems: 'center', padding: '10px 0', borderBottom: i < games.length - 1 ? `0.25px solid ${C.cardBd}` : 'none' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: FN, fontWeight: 800, fontSize: 17, lineHeight: 1, color: C.tx, fontVariantNumeric: 'tabular-nums' }}>{days}</div>
                <div style={{ fontFamily: FN, fontSize: 7.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.tm, marginTop: 2 }}>days</div>
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: FN, fontSize: 13, fontWeight: 700, color: C.tx }}>{g.opponent ? `vs ${g.opponent}` : 'Opponent TBD'}</span>
                  <HAChip home={g.home} />
                  {g.travel && <span style={{ fontFamily: FN, fontSize: 11, color: ORANGE_DEEP }} title="Travel">✈</span>}
                  {tight && <span style={{ fontFamily: FN, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#fff', background: '#E0A73A', padding: '1px 6px' }} title={`${gap} days after the previous game`}>{gap}d turnaround</span>}
                </div>
                <div style={{ fontFamily: FB, fontSize: 11, color: C.td, marginTop: 3 }}>{[g.comp, `${dow(g.date)} ${monDay(g.date)}`, g.venue].filter(Boolean).join(' · ')}</div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function NextGamePanel({ nextGame, today, onEdit }) {
  const days = dayDiff(nextGame.date, today);
  const when = days <= 0 ? 'Game day' : days === 1 ? 'Tomorrow' : `In ${days} days`;
  const timeLabel = nextGame.timeTBD || !nextGame.start ? 'Time TBD' : nextGame.start;
  return (
    <Card padding={18} leftStripe={ORANGE} header={secTitle('Next Game')} headerRight={<div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#fff' }}>{when}</span>{onEdit && <button onClick={onEdit} style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#fff', background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.3)', padding: '4px 9px', cursor: 'pointer' }}>Edit</button>}</div>}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
        <div style={{ textAlign: 'center', flexShrink: 0 }}>
          <div style={{ fontFamily: FN, fontWeight: 800, fontSize: 40, lineHeight: 1, color: ORANGE_DEEP, fontVariantNumeric: 'tabular-nums' }}>{Math.max(0, days)}</div>
          <div style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.tm, marginTop: 4 }}>days</div>
        </div>
        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {nextGame.comp && <div style={{ fontFamily: FN, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: ORANGE_DEEP }}>{nextGame.comp}</div>}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: FN, fontWeight: 800, fontSize: 17, color: C.tx }}>{nextGame.opponent ? `vs ${nextGame.opponent}` : 'Opponent TBD'}</span>
            <HAChip home={nextGame.home} />
          </div>
          <div style={{ fontFamily: FB, fontSize: 12.5, color: C.td }}>
            {dow(nextGame.date)} {monDay(nextGame.date)} · {timeLabel}{nextGame.venue ? ` · ${nextGame.venue}` : ''}
          </div>
        </div>
      </div>
      {nextGame.travel && <TravelStrip travel={nextGame.travel} />}
    </Card>
  );
}

function TodayPanel({ today, fixtures, fx, rows, onSessions, onLog }) {
  const todayFx = (fixtures || []).filter((f) => f.date === today).slice().sort((a, b) => a.start.localeCompare(b.start));
  const next = fx.byDay[0];
  const av = { full: 0, mod: 0, out: 0 };
  rows.forEach((r) => { if (r.avail <= 1) av.full++; else if (r.avail <= 3) av.mod++; else av.out++; });
  const gd = fx.nextGame ? dayDiff(today, fx.nextGame.date) : null;
  const gdLabel = gd == null ? null : gd === 0 ? 'GAME DAY' : gd < 0 ? `${-gd} day${gd === -1 ? '' : 's'} to game` : null;
  // time (with date when it's a future/next session) highlighted in a navy
  // segment; all text one size.
  const chip = (f, i, showDate) => (
    <span key={i} style={{ display: 'inline-flex', alignItems: 'stretch', border: `1px solid ${C.cardBd}`, borderLeft: `3px solid ${FX_COLOR[f.type] || NAVY}` }}>
      <span style={{ fontFamily: FN, fontSize: 11.5, fontWeight: 700, color: '#fff', background: NAVY, padding: '5px 9px', display: 'inline-flex', alignItems: 'center', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{showDate ? `${dow(f.date)} ${monDay(f.date)} · ${f.start}` : f.start}</span>
      <span style={{ fontFamily: FN, fontSize: 11.5, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: FX_COLOR[f.type] || NAVY, padding: '5px 8px', display: 'inline-flex', alignItems: 'center' }}>{FX_LABEL[f.type] || 'Session'}</span>
      <span style={{ fontFamily: FN, fontSize: 11.5, color: C.td, padding: '5px 9px 5px 2px', display: 'inline-flex', alignItems: 'center' }}>{f.minutes} min</span>
    </span>
  );
  return (
    <Card padding={18} leftStripe={ORANGE} header={secTitle(`Today · ${dow(today)} ${monDay(today)}`)} headerRight={gdLabel ? <span style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#fff' }}>{gdLabel}</span> : null}>
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ flex: '2 1 300px', minWidth: 240 }}>
          <div style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.tm, marginBottom: 8 }}>Sessions</div>
          {todayFx.length ? (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{todayFx.map((f, i) => chip(f, i, false))}</div>
          ) : next ? (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.td }}>None today · next</span>
              {next.items.slice(0, 3).map((f, i) => chip(f, i, true))}
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
          <Btn variant="ghost" onClick={onLog}>Log practice</Btn>
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
    <Card leftStripe={NAVY} header={secTitle('Team Snapshot')} padding={18}>
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

function LoadBoard({ rows, rowGrid, cycleAvail, medical = {}, onOpen }) {
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
                  {(() => { const inj = activeInjuries(medical, t.id)[0]; return inj
                    ? <div style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, color: (MED_STATUS[inj.status] || {}).color || '#DE4E3B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{'⚠ '}{inj.bodyPart}{inj.side && inj.side !== 'N/A' ? ` ${inj.side[0]}` : ''}</div>
                    : <div style={{ fontFamily: FB, fontSize: 10.5, color: C.td }}>{t.position || '—'}</div>; })()}
                </div>
                <div>{acwr.ratio != null ? <BandPill band={acwr.band} value={acwr.ratio.toFixed(2)} /> : <span style={{ fontFamily: FN, fontSize: 10.5, color: C.tm, letterSpacing: '0.06em' }}>· baseline</span>}</div>
                <div style={{ fontFamily: FN, fontSize: 13, color: C.tx, fontVariantNumeric: 'tabular-nums' }}>{acwr.acute ? Math.round(acwr.acute) : '—'}</div>
                <div>
                  <button onClick={(e) => { e.stopPropagation(); cycleAvail(t.id, avail); }} title="Click to change availability" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, minWidth: 108, boxSizing: 'border-box', fontFamily: FN, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.03em', color: AVAIL[avail].color, background: `color-mix(in srgb, ${AVAIL[avail].color} 13%, transparent)`, border: `1px solid color-mix(in srgb, ${AVAIL[avail].color} 38%, transparent)`, borderRadius: 0, padding: '5px 9px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
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

function RosterGrid({ rows, medical = {}, league = {}, onOpen }) {
  return (
    <CollapsibleSection title="Roster" count={rows.length} storageKey="bhbc-roster" defaultOpen leftStripe={NAVY}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(232px, 1fr))', gap: 12 }}>
        {rows.map(({ t, acwr }) => (
          <div key={t.id} onClick={() => onOpen(t.id)} className="bhbc-card" style={{ position: 'relative', overflow: 'hidden', background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderLeft: `3px solid ${acwr.band.color}`, padding: '13px 15px', cursor: 'pointer', transition: 'transform 160ms, box-shadow 160ms' }}>
            <div aria-hidden="true" style={{ position: 'absolute', right: 10, top: 8, fontFamily: FN, fontWeight: 800, fontSize: 42, lineHeight: 1, color: NAVY, opacity: 0.08, fontVariantNumeric: 'tabular-nums' }}>{t.jersey ?? ''}</div>
            <div style={{ position: 'relative' }}>
              <div style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', color: ORANGE_DEEP, fontVariantNumeric: 'tabular-nums' }}>#{t.jersey ?? '—'}</div>
              <div style={{ fontFamily: FN, fontWeight: 700, fontSize: 15, color: C.tx, marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</div>
              {(() => { const inj = activeInjuries(medical, t.id)[0]; return inj
                ? <div style={{ fontFamily: FN, fontSize: 10.5, fontWeight: 700, color: (MED_STATUS[inj.status] || {}).color || '#DE4E3B', marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{'⚠ '}{inj.bodyPart}{inj.side && inj.side !== 'N/A' ? ` ${inj.side[0]}` : ''} · {(MED_STATUS[inj.status] || {}).label}</div>
                : <div style={{ fontFamily: FB, fontSize: 11, color: C.td, marginTop: 4 }}>{t.position || '—'}</div>; })()}
              {t.arrival && t.arrival > todayISO() && <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 6, fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: ORANGE_DEEP, background: `color-mix(in srgb, ${ORANGE} 12%, transparent)`, padding: '2px 6px' }}><span aria-hidden="true">✈</span> Lands {dow(t.arrival)} {monDay(t.arrival)}</div>}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, paddingTop: 10, borderTop: `0.25px solid ${C.cardBd}` }}>
                <span style={{ fontFamily: FN, fontSize: 11, color: C.tm, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{heightM(t.heightCm)}</span>
                <span style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', color: C.tm, lineHeight: 1 }}>{flag(t.nationality)}</span>
                {(() => { const lp = leaguePlayerFor(league, t.name); return lp ? <span style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, color: ORANGE_DEEP, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }} title="League points per game">{lp.ppg} PPG</span> : null; })()}
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
      {[['calendar', 'Month'], ['week', 'Week'], ['list', 'List']].map(([k, l]) => (
        <button key={k} onClick={() => setMode(k)} style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: mode === k ? NAVY : '#fff', background: mode === k ? '#fff' : 'transparent', border: 'none', padding: '5px 12px', cursor: 'pointer' }}>{l}</button>
      ))}
    </div>
  );
  return (
    <Card padding={18} leftStripe={ORANGE} header={secTitle('Schedule')} headerRight={toggle}>
      {mode === 'calendar' ? <ScheduleMonth fixtures={fixtures} today={today} /> : mode === 'week' ? <ScheduleWeek fixtures={fixtures} today={today} /> : <ScheduleList fx={fx} today={today} />}
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
                  <span style={{ fontFamily: FN, fontSize: 10, color: C.td, fontVariantNumeric: 'tabular-nums' }}>{f.minutes} min</span>
                  {f.optional && <span style={{ fontFamily: FN, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.tm, border: `1px solid ${C.cardBd}`, padding: '1px 5px' }}>optional</span>}
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

function ScheduleWeek({ fixtures, today }) {
  // Anchor to the week that holds the next session, so it's never blank pre-season.
  const upcoming = (fixtures || []).filter((f) => f.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  const anchor = parseISO(upcoming[0]?.date || today);
  const weekStart = new Date(anchor); weekStart.setDate(anchor.getDate() - anchor.getDay());
  const isoOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const byDate = {};
  (fixtures || []).forEach((f) => { (byDate[f.date] = byDate[f.date] || []).push(f); });
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(weekStart); d.setDate(weekStart.getDate() + i); return d; });
  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ minWidth: 640, display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
        {days.map((d) => {
          const di = isoOf(d); const isToday = di === today;
          const items = (byDate[di] || []).slice().sort((a, b) => a.start.localeCompare(b.start));
          const hasGame = items.some((f) => f.type === 'game');
          return (
            <div key={di} style={{ border: `1px solid ${C.cardBd}`, background: isToday ? `color-mix(in srgb, ${ORANGE} 8%, var(--c-sf))` : 'var(--c-sf)', minHeight: 168, display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '8px 6px', borderBottom: `1px solid ${C.cardBd}`, textAlign: 'center', position: 'relative' }}>
                {hasGame && <div style={{ position: 'absolute', top: 5, right: 5, fontFamily: FN, fontSize: 7.5, fontWeight: 800, letterSpacing: '0.06em', color: '#fff', background: ORANGE, padding: '1px 4px' }}>GAME</div>}
                <div style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: isToday ? ORANGE_DEEP : C.tm }}>{DOW[d.getDay()]}</div>
                <div style={{ fontFamily: FN, fontSize: 16, fontWeight: 800, color: isToday ? ORANGE_DEEP : C.tx, fontVariantNumeric: 'tabular-nums' }}>{d.getDate()}</div>
              </div>
              <div style={{ padding: 6, display: 'flex', flexDirection: 'column', gap: 5 }}>
                {items.map((f, i) => (
                  <div key={i} style={{ border: `1px solid ${C.cardBd}`, borderLeft: `3px solid ${FX_COLOR[f.type] || NAVY}`, padding: '5px 7px', background: 'var(--c-bg)' }}>
                    <div style={{ fontFamily: FN, fontSize: 10.5, fontWeight: 700, color: FX_COLOR[f.type] || NAVY, textTransform: 'uppercase' }}>{FX_LABEL[f.type] || 'Session'}</div>
                    <div style={{ fontFamily: FN, fontSize: 10, color: C.td, fontVariantNumeric: 'tabular-nums' }}>{f.start} · {f.minutes} min</div>
                    {f.location && <div style={{ fontFamily: FB, fontSize: 9, color: C.tm }}>{f.location}</div>}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
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
      <div key={di} style={{ minHeight: 82, borderRight: '1px solid var(--c-bd)', borderBottom: '1px solid var(--c-bd)', padding: '5px 7px', background: isToday ? `color-mix(in srgb, ${ORANGE} 7%, var(--c-sf))` : 'var(--c-sf)', display: 'flex', flexDirection: 'column', gap: 3, overflow: 'hidden' }}>
        <div style={{ fontFamily: FN, fontSize: 11, fontWeight: isToday ? 800 : 600, color: isToday ? ORANGE_DEEP : (inMonth ? C.td : C.tm), textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{dt.getDate()}</div>
        {items.slice(0, 3).map((f, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, fontFamily: FN, fontSize: 9.5, background: `color-mix(in srgb, ${FX_COLOR[f.type] || NAVY} 13%, transparent)`, borderLeft: `2px solid ${FX_COLOR[f.type] || NAVY}`, padding: '2px 5px', minWidth: 0 }}>
            <span style={{ color: FX_COLOR[f.type] || NAVY, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{f.start}</span>
            <span style={{ color: FX_COLOR[f.type] || NAVY, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{FX_LABEL[f.type] || 'Session'}</span>
          </div>
        ))}
        {items.length > 3 && <div style={{ fontFamily: FN, fontSize: 8.5, color: C.td, paddingLeft: 2 }}>+{items.length - 3} more</div>}
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
        <div style={{ borderTop: '1px solid var(--c-bd)', borderLeft: '1px solid var(--c-bd)' }}>
          {weeks.map((week, i) => <div key={i} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>{week.map(cell)}</div>)}
        </div>
      </div>
    </div>
  );
}

// ============================ LEAGUE / GAMES TAB ============================
// Renders the live league feed synced from basket.co.il (מנהלת ליגת העל) into
// the store key `expo-bhbc-league` by scripts/_bhbc-sync-league.mjs: standings,
// per-round results, BHBC team + per-player stats. BHBC always highlighted.
const isBH = (n) => /הרצליה|herzliy/i.test(n || '');
// Roster (English) → league box-score (Hebrew) name, so a player's official
// league stats attach to their EXPO athlete. Only current squad members who
// have league stats need an entry; new signings simply have none yet.
const LEAGUE_ALIAS = {
  'Daeshon Francis': 'דשון פרנסיס', 'Zack Bryant': 'זאק בראיינט',
  'Noah Carter': 'נואה קרטר', 'DJ Burns': "די-ג'יי ברנס",
};
const leaguePlayerFor = (league, name) => {
  const heb = LEAGUE_ALIAS[name];
  return heb ? (league?.players || []).find((p) => p.name === heb) || null : null;
};
const relTime = (iso) => {
  if (!iso) return '';
  const diff = (Date.now() - new Date(iso).getTime()) / 60000;
  if (diff < 1) return 'just now';
  if (diff < 60) return `${Math.round(diff)}m ago`;
  if (diff < 1440) return `${Math.round(diff / 60)}h ago`;
  return `${Math.round(diff / 1440)}d ago`;
};

function FormDots({ form }) {
  return (
    <span style={{ display: 'inline-flex', gap: 3 }}>
      {(form || []).map((r, i) => (
        <span key={i} title={r === 'W' ? 'Win' : 'Loss'} style={{ width: 14, height: 14, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: FN, fontSize: 8.5, fontWeight: 800, color: '#fff', background: r === 'W' ? '#37B27C' : '#DE4E3B' }}>{r}</span>
      ))}
    </span>
  );
}

function StandingsTable({ standings }) {
  const cols = [
    { k: 'gp', h: 'GP' }, { k: 'w', h: 'W' }, { k: 'l', h: 'L' },
    { k: 'pf', h: 'PF' }, { k: 'pa', h: 'PA' }, { k: 'diff', h: '+/–' },
  ];
  const th = { fontFamily: FN, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.tm, padding: '8px 10px', textAlign: 'right', whiteSpace: 'nowrap' };
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 560 }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${C.cardBd}` }}>
            <th style={{ ...th, textAlign: 'center', width: 34 }}>#</th>
            <th style={{ ...th, textAlign: 'left' }}>Team</th>
            {cols.map((c) => <th key={c.k} style={{ ...th, textAlign: 'center' }}>{c.h}</th>)}
            <th style={{ ...th, textAlign: 'center' }}>Form</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((s) => {
            const bh = isBH(s.team);
            const td = { fontFamily: FN, fontSize: 12.5, color: C.tx, padding: '9px 10px', textAlign: 'center', fontVariantNumeric: 'tabular-nums' };
            return (
              <tr key={s.team} className="bhbc-row" style={{ borderBottom: `0.25px solid ${C.cardBd}`, background: bh ? `color-mix(in srgb, ${NAVY} 8%, transparent)` : 'transparent', borderLeft: bh ? `3px solid ${ORANGE}` : '3px solid transparent' }}>
                <td style={{ ...td, fontWeight: 800, color: bh ? ORANGE_DEEP : C.td }}>{s.rank}</td>
                <td style={{ ...td, textAlign: 'left', fontWeight: bh ? 800 : 600, color: C.tx, whiteSpace: 'nowrap' }}>{s.team}</td>
                <td style={td}>{s.gp}</td>
                <td style={{ ...td, fontWeight: 700, color: '#2E9E6B' }}>{s.w}</td>
                <td style={{ ...td, color: C.td }}>{s.l}</td>
                <td style={td}>{s.pf}</td>
                <td style={td}>{s.pa}</td>
                <td style={{ ...td, fontWeight: 700, color: s.diff > 0 ? '#2E9E6B' : s.diff < 0 ? '#C9462F' : C.td }}>{s.diff > 0 ? '+' : ''}{s.diff}</td>
                <td style={{ ...td, padding: '9px 10px' }}><FormDots form={s.form} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Roster-driven: one row per CURRENT squad athlete, showing their official
// league stats (matched via LEAGUE_ALIAS) or dashes if they've no games yet.
// No departed players — the table IS the roster.
function PlayerStatsTable({ roster, league, onOpen }) {
  const [sort, setSort] = useState('ppg');
  const cols = [
    { k: 'gp', h: 'GP' }, { k: 'mpg', h: 'MPG' }, { k: 'ppg', h: 'PPG' },
    { k: 'rpg', h: 'RPG' }, { k: 'apg', h: 'APG' }, { k: 'tpp', h: '3P%' },
    { k: 'ftp', h: 'FT%' }, { k: 'pirpg', h: 'PIR' },
  ];
  const dash = (k, v) => (v == null ? '—' : k === 'tpp' || k === 'ftp' ? `${v}%` : v);
  const items = (roster || []).map((t) => ({ t, s: leaguePlayerFor(league, t.name) }))
    .sort((a, b) => ((b.s ? b.s[sort] : -1)) - ((a.s ? a.s[sort] : -1)) || (a.t.jersey ?? 999) - (b.t.jersey ?? 999));
  const th = (k, h, first) => (
    <th key={k} onClick={() => k !== 'name' && setSort(k)} style={{ fontFamily: FN, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: sort === k ? ORANGE_DEEP : C.tm, padding: '8px 9px', textAlign: first ? 'left' : 'center', whiteSpace: 'nowrap', cursor: k === 'name' ? 'default' : 'pointer', userSelect: 'none' }}>{h}{sort === k ? ' ↓' : ''}</th>
  );
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 620 }}>
        <thead><tr style={{ borderBottom: `1px solid ${C.cardBd}` }}>{th('name', 'Player', true)}{cols.map((c) => th(c.k, c.h))}</tr></thead>
        <tbody>
          {items.map(({ t, s }) => {
            const td = { fontFamily: FN, fontSize: 12.5, color: s ? C.tx : C.tm, padding: '9px 9px', textAlign: 'center', fontVariantNumeric: 'tabular-nums' };
            return (
              <tr key={t.id} className="bhbc-row" onClick={() => onOpen(t.id)} style={{ borderBottom: `0.25px solid ${C.cardBd}`, cursor: 'pointer' }}>
                <td style={{ ...td, textAlign: 'left', fontWeight: 700, color: C.tx, whiteSpace: 'nowrap' }}><span style={{ color: ORANGE_DEEP, marginRight: 7, fontVariantNumeric: 'tabular-nums' }}>{t.jersey ?? '—'}</span>{t.name}</td>
                <td style={{ ...td, color: C.td }}>{dash('gp', s ? s.gp : null)}</td>
                <td style={td}>{dash('mpg', s ? s.mpg : null)}</td>
                <td style={{ ...td, fontWeight: 800, color: s ? ORANGE_DEEP : C.tm }}>{dash('ppg', s ? s.ppg : null)}</td>
                <td style={td}>{dash('rpg', s ? s.rpg : null)}</td>
                <td style={td}>{dash('apg', s ? s.apg : null)}</td>
                <td style={{ ...td, color: C.td }}>{dash('tpp', s ? s.tpp : null)}</td>
                <td style={{ ...td, color: C.td }}>{dash('ftp', s ? s.ftp : null)}</td>
                <td style={{ ...td, fontWeight: 700 }}>{dash('pirpg', s ? s.pirpg : null)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ResultsList({ games, bhbcOnly }) {
  const played = games.filter((g) => g.played && (!bhbcOnly || isBH(g.home) || isBH(g.away)));
  const upcoming = games.filter((g) => !g.played && (!bhbcOnly || isBH(g.home) || isBH(g.away)));
  const byRound = {};
  [...played].reverse().forEach((g) => { (byRound[g.round] = byRound[g.round] || []).push(g); });
  const rounds = Object.keys(byRound).map(Number).sort((a, b) => b - a);
  const Row = ({ g }) => {
    const bhHome = isBH(g.home), bh = bhHome || isBH(g.away);
    const won = g.played && ((bhHome && g.hs > g.as) || (!bhHome && g.as > g.hs));
    const mark = { fontFamily: FN, fontSize: 12.5, fontWeight: 800, fontVariantNumeric: 'tabular-nums' };
    const travelBits = g.travel ? [g.travel.out, g.travel.back].filter(Boolean).map((l) => l.tbd ? `${monDay(l.date)} TBD` : `${monDay(l.date)} ${l.flight}`) : [];
    const detail = !g.played ? [g.comp, g.venue, travelBits.length ? `✈ ${travelBits.join(' · ')}` : null].filter(Boolean).join('  ·  ') : null;
    return (
      <div style={{ borderBottom: `0.25px solid ${C.cardBd}`, background: bh ? `color-mix(in srgb, ${NAVY} 7%, transparent)` : 'transparent', borderLeft: bh ? `3px solid ${ORANGE}` : '3px solid transparent' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '58px 1fr auto', gap: 12, alignItems: 'center', padding: detail ? '9px 10px 3px' : '9px 10px' }}>
          <div style={{ fontFamily: FN, fontSize: 10.5, color: C.td, fontVariantNumeric: 'tabular-nums' }}>{g.date ? g.date.slice(5).replace('-', '/') : ''}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <span style={{ fontFamily: FN, fontSize: 12.5, fontWeight: isBH(g.home) ? 800 : 500, color: C.tx, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'right', flex: 1 }}>{g.home}</span>
            {g.played
              ? <span style={{ ...mark, color: C.tx, background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, padding: '2px 8px', whiteSpace: 'nowrap' }}>{g.hs}<span style={{ color: C.tm, margin: '0 4px' }}>–</span>{g.as}</span>
              : <span style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, color: C.tm, letterSpacing: '0.06em' }}>vs</span>}
            <span style={{ fontFamily: FN, fontSize: 12.5, fontWeight: isBH(g.away) ? 800 : 500, color: C.tx, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>{g.away}</span>
          </div>
          {bh && g.played
            ? <span style={{ fontFamily: FN, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.04em', color: '#fff', background: won ? '#37B27C' : '#DE4E3B', padding: '2px 7px' }}>{won ? 'W' : 'L'}</span>
            : <span style={{ width: 22 }} />}
        </div>
        {detail && <div style={{ padding: '0 10px 8px 70px', fontFamily: FN, fontSize: 9.5, color: C.tm, letterSpacing: '0.02em' }}>{detail}</div>}
      </div>
    );
  };
  if (!played.length && !upcoming.length) return <div style={{ fontFamily: FB, fontSize: 12.5, color: C.td, padding: '16px 0', textAlign: 'center' }}>No games yet.</div>;
  return (
    <div>
      {upcoming.length > 0 && (
        <div style={{ marginBottom: rounds.length ? 14 : 0 }}>
          <div style={{ fontFamily: FN, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: ORANGE_DEEP, padding: '4px 10px 8px' }}>Upcoming</div>
          {upcoming.slice(0, 8).map((g, i) => <Row key={i} g={g} />)}
        </div>
      )}
      {rounds.map((r) => (
        <div key={r} style={{ marginBottom: 10 }}>
          <div style={{ fontFamily: FN, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.tm, padding: '4px 10px 6px' }}>Round {r}</div>
          {byRound[r].map((g, i) => <Row key={i} g={g} />)}
        </div>
      ))}
    </div>
  );
}

// Convert BHBC fixtures (club schedule) into result-row shape so upcoming games
// show in the Games tab even before basket.co.il has any score for them.
function fixturesToGames(fixtures) {
  return (fixtures || []).filter((f) => f.type === 'game').map((f) => ({
    round: null, date: f.date, time: f.start, comp: f.comp,
    home: f.home === false ? (f.opponent || 'Opponent') : 'Bnei Herzliya',
    away: f.home === false ? 'Bnei Herzliya' : (f.opponent || 'Opponent'),
    hs: null, as: null, played: false, timeTBD: f.timeTBD, venue: f.venue, travel: f.travel,
  }));
}

function LeagueView({ league, roster, fixtures, onOpen }) {
  const leagueGames = Array.isArray(league.games) ? league.games : [];
  const playedGames = leagueGames.filter((g) => g.played);
  // Merge: played results from basket.co.il + upcoming from the club fixtures.
  const upcomingFx = fixturesToGames(fixtures).filter((g) => !playedGames.some((p) => p.date === g.date));
  const allGames = [...playedGames, ...upcomingFx];
  const hasStats = (league.players || []).length > 0 || playedGames.length > 0;
  const t = league.team || {};
  const played = t.gp || 0;
  const summary = [
    { k: 'Record', v: played ? `${t.w}–${t.l}` : '—', c: C.tx },
    { k: 'Points', v: played ? t.ppg : '—', sub: 'per game', c: C.tx },
    { k: 'Allowed', v: played ? t.oppg : '—', sub: 'per game', c: C.tx },
    { k: 'Margin', v: played ? `${(t.ppg - t.oppg) > 0 ? '+' : ''}${(t.ppg - t.oppg).toFixed(1)}` : '—', c: played && (t.ppg - t.oppg) >= 0 ? '#2E9E6B' : played ? '#C9462F' : C.tx },
  ];
  return (
    <>
      {/* Team stats + live badge */}
      <Card padding={18} leftStripe={ORANGE} header={secTitle('Team Stats')} headerRight={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#fff' }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ED88A' }} />Live{league.season ? ` · ${league.season}` : ''}{league.updatedAt ? ` · ${relTime(league.updatedAt)}` : ''}</span>}>
        {played ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }}>
            {summary.map((s, i) => (
              <div key={s.k} style={{ padding: '14px 18px', borderLeft: i ? `1px solid ${C.cardBd}` : 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ fontFamily: FN, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.tm }}>{s.k}</div>
                <div style={{ fontFamily: FN, fontWeight: 800, fontSize: 26, lineHeight: 1, color: s.c, fontVariantNumeric: 'tabular-nums' }}>{s.v}</div>
                {s.sub && <div style={{ fontFamily: FN, fontSize: 9, color: C.td, letterSpacing: '0.04em' }}>{s.sub}</div>}
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontFamily: FB, fontSize: 12.5, color: C.td, padding: '6px 2px' }}>No games played yet this season — team stats fill in automatically after tip-off. Last-season stats show on each athlete below.</div>
        )}
      </Card>

      {/* Player stats — the roster, with official league numbers */}
      <Card padding={18} leftStripe={NAVY} header={secTitle('Player Stats')} headerRight={<span style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#fff' }}>tap a column to sort</span>}>
        <PlayerStatsTable roster={roster} league={league} onOpen={onOpen} />
        <div style={{ fontFamily: FB, fontSize: 11, color: C.td, marginTop: 8 }}>Official league stats (מנהלת ליגת העל){league.season ? ` · ${league.season}` : ''} — tap any athlete for their full profile &amp; last game.</div>
      </Card>

      {/* Games — BHBC only */}
      <Card padding={18} leftStripe={NAVY} header={secTitle('Games')}>
        {allGames.length ? <ResultsList games={allGames} bhbcOnly /> : <div style={{ fontFamily: FB, fontSize: 12.5, color: C.td, padding: '14px 0', textAlign: 'center' }}>Fixtures load as the league publishes them.</div>}
      </Card>
    </>
  );
}

// ============================ MEDICAL / INJURY ============================
// A shared record for Ohad + the physical therapist: injuries, current status,
// pain, return-to-play target and a dated rehab-progress log per athlete.
const MED_STATUS = {
  available: { label: 'Available', color: '#37B27C' },
  limited: { label: 'Limited', color: '#E0A73A' },
  'non-contact': { label: 'Non-contact', color: '#4F9DE0' },
  out: { label: 'Out', color: '#DE4E3B' },
};
const BODY_PARTS = ['Ankle', 'Knee', 'Hip', 'Hamstring', 'Groin', 'Quad', 'Calf', 'Achilles', 'Lower back', 'Shoulder', 'Elbow', 'Wrist', 'Hand', 'Foot', 'Head / Concussion', 'Other'];
const INJURY_TYPES = ['Strain', 'Sprain', 'Contusion', 'Tendinopathy', 'Overuse', 'Fracture', 'Dislocation', 'Illness', 'Other'];
const activeInjuries = (medical, id) => ((medical[id] || {}).injuries || []).filter((i) => !i.resolved);

function StatusPill({ status, small }) {
  const s = MED_STATUS[status] || MED_STATUS.available;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: FN, fontSize: small ? 9.5 : 10.5, fontWeight: 700, letterSpacing: '0.03em', color: s.color, background: `color-mix(in srgb, ${s.color} 13%, transparent)`, border: `1px solid color-mix(in srgb, ${s.color} 38%, transparent)`, padding: small ? '2px 7px' : '3px 9px', whiteSpace: 'nowrap' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.color }} />{s.label}
    </span>
  );
}

function MedicalView({ roster, medical, canMedical = true, onReport, onEdit, onOpen }) {
  const injured = roster.filter((t) => activeInjuries(medical, t.id).length > 0);
  const cleared = roster.filter((t) => activeInjuries(medical, t.id).length === 0);
  const rows = injured.flatMap((t) => activeInjuries(medical, t.id).map((inj) => ({ t, inj })));
  const counts = { out: 0, limited: 0, nc: 0 };
  rows.forEach(({ inj }) => { if (inj.status === 'out') counts.out++; else if (inj.status === 'limited') counts.limited++; else if (inj.status === 'non-contact') counts.nc++; });
  return (
    <>
      <Card padding={18} leftStripe={ORANGE} header={secTitle('Medical · Injury Board')} headerRight={<span style={{ fontFamily: FN, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#fff' }}>{rows.length} active · {canMedical ? 'Ohad + PT' : 'view only'}</span>}>
        <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
          {[['Out', counts.out, '#DE4E3B'], ['Limited', counts.limited, '#E0A73A'], ['Non-contact', counts.nc, '#4F9DE0'], ['Cleared', cleared.length, '#37B27C']].map(([k, n, c]) => (
            <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontFamily: FN, fontSize: 26, fontWeight: 800, color: n ? c : C.td, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{n}</span>
              <span style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.tm }}>{k}</span>
            </div>
          ))}
        </div>
      </Card>

      {rows.length > 0 && (
        <Card padding={18} leftStripe={NAVY} header={secTitle('Active Injuries')}>
          <div>
            {rows.map(({ t, inj }) => {
              const days = inj.onsetDate ? dayDiff(todayISO(), inj.onsetDate) : null;
              return (
                <div key={t.id + inj.id} className="bhbc-row" onClick={() => canMedical && onEdit(t.id, inj.id)} style={{ display: 'grid', gridTemplateColumns: '150px 1fr 120px 110px auto', gap: 12, alignItems: 'center', padding: '11px 0', borderBottom: `0.25px solid ${C.cardBd}`, cursor: canMedical ? 'pointer' : 'default' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <span style={{ fontFamily: FN, fontSize: 11, fontWeight: 700, color: ORANGE_DEEP, fontVariantNumeric: 'tabular-nums' }}>{t.jersey ?? '—'}</span>
                    <span style={{ fontFamily: FN, fontSize: 13, fontWeight: 700, color: C.tx, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</span>
                  </div>
                  <div style={{ fontFamily: FB, fontSize: 12.5, color: C.tx, minWidth: 0 }}>{[inj.bodyPart, inj.side && inj.side !== 'N/A' ? inj.side : '', inj.type].filter(Boolean).join(' · ')}</div>
                  <StatusPill status={inj.status} />
                  <div style={{ fontFamily: FN, fontSize: 11, color: C.td, fontVariantNumeric: 'tabular-nums' }}>{days != null ? `${days}d` : '—'}{inj.pain != null && inj.pain !== '' ? ` · pain ${inj.pain}` : ''}</div>
                  <div style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: NAVY }}>{canMedical ? 'Update ›' : ''}</div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <Card padding={18} leftStripe={NAVY} header={secTitle('Squad Health')}>
        <div>
          {roster.map((t) => {
            const act = activeInjuries(medical, t.id);
            const status = act.length ? (act.find((i) => i.status === 'out') || act.find((i) => i.status === 'limited') || act[0]).status : 'available';
            const hist = ((medical[t.id] || {}).injuries || []).length;
            return (
              <div key={t.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 12, alignItems: 'center', padding: '10px 0', borderBottom: `0.25px solid ${C.cardBd}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0, cursor: 'pointer' }} onClick={() => onOpen(t.id)}>
                  <span style={{ fontFamily: FN, fontSize: 11, fontWeight: 700, color: ORANGE_DEEP, fontVariantNumeric: 'tabular-nums', width: 20 }}>{t.jersey ?? '—'}</span>
                  <span style={{ fontFamily: FN, fontSize: 13, fontWeight: 600, color: C.tx }}>{t.name}</span>
                  {hist > 0 && <span style={{ fontFamily: FN, fontSize: 9, color: C.tm, letterSpacing: '0.04em' }}>· {hist} record{hist > 1 ? 's' : ''}</span>}
                </div>
                <StatusPill status={status} small />
                {canMedical
                  ? <button onClick={() => (act.length ? onEdit(t.id, act[0].id) : onReport(t.id))} style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: act.length ? NAVY : '#fff', background: act.length ? 'transparent' : NAVY, border: act.length ? `1px solid ${C.cardBd}` : 'none', padding: '6px 11px', cursor: 'pointer' }}>{act.length ? 'View' : '+ Report'}</button>
                  : <span style={{ width: 64 }} />}
              </div>
            );
          })}
        </div>
      </Card>
    </>
  );
}

function InjuryModal({ athlete, injury, onClose, onSave }) {
  const [bodyPart, setBodyPart] = useState(injury?.bodyPart || '');
  const [side, setSide] = useState(injury?.side || 'N/A');
  const [type, setType] = useState(injury?.type || '');
  const [onsetDate, setOnsetDate] = useState(injury?.onsetDate || todayISO());
  const [status, setStatus] = useState(injury?.status || 'out');
  const [pain, setPain] = useState(injury?.pain ?? '');
  const [mechanism, setMechanism] = useState(injury?.mechanism || '');
  const [rtpTarget, setRtpTarget] = useState(injury?.rtpTarget || '');
  const [notes, setNotes] = useState(injury?.notes || '');
  const [resolved, setResolved] = useState(injury?.resolved || false);
  const [progress, setProgress] = useState(injury?.progress || []);
  const [pNote, setPNote] = useState(''); const [pPain, setPPain] = useState('');
  const addProgress = () => {
    if (!pNote.trim() && pPain === '') return;
    setProgress((p) => [{ date: todayISO(), note: pNote.trim(), pain: pPain === '' ? null : Number(pPain), status }, ...p]);
    setPNote(''); setPPain('');
  };
  const save = () => {
    if (!bodyPart) { toast('Pick a body part'); return; }
    onSave({
      id: injury?.id || 'inj_' + Math.random().toString(36).slice(2, 9),
      bodyPart, side, type, onsetDate, status, pain: pain === '' ? null : Number(pain),
      mechanism: mechanism.trim(), rtpTarget, notes: notes.trim(), resolved, progress,
      createdAt: injury?.createdAt || new Date().toISOString(),
    });
  };
  const sel = { fontFamily: FN, fontSize: 12.5, color: C.tx, background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderRadius: 0, padding: '0 8px', width: '100%', height: 34, boxSizing: 'border-box' };
  const lbl = { fontSize: 9, fontWeight: 700, color: C.tm, textTransform: 'uppercase', letterSpacing: '0.16em', fontFamily: FN, marginBottom: 4, display: 'block' };
  return (
    <Modal open onClose={onClose} wide title={`${injury ? 'Update' : 'Report'} injury · #${athlete.jersey ?? '—'} ${athlete.name}`}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 0.9fr 1.1fr', gap: 10 }}>
          <div><label style={lbl}>Body part</label><select value={bodyPart} onChange={(e) => setBodyPart(e.target.value)} style={sel}><option value="">— select —</option>{BODY_PARTS.map((b) => <option key={b} value={b}>{b}</option>)}</select></div>
          <div><label style={lbl}>Side</label><select value={side} onChange={(e) => setSide(e.target.value)} style={sel}>{['N/A', 'Left', 'Right', 'Bilateral'].map((s) => <option key={s} value={s}>{s}</option>)}</select></div>
          <div><label style={lbl}>Type</label><select value={type} onChange={(e) => setType(e.target.value)} style={sel}><option value="">—</option>{INJURY_TYPES.map((tp) => <option key={tp} value={tp}>{tp}</option>)}</select></div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          <Input label="Onset date" type="date" value={onsetDate} onChange={(e) => setOnsetDate(e.target.value)} />
          <div><label style={lbl}>Pain (0–10)</label><input type="number" min="0" max="10" value={pain} onChange={(e) => setPain(e.target.value)} placeholder="—" style={sel} /></div>
          <Input label="Return-to-play target" type="date" value={rtpTarget} onChange={(e) => setRtpTarget(e.target.value)} />
        </div>
        <div>
          <label style={lbl}>Current status</label>
          <div style={{ display: 'inline-flex', border: `1px solid ${C.cardBd}`, flexWrap: 'wrap' }}>
            {Object.entries(MED_STATUS).map(([k, s]) => (
              <button key={k} type="button" onClick={() => setStatus(k)} style={{ fontFamily: FN, fontSize: 11, fontWeight: 700, color: status === k ? '#fff' : C.td, background: status === k ? s.color : 'transparent', border: 'none', padding: '7px 14px', cursor: 'pointer' }}>{s.label}</button>
            ))}
          </div>
        </div>
        <div><label style={lbl}>Mechanism / how it happened</label><input value={mechanism} onChange={(e) => setMechanism(e.target.value)} placeholder="e.g. landed awkwardly on a rebound" style={sel} /></div>
        <div><label style={lbl}>Notes (diagnosis, plan, PT observations)</label><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} style={{ ...sel, height: 'auto', padding: '8px', resize: 'vertical' }} /></div>

        {/* Rehab progress log */}
        <div style={{ border: `1px solid ${C.cardBd}` }}>
          <div style={{ padding: '8px 12px', background: NAVY, fontFamily: FN, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#fff' }}>Rehab progress</div>
          <div style={{ display: 'flex', gap: 8, padding: '10px 12px', borderBottom: progress.length ? `1px solid ${C.cardBd}` : 'none', alignItems: 'center' }}>
            <input value={pNote} onChange={(e) => setPNote(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addProgress(); }} placeholder="Progress note for today…" style={{ ...sel, flex: 1 }} />
            <input type="number" min="0" max="10" value={pPain} onChange={(e) => setPPain(e.target.value)} placeholder="pain" style={{ ...sel, width: 72 }} />
            <Btn onClick={addProgress} style={{ background: ORANGE, borderColor: ORANGE, color: '#fff' }}>Add</Btn>
          </div>
          {progress.length > 0 && (
            <div style={{ maxHeight: 160, overflowY: 'auto' }}>
              {progress.map((p, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, padding: '8px 12px', borderBottom: `0.25px solid ${C.cardBd}`, fontFamily: FN, fontSize: 12, alignItems: 'baseline' }}>
                  <span style={{ color: C.td, width: 50, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{p.date.slice(5)}</span>
                  <span style={{ color: C.tx, flex: 1, minWidth: 0 }}>{p.note || '—'}</span>
                  {p.pain != null && <span style={{ color: ORANGE_DEEP, fontWeight: 700, flexShrink: 0 }}>pain {p.pain}</span>}
                </div>
              ))}
            </div>
          )}
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontFamily: FB, fontSize: 12.5, color: C.tx }}>
          <input type="checkbox" checked={resolved} onChange={(e) => setResolved(e.target.checked)} style={{ accentColor: '#37B27C', width: 16, height: 16 }} />
          Mark resolved / cleared to play
        </label>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn onClick={save} style={{ background: NAVY, borderColor: NAVY, color: '#fff' }}>Save record</Btn>
        </div>
      </div>
    </Modal>
  );
}

function LogModal({ open, initialAthlete, roster, fixtures = [], availableCount = 0, onClose, onSave }) {
  const [scope, setScope] = useState('athlete');
  const [athleteId, setAthleteId] = useState(initialAthlete);
  const [date, setDate] = useState(todayISO());
  const [type, setType] = useState('Practice');
  const [minutes, setMinutes] = useState('');
  const [rpe, setRpe] = useState('');
  const [pain, setPain] = useState(''); const [sleep, setSleep] = useState(''); const [energy, setEnergy] = useState('');
  const preview = sessionLoad(minutes, rpe);
  const canSave = scope === 'squad' ? preview > 0 : (athleteId && (preview > 0 || pain || sleep || energy));
  const selStyle = { fontFamily: FB, fontSize: 13, color: C.tx, background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderRadius: 0, padding: '9px 10px', width: '100%' };
  const lab = { fontSize: 9, fontWeight: 700, color: C.tm, textTransform: 'uppercase', letterSpacing: '0.18em', fontFamily: FN, textAlign: 'center' };
  return (
    <Modal open={open} onClose={onClose} title="Log a session">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'inline-flex', border: `1px solid ${C.cardBd}`, alignSelf: 'center' }}>
          {[['athlete', 'One athlete'], ['squad', 'Whole squad']].map(([k, l]) => (
            <button key={k} type="button" onClick={() => setScope(k)} style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: scope === k ? '#fff' : C.td, background: scope === k ? NAVY : 'transparent', border: 'none', padding: '6px 14px', cursor: 'pointer' }}>{l}</button>
          ))}
        </div>
        {scope === 'athlete' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={lab}>Athlete</label>
            <select value={athleteId} onChange={(e) => setAthleteId(e.target.value)} style={selStyle}>
              {roster.length === 0 && <option value="">— add roster first —</option>}
              {roster.map((t) => <option key={t.id} value={t.id}>{t.jersey != null ? `#${t.jersey} ` : ''}{t.name}</option>)}
            </select>
          </div>
        ) : (
          <div style={{ fontFamily: FB, fontSize: 12.5, color: C.td, textAlign: 'center', padding: '4px 0' }}>Logs this session for <b style={{ color: C.tx }}>{availableCount}</b> available athlete{availableCount === 1 ? '' : 's'} — skips anyone Out.</div>
        )}
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
                  {f.start} {FX_LABEL[f.type] || 'Session'} {f.minutes} min
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
          <Btn disabled={!canSave} onClick={() => onSave({ scope, athleteId, date, type, minutes, rpe, readiness: { pain, sleep, energy } })}
            style={{ background: canSave ? NAVY : undefined, borderColor: canSave ? NAVY : undefined, color: canSave ? '#fff' : undefined }}>Save</Btn>
        </div>
      </div>
    </Modal>
  );
}
