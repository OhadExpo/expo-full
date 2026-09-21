// CLICK-TO-LOAD FOR THE GOOGLE CALENDAR EMBEDS.
//
// From Ohad's checklist, 21.9: "תבדוק אם צריך אישור עוגיות" (is cookie consent
// needed) and "תבדוק הטמעות צד שלישי" (check third-party embeds).
//
// WHAT THE SITE ACTUALLY DOES, audited rather than assumed. Its OWN storage is
// three things and none of them need consent anywhere:
//   sessionStorage  a chunk-reload guard, and "exit prompt already seen"
//   localStorage    the chosen language
//   Vercel Analytics, which is cookieless by design
//
// The exception is these two iframes. calendar.google.com is a THIRD PARTY, and
// loading it drops Google's cookies in the visitor's browser before they have
// agreed to anything or even seen the page they came for. That is the one thing
// on expo-il that a consent rule would actually bite on — and it is also the
// heaviest thing on the page.
//
// Click-to-load answers both: nothing from Google is requested until the
// visitor asks for the calendar, and when they click, that IS the consent. No
// banner, nothing to dismiss, and the page gets faster. The choice is kept for
// the session so moving between the two pages does not ask twice.
//
// NOTE the fallbacks are already on the page beside this: a WhatsApp link and
// the "open in a new tab" scheduler URL. Nobody is blocked if they never click.
import React, { useState } from 'react';
import { C, FN } from './theme';

const SEEN_KEY = 'expo-il-cal-ok';

export default function ConsentFrame({ src, title, heb, height, filter }) {
  const [open, setOpen] = useState(() => {
    try { return sessionStorage.getItem(SEEN_KEY) === '1'; } catch { return false; }
  });
  const show = () => {
    try { sessionStorage.setItem(SEEN_KEY, '1'); } catch { /* private mode */ }
    setOpen(true);
  };

  if (open) {
    return (
      <iframe
        src={src}
        title={title}
        loading="lazy"
        style={{ width: '100%', height, border: 'none', display: 'block', background: '#FFFFFF',
          filter, WebkitFilter: filter }}
      />
    );
  }

  return (
    <div style={{
      width: '100%', height, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 14,
      background: C.bg, textAlign: 'center', padding: '24px 20px', boxSizing: 'border-box',
    }}>
      <div style={{ fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.18em',
        textTransform: 'uppercase', color: C.ac }}>
        {heb ? 'יומן Google' : 'Google Calendar'}
      </div>
      <p style={{ margin: 0, maxWidth: 420, fontSize: 14, lineHeight: 1.6, color: C.tm }}>
        {heb
          ? 'היומן נטען מ-Google, וטעינה שלו שומרת קובצי עוגיות של Google בדפדפן שלך. לוחצים כדי לטעון אותו ולראות את הזמנים הפנויים.'
          : 'The calendar loads from Google, and loading it stores Google cookies in your browser. Tap to load it and see the open slots.'}
      </p>
      <button type="button" onClick={show} style={{
        fontFamily: FN, fontSize: 12, fontWeight: 800, letterSpacing: '0.18em',
        textTransform: 'uppercase', color: '#06131b', background: '#39BDFF',
        border: '1px solid #39BDFF', borderRadius: 0, padding: '14px 26px',
        minHeight: 44, cursor: 'pointer',
      }}>
        {heb ? 'הצגת היומן' : 'Show the calendar'}
      </button>
    </div>
  );
}
