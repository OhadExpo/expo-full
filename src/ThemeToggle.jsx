// src/ThemeToggle.jsx
// Sun/moon icon button. Inline SVG (no lucide dep). Renders 36x36 hit area
// with a hairline border that follows the theme. Updates data-theme on
// every click via the useTheme hook.

import React from 'react';
import { useTheme } from './hooks/useTheme';
import { C } from './theme';

export function ThemeToggle({ size = 36, style = {} }) {
  const { theme, toggleTheme } = useTheme();
  const isLight = theme === 'light';
  const label = isLight ? 'Switch to dark mode' : 'Switch to light mode';
  return (
    <button
      onClick={toggleTheme}
      aria-label={label}
      title={label}
      style={{
        width: size, height: size,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        background: 'transparent', color: C.tx,
        border: `1px solid ${C.bd}`, borderRadius: 0,
        cursor: 'pointer', padding: 0, flexShrink: 0,
        ...style,
      }}
    >
      {isLight ? (
        // Moon — clicking offers a switch back to dark.
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
        </svg>
      ) : (
        // Sun — clicking offers a switch to light.
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4"/>
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>
        </svg>
      )}
    </button>
  );
}
