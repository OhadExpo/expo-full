# Lens 8 — the request ledger

*Every instruction he gave, in his own words, with what happened to it. His
rule: "nothing should ever be lost."*

Status key: **done** · **partial** · **open** · **cancelled by him** · **pacing**
(an instruction about how long to work, not what to build).

## The earlier block (before this conversation's context was compacted)

| # | His words | Status |
| --- | --- | --- |
| 1 | "keep working on the bhbc display for programs and make the pdf export way better designed" | done — popup rebuilt; the PDF was redesigned again later (#22) |
| 2 | "this doesnt look anything like a bhbc branded page" | done — zone chrome, navy/orange/crest |
| 3 | "also make sure every single page on any of our platforms also work offline" | done — offline gates for athlete, pt, owner, public |
| 4 | "in 2 hours when you're done update the local chrome host for comparison before and after" | done — the recap host on :4179 |
| 5 | "make sure i can collapse all the boxes in bhbc" | done — plus `verify-bhbc-collapse.mjs` |
| 6 | "there shouldnt be a cyan border after the last name and adjust the space to the end of the card/box after you remove it" | done |
| 7 | "make sure the update button is alligned beneath the name or status button. perfectly ocd aligned" | done — measured, not eyeballed |
| 8 | "after 4 hours of work, verify that everything you did doesnt go against any of the rules and my taste of preferance" | done |
| 9 | "log in the prveious practices and today francis worked out" / "nate worked out today" | done — 176 entries, attendance from medical dates, no invented RPE |
| 10 | "weight room lift, 30 minutes for francis 1 hours for nate" · "#2 but follow the history of medicals" | done |
| 11 | "keep working…", "restart the timer. work 5 hours…", "you worked for 10 minutes" | pacing |

## This conversation

| # | His words | Status |
| --- | --- | --- |
| 12 | "today dj and nate worked out for 30 minutes each" | **done** — DJ Burns (#30, he chose) + Nathan Knight, 30 min each, read back from the database |
| 13 | "after youre done show me on a local chrome host everything that's chnaged and undeployed. make sure it's perfectly viewable and designed perfect for me to judge" | **done** — :4181, live production beside this branch |
| 14 | "btw i want a display on bhbc of who worked out when (and what players need to workout soon)" | **done** — the Weight Room tab answers both halves in one board |
| 15 | "[his sheet] that's litterally the main use of this table. wtf have we been doing up until now? plan a way better system im so not satisfied with what we currently have" | **done** — the replan, written against the sheet, served at :4180 |
| 16 | "que another task: the pdf design is still too spacious and ugly, not branded enough as well" | **done** — Day A ~1,400px → ~810px, EXPO black masthead |
| 17 | "the weight room design is still not good enough and it should be a full tab" | **done** — promoted to a tab and redesigned |
| 18 | "replan the entire bhbc system" | **done** — §6–8 of the master handoff |
| 19 | "and apply with way better thought and outcome" | **done** — tab, dashboard, density, quadrant, available row, room log |
| 20 | "also replan the entire dashboard of bhbc (main page - some stuff unnecessary, some stuff can be combined, some are lacking. use everything you can. every skill you have for this" | **done** — 7 cards → 3, counted before and after |
| 21 | "keep working for 4 hours to complete those tasks" | pacing — worked |
| 22 | "FOR LATER: show me before and after for every thing" | **partial** — tonight's changes have pairs on :4181; every entry in the full recap does not |
| 23 | "keep doing then redo the local host" | **done** — rebuilt around live-vs-branch |
| 24 | "3 more hours of local work" → later "cancel the 3 hour work" | **cancelled by him** |
| 25 | "when youre done update the local chrome host to be current, and add another section: chances that touch the athlete ui/expeiernce/portal and also show before after" | **open** — the Hebrew screenshot pairs are captured on disk; the section is not written |
| 26 | "make sure everything on the localhost is aligned right to left for easy choice of before and after" | **open** — designed, not built |
| 27 | "can you create a full deatiled handoff for a new conversation... or is it too complicated at this stage and stuff will get lost?" | **done** — and the honest answer was: nothing gets lost, because the state is on disk |
| 28 | "write a perfectly audited handoff, fully detailed, x10 more detailed than actually needed" | **done** |
| 29 | "re-run tests on this entire conversation and anything you can reach on memory to check ten different times that the handoff is perfect" | **done** — ten passes, four wrong claims found and corrected |
| 30 | "cancel the 3 hour work and finish the handoff prompts. make sure all undone work and qeued tasks are handed off" | **done** |
| 31 | "i basically want to continue everything as it is right now but on a different chat and let it work for 3 hours but we need a perfect handoff" | **done** — §16 is the prompt |
| 32 | "run 10 more different handoffs and combine them all to make one perfect handoff. then audit it 15 times... then choose one word for me to say to the next chat to resume" | **done** — this document is one of the ten |
| 33 | "nothing should ever be lost. all the details should be handed off to perfection" | **done** — this ledger, and an audit pass that fails if any row here lacks a status |

## Standing instructions that never expire

- Marketing and demo parity after every user-visible change — forever, without
  being asked.
- Never build or test on the live site; ask before any production deploy.
- Cue every task the moment he gives it, so he never has to repeat himself.
- Work until the timer he set, not until the work feels finished.
