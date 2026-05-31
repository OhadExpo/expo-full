// Google Calendar sync for EXPO tasks — Google Identity Services direct.
//
// Architecture (rewrite 2026-05-28):
//   - Bypasses Supabase Auth entirely for Calendar OAuth. The Supabase
//     route kept stripping provider_token from the session because the
//     EXPO user signed in via email+password, not Google OAuth.
//   - Uses Google Identity Services (GIS) Token Client. User clicks
//     Connect → Google popup → grants calendar.events → token returned
//     in JS callback → cached in localStorage.
//   - Token client uses my own OAuth client ID (registered in Google
//     Cloud Console for project "EXPO Music"). No secret needed for
//     the implicit/PKCE-style token flow.
//   - Frontend calls Calendar API directly with the cached token.
//     When token expires (~1 hour), the next call returns 401 and we
//     re-request a fresh one via the token client (often silently if
//     consent is still valid).
//
// Event IDs are persisted as tags on each coach_notes row:
//   `gevent:<eventId>` and optionally `getag:<etag>`. No schema migration.

import { supabase } from './supabase';

// OAuth client ID for "EXPO Tasks Calendar" — Web application type,
// authorized origins: https://expo-app.co.il + http://localhost:5173.
// Project: expo-music-495221 (EXPO Music). Test users: ohad + yuval.
const GOOGLE_CLIENT_ID = '1022046683456-5etasiot4615n6rme64f3tsrp1qcil5j.apps.googleusercontent.com';
// calendar.events → create/read EXPO task events. EXPO tasks with a due date
// sync to Google Calendar AS events, so they show inside the embedded calendar.
// (The standalone Google-Tasks integration was dropped 2026-05-31 — Google
// strips the Tasks layer from embeds, so it could only ever render in a
// separate panel; Ohad chose to rely on EXPO tasks instead.)
const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const EVENT_TAG_PREFIX = 'gevent:';
const ETAG_TAG_PREFIX = 'getag:';
const LINK_TAG_PREFIX = 'glink:';
const EVENT_TIMEZONE = 'Asia/Jerusalem';

// Token cache.
const TOKEN_CACHE_KEY = 'expo-gcal-access-token';
const TOKEN_EXPIRES_KEY = 'expo-gcal-access-token-expires-at';
const CONNECTED_KEY = 'expo-gcal-connected';

function cacheAccessToken(token, expiresInSeconds) {
  if (!token) return;
  localStorage.setItem(TOKEN_CACHE_KEY, token);
  if (expiresInSeconds) {
    localStorage.setItem(TOKEN_EXPIRES_KEY, String(Math.floor(Date.now() / 1000) + expiresInSeconds));
  }
  localStorage.setItem(CONNECTED_KEY, '1');
}

function getCachedAccessToken() {
  const token = localStorage.getItem(TOKEN_CACHE_KEY);
  const expires = parseInt(localStorage.getItem(TOKEN_EXPIRES_KEY) || '0', 10);
  if (!token) return null;
  if (expires && expires <= Math.floor(Date.now() / 1000) + 60) return null;
  return token;
}

function clearCachedTokens() {
  localStorage.removeItem(TOKEN_CACHE_KEY);
  localStorage.removeItem(TOKEN_EXPIRES_KEY);
  localStorage.removeItem(CONNECTED_KEY);
}

// Wait for the GIS library to load (script tag in index.html). Resolves
// when window.google.accounts.oauth2.initTokenClient is available.
function waitForGIS(timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    (function check() {
      if (window.google?.accounts?.oauth2?.initTokenClient) return resolve();
      if (Date.now() - start > timeoutMs) return reject(new Error('Google Identity Services failed to load'));
      setTimeout(check, 100);
    })();
  });
}

let _tokenClient = null;
async function getTokenClient() {
  if (_tokenClient) return _tokenClient;
  await waitForGIS();
  _tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: CALENDAR_SCOPE,
    callback: () => {}, // overridden per-call via setCallback
    error_callback: () => {}, // overridden per-call
  });
  return _tokenClient;
}

// Connect — prompts user for Calendar consent and resolves with the
// access token. Returns null on user cancel or any error.
export function connectGoogleCalendar() {
  return new Promise((resolve) => {
    (async () => {
      let client;
      try { client = await getTokenClient(); }
      catch { resolve(null); return; }
      client.callback = (response) => {
        if (response.error) {
          console.error('Google OAuth error:', response);
          resolve(null);
          return;
        }
        cacheAccessToken(response.access_token, response.expires_in);
        resolve(response.access_token);
      };
      client.error_callback = (err) => {
        console.error('Google OAuth error_callback:', err);
        resolve(null);
      };
      client.requestAccessToken({ prompt: 'consent' });
    })();
  });
}

// Silent re-auth — try to refresh the access token without UI. Only
// works if user already granted consent. Useful when a 401 hits during
// an API call.
function requestSilentToken() {
  return new Promise((resolve) => {
    (async () => {
      let client;
      try { client = await getTokenClient(); }
      catch { resolve(null); return; }
      client.callback = (response) => {
        if (response.error || !response.access_token) {
          resolve(null);
          return;
        }
        cacheAccessToken(response.access_token, response.expires_in);
        resolve(response.access_token);
      };
      client.error_callback = () => resolve(null);
      // prompt='' triggers silent grant if consent persists.
      client.requestAccessToken({ prompt: '' });
    })();
  });
}

// Has the user successfully granted Calendar access at any point AND
// is the cached token still valid? Definitive check via a test API
// call so a stale/scope-less token correctly reads as disconnected.
const VERIFIED_CACHE_KEY = 'expo-gcal-verified-at';
const VERIFIED_TTL_MS = 5 * 60 * 1000;

export async function isCalendarConnected() {
  if (localStorage.getItem(CONNECTED_KEY) !== '1') return false;
  let token = getCachedAccessToken();
  // The GIS access token only lives ~1h, so after a browser restart or any
  // gap it reads as expired. Rather than forcing a manual "Connect" again,
  // silently refresh using the consent the user already granted (prompt:''
  // shows no UI). Only fall back to disconnected if the silent grant fails
  // (e.g. not signed into Google in this browser, or consent revoked).
  if (!token) {
    token = await requestSilentToken();
    if (!token) return false;
  }
  const verifiedAt = parseInt(localStorage.getItem(VERIFIED_CACHE_KEY) || '0', 10);
  if (verifiedAt && Date.now() - verifiedAt < VERIFIED_TTL_MS) return true;
  try {
    const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=1', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      localStorage.setItem(VERIFIED_CACHE_KEY, String(Date.now()));
      return true;
    }
    // 401/403 → cached token is stale or has lost scope.
    clearCachedTokens();
    localStorage.removeItem(VERIFIED_CACHE_KEY);
    return false;
  } catch {
    return false;
  }
}

export function disconnectCalendar() {
  clearCachedTokens();
  localStorage.removeItem(VERIFIED_CACHE_KEY);
  localStorage.removeItem(SYNC_TOKEN_KEY);
  localStorage.removeItem(LAST_SYNC_KEY);
}

// Diagnostic — what scopes does the cached token carry?
export async function getTokenScopes() {
  const token = getCachedAccessToken();
  if (!token) return null;
  try {
    const res = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(token)}`
    );
    if (!res.ok) return null;
    const data = await res.json();
    return (data.scope || '').split(/\s+/).filter(Boolean);
  } catch {
    return null;
  }
}

// Legacy compatibility — v8's useEffect still calls these. No-op for the
// GIS-based flow; the token cache works without an auth-state subscriber.
export function consumeCalendarCallback() { return false; }
export function subscribeAndCacheProviderToken() { return () => {}; }

// ── Calendar API fetch with auto-refresh on 401 ─────────────────────

async function gcalFetch(path, init = {}, allowRetry = true) {
  let token = getCachedAccessToken();
  if (!token) throw new GoogleCalendarAuthError('No Google access token cached');
  let res = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
    ...init,
    headers: {
      ...(init.headers || {}),
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  if ((res.status === 401 || res.status === 403) && allowRetry) {
    // Try silent re-auth then retry the call once.
    const fresh = await requestSilentToken();
    if (fresh) return gcalFetch(path, init, false);
    throw new GoogleCalendarAuthError(`Google rejected the request (${res.status}) and silent refresh failed`);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Google Calendar API ${res.status}: ${body.slice(0, 200)}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export class GoogleCalendarAuthError extends Error {
  constructor(message) { super(message); this.name = 'GoogleCalendarAuthError'; }
}

// Upcoming events from the user's primary calendar via the API (our OAuth
// token). Unlike the embed iframe, this works on ANY browser/account — the
// iframe needs the viewer's browser signed into Google, the API doesn't.
export async function fetchUpcomingEvents({ maxResults = 30, days = 45 } = {}) {
  const now = new Date();
  const timeMin = now.toISOString();
  const timeMax = new Date(now.getTime() + days * 86400000).toISOString();
  const data = await gcalFetch(
    `/calendars/primary/events?singleEvents=true&orderBy=startTime&maxResults=${maxResults}`
    + `&timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}`
  );
  const items = Array.isArray(data?.items) ? data.items : [];
  return items.map(e => ({
    id: e.id,
    title: (e.summary || '(no title)').trim(),
    start: e.start?.dateTime || e.start?.date || null,
    allDay: !e.start?.dateTime,
    htmlLink: e.htmlLink || null,
  })).filter(e => e.start);
}



// ── Tag-based event-id store ─────────────────────────────────────────

export function getStoredEventId(row) {
  const tags = Array.isArray(row.tags) ? row.tags : [];
  const found = tags.find(t => t.startsWith(EVENT_TAG_PREFIX));
  return found ? found.slice(EVENT_TAG_PREFIX.length) : null;
}

export function getStoredEtag(row) {
  const tags = Array.isArray(row.tags) ? row.tags : [];
  const found = tags.find(t => t.startsWith(ETAG_TAG_PREFIX));
  return found ? found.slice(ETAG_TAG_PREFIX.length) : null;
}

export function getStoredHtmlLink(row) {
  const tags = Array.isArray(row.tags) ? row.tags : [];
  const found = tags.find(t => t.startsWith(LINK_TAG_PREFIX));
  return found ? found.slice(LINK_TAG_PREFIX.length) : null;
}

function withEventTags(tags, eventId, etag, htmlLink) {
  const keep = (tags || []).filter(t =>
    !t.startsWith(EVENT_TAG_PREFIX) &&
    !t.startsWith(ETAG_TAG_PREFIX) &&
    !t.startsWith(LINK_TAG_PREFIX)
  );
  if (eventId)  keep.push(EVENT_TAG_PREFIX + eventId);
  if (etag)     keep.push(ETAG_TAG_PREFIX + etag);
  if (htmlLink) keep.push(LINK_TAG_PREFIX + htmlLink);
  return keep;
}

// ── Payload building ─────────────────────────────────────────────────

function buildEventPayload(row, opts = {}) {
  const status = row.status || 'open';
  const statusPrefix = status === 'done' ? '[DONE] '
                     : status === 'working' ? '[WORKING] '
                     : status === 'stuck' ? '[STUCK] '
                     : '';
  const baseBody = (opts.displayBody || row.body || '').trim();
  const summary = statusPrefix + baseBody;

  // Resolve due date — explicit opt > row.due_at > row.created_at > now.
  // Then apply the hour: opts.dueTime ("HH:MM") > 9am default.
  const dueIso = opts.dueAt || row.due_at || row.created_at || new Date().toISOString();
  const due = new Date(dueIso);
  let h = 9, m = 0;
  if (typeof opts.dueTime === 'string' && /^\d{1,2}:\d{2}$/.test(opts.dueTime)) {
    const [hh, mm] = opts.dueTime.split(':').map(n => parseInt(n, 10));
    if (hh >= 0 && hh < 24 && mm >= 0 && mm < 60) { h = hh; m = mm; }
  }
  due.setHours(h, m, 0, 0);
  const endHour = new Date(due.getTime() + 60 * 60 * 1000);

  // Format as a local-time string with NO trailing Z. When combined with
  // an explicit `timeZone: 'Asia/Jerusalem'`, Google renders the event at
  // exactly that wall-clock time regardless of the browser's locale —
  // which fixes the "random hour" bug where toISOString() shipped a UTC
  // moment that Google re-interpreted against its calendar's timezone.
  const fmt = (d) => {
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const da = String(d.getDate()).padStart(2, '0');
    const ho = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${y}-${mo}-${da}T${ho}:${mi}:00`;
  };

  const description = `From EXPO Tasks\nTask ID: ${row.id}\n\nhttps://expo-app.co.il/coach/tasks`;

  const payload = {
    summary,
    description,
    start: { dateTime: fmt(due),     timeZone: EVENT_TIMEZONE },
    end:   { dateTime: fmt(endHour), timeZone: EVENT_TIMEZONE },
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'popup', minutes: 60 },
        { method: 'email', minutes: 60 * 24 },
      ],
    },
  };
  if (opts.attendeeEmail) {
    payload.attendees = [{ email: opts.attendeeEmail }];
  }
  return payload;
}

// ── CRUD on Google ───────────────────────────────────────────────────

export async function pushNewTask(row, opts = {}) {
  const payload = buildEventPayload(row, opts);
  const created = await gcalFetch('/calendars/primary/events?sendUpdates=all', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return { id: created.id, etag: created.etag, htmlLink: created.htmlLink };
}

export async function patchTask(row, eventId, opts = {}) {
  if (!eventId) return null;
  const payload = buildEventPayload(row, opts);
  const patched = await gcalFetch(`/calendars/primary/events/${encodeURIComponent(eventId)}?sendUpdates=all`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  return { id: patched.id, etag: patched.etag, htmlLink: patched.htmlLink };
}

export async function deleteTask(eventId) {
  if (!eventId) return null;
  await gcalFetch(`/calendars/primary/events/${encodeURIComponent(eventId)}?sendUpdates=all`, {
    method: 'DELETE',
  });
  return true;
}

// ── High-level orchestration ─────────────────────────────────────────

export async function reconcileRow(row, opts = {}) {
  if (!await isCalendarConnected()) return null;
  const existingId = getStoredEventId(row);
  const existingLink = getStoredHtmlLink(row);
  if (row.status === 'done' && existingId) {
    const result = await patchTask(row, existingId, opts);
    return { tags: withEventTags(row.tags, result.id, result.etag, result.htmlLink || existingLink) };
  }
  if (!existingId && row.status !== 'done') {
    const result = await pushNewTask(row, opts);
    return { tags: withEventTags(row.tags, result.id, result.etag, result.htmlLink), htmlLink: result.htmlLink };
  }
  if (existingId && row.status !== 'done') {
    const result = await patchTask(row, existingId, opts);
    return { tags: withEventTags(row.tags, result.id, result.etag, result.htmlLink || existingLink) };
  }
  return null;
}

export async function unlinkAndDeleteEvent(row) {
  if (!await isCalendarConnected()) return null;
  const eventId = getStoredEventId(row);
  if (!eventId) return null;
  await deleteTask(eventId);
  return { tags: withEventTags(row.tags, null, null, null) };
}

// ── Pull side — Google → EXPO via syncToken polling ─────────────────

const SYNC_TOKEN_KEY = 'expo-gcal-sync-token';
const LAST_SYNC_KEY  = 'expo-gcal-last-synced-at';

export function getLastSyncedAt() {
  const ts = localStorage.getItem(LAST_SYNC_KEY);
  return ts ? new Date(parseInt(ts, 10)) : null;
}

function setLastSyncedAt() {
  localStorage.setItem(LAST_SYNC_KEY, String(Date.now()));
}

export function clearSyncToken() {
  localStorage.removeItem(SYNC_TOKEN_KEY);
  localStorage.removeItem(LAST_SYNC_KEY);
}

export async function pullChangesSinceLastSync() {
  if (!await isCalendarConnected()) return [];
  const syncToken = localStorage.getItem(SYNC_TOKEN_KEY);
  let path = '/calendars/primary/events?singleEvents=true&maxResults=250';
  if (syncToken) {
    path += '&syncToken=' + encodeURIComponent(syncToken);
  } else {
    const since = new Date(Date.now() - 30 * 86400000).toISOString();
    path += '&updatedMin=' + encodeURIComponent(since) + '&showDeleted=true';
  }
  let collected = [];
  let pageToken = null;
  let lastNextSyncToken = null;
  for (let i = 0; i < 10; i++) {
    const url = path + (pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : '');
    let data;
    try {
      data = await gcalFetch(url);
    } catch (err) {
      if (err.message?.includes('410') || err.message?.includes('Gone')) {
        clearSyncToken();
        return [];
      }
      throw err;
    }
    if (Array.isArray(data.items)) collected = collected.concat(data.items);
    if (data.nextSyncToken) lastNextSyncToken = data.nextSyncToken;
    if (data.nextPageToken) { pageToken = data.nextPageToken; continue; }
    break;
  }
  if (lastNextSyncToken) localStorage.setItem(SYNC_TOKEN_KEY, lastNextSyncToken);
  setLastSyncedAt();
  return collected;
}

const STATUS_PREFIX_RE = /^\[(DONE|WORKING|STUCK)\]\s+/i;
export function stripStatusPrefix(summary) {
  return (summary || '').replace(STATUS_PREFIX_RE, '');
}
export function statusFromSummary(summary) {
  const m = (summary || '').match(STATUS_PREFIX_RE);
  if (!m) return null;
  return m[1].toLowerCase();
}

// Make supabase import explicitly retained even if unused, so the
// dependency graph doesn't drop it during tree-shaking.
export const _sb_keepalive = () => supabase;
