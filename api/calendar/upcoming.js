// Upcoming EXPO sessions, sourced from Ohad's Google Calendar via its
// public iCal URL. Set EXPO_GCAL_ICS_URL on Vercel to the calendar's
// "Secret address in iCal format" (Calendar settings → Integrate calendar
// → Secret address in iCal format) and the dashboard panel goes live.
//
// We DO NOT use OAuth here — the secret URL is the simplest workable
// auth model for a single-tenant product. Treat the URL like a token: if
// it leaks, regenerate it via the calendar settings.
//
// We hard-cap the response to EXPO sessions only (matched by summary
// pattern OR Ohad's appointment-slot description string) so the dashboard
// stays focused on training appointments and ignores the dozens of other
// events on his primary calendar (real estate, medical, family, etc.).

const ICS_FETCH_TIMEOUT_MS = 8000;

function unescapeIcs(s) {
  return String(s || '')
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

// Returns { iso, allDay, tz } or null. iso is a wall-clock string when the
// event is in floating-local time (most Google Calendar entries) and a
// proper UTC ISO when the source was UTC. Caller decides how to render —
// for Ohad's primary calendar TZID is always Asia/Jerusalem, so a naive
// new Date(iso) on the browser displays correctly when the device is also
// in Israel.
function parseIcsDate(value, params) {
  const v = String(value || '').trim();
  const dateOnly = /^\d{8}$/.test(v);
  if (dateOnly) {
    return { iso: `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`, allDay: true, tz: null };
  }
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(v);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  if (z) return { iso: `${y}-${mo}-${d}T${h}:${mi}:${s}.000Z`, allDay: false, tz: 'UTC' };
  return { iso: `${y}-${mo}-${d}T${h}:${mi}:${s}`, allDay: false, tz: (params && params.TZID) || null };
}

// Parse a single VCALENDAR text into VEVENT objects. Handles:
//   - line unfolding (continuation lines start with space/tab)
//   - parameters before the colon (KEY;PARAM=val:VALUE)
//   - common escape sequences in text values
//   - DTSTART/DTEND in date-only / floating / UTC forms
//   - ATTENDEE lines like ATTENDEE;CN=Name:mailto:foo@bar
// Skips RRULE — single-instance events only. Good enough for the
// Appointment Schedule events Ohad's gym sessions actually use.
function parseIcs(text) {
  const unfolded = String(text || '')
    .replace(/\r\n[ \t]/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\n[ \t]/g, '');
  const lines = unfolded.split('\n');
  const events = [];
  let cur = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line === 'BEGIN:VEVENT') { cur = { attendees: [] }; continue; }
    if (line === 'END:VEVENT') { if (cur) events.push(cur); cur = null; continue; }
    if (!cur) continue;

    // Find the first colon outside of double-quoted parameter values.
    let colonAt = -1;
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') inQuote = !inQuote;
      else if (c === ':' && !inQuote) { colonAt = i; break; }
    }
    if (colonAt < 0) continue;

    const head = line.slice(0, colonAt);
    const value = line.slice(colonAt + 1);
    const semis = head.split(';');
    const key = semis[0].toUpperCase();
    const params = {};
    for (let i = 1; i < semis.length; i++) {
      const eq = semis[i].indexOf('=');
      if (eq > 0) params[semis[i].slice(0, eq).toUpperCase()] = semis[i].slice(eq + 1);
    }

    if (key === 'SUMMARY') cur.summary = unescapeIcs(value);
    else if (key === 'DESCRIPTION') cur.description = unescapeIcs(value);
    else if (key === 'LOCATION') cur.location = unescapeIcs(value);
    else if (key === 'DTSTART') cur.start = parseIcsDate(value, params);
    else if (key === 'DTEND') cur.end = parseIcsDate(value, params);
    else if (key === 'STATUS') cur.status = value;
    else if (key === 'UID') cur.uid = value;
    else if (key === 'ATTENDEE') {
      const m = /mailto:([^>\s,]+)/i.exec(value);
      if (m) cur.attendees.push({ email: m[1].toLowerCase(), name: params.CN || null });
    }
    else if (key === 'ORGANIZER') {
      const m = /mailto:([^>\s,]+)/i.exec(value);
      if (m) cur.organizerEmail = m[1].toLowerCase();
    }
  }
  return events;
}

// EXPO session detection. The summary always starts with "EXPO חדר כושר"
// when booked through Ohad's Appointment Schedule; the description carries
// his slot label "שעת אימון - אישי/זוגי". Either signal is sufficient.
const EXPO_TITLE_RE = /EXPO\s+חדר\s+כושר/i;
const EXPO_SLOT_RE = /שעת\s+אימון/i;

function isExpoSession(ev) {
  if (!ev || ev.status === 'CANCELLED') return false;
  if (EXPO_TITLE_RE.test(ev.summary || '')) return true;
  if (EXPO_SLOT_RE.test(ev.description || '')) return true;
  return false;
}

async function fetchWithTimeout(url, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { signal: ctrl.signal, cache: 'no-store' }); }
  finally { clearTimeout(t); }
}

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  const url = process.env.EXPO_GCAL_ICS_URL;
  if (!url) {
    res.status(200).json({ events: [], configured: false, error: 'EXPO_GCAL_ICS_URL not set' });
    return;
  }

  try {
    const r = await fetchWithTimeout(url, ICS_FETCH_TIMEOUT_MS);
    if (!r.ok) {
      res.status(502).json({ events: [], configured: true, error: `ICS fetch failed: ${r.status}` });
      return;
    }
    const text = await r.text();

    // Window: from one hour ago through 21 days ahead. The "one hour ago"
    // floor lets the dashboard still show today's earlier-but-not-yet-done
    // appointment without dropping it the moment the start time passes.
    const nowMs = Date.now();
    const winStartMs = nowMs - 60 * 60 * 1000;
    const winEndMs = nowMs + 21 * 24 * 60 * 60 * 1000;

    const all = parseIcs(text)
      .filter(isExpoSession)
      .filter(ev => ev.start && ev.start.iso)
      .filter(ev => {
        const startMs = new Date(ev.start.iso).getTime();
        return Number.isFinite(startMs) && startMs >= winStartMs && startMs <= winEndMs;
      })
      .map(ev => ({
        uid: ev.uid || null,
        summary: ev.summary || '',
        description: ev.description || '',
        location: ev.location || '',
        start: ev.start,
        end: ev.end || null,
        attendeeEmails: (ev.attendees || []).map(a => a.email).filter(e => !!e && e !== 'ohadyproductions@gmail.com'),
      }))
      .sort((a, b) => (a.start.iso || '').localeCompare(b.start.iso || ''));

    res.status(200).json({ events: all, configured: true, count: all.length });
  } catch (e) {
    res.status(500).json({ events: [], configured: true, error: String(e?.message || e) });
  }
}
