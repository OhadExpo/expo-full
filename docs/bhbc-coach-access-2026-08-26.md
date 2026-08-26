# BHBC coach access — verified 2026-08-26

Ohad: *"make sure all the coaches have a proper bhbc login screen, that their
emails all work and they can sign in perfectly. make sure yoel can do all things
related to medical reports."*

## Sign-in: all four work

`node scripts/bhbc-provision-coaches.mjs` (read-only without `--create`):

| coach | signs in | role | reads |
|---|---|---|---|
| benshemer4@gmail.com | yes | coach | fixtures, league, loads, medical, plans, roster |
| elishai115@gmail.com | yes | coach | same |
| yehuorland@gmail.com | yes | coach | same |
| yoel23919@gmail.com | yes | **coach + PT** | same |

They land on `/bhbc` → the Bnei Herzliya zone.

**The door itself** is a proper club screen, screenshotted signed-out at 390px:
club crest, "BNEI HERZLIYA · S&C STAFF", "COACH SIGN-IN", Continue with Google,
email + password, and "Staff access is provisioned by the S&C team."

## Yoel and the medical board: correct in the UI

Signed in as each and opened MEDICAL:

| | write controls | read-only notice |
|---|---|---|
| **yoel23919 (PT)** | **8 × "+ Report"** | no |
| benshemer4 (coach) | **none** | yes |

So the PT can report and edit injuries and the other coaches cannot — exactly
the rule stated in `src/auth.jsx`.

## But the DATABASE did not enforce it

Signing in is not the same as being allowed to write, and a hidden button is not
a refused write. Testing the permission itself — writing each key's own value
straight back, a real RLS round-trip that changes nothing:

| key | benshemer4 (regular coach) | should be |
|---|---|---|
| `expo-bhbc-medical` | **write ALLOWED** | refused |
| `expo-exercises` | **write ALLOWED** | refused |
| `expo-bhbc-loads` / `roster` / `plans` | write allowed | correct — their job |
| `expo-trainees` | cannot even read | correct |

Any coach could write injuries through the API, and the shared exercise library
— 1,326 exercises used across the whole business — as well. The PT rule lived in
the UI only.

**Fix:** `scripts/migrations/2026-08-26-bhbc-coach-write-scope.sql`. A
RESTRICTIVE policy, not an edit to whichever permissive policy is too broad:
Postgres RLS is permissive-OR, so hunting the culprit risks missing another one
or a future one. A restrictive policy ANDs a ceiling over all of them. SELECT is
untouched — coaches still read the medical board and the library.

**Not yet applied.** DDL needs the service-role key or the Supabase MCP OAuth,
neither available to me. To apply, either paste the migration into the Supabase
SQL editor, or:

```
SUPABASE_SERVICE_ROLE_KEY=... psql "$DATABASE_URL" -f scripts/migrations/2026-08-26-bhbc-coach-write-scope.sql
```

Then: `node scripts/verify-bhbc-write-scope.mjs` — it asserts the whole matrix
(PT keeps medical, coaches lose it, nobody but owner/staff touches the library,
and coaches KEEP loads/roster/plans). **Currently 5 passed, 3 failed.** It
should read 8 passed, 0 failed.

Safe to restrict: `BhbcView` receives `exercises` read-only and has no setter,
so no coach flow writes the library.
