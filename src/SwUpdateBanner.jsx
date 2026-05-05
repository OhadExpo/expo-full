// Auto-applies service-worker updates as soon as vite-plugin-pwa detects a
// newer bundle. The previous version put a manual REFRESH button in front of
// the user, which meant a stale SW could keep serving the old bundle for many
// page loads if the user dismissed or ignored the prompt. With autosave on
// every editing surface, an unannounced reload is safe — and worth it to
// guarantee the freshest bundle on every deploy.
//
// A small "UPDATING…" pill flashes briefly so the reload isn't completely
// silent, then the page reloads with the new bundle.

import React, { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { C, FN } from './theme';

export default function SwUpdateBanner() {
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW({
    onRegisterError(err) { console.warn('SW register failed:', err); },
  });
  useEffect(() => {
    if (!needRefresh) return;
    // Tiny defer so the pill paints once before the reload kicks in.
    const t = setTimeout(() => { updateServiceWorker(true); }, 400);
    return () => clearTimeout(t);
  }, [needRefresh, updateServiceWorker]);
  if (!needRefresh) return null;
  return (
    <div style={{
      position: 'fixed', bottom: 14, left: '50%', transform: 'translateX(-50%)',
      zIndex: 200,
      background: C.bg, border: `1px solid ${C.ac}`, borderRadius: 0,
      padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 8,
      boxShadow: '0 8px 28px rgba(0,0,0,0.5)',
      maxWidth: 'calc(100vw - 24px)',
    }}>
      <span style={{
        fontFamily: FN, fontSize: 9, color: C.ac, letterSpacing: '0.18em', fontWeight: 700,
      }}>UPDATING…</span>
    </div>
  );
}
