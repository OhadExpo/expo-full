// Post-sign-in "install the EXPO app" prompt (Ohad) — a blocking modal styled
// like SwUpdateBanner that nudges every signed-in user to add EXPO to their home
// screen. Mounted inside the authenticated shell so it only appears after login.
//
// Shows once per session (so it greets you after a fresh sign-in but never nags
// on in-app navigation), and never when the app is ALREADY installed (standalone
// display-mode). One-tap install where the browser supports it (the captured
// beforeinstallprompt); on iOS Safari — which has no programmatic install — it
// flips to the Share → "Add to Home Screen" instructions.

import React, { useEffect, useState } from 'react';
import { C, FN, FB } from './theme';

const SESSION_KEY = 'expo-install-prompt-shown';

const isStandalone = () => typeof window !== 'undefined'
  && (window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true);
const isIOS = () => typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent);

export default function InstallAppPrompt() {
  const [prompt, setPrompt] = useState(null);   // captured beforeinstallprompt
  const [open, setOpen] = useState(false);
  const [iosHelp, setIosHelp] = useState(false);

  useEffect(() => {
    if (isStandalone()) return undefined;                 // already installed
    let shown = false;
    try { shown = !!sessionStorage.getItem(SESSION_KEY); } catch { /* private mode */ }

    const show = () => {
      if (shown || isStandalone()) return;
      shown = true;
      try { sessionStorage.setItem(SESSION_KEY, '1'); } catch { /* noop */ }
      setOpen(true);
    };

    const onBip = (e) => { e.preventDefault(); setPrompt(e); show(); };
    window.addEventListener('beforeinstallprompt', onBip);
    const onInstalled = () => setOpen(false);
    window.addEventListener('appinstalled', onInstalled);

    // iOS never fires beforeinstallprompt — show the instruction variant shortly
    // after mount so those users still get the nudge. A tiny delay lets the app
    // paint first so the modal reads as "after sign-in", not a flash on load.
    let t = null;
    if (isIOS()) t = setTimeout(show, 1200);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBip);
      window.removeEventListener('appinstalled', onInstalled);
      if (t) clearTimeout(t);
    };
  }, []);

  if (!open) return null;

  const doInstall = async () => {
    if (prompt) {
      try { prompt.prompt(); await prompt.userChoice; } catch { /* noop */ }
      setPrompt(null);
      setOpen(false);
      return;
    }
    // No programmatic prompt (iOS / not-yet-eligible) → show manual steps.
    setIosHelp(true);
  };
  const close = () => setOpen(false);

  return (
    <div role="dialog" aria-modal="true" aria-label="Install EXPO" style={{
      position: 'fixed', inset: 0, zIndex: 99999,
      background: C.scrim || 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div style={{
        background: C.sf, border: `1px solid ${C.ac}`, borderRadius: 0,
        padding: '30px 34px', width: 'min(440px, 92vw)', textAlign: 'center',
        boxShadow: `0 24px 70px ${C.shadow || 'rgba(0,0,0,0.6)'}`,
      }}>
        <div style={{ fontFamily: FN, fontSize: 11, color: C.ac, letterSpacing: '0.2em', fontWeight: 700, marginBottom: 12 }}>
          GET THE EXPO APP
        </div>
        {iosHelp ? (
          <div style={{ fontFamily: FB, fontSize: 14, color: C.tx, lineHeight: 1.6, marginBottom: 22, textAlign: 'left' }}>
            Add EXPO to your home screen for the full app:
            <div style={{ marginTop: 10, color: C.tm, fontSize: 13, lineHeight: 1.7 }}>
              1. Tap the <b style={{ color: C.tx }}>Share</b> button in your browser bar.<br />
              2. Choose <b style={{ color: C.tx }}>Add to Home Screen</b>.<br />
              3. Tap <b style={{ color: C.tx }}>Add</b> — EXPO opens like a native app.
            </div>
          </div>
        ) : (
          <div style={{ fontFamily: FB, fontSize: 14, color: C.tx, lineHeight: 1.5, marginBottom: 22 }}>
            Install EXPO on your device — it opens full-screen like a native app, loads instantly, and works offline. One tap.
          </div>
        )}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          {!iosHelp && (
            <button onClick={doInstall} style={{
              background: C.ac, color: 'var(--c-bg)', border: 'none',
              borderRadius: 0, padding: '13px 40px', fontFamily: FN, fontSize: 13, fontWeight: 700,
              letterSpacing: '0.16em', cursor: 'pointer',
            }}>INSTALL EXPO</button>
          )}
          <button onClick={close} style={{
            background: 'transparent', color: C.tm, border: `1px solid ${C.cardBd}`,
            borderRadius: 0, padding: '13px 28px', fontFamily: FN, fontSize: 13, fontWeight: 700,
            letterSpacing: '0.16em', cursor: 'pointer',
          }}>{iosHelp ? 'GOT IT' : 'MAYBE LATER'}</button>
        </div>
      </div>
    </div>
  );
}
