# Lens 4 — the people on the other end

*Who is affected by this branch shipping, and how.*

## The physio at Bnei Herzliya

Signs in as `tomerlich11@gmail.com`, reads Hebrew, works on `/coach/bhbc` →
Medical, and now also Weight Room.

**Before this branch:** he could switch the zone to Hebrew with the `עב` button,
and his Medical tab still carried **147 Latin words** — the entire Return-to-Play
ladder, the pain gate, the referral line, the availability pill (Full / Limited /
Non-contact / Out), every readiness headline, the `Update ›` action on each row,
the count of past records, and the body part on each squad card.

**Now:** 45 Latin words, and every one of them is a name (Bnei Herzliya, athlete
names, countries) or shorthand a coach reads as English anyway (PPG, MD-).

**What he must NOT lose:** the ability to work with no backend. `verify-pt-no-backend.mjs`
proves the zone still holds up when the network is gone — his squad list, his
medical board and his last-known data survive. That gate must stay green.

**What he can now do that he could not:** see a month of the squad at a glance,
with a restriction and a weight-room session in the same cell.

## The athlete

Signs in at `/athlete`. About 20 of them.

**The change that matters:** on production, an athlete who picks Hebrew **still
sees English** — the portal renders outside the language provider, so the Hebrew
that was already written never reached it. On this branch it renders Hebrew.
That is the single largest athlete-visible difference in the branch.

Also on this branch: dates read `27 באוגוסט 2026` instead of `27th of August
2026` (the order never changes — day, month, year, both languages); the install
prompt, meal log, messages, PRs and history headings speak Hebrew; and the
mid-session words an athlete reads while training were translated.

**Nothing is asked of them that was not asked before.** No new field, no new
step. `src/readinessAutoreg.js`, which their portal shares with the club zone,
was not touched tonight — the club-zone translation happens at the render, not
in the shared file.

**What they must NOT lose:** the portal works offline. `verify-athlete-no-backend.mjs`
and `verify-athlete-journey.mjs` both pass. If either goes red, stop.

## The head coach and assistants

Same club zone, English by default. For them the visible change is the dashboard:
three cards instead of seven, the same facts said once, and a new tab.

Coaches see the zone in a restricted form (`asCoach`) — no Sessions tab, no
roster management, boards read-only. The Weight Room tab is visible to them;
it is a board, not a control.

## Prospects

`expo-il/` and the demo surfaces. Untouched tonight beyond what parity demands.
`verify-marketing-site.mjs` passes 54 route/width/language combinations.
`/demo/athlete` renders the real portal, so the Hebrew fix reaches the demo too.
