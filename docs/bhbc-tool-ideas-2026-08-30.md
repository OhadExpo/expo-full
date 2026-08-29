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

---

# Round 2 — approved and rejected (Ohad, 2026-08-30)

**Approved to build:** #3 load x medical cross-check, and G (game minutes from
the box score into the load model).

**Rejected:** everything else in tiers 1-3 above, and the whole second list
(readiness sweep, data-integrity score, drift ranker, minutes-delivered,
contact load, pain map, explain-this-number) — "1/10 ideas, worse than
previous". The lesson: he does not want dashboards, rankers or data-quality
meters. He wants tools that MEASURE SOMETHING NOBODY CAN CURRENTLY MEASURE.

## Round 3 — the swings (pose pipeline is the asset)

1. **Shot-form decay under fatigue.** 10 shots at the start of practice, 10 at
   the end. The analyzer already scores every checkpoint on every rep, so it
   can name which element collapses first FOR THIS PLAYER.
2. **Landing asymmetry from ordinary practice video.** Ten minutes of court
   footage; pose finds every landing and reports which leg absorbs more.
   Post-injury athletes offload for months without knowing — the mechanism
   behind re-injury.
3. **Movement-signature drift.** Track each athlete's own movement fingerprint
   weekly; flag drift. Pain lags; mechanics lead it by weeks.
4. **Free-throw tempo as a CNS readout.** Dip-to-release timing is already
   measured and is remarkably stable per shooter. 10 free throws = a 90-second
   readiness check that feels like basketball, not testing.
5. **The rehab form gate.** Athlete films one set; pose checks the specific
   criterion (knee valgus on a step-down, hip drop on a single-leg squat) and
   advances him or routes it to the PT. How one PT covers fourteen athletes.
6. **Shooting under load.** Shoot, loaded set, shoot again — quantify how
   strength work acutely changes shooting mechanics.
7. **Fixture-density-driven microcycle.** Generate the week's S&C dose from the
   real fixture list, not a template.
8. **One camera pass over the warm-up = squad-wide movement screen.**

## Round 4 — the pattern in what he approves

Approved so far: #3 (load x medical), G (game minutes from the box score),
#7 (fixture-density microcycle). All three either MAKE A PROGRAMMING DECISION
or PULL IN REAL BASKETBALL DATA. Every measurement gadget and every dashboard
has been rejected. Build along that axis.

1. **Projection simulator.** Add two jump sessions Tuesday, see Sunday's ACWR
   board BEFORE committing. Every load system reports after the fact; none let
   you plan against the number you will have.
2. **Per-athlete prescription inside the one window.** 14 athletes share a
   20-minute S&C period and four cannot do what the ten are doing. Generate
   each athlete's variation from the medical board + load state + position.
3. **Minutes projection drives the week's dose.** With G: 30 projected minutes
   Thursday is a different Tuesday from 8.
4. **Opponent style to physical demand.** High-transition opponent = eccentric/
   deceleration emphasis. From league pace data.
5. **The season from the fixture list, once.** Accumulation / intensification /
   taper positioned against real game density. #7 is the week; this is the year.
6. **Last session seeds the next.** Logged loads propose the progression by
   rule, so he edits a draft instead of authoring from scratch.
7. **Availability as a practice consequence.** "Three bigs out - your rebounding
   block needs four bodies you don't have." The version the head coach acts on.

## Round 5 — approved: #5 (season from the fixture list). The five that beat everything prior

1. **Game film to the external-load ledger.** BHBC already films games. Run the
   pose/tracking pipeline over that footage for jumps, sprints, decelerations
   and court coverage per player - the exact data a GPS vest programme sells at
   ~$200/player/season. With G (minutes) it is a complete external load model
   with no hardware. The pose stack pointed at its highest-value target.
2. **An injury-risk model trained on BHBC's own history.** After a season,
   learn which combinations preceded THIS squad's injuries instead of applying
   a population ACWR threshold. Improves monthly; defensible to a head coach.
3. **Voice as the entire input layer.** He is on court holding a ball - that is
   WHY data does not get logged. "Amit 18 minutes, RPE 7, ankle felt fine"
   parsed into session + load + medical. Every other tool is downstream of it.
4. **Shot chart x mechanics.** Cross shooting outcomes by zone with the
   analyzer's measured mechanics: "corner three at 24%, release angle 6 degrees
   flatter from that corner". Links S&C to WINNING, which is how the S&C window
   gets protected.
5. **The player-facing pre-practice line.** Three lines to each athlete: where
   he stands, what he is cleared for, one focus. Coach-facing tools inform;
   player-facing tools change behaviour.
