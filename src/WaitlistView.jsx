// WaitlistView: dedicated /coach/waitlist page. Surfaces every coach_waitlist
// signup (active + already-contacted) so Ohad can drill into the funnel
// instead of just glancing at the dashboard chip.
//
// Notes are stored in the `store` table under key `expo-lead-notes` as a
// {[leadId]: 'text'} blob — no schema migration needed and they sync across
// devices via the same path every other coach-side blob uses.

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { C, FN, FB } from './theme';
import { isRefined5b, confirmToast } from './ui';
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

// Time-to-contact human formatter.
function fmtTtc(ms) {
  if (ms == null || !Number.isFinite(ms)) return '—';
  const hours = ms / 3600000;
  if (hours < 1) return `${Math.round(ms / 60000)}m`;
  if (hours < 24) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

// Stat tile used in the funnel strip. `sub` is a small caption shown below
// the main value (e.g. percentage of total). `color` tints the value text.
function StatTile({ label, value, sub, color }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontFamily: FN, fontSize: 9, color: C.tm, letterSpacing: '0.18em', fontWeight: 700, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontFamily: FN, fontSize: 18, color: color || C.tx, fontWeight: 700, marginTop: 2 }}>{value}</div>
      {sub && <div style={{ fontFamily: FB, fontSize: 10, color: C.tm, marginTop: 1 }}>{sub}</div>}
    </div>
  );
}

export default function WaitlistView({ trainees }) {
  const [leads, setLeads] = useState(null);
  const [notes, setNotes] = useState({});
  const [savingNote, setSavingNote] = useState(null);
  const [sort, setSort] = useState('date');
  const [dir, setDir] = useState(-1);
  const [filter, setFilter] = useState('');

  const reload = useCallback(async () => {
    // Pull every coach_waitlist row (including contacted ones) — funnel
    // history, not just the action queue. CoachChat captures already write
    // context=coach_waitlist with source=expo-app-chat, so they're included.
    // Tries with the full enriched column set first; falls back layer by
    // layer if migrations haven't been applied yet.
    const baseQuery = (cols) => supabase
      .from('leads')
      .select(cols)
      .eq('context', 'coach_waitlist')
      .order('created_at', { ascending: false })
      .limit(500);
    try {
      const r1 = await baseQuery('id,email,source,context,user_agent,created_at,consumed_at,notes,interests,pain_points,programs_mentioned');
      if (!r1.error) { setLeads(r1.data || []); }
      else {
        const r2 = await baseQuery('id,email,source,context,user_agent,created_at,consumed_at,notes');
        if (!r2.error) { setLeads(r2.data || []); }
        else {
          const r3 = await baseQuery('id,email,source,context,user_agent,created_at,consumed_at');
          if (!r3.error) setLeads(r3.data || []);
        }
      }
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
  // Per-id debounce timers — keyed by lead id so editing two notes
  // concurrently doesn't have keystrokes on note B clobber note A's
  // pending persist (which the single shared timer used to do).
  const setNoteTimersRef = useRef({});
  const setNote = (id, text) => {
    const next = { ...notes, [id]: text };
    setNotes(next);
    setSavingNote(id);
    if (setNoteTimersRef.current[id]) clearTimeout(setNoteTimersRef.current[id]);
    setNoteTimersRef.current[id] = setTimeout(() => {
      persistNotes(next);
      setSavingNote(null);
      delete setNoteTimersRef.current[id];
    }, 600);
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
    // confirmToast — iOS PWA blocks the native confirm() dialog.
    if (!(await confirmToast('Delete this lead permanently?', { okLabel: 'Delete', cancelLabel: 'Cancel' }))) return;
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

  // Funnel conversion stats. Cross-references lead emails against the live
  // trainees list so a lead that ended up signing on shows up as conversion
  // even though we never explicitly tag a lead as "converted". Couple
  // members are flattened (each member email counts).
  const stats = useMemo(() => {
    if (total === 0) return null;
    const contacted = enriched.filter(l => l.contacted);
    const contactedCount = contacted.length;
    const contactRate = total > 0 ? contactedCount / total : 0;

    const sourceCount = { chat: 0, form: 0, paid: 0, other: 0 };
    for (const l of enriched) {
      if (l.source === 'expo-app-chat') sourceCount.chat++;
      else if (l.source === 'expo-app') sourceCount.form++;
      else if (l.source === 'paid' || l.source === 'ad') sourceCount.paid++;
      else sourceCount.other++;
    }

    // Median time-to-contact across leads that have both timestamps.
    const ttcMs = contacted
      .map(l => (l.created_at && l.consumed_at) ? new Date(l.consumed_at).getTime() - new Date(l.created_at).getTime() : null)
      .filter(d => Number.isFinite(d) && d >= 0)
      .sort((a, b) => a - b);
    const ttcMedianMs = ttcMs.length ? ttcMs[Math.floor(ttcMs.length / 2)] : null;

    // Build a lowercase email set from trainees (top-level + couple members,
    // arrays + scalars). Any lead whose email matches counts as converted.
    const traineeEmails = new Set();
    const addEmail = (e) => { if (typeof e === 'string' && e.trim()) traineeEmails.add(e.trim().toLowerCase()); };
    for (const t of trainees || []) {
      if (Array.isArray(t.email)) t.email.forEach(addEmail);
      else addEmail(t.email);
      if (Array.isArray(t.members)) {
        for (const m of t.members) {
          if (Array.isArray(m.email)) m.email.forEach(addEmail);
          else addEmail(m.email);
        }
      }
    }
    const signupCount = enriched.filter(l => l.email && traineeEmails.has(String(l.email).toLowerCase())).length;
    const signupRate = contactedCount > 0 ? signupCount / contactedCount : 0;

    const avgIntent = enriched.reduce((a, l) => a + (l.intent || 0), 0) / total;

    return { contactedCount, contactRate, sourceCount, ttcMedianMs, signupCount, signupRate, avgIntent };
  }, [enriched, trainees, total]);

  const toggleSort = (k) => { if (sort === k) setDir(d => d * -1); else { setSort(k); setDir(k === 'date' ? -1 : 1); } };
  const SH = ({ k, label }) => {
    const refined = isRefined5b();
    const color = refined ? '#FFFFFF' : (sort === k ? C.ac : C.tm);
    return (
      <th onClick={() => toggleSort(k)} style={{ textAlign: 'left', padding: '10px 12px', fontSize: 9, fontFamily: FN, color, textTransform: 'uppercase', letterSpacing: '0.18em', fontWeight: 700, cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', opacity: refined && sort !== k ? 0.78 : 1 }}>
        {label} {sort === k ? (dir === 1 ? '↑' : '↓') : ''}
      </th>
    );
  };

  if (leads == null) {
    return <div style={{ textAlign: 'center', padding: 60, color: C.td, fontFamily: FB, fontSize: 13 }}>Loading waitlist…</div>;
  }

  return (
    <div>
      {/* Header + gate progress */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 18, background: isRefined5b() ? '#FFFFFF' : C.sf, border: `1px solid ${isRefined5b() ? C.cardBd : C.bd}`, padding: '14px 18px' }}>
        <div>
          <div style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, color: C.tm, letterSpacing: '0.18em', textTransform: 'uppercase' }}>COACH WAITLIST</div>
          <div style={{ fontFamily: FB, fontSize: 12, color: C.tm, marginTop: 4 }}>
            {total} total · {active} uncontacted · gate at {COACH_GATE}+ serious signups
          </div>
        </div>
        <div style={{ background: 'var(--c-sf)', border: `1px solid ${gateColor}`, borderRadius: 0, padding: '12px 18px', minWidth: 220 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
            <span style={{ fontFamily: FN, fontSize: 9, color: gateColor, letterSpacing: '0.18em', fontWeight: 700 }}>🎯 MULTI-TENANT GATE</span>
            <span style={{ fontFamily: FN, fontSize: 14, color: gateColor, fontWeight: 700 }}>{gateProgress}/{COACH_GATE}</span>
          </div>
          <div style={{ height: 6, background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderRadius: 0, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${(gateProgress / COACH_GATE) * 100}%`, background: gateColor, transition: 'width 0.3s' }} />
          </div>
          <div style={{ fontFamily: FB, fontSize: 10, color: C.tm, marginTop: 6 }}>
            {gateOpen ? 'Gate open — apply scripts/migrations/2026-05-01-multi-tenant-DRAFT.sql.' : 'Migration applies once threshold hits.'}
          </div>
        </div>
      </div>

      {/* Funnel conversion strip — six tiles covering volume, contact rate,
          time-to-contact, source split, signup conversion, and avg intent.
          Hidden when there are no leads at all. */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16, marginBottom: 14, padding: '14px 18px', border: `1px solid ${C.cardBd}` }}>
          <StatTile label="Leads" value={total} sub={`${active} uncontacted`} />
          <StatTile label="Contact rate" value={`${(stats.contactRate * 100).toFixed(0)}%`} sub={`${stats.contactedCount} / ${total}`} color={stats.contactRate >= 0.8 ? C.gn : (stats.contactRate >= 0.5 ? C.or : C.rd)} />
          <StatTile label="Median t→contact" value={fmtTtc(stats.ttcMedianMs)} sub={stats.contactedCount === 0 ? 'no contacted yet' : `across ${stats.contactedCount}`} />
          <StatTile label="Signed up" value={stats.signupCount} sub={stats.contactedCount === 0 ? '—' : `${(stats.signupRate * 100).toFixed(0)}% of contacted`} color={C.ac} />
          <StatTile label="Source mix" value={`${stats.sourceCount.chat} · ${stats.sourceCount.form} · ${stats.sourceCount.paid}`} sub="chat · form · paid" />
          <StatTile label="Avg intent" value={`${stats.avgIntent.toFixed(1)} / 4`} color={stats.avgIntent >= 2.5 ? C.ac : C.tm} />
        </div>
      )}

      {/* Filter */}
      <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'flex-start' }}>
        <input placeholder="Filter by email, source, or notes…" value={filter} onChange={e => setFilter(e.target.value)}
          style={{ background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderRadius: 0, padding: '8px 12px', color: C.tx, fontFamily: FB, fontSize: 13, outline: 'none', minWidth: 280 }} />
      </div>

      {sorted.length === 0 ? (
        <div style={{ background: isRefined5b() ? '#FFFFFF' : 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderRadius: 0, padding: 40, textAlign: 'center' }}>
          <div style={{ fontFamily: FN, fontSize: 9, color: C.tm, letterSpacing: '0.18em', fontWeight: 700, marginBottom: 8 }}>NO COACH SIGNUPS YET</div>
          <div style={{ fontFamily: FB, fontSize: 13, color: C.tm }}>
            When a coach submits the form on /coaches#waitlist, they'll appear here.
          </div>
        </div>
      ) : (() => {
        const refined = isRefined5b();
        const headBorder = refined ? `rgba(0,0,0,0.10)` : C.cardBd;
        return (
        <div style={{ overflowX: 'auto', background: refined ? '#FFFFFF' : 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderRadius: 0 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: FB, fontSize: 13 }}>
            <thead>
              <tr style={{ background: refined ? 'var(--c-sf)' : 'transparent', borderBottom: `1px solid ${headBorder}` }}>
                <SH k="email" label="Email" />
                <th style={{ textAlign: 'left', padding: '10px 12px', fontSize: 9, fontFamily: FN, color: refined ? '#FFFFFF' : C.tm, textTransform: 'uppercase', letterSpacing: '0.18em', fontWeight: 700 }}>Source</th>
                <SH k="intent" label="Intent" />
                <SH k="date" label="Signed up" />
                <SH k="status" label="Status" />
                <th style={{ textAlign: 'left', padding: '10px 12px', fontSize: 9, fontFamily: FN, color: refined ? '#FFFFFF' : C.tm, textTransform: 'uppercase', letterSpacing: '0.18em', fontWeight: 700, minWidth: 220 }}>Notes</th>
                <th style={{ textAlign: 'center', padding: '10px 12px', fontSize: 9, fontFamily: FN, color: refined ? '#FFFFFF' : C.tm, textTransform: 'uppercase', letterSpacing: '0.18em', fontWeight: 700 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(l => {
                const stars = '★'.repeat(l.intent) + '☆'.repeat(4 - l.intent);
                const mailto = `mailto:${l.email}?subject=${encodeURIComponent('EXPO — coach waitlist')}&body=${encodeURIComponent('Hey,\n\nSaw you joined the EXPO coach waitlist. Got 15 minutes for a video call this week to talk shop?\n\n— Ohad\n')}`;
                return (
                  <tr key={l.id} style={{ borderBottom: `1px solid ${C.cardBd}`, opacity: l.contacted ? 0.55 : 1 }}>
                    <td style={{ padding: '10px 12px' }}>
                      <a href={mailto} style={{ color: C.tx, textDecoration: 'none', fontWeight: 600 }} title={l.email}>{l.email}</a>
                      {l.notes && (
                        <div title="AI summary of the chat conversation"
                          style={{ fontFamily: FB, fontSize: 11, color: C.tm, fontStyle: 'italic', marginTop: 4, lineHeight: 1.35, maxWidth: 320, whiteSpace: 'normal' }}>
                          💬 {l.notes}
                        </div>
                      )}
                      {(() => {
                        const tags = [
                          ...(Array.isArray(l.programs_mentioned) ? l.programs_mentioned.map(t => ({ t, kind: 'program' })) : []),
                          ...(Array.isArray(l.interests) ? l.interests.map(t => ({ t, kind: 'interest' })) : []),
                          ...(Array.isArray(l.pain_points) ? l.pain_points.map(t => ({ t, kind: 'pain' })) : []),
                        ];
                        if (tags.length === 0) return null;
                        return (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6, maxWidth: 320 }}>
                            {tags.map(({ t, kind }, i) => {
                              const color = kind === 'program' ? C.ac : (kind === 'pain' ? C.or : C.gn);
                              return (
                                <span key={`${kind}-${i}`} title={kind}
                                  style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, color, background: 'var(--c-sf)', border: `1px solid ${color}`, borderRadius: 0, padding: '1px 5px', letterSpacing: '0.18em' }}>
                                  {t}
                                </span>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      {(() => {
                        const isChat = l.source === 'expo-app-chat';
                        const isForm = l.source === 'expo-app';
                        const label = isChat ? '💬 CHAT' : (isForm ? 'FORM' : (l.source || '—').toUpperCase());
                        const color = isChat ? C.gn : (isForm ? C.ac : C.tm);
                        return (
                          <span title={isChat ? 'Captured via /coaches chat bot' : (isForm ? 'Submitted via /coaches waitlist form' : l.source)}
                            style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, color, background: 'var(--c-sf)', border: `1px solid ${color}`, borderRadius: 0, padding: '3px 6px', letterSpacing: '0.18em' }}>
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
                        <span style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, color: C.gn, background: 'var(--c-sf)', border: `1px solid ${C.gn}`, borderRadius: 0, padding: '3px 6px', letterSpacing: '0.18em' }} title={`Contacted ${ago(l.consumed_at)} ago`}>CONTACTED</span>
                      ) : (
                        <span style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, color: C.ac, background: 'var(--c-sf)', border: `1px solid ${C.ac}`, borderRadius: 0, padding: '3px 6px', letterSpacing: '0.18em' }}>NEW</span>
                      )}
                    </td>
                    <td style={{ padding: '8px 10px' }}>
                      <textarea value={notes[l.id] || ''} onChange={e => setNote(l.id, e.target.value)} rows={2}
                        placeholder="What did they say in DM?"
                        style={{ width: '100%', minWidth: 200, background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderRadius: 0, padding: '6px 8px', color: C.tx, fontFamily: FB, fontSize: 12, outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
                      {savingNote === l.id && <div style={{ fontFamily: FN, fontSize: 9, color: C.td, marginTop: 2 }}>saving…</div>}
                    </td>
                    <td style={{ padding: '8px 10px', whiteSpace: 'nowrap', textAlign: 'center' }}>
                      {l.contacted ? (
                        <button onClick={() => undoContacted(l.id)} title="Undo contacted"
                          style={{ background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, color: C.tm, borderRadius: 0, padding: '4px 8px', fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', cursor: 'pointer', marginRight: 4 }}>↩ UNDO</button>
                      ) : (
                        <button onClick={() => markContacted(l.id)} title="Mark contacted"
                          style={{ background: 'var(--c-sf)', border: `1px solid ${C.gn}`, color: C.gn, borderRadius: 0, padding: '4px 8px', fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', cursor: 'pointer', marginRight: 4 }}>✓ DONE</button>
                      )}
                      <button onClick={() => removeLead(l.id)} title="Delete"
                        style={{ background: 'var(--c-sf)', border: `1px solid ${C.rd}`, color: C.rd, borderRadius: 0, padding: '4px 8px', fontFamily: FN, fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>✕</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        );
      })()}
    </div>
  );
}
