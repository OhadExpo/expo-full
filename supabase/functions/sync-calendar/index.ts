// sync-calendar — pulls Ohad's Google Calendar iCal feed every N minutes
// (driven by pg_cron) and upserts EXPO sessions into expo_calendar_events.
//
// Reads the ICS URL from the `store` table key=expo-calendar-ics-url so
// Ohad never has to touch Supabase project settings or Vercel env vars —
// the URL is pasted once into the EXPO UI which writes the row.
//
// verify_jwt: false because pg_cron calls this without a JWT. The
// endpoint is idempotent and only refreshes a cache from a pre-configured
// source — no payload-driven mutations, no secret exposure in responses.
//
// Service role auth is via the auto-injected SUPABASE_URL +
// SUPABASE_SERVICE_ROLE_KEY env vars. No manual env var setup needed.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ---------------------------------------------------------------------------
// ICS parsing — RFC5545 minimum viable. Handles line unfolding, escape
// sequences, parameter sections before the colon, and DTSTART/DTEND in
// date-only / floating / UTC forms. Skips RRULE — Appointment Schedule
// events are individual instances anyway.
// ---------------------------------------------------------------------------
function unescapeIcs(s: string): string {
  // Lift escaped backslashes out via a sentinel so a literal "\\n" doesn't
  // get misread as a newline.
  const SENTINEL = " ESC_BS ";
  return String(s || "")
    .replace(/\\\\/g, SENTINEL)
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .split(SENTINEL).join("\\");
}

interface IcsDate { iso: string; allDay: boolean; tz: string | null; }

function parseIcsDate(value: string, params: Record<string, string>): IcsDate | null {
  const v = String(value || "").trim();
  if (/^\d{8}$/.test(v)) {
    return { iso: `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`, allDay: true, tz: null };
  }
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(v);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  if (z) return { iso: `${y}-${mo}-${d}T${h}:${mi}:${s}.000Z`, allDay: false, tz: "UTC" };
  // Floating local. Treat as Asia/Jerusalem (Ohad's calendar TZ) by
  // appending the +03:00 offset. (Israel observes DST May-Oct = +03:00.)
  return { iso: `${y}-${mo}-${d}T${h}:${mi}:${s}+03:00`, allDay: false, tz: params.TZID || "Asia/Jerusalem" };
}

interface IcsEvent {
  uid?: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: IcsDate;
  end?: IcsDate;
  status?: string;
  attendees: { email: string; name: string | null }[];
}

function parseIcs(text: string): IcsEvent[] {
  const unfolded = String(text || "")
    .replace(/\r\n[ \t]/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\n[ \t]/g, "");
  const lines = unfolded.split("\n");
  const events: IcsEvent[] = [];
  let cur: IcsEvent | null = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line === "BEGIN:VEVENT") { cur = { attendees: [] }; continue; }
    if (line === "END:VEVENT") { if (cur) events.push(cur); cur = null; continue; }
    if (!cur) continue;

    let colonAt = -1;
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') inQuote = !inQuote;
      else if (c === ":" && !inQuote) { colonAt = i; break; }
    }
    if (colonAt < 0) continue;

    const head = line.slice(0, colonAt);
    const value = line.slice(colonAt + 1);
    const semis = head.split(";");
    const key = semis[0].toUpperCase();
    const params: Record<string, string> = {};
    for (let i = 1; i < semis.length; i++) {
      const eq = semis[i].indexOf("=");
      if (eq > 0) params[semis[i].slice(0, eq).toUpperCase()] = semis[i].slice(eq + 1);
    }

    if (key === "SUMMARY") cur.summary = unescapeIcs(value);
    else if (key === "DESCRIPTION") cur.description = unescapeIcs(value);
    else if (key === "LOCATION") cur.location = unescapeIcs(value);
    else if (key === "DTSTART") cur.start = parseIcsDate(value, params) || undefined;
    else if (key === "DTEND") cur.end = parseIcsDate(value, params) || undefined;
    else if (key === "STATUS") cur.status = value;
    else if (key === "UID") cur.uid = value;
    else if (key === "ATTENDEE") {
      const m = /mailto:([^>\s,]+)/i.exec(value);
      if (m) cur.attendees.push({ email: m[1].toLowerCase(), name: params.CN || null });
    }
  }
  return events;
}

// EXPO session detection — patterns catch both Appointment Schedule
// auto-events and manually-created training events. See
// reference_calendar_sync_via_mcp.md.
//
// EXPO_TRAINING_RE picks up plain "אימון" or "אימון <name>" entries
// Ohad types into his own calendar — earlier the filter required
// "אימון אישי" (with אישי) and bare-"אימון" events were silently
// dropped from the dashboard.
const EXPO_TITLE_RE = /EXPO\s+חדר\s+כושר/i;
const EXPO_PERSONAL_RE = /אימון\s+אישי/i;
const EXPO_SLOT_RE = /שעת\s+אימון/i;
const EXPO_TRAINING_RE = /\bאימון\b/u;

function isExpoSession(ev: IcsEvent): boolean {
  if (!ev || ev.status === "CANCELLED") return false;
  const summary = ev.summary || "";
  if (EXPO_TITLE_RE.test(summary)) return true;
  if (EXPO_PERSONAL_RE.test(summary)) return true;
  if (EXPO_TRAINING_RE.test(summary)) return true;
  if (EXPO_SLOT_RE.test(ev.description || "")) return true;
  return false;
}

function resolveTraineeId(emails: string[], trainees: any[]): string | null {
  for (const email of emails) {
    const lc = email.toLowerCase();
    for (const t of trainees) {
      const tEmails: string[] = Array.isArray(t.email) ? t.email : (t.email ? [t.email] : []);
      if (tEmails.some((e: string) => String(e).toLowerCase() === lc)) return t.id;
      if (Array.isArray(t.members)) {
        for (const m of t.members) {
          const mEmails: string[] = Array.isArray(m.email) ? m.email : (m.email ? [m.email] : []);
          if (mEmails.some((e: string) => String(e).toLowerCase() === lc)) return t.id;
        }
      }
    }
  }
  return null;
}

// Browser fetches from expo-app.co.il need CORS. Without these headers,
// the panel's "Sync Now" button preflight fails and the click silently
// no-ops. pg_cron doesn't go through CORS so this is browser-only impact.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
};

function corsJson(body: unknown, status = 200) {
  return Response.json(body, { status, headers: CORS_HEADERS });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Test mode — accept a URL via the request body, fetch + parse it, return
  // the EXPO event count without writing anything to Supabase. The panel
  // calls this before storing the URL so a paste that returns zero events
  // (e.g. the calendar UI URL the user landed on by accident) gets
  // rejected up-front instead of silently saving and breaking the cron.
  let testUrl: string | null = null;
  if (req.method === "POST") {
    try {
      const body = await req.json().catch(() => null);
      if (body && typeof body.testUrl === "string" && body.testUrl) testUrl = body.testUrl;
    } catch { /* ignore */ }
  }

  try {
    let url: string | undefined;
    if (testUrl) {
      url = testUrl;
    } else {
      const { data: urlRow } = await supabase
        .from("store").select("value").eq("key", "expo-calendar-ics-url").maybeSingle();
      url = urlRow?.value?.url;
    }
    if (!url) {
      // Stamp the sync row even on this branch so the dashboard's
      // "synced Xm ago" advances when the user clicks Sync Now — otherwise
      // the timestamp looks broken when in fact the function did run.
      if (!testUrl) await stampSync(supabase, 0, "No iCal URL configured. Paste it in the dashboard.");
      return corsJson({ ok: false, error: "No iCal URL configured. Paste it in the EXPO dashboard panel." }, 503);
    }

    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 15000);
    let text: string;
    let contentType = "";
    try {
      const r = await fetch(url, { signal: ctrl.signal, headers: { "user-agent": "expo-edge-cron/1.0" } });
      if (!r.ok) {
        if (!testUrl) await stampSync(supabase, 0, `ICS fetch ${r.status}`);
        return corsJson({ ok: false, error: `ICS fetch failed: ${r.status}` }, 502);
      }
      contentType = r.headers.get("content-type") || "";
      text = await r.text();
    } finally { clearTimeout(timeout); }

    // Sanity check: the URL must look like an iCal feed. The Calendar UI URL
    // (https://calendar.google.com/calendar/u/0/r) returns text/html with an
    // empty body — it's a redirect-app, not a feed — so a content-type that
    // isn't "text/calendar" plus no BEGIN:VCALENDAR is a sure sign of a
    // bad paste. Surface that as a clear error rather than upserting zero
    // events silently.
    const looksLikeIcal = /text\/calendar|application\/calendar/i.test(contentType) ||
                          /\bBEGIN:VCALENDAR\b/.test(text);
    if (!looksLikeIcal) {
      const msg = "URL does not return iCal data. Make sure it's the 'Secret address in iCal format' from Google Calendar settings (the URL ends in .ics).";
      if (!testUrl) await stampSync(supabase, 0, msg);
      return corsJson({ ok: false, error: msg, contentType, sample: text.slice(0, 120) }, 422);
    }

    const allEvents = parseIcs(text);
    const expoEvents = allEvents.filter(isExpoSession);

    if (testUrl) {
      // Don't write — just report. The panel uses this to validate before
      // saving the URL into store.
      return corsJson({
        ok: true,
        test: true,
        totalEvents: allEvents.length,
        expoEvents: expoEvents.length,
        sampleSummaries: expoEvents.slice(0, 5).map((e) => e.summary || "").filter(Boolean),
      });
    }

    const { data: traineesRow } = await supabase
      .from("store").select("value").eq("key", "expo-trainees").maybeSingle();
    const trainees: any[] = Array.isArray(traineesRow?.value) ? traineesRow!.value : [];

    const nowMs = Date.now();
    const winStartMs = nowMs - 60 * 60 * 1000;
    const winEndMs = nowMs + 21 * 24 * 60 * 60 * 1000;

    const rows = expoEvents
      .filter((ev) => ev.start && ev.start.iso && ev.uid)
      .filter((ev) => {
        const t = new Date(ev.start!.iso).getTime();
        return Number.isFinite(t) && t >= winStartMs && t <= winEndMs;
      })
      .map((ev) => {
        const emails = (ev.attendees || []).map((a) => a.email).filter((e) => !!e && e !== "ohadyproductions@gmail.com");
        return {
          uid: ev.uid!,
          summary: ev.summary || "",
          description: ev.description || "",
          location: ev.location || "",
          start_at: new Date(ev.start!.iso).toISOString(),
          end_at: ev.end?.iso ? new Date(ev.end.iso).toISOString() : null,
          attendee_emails: emails,
          trainee_id: resolveTraineeId(emails, trainees),
          synced_at: new Date().toISOString(),
        };
      });

    if (rows.length > 0) {
      const { error: upErr } = await supabase.from("expo_calendar_events").upsert(rows);
      if (upErr) throw upErr;
    }

    // Delete cancelled future events: any row in the live future window
    // whose uid is not in this batch.
    const keepUids = rows.map((r) => r.uid);
    if (keepUids.length > 0) {
      const orList = keepUids.map((u) => `"${u.replace(/"/g, '\\"')}"`).join(",");
      const { error: delErr } = await supabase
        .from("expo_calendar_events")
        .delete()
        .gte("start_at", new Date(winStartMs).toISOString())
        .not("uid", "in", `(${orList})`);
      if (delErr) {
        // Non-fatal — sync still succeeded.
        console.error("cancellation cleanup failed", delErr);
      }
    }

    await stampSync(supabase, rows.length, null);
    return corsJson({ ok: true, count: rows.length, totalEvents: allEvents.length, expoEvents: expoEvents.length });
  } catch (e: any) {
    return corsJson({ ok: false, error: String(e?.message || e) }, 500);
  }
});

async function stampSync(supabase: any, count: number, errorMsg: string | null) {
  await supabase.from("store").upsert({
    key: "expo-calendar-sync",
    value: {
      at: new Date().toISOString(),
      source: "edge_cron",
      event_count: count,
      window_days: 21,
      error: errorMsg,
    },
    updated_at: new Date().toISOString(),
  });
}
