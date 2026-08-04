# Demo → Real parity fix plan (#19, `src/CoachDemo.jsx`)

Produced 2026-08-04 by an 8-agent audit workflow (one agent per demo surface diffing demo vs the real component). **53 items: 15 high · 24 med · 14 low.** Demo athlete portal (`DemoTraineePortal.jsx`) returned **zero** divergences — already in parity. Line numbers are approximate — verify before editing (earlier edits shift them).

> All edits target `src/CoachDemo.jsx` unless noted. Dropped 1 mock-data-only item (programs orphan card).

## Dashboard
**HIGH**
1. StatCard KPI tiles (L198-219) — refined tile: cyan strip header (bg `C.ac`) + 6px status dot + white label 13px/0.08em/700; value below in neutral `C.tx` weight 800; `boxShadow: C.cardShadow`; pass status color as dot color at call sites (stop coloring the number).
2. Alert section (grid L344-438 + Panel L491-504) — horizontal flex rail (gap 12, overflowX auto, cursor grab); each card `var(--c-sf)` + 3px colored LEFT border + cyan strip header + icon. Order: Online Now → Expiring Packages → Overdue Payment → Dormant → New Leads. Copy: `EXPIRING SESSIONS`→`Expiring Packages`; mixed case `{d}d ago` / `Never trained` / `Never paid` / `{d}d overdue`.
3. Roster table (L443-482) — wrap in standard card + cyan strip `All Athletes — {n}` + `▾`.

**MED** 4. Roster th 9px/0.18em + `↑` on Athlete col + center tds + Total Paid → `₪{monthly}/MO`. 5. Incoming·30D → collapsible strip, 4 centered borderless metric columns, right note `VISITS in Vercel Analytics`. 6. Revenue header `▾`. 7. Total Collected·All Time card. 8. Tasks section → NotesWidget-compact. 9. Messages card.

## Athletes
**HIGH**
10. Roster toolbar (L546-572) → real two-column `SideRail` (Search/Status/Format/Needs Attention/Sort + `+ Add Athlete ▾`), card grid in flex:1 right col. Mirror `TraineesView.jsx` L630-704.
11. TraineeCard identity (L756-785) → Card header+headerRight: name in header (uppercase 0.04em 14px 700 + online dot); body = WA+phone+email only in 80px slot (no name repeat).

**MED** 12. Status → CardStatusMenu pill in headerRight. 13. CardSection subtitle `C.tm`→`C.acText`. 14. Bottom PORTAL/EDIT action row. 15. Detail Billing CONTRACT + `+ ADD PAYMENT`.
**LOW** 16. programs count `C.ac`→`C.tx`. 17. border `C.cardBd`→`C.divider`. 18. DemoDetailCard collapsible strip.

## Programs
**HIGH**
19. Filter rows (L1757-1814) → two-column `SideRail` (width 204: Search + Athlete + Sort + `+ New Program`), list flex:1. Mirror `PlansView.jsx` L3068-3115.
20. Top header: `Programs` (FN 13/0.18em) + Table/Grid toggle (progView state).
**MED** 21. Grid view mode. 22. FLAGS group (Unassigned/Empty). **LOW** 23. remove count-line meta.

## Exercises  ← executing first (most contained)
**HIGH** 24. Filters cyan strip `Filters · N active` + `CLEAR ALL` box button. 25. Search border `1px C.ac` h42 + solid `+ Add Exercise` button; remove count chip.
**MED** 26. Selects appearance:none h36 pad 0/32/0/12 center + absolute `▾`. 27. hasVideo → white play-triangle SVG. 28. edit/delete icon buttons. **LOW** 29. zebra even-first + `C.bd`→`C.cardBd`. 30. right attr = primaryMuscles only. 31. count 12→11 `C.td`→`C.tm`. 32. EmptyState card.

## Tasks
**HIGH** 33. Rebuild two-column: left rail (204, sf2) Search + cyan `FILTERS` + RailGroups Whose/Show/Sort/Group (RailOpt rows). 34. Owner selector → Whose RailGroup.
**MED** 35. Quick filters → Show RailGroup + `All`. 36. Sort + Group groups; LIST default status-grouped. 37. List/Board segmented mixed-case. 38. Add-task composer 46px. 39. Section headers (dot + label + count + `▾`). 40. Source labels: `MANUAL`→`General`, auto teal→grey, athlete orange→purple. 41. Remove GCal strip.
**LOW** 42. Page title row. 43. Board col header padding.

## Review
**HIGH** 44. Athlete group header → solid strip (name + (n) pending + `· planName` cyan + week boxes + `Athlete page →`). 45. Workout detail header → strip `WORKOUT` + title/subline + `{done}/{total} SETS DONE`. 46. Day-card → bordered `REVIEW →` + `DELETE`. 47. Detail CTA → `✓ MARK REVIEWED — BACK`.
**MED** 48. Day-card content (dayName 15px, planName cyan line2, `/{planWeeks}`). 49. Eyebrow + description.
**LOW** 50. Back `← BACK` FN. 51. exercise row border 0.25px. 52. hotkey legend. 53. weekly-focus SAVED pill.

---
Resume the audit workflow: `Workflow({scriptPath: ".../workflows/scripts/demo-exact-match-audit-wf_fbfe4cb1-e37.js", resumeFromRunId: "wf_fbfe4cb1-e37"})`.
