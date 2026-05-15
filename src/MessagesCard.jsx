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

import React, { useEffect, useState, useCallback } from 'react';
import { C, FN, FH } from './theme';
import { isRefined5b, RefinedHeaderStrip } from './ui';
import { supabase } from './supabase';

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
  const refined = isRefined5b();
  const PAD = 14;

  const reload = useCallback(async () => {
    const { data, error } = await supabase
      .from('coach_messages')
      .select('id,trainee_id,sender_role,body_text,audio_url,created_at')
      .order('created_at', { ascending: false })
      .limit(120);
    setLoading(false);
    if (error || !Array.isArray(data)) { setRows([]); return; }
    setRows(data);
  }, []);

  useEffect(() => { reload(); }, [reload]);

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

  const unreadFor = (r) =>
    r.sender_role === 'athlete' &&
    (!seenAt || new Date(r.created_at).getTime() > new Date(seenAt).getTime());
  const unreadCount = threads.filter(unreadFor).length;

  const markRead = () => {
    const now = new Date().toISOString();
    try { localStorage.setItem(SEEN_KEY, now); } catch {}
    setSeenAt(now);
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
  const parentFor = (id) => (id.includes('__') ? id.split('__')[0] : id);

  return (
    <div style={{
      background: refined ? '#FFFFFF' : 'var(--c-sf)',
      border: `1px solid var(--c-cardBd)`,
      borderRadius: 0,
      padding: PAD,
      boxShadow: C.cardShadow,
      marginBottom: 20,
    }}>
      <RefinedHeaderStrip padY={PAD} padX={PAD} marginBottom={10}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <span style={{
            fontWeight: 700, fontSize: 13, letterSpacing: '0.04em',
            textTransform: 'uppercase', color: refined ? '#FFFFFF' : 'var(--c-tx)',
            display: 'inline-flex', alignItems: 'center', gap: 8,
          }}>
            💬 Messages
            {threads.length > 0 && (
              <span style={{
                fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
                color: refined ? '#FFFFFF' : 'var(--c-tm)', opacity: refined ? 0.85 : 1,
              }}>
                ({unreadCount > 0 ? `${unreadCount} unread · ` : ''}{threads.length})
              </span>
            )}
          </span>
          {unreadCount > 0 && (
            <button onClick={markRead}
              style={{
                background: 'transparent',
                border: `1px solid ${refined ? 'rgba(255,255,255,0.55)' : 'var(--c-ac)'}`,
                color: refined ? '#FFFFFF' : 'var(--c-ac)',
                padding: '3px 10px', borderRadius: 0,
                fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
                cursor: 'pointer',
              }}>MARK ALL READ</button>
          )}
        </div>
      </RefinedHeaderStrip>

      {loading ? (
        <div style={{ padding: '20px 6px', textAlign: 'center', color: 'var(--c-td)', fontSize: 12, fontFamily: FN, letterSpacing: '0.12em' }}>
          LOADING…
        </div>
      ) : threads.length === 0 ? (
        <div style={{ padding: '24px 6px', textAlign: 'center', color: 'var(--c-td)', fontSize: 13 }}>
          No messages yet. Athlete replies and your sent messages will appear here.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {threads.slice(0, 8).map((r, idx) => {
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
                        fontFamily: FN, fontSize: 8, fontWeight: 700, letterSpacing: '0.12em',
                        color: fromAthlete ? 'var(--c-ac)' : 'var(--c-tm)',
                        border: `1px solid ${fromAthlete ? 'var(--c-ac)' : 'var(--c-cardBd)'}`,
                        padding: '1px 5px', flexShrink: 0,
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
          {threads.length > 8 && (
            <div style={{
              padding: '8px 4px 0', fontFamily: FN, fontSize: 10, letterSpacing: '0.12em',
              color: 'var(--c-tm)', textAlign: 'center',
            }}>+ {threads.length - 8} OLDER THREADS</div>
          )}
        </div>
      )}
    </div>
  );
}
