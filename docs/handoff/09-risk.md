# Lens 9 — risk: what can go wrong, and what must never happen

## Never, under any circumstances

1. **Do not push to `master` without asking.** `master` auto-deploys to
   `expo-app.co.il`, where real athletes and the club's physio live. The only
   no-ask push to master is reverting an un-approved deploy of my own.
2. **Do not write to trainee-visible tables in a trial.** A preview URL is a
   separate front end on the SAME database.
3. **Do not invent an RPE, a load, a payment, or a session.** Blank beats wrong.
4. **Do not touch the library data** (`expo-exercises`) in bulk. One "create in
   library" click once replaced 1,326 rows.
5. **Do not use "cure", "diagnose" or "fix"** in any string a client or staff
   member can read.
6. **Do not `git add -A`.**
7. **Do not reconstruct financial history into `bit_payment_requests`** — it is
   athlete-readable.

## The failure mode he penalises most

Claiming something is done when it is not. The pattern that earns it: build,
assert, and let him find it broken. The antidote is fixed:

> restate the ask → verify the real path from the real seat → check scope both
> ways → **look at the output** → name the gaps.

A green build is not a working feature. A gate that has never failed has proven
nothing.

## Fragile things in this branch

| Thing | Why it is fragile | What to do |
| --- | --- | --- |
| `src/BhbcView.jsx` | ~5,000 lines, three components share a closing `</Card>);}` shape | never patch by whole-file string replace; scope edits to a function's line range |
| `src/dates.js` | used by App, ClientPortal, BhbcView, Billing, Booking, Challenges, NotesWidget, PlansView, CoachDemo | a change here reaches every screen; the Hebrew month change was deliberately word-only |
| `src/readinessAutoreg.js` | SHARED with the athlete portal | translate at the club-zone render, never in this file |
| `themes.css` print block | one rule can silently add a page to every export | regenerate the PDF and LOOK before committing |
| The three local servers | die with the shell that started them | restart before quoting a URL as live |
| The debug Chrome | leftover pages slow everything and once corrupted a timing-sensitive analysis | `curl -s --noproxy '*' http://127.0.0.1:9222/json/list \| grep -c '"type": "page"'` |

## Things that look broken and are not

- `verify-prod-current` is red until a deploy. By design.
- "Nothing written" three times in *what the room did* — no session plans exist
  for those days yet. It is a prompt.
- `3×>` in the printed block — the `›` is real stored data in Block #16, not a
  render fault. He has been asked what it means and has not answered.
- The Weight Room grid looks sparse in early September. It fills as the month does.
- `verify-hebrew` reporting "0 files" means zero files **with violations**.

## If something goes wrong

```bash
git log --oneline -20                 # every commit message carries its own evidence
git diff HEAD~1                       # what the last one did
ls audit-out/bhbc-state/              # every store write has a snapshot beside it
```

Restoring a store key is a one-liner: read the snapshot JSON, `upsert` it back
under the same key, then **read it again** to confirm. `audit-out/test-density.mjs`
does exactly this at the end and prints the result.

## The largest open risk

Over 1,200 commits are undeployed. The longer that grows, the bigger the single
deploy becomes and the harder it is to attribute a regression. That is a product
decision, not a technical one, and it is his — but it should be said out loud
every time it comes up, not quietly carried.
