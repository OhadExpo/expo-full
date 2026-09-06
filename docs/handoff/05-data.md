# Lens 5 — the data

*Exact shapes, read from the production store tonight. Do not guess at these.*

## Where BHBC data lives

Supabase table `store`, key/value JSON. Read with the owner seat signed in.

```js
const get = async (k) => (await sb.from('store').select('value').eq('key', k).maybeSingle()).data?.value ?? null;
```

| Key | Shape | Size tonight |
| --- | --- | --- |
| `expo-bhbc-roster` | array of athletes | 10 |
| `expo-bhbc-loads` | object keyed by athlete id | 10 |
| `expo-bhbc-fixtures` | array of sessions on the calendar | 33 |
| `expo-bhbc-medical` | object keyed by athlete id | 8 |
| `expo-bhbc-plans` | object keyed by `date|start` | 1 |

## The shapes

**roster[i]** — `id, name, jersey, position, nationality, dob, age, height,
heightCm, weight, team, format, goals, status, arrival, startDate, injuries`

**loads[athleteId]** — `{ loads, sessions, readiness, attendance, availability }`

```json
sessions["2026-09-06"][0] = {
  "by": "ohadyproductions@gmail.com",
  "min": 90, "rpe": null, "load": 0,
  "team": true, "type": "Practice", "start": "16:00", "attended": true
}
availability = { "2026-08-19": 1, "2026-08-23": 1 }     // 1..5, his own index
```

`type` on a logged row is the capitalised label a coach picked — `Practice`,
`Lift`, `Shootaround`, `Game`. On a FIXTURE it is lowercase — `practice`,
`lift`, `game`. Code that matches them must map between the two; `PastPractices`
has the canonical helper.

**medical[athleteId].injuries[0]** —
`{ by, id, pain, side, type, notes, status, bodyPart, progress[], onsetDate, rtpTarget, … }`
`status` is `available | limited | non-contact | out`, and it sets a FLOOR on
availability: a coach can make a day worse than the medical fact, never better.

**fixtures[i]** — `{ date, type, start, end, minutes, optional }`
plus, new tonight and optional: **`contactMin`** — contact minutes inside the
practice. Absent means no density is shown. It is never written by anything
except the week-planner editor.

**plans[`${date}|${start}`]** — `{ focus, plan, updatedAt }` — the session text.
This is where "what the room did" gets its words.

## Rules that are not negotiable

1. **RPE is never invented.** Every gym row this project writes carries
   `rpe: null, load: 0`. Attendance and duration are facts; intensity was never
   measured. 72 lift sessions are stored and not one has a fabricated RPE.
2. **Snapshot before any write**, to `audit-out/bhbc-state/`, and read back
   after. `scripts/bhbc-log-lift.mjs` and `audit-out/test-density.mjs` both do
   this; copy their pattern.
3. **Never derive a per-client amount from the roster sheet** (this is the
   revenue rule, and it still stands): the roster holds a rate and sessions
   since a payment, which is not what was paid.
4. **Revenue lives in two OWNER-ONLY tables** — `revenue_sheet_event` and
   `revenue_month_total`. `bit_payment_requests` is athlete-readable; nothing
   reconstructed goes in it. `scripts/verify-revenue-private.mjs` proves the
   isolation from five seats.

## Restore points written tonight

```
audit-out/bhbc-state/loads-before-lift-2026-09-06-1826.json     before Nathan Knight
audit-out/bhbc-state/loads-before-lift-2026-09-06-1827.json     before DJ Burns
audit-out/bhbc-state/fixtures-before-density-*.json             before the density trial
```

The density trial wrote one `contactMin` and then restored the whole key. A
direct query confirms: 33 fixtures, **0** with `contactMin`.
