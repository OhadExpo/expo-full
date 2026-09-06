# Lens 3 — Ohad, reading this himself

*What changed for you, in your language, with nothing hidden.*

## The short version

Your sheet was right and the app was wrong. The zone had been built around ACWR,
sRPE and readiness — a model that needs an RPE from every athlete after every
session, and a wellness check-in. You collect neither. Meanwhile the instrument
you actually keep — athletes down, days across, a code in every cell — was not
in the app at all.

So: it is now. And everything that was printing a dash every morning is gone
until it has something to say.

## What you will notice when you open it

| Screen | Before | Now |
| --- | --- | --- |
| Club zone tabs | Overview · Roster · Schedule · Medical · Sessions · Games | **Weight Room** added, between Schedule and Medical |
| Overview | 7 cards, ~2,150px | 3 cards, ~1,500px |
| The game | printed 3 times | once |
| Availability 8/2/0 | printed 3 times | once, with the names of the exceptions |
| The load board | ACWR "· baseline" ×10, 7d "—" ×10, an empty spark ×10, "no check-in" ×10 | those columns are gone until an RPE exists; **LAST LIFT** in their place |
| Team Snapshot | four dashes | appears only when there is load in it |
| A practice | 84 min | 84 min · 13 contact · **15.5% Low Intensity · Q1** — once you type the contact minutes |
| The printed block | a day per sheet, big gaps | two days a sheet, EXPO black masthead |

## What the Weight Room tab gives you

One board that answers both halves of what you asked for:

- **Who worked out when** — read across a row. Orange square is a logged lift.
- **Who needs to soon** — the strip at the top names them, longest gap first,
  and each row carries its own gap on the right.
- The tint in a cell is the restriction that day, so the board is your
  availability grid and your weight-room log at the same time. Your sheet cannot
  do that; it holds availability only.
- The AVAILABLE row under the dates is your "Total Available Players", counted
  rather than typed.
- **What the room did** lists each day, how many lifted and for how long, with
  the session text if it was written. Right now it says "nothing written" —
  that is a prompt, not a bug. The text has a home now.

## What it asks of you that it did not before

**One number a day: contact minutes.** Type it beside the practice minutes in
the week planner and the density, the band and the quadrant appear. Leave it and
nothing appears — no `#DIV/0!`, no invented percentage.

That is the whole ask. Nothing else changed about what you have to type.

## What I did NOT do, on purpose

- Did not put the month grid on the dashboard as well. It would have
  re-introduced exactly the duplication this pass removed. The board carries
  LAST LIFT instead. Say the word and it goes on.
- Did not touch your library data. "Continious" is still misspelled 10 times in
  it — your data, your call.
- Did not rename your Q4. Your legend says "Moderate Volume & High Intensity"
  while Q2 says "High Volume"; the app puts Q4 in the high/high cell because it
  is the only cell left. Tell me which you meant.
- Did not deploy anything.

## The one thing I owe you an answer on

Nothing from this branch is live. Over 1,200 commits, tonight's included, are
sitting on `bhbc-hebrew`. Your staff and your athletes are still on the old
build. That decision is yours and it has been open since 02 September.
