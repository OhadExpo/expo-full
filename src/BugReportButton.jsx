// In-app bug reporter. Renders a small 🐞 button in the coach + athlete
// portal headers; click opens a modal that ships a structured report
// (description + auto-captured URL / UA / viewport / console errors /
// localStorage key list) to /api/report-bug. Reports land in the
// public.bug_reports Supabase table so they're triageable next session.
//
// Why anon-INSERT is OK: the auth flow itself may be broken — gating on
// auth would hide exactly the bugs that matter most. Length cap + per-IP
// rate limit at the API edge keep abuse cheap.

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { C, FN, FB } from './theme';
import { toast, useEscClose } from './ui';
import { snapshotConsoleBuffer, onError, hasSeenError } from './consoleBuffer.js';

function bundleHash() {
  try {
    // Pull the main script tag's hash so triage knows which build the
    // report came from. Falls back to "—" if the bundle isn't present
    // (dev server, etc.).
    const s = Array.from(document.querySelectorAll('script[src]'))
      .map(el => el.getAttribute('src') || '')
      .find(src => /\/assets\/index-[A-Za-z0-9_-]+\.js$/.test(src));
    if (!s) return '';
    const m = s.match(/index-([A-Za-z0-9_-]+)\.js/);
    return m?.[1] || '';
  } catch { return ''; }
}

function listStorageKeys() {
  try {
    const out = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k) out.push(k);
    }
    return out.slice(0, 40);
  } catch { return []; }
}

function gatherContext() {
  return {
    ua: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    viewport: typeof window !== 'undefined'
      ? { w: window.innerWidth, h: window.innerHeight }
      : null,
    locale: typeof navigator !== 'undefined' ? navigator.language : '',
    theme: typeof document !== 'undefined'
      ? (document.documentElement.getAttribute('data-theme') || '')
      : '',
    bundle: bundleHash(),
    consoleErrors: snapshotConsoleBuffer(),
    storageKeys: listStorageKeys(),
  };
}

export default function BugReportButton({ role = 'anon', reporterEmail = '', variant = 'coach' }) {
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [previewCtx, setPreviewCtx] = useState(null);
  // Escape closes the report modal (unless mid-submit, matching scrim-click).
  useEscClose(open, () => { if (!submitting) setOpen(false); });
  // Android-style crash-report behavior: hidden by default, only
  // surfaces after an actual JS error fires this session (console.error,
  // window.error, unhandledrejection). Survives SPA route changes via
  // sessionStorage so a crash on /coach/X stays reportable from /coach/Y.
  const [visible, setVisible] = useState(() => hasSeenError());
  const [justErrored, setJustErrored] = useState(false);

  useEffect(() => {
    const unsub = onError(() => {
      setVisible(true);
      setJustErrored(true);
      // Pulse highlight clears after 6s so an unrelated error later in
      // the session can re-pulse the button.
      setTimeout(() => setJustErrored(false), 6000);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (open) setPreviewCtx(gatherContext());
  }, [open]);

  const submit = async () => {
    const body = description.trim();
    if (!body) { toast('Describe the bug first.', 'warn'); return; }
    setSubmitting(true);
    const payload = {
      description: body,
      reporterEmail,
      role,
      url: typeof window !== 'undefined' ? window.location.href : '',
      context: previewCtx || gatherContext(),
    };
    try {
      const r = await fetch('/api/report-bug', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true,
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j?.error || `HTTP ${r.status}`);
      }
      toast('Bug report sent. Thanks — fix queued.', 'success', { ttl: 5000 });
      setDescription('');
      setOpen(false);
    } catch (e) {
      toast(`Could not send bug report: ${e?.message || e}`, 'error', { ttl: 8000 });
    } finally {
      setSubmitting(false);
    }
  };

  // Hidden by default. Once an error fires this session, the button
  // slides in. The modal itself stays mounted-but-closed so subscribers
  // (toast / future surfaces) keep working.
  if (!visible && !open) return null;

  // Header button — sizing matches the existing icon buttons in the
  // coach header and the athlete portal header so it slots in without
  // visual rework. Tinted red + light pulse for 6s after a fresh error
  // so the coach notices something just broke.
  const isAthlete = variant === 'athlete';
  const errColor = justErrored ? (C.rd || '#ff5b5b') : C.tx;
  const btnStyle = isAthlete
    ? { background: 'transparent', border: 'none', color: justErrored ? (C.rd || '#ff5b5b') : C.tm, cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', fontSize: 14, animation: justErrored ? 'bug-pulse 1s ease-in-out 0s 3' : undefined }
    : { background: 'transparent', border: 'none', color: errColor, padding: '6px 8px', fontSize: 14, borderRadius: 0, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', animation: justErrored ? 'bug-pulse 1s ease-in-out 0s 3' : undefined };

  return (
    <>
      <style>{'@keyframes bug-pulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.18)} }'}</style>
      <button onClick={() => setOpen(true)}
        title={justErrored ? 'Something just broke — tap to send a bug report' : 'Report a bug'}
        aria-label="Report a bug"
        className={isAthlete ? undefined : 'hdr-icon-btn'} style={btnStyle}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2.5a4 4 0 0 0-4 4v1h8v-1a4 4 0 0 0-4-4Z"/>
          <path d="M5 12a7 7 0 0 1 14 0v3a7 7 0 0 1-14 0Z"/>
          <path d="M3 9l3 2M21 9l-3 2M3 19l3-2M21 19l-3-2M12 13v8"/>
        </svg>
      </button>

      {open && createPortal((
        <div onClick={() => !submitting && setOpen(false)} role="dialog" aria-modal="true" aria-label="Report a bug" style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1200,
          display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 20, paddingTop: 60,
          backdropFilter: 'blur(4px)',
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--c-bg)', border: `1px solid ${C.cardBd}`, borderRadius: 0,
            maxWidth: 560, width: '100%', maxHeight: '80vh', overflow: 'auto', padding: 22,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ margin: 0, fontFamily: FN, fontSize: 14, color: C.ac, letterSpacing: '0.12em', fontWeight: 700 }}>
                🐞 REPORT A BUG
              </h3>
              <button onClick={() => !submitting && setOpen(false)}
                style={{ background: 'none', border: 'none', color: C.tm, cursor: 'pointer', fontSize: 18 }}>✕</button>
            </div>
            <p style={{ fontSize: 12, color: C.tm, margin: '0 0 10px', lineHeight: 1.5 }}>
              Describe what you were doing, what you expected, and what happened. The page URL,
              browser info, and recent console errors are attached automatically.
            </p>
            <textarea value={description} onChange={e => setDescription(e.target.value)} dir="auto"
              autoFocus rows={6}
              placeholder="Steps to reproduce + what went wrong…"
              style={{
                width: '100%', background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`,
                borderRadius: 0, padding: '10px 12px', color: C.tx, fontSize: 13, fontFamily: FB,
                outline: 'none', boxSizing: 'border-box', resize: 'vertical', marginBottom: 12,
              }} />
            {previewCtx && (
              <details style={{ marginBottom: 14, background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, padding: '8px 10px' }}>
                <summary style={{ fontFamily: FN, fontSize: 10, color: C.tm, letterSpacing: '0.12em', fontWeight: 700, cursor: 'pointer' }}>
                  WHAT GETS SENT ({previewCtx.consoleErrors.length} console error{previewCtx.consoleErrors.length === 1 ? '' : 's'})
                </summary>
                <div style={{ fontSize: 11, color: C.td, fontFamily: 'monospace', marginTop: 8, lineHeight: 1.5 }}>
                  <div><b>URL:</b> {typeof window !== 'undefined' ? window.location.href : '—'}</div>
                  <div><b>Role:</b> {role} · <b>Bundle:</b> {previewCtx.bundle || '—'}</div>
                  <div><b>Viewport:</b> {previewCtx.viewport?.w}×{previewCtx.viewport?.h} · <b>Theme:</b> {previewCtx.theme || '—'} · <b>Locale:</b> {previewCtx.locale || '—'}</div>
                  {previewCtx.consoleErrors.length > 0 && (
                    <div style={{ marginTop: 6, maxHeight: 140, overflow: 'auto' }}>
                      {previewCtx.consoleErrors.slice(-5).map((e, i) => (
                        <div key={i} style={{ marginTop: 4, paddingTop: 4, borderTop: `1px dashed ${C.cardBd}` }}>
                          <span style={{ color: C.rd }}>{e.at?.slice(11, 19)} </span>
                          <span style={{ color: C.tx, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{e.message?.slice(0, 240)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </details>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => !submitting && setOpen(false)} disabled={submitting}
                style={{
                  padding: '8px 16px', borderRadius: 0, border: `1px solid ${C.cardBd}`,
                  background: 'transparent', color: C.tm, fontFamily: FN, fontSize: 11,
                  fontWeight: 700, letterSpacing: '0.12em', cursor: submitting ? 'wait' : 'pointer',
                  opacity: submitting ? 0.5 : 1,
                }}>CANCEL</button>
              <button onClick={submit} disabled={submitting || !description.trim()}
                style={{
                  padding: '8px 18px', borderRadius: 0,
                  border: `1px solid ${description.trim() ? C.ac : C.cardBd}`,
                  background: description.trim() ? 'rgba(57,189,255,0.094)' : 'transparent',
                  color: description.trim() ? C.ac : C.td,
                  fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.12em',
                  cursor: submitting ? 'wait' : (description.trim() ? 'pointer' : 'default'),
                  minWidth: 150, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                }}>{submitting ? 'SENDING…' : 'SEND REPORT →'}</button>
            </div>
          </div>
        </div>
      ), document.body)}
    </>
  );
}
