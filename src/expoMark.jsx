// Inline EXPO logo. The nav PNG packs caret + wordmark + transparent
// breathing room above and below; the visible wordmark sits in the lower ~63%
// of the image so geometric centering puts it ~13% below the line's optical
// middle. The translateY(-13%) here lifts the wordmark onto the line center
// without changing the layout box (so adjacent text still flows correctly,
// and the caret tip stays inside the buffer that the asset already includes).
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
        transform: 'translateY(-18.5%)',
        ...style,
      }}
    />
  );
}
