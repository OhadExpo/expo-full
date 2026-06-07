// Chat audit page — surfaces every visitor turn captured by the marketing
// chat endpoints (api/chat.js on both sites) so Ohad can see what real
// visitors are asking and tune the system prompt.
//
// Renders gracefully if the chat_logs migration hasn't been applied yet —
// the page just shows the "no data yet" empty state with the migration
// path. RLS on chat_logs limits SELECT to the trainer email; anon can't
// peek even if a misconfigured client tried.

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { C, FN, FB } from './theme';
import { isRefined5b, CollapsibleSection } from './ui';
import { supabase } from './supabase';

// Inline `**bold**` renderer for bot messages. The marketing chat model
// emits markdown-style bold (e.g. **STARTER**, **GROWTH**) which used to
// render as literal asterisks in the audit view. Only handles bold —
// not headings, lists, or links — since that's all that appears in
// production. Whitespace handling stays on the parent (pre-wrap).
function renderBold(text) {
  if (!text || typeof text !== 'string') return text;
  // Split on the bold pattern, keeping the delimiters so the regex
  // produces alternating plain/bold segments.
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
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

export default function ChatAuditView() {
  const [logs, setLogs] = useState(null); // null = not loaded; [] = empty; [...] = data
  const [siteFilter, setSiteFilter] = useState('all'); // all | expo-app | expo-il
  const [showErrorsOnly, setShowErrorsOnly] = useState(false);
  const [filter, setFilter] = useState('');
  const [migrationMissing, setMigrationMissing] = useState(false);

  const reload = useCallback(async (ctx) => {
    const live = () => !ctx || !ctx.cancelled;
    if (live()) setMigrationMissing(false);
    try {
      const { data, error } = await supabase
        .from('chat_logs')
        .select('id,created_at,site,session_id,visitor_msg,assistant_msg,error,ip_hash')
        .order('created_at', { ascending: false })
        .limit(500);
      if (!live()) return;
      if (error) {
        // PostgREST returns 404/PGRST205 when the table doesn't exist —
        // signal the empty-state with a migration hint instead of a silent fail.
        if (/relation .* does not exist|PGRST205|chat_logs/i.test(error.message || '')) {
          setMigrationMissing(true);
        }
        setLogs([]);
        return;
      }
      setLogs(data || []);
    } catch {
      if (live()) setLogs([]);
    }
  }, []);
  // Cancellation handle so a slow fetch + early route-away doesn't trigger
  // a setState-on-unmounted warning.
  useEffect(() => {
    const ctx = { cancelled: false };
    reload(ctx);
    return () => { ctx.cancelled = true; };
  }, [reload]);

  // Group consecutive turns by session_id so a single visitor's conversation
  // reads as one block instead of scattered rows.
  const grouped = useMemo(() => {
    if (!logs) return null;
    const filtered = logs.filter(l => {
      if (siteFilter !== 'all' && l.site !== siteFilter) return false;
      if (showErrorsOnly && !l.error) return false;
      if (filter) {
        const f = filter.toLowerCase();
        if (!(l.visitor_msg || '').toLowerCase().includes(f)
            && !(l.assistant_msg || '').toLowerCase().includes(f)) return false;
      }
      return true;
    });
    // Logs come in DESC order. Group by session preserving that.
    const sessions = new Map();
    for (const l of filtered) {
      const key = l.session_id || `solo-${l.id}`;
      if (!sessions.has(key)) sessions.set(key, []);
      sessions.get(key).push(l);
    }
    // Sort each session ASC (oldest turn first within a session) so the
    // conversation reads naturally top-to-bottom inside its block.
    return [...sessions.values()].map(turns => {
      const asc = [...turns].reverse();
      return {
        sessionId: turns[0].session_id || null,
        site: turns[0].site,
        startedAt: asc[0].created_at,
        lastAt: asc[asc.length - 1].created_at,
        turns: asc,
        errorCount: asc.filter(t => t.error).length,
      };
    }).sort((a, b) => new Date(b.lastAt) - new Date(a.lastAt));
  }, [logs, siteFilter, showErrorsOnly, filter]);

  if (logs == null) {
    return <div style={{ textAlign: 'center', padding: 60, color: C.td, fontFamily: FB, fontSize: 13 }}>Loading chat logs…</div>;
  }

  const total = logs.length;
  const errors = logs.filter(l => l.error).length;
  const sessions = new Set(logs.map(l => l.session_id || `solo-${l.id}`)).size;

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
        <div>
          <div style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, color: C.tm, letterSpacing: '0.18em', textTransform: 'uppercase' }}>CHAT AUDIT</div>
          <div style={{ fontFamily: FB, fontSize: 12, color: C.tm, marginTop: 4 }}>
            {migrationMissing
              ? 'chat_logs table not found — apply scripts/migrations/2026-05-02-chat-logs.sql in Supabase Studio.'
              : `${sessions} session${sessions === 1 ? '' : 's'} · ${total} turn${total === 1 ? '' : 's'} · ${errors} error${errors === 1 ? '' : 's'}`}
          </div>
        </div>
        <button onClick={reload}
          style={{ background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, color: C.tm, borderRadius: 0, padding: '8px 14px', fontFamily: FN, fontSize: 11, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.18em' }}>↻ REFRESH</button>
      </div>

      {/* Filter row */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
        {['all', 'expo-app', 'expo-il'].map(s => (
          <button key={s} onClick={() => setSiteFilter(s)}
            style={{
              background: 'var(--c-sf)',
              border: `${siteFilter === s ? '1px' : '0.25px'} solid ${siteFilter === s ? C.ac : C.cardBd}`,
              color: siteFilter === s ? C.ac : C.tm,
              borderRadius: 0, padding: '6px 12px',
              fontFamily: FN, fontSize: 11, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.18em',
            }}>{s === 'all' ? 'ALL SITES' : s.toUpperCase()}</button>
        ))}
        <button onClick={() => setShowErrorsOnly(v => !v)}
          style={{
            background: 'var(--c-sf)',
            border: `${showErrorsOnly ? '1px' : '0.25px'} solid ${showErrorsOnly ? C.rd : C.cardBd}`,
            color: showErrorsOnly ? C.rd : C.tm,
            borderRadius: 0, padding: '6px 12px',
            fontFamily: FN, fontSize: 11, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.18em',
          }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: '-1px', marginRight: 4 }}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>ERRORS ONLY</button>
        <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter by message text…"
          style={{
            background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderRadius: 0,
            padding: '7px 12px', color: C.tx, fontFamily: FB, fontSize: 13,
            outline: 'none', minWidth: 220, marginLeft: 'auto',
          }} />
      </div>

      {grouped.length === 0 ? (
        <div style={{ background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderRadius: 0, padding: 40, textAlign: 'center' }}>
          <div style={{ fontFamily: FN, fontSize: 9, color: C.tm, letterSpacing: '0.18em', fontWeight: 700, marginBottom: 8 }}>
            {migrationMissing ? 'MIGRATION NOT APPLIED' : 'NO CHAT TURNS YET'}
          </div>
          <div style={{ fontFamily: FB, fontSize: 13, color: C.tm, lineHeight: 1.5 }}>
            {migrationMissing
              ? 'Apply scripts/migrations/2026-05-02-chat-logs.sql in Supabase Studio to start logging.'
              : 'When a visitor talks to the chat on either site, the conversation will show up here.'}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {grouped.map(g => (
            <CollapsibleSection key={g.sessionId || g.startedAt}
              defaultOpen={false}
              leftStripe={g.errorCount > 0 ? C.rd : undefined}
              style={{ marginBottom: 0 }}
              titleNode={<span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <span style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, color: '#FFFFFF', border: '1px solid rgba(255,255,255,0.6)', borderRadius: 0, padding: '2px 6px', letterSpacing: '0.18em' }}>{(g.site || '').toUpperCase()}</span>
                <span style={{ fontFamily: FB, color: 'rgba(255,255,255,0.85)', fontSize: 11 }}>{g.turns.length} turn{g.turns.length === 1 ? '' : 's'}</span>
                {g.errorCount > 0 && <span style={{ fontFamily: FN, color: '#FFFFFF', fontSize: 10, fontWeight: 700 }}>⚠ {g.errorCount}</span>}
              </span>}
              right={<span style={{ fontFamily: FN, color: 'rgba(255,255,255,0.72)', fontSize: 10 }} title={fmtDate(g.lastAt)}>{ago(g.lastAt)} ago</span>}>
              {/* Turns */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {g.turns.map(t => (
                  <div key={t.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{
                      alignSelf: 'flex-start', maxWidth: '85%',
                      background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`,
                      borderRadius: 0, padding: '7px 11px',
                      fontSize: 13, lineHeight: 1.45, color: C.tx,
                      whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                    }}>
                      <span style={{ fontFamily: FN, fontSize: 9, color: C.tm, letterSpacing: '0.18em', fontWeight: 700, marginRight: 6 }}>VISITOR</span>
                      {t.visitor_msg || <em style={{ color: C.td }}>(empty)</em>}
                    </div>
                    {t.error ? (
                      <div style={{
                        alignSelf: 'flex-end', maxWidth: '85%',
                        background: 'var(--c-sf)', border: `1px solid ${C.rd}`,
                        borderRadius: 0, padding: '7px 11px',
                        fontSize: 12, lineHeight: 1.4, color: C.rd,
                      }}>
                        <span style={{ fontFamily: FN, fontSize: 9, color: C.rd, letterSpacing: '0.18em', fontWeight: 700, marginRight: 6 }}>ERROR</span>
                        {t.error}
                      </div>
                    ) : t.assistant_msg ? (
                      <div style={{
                        alignSelf: 'flex-end', maxWidth: '85%',
                        background: 'var(--c-sf)', border: `1px solid ${C.ac}`,
                        borderRadius: 0, padding: '7px 11px',
                        fontSize: 13, lineHeight: 1.45, color: C.tx,
                        whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                      }}>
                        <span style={{ fontFamily: FN, fontSize: 9, color: C.ac, letterSpacing: '0.18em', fontWeight: 700, marginRight: 6 }}>BOT</span>
                        {renderBold(t.assistant_msg)}
                      </div>
                    ) : (
                      <div style={{ alignSelf: 'flex-end', fontFamily: FN, fontSize: 10, color: C.td, fontStyle: 'italic' }}>(no reply recorded)</div>
                    )}
                    <div style={{ alignSelf: 'flex-end', fontFamily: FN, fontSize: 9, color: C.td }} title={fmtDate(t.created_at)}>{ago(t.created_at)} ago</div>
                  </div>
                ))}
              </div>
            </CollapsibleSection>
          ))}
        </div>
      )}
    </div>
  );
}
