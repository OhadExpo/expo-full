// src/hooks/useTheme.js
// Shared theme state across the app. Each component that calls useTheme()
// gets its own React state copy, but a custom 'expo-theme-change' event
// keeps every instance in sync — when ANY component flips the theme via
// setTheme, every other consumer re-renders with the new value.
//
// Boot priority (resolved by inline script in index.html before this hook
// even mounts):
//   1. localStorage('expo-theme')
//   2. LIGHT (the default first impression — the OS preference is deliberately
//      NOT consulted; only an explicit in-app choice turns the app dark)
//
// On hook mount we ALSO check Supabase user_metadata.theme_pref. If it exists
// and differs from the current value, it wins (cross-device sync on login).

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { flushSync } from 'react-dom';
import { crossFade } from '../viewTransition';

const KEY = 'expo-theme';
const EVT = 'expo-theme-change';

// The remote preference is a LOGIN-time sync, not a running rule. It used to be
// re-read and re-applied by every component that mounted useTheme, so opening a
// screen that mounts a new consumer - the coach Dashboard does - snapped the
// theme back to whatever Supabase held and undid the toggle in front of you.
// Ohad: "when i click on dashboard on expo it automatically turns it to light
// mode." Once per page load, and never after the user has chosen for himself.
let remoteSyncDone = false;
let userChoseThisSession = false;

function readCurrent() {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.getAttribute('data-theme') || 'light';
}

let animTimer = null;
/**
 * Cross-fade the switch instead of hard-flipping it.
 *
 * Adding the class BEFORE data-theme changes means the transition is already
 * in place when every colour variable swaps, so the whole page eases together
 * rather than repainting in stages. Removed afterwards so ordinary interaction
 * keeps its own faster transitions. See the THEME CROSS-FADE block in
 * src/themes.css.
 *
 * Only on an actual CHANGE — never on the initial apply at boot, where a
 * cross-fade from an unstyled page would read as a flash.
 */
function beginThemeCrossFade(next) {
  const root = document.documentElement;
  const current = root.getAttribute('data-theme');
  if (!current || current === next) return;
  root.classList.add('theme-anim');
  if (animTimer) clearTimeout(animTimer);
  animTimer = setTimeout(() => {
    root.classList.remove('theme-anim');
    animTimer = null;
  }, 320);
}

/** The actual switch: attribute, system chrome, then tell every consumer. */
function commitTheme(next) {
  document.documentElement.setAttribute('data-theme', next);
  // Update <meta name="theme-color"> so iOS/Android system chrome matches.
  // Light mode is now cyan-bg, so the system chrome paints cyan, not white.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', next === 'light' ? '#39BDFF' : '#000000');
  // Broadcast so every other useTheme consumer re-renders.
  try { window.dispatchEvent(new CustomEvent(EVT, { detail: next })); } catch {}
}

/**
 * Switch the theme as ONE cross-fade.
 *
 * The CSS class alone was not enough (Ohad: "better, but it's still not smooth
 * at all"), and the reason is that a theme switch has two independent sources
 * of colour. The CSS custom properties flip the instant data-theme changes;
 * but every component that reads useTheme() re-renders with new INLINE colours
 * a frame or two later, and this codebase styles almost everything inline. So
 * the page changes in two waves however nicely each wave eases.
 *
 * The View Transition API removes the problem rather than smoothing it: the
 * browser snapshots the page, lets us make every change, and cross-fades the
 * before and after images as a single element. Staggered React commits inside
 * the callback are invisible — they all land in the "after" snapshot.
 *
 * The callback returns a promise, and the API waits for it, so we give React
 * two frames to commit before the new state is captured. Browsers without the
 * API (and anyone who asked for reduced motion) fall back to the CSS
 * cross-fade, which is still better than a hard flip.
 */
function applyTheme(next) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const current = root.getAttribute('data-theme');
  if (!current || current === next) { commitTheme(next); return; }

  // flushSync, not an awaited rAF — see the notes in src/viewTransition.js.
  // It forces every useTheme consumer to re-render synchronously inside the
  // callback, so the inline-styled half of the page is already correct when the
  // browser captures the "after" snapshot. This codebase styles almost
  // everything inline, so without it the page changes in two waves.
  crossFade(() => { flushSync(() => commitTheme(next)); });
}

export function useTheme() {
  const [theme, setThemeState] = useState(readCurrent);

  // Subscribe to theme changes so EVERY useTheme consumer stays in sync,
  // not just the one that called setTheme. Without this, the toggle button
  // updates its own state but other components (logo, content) keep stale.
  useEffect(() => {
    const onChange = (e) => {
      const next = e?.detail || readCurrent();
      if (next === 'light' || next === 'dark') setThemeState(next);
    };
    window.addEventListener(EVT, onChange);
    return () => window.removeEventListener(EVT, onChange);
  }, []);

  const setTheme = useCallback((next) => {
    // An explicit choice outranks the stored preference for the rest of the
    // session, even if writing it back to Supabase fails.
    userChoseThisSession = true;
    if (next !== 'light' && next !== 'dark') return;
    applyTheme(next);  // dispatches the event, which updates all consumers including this one
    try { localStorage.setItem(KEY, next); } catch (e) { /* private mode */ }
    // Fire-and-forget Supabase sync; ignore failure (offline, anon, etc.)
    supabase.auth.getUser().then(({ data }) => {
      if (data && data.user) {
        supabase.auth.updateUser({ data: { theme_pref: next } }).catch(() => {});
      }
    }).catch(() => {});
  }, []);

  // On mount: if Supabase has a non-null user_metadata.theme_pref that
  // differs from the current value, adopt it (cross-device sync on login).
  // Skip when a `?theme=` draft preview is active so it doesn't clobber it.
  useEffect(() => {
    let cancelled = false;
    let draftActive = false;
    try { draftActive = !!sessionStorage.getItem('expo-theme-preview'); } catch (e) {}
    if (draftActive) return;
    if (remoteSyncDone || userChoseThisSession) return;
    remoteSyncDone = true;
    supabase.auth.getUser().then(({ data }) => {
      if (cancelled || !data || !data.user) return;
      const remote = data.user.user_metadata && data.user.user_metadata.theme_pref;
      if (remote === 'light' || remote === 'dark') {
        const current = readCurrent();
        if (remote !== current) {
          applyTheme(remote);
          try { localStorage.setItem(KEY, remote); } catch (e) { /* private mode */ }
        }
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  }, [theme, setTheme]);

  return { theme, setTheme, toggleTheme };
}

// Convenience hook for consumers that just want theme-aware logo paths.
// The brand asset PNGs are mirrored at four sizes; light variants carry
// the black-on-transparent wordmark per BSG page 4. Bicolor (cyan caret
// + black/white wordmark) means the variants must be chosen at the
// asset level, not via CSS filter.
export function useLogoSrc() {
  const { theme } = useTheme();
  // Any non-dark (light-family) theme uses the black-wordmark light logo — not
  // just exact 'light'. Keying on === 'light' left light preview variants
  // (lightA/lightB/…) rendering the white-wordmark logo invisibly on a light bg.
  const isLight = theme !== 'dark';
  return {
    nav:    isLight ? '/logos/expo-logo-nav-light.png' : '/logos/expo-logo-nav.png',
    full:   isLight ? '/logos/expo-logo-light.png'      : '/logos/expo-logo.png',
    lg:     isLight ? '/logos/expo-logo-lg-light.png'   : '/logos/expo-logo-lg.png',
    icon:   isLight ? '/logos/expo-icon-light.png'      : '/logos/expo-icon-lg.png',
  };
}

