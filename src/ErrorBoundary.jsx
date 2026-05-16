// Top-level error boundary. Without this, any uncaught render-time error
// (e.g. a ReferenceError from a bare CSS-function call in inline style)
// crashes React's render loop and the page goes black with nothing to
// recover from. With it, the user sees a recovery card instead of a void
// — at minimum, a path to reload, sign out, or report the issue.
//
// Why class component: error boundaries in React are still required to be
// class components even though everything else can be hooks. componentDidCatch
// + getDerivedStateFromError are the official lifecycle hooks for this.

import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Log to console — Vercel runtime logs will pick this up.
    console.error('[EXPO] Top-level render error:', error, info);
    this.setState({ info });
    // Fire-and-forget POST to a lightweight log endpoint so Vercel function
    // logs capture the crash even when the user closes the tab. Never block
    // the recovery UI on this — if logging fails, the user-facing fallback
    // still renders.
    try {
      const payload = {
        message: (error && error.message) || String(error || ''),
        stack: (error && error.stack) || '',
        componentStack: (info && info.componentStack) || '',
        url: typeof window !== 'undefined' ? window.location.href : '',
        ua: typeof navigator !== 'undefined' ? navigator.userAgent : '',
        ts: new Date().toISOString(),
      };
      fetch('/api/log-error', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true,
      }).catch(() => {});
    } catch {}
  }

  handleReload = () => {
    try {
      // Soft-clear the SW cache so the refresh actually pulls a new bundle
      // (otherwise PWA installs can loop on the broken cached bundle).
      if ('caches' in window) {
        caches.keys().then(keys => keys.forEach(k => caches.delete(k)));
      }
    } catch {}
    window.location.reload();
  };

  handleHardReset = () => {
    try {
      // Wipe localStorage theme + portal-choice so a borked persisted state
      // doesn't keep biting on every reload. Auth token preserved so the
      // user doesn't have to sign back in.
      const keys = ['expo-theme', 'expo-portal-choice'];
      keys.forEach(k => { try { localStorage.removeItem(k); } catch {} });
      // Clear data-theme so the boot script re-applies fresh.
      try { document.documentElement.removeAttribute('data-theme'); } catch {}
    } catch {}
    this.handleReload();
  };

  render() {
    if (!this.state.error) return this.props.children;
    const msg = (this.state.error && this.state.error.message) || String(this.state.error);
    // Use CSS vars (not C tokens from theme.js) — theme.js itself could be
    // the broken thing, but themes.css is loaded independently so var(--c-*)
    // still resolves in both light and dark. Fallbacks cover the case where
    // even themes.css fails to load.
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
        background: 'var(--c-bg, #0a0a0c)',
        color: 'var(--c-tx, #f0f0f4)',
        fontFamily: "'Nord', 'DM Sans', sans-serif",
      }}>
        <div style={{
          maxWidth: 520, width: '100%',
          background: 'var(--c-sf, #111114)',
          border: '1px solid var(--c-cardBd, #1F4A5C)',
          boxShadow: 'var(--c-cardShadow, none)',
          padding: '28px 32px',
        }}>
          <div style={{
            fontSize: 9, fontWeight: 700,
            color: 'var(--c-rd, #FF4757)',
            letterSpacing: '0.18em',
            textTransform: 'uppercase', marginBottom: 14,
          }}>SOMETHING BROKE</div>
          <h1 style={{
            margin: '0 0 12px', fontSize: 22, fontWeight: 700,
            color: 'var(--c-tx, #f0f0f4)',
            letterSpacing: '-0.01em', lineHeight: 1.3,
          }}>EXPO hit a render error</h1>
          <p style={{
            margin: '0 0 18px', fontSize: 14,
            color: 'var(--c-tm, #7a7a88)',
            lineHeight: 1.55,
          }}>The page couldn't paint. This usually means a recent deploy shipped
            a bug. Try refreshing — it may already be fixed. If it persists,
            hit "Reset & reload" to clear local state.</p>
          <div style={{
            background: 'var(--c-bg, #0a0a0c)',
            border: '1px solid var(--c-cardBd, #1F4A5C)',
            padding: '10px 12px', marginBottom: 18, fontSize: 11,
            fontFamily: 'monospace',
            color: 'var(--c-rd, #FF4757)',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word', maxHeight: 120, overflow: 'auto',
          }}>{msg}</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button onClick={this.handleReload} style={{
              flex: 1, padding: '12px 18px', minWidth: 140,
              background: 'transparent',
              border: '1px solid var(--c-ac, #39BDFF)',
              color: 'var(--c-ac, #39BDFF)',
              fontFamily: "'Nord', 'DM Sans', sans-serif",
              fontSize: 11, fontWeight: 700, letterSpacing: '0.18em',
              textTransform: 'uppercase', cursor: 'pointer',
            }}>↻ Refresh</button>
            <button onClick={this.handleHardReset} style={{
              flex: 1, padding: '12px 18px', minWidth: 140,
              background: 'transparent',
              border: '1px solid var(--c-bd2, #2a2a32)',
              color: 'var(--c-tm, #7a7a88)',
              fontFamily: "'Nord', 'DM Sans', sans-serif",
              fontSize: 11, fontWeight: 700, letterSpacing: '0.18em',
              textTransform: 'uppercase', cursor: 'pointer',
            }}>Reset & reload</button>
          </div>
        </div>
      </div>
    );
  }
}
