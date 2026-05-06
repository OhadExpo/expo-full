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
import React from 'react';
import { EXPO_LOGO_NAV } from './theme';

export function EXPOMark({ height = 22, style = {} }) {
  return (
    <img
      src={EXPO_LOGO_NAV}
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
