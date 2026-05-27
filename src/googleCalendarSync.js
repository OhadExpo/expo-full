// Google Calendar sync for EXPO tasks — frontend-only, browser-direct.
//
// Strategy (no infra changes, no Vercel env vars, no schema migration):
//   - Uses Supabase Auth's existing Google OAuth provider. The user
//     clicks "Connect Google Calendar" which re-authenticates them
//     with `calendar.events` scope appended.
//   - Returned session has `provider_token` (Google access token,
//     ~1 hour TTL). Frontend calls google's Calendar API directly
//     with this token. No server-side refresh needed for the
//     prototype.
//   - Event IDs are persisted as tags on each coach_notes row, e.g.
//     `gevent:abc123`. No new columns required. Look up via
//     `getStoredEventId(row)`.
//   - When the token expires, the next sync call returns 401; we
//     surface "Reconnect Google Calendar" in the UI. User clicks
//     once and is back in business.
//
// Phase 5b (true bi-directional Google → EXPO sync via events.watch +
// Vercel Cron + webhook) requires a schema migration + Vercel env
// vars + server-side refresh tokens. That's separate work — this
// module ships add/edit/delete from EXPO → Calendar today.

import { supabase } from './supabase';

const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const EVENT_TAG_PREFIX = 'gevent:';
const ETAG_TAG_PREFIX = 'getag:';

// ── Identity / connection ────────────────────────────────────────────

// Has the user genuinely granted Calendar access? Two-gate check:
//   1. localStorage flag set after the OAuth callback (cheap)
//   2. An actual test call to Google Calendar API (definitive)
// The localStorage flag alone lies if the user abandoned the consent
// flow before granting calendar.events scope. We cache the verified
// state for 5 min so we don't ping Google on every isCalendarConnected
// invocation.
const VERIFIED_CACHE_KEY = 'expo-gcal-verified-at';
const VERIFIED_TTL_MS = 5 * 60 * 1000;

export async function isCalendarConnected() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return false;
  if (!session.provider_token) return false;
  if (localStorage.getItem('expo-gcal-connected') !== '1') return false;
  // Verified-recently cache to avoid hammering Google.
  const verifiedAt = parseInt(localStorage.getItem(VERIFIED_CACHE_KEY) || '0', 10);
  if (verifiedAt && Date.now() - verifiedAt < VERIFIED_TTL_MS) return true;
  // Definitive test: a 1-result events.list call. Fails fast on
  // missing scope (401/403) or expired token.
  try {
    const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=1', {
      headers: { Authorization: `Bearer ${session.provider_token}` },
    });
    if (res.ok) {
      localStorage.setItem(VERIFIED_CACHE_KEY, String(Date.now()));
      return true;
    }
    // Token is missing scope or expired — clear the flag so the UI
    // surfaces the disconnected state and prompts reconnect.
    localStorage.removeItem('expo-gcal-connected');
    localStorage.removeItem(VERIFIED_CACHE_KEY);
    return false;
  } catch {
    // Network error — keep the flag for now, just return false.
    return false;
  }
}

// Kick off OAuth re-auth with calendar.events scope appended. This
// redirects the user away from the page — they come back with the
// session updated. Pass `redirectTo` so we land back on the same
// surface with a `?gcal=connected` query param.
export async function connectGoogleCalendar() {
  const back = window.location.origin + window.location.pathname + (window.location.search || '') + (window.location.search.includes('?') ? '&' : '?') + 'gcal=connected';
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      scopes: CALENDAR_SCOPE,
      queryParams: { access_type: 'offline', prompt: 'consent' },
      redirectTo: back,
    },
  });
  if (error) {
    console.error('Calendar OAuth init failed:', error);
    return false;
  }
  return true;
}

// Called on page mount when ?gcal=connected is in the URL. Persists the
// "user opted in" flag + clears the query param.
export function consumeCalendarCallback() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('gcal') === 'connected') {
    localStorage.setItem('expo-gcal-connected', '1');
    params.delete('gcal');
    const qs = params.toString();
    const newUrl = window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash;
    window.history.replaceState({}, '', newUrl);
    return true;
  }
  return false;
}

// Clear the opted-in flag + verification cache — for "Disconnect" UI.
export function disconnectCalendar() {
  localStorage.removeItem('expo-gcal-connected');
  localStorage.removeItem(VERIFIED_CACHE_KEY);
}

// ── Token plumbing ───────────────────────────────────────────────────

async function getAccessToken() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.provider_token || null;
}

// Wrapper around fetch that injects the Calendar API auth header and
// throws a friendly error on 401 (so UI can prompt for reconnect).
async function gcalFetch(path, init = {}) {
  const token = await getAccessToken();
  if (!token) throw new GoogleCalendarAuthError('No Google access token in session');
  const res = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
    ...init,
    headers: {
      ...(init.headers || {}),
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  if (res.status === 401 || res.status === 403) {
    throw new GoogleCalendarAuthError(`Google rejected the request (${res.status})`);
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

function withEventTags(tags, eventId, etag) {
  const keep = (tags || []).filter(t => !t.startsWith(EVENT_TAG_PREFIX) && !t.startsWith(ETAG_TAG_PREFIX));
  if (eventId) keep.push(EVENT_TAG_PREFIX + eventId);
  if (etag)    keep.push(ETAG_TAG_PREFIX + etag);
  return keep;
}

// ── Payload building ─────────────────────────────────────────────────

function buildEventPayload(row, opts = {}) {
  // Title prefixed with bracketed status so it shows in Calendar even
  // before EXPO is opened. Default to 9:00–10:00 on the due date; if
  // no real due_at exists yet (Phase 1 work) use the row's created_at
  // as a proxy.
  const status = row.status || 'open';
  const statusPrefix = status === 'done' ? '[DONE] '
                     : status === 'working' ? '[WORKING] '
                     : status === 'stuck' ? '[STUCK] '
                     : '';
  const baseBody = (opts.displayBody || row.body || '').trim();
  const summary = statusPrefix + baseBody;

  const dueIso = opts.dueAt || row.due_at || row.created_at || new Date().toISOString();
  const due = new Date(dueIso);
  // Anchor to 9 AM local time on the due date so it's not midnight noise.
  due.setHours(9, 0, 0, 0);
  const endHour = new Date(due.getTime() + 60 * 60 * 1000); // +1h

  const description = `From EXPO Tasks\nTask ID: ${row.id}\n\nhttps://expo-app.co.il/coach/tasks?ui=v8`;

  const payload = {
    summary,
    description,
    start: { dateTime: due.toISOString() },
    end:   { dateTime: endHour.toISOString() },
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'popup', minutes: 60 },
        { method: 'email', minutes: 60 * 24 },
      ],
    },
  };
  // If a partner email is supplied, add as attendee so they get a
  // Calendar invite. Partner = the OTHER trainer for Ohad+Yuval tasks.
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
  return { id: patched.id, etag: patched.etag };
}

export async function deleteTask(eventId) {
  if (!eventId) return null;
  await gcalFetch(`/calendars/primary/events/${encodeURIComponent(eventId)}?sendUpdates=all`, {
    method: 'DELETE',
  });
  return true;
}

// ── High-level orchestration ─────────────────────────────────────────

// One-shot "make Calendar match this row". Decides between insert /
// patch / delete based on row.status + existing stored eventId.
//
// Returns { tags: updatedTagsArray, htmlLink? } so the caller can
// persist the new tag set on coach_notes. Or null on no-op.
export async function reconcileRow(row, opts = {}) {
  if (!await isCalendarConnected()) return null;
  const existingId = getStoredEventId(row);
  // If task is done AND was synced: patch the title to mark [DONE] so the
  // event stays in the calendar history but signals completion.
  if (row.status === 'done' && existingId) {
    const result = await patchTask(row, existingId, opts);
    return { tags: withEventTags(row.tags, result.id, result.etag) };
  }
  // Active task with no event yet: create one.
  if (!existingId && row.status !== 'done') {
    const result = await pushNewTask(row, opts);
    return { tags: withEventTags(row.tags, result.id, result.etag), htmlLink: result.htmlLink };
  }
  // Active task already synced: patch with latest title / time.
  if (existingId && row.status !== 'done') {
    const result = await patchTask(row, existingId, opts);
    return { tags: withEventTags(row.tags, result.id, result.etag) };
  }
  // Done task that never synced: nothing to do.
  return null;
}

// Hard-delete the Calendar event AND clear the tag from the row.
export async function unlinkAndDeleteEvent(row) {
  if (!await isCalendarConnected()) return null;
  const eventId = getStoredEventId(row);
  if (!eventId) return null;
  await deleteTask(eventId);
  return { tags: withEventTags(row.tags, null, null) };
}

// ── Pull side — Google → EXPO via syncToken polling ─────────────────
//
// Phase 5b's "true bidirectional" sync, frontend-only, no server-side
// state or refresh tokens. Trade-offs:
//   - Only syncs WHILE the user has /coach/tasks?ui=v8 open and is
//     authenticated. Offline = no sync. Acceptable for 2-person team.
//   - Uses events.list with `syncToken` — incremental, only new/changed
//     items each call. Quota: ~120 calls/hour at 30s polling = ~5K/day
//     per user, well under Google's 1M/day project quota.
//   - First call uses `updatedMin = now - 30d` (scopes the cold start).
//   - 410 GONE on the syncToken means it expired (>30 days unused)
//     and we re-bootstrap.

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

  // Walk pages until we exhaust the change set (Google chunks via
  // nextPageToken on syncToken responses too).
  for (let i = 0; i < 10; i++) {
    const url = path + (pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : '');
    let data;
    try {
      data = await gcalFetch(url);
    } catch (err) {
      // 410 → syncToken expired or invalidated. Drop it; next call
      // re-bootstraps from updatedMin.
      if (err.message?.includes('410') || err.message?.includes('Gone')) {
        clearSyncToken();
        return [];
      }
      throw err;
    }
    if (Array.isArray(data.items)) collected = collected.concat(data.items);
    if (data.nextSyncToken) lastNextSyncToken = data.nextSyncToken;
    if (data.nextPageToken) {
      pageToken = data.nextPageToken;
      continue;
    }
    break;
  }
  if (lastNextSyncToken) localStorage.setItem(SYNC_TOKEN_KEY, lastNextSyncToken);
  setLastSyncedAt();
  return collected;
}

// Strip the [WORKING] / [STUCK] / [DONE] prefix from a Calendar event's
// summary to recover the original task body. Used when applying a Google
// edit back to EXPO.
const STATUS_PREFIX_RE = /^\[(DONE|WORKING|STUCK)\]\s+/i;
export function stripStatusPrefix(summary) {
  return (summary || '').replace(STATUS_PREFIX_RE, '');
}
export function statusFromSummary(summary) {
  const m = (summary || '').match(STATUS_PREFIX_RE);
  if (!m) return null;
  return m[1].toLowerCase();
}
