// Trainer-only triage surface for in-app bug reports.
//
// Reads public.bug_reports (RLS already gates SELECT to the trainer
// email). Filter pills toggle status (OPEN / TRIAGED / FIXED). Each
// row expands to show the full description + auto-captured context
// (UA, viewport, theme, bundle hash, last 10 console errors,
// localStorage key list). Trainer can mark status + add a free-text
// note + record a "fixed in <commit>" tag.

import React, { useEffect, useState, useCallback } from 'react';
import { C, FN, FB } from './theme';
import { supabase } from './supabase';
import { isRefined5b, RefinedHeaderStrip, confirmToast, toast } from './ui';

const STATUS_PILLS = [
  { id: 'open',    label: 'OPEN',    color: C.rd },
  { id: 'triaged', label: 'TRIAGED', color: C.or },
  { id: 'fixed',   label: 'FIXED',   color: C.gn },
  { id: 'all',     label: 'ALL',     color: C.ac },
];

function fmtTs(s) {
  try { return new Date(s).toLocaleString(); } catch { return s; }
}

export default function BugsView() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('open');
  const [expandedId, setExpandedId] = useState(null);

  const reload = useCallback(async () => {
    setLoading(true);
    let q = supabase.from('bug_reports').select('*').order('created_at', { ascending: false }).limit(200);
    if (filter !== 'all') q = q.eq('status', filter);
    const { data, error } = await q;
    if (error) {
      toast(`Could not load bug reports: ${error.message}`, 'error', { ttl: 6000 });
      setRows([]);
    } else {
      setRows(data || []);
    }
    setLoading(false);
  }, [filter]);

  useEffect(() => { reload(); }, [reload]);

  const counts = rows.reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc; }, {});

  const setStatus = async (id, status) => {
    const { error } = await supabase.from('bug_reports').update({ status }).eq('id', id);
    if (error) { toast(`Update failed: ${error.message}`, 'error'); return; }
    setRows(prev => prev.map(r => r.id === id ? { ...r, status } : r));
  };

  const setFixedIn = async (id, commit) => {
    const { error } = await supabase.from('bug_reports').update({ fixed_in_commit: commit, status: 'fixed' }).eq('id', id);
    if (error) { toast(`Update failed: ${error.message}`, 'error'); return; }
    setRows(prev => prev.map(r => r.id === id ? { ...r, status: 'fixed', fixed_in_commit: commit } : r));
  };

  const setNotes = async (id, notes) => {
    const { error } = await supabase.from('bug_reports').update({ notes }).eq('id', id);
    if (error) { toast(`Update failed: ${error.message}`, 'error'); return; }
    setRows(prev => prev.map(r => r.id === id ? { ...r, notes } : r));
  };

  const remove = async (id) => {
    if (!(await confirmToast('Delete this bug report permanently?', { okLabel: 'Delete', cancelLabel: 'Cancel' }))) return;
    const { error } = await supabase.from('bug_reports').delete().eq('id', id);
    if (error) { toast(`Delete failed: ${error.message}`, 'error'); return; }
    setRows(prev => prev.filter(r => r.id !== id));
  };

  const refined = isRefined5b();
  const PAD = 14;

  return (
    <div style={{
      background: 'var(--c-sf)',
      border: `1px solid ${C.cardBd}`, borderRadius: 0, padding: PAD,
      boxShadow: C.cardShadow,
    }}>
      <RefinedHeaderStrip padY={PAD} padX={PAD} marginBottom={12}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, fontSize: 13, letterSpacing: '0.04em', textTransform: 'uppercase', color: refined ? '#FFFFFF' : C.tx }}>
            🐞 BUG REPORTS ({counts.open || 0} open)
          </span>
          <button onClick={reload}
            style={{
              background: 'transparent',
              border: `1px solid ${refined ? '#FFFFFF' : C.ac}`,
              color: refined ? '#FFFFFF' : C.ac,
              padding: '3px 10px', borderRadius: 0, fontFamily: FN, fontSize: 10,
              fontWeight: 700, letterSpacing: '0.12em', cursor: 'pointer',
            }}>↻ REFRESH</button>
        </div>
      </RefinedHeaderStrip>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 14 }}>
        {STATUS_PILLS.map(p => {
          const active = filter === p.id;
          const n = p.id === 'all' ? rows.length : (counts[p.id] || 0);
          return (
            <button key={p.id} onClick={() => setFilter(p.id)}
              style={{
                padding: '4px 10px', borderRadius: 0,
                border: `1px solid ${active ? p.color : C.cardBd}`,
                background: active ? 'rgba(57,189,255,0.094)' : 'transparent',
                color: active ? p.color : C.tm,
                fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', cursor: 'pointer',
              }}>{p.label}{n > 0 ? ` · ${n}` : ''}</button>
          );
        })}
      </div>

      {loading ? (
        <div style={{ padding: 30, textAlign: 'center', color: C.td, fontFamily: FB, fontSize: 13 }}>Loading…</div>
      ) : rows.length === 0 ? (
        <div style={{ padding: 30, textAlign: 'center', color: C.td, fontSize: 13 }}>
          No {filter === 'all' ? '' : filter} reports.
        </div>
      ) : rows.map(r => {
        const expanded = expandedId === r.id;
        const sevColor = r.status === 'fixed' ? C.gn : r.status === 'triaged' ? C.or : C.rd;
        return (
          <div key={r.id} style={{
            border: `1px solid ${C.cardBd}`, background: 'var(--c-sf)',
            borderLeft: `3px solid ${sevColor}`,
            marginBottom: 8, padding: '10px 12px',
          }}>
            <div onClick={() => setExpandedId(expanded ? null : r.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <span style={{ fontFamily: FN, fontSize: 9, color: sevColor, fontWeight: 700, letterSpacing: '0.12em',
                border: `1px solid ${sevColor}`, padding: '1px 6px' }}>{r.status.toUpperCase()}</span>
              <span style={{ fontFamily: FN, fontSize: 9, color: C.td, letterSpacing: '0.08em' }}>
                {r.role?.toUpperCase() || 'ANON'} · {fmtTs(r.created_at)}
                {r.reporter_email && <> · {r.reporter_email}</>}
              </span>
              <span style={{ marginLeft: 'auto', color: C.td, fontSize: 12 }}>{expanded ? '▲' : '▼'}</span>
            </div>
            <div style={{ marginTop: 6, fontSize: 13, color: C.tx, whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>
              {r.description}
            </div>
            {r.url && (
              <div style={{ marginTop: 4, fontSize: 11, color: C.tm, wordBreak: 'break-all' }}>
                <a href={r.url} target="_blank" rel="noopener noreferrer" style={{ color: C.ac }}>{r.url}</a>
              </div>
            )}

            {expanded && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px dashed ${C.cardBd}` }}>
                {r.context && (
                  <div style={{ fontFamily: 'monospace', fontSize: 11, color: C.td, lineHeight: 1.5, marginBottom: 10 }}>
                    <div><b style={{ color: C.tm }}>UA:</b> {r.context.ua || '—'}</div>
                    <div>
                      <b style={{ color: C.tm }}>Viewport:</b> {r.context.viewport?.w}×{r.context.viewport?.h} ·{' '}
                      <b style={{ color: C.tm }}>Theme:</b> {r.context.theme || '—'} ·{' '}
                      <b style={{ color: C.tm }}>Locale:</b> {r.context.locale || '—'} ·{' '}
                      <b style={{ color: C.tm }}>Bundle:</b> {r.context.bundle || '—'}
                    </div>
                    {Array.isArray(r.context.consoleErrors) && r.context.consoleErrors.length > 0 && (
                      <div style={{ marginTop: 6 }}>
                        <b style={{ color: C.tm }}>Console errors ({r.context.consoleErrors.length}):</b>
                        <div style={{ marginTop: 4, maxHeight: 220, overflow: 'auto', background: 'var(--c-bg)', border: `1px solid ${C.cardBd}`, padding: 8 }}>
                          {r.context.consoleErrors.map((e, i) => (
                            <div key={i} style={{ marginTop: i ? 8 : 0, paddingTop: i ? 8 : 0, borderTop: i ? `1px dashed ${C.cardBd}` : 'none' }}>
                              <span style={{ color: C.rd }}>{e.at?.slice(11, 19)} </span>
                              <span style={{ color: C.tx, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{e.message}</span>
                              {e.source && <div style={{ color: C.td, fontSize: 10 }}>{e.source}</div>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {Array.isArray(r.context.storageKeys) && r.context.storageKeys.length > 0 && (
                      <div style={{ marginTop: 6 }}>
                        <b style={{ color: C.tm }}>localStorage keys:</b>{' '}
                        <span style={{ color: C.td }}>{r.context.storageKeys.join(', ')}</span>
                      </div>
                    )}
                  </div>
                )}

                <div style={{ marginBottom: 8 }}>
                  <label style={{ display: 'block', fontFamily: FN, fontSize: 9, color: C.tm, letterSpacing: '0.12em', fontWeight: 700, marginBottom: 4 }}>TRIAGE NOTES</label>
                  <textarea defaultValue={r.notes || ''} dir="auto" rows={2}
                    onBlur={e => { if (e.target.value !== (r.notes || '')) setNotes(r.id, e.target.value); }}
                    placeholder="Repro steps, hypothesis, blocker…"
                    style={{ width: '100%', background: 'var(--c-bg)', border: `1px solid ${C.cardBd}`, borderRadius: 0, padding: '6px 8px', color: C.tx, fontFamily: FB, fontSize: 12, outline: 'none', boxSizing: 'border-box', resize: 'vertical' }} />
                </div>

                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  {r.status !== 'open' && (
                    <button onClick={() => setStatus(r.id, 'open')}
                      style={btn(C.rd)}>→ OPEN</button>
                  )}
                  {r.status !== 'triaged' && (
                    <button onClick={() => setStatus(r.id, 'triaged')}
                      style={btn(C.or)}>→ TRIAGED</button>
                  )}
                  {r.status !== 'fixed' && (
                    <button onClick={async () => {
                      const commit = window.prompt('Fixed in commit SHA (leave blank to skip):', '') || '';
                      if (commit.trim()) setFixedIn(r.id, commit.trim().slice(0, 40));
                      else setStatus(r.id, 'fixed');
                    }} style={btn(C.gn)}>✓ MARK FIXED</button>
                  )}
                  {r.fixed_in_commit && (
                    <span style={{ fontFamily: 'monospace', fontSize: 11, color: C.gn, marginLeft: 4 }}>
                      ✓ {r.fixed_in_commit}
                    </span>
                  )}
                  <span style={{ flex: 1 }} />
                  <button onClick={() => remove(r.id)} style={btn(C.td)}>🗑 DELETE</button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function btn(color) {
  return {
    padding: '4px 10px', borderRadius: 0, border: `1px solid ${color}`,
    background: 'transparent', color, fontFamily: FN, fontSize: 10,
    fontWeight: 700, letterSpacing: '0.12em', cursor: 'pointer',
  };
}
