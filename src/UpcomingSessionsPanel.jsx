// UpcomingSessionsPanel — surfaces today/tomorrow/this-week sessions on
// the coach dashboard. Reads directly from `expo_calendar_events` (RLS:
// trainer SELECT only) populated by Claude via the Google Calendar MCP.
//
// No env vars, no Vercel function, no OAuth. The trade-off is that the
// data is only as fresh as the last sync — Ohad asks Claude to "resync
// calendar" whenever a new booking should be reflected. The "last synced"
// banner makes the staleness visible.
//
// Trainee match priority at render-time (NOT pre-resolved at sync, so
// adds/edits to the trainees table take effect without a resync):
//   1. attendee_emails ∩ trainee.email (top-level + couple-member emails)
//   2. cached trainee_id column (set during sync if the email matched then)
//   3. name-in-parens fallback ("EXPO חדר כושר (Maya Yaniv)") against
//      trainees.name (exact + substring)
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { C, FN, FB, FH } from './theme';
import { supabase } from './supabase';

const RTL = /[֐-׿]/;

function matchTrainee(ev, trainees) {
  const list = trainees || [];
  const lc = (s) => String(s || '').toLowerCase();

  // Pass 1 — attendee email match against trainee.email (top-level + couple
  // members, scalar or array forms).
  for (const email of ev.attendee_emails || []) {
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
  // Pass 2 — cached trainee_id from the sync (if the resolver knew at sync
  // time). Useful for events whose attendee email was already removed from
  // the trainees table by the time of render.
  if (ev.trainee_id) {
    const t = list.find(t => t.id === ev.trainee_id);
    if (t) return t;
  }
  // Pass 3 — name-in-parens fallback ("EXPO חדר כושר (Name Here)").
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
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}
function fmtDayLabel(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}
function ago(iso) {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor(ms / 3600000);
  const mins = Math.floor(ms / 60000);
  if (days >= 1) return `${days}d`;
  if (hours >= 1) return `${hours}h`;
  if (mins >= 1) return `${mins}m`;
  return 'just now';
}

function summaryDisplayName(ev) {
  const m = /\(([^)]+)\)\s*$/.exec(ev.summary || '');
  if (m) return m[1].trim();
  return ev.summary || '(unnamed)';
}

// Supabase URL — used to build the edge function URL for an instant
// post-save sync trigger. Mirrors what's in supabase.js (kept inline so
// the panel stays self-contained).
const SUPABASE_FUNCTIONS_BASE = 'https://gtcbfglttoiyfsnfbhdy.supabase.co/functions/v1';

export default function UpcomingSessionsPanel({ trainees, onSelectTrainee }) {
  const [events, setEvents] = useState(null);
  const [syncMeta, setSyncMeta] = useState(null);
  const [error, setError] = useState(null);
  const [icsUrl, setIcsUrl] = useState(null); // null=not loaded, ''=not configured, 'url'=configured
  const [showSettings, setShowSettings] = useState(false);
  const [draftUrl, setDraftUrl] = useState('');
  const [savingUrl, setSavingUrl] = useState(false);
  const [setupError, setSetupError] = useState(null);

  const reload = useCallback(async () => {
    try {
      const fromIso = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const toIso = new Date(Date.now() + 21 * 86400000).toISOString();
      const { data, error: e } = await supabase
        .from('expo_calendar_events')
        .select('uid, summary, description, location, start_at, end_at, attendee_emails, trainee_id, synced_at')
        .gte('start_at', fromIso)
        .lte('start_at', toIso)
        .order('start_at');
      if (e) throw e;
      setEvents(data || []);
      setError(null);

      const { data: meta } = await supabase
        .from('store').select('value, updated_at').eq('key', 'expo-calendar-sync').maybeSingle();
      setSyncMeta(meta?.value ? { ...meta.value, updated_at: meta.updated_at } : null);

      const { data: urlRow } = await supabase
        .from('store').select('value').eq('key', 'expo-calendar-ics-url').maybeSingle();
      setIcsUrl(urlRow?.value?.url || '');
    } catch (e) {
      setEvents([]); setError(String(e?.message || e));
    }
  }, []);

  useEffect(() => {
    reload();
    // 90s polling — cheap (a single Supabase SELECT) and catches the
    // 10-min cron sync that happens server-side.
    const id = setInterval(reload, 90 * 1000);
    return () => clearInterval(id);
  }, [reload]);

  // Trigger an immediate sync via the edge function (rather than wait for
  // the next cron tick). Used right after saving the URL.
  const triggerSync = useCallback(async () => {
    try {
      await fetch(`${SUPABASE_FUNCTIONS_BASE}/sync-calendar`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
      });
    } catch {}
    // Reload from cache regardless — the cron may have already populated.
    setTimeout(reload, 1500);
  }, [reload]);

  const saveIcsUrl = useCallback(async () => {
    const url = String(draftUrl || '').trim();
    if (!url) { setSetupError('Paste a URL first.'); return; }
    // Strict shape check: only the actual iCal feed URL is allowed. The
    // Calendar UI URL (https://calendar.google.com/calendar/u/0/r) starts
    // with the same host but isn't a feed — it returns HTML, not iCal.
    // Catching this client-side prevents the previous "stored URL works
    // but yields zero events" silent failure mode.
    if (!/^https:\/\/calendar\.google\.com\/calendar\/ical\//i.test(url) || !/\.ics(\?.*)?$/i.test(url)) {
      setSetupError("That doesn't look like the iCal feed URL. The right one starts with https://calendar.google.com/calendar/ical/ and ends in .ics. Open Google Calendar → Settings → your calendar → Integrate calendar → copy 'Secret address in iCal format'.");
      return;
    }
    setSavingUrl(true); setSetupError(null);
    try {
      // Live preflight: ask the edge function to fetch the URL and verify
      // it returns parseable iCal with at least one EXPO event. If not,
      // refuse to save — better to fail here than store a broken URL
      // and have the dashboard show "synced 5m ago, 0 events" forever.
      const probe = await fetch(`${SUPABASE_FUNCTIONS_BASE}/sync-calendar`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ testUrl: url }),
      });
      const probeJson = await probe.json().catch(() => ({}));
      if (!probe.ok) {
        setSetupError(probeJson?.error || `Test fetch failed (status ${probe.status}).`);
        setSavingUrl(false);
        return;
      }
      if ((probeJson.totalEvents | 0) === 0) {
        setSetupError("Fetched the URL but it returned zero events. Double-check that this is the right calendar's iCal URL (the one with your training sessions on it).");
        setSavingUrl(false);
        return;
      }
      const { error: e } = await supabase.from('store').upsert({
        key: 'expo-calendar-ics-url',
        value: { url, configured_at: new Date().toISOString() },
      });
      if (e) throw e;
      setIcsUrl(url);
      setShowSettings(false);
      setDraftUrl('');
      await triggerSync();
    } catch (e) {
      setSetupError(String(e?.message || e));
    } finally {
      setSavingUrl(false);
    }
  }, [draftUrl, triggerSync]);

  const removeIcsUrl = useCallback(async () => {
    if (!confirm('Disconnect Google Calendar? Auto-sync will stop until a URL is pasted again.')) return;
    try {
      await supabase.from('store').delete().eq('key', 'expo-calendar-ics-url');
      setIcsUrl('');
    } catch {}
  }, []);

  const enriched = useMemo(() => (events || []).map(ev => {
    const trainee = matchTrainee(ev, trainees);
    return { ...ev, _trainee: trainee, _bucket: ev.start_at ? dayBucket(ev.start_at) : 'LATER' };
  }), [events, trainees]);

  const buckets = useMemo(() => {
    const out = { TODAY: [], TOMORROW: [], 'THIS WEEK': [], LATER: [] };
    for (const ev of enriched) (out[ev._bucket] || out.LATER).push(ev);
    return out;
  }, [enriched]);

  if (events == null || icsUrl == null) {
    return (
      <div style={{ marginBottom: 16, padding: '14px 18px', border: `0.25px solid ${C.cardBd}` }}>
        <div style={{ fontFamily: FN, fontSize: 9, color: C.tm, letterSpacing: '0.18em', fontWeight: 700, textTransform: 'uppercase' }}>SESSIONS</div>
        <div style={{ fontFamily: FB, fontSize: 12, color: C.td, marginTop: 8 }}>Loading…</div>
      </div>
    );
  }

  // Not configured yet: render the one-time setup form. This is the only
  // manual step in the entire calendar feature — paste your secret iCal
  // URL once, after which pg_cron auto-syncs every 10 minutes.
  if (icsUrl === '' || showSettings) {
    return (
      <div style={{ marginBottom: 16, padding: '16px 20px', border: `0.25px dashed rgba(57,189,255,0.502)` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ fontFamily: FN, fontSize: 9, color: C.ac, letterSpacing: '0.18em', fontWeight: 700, textTransform: 'uppercase' }}>
            {icsUrl ? 'CONNECT CALENDAR · UPDATE' : 'CONNECT CALENDAR · ONE-TIME'}
          </div>
          {icsUrl && <button onClick={() => setShowSettings(false)}
            style={{ background: 'var(--c-sf)', border: `0.25px solid ${C.cardBd}`, color: C.tm, padding: '3px 8px', fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', cursor: 'pointer', borderRadius: 0, textTransform: 'uppercase' }}>
            ✕ CANCEL
          </button>}
        </div>
        <div style={{ fontFamily: FB, fontSize: 13, color: C.tx, marginTop: 10, lineHeight: 1.6 }}>
          Paste your Google Calendar's <em>secret iCal URL</em> below. Auto-sync runs every 10 minutes after that — no other setup needed.
        </div>
        <ol style={{ fontFamily: FB, fontSize: 12, color: C.tm, marginTop: 8, paddingLeft: 20, lineHeight: 1.7 }}>
          <li>Open <a href="https://calendar.google.com/calendar/r/settings" target="_blank" rel="noreferrer" style={{ color: C.ac, textDecoration: 'underline' }}>Google Calendar settings</a></li>
          <li>Click your primary calendar → "Integrate calendar"</li>
          <li>Copy "Secret address in iCal format" (the URL ending in <code>.ics</code>)</li>
          <li>Paste it below</li>
        </ol>
        <input
          value={draftUrl}
          onChange={e => setDraftUrl(e.target.value)}
          placeholder="https://calendar.google.com/calendar/ical/.../basic.ics"
          autoFocus
          style={{ width: '100%', boxSizing: 'border-box', background: 'var(--c-sf)', border: `0.25px solid ${C.cardBd}`, borderRadius: 0, padding: '10px 12px', color: C.tx, fontFamily: FN, fontSize: 12, outline: 'none', marginTop: 12 }}
        />
        {setupError && <div style={{ color: C.rd, fontFamily: FN, fontSize: 11, marginTop: 6 }}>{setupError}</div>}
        <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={saveIcsUrl} disabled={savingUrl}
            style={{ background: 'var(--c-sf)', border: `1px solid ${C.ac}`, color: C.ac, padding: '8px 18px', fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', cursor: savingUrl ? 'wait' : 'pointer', borderRadius: 0, textTransform: 'uppercase', opacity: savingUrl ? 0.5 : 1 }}>
            {savingUrl ? 'CONNECTING…' : 'CONNECT'}
          </button>
          {icsUrl && (
            <button onClick={removeIcsUrl}
              style={{ background: 'var(--c-sf)', border: `0.25px solid ${C.rd}`, color: C.rd, padding: '8px 14px', fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', cursor: 'pointer', borderRadius: 0, textTransform: 'uppercase' }}>
              DISCONNECT
            </button>
          )}
        </div>
        <div style={{ fontFamily: FN, fontSize: 9, color: C.td, marginTop: 14, letterSpacing: '0.06em' }}>
          The URL is stored in your private Supabase project; only the trainer (you) can read it. The edge function uses it server-side.
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ marginBottom: 16, padding: '14px 18px', border: `0.25px solid rgba(255,71,87,0.502)` }}>
        <div style={{ fontFamily: FN, fontSize: 9, color: C.rd, letterSpacing: '0.18em', fontWeight: 700, textTransform: 'uppercase' }}>SESSIONS · ERROR</div>
        <div style={{ fontFamily: FB, fontSize: 12, color: C.tm, marginTop: 6 }}>{error}</div>
      </div>
    );
  }

  // Sync staleness: green ≤2h, orange ≤24h, red beyond.
  const lastSyncIso = syncMeta?.at || syncMeta?.updated_at;
  const lastSyncMs = lastSyncIso ? Date.now() - new Date(lastSyncIso).getTime() : null;
  const staleColor = lastSyncMs == null ? C.tm
    : lastSyncMs <= 2 * 3600_000 ? C.gn
    : lastSyncMs <= 24 * 3600_000 ? C.or
    : C.rd;
  const stalenessLabel = lastSyncIso ? `synced ${ago(lastSyncIso)} ago` : 'never synced';

  if (enriched.length === 0) {
    return (
      <div style={{ marginBottom: 16, padding: '14px 18px', border: `0.25px solid ${C.cardBd}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ fontFamily: FN, fontSize: 9, color: C.tm, letterSpacing: '0.18em', fontWeight: 700, textTransform: 'uppercase' }}>SESSIONS</div>
          <div style={{ fontFamily: FN, fontSize: 9, color: staleColor, letterSpacing: '0.12em', fontWeight: 700 }}>{stalenessLabel}</div>
        </div>
        <div style={{ fontFamily: FB, fontSize: 12, color: C.td, marginTop: 6 }}>
          No upcoming sessions in the next 21 days. {lastSyncMs > 24 * 3600_000 && 'Ask Claude to resync to refresh.'}
        </div>
      </div>
    );
  }

  const renderRow = (ev) => {
    const name = ev._trainee?.name || summaryDisplayName(ev);
    const isHebrew = RTL.test(name);
    const onClick = ev._trainee && onSelectTrainee ? () => onSelectTrainee(ev._trainee.id) : null;
    return (
      <div key={ev.uid || `${ev.start_at}-${name}`}
        onClick={onClick}
        style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
          borderTop: `0.25px solid rgba(57,189,255,0.149)`, cursor: onClick ? 'pointer' : 'default',
        }}>
        <div style={{ fontFamily: FN, fontSize: 13, color: C.ac, fontWeight: 700, minWidth: 50 }}>{fmtTime(ev.start_at)}</div>
        <div style={{ fontFamily: FN, fontSize: 11, color: C.tm, fontWeight: 600, minWidth: 70 }}>{fmtDayLabel(ev.start_at)}</div>
        {/* Use FN (Nord) and let the unicode-range @font-face route Hebrew
            glyphs to Heebo via fallback. Same chain the rest of the app
            uses — keeps the calendar row visually consistent with the
            sessions header and the trainee-card text elsewhere. */}
        <div style={{
          flex: 1, minWidth: 0, fontFamily: FN, fontSize: 14, color: C.tx, fontWeight: 600,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          direction: isHebrew ? 'rtl' : 'ltr',
        }}>
          {name}
          {!ev._trainee && <span style={{ color: C.td, fontFamily: FN, fontSize: 10, marginLeft: 6 }}>· unmatched</span>}
        </div>
      </div>
    );
  };

  return (
    <div style={{ marginBottom: 16, border: `0.25px solid ${C.cardBd}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontFamily: FN, fontSize: 9, color: C.tm, letterSpacing: '0.18em', fontWeight: 700, textTransform: 'uppercase' }}>
          SESSIONS · {enriched.length} upcoming
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontFamily: FN, fontSize: 9, color: staleColor, letterSpacing: '0.12em', fontWeight: 700 }}>
            {stalenessLabel}
          </span>
          <button onClick={triggerSync}
            title="Force an immediate calendar resync (otherwise runs every 10 min)"
            style={{ background: 'var(--c-sf)', border: `0.25px solid ${C.cardBd}`, color: C.tm, padding: '3px 8px', fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', cursor: 'pointer', borderRadius: 0, textTransform: 'uppercase' }}>
            ↻ Sync Now
          </button>
          <button onClick={() => setShowSettings(true)}
            title="Update or disconnect the iCal URL"
            style={{ background: 'var(--c-sf)', border: `0.25px solid ${C.cardBd}`, color: C.tm, padding: '3px 8px', fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', cursor: 'pointer', borderRadius: 0, textTransform: 'uppercase' }}>
            ⚙
          </button>
        </div>
      </div>
      {['TODAY', 'TOMORROW', 'THIS WEEK', 'LATER'].map(b => (
        buckets[b] && buckets[b].length > 0 && (
          <div key={b}>
            <div style={{ fontFamily: FN, fontSize: 9, color: C.ac, letterSpacing: '0.18em', fontWeight: 700, textTransform: 'uppercase', padding: '6px 10px', background: `rgba(57,189,255,0.063)` }}>
              {b}
            </div>
            {buckets[b].map(renderRow)}
          </div>
        )
      ))}
    </div>
  );
}
