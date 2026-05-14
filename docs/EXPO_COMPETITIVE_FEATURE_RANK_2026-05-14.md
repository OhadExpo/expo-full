# EXPO — Competitive Feature Audit + Ranked Backlog (2026-05-14)

## Methodology

Researched 30+ apps across 4 segments via 4 parallel research agents:
1. **Mainstream coach platforms** — TrueCoach, Trainerize, Everfit, TrainHeroic, My PT Hub, PT Distinction, Stronger by the Day
2. **Tracker apps with coach features** — Hevy, Strong, Fitbod, JEFIT, Caliber, Fitness AI, Volt Athletics
3. **AI / nutrition / scheduling** — Future, MacroFactor, JuggernautAI, RP Hypertrophy, Whoop, Acuity, PocketSuite, CoachAccountable, Centr, Mindbody
4. **Israeli + community + content** — Boxr, Trainin, Welltyapp, TeamBuildr, CoachCare, Coaches Console, Strava, Mighty Networks, Stridekick, Garmin Coach

~120 distinct features cataloged; deduped to 30 ranked candidates + an explicit "won't build" list.

**Rank inputs:** Impact (H/M/L for EXPO specifically), Effort (S/M/L), Strategic fit (Ohad's solo-premium positioning + multi-tenant roadmap + Israeli market + biomechanics niche).

**Hard constraints honored:**
- No auto-load adjustment / +2.5kg / wave projection features → `[[no-weight-progression-features]]`
- No exercise-library tooling → `[[exercise-library-off-limits]]`
- Coach value-add is programming, not algorithmic prescription

---

## TIER 1 — BUILD NEXT (1–8)

Highest ROI per build week. Each either unlocks SaaS economics or closes a visible gap every competitor already shipped.

### 1. In-app payments (Stripe + Israeli rails)
**Source:** TrueCoach, Trainerize, Acuity, PocketSuite, Mindbody, My PT Hub
**What:** Stripe recurring + one-off + Tranzila/Bit/PayBox/Cardcom for IL clients; auto invoice/receipt via Green Invoice (VAT 18%); session-package auto-decrement; failed-payment dunning.
**Why for EXPO:** Ohad currently can't charge through the app — `BILLING` was a hardcoded constant we just deleted. Biggest blocker to multi-coach launch.
**Effort:** L · **Impact:** H

### 2. Self-serve booking page + calendar sync
**Source:** Acuity, PocketSuite, My PT Hub, Trainin, Coaches Console
**What:** Public `/<coach>/book` URL; 2-way Google/Apple Calendar sync; availability rules (buffer, lead-time, max-per-day); Zoom auto-link; deposit + cancellation policy.
**Why for EXPO:** Acuity reports 75% no-show reduction from auto-reminders alone. Removes phone-tag for Ohad's in-person athletes.
**Effort:** M · **Impact:** H

### 3. AI program generator (prompt → mesocycle)
**Source:** PT Distinction ("20 sec"), Trainerize, Everfit, My PT Hub Check-Ins AI, Centr FitQuiz
**What:** Coach types "hypertrophy 4-day, female 28, glute focus, no barbell" → Opus 4.7 + tool-use loop emits an EXPO-shape plan (compact `eid`/`s`/`r` keys, library lookups, supersets) ready to assign or tweak.
**Why for EXPO:** Smart Import already runs this exact loop for XLSX/PDF/image. Reusing it for "generate from prompt" is mostly UI work. Coach apps without it look 2024.
**Effort:** M · **Impact:** H

### 4. Apple Health / Apple Watch sync
**Source:** Strong, Fitbod, Hevy, JEFIT, MacroFactor, Future, Garmin, Whoop, My PT Hub, BOXR
**What:** Two-way HealthKit — write workouts to Health, read BW + steps + sleep + HRV; Apple Watch sidecar for in-gym logging (offline → sync).
**Why for EXPO:** ~70% iOS share in IL. Manual BW logging is friction; auto-sync removes it. Sleep+HRV data feeds readiness (#20).
**Effort:** M (Health App Export ingestion) → L (native Watch shell)
**Impact:** H

### 5. RPE as first-class set field
**Source:** Stronger by the Day, JuggernautAI, RP Hypertrophy, Strong, Caliber, Volt
**What:** 0–10 RPE field next to reps + load on every set row; chart "RPE creep" per exercise (same load, climbing RPE = overreaching signal).
**Why for EXPO:** Tempo + wave loads already on the row. RPE is the missing third coordinate. Display-only — no auto-adjustment (memory rule).
**Effort:** S · **Impact:** H

### 6. e1RM auto-calc + per-exercise trend chart
**Source:** Hevy, Strong, JEFIT, Stronger by the Day
**What:** Epley/Brzycki formula on every working set; line chart per exercise, lives next to BWChart on the trainee card.
**Why for EXPO:** ~10-line addition. Every tracker app has it; EXPO doesn't. Visible polish that signals "we know the language."
**Effort:** S · **Impact:** H

### 7. Streaks + kudos + roster-scoped activity feed
**Source:** Strava (the moat), Hevy, JEFIT, Stridekick, Wellty
**What:** Consecutive-day workout streak in athlete portal header; one-tap 👏 on a completed workout (visible to coach + couple partner); opt-in feed scoped to the COACH's roster (not global public).
**Why for EXPO:** Strava's documented 12-month retention lift from group workouts. Couples already see each other; generalize to a private roster feed. Solves "athletes train alone, feel isolated."
**Effort:** S (streak) + M (feed + privacy model) · **Impact:** H

### 8. Custom client metrics (any tracked variable)
**Source:** CoachAccountable, Strong, JEFIT
**What:** Coach defines a metric (waist cm / sleep h / pain 0–10 / mood / energy); athlete logs daily or weekly; sparkline alongside BW; alert thresholds.
**Why for EXPO:** `bw_logs` is the shape — one new table (`custom_logs(client_id, metric_key, value, date)`) plus the UI. Currently coaches paste this into NEXT ACTIONS notes.
**Effort:** S · **Impact:** H

---

## TIER 2 — HIGH-VALUE (9–20)

### 9. Group / cohort coaching mode
**Source:** TrainHeroic, Trainerize, Caliber Pro, CoachAccountable, Centr
**What:** One program → N athletes; bulk-assign with per-athlete overrides; shared group chat; cohort start/end dates.
**Why:** Couples are this in miniature — generalize. Unblocks paid challenges (#30) + group classes.
**Effort:** M · **Impact:** H

### 10. Branded white-label mobile app (PWA → native shell)
**Source:** Trainerize, My PT Hub, PT Distinction, CoachCare, Mindbody, Mighty Pro
**What:** Capacitor wrapper around the existing PWA, submitted to App Store / Play Store under the coach's brand.
**Why:** When multi-tenant ships, subscribed coaches want their name on the home screen. PWA gets you 90% there; native shell is the final 10%.
**Effort:** L · **Impact:** H (gated on multi-tenant launch)

### 11. Voice messages in coach chat
**Source:** Trainerize, Everfit
**What:** 30s in-app voice note (record + waveform + play). Already happens on WhatsApp but external; bring it in-app.
**Why:** Trainers' favorite channel for cue/tone. 4-line addition once the chat surface exists.
**Effort:** S · **Impact:** M

### 12. Habit coaching (binary daily check-ins + streaks)
**Source:** TrueCoach, Trainerize, Everfit, My PT Hub, PT Distinction, Caliber
**What:** Coach assigns N habits ("10k steps", "8h sleep", "5min mobility", "no alcohol"); athlete checks daily; streaks + missed-habit alerts → auto-task.
**Why:** The "what to do between sessions" surface every coach app has. Pairs with auto-tasks engine for the alert side.
**Effort:** M · **Impact:** H

### 13. Standardized assessment library (movement screens, FMS, SFMA, postural)
**Source:** PT Distinction (Assessments Suite), Volt readiness surveys
**What:** Pickable assessment templates beyond the BHBC eval already in EXPO — FMS, SFMA, posture, ROM. Same `trainee_evaluations` model.
**Why:** Coach value-add in the physio-adjacent niche. Differentiator vs general fitness apps.
**Effort:** M · **Impact:** M

### 14. AI meal photo → macros
**Source:** Everfit MacroSnap, MacroFactor, Trainerize
**What:** Athlete snaps meal photo → Opus 4.7 vision returns approximate macros + portion sizes + dish name + confidence.
**Why:** Vision is already in stack (Smart Import). Same pipeline, different prompt + food DB lookup.
**Effort:** M · **Impact:** M

### 15. Session-package usage tracking + Stripe-package buy flow
**Source:** Acuity, PocketSuite
**What:** "Diego: 4/10 PT sessions left." Decrements on session-complete (already partially modeled via `sessionsRemaining`). Tied to Stripe package SKUs.
**Why:** Data already exists; needs surface UI + Stripe wiring (#1 dependency).
**Effort:** S · **Impact:** M

### 16. WHOOP + Garmin recovery integration
**Source:** TrueCoach, Whoop, Garmin
**What:** Pull HRV / recovery / sleep from WHOOP API or Garmin Connect; show a Recovery pill on the trainee card; flag "low recovery → reduce volume" auto-task.
**Why:** Premium clients already wear these. Surfacing the data inside EXPO closes the coach's manual lookup loop.
**Effort:** M per provider · **Impact:** M

### 17. SMS / scheduled message campaigns
**Source:** PT Distinction, Mindbody, My PT Hub, Trainin
**What:** Pre-schedule a WhatsApp or SMS for a date or trigger ("Day 3 after intake → send onboarding 2/3 video"). Lifecycle drip on top of existing auto-tasks.
**Why:** Auto-tasks engine already detects state. Extension is "when state matches, also send message."
**Effort:** M · **Impact:** M

### 18. Public workout / program shareable link
**Source:** Hevy, Strong, Trainerize, TrainHeroic marketplace (sale)
**What:** Generate `/p/<token>` for any program; recipient previews the structure; signed-in EXPO users one-tap "save to my library."
**Why:** Built-in lead-gen for marketplace. Also lets Ohad share programs with peer coaches without screenshotting.
**Effort:** M · **Impact:** M

### 19. Adaptive nutrition (MacroFactor-style trend-TDEE)
**Source:** MacroFactor (only — moat candidate)
**What:** Athlete logs weight + intake → algorithm converges TDEE in 2–3 weeks → auto-adjusts calorie target weekly, no coach involvement.
**Why for EXPO:** NOBODY in the coach SaaS space has this. Would be EXPO's clearest nutrition differentiator. Builds on existing bw_logs + a new food intake table.
**Effort:** L (algorithm + food DB are non-trivial) · **Impact:** H (if nutrition becomes part of the pitch)

### 20. Multi-metric recovery dashboard
**Source:** TeamBuildr AMS, Whoop, Garmin, CoachCare
**What:** Per-trainee panel — sleep, HRV, soreness, perceived stress — 7-day trend; readiness flag feeds into next-session prescription suggestions.
**Why:** Aggregates outputs of #4 + #16 + manual ratings. The "how am I doing" answer in one card.
**Effort:** M · **Impact:** M

---

## TIER 3 — NICE-TO-HAVE (21–30)

### 21. Auto warm-up calculator
**Source:** Strong, RP Hypertrophy
**What:** Given working weight + e1RM, generate 3–5 warm-up sets (e.g. 40/55/70/85% × reducing reps).
**Effort:** S · **Impact:** M

### 22. Set-level tags (warmup / drop / failure / backoff)
**Source:** Hevy, JEFIT
**What:** Single chip on each set row for semantic context; filters charts ("show working sets only").
**Effort:** S · **Impact:** M

### 23. Body-part tape measurements alongside BW
**Source:** Strong, JEFIT
**What:** chest / arms / waist / thigh / neck — same shape as BW, multi-axis sparkline on trainee card.
**Effort:** S · **Impact:** M (subset of #8)

### 24. CSV / raw data export
**Source:** Strong, Volt, every B2B-ready competitor
**What:** One button per trainee: "Export all workouts + BW + payments as CSV." Same for the coach's whole roster.
**Effort:** S · **Impact:** M (table stakes for B2B)

### 25. Exercise swap suggestion when equipment missing
**Source:** Fitbod, RP Hypertrophy, Fitness AI
**What:** Athlete taps "I don't have a cable today" → 3 substitutes ranked by movement-pattern + muscle-group similarity. Taxonomy already supports it.
**Effort:** M · **Impact:** M

### 26. Algorithm explainability strip on auto-tasks
**Source:** Fitness AI (3D BodyScan transparency)
**What:** Click ⓘ on any auto-task → "Created because: last workout 7d ago + plan expects 2×/week + monthly billing not received."
**Effort:** S · **Impact:** M (trust-builder for the auto-tasks engine)

### 27. Digital contract + e-signature at intake
**Source:** PocketSuite, CoachAccountable
**What:** Coaching agreement template (rates, cancellation, code-of-conduct) signed at onboarding; stored on the trainee record.
**Effort:** M · **Impact:** M

### 28. Lead-capture CRM pipeline (drag-and-drop stages)
**Source:** Mindbody, Acuity, PocketSuite
**What:** `/coach/waitlist` already exists; productize into stages — Lead → Trial → Active → Lapsed — with auto-task triggers per stage transition.
**Effort:** M · **Impact:** M

### 29. Strength balance / symmetry score
**Source:** Caliber
**What:** Per-trainee metric showing push:pull or upper:lower volume ratio over time. Movement-pattern taxonomy already supports it.
**Effort:** S · **Impact:** M

### 30. Group challenges (creator-invited, multi-goal)
**Source:** Strava, Stridekick, Mighty Networks
**What:** "30-day squat challenge", "team mileage", "longest plank" — leaderboard + progress feed, scoped to roster.
**Effort:** M · **Impact:** M

---

## WON'T BUILD — strategic skips

| Feature | Source | Why skip |
| --- | --- | --- |
| Auto load adjustment / +2.5kg / wave projection | Hevy Trainer, JuggernautAI, Fitness AI, RP Hypertrophy | Memory `[[no-weight-progression-features]]` — programming is the coach's value-add. |
| Exercise library tooling, classification, matching | Fitbod, Volt, RP | Memory `[[exercise-library-off-limits]]` — owned by a separate Claude in a different folder. |
| Marketplace selling pre-built programs | TrainHeroic | Distracts from solo-premium positioning. Different motion + lead-gen funnel. |
| Tablet whole-team gym mode | Volt | Outside scope (1:1 + couples, not 50-athlete college teams). |
| Sport-specific position-aware programs (football QB vs RB, etc.) | Volt, TeamBuildr | Same — strength/rehab/general fitness niche. |
| HIPAA medical billing (RPM/RTM codes) | CoachCare | US healthcare reimbursement isn't EXPO's lane. |
| In-app live video calls (Zoom-style native) | Trainerize, Mighty Networks | WhatsApp video works; high build cost, low ROI. |
| HSA/FSA payment rails | Everfit, Centr | US-only feature. |
| Public Strava-style feed (open to anyone) | Strava | Privacy collision with coach-client relationship — roster-scoped (#7) is the right scale. |
| Auto-detect injury / red-flag medical referral | CoachCare, Stronger by the Day | Already handled by CLAUDE.md hard-don'ts; medical referral is human-only. |

---

## What this list implies

**Two strategic threads emerge:**

1. **Become a real coach SaaS** (Tier 1 #1, #2, #10, #15, plus Tier 2 #28). Payments + booking + branded shell + lead pipeline. Without these, EXPO is a tool Ohad uses, not a product other coaches buy.

2. **Lean into the differentiator stack** — AI program gen (#3), MacroFactor-style adaptive nutrition (#19), assessment library (#13), RPE/e1RM/streaks (#5, #6, #7). These are where EXPO already has 70-80% of the infrastructure and competitors don't have the full set.

The Tier 1 list is built so you could ship them sequentially over ~3 months and end up with a multi-tenant-ready product. Tier 2 are the moat-builders for differentiation once that's done. Tier 3 is polish — single-day items that close visible gaps vs trackers.

---

## Per-app research artifacts

The raw 4-agent research outputs are at:
`C:\Users\ADMINI~1\AppData\Local\Temp\claude\C--Users-Administrator-Desktop-expo-full\323b9346-24ab-49ad-bb43-17fde3f0c7af\tasks\*.output`

Sources cited inline above; full source list available on request.
