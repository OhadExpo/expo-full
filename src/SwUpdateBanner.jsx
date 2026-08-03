// Auto-applies service-worker updates without forcing the user to click. The
// previous version put a manual REFRESH button in front of the user, which
// meant a stale SW could keep serving the old bundle for many page loads.
// The earlier auto-version reloaded immediately on detection, but that ate
// unsaved state on surfaces without autosave (Smart Import in mid-mapping,
// uncommitted forms, etc.).
//
// Compromise: surface an "UPDATING…" pill, then trigger the reload only when
// it's safe — when the tab is hidden, OR after 60 seconds of no user input
// (interpreted as "user stepped away"). The user can also click the pill to
// update immediately.

import React, { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { C, FN, FB } from './theme';

const IDLE_MS = 60000;
const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'touchstart', 'scroll'];

export default function SwUpdateBanner() {
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW({
    onRegisterError(err) { console.warn('SW register failed:', err); },
  });
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    if (!needRefresh || updating) return;
    let lastActivity = Date.now();
    const bumpActivity = () => { lastActivity = Date.now(); };
    ACTIVITY_EVENTS.forEach(e => window.addEventListener(e, bumpActivity, { passive: true }));

    // Activate the waiting SW and reload. updateServiceWorker(true) reloads on
    // controllerchange, but if that doesn't fire (edge cases / older SW), a
    // hard fallback reload guarantees the page actually refreshes onto the new
    // build — so the banner can never get stuck showing forever.
    const applyUpdate = () => {
      try { updateServiceWorker(true); } catch { /* noop */ }
      setTimeout(() => { try { window.location.reload(); } catch { /* noop */ } }, 2500);
    };
    const tryUpdate = (reason) => {
      if (updating) return;
      setUpdating(true);
      // Tiny defer so the "UPDATING…" pill paints once before the reload.
      setTimeout(() => applyUpdate(), 400);
    };

    // Don't reload while a camera tool is actively capturing — a recording
    // emits no input events, so the idle timer would otherwise treat filming a
    // set as "stepped away" and reload, discarding the in-progress clip + rep
    // count + pose frames. Self-detects any <video> bound to a live MediaStream.
    // (camera audit)
    const cameraActive = () => {
      try { return [...document.querySelectorAll('video')].some(v => v.srcObject instanceof MediaStream && !v.paused); }
      catch { return false; }
    };
    // A form-video upload (compression + PUT) emits no input events and holds no
    // live stream, so the idle timer could reload mid-upload and drop the clip
    // before it lands in storage or the IDB blob queue. ClientPortal bumps this
    // counter around the upload. Same "don't reload during active work" intent.
    const uploadActive = () => { try { return (window.__expoUploadInFlight | 0) > 0; } catch { return false; } };
    const busy = () => cameraActive() || uploadActive();

    // Apply when tab is backgrounded — typing definitely paused.
    const onVis = () => { if (document.visibilityState === 'hidden' && !busy()) tryUpdate('hidden'); };
    document.addEventListener('visibilitychange', onVis);

    // Idle timer: poll once per second; if no input for IDLE_MS, apply.
    const idle = setInterval(() => {
      if (Date.now() - lastActivity >= IDLE_MS && !busy()) tryUpdate('idle');
    }, 1000);

    return () => {
      ACTIVITY_EVENTS.forEach(e => window.removeEventListener(e, bumpActivity));
      document.removeEventListener('visibilitychange', onVis);
      clearInterval(idle);
    };
  }, [needRefresh, updating, updateServiceWorker]);

  if (!needRefresh) return null;
  const onClick = () => { setUpdating(true); setTimeout(() => { try { updateServiceWorker(true); } catch { /* noop */ } setTimeout(() => { try { window.location.reload(); } catch { /* noop */ } }, 2500); }, 200); };
  // Centered BLOCKING modal (Ohad): a full-screen scrim so nothing behind it
  // is clickable until the user hits UPDATE NOW. The scrim itself is inert
  // (no onClick) — only the button acts, so the update can't be dismissed away.
  return (
    <div role="dialog" aria-modal="true" style={{
      position: 'fixed', inset: 0, zIndex: 100000,
      background: C.scrim || 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div style={{
        background: C.sf, border: `1px solid ${C.ac}`, borderRadius: 0,
        padding: '30px 34px', width: 'min(420px, 92vw)', textAlign: 'center',
        boxShadow: `0 24px 70px ${C.shadow}`,
      }}>
        <div style={{ fontFamily: FN, fontSize: 11, color: C.ac, letterSpacing: '0.2em', fontWeight: 700, marginBottom: 12 }}>
          {updating ? 'UPDATING…' : 'NEW VERSION AVAILABLE'}
        </div>
        <div style={{ fontFamily: FB, fontSize: 14, color: C.tx, lineHeight: 1.5, marginBottom: 22 }}>
          {updating ? 'Loading the latest version…' : 'A new version of EXPO is ready. Update now to continue.'}
        </div>
        {!updating && (
          <button onClick={onClick} style={{
            background: C.ac, color: 'var(--c-bg)', border: 'none',
            borderRadius: 0, padding: '13px 44px', fontFamily: FN, fontSize: 13, fontWeight: 700,
            letterSpacing: '0.18em', cursor: 'pointer',
          }}>UPDATE NOW</button>
        )}
      </div>
    </div>
  );
}
