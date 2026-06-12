# Generative brand demo videos — feasibility (2026-06-12)

Round-4 #9. Untried before today. Tested with Grok Imagine (xAI) — the conclusion is **viable, with a mandatory human-review gate.**

## What was tested

1. **Still** — `grok-imagine-image-pro`, prompt for a barbell back squat at the
   bottom position, side profile, 9:16. Result: near-photoreal, anatomically
   correct, correct depth (hip crease below knee), plausible bar + plates,
   clean dark-charcoal studio that fits the EXPO palette.
2. **Motion** — `grok-imagine-video`, image-to-video seeded from that still,
   6s, 720p, "stand up to the top then descend, one controlled rep, fixed
   side camera." Result: a believable single rep. Bottom→standing→bottom reads
   biomechanically correct; the studio and camera stay still.

## Verdict

- **Stills: production-grade.** Good enough to attach to a library entry as a
  branded thumbnail/reference today.
- **Motion: usable, not guaranteed.** The rep is convincing but not perfect —
  the hand grip on the bar wobbles between frames and a faint chalk-puff
  artifact appears on the wall. Form is *plausible* but the model does not
  guarantee technically-correct movement.
- Therefore this **cannot auto-publish** — it would violate the standing rule
  `blank > wrong` (a wrong-form demo is worse than no demo). Every generated
  clip must be coach-reviewed before it represents an exercise.

## The real build (needs Ohad's action: an xAI API key)

The Grok tools used here are dev-time MCP tools, not available to the deployed
app. To ship this in-app:

1. **`/api/generate-demo`** (Vercel serverless) — takes `{ exerciseTitle,
   cues, aspectRatio }`, calls the xAI image API (still) then the xAI
   image-to-video API (animate), returns the clip URL. Needs `XAI_API_KEY` in
   Vercel env (prod + dev) — same pattern as the existing Anthropic key.
2. **Coach review gate** — generated clips land in a "pending demos" tray on
   the exercise; the coach watches, then Approve (writes the clip to the
   exercise `videoLink` / rehosts to Supabase `form-videos`) or Reject +
   regenerate. Never written to a client-facing field without approval.
3. **Prompt template** — seed from the exercise title + the EXPO cue text +
   a fixed brand-studio style string (dark charcoal, side profile, fixed
   camera) for consistency across the library.

## Status

Feasibility PROVEN. In-app build is gated on the `XAI_API_KEY` (Ohad to
provision, like the Morning clearing key). Proof artifacts were generated and
inspected locally; not committed (binary media + `blank > wrong` — no
unreviewed AI clips enter the repo or the library).
