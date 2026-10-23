// THE THREE DEMOS, ONE TAP APART (#966, Ohad 24.10: "the demo for teams is very hard to see on the demo sites... i had
// to scroll all the way down... fix it"). Measured before: the teams demo's only door on /demo sat at 8.7 of 8.8 phone
// screens (a footer link), and /demo/coach, /demo/athlete and /try had none at all. This row opens every demo surface:
// COACH · ATHLETE · TEAMS, the current one lit, so a club director lands on any demo and sees his own in the first
// screen. Real links (a new page, a shareable URL), one joined 36px control in the house style (JoinedButtons).
import React from 'react';
import { C, FN } from './theme';

const DEMOS = [
  { k: 'coach', href: '/demo/coach', en: 'Coach', he: 'מאמן' },
  { k: 'athlete', href: '/demo/athlete', en: 'Athlete', he: 'מתאמן' },
  { k: 'teams', href: '/demo/club', en: 'Teams', he: 'קבוצות' },
];

export default function DemoSwitch({ current = null, he = false, accent = C.ac, onAccent = '#000', style = null }) {
  return (
    <nav data-demo-switch aria-label={he ? 'הדגמות' : 'Demos'} dir={he ? 'rtl' : 'ltr'}
      style={{ display: 'flex', justifyContent: 'center', padding: '10px 16px', background: 'var(--c-bg)', borderBottom: '1px solid var(--c-cardBd)', ...style }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'auto repeat(3, minmax(0, 1fr))', gap: 1, background: 'var(--c-cardBd)', border: '1px solid var(--c-cardBd)', width: '100%', maxWidth: 560 }}>
        <span style={{ display: 'flex', alignItems: 'center', height: 36, padding: '0 12px', background: 'var(--c-sf)', fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--c-td)', whiteSpace: 'nowrap' }}>{he ? 'הדגמה' : 'Demo'}</span>
        {DEMOS.map((d) => {
          const on = d.k === current;
          return (
            <a key={d.k} href={d.k === 'teams' && he ? `${d.href}?lang=he` : d.href} aria-current={on ? 'page' : undefined} data-demo-door={d.k}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 36, minWidth: 0, padding: '0 10px', background: on ? accent : 'var(--c-sf)', color: on ? onAccent : 'var(--c-tx)', fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', textDecoration: 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {he ? d.he : d.en}
            </a>
          );
        })}
      </div>
    </nav>
  );
}
