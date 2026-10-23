# Team version - Phase B runbook (club tenancy)

Phase A (shipped first) made the club zone wear a club config (`src/clubs/clubs.js`) and run a demo club on a generated season with no database access (`/demo/club/<slug>`). Phase B makes a second REAL club possible. It changes the database, so it runs with Ohad, step by step, never unattended.

### Why it is needed

All club data today lives in eight shared `store` rows (`expo-bhbc-*`). Any second club added on top of them would read the first club's roster and medical board. No real second club goes live before B3 below is verified from a second club's seat.

### Steps

1. Snapshot every `expo-bhbc-*` store row to a dated JSON file (the restore point). Record the production SHA.

2. Apply `supabase/proposed/20261023_club_tenancy.sql` (additive: new tables, functions, RLS; nothing existing changes). Run the four checks at the bottom of the file.

3. Insert the club rows (`bhbc`, then the new club) and their members (`club_members`, accepted).

4. Backfill: `node scripts/club-tenancy-backfill.mjs` (dry run, snapshots every key to `~/expo-private-backups/`), then `--apply`: each `expo-bhbc-*` key into `club_store` (`club_id = 'bhbc'`), medical into `club_medical`, read back and compared by a key-sorted hash. The old store rows are not touched.

5. Dual-read: the zone reads `club_store` first and falls back to the old key; writes still go to the old key. One day on production.

6. Switch writes to `club_store` / `club_medical`. Keep the old keys read-only for 30 days, then retire them.

7. Members replace the email lists (`authRoles.js` club lists, `is_bhbc_coach`, `is_bhbc_pt`): sign-in looks up `club_members`; invites are links the club's head sends.

8. The daemon jobs (league stats, calendar, warm-up sheet) take a club id and loop over clubs; soccer gets its own league source. Move them off the office PC (Vercel cron within the 12-function limit, or Supabase Edge Functions).

### Verify before a second club

- Sign in as the second club's coach: the roster, fixtures and medical board are his club's only (0 rows of the first club).

- A coach's medical read has no notes, pain or progress; a physio's has them; every read is in `club_medical_reads`.

- `scripts/verify-club-pixel-parity.mjs` shows Herzliya unchanged.
