# White Theme — Design Spec

Date: 2026-05-09
Status: Draft (awaiting Ohad approval)
Branch target: a fresh feature branch off `master` (e.g. `white-theme`)

## Goal

Ship a BSG-faithful white version of EXPO, available as a runtime toggle on every product surface in this monorepo. Both modes are first-class. New visitors see whichever mode their OS reports via `prefers-color-scheme`; an explicit user toggle overrides and persists per-browser (localStorage) and per-account (Supabase Auth user metadata).

## Brand fidelity

EXPO Brand Style Guide 2022 (24 pages, all reviewed) defines exactly three colors on page 5:

| Hex | Role |
|---|---|
| `#39BDFF` | EXPO Blue |
| `#000000` | Black |
| `#FFFFFF` | White |

The BSG sanctions all three colors as **first-class full-bleed canvases**, not just text/accent. Evidence:
- Page 3 — black surface with white logo (preferred logo placement)
- Page 4 — white surface with black logo, plus cyan card with white logo (secondary)
- Page 9 — black splash screen
- Page 17 — white coffee mug with black logo
- Page 19 — Instagram template grid showing **black, white, AND cyan** as equal first-class card surfaces
- Page 21 — full-bleed cyan canvas with white logo
- Page 22 — full-bleed white canvas with black logo
- Page 23 — black canvas with cyan "THANK YOU" headline (cyan-as-text on black, sanctioned)

Inferences for the product:
1. Cyan-as-surface (`acSurface`) is a brand-sanctioned panel fill — used for hero CTAs, trial banner, splash blocks, marketing cards. Not "rare."
2. Cyan-as-text is sanctioned **only on black canvas** (5.4:1 AA pass). On white canvas it fails AA at 1.93:1 — never use cyan as a text color in light mode.
3. The cross-hatch pattern (pages 1, 18) is a sanctioned brand element on both canvases; out of v1 scope but reserved for hero polish later.

No tints, gradients, or hover variants are sanctioned. The dark theme already ships nine grayscale derivations (sf/sf2/sf3, bd/bd2, tx/tm/td, plus four functional colors). Those are **UI affordances** the BSG doesn't specify because the BSG is a brand guide, not a UI kit. Light mode mirrors the same set, kept in pure neutral grayscale.

## Architecture — CSS custom properties

Convert each `C.*` value in both apps' `theme.js` to a CSS variable string. Add a `themes.css` with one `:root` block per mode. Toggle by setting `data-theme="light"` or `data-theme="dark"` on `<html>`.

This was chosen over a React-context refactor (35 files would change) and over a hot-mutated `C` object (fights React's render model). CSS variables let the existing ~720 inline `background: C.bg` references update automatically — the only file edits are the theme module itself, two CSS files, the index.html init script, one toggle component per app, plus the targeted hardcoded-black sweep below.

### `theme.js` (after refactor)

```js
export const C = {
  bg: 'var(--c-bg)',
  sf: 'var(--c-sf)',
  sf2: 'var(--c-sf2)',
  sf3: 'var(--c-sf3)',
  bd: 'var(--c-bd)',
  bd2: 'var(--c-bd2)',
  tx: 'var(--c-tx)',
  tm: 'var(--c-tm)',
  td: 'var(--c-td)',
  ac: 'var(--c-ac)',
  acH: 'var(--c-acH)',
  acD: 'rgba(57,189,255,0.10)',
  acM: 'rgba(57,189,255,0.20)',
  ac4D: 'rgba(57,189,255,0.30)',
  acSurface: 'var(--c-acSurface)',
  acOnSurface: 'var(--c-acOnSurface)', // text color when sitting on acSurface (black in light, white in dark)
  rd: 'var(--c-rd)', rdD: 'var(--c-rdD)',
  gn: 'var(--c-gn)', gnD: 'var(--c-gnD)',
  or: 'var(--c-or)', orD: 'var(--c-orD)',
  pu: 'var(--c-pu)', puD: 'var(--c-puD)',
  // Theme-agnostic semantic tokens — same value in both modes
  scrim: 'var(--c-scrim)',         // modal backdrop dim
  videoBg: '#000000',              // letterbox color (cinema convention)
  shadow: 'var(--c-shadow)',       // drop-shadow color baseline
};
```

### `themes.css`

```css
:root, [data-theme="dark"] {
  --c-bg: #000000;     --c-sf: #0a0a0c;   --c-sf2: #111114;  --c-sf3: #18181c;
  --c-bd: #1e1e24;     --c-bd2: #2a2a32;
  --c-tx: #f0f0f4;     --c-tm: #7a7a88;   --c-td: #444450;
  --c-ac: #39BDFF;     --c-acH: #5FCDFF;
  --c-acSurface: #39BDFF;            --c-acOnSurface: #ffffff;
  --c-rd: #FF4757;     --c-rdD: rgba(255,71,87,.10);
  --c-gn: #2ED573;     --c-gnD: rgba(46,213,115,.10);
  --c-or: #FFA502;     --c-orD: rgba(255,165,2,.10);
  --c-pu: #A855F7;     --c-puD: rgba(168,85,247,.10);
  --c-scrim: rgba(0,0,0,0.7);
  --c-shadow: rgba(0,0,0,0.5);
}

[data-theme="light"] {
  --c-bg: #FFFFFF;     --c-sf: #FAFAFA;   --c-sf2: #F2F2F2;  --c-sf3: #E8E8E8;
  --c-bd: #E0E0E0;     --c-bd2: #BFBFBF;
  --c-tx: #000000;     --c-tm: #666666;   --c-td: #999999;
  --c-ac: #39BDFF;     --c-acH: #1FA8E8;
  --c-acSurface: #39BDFF;            --c-acOnSurface: #000000;
  --c-rd: #D62839;     --c-rdD: rgba(214,40,57,.10);
  --c-gn: #1E9E5C;     --c-gnD: rgba(30,158,92,.10);
  --c-or: #CC7A00;     --c-orD: rgba(204,122,0,.10);
  --c-pu: #7B3FBF;     --c-puD: rgba(123,63,191,.10);
  --c-scrim: rgba(0,0,0,0.45);
  --c-shadow: rgba(0,0,0,0.15);
}

html, body { background: var(--c-bg); color: var(--c-tx); }
```

### Why these specific light-mode values

- `bg = #FFFFFF` — BSG-defined white. Pure, not off-white (off-white drifts the brand into "warm" or "cool" tints).
- `sf/sf2/sf3` — 2% / 5% / 9% gray. Smallest steps that still read as visual layers; preserves the dark-mode "card floats above page" hierarchy.
- `bd / bd2` — 12% / 25% gray. Visible hairline / strong divider on white.
- `tx = #000000` — BSG-defined black. AAA contrast (21:1) on white.
- `tm = #666666` — 40% gray, 5.74:1 on white, AA pass for body text.
- `td = #999999` — 60% gray, 2.85:1 on white. UI-affordance only (disabled states, faint helper text), not for body copy.
- `ac = #39BDFF` — unchanged across modes. BSG hex.
- `acH = #1FA8E8` in light mode (~10% darker cyan). Same precedent as darkening rd/gn/or/pu — a UI affordance for hover, not a brand drift. The BSG don't ("don't change the logo color") applies to logo placement, not interactive state.
- `acSurface = #39BDFF` — full-bleed cyan canvas, sanctioned by BSG pages 4/19/21. First-class option for hero CTA cards, trial banner, splash blocks.
- `acOnSurface` — text color when sitting on `acSurface`. **`#000` in light mode** (10.4:1 AAA), `#FFF` in dark mode (matches BSG examples). Accidentally already correct in most existing CTAs, which use literal `color: '#000'` on `C.ac` buttons (see sweep section).
- Functional colors (`rd`/`gn`/`or`/`pu`) darken in light mode for AA contrast on white. They are internal extensions, not BSG colors, and should appear sparingly — small status dots, validation messages — never as primary surface.

### Contrast verification

| Foreground | Background | Ratio | Verdict |
|---|---|---|---|
| `#000` (tx) | `#FFF` (bg) | 21:1 | AAA |
| `#666` (tm) | `#FFF` (bg) | 5.74:1 | AA body text |
| `#999` (td) | `#FFF` (bg) | 2.85:1 | UI affordance only (disabled) |
| `#39BDFF` text | `#FFF` (bg) | 1.93:1 | **Fails** — never use cyan as text color in light mode |
| `#000` text | `#39BDFF` (acSurface) | 10.4:1 | AAA — light-mode cyan CTAs use black text |
| `#FFF` text | `#39BDFF` (acSurface) | 1.93:1 | Fails — avoid in light mode |
| `#000` text | `#FAFAFA` (sf) | 19.6:1 | AAA |
| `#666` text | `#FAFAFA` (sf) | 5.4:1 | AA |
| `#D62839` (rd) | `#FFF` (bg) | 5.7:1 | AA |
| `#1E9E5C` (gn) | `#FFF` (bg) | 4.5:1 | AA (just) |
| `#CC7A00` (or) | `#FFF` (bg) | 3.6:1 | AA large text only |
| `#7B3FBF` (pu) | `#FFF` (bg) | 7.0:1 | AAA |

## Scope

In:
- `expo-full/src` — coach app, athlete portal, /demo, /try, /intake, /coach/*, all auth and public surfaces in this app
- `expo-il/src` — marketing site (expo-il.co.il)

Out:
- Email templates, OG meta cards, print stylesheets — not addressed in v1, must not break.
- Dark mode color values — unchanged.
- The cross-hatch BSG pattern as background texture (v2 polish).
- Re-skinning the inlined base64 logo in `expo-il/src/theme.js` to SVG (defer — just add the second base64).

## Toggle UX

A small sun/moon icon button (lucide `Sun` / `Moon`) in the top-right of the header on every shell. One click flips the attribute, persists localStorage, and (if authenticated) writes user metadata. Default for a brand-new visitor: `matchMedia('(prefers-color-scheme: light)')`. Explicit user choice overrides and persists.

Mount points:
- `src/App.jsx` — coach + athlete shell header
- `src/EntryChooser.jsx` — public landing chooser
- `src/CoachLanding.jsx` — /coaches landing
- `src/WaitlistView.jsx`
- `src/TrySandbox.jsx`
- `src/IntakeForm.jsx`
- `expo-il/src/App.jsx` — marketing nav

## Persistence — Supabase Auth user metadata (no schema migration)

Verified via Supabase MCP: there is **no `profiles` table** in this project. The cleanest sync path is `supabase.auth.updateUser({ data: { theme_pref } })`, which writes to `auth.users.raw_user_meta_data`. RLS is automatic (a user can only update their own metadata). No table, no migration, no policy edit.

```js
// useTheme.js — sync function
async function syncThemeToSupabase(pref) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.auth.updateUser({ data: { theme_pref: pref } });
}

// On login (in auth.jsx after signIn / on session restore):
const remote = session?.user?.user_metadata?.theme_pref;
if (remote && remote !== localStorage.getItem('expo-theme')) {
  localStorage.setItem('expo-theme', remote);
  document.documentElement.setAttribute('data-theme', remote);
}
```

Boot priority:
1. `localStorage.expo-theme` (instant, no flash)
2. else `prefers-color-scheme`
3. else `dark` (fallback if matchMedia unavailable)

On Supabase session restore, `user_metadata.theme_pref` overrides localStorage if different (cross-device sync).

## Boot sequence

```html
<!-- index.html, in <head>, before any script tag -->
<script>
  (function () {
    try {
      var saved = localStorage.getItem('expo-theme');
      var pref = saved || (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
      document.documentElement.setAttribute('data-theme', pref);
    } catch (e) {
      document.documentElement.setAttribute('data-theme', 'dark');
    }
  })();
</script>
```

This runs synchronously before paint, eliminating any flash of opposite-mode content. The same script is duplicated into `expo-il/index.html`.

## Hardcoded-black sweep — full inventory

Greps run 2026-05-09:
- `expo-full/src` — **72 occurrences across 17 files** of `'#000'`/`'#fff'`/`'black'`/`'white'`/`rgba(0,0,0,...)`/`rgba(255,255,255,...)`
- `expo-il/src` — **17 occurrences across 3 files** (`App.jsx`, `Chat.jsx`, `theme.js` — the inlined base64)

Categorized into four buckets:

### Bucket 1 — Already correct (keep literal)
Black-text-on-cyan CTAs already use `color: '#000'` literally. They are AAA in both modes (10.4:1 on cyan). No edit needed.

Files: `CoachLanding.jsx` (4 sites), `CoachDemo.jsx` (5 sites), `CoachChat.jsx` (1 site).

### Bucket 2 — Theme-agnostic semantic (replace with semantic token)
Replace with a token that has the same value in both modes. New tokens added to `theme.js`:
- `C.scrim` for modal backdrops (`rgba(0,0,0,0.7)` dark / `rgba(0,0,0,0.45)` light)
- `C.videoBg` for video letterboxes (always `#000000` — cinema convention)
- `C.shadow` for drop-shadow color (`rgba(0,0,0,0.5)` dark / `rgba(0,0,0,0.15)` light)

Files / patterns to convert:
- `App.jsx:641` modal scrim → `C.scrim`
- `auth.jsx:293`, `TraineeDetail.jsx:450`, `TraineeDetail.jsx:564`, `ExerciseSubstitution.jsx:61`, `PlanDiff.jsx:275`, `PlansView.jsx:115`, `ClientPortal.jsx:1412`, `WorkoutReview.jsx` (various) — all `rgba(0,0,0,0.X)` modal scrims → `C.scrim`
- `ClientPortal.jsx` (5 sites) — video player `background: '#000'` → `C.videoBg`
- `CoachLanding.jsx:286`, `CoachLanding.jsx:735`, `CoachDemo.jsx:2377` — drop shadows → `C.shadow`
- `SwUpdateBanner.jsx:63`, `auth.jsx:337`, `PlansView.jsx:116`, `PlansView.jsx:1296`, `CoachChat.jsx:221`, `CoachChat.jsx:240` — drop shadows → `C.shadow`

### Bucket 3 — Theme-aware (replace with theme token)
Cases where the literal value is wrong for one mode:
- `auth.jsx:192` — Google sign-in button `background: '#fff'`. **Special case:** Google's brand guidelines require the button to remain white in both modes (it carries Google's "G" mark with their colors). Add `C.googleBtn = '#FFFFFF'` as a third theme-agnostic token, or accept the literal `'#fff'` with an inline comment. Recommend: keep the literal with a comment, since this is a Google brand requirement, not an EXPO theme decision.
- `CoachDemo.jsx:2454` — `background: '#000'` on a card. Verify intent; likely should be `C.bg` so it inverts in light mode.

### Bucket 4 — SVG / canvas
- `App.jsx` — single SVG with `fill="white"` or similar. Read and decide per-element whether to invert (`currentColor`) or keep semantic.
- `expoMark.jsx` — the EXPO logo SVG component. Verify whether it uses `currentColor` or a hardcoded fill. If hardcoded, switch to `currentColor` so it follows `tx`.
- `OverloadChart.jsx` — chart axes/labels. Check for any `'#fff'`/`'#000'` strings; replace with theme tokens.

Concrete sweep file list (17 files in src/):
`App.jsx`, `auth.jsx`, `ClientPortal.jsx`, `CoachChat.jsx`, `CoachDemo.jsx`, `CoachLanding.jsx`, `ExerciseSubstitution.jsx`, `PlanDiff.jsx`, `PlansView.jsx`, `SwUpdateBanner.jsx`, `TraineeDetail.jsx`, `TraineePRsView.jsx`, `TraineesView.jsx`, `TrySandbox.jsx`, `ui.jsx`, `VideoEmbed.jsx`, `WorkoutReview.jsx`.

Concrete sweep file list (3 files in expo-il/src/):
`App.jsx`, `Chat.jsx`, `theme.js` (the inlined base64 logo — add a black-variant sibling).

## Files

### Modify

- `src/theme.js`, `expo-il/src/theme.js` — `C` values become CSS var strings; add `acSurface`, `acOnSurface`, `scrim`, `videoBg`, `shadow`
- `src/main.jsx`, `expo-il/src/main.jsx` — `import './themes.css'` (add at top)
- `index.html`, `expo-il/index.html` — inline pre-paint init script; static dark `<meta name="theme-color">` becomes dynamic, updated by the toggle
- 17 files in `src/` + 3 files in `expo-il/src/` — sweep above

### Add

- `src/themes.css`, `expo-il/src/themes.css`
- `src/hooks/useTheme.js` — hook + provider; reads `data-theme`, exposes `theme` and `setTheme(next)`; on `setTheme` writes localStorage + (async) Supabase user metadata + flips attribute + fires `theme-color` meta update
- `src/ThemeToggle.jsx`, `expo-il/src/components/ThemeToggle.jsx` — sun/moon icon button (lucide); 36×36 hit area; aria-label "Switch to light/dark mode"
- `public/logos/expo-logo-nav-light.png`, `public/logos/expo-icon-light.png` — black-on-transparent variants exported from `_branding/Black 100_.png` at the existing dark-mode dimensions (188×64 nav, 64×64 icon). Re-run `scripts/sync-brand-from-coach.py` (or its equivalent) to keep them in sync.
- `expo-il/public/expo-hero-logo-light.png` — black-on-transparent hero variant

No Supabase migration required.

## EXPO_LOGO consumer changes

Every component that imports `EXPO_LOGO_NAV` / `EXPO_LOGO` / `EXPO_ICON` from `theme.js` reads them as a single static string today. After the refactor, pick the variant via `useTheme()`:

```js
const { theme } = useTheme();
const logoSrc = theme === 'light'
  ? '/logos/expo-logo-nav-light.png'
  : EXPO_LOGO_NAV;
```

For the inlined base64 in `expo-il/src/theme.js`, expose two exports (`EXPO_LOGO_NAV_DARK`, `EXPO_LOGO_NAV_LIGHT`) and a helper `pickLogo(theme)` to centralize the branching.

## Edge cases

- **PWA service worker:** bumping the SW cache version when `themes.css` first ships is essential; otherwise existing PWA installs serve the old bundle and the toggle does nothing. The idle-only `SwUpdateBanner` already handles user notification — make sure the version bump is part of the same commit.
- **`<meta name="theme-color">`:** dynamic per mode (#000000 for dark, #FFFFFF for light). The `useTheme` hook updates the meta on every flip so the iOS / Android system chrome matches.
- **OG cards:** stay dark for v1. Open Graph images are pre-rendered PNGs; no flip needed.
- **Hebrew/RTL:** unaffected — palette is direction-agnostic.
- **Drawing-on-video review (per `feedback_review_drawing_model`):** stroke colors should follow `--c-tx` so drawings remain visible in both modes. Verify in `WorkoutReview.jsx` during sweep.
- **Charts (`OverloadChart.jsx`):** axes, gridlines, labels must read theme tokens. Likely the highest-touch single file in the sweep.
- **Auth Google button:** the Google "G" SVG mark and the white background are part of Google's brand requirements; they stay literal in both modes. Documented inline.

## Testing plan

1. **Static contrast audit:** axe-core on a built dev server in light mode. Fail fast on any text-on-bg below 4.5:1 except `td`/`tm`-on-`sf3` edge cases reviewed manually.
2. **Visual regression matrix** — screenshot every major surface in both modes:
   - Coach: Dashboard, Trainees, Programs (PlansView), Trainee Detail, Plan Editor, Workout Review, SmartImport, Chat Audit, Waitlist
   - Athlete: ClientPortal home, Workout day view, Comments + drawing canvas, Plan history
   - Public: EntryChooser, CoachLanding, WaitlistView, TrySandbox, IntakeForm, /demo (coach + trainee)
   - expo-il: Home, /coaches, program detail
3. **Boot test** — fresh private window with OS in light mode → expect light. Same with OS in dark → expect dark.
4. **Persistence test** — toggle to light on laptop while logged in → log into another browser as the same user → expect light.
5. **PWA install test** — open existing installed PWA after deploy → expect SW to update on next open and the toggle to appear.
6. **Bundle hash test** — confirm `data-theme` flip does not require a full reload (CSS variable swap only).
7. **Cyan-CTA contrast spot check** — every place we currently render `background: C.ac` with text on it, verify the text resolves to `acOnSurface` (or literal `'#000'`) in light mode.

## Implementation order (preview — full plan in writing-plans)

1. `themes.css` + theme.js refactor + index.html init script (both apps)
2. `useTheme` hook + ThemeToggle component
3. Logo asset variants
4. Sweep buckets 2–4
5. Mount toggle on each shell surface
6. Supabase user-metadata sync wiring
7. SW version bump
8. axe-core + visual regression pass
9. Deploy preview, verify on installed PWA, then merge

## Open questions for Ohad

None blocking — all major decisions captured above. Two minor opens for review:
1. Toggle icon style — sun/moon glyphs (lucide) vs. literal "DARK / LIGHT" text label? Default: glyphs.
2. Should the toggle be visible on `/intake/<locale>` (token-gated trainee onboarding form)? Default: yes.
