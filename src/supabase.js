// src/supabase.js — Supabase client for EXPO. Also the canonical export
// point for SUPA_URL + SUPA_PUBLISHABLE_KEY so other modules (CoachChat,
// CoachLanding, ClientPortal) don't have to redeclare them inline.
import { createClient } from '@supabase/supabase-js';

export const SUPA_URL = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
export const SUPA_PUBLISHABLE_KEY = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';
// Back-compat aliases used by the original createClient call below.
const SUPABASE_URL = SUPA_URL;
// Where supabase-js keeps the session. Exported so auth.jsx can tell "this
// device holds a refresh token" from "this person is signed out".
export const AUTH_TOKEN_KEY = 'sb-gtcbfglttoiyfsnfbhdy-auth-token';
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
// NOT EVERY expo- KEY IS A SNAPSHOT. The comment above is right that a cached
// copy of the server's data can always be refetched - but a few of these keys
// are the ONLY copy of something the coach made, and this evictor deletes
// BIGGEST FIRST, which is exactly what a list of fifty saved shot analyses is.
// Losing the session is bad; silently deleting his analyses to save it is worse
// and he would never know why they went. They are excluded here and mirrored to
// the server by their own screens.
const NEVER_EVICT = new Set([
  'expo-shot-analyses',    // 50 analyses with their checkpoints - the biggest key here
  'expo-sensor-readings',  // lab readings filed against an athlete
  'expo-pose-metrics',     // the Bar-Speed Vault: his velocity/ROM trends, local BY DESIGN
  'expo-offline-queue',    // WRITES THAT HAVE NOT REACHED THE SERVER YET. Evicting this
                           // does not lose a cache, it loses what someone typed offline.
  'expo-lead-notes',       // notes he typed on a lead
]);
const evictSnapshots = () => {
  let freed = 0;
  try {
    const keys = Object.keys(window.localStorage);
    // Biggest first: one large snapshot usually frees more than a dozen small
    // ones, and the fewer we drop the less the user has to refetch.
    const sized = keys
      .filter((k) => SNAPSHOT_PREFIXES.some((p) => k.startsWith(p)) && !/auth-token/.test(k) && !NEVER_EVICT.has(k))
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

// KEEPING ATHLETES SIGNED IN WHEN A STORE GETS CLEARED.
//
// Ohad, 21.9: "make sure all athletes are stayed logged in even when closing
// the app or chrome or safari".
//
// The server was checked first and is not the cause: auth.sessions has ZERO
// rows with not_after set, the oldest live session is five months old, and
// sessions are observed surviving 35 days with no cliff anywhere. Nothing
// signs anyone out server-side. The session is lost on the DEVICE — Safari
// capping script-writable storage, an iOS PWA evicted under storage pressure,
// a "clear site data", a full quota.
//
// The first attempt mirrored the WHOLE session to a cookie and silently did
// nothing: the session JSON measures 4,143 chars, 5,109 once URL-encoded, and
// a cookie is capped near 4,096. Measuring it is what found that — and the
// same measurement found the way through. The refresh token is TWELVE
// characters. Everything else in that blob (a 1,486-char access token, the
// whole user object) is derivable from it.
//
// So: localStorage stays the primary store, sessionStorage stays the
// quota fallback, and a tiny cookie holds only the refresh token. If both
// stores are gone on the next visit, reviveSession() below trades that one
// string for a fresh session and the athlete never sees a login screen.
//
// Exposure is unchanged: the refresh token already sits in localStorage, which
// any script on this origin can read. Secure + SameSite=Lax, and it is removed
// on sign-out along with everything else.
export const REFRESH_COOKIE = 'expo-rt';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 400;         // ~13 months, the browser cap

const cookieGet = (k) => {
  // Split, do not match. A RegExp buys nothing for a fixed key and an escaped
  // character class written through a shell is how this file got an
  // unterminated regex the first time round.
  try {
    for (const part of String(document.cookie || '').split(';')) {
      const i = part.indexOf('=');
      if (i < 0) continue;
      if (part.slice(0, i).trim() !== k) continue;
      return decodeURIComponent(part.slice(i + 1));
    }
  } catch { /* cookies blocked */ }
  return null;
};
const cookieSet = (k, v) => {
  try {
    const secure = location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${k}=${encodeURIComponent(v)}; Max-Age=${COOKIE_MAX_AGE}; Path=/; SameSite=Lax${secure}`;
  } catch { /* blocked */ }
};
const cookieDel = (k) => { try { document.cookie = `${k}=; Max-Age=0; Path=/`; } catch { /* noop */ } };

// Pull the refresh token out of whatever supabase-js just handed the store.
const refreshTokenOf = (raw) => {
  try {
    const o = JSON.parse(raw);
    const t = o && (o.refresh_token || (o.currentSession && o.currentSession.refresh_token));
    return typeof t === 'string' && t ? t : null;
  } catch { return null; }
};

const makeAuthStorage = () => {
  if (typeof window === 'undefined' || !window.localStorage) return undefined;
  const ls = window.localStorage;
  return {
    // READ FROM WHICHEVER STORE STILL HAS IT.
    //
    // This used to read localStorage alone while setItem had a sessionStorage
    // fallback for a full quota — so that fallback was WRITE-ONLY. A token
    // written there because localStorage was full was never read back and the
    // next page load was a logged-out one. That is a sign-out caused entirely
    // inside this app, and it is indistinguishable from the browser forgetting
    // you.
    getItem: (k) => {
      try { const v = ls.getItem(k); if (v) return v; } catch { /* blocked */ }
      try { const v = window.sessionStorage.getItem(k); if (v) return v; } catch { /* blocked */ }
      return null;
    },
    removeItem: (k) => {
      // A sign-out has to clear every copy, or the next load signs them back in.
      try { ls.removeItem(k); } catch { /* noop */ }
      try { window.sessionStorage.removeItem(k); } catch { /* noop */ }
      cookieDel(REFRESH_COOKIE);
    },
    setItem: (k, v) => {
      const rt = refreshTokenOf(v);
      if (rt) cookieSet(REFRESH_COOKIE, rt);
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
  const TOKEN_KEY = AUTH_TOKEN_KEY;
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

// REVIVE A SESSION FROM THE REFRESH-TOKEN COOKIE.
//
// Runs once at boot, before anything asks "is there a session?". If both
// storage copies are gone but the cookie survived, trade that one 12-character
// string for a fresh session so the athlete never sees a login screen.
//
// Deliberately narrow, because the cost of getting this wrong is signing
// someone in who signed out:
//   - it does nothing when a session already exists;
//   - it does nothing when an OAuth payload is in the URL (that exchange owns
//     the session, and racing it is how #102 happened);
//   - a refused refresh CLEARS the cookie, so a revoked or rotated-away token
//     cannot sit there being retried on every load.
let reviving = null;
export function reviveSession() {
  if (typeof window === 'undefined') return Promise.resolve(false);
  if (reviving) return reviving;
  reviving = (async () => {
    try {
      const { data } = await supabase.auth.getSession();
      if (data && data.session) return false;                 // already in
      if (/[?&](code|token_hash)=/.test(window.location.search || '')
        || /(access_token|refresh_token)=/.test(window.location.hash || '')) return false;
      const rt = cookieGet(REFRESH_COOKIE);
      if (!rt) return false;
      const { data: out, error } = await supabase.auth.refreshSession({ refresh_token: rt });
      if (error || !out || !out.session) { cookieDel(REFRESH_COOKIE); return false; }
      return true;
    } catch { return false; }
  })();
  return reviving;
}
