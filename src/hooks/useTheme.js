// src/hooks/useTheme.js
// Shared theme state across the app. Each component that calls useTheme()
// gets its own React state copy, but a custom 'expo-theme-change' event
// keeps every instance in sync — when ANY component flips the theme via
// setTheme, every other consumer re-renders with the new value.
//
// Boot priority (resolved by inline script in index.html before this hook
// even mounts):
//   1. localStorage('expo-theme')
//   2. matchMedia('(prefers-color-scheme: light)')
//   3. dark fallback
//
// On hook mount we ALSO check Supabase user_metadata.theme_pref. If it exists
// and differs from the current value, it wins (cross-device sync on login).

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabase';

const KEY = 'expo-theme';
const EVT = 'expo-theme-change';

function readCurrent() {
  if (typeof document === 'undefined') return 'dark';
  return document.documentElement.getAttribute('data-theme') || 'dark';
}

function applyTheme(next) {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', next);
  // Update <meta name="theme-color"> so iOS/Android system chrome matches.
  // Light mode is now cyan-bg, so the system chrome paints cyan, not white.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', next === 'light' ? '#39BDFF' : '#000000');
  // Broadcast so every other useTheme consumer re-renders.
  try { window.dispatchEvent(new CustomEvent(EVT, { detail: next })); } catch {}
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
  useEffect(() => {
    let cancelled = false;
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
  const isLight = theme === 'light';
  return {
    nav:    isLight ? '/logos/expo-logo-nav-light.png' : '/logos/expo-logo-nav.png',
    full:   isLight ? '/logos/expo-logo-light.png'      : '/logos/expo-logo.png',
    lg:     isLight ? '/logos/expo-logo-lg-light.png'   : '/logos/expo-logo-lg.png',
    icon:   isLight ? '/logos/expo-icon-light.png'      : '/logos/expo-icon-lg.png',
  };
}

