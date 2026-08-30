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
// THE SESSION IS THE DOOR. IT MUST NEVER BE THE THING THAT GETS EVICTED.
//
// Ohad, 2026-08-30, could not sign in on any surface. The server was healthy
// the whole time - health 200, password grant 200, a valid token every attempt.
// The token then failed to PERSIST:
//
//   QuotaExceededError: Failed to execute 'setItem' on 'Storage': setting the
//   value of 'sb-gtcbfglttoiyfsnfbhdy-auth-token' exceeded the quota.
//
// The app caches store snapshots (exercises, plans, workouts) in the same
// localStorage, and once they fill the ~5 MB origin quota there is no room
// left for the session. Sign-in succeeds and is then thrown away, which looks
// exactly like a login failure and reports as a connection error.
//
// Snapshots are a convenience - every one of them can be refetched. The
// session cannot. So on a quota failure, evict the caches and keep the door.
const SNAPSHOT_PREFIXES = ['expo-', 'sb-cache-'];
const evictSnapshots = () => {
  let freed = 0;
  try {
    const keys = Object.keys(window.localStorage);
    // Biggest first: one large snapshot usually frees more than a dozen small
    // ones, and the fewer we drop the less the user has to refetch.
    const sized = keys
      .filter((k) => SNAPSHOT_PREFIXES.some((p) => k.startsWith(p)) && !/auth-token/.test(k))
      .map((k) => ({ k, n: (window.localStorage.getItem(k) || '').length }))
      .sort((a, b) => b.n - a.n);
    for (const { k, n } of sized) {
      window.localStorage.removeItem(k);
      freed += n;
      if (freed > 512 * 1024) break;   // half a megabyte is plenty for a token
    }
  } catch { /* nothing else we can do here */ }
  return freed;
};

const makeAuthStorage = () => {
  if (typeof window === 'undefined' || !window.localStorage) return undefined;
  const ls = window.localStorage;
  return {
    getItem: (k) => { try { return ls.getItem(k); } catch { return null; } },
    removeItem: (k) => { try { ls.removeItem(k); } catch { /* noop */ } },
    setItem: (k, v) => {
      try { ls.setItem(k, v); return; } catch { /* full - fall through */ }
      evictSnapshots();
      try { ls.setItem(k, v); return; } catch { /* still full */ }
      // Last resort: a session that survives this tab beats no session at all.
      try { window.sessionStorage.setItem(k, v); } catch { /* give up quietly */ }
    },
  };
};

const authStorage = makeAuthStorage();

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
