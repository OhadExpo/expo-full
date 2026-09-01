# Mobile design audit — 2026-09-01, true device emulation

Six agents, one per surface group, each on a REAL emulated iPhone (isMobile,
touch, DPR 2, iPhone UA) rather than a narrow desktop viewport. 71 raw findings
merged to 17 by root cause.

**Why this had to be redone:** every mobile pass before this used
`setViewport` alone, which leaves the desktop UA, DPR 1 and `isMobile:false`.
Hover styles apply, mobile-only CSS may not, text metrics differ. That is how
the gates kept reporting clean while Ohad's actual phone was a mess.

Status: item 1 is FIXED and verified (load board, wrapper released — scrollWidth
305 = clientWidth 305, all ten MED buttons on screen). The rest are open.

---

# Mobile fix list — one ranked queue, merged by root cause\n\nSix surfaces, 78 raw findings → **17 items**. Every item below was checked against `src/`; where I could not confirm the mechanism in code I say so. All measurements are the auditors', re-attributed to the line that produces them.\n\nContext that changes the priority order: **all six surfaces report `pageScrollsSideways: false`**. The `overflow-x: clip` guard on `.app-root` / `html,body` is holding. So nothing overflows the page — every failure here is content **silently hidden inside a contained scroller**, which is worse for discovery and better for perceived polish. Rank accordingly: reachability first, legibility second, pixels last.\n\n---\n\n## 1. The row a coach OPERATES is behind a 660px inline scroller — regression of an already-shipped fix\n\n**Root cause.** `src/BhbcView.jsx:2315` — `<div style={{ minWidth: 660 }}>` wraps the LOAD & INJURY RISK board. `src/themes.css:614–640` already restacks `.bhbc-load-row` into two lines at phone width (`grid-template-areas: \"jersey name acwr\" \"avail avail med\"`), with a long comment explaining exactly this bug. **That work is dead**: the restacked row is inside a wrapper with a hard 660px floor and no class, so no media query can reach it.\n\n**Change.** Give the wrapper a class (`bhbc-load-wrap`) and add `.bhbc-load-wrap { min-width: 0 !important; }` to the existing `@media (max-width: 620px)` block in `themes.css`. Same one-line pattern already used for `.bhbc-cal-wrap`.\n\n**Proof.** scrollWidth 660 vs clientWidth 305, 46.2% of the board visible; the ten `MED ✎` / `+ MED` buttons measure `left 638.2 → right 700.2` — 248px past the 390px edge. After the fix `.bhbc-load-row` should report `grid-template-areas` applied and every MED button `left < 390`.\n\n---\n\n## 2. Coach nav and BHBC nav never show the tab you are on\n\n**Root cause.** Both headers are deliberate horizontal scrollers with a sticky identity block — `src/App.jsx:1483–1489` and `src/BhbcView.jsx:762–768`. The comments record that wrapping was tried twice and rejected by Ohad (\"one row, logo pinned\"). **So the design is not the bug.** The bug is that neither nav scrolls the active tab into view on mount or on tab change, and there is no scroll affordance (`::-webkit-scrollbar{display:none}` on both).\n\n**Change.** Two small effects, no layout change:\n- `BhbcView.jsx` — ref on the active `<button role=\"tab\">`, `useEffect(() => el?.scrollIntoView({inline:'center', block:'nearest'}), [view])`.\n- `App.jsx` — same on the active nav item, keyed on `tab`.\n- Add a fade mask on the scroller's trailing edge so the hidden tail is visible (`mask-image: linear-gradient(to right, #000 88%, transparent)`), since the scrollbar is hidden by design.\n\n**Proof.** BHBC: nav scrollWidth 1109 vs 390; on the ROSTER tab, ROSTER measures `left 364.6` and MEDICAL `left 556.4` — on the MEDICAL tab the current tab is 166px off-screen. Coach: nav scrollWidth 876, 7 of 9 destinations past x=390. After: the active tab's `getBoundingClientRect().left` is inside `[0, innerWidth]` on every tab.\n\n*Do not implement the auditors' proposed fixes here (bottom tab bar, 3×2 grid, overflow menu) — `App.jsx:1449–1481` and `BhbcView.jsx:756–761` document those being tried and rejected.*\n\n---\n\n## 3. `overflow-wrap: anywhere/break-word` used as the load-bearing overflow strategy — words break mid-syllable on 5 surfaces\n\n**Root cause.** One habit, five places. A fixed or starved column plus `overflowWrap:'anywhere'` means the browser's last-resort mid-word break becomes the normal rendering path.\n\n| Where | Line | Symptom |\n|---|---|---|\n| RTP protocol grid (×2: soft-tissue + concussion) | `BhbcView.jsx:3663` and `:3700` — `'30px minmax(0,150px) minmax(0,1fr)'` + `overflowWrap:'anywhere'` | description column 75.8px → `PROGRESSI/VELY`, `ISOMETRIC/S`, `RESTRICTI/ONS`; 933px of grid for six one-line sentences |\n| Coach dashboard TASKS history title | `DashboardView.jsx` — `overflow-wrap:anywhere` + `flex:1 1 0%` | title cell 44.3px → `SKIPPE/D W2 OF/BLOCK/#16`, rows 200px and 230px tall |\n| `/coach/programs` athlete name | `PlansView.jsx` header strip | `FREDERI/C/BOURDILL/ON` — the card's identity, split mid-word |\n| PAST PRACTICES type column | `BhbcView.jsx` past-practices grid | `PRACTI/CE · 120/MIN` on 8 of 8 rows (74px column, \"Practice\" is 87.4px) |\n| ROSTER HEALTH athlete name | `BhbcView.jsx:3628` — `overflowWrap:'break-word'` inside a 100.2px cap | `ZACK/BRYANT`, `NOAH/CARTER` on 5 of 10 rows |\n\n**Change.** Blanket rule: a text column gets `minmax(0, 1fr)` (never a fixed px) and `overflow-wrap: break-word` **only** as a safety net, never with `anywhere`. Concretely — RTP: collapse to one column below 600px (number + stage on line 1, description full-bleed at 303.8px); programs name: `white-space:nowrap; text-overflow:ellipsis`; tasks history: drop `flex:1 1 0` from the title and stack the row.\n\n**Proof.** Per row, `Range.getClientRects().length` should equal the line count you designed for, and no rect boundary should fall inside a word. RTP grid height 933px → ~300px.\n\n---\n\n## 4. Fixed heights that don't fit their content\n\n**Root cause.** Card heights pinned to an observed desktop worst case, correct on a 3-up grid, wrong on a 1-up phone column.\n\n- `TraineesView.jsx:222` — `const CARD_H = 412`, applied at `:852` and `:950`. Plus a hard `height: 88` contact block at `:960` that is reserved even when there is no phone/email.\n- BHBC roster card, 146px fixed — on #30 DJ Burns the content bottom is 1619.8 against a card bottom of 1618.6: **content renders 1.2px below its own border**, all 13px of bottom padding eaten.\n\n**Change.** `height: CARD_H` → `minHeight: CARD_H` at ≥900px, `height:auto` below 700px; render the contact block conditionally instead of reserving 88px. Same for the BHBC roster card.\n\n**Proof.** 6–7 athlete cards measure 152–165px of ink in a 412px box (fill 0.37–0.40) with an unbroken 118px white band. Fixing it removes ~2.5 screens from a 10,785px list — measure `document.body.scrollHeight` before/after.\n\n---\n\n## 5. `+ Log` renders with browser-default chrome\n\n**Root cause.** `src/BhbcView.jsx:3637`. The button carries `className=\"bhbc-ghost-btn\"` — but that class only defines `:hover` (`BhbcView.jsx:733`). Every other one of its 15 siblings supplies the full look inline (`background:'transparent'`, `border: 1px solid ${C.cardBd}`, `color: C.tm`). This one doesn't, so it falls through to UA styling.\n\n**Change.** Copy the inline style from `:3641` (the `View ›` / `+ Report` button one line below it) and give both a shared `minWidth: 84`.\n\n**Proof.** Confirmed in source, no browser needed: measured `1.6px solid black` border and `rgb(240,240,240)` background — neither value exists anywhere in the BHBC palette. Repeats on all 10 ROSTER HEALTH rows.\n\n---\n\n## 6. Month calendar cells sized by content, not by track\n\n**Root cause.** `src/BhbcView.jsx:2974` — `gridTemplateColumns: 'repeat(7, 1fr)'`. `1fr` is `minmax(auto, 1fr)`, so a day holding an event chip expands past its track. The `.bhbc-cal-wrap { min-width: 0 !important }` override in `themes.css` is already winning over the inline `minWidth: 620` — the remaining 409px of scroll is entirely the tracks.\n\n**Change.** `repeat(7, minmax(0, 1fr))` on **both** the header row (`:2970`) and the week rows (`:2974`), plus `min-width:0; overflow:hidden` on the event chip.\n\n**Proof.** Header cells are a uniform 43.6px; body cells run 22.5px (empty) to 115.1px (with event). After: all 7 body tracks equal 43.6px, header-to-cell centre offset ≤ 0.8px on every row, wrapper scrollWidth == clientWidth.\n\n---\n\n## 7. Two peer actions, two different widths — everywhere\n\n**Root cause.** No shared-width primitive. `Btn` and the ad-hoc buttons all size to their own label, so any adjacent or stacked pair of the same material differs.\n\n| Pair | Spread | Where |\n|---|---|---|\n| PORTAL / EDIT | **38.3px** (100.6 vs 62.3), 153.9px dead gap between them | `TraineesView.jsx:979–980`, ×25 cards |\n| Availability pills Out/Limited/Available | **46.0px** (61.1 / 86.3 / 107.1), ragged left edge down the column | `BhbcView.jsx` ACTIVE INJURIES |\n| Dashboard STATUS pills ACTIVE/INACTIVE | 13.6px, left edges alternate 185.7 / 178.9 | `DashboardView.jsx` |\n| MANAGE ROSTER / + LOG PRACTICE | 3.7px, on **every** BHBC tab and coach page | `BhbcView.jsx:869–870` |\n| GROUP / SINGLE segmented | 2.5px — the divider jumps on every switch | SESSIONS tab |\n| THIS WEEK / ▥ COLUMNS (stacked) | 20.5px | `BhbcView.jsx:2752`, `:2759` |\n| ✎ / ✕ icon pairs | 1.8px, ×8 planner + ×5 modal rows | `BhbcView.jsx:1305–1306`, `:2801–2802` |\n| COPY vs EDIT strip chips | 8.4px + different font-size (10 vs 9) and tracking | `BhbcView.jsx:1964` vs `:1762` |\n| Tasks segmented All/General/Auto-alerts | 65.0px | `DashboardView.jsx` |\n\n**Change.** One pass, three rules — (a) a **pair in a row** gets `flex:1` on both; (b) a **column of pills** gets `min-width` = widest label; (c) **icon buttons** get an explicit square. This is already the house rule (`feedback_fixed_size_toggle_controls`, and `BhbcView.jsx:1322–1325` solves it correctly with `repeat(auto-fit, minmax(168px, 1fr))` — reuse that).\n\n**Proof.** For each pair, `Math.abs(a.width - b.width) === 0`.\n\n---\n\n## 8. Touch targets below 44px on controls that are meant to be tapped\n\n**Root cause.** Icon buttons sized by glyph advance width. Not one of the auditors called this out as its own class, but it's in their numbers on four surfaces.\n\n- Week-planner ✎/✕: **18.4px** tall (`BhbcView.jsx:2801–2802`)\n- Modal history ✎/✕: **16.4px** (`:1305–1306`)\n- ROSTER HEALTH row actions: 26px (`:3637`, `:3641`)\n- Strip chips COPY/EDIT: 24px\n\n**Change.** 28×28 minimum box on the icon buttons with the glyph centred; the row actions can keep their 26px visual box with a `::before` hit-area expander to 44px. Use a transparent expander rather than growing the visual, so the dense rows don't grow.\n\n**Proof.** `getBoundingClientRect()` height ≥ 28 on the visual, and an `elementFromPoint` probe 8px outside each edge returns the button.\n\n---\n\n## 9. `CollapsibleSection` drops its chevron to a third line when the title wraps\n\n**Root cause.** `src/ui.jsx:469` — the strip is `display:flex; flexWrap:'wrap'`, the title span is `overflowWrap:'anywhere'` with no `flex` basis (`:472–478`), and the chevron cluster is a separate child with `marginInlineStart:'auto'` (`:483`). Once the title's content exceeds the line, it takes the whole line and the cluster wraps below.\n\n**Change.** `flexWrap:'nowrap'` on the strip; `flex:'1 1 auto', minWidth:0` on the title span; `flexShrink:0` on the cluster.\n\n**Proof.** MEDICAL \"Concussion — Graduated Return to Sport\": title cy 3508.8 vs chevron cy 3542.0 = **33.2px apart**, strip 56px tall. GAMES \"2025/26 · LAST SEASON RESULTS\": 35.2px apart, strip 60px vs 41px for its two single-line siblings. Same component, both surfaces → one fix. After: cy delta 0.00 and strip height 41px on all of them.\n\n---\n\n## 10. Strip titles ride 1.2px low on every card with no `headerRight` — app-wide\n\n**Root cause. Confirmed in source, and it is a half-applied fix.** `src/ui.jsx:372` and `src/ui.jsx:702` — both `RefinedCard` and `Card` render the header two ways. The `headerRight` branch wraps it in `display:flex; alignItems:center`, with a comment stating exactly why: *\"As a plain block this div had no font-size of its own: it inherited 16px and built a 19.2px line box around a 13px title, putting the title 1.2px above the date beside it on every card in the app.\"* The `else` branch is still `<div style={{ color: '#FFFFFF' }}>{header}</div>` — a plain block. The 2026 fix was applied to one branch only.\n\n**Change.** Both lines: `) : <div style={{ color:'#FFFFFF', display:'flex', alignItems:'center' }}>{header}</div>}`.\n\n**Proof.** Predicted by the source before measuring: exactly the two BHBC OVERVIEW cards with no `headerRight` — ROAD AHEAD (`BhbcView.jsx:1724`) and TEAM SNAPSHOT (`:2270`) — measure +1.20px, while all six that pass `headerRight` measure 0.00. Title element h 19.2 vs 15.2. Same mechanism produces the 1.2px ink offset on the ACTIVE INJURIES strip. After: 0.00 on all eight, and on every strip elsewhere in the app.\n\n---\n\n## 11. `/coach/programs` action row misses one line by 31.5px, orphaning Delete on 25 cards\n\n**Root cause.** `src/PlansView.jsx:4735` — `gap:16`; `themes.css:602` narrows it to `gap: 10px 12px` at mobile and hides `.prog-spacer`. Children measure 93.4 + 58.6 + 72.4 + 44.8 + 51.7 = 320.9px in a 336.8px content box, but 4 × 12px gaps = 48px pushes the total to 368.9.\n\n**Change.** Cut the mobile gap to `10px 4px` (saves 32px — fits) **or** drop the redundant \"PORTAL\" text next to the toggle at `PlansView.jsx:4618` (93.4px for a switch). Prefer the second: it's the honest fix and it helps at every width.\n\n**Proof.** Delete currently starts at y+30 alone on all 25 cards; row height 68px for 18px of content. After: `.prog-actions` `getClientRects().length === 1` and height ≈ 30px.\n\n---\n\n## 12. Two 620px tables inside a 305px column\n\n**Root cause.** `BhbcView.jsx:3075` — `<table style={{ minWidth: 620 }}>` for player stats.\n\n**Change.** For a dense numeric table you **read**, horizontal scroll is defensible (`themes.css:614` argues this and I agree). What isn't defensible is zero affordance: keep the scroll, add a visible edge fade + `tabindex=\"0\"` + `aria-label` on the wrapper so it's discoverable and keyboard-reachable, and drop `min-width` to 430 by trimming to GP/MPG/PPG/PIR with the rest behind a \"more stats\" toggle.\n\n**Proof.** APG, 3P%, FT%, PIR are entirely off-screen; the header visibly ends at `RP…`. After: at 390px either all columns visible, or the wrapper carries a scroll affordance the audit script can find.\n\n---\n\n## 13. Game rows: the tag column is 62px for a 26px label while the opponent name gets 135px\n\n**Root cause.** `themes.css:650` — `.bhbc-game-row { grid-template-columns: 54px 1fr 62px !important }`. Computed at 390: `54 / 135 / 62` with `gap:14` and `padding:0 12px`. Hebrew club names wrap 4–5 lines in 135px while 49.5px of the 62px tag column sits empty next to a 26.5px `W`.\n\n**Change.** `54px minmax(0,1fr) 30px`, `column-gap: 8px`. That returns ~46px to the name column.\n\n**Proof.** 33 rows currently span **6 distinct heights** (40.8 / 54.4 / 65.6 / 86.4 / 107.2 / 128), 3.1× spread, 21 of 33 at ≥86.4px. After: ≤2 distinct heights.\n\n---\n\n## 14. Page toolbar sits on a third vertical\n\n**Root cause.** `BhbcView.jsx:865` toolbar starts at x=38.0; card edges are x=24.0 and card content is x=42.2. It aligns to neither. Present on all six BHBC tabs and both coach surfaces.\n\n**Change.** Pull the toolbar to x=24 (card edge) and give MANAGE ROSTER / + LOG PRACTICE `flex:1` inside the 342.4px column (item 7 covers the widths).\n\n**Proof.** One left margin on the page: every top-level block reports `left === 24.0`.\n\n---\n\n## 15. Right-aligned English body copy in the S&C brief\n\n**Root cause.** `BhbcView.jsx:1898` — `textAlign: 'end'` on the reason column. Correct in Hebrew (the register this card was designed in), ragged-left in English: the 2-line string `hold intensity, cut volume ~40–60%.` pins `60%.` to the right edge.\n\n**Change.** Keep `end` only under `dir=\"rtl\"`; use `start` otherwise — or drop it and let the flex row's `justify-content` place the column.\n\n**Proof.** 3 elements measure `text-align: end` while every other body string on the surface measures `start`.\n\n---\n\n## 16. Density: five places spending a phone screen on nothing\n\nLower priority, but they compound — each one is scroll a coach pays for.\n\n- **NEXT GAME countdown** (`BhbcView.jsx:1762`): a 30.8px block in a 305.4px column, 89.9% of a 55px band empty, game info stacked below it. → two-column row, 72px left rail.\n- **AVAILABILITY tri-tiles** on TODAY: 59.79 / 43.08 / 22.16 in a 305.4px row, 148.37px (48.6%) empty. The identical tri in BRIEF FOR THE STAFF is already `100.6 / 100.6 / 100.6` — **copy that layout**, it's the same card family.\n- **LEAGUE STATS strip** in the athlete modal: 138.7px of content, 142.9px empty on the left, `justify-content: normal`. → `repeat(4, 1fr)`.\n- **SESSIONS tab landing**: content bottom 498.6px, `scrollHeight === 844` — 40.9% of the screen is bare background with nothing below it.\n- **Empty states**: SESSION LOAD card 104px for four words (0.18 fill); REVENUE empty state 329×90px around 24px of ink (0.27 fill). → collapse to the height of their own message.\n\n---\n\n## 17. Clinician field leaks an email local-part\n\n`ACTIVE INJURIES` row 1 renders the literal string `Ohadyproductions` where the other four rows render `Tomerlich`. Resolve to a display name; blank beats an email fragment. Cheap, and it's the only finding here a client could see over a coach's shoulder.\n\n---\n\n## Findings I am NOT confident in — do not spend time on these until re-measured\n\n**The athlete-modal history \"text-on-text collision\" (reported high, 11 overlapping row pairs).** The source contradicts the measurement. `BhbcView.jsx:1281` is `display:flex; alignItems:center; minHeight: 33` — a **min**-height on a flex row with a wrapping inline child cannot clip; the row grows. There is no `height`, no `overflow:hidden`, and no fixed-height child. Either the auditor's Range-rect union spanned rows and produced a phantom 102.4px \"cell\", or the overlap comes from something outside the row I did not find. **Re-measure with `getBoundingClientRect()` on consecutive rows and check for actual top/bottom overlap before changing anything.** If it does reproduce, the reported fix (`min-height` + `align-items:flex-start`) is already half-present, which is further evidence the diagnosis is wrong.\n\n**Athlete-modal header band \"content rides 6.6px low, 13.2px padding asymmetry.\"** Plausible, not traced — I did not locate the band's padding in `Modal`. Verify before touching.\n\n**ROSTER stat-row \"2.6px baseline spread across four spans.\"** Real but sub-pixel-adjacent, and it is four spans at 11/10/12/12px sharing a baseline — which is arguably correct typography, not a defect. Confirm with Ohad that he wants centre-alignment across mixed sizes before changing it; the \"measure the ink, not the box\" rule cuts both ways here.\n\n**AWAY/HOME pills \"four different x, never a column.\"** Filed under `centring`; it is actually a layout problem (the pill is inline in a wrapping row, so it lands wherever the text ends). Fix belongs with item 7, not as a centring pass.\n\n**All four nav findings' *proposed fixes*.** The measurements are right and item 2 acts on them. The recommendations — bottom tab bar, 3×2 tab grid, overflow menu, wrapping row — are each documented in `App.jsx:1449–1481` and `BhbcView.jsx:756–761` as tried and rejected by Ohad. Implementing them would re-open a closed decision.\n\n---\n\n### Suggested order of work\n\n1, 2, 5 first — reachability, and 5 is a one-line paste. Then 3 and 4 (legibility and scroll cost), then 6, 9, 10 (three shared-component fixes with app-wide reach and near-zero risk), then 7 as a single sweep. 11–17 are cleanup.\n\nItems **5, 9, 10** are confirmed from source alone and need no browser to write — only to verify. Item **1** is the highest-value single line in the list: it revives a mobile restack that already exists and is currently doing nothing."
  },
  "workflowProgress": [
    {
      "type": "workflow_phase",
      "index": 1,
      "title": "Audit"
    },
    {
      "type": "workflow_phase",
      "index": 2,
      "title": "Synthesize"
    },
    {
      "type": "workflow_agent",
      "index": 1,
      "label": "audit:bhbc-overview",
      "phaseIndex": 1,
      "phaseTitle": "Audit",
      "agentId": "a5beeccad2fc9efae",
      "model": "claude-opus-5[1m]",
      "state": "done",
      "startedAt": 1788292861367,
      "queuedAt": 1788292859674,
      "attempt": 1,
      "lastToolName": "StructuredOutput",
      "lastToolSummary": "BHBC /coach/bhbc — OVERVIEW tab, iPhone emulation 390×844 @…",
      "promptPreview": "You are auditing the EXPO app at http://127.0.0.1:5199 for MOBILE design defects.\n\nCRITICAL METHOD - a plain setViewport is NOT a phone and gives false results.\nYou MUST emulate a real device. Write a node script under audit-out/ that does:\n\n  import P from 'puppeteer-core';\n  import * as A from '../scripts/lib/authed-page.mjs';\n  const b = await P.connect({ browserURL: 'http://127.0.0.1:9222', de…",
      "lastProgressAt": 1788293537544,
      "tokens": 144148,
      "toolCalls": 31,
      "durationMs": 674909,
      "resultPreview": "{\"findings\":[{\"kind\":\"h-scroll-region\",\"where\":\"BHBC top nav `.bhbc-header-inner` (sticky header, above OVERVIEW)\",\"measured\":\"scrollWidth 1109 vs clientWidth 390 — 719px over. Of its 10 controls only OVERVIEW (left 262.5→358.6) is inside the viewport; ROSTER (left 364.6), SCHEDULE (451.4), MEDICAL (556.4), SESSIONS (647.2), GAMES (746.7), '◉ PREVIEW AS COACH' (818.5), the עב toggle (987.5) and 2 …"
    },
    {
      "type": "workflow_agent",
      "index": 2,
      "label": "audit:bhbc-roster-medical",
      "phaseIndex": 1,
      "phaseTitle": "Audit",
      "agentId": "adb33c30bd545dbad",
      "model": "claude-opus-5[1m]",
      "state": "done",
      "startedAt": 1788292861291,
      "queuedAt": 1788292859675,
      "attempt": 1,
      "lastToolName": "StructuredOutput",
      "lastToolSummary": "BHBC coach hub /coach/bhbc — ROSTER tab and MEDICAL tab, iP…",
      "promptPreview": "You are auditing the EXPO app at http://127.0.0.1:5199 for MOBILE design defects.\n\nCRITICAL METHOD - a plain setViewport is NOT a phone and gives false results.\nYou MUST emulate a real device. Write a node script under audit-out/ that does:\n\n  import P from 'puppeteer-core';\n  import * as A from '../scripts/lib/authed-page.mjs';\n  const b = await P.connect({ browserURL: 'http://127.0.0.1:9222', de…",
      "lastProgressAt": 1788293624797,
      "tokens": 133414,
      "toolCalls": 38,
      "durationMs": 763497,
      "resultPreview": "{\"surface\":\"BHBC coach hub /coach/bhbc — ROSTER tab and MEDICAL tab, iPhone emulation 390x844 @2x (isMobile+hasTouch, iOS 17 UA). Scripts: C:\\\\Users\\\\Administrator\\\\Desktop\\\\expo-full\\\\audit-out\\\\bhbc-roster-medical.mjs (+ -2/-3/-4/-5/-6.mjs). Screenshots: audit-out\\\\bhbc-roster-medical-roster*.png, audit-out\\\\bhbc-roster-medical-medical*.png\",\"pageScrollsSideways\":false,\"findings\":[{\"kind\":\"h-scr…"
    },
    {
      "type": "workflow_agent",
      "index": 3,
      "label": "audit:bhbc-schedule-sessions",
      "phaseIndex": 1,
      "phaseTitle": "Audit",
      "agentId": "aaf8a1e11bb9db9da",
      "model": "claude-opus-5[1m]",
      "state": "done",
      "startedAt": 1788292861363,
      "queuedAt": 1788292859675,
      "attempt": 1,
      "lastToolName": "StructuredOutput",
      "lastToolSummary": "BHBC /coach/bhbc — SCHEDULE tab and SESSIONS tab, iPhone em…",
      "promptPreview": "You are auditing the EXPO app at http://127.0.0.1:5199 for MOBILE design defects.\n\nCRITICAL METHOD - a plain setViewport is NOT a phone and gives false results.\nYou MUST emulate a real device. Write a node script under audit-out/ that does:\n\n  import P from 'puppeteer-core';\n  import * as A from '../scripts/lib/authed-page.mjs';\n  const b = await P.connect({ browserURL: 'http://127.0.0.1:9222', de…",
      "lastProgressAt": 1788293860335,
      "tokens": 148903,
      "toolCalls": 40,
      "durationMs": 997702,
      "resultPreview": "{\"surface\":\"BHBC /coach/bhbc — SCHEDULE tab and SESSIONS tab, iPhone emulation 390x844 (isMobile, hasTouch, DSF2, iOS 17 Safari UA). Scripts: audit-out/bhbc-schedule-sessions{,-p2,-p3,-p4,-p5}.mjs. Screenshots: audit-out/bhbc-schedule-sessions-p2-{schedule,sessions}.png and audit-out/bhbc-schedule-sessions-region-{past,micro,cal,planner}.png\",\"pageScrollsSideways\":false,\"findings\":[{\"kind\":\"overfl…"
    },
    {
      "type": "workflow_agent",
      "index": 4,
      "label": "audit:bhbc-games-modal",
      "phaseIndex": 1,
      "phaseTitle": "Audit",
      "agentId": "a130f22eec4c95371",
      "model": "claude-opus-5[1m]",
      "state": "done",
      "startedAt": 1788292861370,
      "queuedAt": 1788292859675,
      "attempt": 1,
      "lastToolName": "StructuredOutput",
      "lastToolSummary": "BHBC /coach/bhbc — GAMES tab, and the athlete modal opened …",
      "promptPreview": "You are auditing the EXPO app at http://127.0.0.1:5199 for MOBILE design defects.\n\nCRITICAL METHOD - a plain setViewport is NOT a phone and gives false results.\nYou MUST emulate a real device. Write a node script under audit-out/ that does:\n\n  import P from 'puppeteer-core';\n  import * as A from '../scripts/lib/authed-page.mjs';\n  const b = await P.connect({ browserURL: 'http://127.0.0.1:9222', de…",
      "lastProgressAt": 1788293752799,
      "tokens": 161994,
      "toolCalls": 41,
      "durationMs": 890165,
      "resultPreview": "{\"surface\":\"BHBC /coach/bhbc — GAMES tab, and the athlete modal opened from ROSTER (Zack Bryant). Real iPhone emulation 390x844, isMobile+hasTouch, DSR2, iOS 17 UA. Scripts: audit-out/bhbc-games-modal{,-2,-3,-4,-5}.mjs; shots: audit-out/bhbc-games-modal-*.png; raw: audit-out/bhbc-games-modal-results{,2,3,4,5}.json\",\"pageScrollsSideways\":false,\"findings\":[{\"kind\":\"overflow\",\"where\":\"Athlete modal >…"
    },
    {
      "type": "workflow_agent",
      "index": 5,
      "label": "audit:expo-coach",
      "phaseIndex": 1,
      "phaseTitle": "Audit",
      "agentId": "a3964eb80ecabed63",
      "model": "claude-opus-5[1m]",
      "state": "done",
      "startedAt": 1788292861437,
      "queuedAt": 1788292859675,
      "attempt": 1,
      "lastToolName": "StructuredOutput",
      "lastToolSummary": "EXPO coach — /coach/dashboard and /coach/athletes at 390×84…",
      "promptPreview": "You are auditing the EXPO app at http://127.0.0.1:5199 for MOBILE design defects.\n\nCRITICAL METHOD - a plain setViewport is NOT a phone and gives false results.\nYou MUST emulate a real device. Write a node script under audit-out/ that does:\n\n  import P from 'puppeteer-core';\n  import * as A from '../scripts/lib/authed-page.mjs';\n  const b = await P.connect({ browserURL: 'http://127.0.0.1:9222', de…",
      "lastProgressAt": 1788293966388,
      "tokens": 152007,
      "toolCalls": 38,
      "durationMs": 1103753,
      "resultPreview": "{\"findings\":[{\"kind\":\"h-scroll-region\",\"where\":\"Coach header nav strip `div.hdr-scroll > nav.hdr-scroll` — present on BOTH /coach/dashboard and /coach/athletes\",\"measured\":\"nav scrollWidth 876px (container scrollWidth 1242px) vs 390px viewport = 852px of sideways scroll. 9 nav items; only 2 are fully visible without scrolling (DASHBOARD right=229.6, ATHLETES right=363.6; SESSIONS right=471.6, REVI…"
    },
    {
      "type": "workflow_agent",
      "index": 6,
      "label": "audit:expo-programs-portal",
      "phaseIndex": 1,
      "phaseTitle": "Audit",
      "agentId": "ae6957eb8c52b6215",
      "model": "claude-opus-5[1m]",
      "state": "done",
      "startedAt": 1788292861398,
      "queuedAt": 1788292859675,
      "attempt": 1,
      "lastToolName": "StructuredOutput",
      "lastToolSummary": "EXPO app at 390x844 iPhone emulation (isMobile+hasTouch+iOS…",
      "promptPreview": "You are auditing the EXPO app at http://127.0.0.1:5199 for MOBILE design defects.\n\nCRITICAL METHOD - a plain setViewport is NOT a phone and gives false results.\nYou MUST emulate a real device. Write a node script under audit-out/ that does:\n\n  import P from 'puppeteer-core';\n  import * as A from '../scripts/lib/authed-page.mjs';\n  const b = await P.connect({ browserURL: 'http://127.0.0.1:9222', de…",
      "lastProgressAt": 1788293730517,
      "tokens": 142124,
      "toolCalls": 44,
      "durationMs": 867882,
      "resultPreview": "{\"surface\":\"EXPO app at 390x844 iPhone emulation (isMobile+hasTouch+iOS UA): /coach/programs (signed in as owner) and /athlete (signed in as trainee diego@diegoday.com in an isolated browser context). Scripts: C:\\\\Users\\\\Administrator\\\\Desktop\\\\expo-full\\\\audit-out\\\\expo-programs-portal.mjs, -portal2/3/4/5/6.mjs. Screenshots: audit-out\\\\expo-programs-portal-coach-programs.png (+ -full), audit-out\\…"
    },
    {
      "type": "workflow_agent",
      "index": 7,
      "label": "synthesize",
      "phaseIndex": 2,
      "phaseTitle": "Synthesize",
      "agentId": "a01eb43d97637c340",
      "model": "claude-opus-5[1m]",
      "state": "done",
      "startedAt": 1788293969343,
      "queuedAt": 1788293967774,
      "attempt": 1,
      "lastToolName": "Bash",
      "lastToolSummary": "grep -n \"color: '#FFFFFF' }}>{header}\" src/ui.jsx",
      "promptPreview": "Here are mobile audit findings from 6 surfaces of the EXPO app,\neach measured on a real emulated iPhone:\n\n[\n {\n  \"findings\": [\n   {\n    \"kind\": \"h-scroll-region\",\n    \"where\": \"BHBC top nav `.bhbc-header-inner` (sticky header, above OVERVIEW)\",\n    \"measured\": \"scrollWidth 1109 vs clientWidth 390 — 719px over. Of its 10 controls only OVERVIEW (left 262.5→358.6) is inside the viewport; ROSTER (left…",
      "lastProgressAt": 1788294268685,
      "tokens": 154346,
      "toolCalls": 39,
      "durationMs": 299341,
      "resultPreview": "# Mobile fix list — one ranked queue, merged by root cause\n\nSix surfaces, 78 raw findings → **17 items**. Every item below was checked against `src/`; where I could not confirm the mechanism in code I say so. All measurements are the auditors', re-attributed to the line that produces them.\n\nContext that changes the priority order: **all six surfaces report `pageScrollsSideways: false`**. The `over…"
    }
  ],
  "totalTokens": 1036936,
  "totalToolCalls": 271
}