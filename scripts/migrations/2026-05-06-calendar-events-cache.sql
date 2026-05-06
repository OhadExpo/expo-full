-- Calendar events cache: populated by Claude via the Google Calendar MCP.
-- The deployed product does NOT need OAuth credentials, an iCal URL, or
-- any per-deployment env var — Claude reads Ohad's calendar directly via
-- its own authenticated MCP session and upserts rows here.
--
-- Tradeoff: data is only as fresh as the last sync. Ohad asks Claude to
-- "resync calendar" when a new booking should reflect on the dashboard.
-- The dashboard panel surfaces the staleness (green ≤2h, orange ≤24h,
-- red beyond) so it's never invisibly old.
--
-- Run via the Supabase dashboard SQL editor (already applied to prod via
-- Supabase MCP).
-- Safe to re-run: every step uses IF NOT EXISTS / IF EXISTS.

BEGIN;

CREATE TABLE IF NOT EXISTS expo_calendar_events (
  uid              text         PRIMARY KEY,
  summary          text,
  description      text,
  location         text,
  start_at         timestamptz  NOT NULL,
  end_at           timestamptz,
  attendee_emails  text[],
  trainee_id       text,
  synced_at        timestamptz  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS expo_calendar_events_start_at_idx ON expo_calendar_events (start_at);

ALTER TABLE expo_calendar_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "expo_calendar_events_trainer_select" ON expo_calendar_events;
CREATE POLICY "expo_calendar_events_trainer_select" ON expo_calendar_events
  FOR SELECT TO authenticated
  USING (is_trainer());

-- Sync metadata is stored as a single row in the existing `store` table
-- under key='expo-calendar-sync' with value:
--   { at: timestamptz, source: 'claude_mcp', event_count: int, window_days: int }
-- No extra schema needed.

COMMIT;
