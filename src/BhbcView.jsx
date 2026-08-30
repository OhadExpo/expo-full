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
import { Card, CollapsibleSection, Btn, Input, Modal, EmptyState, toast, usePersistentState } from './ui';
import { ThemeToggle } from './ThemeToggle';
import { useTheme } from './hooks/useTheme';
import { bhbcT, BhbcLangCtx, useT, useHe, setBhbcDateLang, dowFor, monDayFor, fxLabelFor } from './bhbcHe';
import { acwrFromDaily, sessionLoad, monotonyStrain } from './acwrEngine';
import { returnToLoadFlags } from './bhbcReturnLoad';
import { applyGameMinutes, gameMinutesOf, gameRpeOf } from './bhbcGameLoad';
import { readinessAutoreg } from './readinessAutoreg';
import BWChart from './BwChart';
import { sessionSig } from './bhbcSession.js';

// EXPO's own group/single session logger — reused INSIDE the BHBC portal, scoped
// to the BHBC roster. It writes to client_workouts (athlete-visible), so a BHBC
// session syncs to each player's portal + EXPO review, exactly like the main app.
const SessionsView = lazy(() => import('./SessionsView'));
// EXPO's read-only program/portal preview — shown INSIDE the BHBC zone so coaches
// can view an athlete's program here instead of jumping to the EXPO coach app.
const CoachPreviewPortal = lazy(() => import('./CoachPreviewPortal'));

const NAVY = '#1E3D74', NAVY_DEEP = '#14294F', ORANGE = '#F26A2B', ORANGE_DEEP = '#D9541A';
// One ink + one hairline for every control in the header's right-hand cluster
// (theme toggle, Sign out, ‹ EXPO, Preview as coach). They were drifting apart
// — Sign out at 0.7 next to a toggle at 0.85 — which reads as two different
// control families sitting side by side.
// One height for every control in the zone header row. Fixed box + centred
// content, so Hebrew and English sit identically inside it.
const HDR_BTN_H = 28;
// One height for an action sitting inside a card ROW (+ Report, View ›,
// UPDATE, MED ✎). They do the same job, so they are the same size.
const ROW_BTN_H = 26;
const HDR_INK = 'rgba(255,255,255,0.85)';
const HDR_BD = 'rgba(255,255,255,0.18)';
// Understated dark-navy header bar (EXPO-header feel, not a loud bright-navy block).
const HDR_BG = '#0E1C38';
// Scoped theme override — reskins EXPO's components to BHBC while keeping their
// geometry + light/dark behaviour. Strips go navy (white title text stays legible)
// in both themes; card hairlines get a navy tint blended into the theme border.
// Card header strips = DEEP navy (#14294F) in BOTH themes. Earlier tries were
// wrong at both extremes: bright #1E3D74 read as a loud bar, and falling back
// to the app default made the strip inherit EXPO's cyan (light) / a muddy
// black+orange brown (dark) — both unrelated to the club brand. Deep navy is
// the club identity colour, dark enough that the white strip titles stay
// readable in light mode too, and it's calmer than the old bright blue.
// Orange is the ACTION accent (buttons, left stripes) via the ORANGE constant.
// --c-ac is pinned to the same deep navy so the RefinedHeaderStrip's
// color-mix(stripBg, ac) resolves to pure navy instead of a muddy blend.
const TOKENS = {
  '--c-ac': NAVY_DEEP,
  '--c-stripBg': NAVY_DEEP,
  '--c-cardBd': 'color-mix(in srgb, #1E3D74 20%, var(--c-bd))',
};
const BAND = { detrained: '#4F9DE0', low: '#37B27C', elevated: '#E0A73A', high: '#DE4E3B', none: '#7C828B' };
// ONE section-title treatment everywhere (must match CollapsibleSection's title:
// FN / 13 / 700 / 0.08em / uppercase / white). Card headers are plain strings by
// default, so pass them through this to keep every strip title identical.
// Every card title in the zone goes through here, which makes it the one place
// Hebrew has to be applied for all fourteen of them. It returns a COMPONENT
// rather than a plain span so it can read the language from context — a
// module-level helper cannot call a hook, and translating at fourteen call
// sites instead would guarantee one gets missed.
function SecTitleEl({ s }) {
  const tr = useT();
  return <span style={{ fontFamily: FN, fontSize: 13, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#fff', whiteSpace: 'normal', overflowWrap: 'break-word' }}>{typeof s === 'string' ? tr(s) : s}</span>;
}
const secTitle = (s) => <SecTitleEl s={s} />;

// LOCAL calendar date, not UTC. toISOString() is UTC, so between 00:00 and
// 03:00 Israel time it returns YESTERDAY — "Today" would show the wrong day and
// a late-night session/availability write would land on the previous date
// (audit 08-22). Same convention as MealLogger/ChallengesView/BookingPublic.
const localISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const todayISO = () => localISO(new Date());
const daysAgoISO = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return localISO(d); };
// Nationality as text (flag emoji doesn't render on Windows Chrome → shows "US"
// letters at a wrong baseline and breaks row alignment).
const flag = (nat) => String(nat || '').split('/').map((c) => c.trim()).filter(Boolean).join(' · ');
const heightM = (cm) => (cm ? (cm / 100).toFixed(2) + 'm' : '');
// `availability` is a DAY-level fact (medical / personal — it gates ACWR and
// feeds the medical view). `attendance` is per SLOT, keyed `YYYY-MM-DD|HH:MM`,
// because a player can miss the morning practice and train in the evening —
// which the day-level flag could not express at all (Ohad 08-24).
const emptyRec = () => ({ loads: {}, sessions: {}, readiness: {}, availability: {}, attendance: {} });
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
const dow = (iso) => { const d = parseISO(iso); return dowFor(d, DOW[d.getDay()]); };
const monDay = (iso) => { const d = parseISO(iso); return monDayFor(d, `${d.getDate()} ${MON[d.getMonth()]}`); };
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

export default function BhbcView({ trainees = [], setTrainees, bhbcLoads = {}, setBhbcLoads, bhbcFixtures = [], setBhbcFixtures, league = {}, medical = {}, setMedical, sessionPlans = {}, setSessionPlans, planIndex = [], exercises = [], clientWorkouts = [], setClientWorkouts, workouts = [], setWorkouts, onDecrementSession, portalVis = {}, bwLog = [], weeklyFocus = {}, onOpenTrainee, onExit, coach = false, onSignOut, canMedical = true, canLogLoad = false, currentUser = '', onLocalWrite }) {
  // The club zone OPENS WHITE, always (Ohad). The crest and the navy/orange
  // palette were built on white, and a coach arriving in whatever theme the
  // last session left behind saw a different club. Forced once on mount, not
  // on every render — the toggle in the header still works, so a coach who
  // deliberately switches to dark inside the zone keeps it for the session.
  // Hebrew for the zone. The club's coaches are Israeli; the S&C zone was
  // English-only. Persisted per person, defaults to English so nothing moves
  // for anyone who does not ask for it.
  const [bhbcLang, setBhbcLang] = usePersistentState('bhbc-lang', 'en');
  const he = bhbcLang === 'he';
  setBhbcDateLang(bhbcLang);
  const tr = React.useCallback((str) => bhbcT(bhbcLang, str), [bhbcLang]);
  const { setTheme: setZoneTheme } = useTheme();
  useEffect(() => {
    setZoneTheme('light');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Broadcast a change to other open zones after any local write (shared-sheet sync).
  const notify = useCallback(() => { if (onLocalWrite) onLocalWrite(); }, [onLocalWrite]);
  const [manageOpen, setManageOpen] = useState(false);
  const [newAthlete, setNewAthlete] = useState('');
  const [logFor, setLogFor] = useState(null);
  const [detailFor, setDetailFor] = useState(null);
  const [practiceOpen, setPracticeOpen] = useState(false);
  const [gameEdit, setGameEdit] = useState(false);
  const [programFor, setProgramFor] = useState(null);
  const [injuryFor, setInjuryFor] = useState(null); // { athleteId, injuryId? } | null
  // Which played game we are recording minutes for. Minutes on court are the
  // biggest load a player takes and the board could not see them at all.
  const [minutesFor, setMinutesFor] = useState(null);
  const [view, setView] = useState('overview');   // overview | schedule | roster
  const [schedMode, setSchedMode] = useState('calendar'); // calendar | list
  const [sessionMode, setSessionMode] = useState('group'); // group | single
  // Owner-only "Preview as coach": renders the exact reduced surface a club coach
  // sees (no Manage roster / no ‹EXPO, medical view-only) without needing an account.
  const [previewCoach, setPreviewCoach] = useState(false);
  const asCoach = coach || previewCoach;
  // Ohad 2026-08-28: "allow tomer to log practice details and log rpe and time
  // and everything related". `asCoach` is one boolean gating EVERY write, so
  // flipping it would have handed over roster management and the S&C session
  // runner too. `canLog` is the narrow right he actually asked for: record a
  // practice — its minutes, its RPE, who was available. Never granted in
  // preview mode, where nothing may be written at all.
  const canLog = (!asCoach || canLogLoad) && !previewCoach;
  const effCanMedical = canMedical && !previewCoach;

  const roster = useMemo(
    () => trainees.filter((t) => t && t.team === 'BHBC' && t.status !== 'Archived')
      .sort((a, b) => (a.jersey ?? 999) - (b.jersey ?? 999)),
    [trainees]
  );
  const today = todayISO();
  // Keyed on `today`, not [] — a tab left open past midnight kept the windows
  // pinned to the mount day while ACWR moved on, so the sparkline and the ratio
  // disagreed until a reload (audit 08-22 #30).
  const last14 = useMemo(() => Array.from({ length: 14 }, (_, i) => daysAgoISO(13 - i)), [today]);
  const last28 = useMemo(() => Array.from({ length: 28 }, (_, i) => daysAgoISO(27 - i)), [today]);

  const rows = useMemo(() => roster.map((t) => {
    const rec = bhbcLoads[t.id] || emptyRec();
    const acwr = acwrFromDaily(rec.loads || {}, today);
    const series = last14.map((d) => (rec.loads && rec.loads[d]) || 0);
    // READINESS IS A DAILY MEASURE, so it has to be bounded by a date.
    //
    // This took the newest entry EVER recorded, with no bound at all — and the
    // very next line computes `checkedToday` correctly, which shows the two
    // were meant to be different things. The consequence: an athlete who
    // reported pain 7 on the 20th and never checked in again still showed a red
    // readiness dot on the 28th, and CoachBrief emitted "Regress <name> TODAY —
    // readiness red" off an eight-day-old check-in. Telling a coach to cut a
    // session on stale data is worse than telling him nothing.
    //
    // Yesterday still counts (an evening check-in is about this morning);
    // anything older is not today's readiness and reads as unknown.
    const yday = new Date(new Date(`${today}T00:00:00Z`).getTime() - 86400000).toISOString().slice(0, 10);
    const rEntry = (rec.readiness && (rec.readiness[today] || rec.readiness[yday])) || null;
    const readiness = readinessAutoreg(rEntry || {});
    // Today's availability is at least as restrictive as any UNRESOLVED injury.
    //
    // Saving a medical record mirrors its status into availability for THAT DAY
    // only, so an ongoing non-contact injury silently reverted to "Full" on every
    // later day — the Head Coach Report then printed "0 LIMITED" directly under a
    // Medical line reading "ANKLE LEFT SPRAIN · NON-CONTACT", contradicting itself
    // on one card. The daily value is still the coach's call and can only make it
    // WORSE, never better than the medical fact.
    const dayAvail = (rec.availability && rec.availability[today]) || 1;
    const injuryAvail = activeInjuries(medical || {}, t.id)
      .reduce((worst, inj) => Math.max(worst, MEDICAL_STATUS_AVAIL[inj.status] || 1), 1);
    const avail = Math.max(dayAvail, injuryAvail);
    // Foster monotony over the trailing 7 days (illness/overtraining risk) +
    // whether a wellness check-in exists for today — both feed the Coach's Brief.
    const ms = monotonyStrain(last14.slice(-7).map((d) => (rec.loads && rec.loads[d]) || 0));
    const checkedToday = !!(rec.readiness && rec.readiness[today]);
    const hasLoad = Object.values(rec.loads || {}).some((v) => v > 0);
    return { t, acwr, series, readiness, avail, ms, checkedToday, hasLoad };
  // medical is a dependency now: an active injury floors todays availability,
  // so resolving or adding one has to recompute the rows.
  }), [roster, bhbcLoads, today, last14, medical]);

  const team = useMemo(() => {
    const wr = rows.filter((r) => r.acwr.ratio != null);
    return {
      n: rows.length,
      avg: wr.length ? wr.reduce((s, r) => s + r.acwr.ratio, 0) / wr.length : null,
      flagged: rows.filter((r) => ['high', 'elevated'].includes(r.acwr.band.key)).length,
      week: Math.round(rows.reduce((s, r) => s + (r.acwr.acute || 0), 0)),
      teamSeries: last14.map((d) => roster.reduce((s, t) => s + ((bhbcLoads[t.id]?.loads?.[d]) || 0), 0)),
      series28: last28.map((d) => ({ date: d, load: roster.reduce((s, t) => s + ((bhbcLoads[t.id]?.loads?.[d]) || 0), 0) })),
    };
  }, [rows, roster, bhbcLoads, last14, last28]);

  const fx = useMemo(() => {
    // A fixture with no `start` made this concatenate 'undefined' and made the
    // sort at line ~1084 throw outright (audit 08-22 #73).
    const items = (bhbcFixtures || []).slice().sort((a, b) => `${a.date || ''}${a.start || ''}`.localeCompare(`${b.date || ''}${b.start || ''}`));
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

  // Edit / delete an already-logged session (Ohad 2026-08-21: sessions must be
  // fixable after the fact). Editing rewrites minutes — and load for sRPE
  // entries; deleting subtracts the entry's load so ACWR stays truthful.
  const editSession = useCallback((athleteId, date, idx, newMin, sig) => {
    const cur = bhbcLoads && bhbcLoads[athleteId] && bhbcLoads[athleteId].sessions
      && bhbcLoads[athleteId].sessions[date] && bhbcLoads[athleteId].sessions[date][idx];
    if (sig != null && sessionSig(cur) !== sig) { toast('That session moved — reopen it'); return; }
    // An sRPE session with no minutes is not a session (audit #71). Say so,
    // rather than accepting the edit and quietly turning a Practice into a
    // zero-load gym attendance row.
    if (Number(newMin) <= 0 && cur && cur.rpe != null) { toast('Minutes must be more than 0 — delete the session instead'); return; }
    setBhbcLoads((prev) => {
      const rec = prev[athleteId]; if (!rec || !rec.sessions || !rec.sessions[date] || !rec.sessions[date][idx]) return prev;
      const out = { ...rec, sessions: { ...rec.sessions }, loads: { ...(rec.loads || {}) } };
      const arr = [...out.sessions[date]];
      const s = { ...arr[idx] };
      const min = Number(newMin) || 0;
      // An sRPE session with zero minutes is not a session (audit #71). Editing
      // the minutes to 0 or clearing the field used to zero its load and leave
      // an unrecoverable stub behind. Deleting is the way to remove a session.
      if (min <= 0 && s.rpe != null) return prev;
      if (s.load > 0 && s.rpe) {
        const newLoad = sessionLoad(min, s.rpe);
        out.loads[date] = Math.max(0, (out.loads[date] || 0) - s.load + newLoad);
        s.load = newLoad;
      }
      s.min = min;
      arr[idx] = s; out.sessions[date] = arr;
      return { ...prev, [athleteId]: out };
    });
    toast('Session updated'); notify();
  }, [setBhbcLoads, bhbcLoads, notify]);

  const deleteSession = useCallback((athleteId, date, idx, sig) => {
    let removed = null;
    const cur = bhbcLoads && bhbcLoads[athleteId] && bhbcLoads[athleteId].sessions
      && bhbcLoads[athleteId].sessions[date] && bhbcLoads[athleteId].sessions[date][idx];
    if (sig != null && sessionSig(cur) !== sig) { toast('That session moved — reopen the list'); return; }
    setBhbcLoads((prev) => {
      const rec = prev[athleteId]; if (!rec || !rec.sessions || !rec.sessions[date] || !rec.sessions[date][idx]) return prev;
      const out = { ...rec, sessions: { ...rec.sessions }, loads: { ...(rec.loads || {}) } };
      const arr = [...out.sessions[date]];
      const [s] = arr.splice(idx, 1);
      removed = s;
      if (arr.length) out.sessions[date] = arr; else { const ss = { ...out.sessions }; delete ss[date]; out.sessions = ss; }
      if (s && s.load > 0) {
        const nl = Math.max(0, (out.loads[date] || 0) - s.load);
        if (nl > 0) out.loads[date] = nl; else { const ls = { ...out.loads }; delete ls[date]; out.loads = ls; }
      }
      return { ...prev, [athleteId]: out };
    });
    // Undo restores the exact row and its load. `removed` is captured
    // inside the updater above, so it is the row that was actually spliced.
    toast('Session removed', 'info', {
      ttl: 8000,
      actions: [{ label: 'Undo', value: 'undo' }],
      onAction: (v) => {
        if (v !== 'undo' || !removed) return;
        setBhbcLoads((prev) => {
          const rec = prev[athleteId] ? { ...prev[athleteId] } : emptyRec();
          rec.sessions = { ...(rec.sessions || {}) };
          const arr = [...(rec.sessions[date] || [])];
          arr.splice(Math.min(idx, arr.length), 0, removed);
          rec.sessions[date] = arr;
          if (removed.load > 0) rec.loads = { ...(rec.loads || {}), [date]: (rec.loads?.[date] || 0) + removed.load };
          return { ...prev, [athleteId]: rec };
        });
        toast('Session restored'); notify();
      },
    });
    notify();
  }, [setBhbcLoads, bhbcLoads, notify]);

  const logSession = useCallback(({ athleteId, date, type, minutes, rpe, readiness }) => {
    // GYM IS ZERO LOAD — decided by TYPE, never by whatever is left in the RPE
    // field. The modal only HIDES the RPE input when the type is Lift; it does
    // not clear the state and is not unmounted between opens. So a coach who
    // typed Practice/60/RPE 7, realised it was the gym and switched Type ->
    // Lift still had rpe=7 in state, load came out 420, and the zero-load Lift
    // branch below was never reached — the gym session injected load that does
    // not exist. In squad scope that wrote 420 AU to EVERY available athlete.
    // savePractice already derives it from the type; these two now match it.
    const load = type === 'Lift' ? 0 : sessionLoad(minutes, rpe);
    setBhbcLoads((prev) => {
      const rec = prev[athleteId] ? { ...prev[athleteId] } : emptyRec();
      rec.loads = { ...(rec.loads || {}) }; rec.sessions = { ...(rec.sessions || {}) }; rec.readiness = { ...(rec.readiness || {}) };
      if (load > 0) {
        rec.loads[date] = (rec.loads[date] || 0) + load;
        rec.sessions[date] = [...(rec.sessions[date] || []), { type, min: Number(minutes) || 0, rpe: Number(rpe) || 0, load }];
      } else if (type === 'Lift' && Number(minutes) > 0) {
        // Gym sessions are logged WITHOUT RPE (Ohad never records it) — minutes
        // only, zero load, so lifts show in the history without polluting ACWR.
        rec.sessions[date] = [...(rec.sessions[date] || []), { type, min: Number(minutes), rpe: null, load: 0, attended: true }];
      }
      const r = readiness || {};
      // MERGE ONLY WHAT WAS ACTUALLY ENTERED. LogModal always sends all three
      // fields, empty or not, and an unconditional spread let '' overwrite a
      // real value: a morning check-in of {sleep:'good', energy:'good', pain:2}
      // became {sleep:'', energy:'8', pain:''} as soon as the coach logged that
      // athlete's session and filled in energy alone. fieldQuality then read
      // pain as null and readinessAutoreg flipped him from green to "Pain not
      // logged — confirm first". Silent loss of clinical input.
      const entered = Object.fromEntries(Object.entries(r).filter(([, v]) => v !== '' && v != null));
      if (Object.keys(entered).length) rec.readiness[date] = { ...(rec.readiness[date] || {}), ...entered };
      return { ...prev, [athleteId]: rec };
    });
    toast('Logged'); notify();
  }, [setBhbcLoads, notify]);

  // Bulk: log one session's load for the WHOLE available squad (a team all does
  // the same practice). Skips anyone marked Out that day. Feeds every athlete's ACWR.
  const logTeamSession = useCallback(({ date, type, minutes, rpe }) => {
    const load = type === 'Lift' ? 0 : sessionLoad(minutes, rpe);
    // Gym (Lift) sessions carry NO RPE by design, so load is 0 — the old guard
    // rejected the whole-roster gym log with a contradictory "Add minutes + RPE"
    // and silently recorded nothing (audit 08-22). Mirror logSession: minutes-only
    // attendance rows, ACWR untouched.
    const liftOnly = load <= 0 && type === 'Lift' && Number(minutes) > 0;
    if (load <= 0 && !liftOnly) { toast('Add minutes + RPE'); return; }
    let n = 0;
    setBhbcLoads((prev) => {
      const next = { ...prev };
      roster.forEach((t) => {
        const rec = next[t.id] ? { ...next[t.id] } : emptyRec();
        const av = (rec.availability && rec.availability[date]) || 1;
        if (av >= 4) return; // Out (medical/personal) → skip
        rec.loads = { ...(rec.loads || {}) };
        rec.sessions = { ...(rec.sessions || {}) };
        if (liftOnly) {
          rec.sessions[date] = [...(rec.sessions[date] || []), { type, min: Number(minutes), rpe: null, load: 0, attended: true, team: true }];
        } else {
          rec.loads[date] = (rec.loads[date] || 0) + load;
          rec.sessions[date] = [...(rec.sessions[date] || []), { type, min: Number(minutes) || 0, rpe: Number(rpe) || 0, load, team: true }];
        }
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
  const savePractice = useCallback(({ date, minutes, teamRpe, intensity, entries, sessionType = 'Practice', start = '' }) => {
    setBhbcLoads((prev) => {
      const next = { ...prev };
      Object.entries(entries).forEach(([id, e]) => {
        const rec = next[id] ? { ...next[id] } : emptyRec();
        // RE-SAVING A SLOT MUST REPLACE IT, NOT ADD TO IT.
        //
        // The attendance write below is keyed `${date}|${start}` and so is
        // already idempotent — the slot has an identity. The load and session
        // rows ignored it and appended unconditionally, so saving the 18:00
        // practice, noticing a wrong note and saving again gave every athlete
        // the load TWICE (525 AU -> 1050) plus a duplicate history row. A
        // 7-day acute of 2100 becomes 2625 and ACWR jumps a full band, with no
        // way back except deleting the duplicate athlete by athlete.
        //
        // So drop any row already recorded for THIS slot first, and take its
        // load back out of the day's total.
        const slotKey = `${date}|${start || ''}`;
        const priorRows = (rec.sessions && rec.sessions[date]) || [];
        // REPLACE ONLY WHEN THE SLOT IS IDENTIFIABLE.
        //
        // The replace above is keyed on `start`, and `start` is '' whenever the
        // chosen date has no fixture — an unscheduled or backdated session.
        // Matching on (r.start || '') === '' then swept up every LEGACY team row
        // on that date (rows written before per-slot logging carry no `start`
        // at all), deleted them from every athlete and subtracted their load.
        // Backdating one shootaround to a day with two old sessions would have
        // silently removed both and dropped the squad's ACWR.
        //
        // Without a slot identity there is nothing to replace, so append. A
        // duplicate row is visible and deletable; a wiped legacy session is
        // neither.
        const mine = start ? priorRows.filter((r) => r && r.team && r.start === start) : [];
        if (mine.length) {
          const undo = mine.reduce((a, r) => a + (Number(r.load) || 0), 0);
          rec.sessions = { ...(rec.sessions || {}) };
          rec.sessions[date] = priorRows.filter((r) => !mine.includes(r));
          if (undo > 0) rec.loads = { ...(rec.loads || {}), [date]: Math.max(0, (rec.loads?.[date] || 0) - undo) };
        }
        rec.availability = { ...(rec.availability || {}), [date]: e.avail };
        // Per-slot attendance: an athlete who is Out for the DAY is out of every
        // slot, but an available athlete can still be marked absent from THIS
        // one without touching the rest of his day.
        const attended = e.attended !== false && e.avail < 4;
        rec.attendance = { ...(rec.attendance || {}), [slotKey]: attended ? 'in' : 'out' };
        // Gym work carries NO RPE, ever (Ohad's hard rule) — it is a
        // minutes-only attended session with zero load, exactly like the
        // whole-roster gym log. Court sessions keep minutes × RPE.
        const isLift = sessionType === 'Lift';
        const rpe = isLift ? null : Number(e.rpe || teamRpe);
        const load = attended && !isLift ? sessionLoad(minutes, rpe) : 0;
        if (attended && isLift && Number(minutes) > 0) {
          rec.sessions = { ...(rec.sessions || {}) };
          rec.sessions[date] = [...(rec.sessions[date] || []), { type: sessionType, min: Number(minutes), rpe: null, load: 0, attended: true, note: e.note || '', team: true, start, by: currentUser || null }];
        } else if (load > 0) {
          rec.loads = { ...(rec.loads || {}), [date]: (rec.loads?.[date] || 0) + load };
          rec.sessions = { ...(rec.sessions || {}) };
          // `start` = which slot of the day this was, so a morning and an
          // evening session are two distinct rows, not one overwritten one.
          rec.sessions[date] = [...(rec.sessions[date] || []), { type: sessionType, min: Number(minutes) || 0, rpe, load, intensity, note: e.note || '', team: true, start, by: currentUser || null }];
        }
        if (e.bw) rec.bw = { ...(rec.bw || {}), [date]: Number(e.bw) };
        if (e.note) rec.notes = { ...(rec.notes || {}), [date]: e.note, [`${date}|${start || ''}`]: e.note };
        next[id] = rec;
      });
      return next;
    });
    toast(`${sessionType} saved`); notify();
  }, [setBhbcLoads, notify]);

  // Squad morning wellness check-in → readiness[date] per athlete, feeding the
  // readinessAutoreg engine (so the Load board + athlete cards show a real
  // session nudge before athletes have their own portal accounts).
  const saveCheckin = useCallback(({ date, entries }) => {
    setBhbcLoads((prev) => {
      const next = { ...prev };
      Object.entries(entries).forEach(([id, e]) => {
        const hasAny = e.sleep || e.energy || (e.pain !== '' && e.pain != null) || e.bw;
        if (!hasAny) return;
        const rec = next[id] ? { ...next[id] } : emptyRec();
        if (e.sleep || e.energy || (e.pain !== '' && e.pain != null)) {
          rec.readiness = { ...(rec.readiness || {}), [date]: { ...((rec.readiness || {})[date] || {}), ...(e.sleep ? { sleep: e.sleep } : {}), ...(e.energy ? { energy: e.energy } : {}), ...(e.pain !== '' && e.pain != null ? { pain: e.pain } : {}) } };
        }
        // BW check-in (Ohad measures players through the season for the head coach)
        if (e.bw) rec.bw = { ...(rec.bw || {}), [date]: Number(e.bw) };
        next[id] = rec;
      });
      return next;
    });
    toast('Check-in saved'); notify();
  }, [setBhbcLoads, notify]);

  const updateGame = useCallback((g, patch) => {
    if (!setBhbcFixtures) return;
    // UPDATE ONE GAME, NOT EVERY GAME THAT DAY.
    //
    // `start` is '' on every TBD fixture and the predicate never looked at the
    // opponent, so two TBD games on one date both matched: setting "Maccabi Tel
    // Aviv / away" on the second rewrote the first as well. The fixture sync
    // keys games by `date|opponent`, so two opponents on one date is a
    // supported state.
    //
    // Match on the opponent too, and even then apply the patch to the FIRST
    // match only — when two rows are genuinely indistinguishable (both TBD,
    // both opponent-less) editing one must not silently rewrite the other.
    setBhbcFixtures((prev) => {
      const list = (prev || []);
      const norm = (v) => String(v ?? '');
      const i = list.findIndex((f) => f.type === 'game'
        && f.date === g.date
        && norm(f.start) === norm(g.start)
        && norm(f.opponent) === norm(g.opponent));
      if (i < 0) return list;
      const next = list.slice();
      next[i] = { ...next[i], ...patch };
      return next;
    });
    toast('Game updated'); notify();
  }, [setBhbcFixtures, notify]);

  // ---- Medical / injury record (Ohad + physical therapist) ----
  // Saving an injury/progress entry can also set the athlete's availability that
  // day, so the medical record and the load board stay in sync.
  // Which session slot's plan is open: { date, start, type, minutes } | null.
  const [planFor, setPlanFor] = useState(null);
  const planKey = (f) => `${f.date}|${f.start || ''}`;
  const planOf = useCallback((f) => (f ? sessionPlans[`${f.date}|${f.start || ''}`] || null : null), [sessionPlans]);
  const saveSessionPlan = useCallback(({ date, start, focus, plan }) => {
    if (!setSessionPlans) return;
    const key = `${date}|${start || ''}`;
    setSessionPlans((prev) => {
      const next = { ...(prev || {}) };
      if (!focus && !plan) delete next[key];
      else next[key] = { focus: focus || '', plan: plan || '', updatedAt: new Date().toISOString() };
      return next;
    });
    toast('Session plan saved'); notify();
  }, [setSessionPlans, notify]);

  // ---- Week planner writes (Ohad 2026-08-24: "write what and when the entire
  // team has an S&C session"). The zone could DISPLAY sessions but never create
  // one, so planning still lived in the old sheet. Manual entries carry
  // manual:true so a future calendar sync can tell them from imported ones.
  const endOfSession = (start, minutes) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(start || ''));
    const mins = Number(minutes) || 0;
    if (!m || !mins) return '';
    const tot = Number(m[1]) * 60 + Number(m[2]) + mins;
    return `${String(Math.floor((tot % 1440) / 60)).padStart(2, '0')}:${String(tot % 60).padStart(2, '0')}`;
  };
  const sameSlot = (a, b) => a && b && a.date === b.date && String(a.start || '') === String(b.start || '') && a.type === b.type;
  const upsertFixture = useCallback((orig, next) => {
    if (!setBhbcFixtures) return;
    const clean = { date: next.date, type: next.type, start: next.start, minutes: Number(next.minutes) || 0, end: endOfSession(next.start, next.minutes), manual: true };
    setBhbcFixtures((prev) => {
      const list = [...(prev || [])];
      const i = orig ? list.findIndex((f) => sameSlot(f, orig)) : -1;
      if (i >= 0) list[i] = { ...list[i], ...clean }; else list.push(clean);
      return list.sort((a, b) => `${a.date}${a.start || ''}`.localeCompare(`${b.date}${b.start || ''}`));
    });
    toast(orig ? 'Session updated' : 'Session added'); notify();
  }, [setBhbcFixtures, notify]);
  const removeFixture = useCallback((f) => {
    if (!setBhbcFixtures) return;
    setBhbcFixtures((prev) => (prev || []).filter((x) => !sameSlot(x, f)));
    toast('Session removed'); notify();
  }, [setBhbcFixtures, notify]);

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
    const av = MEDICAL_STATUS_AVAIL[injury.status];
    if (av && setBhbcLoads && !injury.resolved) {
      setBhbcLoads((prev) => {
        const r = prev[athleteId] ? { ...prev[athleteId] } : emptyRec();
        r.availability = { ...(r.availability || {}), [today]: av };
        return { ...prev, [athleteId]: r };
      });
    }
    // CLEARING AN INJURY HAS TO CLEAR THE FLOOR IT WROTE.
    //
    // Reporting one mirrors its status onto today's availability (out -> 4).
    // Resolving skipped the mirror entirely, so that 4 stayed — and `rows`
    // takes Math.max(dayAvail, injuryAvail), which by design can only make
    // availability WORSE. So a player cleared to play still read "out": the
    // head-coach report counted him out, logTeamSession skipped him (av >= 4)
    // and the practice log recorded him absent, until somebody happened to
    // cycle the chip by hand.
    //
    // Only lift a MEDICAL floor (2-4), and only when nothing else is still
    // active. 5 is "Out · Personal" and has nothing to do with the injury, so
    // it is left exactly where it is.
    if (injury.resolved && setBhbcLoads) {
      setBhbcLoads((prev) => {
        const r = prev[athleteId] ? { ...prev[athleteId] } : emptyRec();
        const cur = (r.availability || {})[today];
        if (!(cur >= 2 && cur <= 4)) return prev;
        const stillHurt = ((medical[athleteId] || {}).injuries || [])
          .some((i) => i.id !== injury.id && !i.resolved);
        if (stillHurt) return prev;
        r.availability = { ...(r.availability || {}), [today]: 1 };
        return { ...prev, [athleteId]: r };
      });
    }
    toast('Medical record saved'); notify();
  }, [setMedical, setBhbcLoads, today, notify, medical]);

  const rowGrid = '28px minmax(116px,1.5fr) 112px 46px 130px minmax(104px,1.1fr) 92px';
  // Coaches (head coach + assistants) are VIEWERS: they read the report, roster,
  // schedule, medical and games — but do NOT operate S&C (no session runner, no
  // logging practices, no check-in entry, no roster management). Ohad 2026-08-18.
  const NAV_TABS = [['overview', tr('Overview')], ['roster', tr('Roster')], ['schedule', tr('Schedule')], ['medical', tr('Medical')], ...(asCoach ? [] : [['sessions', tr('Sessions')]]), ['games', tr('Games')]];

  // Never sit on a tab that is not in the list. 'Sessions' disappears in the
  // coach view, but `view` was not reset when 'Preview as coach' was switched
  // on: no content block matched, no tab rendered active, and the owner got a
  // header floating over an empty page that reads as the preview being broken
  // (audit #72). Stated as "the view must be one of the tabs on screen" rather
  // than as a special case for sessions, so a tab hidden later cannot bring the
  // blank page back.
  useEffect(() => {
    if (!NAV_TABS.some(([k]) => k === view)) setView(NAV_TABS[0][0]);
  }, [asCoach]);   // eslint-disable-line react-hooks/exhaustive-deps

  return (
    // dir="rtl" on the zone root, not just Hebrew words in an LTR layout:
    // labels sit on the correct side, the nav reads right-to-left, and mixed
    // Hebrew/English lines resolve through the browser's own bidi algorithm
    // instead of being forced. Numbers, times and club names stay LTR on their
    // own because they are strongly-typed LTR runs.
    <BhbcLangCtx.Provider value={bhbcLang}>
    <div className="bhbc-zone" dir={he ? 'rtl' : 'ltr'} style={{ ...TOKENS, minHeight: '100vh', background: 'var(--c-bg)', color: C.tx, fontFamily: FB }}>
      <style>{`
        .bhbc-hdr-tabs::-webkit-scrollbar{display:none} .bhbc-hdr-tabs{scrollbar-width:none;-ms-overflow-style:none}
        .bhbc-ghost-btn:hover{color:${ORANGE}!important;border-color:${ORANGE}!important}
        .bhbc-tab:hover{color:#fff!important;border-color:rgba(255,255,255,0.30)!important}
        /* Never let the zone scroll the PAGE sideways — wide bits scroll inside. */
        .bhbc-zone{max-width:100vw;overflow-x:clip}
        .bhbc-week-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:8px;align-items:stretch}
        @media (max-width:620px){ .bhbc-week-grid{grid-template-columns:repeat(2,minmax(0,1fr))} }
        @media (max-width:400px){ .bhbc-week-grid{grid-template-columns:1fr} }
        /* In a seven-across week each column is ~130px, so a session chip
           stacks instead of sitting on one line. Tighter type and a real
           line-height make that stack read as a block rather than as text
           that fell apart. */
        .bhbc-week-grid .bhbc-chip{display:block;line-height:1.45}
        .bhbc-week-grid .bhbc-chip .bhbc-chip-focus{font-size:11px;display:block;margin-top:2px}
        .bhbc-week-grid .bhbc-chip .bhbc-chip-meta{margin-inline-end:6px}
        @media (max-width:760px){
          .bhbc-header-inner{flex-wrap:wrap!important;gap:0 10px!important;padding:6px 14px!important;min-height:0!important}
          .bhbc-header-id{flex:1 1 auto!important;padding:8px 0!important}
          .bhbc-header-ctrl{order:2!important;padding:8px 0!important}
          .bhbc-hdr-tabs{order:3!important;flex-basis:100%!important;width:100%!important;justify-content:flex-start!important;border-top:1px solid rgba(255,255,255,0.12)!important}
          .bhbc-hdr-tabs button{height:46px!important;padding:0 13px!important}
          /* The injury row is a fixed 5-column grid (150px 1fr 120px 110px auto)
             — about 430px before gaps, so on a phone it ran a good 130px past
             the viewport and the 'Update ›' target sat off-screen entirely.
             Restack it: name + status, then the injury, then days/pain + the
             action. Explicit areas because auto-placement reorders once one
             child spans the row. */
          .bhbc-inj-row{grid-template-columns:1fr auto!important;gap:5px 10px!important}
          .bhbc-inj-row>:nth-child(1){grid-area:1/1!important}
          .bhbc-inj-row>:nth-child(3){grid-area:1/2!important;justify-self:end!important}
          .bhbc-inj-row>:nth-child(2){grid-area:2/1/auto/-1!important}
          .bhbc-inj-row>:nth-child(4){grid-area:3/1!important}
          .bhbc-inj-row>:nth-child(5){grid-area:3/2!important;justify-self:end!important}
        }
      `}</style>
      {/* ---- ZONE TOP BAR — logo + wordmark + inline nav tabs + controls, one
           clean bar (EXPO-style; tabs moved up here from a separate row). ---- */}
      <header style={{ position: 'sticky', top: 0, zIndex: 50, background: HDR_BG, borderBottom: '1px solid rgba(255,255,255,0.07)', boxShadow: '0 2px 10px rgba(0,0,0,0.30)' }}>
        <div className="bhbc-header-inner" style={{ maxWidth: 1280, margin: '0 auto', padding: '0 18px', minHeight: 54, display: 'flex', alignItems: 'center', gap: 14 }}>
          <div className="bhbc-header-id" style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, marginRight: 6 }}>
            <img src="/bnei-herzliya-logo-w.png" alt="Bnei Herzliya BC" style={{ height: 30, width: 'auto', display: 'block' }} />
            {/* Wordmark on ONE line (Ohad: no stacked text in the top menu). */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 11, whiteSpace: 'nowrap' }}>
              {/* lineHeight:1 on BOTH, or they do not sit on the same line:
                  alignItems:center centres each span's BOX, and at 13.5px vs
                  11px the default line-heights give the two boxes different
                  heights, so the smaller text lands visibly high (Ohad: "the
                  2026/2027 is not vertically centered"). With line-height
                  pinned to the glyph size, centring the boxes centres the text.
                  Season bumped 9.5 → 11 ("slightly too small"). */}
              <span style={{ fontFamily: FN, fontWeight: 800, fontSize: 13, lineHeight: 1, color: '#fff', letterSpacing: '0.02em' }}>{tr('BNEI HERZLIYA')}</span>
              <span style={{ fontFamily: FN, fontSize: 11, lineHeight: 1, fontWeight: 700, letterSpacing: '0.08em', color: ORANGE, fontVariantNumeric: 'tabular-nums' }}>2026/27</span>
            </div>
          </div>
          {/* Understated EXPO-style nav: tight left-aligned small tabs, active tab is
              an orange-outlined box (mirrors EXPO's cyan-outlined active). */}
          {/* minWidth: 0 (NOT max-content) — the strip must be allowed to shrink
              below its tabs so overflowX:auto actually scrolls on mobile instead
              of the zone's overflow-x:clip amputating the tail tabs. */}
          <nav className="bhbc-hdr-tabs" style={{ display: 'flex', alignItems: 'center', justifyContent: 'safe center', gap: 6, flex: '1 1 auto', minWidth: 0, overflowX: 'auto' }}>
            {roster.length > 0 && NAV_TABS.map(([k, label]) => {
              const on = view === k;
              return (
                <button key={k} onClick={() => setView(k)} className={on ? undefined : 'bhbc-tab'} style={{ fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: on ? '#fff' : 'rgba(255,255,255,0.5)', background: 'transparent', border: `1px solid ${on ? ORANGE : 'transparent'}`, borderRadius: 0, height: HDR_BTN_H, boxSizing: 'border-box', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, padding: '0 11px', cursor: 'pointer', whiteSpace: 'nowrap', transition: 'color .12s, border-color .12s' }}>{label}</button>
              );
            })}
          </nav>
          {/* One ink for EVERY control in this cluster. Sign out was
              rgba(255,255,255,0.7) while the theme toggle was 0.85, so they
              read as two different families sitting next to each other
              (Ohad: "make sure the sign out and the light/dark mode are the
              same color"). HDR_INK/HDR_BD are defined once at module scope. */}
          <div className="bhbc-header-ctrl" style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, marginInlineStart: 'auto' }}>
            {!coach && <button onClick={() => setPreviewCoach((v) => !v)} className="bhbc-tab" title="See exactly what your BHBC coaches see" style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: previewCoach ? '#fff' : HDR_INK, background: previewCoach ? ORANGE : 'transparent', border: `1px solid ${previewCoach ? ORANGE : HDR_BD}`, borderRadius: 0, height: HDR_BTN_H, boxSizing: 'border-box', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, padding: '0 11px', cursor: 'pointer' }}>{previewCoach ? `● ${tr('Coach view')}` : `◉ ${tr('Preview as coach')}`}</button>}
            {/* HE / EN. Fixed width so the control does not resize as the
                label changes — a control that changes size on click reads as a
                flash bug. Shows the language it will SWITCH TO, which is how a
                two-state language switch is read. */}
            <button onClick={() => setBhbcLang(he ? 'en' : 'he')}
              title={he ? 'Switch to English' : 'עברית'}
              style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: HDR_INK, background: 'transparent', border: `1px solid ${HDR_BD}`, borderRadius: 0, height: HDR_BTN_H, minWidth: 42, padding: '0 8px', cursor: 'pointer', boxSizing: 'border-box', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>
              {he ? 'EN' : 'עב'}
            </button>
            <ThemeToggle size={HDR_BTN_H} style={{ color: HDR_INK, border: `1px solid ${HDR_BD}` }} />
            {/* The way back to EXPO is Ohad's alone, and it is a door, not a
                feature of the club zone. A bordered button with an exit arrow
                gave it the same weight as the tabs beside it; the mark says
                where it goes without competing with them (Ohad 08-30: "a small
                transparent expo icon"). Colourless on purpose - the club's
                header is its own brand, and EXPO blue inside it reads as a
                second logo. */}
            {onExit && !previewCoach && <button onClick={onExit} className="bhbc-tab" title="Back to EXPO coach" aria-label="Back to EXPO coach" style={{ background: 'transparent', border: 'none', borderRadius: 0, height: HDR_BTN_H, boxSizing: 'border-box', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, padding: '0 4px', cursor: 'pointer', opacity: 0.55 }}>
              {/* The EXPO chevron alone, not the wordmark: inside the club's
                  own header a second full logo competes with BNEI HERZLIYA.
                  EXPO_ICON is only an alias for the full logo, so the mark is
                  drawn rather than cropped - it scales, takes currentColor and
                  centres on the row like every other control here. */}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="3" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true"
                style={{ display: 'block' }}>
                <polyline points="4 16 12 8 20 16" />
              </svg>
            </button>}
            {coach && onSignOut && <button onClick={onSignOut} className="bhbc-tab" title="Sign out" style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: HDR_INK, background: 'transparent', border: `1px solid ${HDR_BD}`, borderRadius: 0, height: HDR_BTN_H, boxSizing: 'border-box', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, padding: '0 11px', cursor: 'pointer' }}>{tr('Sign out')}</button>}
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 24px 72px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {previewCoach && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'rgba(242,106,43,0.10)', border: `1px solid ${ORANGE}`, borderRadius: 6 }}>
            <span style={{ fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: ORANGE_DEEP }}>◉ Coach view</span>
            <span style={{ fontFamily: FN, fontSize: 12, color: C.tm }}>This is exactly what your BHBC coaches see — no roster management, medical is view-only.</span>
            <button onClick={() => setPreviewCoach(false)} style={{ marginInlineStart: 'auto', fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.tm, background: 'transparent', border: `1px solid ${C.cardBd}`, borderRadius: 4, padding: '5px 10px', cursor: 'pointer' }}>Exit preview</button>
          </div>
        )}
        {/* ---- TOOLBAR ---- */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: C.td }}>{tr('Roster')} · {roster.length}</div>
          {(!asCoach || canLog) && (
            <div style={{ marginInlineStart: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {!asCoach && <Btn variant="ghost" onClick={() => setManageOpen(true)}>{tr('Manage roster')}</Btn>}
              {canLog && <Btn onClick={() => setPracticeOpen(true)} style={{ background: ORANGE, borderColor: ORANGE, color: '#fff' }}>{tr('+ Log practice')}</Btn>}
            </div>
          )}
        </div>

        {roster.length === 0 ? (
          <Card header={secTitle('Roster')}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '28px 16px' }}>
              <img src="/logos/bhbc-logo.png" alt="" style={{ height: 68, opacity: 0.9, marginBottom: 8 }} />
              <div style={{ fontFamily: FN, fontWeight: 700, fontSize: 13, color: C.tx }}>{tr('No athletes on the roster yet')}</div>
              <div style={{ fontFamily: FB, fontSize: 13, color: C.td, marginBottom: 14, textAlign: 'center', maxWidth: 320 }}>Add the roster to start tracking load, availability and readiness.</div>
              {!asCoach && <Btn onClick={() => setManageOpen(true)} style={{ background: ORANGE, borderColor: ORANGE, color: '#fff' }}>{tr('Add athletes')}</Btn>}
            </div>
          </Card>
        ) : (
          <>

            {view === 'overview' && (
              <>
                <ReturnLoadAlert roster={roster} loads={bhbcLoads} medical={medical} today={today} onOpen={setDetailFor} />
                <HeadCoachReport rows={rows} fx={fx} fixtures={bhbcFixtures} medical={medical} today={today} onOpen={setDetailFor}
                  planOf={planOf} onPlan={asCoach ? null : setPlanFor}
                  onMedical={null}   /* see MED on the load board — same closure, one screen */
                  onReportNew={effCanMedical ? (() => setInjuryFor({ athleteId: (rows[0] && rows[0].t.id) || '' })) : null} />
                {/* S&C Brief = the S&C operator's action list — removed for coaches. */}
                {!asCoach && <CoachBrief rows={rows} fx={fx} fixtures={bhbcFixtures} medical={medical} today={today} onOpen={setDetailFor} onLog={canLog ? () => setPracticeOpen(true) : null} />}
                <StaffBrief today={today} fx={fx} rows={rows} medical={medical} planOf={planOf} />
                <TodayPanel today={today} fixtures={bhbcFixtures} fx={fx} rows={rows} planOf={planOf} onPlan={asCoach ? null : setPlanFor} onSessions={asCoach ? null : () => setView('sessions')} onLog={canLog ? () => setPracticeOpen(true) : null} />
                {fx.nextGame && <NextGamePanel nextGame={fx.nextGame} today={today} onEdit={asCoach ? null : () => setGameEdit(true)} />}
                <FixturesAheadPanel fixtures={bhbcFixtures} today={today} />
                <TeamSnapshotCard team={team} />
                <LoadBoard rows={rows} rowGrid={rowGrid} cycleAvail={canLog ? cycleAvail : null} medical={medical} onOpen={setDetailFor}
                  onMedical={effCanMedical ? ((aid) => { const a = activeInjuries(medical, aid); setInjuryFor({ athleteId: aid, injuryId: a[0] && a[0].id }); }) : null} />
              </>
            )}

            {view === 'schedule' && (
              <>
                {fx.nextGame && <NextGamePanel nextGame={fx.nextGame} today={today} onEdit={asCoach ? null : () => setGameEdit(true)} />}
                {/* Plan the week HERE (Ohad 08-24) — coaches see the board read-only. */}
                <WeekPlanner fixtures={bhbcFixtures} today={today} planOf={planOf} onSavePlan={asCoach ? null : saveSessionPlan}
                  onUpsert={asCoach ? null : upsertFixture} onRemove={asCoach ? null : removeFixture} />
                {/* What the team ACTUALLY did, slot by slot (Ohad 08-24:
                    "where can I see the previous practices details?"). */}
                <PastPractices fixtures={bhbcFixtures} loads={bhbcLoads} roster={roster} today={today} planOf={planOf} />
                <MicrocycleView fx={fx} today={today} />
                <ScheduleTool fx={fx} fixtures={bhbcFixtures} today={today} mode={schedMode} setMode={setSchedMode} onLog={canLog ? () => setLogFor('new') : null} />
              </>
            )}

            {view === 'roster' && (
              <>
                <RosterGrid rows={rows} medical={medical} league={league} onOpen={setDetailFor} />
              </>
            )}

            {view === 'games' && (
              <LeagueView league={league} roster={roster} fixtures={bhbcFixtures} onOpen={setDetailFor}
                bhbcLoads={bhbcLoads} today={today} onPickMinutes={setMinutesFor} />
            )}

            {view === 'medical' && (
              <MedicalView roster={roster} rows={rows} loads={bhbcLoads} medical={medical} canMedical={effCanMedical} onLog={canLog ? ((aid) => setLogFor(aid)) : null} onReport={(aid) => setInjuryFor({ athleteId: aid })} onEdit={(aid, iid) => setInjuryFor({ athleteId: aid, injuryId: iid })} onOpen={setDetailFor} />
            )}

            {view === 'sessions' && !asCoach && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ display: 'inline-flex', border: `1px solid ${C.cardBd}` }}>
                    {[['group', 'Group'], ['single', 'Single']].map(([k, l]) => (
                      <button key={k} onClick={() => setSessionMode(k)} style={{ fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: sessionMode === k ? '#fff' : C.td, background: sessionMode === k ? NAVY_DEEP : 'transparent', border: 'none', padding: '7px 16px', cursor: 'pointer' }}>{l}</button>
                    ))}
                  </div>
                  <span style={{ fontFamily: FB, fontSize: 12, color: C.td }}>Logs each athlete's work to their history &amp; portal — synced with EXPO.</span>
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
        :root { --bhbc-ha-home: ${NAVY}; --bhbc-ha-away: ${ORANGE_DEEP}; --bhbc-amber-text: #8A6410; }
        :root[data-theme="dark"] { --bhbc-ha-home: #7FA9E8; --bhbc-ha-away: #F0955F; --bhbc-amber-text: #E0A73A; }
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
      {planFor && (
        <SessionPlanModal
          slot={planFor}
          rows={rows}
          medical={medical}
          fixtures={bhbcFixtures}
          plan={planOf(planFor)}
          onClose={() => setPlanFor(null)}
          onPick={(f) => setPlanFor(f)}
          onSave={(v) => { saveSessionPlan({ date: planFor.date, start: planFor.start, ...v }); setPlanFor(null); }}
        />
      )}
      {practiceOpen && (
        <PracticeEntryModal sessionPlans={sessionPlans} roster={roster} bhbcLoads={bhbcLoads} fixtures={bhbcFixtures}
          onClose={() => setPracticeOpen(false)} onSave={(p) => { savePractice(p); setPracticeOpen(false); }} />
      )}

      {/* WELLNESS CHECK-IN — every entry point removed on Ohad's instruction
          ("remove the check-in option for now"). WellnessModal and saveCheckin
          are deliberately left in the file, unused: "for now" means he expects
          to want it back, and deleting the component would turn restoring it
          into a rebuild instead of re-adding one button. */}

      {gameEdit && fx.nextGame && (
        <GameEditModal game={fx.nextGame} onClose={() => setGameEdit(false)} onSave={(patch) => { updateGame(fx.nextGame, patch); setGameEdit(false); }} />
      )}
        {minutesFor && (
          <GameMinutesModal game={minutesFor} roster={roster} bhbcLoads={bhbcLoads}
            onClose={() => setMinutesFor(null)}
            onSave={({ date, rpe, minutes }) => {
              setBhbcLoads((prev) => applyGameMinutes(prev, { date, rpe, minutes, emptyRec }));
              setMinutesFor(null);
            }} />
        )}

      {injuryFor && effCanMedical && (() => {
        const ath = roster.find((t) => t.id === injuryFor.athleteId);
        if (!ath) return null;
        const existing = injuryFor.injuryId ? ((medical[injuryFor.athleteId] || {}).injuries || []).find((i) => i.id === injuryFor.injuryId) : null;
        return <InjuryModal athlete={ath} injury={existing} currentUser={currentUser} onClose={() => setInjuryFor(null)} onSave={(injury) => { saveInjury({ athleteId: injuryFor.athleteId, injury }); setInjuryFor(null); }} />;
      })()}

      {/* ---- MANAGE ROSTER MODAL ---- */}
      <Modal open={manageOpen} onClose={() => setManageOpen(false)} wide title="Manage roster">
        <div style={{ fontFamily: FB, fontSize: 13, color: C.td, marginBottom: 12 }}>
          Tag athletes into Bnei Herzliya. They keep their normal athlete portal — this scopes who appears in the <span style={{ fontFamily: FN, color: NAVY, fontWeight: 700 }}>BHBC</span> zone.
        </div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 14, alignItems: 'stretch' }}>
          <input value={newAthlete} onChange={(e) => setNewAthlete(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && newAthlete.trim()) { setTrainees((prev) => [...prev, { id: 'tr_bh_' + Math.random().toString(36).slice(2, 9), name: newAthlete.trim(), team: 'BHBC', format: 'Bnei Herzliya', status: 'Active', createdAt: new Date().toISOString() }]); setNewAthlete(''); toast('Added'); } }}
            placeholder="Add a new athlete — full name" style={{ flex: 1, height: 38, boxSizing: 'border-box', fontFamily: FB, fontSize: 13, color: C.tx, background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderRadius: 0, padding: '0 10px' }} />
          <Btn disabled={!newAthlete.trim()} onClick={() => { setTrainees((prev) => [...prev, { id: 'tr_bh_' + Math.random().toString(36).slice(2, 9), name: newAthlete.trim(), team: 'BHBC', format: 'Bnei Herzliya', status: 'Active', createdAt: new Date().toISOString() }]); setNewAthlete(''); toast('Added'); }}
            style={{ height: 38, boxSizing: 'border-box', background: newAthlete.trim() ? ORANGE : undefined, borderColor: newAthlete.trim() ? ORANGE : undefined, color: newAthlete.trim() ? '#fff' : undefined }}>+ Add</Btn>
        </div>
        <div style={{ maxHeight: 360, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {trainees.filter((t) => t.status !== 'Archived').sort((a, b) => (b.team === 'BHBC' ? 1 : 0) - (a.team === 'BHBC' ? 1 : 0)).map((t) => {
            const on = t.team === 'BHBC';
            return (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', border: `0.25px solid ${C.cardBd}`, borderInlineStart: on ? `3px solid ${ORANGE}` : '3px solid transparent', background: on ? `color-mix(in srgb, ${NAVY} 6%, transparent)` : 'transparent' }}>
                <input type="checkbox" checked={on} onChange={(e) => setTeam(t.id, e.target.checked)} style={{ accentColor: NAVY, width: 16, height: 16, cursor: 'pointer', flexShrink: 0 }} />
                <span style={{ width: 24, display: 'inline-flex', justifyContent: 'center', flexShrink: 0 }}>{on && t.jersey != null && <Jersey n={t.jersey} size={22} />}</span>
                <span style={{ flex: '1 1 auto', minWidth: 0, fontFamily: FN, fontSize: 13, fontWeight: on ? 700 : 500, color: C.tx, whiteSpace: 'normal', overflowWrap: 'break-word' }}>{t.name}</span>
                {on && (
                  <>
                    <span style={{ flexShrink: 0, width: 108, textAlign: 'right', fontFamily: FB, fontSize: 11, color: C.td, whiteSpace: 'normal', overflowWrap: 'break-word' }}>{t.position || ''}</span>
                    <span style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 6 }} title="Landing / arrival date">
                      <span style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.tm }}>Lands</span>
                      <input type="date" value={t.arrival || ''} onChange={(e) => setArrival(t.id, e.target.value)} style={{ fontFamily: FN, fontSize: 11, color: C.tx, background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderRadius: 0, padding: '4px 6px' }} />
                    </span>
                  </>
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
        // Bodyweight trend = portal weigh-ins (shared bwLog) + BHBC practice
        // weigh-ins (rec.bw), merged by date (portal wins a same-day tie),
        // oldest→newest — the exact same chart the trainee page/portal show.
        const bwByDate = {};
        Object.entries((bhbcLoads[detailFor] || {}).bw || {}).forEach(([d, kg]) => { const v = parseFloat(kg); if (Number.isFinite(v)) bwByDate[String(d).slice(0, 10)] = v; });
        (bwLog || []).forEach((b) => { if (String(b.clientId || '').split('__')[0] !== detailFor) return; const v = parseFloat(b.bw); if (Number.isFinite(v)) bwByDate[String(b.date).slice(0, 10)] = v; });
        const bwEntries = Object.entries(bwByDate).map(([date, bw]) => ({ date, bw })).sort((a, b) => a.date.localeCompare(b.date));
        // Current training block (from the EXPO plan index) so the modal shows
        // what the athlete is actually training, not just league stats.
        const _bn = (n) => { const m = String(n || '').match(/#\s*(\d+)/); return m ? +m[1] : 0; };
        const aPlans = (planIndex || []).filter((p) => String(p.traineeId || '').split('__')[0] === detailFor);
        const curPlan = aPlans.slice().sort((a, b) => _bn(b.name) - _bn(a.name))[0] || null;
        const program = { count: aPlans.length, current: curPlan ? curPlan.name : null };
        return <AthleteModal row={row} rec={bhbcLoads[detailFor]} days28={last28} bw={bwEntries} program={program}
          workouts={(clientWorkouts || []).filter((w) => String(w.clientId || '').split('__')[0] === detailFor)}
          leaguePlayer={leaguePlayerFor(league, row.t.name)} leagueSeason={league.season}
          injuries={activeInjuries(medical, detailFor)}
          onInjury={effCanMedical ? (() => { const a = activeInjuries(medical, detailFor); setInjuryFor({ athleteId: detailFor, injuryId: a[0] && a[0].id }); setDetailFor(null); }) : null}
          onClose={() => setDetailFor(null)}
          onLog={canLog ? () => { setLogFor(detailFor); setDetailFor(null); } : null}
          onOpenExpo={!asCoach && onOpenTrainee ? () => onOpenTrainee(detailFor) : null}
          onViewProgram={() => { setProgramFor(detailFor); setDetailFor(null); }}
          onCycleAvail={canLog ? () => cycleAvail(detailFor, row.avail) : null}
          onEditSession={asCoach ? null : (date, idx, min, sig) => editSession(detailFor, date, idx, min, sig)}
          onDeleteSession={asCoach ? null : (date, idx, sig) => deleteSession(detailFor, date, idx, sig)} />;
      })()}
    </div>
    </BhbcLangCtx.Provider>
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

function AthleteModal({ row, rec, days28, bw = [], program = null, workouts = [], leaguePlayer, leagueSeason, injuries = [], onInjury, onClose, onLog, onOpenExpo, onViewProgram, onCycleAvail, onEditSession, onDeleteSession }) {
  const tr = useT();   // `t` below is the TRAINEE, hence `tr` for the translator
  const [editSess, setEditSess] = useState(null); // { date, idx, min } — inline minutes edit in the history
  const { t, acwr, avail, readiness } = row;
  const loads = (rec && rec.loads) || {};
  const rc = readiness.level === 'red' ? '#DE4E3B' : readiness.level === 'amber' ? '#E0A73A' : readiness.level === 'green' ? '#37B27C' : '#7C828B';
  const av = AVAIL[avail];
  // Unified activity: sRPE practice/quick logs + detailed gym sessions (client_workouts).
  const activity = [];
  // Attendance-only gym entries (min/rpe unknown — Ohad logs presence, not load)
  // read "Gym · attended" instead of a bogus "Lift 0 min @ RPE 0".
  //
  // Branch on whether an RPE was ever recorded, NOT on whether the load is
  // zero (audit #71). A gym attendance entry has no rpe; an sRPE session always
  // does. Keyed on load, a Practice whose minutes were edited down to zero
  // silently redrew itself as a gym attendance row, with no way to see it had
  // ever been a Practice.
  Object.entries((rec && rec.sessions) || {}).forEach(([d, arr]) => (arr || []).forEach((s, idx) => activity.push({ date: d, label: s.rpe == null ? `${s.start ? s.start + ' · ' : ''}Gym · ${s.min ? s.min + ' min' : 'attended'}` : `${s.start ? s.start + ' · ' : ''}${s.type} ${s.min} min @ RPE ${s.rpe}`, load: s.load || null, sess: { date: d, idx, min: s.min, sig: sessionSig(s) } })));
  (workouts || []).forEach((w) => { const d = String(w.date || w.completedAt || '').slice(0, 10); const nEx = (w.exercises || []).length; const nSets = (w.exercises || []).reduce((a, e) => a + (e.sets || []).length, 0); if (d) activity.push({ date: d, label: `Gym · ${nEx} lift${nEx === 1 ? '' : 's'}, ${nSets} set${nSets === 1 ? '' : 's'}`, load: null }); });
  Object.entries((rec && rec.bw) || {}).forEach(([d, kg]) => activity.push({ date: d, label: `Bodyweight ${kg} kg`, load: null }));
  Object.entries((rec && rec.availability) || {}).forEach(([d, code]) => { if (code > 1) activity.push({ date: d, label: `Availability · ${AVAIL[code].label}`, load: null }); });
  // NOTES ARE STORED UNDER TWO KEYS. savePractice writes each note as both
  // `date` and `date|start` — the slot-keyed copy so a morning and an evening
  // note can coexist, the day-level one so older readers still find it. This
  // loop treated every key as a date, so one note appeared TWICE in the
  // athlete's history and the slot-keyed row rendered its date column as
  // "08-27|18:00" (a.date.slice(5) into a 62px tabular column).
  //
  // Prefer the slot-keyed copies — they are the accurate record, since the
  // day-level key holds only whichever slot was saved last — and show the DAY
  // in the date column either way.
  const noteEntries = (rec && rec.notes) || {};
  const daysWithSlotNote = new Set(Object.keys(noteEntries).filter((k) => k.includes('|')).map((k) => k.split('|')[0]));
  Object.entries(noteEntries).forEach(([k, n]) => {
    if (!n) return;
    if (!k.includes('|') && daysWithSlotNote.has(k)) return;   // the duplicate
    activity.push({ date: k.split('|')[0], label: `Note — ${n}`, load: null });
  });
  // League games fold into the same timeline, so the full history covers court + gym.
  (leaguePlayer && leaguePlayer.log ? leaguePlayer.log : []).forEach((g) => { if (g.date) activity.push({ date: g.date, game: { opp: g.opp && !isBH(g.opp) ? g.opp.replace(/\s*\(.*$/, '') : '—', pts: g.pts, reb: g.reb, ast: g.ast, min: g.min }, load: null }); });
  activity.sort((a, b) => b.date.localeCompare(a.date));
  return (
    <Modal open onClose={onClose} wide title={`#${t.jersey ?? '—'} · ${t.name}`}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: FB, fontSize: 13, color: C.td }}>{t.position || '—'} · {heightM(t.heightCm)} {flag(t.nationality)}</span>
          {onCycleAvail ? (
            <button onClick={onCycleAvail} title="Click to change availability" className="bhbc-ghost-btn" style={{ marginInlineStart: 'auto', display: 'inline-flex', alignItems: 'center', gap: 7, height: 26, boxSizing: 'border-box', fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.tm, background: 'transparent', border: `1px solid ${C.cardBd}`, padding: '0 11px', cursor: 'pointer', transition: 'color .12s, border-color .12s' }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: av.color, flexShrink: 0 }} />{av.label}</button>
          ) : (
            <span style={{ marginInlineStart: 'auto', display: 'inline-flex', alignItems: 'center', gap: 7, height: 26, boxSizing: 'border-box', fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.tm, border: `1px solid ${C.cardBd}`, padding: '0 11px' }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: av.color, flexShrink: 0 }} />{av.label}</span>
          )}
        </div>
        {leaguePlayer && (() => {
          const lastG = (leaguePlayer.log || []).length ? [...leaguePlayer.log].sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0] : null;
          const ago = lastG && lastG.date ? dayDiff(todayISO(), lastG.date) : null;
          const agoLabel = ago == null ? '' : ago === 0 ? 'today' : ago === 1 ? 'yesterday' : ago < 31 ? `${ago} days ago` : ago < 60 ? 'last month' : `${Math.round(ago / 30)} months ago`;
          const avg = [['PPG', leaguePlayer.ppg], ['RPG', leaguePlayer.rpg], ['APG', leaguePlayer.apg], ['MPG', leaguePlayer.mpg], ['3P%', leaguePlayer.tpp + '%'], ['FT%', leaguePlayer.ftp + '%'], ['PIR', leaguePlayer.pirpg], ['GP', leaguePlayer.gp]];
          return (
            <div style={{ border: `1px solid ${C.cardBd}`, borderInlineStart: `3px solid ${ORANGE}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: NAVY_DEEP }}>
                <span style={{ fontFamily: FN, fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#fff' }}>League Stats</span>
                {leagueSeason && <span style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, color: ORANGE, letterSpacing: '0.06em' }}>{leagueSeason}</span>}
              </div>
              {lastG && (
                <div style={{ padding: '10px 12px', borderBottom: `1px solid ${C.cardBd}`, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.tm }}>Last game{agoLabel ? ` · ${agoLabel}` : ''}</div>
                    <div style={{ fontFamily: FN, fontSize: 13, fontWeight: 700, color: C.tx, marginTop: 3 }}>vs {lastG.opp && !isBH(lastG.opp) ? lastG.opp.replace(/\s*\(.*$/, '') : '—'}</div>
                  </div>
                  <div style={{ marginInlineStart: 'auto', display: 'flex', gap: 14 }}>
                    {[['PTS', lastG.pts], ['REB', lastG.reb], ['AST', lastG.ast], ["MIN", lastG.min]].map(([k, v]) => (
                      <div key={k} style={{ textAlign: 'center' }}>
                        <div style={{ fontFamily: FN, fontWeight: 800, fontSize: 18, color: k === 'PTS' ? ORANGE_DEEP : C.tx, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{v}</div>
                        <div style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', color: C.tm, marginTop: 3 }}>{k}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)' }}>
                {avg.map(([k, v], i) => (
                  <div key={k} style={{ padding: '10px 12px', borderRight: (i % 4 !== 3) ? `1px solid ${C.cardBd}` : 'none', borderTop: i >= 4 ? `1px solid ${C.cardBd}` : 'none' }}>
                    <div style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.tm }}>{k}</div>
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
        {bw && bw.length > 0 && (
          <div>
            <div style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.tm, marginBottom: 6 }}>Bodyweight</div>
            <BWChart entries={bw} />
          </div>
        )}
        {(() => {
          // Foster monotony & strain over the last 7 days (illness/overtraining
          // risk). Monotony ≥2 flags too-samey loading; strain = load × monotony.
          const week7 = (days28 || []).slice(-7).map((d) => (rec && rec.loads && rec.loads[d]) || 0);
          const ms = monotonyStrain(week7);
          if (!ms.weekLoad) return null;
          const monC = ms.monotony == null ? C.tx : ms.monotony >= 2.5 ? '#DE4E3B' : ms.monotony >= 2 ? '#E0A73A' : '#37B27C';
          return (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 1, background: C.cardBd, border: `1px solid ${C.cardBd}` }}>
              {[['Week load', ms.weekLoad ? Math.round(ms.weekLoad).toLocaleString() : '—', C.tx], ['Monotony', ms.monotony != null ? ms.monotony.toFixed(2) : '—', monC], ['Strain', ms.strain != null ? Math.round(ms.strain).toLocaleString() : '—', C.td]].map(([k, v, c]) => (
                <div key={k} style={{ background: 'var(--c-sf)', padding: '10px 12px' }}>
                  <div style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.tm }}>{k}</div>
                  <div style={{ fontFamily: FN, fontWeight: 800, fontSize: 20, color: c, marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>{v}</div>
                </div>
              ))}
            </div>
          );
        })()}
        {readiness.level !== 'unknown' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: rc, flexShrink: 0 }} />
          <span style={{ fontFamily: FB, fontSize: 13, color: C.td }}>{readiness.headline}</span>
        </div>
        )}
        {/* Medical / injury — shown on the athlete's profile too, not only the Medical tab */}
        <div style={{ border: `1px solid ${C.cardBd}`, borderInlineStart: `3px solid ${injuries.length ? '#DE4E3B' : '#37B27C'}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderBottom: injuries.length ? `1px solid ${C.cardBd}` : 'none' }}>
            <span style={{ fontFamily: FN, fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.tx }}>Medical</span>
            {!injuries.length && <StatusPill status="available" small />}
            {onInjury && <button onClick={onInjury} style={{ marginInlineStart: 'auto', fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: NAVY, background: 'transparent', border: `1px solid ${C.cardBd}`, padding: '4px 10px', cursor: 'pointer' }}>{injuries.length ? 'Update' : '+ Report injury'}</button>}
          </div>
          {injuries.map((inj) => {
            const days = inj.onsetDate ? dayDiff(todayISO(), inj.onsetDate) : null;
            const lastP = (inj.progress || [])[0];
            return (
              <div key={inj.id} style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <StatusPill status={inj.status} small />
                <span style={{ fontFamily: FB, fontSize: 13, color: C.tx }}>{[inj.bodyPart, inj.side && inj.side !== 'N/A' ? inj.side : '', inj.type].filter(Boolean).map((x) => tr(x)).join(' · ')}</span>
                <span style={{ fontFamily: FN, fontSize: 11, color: C.td, fontVariantNumeric: 'tabular-nums' }}>{days != null ? `${days}d` : ''}{inj.pain != null && inj.pain !== '' ? ` · ${tr('pain')} ${inj.pain}` : ''}{inj.rtpTarget ? ` · RTP ${inj.rtpTarget.slice(5)}` : ''}</span>
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
                      <span style={{ marginInlineStart: 'auto', fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: ORANGE_DEEP, whiteSpace: 'nowrap' }}>{a.game.pts}p · {a.game.reb}r · {a.game.ast}a · {a.game.min}′</span>
                    </span>
                  ) : a.sess && editSess && editSess.date === a.sess.date && editSess.idx === a.sess.idx ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1 }}>
                      <input autoFocus type="number" inputMode="numeric" min="0" value={editSess.min}
                        onChange={(e) => setEditSess({ ...editSess, min: e.target.value })}
                        onKeyDown={(e) => { if (e.key === 'Enter') { onEditSession(editSess.date, editSess.idx, editSess.min, editSess.sig); setEditSess(null); } if (e.key === 'Escape') setEditSess(null); }}
                        style={{ width: 64, fontFamily: FN, fontSize: 12, color: C.tx, background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderRadius: 0, padding: '2px 6px' }} />
                      <span style={{ color: C.td }}>min</span>
                      <button onClick={() => { onEditSession(editSess.date, editSess.idx, editSess.min, editSess.sig); setEditSess(null); }} title="Save" style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, color: '#37B27C', background: 'transparent', border: `1px solid ${C.cardBd}`, padding: '2px 8px', cursor: 'pointer' }}>✓</button>
                      <button onClick={() => setEditSess(null)} title="Cancel" style={{ fontFamily: FN, fontSize: 10, color: C.tm, background: 'transparent', border: `1px solid ${C.cardBd}`, padding: '2px 8px', cursor: 'pointer' }}>✕</button>
                    </span>
                  ) : (
                    <span style={{ color: C.tx, minWidth: 0 }}>{a.label}</span>
                  )}
                  {a.sess && onEditSession && !(editSess && editSess.date === a.sess.date && editSess.idx === a.sess.idx) && (
                    <span style={{ marginInlineStart: 'auto', display: 'inline-flex', gap: 4, flexShrink: 0 }}>
                      <button onClick={() => setEditSess({ date: a.sess.date, idx: a.sess.idx, min: a.sess.min || '', sig: a.sess.sig })} title="Edit minutes" className="bhbc-ghost-btn" style={{ fontFamily: FN, fontSize: 10, color: C.tm, background: 'transparent', border: `1px solid ${C.cardBd}`, padding: '1px 7px', cursor: 'pointer' }}>✎</button>
                      {onDeleteSession && <button onClick={() => { setEditSess(null); onDeleteSession(a.sess.date, a.sess.idx, a.sess.sig); }} title="Delete session" className="bhbc-ghost-btn" style={{ fontFamily: FN, fontSize: 10, color: C.tm, background: 'transparent', border: `1px solid ${C.cardBd}`, padding: '1px 7px', cursor: 'pointer' }}>✕</button>}
                    </span>
                  )}
                  {a.load != null && <span style={{ marginLeft: a.sess && onEditSession ? 8 : 'auto', color: ORANGE_DEEP, fontVariantNumeric: 'tabular-nums', fontWeight: 700, flexShrink: 0 }}>{Math.round(a.load)}</span>}
                </div>
              ))}
            </div>
          ) : <div style={{ fontFamily: FB, fontSize: 13, color: C.td, padding: '6px 0' }}>No history logged yet.</div>}
        </div>
        {program && (program.current || program.count > 0) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 0', borderTop: `1px solid ${C.cardBd}`, fontFamily: FN, fontSize: 11, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.tm }}>Current block</span>
            <span style={{ color: C.tx, fontWeight: 700 }}>{program.current || 'None assigned'}</span>
            {program.count > 1 && <span style={{ color: C.tm }}>· {program.count} total</span>}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          {onOpenExpo && <Btn variant="ghost" onClick={onOpenExpo}>Open in EXPO ›</Btn>}
          {onLog && <Btn variant="ghost" onClick={onLog}>Log session</Btn>}
          {onInjury && <Btn variant="ghost" onClick={onInjury}>Medical report</Btn>}
          {onViewProgram && <Btn onClick={onViewProgram} style={{ background: ORANGE, borderColor: ORANGE, color: '#fff' }}>View program</Btn>}
        </div>
      </div>
    </Modal>
  );
}

// band helpers (mirror acwrEngine bands for the snapshot tile)
function bandKey(r) { if (r == null) return 'none'; if (r < 0.8) return 'detrained'; if (r <= 1.3) return 'low'; if (r < 1.5) return 'elevated'; return 'high'; }
function acwrLabel(r) { return { detrained: 'undertrained', low: 'sweet spot', elevated: 'elevated', high: 'danger', none: '' }[bandKey(r)]; }

// Hoisted out of WellnessModal deliberately. Defined inside the render body its
// function identity changed every render, so React saw a different element TYPE
// each time and unmounted/remounted all four buttons for every athlete on every
// keystroke in the pain and BW inputs — roughly 60 button remounts per character
// on a 15-athlete roster.
//
// The inputs themselves never lost focus, because they are siblings of Seg
// rather than children of it, so this was wasted work rather than the
// focus-eating variant of the same mistake (audit finding #10).
const WellnessSeg = ({ value, opts, onPick }) => (
  <div style={{ display: 'inline-flex', border: `1px solid ${C.cardBd}` }}>
    {opts.map(([val, label]) => {
      const on = value === val;
      return (
        <button
          key={val}
          type="button"
          onClick={() => onPick(val)}
          style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, color: on ? '#fff' : C.td, background: on ? NAVY : 'transparent', border: 'none', padding: '5px 8px', cursor: 'pointer', minWidth: 34 }}
        >{label}</button>
      );
    })}
  </div>
);

// Squad wellness check-in — sleep / energy / pain per athlete → feeds the
// readinessAutoreg engine (session nudge on the load board + athlete profile).
function WellnessModal({ roster, bhbcLoads, onClose, onSave }) {
  const [date, setDate] = useState(todayISO());
  const [entries, setEntries] = useState({});
  useEffect(() => {
    const e = {};
    roster.forEach((t) => { const r = ((bhbcLoads[t.id] || {}).readiness || {})[date] || {}; const bw = ((bhbcLoads[t.id] || {}).bw || {})[date]; e[t.id] = { sleep: r.sleep || '', energy: r.energy || '', pain: r.pain ?? '', bw: bw || '' }; });
    setEntries(e);
  }, [date]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (id, k, v) => setEntries((prev) => ({ ...prev, [id]: { ...prev[id], [k]: (prev[id] && prev[id][k]) === v ? '' : v } }));
  const setVal = (id, k, v) => setEntries((prev) => ({ ...prev, [id]: { ...prev[id], [k]: v } }));
  // Bulk baseline: fill the whole squad as "good sleep, good energy, no pain",
  // then the coach just adjusts the exceptions — the common case is everyone fine.
  const fillAll = () => setEntries(() => { const e = {}; roster.forEach((t) => { e[t.id] = { sleep: 'good', energy: 'good', pain: 0 }; }); return e; });
  const SLEEP = [['poor', 'Poor'], ['ok', 'OK'], ['good', 'Good'], ['great', 'Great']];
  const ENERGY = [['low', 'Low'], ['ok', 'OK'], ['good', 'Good'], ['high', 'High']];
  const inp = { fontFamily: FN, fontSize: 12, color: C.tx, background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderRadius: 0, padding: '0 8px', width: '100%', height: 30, boxSizing: 'border-box', textAlign: 'center' };
  const count = Object.values(entries).filter((e) => e.sleep || e.energy || (e.pain !== '' && e.pain != null) || e.bw).length;
  const cols = '24px 1.3fr auto auto 62px 76px';
  return (
    <Modal open onClose={onClose} wide title="Wellness check-in">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'end', gap: 12, flexWrap: 'wrap' }}>
          <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <Btn variant="ghost" onClick={fillAll} style={{ marginBottom: 1 }}>Baseline all OK</Btn>
        </div>
        {/* Helper as its own clean full-width line (was crammed into the top-right). */}
        <div style={{ fontFamily: FB, fontSize: 12, color: C.td, lineHeight: 1.5 }}>Sleep · energy · pain (0–10) · BW kg (optional). Pain gates the session; sleep + energy set the effort. Tap a value again to clear.</div>
        <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 10, padding: '0 2px 8px', fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.tm, borderBottom: `1px solid ${C.cardBd}` }}>
          <div>#</div><div>Athlete</div><div style={{ textAlign: 'center' }}>Sleep</div><div style={{ textAlign: 'center' }}>Energy</div><div style={{ textAlign: 'center' }}>Pain</div><div style={{ textAlign: 'center' }}>BW kg</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', maxHeight: 380, overflowY: 'auto' }}>
          {roster.map((t) => (
            <div key={t.id} style={{ display: 'grid', gridTemplateColumns: cols, gap: 10, alignItems: 'center', padding: '7px 2px', borderBottom: `0.25px solid ${C.cardBd}` }}>
              <Jersey n={t.jersey} size={22} />
              <div style={{ fontFamily: FN, fontSize: 13, fontWeight: 700, color: C.tx, whiteSpace: 'normal', overflowWrap: 'break-word' }}>{t.name}</div>
              <div style={{ display: 'flex', justifyContent: 'center' }}><WellnessSeg value={(entries[t.id] || {}).sleep} opts={SLEEP} onPick={(v) => set(t.id, 'sleep', v)} /></div>
              <div style={{ display: 'flex', justifyContent: 'center' }}><WellnessSeg value={(entries[t.id] || {}).energy} opts={ENERGY} onPick={(v) => set(t.id, 'energy', v)} /></div>
              <input type="number" min="0" max="10" value={(entries[t.id] || {}).pain} onChange={(e) => set(t.id, 'pain', e.target.value === '' ? '' : Number(e.target.value))} placeholder="—" style={inp} />
              <input type="number" min="0" step="0.1" inputMode="decimal" value={(entries[t.id] || {}).bw} onChange={(e) => setVal(t.id, 'bw', e.target.value)} placeholder="—" style={inp} title="Bodyweight (kg) — optional, shows in the athlete's history + BW trend" />
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontFamily: FN, fontSize: 11, color: C.td, marginRight: 'auto' }}>{count} of {roster.length} filled</span>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn disabled={!count} onClick={() => onSave({ date, entries })} style={{ background: count ? ORANGE : undefined, borderColor: count ? ORANGE : undefined, color: count ? '#fff' : undefined }}>Save check-in</Btn>
        </div>
      </div>
    </Modal>
  );
}

// Per-SESSION plan editor. A day can hold a morning and an evening practice;
// each slot is its own plan, so authoring the evening no longer overwrites the
// morning (and there is finally somewhere to author it at all).
function SessionPlanModal({ slot, fixtures, plan, onClose, onSave, onPick, rows = [], medical = {} }) {
  const [focus, setFocus] = useState(plan?.focus || '');
  const [text, setText] = useState(plan?.plan || '');
  useEffect(() => { setFocus(plan?.focus || ''); setText(plan?.plan || ''); }, [plan, slot?.date, slot?.start]);
  const daySlots = (fixtures || []).filter((f) => f.date === slot.date).slice().sort((a, b) => (a.start || '').localeCompare(b.start || ''));
  const inp = { fontFamily: FN, fontSize: 13, color: C.tx, background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderRadius: 0, padding: '8px 10px', width: '100%', boxSizing: 'border-box', outline: 'none' };
  const title = `${dow(slot.date)} ${monDay(slot.date)} · ${slot.start || ''} ${fxLabelFor(slot.type, fxLabelFor(slot.type, FX_LABEL[slot.type] || 'Session'))}`;
  return (
    <Modal open onClose={onClose} title="Session plan">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {daySlots.length > 1 && (
          <div>
            <div style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.tm, marginBottom: 6 }}>Which session</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {daySlots.map((f, i) => {
                const on = (f.start || '') === (slot.start || '') && f.type === slot.type;
                return (
                  <button key={i} type="button" onClick={() => onPick && onPick(f)}
                    style={{ fontFamily: FN, fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', padding: '6px 10px', cursor: 'pointer', borderRadius: 0,
                      background: on ? NAVY : 'transparent', color: on ? '#fff' : C.tx, border: `1px solid ${on ? NAVY : C.cardBd}` }}>
                    {f.start} · {fxLabelFor(f.type, FX_LABEL[f.type] || 'Session')} {f.minutes ? `· ${f.minutes}m` : ''}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <div style={{ fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: C.tm, textTransform: 'uppercase' }}>{title}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 9, fontWeight: 700, color: C.tm, textTransform: 'uppercase', letterSpacing: '0.18em', fontFamily: FN }}>Focus</label>
          <input value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="e.g. Transition D · half-court sets" style={inp} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 9, fontWeight: 700, color: C.tm, textTransform: 'uppercase', letterSpacing: '0.18em', fontFamily: FN }}>Plan</label>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={8} dir="auto"
            placeholder={'The S&C period at the start of practice — blocks, timings, limits.\n\n15\u2032 warm-up + activation\n20\u2032 shooting\n30\u2032 5v5 (Amit: non-contact, shooting only)'}
            style={{ ...inp, resize: 'vertical', lineHeight: 1.5, fontFamily: FB }} />
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
          <span style={{ fontFamily: FN, fontSize: 11, color: C.td, marginRight: 'auto' }}>{plan?.updatedAt ? `Last edited ${monDay(plan.updatedAt.slice(0, 10))}` : 'Not planned yet'}</span>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn onClick={() => onSave({ focus: focus.trim(), plan: text.trim() })} style={{ background: ORANGE, borderColor: ORANGE, color: '#fff' }}>Save plan</Btn>
        </div>
      </div>
    </Modal>
  );
}

function PracticeEntryModal({ roster, bhbcLoads, fixtures, onClose, onSave, sessionPlans = {} }) {
  const tr = useT();
  // DEFAULT TO TODAY, not to the next fixture on the calendar.
  //
  // This used to pick the next UPCOMING fixture's date, so with no session
  // scheduled today the modal opened on Sunday's practice. A coach running an
  // unscheduled Saturday session fills in minutes and RPE, saves without
  // re-reading the date, and the whole squad's load lands three days in the
  // future — where acwrEngine excludes it from BOTH the acute and chronic
  // windows (sumWindow takes n <= end), so the load board still reports today
  // unchanged and the work simply does not exist until Sunday arrives.
  //
  // The slot picker below still lists whatever is scheduled on the chosen date,
  // so logging a scheduled practice is unchanged — it just no longer silently
  // starts on a different day.
  const [date, setDate] = useState(() => todayISO());
  const dayFx = (fixtures || []).filter((f) => f.date === date).slice().sort((a, b) => String(a.start || '').localeCompare(String(b.start || '')));
  // WHICH session on that date. A day can hold a morning and an evening
  // practice; without this the log silently landed on the first one and the
  // second was unrecordable.
  const [slotStart, setSlotStart] = useState('');
  const slot = dayFx.find((f) => f.start === slotStart) || null;
  const slotPlan = slot ? sessionPlans[`${date}|${slot.start || ''}`] : null;
  const [minutes, setMinutes] = useState('');
  const [teamRpe, setTeamRpe] = useState('');
  const [intensity, setIntensity] = useState('');
  const [sessionType, setSessionType] = useState('Practice');
  const [entries, setEntries] = useState({});
  useEffect(() => {
    const e = {};
    roster.forEach((t) => { const rec = bhbcLoads[t.id] || {}; e[t.id] = { avail: (rec.availability && rec.availability[date]) || 1, attended: true, rpe: '', bw: '', note: '' }; });
    setEntries(e);
    const list = (fixtures || []).filter((f) => f.date === date).slice().sort((a2, b2) => (a2.start || '').localeCompare(b2.start || ''));
    // Default to the NEXT slot still ahead on the clock (so an evening log
    // doesn't default to the morning), else the first practice of the day.
    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const upcoming = date === todayISO() ? list.find((f) => (f.start || '') >= hhmm) : null;
    const prac = upcoming || list.find((f) => f.type === 'practice') || list[0];
    setSlotStart(prac ? (prac.start || '') : '');
    setMinutes(prac ? String(prac.minutes) : '');
    // Default the session type from the day's fixture (game day → Game).
    const g = list.find((f) => f.type === 'game');
    setSessionType(g ? 'Game' : (list.find((f) => f.type === 'lift') && !prac ? 'Lift' : 'Practice'));
  }, [date]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (id, k, v) => setEntries((prev) => ({ ...prev, [id]: { ...prev[id], [k]: v } }));
  const inp = { fontFamily: FN, fontSize: 12, color: C.tx, background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderRadius: 0, padding: '0 8px', width: '100%', height: 32, boxSizing: 'border-box' };
  // A gym session needs minutes and nothing else — demanding an RPE made the
  // one session type Ohad never scores unsaveable (his hard rule).
  const isLift = sessionType === 'Lift';
  const canSave = Number(minutes) > 0 && (isLift || Number(teamRpe) > 0);
  const cols = isLift ? '24px 1.4fr 116px 72px 66px 1.5fr' : '24px 1.4fr 116px 72px 56px 66px 1.5fr';
  return (
    <Modal open onClose={onClose} wide title={tr('Log session')}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* bhbc-form-grid: the ≤620px rule that stacks these into full-width
            rows already exists in themes.css and is used by the injury modal —
            this row never got the class. Measured, it needs ~460px of fixed
            column floors (a date input alone is ~130px) inside a 310px sheet,
            and it holds Minutes and Team RPE, the two fields canSave requires.
            So the primary daily write was the one squeezed off a phone. */}
        <div className="bhbc-form-grid" style={{ display: 'grid', gridTemplateColumns: isLift ? '1.1fr 1fr 0.8fr 1fr' : '1.1fr 1fr 0.8fr 0.8fr 1fr', gap: 10, alignItems: 'end' }}>
          <Input label={tr('Date')} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 9, fontWeight: 700, color: C.tm, textTransform: 'uppercase', letterSpacing: '0.18em', fontFamily: FN, textAlign: 'center' }}>{tr('Type')}</label>
            <select value={sessionType} onChange={(e) => setSessionType(e.target.value)} style={inp}>
              {['Practice', 'Game', 'Lift', 'Shootaround', 'Conditioning', 'Recovery'].map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <Input label={tr('Minutes')} type="number" value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder="75" />
          {/* No RPE anywhere on a gym session (Ohad: "i will never write the rpe for the gym workouts"). */}
          {!isLift && <Input label={tr('Team RPE')} type="number" min="0" max="10" step="0.5" value={teamRpe} onChange={(e) => setTeamRpe(e.target.value)} placeholder="7" />}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 9, fontWeight: 700, color: C.tm, textTransform: 'uppercase', letterSpacing: '0.18em', fontFamily: FN, textAlign: 'center' }}>{tr('Intensity')}</label>
            <select value={intensity} onChange={(e) => setIntensity(e.target.value)} style={inp}>
              <option value="">—</option>
              {['Low', 'Moderate', 'High', 'Very High'].map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
        </div>
        {dayFx.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.tm }}>{tr('Which session')}</span>
              {dayFx.map((f, i) => {
                const on = (f.start || '') === slotStart;
                return (
                  <button key={i} type="button"
                    onClick={() => { setSlotStart(f.start || ''); setMinutes(String(f.minutes || '')); setSessionType(f.type === 'game' ? 'Game' : f.type === 'lift' ? 'Lift' : 'Practice'); }}
                    style={{ fontFamily: FN, fontSize: 12, fontWeight: 700, padding: '5px 10px', cursor: 'pointer', borderRadius: 0,
                      background: on ? NAVY : 'transparent', color: on ? '#fff' : C.tx, border: `1px solid ${on ? NAVY : C.cardBd}` }}>
                    {f.start} · {fxLabelFor(f.type, FX_LABEL[f.type] || 'Session')} {f.minutes ? `· ${f.minutes}m` : ''}
                  </button>
                );
              })}
            </div>
            {slotPlan && (slotPlan.focus || slotPlan.plan) && (
              <div style={{ border: `1px solid ${C.cardBd}`, borderInlineStart: `3px solid ${ORANGE}`, padding: '8px 10px' }}>
                <div style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.tm, marginBottom: 3 }}>{tr('Plan for this session')}</div>
                {slotPlan.focus && <div style={{ fontFamily: FN, fontSize: 12, fontWeight: 700, color: C.tx }}>{slotPlan.focus}</div>}
                {slotPlan.plan && <div dir="auto" style={{ fontFamily: FB, fontSize: 12, color: C.tm, whiteSpace: 'pre-wrap', lineHeight: 1.45, marginTop: 2 }}>{slotPlan.plan}</div>}
              </div>
            )}
          </div>
        )}
        {(() => {
          // Microcycle context for the session's date — the plan's emphasis +
          // a suggested intensity (informs the coach; never overrides the pick).
          const g = (fixtures || []).filter((f) => f.type === 'game' && f.date >= date).sort((a, b) => a.date.localeCompare(b.date))[0];
          if (!g) return null;
          const plan = mdPlan(-dayDiff(g.date, date));
          const sug = plan.game ? null : plan.load >= 5 ? 'High' : plan.load >= 3 ? 'Moderate' : 'Low';
          return <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontFamily: FN, fontSize: 11, color: C.tm, flexWrap: 'wrap' }}><span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.tm }}>{tr('Microcycle')}</span><span style={{ fontWeight: 800, color: '#fff', background: plan.game ? ORANGE : plan.load >= 5 ? ORANGE_DEEP : plan.load >= 3 ? NAVY : '#6B7280', padding: '2px 7px' }}>{plan.label}</span><span style={{ color: C.tx }}>{plan.emphasis}</span>{sug && <span style={{ color: C.td }}>· suggest {sug} intensity</span>}</div>;
        })()}
        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 560 }}>
            <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 8, padding: '0 0 8px', fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.tm, borderBottom: `1px solid ${C.cardBd}` }}>
              <div>#</div><div>{tr('Athlete')}</div><div>{tr('Availability')}</div><div>{tr('This slot')}</div>{!isLift && <div>{tr('RPE')}</div>}<div>{tr('BW kg')}</div><div>{tr('Note')}</div>
            </div>
            {roster.map((t) => {
              const e = entries[t.id] || { avail: 1, rpe: '', bw: '', note: '' };
              const av = AVAIL[e.avail];
              return (
                <div key={t.id} style={{ display: 'grid', gridTemplateColumns: cols, gap: 8, alignItems: 'center', padding: '7px 0', borderBottom: `0.25px solid ${C.cardBd}` }}>
                  <Jersey n={t.jersey} size={22} />
                  <div style={{ fontFamily: FN, fontSize: 13, fontWeight: 700, color: C.tx, whiteSpace: 'normal', overflowWrap: 'break-word' }}>{t.name}</div>
                  <button type="button" onClick={() => set(t.id, 'avail', (e.avail % 5) + 1)} title={tr('Click to change availability')} className="bhbc-ghost-btn" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%', height: 32, boxSizing: 'border-box', fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: C.tm, background: 'transparent', border: `1px solid ${C.cardBd}`, padding: '0 6px', cursor: 'pointer', whiteSpace: 'nowrap', transition: 'color .12s, border-color .12s' }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: av.color, flexShrink: 0 }} />{av.label}</button>
                  {/* Attendance for THIS slot only. An athlete Out for the day is
                      locked out of every slot; anyone else can be marked absent
                      from this session without changing his day. */}
                  {(() => {
                    const dayOut = e.avail >= 4;
                    const inSlot = !dayOut && e.attended !== false;
                    return (
                      <button type="button" disabled={dayOut}
                        onClick={() => set(t.id, 'attended', !inSlot)}
                        title={dayOut ? 'Out for the whole day' : inSlot ? 'Trained this session — click to mark absent' : 'Absent from this session — click to mark present'}
                        className="bhbc-ghost-btn"
                        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: 32, boxSizing: 'border-box', fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: dayOut ? C.td : inSlot ? '#37B27C' : '#DE4E3B', background: 'transparent', border: `1px solid ${dayOut ? C.cardBd : inSlot ? '#37B27C' : '#DE4E3B'}`, padding: '0 6px', cursor: dayOut ? 'not-allowed' : 'pointer', opacity: dayOut ? 0.5 : 1, whiteSpace: 'nowrap' }}>
                        {dayOut ? '—' : inSlot ? 'In' : 'Out'}
                      </button>
                    );
                  })()}
                  {!isLift && <input type="number" value={e.rpe} onChange={(ev) => set(t.id, 'rpe', ev.target.value)} placeholder={teamRpe || 'RPE'} style={inp} />}
                  <input type="number" value={e.bw} onChange={(ev) => set(t.id, 'bw', ev.target.value)} placeholder="—" style={inp} />
                  <input value={e.note} onChange={(ev) => set(t.id, 'note', ev.target.value)} placeholder={tr('note')} style={inp} />
                </div>
              );
            })}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontFamily: FN, fontSize: 11, color: C.td, marginRight: 'auto' }}>{isLift
            ? 'Gym sessions are minutes only — no RPE, no load. “This slot” records who actually trained THIS session.'
            : 'Load = minutes × RPE (per-athlete or team). “This slot” records who actually trained THIS session — the day’s availability is separate.'}</span>
          <Btn variant="ghost" onClick={onClose}>{tr('Cancel')}</Btn>
          <Btn disabled={!canSave} onClick={() => onSave({ date, minutes, teamRpe, intensity, entries, sessionType, start: slotStart })} style={{ background: canSave ? ORANGE : undefined, borderColor: canSave ? ORANGE : undefined, color: canSave ? '#fff' : undefined }}>Save {sessionType.toLowerCase()}</Btn>
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
        <div style={{ fontFamily: FB, fontSize: 13, color: C.td }}>{dow(game.date)} {monDay(game.date)} · {game.start}</div>
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
          <Btn onClick={() => onSave({ opponent: opponent.trim(), venue: venue.trim(), home: home === '' ? null : home === 'home' })} style={{ background: ORANGE, borderColor: ORANGE, color: '#fff' }}>Save</Btn>
        </div>
      </div>
    </Modal>
  );
}

// Home/Away chip — form + label (never color alone).
function HAChip({ home }) {
  const tr = useT();
  if (home == null) return null;
  const isHome = home === true;
  // Theme-aware brand tone — the raw navy is unreadable on the dark page.
  const c = isHome ? 'var(--bhbc-ha-home, ' + NAVY + ')' : 'var(--bhbc-ha-away, ' + ORANGE_DEEP + ')';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: FN, fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: c, background: `color-mix(in srgb, ${c} 12%, transparent)`, border: `1px solid color-mix(in srgb, ${c} 40%, transparent)`, padding: '2px 7px', whiteSpace: 'nowrap' }}>
      {isHome ? tr('HOME') : tr('AWAY')}
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
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: FN, fontSize: 11, color: C.td }}>
        <span style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.tm }}>{dir}</span>
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
  const tr = useT();
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
                {/* 9, not 7.5: measured at 390px this was the smallest text in the zone,
                    and it labels the number a coach reads first. */}
                <div style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.tm, marginTop: 2 }}>{tr('days')}</div>
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: FN, fontSize: 13, fontWeight: 700, color: C.tx }}>{g.opponent ? `vs ${g.opponent}` : 'Opponent TBD'}</span>
                  <HAChip home={g.home} />
                  {g.travel && <span style={{ fontFamily: FN, fontSize: 11, color: ORANGE_DEEP }} title="Travel">✈</span>}
                  {tight && <span style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#fff', background: '#E0A73A', padding: '1px 6px' }} title={`${gap} days after the previous game`}>{gap}d turnaround</span>}
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
  const he = useHe();
  const tr = useT();
  const days = dayDiff(nextGame.date, today);
  const when = days <= 0 ? tr('GAME DAY') : days === 1 ? tr('Tomorrow') : (he ? `בעוד ${days} ימים` : `In ${days} days`);
  const timeLabel = nextGame.timeTBD || !nextGame.start ? tr('Time TBD') : nextGame.start;
  return (
    <Card padding={18} leftStripe={ORANGE} header={secTitle('Next Game')} headerRight={<div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#fff' }}>{when}</span>{onEdit && <button onClick={onEdit} style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#fff', background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.3)', height: 24, boxSizing: 'border-box', padding: '0 9px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, cursor: 'pointer' }}>{tr('Edit')}</button>}</div>}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
        <div style={{ textAlign: 'center', flexShrink: 0 }}>
          <div style={{ fontFamily: FN, fontWeight: 800, fontSize: 40, lineHeight: 1, color: ORANGE_DEEP, fontVariantNumeric: 'tabular-nums' }}>{Math.max(0, days)}</div>
          <div style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.tm, marginTop: 4 }}>{tr('days')}</div>
        </div>
        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {nextGame.comp && <div style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: ORANGE_DEEP }}>{nextGame.comp}</div>}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: FN, fontWeight: 800, fontSize: 17, color: C.tx }}>{nextGame.opponent ? `vs ${nextGame.opponent}` : 'Opponent TBD'}</span>
            <HAChip home={nextGame.home} />
          </div>
          <div style={{ fontFamily: FB, fontSize: 13, color: C.td }}>
            {dow(nextGame.date)} {monDay(nextGame.date)} · {timeLabel}{nextGame.venue ? ` · ${nextGame.venue}` : ''}
          </div>
        </div>
      </div>
      {nextGame.travel && <TravelStrip travel={nextGame.travel} />}
    </Card>
  );
}

// Coach's Brief — turns the live monitoring data into a prioritised "do this
// today" list, each call grounded in the S&C corpus (Gabbett ACWR, Foster
// monotony, Mujika taper, ~10%/wk ramp). This is the decision layer: the board
// shows numbers, the brief says what to DO about them. Action-first, rationale
// muted. Pre-season (no data) it points at the right first move: baseline.
function CoachBrief({ rows, fx, fixtures, medical, today, onOpen, onLog }) {
  const tr = useT();
  const first = (r) => (r.t.name || '').trim().split(/\s+/)[0] || r.t.name;
  const names = (arr) => arr.slice(0, 4).map(first).join(', ') + (arr.length > 4 ? ` +${arr.length - 4}` : '');
  const anyLoad = rows.some((r) => r.hasLoad);
  const A = [];
  // 1) Taper into a game ≤3 days out.
  if (fx.nextGame) {
    const d = dayDiff(fx.nextGame.date, today);
    if (d >= 0 && d <= 3) A.push({ sev: 'game', do: `Taper into ${fx.nextGame.opponent ? 'vs ' + fx.nextGame.opponent : 'the game'} · ${d === 0 ? 'today' : d + 'd'}`, why: 'hold intensity, cut volume ~40–60%.' });
  }
  // 2) ACWR danger (>1.5) then elevated (1.3–1.5) — Gabbett sweet spot 0.8–1.3.
  const danger = rows.filter((r) => r.acwr.band.key === 'high');
  const elevated = rows.filter((r) => r.acwr.band.key === 'elevated');
  if (danger.length) A.push({ sev: 'red', do: `${tr('Pull back')} ${names(danger)}`, why: tr('ACWR danger zone'), ids: danger.map((r) => r.t.id) });
  // 3) Readiness red today (autoreg says don't load).
  const red = rows.filter((r) => r.readiness.level === 'red');
  if (red.length) A.push({ sev: 'red', do: `${tr('Regress')} ${names(red)} ${tr('today')}`, why: `${tr('readiness red')} — ${red[0].readiness.headline || tr('reassess before loading')}.`, ids: red.map((r) => r.t.id) });
  // 3b) Fixture congestion — a tight run of games needs rotation + recovery.
  const games = (fixtures || []).filter((f) => f.type === 'game' && f.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  for (let i = 0; i < games.length - 1; i++) {
    const gap = dayDiff(games[i + 1].date, games[i].date);
    if (gap > 0 && gap < 4) { A.push({ sev: 'amber', do: `Congestion ${monDay(games[i].date)}–${monDay(games[i + 1].date)}`, why: `${gap}-day turnaround between games — rotate minutes and protect MD+1 recovery.` }); break; }
  }
  // 4) Injuries in rehab.
  const injured = rows.filter((r) => activeInjuries(medical, r.t.id).length);
  if (injured.length) A.push({ sev: 'red', do: `${injured.length} ${tr('in rehab')} (${names(injured)})`, why: tr('check the medical board'), ids: injured.map((r) => r.t.id) });
  if (elevated.length) A.push({ sev: 'amber', do: `${tr('Watch')} ${names(elevated)}`, why: tr('ACWR elevated'), ids: elevated.map((r) => r.t.id) });
  // 5) Monotony ≥2 (Foster).
  const mono = rows.filter((r) => r.ms.monotony != null && r.ms.monotony >= 2);
  if (mono.length) A.push({ sev: 'amber', do: `${tr('Vary the stimulus for')} ${names(mono)}`, why: tr('monotony high'), ids: mono.map((r) => r.t.id) });
  // 6) Undertrained (ACWR <0.8) — ramp safely.
  const detr = rows.filter((r) => r.acwr.band.key === 'detrained');
  if (detr.length && anyLoad) A.push({ sev: 'info', do: `${tr('Ramp up')} ${names(detr)}`, why: tr('ACWR undertrained'), ids: detr.map((r) => r.t.id) });
  // 7) Missing wellness check-ins today.
  const missing = rows.filter((r) => !r.checkedToday);
  // (the "chase check-ins" item went with the rest of the check-in flow)
  // 8) Pre-season / no data — baseline first.
  if (!anyLoad && rows.every((r) => !r.checkedToday)) {
    A.unshift({ sev: 'game', do: tr('Start tracking the roster'), why: tr('pre-season start') });
  }
  const sevRank = { game: 0, red: 1, amber: 2, info: 3 };
  const top = A.sort((a, b) => sevRank[a.sev] - sevRank[b.sev]).slice(0, 5);
  const sevColor = { game: ORANGE, red: '#DE4E3B', amber: '#E0A73A', info: '#4F9DE0' };
  return (
    <Card padding={18} leftStripe={ORANGE} header={secTitle('S&C Brief')} headerRight={<span style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#fff' }}>{dow(today)} {monDay(today)}</span>}>
      {top.length === 0 ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontFamily: FB, fontSize: 13, color: C.td, padding: '4px 0' }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#37B27C', flexShrink: 0 }} />All clear — no load, readiness or medical flags today.
        </div>
      ) : (
        <div>
          {top.map((a, i) => {
            const click = a.act ? a.act : (a.ids && a.ids.length === 1 && onOpen ? () => onOpen(a.ids[0]) : null);
            return (
              <div key={i} onClick={click || undefined} className={click ? 'bhbc-row' : undefined}
                  role={click ? 'button' : undefined} tabIndex={click ? 0 : undefined}
                  onKeyDown={click ? ((ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); click(); } }) : undefined}
                style={{ display: 'flex', alignItems: 'flex-start', gap: 11, padding: '9px 2px', borderBottom: i < top.length - 1 ? `0.25px solid ${C.cardBd}` : 'none', cursor: click ? 'pointer' : 'default' }}>
                {/* Center the dot on the first text line. The +4px offset accounts for
                    Nord's bottom-heavy line box (measured: line-center sits ~4px below
                    the CSS line-box center). Ohad: dot must be vertically centered. */}
                <span style={{ display: 'inline-flex', alignItems: 'center', height: 12.5 * 1.5, marginTop: 4, flexShrink: 0 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: sevColor[a.sev] }} />
                </span>
                <div style={{ minWidth: 0, lineHeight: 1.5, flex: 1 }}>
                  <span style={{ fontFamily: FN, fontSize: 13, fontWeight: 700, letterSpacing: '0.02em', color: C.tx }}>{a.do}</span>
                  <span style={{ fontFamily: FB, fontSize: 13, color: C.tm }}> — {a.why}</span>
                </div>
                {click && <span style={{ fontFamily: FN, fontSize: 12, fontWeight: 700, color: ORANGE, flexShrink: 0, marginTop: 3 }}>›</span>}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

// The HEAD COACH's daily/weekly REPORT — the game-week picture at a glance:
// next game, who's available, the medical board, and the team's upcoming sessions.
// (The S&C load decisions live in the separate S&C Brief.)
function HeadCoachReport({ rows, fx, fixtures, medical, today, onOpen, onMedical, onReportNew, planOf, onPlan, onCopy, copied }) {
  const he = useHe();
  const tr = useT();
  const first = (r) => (r.t.name || '').trim().split(/\s+/)[0] || r.t.name;
  const nameList = (arr) => arr.slice(0, 5).map(first).join(', ') + (arr.length > 5 ? ` +${arr.length - 5}` : '');
  const availOf = (r) => r.avail || 1;                 // 1 = full, 2–3 = limited, 4+ = out
  const out = rows.filter((r) => availOf(r) >= 4);
  const limited = rows.filter((r) => availOf(r) >= 2 && availOf(r) < 4);
  const available = rows.filter((r) => availOf(r) < 2);
  const injuries = rows.flatMap((r) => activeInjuries(medical, r.t.id).map((inj) => ({ t: r.t, inj })));
  const nextGame = fx.nextGame;
  const gd = nextGame ? dayDiff(nextGame.date, today) : null;
  const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  const weekEnd = addDays(today, 7);
  const sessions = (fixtures || []).filter((f) => f.type !== 'game' && f.date >= today && f.date <= weekEnd).sort((a, b) => a.date.localeCompare(b.date) || (a.start || '').localeCompare(b.start || ''));
  const mut = { color: C.tm };
  const lbl = { fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.tm, width: 92, flexShrink: 0, paddingTop: 2 };
  const Section = ({ label, children, last }) => (
    <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', padding: '11px 2px', borderBottom: last ? 'none' : `0.25px solid ${C.cardBd}` }}>
      <div style={lbl}>{label}</div>
      <div style={{ flex: 1, minWidth: 0, fontFamily: FB, fontSize: 13, color: C.tx, lineHeight: 1.5 }}>{children}</div>
    </div>
  );
  return (
    <Card padding={18} leftStripe={NAVY} header={secTitle('Head Coach Report')} headerRight={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>{onCopy && <button onClick={onCopy} style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#fff', background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.3)', height: 24, boxSizing: 'border-box', padding: '0 10px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, cursor: 'pointer', borderRadius: 0 }}>{copied ? tr('Copied') : tr('Copy')}</button>}<span style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#fff' }}>{dow(today)} {monDay(today)}</span></span>}>
      {/* NEXT GAME */}
      <Section label={tr("Next game")}>
        {nextGame
          ? <span><span style={{ fontFamily: FN, fontWeight: 700 }}>{nextGame.opponent ? `${tr('vs')} ${nextGame.opponent}` : tr('Opponent TBD')}</span> <span style={mut}>· {gd === 0 ? tr('Today') : gd < 0 ? tr('in progress') : (he ? `בעוד ${gd} ימים` : `in ${gd} day${gd === 1 ? '' : 's'}`)} · {nextGame.home === true ? tr('HOME') : nextGame.home === false ? tr('AWAY') : tr('Venue TBD')}{nextGame.venue ? ' · ' + nextGame.venue : ''}</span></span>
          : <span style={mut}>No game scheduled.</span>}
      </Section>
      {/* AVAILABILITY */}
      <Section label={tr("Availability")}>
        <span><span style={{ color: '#37B27C', fontFamily: FN, fontWeight: 800 }}>{available.length}</span> {tr('available')} <span style={mut}>·</span> <span style={{ color: limited.length ? 'var(--bhbc-amber-text, #E0A73A)' : C.tm, fontFamily: FN, fontWeight: 800 }}>{limited.length}</span> {tr('limited')} <span style={mut}>·</span> <span style={{ color: out.length ? '#DE4E3B' : C.tm, fontFamily: FN, fontWeight: 800 }}>{out.length}</span> {tr('out')}</span>
        {(out.length > 0 || limited.length > 0) && <div style={{ marginTop: 3, color: C.tm, fontSize: 12 }}>{out.length ? `${tr('out')}: ${nameList(out)}. ` : ''}{limited.length ? `${tr('limited')}: ${nameList(limited)}.` : ''}</div>}
      </Section>
      {/* MEDICAL */}
      <Section label={tr("Medical")}>
        {injuries.length
          ? <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {injuries.slice(0, 6).map(({ t, inj }, i) => {
                const s = MED_STATUS[inj.status] || MED_STATUS.available;
                return (
                  // Wraps for the same reason as the This-week rows: on a phone
                  // the injury description was ellipsized to "AN…", which is not
                  // an injury report. It now takes its own line and the UPDATE
                  // button stays whole.
                  <div key={i} onClick={onOpen ? () => onOpen(t.id) : undefined} role={onOpen ? 'button' : undefined} tabIndex={onOpen ? 0 : undefined} onKeyDown={onOpen ? ((ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onOpen(t.id); } }) : undefined} className={onOpen ? 'bhbc-row' : undefined} style={{ display: 'flex', alignItems: 'center', gap: 8, rowGap: 2, flexWrap: 'wrap', cursor: onOpen ? 'pointer' : 'default' }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                    <span style={{ fontFamily: FN, fontWeight: 700, fontSize: 12, flexShrink: 0 }}>{t.name}</span>
                    {/* WRAP, do not ellipsize. The row already wraps, and on a narrow RTL line
    the ellipsis eats the START of the diagnosis — "…T SPRAIN" instead of
    "ANKLE LEFT SPRAIN". A truncated injury is not an injury report. */}
                    <span style={{ color: C.tm, minWidth: 128, flexShrink: 1, whiteSpace: 'normal', overflowWrap: 'break-word' }}>{[inj.bodyPart, inj.side && inj.side !== 'N/A' ? inj.side : '', inj.type].filter(Boolean).map((x) => tr(x)).join(' ')} · {tr(s.label)}{inj.rtpTarget ? ` · RTP ${monDay(inj.rtpTarget)}` : ''}</span>
                                      {onMedical && (
                      <button onClick={(e) => { e.stopPropagation(); onMedical(t.id); }} title="Update this medical report" className="bhbc-ghost-btn"
                        style={{ marginInlineStart: 'auto', flexShrink: 0, fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: C.tm, background: 'transparent', border: `1px solid ${C.cardBd}`, borderRadius: 0, height: ROW_BTN_H, boxSizing: 'border-box', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, padding: '0 9px', cursor: 'pointer' }}>{tr('UPDATE')}</button>
                    )}
</div>
                );
              })}
            </div>
          : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span><span style={{ color: '#37B27C', fontFamily: FN, fontWeight: 700 }}>All clear</span> <span style={mut}>— no active injuries.</span></span>
              {onReportNew && <button onClick={onReportNew} className="bhbc-ghost-btn" style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: ORANGE, background: 'transparent', border: `1px solid ${C.cardBd}`, borderRadius: 0, height: ROW_BTN_H, boxSizing: 'border-box', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, padding: '0 9px', cursor: 'pointer' }}>+ REPORT</button>}
            </span>}
      </Section>
      {/* THIS WEEK — team sessions */}
      <Section label={tr("This week")} last>
        {sessions.length
          ? <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {sessions.slice(0, 6).map((s, i) => {
                const pl = planOf ? planOf(s) : null;
                // Weight-room sessions appear on the calendar but are not planned.
                const clickable = !!onPlan && s.type !== 'lift';
                return (
                <div key={i} onClick={clickable ? () => onPlan(s) : undefined}
              role={clickable ? 'button' : undefined} tabIndex={clickable ? 0 : undefined}
              onKeyDown={clickable ? ((ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onPlan(s); } }) : undefined}
                  title={clickable ? (pl ? 'Edit this session’s plan' : 'Add a plan for this session') : undefined}
                  className={clickable ? 'bhbc-row' : undefined}
                  // flexWrap so a squeezed label moves to its own LINE instead of
                  // being crushed to "PR…". The action still never breaks: it
                  // wraps whole rather than sliding off the viewport, which was
                  // the failure the fixed columns were protecting against.
                  style={{ display: 'flex', alignItems: 'center', gap: 10, rowGap: 2, flexWrap: 'wrap', cursor: clickable ? 'pointer' : 'default', padding: '2px 0' }}>
                  {/* 96 + nowrap, same as the past-practice list: at 78px some dates
                      wrapped to two lines and others did not, so the column read
                      ragged down the card. */}
                  <span style={{ fontFamily: FN, fontWeight: 700, fontSize: 12, color: C.tx, width: 96, flexShrink: 0, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{s.date === today ? tr('Today') : `${dow(s.date)} ${monDay(s.date)}`}</span>
                  <span style={{ fontFamily: FN, fontSize: 12, fontWeight: 700, color: FX_COLOR[s.type] || NAVY, width: 46, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{s.start}</span>
                  {/* The descriptive label is the token that gives way: at 390px the
                      fixed date + time columns plus this label pushed the + PLAN action
                      86px past the viewport, where it could not be tapped at all
                      (mobile sweep 08-25). The ACTION always stays whole. */}
                  {/* minWidth gives the label a floor: below it the row wraps and
                      the label keeps its own line, rather than ellipsizing down to
                      two characters, which told the coach nothing. */}
                  <span style={{ color: C.tm, flexShrink: 1, minWidth: 104, whiteSpace: 'normal', overflowWrap: 'break-word' }}>{fxLabelFor(s.type, FX_LABEL[s.type] || 'Session')}{s.minutes ? ` · ${s.minutes} ${fxLabelFor('__min', 'min')}` : ''}</span>
                  {/* The plan for THAT slot, right where the week is read —
                      the Today card only ever covered today (Ohad: "where can
                      I see the plan for tonight?"). */}
                  {pl && (pl.focus || pl.plan)
                    ? <span dir="auto" style={{ flex: '1 1 auto', minWidth: 0, color: C.tx, fontFamily: FB, fontSize: 12, whiteSpace: 'normal', overflowWrap: 'break-word' }}>— {pl.focus || pl.plan}</span>
                    : clickable ? <span style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', color: ORANGE, flexShrink: 0 }}>{tr('+ PLAN')}</span> : null}
                </div>
                );
              })}
            </div>
          : <span style={mut}>No team sessions scheduled this week.</span>}
      </Section>
    </Card>
  );
}

// ============================ STAFF BRIEF ============================
// Ohad, 2026-08-28, on what this zone is actually for:
//
//   "just the s&c period on the court which is in the begging of the
//    basketball practice and thats what i plan log and tell the basketball
//    coaches and head coach about"
//
// He plans it, runs it, logs it — and then TELLS SOMEONE. That last step is
// the output of the whole product, and the zone has never produced it: the
// coach had to read four cards and retype the summary into a message.
//
// Built from what the zone already knows — the S&C slot, its focus, and who
// cannot do it — and copied in one tap. Plain text on purpose: it is going
// into a message to a basketball coach, not into another app.
function StaffBrief({ today, fx, rows, medical, planOf }) {
  const tr = useT();
  const he = useHe();
  const [copied, setCopied] = useState(false);
  const dayGroup = ((fx && fx.byDay) || []).find((d) => d.date === today);
  const slots = (dayGroup && dayGroup.items) || [];
  // The S&C period sits at the START of a basketball practice, so the
  // practice slot is the one he briefs. A weights session is not briefed.
  const period = slots.find((f) => f.type === 'practice') || null;
  const plan = period && planOf ? planOf(period) : null;
  const limited = [], outList = [];
  for (const r of (rows || [])) {
    const inj = activeInjuries(medical || {}, r.t.id);
    const worst = inj.find((i) => i.status === 'out') || inj.find((i) => i.status === 'non-contact') || inj.find((i) => i.status === 'limited');
    const label = (x) => [x.bodyPart, x.type].filter(Boolean).map((v) => tr(v)).join(' ');
    if (worst && worst.status === 'out') outList.push(r.t.name + ' — ' + label(worst));
    else if (worst) limited.push(r.t.name + ' — ' + label(worst) + ' (' + tr((MED_STATUS[worst.status] || {}).label || worst.status) + ')');
  }
  const availCount = (rows || []).length - limited.length - outList.length;
  const L = he
    ? { when: 'מתי', focus: 'פוקוס', limited: 'מוגבלים', out: 'בחוץ', avail: 'זמינים', none: 'אין', noFocus: 'לא נכתב פוקוס', noSession: 'אין אימון היום', copy: 'העתק', copied: 'הועתק' }
    : { when: 'When', focus: 'Focus', limited: 'Limited', out: 'Out', avail: 'Available', none: 'none', noFocus: 'no focus written', noSession: 'no practice today', copy: 'Copy', copied: 'Copied' };
  // One date string that is correct in both languages: dowFor/monDayFor
  // return the English fallback when the zone is not in Hebrew, so both
  // arguments are required.
  const dObj = new Date(today + 'T12:00:00');
  const EN_DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const EN_MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const briefDate = dowFor(dObj, EN_DOW[dObj.getDay()]) + ' ' + monDayFor(dObj, dObj.getDate() + ' ' + EN_MON[dObj.getMonth()]);
  const whenLine = period
    ? L.when + ': ' + (period.start || '') + ' ' + fxLabelFor(period.type, 'Practice') + (period.minutes ? ' · ' + period.minutes + ' ' + fxLabelFor('__min', 'min') : '')
    : L.when + ': ' + L.noSession;
  const text = [
    'BHBC · ' + briefDate,
    whenLine,
    L.focus + ': ' + ((plan && (plan.focus || plan.plan)) || L.noFocus),
    '',
    L.avail + ': ' + availCount,
    L.limited + ' (' + limited.length + '): ' + (limited.length ? limited.join('; ') : L.none),
    L.out + ' (' + outList.length + '): ' + (outList.length ? outList.join('; ') : L.none),
  ].join(String.fromCharCode(10));
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); } catch { /* denied — the text is on screen anyway */ }
    setCopied(true); setTimeout(() => setCopied(false), 1800);
  };
  return (
    <Card padding={18} leftStripe={ORANGE} header={secTitle('Brief for the staff')}
      headerRight={
        <button onClick={copy} style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#fff', background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.3)', height: 24, boxSizing: 'border-box', padding: '0 10px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, cursor: 'pointer', borderRadius: 0 }}>
          {copied ? L.copied : L.copy}
        </button>
      }>
      {/* Shown exactly as it will be pasted — what he sends is what he sees. */}
      <div dir="auto" style={{ fontFamily: FB, fontSize: 13, color: C.tx, lineHeight: 1.6, whiteSpace: 'pre-wrap', overflowWrap: 'break-word' }}>{text}</div>
    </Card>
  );
}
function TodayPanel({ today, fixtures, fx, rows, onSessions, onLog, planOf, onPlan }) {
  const he = useHe();
  const tr = useT();
  const todayFx = (fixtures || []).filter((f) => f.date === today).slice().sort((a, b) => a.start.localeCompare(b.start));
  const next = fx.byDay[0];
  const av = { full: 0, mod: 0, out: 0 };
  rows.forEach((r) => { if (r.avail <= 1) av.full++; else if (r.avail <= 3) av.mod++; else av.out++; });
  const gd = fx.nextGame ? dayDiff(today, fx.nextGame.date) : null;
  const gdLabel = gd == null ? null : gd === 0 ? tr('GAME DAY') : gd < 0 ? (he ? `${-gd} ימים למשחק` : `${-gd} day${gd === -1 ? '' : 's'} to game`) : null;
  // time (with date when it's a future/next session) highlighted in a navy
  // segment; all text one size.
  // A session chip carries ITS OWN plan: two practices on one day each get
  // their own focus + plan, authored by clicking the chip.
  const chipWrap = (f, i, showDate) => {
    const pl = planOf ? planOf(f) : null;
      // Weight-room sessions appear on the calendar but are not planned.
    const clickable = !!onPlan && f.type !== 'lift';
    return (
      <span key={i} style={{ display: 'inline-flex', flexDirection: 'column', gap: 3, alignItems: 'flex-start' }}>
        <span onClick={clickable ? () => onPlan(f) : undefined}
          title={clickable ? (pl ? 'Edit this session’s plan' : 'Add a plan for this session') : undefined}
          style={{ cursor: clickable ? 'pointer' : 'default', display: 'inline-flex' }}>
          {chip(f, i, showDate)}
        </span>
        {pl && (pl.focus || pl.plan) ? (
          <span onClick={clickable ? () => onPlan(f) : undefined} style={{ cursor: clickable ? 'pointer' : 'default', maxWidth: 260, fontFamily: FB, fontSize: 12, color: C.tm, lineHeight: 1.35, whiteSpace: 'normal', overflowWrap: 'break-word' }}>
            {pl.focus ? <b style={{ color: C.tx }}>{pl.focus}</b> : null}{pl.focus && pl.plan ? ' — ' : ''}{pl.plan}
          </span>
        ) : clickable ? (
          <button type="button" onClick={() => onPlan(f)} className="bhbc-ghost-btn" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: ORANGE, height: 24, boxSizing: 'border-box', display: 'inline-flex', alignItems: 'center', lineHeight: 1 }}>+ {tr('plan this session')}</button>
        ) : null}
      </span>
    );
  };
  const chip = (f, i, showDate) => (
    <span key={i} style={{ display: 'inline-flex', alignItems: 'stretch', border: `1px solid ${C.cardBd}`, borderInlineStart: `3px solid ${FX_COLOR[f.type] || NAVY}` }}>
      <span style={{ fontFamily: FN, fontSize: 12, fontWeight: 700, color: '#fff', background: NAVY, padding: '5px 9px', display: 'inline-flex', alignItems: 'center', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{showDate ? `${dow(f.date)} ${monDay(f.date)} · ${f.start}` : f.start}</span>
      <span style={{ fontFamily: FN, fontSize: 12, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: FX_COLOR[f.type] || NAVY, padding: '5px 8px', display: 'inline-flex', alignItems: 'center' }}>{fxLabelFor(f.type, FX_LABEL[f.type] || 'Session')}</span>
      <span style={{ fontFamily: FN, fontSize: 12, color: C.td, padding: '5px 9px 5px 2px', display: 'inline-flex', alignItems: 'center' }}>{f.minutes} {tr('min')}</span>
    </span>
  );
  // Today's prescribed training focus, from the microcycle (game-anchored).
  const mdToday = fx.nextGame ? -dayDiff(fx.nextGame.date, today) : null;
  const focus = mdToday != null ? mdPlan(mdToday) : null;
  const focusC = focus ? (focus.game ? ORANGE : focus.load >= 5 ? ORANGE_DEEP : focus.load >= 3 ? NAVY : '#6B7280') : NAVY;
  return (
    <Card padding={18} leftStripe={ORANGE} header={secTitle(`Today · ${dow(today)} ${monDay(today)}`)} headerRight={gdLabel ? <span style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#fff' }}>{gdLabel}</span> : null}>
      {focus && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, paddingBottom: 14, borderBottom: `1px solid ${C.cardBd}`, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.tm }}>{tr('Today’s focus')}</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 22, boxSizing: 'border-box', padding: '0 9px', fontFamily: FN, fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', color: focusC, background: `color-mix(in srgb, ${focusC} 13%, transparent)`, border: `1px solid color-mix(in srgb, ${focusC} 38%, transparent)`, whiteSpace: 'nowrap' }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: focusC, flexShrink: 0 }} />{focus.label}</span>
          <span style={{ fontFamily: FB, fontSize: 13, color: C.tx }}>{tr(focus.emphasis)}</span>
        </div>
      )}
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ flex: '2 1 300px', minWidth: 240 }}>
          <div style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.tm, marginBottom: 8 }}>{tr('Sessions')}</div>
          {todayFx.length ? (
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-start' }}>{todayFx.map((f, i) => chipWrap(f, i, false))}</div>
          ) : next ? (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.td }}>{tr('None today · next')}</span>
              {next.items.slice(0, 3).map((f, i) => chipWrap(f, i, true))}
            </div>
          ) : <span style={{ fontFamily: FB, fontSize: 13, color: C.td }}>{tr('No sessions scheduled.')}</span>}
        </div>
        <div style={{ flex: '1 1 150px' }}>
          <div style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.tm, marginBottom: 8 }}>{tr('Availability')}</div>
          <div style={{ display: 'flex', gap: 16, fontFamily: FN }}>
            {/* The amber COUNT has to carry itself against the light theme white
                card, so it uses the text token; the brand amber is unchanged for
                dots, bands and fills. */}
            {[['#37B27C', av.full, tr('available')], ['var(--bhbc-amber-text, #E0A73A)', av.mod, tr('limited')], ['#DE4E3B', av.out, tr('out')]].map(([c, n, l]) => (
              <div key={l} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <span style={{ fontSize: 22, fontWeight: 800, color: n ? c : C.tx, fontVariantNumeric: 'tabular-nums' }}>{n}</span>
                <span style={{ fontSize: 9, color: C.td, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{l}</span>
              </div>
            ))}
          </div>
        </div>
        {(onSessions || onLog) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'stretch' }}>
            {onSessions && <Btn onClick={onSessions} style={{ background: ORANGE, borderColor: ORANGE, color: '#fff', justifyContent: 'center' }}>{tr('Start session')} ›</Btn>}
            {/* 'Log practice' lived here too, ~300px below the identical
                toolbar button and calling the same setPracticeOpen(true). The
                toolbar one survives because it is present on EVERY tab, not
                only Overview — a coach on Schedule or Medical still needs it.
                'Start session' stays: it does something genuinely different. */}
          </div>
        )}
      </div>
    </Card>
  );
}

function TeamSnapshotCard({ team }) {
  const cells = [
    { k: 'Roster', v: team.n, sub: 'athletes', c: C.tx },
    { k: 'Avg ACWR', v: team.avg != null ? team.avg.toFixed(2) : '—', sub: team.avg != null ? acwrLabel(team.avg) : 'no load logged', c: team.avg != null ? BAND[bandKey(team.avg)] : C.tx },
    { k: 'Flagged', v: team.flagged, sub: 'elevated / danger', c: team.flagged ? BAND.high : C.tx },
    { k: '7-day load', v: team.week ? team.week.toLocaleString() : '—', sub: 'team sRPE', c: C.tx, spark: team.teamSeries },
  ];
  return (
    <Card leftStripe={NAVY} header={secTitle('Team Snapshot')} padding={18}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        {cells.map((s, i) => (
          <div key={s.k} style={{ padding: '16px 18px', borderInlineStart: i ? `1px solid ${C.cardBd}` : 'none', display: 'flex', flexDirection: 'column', gap: 8, minHeight: 92 }}>
            <div style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.tm }}>{s.k}</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ fontFamily: FN, fontWeight: 800, fontSize: 28, lineHeight: 1, color: s.c, fontVariantNumeric: 'tabular-nums' }}>{s.v}</div>
              {s.spark && <Sparkline series={s.spark} w={72} h={26} />}
            </div>
            <div style={{ fontFamily: FB, fontSize: 11, color: C.td }}>{s.sub}</div>
          </div>
        ))}
      </div>
      {(() => {
        const vals = (team.series28 || []).map((d) => d.load);
        if (!vals.some((v) => v > 0)) return <div style={{ padding: '14px 18px 2px', borderTop: `1px solid ${C.cardBd}`, fontFamily: FB, fontSize: 12, color: C.td }}>Team load trend appears here once sessions are logged.</div>;
        const max = Math.max(...vals, 1), n = vals.length, W = 800, H = 76, padB = 6, padT = 8;
        const gx = (i) => (n <= 1 ? W / 2 : (i / (n - 1)) * W);
        const gy = (v) => padT + (1 - v / max) * (H - padT - padB);
        const line = vals.map((v, i) => `${gx(i).toFixed(1)},${gy(v).toFixed(1)}`).join(' ');
        const area = `M0,${H - padB} L${line.replace(/ /g, ' L')} L${W},${H - padB} Z`;
        return (
          <div style={{ padding: '14px 18px 4px', borderTop: `1px solid ${C.cardBd}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.tm }}>28-day team load</span>
              <span style={{ fontFamily: FN, fontSize: 9, color: C.td, fontVariantNumeric: 'tabular-nums' }}>peak {Math.round(max).toLocaleString()}</span>
            </div>
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: H, display: 'block' }} aria-hidden="true">
              <defs><linearGradient id="bhbcTeamLoad" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={ORANGE} stopOpacity="0.28" /><stop offset="100%" stopColor={ORANGE} stopOpacity="0" /></linearGradient></defs>
              <path d={area} fill="url(#bhbcTeamLoad)" />
              <polyline points={line} fill="none" stroke={ORANGE} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2, fontFamily: FN, fontSize: 9, color: C.td }}><span>28d ago</span><span>today</span></div>
          </div>
        );
      })()}
    </Card>
  );
}

function LoadBoard({ rows, rowGrid, cycleAvail, medical = {}, onOpen, onMedical }) {
  const tr = useT();
  return (
    <CollapsibleSection title={tr("Load & Injury Risk")} count={rows.length} storageKey="bhbc-load" defaultOpen leftStripe={ORANGE}>
      <div style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: 660 }}>
          <div className="bhbc-load-head" style={{ display: 'grid', gridTemplateColumns: rowGrid, gap: 12, padding: '2px 2px 10px', fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.13em', textTransform: 'uppercase', color: C.tm, borderBottom: `1px solid ${C.cardBd}` }}>
            <div>#</div><div>Athlete</div><div>ACWR</div><div>7d</div><div>{tr('Availability')}</div><div>Readiness</div><div style={{ textAlign: 'right' }}>14-day</div>
          </div>
          {rows.map(({ t, acwr, series, readiness, avail }) => {
            const rc = readiness.level === 'red' ? BAND.high : readiness.level === 'amber' ? BAND.elevated : readiness.level === 'green' ? BAND.low : BAND.none;
            return (
              <div key={t.id} onClick={() => onOpen(t.id)} role="button" tabIndex={0} onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onOpen(t.id); } }} style={{ display: 'grid', gridTemplateColumns: rowGrid, gap: 12, alignItems: 'center', padding: '11px 2px', borderBottom: `0.25px solid ${C.cardBd}`, borderInlineStart: `2px solid ${acwr.band.color}`, paddingInlineStart: 10, marginInlineStart: -12, cursor: 'pointer', transition: 'border-color 240ms ease-out' }} className="bhbc-row bhbc-load-row">
                <Jersey n={t.jersey} size={26} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: FN, fontWeight: 700, fontSize: 13, color: C.tx, whiteSpace: 'normal', overflowWrap: 'break-word' }}>{t.name}</div>
                  {(() => { const inj = activeInjuries(medical, t.id)[0]; return inj
                    ? <div style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, color: (MED_STATUS[inj.status] || {}).color || '#DE4E3B', whiteSpace: 'normal', overflowWrap: 'break-word' }}>{'⚠ '}{inj.bodyPart}{inj.side && inj.side !== 'N/A' ? ` ${inj.side[0]}` : ''}</div>
                    : <div style={{ fontFamily: FB, fontSize: 11, color: C.td }}>{t.position || '—'}</div>; })()}
                </div>
                <div>{acwr.ratio != null ? <BandPill band={acwr.band} value={acwr.ratio.toFixed(2)} /> : <span style={{ fontFamily: FN, fontSize: 11, color: C.tm, letterSpacing: '0.06em' }}>· baseline</span>}</div>
                <div style={{ fontFamily: FN, fontSize: 13, color: C.tx, fontVariantNumeric: 'tabular-nums' }}>{acwr.acute ? Math.round(acwr.acute) : '—'}</div>
                <div>
                  {cycleAvail ? (
                    <button onClick={(e) => { e.stopPropagation(); cycleAvail(t.id, avail); }} title="Click to change availability" className="bhbc-ghost-btn" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, minWidth: 108, height: 26, boxSizing: 'border-box', fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.tm, background: 'transparent', border: `1px solid ${C.cardBd}`, borderRadius: 0, padding: '0 9px', cursor: 'pointer', whiteSpace: 'nowrap', transition: 'color .12s, border-color .12s' }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: AVAIL[avail].color, flexShrink: 0 }} />{AVAIL[avail].label}
                    </button>
                  ) : (
                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, minWidth: 108, height: 26, boxSizing: 'border-box', fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.tm, border: `1px solid ${C.cardBd}`, padding: '0 9px', whiteSpace: 'nowrap' }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: AVAIL[avail].color, flexShrink: 0 }} />{AVAIL[avail].label}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: rc, flexShrink: 0 }} />
                  {typeof readiness.loadAdjustPct === 'number' && readiness.loadAdjustPct !== 0 && <span style={{ fontFamily: FN, fontSize: 10, fontWeight: 800, color: rc, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{readiness.loadAdjustPct > 0 ? '+' : ''}{readiness.loadAdjustPct}%</span>}
                  <span style={{ fontFamily: FB, fontSize: 11, color: C.td, whiteSpace: 'normal', overflowWrap: 'break-word' }}>{readiness.level === 'unknown' ? 'no check-in' : readiness.headline}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8 }}>
                  <Sparkline series={series} />
                  {/* Report / update an injury straight from the board — no need
                      to open the athlete first (Ohad: make medical easier to reach). */}
                  {onMedical && (() => {
                    const inj = activeInjuries(medical, t.id)[0];
                    return (
                      <button onClick={(e) => { e.stopPropagation(); onMedical(t.id); }}
                        title={inj ? 'Update the medical report' : 'Report an injury'} className="bhbc-ghost-btn"
                        style={{ flexShrink: 0, height: ROW_BTN_H, boxSizing: 'border-box', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', color: inj ? ((MED_STATUS[inj.status] || {}).color || '#DE4E3B') : C.tm, background: 'transparent', border: `1px solid ${C.cardBd}`, borderRadius: 0, padding: '4px 8px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                        {inj ? 'MED ✎' : '+ MED'}
                      </button>
                    );
                  })()}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.cardBd}`, fontFamily: FN, fontSize: 10, color: C.td }}>
        {[[BAND.low, tr('band sweet spot')], [BAND.elevated, tr('band elevated')], [BAND.high, tr('band danger')], [BAND.detrained, tr('band undertrained')]].map(([c, l]) => (
          <span key={l} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, letterSpacing: '0.04em' }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: c }} />{l}</span>
        ))}
        <span style={{ marginInlineStart: 'auto', color: C.tm }}>ACWR = 7-day ÷ 28-day sRPE</span>
      </div>
    </CollapsibleSection>
  );
}

function RosterGrid({ rows, medical = {}, league = {}, onOpen }) {
  const tr = useT();
  return (
    <CollapsibleSection title={tr("Roster")} count={rows.length} storageKey="bhbc-roster" defaultOpen leftStripe={NAVY}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(232px, 1fr))', gap: 12 }}>
        {rows.map(({ t, acwr }) => (
          <div key={t.id} onClick={() => onOpen(t.id)} role="button" tabIndex={0} onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onOpen(t.id); } }} className="bhbc-card" style={{ position: 'relative', overflow: 'hidden', background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderInlineStart: `3px solid ${acwr.band.color}`, padding: '13px 15px',
            // EVERY ROSTER CARD IS THE SAME BOX.
            // Measured across ten players: four different heights (93, 96, 99,
            // 102) because a Hebrew name renders taller than a Latin one, the
            // second line is a POSITION for some and an INJURY for others, and
            // an arrival badge appears on a few. Ohad: 'the cards borders and
            // height and built should be perfectly the same for each.'
            // A fixed height with the content laid out top-down makes the grid
            // read as one object instead of ten slightly different ones.
            height: 146, boxSizing: 'border-box', cursor: 'pointer', transition: 'transform 160ms, box-shadow 160ms, border-color 240ms ease-out' }}>
            <div aria-hidden="true" style={{ position: 'absolute', right: 10, top: 8, fontFamily: FN, fontWeight: 800, fontSize: 42, lineHeight: 1, color: NAVY, opacity: 0.08, fontVariantNumeric: 'tabular-nums' }}>{t.jersey ?? ''}</div>
            <div style={{ position: 'relative' }}>
              <div style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', color: ORANGE_DEEP, fontVariantNumeric: 'tabular-nums' }}>#{t.jersey ?? '—'}</div>
              {/* Two lines are reserved whether or not the name needs them, so a
                  short Latin name and a long Hebrew one leave the rows below at
                  the same y. lineHeight is fixed for the same reason - Heebo and
                  Nord disagree about 'normal'. */}
              <div style={{ fontFamily: FN, fontWeight: 700, fontSize: 15, lineHeight: 1.2, color: C.tx, marginTop: 3, minHeight: 36, whiteSpace: 'normal', overflowWrap: 'break-word' }}>{t.name}</div>
              {(() => { const inj = activeInjuries(medical, t.id)[0]; return inj
                ? <div style={{ fontFamily: FN, fontSize: 11, fontWeight: 700, color: (MED_STATUS[inj.status] || {}).color || '#DE4E3B', marginTop: 4, whiteSpace: 'normal', overflowWrap: 'break-word' }}>{'⚠ '}{inj.bodyPart}{inj.side && inj.side !== 'N/A' ? ` ${inj.side[0]}` : ''} · {(MED_STATUS[inj.status] || {}).label}</div>
                : <div style={{ fontFamily: FB, fontSize: 11, color: C.td, marginTop: 4 }}>{t.position || '—'}</div>; })()}
              {t.arrival && t.arrival > todayISO() && <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 6, fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: ORANGE_DEEP, background: `color-mix(in srgb, ${ORANGE} 12%, transparent)`, padding: '2px 6px' }}><span aria-hidden="true">✈</span> Lands {dow(t.arrival)} {monDay(t.arrival)}</div>}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, paddingTop: 10, borderTop: `0.25px solid ${C.cardBd}` }}>
                <span style={{ fontFamily: FN, fontSize: 11, color: C.tm, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{heightM(t.heightCm)}</span>
                <span style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', color: C.tm, lineHeight: 1 }}>{flag(t.nationality)}</span>
                {(() => { const lp = leaguePlayerFor(league, t.name); return lp ? <span style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, color: ORANGE_DEEP, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }} title="League points per game"><span dir="ltr" style={{ unicodeBidi: 'isolate' }}>{lp.ppg} PPG</span></span> : null; })()}
                <span style={{ marginInlineStart: 'auto' }}>{acwr.ratio != null ? <BandPill band={acwr.band} value={acwr.ratio.toFixed(2)} /> : <span style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.tm }}>{tr('no load yet')}</span>}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </CollapsibleSection>
  );
}

// Microcycle — anchors the training week to the next game (MD-minus). Standard
// team-sport periodisation: load heaviest FAR from the game (MD-4/-3), taper
// MD-1 (Mujika: hold intensity, cut volume), game MD, regenerate MD+1. Gives
// the coach a day-by-day emphasis + a relative load level for the week ahead.
const MD_PLAN = {
  '-6': { label: 'MD-6', emphasis: 'Off / general prep', load: 1 },
  '-5': { label: 'MD-5', emphasis: 'General strength base', load: 3 },
  '-4': { label: 'MD-4', emphasis: 'Max strength + power (heaviest, far from game)', load: 5 },
  '-3': { label: 'MD-3', emphasis: 'Strength + power', load: 5 },
  '-2': { label: 'MD-2', emphasis: 'Power / speed · moderate volume', load: 3 },
  '-1': { label: 'MD-1', emphasis: 'Activation + taper — hold intensity, cut volume', load: 1 },
  '0': { label: 'GAME', emphasis: 'Game day', load: 0, game: true },
  '1': { label: 'MD+1', emphasis: 'Recovery / regeneration', load: 1 },
  '2': { label: 'MD+2', emphasis: 'Reload — build back up', load: 3 },
};
function mdPlan(md) {
  if (MD_PLAN[String(md)]) return MD_PLAN[String(md)];
  if (md <= -7) return { label: `MD${md}`, emphasis: 'General prep', load: 2 };
  return { label: `MD+${md}`, emphasis: 'In-season maintenance', load: 3 };
}
function MicrocycleView({ fx, today }) {
  const tr = useT();
  const addDaysISO = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  const g = fx.nextGame;
  if (!g) return (
    <Card padding={18} leftStripe={ORANGE} header={secTitle('Microcycle')}>
      <div style={{ fontFamily: FB, fontSize: 13, color: C.td }}>No game scheduled — running a general prep block. Add a fixture to anchor the training week.</div>
    </Card>
  );
  const until = dayDiff(g.date, today); // days from today to the game
  // Show today → game + 1 recovery day (cap at ~8 cells so it stays a week view).
  const span = Math.min(Math.max(until + 1, 1), 8);
  const days = Array.from({ length: span + 1 }, (_, i) => {
    const iso = addDaysISO(today, i);
    const md = -dayDiff(g.date, iso); // MD-N (neg before, 0 game, +1 after)
    return { iso, md, plan: mdPlan(md), isToday: iso === today, isGame: md === 0 };
  });
  const loadColor = (n, game) => game ? ORANGE : n >= 5 ? ORANGE_DEEP : n >= 3 ? NAVY : '#6B7280';
  return (
    <Card padding={18} leftStripe={ORANGE} header={secTitle('Microcycle')} headerRight={<span style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#fff' }}>→ {g.opponent ? 'vs ' + g.opponent : 'game'} · {until}d</span>}>
      <div style={{ overflowX: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${days.length}, minmax(120px, 1fr))`, gap: 8, minWidth: days.length * 120 }}>
          {days.map((d) => (
            <div key={d.iso} style={{ border: `1px solid ${d.isToday ? ORANGE : C.cardBd}`, borderTop: `3px solid ${loadColor(d.plan.load, d.isGame)}`, padding: '10px 10px 12px', background: d.isGame ? `color-mix(in srgb, ${ORANGE} 8%, transparent)` : d.isToday ? `color-mix(in srgb, ${ORANGE} 4%, transparent)` : 'var(--c-sf)', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 6 }}>
                <span style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.tm }}>{dow(d.iso)} {monDay(d.iso)}</span>
                {d.isToday && <span style={{ fontFamily: FN, fontSize: 9, fontWeight: 800, letterSpacing: '0.1em', color: ORANGE }}>TODAY</span>}
              </div>
              <span style={{ fontFamily: FN, fontSize: 13, fontWeight: 800, letterSpacing: '0.04em', color: d.isGame ? ORANGE_DEEP : C.tx }}>{d.plan.label}</span>
              <span style={{ fontFamily: FB, fontSize: 11, color: C.tm, lineHeight: 1.35, minHeight: 30 }}>{tr(d.plan.emphasis)}</span>
              {/* Relative load — 5-segment bar, colour = intensity (signal, not paint). */}
              <div style={{ display: 'flex', gap: 2, marginTop: 2 }}>
                {[1, 2, 3, 4, 5].map((s) => (
                  <span key={s} style={{ flex: 1, height: 4, background: d.isGame ? (s <= 5 ? ORANGE : C.cardBd) : (s <= d.plan.load ? loadColor(d.plan.load, false) : C.cardBd), opacity: d.isGame ? 0.9 : (s <= d.plan.load ? 1 : 0.5) }} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C.cardBd}`, fontFamily: FN, fontSize: 10, color: C.td, letterSpacing: '0.02em' }}>Load anchored to the game: heaviest far out (MD-4/-3), taper MD-1 (hold intensity, cut volume), regenerate MD+1.</div>
    </Card>
  );
}

// WeekPlanner — the coach's planning board: WHAT the team does and WHEN, in one
// Sun→Sat grid (Ohad 2026-08-24: "it's still not easy enough to plan the week…
// like how it was in the original sheet"). Each day row lists its sessions and
// takes an inline add/edit: type · time · minutes · focus. The focus line writes
// through to the SAME per-session plan the Today panel and Head Coach Report
// already read, so one entry feeds every surface.
// ── PAST PRACTICES ──────────────────────────────────────────────────────────
// "Where can I see the previous practices' details?" (Ohad 08-24). The Schedule
// tab listed fixtures and the saved plans only ever surfaced on Today / This
// week, so once a practice was past, what the team actually DID was only
// reachable one athlete at a time. This is the team view of the same data:
// newest first, one row per SLOT (a morning and an evening practice are two
// rows), showing the plan that was written for it, who trained, who was out,
// and the load the squad actually took.
function PastPractices({ fixtures = [], loads = {}, roster = [], today, planOf }) {
  const tr = useT();
  const [open, setOpen] = useState(null);      // `${date}|${start}`
  const [limit, setLimit] = useState(8);

  // "Past" = an earlier date, OR a slot on TODAY whose start time has already
  // gone by — after the morning practice the coach is looking for the morning
  // practice, and excluding it by date alone hid exactly the session he had just
  // finished running.
  const nowHHMM = useMemo(() => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }, [today]);
  const past = useMemo(() => (fixtures || [])
    .filter((f) => f && f.type !== 'game' && (f.date < today || (f.date === today && (f.start || '') && f.start <= nowHHMM)))
    .sort((a, b) => b.date.localeCompare(a.date) || (b.start || '').localeCompare(a.start || ''))
  , [fixtures, today, nowHHMM]);

  // Attendance for a slot: an athlete's session row for that DATE whose `start`
  // matches. Rows written before per-slot logging carry no start — they belong
  // to the day, so they count for the day's only slot rather than vanishing.
  // fixture.type is lowercase ('practice' | 'lift' | 'game'); a logged session
  // row's type is the capitalised label the coach picked ('Practice' | 'Lift' |
  // 'Shootaround' | ...). Map them so a start-less row can still find its slot.
  const slotKind = (fixType) => (fixType === 'lift' ? 'lift' : fixType === 'game' ? 'game' : 'practice');
  const rowKind = (rowType) => {
    const t = String(rowType || '').toLowerCase();
    if (t === 'lift' || t === 'weights') return 'lift';
    if (t === 'game') return 'game';
    return 'practice';
  };
  const detailFor = useCallback((f) => {
    const daySlots = past.filter((x) => x.date === f.date)
      .sort((a, b) => (a.start || '').localeCompare(b.start || ''));
    const trained = [], out = [], loadsTaken = [], rpes = [], notes = [], rowsBy = [];
    for (const t of roster) {
      const rec = loads[t.id];
      const rows = (rec && rec.sessions && rec.sessions[f.date]) || [];
      // Rows written before per-slot logging carry no `start`. Dropping them
      // whenever the day had two slots reported every practice as 0 attended
      // even though the squad was logged — so attribute by TYPE first (a gym
      // row belongs to the weights slot), then to the day's first slot.
      // An explicitly recorded attendance for this slot is the truth; the
      // session-row inference below only covers sessions logged before the
      // per-slot model existed.
      const att = rec && rec.attendance && rec.attendance[`${f.date}|${f.start || ''}`];
      const mine = rows.filter((r) => {
        if (r.start) return r.start === f.start;
        const sameKind = daySlots.filter((x) => slotKind(x.type) === rowKind(r.type));
        if (sameKind.length === 1) return sameKind[0].start === f.start;
        if (sameKind.length > 1) return sameKind[0].start === f.start;
        return daySlots.length > 0 && daySlots[0].start === f.start;
      });
      const avail = (rec && rec.availability && rec.availability[f.date]) || 1;
      if (att === 'out') { out.push(t); continue; }
      if (mine.length || att === 'in') {
        trained.push(t);
        for (const r of mine) {
          if (r.load > 0) loadsTaken.push(r.load);
          if (r.rpe) rpes.push(Number(r.rpe));
          if (r.by) rowsBy.push(r.by);
        }
        const n = (rec.notes && (rec.notes[`${f.date}|${f.start || ''}`] || rec.notes[f.date])) || '';
        if (n) notes.push({ name: t.name, note: n });
      } else if (avail >= 4) out.push(t);
    }
    const avg = (arr) => (arr.length ? Math.round((arr.reduce((s, x) => s + x, 0) / arr.length) * 10) / 10 : null);
    // WHO logged this session. Past practices is what the basketball staff
    // read, so the row needs an author for the same reason a medical record
    // does — you cannot ask a question of an unsigned entry.
    const loggers = [...new Set(rowsBy.filter(Boolean))];
    return { trained, out, avgRpe: avg(rpes), avgLoad: avg(loadsTaken) ? Math.round(avg(loadsTaken)) : null, notes, loggers };
  }, [loads, roster, past]);

  if (!past.length) return null;
  const names = (arr) => arr.map((t) => t.name).join(', ');

  return (
    <Card padding={18} leftStripe={NAVY} header={secTitle('Past practices')}
      headerRight={<span style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#fff' }}>{past.length} {tr('logged')}</span>}>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {past.slice(0, limit).map((f) => {
          const key = `${f.date}|${f.start || ''}`;
          const pl = planOf ? planOf(f) : null;
          const d = detailFor(f);
          const isOpen = open === key;
          return (
            <div key={key} style={{ borderBottom: `0.25px solid ${C.cardBd}` }}>
              <div className="bhbc-row" onClick={() => setOpen(isOpen ? null : key)}
                role="button" tabIndex={0} aria-expanded={isOpen}
                onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); setOpen(isOpen ? null : key); } }}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 2px', cursor: 'pointer' }}>
                {/* 96px + nowrap: at 78px some dates wrapped to two lines and
                    others didn't, so the column read ragged. */}
                <span style={{ fontFamily: FN, fontWeight: 700, fontSize: 12, color: C.tx, width: 96, flexShrink: 0, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{dow(f.date)} {monDay(f.date)}</span>
                <span style={{ fontFamily: FN, fontSize: 12, fontWeight: 700, color: FX_COLOR[f.type] || NAVY, width: 46, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{f.start}</span>
                <span style={{ color: C.tm, flexShrink: 1, minWidth: 0, whiteSpace: 'normal', overflowWrap: 'break-word' }}>
                  {fxLabelFor(f.type, FX_LABEL[f.type] || 'Session')}{f.minutes ? ` · ${f.minutes} ${fxLabelFor('__min', 'min')}` : ''}
                </span>
                <div style={{ flex: 1 }} />
                {/* The two numbers a head coach actually asks for. */}
                <span style={{ fontFamily: FN, fontSize: 11, fontWeight: 700, color: d.trained.length ? '#37B27C' : C.td, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                  {d.trained.length}/{roster.length}
                </span>
                {d.avgLoad != null && <span title={`${d.avgRpe} RPE x ${f.minutes || '?'} min`} style={{ fontFamily: FN, fontSize: 11, fontWeight: 700, color: C.tx, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }} dir="ltr">{d.avgLoad} AU</span>}
                {d.avgRpe != null && <span style={{ fontFamily: FN, fontSize: 11, color: C.tm, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>RPE {d.avgRpe}</span>}
                <span style={{ color: C.tm, fontSize: 10, flexShrink: 0, transform: isOpen ? 'rotate(180deg)' : 'none', display: 'inline-block' }}>▾</span>
              </div>
              {isOpen && (
                <div style={{ padding: '2px 2px 12px 88px', fontFamily: FB, fontSize: 12, color: C.tx, lineHeight: 1.55 }}>
                  {/* What was PLANNED for this exact slot. */}
                  <div style={{ marginBottom: 6 }}>
                    <span style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.tm }}>Plan </span>
                    {pl && (pl.focus || pl.plan)
                      ? <span dir="auto">{pl.focus || ''}{pl.focus && pl.plan ? ' — ' : ''}{pl.plan || ''}</span>
                      : <span style={{ color: C.td }}>nothing was written for this slot</span>}
                  </div>
                  <div style={{ marginBottom: 6 }}>
                    <span style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.tm }}>Trained </span>
                    {d.trained.length ? <span dir="auto">{names(d.trained)}</span> : <span style={{ color: C.td }}>nobody logged</span>}
                    {d.avgLoad != null && <span style={{ color: C.tm }}> · {tr('avg load')} <span dir="ltr" style={{ unicodeBidi: 'isolate' }}>{d.avgLoad} AU</span></span>}
                    {d.loggers && d.loggers.length > 0 && <span style={{ color: C.td }}> · {tr('logged by')} {d.loggers.map(byName).join(', ')}</span>}
                  </div>
                  {d.out.length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <span style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#DE4E3B' }}>Out </span>
                      <span dir="auto">{names(d.out)}</span>
                    </div>
                  )}
                  {d.notes.length > 0 && (
                    <div>
                      <span style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.tm }}>Notes </span>
                      {d.notes.map((n, i) => <div key={i} dir="auto" style={{ color: C.tm }}>{n.name}: {n.note}</div>)}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {past.length > limit && (
        <button onClick={() => setLimit((n) => n + 12)}
          style={{ marginTop: 10, background: 'transparent', border: `1px solid ${C.cardBd}`, color: C.tm, fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', padding: '6px 12px', cursor: 'pointer', textTransform: 'uppercase' }}>
          Show {Math.min(12, past.length - limit)} more
        </button>
      )}
    </Card>
  );
}

function WeekPlanner({ fixtures = [], today, planOf, onSavePlan, onUpsert, onRemove }) {
  const he = useHe();
  const tr = useT();
  // 'rows' (the original vertical list) or 'columns' (the week as day columns).
  // Persisted per coach — a layout preference you have to re-pick every visit
  // is not a preference.
  const [wpLayout, setWpLayout] = usePersistentState('bhbc-week-layout', 'rows');
  const horizontalWeek = wpLayout === 'columns';
  const isoOfDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const [anchor, setAnchor] = useState(today);
  const [editing, setEditing] = useState(null); // { orig|null, date, type, start, minutes, focus }
  const days = useMemo(() => {
    const d = new Date(`${anchor}T12:00:00`);
    d.setDate(d.getDate() - d.getDay()); // week starts Sunday (Israel)
    return Array.from({ length: 7 }, (_, i) => { const x = new Date(d); x.setDate(d.getDate() + i); return isoOfDate(x); });
  }, [anchor]);
  const shiftWeek = (n) => { const d = new Date(`${anchor}T12:00:00`); d.setDate(d.getDate() + n * 7); setAnchor(isoOfDate(d)); };
  const byDay = useMemo(() => {
    const m = {};
    for (const f of fixtures || []) { if (!days.includes(f.date)) continue; (m[f.date] = m[f.date] || []).push(f); }
    for (const k of Object.keys(m)) m[k].sort((a, b) => String(a.start || '').localeCompare(String(b.start || '')));
    return m;
  }, [fixtures, days]);
  const weekCount = days.reduce((a, d) => a + ((byDay[d] || []).length), 0);
  const liftCount = days.reduce((a, d) => a + ((byDay[d] || []).filter((f) => f.type === 'lift').length), 0);

  const startEdit = (date, f) => setEditing({
    orig: f || null, date, type: (f && f.type) || 'lift',
    start: (f && f.start) || '', minutes: (f && f.minutes) || (f && f.type === 'game' ? 90 : 60),
    focus: (f && planOf && (planOf(f) || {}).focus) || '',
  });
  const commit = () => {
    if (!editing || !editing.start) { toast('Set a start time'); return; }
    onUpsert(editing.orig, editing);
    if (onSavePlan) {
      const prevPlan = (editing.orig && planOf && planOf(editing.orig)) || null;
      onSavePlan({ date: editing.date, start: editing.start, focus: editing.focus, plan: (prevPlan && prevPlan.plan) || '' });
    }
    setEditing(null);
  };

  const lab = { fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.tm };
  const inp = { fontFamily: FN, fontSize: 12, color: C.tx, background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderRadius: 0, padding: '6px 8px', height: 30, boxSizing: 'border-box' };
  const TYPES = [['lift', 'Weights'], ['practice', 'Practice'], ['game', 'Game']];

  return (
    <CollapsibleSection title={tr("Week Planner")} count={he ? `${weekCount} אימונים · ${liftCount} כוח` : `${weekCount} sessions · ${liftCount} S&C`} storageKey="bhbc-week-planner" defaultOpen leftStripe={ORANGE}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <button onClick={() => shiftWeek(-1)} className="bhbc-ghost-btn" style={{ ...inp, cursor: 'pointer', fontWeight: 700 }}>{he ? '›' : '‹'}</button>
        <span style={{ fontFamily: FN, fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.tx }}>
          {monDay(days[0])} – {monDay(days[6])}
        </span>
        <button onClick={() => shiftWeek(1)} className="bhbc-ghost-btn" style={{ ...inp, cursor: 'pointer', fontWeight: 700 }}>{he ? '‹' : '›'}</button>
        <button onClick={() => setAnchor(today)} className="bhbc-ghost-btn" style={{ ...inp, cursor: 'pointer', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{tr('This week')}</button>
        {/* Layout choice (Ohad: "an option for a horizontal layout for the days
            in addition the vertical"). Rows read well for a week with a few
            long sessions; columns show the SHAPE of the week - which days are
            loaded and which are empty - at a glance. Persisted, and the label
            is fixed-width so the control never resizes as it toggles. */}
        <button onClick={() => setWpLayout(wpLayout === 'columns' ? 'rows' : 'columns')}
          className="bhbc-ghost-btn"
          title={wpLayout === 'columns' ? 'Switch to a vertical list of days' : 'Switch to seven day columns'}
          style={{ ...inp, cursor: 'pointer', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', minWidth: 104, textAlign: 'center' }}>
          {wpLayout === 'columns' ? `▤ ${tr('Rows')}` : `▥ ${tr('Columns')}`}
        </button>
        <span style={{ marginInlineStart: 'auto', fontFamily: FB, fontSize: 12, color: C.td }}>{he ? 'תכתוב את האימון, ואז את הפוקוס. זה מופיע בהיום ובדוח למאמן.' : 'Write the session, then its focus — it shows on Today, the Head Coach Report and the practice log.'}</span>
      </div>

      {/* SEVEN across, like a calendar week (Ohad: "all 7 days in one row, like
          google calendar"). auto-fit wrapped them into ragged rows, which is
          not a week. The class carries breakpoints so a phone still gets a
          readable column count instead of seven 50px slivers — inline styles
          cannot express a media query. */}
      <div className={horizontalWeek ? 'bhbc-week-grid' : undefined}
        style={horizontalWeek ? undefined : { display: 'flex', flexDirection: 'column' }}>
        {days.map((d) => {
          const list = byDay[d] || [];
          const isToday = d === today;
          return (
            <div key={d} style={horizontalWeek
              ? { display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 9px', border: `1px solid ${C.cardBd}`, borderTop: `2px solid ${isToday ? ORANGE : 'transparent'}`, background: isToday ? 'color-mix(in srgb, var(--c-ac) 6%, transparent)' : 'transparent', minWidth: 0 }
              : { display: 'flex', gap: 12, alignItems: 'flex-start', padding: '9px 0', borderTop: `0.25px solid ${C.cardBd}`, background: isToday ? 'color-mix(in srgb, var(--c-ac) 6%, transparent)' : 'transparent' }}>
              <div style={horizontalWeek ? { flexShrink: 0 } : { width: 86, flexShrink: 0, paddingTop: 3 }}>
                <div style={{ fontFamily: FN, fontSize: 12, fontWeight: 700, color: isToday ? ORANGE_DEEP : C.tx }}>{dow(d)}</div>
                <div style={{ fontFamily: FN, fontSize: 10, color: C.td, fontVariantNumeric: 'tabular-nums' }}>{monDay(d)}</div>
              </div>
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
                {list.length === 0 && (!editing || editing.date !== d) && (
                  <span style={{ fontFamily: FB, fontSize: 12, color: C.td, fontStyle: 'italic' }}>{tr('No sessions')}</span>
                )}
                {list.map((f, i) => {
                  const p = planOf ? planOf(f) : null;
                  const isEditing = editing && editing.orig && sameSlotKey(editing.orig, f);
                  if (isEditing) return null;
                  return (
                    <div key={i} className="bhbc-chip" style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap', border: `1px solid ${C.cardBd}`, borderInlineStart: `3px solid ${FX_COLOR[f.type] || NAVY}`, background: 'var(--c-sf)', padding: '6px 9px' }}>
                      <span style={{ fontFamily: FN, fontSize: 12, fontWeight: 700, color: FX_COLOR[f.type] || NAVY, fontVariantNumeric: 'tabular-nums' }} className="bhbc-chip-meta">{f.start}</span>
                      <span className="bhbc-chip-meta" style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.tm }}>{fxLabelFor(f.type, FX_LABEL[f.type] || 'Session')}</span>
                      <span className="bhbc-chip-meta" style={{ fontFamily: FN, fontSize: 11, color: C.td }}>{f.minutes ? `${f.minutes} ${tr('min')}` : ''}</span>
                      {p && p.focus ? <span className="bhbc-chip-focus" style={{ fontFamily: FB, fontSize: 12, color: C.tx, minWidth: 0, whiteSpace: 'normal', overflowWrap: 'normal' }}>{p.focus}</span>
                        : <span className="bhbc-chip-focus" style={{ fontFamily: FB, fontSize: 12, color: C.td, fontStyle: 'italic' }}>{tr('no focus yet')}</span>}
                      {onUpsert && <span style={{ marginInlineStart: 'auto', display: 'inline-flex', gap: 4 }}>
                        <button onClick={() => startEdit(d, f)} className="bhbc-ghost-btn" title="Edit session" style={{ fontFamily: FN, fontSize: 10, color: C.tm, background: 'transparent', border: `1px solid ${C.cardBd}`, padding: '2px 8px', cursor: 'pointer' }}>✎</button>
                        <button onClick={() => onRemove(f)} className="bhbc-ghost-btn" title="Remove session" style={{ fontFamily: FN, fontSize: 10, color: C.tm, background: 'transparent', border: `1px solid ${C.cardBd}`, padding: '2px 8px', cursor: 'pointer' }}>✕</button>
                      </span>}
                    </div>
                  );
                })}
                {editing && editing.date === d && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', border: `1px solid ${ORANGE}`, background: 'var(--c-sf)', padding: '8px 9px' }}>
                    <div style={{ display: 'inline-flex', border: `1px solid ${C.cardBd}` }}>
                      {TYPES.map(([k, l]) => (
                        <button key={k} type="button" onClick={() => setEditing((e) => ({ ...e, type: k }))}
                          style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: editing.type === k ? '#fff' : C.td, background: editing.type === k ? (FX_COLOR[k] || NAVY) : 'transparent', border: 'none', padding: '6px 10px', cursor: 'pointer' }}>{l}</button>
                      ))}
                    </div>
                    <input type="time" value={editing.start} onChange={(e) => setEditing((x) => ({ ...x, start: e.target.value }))} style={{ ...inp, width: 108 }} />
                    <input type="number" min="0" step="5" value={editing.minutes} onChange={(e) => setEditing((x) => ({ ...x, minutes: e.target.value }))} style={{ ...inp, width: 74 }} title="Minutes" />
                    <input value={editing.focus} onChange={(e) => setEditing((x) => ({ ...x, focus: e.target.value }))} placeholder="Focus — e.g. Lower INT + landing mechanics" style={{ ...inp, flex: '1 1 220px', minWidth: 140, fontFamily: FB }} />
                    <Btn onClick={commit} style={{ background: ORANGE, borderColor: ORANGE, color: '#fff' }}>{editing.orig ? 'Save' : 'Add'}</Btn>
                    <Btn variant="ghost" onClick={() => setEditing(null)}>Cancel</Btn>
                  </div>
                )}
                {onUpsert && (!editing || editing.date !== d) && (
                  <button onClick={() => startEdit(d, null)} className="bhbc-ghost-btn"
                    style={{ alignSelf: 'flex-start', fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.tm, background: 'transparent', border: `0.25px dashed ${C.cardBd}`, padding: '4px 10px', cursor: 'pointer' }}>+ Session</button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ ...lab, marginTop: 10 }}>{he ? 'שורות הכוח הן אימוני ה-S&C. הפוקוס שלהן הוא מה שכל הסגל עושה באותו יום.' : 'S&C sessions are the “Weights” rows — they carry the team focus the whole squad trains that day.'}</div>
    </CollapsibleSection>
  );
}
const sameSlotKey = (a, b) => a && b && a.date === b.date && String(a.start || '') === String(b.start || '') && a.type === b.type;

function ScheduleTool({ fx, fixtures, today, mode, setMode, onLog }) {
  const tr = useT();
  const toggle = (
    <div style={{ display: 'inline-flex', border: '1px solid rgba(255,255,255,0.32)' }}>
      {[['calendar', 'Month'], ['week', 'Week'], ['list', 'List']].map(([k, l]) => (
        <button key={k} onClick={() => setMode(k)} style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: mode === k ? NAVY : '#fff', background: mode === k ? '#fff' : 'transparent', border: 'none', padding: '5px 12px', cursor: 'pointer' }}>{l}</button>
      ))}
    </div>
  );
  return (
    <Card padding={18} leftStripe={ORANGE} header={secTitle('Schedule')} headerRight={
      onLog ? (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          {toggle}
          <button onClick={onLog} style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#fff', background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.3)', height: 24, boxSizing: 'border-box', padding: '0 9px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, cursor: 'pointer', borderRadius: 0 }}>{tr('Log session')}</button>
        </div>
      ) : toggle
    }>
      {mode === 'calendar' ? <ScheduleMonth fixtures={fixtures} today={today} /> : mode === 'week' ? <ScheduleWeek fixtures={fixtures} today={today} /> : <ScheduleList fx={fx} today={today} />}
    </Card>
  );
}

function ScheduleList({ fx, today }) {
  const tr = useT();
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
              {gdLabel && <div style={{ marginTop: 6, display: 'inline-block', fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', color: gd === 0 ? '#fff' : C.tm, background: gd === 0 ? ORANGE : 'transparent', border: gd === 0 ? 'none' : `1px solid ${C.cardBd}`, padding: '2px 6px' }}>{gdLabel}</div>}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', flex: 1 }}>
              {d.items.map((f, i) => (
                <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 9, border: `1px solid ${C.cardBd}`, borderInlineStart: `3px solid ${FX_COLOR[f.type] || NAVY}`, padding: '6px 11px', background: 'var(--c-sf)' }}>
                  <span style={{ fontFamily: FN, fontSize: 12, color: C.tx, fontVariantNumeric: 'tabular-nums' }}>{f.start}</span>
                  <span style={{ fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: FX_COLOR[f.type] || NAVY }}>{fxLabelFor(f.type, FX_LABEL[f.type] || 'Session')}</span>
                  <span style={{ fontFamily: FN, fontSize: 10, color: C.td, fontVariantNumeric: 'tabular-nums' }}>{f.minutes} {tr('min')}</span>
                  {f.optional && <span style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.tm, border: `1px solid ${C.cardBd}`, padding: '1px 5px' }}>optional</span>}
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
                {hasGame && <div style={{ position: 'absolute', top: 5, right: 5, fontFamily: FN, fontSize: 9, fontWeight: 800, letterSpacing: '0.06em', color: '#fff', background: ORANGE, padding: '1px 4px' }}>GAME</div>}
                <div style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: isToday ? ORANGE_DEEP : C.tm }}>{DOW[d.getDay()]}</div>
                <div style={{ fontFamily: FN, fontSize: 16, fontWeight: 800, color: isToday ? ORANGE_DEEP : C.tx, fontVariantNumeric: 'tabular-nums' }}>{d.getDate()}</div>
              </div>
              <div style={{ padding: 6, display: 'flex', flexDirection: 'column', gap: 5 }}>
                {items.map((f, i) => (
                  <div key={i} style={{ border: `1px solid ${C.cardBd}`, borderInlineStart: `3px solid ${FX_COLOR[f.type] || NAVY}`, padding: '5px 7px', background: 'var(--c-bg)' }}>
                    <div style={{ fontFamily: FN, fontSize: 11, fontWeight: 700, color: FX_COLOR[f.type] || NAVY, textTransform: 'uppercase' }}>{fxLabelFor(f.type, FX_LABEL[f.type] || 'Session')}</div>
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
      <div key={di} style={{ minHeight: 82, borderRight: '1px solid var(--c-bd)', borderBottom: '1px solid var(--c-bd)', padding: '5px 7px', background: isToday ? `color-mix(in srgb, ${ORANGE} 7%, var(--c-sf))` : 'var(--c-sf)', display: 'flex', flexDirection: 'column', gap: 3 }}>
        <div style={{ fontFamily: FN, fontSize: 11, fontWeight: isToday ? 800 : 600, color: isToday ? ORANGE_DEEP : (inMonth ? C.td : C.tm), textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{dt.getDate()}</div>
        {items.slice(0, 3).map((f, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, fontFamily: FN, fontSize: 10, background: `color-mix(in srgb, ${FX_COLOR[f.type] || NAVY} 13%, transparent)`, borderInlineStart: `2px solid ${FX_COLOR[f.type] || NAVY}`, padding: '2px 5px', minWidth: 0 }}>
            <span style={{ color: FX_COLOR[f.type] || NAVY, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{f.start}</span>
            <span style={{ color: FX_COLOR[f.type] || NAVY, whiteSpace: 'normal', overflowWrap: 'break-word' }}>{fxLabelFor(f.type, FX_LABEL[f.type] || 'Session')}</span>
          </div>
        ))}
        {items.length > 3 && <div style={{ fontFamily: FN, fontSize: 9, color: C.td, paddingLeft: 2 }}>+{items.length - 3} more</div>}
      </div>
    );
  };
  return (
    <div style={{ overflowX: 'auto' }}>
      <div className="bhbc-cal-wrap" style={{ minWidth: 620 }}>
        <div style={{ fontFamily: FN, fontWeight: 800, fontSize: 14, color: C.tx, marginBottom: 8, letterSpacing: '0.02em' }}>{MON[m]} {y}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 4 }}>
          {DOW.map((d) => <div key={d} style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.tm, textAlign: 'center', padding: '4px 0' }}>{d}</div>)}
        </div>
        <div style={{ borderTop: '1px solid var(--c-bd)', borderInlineStart: '1px solid var(--c-bd)' }}>
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
        <span key={i} title={r === 'W' ? 'Win' : 'Loss'} style={{ width: 14, height: 14, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: FN, fontSize: 9, fontWeight: 800, color: '#fff', background: r === 'W' ? '#37B27C' : '#DE4E3B' }}>{r}</span>
      ))}
    </span>
  );
}

function StandingsTable({ standings }) {
  const cols = [
    { k: 'gp', h: 'GP' }, { k: 'w', h: 'W' }, { k: 'l', h: 'L' },
    { k: 'pf', h: 'PF' }, { k: 'pa', h: 'PA' }, { k: 'diff', h: '+/–' },
  ];
  const th = { fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.tm, padding: '8px 10px', textAlign: 'right', whiteSpace: 'nowrap' };
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
            const td = { fontFamily: FN, fontSize: 13, color: C.tx, padding: '9px 10px', textAlign: 'center', fontVariantNumeric: 'tabular-nums' };
            return (
              <tr key={s.team} className="bhbc-row" style={{ borderBottom: `0.25px solid ${C.cardBd}`, background: bh ? `color-mix(in srgb, ${NAVY} 8%, transparent)` : 'transparent', borderInlineStart: bh ? `3px solid ${ORANGE}` : '3px solid transparent' }}>
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
    <th key={k} onClick={() => k !== 'name' && setSort(k)} style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: sort === k ? ORANGE_DEEP : C.tm, padding: '8px 9px', textAlign: first ? 'left' : 'center', whiteSpace: 'nowrap', cursor: k === 'name' ? 'default' : 'pointer', userSelect: 'none' }}>{h}{sort === k ? ' ↓' : ''}</th>
  );
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 620 }}>
        <thead><tr style={{ borderBottom: `1px solid ${C.cardBd}` }}>{th('name', 'Player', true)}{cols.map((c) => th(c.k, c.h))}</tr></thead>
        <tbody>
          {items.map(({ t, s }) => {
            const td = { fontFamily: FN, fontSize: 13, color: s ? C.tx : C.tm, padding: '9px 9px', textAlign: 'center', fontVariantNumeric: 'tabular-nums' };
            return (
              <tr key={t.id} className="bhbc-row" onClick={() => onOpen(t.id)} role="button" tabIndex={0} onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onOpen(t.id); } }} style={{ borderBottom: `0.25px solid ${C.cardBd}`, cursor: 'pointer' }}>
                <td style={{ ...td, textAlign: 'left', fontWeight: 700, color: C.tx, whiteSpace: 'nowrap' }}><span style={{ display: 'inline-block', width: 22, textAlign: 'right', color: ORANGE_DEEP, marginRight: 11, fontVariantNumeric: 'tabular-nums' }}>{t.jersey ?? '—'}</span>{t.name}</td>
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
  const tr = useT();
  const played = games.filter((g) => g.played && (!bhbcOnly || isBH(g.home) || isBH(g.away)));
  const todayStr = todayISO();
  const upcoming = games.filter((g) => !g.played && (!g.date || g.date >= todayStr) && (!bhbcOnly || isBH(g.home) || isBH(g.away)));
  const byRound = {};
  [...played].reverse().forEach((g) => { (byRound[g.round] = byRound[g.round] || []).push(g); });
  // A result row that precedes the first "מחזור N" heading in the scrape has
  // round = null, which becomes the key "null" -> Number("null") = NaN. That
  // rendered a literal "Round NaN" header over real results, and made the
  // comparator non-total (every NaN pair returns NaN), so the group order was
  // engine-defined. Keep those games — they are real — but group them under no
  // round rather than a fabricated one, and sort them last.
  const rounds = Object.keys(byRound)
    .map((k) => (k === 'null' || k === 'undefined' || Number.isNaN(Number(k)) ? null : Number(k)))
    .sort((a, b) => (a == null ? 1 : b == null ? -1 : b - a));
  const Row = ({ g }) => {
    // Every visible row involves BHBC (bhbcOnly). Read it from BHBC's side so the
    // FIRST name is always "Bnei Herzliya" — every row's name column lines up, and
    // vs/@ tells home vs away. One line per game (Ohad: never stacked/tight rows).
    const bhHome = isBH(g.home);
    const opp = bhHome ? g.away : g.home;
    const bhScore = bhHome ? g.hs : g.as, oppScore = bhHome ? g.as : g.hs;
    const won = g.played && bhScore > oppScore;
    const detail = [g.comp, g.venue].filter(Boolean).join(' · ');
    const nameCell = { fontFamily: FN, fontSize: 13, fontWeight: 800, color: C.tx, whiteSpace: 'nowrap' };
    return (
      <div style={{ borderBottom: `0.25px solid ${C.cardBd}`, borderInlineStart: `3px solid ${ORANGE}`, background: `color-mix(in srgb, ${NAVY} 7%, transparent)` }}>
        <div className="bhbc-game-row" style={{ display: 'grid', gridTemplateColumns: '54px minmax(0,auto) 1fr 62px', gap: 14, alignItems: 'center', padding: '12px 12px' }}>
          <div style={{ fontFamily: FN, fontSize: 11, fontWeight: 700, color: C.td, fontVariantNumeric: 'tabular-nums' }}>{g.date ? g.date.slice(5).replace('-', '/') : ''}</div>
          {/* Bnei Herzliya (constant) · vs/@/score · opponent — constant first token
              means vs/@ and the opponent line up on every row. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <span className="bhbc-game-home" style={{ ...nameCell }}>Bnei Herzliya</span>
            {g.played
              ? <span style={{ fontFamily: FN, fontSize: 13, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: C.tx, background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, padding: '2px 8px', whiteSpace: 'nowrap', flexShrink: 0 }}>{bhScore}<span style={{ color: C.tm, margin: '0 4px' }}>–</span>{oppScore}</span>
              : <span style={{ width: 24, textAlign: 'center', fontFamily: FN, fontSize: 11, fontWeight: 700, color: C.tm, letterSpacing: '0.04em', flexShrink: 0 }}>{bhHome ? 'vs' : '@'}</span>}
            <span style={{ ...nameCell, fontWeight: 500, minWidth: 0, whiteSpace: 'normal', overflowWrap: 'break-word' }}>{opp}</span>
          </div>
          <div className="bhbc-game-detail" style={{ fontFamily: FN, fontSize: 10, color: C.tm, letterSpacing: '0.03em', textAlign: 'right', whiteSpace: 'normal', overflowWrap: 'break-word', minWidth: 0, textTransform: 'uppercase' }}>{detail}</div>
          {g.played
            ? <span style={{ justifySelf: 'end', display: 'inline-flex', alignItems: 'center', gap: 5, height: 20, boxSizing: 'border-box', padding: '0 8px', fontFamily: FN, fontSize: 10, fontWeight: 800, letterSpacing: '0.04em', color: won ? '#37B27C' : '#DE4E3B', background: `color-mix(in srgb, ${won ? '#37B27C' : '#DE4E3B'} 13%, transparent)`, border: `1px solid color-mix(in srgb, ${won ? '#37B27C' : '#DE4E3B'} 38%, transparent)` }}>{won ? 'W' : 'L'}</span>
            : g.homeKnown === false ? null
            : <span style={{ justifySelf: 'end', fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', color: bhHome ? C.tm : ORANGE, border: `1px solid ${bhHome ? C.cardBd : ORANGE}`, padding: '2px 7px' }}>{bhHome ? tr('HOME') : tr('AWAY')}</span>}
        </div>
      </div>
    );
  };
  if (!played.length && !upcoming.length) return <div style={{ fontFamily: FB, fontSize: 13, color: C.td, padding: '16px 0', textAlign: 'center' }}>No games yet.</div>;
  return (
    <div>
      {upcoming.length > 0 && (
        <div style={{ marginBottom: rounds.length ? 14 : 0 }}>
          <div style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: ORANGE_DEEP, padding: '4px 10px 8px' }}>{tr('Upcoming')}</div>
          {upcoming.slice(0, 8).map((g, i) => <Row key={i} g={g} />)}
        </div>
      )}
      {rounds.map((r) => (
        <div key={r == null ? 'no-round' : r} style={{ marginBottom: 10 }}>
          {/* Only claim a round number when the feed actually gave one. */}
          {r != null && <div style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.tm, padding: '4px 10px 6px' }}>{tr('Round')} {r}</div>}
          {(byRound[r == null ? 'null' : r] || []).map((g, i) => <Row key={i} g={g} />)}
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
    // null means the coach picked "—": the venue is genuinely unknown, so
    // downstream must not paint a HOME/AWAY chip for it.
    homeKnown: f.home === true || f.home === false,
    hs: null, as: null, played: false, timeTBD: f.timeTBD, venue: f.venue, travel: f.travel,
  }));
}

function LeagueView({ league, roster, fixtures, onOpen, bhbcLoads = {}, today, onPickMinutes }) {
  const tr = useT();
  const leagueGames = Array.isArray(league.games) ? league.games : [];
  const playedGames = leagueGames.filter((g) => g.played);
  // A season whose every game is already played is HISTORICAL (last season) —
  // don't badge it "Live". A season with any unplayed game is in progress.
  const historical = leagueGames.length > 0 && playedGames.length === leagueGames.length;
  // Merge: played results from basket.co.il + upcoming from the club fixtures.
  const upcomingFx = fixturesToGames(fixtures).filter((g) => !playedGames.some((p) => p.date === g.date));
  const allGames = [...playedGames, ...upcomingFx];
  const hasStats = (league.players || []).length > 0 || playedGames.length > 0;
  // Which season are we actually in? (Israeli basketball season spans ~Aug→May.)
  const now = new Date();
  const startYr = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  const currentSeason = `${startYr}/${String((startYr + 1) % 100).padStart(2, '0')}`;
  const seasonNorm = (s) => String(s || '').replace(/\s+/g, '');
  // The stored league numbers belong to a PAST season if their tag ≠ the current one.
  // In that case this season hasn't started — show a pre-season state, not last year's
  // figures dressed up as "live". (Ohad: "only see stats from this year".)
  const pastData = !!league.season && seasonNorm(league.season) !== seasonNorm(currentSeason);
  const t = league.team || {};
  const played = t.gp || 0;
  const showCurrent = played && !pastData;
  const summary = [
    { k: tr('Record'), v: played ? `${t.w}–${t.l}` : '—', c: C.tx },
    { k: tr('Points'), v: played ? t.ppg : '—', sub: tr('per game'), c: C.tx },
    { k: tr('Allowed'), v: played ? t.oppg : '—', sub: tr('per game'), c: C.tx },
    { k: 'Margin', v: played ? `${(t.ppg - t.oppg) > 0 ? '+' : ''}${(t.ppg - t.oppg).toFixed(1)}` : '—', c: played && (t.ppg - t.oppg) >= 0 ? '#2E9E6B' : played ? '#C9462F' : C.tx },
  ];
  return (
    <>
      {/* Team stats + live badge */}
      <Card padding={18} leftStripe={ORANGE} header={secTitle('Team Stats')} headerRight={
        pastData
          ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.tm }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: '#7C828B' }} />{currentSeason} · Pre-season</span>
          : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#fff' }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: historical ? '#7C828B' : '#4ED88A' }} />{historical ? 'Last season' : 'Live'}{league.season ? ` · ${league.season}` : ''}{league.updatedAt ? ` · ${relTime(league.updatedAt)}` : ''}</span>
      }>
        {showCurrent ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }}>
            {summary.map((s, i) => (
              <div key={s.k} style={{ padding: '14px 18px', borderInlineStart: i ? `1px solid ${C.cardBd}` : 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.tm }}>{s.k}</div>
                <div style={{ fontFamily: FN, fontWeight: 800, fontSize: 26, lineHeight: 1, color: s.c, fontVariantNumeric: 'tabular-nums' }}>{s.v}</div>
                {s.sub && <div style={{ fontFamily: FN, fontSize: 9, color: C.td, letterSpacing: '0.04em' }}>{s.sub}</div>}
              </div>
            ))}
          </div>
        ) : pastData ? (
          <>
            <div style={{ fontFamily: FB, fontSize: 13, color: C.td, padding: '2px 2px 14px' }}>The {currentSeason} {tr('season not started')}</div>
            <CollapsibleSection domId="bhbc-lastseason-team" storageKey="bhbc-lastseason-team" defaultOpen={false} title={`${league.season} · ${tr('Last season')}`} bare padX={0}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }}>
                {summary.map((s, i) => (
                  <div key={s.k} style={{ padding: '14px 18px', borderInlineStart: i ? `1px solid ${C.cardBd}` : 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.tm }}>{s.k}</div>
                    <div style={{ fontFamily: FN, fontWeight: 800, fontSize: 26, lineHeight: 1, color: s.c, fontVariantNumeric: 'tabular-nums' }}>{s.v}</div>
                    {s.sub && <div style={{ fontFamily: FN, fontSize: 9, color: C.td, letterSpacing: '0.04em' }}>{s.sub}</div>}
                  </div>
                ))}
              </div>
            </CollapsibleSection>
          </>
        ) : (
          <div style={{ fontFamily: FB, fontSize: 13, color: C.td, padding: '6px 2px' }}>No games played yet this season — team stats fill in automatically after tip-off.</div>
        )}
      </Card>

      {/* Player stats — the roster, with official league numbers */}
      <Card padding={18} leftStripe={NAVY} header={secTitle('Player Stats')} headerRight={pastData ? null : <span style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#fff' }}>tap a column to sort</span>}>
        {pastData ? (
          <>
            <div style={{ fontFamily: FB, fontSize: 13, color: C.td, padding: '2px 2px 14px' }}>No {currentSeason} games played yet — per-player league numbers appear here after tip-off.</div>
            <CollapsibleSection domId="bhbc-lastseason-players" storageKey="bhbc-lastseason-players" defaultOpen={false} title={`${league.season} · ${tr('Last season')}`} bare padX={0}>
              <PlayerStatsTable roster={roster} league={league} onOpen={onOpen} />
            </CollapsibleSection>
          </>
        ) : (
          <>
            <PlayerStatsTable roster={roster} league={league} onOpen={onOpen} />
            <div style={{ fontFamily: FB, fontSize: 11, color: C.td, marginTop: 8 }}>Official league stats (מנהלת ליגת העל){league.season ? ` · ${league.season}` : ''} — tap any athlete for their full profile &amp; last game.</div>
          </>
        )}
      </Card>

      {/* Games — BHBC only. In a fresh season, lead with this season's fixtures and
          tuck last season's completed results into a collapse. */}
      <Card padding={18} leftStripe={NAVY} header={secTitle('Games')}>
        {/* MINUTES PLAYED -> LOAD. Until now a 32-minute game and a DNP were
            identical to the load board, so every ACWR figure in the zone was
            computed on a week with its biggest day missing. */}
        <GameMinutesList fixtures={fixtures} today={today} bhbcLoads={bhbcLoads} onPick={onPickMinutes} />
        {pastData ? (
          <>
            {upcomingFx.length ? <ResultsList games={upcomingFx} bhbcOnly /> : <div style={{ fontFamily: FB, fontSize: 13, color: C.td, padding: '14px 0', textAlign: 'center' }}>Fixtures load as the league publishes them.</div>}
            {playedGames.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <CollapsibleSection domId="bhbc-lastseason-games" storageKey="bhbc-lastseason-games" defaultOpen={false} title={`${league.season} · ${tr('Last season results')}`} bare padX={0}>
                  <ResultsList games={playedGames} bhbcOnly />
                </CollapsibleSection>
              </div>
            )}
          </>
        ) : (
          allGames.length ? <ResultsList games={allGames} bhbcOnly /> : <div style={{ fontFamily: FB, fontSize: 13, color: C.td, padding: '14px 0', textAlign: 'center' }}>Fixtures load as the league publishes them.</div>
        )}
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
// A medical status expressed on the availability scale (1 full -> 4 out).
// Shared by saveInjury (which mirrors it onto the day it is saved) and the
// roster rows (which floor today's availability by any ACTIVE injury).
const MEDICAL_STATUS_AVAIL = { available: 1, limited: 2, 'non-contact': 3, out: 4 };
// Who wrote a record, in a form a coach recognises. The BHBC staff are a
// known, tiny set, so this stays a formatting rule rather than a directory:
// local part of the address, trailing digits dropped, title-cased.
export function byName(email) {
  const s = String(email || '').split('@')[0].replace(/[0-9._-]+$/, '').replace(/[._-]+/g, ' ').trim();
  if (!s) return '';
  return s.split(' ').filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
}

const activeInjuries = (medical, id) => ((medical[id] || {}).injuries || []).filter((i) => !i.resolved);
const resolvedInjuries = (medical, id) => ((medical[id] || {}).injuries || []).filter((i) => i.resolved);

// LOAD x MEDICAL - the one cross-check the zone was missing.
//
// The load board knows a 7-day load. The medical board knows he came back from
// an ankle six days ago. Neither knew both, so the most predictable re-injury
// pattern in team sport was invisible in a zone holding all the data.
//
// It renders NOTHING when there is nothing to say. An alert that is always on
// screen stops being an alert.
function ReturnLoadAlert({ roster, loads, medical, today, onOpen }) {
  const tr = useT();
  const flags = React.useMemo(
    () => returnToLoadFlags({ roster: roster || [], loads: loads || {}, medical: medical || {}, today }),
    [roster, loads, medical, today],
  );
  if (!flags.length) return null;
  return (
    <div style={{ border: `1px solid ${C.rd}`, marginBottom: 14 }}>
      <RefinedHeaderStrip title={tr('Back from injury, loading too fast')} accent={C.rd} />
      <div style={{ padding: '10px 14px' }}>
        {flags.map((f) => (
          <button key={f.id} onClick={() => onOpen && onOpen(f.id)}
            style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', alignItems: 'center', gap: 10,
              width: '100%', textAlign: 'start', background: 'transparent', border: 'none', borderTop: '1px solid ' + C.ln,
              padding: '8px 0', cursor: onOpen ? 'pointer' : 'default', color: C.tx }}>
            <span style={{ minWidth: 0 }}>
              <span style={{ fontWeight: 700 }}>{f.name}</span>
              <span style={{ color: C.td }}>
                {' \u00B7 '}{tr('back')} {f.daysBack} {tr('days')}
                {f.bodyPart ? ' \u00B7 ' + tr(f.bodyPart) : ''}
              </span>
              <div dir="ltr" style={{ fontFamily: FN, fontSize: 11.5, color: C.td, marginTop: 2, unicodeBidi: 'isolate' }}>
                {f.weekLoad} AU {tr('this week')} {'\u00B7'} {f.pct}% {tr('of his own pre-injury week')} ({f.baseline} AU) {'\u00B7'} {tr('guide')} {f.cap}%
              </div>
            </span>
            <span style={{ fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.1em',
              color: f.severity === 'high' ? C.rd : C.or, border: '1px solid ' + (f.severity === 'high' ? C.rd : C.or),
              height: 22, boxSizing: 'border-box', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              padding: '0 8px', lineHeight: 1, flexShrink: 0 }}>
              {f.severity === 'high' ? tr('CUT TODAY') : tr('WATCH')}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// Played BHBC games, most recent first, each opening the minutes editor.
// Shows at a glance which games still have no minutes recorded, because a game
// nobody logged is a hole in every load number that week.
function GameMinutesList({ fixtures, today, bhbcLoads, onPick }) {
  const tr = useT();
  const games = React.useMemo(() => (fixtures || [])
    .filter((f) => f && f.type === 'game' && f.date && f.date <= today)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, 8), [fixtures, today]);
  if (!games.length) return null;
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontFamily: FN, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.16em', color: C.ac, textTransform: 'uppercase', marginBottom: 6 }}>
        {tr('Minutes played')}
      </div>
      {games.map((g) => {
        const mins = gameMinutesOf(bhbcLoads || {}, g.date);
        const n = Object.values(mins).filter((m) => Number(m) > 0).length;
        return (
          <button key={`${g.date}|${g.opponent || ''}`} onClick={() => onPick(g)}
            style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', alignItems: 'center', gap: 10,
              width: '100%', textAlign: 'start', background: 'transparent', border: 'none', borderTop: '1px solid ' + C.ln,
              padding: '8px 0', cursor: 'pointer', color: C.tx }}>
            <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              <span dir="ltr" style={{ fontFamily: FN, fontSize: 11, color: C.td, unicodeBidi: 'isolate' }}>{g.date}</span>
              {'  '}{g.opponent ? tr('vs') + ' ' + g.opponent : tr('Game')}
            </span>
            <span style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
              color: n ? C.gn : C.td, border: '1px solid ' + (n ? C.gn : C.ln),
              height: 22, boxSizing: 'border-box', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              padding: '0 8px', lineHeight: 1, flexShrink: 0 }}>
              {n ? `${n} ${tr('logged')}` : tr('ADD MINUTES')}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// One RPE for the game, minutes per athlete. Foster sRPE is rpe x minutes, so a
// starter and a bench player come out of the same game with very different
// loads - which is the entire point of recording it.
function GameMinutesModal({ game, roster, bhbcLoads, onClose, onSave }) {
  const tr = useT();
  const date = game.date;
  const [rpe, setRpe] = useState(() => String(gameRpeOf(bhbcLoads || {}, date) || 8));
  const [mins, setMins] = useState(() => {
    const saved = gameMinutesOf(bhbcLoads || {}, date);
    const out = {};
    for (const t of roster || []) out[t.id] = saved[t.id] == null ? '' : String(saved[t.id]);
    return out;
  });
  const total = Object.values(mins).reduce((a, m) => a + (Number(m) || 0), 0);
  const played = Object.values(mins).filter((m) => Number(m) > 0).length;
  return (
    <Modal open onClose={onClose} wide title={`${tr('Minutes played')} \u00B7 ${game.opponent ? tr('vs') + ' ' + game.opponent : tr('Game')}`}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <span style={{ fontFamily: FN, fontSize: 11, color: C.td }}>{tr('Game RPE')}</span>
        <input type="number" min="1" max="10" value={rpe} onChange={(e) => setRpe(e.target.value)}
          style={{ width: 64, height: 30, boxSizing: 'border-box', background: 'var(--c-sf)', border: '1px solid ' + C.ln, color: C.tx, fontFamily: FN, padding: '0 8px' }} />
        <span dir="ltr" style={{ fontFamily: FN, fontSize: 11, color: C.td, unicodeBidi: 'isolate' }}>
          {played} {tr('played')} \u00B7 {total} {tr('min total')}
        </span>
      </div>
      <div style={{ maxHeight: '46vh', overflowY: 'auto' }}>
        {(roster || []).map((t) => (
          <div key={t.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 86px', alignItems: 'center', gap: 10, padding: '6px 0', borderTop: '1px solid ' + C.ln }}>
            <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name || t.id}</span>
            <input type="number" min="0" max="60" inputMode="numeric" placeholder={tr('DNP')}
              value={mins[t.id] ?? ''} onChange={(e) => setMins((p) => ({ ...p, [t.id]: e.target.value }))}
              style={{ width: '100%', height: 30, boxSizing: 'border-box', background: 'var(--c-sf)', border: '1px solid ' + C.ln, color: C.tx, fontFamily: FN, padding: '0 8px' }} />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
        <Btn variant="ghost" onClick={onClose}>{tr('Cancel')}</Btn>
        <Btn onClick={() => onSave({ date, rpe: Number(rpe) || 0, minutes: mins })}>{tr('Save')}</Btn>
      </div>
    </Modal>
  );
}

function StatusPill({ status, small, full }) {
  const tr = useT();
  const s = MED_STATUS[status] || MED_STATUS.available;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5, height: small ? 28 : 30, boxSizing: 'border-box', width: full ? '100%' : undefined, fontFamily: FN, fontSize: small ? 10 : 11, fontWeight: 700, letterSpacing: '0.03em', color: s.color, background: `color-mix(in srgb, ${s.color} 13%, transparent)`, border: `1px solid color-mix(in srgb, ${s.color} 38%, transparent)`, padding: small ? '0 10px' : '0 11px', whiteSpace: 'nowrap' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.color, flexShrink: 0 }} />{tr(s.label)}
    </span>
  );
}


// Ohad 2026-08-28: "make sure the medical stuff has an output of rpe x time of
// practice in minutes and display it where-ever it needs to be displayed, so
// any other coach can see."
//
// This is session load (Foster sRPE): RPE x minutes, in AU. acwrEngine has
// computed it since the load board shipped, but only ever showed the RATIO it
// feeds — a PT looking at an injured player could not see the actual load that
// player is taking. The arithmetic is written out ("7 x 60 = 420 AU") rather
// than just the product, because the point is that a coach can check it.
//
// Injured athletes sort first: on the medical board they are the reason
// anyone opens this card.
function lastSessionOf(loads, id) {
  const rec = loads[id];
  if (!rec || !rec.sessions) return null;
  const dates = Object.keys(rec.sessions).filter((d) => (rec.sessions[d] || []).length).sort();
  if (!dates.length) return null;
  const date = dates[dates.length - 1];
  const rowsForDay = rec.sessions[date];
  // The last row of the most recent day that actually carries load. A gym
  // session is minutes-only by Ohad's rule (no RPE ever), so it has no load
  // and is not what this card is reporting.
  const withLoad = rowsForDay.filter((r) => Number(r.load) > 0);
  const r = withLoad.length ? withLoad[withLoad.length - 1] : null;
  return r ? { date, minutes: Number(r.min ?? r.minutes) || null, rpe: Number(r.rpe) || null, load: Math.round(Number(r.load)) } : null;
}

function LoadOutputCard({ rows, loads, medical }) {
  const tr = useT();
  const ordered = [...rows].sort((a, b) => {
    const ai = activeInjuries(medical, a.t.id).length > 0 ? 0 : 1;
    const bi = activeInjuries(medical, b.t.id).length > 0 ? 0 : 1;
    if (ai !== bi) return ai - bi;
    return (b.acwr.acute || 0) - (a.acwr.acute || 0);
  });
  const any = ordered.some((r) => (r.acwr.acute || 0) > 0 || lastSessionOf(loads, r.t.id));
  return (
    <Card padding={18} leftStripe={NAVY} header={secTitle('Session load · RPE x minutes')}
      headerRight={<span style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#fff' }}>AU</span>}>
      {!any ? (
        <div style={{ fontFamily: FB, fontSize: 13, color: C.td, padding: '10px 0', textAlign: 'center' }}>{tr('No load logged yet')}</div>
      ) : (
        <div>
          {ordered.map(({ t, acwr }) => {
            const last = lastSessionOf(loads, t.id);
            const injured = activeInjuries(medical, t.id).length > 0;
            return (
              <div key={t.id} className="bhbc-row" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 2px', borderBottom: `0.25px solid ${C.cardBd}` }}>
                <span style={{ display: 'inline-block', width: 18, textAlign: 'right', flexShrink: 0, fontFamily: FN, fontSize: 11, fontWeight: 700, color: C.td, fontVariantNumeric: 'tabular-nums' }}>{t.jersey != null ? t.jersey : ''}</span>
                <span style={{ fontFamily: FN, fontSize: 13, fontWeight: 700, color: injured ? ORANGE : C.tx, minWidth: 0, whiteSpace: 'normal', overflowWrap: 'break-word' }}>{t.name}</span>
                <div style={{ flex: 1 }} />
                {/* The arithmetic, spelled out, isolated LTR so the x and the
                    = do not drift in an RTL page. */}
                <span dir="ltr" style={{ fontFamily: FN, fontSize: 11, color: C.tm, flexShrink: 0, fontVariantNumeric: 'tabular-nums', unicodeBidi: 'isolate' }}>
                  {last && last.rpe && last.minutes ? `${last.rpe} × ${last.minutes} = ${last.load} AU` : '—'}
                </span>
                <span style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.td, flexShrink: 0 }}>{tr('7 days')}</span>
                <span dir="ltr" style={{ fontFamily: FN, fontSize: 12, fontWeight: 700, color: C.tx, flexShrink: 0, fontVariantNumeric: 'tabular-nums', minWidth: 62, textAlign: 'right' }}>
                  {Math.round(acwr.acute || 0)} AU
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function MedicalView({ roster, rows: loadRows = [], loads = {}, medical, canMedical = true, onReport, onEdit, onOpen, onLog }) {
  const he = useHe();
  const tr = useT();
  const injured = roster.filter((t) => activeInjuries(medical, t.id).length > 0);
  const cleared = roster.filter((t) => activeInjuries(medical, t.id).length === 0);
  const rows = injured.flatMap((t) => activeInjuries(medical, t.id).map((inj) => ({ t, inj })));
  const counts = { out: 0, limited: 0, nc: 0 };
  rows.forEach(({ inj }) => { if (inj.status === 'out') counts.out++; else if (inj.status === 'limited') counts.limited++; else if (inj.status === 'non-contact') counts.nc++; });
  return (
    <>
      <Card padding={18} leftStripe={ORANGE} header={secTitle('Medical · Injury Board')} headerRight={<span style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#fff' }}>{rows.length} {tr('active')} · {canMedical ? 'Ohad + PT' : tr('view only')}</span>}>
        <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
          {[[tr('Out'), counts.out, '#DE4E3B'], [tr('limited'), counts.limited, '#E0A73A'], [tr('Non-contact'), counts.nc, '#4F9DE0'], [tr('Cleared'), cleared.length, '#37B27C']].map(([k, n, c]) => (
            <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontFamily: FN, fontSize: 26, fontWeight: 800, color: n ? c : C.tx, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{n}</span>
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
                <div key={t.id + inj.id} className="bhbc-row bhbc-inj-row" onClick={() => canMedical && onEdit(t.id, inj.id)}
                  role={canMedical ? 'button' : undefined} tabIndex={canMedical ? 0 : undefined}
                  onKeyDown={canMedical ? ((ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onEdit(t.id, inj.id); } }) : undefined} style={{ display: 'grid', gridTemplateColumns: '150px 1fr 120px 110px auto', gap: 12, alignItems: 'center', padding: '11px 0', borderBottom: `0.25px solid ${C.cardBd}`, cursor: canMedical ? 'pointer' : 'default' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                    <span style={{ display: 'inline-block', width: 18, textAlign: 'right', flexShrink: 0, fontFamily: FN, fontSize: 11, fontWeight: 700, color: ORANGE_DEEP, fontVariantNumeric: 'tabular-nums' }}>{t.jersey ?? '—'}</span>
                    <span style={{ fontFamily: FN, fontSize: 13, fontWeight: 700, color: C.tx, whiteSpace: 'normal', overflowWrap: 'break-word' }}>{t.name}</span>
                  </div>
                  <div style={{ fontFamily: FB, fontSize: 13, color: C.tx, minWidth: 0 }}>{[inj.bodyPart, inj.side && inj.side !== 'N/A' ? inj.side : '', inj.type].filter(Boolean).map((x) => tr(x)).join(' · ')}</div>
                  <StatusPill status={inj.status} />
                  <div style={{ fontFamily: FN, fontSize: 11, color: C.td, fontVariantNumeric: 'tabular-nums' }}>{days != null ? `${days}d` : '—'}{inj.pain != null && inj.pain !== '' ? ` · ${tr('pain')} ${inj.pain}` : ''}</div>
                  {/* WHO assessed this. With two PTs sharing the board, an
                      unsigned record cannot be questioned or followed up. */}
                  <div style={{ fontFamily: FN, fontSize: 10, color: C.td }}>{(inj.updatedBy || inj.by) ? byName(inj.updatedBy || inj.by) : ''}</div>
                  <div style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: ORANGE_DEEP }}>{canMedical ? 'Update ›' : ''}</div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {(() => {
        // Every cleared injury, newest first. This is the history he asked
        // for: resolving moves a record HERE, it never removes it.
        const past = roster.flatMap((t) => resolvedInjuries(medical, t.id).map((inj) => ({ t, inj })));
        past.sort((a, b) => String(b.inj.onsetDate || '').localeCompare(String(a.inj.onsetDate || '')));
        if (!past.length) return null;
        return (
          <Card padding={18} leftStripe={'#37B27C'} header={secTitle('Previous injuries')}
            headerRight={<span style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#fff' }}>{past.length}</span>}>
            <div>
              {past.map(({ t, inj }) => (
                <div key={t.id + inj.id} className="bhbc-row" onClick={() => canMedical && onEdit(t.id, inj.id)}
                  role={canMedical ? 'button' : undefined} tabIndex={canMedical ? 0 : undefined}
                  onKeyDown={canMedical ? ((ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onEdit(t.id, inj.id); } }) : undefined}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 2px', borderBottom: `0.25px solid ${C.cardBd}`, cursor: canMedical ? 'pointer' : 'default' }}>
                  <span style={{ display: 'inline-block', width: 18, textAlign: 'right', flexShrink: 0, fontFamily: FN, fontSize: 11, fontWeight: 700, color: C.td, fontVariantNumeric: 'tabular-nums' }}>{t.jersey != null ? t.jersey : ''}</span>
                  <span style={{ fontFamily: FN, fontSize: 13, fontWeight: 700, color: C.tx, minWidth: 0, whiteSpace: 'normal', overflowWrap: 'break-word' }}>{t.name}</span>
                  <span style={{ fontFamily: FB, fontSize: 13, color: C.tm, minWidth: 0 }}>{[inj.bodyPart, inj.side && inj.side !== 'N/A' ? inj.side : null, inj.type].filter(Boolean).map((x) => tr(x)).join(' · ')}</span>
                  <div style={{ flex: 1 }} />
                  {inj.onsetDate && <span dir="ltr" style={{ fontFamily: FN, fontSize: 11, color: C.td, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{inj.onsetDate}</span>}
                  <span style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#37B27C', flexShrink: 0 }}>{tr('Cleared')}</span>
                </div>
              ))}
            </div>
          </Card>
        );
      })()}

      <LoadOutputCard rows={loadRows} loads={loads} medical={medical} />

      <Card padding={18} leftStripe={NAVY} header={secTitle('Roster Health')}>
        <div>
          {roster.map((t) => {
            const act = activeInjuries(medical, t.id);
            const status = act.length ? (act.find((i) => i.status === 'out') || act.find((i) => i.status === 'limited') || act[0]).status : 'available';
            const hist = ((medical[t.id] || {}).injuries || []).length;
            return (
              <div key={t.id} className="bhbc-row" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', rowGap: 6, gap: 14, padding: '11px 0', borderBottom: `0.25px solid ${C.cardBd}` }}>
                <div style={{ flex: '1 1 160px', display: 'flex', alignItems: 'center', gap: 10, minWidth: 140, cursor: 'pointer' }} onClick={() => onOpen(t.id)} role="button" tabIndex={0} onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onOpen(t.id); } }}>
                  <span style={{ fontFamily: FN, fontSize: 11, fontWeight: 700, color: ORANGE_DEEP, fontVariantNumeric: 'tabular-nums', width: 20, textAlign: 'right', flexShrink: 0 }}>{t.jersey ?? '—'}</span>
                  <span style={{ fontFamily: FN, fontSize: 13, fontWeight: 600, color: C.tx, whiteSpace: 'normal', overflowWrap: 'break-word' }}>{t.name}</span>
                  {hist > 0 && <span style={{ fontFamily: FN, fontSize: 9, color: C.tm, letterSpacing: '0.04em', flexShrink: 0 }}>· {hist} record{hist > 1 ? 's' : ''}</span>}
                </div>
                {/* colour = signal: a coloured status DOT, calm muted label — not a filled pill. */}
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, minWidth: 96, fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.tm, whiteSpace: 'nowrap', flexShrink: 0 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: (MED_STATUS[status] || MED_STATUS.available).color, flexShrink: 0 }} />
                  {tr((MED_STATUS[status] || MED_STATUS.available).label)}
                </span>
                {onLog && (
                  <button onClick={(e) => { e.stopPropagation(); onLog(t.id); }} className="bhbc-ghost-btn" title="Log a practice for this athlete"
                    style={{ height: ROW_BTN_H, boxSizing: 'border-box', padding: '0 12px', flexShrink: 0, fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{tr('+ Log')}</button>
                )}
                {canMedical
                  ? <button onClick={() => (act.length ? onEdit(t.id, act[0].id) : onReport(t.id))} className="bhbc-ghost-btn" style={{ height: 26, boxSizing: 'border-box', minWidth: 84, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.tm, background: 'transparent', border: `1px solid ${C.cardBd}`, cursor: 'pointer', flexShrink: 0, transition: 'color .12s, border-color .12s' }}>{act.length ? (he ? '‹ צפייה' : 'View ›') : (he ? '+ דיווח' : '+ Report')}</button>
                  : <span style={{ width: 84, flexShrink: 0 }} />}
              </div>
            );
          })}
        </div>
      </Card>

      {/* Return-to-Play protocol — the staged framework + safe-progression rules,
          encoded from EXPO's programming rules (pain gates, regression hierarchy,
          red-flag referral). A shared reference for Ohad + the PT so returns are
          structured and defensible. Uses "manage / load management" language. */}
      <CollapsibleSection title={tr("Return-to-Play Protocol")} storageKey="bhbc-rtp" leftStripe={NAVY}>
        <div style={{ display: 'grid', gap: 1, background: C.cardBd, border: `1px solid ${C.cardBd}`, marginBottom: 14 }}>
          {[
            ['1', 'Acute · protect', 'Offload the tissue, manage pain + swelling. Pain-free daily movement only.'],
            ['2', 'Pain-free ROM', 'Restore full range with no symptoms before adding load.'],
            ['3', 'Loaded rehab', 'Re-load progressively — isometrics → tempo → full-ROM strength.'],
            ['4', 'Non-contact', 'Running, change-of-direction and court work, no contact.'],
            ['5', 'Contact · modified', 'Full-speed contact drills with minutes capped.'],
            ['6', 'Full training → cleared', 'Complete sessions, no restrictions, then clear to play.'],
          ].map(([n, stage, detail]) => (
            <div key={n} style={{ display: 'grid', gridTemplateColumns: '30px minmax(0, 150px) minmax(0, 1fr)', gap: 12, alignItems: 'center', background: 'var(--c-sf)', padding: '10px 12px' }}>
              <span style={{ fontFamily: FN, fontSize: 11, fontWeight: 800, color: ORANGE_DEEP, fontVariantNumeric: 'tabular-nums' }}>{n}</span>
              <span style={{ fontFamily: FN, fontSize: 12, fontWeight: 700, letterSpacing: '0.03em', color: C.tx }}>{stage}</span>
              <span style={{ fontFamily: FB, fontSize: 12, color: C.tm, lineHeight: 1.4 }}>{detail}</span>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontFamily: FB, fontSize: 12, color: C.tx, lineHeight: 1.5 }}>
            <span style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.tm, marginRight: 8 }}>Pain gate</span>
            0–3/10 progress · 4–5 hold &amp; modify (regress <span style={{ color: C.tx, fontWeight: 700 }}>ROM → Tempo → Intensity → Volume → Frequency</span>, cut frequency last) · 6+ stop &amp; reassess.
          </div>
          <div style={{ fontFamily: FB, fontSize: 12, color: C.tx, lineHeight: 1.5 }}>
            <span style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#DE4E3B', marginRight: 8 }}>Refer out</span>
            Saddle anaesthesia · bowel/bladder change · drop foot · unexplained weight loss · night pain unrelated to position — never manage through these.
          </div>
        </div>
      </CollapsibleSection>
    </>
  );
}

function InjuryModal({ athlete, injury, onClose, onSave, currentUser = '' }) {
  const tr = useT();
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
    setProgress((p) => [{ date: todayISO(), note: pNote.trim(), pain: pPain === '' ? null : Number(pPain), status, by: currentUser || null }, ...p]);
    setPNote(''); setPPain('');
  };
  const save = () => {
    if (!bodyPart) { toast('Pick a body part'); return; }
    onSave({
      id: injury?.id || 'inj_' + Math.random().toString(36).slice(2, 9),
      bodyPart, side, type, onsetDate, status, pain: pain === '' ? null : Number(pain),
      mechanism: mechanism.trim(), rtpTarget, notes: notes.trim(), resolved, progress,
      createdAt: injury?.createdAt || new Date().toISOString(),
      // Who wrote it first stays put; who touched it last is what a second
      // PT needs to see before acting on somebody else's assessment.
      by: injury?.by || currentUser || null,
      updatedBy: currentUser || null,
      updatedAt: new Date().toISOString(),
    });
  };
  const sel = { fontFamily: FN, fontSize: 13, color: C.tx, background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderRadius: 0, padding: '0 8px', width: '100%', height: 34, boxSizing: 'border-box' };
  const lbl = { fontSize: 9, fontWeight: 700, color: C.tm, textTransform: 'uppercase', letterSpacing: '0.16em', fontFamily: FN, marginBottom: 4, display: 'block' };
  return (
    <Modal open onClose={onClose} wide title={`${injury ? 'Update' : 'Report'} injury · #${athlete.jersey ?? '—'} ${athlete.name}`}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="bhbc-form-grid" style={{ display: 'grid', gridTemplateColumns: '1.3fr 0.9fr 1.1fr', gap: 10 }}>
          <div><label style={lbl}>{tr('Body part')}</label><select value={bodyPart} onChange={(e) => setBodyPart(e.target.value)} style={sel}><option value="">— select —</option>{BODY_PARTS.map((b) => <option key={b} value={b}>{b}</option>)}</select></div>
          <div><label style={lbl}>{tr('Side')}</label><select value={side} onChange={(e) => setSide(e.target.value)} style={sel}>{['N/A', 'Left', 'Right', 'Bilateral'].map((s) => <option key={s} value={s}>{s}</option>)}</select></div>
          <div><label style={lbl}>{tr('Type')}</label><select value={type} onChange={(e) => setType(e.target.value)} style={sel}><option value="">—</option>{INJURY_TYPES.map((tp) => <option key={tp} value={tp}>{tp}</option>)}</select></div>
        </div>
        <div className="bhbc-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          <Input label={tr('Onset date')} type="date" value={onsetDate} onChange={(e) => setOnsetDate(e.target.value)} />
          <div><label style={lbl}>{tr('Pain (0–10)')}</label><input type="number" min="0" max="10" value={pain} onChange={(e) => setPain(e.target.value)} placeholder="—" style={sel} /></div>
          <Input label={tr('Return-to-play target')} type="date" value={rtpTarget} onChange={(e) => setRtpTarget(e.target.value)} />
        </div>
        <div>
          <label style={lbl}>{tr('Current status')}</label>
          <div style={{ display: 'inline-flex', border: `1px solid ${C.cardBd}`, flexWrap: 'wrap' }}>
            {Object.entries(MED_STATUS).map(([k, s]) => (
              <button key={k} type="button" onClick={() => setStatus(k)} style={{ fontFamily: FN, fontSize: 11, fontWeight: 700, color: status === k ? '#fff' : C.td, background: status === k ? s.color : 'transparent', border: 'none', padding: '7px 14px', cursor: 'pointer' }}>{s.label}</button>
            ))}
          </div>
        </div>
        <div><label style={lbl}>{tr('Mechanism / how it happened')}</label><input value={mechanism} onChange={(e) => setMechanism(e.target.value)} placeholder={tr('e.g. landed awkwardly on a rebound')} style={sel} /></div>
        <div><label style={lbl}>Notes (diagnosis, plan, PT observations)</label><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} style={{ ...sel, height: 'auto', padding: '8px', resize: 'vertical' }} /></div>

        {/* Rehab progress log */}
        <div style={{ border: `1px solid ${C.cardBd}` }}>
          <div style={{ padding: '8px 12px', background: NAVY_DEEP, fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#fff' }}>{tr('Rehab progress')}</div>
          <div style={{ display: 'flex', gap: 8, padding: '10px 12px', borderBottom: progress.length ? `1px solid ${C.cardBd}` : 'none', alignItems: 'center' }}>
            <input value={pNote} onChange={(e) => setPNote(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addProgress(); }} placeholder={tr('Progress note for today…')} style={{ ...sel, flex: 1 }} />
            <input type="number" min="0" max="10" value={pPain} onChange={(e) => setPPain(e.target.value)} placeholder={tr('pain')} style={{ ...sel, width: 72 }} />
            <Btn onClick={addProgress} style={{ background: ORANGE, borderColor: ORANGE, color: '#fff' }}>{tr('Add')}</Btn>
          </div>
          {progress.length > 0 && (
            <div style={{ maxHeight: 160, overflowY: 'auto' }}>
              {progress.map((p, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, padding: '8px 12px', borderBottom: `0.25px solid ${C.cardBd}`, fontFamily: FN, fontSize: 12, alignItems: 'baseline' }}>
                  <span style={{ color: C.td, width: 50, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{p.date.slice(5)}</span>
                  <span style={{ color: C.tx, flex: 1, minWidth: 0 }}>{p.note || '—'}</span>
                  {p.pain != null && <span style={{ color: ORANGE_DEEP, fontWeight: 700, flexShrink: 0 }}>{tr('pain')} {p.pain}</span>}
                  {p.by && <span style={{ color: C.td, fontSize: 10, flexShrink: 0 }}>{byName(p.by)}</span>}
                </div>
              ))}
            </div>
          )}
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontFamily: FB, fontSize: 13, color: C.tx }}>
          <input type="checkbox" checked={resolved} onChange={(e) => setResolved(e.target.checked)} style={{ accentColor: '#37B27C', width: 16, height: 16 }} />
          Mark resolved / cleared to play
        </label>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Btn variant="ghost" onClick={onClose}>{tr('Cancel')}</Btn>
          <Btn onClick={save} style={{ background: ORANGE, borderColor: ORANGE, color: '#fff' }}>{tr('Save record')}</Btn>
        </div>
      </div>
    </Modal>
  );
}

function LogModal({ open, initialAthlete, roster, fixtures = [], availableCount = 0, onClose, onSave }) {
  const tr = useT();
  const [scope, setScope] = useState('athlete');
  const [athleteId, setAthleteId] = useState(initialAthlete);
  const [date, setDate] = useState(todayISO());
  const [type, setType] = useState('Practice');
  const [minutes, setMinutes] = useState('');
  const [rpe, setRpe] = useState('');
  const [pain, setPain] = useState(''); const [sleep, setSleep] = useState(''); const [energy, setEnergy] = useState('');
  // Gym (Lift) sessions are minutes-only — Ohad never records gym RPE, so the
  // field disappears and the session saves as attendance + duration, no load.
  const isLift = type === 'Lift';
  // The preview the coach reads must agree with what will be SAVED, so it is
  // derived from the type the same way. Before this it showed 420 AU under a
  // panel that said "Gym session — minutes only, no RPE".
  const preview = isLift ? 0 : sessionLoad(minutes, rpe);
  const liftOk = isLift && Number(minutes) > 0;
  const canSave = scope === 'squad' ? (preview > 0 || liftOk) : (athleteId && (preview > 0 || liftOk || pain || sleep || energy));
  const selStyle = { fontFamily: FB, fontSize: 13, color: C.tx, background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderRadius: 0, padding: '9px 10px', width: '100%' };
  const lab = { fontSize: 9, fontWeight: 700, color: C.tm, textTransform: 'uppercase', letterSpacing: '0.18em', fontFamily: FN, textAlign: 'center' };
  return (
    <Modal open={open} onClose={onClose} title={tr('Log a session')}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'inline-flex', border: `1px solid ${C.cardBd}`, alignSelf: 'center' }}>
          {[['athlete', 'One athlete'], ['squad', 'Whole roster']].map(([k, l]) => (
            <button key={k} type="button" onClick={() => setScope(k)} style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: scope === k ? '#fff' : C.td, background: scope === k ? NAVY : 'transparent', border: 'none', padding: '6px 14px', cursor: 'pointer' }}>{l}</button>
          ))}
        </div>
        {scope === 'athlete' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={lab}>{tr('Athlete')}</label>
            <select value={athleteId} onChange={(e) => setAthleteId(e.target.value)} style={selStyle}>
              {roster.length === 0 && <option value="">— add roster first —</option>}
              {roster.map((t) => <option key={t.id} value={t.id}>{t.jersey != null ? `#${t.jersey} ` : ''}{t.name}</option>)}
            </select>
          </div>
        ) : (
          <div style={{ fontFamily: FB, fontSize: 13, color: C.td, textAlign: 'center', padding: '4px 0' }}>Logs this session for <b style={{ color: C.tx }}>{availableCount}</b> available athlete{availableCount === 1 ? '' : 's'} — skips anyone Out.</div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Input label={tr('Date')} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={lab}>{tr('Type')}</label>
            <select value={type} onChange={(e) => setType(e.target.value)} style={selStyle}>
              {['Practice', 'Game', 'Lift', 'Shootaround', 'Travel', 'Recovery'].map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isLift ? '1fr' : '1fr 1fr', gap: 10 }}>
          <Input label={tr('Minutes')} type="number" inputMode="numeric" min="0" value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder={isLift ? '40' : '75'} />
          {!isLift && <Input label={tr('Session RPE (0–10)')} type="number" inputMode="decimal" min="0" max="10" step="0.5" value={rpe} onChange={(e) => setRpe(e.target.value)} placeholder="7" />}
        </div>
        <div style={{ fontFamily: FN, fontSize: 11, color: C.td, textAlign: 'center', letterSpacing: '0.04em' }}>
          {isLift ? 'Gym session — minutes only, no RPE' : <>sRPE load = <span style={{ color: ORANGE_DEEP, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{preview || 0}</span> units</>}
        </div>
        {(() => {
          const day = fixtures.filter((f) => f.date === date);
          if (!day.length) return null;
          return (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.tm }}>{tr('From calendar')}</span>
              {day.map((f, i) => (
                <button key={i} type="button" onClick={() => { setMinutes(String(f.minutes)); setType(f.type === 'lift' ? 'Lift' : f.type === 'game' ? 'Game' : 'Practice'); }}
                  style={{ fontFamily: FN, fontSize: 10, color: FX_COLOR[f.type] || NAVY, background: 'transparent', border: `1px solid ${C.cardBd}`, borderInlineStart: `3px solid ${FX_COLOR[f.type] || NAVY}`, padding: '4px 8px', cursor: 'pointer' }}>
                  {f.start} {fxLabelFor(f.type, FX_LABEL[f.type] || 'Session')} {f.minutes} min
                </button>
              ))}
            </div>
          );
        })()}
        {/* Readiness is a PER-ATHLETE check-in. In whole-roster scope the squad
            path has nowhere honest to put one number — copying it onto every
            athlete would invent each player's pain/sleep/energy — so the block
            is hidden instead of silently discarded (audit 08-22 #29). */}
        {scope !== 'squad' && (
        <div style={{ borderTop: `1px solid ${C.cardBd}`, paddingTop: 10 }}>
          <div style={{ ...lab, marginBottom: 8, letterSpacing: '0.16em' }}>{tr('Readiness (optional)')}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <Input label={tr('Pain 0–10')} type="number" min="0" max="10" value={pain} onChange={(e) => setPain(e.target.value)} />
            <Input label={tr('Sleep 0–10')} type="number" min="0" max="10" value={sleep} onChange={(e) => setSleep(e.target.value)} />
            <Input label={tr('Energy 0–10')} type="number" min="0" max="10" value={energy} onChange={(e) => setEnergy(e.target.value)} />
          </div>
        </div>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
          <Btn variant="ghost" onClick={onClose}>{tr('Cancel')}</Btn>
          <Btn disabled={!canSave} onClick={() => onSave({ scope, athleteId, date, type, minutes, rpe, readiness: { pain, sleep, energy } })}
            style={{ background: canSave ? ORANGE : undefined, borderColor: canSave ? ORANGE : undefined, color: canSave ? '#fff' : undefined }}>{tr('Save')}</Btn>
        </div>
      </div>
    </Modal>
  );
}
