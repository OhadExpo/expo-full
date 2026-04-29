// Small inline EXPO logo used wherever the brand name appears as a label/
// kicker/footer divider. Renders the trimmed nav PNG so the wordmark always
// matches the brand and never drifts into "just text".
//
// Default height is 11px to match adjacent FN-letter-spaced kickers; pass a
// different height when used in a different size context (e.g. h=18 in a
// hero kicker).
import React from 'react';
import { EXPO_LOGO_NAV } from './theme';

export function EXPOMark({ height = 11, style = {} }) {
  return (
    <img
      src={EXPO_LOGO_NAV}
      alt="EXPO"
      style={{
        height, width: 'auto',
        display: 'inline-block',
        verticalAlign: 'middle',
        // Lift the wordmark by 1px so it sits on the same optical baseline as
        // adjacent uppercase letters in mono fonts (Nord/JetBrains).
        marginBottom: 2,
        ...style,
      }}
    />
  );
}
