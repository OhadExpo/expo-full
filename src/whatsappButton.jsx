import React from 'react';
import { FN } from './theme';

// Strip non-digits and prepend Israeli country code if the user typed a local
// 0XX-XXX-XXXX style number. WhatsApp's wa.me deeplink wants raw E.164
// without a +, so "972548124381" not "+972 54 812-4381".
export function normalizePhoneIL(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('972')) return digits;
  if (digits.startsWith('0')) return '972' + digits.slice(1);
  return digits;
}

// Build the prefilled Hebrew check-in, conjugated to the athlete's gender.
// `gender` is 'male' | 'female' | undefined. Hebrew 2nd-person is gendered,
// so we conjugate the verbs that differ (קופץ/קופצת, בוא/בואי). When gender
// is unknown we fall back to forms that read naturally without committing to
// a gender: past-tense "התאמנת" + the "אותך" pronoun are spelled identically
// for both, and "נראה"/"נתאם" are inclusive ("let's").
export function checkInMessage({ firstName, days, gender }) {
  const dormant = days != null;
  if (gender === 'male') {
    return dormant
      ? `היי ${firstName}, מזמן לא התאמנת! הכל טוב? בוא נתאם אימון לשבוע הקרוב.`
      : `היי ${firstName}, מה נשמע? מתי קופץ לאימון?`;
  }
  if (gender === 'female') {
    return dormant
      ? `היי ${firstName}, מזמן לא התאמנת! הכל טוב? בואי נתאם אימון לשבוע הקרוב.`
      : `היי ${firstName}, מה נשמע? מתי קופצת לאימון?`;
  }
  // Unknown gender — neutral-but-personal fallback.
  return dormant
    ? `היי ${firstName}, מזמן לא התאמנת! הכל טוב אצלך? מתי נתאם אימון לשבוע הקרוב?`
    : `היי ${firstName}, מה נשמע? מתי נראה אותך באימון?`;
}

// Darker brand green for better contrast on cyan cards in light mode.
// #25d366 (WhatsApp brand light) washes out on #39BDFF; #128C7E is
// WhatsApp's own secondary darker green and reads clearly here.
const WA_GREEN = '#128C7E';

// Round green pill with the WhatsApp logo. Click → wa.me with prefilled
// Hebrew check-in. `days` (optional) becomes part of the dormant copy; when
// omitted, sends a generic catch-up. Returns null when no usable phone.
export function WhatsAppCheckInButton({ name, phone, days, gender, size = 16, padding = '1px 2px' }) {
  const num = normalizePhoneIL(phone);
  if (!num) return null;
  const handleClick = (e) => {
    e.stopPropagation();
    const firstName = (name || '').split(/\s+/)[0] || name || '';
    const url = `https://wa.me/${num}?text=${encodeURIComponent(checkInMessage({ firstName, days, gender }))}`;
    window.open(url, '_blank', 'noopener');
  };
  return (
    <button onClick={handleClick}
      title={`Send WhatsApp check-in to ${name || ''}`}
      style={{
        background: 'var(--c-badgeBg, var(--c-sf))', border: `1px solid ${WA_GREEN}`, color: WA_GREEN,
        borderRadius: 0, padding, fontFamily: FN, fontSize: 10,
        fontWeight: 700, letterSpacing: '0.18em', cursor: 'pointer',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      }}>
      <svg width={size} height={size} viewBox="0 0 24 24" fill={WA_GREEN} aria-hidden="true">
        <path d="M19.05 4.91A9.82 9.82 0 0 0 12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.21h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.91-7.01zM12.04 20.15h-.01a8.23 8.23 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.18 8.18 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.25-8.24 2.2 0 4.27.86 5.83 2.42a8.19 8.19 0 0 1 2.41 5.83c0 4.54-3.7 8.23-8.24 8.23zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.25-.64.81-.78.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-2-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.39.11-.51.11-.11.25-.29.37-.43.12-.14.16-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.42-.14-.01-.31-.01-.48-.01a.92.92 0 0 0-.66.31c-.23.25-.87.85-.87 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.14-1.18-.06-.1-.22-.16-.47-.29z"/>
      </svg>
    </button>
  );
}
