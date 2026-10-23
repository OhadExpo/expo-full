// /demo/club - the team version's front door (team version #904, A7). What the club zone does, in the product's own
// terms, and the two public demos (one basketball, one football). No prices and no claims beyond what the zone does
// today; a prospect's own branded demo (/demo/club/<prospect>) is shared by link and never listed here.
import React, { useState } from 'react';
import { FN, FB } from '../theme';
import { GALIL, SHARON } from './demoClubs';

const COPY = {
  en: {
    kicker: 'EXPO TEAMS', title: 'The performance office of a club, in one place',
    sub: 'For Israeli basketball and football clubs: availability, readiness, medical, sessions, games and the head coach\'s report - Hebrew and English, on a phone, a tablet and a laptop. No hardware.',
    features: [
      ['Morning brief', 'Who is available, who needs a change today and what is next, built from the check-ins, the medical files and the calendar.'],
      ['Readiness', 'Sleep, energy and pain for the whole squad in a minute; pain or a bad night becomes a concrete change to today\'s session.'],
      ['Medical and return to play', 'The physio owns each file - status, pain, notes, the return target. A player coming back is flagged before his load jumps.'],
      ['Every session logged', 'Attendance per slot, the team S&C block, personal lifts, minutes played - per player and per team.'],
      ['Games and the league', 'Results, the table and player numbers next to the squad\'s training history.'],
      ['Report in one tap', 'The head coach\'s daily report, ready to send on WhatsApp.'],
    ],
    demos: 'Open a demo', note: 'Demo clubs, players and numbers are generated. Press anything - nothing is saved.', open: 'Open', lang: 'עב',
    sport: { basketball: 'Basketball', soccer: 'Football' },
  },
  he: {
    kicker: 'EXPO TEAMS', title: 'מחלקת הביצועים של המועדון, במקום אחד',
    sub: 'למועדוני כדורסל וכדורגל בישראל: זמינות, מוכנות, רפואה, אימונים, משחקים ודוח למאמן הראשי - בעברית ובאנגלית, בטלפון, בטאבלט ובמחשב. בלי חומרה.',
    features: [
      ['תדריך בוקר', 'מי זמין, מי צריך שינוי היום ומה הבא בלוח - נבנה מהצ׳ק-אין, מהתיקים הרפואיים ומהלוח.'],
      ['מוכנות', 'שינה, אנרגיה וכאב לכל הסגל בדקה. כאב או לילה רע הופכים לשינוי מעשי באימון של היום.'],
      ['רפואה וחזרה למשחק', 'הפיזיותרפיסט מנהל כל תיק - סטטוס, כאב, מעקב ויעד חזרה. שחקן שחוזר מסומן לפני שהעומס שלו קופץ.'],
      ['כל אימון מתועד', 'נוכחות לכל אימון, בלוק הכוח הקבוצתי, חדר כושר אישי ודקות משחק - לכל שחקן ולקבוצה.'],
      ['משחקים והליגה', 'תוצאות, טבלה ומספרי השחקנים ליד היסטוריית האימונים של הסגל.'],
      ['דוח בלחיצה', 'הדוח היומי של המאמן הראשי, מוכן לשליחה בוואטסאפ.'],
    ],
    demos: 'פתח הדגמה', note: 'המועדונים, השחקנים והמספרים בהדגמה נוצרו להדגמה. אפשר ללחוץ על הכל - שום דבר לא נשמר.', open: 'פתח', lang: 'EN',
    sport: { basketball: 'כדורסל', soccer: 'כדורגל' },
  },
};

export default function ClubDemoIndex({ lang: lang0 = 'en' }) {
  const [lang, setLang] = useState(lang0 === 'he' ? 'he' : 'en');
  const t = COPY[lang]; const he = lang === 'he';
  const ink = '#0E0F12', dim = '#4F5663', line = 'rgba(14,15,18,0.14)';
  const go = (club) => { try { localStorage.setItem('expo-collapse:bhbc-lang', JSON.stringify(lang)); } catch { /* */ } window.location.assign(club.routeBase + '/overview'); };
  return (
    <div dir={he ? 'rtl' : 'ltr'} lang={lang} style={{ minHeight: '100vh', background: '#F4F5F7', color: ink, fontFamily: FB }}>
      <div style={{ maxWidth: 980, margin: '0 auto', padding: '28px 16px 48px', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 28 }}>
          <span style={{ fontFamily: FN, fontSize: 12, fontWeight: 800, letterSpacing: '0.14em' }}>{t.kicker}</span>
          <button type="button" onClick={() => setLang(he ? 'en' : 'he')} style={{ height: 36, minWidth: 48, padding: '0 12px', border: `1px solid ${line}`, background: '#fff', color: ink, fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', cursor: 'pointer' }}>{t.lang}</button>
        </div>
        <h1 style={{ fontFamily: FN, fontSize: 'clamp(24px, 5vw, 38px)', lineHeight: 1.15, fontWeight: 800, margin: '0 0 14px' }}>{t.title}</h1>
        <p style={{ fontSize: 15, lineHeight: 1.6, color: dim, margin: '0 0 30px', maxWidth: 720 }}>{t.sub}</p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: 1, background: line, border: `1px solid ${line}`, marginBottom: 34 }}>
          {t.features.map(([h, b]) => (
            <div key={h} style={{ background: '#fff', padding: '16px 18px' }}>
              <div style={{ fontFamily: FN, fontSize: 12, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>{h}</div>
              <div style={{ fontSize: 13.5, lineHeight: 1.55, color: dim }}>{b}</div>
            </div>
          ))}
        </div>

        <div style={{ fontFamily: FN, fontSize: 12, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 12 }}>{t.demos}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 14 }}>
          {[GALIL, SHARON].map((c) => (
            <button key={c.id} type="button" data-club-demo={c.id} onClick={() => go(c)}
              style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px', border: 'none', borderTop: `4px solid ${c.palette.accent}`, background: c.palette.primaryDeep, color: '#fff', textAlign: 'start', cursor: 'pointer', fontFamily: FN }}>
              <img src={c.crestW} alt="" style={{ width: 44, height: 'auto', flexShrink: 0 }} />
              <span style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, flex: 1 }}>
                <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: '0.04em' }}>{he ? c.shortHe : c.short}</span>
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', opacity: 0.8 }}>{t.sport[c.sport]}</span>
              </span>
              <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: c.palette.accent }}>{t.open} {he ? '←' : '→'}</span>
            </button>
          ))}
        </div>
        <p style={{ fontSize: 12, color: dim, marginTop: 14 }}>{t.note}</p>
      </div>
    </div>
  );
}
