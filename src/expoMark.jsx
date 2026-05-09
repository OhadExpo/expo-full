// Inline EXPO logo. The nav PNG packs caret + wordmark + transparent
// breathing room above and below; the visible wordmark sits in the
// lower ~63% of the image, so geometric centering puts it slightly
// below the line's optical middle.
//
// Lift history:
//   - translateY(-18.5%) — original; tuned at h=22, overcorrected at h=36.
//   - 0                  — overcorrected the other way (logo sat too low).
//   - translateY(-3px)   — current; fixed-pixel offset works across all
//                          sizes we use (h=14..50).
//
// Theme awareness: in light mode the cyan caret survives only on the
// black-on-transparent variant in /logos/expo-logo-nav-light.png. The
// dark variant has a white wordmark which would disappear on white bg.
// `theme` prop overrides — needed for surfaces wrapped in
// data-theme="dark" while light-mode rollout is gated to the coach app.
import React from 'react';
import { useTheme } from './hooks/useTheme';

export function EXPOMark({ height = 22, style = {}, theme: overrideTheme }) {
  const { theme: ctxTheme } = useTheme();
  const theme = overrideTheme || ctxTheme;
  const src = theme === 'light'
    ? '/logos/expo-logo-nav-light.png'
    : '/logos/expo-logo-nav.png';
  return (
    <img
      src={src}
      alt="EXPO"
      style={{
        height, width: 'auto',
        display: 'inline-block',
        verticalAlign: 'middle',
        transform: 'translateY(-3px)',
        ...style,
      }}
    />
  );
}
