// src/supabase.js — Supabase client for EXPO. Also the canonical export
// point for SUPA_URL + SUPA_PUBLISHABLE_KEY so other modules (CoachChat,
// CoachLanding, ClientPortal) don't have to redeclare them inline.
import { createClient } from '@supabase/supabase-js';

export const SUPA_URL = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
export const SUPA_PUBLISHABLE_KEY = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';
// Back-compat aliases used by the original createClient call below.
const SUPABASE_URL = SUPA_URL;
const SUPABASE_ANON_KEY = SUPA_PUBLISHABLE_KEY;

// Auth storage = localStorage so logins persist across browser/PWA reopens.
// Clients (and trainers) stay signed in until they explicitly sign out or
// the refresh token expires. SSR guard keeps build/prerender steps from
// blowing up on missing window.
const authStorage =
  typeof window !== 'undefined' && window.localStorage ? window.localStorage : undefined;

// One-shot migration: prior to commit 438f891 the auth token lived in
// sessionStorage. Anyone with a session held in sessionStorage at the moment
// of the flip would be silently logged out on next visit. Copy the token
// over once so they stay signed in, then clear the old slot.
if (typeof window !== 'undefined' && window.sessionStorage && window.localStorage) {
  const TOKEN_KEY = 'sb-gtcbfglttoiyfsnfbhdy-auth-token';
  try {
    const legacy = window.sessionStorage.getItem(TOKEN_KEY);
    if (legacy && !window.localStorage.getItem(TOKEN_KEY)) {
      window.localStorage.setItem(TOKEN_KEY, legacy);
    }
    if (legacy) window.sessionStorage.removeItem(TOKEN_KEY);
  } catch { /* private mode / quota — ignore */ }
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: authStorage,
  },
});
