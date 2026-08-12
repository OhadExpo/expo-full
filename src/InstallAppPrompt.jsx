// Post-sign-in "get the EXPO app" prompt (Ohad) — a blocking modal styled like
// SwUpdateBanner that nudges every signed-in user onto the PWA. Mounted inside the
// authenticated shell so it only appears after login; once per session; never when
// already running as the installed app (standalone).
//
// The install event is captured GLOBALLY and early (pwaInstall.js, imported before
// React) and read here — a component-level beforeinstallprompt listener races the
// once-per-load native event and misses it, and the LoginScreen listening too
// would eat it first (adversarial-review H1). iPad (which reports a Mac UA) and
// iOS-non-Safari are handled explicitly (H2/M2).

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { C, FN, FB } from './theme';
import { getInstallEvent, clearInstallEvent, onInstallReady, isIOS, isIOSSafari, isStandalone } from './pwaInstall';

// A DISMISSAL snooze in localStorage (not sessionStorage) so tapping "MAYBE
// LATER" isn't re-nagged with a blocking modal every browser session
// (adversarial-QA #8). Cleared on appinstalled.
const SNOOZE_KEY = 'expo-install-snooze-until';
const SNOOZE_MS = 14 * 24 * 60 * 60 * 1000; // re-offer after ~2 weeks
const snoozeInstall = () => { try { localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MS)); } catch { /* private mode */ } };

export default function InstallAppPrompt() {
  const [prompt, setPrompt] = useState(null); // captured beforeinstallprompt (Android/Chrome)
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState('install'); // 'install' | 'ios' | 'installed'

  useEffect(() => {
    if (isStandalone()) return undefined;                 // already IN the installed app
    let shown = false;
    try { shown = Date.now() < (parseInt(localStorage.getItem(SNOOZE_KEY), 10) || 0); } catch { /* private mode */ }
    let cancelled = false;

    const show = (m) => {
      if (cancelled || shown || isStandalone()) return;
      shown = true;
      setMode(m);
      setOpen(true);
    };

    // Android/Chrome: read the globally-captured event now, and subscribe in case
    // it arrives a beat later. Both paths land on the same 'install' modal.
    // Desktop (mouse-only) doesn't get the phone-oriented "add to home screen"
    // nag (adversarial-review M5) — capture the event but only surface the modal
    // on touch devices. iOS/installed branches are already touch-only.
    const isTouch = (typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window;
    const unsub = onInstallReady((e) => { setPrompt(e); if (isTouch) show('install'); });
    const existing = getInstallEvent();
    if (existing) { setPrompt(existing); if (isTouch) show('install'); }

    // Already installed but opened in the BROWSER (not standalone): offer "go to
    // the app" instead of nagging install. getInstalledRelatedApps is Chrome-only
    // + best-effort; if unavailable the normal install path just proceeds.
    if (navigator.getInstalledRelatedApps) {
      navigator.getInstalledRelatedApps().then((apps) => {
        if (!cancelled && apps && apps.length) show('installed');
      }).catch(() => { /* unsupported / denied */ });
    }

    // iOS/iPadOS never fire beforeinstallprompt — nudge them with the Share flow
    // after a short beat so it reads as "after sign-in", not a flash on load.
    let t = null;
    if (isIOS()) t = setTimeout(() => show('ios'), 1200);

    const onInstalled = () => { try { localStorage.removeItem(SNOOZE_KEY); } catch { /* noop */ } setOpen(false); };
    window.addEventListener('appinstalled', onInstalled);
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); }; // review L1
    window.addEventListener('keydown', onKey);
    return () => {
      cancelled = true;
      unsub();
      window.removeEventListener('appinstalled', onInstalled);
      window.removeEventListener('keydown', onKey);
      if (t) clearTimeout(t);
    };
  }, []);

  if (!open) return null;

  const doPrimary = async () => {
    if (prompt) {
      try { prompt.prompt(); await prompt.userChoice; } catch { /* user dismissed */ }
      clearInstallEvent();
      setPrompt(null);
      snoozeInstall();   // if they declined the OS sheet, don't re-nag next session; a real install clears it via appinstalled (#8)
      setOpen(false);
      return;
    }
    // No programmatic install (iOS, or installed-in-browser) → the instructions
    // ARE the action; keep the modal on its guidance screen. Nothing to do here.
  };
  const close = () => { snoozeInstall(); setOpen(false); }; // "MAYBE LATER" snoozes ~2 weeks (#8)

  // Copy per mode.
  const iosNonSafari = mode === 'ios' && !isIOSSafari();
  const body = mode === 'installed' ? (
    <>You already have EXPO installed — open it from your <b style={{ color: C.tx }}>home screen</b> icon for the full-screen app.</>
  ) : mode === 'ios' ? (
    iosNonSafari ? (
      <>To add EXPO to your home screen, open this page in <b style={{ color: C.tx }}>Safari</b> first, then Share → <b style={{ color: C.tx }}>Add to Home Screen</b>.</>
    ) : (
      <>Add EXPO to your home screen for the full app:
        <div style={{ marginTop: 10, color: C.tm, fontSize: 13, lineHeight: 1.7, textAlign: 'left' }}>
          1. Tap the <b style={{ color: C.tx }}>Share</b> button in the browser bar.<br />
          2. Choose <b style={{ color: C.tx }}>Add to Home Screen</b>.<br />
          3. Tap <b style={{ color: C.tx }}>Add</b> — EXPO opens full-screen from your home screen.
        </div>
      </>
    )
  ) : (
    <>Add EXPO to your home screen — one tap, and it's always there, full-screen and ready.</>
  );

  // Only the Android/Chrome path has a real one-tap action button; iOS/installed
  // are instruction-only, so they show a single dismiss.
  const hasPrimary = mode === 'install' && !!prompt;
  const btn = (label, primary, onClick) => (
    <button onClick={onClick} style={{
      flex: 1, minWidth: 120, boxSizing: 'border-box',
      background: primary ? C.ac : 'transparent',
      color: primary ? 'var(--c-bg)' : C.tm,
      border: primary ? 'none' : `1px solid ${C.cardBd}`,
      borderRadius: 0, padding: '13px 0', fontFamily: FN, fontSize: 13, fontWeight: 700,
      letterSpacing: '0.14em', cursor: 'pointer',
    }}>{label}</button>
  );

  // Rendered via portal to document.body (app-wide rule: every fixed overlay is
  // a portal, so no transformed ancestor can break position:fixed — review L1).
  return createPortal((
    <div role="dialog" aria-modal="true" aria-label="Get the EXPO app" onClick={close} style={{
      position: 'fixed', inset: 0, zIndex: 99999,
      background: C.scrim || 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: C.sf, border: `1px solid ${C.ac}`, borderRadius: 0,
        padding: '30px 34px', width: 'min(440px, 92vw)', textAlign: 'center',
        boxShadow: `0 24px 70px ${C.shadow || 'rgba(0,0,0,0.6)'}`,
      }}>
        <div style={{ fontFamily: FN, fontSize: 11, color: C.ac, letterSpacing: '0.2em', fontWeight: 700, marginBottom: 12 }}>
          {mode === 'installed' ? 'OPEN THE EXPO APP' : 'GET THE EXPO APP'}
        </div>
        <div style={{ fontFamily: FB, fontSize: 14, color: C.tx, lineHeight: 1.5, marginBottom: 22 }}>{body}</div>
        {/* Both buttons identical size (Ohad): a flex row, each flex:1, same pad. */}
        <div style={{ display: 'flex', gap: 10 }}>
          {hasPrimary && btn('GO TO APP', true, doPrimary)}
          {/* Installed-in-browser has no real "launch the app" web API, so the
              honest CTA is a plain acknowledge, not "MAYBE LATER" (review M3). */}
          {btn(mode === 'installed' ? 'GOT IT' : 'MAYBE LATER', false, close)}
        </div>
      </div>
    </div>
  ), document.body);
}
