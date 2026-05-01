// Small inline EXPO logo used wherever the brand name appears as a label/
// kicker/footer divider. Renders the trimmed nav PNG so the wordmark always
// matches the brand and never drifts into "just text".
//
// The nav PNG carries built-in transparent breathing room top + bottom so the
// caret tip survives sub-pixel rendering at small heights. Don't add margins
// here that would clip it back off — let the parent flex container center it.
import React from 'react';
import { EXPO_LOGO_NAV } from './theme';

export function EXPOMark({ height = 14, style = {} }) {
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
