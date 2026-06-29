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
import { C, FN } from './theme';

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

    // Apply when tab is backgrounded — typing definitely paused.
    const onVis = () => { if (document.visibilityState === 'hidden' && !cameraActive()) tryUpdate('hidden'); };
    document.addEventListener('visibilitychange', onVis);

    // Idle timer: poll once per second; if no input for IDLE_MS, apply.
    const idle = setInterval(() => {
      if (Date.now() - lastActivity >= IDLE_MS && !cameraActive()) tryUpdate('idle');
    }, 1000);

    return () => {
      ACTIVITY_EVENTS.forEach(e => window.removeEventListener(e, bumpActivity));
      document.removeEventListener('visibilitychange', onVis);
      clearInterval(idle);
    };
  }, [needRefresh, updating, updateServiceWorker]);

  if (!needRefresh) return null;
  const onClick = () => { setUpdating(true); setTimeout(() => { try { updateServiceWorker(true); } catch { /* noop */ } setTimeout(() => { try { window.location.reload(); } catch { /* noop */ } }, 2500); }, 200); };
  return (
    <div style={{
      position: 'fixed', bottom: 'calc(14px + env(safe-area-inset-bottom))', left: '50%', transform: 'translateX(-50%)',
      zIndex: 200,
      background: C.sf, border: `1px solid ${C.ac}`, borderRadius: 0,
      padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 10,
      boxShadow: `0 8px 28px ${C.shadow}`,
      maxWidth: 'calc(100vw - 24px)',
    }}>
      <span style={{ fontFamily: FN, fontSize: 9, color: updating ? C.ac : C.tx, letterSpacing: '0.18em', fontWeight: 700 }}>
        {updating ? 'UPDATING…' : 'NEW VERSION'}
      </span>
      {!updating && (
        <button onClick={onClick} style={{
          background: 'transparent', color: C.ac, border: `1px solid ${C.ac}`,
          borderRadius: 0, padding: '8px 18px', fontFamily: FN, fontSize: 12, fontWeight: 700,
          letterSpacing: '0.18em', cursor: 'pointer',
        }}>UPDATE NOW</button>
      )}
    </div>
  );
}
