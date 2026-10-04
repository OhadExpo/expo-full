// src/supabase.js — Supabase client for EXPO. Also the canonical export
// point for SUPA_URL + SUPA_PUBLISHABLE_KEY so other modules (CoachChat,
// CoachLanding, ClientPortal) don't have to redeclare them inline.
import { createClient } from '@supabase/supabase-js';
import { PARTNER_EMAILS } from './authRoles';
import { setProbeUrl, noteSuccess, noteFailure } from './connectivity';

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
  'expo-jump-metrics',     // the jump trend (#530): same rules as the vault
  'expo-offline-queue',    // WRITES THAT HAVE NOT REACHED THE SERVER YET. Evicting this
                           // does not lose a cache, it loses what someone typed offline.
  'expo-lead-notes',       // notes he typed on a lead
]);
// ...and the logger's in-progress drafts (5.10 #560): `expo-stepLogger-<athlete>-
// <plan>-<day>-...` is the only copy of the sets an athlete is logging RIGHT
// NOW, mid-workout, on a phone whose session just needed room. Keyed per
// session so it cannot be listed above; matched by prefix instead.
const NEVER_EVICT_PREFIXES = ['expo-stepLogger-'];
const evictSnapshots = () => {
  let freed = 0;
  try {
    const keys = Object.keys(window.localStorage);
    // Biggest first: one large snapshot usually frees more than a dozen small
    // ones, and the fewer we drop the less the user has to refetch.
    const sized = keys
      .filter((k) => SNAPSHOT_PREFIXES.some((p) => k.startsWith(p)) && !/auth-token/.test(k) && !NEVER_EVICT.has(k) && !NEVER_EVICT_PREFIXES.some((p) => k.startsWith(p)))
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

// WHICH SEAT IS THE SANDBOX (#476) - read where supabase-js writes the session
// anyway, synchronously. NOT an onAuthStateChange listener: every listener takes
// supabase-js's navigator lock once, and one more lock user on every seat is how
// "Lock broken by another request with the 'steal' option" happens
// (the 18.9 lock trap) - the owner's and the athletes'
// seats must run exactly as they did before the sandbox existed.
let sandboxSeat = false;
function setSandboxFor(email) {
  sandboxSeat = !!email && PARTNER_EMAILS.includes(String(email).toLowerCase());
  try { if (typeof window !== 'undefined') window.__expoSandbox = sandboxSeat; } catch { /* noop */ }
}
// ASKED ON EVERY QUERY, FROM THE SHARED STORE (1.10 audit S1). Another tab can
// sign someone else in: auth-js tells this tab over a BroadcastChannel and never
// writes storage here, so a flag set only in setItem went stale - the owner's
// UI in an old partner tab still hit the sandbox. localStorage is shared by
// every tab, so the stored session IS the current seat. Cached on the raw
// string, so it costs one read and no parse per query - and still no lock user.
//
// A DIFFERENT PERSON UNDER THIS TAB = THIS TAB STOPS (1.10 triple audit, HIGH).
// Following the store alone was not enough: the tab's React state still holds
// the PREVIOUS seat's data (useSupaStore loads a key once, saves the whole
// value), so after a sign-in in another tab an edit here wrote that stale data
// into the NEW seat's tables - the partner's sandbox copy over the owner's real
// roster, or the owner's real data into the partner's sandbox. The first email
// this tab sees is its seat; when the stored session belongs to someone else,
// every query from this tab fails closed (an object that does not exist - no
// write can land anywhere) and the tab reloads once, clean, as the new seat.
// A sign-out, a token refresh, or the first sign-in on the login page is not a
// change of seat.
let lastSeatRaw;
let tabSeat = null;          // the email this tab's state belongs to
let seatChanged = false;     // set once; the reload follows
function sandboxNow() {
  let raw = null;
  try { raw = authStorage ? authStorage.getItem(AUTH_TOKEN_KEY) : null; } catch { /* storage blocked */ }
  if (raw !== lastSeatRaw) {
    lastSeatRaw = raw;
    let email = null;
    try { email = raw ? JSON.parse(raw)?.user?.email : null; } catch { /* not a session */ }
    const e = email ? String(email).toLowerCase() : null;
    if (e && !tabSeat) tabSeat = e;
    else if (e && tabSeat && e !== tabSeat && !seatChanged) {
      seatChanged = true;
      try { if (typeof window !== 'undefined') setTimeout(() => window.location.reload(), 0); } catch { /* noop */ }
    }
    setSandboxFor(email);
  }
  return sandboxSeat;
}
const SEAT_CHANGED = '__seat_changed_reloading__';
export const isSandboxSeat = () => sandboxNow();
// ...and AT ONCE, not at this tab's next query (1.10 audit C): an in-app click
// that needed no new data made no query, so the old tab kept showing the
// previous seat until something fetched. The browser fires 'storage' in every
// OTHER tab when one of them writes the session - no lock, no listener on auth.
try {
  if (typeof window !== 'undefined') window.addEventListener('storage', (ev) => { if (ev.key === AUTH_TOKEN_KEY || ev.key === null) sandboxNow(); });
} catch { /* noop */ }

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
      if (k === AUTH_TOKEN_KEY) setSandboxFor(null);
      // A sign-out has to clear every copy, or the next load signs them back in.
      try { ls.removeItem(k); } catch { /* noop */ }
      try { window.sessionStorage.removeItem(k); } catch { /* noop */ }
      cookieDel(REFRESH_COOKIE);
    },
    setItem: (k, v) => {
      if (k === AUTH_TOKEN_KEY) { try { setSandboxFor(JSON.parse(v)?.user?.email); } catch { /* not a session */ } }
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

// NO REQUEST HANGS FOREVER (5.10 #560). On a gym's dead wifi a request neither
// fails nor answers: the socket sits open, supabase-js waits on it, and whatever
// awaited that call - the identity read at boot, a queue handler, the auth
// refresh - waits with it. Every request the client makes now carries a budget:
// a read may take 20 s (a big plan list on 3G), a write 10 s, and a storage
// upload 60 s (a 40 MB clip on a weak signal must not be cut off while it is
// still making progress - the uploader's own stall watchdog guards that path).
// An abort reads as 'aborted' / 'AbortError', which the queue already treats as
// transient, so a cut-off write stays queued and is retried.
//
// The same wrapper is where the client REPORTS: an answer of any kind means the
// server is reachable (connectivity goes 'online' with no probe spent); a
// network failure asks the probe at once, so the app knows it is offline
// within seconds instead of at the next 30 s tick.
const FETCH_TIMEOUT_READ_MS = 20000;
const FETCH_TIMEOUT_WRITE_MS = 10000;
const FETCH_TIMEOUT_UPLOAD_MS = 60000;
// A BUDGET THAT GROWS WITH THE BODY (5.10 review B1/S2): a flat 60 s cut every
// 34 MB clip on weak gym LTE (it needs ~4.5 Mbps to finish in 60 s) and the
// queue retried it forever, each try cut at 60 s again; a flat 10 s did the same
// to a 1-2 MB store write on a 3G uplink. Now the budget is the flat floor OR
// the time the body needs at 25 KB/s (~200 kbps, a poor uplink), whichever is
// longer - a slow upload that is moving finishes, a dead socket still ends.
const UPLINK_FLOOR_BPS = 25 * 1024;
const bodyBytes = (b) => {
  if (!b) return 0;
  if (typeof b === 'string') return b.length;
  if (typeof b.size === 'number') return b.size;          // Blob / File
  if (typeof b.byteLength === 'number') return b.byteLength;  // ArrayBuffer / typed array
  return 0;
};
const fetchBudgetFor = (url, init) => {
  const method = String((init && init.method) || 'GET').toUpperCase();
  const need = Math.ceil((bodyBytes(init && init.body) / UPLINK_FLOOR_BPS) * 1000);
  if (/\/storage\/v1\/(object|upload)\//.test(url) && method !== 'GET' && method !== 'HEAD') return Math.max(FETCH_TIMEOUT_UPLOAD_MS, need);
  if (/\/rest\/v1\//.test(url) && (method === 'GET' || method === 'HEAD')) return FETCH_TIMEOUT_READ_MS;
  return Math.max(FETCH_TIMEOUT_WRITE_MS, need);
};
const timedFetch = (input, init) => {
  const url = typeof input === 'string' ? input : (input && input.url) || '';
  const opts = init || {};
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  if (!ctl) return fetch(input, opts);
  const outer = opts.signal;
  // a caller's own signal (withTimeout in useSupaStore) still aborts this one
  if (outer) {
    if (outer.aborted) ctl.abort();
    else { try { outer.addEventListener('abort', () => ctl.abort(), { once: true }); } catch { /* not a signal */ } }
  }
  const t = setTimeout(() => ctl.abort(), fetchBudgetFor(url, opts));
  return fetch(input, { ...opts, signal: ctl.signal }).then(
    (r) => { clearTimeout(t); noteSuccess(); return r; },
    (e) => { clearTimeout(t); noteFailure(); throw e; },   // a caller's own timeout is a failure too
  );
};
// The probe sends the public key as a HEADER, never in the URL (the S25 gate:
// no token in a URL, ever). Keyless, the gateway answered 401 - reachable, but a
// red "Failed to load resource" in the console every 30 s, which the
// console-clean sweeps read as an error (5.10 review N3). Keyed it answers 200;
// the CORS preflight the header costs is cached for an hour (max-age 3600).
setProbeUrl(`${SUPA_URL}/auth/v1/health`, { apikey: SUPABASE_ANON_KEY });

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: authStorage,
  },
  global: { fetch: typeof fetch === 'function' ? timedFetch : undefined },
});

// THE SESSION THIS DEVICE HOLDS, READ WITHOUT ASKING THE SERVER (5.10 #560).
// supabase-js refuses to hand out an expired session until it has refreshed it,
// and offline that refresh cannot happen - so a phone that slept through the
// token's hour booted into the login screen with a perfectly good refresh token
// in storage. auth.jsx uses this to keep the last known person signed in while
// the server cannot be reached; the real refresh lands the moment it can.
// FORGET THIS DEVICE'S SESSION, WITH OR WITHOUT A NETWORK (5.10 review S3).
// supabase-js signOut({scope:'local'}) returns early - token still stored - when
// it cannot reach the server; with the offline boot, the next start on dead
// wifi signed the person who had just signed out straight back in (a shared
// gym phone). The token, its sessionStorage copy and the refresh cookie go here.
export function forgetStoredSession() {
  try { if (authStorage) authStorage.removeItem(AUTH_TOKEN_KEY); } catch { /* storage blocked */ }
  try { localStorage.removeItem(AUTH_TOKEN_KEY); } catch { /* noop */ }
  try { sessionStorage.removeItem(AUTH_TOKEN_KEY); } catch { /* noop */ }
  cookieDel(REFRESH_COOKIE);
}

export function readStoredSession() {
  try {
    const raw = authStorage ? authStorage.getItem(AUTH_TOKEN_KEY) : null;
    const j = raw ? JSON.parse(raw) : null;
    return j && j.refresh_token && j.user && j.user.id ? j : null;
  } catch { return null; }
}

// THE PARTNER SEAT IS A SANDBOX (#476, 30.9). Ohad: "fake money but everything
// ... the ability to actually touch or change it (sandbox) - his own version".
// Every table has an sbx_ copy (money faked) that only the partner and the
// owner can read or write; the partner has NO access to the real tables at
// all. So this is the one place that decides which copy a query hits: signed
// in as the partner, every table below is his sbx_ copy. A path that slipped
// past it would fail closed (read nothing, write nothing) - never touch the
// real data. scripts/verify-partner-sandbox.mjs proves the database side.
const SBX_TABLES = new Set([
  'athlete_app_opens', 'athlete_meals', 'availability_rules', 'bit_payment_requests', 'bookings',
  'bug_reports', 'challenge_participants', 'challenges', 'chat_logs', 'client_workouts',
  'coach_booking_settings', 'coach_messages', 'coach_note_comments', 'coach_note_events', 'coach_notes',
  'coach_payment_settings', 'coach_tasks', 'coaching_contracts', 'intake_submissions', 'intake_tokens',
  'invoices', 'leads', 'plans', 'program_shares', 'revenue_cell_history', 'revenue_month_total',
  'revenue_owed', 'revenue_sheet_event', 'store', 'subscriptions', 'trainee_activity',
  'trainee_evaluations', 'trainee_next_actions', 'weekly_focus', 'bw_logs', 'plan_index',
]);
// every RPC that reads or writes a sandboxed table has an sbx_ twin (security
// invoker - the sbx_ tables' own rule is the gate). The link pages (program
// share, intake, contract, booking) open HIS records in his seat (1.10 audit C4).
const SBX_RPC = Object.fromEntries(['purge_trainee_data', 'get_shared_program', 'verify_intake_token', 'submit_intake_form',
  'get_contract_by_token', 'sign_contract', 'cancel_booking', 'get_occupied_slots', 'mark_intake_token_used'].map((f) => [f, 'sbx_' + f]));
// decided BEFORE the first query, from the stored session; the auth storage
// below keeps it current on every sign-in, refresh and sign-out
try { const raw = authStorage && authStorage.getItem(AUTH_TOKEN_KEY); if (raw) setSandboxFor(JSON.parse(raw)?.user?.email); } catch { /* signed out */ }
{
  const realFrom = supabase.from.bind(supabase);
  supabase.from = (table) => { const sbx = sandboxNow(); return realFrom(seatChanged ? SEAT_CHANGED : sbx && SBX_TABLES.has(table) ? 'sbx_' + table : table); };
  const realRpc = supabase.rpc.bind(supabase);
  supabase.rpc = (fn, args, opts) => { const sbx = sandboxNow(); return realRpc(seatChanged ? SEAT_CHANGED : sbx && SBX_RPC[fn] ? SBX_RPC[fn] : fn, args, opts); };
  // the PUBLIC live channels (every seat hears them): in the sandbox they get
  // their own name, so his autosave never tells the owner's open editor or a
  // club coach "someone changed this" (1.10 audit C8) - and his own tabs and
  // program preview still hear each other
  const SBX_CHANNELS = new Set(['plans-live', 'bhbc-live', 'portal-sync', 'gym-session']);
  // gym mode's per-athlete set channel too (4.10 #542): on the real 'gym-set:<id>'
  // only the database rule stood between his seat and a real athlete's phone;
  // on 'sbx:' his own coach screens still hear each other (realtime policy
  // "expo: partner sbx live read/write")
  const sbxChannel = (name) => SBX_CHANNELS.has(name) || /^gym-set:/.test(name);
  const realChannel = supabase.channel.bind(supabase);
  supabase.channel = (name, opts) => {
    const sbx = sandboxNow();
    const ch = realChannel(sbx && sbxChannel(name) ? 'sbx:' + name : name, opts);
    if (!sbx) return ch;
    // live table changes follow the queries: his seat listens to HIS copy
    // (the sbx_ tables are in the realtime publication; RLS limits who hears)
    const realOn = ch.on.bind(ch);
    ch.on = (type, filter, cb) => realOn(type, type === 'postgres_changes' && filter && SBX_TABLES.has(filter.table)
      ? { ...filter, table: 'sbx_' + filter.table } : filter, cb);
    return ch;
  };
}

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
      // a refresh that never reached the server (offline, timed out: status 0)
      // has not refused anything - the cookie stays for the next visit (5.10 #560)
      if (error && (error.status === 0 || /fetch|network|abort/i.test(String(error.message || '')))) return false;
      if (error || !out || !out.session) { cookieDel(REFRESH_COOKIE); return false; }
      return true;
    } catch { return false; }
  })();
  return reviving;
}
