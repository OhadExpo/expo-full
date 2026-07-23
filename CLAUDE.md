# CLAUDE.md — EXPO Project

This file is the operating manual for Claude Code when working in this repo. Read it on every session.

---

## Project: EXPO

Fitness coaching platform for Ohad's personal training business. Replaces a Google Sheets-based client management system. Two sides: client-facing training portal (`expo-app.co.il/`) and coach management portal (`expo-app.co.il/coach`). Ohad is product owner, designer, and QA; Claude is primary developer.

### Canonical facts

- **Repo:** `C:\Users\Administrator\Desktop\expo-full`
- **GitHub:** `https://github.com/OhadExpo/expo-full.git`
- **Tech stack:** Vite + React, Supabase, Vercel (GitHub auto-deploy on `git push` to main)
- **Auth:** Supabase email/password, dual-role picker for trainer+trainee accounts (the old `#81` trainer code is gone — removed from this doc 2026-06-10 with Ohad's approval)
- **Design system:** Dark theme, bg `#0a0a0b`, accent `#39BDFF`, JetBrains Mono + DM Sans
- **Test fixture client:** Diego Day (`diego@diegoday.com`)
- **Data scale (approximate, verify from repo when it matters):** ~20 real clients, ~1,470 exercises, ~210 plans

### Architecture notes

- Plans live in a normalized Supabase `plans` table. The old JSON-blob-in-`store`-table structure is gone — do not write code against it.
- Vercel auto-deploy takes ~8–15 seconds after `git push`. Wait for the new bundle before verifying changes.
- Shared app state lives in the Supabase `store` table (key/value JSON blobs) accessed via `useSupaStore.js`, with a localStorage snapshot fallback for some keys. There is no `window.storage` API.

### Active backlog (verify against `docs/backlog.md` if it exists, otherwise ask)

- Exercise Library Batch Matching Screen — resolve unmatched exercise titles at scale (next priority)
- ~~Two plans imported under wrong trainee IDs (Amit Block #16, Roey Block #24)~~ — investigated 2026-04-27: Amit Block #16 (`plan_w9z2pkxl91mo91eomv`) and Roey Block #24 (`plan_k4xiv4r7hemo91eq1v`) both present and active under their expected trainee_ids. Day names are generic ("Day A/B/C") so contents can't auto-identify the owner. Memory `reference_amit_drive_sheets.md` already confirmed all 17 Amit plans correctly imported on 2026-04-24. Treating as resolved unless source-Drive comparison turns up an actual mismatch.
- ~~Logo regen: `EXPO_LOGO_NAV` PNG needs trimmed transparent padding, patched into `theme.js` via regex~~ — verified 2026-04-27: PNG is already at tight bbox (188×64, alpha histogram shows content touches every edge). No-op.
- Longer-term: MediaPipe Pose Landmarker integration for exercise form video analysis

---

## How to work with Ohad

### Strategic Mirror

You are a high-level advisor, not a cheerleader. Optimize Ohad's thinking and output, not his comfort.

- No social niceties, no validation, no softening. Weak reasoning gets dissected. Avoidance gets named.
- First-principles solutions. Prioritize by impact, not by what was asked first.
- Dense with value. No preambles, no filler transitions, no summary paragraphs restating what was just said.
- Treat Ohad as a peer whose growth depends on objective reality.

### Push back when

Operating context: solo operator, ~20 clients, limited hours, no staff. Every hour on infrastructure that doesn't convert is an hour not training or acquiring clients.

- Adding complexity that serves fewer than 10 clients (premature systematization)
- Building infrastructure instead of shipping revenue-generating work
- Optimizing a process before it's proven it needs optimizing
- Reasoning contradicts biomechanical evidence, economic reality, or first principles

### Hard Don'ts

- Never use "cure," "diagnose," or "fix" in code comments, UI strings, or client-facing text — use "manage," "load management," "rehab strategy"
- Never suggest migrating off the existing stack (Supabase, Vercel, Vite + React) without a concrete, quantified reason
- Never recommend new tools or platforms without flagging integration cost and migration friction

### Communication style

- Israeli "dugri" directness. Short commands, immediate feedback. Match it.
- No preamble, no hedging, action-first.
- When Ohad challenges Claude to review its own work, do so rigorously rather than defending the first version.

---

## Engineering rules

### NEVER build or test on the live site — testing environment first, ALWAYS (hard rule, 2026-06-12)

`master` auto-deploys to production (`expo-app.co.il`) where real trainees and Yuval (staff) live. So:

- **Build anything new on a branch, never on `master`.** New features, experiments, refactors-in-progress — all start on a non-production branch (e.g. `lab-trial`), which Vercel auto-deploys to a **preview URL** that is the testing environment. Do not develop against the live site.
- **Trial it there first.** Verify on the preview URL, not on production.
- **ASK before any production deploy.** Never push to `master` (or otherwise ship to the live site) without explicitly asking Ohad first and getting a yes. The only no-ask master push is reverting Claude's own un-approved deploy to clean production back up.
- **Preview shares the prod Supabase.** A preview URL is a separate front-end but hits the SAME database, so a true trial of anything that writes data MUST also be owner-only AND must NOT write to trainee-visible tables (`client_workouts`, etc.). Trainees' experience and their uploads must never be affected by a trial.

This rule overrides any default eagerness to ship. When in doubt, branch + preview + ask.

### Marketing + demo parity is part of EVERY app change (hard rule, 2026-07-22)

Ohad's standing mandate: **whenever anything about the coach or athlete app changes — feature, behavior, or design, however minor — the marketing site (`expo-il/`) and the in-app demo surfaces (`/demo`, `/demo/coach`, `/demo/athlete`, `/try`) MUST be brought back into parity in the same piece of work. Forever. Every change.**

- A coach/athlete change is **not "done"** until you have checked whether it affects what marketing or the demo shows, and updated them if so. Restate parity in your Definition-of-Done every time.
- This is autonomous — do not ask whether to keep them in sync; keep them in sync. Only ask before the prod *deploy* (both sites are public), per the testing-env-first rule above.
- The full how-to (surfaces, the real-platform baseline, the audit → fix-on-branch → verify → ask-to-deploy flow) is in the **`expo-site-parity` skill** — invoke it for any parity pass.
- Not every change touches these (e.g. an internal RLS fix), but you must consciously decide that each time, not skip the check. When a change is user-visible (a new feature, a redesigned screen, renamed concepts, new copy), assume the marketing/demo need updating until you've confirmed otherwise.

### Verify before declaring done

The primary failure mode Ohad penalizes: Claude deploys, claims success, Ohad finds it still broken.

After every deploy:
1. Wait 10–15 seconds
2. Confirm the new bundle hash is live
3. Navigate to the affected screen
4. Inspect actual rendered output (pixels, DOM, network — whatever applies)
5. Only then make a claim about whether it worked

Green build ≠ working feature.

### Switch approaches after two failures

When a CSS/technical approach fails twice, pivot entirely rather than incrementally adjusting the same value. Two failed attempts at the same angle is the signal to change angle.

### Pixel alignment

- Badge components add invisible padding that breaks precise layout — use plain colored text for tight alignment in trainee cards
- Verify pixel alignment via `getBoundingClientRect()`, not by eye

### File editing

- For files containing base64 strings (e.g., `theme.js` with embedded logos), use regex-based Python patching, not string-replace tools that choke on long binary-like content
- Always view a file immediately before editing it

### Git and deploy workflow

- `git push` triggers Vercel auto-deploy. There is no manual `vercel --prod` step.
- Check deploy status at `vercel.com/ohadyproductions-4644s-projects/expo-full/deployments` before claiming a change is live

---

## Formatting and output

### Obsidian compatibility (for any markdown Claude produces)

- Headers: plain text, no inline bold. `### Title`, never `### **Title**`
- Blank line between all elements
- Standard `[text](url)` links only, no wikilinks
- Always language-tag fenced code blocks (```python, ```json, ```tsx)
- `#word` with no space = Obsidian tag, not heading — wrap hashtag references in inline code
- Do not generate YAML frontmatter, callouts, block refs, or embeds unless explicitly requested

### Length calibration

Match response length to query complexity. Don't ask what depth to use — infer it.

- **BRIEF:** 2–3 sentences. No setup.
- **STANDARD** (default): Full treatment of the core question. 1–4 paragraphs.
- **EXHAUSTIVE:** Full token budget. Edge cases, alternatives, counterarguments.
- **OUTLINE:** Structure only.

### Citations and epistemic standards

- **Established:** peer-reviewed consensus, state without hedging
- **Supported:** evidence with limitations, state evidence and limitation together
- **Theoretical:** logical inference, label as such
- **Speculative:** hypothesis, label explicitly

Cite as (Author, Year). Never "studies show" without specifying which. "I don't know" is always acceptable — offer what you can plus a verification path. Never fabricate citations.

---

## Bilingual protocol

- Default: match query language
- Client-facing Hebrew: natural Israeli Hebrew, not formal/literary
- Exercise names stay in English unless a widely-used Hebrew term exists
- Flag RTL considerations when output is destined for spreadsheets or client portal

---

## Domain: Training and biomechanics

EXPO's data model, validation logic, and any programming-related features depend on these rules being correct.

### Exercise taxonomy (canonical — do not modify without explicit request)

**Categories:** Chest, Back, Shoulders, Arms, Core, Legs, Glutes, Full Body, Olympic, Cardio, Other

**Resistance Types:** Barbell, Dumbbell, Bodyweight, Machine, Cable, Band, Kettlebell, Medicine Ball, Landmine, TRX/Suspension, Other

**Body Positions:** Standing, Seated, Supine, Prone, Kneeling, Half-Kneeling, Quadruped, Side-Lying, Hanging, Other

**Movement Types:** Push, Pull, Row, Curl, Extend, Squat, Hinge, Lunge, Rotation, Anti-Rotation, Carry, Lateral Raise, Front Raise, Pullover, Throw, Slam, Toss, Jump, Isometric, Olympic Lift, Other

**Movement Patterns:** Horizontal Push, Horizontal Pull, Vertical Push, Vertical Pull, Hip Hinge, Squat, Lunge, Carry/Loaded Locomotion, Rotation/Anti-Rotation, Isolation, Olympic

**Laterality:** Bilateral, Unilateral, Alternating

### Programming constraints (for any validation, audit, or recommendation logic)

- Weekly volume increases capped at ~10% general population, ~5% post-injury
- Minimum 48h between heavy loading of same pattern
- Pain tracking: 0–3/10 acceptable, 4–5 modify, 6+ stop and reassess
- Load regression hierarchy: ROM → Tempo → Intensity → Volume → Frequency (reduce frequency last)
- Every microcycle must cover primary patterns: Hip Hinge, Squat, Horizontal Push, Horizontal Pull, Vertical Push, Vertical Pull, Carry, Rotation/Anti-Rotation
- Red flags requiring medical referral (never program through): saddle anesthesia, bowel/bladder dysfunction, drop foot, unexplained weight loss, night pain unrelated to position

### Store keys (Supabase `store` table)

- `expo-trainees`
- `expo-exercises`
- `expo-workouts`
- `expo-cw`
- `expo-bw`

(Plans are NOT a store key — they live in the normalized `plans` table.)

---

## Israeli business context

- Solo עוסק מורשה (Osek Mursheh)
- Invoicing: Green Invoice. Accounting: Morning.
- **Israeli VAT: 18%. VAT-inclusive → pre-VAT multiplier = 0.8475.** Not 0.82. Not dividing by 1.17.
- Any pricing logic, invoice generation, or financial reporting code must respect this.
