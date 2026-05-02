// WaitlistView: dedicated /coach/waitlist page. Surfaces every coach_waitlist
// signup (active + already-contacted) so Ohad can drill into the funnel
// instead of just glancing at the dashboard chip.
//
// Notes are stored in the `store` table under key `expo-lead-notes` as a
// {[leadId]: 'text'} blob — no schema migration needed and they sync across
// devices via the same path every other coach-side blob uses.

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { C, FN, FB } from './theme';
import { supabase } from './supabase';

const COACH_GATE = 5;
const NOTES_KEY = 'expo-lead-notes';

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
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

// Intent score: +2 for paid source (ad clickthrough), +1 for .il email
// (locally reachable for a video call), +1 for any user_agent string (real
// browser, not a bot probe). Caps at 4. Used as visual signal only — Ohad
// reads each lead manually anyway.
function scoreLead(l) {
  let s = 0;
  if (l.source === 'paid' || l.source === 'ad') s += 2;
  if (typeof l.email === 'string' && /\.il$/i.test(l.email.split('@')[1] || '')) s += 1;
  if (l.user_agent && l.user_agent.length > 10) s += 1;
  return Math.min(s, 4);
}

export default function WaitlistView() {
  const [leads, setLeads] = useState(null);
  const [notes, setNotes] = useState({});
  const [savingNote, setSavingNote] = useState(null);
  const [sort, setSort] = useState('date');
  const [dir, setDir] = useState(-1);
  const [filter, setFilter] = useState('');

  const reload = useCallback(async () => {
    try {
      // Pull every coach_waitlist row (including contacted ones) — funnel
      // history, not just the action queue. CoachChat captures already write
      // context=coach_waitlist with source=expo-app-chat, so they're included.
      const { data, error } = await supabase
        .from('leads')
        .select('id,email,source,context,user_agent,created_at,consumed_at')
        .eq('context', 'coach_waitlist')
        .order('created_at', { ascending: false })
        .limit(500);
      if (!error) setLeads(data || []);
    } catch {}
    try {
      const { data } = await supabase.from('store').select('value').eq('key', NOTES_KEY).maybeSingle();
      if (data?.value && typeof data.value === 'object') setNotes(data.value);
    } catch {}
  }, []);
  useEffect(() => { reload(); }, [reload]);

  const persistNotes = useCallback(async (next) => {
    try { await supabase.from('store').upsert({ key: NOTES_KEY, value: next }, { onConflict: 'key' }); } catch {}
  }, []);
  const setNote = (id, text) => {
    const next = { ...notes, [id]: text };
    setNotes(next);
    setSavingNote(id);
    // Debounce-ish via per-id timer (cleared on each keystroke).
    clearTimeout(setNote._t);
    setNote._t = setTimeout(() => { persistNotes(next); setSavingNote(null); }, 600);
  };

  const markContacted = async (id) => {
    setLeads(curr => (curr || []).map(l => l.id === id ? { ...l, consumed_at: new Date().toISOString() } : l));
    try { await supabase.from('leads').update({ consumed_at: new Date().toISOString() }).eq('id', id); } catch {}
  };
  const undoContacted = async (id) => {
    setLeads(curr => (curr || []).map(l => l.id === id ? { ...l, consumed_at: null } : l));
    try { await supabase.from('leads').update({ consumed_at: null }).eq('id', id); } catch {}
  };
  const removeLead = async (id) => {
    if (!confirm('Delete this lead permanently?')) return;
    setLeads(curr => (curr || []).filter(l => l.id !== id));
    try { await supabase.from('leads').delete().eq('id', id); } catch {}
  };

  const enriched = useMemo(() => (leads || []).map(l => ({
    ...l,
    intent: scoreLead(l),
    contacted: !!l.consumed_at,
  })), [leads]);

  const filtered = enriched.filter(l => {
    if (!filter) return true;
    const f = filter.toLowerCase();
    return (l.email || '').toLowerCase().includes(f)
        || (l.source || '').toLowerCase().includes(f)
        || (notes[l.id] || '').toLowerCase().includes(f);
  });
  const sorted = [...filtered].sort((a, b) => {
    if (sort === 'email') return (a.email || '').localeCompare(b.email || '') * dir;
    if (sort === 'intent') return (a.intent - b.intent) * dir;
    if (sort === 'status') return ((a.contacted ? 1 : 0) - (b.contacted ? 1 : 0)) * dir;
    return (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * dir;
  });

  const total = enriched.length;
  const active = enriched.filter(l => !l.contacted).length;
  const gateProgress = Math.min(active, COACH_GATE);
  const gateOpen = active >= COACH_GATE;
  const gateColor = gateOpen ? C.gn : (active > 0 ? C.or : C.td);

  const toggleSort = (k) => { if (sort === k) setDir(d => d * -1); else { setSort(k); setDir(k === 'date' ? -1 : 1); } };
  const SH = ({ k, label }) => (
    <th onClick={() => toggleSort(k)} style={{ textAlign: 'left', padding: '10px 12px', fontSize: 10, fontFamily: FN, color: sort === k ? C.ac : C.td, textTransform: 'uppercase', letterSpacing: '0.05em', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
      {label} {sort === k ? (dir === 1 ? '↑' : '↓') : ''}
    </th>
  );

  if (leads == null) {
    return <div style={{ textAlign: 'center', padding: 60, color: C.td, fontFamily: FB, fontSize: 13 }}>Loading waitlist…</div>;
  }

  return (
    <div>
      {/* Header + gate progress */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
        <div>
          <div style={{ fontFamily: FN, fontSize: 18, fontWeight: 700, color: C.tx }}>Coach Waitlist</div>
          <div style={{ fontFamily: FB, fontSize: 12, color: C.td, marginTop: 4 }}>
            {total} total · {active} uncontacted · gate at {COACH_GATE}+ serious signups
          </div>
        </div>
        <div style={{ background: C.sf, border: `1px solid ${gateColor}55`, borderRadius: 10, padding: '12px 18px', minWidth: 220 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
            <span style={{ fontFamily: FN, fontSize: 9, color: gateColor, letterSpacing: 1, fontWeight: 700 }}>🎯 MULTI-TENANT GATE</span>
            <span style={{ fontFamily: FN, fontSize: 14, color: gateColor, fontWeight: 700 }}>{gateProgress}/{COACH_GATE}</span>
          </div>
          <div style={{ height: 6, background: C.bd, borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${(gateProgress / COACH_GATE) * 100}%`, background: gateColor, transition: 'width 0.3s' }} />
          </div>
          <div style={{ fontFamily: FB, fontSize: 10, color: C.tm, marginTop: 6 }}>
            {gateOpen ? 'Gate open — apply scripts/migrations/2026-05-01-multi-tenant-DRAFT.sql.' : 'Migration applies once threshold hits.'}
          </div>
        </div>
      </div>

      {/* Filter */}
      <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'flex-start' }}>
        <input placeholder="Filter by email, source, or notes…" value={filter} onChange={e => setFilter(e.target.value)}
          style={{ background: C.sf, border: `0.25px solid ${C.ac}4D`, borderRadius: 8, padding: '8px 12px', color: C.tx, fontFamily: FB, fontSize: 13, outline: 'none', minWidth: 280 }} />
      </div>

      {sorted.length === 0 ? (
        <div style={{ background: C.sf, border: `0.25px solid ${C.ac}4D`, borderRadius: 10, padding: 40, textAlign: 'center' }}>
          <div style={{ fontFamily: FN, fontSize: 11, color: C.td, letterSpacing: 1.5, marginBottom: 8 }}>NO COACH SIGNUPS YET</div>
          <div style={{ fontFamily: FB, fontSize: 13, color: C.tm }}>
            When a coach submits the form on /coaches#waitlist, they'll appear here.
          </div>
        </div>
      ) : (
        <div style={{ overflowX: 'auto', background: C.sf, border: `0.25px solid ${C.ac}4D`, borderRadius: 10 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: FB, fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${C.bd}` }}>
                <SH k="email" label="Email" />
                <th style={{ textAlign: 'left', padding: '10px 12px', fontSize: 10, fontFamily: FN, color: C.td, textTransform: 'uppercase' }}>Source</th>
                <SH k="intent" label="Intent" />
                <SH k="date" label="Signed up" />
                <SH k="status" label="Status" />
                <th style={{ textAlign: 'left', padding: '10px 12px', fontSize: 10, fontFamily: FN, color: C.td, textTransform: 'uppercase', minWidth: 220 }}>Notes</th>
                <th style={{ textAlign: 'center', padding: '10px 12px', fontSize: 10, fontFamily: FN, color: C.td, textTransform: 'uppercase' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(l => {
                const stars = '★'.repeat(l.intent) + '☆'.repeat(4 - l.intent);
                const mailto = `mailto:${l.email}?subject=${encodeURIComponent('EXPO — coach waitlist')}&body=${encodeURIComponent('Hey,\n\nSaw you joined the EXPO coach waitlist. Got 15 minutes for a video call this week to talk shop?\n\n— Ohad\n')}`;
                return (
                  <tr key={l.id} style={{ borderBottom: `1px solid ${C.bd}`, opacity: l.contacted ? 0.55 : 1 }}>
                    <td style={{ padding: '10px 12px' }}>
                      <a href={mailto} style={{ color: C.tx, textDecoration: 'none', fontWeight: 600 }} title={l.email}>{l.email}</a>
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      {(() => {
                        const isChat = l.source === 'expo-app-chat';
                        const isForm = l.source === 'expo-app';
                        const label = isChat ? '💬 CHAT' : (isForm ? 'FORM' : (l.source || '—').toUpperCase());
                        const color = isChat ? C.gn : (isForm ? C.ac : C.tm);
                        return (
                          <span title={isChat ? 'Captured via /coaches chat bot' : (isForm ? 'Submitted via /coaches waitlist form' : l.source)}
                            style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, color, background: `${color}20`, border: `1px solid ${color}55`, borderRadius: 4, padding: '3px 6px', letterSpacing: 0.5 }}>
                            {label}
                          </span>
                        );
                      })()}
                    </td>
                    <td style={{ padding: '10px 12px', fontFamily: FN, color: l.intent >= 3 ? C.ac : (l.intent >= 1 ? C.tm : C.td), fontSize: 13 }} title={`Intent ${l.intent}/4`}>
                      {stars}
                    </td>
                    <td style={{ padding: '10px 12px', color: C.tm, fontSize: 12 }} title={fmtDate(l.created_at)}>
                      {ago(l.created_at)} ago
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      {l.contacted ? (
                        <span style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, color: C.gn, background: `${C.gn}20`, border: `1px solid ${C.gn}55`, borderRadius: 4, padding: '3px 6px' }} title={`Contacted ${ago(l.consumed_at)} ago`}>CONTACTED</span>
                      ) : (
                        <span style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, color: C.ac, background: `${C.ac}20`, border: `1px solid ${C.ac}55`, borderRadius: 4, padding: '3px 6px' }}>NEW</span>
                      )}
                    </td>
                    <td style={{ padding: '8px 10px' }}>
                      <textarea value={notes[l.id] || ''} onChange={e => setNote(l.id, e.target.value)} rows={2}
                        placeholder="What did they say in DM?"
                        style={{ width: '100%', minWidth: 200, background: C.bg, border: `0.25px solid ${C.ac}33`, borderRadius: 6, padding: '6px 8px', color: C.tx, fontFamily: FB, fontSize: 12, outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
                      {savingNote === l.id && <div style={{ fontFamily: FN, fontSize: 9, color: C.td, marginTop: 2 }}>saving…</div>}
                    </td>
                    <td style={{ padding: '8px 10px', whiteSpace: 'nowrap', textAlign: 'center' }}>
                      {l.contacted ? (
                        <button onClick={() => undoContacted(l.id)} title="Undo contacted"
                          style={{ background: 'transparent', border: `1px solid ${C.tm}55`, color: C.tm, borderRadius: 6, padding: '4px 8px', fontFamily: FN, fontSize: 10, fontWeight: 700, cursor: 'pointer', marginRight: 4 }}>↩ UNDO</button>
                      ) : (
                        <button onClick={() => markContacted(l.id)} title="Mark contacted"
                          style={{ background: `${C.gn}20`, border: `1px solid ${C.gn}55`, color: C.gn, borderRadius: 6, padding: '4px 8px', fontFamily: FN, fontSize: 10, fontWeight: 700, cursor: 'pointer', marginRight: 4 }}>✓ DONE</button>
                      )}
                      <button onClick={() => removeLead(l.id)} title="Delete"
                        style={{ background: `${C.rd}20`, border: `1px solid ${C.rd}55`, color: C.rd, borderRadius: 6, padding: '4px 8px', fontFamily: FN, fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>✕</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
