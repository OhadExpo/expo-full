// Trainer-only triage surface for in-app bug reports.
//
// Reads public.bug_reports (RLS already gates SELECT to the trainer
// email). Filter pills toggle status (OPEN / TRIAGED / FIXED). Each
// row expands to show the full description + auto-captured context
// (UA, viewport, theme, bundle hash, last 10 console errors,
// localStorage key list). Trainer can mark status + add a free-text
// note + record a "fixed in <commit>" tag.

import React, { useEffect, useState, useCallback } from 'react';
import { useT, useTB, tr, readLang } from './i18n';
import { C, FN, FB } from './theme';
import { safeUrl } from './VideoEmbed';
import { supabase } from './supabase';
import { isRefined5b, RefinedHeaderStrip, confirmToast, toast, stripBtnBase, ChipGrid } from './ui';

const STATUS_PILLS = [
  { id: 'open',    label: 'OPEN',    color: C.rd },
  { id: 'triaged', label: 'TRIAGED', color: C.or },
  { id: 'fixed',   label: 'FIXED',   color: C.gn },
  { id: 'all',     label: 'ALL',     color: C.ac },
];

function fmtTs(s) {
  try { return new Date(s).toLocaleString('en-GB'); } catch { return s; }
}

export default function BugsView() {
  const tt = useT();
  const tb = useTB();
  // THE ICON INSIDE THE LABEL (14.10): the button is a flex box, so the space after a bare '↻' collapsed (↻REFRESH), and
  // tb() reserves the other language's width around the WORD only - in Hebrew the icon stood apart from it. One box,
  // the other language's label reserved, the icon and the word centred together.
  const iconLabel = (icon, key) => {
    const he = readLang() === 'he', shown = he ? tr('he', key) : key, other = he ? key : tr('he', key);
    return <span style={{ display: 'inline-grid', justifyItems: 'center', verticalAlign: 'top' }}>
      <span aria-hidden="true" style={{ gridArea: '1 / 1', visibility: 'hidden', whiteSpace: 'nowrap' }}>{icon} {other}</span>
      <span style={{ gridArea: '1 / 1', whiteSpace: 'nowrap' }}><span aria-hidden="true">{icon}</span> {shown}</span>
    </span>;
  };
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('open');
  const [expandedId, setExpandedId] = useState(null);
  // Inline "fixed in commit SHA" capture — replaces a native window.prompt.
  const [shaFor, setShaFor] = useState(null);
  const [shaVal, setShaVal] = useState('');
  const markFixed = (id) => { const c = shaVal.trim(); if (c) setFixedIn(id, c.slice(0, 40)); else setStatus(id, 'fixed'); setShaFor(null); setShaVal(''); };

  // Same as chat-audit: a refresh returning the same rows left the screen
  // identical, so the control looked dead. It says what it is doing now.
  const [refreshing, setRefreshing] = useState(false);
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
  // ONE ROW PER BUG (#887): an auto-captured error carries a fingerprint (consoleBuffer.js fingerprintOf), so the same
  // fault on ten tabs is one row with x10, not ten rows. A typed report stands alone. rows are newest-first, so the
  // first of each group is its latest occurrence.
  const groupCount = new Map();
  const shown = rows.filter((r) => {
    const fp = r.context && r.context.fingerprint;
    if (!fp) return true;
    const n = groupCount.get(fp) || 0; groupCount.set(fp, n + 1);
    return n === 0;
  });

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
          <span style={{ fontWeight: 700, fontSize: 13, letterSpacing: '0.04em', textTransform: 'uppercase', color: refined ? 'var(--c-stripTx)' : C.tx }}>
            {tt('BUG REPORTS')} ({counts.open || 0} {tt('open')})
          </span>
          <button onClick={async () => { setRefreshing(true); try { await reload(); } finally { setTimeout(() => setRefreshing(false), 550); } }} disabled={refreshing}
            style={{ ...stripBtnBase, border: `1px solid ${refined ? 'var(--c-stripTx)' : C.ac}`, color: refined ? 'var(--c-stripTx)' : C.ac }}>{iconLabel('↻', refreshing ? 'REFRESHING…' : 'REFRESH')}</button>
        </div>
      </RefinedHeaderStrip>

      {/* one equal-cell grid, the count beside the word, the status colour as the fill (5.10 #574) */}
      <ChipGrid ariaLabel={tt('BUG REPORTS')} value={filter} onChange={setFilter} style={{ marginBottom: 14 }}
        items={STATUS_PILLS.map(p => { const n = p.id === 'all' ? rows.length : (counts[p.id] || 0); return { k: p.id, label: tb(p.label), n: n > 0 ? n : undefined, color: p.color }; })} />

      {loading ? (
        <div style={{ padding: 30, textAlign: 'center', color: C.td, fontFamily: FB, fontSize: 13 }}>{tr(readLang(), 'Loading…')}</div>
      ) : rows.length === 0 ? (
        <div style={{ padding: 30, textAlign: 'center', color: C.td, fontSize: 13 }}>
          {tt(filter === 'all' ? 'No reports.' : `No ${filter} reports.`)}
        </div>
      ) : shown.map(r => {
        const expanded = expandedId === r.id;
        const times = (r.context && r.context.fingerprint && groupCount.get(r.context.fingerprint)) || 1;
        const sevColor = r.status === 'fixed' ? C.gn : r.status === 'triaged' ? C.or : C.rd;
        return (
          <div key={r.id} style={{
 background: 'var(--c-sf)',
            border: `1px solid ${sevColor}`,
            marginBottom: 8, padding: '10px 12px',
          }}>
            <div onClick={() => setExpandedId(expanded ? null : r.id)}
              role="button" tabIndex={0} aria-expanded={expanded}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpandedId(expanded ? null : r.id); } }}
              style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, fontFamily: FN, fontSize: 9, color: sevColor, fontWeight: 700, letterSpacing: '0.12em',
                border: `1px solid ${sevColor}`, padding: '3px 6px', width: 74, boxSizing: 'border-box', flexShrink: 0 }}>{(r.status||'').toUpperCase()}</span>
              <span style={{ fontFamily: FN, fontSize: 9, color: C.td, letterSpacing: '0.08em' }}>
                {r.context?.auto ? tt('AUTO') : (r.role?.toUpperCase() || 'ANON')} · {fmtTs(r.created_at)}{times > 1 ? ` · ×${times}` : ''}
                {r.reporter_email && <> · {r.reporter_email}</>}
              </span>
              <span style={{ marginInlineStart: 'auto', color: C.td, fontSize: 12 }}>{expanded ? '▲' : '▼'}</span>
            </div>
            <div style={{ marginTop: 6, fontSize: 13, color: C.tx, whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>
              {r.description}
            </div>
            {r.url && (
              <div style={{ marginTop: 4, fontSize: 11, color: C.tm, wordBreak: 'break-all' }}>
                {/* r.url is user-submitted — render as a link only when it's
                    a real http(s) URL; otherwise show it as plain text. */}
                {safeUrl(r.url)
                  ? <a href={safeUrl(r.url)} target="_blank" rel="noopener noreferrer" style={{ color: C.ac }}>{r.url}</a>
                  : <span>{r.url}</span>}
              </div>
            )}

            {expanded && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px dashed ${C.cardBd}` }}>
                {r.context && (
                  <div style={{ fontFamily: 'monospace', fontSize: 11, color: C.td, lineHeight: 1.5, marginBottom: 10 }}>
                    <div><b style={{ color: C.tm }}>{tt('UA:')}</b> {r.context.ua || '—'}</div>
                    <div>
                      <b style={{ color: C.tm }}>{tt('Viewport:')}</b> {r.context.viewport?.w}×{r.context.viewport?.h} ·{' '}
                      <b style={{ color: C.tm }}>{tt('Theme:')}</b> {r.context.theme || '—'} ·{' '}
                      <b style={{ color: C.tm }}>{tr(readLang(), 'Locale:')}</b> {r.context.locale || '—'} ·{' '}
                      <b style={{ color: C.tm }}>{tr(readLang(), 'Bundle:')}</b> {r.context.bundle || '—'}
                      {r.context.release ? <> · <b style={{ color: C.tm }}>{tt('Release:')}</b> {r.context.release}</> : null}
                    </div>
                    {/* what the user did right before it (#887): routes, taps, failed requests - never anything typed */}
                    {Array.isArray(r.context.trail) && r.context.trail.length > 0 && (
                      <div style={{ marginTop: 6 }}>
                        <b style={{ color: C.tm }}>{tt('Trail:')}</b>
                        <div style={{ marginTop: 4, maxHeight: 180, overflow: 'auto', background: 'var(--c-bg)', border: `1px solid ${C.cardBd}`, padding: 8 }}>
                          {r.context.trail.map((t, i) => (
                            <div key={i}><span style={{ color: C.tm }}>{t.at} {t.kind}</span> <span style={{ color: C.tx, wordBreak: 'break-word' }}>{t.what}</span></div>
                          ))}
                        </div>
                      </div>
                    )}
                    {r.context.stack ? <div style={{ marginTop: 6, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 160, overflow: 'auto' }}>{r.context.stack}</div> : null}
                    {Array.isArray(r.context.consoleErrors) && r.context.consoleErrors.length > 0 && (
                      <div style={{ marginTop: 6 }}>
                        <b style={{ color: C.tm }}>{tt('Console errors (')}{r.context.consoleErrors.length}):</b>
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
                  <label style={{ display: 'block', fontFamily: FN, fontSize: 9, color: C.tm, letterSpacing: '0.12em', fontWeight: 700, marginBottom: 4 }}>{tt('TRIAGE NOTES')}</label>
                  <textarea defaultValue={r.notes || ''} dir="auto" rows={2}
                    onBlur={e => { if (e.target.value !== (r.notes || '')) setNotes(r.id, e.target.value); }}
                    placeholder={tt('Repro steps, hypothesis, blocker…')}
                    style={{ width: '100%', background: 'var(--c-bg)', border: `1px solid ${C.cardBd}`, borderRadius: 0, padding: '6px 8px', color: C.tx, fontFamily: FB, fontSize: 12, outline: 'none', boxSizing: 'border-box', resize: 'vertical' }} />
                </div>

                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  {r.status !== 'open' && (
                    <button onClick={() => setStatus(r.id, 'open')}
                      style={btn(C.rd)}>→ {tr(readLang(), 'OPEN')}</button>
                  )}
                  {r.status !== 'triaged' && (
                    <button onClick={() => setStatus(r.id, 'triaged')}
                      style={btn(C.or)}>→ {tr(readLang(), 'TRIAGED')}</button>
                  )}
                  {r.status !== 'fixed' && (
                    shaFor === r.id ? (
                      <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                        <input autoFocus value={shaVal} onChange={e => setShaVal(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') markFixed(r.id); if (e.key === 'Escape') { setShaFor(null); setShaVal(''); } }}
                          placeholder={tt('commit SHA — blank to skip')}
                          style={{ background: 'var(--c-sf2)', border: `1px solid ${C.cardBd}`, color: C.tx, fontFamily: FN, fontSize: 11, padding: '4px 8px', width: 190 }} />
                        <button onClick={() => markFixed(r.id)} style={btn(C.gn)}>✓ {tr(readLang(), 'FIXED')}</button>
                      </span>
                    ) : (
                      <button onClick={() => { setShaFor(r.id); setShaVal(''); }} style={btn(C.gn)}>✓ {tr(readLang(), 'MARK FIXED')}</button>
                    )
                  )}
                  {r.fixed_in_commit && (
                    <span style={{ fontFamily: 'monospace', fontSize: 11, color: C.gn, marginInlineStart: 4 }}>
                      ✓ {r.fixed_in_commit}
                    </span>
                  )}
                  <span style={{ flex: 1 }} />
                  <button onClick={() => remove(r.id)} style={btn(C.td)}>{tt('DELETE')}</button>
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
