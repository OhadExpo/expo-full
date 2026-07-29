# EXPO — Design pass (3 versions, localhost only, prod untouched)

Open all three, compare, pick a direction. Sign in as owner (email + 1234) → Coach.
Bottom-right on every page: **✦ Flags panel** — shows which version you're on, links to
the other two, and lists every change with a hover/click explanation (✦ = inline change flag).

- **V1 · Calm / Editorial** — http://localhost:5173  (branch design-pass)
    KPI + revenue numbers one calm white weight; meaning moved to small status dots.
- **V2 · Branded / Energetic** — http://localhost:5174  (branch design-v2)
    Numbers glow EXPO cyan; every card header across the app gets a cyan under-glow.
- **V3 · Dense / Terminal** — http://localhost:5175  (branch design-v3)
    Compact tabular-mono numbers, square ticks, tighter card headers app-wide (~30% less space).

Changes so far: Dashboard KPI tiles, Revenue tiles, and an app-wide card-header treatment
(propagates each direction to all 71+ cards). Every change is flagged in-app.
NONE of this is on master — prod is safe and untouched.
