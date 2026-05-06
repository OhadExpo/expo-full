// UpcomingSessionsPanel — surfaces today/tomorrow/this-week sessions on
// the coach dashboard. Pulls /api/calendar/upcoming which parses Ohad's
// public iCal feed and filters to EXPO-tagged events. Matches each event
// to a trainee row by attendee email (most reliable) with a name-in-parens
// summary fallback (e.g. "EXPO חדר כושר (Maya Yaniv)").
//
// Empty states:
//   - configured=false  → "Set EXPO_GCAL_ICS_URL on Vercel" hint
//   - error             → red error banner with the message
//   - 0 events          → quiet "No upcoming sessions in the next 21 days"
//
// Click a row → onSelectTrainee(traineeId) when matched, otherwise no-op.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { C, FN, FB, FH } from './theme';

const RTL = /[֐-׿]/;

function matchTrainee(ev, trainees) {
  const list = trainees || [];
  const lc = (s) => String(s || '').toLowerCase();
  const emails = ev.attendeeEmails || [];

  // Pass 1 — top-level attendee email match against trainee.email or any
  // couple-member email.
  for (const email of emails) {
    for (const t of list) {
      const tEmails = Array.isArray(t.email) ? t.email : (t.email ? [t.email] : []);
      if (tEmails.some(e => lc(e) === email)) return t;
      if (Array.isArray(t.members)) {
        for (const m of t.members) {
          const mEmails = Array.isArray(m.email) ? m.email : (m.email ? [m.email] : []);
          if (mEmails.some(e => lc(e) === email)) return t;
        }
      }
    }
  }
  // Pass 2 — name-in-parens fallback: "EXPO חדר כושר (Name Here)".
  const m = /\(([^)]+)\)/.exec(ev.summary || '');
  if (m) {
    const name = m[1].trim();
    const nameLc = lc(name);
    const t = list.find(t => lc(t.name) === nameLc);
    if (t) return t;
    const partial = list.find(t => lc(t.name).includes(nameLc) || nameLc.includes(lc(t.name)));
    if (partial) return partial;
  }
  return null;
}

function dayBucket(iso) {
  const d = new Date(iso);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayMs = 86400000;
  const dayDiff = Math.floor((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - startOfToday.getTime()) / dayMs);
  if (dayDiff <= 0) return 'TODAY';
  if (dayDiff === 1) return 'TOMORROW';
  if (dayDiff <= 7) return 'THIS WEEK';
  return 'LATER';
}

function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function fmtDayLabel(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

function summaryDisplayName(ev) {
  // Strip "EXPO חדר כושר (" prefix and trailing ")" to get just the name.
  const m = /\(([^)]+)\)\s*$/.exec(ev.summary || '');
  if (m) return m[1].trim();
  return ev.summary || '(unnamed)';
}

export default function UpcomingSessionsPanel({ trainees, onSelectTrainee }) {
  const [data, setData] = useState({ events: [], loading: true, configured: true, error: null });

  const reload = useCallback(async () => {
    try {
      const r = await fetch('/api/calendar/upcoming');
      const j = await r.json();
      setData({
        events: j.events || [],
        loading: false,
        configured: j.configured !== false,
        error: j.error || null,
      });
    } catch (e) {
      setData({ events: [], loading: false, configured: true, error: String(e?.message || e) });
    }
  }, []);

  useEffect(() => {
    reload();
    // 5-minute polling — comfortably faster than how quickly bookings come
    // in, slow enough not to hammer Google's iCal CDN.
    const id = setInterval(reload, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [reload]);

  const enriched = useMemo(() => (data.events || []).map(ev => {
    const trainee = matchTrainee(ev, trainees);
    return { ...ev, trainee, _bucket: ev.start?.iso ? dayBucket(ev.start.iso) : 'LATER' };
  }), [data.events, trainees]);

  const buckets = useMemo(() => {
    const out = { TODAY: [], TOMORROW: [], 'THIS WEEK': [], LATER: [] };
    for (const ev of enriched) (out[ev._bucket] || out.LATER).push(ev);
    return out;
  }, [enriched]);

  // Loading state — silent placeholder so the dashboard doesn't pop in.
  if (data.loading) {
    return (
      <div style={{ marginBottom: 16, padding: '14px 18px', border: `0.25px solid ${C.ac}4D` }}>
        <div style={{ fontFamily: FN, fontSize: 9, color: C.tm, letterSpacing: '0.18em', fontWeight: 700, textTransform: 'uppercase' }}>SESSIONS</div>
        <div style={{ fontFamily: FB, fontSize: 12, color: C.td, marginTop: 8 }}>Loading…</div>
      </div>
    );
  }

  // Not configured — show a polite setup nudge once. Hidden on production
  // once Ohad has set the env var.
  if (!data.configured) {
    return (
      <div style={{ marginBottom: 16, padding: '14px 18px', border: `0.25px dashed ${C.or}80` }}>
        <div style={{ fontFamily: FN, fontSize: 9, color: C.or, letterSpacing: '0.18em', fontWeight: 700, textTransform: 'uppercase' }}>SESSIONS · SETUP REQUIRED</div>
        <div style={{ fontFamily: FB, fontSize: 12, color: C.tm, marginTop: 6, lineHeight: 1.5 }}>
          Set <code style={{ background: C.sf2, padding: '1px 5px', color: C.ac, fontFamily: FN }}>EXPO_GCAL_ICS_URL</code> on Vercel to your calendar's <em>Secret address in iCal format</em> (Calendar settings → Integrate calendar) and reload.
        </div>
      </div>
    );
  }

  if (data.error) {
    return (
      <div style={{ marginBottom: 16, padding: '14px 18px', border: `0.25px solid ${C.rd}80` }}>
        <div style={{ fontFamily: FN, fontSize: 9, color: C.rd, letterSpacing: '0.18em', fontWeight: 700, textTransform: 'uppercase' }}>SESSIONS · ERROR</div>
        <div style={{ fontFamily: FB, fontSize: 12, color: C.tm, marginTop: 6 }}>{data.error}</div>
      </div>
    );
  }

  if (enriched.length === 0) {
    return (
      <div style={{ marginBottom: 16, padding: '14px 18px', border: `0.25px solid ${C.ac}4D` }}>
        <div style={{ fontFamily: FN, fontSize: 9, color: C.tm, letterSpacing: '0.18em', fontWeight: 700, textTransform: 'uppercase' }}>SESSIONS</div>
        <div style={{ fontFamily: FB, fontSize: 12, color: C.td, marginTop: 6 }}>No upcoming sessions in the next 21 days.</div>
      </div>
    );
  }

  const renderRow = (ev) => {
    const name = ev.trainee?.name || summaryDisplayName(ev);
    const isHebrew = RTL.test(name);
    const onClick = ev.trainee && onSelectTrainee ? () => onSelectTrainee(ev.trainee.id) : null;
    return (
      <div key={ev.uid || `${ev.start?.iso}-${name}`}
        onClick={onClick}
        style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
          borderTop: `0.25px solid ${C.ac}26`, cursor: onClick ? 'pointer' : 'default',
        }}>
        <div style={{ fontFamily: FN, fontSize: 13, color: C.ac, fontWeight: 700, minWidth: 50 }}>{fmtTime(ev.start?.iso)}</div>
        <div style={{ fontFamily: FN, fontSize: 11, color: C.tm, fontWeight: 600, minWidth: 70 }}>{fmtDayLabel(ev.start?.iso)}</div>
        <div style={{
          flex: 1, minWidth: 0, fontFamily: isHebrew ? FH : FB, fontSize: 14, color: C.tx,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          direction: isHebrew ? 'rtl' : 'ltr',
        }}>
          {name}
          {!ev.trainee && <span style={{ color: C.td, fontFamily: FN, fontSize: 10, marginLeft: 6 }}>· unmatched</span>}
        </div>
      </div>
    );
  };

  return (
    <div style={{ marginBottom: 16, border: `0.25px solid ${C.ac}4D` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px' }}>
        <div style={{ fontFamily: FN, fontSize: 9, color: C.tm, letterSpacing: '0.18em', fontWeight: 700, textTransform: 'uppercase' }}>
          SESSIONS · {enriched.length} upcoming
        </div>
        <button onClick={reload}
          title="Refresh from Google Calendar"
          style={{ background: 'transparent', border: `0.25px solid ${C.ac}4D`, color: C.tm, padding: '3px 8px', fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', cursor: 'pointer', borderRadius: 0, textTransform: 'uppercase' }}>
          ↻ Refresh
        </button>
      </div>
      {['TODAY', 'TOMORROW', 'THIS WEEK', 'LATER'].map(b => (
        buckets[b] && buckets[b].length > 0 && (
          <div key={b}>
            <div style={{ fontFamily: FN, fontSize: 9, color: C.ac, letterSpacing: '0.18em', fontWeight: 700, textTransform: 'uppercase', padding: '6px 10px', background: `${C.ac}10` }}>
              {b}
            </div>
            {buckets[b].map(renderRow)}
          </div>
        )
      ))}
    </div>
  );
}
