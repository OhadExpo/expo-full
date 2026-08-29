# BHBC — inventive tools worth building

Ranked by (value to the people who actually read this zone) ÷ (build cost).
The filter throughout: BHBC has one S&C coach, two PTs, a head coach and a
basketball staff who never open a laptop. A tool earns its place only if it
changes what someone *says* or *does* at practice.

---

## Tier 1 — build these

### 1. The pre-practice card (the artefact the zone exists to produce)

One screen, generated, that Ohad shows the head coach 10 minutes before
practice. Not a report — a card:

```
TODAY · 16:00 · S&C 20 min · focus: landing mechanics
FULL (11)      limited (2)  Amit ankle, no jumping · Roy back, no contact
OUT (1)        Guy — RTP 8 Sep
WATCH          Noam: 7-day load +38% vs his 28-day. Cap his jumps today.
```

Everything on it already exists in the database. Nothing on it is typed twice.
It is copyable as plain text so it can be pasted into the staff WhatsApp — that
is how this staff actually communicates, and a link they must log into will not
be opened.

**Why it is first:** it is the only output of the zone that leaves the zone.

### 2. Return-to-play as a gate, not a date

Today an injury has a status and a note. Make RTP a **sequence of criteria**
the PT ticks — pain-free full ROM → bodyweight loading symmetrical → 80% limb
symmetry on a hop test → contact drills → full practice — where each stage
unlocks the next and the roster row shows *which stage the athlete is in*, not
just "limited".

The coach stops asking "is he ready?" and starts reading the answer. The PT
stops re-explaining. And when a player is pushed back into contact early, the
record shows who moved the gate and when.

### 3. Load × medical cross-check (the one alert worth having)

The two halves of the zone never talk. Cross them:

> Amit returned from an ankle injury 6 days ago and his 7-day load is already
> 82% of his pre-injury average. The guideline is ~50% at one week.

That is one query over data already stored, and it is the single most likely
thing to prevent a re-injury. Keep it to **one** alert type — a board of twelve
warnings gets ignored by week two.

### 4. Recurrence detection

Same body part, same athlete, third time in a season → surface it as a pattern
with the loads that preceded each episode. A solo staff cannot hold six months
of injury history in their head. The database can.

---

## Tier 2 — strong, slightly bigger

### 5. Availability forecast

Project the squad forward 14 days from current RTP stages: "next Thursday's
game — 12 available, Roy questionable, Guy out." The head coach's actual
question is never "who is hurt today", it is "who do I have on Thursday".

### 6. The 20-second session log

The S&C period ends and Ohad is holding a ball, not a laptop. One screen:
minutes (pre-filled from the plan), a single RPE dial, and a roster grid where
everyone is present by default and you *tap the absentees*. Three taps, done.
Anything longer does not get logged, and an unlogged session makes every ACWR
number on the board a lie.

### 7. Jump-load counting from the phone camera

The pose pipeline is already built and already counts reps. Point it at the
court for the S&C period and count **landings** — the load that actually
drives patellar and ankle problems and that RPE cannot see. A jump count per
athlete per session is the missing axis in every ACWR figure in this zone.

Bounded scope: count landings, nothing else. No form scoring on a wide court
shot; the pose is not reliable at that distance.

### 8. Asymmetry from the phone, monthly

The goniometer/ROM tool exists. Standardise it into a **two-minute monthly
screen** — single-leg hop distance, ankle dorsiflexion, hip IR — stored as a
trend per athlete. Asymmetry above ~10% is the most predictive cheap signal
there is, and right now nobody at BHBC measures it at all.

---

## Tier 3 — genuinely novel, worth a prototype

### 9. "What changed this week" — the diff view

Not a dashboard. A short list: who moved between availability states, whose
load band changed, which RTP gates advanced, what was added to the calendar.
The whole point of a management zone is to answer *what is different since I
last looked*, and every screen currently answers *what is true right now*.

### 10. The session that plans itself from constraints

Given today's medical board and this week's microcycle position, propose the
S&C period: which patterns to hit, who needs a substitution, what to drop if
it runs short. Ohad edits and approves — it is a first draft, never a decision.
Value is not the plan, it is that the constraints are applied automatically
instead of remembered.

### 11. Voice note in, structured record out

The PT finishes with an athlete and speaks 15 seconds into the phone. It lands
as a rehab note attached to the right athlete and the right injury, with the
transcript kept verbatim underneath. Typing is why medical records go stale;
the audio already works elsewhere in the app.

---

## Deliberately not building

- **Wearables / HR straps.** BHBC does not have them, and a tool that needs
  hardware nobody owns is a tool nobody uses.
- **A second alert system.** The zone already over-notifies.
- **Anything the basketball staff must log in to see.** They will not.
