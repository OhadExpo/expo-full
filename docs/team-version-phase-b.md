# Team version - Phase B runbook (club tenancy)

Phase A (shipped first) made the club zone wear a club config (`src/clubs/clubs.js`) and run a demo club on a generated season with no database access (`/demo/club/<slug>`). Phase B makes a second REAL club possible. It changes the database, so it runs with Ohad, step by step, never unattended.

### Why it is needed

All club data today lives in eight shared `store` rows (`expo-bhbc-*`). Any second club added on top of them would read the first club's roster and medical board. No real second club goes live before B3 below is verified from a second club's seat.

### Steps

1. Snapshot every `expo-bhbc-*` store row to a dated JSON file (the restore point). Record the production SHA.

2. ~~Apply `supabase/migrations/20261023_club_tenancy.sql`~~ DONE 23.10: applied after a snapshot (`~/expo-private-backups/snapshots/bhbc-store-before-phaseB-*.json`); the four checks at the bottom of the file passed in a rolled-back test. Tables empty until step 3.

3. ~~Insert the club rows and their members~~ DONE 23.10: club `bhbc` + six members from the role lists in `src/authRoles.js` (owner, head, two PTs, two coaches), all accepted.

4. ~~Backfill~~ DONE 23.10: `node scripts/club-tenancy-backfill.mjs --apply` copied loads, fixtures, league, gamewarmup, activity into `club_store` and the medical board into `club_medical`; every key read back identical (key-sorted hash). `club_medical` has no select policy, so medical is written by INSERT / `club_medical_put`, never an upsert (RLS refuses an ON CONFLICT it cannot see). Proven from seven seats: `node scripts/verify-club-tenancy-seats.mjs`.

5. KEEP IN STEP (corrected 23.10 - the first version said "read the club tables first while writes still go to the old key", which shows Herzliya stale data from the first write after the backfill). The store stays the only thing the app reads and writes; `scripts/club-tenancy-sync.mjs` copies every changed key into the club tables (medical through `club_medical_put`, migration `20261023_club_medical_put.sql`), run by the daemon every 20 minutes. `--verify` reads every key back and compares. Run it for a few days; `club-sync-state.json` in the private backups records each round.

6. THE SWITCH, reads and writes together, in one deploy: a final `club-tenancy-sync.mjs --verify` (every key in step), then the zone reads and writes `club_store` / `club_medical` (medical through `club_medical_get` / `club_medical_put`). Keep the old keys read-only for 30 days, then retire them.

7. Members replace the email lists (`authRoles.js` club lists, `is_bhbc_coach`, `is_bhbc_pt`): sign-in looks up `club_members`; invites are links the club's head sends.

8. The daemon jobs (league stats, calendar, warm-up sheet) take a club id and loop over clubs; soccer gets its own league source. Move them off the office PC (Vercel cron within the 12-function limit, or Supabase Edge Functions).

### Verify before a second club

- Sign in as the second club's coach: the roster, fixtures and medical board are his club's only (0 rows of the first club).

- A coach's medical read has no notes, pain or progress; a physio's has them; every read is in `club_medical_reads`.

- `scripts/verify-club-pixel-parity.mjs` shows Herzliya unchanged.
