// Inline EXPO logo. The nav PNG packs caret + wordmark + transparent
// breathing room above and below. We previously applied a translateY
// percentage to lift the wordmark onto the line's optical middle; that
// percentage was tuned at h=22 and overcorrected at h=36 (wordmark
// floated above adjacent menu text). Now we let `align-items: center`
// on the parent do the centering — at the heights we use today (36 in
// nav, 14 in footers) the wordmark reads as visually centered without
// the transform.
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
        ...style,
      }}
    />
  );
}
