# Light/dark parity — measured across every route, signed in

`node scripts/audit-theme-parity.mjs <outDir> <baseUrl>` — 2026-08-27, **all 36
routes** enumerated from `docs/SURFACES.md`, authenticated as the owner.

32 completed in the sweep; the other four (`/coach/smart-import`, `/intake/he`,
`/login`, `/try`) hit a 40 s navigation timeout because a deterministic shot
capture was running on the same machine. Re-run on a quiet machine they are
clean — `moved=0`, and zero low-contrast on all four. The harness reported the
timeouts honestly as ERROR rather than counting them as passes.

The harness loads each route twice with `?theme=…` so `boot-theme.js` applies the
theme BEFORE paint, and it refuses to compare unless the two loads actually
differed — otherwise "geometry identical" would be trivially true.

## Geometry: perfect

**`moved=0 countDelta=0` on all 36 routes.** Not one element changes
position or size when only the theme changes. That is the locked rule
(`reference_theme_geometry_parity`) and it holds everywhere, including the nine
routes never checked before: `/coach/bugs`, `/coach/challenges`,
`/coach/waitlist`, `/coach/smart-import`, `/coach/intake`, `/coach/calendar`,
`/demo/he`, `/intake/he`, `/login`.

This is the first time it has been verified signed in. The earlier run measured
the login page 36 times because the browser was not authenticated.

## Contrast: two colours, both deliberate — reporting, not touching

26 routes carry low-contrast text, but it reduces to exactly two sources:

| colour | where | occurrences | ratio |
|---|---|---|---|
| `#444450` (`--c-td`) | muted labels, counts, secondary text | 72 | **2.06 : 1** |
| `#FFFFFF` on `#39BDFF` | active nav / header chips, light theme | 41 (+3 at 78% alpha) | **2.12 : 1** |

WCAG AA wants 4.5:1 for normal text and 3:1 for large text. Both sit below both.

**Neither is being changed, on purpose.** They are your decisions, already on
the record:

- *"Cyan stays bright — never deepen `#39BDFF`; brand wins."*
- *Contrast theme rejected* — never re-propose palette redesigns.

So this is data, not a proposal. If you ever want to move on it, the smallest
change that would clear AA without touching the brand cyan is darkening
`--c-td` alone — it is 72 of the 113 hits, and it is a muted-text token rather
than a brand colour. `#6B6B78` would put it near 3:1, `#7C7C8A` near 4.5:1.

## Re-running it

```bash
# dev server must be running IN THE REPO (Start-Process does not inherit cwd):
#   cmd /c 'cd /d C:\Users\Administrator\Desktop\expo-full && npx vite --port 5212 --strictPort'
EXPO_PW=... node scripts/audit-theme-parity.mjs ./audit-out http://localhost:5212
```

It signs in and then proves it. If a coach route comes back as the sign-in
screen it exits 2 with "Nothing was tested" rather than reporting a green that
means nothing.
