// Dashboard inbox: most-recent message per athlete, full-width card.
//
// Reads `coach_messages` (most recent first), collapses to one row per
// trainee_id (latest), and renders them as inbox-style rows: initial
// avatar, athlete name, role pill, timestamp, single-line preview,
// unread dot. Click → onSelectTrainee(parentId) for couples.
//
// Always renders so the dashboard has a permanent home for messages —
// empty state shows a quiet "no messages yet" line.
//
// Unread tracking lives in localStorage['expo-msgs-seen-at'] (single-
// coach store; swap for a per-coach Supabase column when multi-tenant).

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { C, FN, FH } from './theme';
import { isRefined5b, RefinedHeaderStrip, SectionLabel, usePersistentState } from './ui';
import { useTheme } from './hooks/useTheme';
import { supabase } from './supabase';
import { enqueue } from './offlineQueue';

const SEEN_KEY = 'expo-msgs-seen-at';
const isHebrew = (s) => /[֐-׿]/.test(s || '');
const initialOf = (name) => {
  const s = String(name || '').trim();
  if (!s) return '·';
  // Hebrew first char or Latin first char — first non-whitespace.
  return s.charAt(0).toUpperCase();
};
const ago = (iso) => {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return 'now';
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return `${Math.floor(d / 7)}w`;
};

export default function MessagesCard({ trainees, onSelectTrainee }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [seenAt, setSeenAt] = useState(() => {
    try { return localStorage.getItem(SEEN_KEY) || ''; } catch { return ''; }
  });
  // useTheme subscribes to the 'expo-theme-change' event so MessagesCard
  // re-renders whenever the user toggles dark/light — without it, the
  // card was reading isRefined5b() once on mount and going stale.
  const { theme } = useTheme();
  const refined = theme === 'light' || isRefined5b();
  const [open, setOpen] = usePersistentState('dash-messages', true);
  const PAD = 14;

  // A failed read must NOT render as the "No messages yet" empty state —
  // that masks an outage as an empty inbox. Track the error separately and
  // keep any previously-loaded rows on a transient refresh failure.
  const [loadError, setLoadError] = useState(null);
  const reload = useCallback(async () => {
    // We collapse to latest-per-trainee below, so the window must be big enough
    // that NO athlete's latest message can fall outside it — otherwise a quieter
    // athlete's unread inbound gets hidden from the card AND dropped from the
    // unread badge count (a genuinely missed message). 120 could truncate on a
    // single busy day; 2000 covers years at this client count. The fully-correct
    // fix is a DISTINCT ON (trainee_id) … ORDER BY trainee_id, created_at DESC
    // RPC (returns exactly one latest row per athlete, volume-independent) —
    // swap to that if coach_messages ever grows large. (messaging audit)
    const { data, error } = await supabase
      .from('coach_messages')
      .select('id,trainee_id,sender_role,body_text,audio_url,created_at')
      .order('created_at', { ascending: false })
      .limit(2000);
    setLoading(false);
    if (error || !Array.isArray(data)) {
      console.warn('MessagesCard load failed:', error?.message || error);
      setLoadError(error?.message || 'read failed');
      return;
    }
    setLoadError(null);
    setRows(data);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  // Hydrate seenAt from the DB on mount (survives a dropped localStorage),
  // taking the LATER of the local + server timestamps so a mark-read on any
  // device/session wins and the inbox never "resets" on reload (Ohad).
  useEffect(() => {
    let cancelled = false;
    supabase.from('store').select('value').eq('key', SEEN_KEY).maybeSingle().then(({ data }) => {
      if (cancelled || !data) return;
      const dbAt = typeof data.value === 'string' ? data.value : (data.value && data.value.at) || '';
      if (!dbAt) return;
      setSeenAt(prev => {
        const later = (!prev || new Date(dbAt).getTime() > new Date(prev).getTime()) ? dbAt : prev;
        try { localStorage.setItem(SEEN_KEY, later); } catch {}
        return later;
      });
    });
    return () => { cancelled = true; };
  }, []);

  // Realtime: refresh whenever a new message lands (coach or athlete).
  useEffect(() => {
    const ch = supabase
      .channel('dashboard-messages-card')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'coach_messages' },
        () => reload())
      .subscribe();
    return () => { try { supabase.removeChannel(ch); } catch {} };
  }, [reload]);

  // Collapse to one row per athlete (the latest message).
  const byTrainee = new Map();
  rows.forEach(r => { if (!byTrainee.has(r.trainee_id)) byTrainee.set(r.trainee_id, r); });
  const threads = Array.from(byTrainee.values());

  // Per-athlete mute lookup: trainees toggled "🔕 MUTED" on their athlete
  // page drop out of the dashboard unread count (so a noisy or paused
  // athlete doesn't keep the red badge lit). The message still appears
  // in the inbox list if you expand handled — mute only suppresses the
  // count signal, not the messages themselves.
  const mutedIds = useMemo(() => {
    const s = new Set();
    (trainees || []).forEach(t => { if (t.notifOff) s.add(t.id); });
    return s;
  }, [trainees]);
  const isMuted = (traineeIdRaw) => {
    // A message with a null/blank trainee_id must not crash the inbox
    // (adversarial-QA): guard before .includes, default to not-muted so it shows.
    if (!traineeIdRaw || typeof traineeIdRaw !== 'string') return false;
    const parentId = traineeIdRaw.includes('__') ? traineeIdRaw.split('__')[0] : traineeIdRaw;
    return mutedIds.has(parentId);
  };
  // "Unhandled" = the latest message is from the athlete AND it landed
  // after the global seenAt timestamp. The inbox renders ONLY unhandled
  // threads by default — replied-to threads (coach is the latest sender)
  // drop out automatically, and MARK ALL READ clears the rest by bumping
  // seenAt. Handled threads stay queryable behind the "+ N HANDLED" toggle.
  const unreadFor = (r) =>
    r.sender_role === 'athlete' &&
    !isMuted(r.trainee_id) &&
    (!seenAt || new Date(r.created_at).getTime() > new Date(seenAt).getTime());
  const unreadCount = threads.filter(unreadFor).length;
  const [showHandled, setShowHandled] = useState(false);
  const handledThreads = useMemo(() => threads.filter(r => !unreadFor(r)), [threads, seenAt, mutedIds]);
  const visibleThreads = showHandled ? threads : threads.filter(unreadFor);

  // Sync read-state across this user's OWN tabs instantly (same-origin, no
  // server round-trip) so marking the inbox read in one tab clears the badge in
  // the others live instead of on reload (Ohad: the "tabs" angle).
  const seenChanRef = useRef(null);
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const bc = new BroadcastChannel('expo-msgs-seen');
    bc.onmessage = (e) => {
      const ts = e?.data;
      if (!ts) return;
      setSeenAt(prev => (!prev || new Date(ts).getTime() > new Date(prev).getTime()) ? ts : prev);
      try { const cur = localStorage.getItem(SEEN_KEY) || ''; if (!cur || new Date(ts).getTime() > new Date(cur).getTime()) localStorage.setItem(SEEN_KEY, ts); } catch { /* ignore */ }
    };
    seenChanRef.current = bc;
    return () => { seenChanRef.current = null; bc.close(); };
  }, []);

  const markRead = () => {
    const now = new Date().toISOString();
    try { localStorage.setItem(SEEN_KEY, now); } catch {}
    setSeenAt(now);
    try { seenChanRef.current?.postMessage(now); } catch { /* ignore */ }
    // Persist server-side too — localStorage alone is fragile on mobile
    // (private mode / PWA storage can drop it on reload), which made the inbox
    // "reset" and re-show already-handled messages (Ohad). Routed through the
    // offlineQueue (same path as every other store write) so a flaky/offline
    // tap is retried instead of silently lost. The store row is the source of
    // truth on reload; localStorage stays a fast local cache.
    enqueue({ type: 'store.upsert', payload: { key: SEEN_KEY, value: now }, dedupeKey: SEEN_KEY });
  };

  const nameFor = (id) => {
    const t = trainees?.find(tt =>
      tt.id === id || (Array.isArray(tt.members) && tt.members.some((_, mi) => `${tt.id}__${mi}` === id))
    );
    if (!t) return id;
    if (t.id === id) return t.name;
    const mi = Number(id.split('__').pop());
    const m = t.members?.[mi];
    return m?.name ? `${t.name} · ${m.name}` : t.name;
  };

  // TraineeDetail routes on parent IDs.
  const parentFor = (id) => (typeof id === 'string' && id.includes('__') ? id.split('__')[0] : id);

  return (
    <div style={{
      background: 'var(--c-sf)',
      border: `1px solid var(--c-cardBd)`,
      borderRadius: 0,
      padding: PAD,
      // Collapsed: no bottom padding so no empty card-bg box shows beneath the
      // header — a collapsed card reads as a clean strip like Revenue (#262).
      paddingBottom: open ? PAD : 0,
      boxShadow: C.cardShadow,
      marginBottom: 20,
    }}>
      {/* Header — canonical cyan strip in BOTH themes, matching every other
          dashboard card (Overdue Payment, New Leads, etc.). It used to drop
          to a bare inline label in dark, which is exactly the off-brand
          "card with no title strip" Ohad flagged. White text reads on the
          strip in both themes. */}
      <RefinedHeaderStrip padY={PAD} padX={PAD} marginBottom={open ? 10 : 0}>
        <div onClick={() => setOpen(o => !o)} role="button" tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(o => !o); } }}
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none' }}>
          <span style={{
            fontWeight: 700, fontSize: 13, letterSpacing: '0.04em',
            textTransform: 'uppercase', color: '#FFFFFF',
            display: 'inline-flex', alignItems: 'center', gap: 8,
          }}>
            Messages
            {threads.length > 0 && (
              <span style={{
                fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
                color: '#FFFFFF', opacity: 0.85,
              }}>
                ({showHandled ? threads.length : unreadCount})
              </span>
            )}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {unreadCount > 0 && (
              <button onClick={(e) => { e.stopPropagation(); markRead(); }}
                style={{
                  background: 'transparent',
                  border: '1px solid rgba(255,255,255,0.55)',
                  color: '#FFFFFF',
                  padding: '3px 10px', borderRadius: 0,
                  fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
                  cursor: 'pointer',
                }}>MARK ALL READ</button>
            )}
            <span aria-hidden style={{ color: '#FFFFFF', fontSize: 12, lineHeight: 1, transform: open ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 180ms ease' }}>▾</span>
          </div>
        </div>
      </RefinedHeaderStrip>

      <div style={{ display: 'grid', gridTemplateRows: open ? '1fr' : '0fr', transition: 'grid-template-rows 260ms ease' }}>
      <div style={{ overflow: 'hidden', minHeight: 0 }}>
      {loading ? (
        <div style={{ padding: '20px 6px', textAlign: 'center', color: 'var(--c-td)', fontSize: 12, fontFamily: FN, letterSpacing: '0.12em' }}>
          LOADING…
        </div>
      ) : threads.length === 0 && loadError ? (
        <div style={{
          padding: '20px 6px', textAlign: 'center', color: 'var(--c-td)',
          fontSize: 11, fontFamily: FN, fontWeight: 700, letterSpacing: '0.12em',
          display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8,
        }}>
          <span>COULDN&apos;T LOAD MESSAGES</span>
          <span style={{ opacity: 0.5 }}>·</span>
          <button onClick={() => { setLoading(true); reload(); }}
            style={{
              background: 'transparent', border: 'none', color: 'var(--c-ac)', cursor: 'pointer',
              fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', padding: 0,
            }}>RETRY</button>
        </div>
      ) : threads.length === 0 ? (
        <div style={{ padding: '24px 6px', textAlign: 'center', color: 'var(--c-td)', fontSize: 13 }}>
          No messages yet. Athlete replies and your sent messages will appear here.
        </div>
      ) : visibleThreads.length === 0 ? (
        // Inbox-clear pill — single tight uppercase line so the empty
        // state doesn't occupy more height than a single inbox row.
        // Padding was 20/6 (40px vertical) + a 13px regular sentence + a
        // 10px uppercase button — the size mismatch made the line look
        // misaligned and the card balloon to ~140px tall over nothing.
        <div style={{
          padding: '6px 0', textAlign: 'center',
          fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.12em',
          color: 'var(--c-td)', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8,
        }}>
          <span>✓ INBOX CLEAR</span>
          {handledThreads.length > 0 && (
            <>
              <span style={{ opacity: 0.5 }}>·</span>
              <button onClick={() => setShowHandled(true)}
                style={{
                  background:'transparent', border:'none', color:'var(--c-ac)', cursor:'pointer',
                  fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', padding: 0,
                }}>
                SHOW {handledThreads.length} ANSWERED →
              </button>
            </>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {visibleThreads.slice(0, 8).map((r, idx) => {
            const unread = unreadFor(r);
            const heb = isHebrew(r.body_text);
            const preview = r.body_text || (r.audio_url ? '🎤 Voice note' : '');
            const name = nameFor(r.trainee_id);
            const fromAthlete = r.sender_role === 'athlete';
            return (
              <div
                key={r.id}
                onClick={() => onSelectTrainee?.(parentFor(r.trainee_id))}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '36px 1fr auto',
                  gap: 12,
                  alignItems: 'center',
                  padding: '10px 4px',
                  borderTop: idx === 0 ? 'none' : `1px solid var(--c-cardBd)`,
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = refined ? 'rgba(57,189,255,0.06)' : 'rgba(57,189,255,0.04)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                {/* Initial-circle avatar */}
                <div style={{
                  width: 32, height: 32, borderRadius: '50%',
                  background: unread ? 'rgba(57,189,255,0.18)' : 'var(--c-sf)',
                  border: `1px solid ${unread ? 'var(--c-ac)' : 'var(--c-cardBd)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: FN, fontSize: 13, fontWeight: 700,
                  color: unread ? 'var(--c-ac)' : 'var(--c-tm)',
                  flexShrink: 0,
                }}>{initialOf(name)}</div>

                {/* Name row + preview */}
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <span style={{
                      fontFamily: FN, fontSize: 12, fontWeight: 700,
                      color: 'var(--c-tx)', letterSpacing: '0.02em',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>{name}</span>
                    <span title={fromAthlete ? 'Athlete sent the last message' : 'You sent the last message'}
                      style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
                        fontFamily: FN, fontSize: 8, fontWeight: 700, letterSpacing: '0.12em',
                        color: fromAthlete ? 'var(--c-ac)' : 'var(--c-tm)',
                        border: `1px solid ${fromAthlete ? 'var(--c-ac)' : 'var(--c-cardBd)'}`,
                        padding: '2px 5px', flexShrink: 0,
                      }}>{fromAthlete ? 'INBOUND' : 'SENT'}</span>
                    {unread && (
                      <span style={{
                        display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
                        background: 'var(--c-ac)', flexShrink: 0,
                      }} />
                    )}
                  </div>
                  <div style={{
                    marginTop: 2,
                    fontSize: 12, color: 'var(--c-tm)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    direction: heb ? 'rtl' : 'ltr',
                    fontFamily: heb ? FH : undefined,
                  }}>{preview || <span style={{ opacity: 0.5 }}>(empty)</span>}</div>
                </div>

                {/* Timestamp on the right */}
                <div style={{
                  fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
                  color: unread ? 'var(--c-ac)' : 'var(--c-td)',
                  flexShrink: 0,
                  alignSelf: 'flex-start', paddingTop: 2,
                }}>{ago(r.created_at)}</div>
              </div>
            );
          })}
          {visibleThreads.length > 8 && (
            <div style={{
              padding: '8px 4px 0', fontFamily: FN, fontSize: 10, letterSpacing: '0.12em',
              color: 'var(--c-tm)', textAlign: 'center',
            }}>+ {visibleThreads.length - 8} OLDER THREADS</div>
          )}
          {/* Handled-thread expander. Shown only when there's at least one
              unhandled thread visible AND at least one handled thread
              hiding behind it. The "all clear" state above the loop has
              its own SHOW HANDLED button so this row stays out of the
              way when there's nothing actionable. */}
          {!showHandled && handledThreads.length > 0 && (
            <button onClick={() => setShowHandled(true)}
              style={{
                marginTop: 10, padding: '6px 0', background: 'transparent',
                border: `1px solid var(--c-cardBd)`, color: 'var(--c-tm)',
                fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
                cursor: 'pointer',
              }}>
              + {handledThreads.length} ANSWERED
            </button>
          )}
          {showHandled && (
            <button onClick={() => setShowHandled(false)}
              style={{
                marginTop: 10, padding: '6px 0', background: 'transparent',
                border: `1px solid var(--c-cardBd)`, color: 'var(--c-tm)',
                fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
                cursor: 'pointer',
              }}>
              HIDE ANSWERED
            </button>
          )}
        </div>
      )}
      </div>
      </div>
    </div>
  );
}
