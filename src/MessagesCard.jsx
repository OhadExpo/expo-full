// Dashboard tile: inbound athlete→coach messages, grouped by athlete.
//
// Reads `coach_messages` filtered to sender_role='athlete' and shows
// the most-recent unread thread per athlete. Unread is determined by
// localStorage['expo-msgs-seen-at'] (single-coach store; multi-tenant
// can swap this for a per-coach Supabase column later).
//
// Click a row → onSelectTrainee(traineeId). "Mark all read" stamps the
// seen-at timestamp so the unread badge clears until the next message.

import React, { useEffect, useState, useCallback } from 'react';
import { C, FN, FH } from './theme';
import { SectionLabel, SectionIcon, isRefined5b, RefinedHeaderStrip } from './ui';
import { supabase } from './supabase';

const SEEN_KEY = 'expo-msgs-seen-at';
const isHebrew = (s) => /[֐-׿]/.test(s || '');
const ago = (iso) => {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return 'now';
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
};

export default function MessagesCard({ trainees, onSelectTrainee }) {
  const [rows, setRows] = useState([]);
  const [seenAt, setSeenAt] = useState(() => {
    try { return localStorage.getItem(SEEN_KEY) || ''; } catch { return ''; }
  });

  const reload = useCallback(async () => {
    const { data, error } = await supabase
      .from('coach_messages')
      .select('id,trainee_id,sender_role,body_text,audio_url,created_at')
      .eq('sender_role', 'athlete')
      .order('created_at', { ascending: false })
      .limit(80);
    // Table-not-yet-applied / RLS no-rows both look the same to us:
    // degrade silently to empty state.
    if (error || !Array.isArray(data)) { setRows([]); return; }
    setRows(data);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  // Realtime: refresh whenever an athlete posts a new message.
  useEffect(() => {
    const ch = supabase
      .channel('dashboard-messages-card')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'coach_messages', filter: 'sender_role=eq.athlete' },
        () => reload())
      .subscribe();
    return () => { try { supabase.removeChannel(ch); } catch {} };
  }, [reload]);

  // Collapse to one row per athlete (most-recent inbound message).
  const byTrainee = new Map();
  rows.forEach(r => { if (!byTrainee.has(r.trainee_id)) byTrainee.set(r.trainee_id, r); });
  const collapsed = Array.from(byTrainee.values());

  const unreadCount = seenAt
    ? collapsed.filter(r => new Date(r.created_at).getTime() > new Date(seenAt).getTime()).length
    : collapsed.length;

  if (collapsed.length === 0) return null;

  const markRead = () => {
    const now = new Date().toISOString();
    try { localStorage.setItem(SEEN_KEY, now); } catch {}
    setSeenAt(now);
  };

  const nameFor = (id) => {
    const t = trainees?.find(tt => tt.id === id || (tt.members && tt.members.some((_, mi) => `${tt.id}__${mi}` === id)));
    if (!t) return id;
    if (t.id === id) return t.name;
    // Sub-member id: append member name.
    const mi = Number(id.split('__').pop());
    const m = t.members?.[mi];
    return m?.name ? `${t.name} · ${m.name}` : t.name;
  };

  // Parent id for navigation — TraineeDetail keys on the parent, not the sub-member.
  const parentFor = (id) => id.includes('__') ? id.split('__')[0] : id;

  return (
    <div className="alert-card" style={{
      background: isRefined5b() ? '#FFFFFF' : 'var(--c-sf)',
      border: `1px solid ${C.cardBd}`,
      borderLeft: `3px solid ${unreadCount > 0 ? C.ac : C.td}`,
      borderRadius: 0,
      padding: '14px 18px',
      boxShadow: C.cardShadow,
    }}>
      {isRefined5b() ? (
        <RefinedHeaderStrip>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <SectionLabel style={{ color: '#FFFFFF', fontSize: C.alertLabelSize }}>
              <SectionIcon kind="mail" color="#FFFFFF"/>Messages ({unreadCount})
            </SectionLabel>
            {unreadCount > 0 && (
              <button onClick={markRead} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.55)', color: '#FFFFFF', fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', padding: '2px 6px', cursor: 'pointer', borderRadius: 0 }}>
                MARK READ
              </button>
            )}
          </div>
        </RefinedHeaderStrip>
      ) : (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <SectionLabel color={C.ac} style={{ fontSize: C.alertLabelSize }}>{`💬 Messages (${unreadCount})`}</SectionLabel>
          {unreadCount > 0 && (
            <button onClick={markRead} style={{ background: 'transparent', border: `1px solid ${C.ac}`, color: C.ac, fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', padding: '2px 6px', cursor: 'pointer', borderRadius: 0 }}>
              MARK READ
            </button>
          )}
        </div>
      )}
      {collapsed.slice(0, 6).map(r => {
        const isUnread = !seenAt || new Date(r.created_at).getTime() > new Date(seenAt).getTime();
        const preview = r.body_text || (r.audio_url ? '🎤 Voice note' : '');
        const heb = isHebrew(preview);
        return (
          <div key={r.id} onClick={() => onSelectTrainee?.(parentFor(r.trainee_id))}
            style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              gap: 8, padding: '6px 0', cursor: 'pointer', fontSize: 13,
              opacity: isUnread ? 1 : 0.55,
            }}>
            <div style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ color: C.tx, fontWeight: isUnread ? 600 : 400 }}>
                {isUnread && <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: C.ac, marginRight: 6, verticalAlign: 'middle' }} />}
                {nameFor(r.trainee_id)}
              </span>
              <span style={{
                color: C.tm, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis',
                whiteSpace: 'nowrap', direction: heb ? 'rtl' : 'ltr',
                fontFamily: heb ? FH : undefined,
              }}>{preview}</span>
            </div>
            <span style={{ fontFamily: FN, color: C.td, fontSize: 10, flexShrink: 0 }}>{ago(r.created_at)}</span>
          </div>
        );
      })}
    </div>
  );
}
