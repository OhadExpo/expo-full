// Surfaces a small refresh prompt when vite-plugin-pwa detects a newer
// service worker. Without this, Add-to-Home-Screen visitors hold onto stale
// bundles indefinitely — `autoUpdate` waits for the next page load *after* the
// SW activates, which on a PWA happens "never" until the user closes and
// reopens the app.
//
// The banner only renders when needUpdate is true, so it stays invisible on
// first install and on browser visitors who already have the latest bundle.

import React from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { C, FN } from './theme';

export default function SwUpdateBanner() {
  const { needRefresh: [needRefresh, setNeedRefresh], updateServiceWorker } = useRegisterSW({
    onRegisterError(err) { console.warn('SW register failed:', err); },
  });
  if (!needRefresh) return null;
  return (
    <div style={{
      position: 'fixed', bottom: 14, left: '50%', transform: 'translateX(-50%)',
      zIndex: 200,
      background: C.bg, border: `1px solid ${C.ac}`, borderRadius: 0,
      padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10,
      boxShadow: '0 8px 28px rgba(0,0,0,0.5)',
      maxWidth: 'calc(100vw - 24px)',
    }}>
      <span style={{
        fontFamily: FN, fontSize: 9, color: C.tx, letterSpacing: '0.18em', fontWeight: 700,
      }}>NEW VERSION AVAILABLE</span>
      <button onClick={() => updateServiceWorker(true)} style={{
        background: 'transparent', color: C.ac, border: `1px solid ${C.ac}`, borderRadius: 0,
        padding: '6px 12px', fontFamily: FN, fontSize: 11, fontWeight: 700,
        letterSpacing: '0.18em', cursor: 'pointer',
      }}>REFRESH</button>
      <button onClick={() => setNeedRefresh(false)} title="Dismiss" style={{
        background: 'transparent', color: C.tm, border: 'none',
        padding: '6px 4px', cursor: 'pointer', fontFamily: FN, fontSize: 14,
      }}>×</button>
    </div>
  );
}
