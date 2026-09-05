# Rules and taste audit — the night of 2026-09-04 → 05

Ohad: *"verify that everything you did doesnt go against any of the rules and my
taste of preferance."*

Every line below is a check I actually ran, not a recollection. Where something
is unverified it says so.

---

## Hard rules

### Never build or test on the live site. Never push to master without asking

Nothing was deployed and nothing was pushed. `git log origin/master..HEAD`
is the whole night's work sitting on `bhbc-hebrew`, and production is still on
`dc80f2d` — which is exactly why the program popup you looked at on
expo-app.co.il was the old one.

Everything was measured against `127.0.0.1:4173` (the built app) and
`127.0.0.1:5199` (dev). The only thing pointed at production all night was a
READ: `BASE=https://expo-app.co.il node scripts/verify-athlete-offline.mjs`,
which navigates and reads and never writes.

### Nothing may interrupt the athlete on EXPO or the physios on BHBC

This was the night's subject rather than a constraint on it. Every change to
those two seats made them work in a state where they previously did not:

- the athlete's programme survives a dead network instead of reading "BLOCK 0"
- their identity survives it instead of "COULDN'T VERIFY ACCOUNT"
- all six portal tabs now say why they are thin, not just Program
- the physio's club zone says its data came from cache
- sign-out no longer leaves the squad and their medical status on a shared phone

No trainee-visible table was written to. Every gate is read-only; the only write
any of them performs is a sign-out on the test fixture's own seat.

### A reversible restore point before any deploy or major change

Nothing shipped, so nothing needed rolling back — but the branch is the restore
point either way: 106 commits, each one a single subject with its measurements
in the message. `verify-prod-current` is the one red gate on the board and it is
red for exactly this reason: prod serves an older build.

### Never invent data. Blank beats wrong

Three places tonight where this decided the design:

- The coach dashboard renders `0` and `₪0` offline because that is what an empty
  store computes. I did NOT change those to dashes on my own initiative — it
  touches every number on the screen and you may prefer the cached figure. It is
  in the recap as your call.
- Block #16 prints `›×›` on four lifts because the stored sets and reps are
  literally `›`. The export prints what the plan holds. What `›` MEANS is yours
  to say; I did not invent a rule for it.
- The write-in grid adds empty boxes, never a value.

### Never use "cure", "diagnose", "fix" in medical/client-facing text

Checked mechanically over every line I added to `src/` tonight:
`git diff … | grep -inE "\b(cure|diagnose|diagnosis)\b"` → nothing.

### Never `git add -A`

Every commit staged explicit paths. No bulk staging all night.

---

## Taste

### The club is navy and orange; EXPO is cyan

You said the program popup "doesnt look anything like a bhbc branded page". The
card hairline was `color-mix(20% navy, var(--c-bd))`, and the app's border token
is cyan-tinted, so EXPO's cyan was showing through every card edge in the club.
It is a navy hairline now, and every zone modal opens with the crest on navy
under an orange rule.

Verified the change cannot leak: `TOKENS` is applied at the club zone root and
inside its modals, nowhere else. The EXPO app's cyan card border is untouched,
and the brand cyan (#39BDFF) was not deepened anywhere.

### Measure the ink, not the box

The alignment you asked for is measured, not eyeballed: with the injury row
restacked, `UPDATE ›` starts at x=103 — under the athlete's NAME — where it used
to sit at x=48, under the jersey number. The name sits 27px in (an 18px
right-aligned number plus a 9px gap) and the action is indented to match.

### Every sweep also at mobile

The club zone's collapse was checked at 390 as well as 1500 (32 boxes, all
collapse, none reopen). The athlete's offline notice was checked at 390. The
offline sweep of all 27 coach routes ran at 1500; the seat gates cover 390.

### Spoken Israeli Hebrew, masculine singular

Four new strings, all through the voice gate (1,710 shipped strings scanned,
clean). I caught one drift in my own work on the re-read: the coach strip said
`ייתכן ש` while the two written the same night say `יכול להיות ש` — matched, so
three notices in one product do not drift between formal and spoken.

Verified in place, RTL: the club zone in Hebrew puts `אופליין` and its orange
rule on the RIGHT, with the sentence flowing correctly.

**Unverified:** I could not get the ATHLETE portal into Hebrew from the harness
(it boots English and rewrites the language key at mount), so the athlete strip
was only seen in English. The Hebrew string exists and passes the gate; it has
not been seen on screen.

### A gate that has never failed has proven nothing

Every gate written tonight was made to fail on purpose before being trusted:

- `verify-bhbc-collapse` → 15 problems with the wrapper rendering children
  unconditionally
- `verify-shared-device` → both new cache keys by name, against the old purge
- `verify-athlete-no-backend` → 279 chars, 15% of online, on the previous build
- `verify-offline-everywhere` → BLANK on all three routes of its first run
- `verify-pt-no-backend` → "nothing tells the physio"

And three gates were caught being WRONG, which matters more:

- the first no-backend gate called the programme "visible" because `/program/`
  matched a TAB LABEL on an empty screen
- the PT gate reported "the squad is gone offline" when its own click had landed
  before the zone rendered
- the collapse gate called four perfectly collapsed cards broken because it
  measured `innerText`, which a hidden body still returns

### Verify, don't assert

Every claim in tonight's commit messages carries the number it came from. The
one place I could not reproduce something — an athlete-journey run that reported
"1 problem" and never did again — is written into the commit as unreproduced
rather than dropped.

---

## Standing mandate: marketing + demo parity

Checked, and the conclusion is "nothing to change" with the reasoning rather
than an assurance:

- the OFFLINE notices are failure-state UI a demo cannot show
- the club zone is private; `expo-il` mentions Bnei Herzliya only as your
  credential in the bio, never as a feature
- the PDF export is not advertised on the marketing site at all

Worth knowing from the walk: `/try` renders the REAL portal in demo mode now,
not the old hand-coded mock the parity notes still describe.

---

## What I did NOT do, on purpose

- did not cache the coach roster or the exercise library for offline use — they
  are excluded deliberately (full-roster PII that RLS denies), and caching them
  would put that data on the device. Yours to decide.
- did not turn the dashboard's offline zeros into dashes — wide change, your
  taste call.
- did not deploy.
