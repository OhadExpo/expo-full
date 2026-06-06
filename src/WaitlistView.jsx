// WaitlistView: dedicated /coach/waitlist page. Surfaces every coach_waitlist
// signup (active + already-contacted) so Ohad can drill into the funnel
// instead of just glancing at the dashboard chip.
//
// Notes are stored in the `store` table under key `expo-lead-notes` as a
// {[leadId]: 'text'} blob — no schema migration needed and they sync across
// devices via the same path every other coach-side blob uses.

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { C, FN, FB } from './theme';
import { isRefined5b, confirmToast, SectionLabel, CollapsibleSection } from './ui';
import { supabase } from './supabase';

const COACH_GATE = 5;
const NOTES_KEY = 'expo-lead-notes';

// F-28 — lead pipeline stages. The DB `stage` column defaults to 'lead'
// for every new row. Stages flow left → right; cold sits off to the
// right as a terminal "lost" bucket so trash doesn't pollute active
// columns.
const STAGES = [
  { id: 'lead',       label: 'NEW',        color: '#3BA0FF', hint: 'Just signed up — needs first outreach' },
  { id: 'contacted',  label: 'CONTACTED',  color: '#FFA500', hint: 'Reached out, awaiting response' },
  { id: 'trial',      label: 'TRIAL',      color: '#FFD700', hint: 'Trial session booked or scheduled' },
  { id: 'converted',  label: 'CONVERTED',  color: '#2ED573', hint: 'Signed up as a paying client' },
  { id: 'cold',       label: 'COLD',       color: '#7A7A82', hint: 'No response — archived' },
];

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

  const reload = useCallback(async (ctx) => {
    const live = () => !ctx || !ctx.cancelled;
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
      const r1 = await baseQuery('id,email,source,context,user_agent,created_at,consumed_at,notes,interests,pain_points,programs_mentioned,stage');
      if (!live()) return;
      if (!r1.error) { setLeads(r1.data || []); }
      else {
        const r2 = await baseQuery('id,email,source,context,user_agent,created_at,consumed_at,notes');
        if (!live()) return;
        if (!r2.error) { setLeads(r2.data || []); }
        else {
          const r3 = await baseQuery('id,email,source,context,user_agent,created_at,consumed_at');
          if (!live()) return;
          if (!r3.error) setLeads(r3.data || []);
        }
      }
    } catch {}
    try {
      const { data } = await supabase.from('store').select('value').eq('key', NOTES_KEY).maybeSingle();
      if (live() && data?.value && typeof data.value === 'object') setNotes(data.value);
    } catch {}
  }, []);
  // Cancellation handle for slow loads / early unmount.
  useEffect(() => {
    const ctx = { cancelled: false };
    reload(ctx);
    return () => { ctx.cancelled = true; };
  }, [reload]);

  const persistNotes = useCallback(async (next) => {
    try { await supabase.from('store').upsert({ key: NOTES_KEY, value: next }, { onConflict: 'key' }); } catch {}
  }, []);
  // Per-id debounce timers — keyed by lead id so editing two notes
  // concurrently doesn't have keystrokes on note B clobber note A's
  // pending persist (which the single shared timer used to do).
  const setNoteTimersRef = useRef({});
  // Clear pending timers on unmount so a setSavingNote(null) doesn't
  // fire on an unmounted component (React warns about it).
  useEffect(() => () => {
    Object.values(setNoteTimersRef.current).forEach(t => { try { clearTimeout(t); } catch {} });
    setNoteTimersRef.current = {};
  }, []);
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

  // F-28 — view toggle (list ↔ board)
  const [viewMode, setViewMode] = useState('list');

  // F-28 — move a lead between pipeline stages. Drag-drop and the per-row
  // arrow buttons both call this. Optimistic update + Supabase write.
  const moveLead = async (id, nextStage) => {
    if (!STAGES.find(s => s.id === nextStage)) return;
    const patch = { stage: nextStage };
    // 'contacted' / 'trial' / 'converted' all imply "I reached out"; mirror
    // to the legacy consumed_at field so the funnel KPIs and the
    // ↩ UNDO button keep working without a migration to drop the column.
    const reachedOut = nextStage !== 'lead';
    if (reachedOut) patch.consumed_at = new Date().toISOString();
    if (nextStage === 'lead') patch.consumed_at = null;
    setLeads(curr => (curr || []).map(l => l.id === id ? { ...l, ...patch } : l));
    try { await supabase.from('leads').update(patch).eq('id', id); } catch {}
  };

  const markContacted = async (id) => {
    setLeads(curr => (curr || []).map(l => l.id === id ? { ...l, consumed_at: new Date().toISOString(), stage: 'contacted' } : l));
    try { await supabase.from('leads').update({ consumed_at: new Date().toISOString(), stage: 'contacted' }).eq('id', id); } catch {}
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
            <span style={{ fontFamily: FN, fontSize: 9, color: gateColor, letterSpacing: '0.18em', fontWeight: 700 }}>MULTI-TENANT GATE</span>
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
        <CollapsibleSection title="Funnel" storageKey="waitlist-funnel" style={{ marginBottom: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16 }}>
          <StatTile label="Leads" value={total} sub={`${active} uncontacted`} />
          <StatTile label="Contact rate" value={`${(stats.contactRate * 100).toFixed(0)}%`} sub={`${stats.contactedCount} / ${total}`} color={stats.contactRate >= 0.8 ? C.gn : (stats.contactRate >= 0.5 ? C.or : C.rd)} />
          <StatTile label="Median t→contact" value={fmtTtc(stats.ttcMedianMs)} sub={stats.contactedCount === 0 ? 'no contacted yet' : `across ${stats.contactedCount}`} />
          <StatTile label="Signed up" value={stats.signupCount} sub={stats.contactedCount === 0 ? '—' : `${(stats.signupRate * 100).toFixed(0)}% of contacted`} color={C.ac} />
          <StatTile label="Source mix" value={`${stats.sourceCount.chat} · ${stats.sourceCount.form} · ${stats.sourceCount.paid}`} sub="chat · form · paid" />
          <StatTile label="Avg intent" value={`${stats.avgIntent.toFixed(1)} / 4`} color={stats.avgIntent >= 2.5 ? C.ac : C.tm} />
        </div>
        </CollapsibleSection>
      )}

      {/* Filter + F-28 view toggle */}
      <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <input placeholder="Filter by email, source, or notes…" value={filter} onChange={e => setFilter(e.target.value)}
          style={{ background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderRadius: 0, padding: '8px 12px', color: C.tx, fontFamily: FB, fontSize: 13, outline: 'none', minWidth: 280 }} />
        <div style={{ display: 'flex', gap: 4 }}>
          {['list', 'board'].map(mode => (
            <button key={mode} onClick={() => setViewMode(mode)}
              style={{
                padding: '6px 12px', borderRadius: 0,
                border: `1px solid ${viewMode === mode ? C.ac : C.cardBd}`,
                background: viewMode === mode ? 'rgba(57,189,255,0.094)' : 'transparent',
                color: viewMode === mode ? C.ac : C.tm,
                fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
                cursor: 'pointer', textTransform: 'uppercase',
              }}>{mode}</button>
          ))}
        </div>
      </div>

      {sorted.length === 0 ? (
        <div style={{ background: isRefined5b() ? '#FFFFFF' : 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderRadius: 0, padding: 40, textAlign: 'center' }}>
          <div style={{ fontFamily: FN, fontSize: 9, color: C.tm, letterSpacing: '0.18em', fontWeight: 700, marginBottom: 8 }}>NO COACH SIGNUPS YET</div>
          <div style={{ fontFamily: FB, fontSize: 13, color: C.tm }}>
            When a coach submits the form on /coaches#waitlist, they'll appear here.
          </div>
        </div>
      ) : viewMode === 'board' ? (
        <KanbanBoard leads={sorted} moveLead={moveLead} removeLead={removeLead} notes={notes} setNote={setNote} />
      ) : (() => {
        const refined = isRefined5b();
        const headBorder = refined ? `rgba(0,0,0,0.10)` : C.cardBd;
        return (
        <div style={{ background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderRadius: 0 }}>
          <div style={{ background: 'var(--c-stripBg, var(--c-sf))', borderBottom: '1px solid var(--c-cardBd)', padding: '10px 14px' }}>
            <SectionLabel as="div" style={{ color: '#FFFFFF', fontSize: C.alertLabelSize }}>Leads — {sorted.length}</SectionLabel>
          </div>
          <div style={{ overflowX: 'auto' }}>
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
                          {l.notes}
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
                        const label = isChat ? 'CHAT' : (isForm ? 'FORM' : (l.source || '—').toUpperCase());
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
        </div>
        );
      })()}
    </div>
  );
}

// F-28 — Kanban-style pipeline board with HTML5 drag-drop between
// stages. No 3rd-party DnD library; native ondrag* events are enough
// for the desktop coach surface (mobile board mode is rare; the list
// view is faster on small screens anyway).
function KanbanBoard({ leads, moveLead, removeLead, notes, setNote }) {
  const [dragId, setDragId] = useState(null);
  const [overStage, setOverStage] = useState(null);

  // Group leads by their `stage` column. Falls back to 'lead' for older
  // rows that pre-date the migration (DEFAULT 'lead' covers new ones).
  const groups = useMemo(() => {
    const g = Object.fromEntries(STAGES.map(s => [s.id, []]));
    leads.forEach(l => {
      const s = l.stage || (l.contacted ? 'contacted' : 'lead');
      if (g[s]) g[s].push(l);
      else g.lead.push(l); // unknown stage value → bucket into NEW
    });
    return g;
  }, [leads]);

  const onDragStart = (id) => (e) => {
    setDragId(id);
    try { e.dataTransfer.setData('text/plain', id); } catch {}
    e.dataTransfer.effectAllowed = 'move';
  };
  const onDragEnd = () => { setDragId(null); setOverStage(null); };
  const onDragOver = (stage) => (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setOverStage(stage); };
  const onDragLeave = (stage) => () => { setOverStage(prev => prev === stage ? null : prev); };
  const onDrop = (stage) => async (e) => {
    e.preventDefault();
    const id = dragId || (() => { try { return e.dataTransfer.getData('text/plain'); } catch { return null; } })();
    setOverStage(null);
    setDragId(null);
    if (id) await moveLead(id, stage);
  };

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${STAGES.length}, minmax(220px, 1fr))`,
      gap: 10, overflowX: 'auto',
    }}>
      {STAGES.map(stage => {
        const cards = groups[stage.id] || [];
        const isOver = overStage === stage.id;
        return (
          <div key={stage.id}
            onDragOver={onDragOver(stage.id)}
            onDragLeave={onDragLeave(stage.id)}
            onDrop={onDrop(stage.id)}
            style={{
              background: isRefined5b() ? '#FFFFFF' : 'var(--c-sf)',
              border: `1px solid ${isOver ? stage.color : C.cardBd}`,
              borderTop: `3px solid ${stage.color}`,
              padding: 10, minHeight: 240,
              transition: 'border-color 120ms',
            }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
              <span style={{
                fontFamily: FN, fontSize: 10, color: stage.color, letterSpacing: '0.18em',
                fontWeight: 700,
              }}>{stage.label}</span>
              <span style={{
                fontFamily: FN, fontSize: 11, color: C.tm, fontWeight: 700,
              }}>{cards.length}</span>
            </div>
            <div style={{ fontFamily: FB, fontSize: 10, color: C.td, marginBottom: 10, lineHeight: 1.4 }}>
              {stage.hint}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {cards.map(l => (
                <LeadCard key={l.id} lead={l}
                  draggable
                  onDragStart={onDragStart(l.id)}
                  onDragEnd={onDragEnd}
                  isDragging={dragId === l.id}
                  notes={notes}
                  setNote={setNote}
                  moveLead={moveLead}
                  removeLead={removeLead} />
              ))}
              {cards.length === 0 && (
                <div style={{ padding: 16, textAlign: 'center', color: C.td, fontFamily: FN, fontSize: 10, letterSpacing: '0.12em', fontWeight: 700, border: `1px dashed ${C.cardBd}` }}>
                  DROP HERE
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function LeadCard({ lead, draggable, onDragStart, onDragEnd, isDragging, notes, setNote, moveLead, removeLead }) {
  const l = lead;
  const stars = '★'.repeat(l.intent || 0) + '☆'.repeat(4 - (l.intent || 0));
  const stageIdx = STAGES.findIndex(s => s.id === (l.stage || 'lead'));
  const prevStage = stageIdx > 0 ? STAGES[stageIdx - 1].id : null;
  const nextStage = stageIdx >= 0 && stageIdx < STAGES.length - 1 ? STAGES[stageIdx + 1].id : null;
  return (
    <div draggable={draggable} onDragStart={onDragStart} onDragEnd={onDragEnd}
      style={{
        background: 'var(--c-bg)', border: `1px solid ${C.cardBd}`,
        padding: '10px 12px', cursor: 'grab',
        opacity: isDragging ? 0.5 : 1,
      }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 6, marginBottom: 4 }}>
        <span title={l.email} style={{
          fontSize: 12, color: C.tx, fontWeight: 700,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0,
        }}>{l.email}</span>
        <span style={{ fontFamily: FN, color: l.intent >= 3 ? C.ac : C.tm, fontSize: 11 }} title={`Intent ${l.intent}/4`}>{stars}</span>
      </div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
        <span style={{
          fontFamily: FN, fontSize: 9, color: C.tm, letterSpacing: '0.08em',
          border: `1px solid ${C.cardBd}`, padding: '1px 6px', fontWeight: 700,
        }}>{(l.source || '—').toUpperCase().slice(0, 16)}</span>
        <span style={{ fontFamily: FN, fontSize: 9, color: C.td }}>
          {ago(l.created_at)} ago
        </span>
      </div>
      {l.notes && (
        <div style={{ fontFamily: FB, fontSize: 11, color: C.tm, fontStyle: 'italic', lineHeight: 1.35, marginBottom: 6 }}>
          {l.notes.length > 100 ? `${l.notes.slice(0, 100)}…` : l.notes}
        </div>
      )}
      <textarea value={notes[l.id] || ''} onChange={e => setNote(l.id, e.target.value)} rows={2}
        placeholder="DM notes…"
        onPointerDown={e => e.stopPropagation()}
        onMouseDown={e => e.stopPropagation()}
        draggable={false}
        style={{
          width: '100%', background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`,
          borderRadius: 0, padding: '4px 6px', color: C.tx, fontFamily: FB, fontSize: 11,
          outline: 'none', resize: 'vertical', boxSizing: 'border-box', marginBottom: 6,
        }} />
      <div style={{ display: 'flex', gap: 4, justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {prevStage && (
            <button onClick={() => moveLead(l.id, prevStage)} title={`← ${STAGES.find(s => s.id === prevStage).label}`}
              style={{ background: 'transparent', border: `1px solid ${C.cardBd}`, color: C.tm, padding: '2px 6px', fontFamily: FN, fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>←</button>
          )}
          {nextStage && (
            <button onClick={() => moveLead(l.id, nextStage)} title={`→ ${STAGES.find(s => s.id === nextStage).label}`}
              style={{ background: 'transparent', border: `1px solid ${C.ac}`, color: C.ac, padding: '2px 6px', fontFamily: FN, fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>→</button>
          )}
        </div>
        <button onClick={() => removeLead(l.id)} title="Delete"
          style={{ background: 'transparent', border: `1px solid ${C.rd}`, color: C.rd, padding: '2px 6px', fontFamily: FN, fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>✕</button>
      </div>
    </div>
  );
}
