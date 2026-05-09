# White Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a BSG-faithful runtime light/dark theme toggle across both `expo-full/src` (coach app + athlete portal) and `expo-il/src` (marketing site), with localStorage + Supabase Auth user_metadata persistence and OS `prefers-color-scheme` default.

**Architecture:** CSS custom properties driven by `data-theme` on `<html>`. Each `C.*` value in `theme.js` becomes a `var(--c-*)` string so all ~720 existing inline styles auto-update. A small `useTheme` hook owns the toggle/persistence behavior. An inline boot script in each app's `index.html` sets the attribute synchronously before paint to prevent flash.

**Tech Stack:** Vite + React 18, Supabase Auth (no schema migration needed — uses `user_metadata.theme_pref`), Lucide icons, vite-plugin-pwa.

**Spec:** `docs/superpowers/specs/2026-05-09-white-theme-design.md` (commit `899c864`).

**Branch:** Work on a new `white-theme` branch off the current `audit-fixes-local` tip.

---

## Phase 0 — Branch + housekeeping

### Task 0: Create the working branch

**Files:**
- (none — git operation only)

- [ ] **Step 1: Create and switch to white-theme branch**

```bash
git -C /c/Users/Administrator/Desktop/expo-full checkout -b white-theme
git -C /c/Users/Administrator/Desktop/expo-full status --short
```

Expected: branch is `white-theme`, no pending changes.

---

## Phase 1 — Foundation: CSS variables, theme.js refactor, dark-mode parity

The goal of Phase 1 is to introduce the variable layer **without changing any visible behavior**. After Phase 1, dark mode looks pixel-identical and there is no toggle yet.

### Task 1: Create `src/themes.css`

**Files:**
- Create: `src/themes.css`

- [ ] **Step 1: Write the CSS file**

```css
/* src/themes.css — single source of truth for theme tokens.
   Consumed by all inline styles via var(--c-*) values exported from theme.js. */

:root, [data-theme="dark"] {
  --c-bg: #000000;
  --c-sf: #0a0a0c;
  --c-sf2: #111114;
  --c-sf3: #18181c;
  --c-bd: #1e1e24;
  --c-bd2: #2a2a32;
  --c-tx: #f0f0f4;
  --c-tm: #7a7a88;
  --c-td: #444450;
  --c-ac: #39BDFF;
  --c-acH: #5FCDFF;
  --c-acSurface: #39BDFF;
  --c-acOnSurface: #ffffff;
  --c-rd: #FF4757;
  --c-rdD: rgba(255,71,87,0.10);
  --c-gn: #2ED573;
  --c-gnD: rgba(46,213,115,0.10);
  --c-or: #FFA502;
  --c-orD: rgba(255,165,2,0.10);
  --c-pu: #A855F7;
  --c-puD: rgba(168,85,247,0.10);
  --c-scrim: rgba(0,0,0,0.7);
  --c-shadow: rgba(0,0,0,0.5);
}

[data-theme="light"] {
  --c-bg: #FFFFFF;
  --c-sf: #FAFAFA;
  --c-sf2: #F2F2F2;
  --c-sf3: #E8E8E8;
  --c-bd: #E0E0E0;
  --c-bd2: #BFBFBF;
  --c-tx: #000000;
  --c-tm: #666666;
  --c-td: #999999;
  --c-ac: #39BDFF;
  --c-acH: #1FA8E8;
  --c-acSurface: #39BDFF;
  --c-acOnSurface: #000000;
  --c-rd: #D62839;
  --c-rdD: rgba(214,40,57,0.10);
  --c-gn: #1E9E5C;
  --c-gnD: rgba(30,158,92,0.10);
  --c-or: #CC7A00;
  --c-orD: rgba(204,122,0,0.10);
  --c-pu: #7B3FBF;
  --c-puD: rgba(123,63,191,0.10);
  --c-scrim: rgba(0,0,0,0.45);
  --c-shadow: rgba(0,0,0,0.15);
}

html, body {
  background: var(--c-bg);
  color: var(--c-tx);
}
```

- [ ] **Step 2: Verify file exists**

```bash
wc -l /c/Users/Administrator/Desktop/expo-full/src/themes.css
```

Expected: ~50 lines.

### Task 2: Refactor `src/theme.js` to CSS variables + add semantic tokens

**Files:**
- Modify: `C:\Users\Administrator\Desktop\expo-full\src\theme.js`

- [ ] **Step 1: Replace the `C` export**

Replace the current `export const C = { ... }` block with:

```js
export const C = {
  // Surfaces
  bg: 'var(--c-bg)',
  sf: 'var(--c-sf)',
  sf2: 'var(--c-sf2)',
  sf3: 'var(--c-sf3)',
  // Borders
  bd: 'var(--c-bd)',
  bd2: 'var(--c-bd2)',
  // Text
  tx: 'var(--c-tx)',
  tm: 'var(--c-tm)',
  td: 'var(--c-td)',
  // EXPO Blue + accent washes
  ac: 'var(--c-ac)',
  acH: 'var(--c-acH)',
  acD: 'rgba(57,189,255,0.10)',
  acM: 'rgba(57,189,255,0.20)',
  ac4D: 'rgba(57,189,255,0.30)',
  acSurface: 'var(--c-acSurface)',
  acOnSurface: 'var(--c-acOnSurface)',
  // Functional
  rd: 'var(--c-rd)', rdD: 'var(--c-rdD)',
  gn: 'var(--c-gn)', gnD: 'var(--c-gnD)',
  or: 'var(--c-or)', orD: 'var(--c-orD)',
  pu: 'var(--c-pu)', puD: 'var(--c-puD)',
  // Theme-agnostic semantic tokens (still vary by mode for shadow/scrim;
  // videoBg is always #000 — cinema convention)
  scrim: 'var(--c-scrim)',
  videoBg: '#000000',
  shadow: 'var(--c-shadow)',
};
```

Leave the file's `FN`/`FB`/`FH` font exports, `uid`, `ytId`, `EXPO_LOGO*` paths, and the trailing constants (`CATEGORIES`, `RESISTANCE_TYPES`, etc.) untouched.

- [ ] **Step 2: Quick sanity grep**

```bash
grep -n "var(--c-" /c/Users/Administrator/Desktop/expo-full/src/theme.js | head
```

Expected: ~20 matches.

### Task 3: Wire `themes.css` + boot script into `index.html` (expo-full)

**Files:**
- Modify: `C:\Users\Administrator\Desktop\expo-full\index.html`

- [ ] **Step 1: Read the file**

```bash
sed -n '1,40p' /c/Users/Administrator/Desktop/expo-full/index.html
```

- [ ] **Step 2: Add the inline boot script as the first `<script>` in `<head>`**

Insert this right after the opening `<head>` tag (or right after the `<meta charset>` line if present):

```html
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

- [ ] **Step 3: Confirm `<meta name="theme-color">` exists; if so, leave the dark value as default — the toggle will update it at runtime**

If absent, add inside `<head>`:

```html
<meta name="theme-color" content="#000000"/>
```

### Task 4: Import `themes.css` in `src/main.jsx`

**Files:**
- Modify: `C:\Users\Administrator\Desktop\expo-full\src\main.jsx`

- [ ] **Step 1: Add the import as the first import statement**

```js
import './themes.css';
```

- [ ] **Step 2: Run dev server and confirm dark mode renders unchanged**

```bash
cd /c/Users/Administrator/Desktop/expo-full && npm run dev
```

Open http://localhost:5173 (or whichever port Vite picked). Expected: identical to before. Inspect element → confirm `<html data-theme="dark">` is set, `body` background is `#000`. Stop the dev server.

### Task 5: Commit Phase 1

- [ ] **Step 1: Stage and commit**

```bash
cd /c/Users/Administrator/Desktop/expo-full
git add src/themes.css src/theme.js src/main.jsx index.html
git commit -m "$(cat <<'EOF'
feat(theme): introduce CSS-vars layer for theme tokens (dark unchanged)

theme.js exports `C.*` as `var(--c-*)` strings; themes.css is the single
source of truth for both modes. Boot script in index.html sets data-theme
synchronously before paint. No visible behavior change yet.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Expected: clean commit, dev server still renders dark mode identically.

---

## Phase 2 — useTheme hook + ThemeToggle component

### Task 6: Write the `useTheme` hook

**Files:**
- Create: `C:\Users\Administrator\Desktop\expo-full\src\hooks\useTheme.js`

- [ ] **Step 1: Verify hooks directory exists**

```bash
ls /c/Users/Administrator/Desktop/expo-full/src/hooks
```

If absent, the existing project already has this directory (per the codebase exploration). If it doesn't, create it: `mkdir -p src/hooks`.

- [ ] **Step 2: Write the hook**

```js
// src/hooks/useTheme.js
// Single source of theme state. Reads/writes data-theme on <html>,
// persists to localStorage instantly, syncs to Supabase Auth user_metadata
// fire-and-forget when authenticated.

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabase';

const KEY = 'expo-theme';

function readCurrent() {
  if (typeof document === 'undefined') return 'dark';
  return document.documentElement.getAttribute('data-theme') || 'dark';
}

function applyTheme(next) {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', next);
  // Update <meta name="theme-color"> so iOS/Android system chrome matches.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', next === 'light' ? '#FFFFFF' : '#000000');
}

export function useTheme() {
  const [theme, setThemeState] = useState(readCurrent);

  const setTheme = useCallback((next) => {
    if (next !== 'light' && next !== 'dark') return;
    setThemeState(next);
    applyTheme(next);
    try { localStorage.setItem(KEY, next); } catch (e) { /* private mode */ }
    // Fire-and-forget Supabase sync; ignore failure (offline, anon, etc.)
    supabase.auth.getUser().then(({ data }) => {
      if (data && data.user) {
        supabase.auth.updateUser({ data: { theme_pref: next } }).catch(() => {});
      }
    }).catch(() => {});
  }, []);

  // On mount: if Supabase has a non-null user_metadata.theme_pref that differs
  // from the current value, adopt it (cross-device sync on login).
  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      if (cancelled || !data || !data.user) return;
      const remote = data.user.user_metadata && data.user.user_metadata.theme_pref;
      if (remote === 'light' || remote === 'dark') {
        const current = readCurrent();
        if (remote !== current) {
          setThemeState(remote);
          applyTheme(remote);
          try { localStorage.setItem(KEY, remote); } catch (e) {}
        }
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  }, [theme, setTheme]);

  return { theme, setTheme, toggleTheme };
}
```

### Task 7: Write the ThemeToggle component

**Files:**
- Create: `C:\Users\Administrator\Desktop\expo-full\src\ThemeToggle.jsx`

- [ ] **Step 1: Check if lucide-react is already a dependency**

```bash
grep -E '"lucide-react"' /c/Users/Administrator/Desktop/expo-full/package.json
```

If present: use the icons directly. If absent: use simple inline SVG glyphs (the snippet below uses inline SVG so no dependency is added).

- [ ] **Step 2: Write the component**

```jsx
// src/ThemeToggle.jsx
import React from 'react';
import { useTheme } from './hooks/useTheme';
import { C } from './theme';

export function ThemeToggle({ size = 36 }) {
  const { theme, toggleTheme } = useTheme();
  const isLight = theme === 'light';
  return (
    <button
      onClick={toggleTheme}
      aria-label={isLight ? 'Switch to dark mode' : 'Switch to light mode'}
      title={isLight ? 'Switch to dark mode' : 'Switch to light mode'}
      style={{
        width: size, height: size,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        background: 'transparent', color: C.tx,
        border: `1px solid ${C.bd}`, borderRadius: 0,
        cursor: 'pointer', padding: 0,
      }}
    >
      {isLight ? (
        // Moon (offer to switch to dark)
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
        </svg>
      ) : (
        // Sun (offer to switch to light)
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4"/>
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>
        </svg>
      )}
    </button>
  );
}
```

### Task 8: Mount ThemeToggle in `App.jsx` header

**Files:**
- Modify: `C:\Users\Administrator\Desktop\expo-full\src\App.jsx`

- [ ] **Step 1: Locate the header**

```bash
grep -n "header\|<header\|TopBar\|topBar\|Logo\|EXPO_LOGO_NAV" /c/Users/Administrator/Desktop/expo-full/src/App.jsx | head -20
```

- [ ] **Step 2: Add the import**

Add near the top imports:

```js
import { ThemeToggle } from './ThemeToggle';
```

- [ ] **Step 3: Render the toggle in the right slot of the header**

The header structure varies; place `<ThemeToggle />` in the right-side flex group that already holds account/avatar/sign-out controls. It must stay visible on mobile, desktop, and on every route the App.jsx shell renders.

- [ ] **Step 4: Run dev server and verify**

```bash
cd /c/Users/Administrator/Desktop/expo-full && npm run dev
```

Open the app. Expected:
- Dark mode by default (or matches OS).
- A sun/moon icon appears in the top-right header.
- Clicking it flips the page colors. White surfaces become #FFFFFF, primary text becomes #000000, EXPO blue stays #39BDFF.
- localStorage `expo-theme` is set on toggle.
- Refresh: theme persists.

Stop the dev server after verifying.

### Task 9: Commit Phase 2

- [ ] **Step 1: Stage and commit**

```bash
cd /c/Users/Administrator/Desktop/expo-full
git add src/hooks/useTheme.js src/ThemeToggle.jsx src/App.jsx
git commit -m "$(cat <<'EOF'
feat(theme): useTheme hook + ThemeToggle, mounted in App.jsx header

Hook owns localStorage + Supabase auth user_metadata sync; toggle is a
36×36 sun/moon button with aria-label. Light mode now reachable via the
header on every authenticated and public route inside App.jsx.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 10: Mount ThemeToggle on standalone surfaces

**Files:**
- Modify: `src/EntryChooser.jsx`, `src/CoachLanding.jsx`, `src/WaitlistView.jsx`, `src/TrySandbox.jsx`, `src/IntakeForm.jsx`

- [ ] **Step 1: For each file, add `import { ThemeToggle } from './ThemeToggle';` and render `<ThemeToggle />` in the top-right of its existing header/nav row**

Each of these is a standalone page with its own header (App.jsx wraps only the auth shell, not these public surfaces). For each file:

1. Locate the top-most JSX block (usually the first `<div>` or `<header>` after the component returns).
2. Add a flex container in the top-right corner with `<ThemeToggle />`.
3. If the file already has a top-right control (e.g. WaitlistView has a small admin link), put ThemeToggle next to it, separated by 8px.

- [ ] **Step 2: Verify each surface in dev**

```bash
cd /c/Users/Administrator/Desktop/expo-full && npm run dev
```

Open `/`, `/coaches`, `/coach/waitlist`, `/try`, `/intake/he` (any locale). Confirm the toggle is present and works on each.

- [ ] **Step 3: Commit**

```bash
cd /c/Users/Administrator/Desktop/expo-full
git add src/EntryChooser.jsx src/CoachLanding.jsx src/WaitlistView.jsx src/TrySandbox.jsx src/IntakeForm.jsx
git commit -m "$(cat <<'EOF'
feat(theme): mount ThemeToggle on public + intake surfaces

EntryChooser, CoachLanding, WaitlistView, TrySandbox, IntakeForm now
expose the toggle in their top-right header rows.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 3 — Light-mode logo assets

### Task 11: Generate light-mode logo PNGs from the BSG black-on-transparent source

**Files:**
- Create: `C:\Users\Administrator\Desktop\expo-full\public\logos\expo-logo-nav-light.png`
- Create: `C:\Users\Administrator\Desktop\expo-full\public\logos\expo-icon-light.png`

The dark-mode `expo-logo-nav.png` is 188×64; `expo-icon-lg.png` is 64×64.

- [ ] **Step 1: Inspect the dark-mode reference dimensions**

```bash
ls -la /c/Users/Administrator/Desktop/expo-full/public/logos/
```

- [ ] **Step 2: Generate the light variants from `_branding/Black 100_.png` using Python (Pillow)**

```bash
cd /c/Users/Administrator/Desktop/expo-full
python -c "
from PIL import Image
src = Image.open('_branding/Black 100_.png').convert('RGBA')
# Trim transparent edges
bbox = src.getbbox()
src = src.crop(bbox)
# Nav variant: 188×64
nav = src.copy()
nav.thumbnail((188, 64), Image.LANCZOS)
canvas = Image.new('RGBA', (188, 64), (0,0,0,0))
canvas.paste(nav, ((188 - nav.width)//2, (64 - nav.height)//2))
canvas.save('public/logos/expo-logo-nav-light.png')
# Icon variant: 64×64 (square crop of just the X mark — keep full logo for now and let CSS scale)
icon = src.copy()
icon.thumbnail((64, 64), Image.LANCZOS)
canvas = Image.new('RGBA', (64, 64), (0,0,0,0))
canvas.paste(icon, ((64 - icon.width)//2, (64 - icon.height)//2))
canvas.save('public/logos/expo-icon-light.png')
print('OK', nav.size, icon.size)
"
```

- [ ] **Step 3: Verify both files exist and are non-empty**

```bash
ls -la /c/Users/Administrator/Desktop/expo-full/public/logos/expo-logo-nav-light.png /c/Users/Administrator/Desktop/expo-full/public/logos/expo-icon-light.png
```

Expected: both files, several KB each.

### Task 12: Update logo consumers to branch on theme

**Files:**
- Modify: every component that currently imports `EXPO_LOGO_NAV`, `EXPO_LOGO`, `EXPO_ICON`, or `EXPO_ICON_LG` from `theme.js`

- [ ] **Step 1: Grep for consumers**

```bash
grep -rn "EXPO_LOGO_NAV\|EXPO_LOGO\b\|EXPO_ICON\b\|EXPO_ICON_LG" /c/Users/Administrator/Desktop/expo-full/src
```

- [ ] **Step 2: For each consumer, add `useTheme` and switch the src**

Pattern:

```jsx
import { useTheme } from './hooks/useTheme';
// ...
const { theme } = useTheme();
const logoSrc = theme === 'light'
  ? '/logos/expo-logo-nav-light.png'
  : '/logos/expo-logo-nav.png';
return <img src={logoSrc} alt="EXPO" ... />;
```

For `EXPO_ICON` consumers, use `expo-icon-light.png` vs the existing icon. If a single import currently powers both display contexts, branch with the same hook.

- [ ] **Step 3: Visual verify in dev for both modes**

The header logo should be white-on-transparent in dark mode and black-on-transparent in light mode.

- [ ] **Step 4: Commit**

```bash
cd /c/Users/Administrator/Desktop/expo-full
git add public/logos/expo-logo-nav-light.png public/logos/expo-icon-light.png src/
git commit -m "$(cat <<'EOF'
feat(theme): light-mode logo variants + theme-aware consumers

Added black-on-transparent PNGs at the existing dark-mode dimensions
(188×64 nav, 64×64 icon). All EXPO_LOGO* consumers now branch on theme.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 4 — Sweep the 89 hardcoded `#000`/`#fff` occurrences (expo-full/src)

### Task 13: Bucket 1 — Verify already-correct cyan-CTA black text needs no change

**Files:**
- Read: `src/CoachLanding.jsx`, `src/CoachDemo.jsx`, `src/CoachChat.jsx`

These use `background: C.ac, color: '#000'` literally. In light mode, this resolves to a cyan button with black text → 10.4:1 AAA. In dark mode, cyan button with black text → also AAA. **No edit needed.** This task is a checkpoint, not a code change.

- [ ] **Step 1: Confirm the literals exist**

```bash
grep -n "color: '#000'" /c/Users/Administrator/Desktop/expo-full/src/CoachLanding.jsx /c/Users/Administrator/Desktop/expo-full/src/CoachDemo.jsx /c/Users/Administrator/Desktop/expo-full/src/CoachChat.jsx
```

Expected: ~10 matches across the three files. Read the surrounding context to confirm each is a button with `background: C.ac`. No edit.

- [ ] **Step 2: Visual check — toggle to light mode, verify the cyan CTAs render with black text and look correct**

### Task 14: Bucket 2 — Replace modal scrims with `C.scrim`

**Files:**
- Modify: `src/App.jsx`, `src/auth.jsx`, `src/TraineeDetail.jsx`, `src/ExerciseSubstitution.jsx`, `src/PlanDiff.jsx`, `src/PlansView.jsx`, `src/ClientPortal.jsx`, `src/WorkoutReview.jsx`

- [ ] **Step 1: Grep for the pattern**

```bash
grep -n "rgba(0, *0, *0, *0\.[0-9]" /c/Users/Administrator/Desktop/expo-full/src/*.jsx
```

- [ ] **Step 2: For each modal-overlay match (look for `position:'fixed', inset:0` or `position: 'fixed', inset: 0` in the same style block), replace `'rgba(0,0,0,0.7)'` → `C.scrim`**

Use Edit per-file with unique `old_string` slices. Do NOT use `replace_all: true` because the same `rgba(0,0,0,0.X)` pattern is used for both scrims AND drop shadows; only the *modal-backdrop* uses are bucket 2.

Examples to fix (one per file shown; there may be more — grep first):

In `src/App.jsx` line 641:
```jsx
{pendingImport && <div style={{position:"fixed",inset:0,zIndex:1100,...,background:"rgba(0,0,0,0.7)",...}} ...>
```
→
```jsx
{pendingImport && <div style={{position:"fixed",inset:0,zIndex:1100,...,background:C.scrim,...}} ...>
```

Repeat for every modal scrim site identified by grep.

- [ ] **Step 3: Visual verify in light mode**

Open a modal in light mode. The backdrop should be a softer dim (`rgba(0,0,0,0.45)`) — visible but not as heavy as in dark mode.

### Task 15: Bucket 2 — Replace video letterboxes with `C.videoBg`

**Files:**
- Modify: `src/ClientPortal.jsx` (5 sites)

- [ ] **Step 1: Grep**

```bash
grep -n "background:'#000'\|background: '#000'" /c/Users/Administrator/Desktop/expo-full/src/ClientPortal.jsx
```

- [ ] **Step 2: For every line that's wrapping a `<video>` element, replace `'#000'` → `C.videoBg`**

There are 5 sites at approximately lines 160, 165, 675, 678, 937, 940 (verify with grep). Each is part of a `<video>` letterbox container or the video element itself.

- [ ] **Step 3: Visual verify — videos still letterbox to black in both modes**

Cinema convention: video bg stays black always.

### Task 16: Bucket 2 — Replace drop shadows with `C.shadow`

**Files:**
- Modify: `src/CoachLanding.jsx`, `src/CoachDemo.jsx`, `src/CoachChat.jsx`, `src/SwUpdateBanner.jsx`, `src/auth.jsx`, `src/PlansView.jsx`

- [ ] **Step 1: Grep**

```bash
grep -nE "boxShadow:.*rgba\(0, *0, *0" /c/Users/Administrator/Desktop/expo-full/src/*.jsx
```

- [ ] **Step 2: Replace the alpha portion of each `boxShadow: '0 8px 24px rgba(0,0,0,0.4)'` with the semantic token**

Pattern transformation:
```jsx
boxShadow: '0 8px 24px rgba(0,0,0,0.4)'
```
→
```jsx
boxShadow: `0 8px 24px ${C.shadow}`
```

(Note the backtick template literal — the shadow position numbers stay literal, only the color uses the var.)

Apply to every match identified by grep. Skip cases where the shadow is intentionally heavier than the theme convention — those are rare. When in doubt, keep the existing literal but make sure it works in light mode visually.

### Task 17: Bucket 3 — Hardcoded `#000` card background in CoachDemo

**Files:**
- Modify: `src/CoachDemo.jsx:2454`

- [ ] **Step 1: Read context**

```bash
sed -n '2445,2465p' /c/Users/Administrator/Desktop/expo-full/src/CoachDemo.jsx
```

- [ ] **Step 2: Decide**

If the card is a UI surface that should follow the theme: replace `'#000'` with `C.bg`. If it's a brand showcase or video letterbox: leave literal with an inline comment explaining why.

- [ ] **Step 3: Apply the chosen edit**

### Task 18: Bucket 3 — Google sign-in button stays literal

**Files:**
- Modify: `src/auth.jsx:192`

- [ ] **Step 1: Add a comment justifying the literal**

The `background: '#fff'` on the Google sign-in button is required by Google's brand guidelines. Leave the literal but add an inline comment:

```jsx
// Google brand: button background must remain white in both modes per
// https://developers.google.com/identity/branding-guidelines
background: '#fff',
```

The button text color was `'#1f1f1f'` (Google's specified gray) — also leave literal.

### Task 19: Bucket 4 — SVG fills

**Files:**
- Modify: `src/App.jsx`, `src/expoMark.jsx` (if exists), `src/OverloadChart.jsx`

- [ ] **Step 1: Grep for hardcoded fills/strokes in JSX**

```bash
grep -nE 'fill="#(fff|000)|stroke="#(fff|000)|fill="white"|fill="black"|stroke="white"|stroke="black"' /c/Users/Administrator/Desktop/expo-full/src/*.jsx
```

- [ ] **Step 2: Replace with `currentColor` where the surrounding context's `color` is the right tone**

Pattern:
```jsx
<svg ... color={C.tx}>
  <path stroke="#fff" .../> {/* before */}
  <path stroke="currentColor" .../> {/* after */}
</svg>
```

- [ ] **Step 3: For chart components (OverloadChart), confirm axes/labels use `C.tx` / `C.tm` rather than literal colors**

### Task 20: Commit Phase 4

```bash
cd /c/Users/Administrator/Desktop/expo-full
git add src/
git commit -m "$(cat <<'EOF'
refactor(theme): sweep hardcoded #000/#fff into semantic tokens (expo-full)

Modal scrims → C.scrim; video letterboxes → C.videoBg; drop shadows →
C.shadow; SVG fills → currentColor. Google brand button kept literal
with inline justification.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 5 — Mirror in `expo-il/src` (marketing site)

### Task 21: Create `expo-il/src/themes.css`

**Files:**
- Create: `C:\Users\Administrator\Desktop\expo-full\expo-il\src\themes.css`

- [ ] **Step 1: Copy the same content as `src/themes.css`**

Use the identical CSS from Task 1. The marketing site shares the same brand tokens — this is intentional.

### Task 22: Refactor `expo-il/src/theme.js` to CSS variables + dual base64 logos

**Files:**
- Modify: `C:\Users\Administrator\Desktop\expo-full\expo-il\src\theme.js`

- [ ] **Step 1: Replace the `C` export with the CSS-vars version (matches Task 2)**

Use the same shape as `src/theme.js` plus the existing extras (`ac4D`).

- [ ] **Step 2: Generate a black-on-transparent base64 for the logo**

```bash
cd /c/Users/Administrator/Desktop/expo-full
python -c "
from PIL import Image
import base64, io
src = Image.open('_branding/Black 100_.png').convert('RGBA')
bbox = src.getbbox()
src = src.crop(bbox)
src.thumbnail((400, 144), Image.LANCZOS)
canvas = Image.new('RGBA', (400, 144), (0,0,0,0))
canvas.paste(src, ((400 - src.width)//2, (144 - src.height)//2))
buf = io.BytesIO()
canvas.save(buf, format='PNG', optimize=True)
print('data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode())
" > /tmp/logo-light-base64.txt
wc -c /tmp/logo-light-base64.txt
```

- [ ] **Step 3: Edit `expo-il/src/theme.js`**

Add the new export alongside the existing `EXPO_LOGO_NAV`:

```js
export const EXPO_LOGO_NAV_DARK = "data:image/png;base64,..."; // existing white-on-transparent
export const EXPO_LOGO_NAV_LIGHT = "data:image/png;base64,..."; // new black-on-transparent (from /tmp/logo-light-base64.txt)
export const EXPO_LOGO_NAV = EXPO_LOGO_NAV_DARK; // backwards-compat
export function pickLogo(theme) {
  return theme === 'light' ? EXPO_LOGO_NAV_LIGHT : EXPO_LOGO_NAV_DARK;
}
```

### Task 23: Wire `themes.css` + boot script into `expo-il/index.html` and `main.jsx`

**Files:**
- Modify: `C:\Users\Administrator\Desktop\expo-full\expo-il\index.html`
- Modify: `C:\Users\Administrator\Desktop\expo-full\expo-il\src\main.jsx`

- [ ] **Step 1: Same boot script as Task 3 in `expo-il/index.html`**

- [ ] **Step 2: Add `import './themes.css';` at the top of `expo-il/src/main.jsx`**

### Task 24: Mount ThemeToggle in expo-il

**Files:**
- Create: `C:\Users\Administrator\Desktop\expo-full\expo-il\src\components\ThemeToggle.jsx`
- Create: `C:\Users\Administrator\Desktop\expo-full\expo-il\src\hooks\useTheme.js`
- Modify: `C:\Users\Administrator\Desktop\expo-full\expo-il\src\App.jsx`

- [ ] **Step 1: Copy `useTheme.js` from expo-full**

The expo-il marketing site has no Supabase auth integration for visitors (it's anonymous), but it imports a Supabase client too. If `expo-il/src/supabase.js` exists, the same hook works. If not, write a stripped version that does only localStorage:

```js
// expo-il/src/hooks/useTheme.js — anonymous version (no Supabase sync)
import { useCallback, useEffect, useState } from 'react';
const KEY = 'expo-theme';
function readCurrent() {
  if (typeof document === 'undefined') return 'dark';
  return document.documentElement.getAttribute('data-theme') || 'dark';
}
function applyTheme(next) {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', next);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', next === 'light' ? '#FFFFFF' : '#000000');
}
export function useTheme() {
  const [theme, setThemeState] = useState(readCurrent);
  const setTheme = useCallback((next) => {
    if (next !== 'light' && next !== 'dark') return;
    setThemeState(next);
    applyTheme(next);
    try { localStorage.setItem(KEY, next); } catch (e) {}
  }, []);
  const toggleTheme = useCallback(() => setTheme(theme === 'light' ? 'dark' : 'light'), [theme, setTheme]);
  return { theme, setTheme, toggleTheme };
}
```

- [ ] **Step 2: Copy `ThemeToggle.jsx` from expo-full into `expo-il/src/components/ThemeToggle.jsx`**

Adjust the import path to `'../hooks/useTheme'` and `'../theme'`.

- [ ] **Step 3: Mount in `expo-il/src/App.jsx`**

Add `<ThemeToggle />` to the existing top nav row. Update logo consumers to use `pickLogo(theme)`.

### Task 25: Sweep expo-il (17 occurrences)

**Files:**
- Modify: `expo-il/src/App.jsx` (13 sites), `expo-il/src/Chat.jsx` (3 sites)

- [ ] **Step 1: Grep**

```bash
grep -nE "'#000'|'#fff'|rgba\(0, *0, *0|rgba\(255, *255, *255" /c/Users/Administrator/Desktop/expo-full/expo-il/src/App.jsx /c/Users/Administrator/Desktop/expo-full/expo-il/src/Chat.jsx
```

- [ ] **Step 2: Apply the same bucket categorization as Task 14–19**

- Modal scrims → `C.scrim`
- Drop shadows → `C.shadow`
- Video letterboxes → `C.videoBg`
- Theme-aware text/bg → `C.tx` / `C.bg`
- Brand-required literals (Google button etc.) → keep with comment

### Task 26: Commit Phase 5

```bash
cd /c/Users/Administrator/Desktop/expo-full
git add expo-il/
git commit -m "$(cat <<'EOF'
feat(theme): mirror white-theme runtime toggle on expo-il marketing

Same CSS-vars architecture, ThemeToggle in nav, dual base64 logos for
the inlined hero mark, sweep of 17 hardcoded color sites across App.jsx
and Chat.jsx.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 6 — PWA service worker cache bump

### Task 27: Bump SW cache version

**Files:**
- Modify: `vite.config.js` (PWA plugin section) or wherever the cache name is defined

- [ ] **Step 1: Locate the SW config**

```bash
grep -n "cacheId\|cacheName\|workbox\|VitePWA" /c/Users/Administrator/Desktop/expo-full/vite.config.js
```

- [ ] **Step 2: Bump the cacheId / cacheName suffix**

Add or increment a version suffix so existing PWA installs invalidate the cached bundle and pull the new themes.css. Example:

```js
VitePWA({
  workbox: {
    cacheId: 'expo-app-v2-white-theme', // bumped 2026-05-09
    // ...
  }
})
```

- [ ] **Step 3: Commit**

```bash
cd /c/Users/Administrator/Desktop/expo-full
git add vite.config.js
git commit -m "$(cat <<'EOF'
chore(pwa): bump SW cache id for white-theme rollout

Forces existing PWA installs to fetch the new bundle (with themes.css
and the toggle) on next open. The idle-only auto-update banner handles
user notification.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 7 — Visual + persistence verification

### Task 28: Visual regression matrix

- [ ] **Step 1: Start dev server**

```bash
cd /c/Users/Administrator/Desktop/expo-full && npm run dev
```

- [ ] **Step 2: For each surface in the matrix below, screenshot dark + light, side-by-side compare**

Coach surfaces (App.jsx shell): Dashboard, Trainees, Programs (PlansView), Trainee Detail, Plan Editor, Workout Review, SmartImport, Chat Audit, Waitlist
Athlete: ClientPortal home, Workout day view, Comments + drawing canvas
Public: EntryChooser (`/`), CoachLanding (`/coaches`), WaitlistView, TrySandbox (`/try`), IntakeForm (`/intake/he`)
Demo: `/demo`, `/demo/trainee`, `/demo/coach`
Marketing (`expo-il`): home, /coaches, program detail page

For each surface, verify:
- Both modes are readable.
- No white-on-white or black-on-black surprises.
- Cyan CTAs use `acOnSurface` text in both modes (white in dark, black in light).
- Cards/borders/inputs have visible separation.

Issues found go to a punch list — fix in a follow-up commit.

### Task 29: Persistence test

- [ ] **Step 1: Test cross-device sync**

1. Log in as `ohadyproductions@gmail.com` in one browser, toggle to light.
2. Open another browser (incognito), log in as the same user.
3. Expected: light mode adopted automatically.

- [ ] **Step 2: Test prefers-color-scheme on first visit**

1. Clear localStorage in a private window.
2. Set OS to light mode → reload site → expect light.
3. Set OS to dark mode → reload site → expect dark.

- [ ] **Step 3: Test PWA install path**

1. If a PWA is installed from the existing prod, install a fresh preview build.
2. Open it offline. Confirm the toggle works without network.

---

## Phase 8 — Deploy

### Task 30: Push branch + open PR

- [ ] **Step 1: Push**

```bash
cd /c/Users/Administrator/Desktop/expo-full
git push -u origin white-theme
```

- [ ] **Step 2: Open PR via gh CLI**

```bash
gh pr create --title "feat(theme): white-theme runtime toggle" --body "$(cat <<'EOF'
## Summary
- BSG-faithful light/dark theme toggle on every product surface.
- CSS-variables architecture; dark mode pixel-identical to before.
- Default = OS prefers-color-scheme; user toggle persists in localStorage + Supabase Auth user_metadata.
- Sweep of 89 hardcoded #000/#fff occurrences into semantic tokens (scrim, videoBg, shadow, acOnSurface).

## Test plan
- [ ] Visual check on Dashboard, Trainees, Programs, Trainee Detail, Plan Editor, Workout Review, SmartImport, Chat Audit, ClientPortal, /demo, EntryChooser, CoachLanding, WaitlistView, TrySandbox, IntakeForm, expo-il home, /coaches.
- [ ] Toggle in dev: localStorage updates, attribute flips, no full reload.
- [ ] Cross-browser persistence via Supabase user_metadata.
- [ ] PWA install picks up new bundle (cache-id bumped).
- [ ] axe-core: no contrast regressions on light mode.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

### Task 31: Final memory update

- [ ] **Step 1: Mark spec memory as deployed once merged**

After the PR merges and prod deploy is verified, update `project_white_theme_spec.md` to a deployed status with the merge commit SHA.

---

## Self-review checklist (run after writing the plan)

1. **Spec coverage:**
   - Goal ✓ (Tasks 1–31)
   - Brand fidelity / palette ✓ (Tasks 1, 2, 21, 22)
   - CSS-vars architecture ✓ (Tasks 1, 2, 21, 22)
   - Toggle UX + mount points ✓ (Tasks 7, 8, 10, 24)
   - Persistence (localStorage + Supabase user_metadata) ✓ (Task 6, 29)
   - Boot script ✓ (Tasks 3, 23)
   - Hardcoded sweep (4 buckets, 89 sites, 20 files) ✓ (Tasks 13–19, 25)
   - Logo asset variants + consumer branching ✓ (Tasks 11, 12, 22)
   - PWA SW cache bump ✓ (Task 27)
   - Testing plan ✓ (Tasks 28, 29)

2. **Placeholder scan:** No "TBD"/"TODO"/"implement later" found. Each step gives exact paths, exact commands, exact code.

3. **Type consistency:**
   - `useTheme()` returns `{ theme, setTheme, toggleTheme }` consistently in Tasks 6 and 7.
   - `pickLogo(theme)` defined in Task 22 referenced in Task 24.
   - `C.scrim`, `C.videoBg`, `C.shadow`, `C.acOnSurface` defined in Tasks 1+2 referenced in Tasks 14–17 and 25.

4. **Open items:** None blocking. Two minor opens from the spec (toggle icon style, intake-page visibility) — defaults applied (sun/moon glyph, visible on intake).
