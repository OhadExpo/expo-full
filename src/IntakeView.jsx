// IntakeView — coach inbox at /coach/intake. Two responsibilities:
//   1. List incoming intake_submissions with filters (form_type, status,
//      trainee). Click a row to view the full payload.
//   2. Generate intake_tokens. The "+ Generate Link" modal picks form type,
//      locale, optional trainee binding, optional label, and writes a row
//      then copies a shareable URL.
//
// Token-bound links are the entire spam-control story — only people Ohad
// sends a link to can submit. There is no public /intake landing page.
import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { C, FN, FB, FH } from './theme';
import { Btn, Modal, Card, Badge, isRefined5b, toast, SectionLabel, CollapsibleSection, ConfirmDialog } from './ui';
import { supabase } from './supabase';
import { generateIntakeToken, getForm } from './intakeFormSchemas';
import PayloadDetail from './IntakePayloadDetail';

function fmt(iso) {
  if (!iso) return '—';
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

const RTL = /[֐-׿]/;

export default function IntakeView({ trainees }) {
  const [submissions, setSubmissions] = useState(null);
  const [tokens, setTokens] = useState([]);
  const [filter, setFilter] = useState(''); // text filter
  const [showReviewed, setShowReviewed] = useState(false);
  const [openSubmission, setOpenSubmission] = useState(null);
  const [showGen, setShowGen] = useState(false);
  const [genForm, setGenForm] = useState({ formType: 'initial', locale: 'he', traineeId: '', label: '' });
  const [genResult, setGenResult] = useState(null); // { url, label }
  const [genError, setGenError] = useState('');
  const [pendingDelete, setPendingDelete] = useState(null); // { kind:'token'|'submission', key } — centered delete confirm

  const reload = useCallback(async (ctx) => {
    // ctx is an opt-in cancellation handle from the mount effect. Manual
    // callers (post-submit refresh, etc.) call reload() without one and
    // get the original always-set behavior.
    const live = () => !ctx || !ctx.cancelled;
    try {
      const { data: subs } = await supabase
        .from('intake_submissions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);
      if (live()) setSubmissions(subs || []);
    } catch { if (live()) setSubmissions([]); }
    try {
      const { data: toks } = await supabase
        .from('intake_tokens')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (live()) setTokens(toks || []);
    } catch { if (live()) setTokens([]); }
  }, []);

  // Cancellation flag — slow load + early unmount used to set state on an
  // unmounted component, which React warns about. The reload helper checks
  // the flag before each setter.
  useEffect(() => {
    const ctx = { cancelled: false };
    reload(ctx);
    return () => { ctx.cancelled = true; };
  }, [reload]);

  const enriched = useMemo(() => (submissions || []).map(s => {
    const trainee = (trainees || []).find(t => {
      if (t.id === s.trainee_id) return true;
      if (Array.isArray(t.email) && s.email && t.email.some(e => String(e).toLowerCase() === String(s.email).toLowerCase())) return true;
      if (typeof t.email === 'string' && s.email && t.email.toLowerCase() === String(s.email).toLowerCase()) return true;
      return false;
    });
    return { ...s, traineeName: trainee?.name || null };
  }), [submissions, trainees]);

  const visible = useMemo(() => enriched.filter(s => {
    if (!showReviewed && s.reviewed_at) return false;
    if (!filter) return true;
    const f = filter.toLowerCase();
    return [s.email, s.name, s.traineeName, s.form_type, s.locale]
      .filter(Boolean)
      .some(v => String(v).toLowerCase().includes(f));
  }), [enriched, filter, showReviewed]);

  const counts = useMemo(() => {
    const open = enriched.filter(s => !s.reviewed_at);
    return {
      total: enriched.length,
      open: open.length,
      initial: open.filter(s => s.form_type === 'initial').length,
      progress: open.filter(s => s.form_type === 'progress').length,
      assessment: open.filter(s => s.form_type === 'assessment').length,
    };
  }, [enriched]);

  const markReviewed = async (id) => {
    setSubmissions(curr => (curr || []).map(s => s.id === id ? { ...s, reviewed_at: new Date().toISOString() } : s));
    try { const { error } = await supabase.from('intake_submissions').update({ reviewed_at: new Date().toISOString() }).eq('id', id); if (error) throw error; } catch (e) { toast('Could not mark reviewed — reload to check: ' + (e.message || e), 'error'); }
  };
  const undoReviewed = async (id) => {
    setSubmissions(curr => (curr || []).map(s => s.id === id ? { ...s, reviewed_at: null } : s));
    try { const { error } = await supabase.from('intake_submissions').update({ reviewed_at: null }).eq('id', id); if (error) throw error; } catch (e) { toast('Could not undo — reload to check: ' + (e.message || e), 'error'); }
  };
  const deleteSubmission = async (id) => {
    // Actual removal — gated by the centered ConfirmDialog (Ohad: deletes get
    // a popup verification, consistent with the unused-link delete). Optimistic,
    // but reload() on failure so a row that didn't actually delete comes back.
    setSubmissions(curr => (curr || []).filter(s => s.id !== id));
    try { const { error } = await supabase.from('intake_submissions').delete().eq('id', id); if (error) throw error; } catch (e) { toast('Delete failed — restoring: ' + (e.message || e), 'error'); reload(); }
  };
  const deleteToken = async (token) => {
    // Actual removal — the centered ConfirmDialog gates this (Ohad: delete
    // needs a popup verification, not the bottom confirm-toast). Keyed on the
    // token PK (not id). Optimistic; reload() on failure restores the link so
    // it can't silently vanish from the UI while still live in the DB.
    setTokens(curr => (curr || []).filter(t => t.token !== token));
    try { const { error } = await supabase.from('intake_tokens').delete().eq('token', token); if (error) throw error; } catch (e) { toast('Delete failed — restoring: ' + (e.message || e), 'error'); reload(); }
  };

  const genBusyRef = useRef(false);
  const generateLink = async () => {
    if (genBusyRef.current) return; // guard against a double-click minting two live tokens
    genBusyRef.current = true;
    setGenError('');
    const token = generateIntakeToken();
    const row = {
      token,
      form_type: genForm.formType,
      locale: genForm.locale,
      trainee_id: genForm.traineeId || null,
      label: genForm.label || null,
    };
    try {
      const { error } = await supabase.from('intake_tokens').insert(row);
      if (error) throw error;
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      // progress + standard share the /intake path; the token's form_type picks the form
      const path = `/intake/${genForm.locale}`;
      const url = `${origin}${path}?t=${token}`;
      try { await navigator.clipboard.writeText(url); } catch {}
      setGenResult({ url, label: row.label || `${genForm.formType} · ${genForm.locale}` });
      reload();
    } catch (e) {
      setGenError(String(e?.message || e) || 'Could not generate link.');
    } finally {
      genBusyRef.current = false;
    }
  };

  const closeGen = () => {
    setShowGen(false); setGenResult(null); setGenError('');
    setGenForm({ formType: 'initial', locale: 'he', traineeId: '', label: '' });
  };

  if (submissions == null) {
    return <div style={{ textAlign: 'center', padding: 60, color: C.td, fontFamily: FB, fontSize: 13 }}>Loading intake…</div>;
  }

  const detailForm = openSubmission ? getForm(openSubmission.form_type, openSubmission.locale) : null;

  return (
    <div>
      {/* Header — counts + Generate Link CTA */}
      <div style={{ marginBottom: 18, background: 'var(--c-sf)', border: `1px solid ${C.cardBd}` }}>
        <div style={{ background: 'var(--c-stripBg, var(--c-sf))', borderBottom: '1px solid var(--c-cardBd)', padding: '10px 14px' }}>
          <SectionLabel as="div" style={{ color: '#FFFFFF', fontSize: C.alertLabelSize }}>INTAKE</SectionLabel>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, padding: '14px 18px' }}>
          <div>
            <div style={{ fontFamily: FB, fontSize: 12, color: C.tm }}>
              {counts.open} open · {counts.initial} initial · {counts.assessment} assessment · {counts.progress} progress · {counts.total} total
            </div>
          </div>
          <Btn onClick={() => setShowGen(true)} style={{ height: 36, padding: '0 18px' }}>+ Generate Link</Btn>
        </div>
      </div>

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <input placeholder="Filter by name / email / form type…" value={filter} onChange={e => setFilter(e.target.value)}
          style={{ height: 36, boxSizing: 'border-box', background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderRadius: 0, padding: '0 12px', color: C.tx, fontFamily: FB, fontSize: 13, outline: 'none', minWidth: 280, flex: 1 }} />
        <button onClick={() => setShowReviewed(s => !s)}
          style={{ height: 36, boxSizing: 'border-box', background: 'var(--c-sf)', border: `1px solid ${showReviewed ? C.ac : C.cardBd}`, color: showReviewed ? C.ac : C.tm, padding: '0 12px', fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer', borderRadius: 0, minWidth: 152, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          {showReviewed ? 'Showing reviewed' : 'Hide reviewed'}
        </button>
      </div>

      {/* Recent unused tokens (so Ohad can re-copy a link he just made) */}
      {tokens.filter(t => !t.used_at).length > 0 && (
        <CollapsibleSection title="Unused Links" count={tokens.filter(t => !t.used_at).length} storageKey="intake-unused" defaultOpen={false} style={{ marginBottom: 18 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {tokens.filter(t => !t.used_at).slice(0, 5).map(t => {
              const origin = typeof window !== 'undefined' ? window.location.origin : '';
              const url = `${origin}/intake/${t.locale}?t=${t.token}`;
              return (
                <div key={t.token} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, fontFamily: FB }}>
                  <Badge color={t.form_type === 'initial' ? C.ac : (t.form_type === 'assessment' ? C.or : C.gn)}>{t.form_type}</Badge>
                  <span style={{ color: C.tm }}>{(t.locale || '').toUpperCase()}</span>
                  {t.label && <span style={{ color: C.tx }}>· {t.label}</span>}
                  <span style={{ color: C.td }}>· {ago(t.created_at)} ago</span>
                  <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 6 }}>
                    <button onClick={async () => { try { await navigator.clipboard.writeText(url); } catch {} }}
                      style={{ background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, color: C.ac, padding: '3px 8px', fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', cursor: 'pointer', borderRadius: 0 }}>
                      Copy URL
                    </button>
                    <button onClick={() => setPendingDelete({ kind: 'token', key: t.token })} title="Delete this unused link" aria-label="Delete link"
                      style={{ background: 'var(--c-sf)', border: `1px solid ${C.rd}`, color: C.rd, padding: '3px 9px', fontFamily: FN, fontSize: 11, fontWeight: 700, lineHeight: 1, cursor: 'pointer', borderRadius: 0 }}>
                      ✕
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
        </CollapsibleSection>
      )}

      {/* List */}
      {visible.length === 0 ? (
        <div style={{ background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, padding: 40, textAlign: 'center' }}>
          <div style={{ fontFamily: FN, fontSize: 9, color: C.tm, letterSpacing: '0.18em', fontWeight: 700, marginBottom: 8 }}>NO INTAKE YET</div>
          <div style={{ fontFamily: FB, fontSize: 13, color: C.tm }}>
            Generate a link from the button above and send it to a prospect or trainee.
          </div>
        </div>
      ) : visible.map(s => (
        <Card key={s.id} style={{ marginBottom: 8, opacity: s.reviewed_at ? 0.55 : 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => setOpenSubmission(s)}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <Badge color={s.form_type === 'initial' ? C.ac : (s.form_type === 'assessment' ? C.or : C.gn)}>{s.form_type}</Badge>
                <span style={{ fontFamily: FN, fontSize: 10, color: C.tm, fontWeight: 700, letterSpacing: '0.18em' }}>{(s.locale || '').toUpperCase()}</span>
                <span style={{ fontFamily: FB, fontSize: 14, color: C.tx, fontWeight: 600, direction: RTL.test(s.name || '') ? 'rtl' : 'ltr' }}>{s.name || '(no name)'}</span>
                {s.traineeName && (
                  <span style={{ fontFamily: FB, fontSize: 12, color: C.ac }}>→ {s.traineeName}</span>
                )}
              </div>
              <div style={{ fontFamily: FB, fontSize: 12, color: C.tm, marginTop: 4 }}>
                {s.email || '—'} · {fmt(s.created_at)} · {ago(s.created_at)} ago
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {s.reviewed_at ? (
                <button onClick={() => undoReviewed(s.id)} style={{ background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, color: C.tm, padding: '4px 8px', fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', cursor: 'pointer', borderRadius: 0 }}>↩ UNDO</button>
              ) : (
                <button onClick={() => markReviewed(s.id)} style={{ background: 'var(--c-sf)', border: `1px solid ${C.gn}`, color: C.gn, padding: '4px 8px', fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', cursor: 'pointer', borderRadius: 0 }}>✓ DONE</button>
              )}
              <button onClick={() => setPendingDelete({ kind: 'submission', key: s.id })} style={{ background: 'var(--c-sf)', border: `1px solid ${C.rd}`, color: C.rd, padding: '4px 8px', fontFamily: FN, fontSize: 10, fontWeight: 700, cursor: 'pointer', borderRadius: 0 }}>✕</button>
            </div>
          </div>
        </Card>
      ))}

      {/* Detail modal */}
      <Modal open={!!openSubmission} onClose={() => setOpenSubmission(null)} title={openSubmission ? `${openSubmission.form_type} · ${(openSubmission.locale || '').toUpperCase()} — ${openSubmission.name || openSubmission.email || ''}` : ''} wide>
        {openSubmission && <PayloadDetail form={detailForm} payload={openSubmission.payload} />}
      </Modal>

      {/* Generate-link modal */}
      <Modal open={showGen} onClose={closeGen} title="Generate Intake Link">
        {genResult ? (
          <div>
            <div style={{ fontSize: 13, color: C.tx, marginBottom: 10 }}>Link generated and copied to clipboard.</div>
            <div style={{ background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, padding: 10, fontFamily: FN, fontSize: 12, color: C.tm, wordBreak: 'break-all' }}>{genResult.url}</div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <Btn variant="ghost" onClick={() => { setGenResult(null); }}>Generate another</Btn>
              <Btn onClick={closeGen}>Done</Btn>
            </div>
          </div>
        ) : (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 10, fontFamily: FN, color: C.tm, letterSpacing: '0.18em', fontWeight: 700, marginBottom: 4, textTransform: 'uppercase' }}>FORM TYPE</div>
                <div style={{ position: 'relative', display: 'flex' }}>
                  <select value={genForm.formType} onChange={e => setGenForm(f => ({ ...f, formType: e.target.value, locale: getForm(e.target.value, f.locale) ? f.locale : 'he' }))}
                    style={{ flex: 1, background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderRadius: 0, padding: '8px 32px 8px 10px', color: C.tx, fontFamily: FB, fontSize: 13, outline: 'none', appearance: 'none', WebkitAppearance: 'none' }}>
                    <option value="initial">Initial intake</option>
                    <option value="assessment">Physical assessment</option>
                    <option value="progress">Progress check-in</option>
                  </select>
                  <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: C.tm, fontSize: 14, lineHeight: 1 }}>▾</span>
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10, fontFamily: FN, color: C.tm, letterSpacing: '0.18em', fontWeight: 700, marginBottom: 4, textTransform: 'uppercase' }}>LOCALE</div>
                <div style={{ position: 'relative', display: 'flex' }}>
                  <select value={genForm.locale} onChange={e => setGenForm(f => ({ ...f, locale: e.target.value }))}
                    style={{ flex: 1, background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderRadius: 0, padding: '8px 32px 8px 10px', color: C.tx, fontFamily: FB, fontSize: 13, outline: 'none', appearance: 'none', WebkitAppearance: 'none' }}>
                    <option value="he">Hebrew (HE)</option>
                    {/* Only offer a locale that actually has a form for this type
                        (no progress:en schema) — else the client gets a blank,
                        unsubmittable link. */}
                    <option value="en" disabled={!getForm(genForm.formType, 'en')}>English (EN){getForm(genForm.formType, 'en') ? '' : ' — n/a'}</option>
                  </select>
                  <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: C.tm, fontSize: 14, lineHeight: 1 }}>▾</span>
                </div>
              </div>
            </div>
            {(genForm.formType === 'progress' || genForm.formType === 'assessment') && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10, fontFamily: FN, color: C.tm, letterSpacing: '0.18em', fontWeight: 700, marginBottom: 4, textTransform: 'uppercase' }}>TRAINEE (optional)</div>
                <div style={{ position: 'relative', display: 'flex' }}>
                  <select value={genForm.traineeId} onChange={e => setGenForm(f => ({ ...f, traineeId: e.target.value }))}
                    style={{ flex: 1, background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderRadius: 0, padding: '8px 32px 8px 10px', color: C.tx, fontFamily: FB, fontSize: 13, outline: 'none', appearance: 'none', WebkitAppearance: 'none' }}>
                    <option value="">— none —</option>
                    {(trainees || []).filter(t => t.status !== 'Archived').map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                  <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: C.tm, fontSize: 14, lineHeight: 1 }}>▾</span>
                </div>
              </div>
            )}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, fontFamily: FN, color: C.tm, letterSpacing: '0.18em', fontWeight: 700, marginBottom: 4, textTransform: 'uppercase' }}>LABEL (optional)</div>
              <input value={genForm.label} onChange={e => setGenForm(f => ({ ...f, label: e.target.value }))}
                placeholder='e.g. "for Yossi"'
                style={{ width: '100%', boxSizing: 'border-box', background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderRadius: 0, padding: '8px 10px', color: C.tx, fontFamily: FB, fontSize: 13, outline: 'none' }} />
            </div>
            {genError && <div style={{ color: C.rd, fontFamily: FN, fontSize: 12, marginBottom: 8 }}>{genError}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Btn variant="ghost" onClick={closeGen}>Cancel</Btn>
              <Btn onClick={generateLink}>Generate</Btn>
            </div>
          </div>
        )}
      </Modal>

      {/* Centered confirm popup for both delete flows — unused link + submission (Ohad). */}
      <ConfirmDialog
        open={!!pendingDelete}
        title={pendingDelete?.kind === 'token' ? 'Delete link?' : 'Delete submission?'}
        message={pendingDelete?.kind === 'token'
          ? "This unused intake link will be permanently removed. Anyone you already sent it to won't be able to open the form."
          : 'This submitted intake will be permanently removed. This cannot be undone.'}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          const p = pendingDelete; setPendingDelete(null);
          if (p?.kind === 'token') deleteToken(p.key);
          else if (p?.kind === 'submission') deleteSubmission(p.key);
        }}
      />
    </div>
  );
}
