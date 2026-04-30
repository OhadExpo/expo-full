// Full-coverage COACH-side interactive demo at expo-app.co.il/try.
// Replaces the earlier engine-sandbox-with-banner approach. A coach prospect
// can click through every major surface of the platform — Dashboard, Trainees,
// Programs, Exercises, Review — with plausible mock data, no backend.
//
// All state is local React state. No Supabase, no useStore, nothing that the
// running product depends on. The Review tab embeds the existing /demo engine
// in an iframe to show the rep counter + pose overlay live, with a fake
// comments sidebar around it that hints at the production review surface.
//
// Companion to /demo (TrySandbox pov="trainee") which stays as the simple
// trainee-side engine sandbox. Both end-CTAs converge at /coaches#waitlist.

import React, { useState } from 'react';
import { C, FN, FB, EXPO_LOGO_NAV } from './theme';
import { EXPOMark } from './expoMark';

// ─── Mock data ────────────────────────────────────────────────────────────
// Three mock trainees — one per format type (Online / Gym Single / Gym Couple)
// with Israeli names. Enough variety to show every kind of card + filter
// without padding the demo to feel like marketing fluff.
const MOCK_TRAINEES = [
  { id: 't1', name: 'נועה לוי', short: 'Noa', email: 'noa.levi@example.co.il', phone: '+972544123456', status: 'Active', sessionsLeft: 6, monthly: 800, format: 'Gym, Single', startDate: '2025-09-01', dormantDays: null, lastWorkout: '2 days ago', programs: 3, payment: 'PAID', online: true, age: 31, weight: 64, height: 168, injuries: 'L4-L5 disc bulge', goals: 'Stronger bench, fix overhead', plans: ['Block #4 — Push/Pull Volume', 'Block #3 — Strength Base', 'Block #2 — Reset'] },
  { id: 't2', name: 'גל מזרחי', short: 'Gal', email: 'gal.mizrahi@example.co.il', phone: '+972526789012', status: 'Active', sessionsLeft: 2, monthly: 800, format: 'Online', startDate: '2024-11-15', dormantDays: 18, lastWorkout: '18 days ago', programs: 4, payment: 'OVERDUE', online: false, age: 27, weight: 78, height: 182, injuries: 'R shoulder impingement', goals: 'First muscle-up by summer', plans: ['Block #4 — Pull Specialization', 'Block #3 — Volume', 'Block #2 — Hypertrophy', 'Block #1 — Intake'] },
  { id: 't3', name: 'יעל ועידן כהן', short: 'Yael+Idan', email: 'yael.cohen@example.co.il', phone: '+972503334455', status: 'Active', sessionsLeft: 8, monthly: 1200, format: 'Gym, Couple', startDate: '2025-01-15', dormantDays: null, lastWorkout: '4 days ago', programs: 4, payment: 'PAID', online: false, isCouple: true, age: 35, weight: 72, height: 175, injuries: 'None', goals: 'Body comp + first chin-up (Yael)', plans: ['Block #4 — Couple Volume', 'Block #3 — Couple Base', 'Block #2 — Onboarding', 'Block #1 — Intake'] },
];

const MOCK_DAYS = [
  { name: 'Day A · Push', exercises: [
    { name: 'BB Bench Press',          sets: 4, reps: '6-8',  tempo: '3-1-1', superset: '', wk: ['57.5kg', '60kg', '62.5kg', '65kg'] },
    { name: 'DB Incline Press',        sets: 3, reps: '8-10', tempo: '',      superset: 'A' },
    { name: 'Cable Fly',               sets: 3, reps: '12',   tempo: '',      superset: 'A' },
    { name: 'Standing OHP',            sets: 4, reps: '6-8',  tempo: '',      superset: '', wk: ['32.5kg', '35kg', '37.5kg', '40kg'] },
    { name: 'Lateral Raise',           sets: 3, reps: '12-15',tempo: '',      superset: 'B' },
    { name: 'Tricep Pushdown',         sets: 3, reps: '12',   tempo: '',      superset: 'B' },
  ]},
  { name: 'Day B · Pull', exercises: [
    { name: 'BB Deadlift',             sets: 4, reps: '5',    tempo: '',      superset: '' },
    { name: 'Pull-Up',                 sets: 4, reps: '6-8',  tempo: '',      superset: 'A' },
    { name: 'Bent-Over BB Row',        sets: 4, reps: '8',    tempo: '',      superset: 'A' },
    { name: 'Face Pull',               sets: 3, reps: '15',   tempo: '',      superset: 'B' },
    { name: 'DB Bicep Curl',           sets: 3, reps: '10-12',tempo: '',      superset: 'B' },
    { name: 'Hammer Curl',             sets: 3, reps: '10',   tempo: '',      superset: '' },
  ]},
  { name: 'Day C · Legs', exercises: [
    { name: 'Back Squat',              sets: 5, reps: '5',    tempo: '3-0-X', superset: '', wk: ['90kg', '95kg', '100kg', '105kg'] },
    { name: 'Romanian Deadlift',       sets: 4, reps: '8',    tempo: '',      superset: 'A' },
    { name: 'Walking Lunge',           sets: 3, reps: '10 E', tempo: '',      superset: 'A' },
    { name: 'Leg Curl',                sets: 3, reps: '12',   tempo: '',      superset: 'B' },
    { name: 'Standing Calf Raise',     sets: 4, reps: '15',   tempo: '',      superset: 'B' },
  ]},
];

const MOCK_EXERCISES = [
  { name: 'BB Bench Press',         category: 'Chest',     pattern: 'Horizontal Push' },
  { name: 'DB Incline Press',       category: 'Chest',     pattern: 'Horizontal Push' },
  { name: 'Cable Fly',              category: 'Chest',     pattern: 'Isolation' },
  { name: 'Standing OHP',           category: 'Shoulders', pattern: 'Vertical Push' },
  { name: 'Lateral Raise',          category: 'Shoulders', pattern: 'Isolation' },
  { name: 'BB Deadlift',            category: 'Legs',      pattern: 'Hip Hinge' },
  { name: 'Romanian Deadlift',      category: 'Legs',      pattern: 'Hip Hinge' },
  { name: 'Pull-Up',                category: 'Back',      pattern: 'Vertical Pull' },
  { name: 'Bent-Over BB Row',       category: 'Back',      pattern: 'Horizontal Pull' },
  { name: 'Back Squat',             category: 'Legs',      pattern: 'Squat' },
  { name: 'Front Squat',            category: 'Legs',      pattern: 'Squat' },
  { name: 'Walking Lunge',          category: 'Legs',      pattern: 'Lunge' },
  { name: 'Leg Curl',               category: 'Legs',      pattern: 'Isolation' },
  { name: 'Hip Thrust',             category: 'Glutes',    pattern: 'Hip Hinge' },
  { name: 'Face Pull',              category: 'Back',      pattern: 'Horizontal Pull' },
  { name: 'DB Bicep Curl',          category: 'Arms',      pattern: 'Curl' },
  { name: 'Tricep Pushdown',        category: 'Arms',      pattern: 'Extend' },
  { name: 'Hanging Leg Raise',      category: 'Core',      pattern: 'Anti-Extension' },
  { name: 'Plank',                  category: 'Core',      pattern: 'Anti-Extension' },
  { name: 'Cable Pallof Press',     category: 'Core',      pattern: 'Anti-Rotation' },
];

const MOCK_REVIEW_COMMENTS = [
  { time: '00:04', body: 'Bar path drifting forward — pull elbows under more.', voice: false },
  { time: '00:11', body: 'Knees caving on rep 3. Cue "spread the floor" before next set.', voice: false },
  { time: '00:18', body: 'Tempo OK, but you\'re holding breath at the top. Reset before each rep.', voice: true },
];

// ─── Shared bits ──────────────────────────────────────────────────────────
const baseBtn = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  padding: '8px 14px', borderRadius: 6, border: 'none',
  fontFamily: FB, fontSize: 12, fontWeight: 700, letterSpacing: 1.2,
  cursor: 'pointer', transition: 'all 0.15s', textDecoration: 'none',
};

// Glowing dot identical to the real coach app's OnlineDot — pulses green
// when a trainee is currently signed into their portal. Demo shows it on
// the one trainee whose `online: true` flag is set in the mock data.
function OnlineDot() {
  return (
    <span style={{
      display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
      background: C.gn, boxShadow: `0 0 6px ${C.gn}`, flexShrink: 0,
    }} />
  );
}

function Badge({ color = C.tm, children }) {
  return (
    <span style={{
      fontFamily: FN, fontSize: 9, letterSpacing: 1.2, fontWeight: 700,
      color, background: color + '20', border: `1px solid ${color}40`,
      borderRadius: 4, padding: '2px 6px', whiteSpace: 'nowrap',
    }}>{children}</span>
  );
}

function StatCard({ label, value, sub, accent = C.ac }) {
  return (
    <div style={{
      background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 12,
      padding: '16px 18px', flex: '1 1 200px', minWidth: 180,
    }}>
      <div style={{
        fontFamily: FN, fontSize: 10, color: C.tm, letterSpacing: 1.5, fontWeight: 700,
        textTransform: 'uppercase', marginBottom: 8,
      }}>{label}</div>
      <div style={{
        fontFamily: FB, fontSize: 28, fontWeight: 700, color: accent, letterSpacing: -0.4,
        marginBottom: 2,
      }}>{value}</div>
      {sub && (
        <div style={{ fontFamily: FN, fontSize: 11, color: C.td, letterSpacing: 0.5 }}>{sub}</div>
      )}
    </div>
  );
}

// ─── Tab: Dashboard ───────────────────────────────────────────────────────
function DemoDashboard({ onJumpToTrainee }) {
  const dormant = MOCK_TRAINEES.filter(t => t.dormantDays != null);
  const expiring = MOCK_TRAINEES.filter(t => t.sessionsLeft > 0 && t.sessionsLeft <= 2);
  const onlineNow = MOCK_TRAINEES.filter(t => t.online);
  const overdue = MOCK_TRAINEES.filter(t => t.payment === 'OVERDUE');
  return (
    <section>
      <SectionHeader tag="DASHBOARD" title="The morning view" body="Stat cards on top, action queues below. Everything that needs your attention surfaces here — overdue payments, dormant clients, pending reviews — without you opening 5 tabs." />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 24 }}>
        <StatCard label="ACTIVE CLIENTS" value="3 / 4" sub="1 INACTIVE" />
        <StatCard label="LOW SESSIONS" value="1" sub="≤ 2 LEFT" accent={C.or} />
        <StatCard label="ESTIMATED MONTHLY" value="₪2,800" />
        <StatCard label="COLLECTED THIS MONTH" value="₪1,800" sub="64% OF EXP." accent={C.gn} />
      </div>

      <div style={{
        display: 'grid', gap: 14,
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))',
      }}>
        {/* Overdue */}
        <Panel
          title={<span><span style={{ color: C.rd }}>💰</span> OVERDUE PAYMENT ({overdue.length})</span>}
          tint={C.rd}
        >
          {overdue.map((t, i) => (
            <Row key={t.id} onClick={() => onJumpToTrainee(t.id, 'dashboard')}>
              <span style={{ fontWeight: 600, color: C.tx, flex: 1 }}>{t.name}</span>
              <span style={{ fontFamily: FN, fontSize: 11, color: C.rd, fontWeight: 700, letterSpacing: 1 }}>
                {i === 0 ? 'NEVER PAID' : `${(i+1)*32}D OVERDUE`}
              </span>
            </Row>
          ))}
        </Panel>

        {/* Dormant */}
        <Panel
          title={<span><span style={{ color: C.tm }}>💤</span> DORMANT ({dormant.length})</span>}
          tint={C.tm}
        >
          {dormant.map(t => (
            <Row key={t.id} onClick={() => onJumpToTrainee(t.id, 'dashboard')}>
              <span style={{ fontWeight: 600, color: C.tx, flex: 1 }}>{t.name}</span>
              <span style={{ fontFamily: FN, fontSize: 11, color: C.tm, fontWeight: 700, letterSpacing: 1 }}>
                {t.dormantDays}D
              </span>
              <FakeWaButton />
            </Row>
          ))}
        </Panel>

        {/* Expiring sessions — clients with sessionsRemaining 1-2.
            Surfaces the conversion lever: "this client is one workout away
            from churn — sell them the next package now." Same filter shape
            as the real DashboardView.expiring computation. */}
        {expiring.length > 0 && (
          <Panel
            title={<span><span style={{ color: C.or }}>⏳</span> EXPIRING SESSIONS ({expiring.length})</span>}
            tint={C.or}
          >
            {expiring.map(t => (
              <Row key={t.id} onClick={() => onJumpToTrainee(t.id, 'dashboard')}>
                <span style={{ fontWeight: 600, color: C.tx, flex: 1 }}>{t.name}</span>
                <span style={{ fontFamily: FN, fontSize: 11, color: C.or, fontWeight: 700, letterSpacing: 1 }}>
                  {t.sessionsLeft} LEFT
                </span>
              </Row>
            ))}
          </Panel>
        )}

        {/* Inbound leads — same shape as the real coach Dashboard's
            "📩 New Leads" panel, populated from expo-il's LeadCapture form
            via the leads Supabase table. */}
        <Panel
          title={<span><span style={{ color: C.ac }}>📩</span> NEW LEADS (3)</span>}
          tint={C.ac}
        >
          {[
            { email: 'avi.shahar@example.co.il',  source: 'expo-il',  context: 'hero',         when: '32 min ago' },
            { email: 'maor.k@example.co.il',      source: 'expo-il',  context: 'exit-intent',  when: '4 hr ago' },
            { email: 'tomer.ben@example.co.il',   source: 'expo-il',  context: 'quiz-finish',  when: 'Yesterday' },
          ].map((l, i) => (
            <Row key={i}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, color: C.tx, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.email}</div>
                <div style={{ fontFamily: FN, fontSize: 10, color: C.tm, letterSpacing: 1 }}>{l.source.toUpperCase()} · {l.context.toUpperCase()}</div>
              </div>
              <span style={{ fontFamily: FN, fontSize: 10, color: C.td, letterSpacing: 1 }}>{l.when}</span>
            </Row>
          ))}
        </Panel>

        {/* Online now — clients currently signed into their portal.
            Real DashboardView surfaces them with a green dot; same shape
            here. Conversion lever: one-tap WhatsApp them while they're
            actively using the app. */}
        {onlineNow.length > 0 && (
          <Panel
            title={<span><span style={{ color: C.gn }}>🟢</span> ONLINE NOW ({onlineNow.length})</span>}
            tint={C.gn}
          >
            {onlineNow.map(t => (
              <Row key={t.id} onClick={() => onJumpToTrainee(t.id, 'dashboard')}>
                <span style={{ fontWeight: 600, color: C.tx, flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {t.name}<OnlineDot />
                </span>
                <span style={{ fontFamily: FN, fontSize: 10, color: C.td, letterSpacing: 1 }}>IN PORTAL</span>
                <FakeWaButton />
              </Row>
            ))}
          </Panel>
        )}
      </div>
    </section>
  );
}

function Panel({ title, tint, children }) {
  return (
    <div style={{
      background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 12,
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '12px 16px', borderBottom: `1px solid ${C.bd}`,
        background: tint + '10',
        fontFamily: FN, color: tint, fontSize: 11, letterSpacing: 1.5, fontWeight: 700,
      }}>{title}</div>
      <div>{children}</div>
    </div>
  );
}

function Row({ onClick, children }) {
  return (
    <div onClick={onClick} style={{
      padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8,
      borderBottom: `1px solid ${C.bd}`, cursor: onClick ? 'pointer' : 'default',
      fontSize: 13,
    }}>{children}</div>
  );
}

function FakeWaButton() {
  return (
    <button onClick={e => { e.stopPropagation(); }} title="Send WhatsApp check-in" style={{
      background: '#25d36620', border: `1px solid #25d36655`, color: '#25d366',
      borderRadius: 6, padding: '4px 6px', cursor: 'pointer',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="#25d366" aria-hidden="true">
        <path d="M19.05 4.91A9.82 9.82 0 0 0 12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.21h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.91-7.01zM12.04 20.15h-.01a8.23 8.23 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.18 8.18 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.25-8.24 2.2 0 4.27.86 5.83 2.42a8.19 8.19 0 0 1 2.41 5.83c0 4.54-3.7 8.23-8.24 8.23z"/>
      </svg>
    </button>
  );
}

// ─── Tab: Trainees ────────────────────────────────────────────────────────
function DemoTrainees({ selected, onSelect, onClear, returnTab }) {
  const [search, setSearch] = useState('');
  if (selected) {
    const t = MOCK_TRAINEES.find(x => x.id === selected);
    if (!t) return null;
    return <DemoTraineeDetail trainee={t} onBack={onClear} backLabel={returnTab && returnTab !== 'trainees' ? `← BACK TO ${returnTab.toUpperCase()}` : '← BACK TO TRAINEES'} />;
  }
  const q = search.trim().toLowerCase();
  const filtered = MOCK_TRAINEES.filter(t => {
    if (!q) return true;
    const haystack = `${t.name || ''} ${t.email || ''} ${t.format || ''}`.toLowerCase();
    return haystack.includes(q);
  });
  return (
    <section>
      <SectionHeader tag="TRAINEES" title="Your roster" body="Card per client. Phone, plan count, sessions left, dormant flag, status — all visible at a glance. Couples render as one card with both members." />
      <div style={{
        display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14,
      }}>
        <input
          type="search" value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, email, format…"
          style={{
            background: C.sf, border: `1px solid ${C.bd2}`, borderRadius: 8,
            padding: '8px 12px', color: C.tx, fontFamily: FB, fontSize: 13,
            outline: 'none', minWidth: 200, flex: '1 1 200px', maxWidth: 320,
          }}
        />
        <button title="Demo only" style={{
          ...baseBtn, background: 'transparent', color: C.tm,
          border: `1px solid ${C.bd}`, padding: '8px 14px', fontSize: 11,
        }}>📦 ARCHIVE (0)</button>
        <button title="Demo only" style={{
          ...baseBtn, background: C.ac, color: '#000',
          padding: '8px 14px', fontSize: 11,
        }}>+ ADD TRAINEE ▾</button>
        <span style={{
          fontFamily: FN, fontSize: 10, color: C.td, letterSpacing: 1.5,
        }}>{filtered.length} / {MOCK_TRAINEES.length}</span>
      </div>
      {filtered.length === 0 ? (
        <div style={{
          background: C.sf, border: `1px dashed ${C.bd2}`, borderRadius: 12,
          padding: 40, textAlign: 'center',
        }}>
          <div style={{ fontFamily: FN, fontSize: 11, color: C.td, letterSpacing: 2, fontWeight: 700, marginBottom: 8 }}>NO MATCHES</div>
          <div style={{ fontFamily: FB, fontSize: 13, color: C.tm }}>No trainee matches "<span style={{ color: C.tx, fontWeight: 700 }}>{search}</span>". Clear the search to see the full roster.</div>
        </div>
      ) : (
        <div style={{
          display: 'grid', gap: 12,
          gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))',
        }}>
          {filtered.map(t => (
            <TraineeCard key={t.id} t={t} onClick={() => onSelect(t.id)} />
          ))}
        </div>
      )}
    </section>
  );
}

function TraineeCard({ t, onClick }) {
  // Couples render with two member columns separated by a vertical divider —
  // matches the real coach-app TraineeCard layout. Each member gets their
  // own name, "first name" derived from the combined "X ו/and Y Surname"
  // name, plus their own WhatsApp button.
  if (t.isCouple) return <CoupleCard t={t} onClick={onClick} />;
  return (
    <div onClick={onClick} style={{
      background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 12,
      padding: 16, cursor: 'pointer',
      transition: 'border-color 0.15s, transform 0.15s, box-shadow 0.15s',
    }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = C.ac; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = `0 8px 24px -8px rgba(57,189,255,0.20)`; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = C.bd; e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: FB, fontWeight: 700, fontSize: 15, color: C.tx, display: 'flex', alignItems: 'center', gap: 6 }}>
            {t.name}{t.online && <OnlineDot />}
          </div>
          <div style={{ fontSize: 12, color: C.tm, marginTop: 2 }}>{t.email}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          <Badge color={t.dormantDays != null ? C.tm : C.gn}>{t.status}</Badge>
          {t.payment === 'OVERDUE' && <Badge color={C.rd}>OVERDUE</Badge>}
          <FakeWaButton />
        </div>
      </div>
      <div style={{
        fontFamily: FN, fontSize: 11, color: C.tm, letterSpacing: 1, fontWeight: 600,
        textTransform: 'uppercase', marginTop: 14,
      }}>{t.format}</div>
      <div style={{ display: 'flex', gap: 10, marginTop: 6, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: FN, fontSize: 11, color: t.sessionsLeft <= 2 ? C.rd : C.gn, fontWeight: 700 }}>
          {t.sessionsLeft} SESSIONS LEFT
        </span>
        <span style={{ fontFamily: FN, fontSize: 11, color: C.ac, fontWeight: 700 }}>
          {t.programs} PROGRAMS
        </span>
        {t.dormantDays != null && (
          <span style={{ fontFamily: FN, fontSize: 11, color: C.tm, fontWeight: 700 }}>
            DORMANT · {t.dormantDays}D
          </span>
        )}
      </div>
    </div>
  );
}

// 8-week bodyweight sparkline — mocked relative-to-baseline so the curve is
// proportionate to the trainee's actual weight. Real app pulls from bw_logs.
function BWSparkline({ weight }) {
  // Generate 8 deterministic points around the baseline weight: small wobble
  // ±1.5kg with a gentle downward trend over the 8 weeks. Deterministic so
  // re-renders don't reshuffle the chart.
  const seed = Math.floor(weight);
  const W = 8;
  const points = Array.from({ length: W }, (_, i) => {
    const trend = -i * 0.18; // gentle cut over 8w
    const wobble = Math.sin(seed + i * 1.7) * 1.2;
    return weight + trend + wobble;
  });
  const min = Math.min(...points) - 0.5;
  const max = Math.max(...points) + 0.5;
  const span = max - min || 1;
  const w = 320, h = 80, pad = 8;
  const xStep = (w - pad * 2) / (W - 1);
  const polyline = points.map((v, i) => {
    const x = pad + i * xStep;
    const y = h - pad - ((v - min) / span) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const last = points[points.length - 1];
  const lastX = pad + (W - 1) * xStep;
  const lastY = h - pad - ((last - min) / span) * (h - pad * 2);
  const delta = (last - points[0]).toFixed(1);
  return (
    <div style={{ padding: 14 }}>
      <div style={{
        display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6,
      }}>
        <span style={{ fontFamily: FB, fontSize: 22, fontWeight: 700, color: C.tx, letterSpacing: -0.3 }}>
          {last.toFixed(1)}<span style={{ fontSize: 13, color: C.tm, marginLeft: 2 }}>kg</span>
        </span>
        <span style={{
          fontFamily: FN, fontSize: 11, color: parseFloat(delta) <= 0 ? C.gn : C.or, letterSpacing: 1, fontWeight: 700,
        }}>{parseFloat(delta) > 0 ? '+' : ''}{delta} kg / 8W</span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 80, display: 'block' }} aria-label="Bodyweight 8-week sparkline">
        <polyline fill="none" stroke={C.ac} strokeWidth="2" points={polyline} strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={lastX} cy={lastY} r="3.5" fill={C.ac} />
      </svg>
    </div>
  );
}

function CoupleCard({ t, onClick }) {
  // Split "יעל ועידן כהן" → ["יעל", "עידן", surname "כהן"]. Falls back to a
  // single column if the name doesn't parse — better to show one row than
  // crash on an unfamiliar name shape.
  const parseCouple = (full) => {
    const m = (full || '').match(/^(.+?)\s+ו(.+?)\s+(\S+)$/);
    if (!m) return null;
    return { a: m[1], b: m[2], surname: m[3] };
  };
  const parsed = parseCouple(t.name);
  return (
    <div onClick={onClick} style={{
      background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 12,
      padding: 16, cursor: 'pointer',
      transition: 'border-color 0.15s, transform 0.15s, box-shadow 0.15s',
    }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = C.ac; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = `0 8px 24px -8px rgba(57,189,255,0.20)`; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = C.bd; e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ fontFamily: FB, fontWeight: 700, fontSize: 14, color: C.tx, flex: 1 }}>{t.name}</div>
        <Badge color={t.dormantDays != null ? C.tm : C.gn}>{t.status}</Badge>
      </div>
      {parsed && (
        <div style={{ display: 'flex', marginTop: 12 }}>
          {[parsed.a, parsed.b].map((member, mi) => (
            <React.Fragment key={mi}>
              {mi === 1 && <div style={{ width: 1, background: C.bd, margin: '0 12px', alignSelf: 'stretch' }} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ fontFamily: FB, fontWeight: 600, fontSize: 13, color: C.tx, flex: 1, minWidth: 0 }}>
                    {member} {parsed.surname}
                  </div>
                  <FakeWaButton />
                </div>
                <div style={{ fontSize: 11, color: C.tm, marginTop: 2 }}>
                  {mi === 0 ? 'yael.cohen@example.co.il' : 'idan.cohen@example.co.il'}
                </div>
                <div style={{ fontFamily: FN, fontSize: 10, color: C.ac, letterSpacing: 1, fontWeight: 700, marginTop: 6 }}>
                  {t.programs} PROGRAMS
                </div>
              </div>
            </React.Fragment>
          ))}
        </div>
      )}
      <div style={{
        fontFamily: FN, fontSize: 11, color: C.tm, letterSpacing: 1, fontWeight: 600,
        textTransform: 'uppercase', marginTop: 14,
      }}>{t.format}</div>
      <div style={{ display: 'flex', gap: 10, marginTop: 6, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: FN, fontSize: 11, color: t.sessionsLeft <= 2 ? C.rd : C.gn, fontWeight: 700 }}>
          {t.sessionsLeft} SESSIONS LEFT
        </span>
      </div>
    </div>
  );
}

function DemoTraineeDetail({ trainee, onBack, backLabel = '← BACK TO TRAINEES' }) {
  // Couple detail: split each member into their own card column instead of
  // jamming both names into a single profile. Real app shows it this way.
  const isCouple = !!trainee.isCouple;
  const coupleSplit = (() => {
    if (!isCouple) return null;
    const m = (trainee.name || '').match(/^(.+?)\s+ו(.+?)\s+(\S+)$/);
    if (!m) return null;
    return [
      { first: m[1], surname: m[3], email: 'yael.cohen@example.co.il',  goals: 'First chin-up by August' },
      { first: m[2], surname: m[3], email: 'idan.cohen@example.co.il',  goals: 'Body comp + bench plateau break' },
    ];
  })();
  return (
    <section>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 18 }}>
        <button onClick={onBack} style={{
          ...baseBtn, background: 'transparent', color: C.tm,
          border: `1px solid ${C.bd}`,
        }}>{backLabel}</button>
        <div style={{ flex: 1 }} />
        {/* Action affordances on the trainee detail. Same set of operations
            as the real coach app's TraineeDetail (Assign Plan / Add Payment /
            Edit / Archive). Demo-only — clicks are no-ops, button.disabled
            tooltips them as "demo-only" so the visitor knows. */}
        <button title="Demo only" style={{
          ...baseBtn, background: C.ac, color: '#000',
          padding: '8px 14px', fontSize: 11,
        }}>+ ASSIGN PLAN</button>
        <button title="Demo only" style={{
          ...baseBtn, background: 'transparent', color: C.tx,
          border: `1px solid ${C.bd}`, padding: '8px 14px', fontSize: 11,
        }}>+ ADD PAYMENT</button>
        <button title="Demo only" style={{
          ...baseBtn, background: 'transparent', color: C.tm,
          border: `1px solid ${C.bd}`, padding: '8px 14px', fontSize: 11,
        }}>✏️ EDIT</button>
        <button title="Demo only" style={{
          ...baseBtn, background: 'transparent', color: C.rd,
          border: `1px solid ${C.rd}40`, padding: '8px 14px', fontSize: 11,
        }}>📦 ARCHIVE</button>
      </div>

      {isCouple && coupleSplit && (
        <>
          <h2 style={{ fontFamily: FB, fontSize: 24, fontWeight: 700, margin: '0 0 4px', letterSpacing: -0.3 }}>{trainee.name}</h2>
          <div style={{ fontFamily: FN, fontSize: 12, color: C.tm, letterSpacing: 1, marginBottom: 14 }}>{trainee.format} · {trainee.phone}</div>
          <div style={{
            display: 'grid', gap: 14, marginBottom: 14,
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))',
          }}>
            {coupleSplit.map((m, i) => (
              <div key={i} style={{
                background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 12,
                padding: 14,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <div style={{ fontFamily: FB, fontWeight: 700, fontSize: 16, color: C.tx }}>
                    {m.first} {m.surname}
                  </div>
                  <FakeWaButton />
                </div>
                <div style={{ fontFamily: FN, fontSize: 11, color: C.tm, letterSpacing: 1, marginBottom: 10 }}>
                  {m.email}
                </div>
                <div style={{ fontFamily: FN, fontSize: 10, color: C.ac, letterSpacing: 1.5, fontWeight: 700, marginBottom: 4 }}>GOAL</div>
                <div style={{ fontFamily: FB, fontSize: 13, color: C.tx, opacity: 0.85, lineHeight: 1.45 }}>{m.goals}</div>
              </div>
            ))}
          </div>
        </>
      )}

      <div style={{
        display: 'grid', gap: 14,
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))',
      }}>
        <div>
          {!isCouple && (
            <>
              <h2 style={{ fontFamily: FB, fontSize: 24, fontWeight: 700, margin: '0 0 4px', letterSpacing: -0.3 }}>{trainee.name}</h2>
              <div style={{ fontFamily: FN, fontSize: 12, color: C.tm, letterSpacing: 1, marginBottom: 14 }}>{trainee.email} · {trainee.phone}</div>
            </>
          )}

          <Panel title="PROGRAMS" tint={C.ac}>
            {trainee.plans.map((name, i) => (
              <Row key={i}>
                <span style={{ flex: 1, color: C.tx, fontWeight: 600 }}>{name}</span>
                <Badge color={i === 0 ? C.gn : C.td}>{i === 0 ? 'ACTIVE' : 'ARCHIVED'}</Badge>
              </Row>
            ))}
          </Panel>

          <div style={{ height: 14 }} />

          {(() => {
            const payments = [
              { date: '2026-04-01', amount: trainee.monthly || 800, method: 'Bank Transfer', status: 'Paid' },
              { date: '2026-03-01', amount: trainee.monthly || 800, method: 'Bank Transfer', status: 'Paid' },
              { date: '2026-02-01', amount: trainee.monthly || 800, method: 'Cash',          status: 'Paid' },
            ];
            const totalPaid = payments.reduce((a, p) => a + p.amount, 0);
            return (
              <Panel
                title={<span>PAYMENTS ({payments.length}) <span style={{ color: C.gn, marginLeft: 8 }}>₪{totalPaid.toLocaleString()} TOTAL</span></span>}
                tint={C.ac}
              >
                {payments.map((p, i) => (
                  <Row key={i}>
                    <span style={{ flex: 1, color: C.tx, fontWeight: 600 }}>₪{p.amount}</span>
                    <span style={{ fontFamily: FN, fontSize: 11, color: C.tm, letterSpacing: 1 }}>{p.method.toUpperCase()}</span>
                    <span style={{ fontFamily: FN, fontSize: 11, color: C.tm, letterSpacing: 1 }}>{p.date}</span>
                    <Badge color={C.gn}>{p.status.toUpperCase()}</Badge>
                  </Row>
                ))}
              </Panel>
            );
          })()}

          <div style={{ height: 14 }} />

          <Panel title="RECENT WORKOUTS" tint={C.ac}>
            {[
              { day: 'Day A · Push', date: trainee.lastWorkout || '2 days ago', vol: '4,820 kg' },
              { day: 'Day C · Legs', date: '5 days ago', vol: '6,210 kg' },
              { day: 'Day B · Pull', date: '1 week ago', vol: '4,180 kg' },
            ].map((w, i) => (
              <Row key={i}>
                <span style={{ flex: 1, color: C.tx, fontWeight: 600 }}>{w.day}</span>
                <span style={{ fontFamily: FN, fontSize: 11, color: C.tm, letterSpacing: 1 }}>{w.date}</span>
                <span style={{ fontFamily: FN, fontSize: 11, color: C.ac, fontWeight: 700, letterSpacing: 1 }}>{w.vol}</span>
              </Row>
            ))}
          </Panel>
        </div>

        <div>
          <Panel title="PROFILE" tint={C.tm}>
            {trainee.age && (
              <Row>
                <span style={{ flex: 1, color: C.tm, fontSize: 11, fontFamily: FN, letterSpacing: 1 }}>AGE / WEIGHT / HEIGHT</span>
                <span style={{ color: C.tx, fontWeight: 600 }}>{trainee.age}y · {trainee.weight}kg · {trainee.height}cm</span>
              </Row>
            )}
            <Row><span style={{ flex: 1, color: C.tm, fontSize: 11, fontFamily: FN, letterSpacing: 1 }}>FORMAT</span><span style={{ color: C.tx, fontWeight: 600 }}>{trainee.format}</span></Row>
            <Row><span style={{ flex: 1, color: C.tm, fontSize: 11, fontFamily: FN, letterSpacing: 1 }}>PACKAGE</span><span style={{ color: C.tx, fontWeight: 600 }}>{trainee.isCouple ? '12 Sessions' : '8 Sessions'}</span></Row>
            <Row><span style={{ flex: 1, color: C.tm, fontSize: 11, fontFamily: FN, letterSpacing: 1 }}>SESSIONS</span><span style={{ color: trainee.sessionsLeft <= 2 ? C.rd : C.tx, fontWeight: 700 }}>{trainee.sessionsLeft} LEFT</span></Row>
            <Row><span style={{ flex: 1, color: C.tm, fontSize: 11, fontFamily: FN, letterSpacing: 1 }}>MONTHLY</span><span style={{ color: C.tx, fontWeight: 600 }}>₪{trainee.monthly}</span></Row>
            <Row><span style={{ flex: 1, color: C.tm, fontSize: 11, fontFamily: FN, letterSpacing: 1 }}>PER SESSION</span><span style={{ color: C.tx, fontWeight: 600 }}>₪{Math.round(trainee.monthly / (trainee.isCouple ? 12 : 8))}</span></Row>
            <Row><span style={{ flex: 1, color: C.tm, fontSize: 11, fontFamily: FN, letterSpacing: 1 }}>LAST PAYMENT</span><span style={{ color: C.tx, fontWeight: 600 }}>2026-04-01</span></Row>
            <Row><span style={{ flex: 1, color: C.tm, fontSize: 11, fontFamily: FN, letterSpacing: 1 }}>SINCE</span><span style={{ color: C.tx, fontWeight: 600 }}>{trainee.startDate}</span></Row>
          </Panel>

          <div style={{ height: 14 }} />

          <Panel title="BODYWEIGHT · 8W" tint={C.tm}>
            <BWSparkline weight={trainee.weight || 70} />
          </Panel>

          <div style={{ height: 14 }} />

          <Panel title="GOALS / INJURIES" tint={C.tm}>
            <div style={{ padding: 14, fontSize: 13, lineHeight: 1.55, color: C.tx, opacity: 0.85 }}>
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontFamily: FN, fontSize: 10, color: C.tm, letterSpacing: 1.5, marginBottom: 4 }}>GOALS</div>
                {trainee.goals}
              </div>
              <div>
                <div style={{ fontFamily: FN, fontSize: 10, color: C.tm, letterSpacing: 1.5, marginBottom: 4 }}>INJURIES</div>
                {trainee.injuries}
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </section>
  );
}

// ─── Tab: Programs ────────────────────────────────────────────────────────
function DemoPrograms() {
  const [selectedDayIdx, setSelectedDayIdx] = useState(0);
  const [openExIdx, setOpenExIdx] = useState(null);
  const [activeBlock, setActiveBlock] = useState('Block #4');
  const day = MOCK_DAYS[selectedDayIdx];
  const BLOCK_HISTORY = [
    { name: 'Block #4', tag: 'Push/Pull Volume', when: 'Active · Week 2/4' },
    { name: 'Block #3', tag: 'Strength Base',    when: 'Apr · 4 weeks'    },
    { name: 'Block #2', tag: 'Reset',            when: 'Mar · 3 weeks'    },
    { name: 'Block #1', tag: 'Intake',           when: 'Feb · 2 weeks'    },
  ];
  return (
    <section>
      <SectionHeader tag="PROGRAMS" title="Block-based plan editor" body="Each block is a phase of training. Days are tabs. Each row = sets, reps, tempo, video link, superset letter. Bulk import from xlsx; bulk duplicate to clone a plan onto a new client." />

      <div className="cd-prog-grid" style={{
        display: 'grid', gap: 14, marginBottom: 14,
        gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 3fr)',
      }}>
        {/* Block-history sidebar */}
        <div style={{
          background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 12,
          padding: 14, alignSelf: 'start',
        }}>
          <div style={{
            fontFamily: FN, color: C.tm, fontSize: 10, letterSpacing: 1.5, fontWeight: 700,
            marginBottom: 10,
          }}>BLOCK HISTORY</div>
          {BLOCK_HISTORY.map((b, i) => {
            const on = b.name === activeBlock;
            return (
              <div key={i} onClick={() => setActiveBlock(b.name)} style={{
                padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                marginBottom: 4,
                background: on ? C.acD : 'transparent',
                border: `1px solid ${on ? C.ac : 'transparent'}`,
                transition: 'all 0.15s',
              }}>
                <div style={{
                  fontFamily: FB, fontSize: 13, fontWeight: 700,
                  color: on ? C.ac : C.tx,
                }}>{b.name}</div>
                <div style={{
                  fontFamily: FB, fontSize: 11.5, color: C.tx, opacity: 0.7,
                }}>{b.tag}</div>
                <div style={{
                  fontFamily: FN, fontSize: 10, color: C.tm, letterSpacing: 1, marginTop: 2,
                }}>{b.when}</div>
              </div>
            );
          })}
        </div>

      <div style={{
        background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 12,
        padding: 18,
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
          <h3 style={{ fontFamily: FB, fontSize: 18, fontWeight: 700, margin: 0, letterSpacing: -0.2 }}>Block #4 — Push/Pull Volume</h3>
          <span style={{ fontFamily: FN, fontSize: 11, color: C.tm, letterSpacing: 1 }}>נועה לוי · WEEK 2 OF 4</span>
          <span style={{ flex: 1 }} />
          <span style={{
            fontFamily: FN, fontSize: 10, color: C.gn, letterSpacing: 1.5, fontWeight: 700,
          }}>✓ SAVED · 12 MIN AGO</span>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          {MOCK_DAYS.map((d, i) => (
            <button key={i} onClick={() => setSelectedDayIdx(i)} style={{
              ...baseBtn,
              background: i === selectedDayIdx ? C.acD : 'transparent',
              color: i === selectedDayIdx ? C.ac : C.tm,
              border: `1px solid ${i === selectedDayIdx ? C.ac : C.bd}`,
              padding: '6px 14px', fontSize: 11,
            }}>{d.name}</button>
          ))}
        </div>

        {/* Day-summary chips: ex count, superset count, est duration. The
            duration estimate is rough — sum of (sets × ~45s working set + 90s
            rest), capped to whole minutes. Not load-bearing math, just gives
            the visitor a feel for the workout's shape. */}
        {(() => {
          const exCount = day.exercises.length;
          const ssCount = new Set(day.exercises.filter(e => e.superset).map(e => e.superset)).size;
          const estSec = day.exercises.reduce((acc, e) => {
            const sets = parseInt(e.sets) || 3;
            return acc + sets * (45 + 90);
          }, 0);
          const estMin = Math.round(estSec / 60);
          return (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
              <DayChip>{exCount} EXERCISES</DayChip>
              <DayChip>{ssCount} SUPERSET{ssCount === 1 ? '' : 'S'}</DayChip>
              <DayChip>~{estMin} MIN</DayChip>
              <DayChip muted>EST · BASED ON 90s REST</DayChip>
            </div>
          );
        })()}

        <div className="cd-prog-table-wrap"><table className="cd-prog-table" style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <thead>
            <tr>
              {['#', 'EXERCISE', 'SETS', 'REPS', 'TEMPO', 'SS', 'VID'].map((h, i) => (
                <th key={i} style={{
                  padding: '8px 10px', textAlign: 'left',
                  fontFamily: FN, fontSize: 10, color: C.tm, letterSpacing: 1.5, fontWeight: 700,
                  borderBottom: `1px solid ${C.bd}`,
                  width: i === 1 ? 'auto' : i === 0 ? 32 : 70,
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {day.exercises.map((e, i) => {
              const isOpen = openExIdx === i;
              return (
                <React.Fragment key={i}>
                  <tr onClick={() => setOpenExIdx(isOpen ? null : i)}
                    onMouseEnter={ev => { if (!isOpen) ev.currentTarget.style.background = C.sf2; }}
                    onMouseLeave={ev => { if (!isOpen) ev.currentTarget.style.background = 'transparent'; }}
                    style={{
                    cursor: 'pointer',
                    background: isOpen ? C.sf2 : 'transparent',
                    transition: 'background 0.15s',
                  }}>
                    <td style={tdStyle()}>{i + 1}{e.superset ? e.superset.toLowerCase() : ''}</td>
                    <td style={{ ...tdStyle(), color: C.tx, fontWeight: 600, borderLeft: e.superset ? `3px solid ${e.superset === 'A' ? C.ac : C.pu}` : 'none', paddingLeft: e.superset ? 7 : 10 }}>{e.name}</td>
                    <td style={tdStyle()}>{e.sets}</td>
                    <td style={tdStyle()}>{e.reps}</td>
                    <td style={tdStyle()}>{e.tempo || '—'}</td>
                    <td style={{ ...tdStyle(), color: e.superset === 'A' ? C.ac : e.superset === 'B' ? C.pu : C.tm, fontWeight: 700 }}>{e.superset || '—'}</td>
                    <td style={tdStyle()}><span style={{ color: C.ac }}>{isOpen ? '▼' : '▶'}</span></td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={7} style={{
                        padding: '10px 14px 14px',
                        background: C.sf2,
                        borderBottom: `1px solid ${C.bd}`,
                      }}>
                        {/* Wave log (per-week loads) when present — same
                            data shape as the real Plans editor's `ex.wk`
                            array. Shown as W1/W2/W3/W4 cells with the active
                            week highlighted. */}
                        {e.wk && (
                          <div style={{
                            display: 'flex', gap: 6, flexWrap: 'wrap',
                            marginBottom: 10, alignItems: 'center',
                          }}>
                            <span style={{
                              fontFamily: FN, fontSize: 10, color: C.tm, letterSpacing: 1.5, fontWeight: 700,
                              marginRight: 4,
                            }}>WAVE</span>
                            {e.wk.map((load, wi) => {
                              const isCurrent = wi === 1; // mock: week 2 active
                              return (
                                <span key={wi} style={{
                                  fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: 1,
                                  color: isCurrent ? C.ac : C.tx, opacity: isCurrent ? 1 : 0.65,
                                  background: isCurrent ? C.acD : C.sf,
                                  border: `1px solid ${isCurrent ? C.ac : C.bd}`,
                                  borderRadius: 4, padding: '3px 8px',
                                }}>W{wi + 1} · {load}</span>
                              );
                            })}
                          </div>
                        )}
                        <div style={{
                          display: 'flex', gap: 8, flexWrap: 'wrap',
                        }}>
                          <ExerciseAction icon="▶"  label="WATCH DEMO"   sub={`${e.name} · 0:24`} />
                          <ExerciseAction icon="🔄" label="SWAP EXERCISE" sub="Suggest similar movement pattern" />
                          <ExerciseAction icon="🗒"  label="ADD NOTE"     sub="Cue, regression, contraindication…" />
                          <ExerciseAction icon="📈" label="PROGRESSION"  sub={e.wk ? `Wave · ${e.wk.join(' / ')}` : `Last week: ${e.sets}×${e.reps} · keep ↗ next`} />
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table></div>
      </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button style={{ ...baseBtn, background: C.ac, color: '#000' }}>+ ADD EXERCISE</button>
        <button style={{ ...baseBtn, background: 'transparent', color: C.tx, border: `1px solid ${C.bd}` }}>📋 DUPLICATE BLOCK</button>
        <button style={{ ...baseBtn, background: 'transparent', color: C.tx, border: `1px solid ${C.bd}` }}>📥 IMPORT XLSX</button>
        <button style={{ ...baseBtn, background: 'transparent', color: C.tx, border: `1px solid ${C.bd}` }}>📤 EXPORT</button>
      </div>
    </section>
  );
}

const tdStyle = () => ({
  padding: '10px', fontFamily: FB, fontSize: 13, color: C.tm,
  borderBottom: `1px solid ${C.bd}`, verticalAlign: 'middle',
});

function DayChip({ children, muted }) {
  return (
    <span style={{
      fontFamily: FN, fontSize: 9, letterSpacing: 1.5, fontWeight: 700,
      color: muted ? C.td : C.ac,
      background: muted ? 'transparent' : C.acD,
      border: `1px solid ${muted ? C.bd : 'rgba(57,189,255,0.30)'}`,
      borderRadius: 4, padding: '3px 8px', whiteSpace: 'nowrap',
    }}>{children}</span>
  );
}

// Per-exercise inline action chip — Watch / Swap / Note / Progression.
// Non-functional in the demo; click bubbles back up to the row toggle so
// the visitor doesn't double-click and accidentally collapse the panel.
function ExerciseAction({ icon, label, sub }) {
  return (
    <button onClick={e => e.stopPropagation()} style={{
      background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 8,
      padding: '8px 12px', textAlign: 'left',
      cursor: 'pointer', display: 'flex', flexDirection: 'column',
      gap: 3, minWidth: 180, transition: 'border-color 0.15s',
    }}
      onMouseEnter={ev => ev.currentTarget.style.borderColor = C.ac}
      onMouseLeave={ev => ev.currentTarget.style.borderColor = C.bd}
    >
      <div style={{
        fontFamily: FN, fontSize: 11, color: C.ac, letterSpacing: 1.5, fontWeight: 700,
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <span>{icon}</span>{label}
      </div>
      <div style={{
        fontFamily: FB, fontSize: 11.5, color: C.tx, opacity: 0.72,
      }}>{sub}</div>
    </button>
  );
}

// ─── Tab: Exercises ───────────────────────────────────────────────────────
function DemoExercises() {
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');
  const cats = ['All', ...Array.from(new Set(MOCK_EXERCISES.map(e => e.category)))];
  const q = search.trim().toLowerCase();
  const filtered = MOCK_EXERCISES.filter(e => {
    if (filter !== 'All' && e.category !== filter) return false;
    if (q && !e.name.toLowerCase().includes(q) && !e.pattern.toLowerCase().includes(q)) return false;
    return true;
  });
  return (
    <section>
      <SectionHeader tag="EXERCISE LIBRARY" title="Your taxonomy, your rules" body="Every exercise is tagged with category + movement pattern. The rep counter routes joint channels off the pattern. Bring your existing library — bulk import is xlsx, sheets, or a Trainerize export." />

      <div style={{
        display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14,
      }}>
        <input
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search exercises…"
          style={{
            background: C.sf, border: `1px solid ${C.bd2}`, borderRadius: 8,
            padding: '8px 12px', color: C.tx, fontFamily: FB, fontSize: 13,
            outline: 'none', minWidth: 200, flex: '1 1 200px', maxWidth: 320,
          }}
        />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {cats.map(c => (
            <button key={c} onClick={() => setFilter(c)} style={{
              ...baseBtn,
              background: filter === c ? C.acD : 'transparent',
              color: filter === c ? C.ac : C.tm,
              border: `1px solid ${filter === c ? C.ac : C.bd}`,
              padding: '5px 12px', fontSize: 11,
            }}>{c.toUpperCase()}</button>
          ))}
        </div>
        <span style={{
          fontFamily: FN, fontSize: 10, color: C.td, letterSpacing: 1.5, marginLeft: 'auto',
        }}>{filtered.length} / {MOCK_EXERCISES.length}</span>
      </div>

      {filtered.length === 0 ? (
        <div style={{
          background: C.sf, border: `1px dashed ${C.bd2}`, borderRadius: 12,
          padding: 40, textAlign: 'center',
        }}>
          <div style={{ fontFamily: FN, fontSize: 11, color: C.td, letterSpacing: 2, fontWeight: 700, marginBottom: 8 }}>NO MATCHES</div>
          <div style={{ fontFamily: FB, fontSize: 13, color: C.tm }}>
            Nothing matches {q ? <>"<span style={{ color: C.tx, fontWeight: 700 }}>{search}</span>"</> : 'this filter'}. Clear search or pick another category.
          </div>
        </div>
      ) : (
        <div style={{
          display: 'grid', gap: 8,
          gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))',
        }}>
          {filtered.map((e, i) => (
            <div key={i} style={{
              background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 8,
              padding: '12px 14px',
            }}>
              <div style={{ fontFamily: FB, fontSize: 14, color: C.tx, fontWeight: 600, marginBottom: 4 }}>{e.name}</div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                <Badge color={C.ac}>{e.category}</Badge>
                <Badge color={C.tm}>{e.pattern}</Badge>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ─── Tab: Review ──────────────────────────────────────────────────────────
// The /demo iframe pulls ~6MB of MediaPipe wasm + lite model on first mount.
// CoachDemo always-mounts DemoReview (hidden via display:none on other tabs)
// so the iframe starts loading the moment the visitor lands on Dashboard. By
// the time they click Review, the wasm + model are usually already warm.
function DemoReview() {
  const [iframeLoaded, setIframeLoaded] = useState(false);
  return (
    <section>
      <SectionHeader tag="REVIEW TOOL" title="Where you actually coach" body="Client clip arrives, pose overlay + rep count auto-attach. You scrub, draw on the bar path, drop timestamped comments, and queue a reply video. The trainee sees all of it in their portal — no email, no DMs." />

      <div style={{
        display: 'grid', gap: 14,
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))',
      }}>
        {/* Live engine via /demo iframe */}
        <div>
          {/* Client identifier strip above the iframe so the visitor knows
              what they're looking at the moment the engine loads, instead
              of having to read the right-side sidebar first. */}
          <div style={{
            background: C.sf, border: `1px solid ${C.bd}`, borderTopLeftRadius: 12, borderTopRightRadius: 12,
            borderBottom: 'none', padding: '10px 14px',
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              background: C.acD, border: `1px solid ${C.ac}40`, color: C.ac,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: FB, fontWeight: 700, fontSize: 12, flex: '0 0 auto',
            }}>NL</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: FB, fontWeight: 700, fontSize: 13, color: C.tx }}>
                REVIEWING — נועה לוי
              </div>
              <div style={{ fontFamily: FN, fontSize: 10, color: C.tm, letterSpacing: 1 }}>
                BB BENCH · 60kg × 6 · TODAY 09:14
              </div>
            </div>
            <span style={{
              fontFamily: FN, fontSize: 9, color: C.gn, letterSpacing: 1.5, fontWeight: 700,
              background: C.gnD, border: `1px solid ${C.gn}40`,
              borderRadius: 4, padding: '3px 8px',
            }}>NEW · 12 MIN AGO</span>
          </div>
          <div style={{
            background: C.sf, border: `1px solid ${C.bd2}`,
            borderTop: 'none', borderBottomLeftRadius: 14, borderBottomRightRadius: 14,
            overflow: 'hidden', position: 'relative', minHeight: 660,
            boxShadow: `0 0 0 1px ${C.bd}, 0 30px 60px -20px rgba(0,0,0,0.6)`,
          }}>
            {!iframeLoaded && (
              <div style={{
                position: 'absolute', inset: 0,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                gap: 14,
                background: `linear-gradient(180deg, ${C.sf2} 0%, ${C.sf} 100%)`,
                color: C.tm, fontFamily: FN, fontSize: 11, letterSpacing: 1.8,
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: '50%',
                  border: `2px solid ${C.bd}`, borderTopColor: C.ac,
                  animation: 'cd-spin 0.9s linear infinite',
                }} />
                <div>LOADING REVIEW TOOL…</div>
                <div style={{ fontSize: 9, color: C.td, letterSpacing: 1.5 }}>POSE MODEL · ~6MB · FIRST LOAD ONLY</div>
                <style>{`@keyframes cd-spin { to { transform: rotate(360deg) } }`}</style>
              </div>
            )}
            <iframe src="/demo?embed=1" title="Live engine"
              onLoad={() => setIframeLoaded(true)}
              style={{
                display: 'block', width: '100%', height: 660, border: 'none',
                position: 'relative', zIndex: 1,
                opacity: iframeLoaded ? 1 : 0, transition: 'opacity 0.3s',
              }} />
          </div>
        </div>

        {/* Fake review sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Panel title="CLIENT" tint={C.ac}>
            <Row>
              <div style={{
                width: 32, height: 32, borderRadius: '50%',
                background: C.acD, border: `1px solid ${C.ac}40`, color: C.ac,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: FB, fontWeight: 700, fontSize: 13,
              }}>NL</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, color: C.tx }}>נועה לוי</div>
                <div style={{ fontFamily: FN, fontSize: 11, color: C.tm, letterSpacing: 1 }}>BB BENCH · 60kg × 6 · TODAY 09:14</div>
              </div>
            </Row>
          </Panel>

          <Panel title={`COMMENTS (${MOCK_REVIEW_COMMENTS.length})`} tint={C.ac}>
            {MOCK_REVIEW_COMMENTS.map((c, i) => (
              <div key={i} style={{
                padding: '12px 14px', borderBottom: `1px solid ${C.bd}`,
              }}>
                <div style={{
                  display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6,
                }}>
                  <span style={{
                    fontFamily: FN, fontSize: 11, color: C.ac, letterSpacing: 1, fontWeight: 700,
                    background: C.acD, padding: '2px 6px', borderRadius: 4,
                  }}>{c.time}</span>
                  {c.voice && (
                    <span style={{ fontFamily: FN, fontSize: 9, color: C.tm, letterSpacing: 1 }}>🎙️ VOICE</span>
                  )}
                </div>
                <div style={{ color: C.tx, opacity: 0.85, fontSize: 13, lineHeight: 1.45 }}>{c.body}</div>
              </div>
            ))}
            <div style={{ padding: 12 }}>
              <div style={{
                background: C.sf2, border: `1px dashed ${C.bd2}`, borderRadius: 8,
                padding: '10px 12px', color: C.tm, fontSize: 12,
              }}>+ Tap any frame in the player to drop a comment / draw on the form</div>
            </div>
          </Panel>

          <Panel title="REPLY VIDEO" tint={C.ac}>
            <div style={{ padding: 14 }}>
              <div style={{
                background: '#000', border: `1px solid ${C.bd}`, borderRadius: 8,
                aspectRatio: '16/9', display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: C.tm, fontFamily: FN, fontSize: 11, letterSpacing: 1.5, fontWeight: 700,
              }}>RECORD A 30s REPLY</div>
            </div>
          </Panel>
        </div>
      </div>
    </section>
  );
}

// ─── Layout ───────────────────────────────────────────────────────────────
function SectionHeader({ tag, title, body }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{
        fontFamily: FN, color: C.ac, fontSize: 11, letterSpacing: 3, fontWeight: 700,
        marginBottom: 8,
      }}>{tag}</div>
      <h1 style={{
        fontFamily: FB, fontSize: 'clamp(22px, 3.2vw, 28px)', fontWeight: 700,
        margin: '0 0 10px', letterSpacing: -0.3,
      }}>{title}</h1>
      <p style={{
        fontFamily: FB, color: C.tx, opacity: 0.85, fontSize: 14.5, lineHeight: 1.55,
        maxWidth: 720, margin: 0,
      }}>{body}</p>
    </div>
  );
}

const TABS = [
  { key: 'dashboard', label: 'DASHBOARD', count: null },
  { key: 'trainees',  label: 'TRAINEES',  count: MOCK_TRAINEES.length },
  { key: 'programs',  label: 'PROGRAMS',  count: 12 },
  { key: 'exercises', label: 'EXERCISES', count: MOCK_EXERCISES.length },
  { key: 'workouts',  label: 'WORKOUTS',  count: MOCK_WORKOUTS.length },
  { key: 'review',    label: 'REVIEW',    count: null },
];

// Recent workout logs across all clients — mirrors what a trainer sees in
// the real WorkoutsView, just with mock data. Volume + intensity per
// session so the visitor reads it as "real workout, real numbers".
const MOCK_WORKOUTS = [
  { who: 'נועה לוי',     day: 'Day A · Push',    when: 'Today 09:14',   vol: '4,820 kg', topSet: 'BB Bench · 60kg × 6', flagged: 'pending review' },
  { who: 'יעל כהן',      day: 'Day B · Pull',    when: 'Today 08:02',   vol: '4,180 kg', topSet: 'Pull-Up · BW × 8',     flagged: 'pending review' },
  { who: 'גל מזרחי',     day: 'Day C · Legs',    when: 'Yesterday',     vol: '6,210 kg', topSet: 'Back Squat · 100kg × 5' },
  { who: 'נועה לוי',     day: 'Day C · Legs',    when: '5 days ago',    vol: '6,010 kg', topSet: 'Back Squat · 95kg × 5' },
  { who: 'עידן כהן',     day: 'Day A · Push',    when: '6 days ago',    vol: '5,420 kg', topSet: 'BB Bench · 80kg × 5' },
  { who: 'יעל כהן',      day: 'Day A · Push',    when: '6 days ago',    vol: '3,180 kg', topSet: 'BB Bench · 35kg × 8' },
  { who: 'נועה לוי',     day: 'Day B · Pull',    when: '1 week ago',    vol: '4,180 kg', topSet: 'BB Row · 50kg × 8' },
];

function DemoWorkouts() {
  return (
    <section>
      <SectionHeader tag="WORKOUTS" title="Every set every client logged" body="When your client finishes a workout in their portal, it lands here — date, volume, top set, and any clip they sent for review. One tap into the row to scrub their video, log a session, or pull the data into a CSV." />

      <div style={{ background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 12, overflow: 'hidden' }}>
        {MOCK_WORKOUTS.map((w, i) => (
          <div key={i} style={{
            padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
            borderBottom: i < MOCK_WORKOUTS.length - 1 ? `1px solid ${C.bd}` : 'none',
            transition: 'background 0.15s', cursor: 'pointer',
          }}
            onMouseEnter={e => e.currentTarget.style.background = C.sf2}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <div style={{ flex: '1 1 200px', minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                <span style={{ fontFamily: FB, fontWeight: 700, fontSize: 14, color: C.tx }}>{w.who}</span>
                {w.flagged && <Badge color={C.ac}>🎬 {w.flagged.toUpperCase()}</Badge>}
              </div>
              <div style={{ fontFamily: FN, fontSize: 11, color: C.tm, letterSpacing: 1 }}>{w.day}</div>
            </div>
            <div style={{ flex: '1 1 200px', minWidth: 0, fontFamily: FB, fontSize: 13, color: C.tx, opacity: 0.85 }}>
              <span style={{ color: C.ac, fontFamily: FN, fontSize: 10, letterSpacing: 1.5, marginRight: 6 }}>TOP SET</span>{w.topSet}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flex: '0 0 auto', gap: 2 }}>
              <span style={{ fontFamily: FN, fontSize: 11, color: C.ac, letterSpacing: 1.5, fontWeight: 700 }}>{w.vol}</span>
              <span style={{ fontFamily: FN, fontSize: 10, color: C.td, letterSpacing: 1 }}>{w.when}</span>
            </div>
            <div style={{ display: 'flex', gap: 6, flex: '0 0 auto' }}>
              {w.flagged && (
                <button title="Demo only" onClick={e => e.stopPropagation()} style={{
                  ...baseBtn, background: 'transparent', color: C.ac,
                  border: `1px solid ${C.ac}40`, padding: '5px 10px', fontSize: 10,
                }}>🎬 OPEN</button>
              )}
              <button title="Demo only · decrement sessionsRemaining" onClick={e => e.stopPropagation()} style={{
                ...baseBtn, background: 'transparent', color: C.tm,
                border: `1px solid ${C.bd}`, padding: '5px 10px', fontSize: 10,
              }}>✓ MARK SESSION</button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function CoachDemo() {
  const [tab, setTab] = useState('dashboard');
  const [selectedTrainee, setSelectedTrainee] = useState(null);
  // Track where the trainee-detail view was reached from so the back button
  // returns to the source surface instead of always landing on the Trainees tab.
  const [returnTab, setReturnTab] = useState('trainees');
  const onJumpToTrainee = (id, sourceTab = 'trainees') => {
    setReturnTab(sourceTab);
    setSelectedTrainee(id);
    setTab('trainees');
  };
  const onClearTrainee = () => {
    setSelectedTrainee(null);
    if (returnTab !== 'trainees') {
      setTab(returnTab);
      setReturnTab('trainees');
    }
  };


  return (
    <div style={{
      background: C.bg, color: C.tx, minHeight: '100vh', fontFamily: FB,
      display: 'flex', flexDirection: 'column',
    }}>
      <style>{`
        a:focus-visible, button:focus-visible {
          outline: 2px solid ${C.ac}; outline-offset: 2px; border-radius: 4px;
        }
        /* Hide horizontal scrollbar on the header so the tab strip glides
           on phones without showing a chunky scrollbar track. */
        .cd-hdr::-webkit-scrollbar { display: none; }
        .cd-hdr { -ms-overflow-style: none; scrollbar-width: none; }
        /* Hide the COACH DEMO badge under 640px — the EXPO logo + tab labels
           already convey context, and the badge takes valuable phone width. */
        @media (max-width: 640px) {
          .cd-badge { display: none !important; }
          .cd-cta-waitlist { padding: 6px 10px !important; }
        }
        /* Programs table on phones — let it scroll horizontally instead of
           cramping every column. */
        @media (max-width: 540px) {
          .cd-prog-table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
          .cd-prog-table { min-width: 520px; }
        }
        /* Programs block-history sidebar collapses to a single row on phones
           so the editor still gets full width. */
        @media (max-width: 720px) {
          .cd-prog-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* Header */}
      <header style={{
        background: C.sf, borderBottom: `1px solid ${C.bd}`,
        position: 'sticky', top: 0, zIndex: 50,
      }}>
        <div className="cd-hdr" style={{
          maxWidth: 1280, margin: '0 auto', padding: '0 16px',
          display: 'flex', alignItems: 'center', height: 60, gap: 12, overflowX: 'auto',
        }}>
          <a href="/" style={{ display: 'flex', alignItems: 'center', flex: '0 0 auto', textDecoration: 'none' }}>
            {/* Wrapper-clip: the EXPO_LOGO_NAV PNG has ~40% chevron above
                the wordmark, so geometric-center positioning leaves the
                wordmark below the menu's centerline. The 22px-tall wrapper
                with overflow:hidden + image bottom-aligned shows only the
                wordmark portion, which then centers cleanly via the parent
                flex's alignItems:center. */}
            <div style={{
              height: 16, overflow: 'hidden',
              display: 'inline-flex', alignItems: 'flex-end',
            }}>
              {/* Image at height 23 means the wordmark portion (bottom ~70%
                  of a chevron-on-top PNG) renders at ~16px tall, matching
                  the surrounding nav text scale. The 16px wrapper clips the
                  chevron above. */}
              <img src={EXPO_LOGO_NAV} alt="EXPO" style={{ display: 'block', height: 23 }} />
            </div>
          </a>
          <span className="cd-badge" style={{
            fontFamily: FN, fontSize: 10, color: C.ac, letterSpacing: 2, fontWeight: 700,
            padding: '4px 8px', background: C.acD, borderRadius: 6,
            border: `1px solid rgba(57,189,255,0.30)`, whiteSpace: 'nowrap',
          }}>COACH DEMO</span>
          <nav role="tablist" aria-label="Coach demo tabs" style={{
            display: 'flex', gap: 2, flex: '1 1 auto', justifyContent: 'center',
            minWidth: 'max-content',
          }}>
            {TABS.map((t, i) => (
              <button key={t.key} role="tab" aria-selected={tab === t.key}
                tabIndex={tab === t.key ? 0 : -1}
                onClick={() => { setTab(t.key); setSelectedTrainee(null); }}
                onKeyDown={e => {
                  if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'Home' && e.key !== 'End') return;
                  e.preventDefault();
                  let nextIdx = i;
                  if (e.key === 'ArrowRight') nextIdx = (i + 1) % TABS.length;
                  else if (e.key === 'ArrowLeft') nextIdx = (i - 1 + TABS.length) % TABS.length;
                  else if (e.key === 'Home') nextIdx = 0;
                  else if (e.key === 'End') nextIdx = TABS.length - 1;
                  const nextKey = TABS[nextIdx].key;
                  setTab(nextKey); setSelectedTrainee(null);
                  // focus moves to the newly-active tab so screen-readers track
                  setTimeout(() => {
                    const el = document.querySelector(`[role="tab"][data-key="${nextKey}"]`);
                    if (el) el.focus();
                  }, 0);
                }}
                data-key={t.key}
                style={{
                  ...baseBtn,
                  background: tab === t.key ? C.acD : 'transparent',
                  color: tab === t.key ? C.ac : C.tm,
                  padding: '6px 12px', fontSize: 11, letterSpacing: 1.5,
                  whiteSpace: 'nowrap', gap: 4,
                }}>
                <span>{t.label}</span>
                {t.count != null && (
                  <span style={{ fontSize: 10, color: tab === t.key ? C.ac : C.td, fontFamily: FN }}>{t.count}</span>
                )}
              </button>
            ))}
          </nav>
          <a href="/coaches#waitlist" className="cd-cta-waitlist" style={{
            ...baseBtn, background: C.ac, color: '#000',
            padding: '6px 14px', fontSize: 11, flex: '0 0 auto',
          }}>JOIN WAITLIST →</a>
        </div>
      </header>

      {/* POV banner — same shape as the engine sandbox to keep UX coherent */}
      <div style={{
        borderBottom: `1px solid ${C.bd}`,
        background: `linear-gradient(180deg, ${C.sf} 0%, ${C.bg} 100%)`,
      }}>
        <div style={{
          maxWidth: 1280, margin: '0 auto', padding: '12px 16px',
          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontFamily: FN, fontSize: 10, color: C.ac, letterSpacing: 1.8, fontWeight: 700,
            background: C.acD, border: `1px solid rgba(57,189,255,0.30)`,
            borderRadius: 6, padding: '4px 9px', whiteSpace: 'nowrap',
          }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
            COACH VIEW
          </div>
          <div style={{
            fontFamily: FB, fontSize: 13, color: C.tx, opacity: 0.85, lineHeight: 1.45,
            flex: '1 1 auto', minWidth: 200,
          }}>
            <b style={{ opacity: 1 }}>Your</b> side of the platform. Click through the tabs above. Mock data — nothing here writes to your account.
          </div>
          <a href="/demo" style={{
            ...baseBtn,
            background: 'transparent', color: C.tm,
            border: `1px solid ${C.bd}`, padding: '5px 12px', fontSize: 10, letterSpacing: 1.5,
            flex: '0 0 auto',
          }}>SEE TRAINEE VIEW →</a>
        </div>
      </div>

      <main style={{ flex: 1, padding: '28px 16px 80px', maxWidth: 1280, margin: '0 auto', width: '100%' }}>
        {tab === 'dashboard' && <DemoDashboard onJumpToTrainee={onJumpToTrainee} />}
        {tab === 'trainees'  && <DemoTrainees selected={selectedTrainee} onSelect={setSelectedTrainee} onClear={onClearTrainee} returnTab={returnTab} />}
        {tab === 'programs'  && <DemoPrograms />}
        {tab === 'exercises' && <DemoExercises />}
        {tab === 'workouts'  && <DemoWorkouts />}
        {/* Review is ALWAYS mounted — display:none on other tabs — so the
            /demo iframe loads its wasm + pose model in the background while
            the visitor explores. By the time they click Review, the engine
            is usually warm. */}
        <div style={{ display: tab === 'review' ? 'block' : 'none' }}>
          <DemoReview />
        </div>

        {/* End CTA — every tab funnels back to the waitlist */}
        <div style={{
          marginTop: 48,
          background: `linear-gradient(135deg, ${C.sf2} 0%, ${C.sf} 100%)`,
          border: `1px solid rgba(57,189,255,0.30)`, borderRadius: 14,
          padding: '24px 20px', textAlign: 'center',
        }}>
          <div style={{
            fontFamily: FN, color: C.ac, fontSize: 11, letterSpacing: 3, fontWeight: 700,
            marginBottom: 8,
          }}>FOUNDING-COACH WAITLIST</div>
          <h3 style={{
            fontFamily: FB, fontSize: 'clamp(20px, 2.6vw, 24px)', fontWeight: 700,
            margin: '0 0 10px', letterSpacing: -0.2,
          }}>Run your roster on this stack. Locked-in pricing for the first wave.</h3>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
            <a href="/coaches#waitlist" style={{
              ...baseBtn, background: C.ac, color: '#000', padding: '11px 22px', fontSize: 12,
            }}>JOIN THE WAITLIST</a>
            <a href="/demo" style={{
              ...baseBtn, background: 'transparent', color: C.tx,
              border: `1px solid ${C.bd2}`, padding: '11px 22px', fontSize: 12,
            }}>NOW SEE THE TRAINEE VIEW →</a>
          </div>
        </div>
      </main>

      <footer style={{
        borderTop: `1px solid ${C.bd}`, padding: '18px 16px',
        maxWidth: 1280, margin: '0 auto', width: '100%',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap',
      }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          fontFamily: FN, fontSize: 10, color: C.td, letterSpacing: 1,
        }}>
          <EXPOMark height={11} style={{ opacity: 0.55 }} />
          <span>· COACH DEMO · MOCK DATA · NOTHING WRITES BACK</span>
        </span>
        <span style={{ fontFamily: FN, fontSize: 10, color: C.td, letterSpacing: 1 }}>
          <a href="/coaches" style={{ color: C.td, textDecoration: 'none' }}>BACK TO PITCH</a>
        </span>
      </footer>
    </div>
  );
}
