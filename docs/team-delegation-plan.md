# EXPO Team Task Delegation + Google Calendar Sync — Planning Brief

**Status:** Planning (no code written). Use this as the canonical brief for the next Claude Code session that implements team task delegation between Ohad + Yuval with Google Calendar sync.

**Drafted:** 2026-05-26. Research compiled from three parallel agents (Monday feature deep-dive, Google Calendar/Tasks API, competitor patterns). Original ChatGPT-style drafts from Google Gemini are **incorrect about the platform** — see §0.

---

## 0. Critical correction up front

The two earlier Gemini drafts assumed this is an **Expo React Native** mobile app because the repo is named `expo-full`. **It is not.** Per `CLAUDE.md`, the EXPO platform is:

- **Vite + React** web app (PWA-enabled)
- **Supabase** backend (Postgres + Auth + Storage + Edge Functions)
- **Vercel** hosting + Functions + Cron + auto-deploy on `git push`
- Deployed at `expo-app.co.il`

The whole "`@react-native-google-signin/google-signin` + `app.json` + EAS build + native bottom-sheet" stack from the prior drafts is **inapplicable**. Don't follow it. The correct stack is below.

---

## 1. The actual goal

Two-person admin team — **Ohad + Yuval** — needs to:

1. Create tasks and assign them to each other.
2. See "what's on my plate" at a glance.
3. Have those tasks appear in their **personal Google Calendars** so they don't have to keep two tabs open.
4. Get notified when the partner assigns something or updates a task.

Constraints derived from EXPO context:

- This is the **same project as the multi-tenant unblock**. Adding Yuval = adding a second trainer account. Existing RLS hardcodes Ohad's email; that hardcoding has to go. (See [`project_multi_tenant_audit.md`](../../../.claude/projects/C--Users-Administrator-Desktop-expo-full/memory/project_multi_tenant_audit.md): 7 BLOCKERs + 6 hardcoded-email policies. This feature pulls those forward.)
- Per memory `feedback_other_coaches_scope`: future paying coaches use only the product (store/plans/cw/bw/wf). This feature is the **owner-side** delegation surface — Ohad + Yuval — *not* a customer-facing feature.
- Ohad's strategic mirror rule: every hour on infrastructure is an hour not training. So MVP must ship in days, not weeks.

---

## 2. What already exists in EXPO (don't rebuild)

Two parallel task tables already in Supabase:

### `coach_notes` — the LIVE task surface
Migration: `scripts/migrations/2026-05-12-coach-notes.sql` + `2026-05-12-coach-notes-status.sql`.

Columns: `id, body, target_kind, target_id, target_label, pinned, status (open|done), completed_at, linked_plan_id, auto_kind, auto_ref, tags, created_at, updated_at`.

- Rendered by `src/NotesWidget.jsx` (Dashboard pool, `/coach/tasks` page) + `src/NotesInline.jsx` (per-trainee strip on TraineeDetail).
- Driven by the **7-rule auto-tasks engine** in `src/autoTasks.js` — see [`reference_auto_tasks_engine.md`](../../../.claude/projects/C--Users-Administrator-Desktop-expo-full/memory/reference_auto_tasks_engine.md). Auto-tasks write rows with `auto_kind` + `auto_ref` for idempotency.
- RLS policy: `(auth.jwt() ->> 'email') = 'ohadyproductions@gmail.com'` — **hardcoded, must change** to support Yuval.

### `coach_tasks` — DESIGNED for delegation, never wired to UI
Migration: `scripts/migrations/2026-05-12-task-manager-v1.sql`.

Columns include: `title, description, assignee (free text), status (todo|in_progress|done), priority, due_date, related_kind, related_id, related_label, notes_log JSONB, created_at, completed_at`.

The original comment: *"In-app task manager for trainee-operator delegation. Distinct from `trainee_next_actions` (which is per-trainee personal queue)."* — built for exactly this use case, then bypassed when `coach_notes` absorbed everyday usage.

### Recommendation
**Extend `coach_notes`, do not resurrect `coach_tasks`.** Reasons:
- The auto-tasks engine + entire NotesWidget/Inline UI already render `coach_notes`.
- Forking to `coach_tasks` doubles the read paths in NotesWidget (or worse, leaves auto-tasks invisible in the new view).
- Coach_notes already has `status`, `target_id`, `linked_plan_id` — most of the data model is there.

Add these columns to `coach_notes`:

```sql
ALTER TABLE public.coach_notes
  ADD COLUMN IF NOT EXISTS created_by      TEXT,       -- trainer user_id or email
  ADD COLUMN IF NOT EXISTS assigned_to     TEXT,       -- trainer user_id; null = unassigned
  ADD COLUMN IF NOT EXISTS due_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS priority        TEXT NOT NULL DEFAULT 'normal',  -- low | normal | high | urgent
  ADD COLUMN IF NOT EXISTS status_label    TEXT NOT NULL DEFAULT 'open',    -- open | working | stuck | done
  ADD COLUMN IF NOT EXISTS google_event_id TEXT,                            -- Google Calendar event id, both copies
  ADD COLUMN IF NOT EXISTS google_etag     TEXT,                            -- for If-Match optimistic concurrency
  ADD COLUMN IF NOT EXISTS sync_status     TEXT NOT NULL DEFAULT 'unsynced'; -- unsynced | synced | failed | pending
```

`status` already exists with values `open|done` — keep that for backward compatibility but route UI through new `status_label` for the Monday-style 4-state pill (`open` → "Not Started", `working`, `stuck`, `done`).

Then a new sibling table for the activity stream:

```sql
CREATE TABLE public.coach_note_activity (
  id          TEXT PRIMARY KEY,
  note_id     TEXT NOT NULL REFERENCES public.coach_notes(id) ON DELETE CASCADE,
  actor       TEXT NOT NULL,    -- email of whoever did the thing
  kind        TEXT NOT NULL,    -- 'comment' | 'assigned' | 'status' | 'due' | 'created'
  payload     JSONB,            -- { from: 'Ohad', to: 'Yuval' } or { from: 'open', to: 'working' } etc.
  body        TEXT,             -- for kind='comment' only
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX coach_note_activity_note_idx ON public.coach_note_activity (note_id, created_at);
```

This serves both **Updates** (manual comments) and **Activity Log** (auto field-diff entries) — keep them in one table but filter by `kind` in the UI per Monday's pattern (separate tabs).

---

## 3. Decisions Ohad needs to make BEFORE Claude implements

These are load-bearing — wrong answer means rework.

| # | Decision | Recommendation | Why |
|---|---|---|---|
| **D1** | Yuval's identity: own login, or proxy via Ohad's account? | Own login. Yuval gets a Supabase auth row + becomes the 2nd row in a `trainers` table. | Without a real user_id you can't OAuth Yuval's Google Calendar, you can't show "assigned by Yuval" honestly, you can't have Yuval's own notification preferences. |
| **D2** | Calendar sync depth: one-way push only, or full bidirectional? | **One-way push first.** Two-way is the failure mode that bit ClickUp for 7 years. Add bidirectional only if Ohad asks after 30 days of usage. | Two-way needs `events.watch` channels (7-day expiry, manual renew via Cron), webhook receiver, syncToken-based delta pulls, etag conflict resolution. ~5x the engineering of one-way. |
| **D3** | Calendar primitive: Events or Tasks? | **Events.** Tasks API has no assignee field (read-only `assignmentInfo` from Chat/Docs only) and no webhook channels. | Events support `attendees[]` (= Yuval gets a Calendar invite + email), `reminders.overrides`, time-blocking. Show as proper calendar entries, not right-rail checklist. |
| **D4** | UI shape: full Monday board+groups+columns clone, or extended NotesWidget? | **Extended NotesWidget** for v1. Keep the existing dashboard pool + per-trainee inline. Add assignee chip, status-pill widget, due-date chip, comment thread. | Monday's full kanban UX is weeks of work. The NotesWidget already has 80% of the row layout. Adding 3 chips + a comments modal ships in days. |
| **D5** | Where does the "My Work" view live? | New `/coach/my-work` page (or replace `/coach/tasks`). Shows only `assigned_to = me` rows, grouped Today / This Week / Later / No Date. | Per Monday research, the "My Work" mobile-style aggregator is the **single most-used** surface in any team task tool. Cheap to build, huge daily value. |

---

## 4. Recommended architecture

### Auth + Google API integration

Source: research agent #2.

**OAuth flow** — Google Identity Services (GIS) Code Model + server-side exchange:

1. Frontend Settings page → "Connect Google Calendar" button → `google.accounts.oauth2.initCodeClient({ ux_mode: 'popup', scope: 'https://www.googleapis.com/auth/calendar.events', access_type: 'offline' })`.
2. Popup returns an auth code to JS callback.
3. JS POSTs the code to `POST /api/google/exchange` (Vercel serverless route).
4. Vercel function calls Google's token endpoint with `client_secret` (Vercel env var — **never** ships to browser) → receives `{ access_token, refresh_token }`.
5. Store refresh token in **Supabase Vault** (encrypted at rest; pgsodium is being deprecated, use Vault wrapper).

**Schema:**

```sql
CREATE TABLE public.google_connections (
  user_id          UUID PRIMARY KEY REFERENCES auth.users,
  google_email     TEXT NOT NULL,
  refresh_token_id UUID REFERENCES vault.secrets,
  scopes           TEXT[] NOT NULL,
  connected_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.google_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_connection" ON public.google_connections
  FOR ALL TO authenticated USING (user_id = auth.uid());
```

Only Vercel functions (service role) call `vault.decrypted_secrets` to mint access tokens.

**Minimum-privilege scope:** `https://www.googleapis.com/auth/calendar.events` — sufficient to create/edit/delete events on calendars the user already has access to. Avoid the broader `auth/calendar` scope which triggers stricter Google verification review.

### Sync engine (one-way, EXPO → Google)

For each `coach_notes` row with `due_at IS NOT NULL` and `assigned_to IS NOT NULL`:

1. App writes the row to Supabase (optimistic UI).
2. Background: a Vercel route `POST /api/google/sync-task` is called with `note_id`.
3. Vercel route reads the row, mints an access token for the **assignee** (Yuval if `assigned_to=yuval`), calls `events.insert`:
   - `start: due_at`, `end: due_at + 30min` (configurable per-task later)
   - `summary: [status] body` (e.g. `[Working on it] Call Diego re: assessment`)
   - `description: APPNATIVE TASK ID: ${note_id}\n\nFull description here...`
   - `attendees: [{ email: <other-trainer-email> }]` — invites the partner
   - `reminders.overrides: [{ method: 'popup', minutes: 60 }, { method: 'email', minutes: 1440 }]`
4. Google returns `{ id, etag, htmlLink }`. Store `google_event_id` + `google_etag` on the row.
5. On future updates (status change, due-date shift, body edit): `events.patch` with `If-Match: etag` header. On `412 Precondition Failed`, refetch + retake Google's version (Calendar wins).
6. On delete: `events.delete`.

### Notification strategy — ruthless defaults

Per the Monday research, notification overload is the #1 user complaint. Don't recreate that.

Push (Web Push, already shipped per `project_push_notifications_2026_05_16.md`) fires **only** in these cases:

1. You were directly assigned to a task (kind=`assigned`, you=`new_assignee`).
2. Someone `@mentioned` you in a comment.
3. A task assigned to you is due in 60 minutes (one-time, not repeated).
4. A task assigned to you was marked Done by the *other* person (kind=`status`, you=`assignee`, status_to=`done`).

That's it. **No** "someone changed something on a task" firehose. No board-level subscription. Per Apple Reminders research, the smoothest 2-person experience is "tell me when partner adds" + "tell me when partner completes."

---

## 5. UI changes

### Status pill — Monday's signature visual

Status colors per the brand spec at `brand-monday.com/colors`:

```js
const STATUS = {
  open:    { label: 'Not Started',  bg: '#C4C4C4', fg: '#000000' },  // light gray
  working: { label: 'Working on it', bg: '#FFCC00', fg: '#000000' }, // monday yellow
  stuck:   { label: 'Stuck',        bg: '#FB275D', fg: '#FFFFFF' }, // monday red
  done:    { label: 'Done',         bg: '#00CA72', fg: '#FFFFFF' }, // monday green
};
```

**Critical for EXPO's dark mode:** Monday's saturated pills assume a near-white canvas. On `#0a0a0b` they vibrate chromatically. Per research agent #3: pull saturation back ~15–20% on dark theme. Define dark variants in `themes.css`:

```css
:root[data-theme="dark"] {
  --c-status-working: #D9A800;
  --c-status-stuck:   #C81F4D;
  --c-status-done:    #00A85D;
  /* open stays neutral gray, no shift needed */
}
```

Pill renders **full-cell-width**, fontSize 11, fontWeight 700, no padding around it. Tapping the pill opens a bottom-sheet with the 4 chips for quick change. (Steal from Linear's keyboard-first model: pressing `1/2/3/4` while hovering also changes status — wire later if Ohad uses keyboard.)

### Per-task card extensions

In NotesWidget / NotesInline row, add three chips next to the existing layout:

1. **Assignee avatar pill** — 22px circle + first letter. Tap → bottom-sheet to pick Ohad or Yuval. Empty state = "+ ASSIGN".
2. **Due-date chip** — `26 MAY`. Color turns orange if today, red if overdue. Empty = "+ DUE".
3. **Comments indicator** — speech bubble icon + count (only if count > 0). Tap → slides up the Updates thread modal.

### Updates / Activity Log modal

Two tabs (per Monday research, keep them separate):

- **Updates** (manual): rich text comments by either trainer. `@mention` syntax (only Ohad / Yuval) → triggers notification to the @-tagged party. **Threaded replies not supported in v1** — per Monday's known footgun where `@mention` in a reply doesn't notify, just keep it flat.
- **Activity** (auto): system-generated field-diff entries written into `coach_note_activity`. Format per Asana's pattern: `Ohad changed Status: Working on it → Done · 2:14pm`. Steal Asana's field-level diff; don't just log "updated."

### "My Work" page

New route `/coach/my-work` (or rebrand existing `/coach/tasks`):

- Top filter: only tasks where `assigned_to = me`.
- Grouped sections collapsed by default:
  - **TODAY** (due today or overdue)
  - **THIS WEEK** (due in next 7 days)
  - **LATER** (due > 7 days)
  - **NO DATE**
- Each row: status pill + body + due-date chip + assigner avatar.
- Mobile: same view, full-width cards.

Per Monday research, this aggregator is the single most-used mobile surface. Build it before anything fancier.

---

## 6. Phased build order (no code yet — this is the plan)

### Phase 0: Decisions (Ohad reads §3, picks recommendations or overrides)
1 hour. Required before code.

### Phase 1: Multi-trainer foundation
~1 day.
1. New `trainers` table: `id (uuid), email, name, color (hex), notif_prefs jsonb, created_at`.
2. Add Yuval's row + Yuval's Supabase auth user.
3. Migrate RLS policies on `coach_notes`, `coach_note_activity` (new), `coach_messages`, `coach_tasks`, `chat_logs`, `store[expo-presence]` from hardcoded email to `auth.uid() IN (SELECT id FROM trainers)`. (Six policies per the multi-tenant audit.)
4. Add `assigned_to`, `created_by`, `due_at`, `priority`, `status_label`, `google_event_id`, `google_etag`, `sync_status` columns to `coach_notes`.
5. Create `coach_note_activity` table.

### Phase 2: UI — status pills + assignee chips + due-date
~2 days.
1. Status pill component (Monday-style, full-cell-width, dark-mode-desaturated).
2. Assignee chip + bottom-sheet picker.
3. Due-date chip + native `<input type="date">` picker.
4. Wire into NotesWidget + NotesInline rows.
5. Bulk Action Toolbar pattern from ClickUp: multi-select rows → toolbar at bottom with "Assign to..." / "Due..." / "Status..." → bulk update. (One genuine win from ClickUp.)

### Phase 3: Updates + Activity modal
~1 day.
1. Slide-up modal opening from the comment-bubble chip.
2. Two tabs: Updates (writeable text + @mention) / Activity (auto-log, read-only).
3. Field-diff middleware: every mutation on a `coach_notes` row writes a `coach_note_activity` row with `kind` + `payload`.

### Phase 4: My Work page
~0.5 day.
1. `/coach/my-work` route (or repurpose `/coach/tasks`).
2. Filter `assigned_to = current_trainer_id()`.
3. Grouped sections: Today / This Week / Later / No Date.

### Phase 5: Google Calendar — one-way push
~2 days.
1. `google_connections` table + Vault setup.
2. Vercel routes: `/api/google/exchange`, `/api/google/refresh`, `/api/google/sync-task`.
3. "Connect Google Calendar" button on Settings.
4. Hook into note mutations: every create/update/delete with `assigned_to + due_at` fires a sync.
5. Show sync status on each row (cloud icon: synced / pending / failed).

### Phase 6: Notifications — ruthless defaults
~0.5 day.
1. Push triggers (existing infrastructure) extended for the 4 events listed in §4.
2. Notif prefs UI: Apple Reminders' two-toggle pattern — `Notify when ${other} adds`, `Notify when ${other} completes`.

### NOT in scope for v1
- Bidirectional Google Calendar sync (watch channels, webhook receiver, syncToken delta pulls). Add only if Ohad requests after 30 days.
- Subitems / nested tasks. Coach_notes is flat.
- Mirror columns, formula columns, dependencies. Skip permanently.
- Custom status labels beyond the 4 defaults. Skip until needed.
- A Google Workspace Add-on (Apps Script). **Don't.** Per research agent #2: rebuilding the EXPO UI in Apps Script costs more than it saves. Sync to Calendar; live in EXPO.

---

## 7. Competitor pattern adoption matrix

Source: research agent #3.

| Pattern | From | Adopt? | Notes |
|---|---|---|---|
| Field-level diff in activity feed (`Status: Doing → Done`) | Asana | **Yes** | Cheap; biggest "what changed?" win for 2 people. |
| Bulk Action Toolbar on multi-select | ClickUp | **Yes — Phase 2** | Multi-assign, multi-due, multi-status. Big time-saver during weekly review. |
| Multiple assignees per task | ClickUp | **No** | "Two owners = no owner." Trello's own docs warn against this. Single owner, always. |
| Fixed priority enum (Urgent / High / Normal / Low) | Linear | **Yes** | Already added to `coach_notes` plan as `priority` column. No custom levels. |
| Auto-subscribe assignee to changes | Linear | **Yes** | Free with the notification model in §4. |
| `.ics` calendar feed (read-only) | Todoist / Trello | **Maybe — fallback** | Cheap robust alt to OAuth push. If Phase 5 stalls, ship `.ics` per-trainer (one feed URL Ohad pastes into GCal). |
| Apple Reminders' 2-toggle notif model | Apple | **Yes — Phase 6** | "When ${other} adds" + "When ${other} completes." Replaces any "configure 14 notification types" misery. |
| Drag-to-change-status (kanban) | Trello | **No — v1** | Phase 2 ships status pill tap. Drag kanban view = Phase ∞ if Ohad asks. |
| "My Work" assigned-to-me aggregate | Monday + Asana + Linear | **Yes — Phase 4** | Single most-impactful mobile surface per Monday research. |

---

## 8. Specific anti-patterns — don't do these

1. **Don't replicate Monday's notification firehose.** Six channels × every column change × every board = spam within a week. Per G2/Trustpilot top complaint.
2. **Don't allow multi-assignee.** Trello explicitly warns; ClickUp's multi-assignee creates the same accountability fog.
3. **Don't promise full bidirectional Calendar sync** until you've actually shipped + supported the one-way push for 30 days. ClickUp has been "working on it since 2019."
4. **Don't deprecate the integration after launch.** Microsoft retired "Add Planner to Outlook" Jan 2026 with no migration; users still angry. Once you ship Calendar sync, you own it permanently.
5. **Don't build a Google Workspace Add-on (CardService).** Apps Script + JSON UI = rebuilding EXPO's design system from scratch. Not worth it for a 2-person team.
6. **Don't use Monday's saturated pill colors as-is on dark theme.** Desaturate ~15–20% or they vibrate against `#0a0a0b`.
7. **Don't fork to `coach_tasks` table** — extend `coach_notes`. The existing UI + auto-tasks engine already render it.
8. **Don't ship `@mention` in threaded replies** — Monday's known footgun where reply-mentions don't notify. Keep comments flat for v1.

---

## 9. Open questions for Ohad

These don't block Phase 1 but should be answered before Phase 5:

1. **Time of day for tasks.** Calendar Events need a start time, not just a date. Auto-default to 9am for "today" + due-date day for future? Or always 9am? Or let user set per-task?
2. **Default event duration.** 30 min? Configurable per-task? Hidden until user cares?
3. **What happens to tasks without `due_at`?** Skip Calendar sync entirely, or create as an all-day event? (Recommend: skip — calendar is for time-blocked work.)
4. **Yuval's color identity.** Per ClickUp / Linear pattern: each trainer gets a brand color used for their avatar + activity-log highlighting. Ohad cyan (`#39BDFF` per brand); Yuval = ?
5. **Calendar sync for auto-tasks?** The 7-rule auto-tasks engine creates rows like "Build Block #26 for רועי הצבי." Should these auto-create Calendar entries too, or only manual tasks? (Recommend: only when `assigned_to` is set. Auto-tasks default to unassigned.)

---

## 10. Reading order for the next Claude

1. This doc end-to-end.
2. `CLAUDE.md` (project root) for stack and constraints.
3. Memory files: `reference_auto_tasks_engine.md`, `crm-activity-derivation.md`, `project_multi_tenant_audit.md`, `feedback_other_coaches_scope.md`.
4. Code: `src/coachNotes.js`, `src/NotesWidget.jsx`, `src/NotesInline.jsx`, `src/autoTasks.js`, `scripts/migrations/2026-05-12-*.sql`.
5. Then begin Phase 1 only after Ohad has answered §3 decisions.

---

## 11. Sources

### Google APIs (agent #2)
- [Calendar API scopes guide](https://developers.google.com/workspace/calendar/api/auth)
- [Create events (attendees, reminders)](https://developers.google.com/workspace/calendar/api/guides/create-events)
- [Calendar push notifications](https://developers.google.com/workspace/calendar/api/guides/push)
- [events.watch reference](https://developers.google.com/workspace/calendar/api/v3/reference/events/watch)
- [Tasks REST resource](https://developers.google.com/tasks/reference/rest/v1/tasks) (note: no assignee write field)
- [Google Tasks shared tasks help](https://support.google.com/tasks/answer/11549608) (confirms no list sharing in 2026)
- [GIS Code Model + PKCE flow](https://developers.google.com/identity/oauth2/web/guides/use-code-model)
- [Supabase Vault](https://supabase.com/docs/guides/database/vault) (refresh-token storage)
- [Google Workspace Add-ons for Calendar](https://developers.google.com/workspace/add-ons/calendar) (and why we're not building one)

### Monday.com (agent #1)
- [Monday structural hierarchy](https://support.monday.com/hc/en-us/articles/7278527605906-Understanding-monday-com-s-structural-hierarchy)
- [Column types catalog](https://support.monday.com/hc/en-us/articles/115005310285-Available-column-types-on-monday-com)
- [Status Column docs](https://support.monday.com/hc/en-us/articles/360001269685-The-Status-Column)
- [Brand color spec — Done/Working/Stuck colors](https://www.brand-monday.com/colors)
- [Notifications explained (and overload complaints)](https://support.monday.com/hc/en-us/articles/360001292545-Notifications-explained)
- [Updates section + activity log](https://support.monday.com/hc/en-us/articles/115005900249-The-Updates-Section)
- [Google Calendar Integration (recipe-based, not native)](https://support.monday.com/hc/en-us/articles/4404712420754-Google-Calendar-Integration)

### Competitors (agent #3)
- [Asana — Google Calendar one-way](https://asana.com/apps/google-calendar)
- [ClickUp — Multiple Assignees ClickApp](https://help.clickup.com/hc/en-us/articles/6309029762583-Multiple-Assignees)
- [ClickUp — 2-way GCal sync, open since 2019](https://feedback.clickup.com/feature-requests/p/2-way-sync-for-google-calendar)
- [Linear — conceptual model + priorities](https://linear.app/docs/conceptual-model)
- [Todoist — Calendar feed (.ics)](https://www.todoist.com/help/articles/add-a-todoist-calendar-feed-pAk3tk)
- [Microsoft — Planner-to-Outlook retired Jan 2026](https://learn.microsoft.com/en-us/answers/questions/5881041/how-to-add-planner-task-to-outlook-calendar)
- [Apple — share a reminder list](https://support.apple.com/guide/iphone/share-and-collaborate-iph2a8f9121e/ios)
- [Trello — one assignee per checklist item, intentionally](https://help.trello.com/article/942-how-to-use-advanced-checklists-to-set-due-dates-and-add-members-to-checklist-items)
