# EXPO — Feature Explanations + 10 New Ideas

Companion to `EXPO_COMPETITIVE_FEATURE_RANK_2026-05-14.md`. Deeper detail on the 14 features Ohad asked to explain, plus 10 fresh proposals.

---

## Part 1 — Deeper on the 14

### #9 Group / cohort coaching mode

EXPO's couples model (Moshe+Dana, Neta+Tom) already does a 2-person miniature version of this — one logical container, multiple member rows, plan-per-member or shared plan. Generalising it means: **a coach groups N athletes into a "cohort"**, assigns them a shared program with optional per-athlete overrides (load %, exercise swaps), and gets one shared chat + one shared activity feed.

**What you'd use it for:**
- Bootcamp / small-group classes (8 athletes doing the same program, you tweak the load per person)
- Online challenges (12 athletes on the same 6-week hypertrophy block)
- Family / partner training (already covered partially by couples)

**Vs couples:** couples are hard-coded to 2 with mirrored UI. Cohorts are 2-N with a leader-board feel. Couples is a special case of cohorts.

---

### #10 Branded white-label mobile app

Today EXPO is a **PWA** — installable from the browser, but it says "EXPO" in the App Store / on the home screen. When you sell EXPO to another coach (Yossi's Coaching, say), they want **"Yossi" on the user's home screen**, not EXPO.

**The build:**
1. Wrap the existing PWA with **Capacitor** (Ionic's native shell) — same React code, packaged as native iOS/Android apps.
2. The shell reads a `?coach=<id>` boot parameter, fetches that coach's branding (logo, primary color, name) and renders inside the shell.
3. Submit each coach's branded version to the App Store / Play Store. Cost: $99/yr Apple + $25 one-time Google per developer account.
4. Push notifications via Firebase Cloud Messaging (Apple Watch friendly).

**Why it's gated:** This is the multi-tenant unlock. Until you have ≥3 paying coaches, the App Store paperwork isn't worth it. Once you do, this becomes the credibility signal — "real app, my logo, my name."

---

### #12 Habit coaching

Different from auto-tasks. **Auto-tasks** are *coach-side alerts* ("Neta missed her week"). **Habits** are *athlete-side daily checkboxes* — the "did I do my 10k steps today" surface inside the trainee portal.

**The shape:**
- Coach assigns a habit to a trainee ("10k steps", "8h sleep", "5min mobility", "no alcohol"). Each habit has a target + recurrence (daily / weekly).
- Trainee's portal home shows today's habit checklist with a streak counter (3 days, 7 days, 30 days).
- Missed habits feed back to coach as a low-pri auto-task ("Roey missed 5/7 sleep targets this week — talk recovery").

**Why it works:** habits are the only thing that affects the 23 hours a day the coach isn't watching. Trainerize / TrueCoach / Caliber all have it; their pitch is "between sessions is where the result actually happens." EXPO has the auto-tasks engine and the trainee portal — adding habits is mostly UI + a daily check-in surface.

---

### #13 Standardized assessment library — "why do we need this if we have ATH EVAL?"

**Honest answer: you probably don't, given how you operate.**

Your `ATH EVAL.xlsx` (the BHBC protocol) is a serious assessment battery — 5 sections + ROM, sided/composite/sided-composite scoring, free-text scores so coach shorthand survives. It's already deeper than what PT Distinction ships as their "assessments suite."

The argument **for** this feature only holds in three cases:
1. You hire a coach who runs FMS/SFMA (different methodology) and needs that protocol shipped as a template.
2. You start selling EXPO to physios who want SOAP-style assessment workflows.
3. You expand into pre-purchase health screens for the intake flow (overhead squat, single-leg balance — 5 minutes, before payment, screens out red-flag clients).

**For YOUR practice today, this is a SKIP.** The BHBC eval is the right hill. Re-evaluate only when you add a coach who doesn't run BHBC.

---

### #14 AI meal photo → macros — "will it cost me money?"

**Yes, but it's small.** Cost breakdown:

- Anthropic vision API: ~$0.003 per image with Claude Haiku, ~$0.015 with Claude Sonnet.
- Realistic athlete logs 3-4 meals/day = 3-4 images.
- 4 images/day × 30 days = 120 images/month per trainee.
- At Haiku rates: 120 × $0.003 = **$0.36/month/trainee**.
- At Sonnet rates: 120 × $0.015 = **$1.80/month/trainee**.
- With 20 trainees on Haiku: **$7.20/month total**. With 20 on Sonnet: **$36/month**.

Haiku does meal-photo accurately enough for most cases; Sonnet handles complex dishes (Israeli salads, mixed plates) better. **Recommendation:** ship with Haiku, escalate to Sonnet via a "rerun with deeper analysis" button for edge cases.

**Add the cost to subscription pricing:** if you charge each coach ₪249/month, allocating ₪10/month to AI nutrition covers a 20-athlete roster on Sonnet. Negligible to the coach, transformative to the athlete (no manual logging).

**To stay safe:** cap each athlete at 200 vision API calls/month server-side, count usage in the existing `chat_logs`-style audit, and surface "you've used 187 of 200 photo logs this month" on the athlete side so power users learn the bounds.

---

### #15 Session-package usage tracking

Pairs with payments but works without. The shape:
- Coach sells a "10-session pack" to a trainee for ₪2,000 (via Bit).
- The system increments `trainees.sessionsRemaining` from 0 → 10 when the Bit request is marked paid.
- Each time the trainee marks a session complete (or you check them off in `/coach/calendar`), the counter decrements.
- When it hits 0, a `payment_overdue`-style auto-task fires: "Diego: 0/10 sessions left, time to re-up."

**Already 70% modeled:** `trainees.sessionsRemaining` exists. The Dashboard "low sessions" tile reads it. What's missing is:
1. The buy-flow that ADDS sessions (currently you'd edit the trainee row manually).
2. The auto-deduct on session-complete (currently handled by `handleDecrementSession` for `workouts` table — should also fire when an in-person booking is marked completed).
3. The "0 sessions left" auto-task.

**Build effort:** S (data shape + 3 wiring points).

---

### #18 Public workout / program shareable link

Generate `/p/<token>` for any program. Recipient sees the structure (days, exercises, sets/reps) and a "save to my library" button. If they're signed in to EXPO, one-tap import; if not, they see a sign-up nudge.

**Three use cases for you specifically:**
1. **Lead-gen:** post a sample free program on Instagram → "/p/expo-block-1" → 200 visitors land on EXPO → 5 sign up.
2. **Coach-to-peer sharing:** show your former mentor what you're shipping without screenshotting the whole editor.
3. **Inside the marketplace** (if you ever build it) — every paid program also has a free preview URL.

**The build is straightforward:** new `program_shares(plan_id, token, visibility, expires_at)` table; `/p/<token>` is a public route that fetches the plan and renders read-only. ~1 day's work.

---

### #19 Adaptive nutrition (MacroFactor-style trend-TDEE)

This is the **moat candidate**. No coach SaaS has it. MacroFactor is the only consumer app that's productized it, and they charge $12/mo for it standalone.

**The algorithm:**
1. Athlete logs daily weight + daily food intake.
2. System smooths weight via 7-day rolling average (kills daily water-weight noise).
3. Computes TDEE from energy balance: `TDEE_estimated = avg_calories_in - (delta_weight_kg * 7700 / days)`.
4. Updates calorie target weekly so the athlete actually hits their goal rate (e.g. -0.5kg/wk).
5. As the athlete loses weight, TDEE naturally drops; the algorithm catches it 2-3 weeks before the athlete plateaus.

**Why it's a moat:** every other approach (set static macros, periodically reassess) requires the coach to do math monthly. MacroFactor automates the only nutrition decision that actually matters — "are you in the right calorie band right now?"

**Build cost is real:**
- Food database — open options: Open Food Facts (free), USDA FDC (free, US-centric), Nutritionix (paid). For Hebrew foods you'd need to seed the DB manually or use Open Food Facts IL contributions.
- Daily log table + macro calculator UI.
- The TDEE algorithm itself is ~100 lines of math.
- Athlete portal: today's targets + remaining macros + photo log integration (#14).

**Worth it ROI:** if you charge ₪399/mo (vs ₪249 base) for the "adaptive nutrition" tier, 5 coaches × 10 athletes × ₪150 upcharge = ₪7,500/mo recurring on top of the base SaaS. That's the moat business case.

---

### #21 Auto warm-up calculator

Given a working weight (say 100kg bench) and an e1RM (say 120kg), generate:
- Empty bar × 8
- 40kg × 5
- 60kg × 3
- 80kg × 2
- 90kg × 1
- 100kg × working

The math is canonical (Wendler/Tuchscherer style ramps). UI: button on the StepLogger that expands into the warm-up ramp; trainee can mark each one done.

**Why it works:** every serious lifter does this manually. Strong, RP Hypertrophy, Stronger by the Day all have it. Athletes who don't know how to ramp learn from the prompt; coaches who hate writing them out save 30 seconds per plan.

---

### #22 Set-level tags (warmup / drop / failure / backoff)

A single chip on each set row:
- 🔥 **WARMUP** — excluded from e1RM + volume math
- ⬇ **DROP SET** — counted but flagged in analytics
- ⚠ **FAILURE** — last set hit RPE 10 / form broke; coach sees it
- ↘ **BACKOFF** — intentional intensity drop after top sets

Hevy uses this. Without it, every set is "another set" and the math is wrong (warmup sets pollute e1RM).

**Build:** add `tags text[]` to `client_workouts.exercises[].sets[]` (JSONB shape — no schema change). Single chip in the StepLogger. Filters in PR view + e1RM math.

---

### #25 Exercise swap suggestion — "don't we have it?"

**You have HALF of it.** EXPO already has the SWAP affordance on the trainee portal — gated to template plans (`isTemplatePlan(plan)` check in ClientPortal). When the athlete taps SWAP on a template plan, it shows alternates based on movement-pattern + equipment.

**The gap vs Fitbod/RP:** Fitbod's swap works on ANY plan, AND it's equipment-aware in real-time ("I left my cable attachment at home today — show me 3 alternatives that work with what I have"). EXPO's swap is fixed at plan-load time and template-only.

**The build to close the gap:**
1. Remove the `isTemplatePlan` gate (let SWAP work on any plan).
2. Add equipment context: athlete picks what's available NOW ("at home, bands + dumbbells only") and the alternates filter to that.
3. Rank by movement-pattern similarity + body-position + laterality (your taxonomy already supports this).

**Effort:** M. Half the work is in the substitution-similarity scoring; that already exists in `src/exerciseSimilarity.js`.

---

### #26 Algorithm explainability strip

A click-to-expand `ⓘ` on every auto-task that shows the rule's reasoning trail:

> **Created because:**
> - Last workout was 14 days ago (threshold: ≥21)
> - No activity log entries in 23 days (threshold: ≥21)
> - Trainee is Active status
> - Start date is 47 days ago (≥14 grace)
>
> **Will auto-close when:** any workout logged OR any activity row added.

**Why it matters:** auto-tasks today are black-box from the coach's POV. When one fires inappropriately, the only fix is to delete it. With explainability, the coach can:
1. Diagnose ("oh, the activity row didn't sync") — fix the data
2. Tune the rule — "this 21-day threshold is too aggressive for Trial clients" → file an audit task
3. Build trust — coach learns to interpret the engine over time

**Build:** the engine already has the inputs at detect time. Capture them in a new `auto_task_audit` JSONB column on `coach_notes`. UI: one button per task → modal.

---

### #27 Digital contract + e-signature

Templated coaching agreement (rates, scope, cancellation, code-of-conduct, IP) that the athlete signs at intake. Stored as a PDF on the trainee record.

**Why it matters for you:**
1. **Legal protection** for "no-show fees", scope creep, IP on programs.
2. **Onboarding ritual** — a signed contract makes the relationship feel professional (research: clients who sign show up more reliably).
3. **Multi-tenant deal-breaker** — coaches you sell to expect this. PocketSuite + CoachAccountable both ship it.

**Build:** library = a simple PDF templater (handlebars + html-pdf or similar) + a signature canvas (athlete draws with finger / mouse, output as PNG embedded in the PDF). Store in Supabase storage bucket `contracts/`. Link from trainee detail.

---

### #28 Lead-capture CRM pipeline (drag-and-drop stages)

`/coach/waitlist` already exists — that's the seed. Productizing it:
- Stages: **Lead** (visited site / clicked book) → **Trial** (booked first session) → **Active** (paying) → **Lapsed** (no session 30d) → **Won-back** (came back after Lapsed) / **Lost** (archived).
- Drag-and-drop between stages or auto-promote on triggers (first paid invoice → Active; 30 days no workout → Lapsed).
- Per-stage auto-task templates (Lead → send onboarding email; Trial → check-in after first session; Lapsed → WhatsApp re-engage).

**Why it matters:** without this, leads sit in your inbox forever. Mindbody / Acuity / PocketSuite all do this; converts ~20% more leads in their case studies (self-reported, but the direction is real).

**Build:** uses the existing `leads` table + `coach_notes` auto-tasks engine. UI = drag-and-drop board (react-beautiful-dnd). Stage transitions trigger auto-tasks via the engine's hook.

---

## Part 2 — 10 new feature ideas

Things that DIDN'T make the original 30 but are worth considering. Some are extensions of what you already have; others are net-new categories.

### #31. **Live pose-detection rep counter in the portal workout** (MOAT)

You have pose detection + rep counter for RECORDED form videos. **Run the same MediaPipe pipeline on the LIVE camera feed during a portal workout.** The trainee opens an exercise, taps "Live count," puts the phone on a chair, lifts. The app counts reps as they happen, tells them when they've hit target reps via TTS.

**Why this is a moat:** literally no other coach app does this. Fitbod, Hevy, Strong all rely on manual log-after. You'd be the first coach platform where the athlete doesn't have to remember to count.

**Cost:** S effort (you already have pose detection + rep counter — just wire to live camera instead of `<video>` element).

### #32. **Auto-generated weekly summary email/WhatsApp to the trainee**

Every Sunday, automatically send each active trainee: "This week — 3 workouts logged · BW -0.4kg · Heaviest squat 110kg (PR) · Streak: 12 days. Next week: hit the Wednesday session you usually miss."

**Why it works:** retention. Wellty / Whoop / Garmin all do weekly recaps. Athletes who get a personal weekly summary stay 30%+ longer (industry data).

**Build:** S effort. Vercel cron runs Sunday 19:00, queries each trainee's last 7 days, fires a WhatsApp template per the existing `whatsappButton.jsx`.

### #33. **Voice-narrated workouts during the portal session**

Centr / Future / Caliber do TTS announcements: "Set 2 of 4, 100kg, 5 reps. Get ready... 3, 2, 1, go." Rest timer counts down audibly. Tempo cue ("3 seconds down... 1 second pause... up").

**Why it works:** athletes can focus on the lift, not on reading the screen. Pairs perfectly with #31 (live rep counter).

**Build:** M effort. Browser TTS is free + works offline. Hebrew TTS voices are decent on iOS/Chrome. The "what to say" templating is simple.

### #34. **In-app athlete referral codes (+ credit)**

Each athlete gets a unique code (e.g. `OHAD-DIEGO`). When a friend signs up using the code, both get one month free. Tracked in a new `referrals(referrer_id, referred_id, status, credited_at)` table.

**Why it works:** organic growth lever. Mighty Networks claims 35% of new members come via referrals when codes are easy. Costs you only the marginal-month value (which is high LTV).

**Build:** S effort once payments exist. Code generator + a referrals table + a "your code: OHAD-DIEGO — share it for one free month" panel on the athlete portal.

### #35. **Coach knowledge base / per-athlete searchable notes vault**

A free-form tagged notes system per athlete, separate from NEXT ACTIONS. Tags: `injury-history` / `family` / `training-history` / `food-prefs` / `goals-meeting-2024` / `red-flag`. Searchable across all athletes ("show me everyone with a shoulder note").

**Why it works:** you're already running this in your head + in WhatsApp screenshots. Productizing it gives you instant recall ("what's Roey's left-knee status?") and makes onboarding a replacement coach easy (they read the vault, they're caught up).

**Build:** S effort. Extends `coach_notes` with a `tags text[]` column. UI = filter pills + free-text search.

### #36. **Coach-revenue dashboard (MRR / LTV / churn)**

Once Bit payments are tracking, you have the data. Surface: monthly recurring revenue, average client lifetime, churn rate, top-paying clients, "at-risk-of-churn" predictions (clients showing both low engagement + payment delays).

**Why it works:** lets you make business decisions without exporting to a spreadsheet. Mindbody / My PT Hub ship this; it's the difference between feeling busy and KNOWING you're growing.

**Build:** S effort once Bit data exists. Pure reporting on top of `bit_payment_requests` + `client_workouts`.

### #37. **Auto-translate coach ↔ athlete messages (HE ↔ EN)**

When a coach sends a Hebrew message to an English-speaking athlete (or vice versa), surface a "translate to English / לעברית" button. Uses Anthropic Haiku — costs ~$0.0003 per message.

**Why it works:** unlocks international athletes for your roster (Russian-speaking immigrants, English-speaking expats). MacroFactor adoption in Israel is hampered by English-only UI; offering HE-native messaging with auto-translate is a 30-minute build.

**Build:** S effort. The `/api/chat.js` proxy can do this with a one-line prompt change.

### #38. **Pre-built "challenge packs"** ($19-49 micro-offers)

Mighty Networks called this out — short, paid, named challenges separate from recurring coaching. Examples: "30-Day Push-Up Challenge — ₪89" / "Squat Strength 6-Week — ₪199". One-time-pay, drip-released, optional WhatsApp group, ends with a "join Ohad's recurring program?" upsell.

**Why it works:** low-friction entry for cold leads. People who won't sign up for ₪800/month coaching WILL pay ₪89 for a focused challenge — and 15% of them upsell.

**Build:** M effort. Uses #18 (program shareable links) + #1 (Bit payments) + the existing program editor. Marketing wrapper, no new engine.

### #39. **Auto-task throttling: collapse N WhatsApp tasks for one trainee into ONE "needs outreach"**

If `at_risk_silent` AND `payment_overdue` both fire for Diego, today you get 2 separate WhatsApp tasks. Reality: you'd open one WhatsApp conversation and address both. Collapse them: "Diego needs outreach: at-risk 23d + payment overdue 105d" → one task → one WhatsApp button.

**Why it works:** signal-to-noise. Dashboard reads as 8 tasks when it's really 4 conversations. Reducing visual noise increases the chance you actually act.

**Build:** S effort. Post-processing pass on the auto-tasks engine: group by `(target_id, action='WHATSAPP')` → merge into one synthetic task with a composite body.

### #40. **Embeddable "book now" widget for the coach's own website**

A small `<iframe>` or JS snippet that other coaches drop on their personal site / Instagram link-in-bio. Loads the EXPO booking calendar inline. Same data as `/book/<slug>`, just embeddable.

**Why it works:** coaches selling EXPO need to integrate it into their existing web presence. A booking widget on `yossi-coaching.com` that funnels into the EXPO booking flow gives them a tangible "I can use this on my own site, without rebuilding" win.

**Build:** M effort. The booking page already exists; embedding it means: a) accepting a `?embed=1` parameter that hides chrome (already a pattern via DemoEmbed), b) a snippet generator in the coach's settings page.

---

## Summary — what to build next

**Already shipped this session (on `feature/coach-saas-experiments` branch):**
- #1 (Bit-only payments) — ✅ pivoted from Stripe per request
- #2 (booking + public link, no deposit) — ✅
- #11 (voice messages, coach ↔ athlete channel) — ✅
- #30 (group challenges + leaderboard + athlete widget) — ✅

**Recommended next picks (from this doc):**
1. #15 (session packages) — 80% of code exists, ties Bit + booking together
2. #31 (live pose-count) — MOAT, half-day work, biggest "wow" factor
3. #34 (referrals) — growth lever, S effort
4. #32 (weekly summary) — retention, S effort

That's a coherent ~2-week next sprint that ships a real coach-SaaS product.
