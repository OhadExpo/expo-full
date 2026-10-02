// Service-worker updates, with rules (Ohad 2026-09-11: "my athletes are
// complaining that they get the update notification every single time they
// log in"). The previous version was a full-screen BLOCKING modal the moment
// a new worker was waiting - which, in a week of daily deploys, met every
// athlete at every login.
//
// The rules now:
//   1. Nothing in the first 12 seconds of a load. A login is not the moment.
//   2. First sight of a new version: a small NON-blocking pill at the top,
//      with UPDATE and LATER. LATER snoozes it for 24 hours.
//   3. The update still applies itself when it is safe - tab hidden, or 60s
//      without input - so an ignored pill is not a stale app; the athlete
//      simply never has to click.
//   4. Never mid-workout, never while filming, never while an upload is in
//      flight: no pill, no auto-apply.
//   5. Once per version: after LATER, the same pending version is not shown
//      again on this bundle; a NEW deploy is a new pill.
//   6. The blocking modal only returns if an update has been ignored for 3
//      days - a stale app for that long is a support problem, not a courtesy.
//
// 27.9, Ohad: "for athletes: it automatically update the app instead of
// asking, as soon as the app starts or log-in or sign-in is made" / "automatic
// fast update for them" / "same everywhere: automatic update when changing
// url/moving inside the website/signing-logging. pop up only appears when im
// stale on one page - live". So, for every seat:
//   A. A FRESH LOAD applies a waiting update silently (the first 20s, before
//      any input) - opening the app lands on the newest build, no question.
//   B. EVERY NAVIGATION (the URL changes: a tab, a page, signing in or out)
//      checks the server for a new build and, if one is waiting, reloads
//      silently onto the page just opened - nothing has been typed there yet.
//   C. The pill appears only for someone who stays on ONE page while a deploy
//      lands; idle / hidden still apply it on their own (rule 3).
//   Rule 4 (never mid-workout, filming or uploading) still overrides A-C.
//
// 29.9 (#464), Ohad: "on the popup for updates - no later option just update -
// if im not touching or irresponsive (unless im writing something or in the
// athelete portal - refresh and update on your own)". So:
//   - the pill has ONE button, UPDATE (LATER and its 24h snooze are gone);
//   - idle (IDLE_MS without input) or a hidden tab applies the update itself,
//     EXCEPT while something is being written (a focused field, or any visible
//     field holding typed text) and EXCEPT on the athlete portal, where the
//     pill waits for the tap. Rules A/B (fresh load, navigation) are unchanged.

import React, { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { C, FN, FB } from './theme';
import { tr, readLang } from './i18n';
import { hasPendingWorkouts } from './offlineQueue';

const IDLE_MS = 60000;
const GRACE_MS = 12000;               // rule 1
const FRESH_MS = 20000;               // rule A
const NAG_AFTER_MS = 3 * 24 * 3600 * 1000; // rule 6
const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'touchstart', 'scroll'];
const K_FIRST = 'expo-update-first-seen';   // "<bundle>|<ms>"

// The bundle this page runs: the same pending update stays pending until it is
// applied, so "once per version" is "once per bundle the athlete is on".
const bundleId = () => {
  try { const s = document.querySelector('script[src*="/assets/index-"]'); return s ? (s.getAttribute('src').match(/index-([^.]+)\./) || [])[1] || 'b' : 'b'; } catch { return 'b'; }
};
const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };

export default function SwUpdateBanner() {
  const regRef = React.useRef(null);
  const { needRefresh: [swNeedRefresh], updateServiceWorker } = useRegisterSW({
    onRegisteredSW(_url, r) { regRef.current = r || null; },
    onRegisterError(err) { console.warn('SW register failed:', err); },
  });
  const [silent, setSilent] = useState(false);   // rules A/B: reloading with no UI
  // TEST SWITCH: localStorage 'expo-test-sw-banner' = '1' shows the pill with no
  // pending update and no grace delay, so its layout can be looked at and gated
  // (it cannot otherwise be produced on demand). Inert unless the key is set.
  const forced = lsGet('expo-test-sw-banner') === '1';
  const needRefresh = swNeedRefresh || forced;
  const [updating, setUpdating] = useState(false);
  // Rule B, the check: every URL change asks the server for a newer build, so
  // a deploy is found on the next click instead of the SW's own hourly check.
  useEffect(() => {
    let last = window.location.pathname;
    const iv = setInterval(() => {
      if (window.location.pathname === last) return;
      last = window.location.pathname;
      window.__expoLastNav = Date.now();
      try { regRef.current && regRef.current.update && regRef.current.update(); } catch { /* offline */ }
    }, 800);
    return () => clearInterval(iv);
  }, []);
  const [tick, setTick] = useState(0);           // re-evaluates the rules once a second
  const lang = readLang();
  const t = (s) => tr(lang, s);

  useEffect(() => {
    if (!needRefresh || updating) return;
    let lastActivity = Date.now();
    const bumpActivity = () => { lastActivity = Date.now(); };
    ACTIVITY_EVENTS.forEach(e => window.addEventListener(e, bumpActivity, { passive: true }));

    // Rule 5: remember when THIS bundle first saw a pending update.
    const first = lsGet(K_FIRST);
    if (!first || first.split('|')[0] !== bundleId()) lsSet(K_FIRST, `${bundleId()}|${Date.now()}`);

    // Activate the waiting SW and reload. updateServiceWorker(true) reloads on
    // controllerchange; the hard fallback guarantees the page lands on the new
    // build even if that event never fires.
    const applyUpdate = () => {
      try { updateServiceWorker(true); } catch { /* noop */ }
      setTimeout(() => { try { window.location.reload(); } catch { /* noop */ } }, 2500);
    };
    const tryUpdate = () => {
      if (updating) return;
      setUpdating(true);
      setTimeout(() => applyUpdate(), 400);
    };

    // Rule 4. A recording emits no input events; an upload holds no stream; a
    // workout in progress is the athlete's set, not a good moment for a reload.
    const cameraActive = () => { try { return [...document.querySelectorAll('video')].some(v => v.srcObject instanceof MediaStream && !v.paused); } catch { return false; } };
    const uploadActive = () => { try { return (window.__expoUploadInFlight | 0) > 0; } catch { return false; } };
    const workoutActive = () => { try { return (window.__expoWorkoutActive | 0) > 0; } catch { return false; } };
    // A finished workout still waiting in the offline queue (not yet confirmed
    // by the server) exists only on this device: never reload over it. The
    // queue survives a reload, but a reload right after Complete is exactly the
    // moment the old code lost sessions, so the update simply waits. (27.9)
    const workoutUnsaved = () => { try { return hasPendingWorkouts(); } catch { return false; } };
    // A Google sign-in coming back (the token in the URL, or its boot copy not
    // spent yet) is never a moment to reload: a reload there is one way the
    // return gets lost (27.9 #346).
    const signingIn = () => { try { return /access_token=|[?&]code=/.test(window.location.href) || !!window.sessionStorage.getItem('expo-oauth-hash'); } catch { return false; } };
    const busy = () => cameraActive() || uploadActive() || workoutActive() || workoutUnsaved() || signingIn();
    // #464: the two places a reload is never taken on its own - something is
    // being written (a focused field, or typed text sitting in any visible
    // field), or the athlete portal (the pill waits for the athlete's tap).
    const writing = () => { try {
      const a = document.activeElement;
      if (a && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))) return true;
      return [...document.querySelectorAll('textarea, input:not([type]), input[type=text], input[type=search], input[type=email], input[type=number], input[type=tel], [contenteditable="true"]')]
        .some((x) => (x.isContentEditable ? (x.textContent || '').trim() : (x.value || '').trim()) && x.getClientRects().length > 0);
    } catch { return true; } };
    // ...and the public form pages (#510-R2 M10): a half-filled intake, a contract
    // being signed or a booking being made is never reloaded from under the visitor
    const onAthletePortal = () => { try { return /^\/(athlete|demo\/athlete|intake|sign|book)(\/|$)/.test(window.location.pathname) || !!document.body.getAttribute('data-athlete-lang'); } catch { return true; } };
    const autoOk = () => !busy() && !writing() && !onAthletePortal();

    // Rule 3: apply when the tab is hidden, or after IDLE_MS without input.
    const onVis = () => { if (document.visibilityState === 'hidden' && autoOk()) tryUpdate(); };
    document.addEventListener('visibilitychange', onVis);
    // Rule A: a fresh load with an update already waiting takes it at once.
    const loadedAtMs = (typeof performance !== 'undefined' && performance.timeOrigin) || Date.now();
    const freshNoInput = () => Date.now() - loadedAtMs < FRESH_MS && lastActivity <= loadedAtMs + 50;
    const silentApply = () => { if (updating) return; setSilent(true); setUpdating(true); setTimeout(() => applyUpdate(), 50); };
    // Rule B, second half: the navigation's own check found it just now - the
    // page was opened moments ago and nothing has been typed on it.
    let lastKey = 0;
    const onKey = () => { lastKey = Date.now(); };
    window.addEventListener('keydown', onKey);
    const navAt = window.__expoLastNav || 0;
    const justNavigated = () => Date.now() - navAt < 15000 && lastKey < navAt;
    if (!forced && (freshNoInput() || justNavigated()) && !busy()) {
      silentApply();
      return () => { ACTIVITY_EVENTS.forEach(e => window.removeEventListener(e, bumpActivity)); window.removeEventListener('keydown', onKey); };
    }
    // Rule B: the URL changed since this update was found -> land on the new build there.
    const pathAtFind = window.location.pathname;
    const idle = setInterval(() => {
      setTick((n) => n + 1);
      // a navigation lands on the new build - but never over typed text (AUDIT-470:
      // an upload ending after the coach moved page and started a note reloaded it)
      if (!forced && window.location.pathname !== pathAtFind && !busy() && !writing()) { silentApply(); return; }
      if (Date.now() - lastActivity >= IDLE_MS && autoOk()) tryUpdate();
    }, 1000);

    return () => {
      ACTIVITY_EVENTS.forEach(e => window.removeEventListener(e, bumpActivity));
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('visibilitychange', onVis);
      clearInterval(idle);
    };
  }, [needRefresh, updating, updateServiceWorker]);

  if (silent) return null;
  if (!needRefresh) return null;
  void tick;
  const now = Date.now();
  const loadedAt = (typeof performance !== 'undefined' && performance.timeOrigin) || now;
  const busyNow = (() => { try { return (window.__expoWorkoutActive | 0) > 0 || (window.__expoUploadInFlight | 0) > 0; } catch { return false; } })();
  const first = lsGet(K_FIRST);
  const firstSeen = first && first.split('|')[0] === bundleId() ? Number(first.split('|')[1]) : now;
  const nag = now - firstSeen > NAG_AFTER_MS;                       // rule 6

  if (!updating) {
    if (!forced && now - loadedAt < GRACE_MS) return null;         // rule 1
    if (busyNow) return null;                                        // rule 4
  }

  const onUpdate = () => { setUpdating(true); setTimeout(() => { try { updateServiceWorker(true); } catch { /* noop */ } setTimeout(() => { try { window.location.reload(); } catch { /* noop */ } }, 2500); }, 200); };

  if (nag || updating) {
    // The old blocking modal, kept for the case that earns it.
    return (
      <div role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, zIndex: 100000, background: C.scrim || 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <div style={{ background: C.sf, border: `1px solid ${C.ac}`, borderRadius: 0, padding: '30px 34px', width: 'min(420px, 92vw)', textAlign: 'center', boxShadow: `0 24px 70px ${C.shadow}` }}>
          <div style={{ fontFamily: FN, fontSize: 11, color: C.ac, letterSpacing: '0.2em', fontWeight: 700, marginBottom: 12 }}>
            {updating ? t('UPDATING…') : t('NEW VERSION AVAILABLE')}
          </div>
          <div style={{ fontFamily: FB, fontSize: 14, color: C.tx, lineHeight: 1.5, marginBottom: 22 }}>
            {updating ? t('Loading the latest version…') : t('A new version of EXPO is ready. Update now to continue.')}
          </div>
          {!updating && (
            <button onClick={onUpdate} style={{ background: C.ac, color: 'var(--c-bg)', border: 'none', borderRadius: 0, padding: '13px 44px', fontFamily: FN, fontSize: 13, fontWeight: 700, letterSpacing: '0.18em', cursor: 'pointer' }}>{t('UPDATE NOW')}</button>
          )}
        </div>
      </div>
    );
  }

  // The pill (rule 2): a strip near the top, nothing behind it blocked.
  //
  // Ohad, 17.9: "the 'update' message pop up borders are not perfect. the top is
  // invisible." It was flush against y=0 with `borderTop: 'none'`, so the card
  // had three sides and read as a clipped box. It now floats down with all four
  // borders drawn, keeps a 12px gutter on each side so a phone never has it
  // touching the screen edge, and wraps instead of overflowing at 390.
  //
  // Ohad again, 23.9: "sometimes it only shows the lower part". A flat `top:
  // 10` is enough in a browser tab and not enough in the INSTALLED app: in
  // standalone PWA mode the viewport starts behind the status bar and the
  // notch, so the pill's top edge and its top border are drawn underneath
  // them. That is exactly "only the lower part", and it is why it happens
  // only sometimes — it depends on how the app was opened. The safe-area
  // inset resolves to 0 in a normal tab, so this costs nothing there.
  //
  // Ohad, 26.9 (phone): "update pop up is fucked up... two buttns on two
  // different row and now full cyan borders". It was a wrapping inline-flex, so
  // at 390 LATER fell to a second row; and it wore the full cyan border. Now ONE
  // row at every width — the label takes what is left and may wrap inside its
  // own column, the two buttons stand side by side at the one control height.
  // The full cyan border stays: that is what he wants on it ("i do want full
  // cyan borders around the popup").
  const btn = { flexShrink: 0, height: 'var(--btn-h)', boxSizing: 'border-box', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 14px', borderRadius: 0, fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.16em', cursor: 'pointer', whiteSpace: 'nowrap' };
  return (
    <div role="status" style={{ position: 'fixed', top: 'calc(10px + env(safe-area-inset-top, 0px))', left: 0, right: 0, zIndex: 100000, display: 'flex', justifyContent: 'center', padding: '0 12px', pointerEvents: 'none' }}>
      <div style={{ pointerEvents: 'auto', display: 'flex', alignItems: 'center', gap: 10, width: 'min(560px, 100%)', boxSizing: 'border-box', background: C.sf, border: `1px solid ${C.ac}`, borderRadius: 0, paddingBlock: 8, paddingInlineStart: 14, paddingInlineEnd: 8, boxShadow: `0 10px 30px ${C.shadow}` }}>
        {/* ONE LINE (Ohad 26.9: "never put two rows in a title box ... always
            one row"). At 390 the English label wrapped to two; a phone gets the
            short form, which still reads beside UPDATE, and never an ellipsis. */}
        <style>{`.sw-lbl-short{display:none}@media (max-width:520px){.sw-lbl-full{display:none}.sw-lbl-short{display:inline}}`}</style>
        <span style={{ flex: '1 1 auto', minWidth: 0, fontFamily: FN, fontSize: 10, color: C.ac, letterSpacing: '0.14em', fontWeight: 700, lineHeight: 1.3, whiteSpace: 'nowrap' }}>
          <span className="sw-lbl-full">{t('NEW VERSION AVAILABLE')}</span><span className="sw-lbl-short">{t('NEW VERSION')}</span>
        </span>
        {/* ONE action (#464: "no later option just update") */}
        <button onClick={onUpdate} style={{ ...btn, background: C.ac, color: 'var(--c-bg)', border: `1px solid ${C.ac}` }}>{t('UPDATE')}</button>
      </div>
    </div>
  );
}
