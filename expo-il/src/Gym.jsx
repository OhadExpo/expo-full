// Gym — physical-gym landing page on expo-il.co.il.
//
// Complete product, brand-precise. Sections (top→bottom):
//   1. Sticky header (logo + lang switch + back-to-chooser)
//   2. Hero — name, tagline, primary booking CTA
//   3. Stats strip — credibility numbers
//   4. "Why in-person" — 3 differentiator blocks
//   5. "What's included" — 4-card package breakdown
//   6. Studio location card
//   7. LIVE calendar — pulls availability + writes bookings to Supabase
//   8. Testimonials
//   9. FAQ
//   10. Footer — contact, IG, WhatsApp
//
// Bilingual (he/en) throughout. Hairline cyan borders match EXPO brand
// rules (cyan 30% alpha, 1px). Same Supabase tables the coach app uses
// (coach_booking_settings / booking_availability / bookings), accessed
// through plain REST so the bundle stays thin.

import React, { useEffect, useRef, useState } from 'react';
import { Analytics, track } from '@vercel/analytics/react';
import { C, FN, FB, EXPO_LOGO_NAV, CONTACT } from './theme';
import { useT, useLang, setLang } from './i18n';
import { GCAL_GYM } from './EntryChooser';

function trackAndOpen(event, payload) {
  try { track(event, payload || {}); } catch {}
}

// (Previously contained Supabase-backed booking helpers — removed
// when we switched to Google Calendar appointment-scheduler embed.)

// ─── Main page ───────────────────────────────────────────────────────
export default function Gym() {
  const [lang] = useLang();
  const heb = lang === 'he';
  const calendarRef = useRef(null);
  const scrollToCalendar = () => calendarRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // Sections render visible by default — earlier scroll-fade was hiding
  // content when the IntersectionObserver didn't fire (slow networks,
  // fullPage screenshot capture, etc.). Polish > animation: better to
  // always be readable than mid-animation perfect.

  // Tab title
  useEffect(() => {
    document.title = heb ? 'EXPO · מרכז ביצועים אתלטי' : 'EXPO · Athletic Performance Center';
  }, [heb]);

  return (
    <div dir={heb ? 'rtl' : 'ltr'} style={{
      background: C.bg, color: C.tx, minHeight: '100vh', fontFamily: FB,
    }}>
      <style>{`
        .gym-section { padding: 64px 24px; max-width: 1100px; margin: 0 auto; }
        @media (max-width: 720px) { .gym-section { padding: 44px 18px; } }
      `}</style>

      <Header heb={heb} onBookClick={scrollToCalendar} />
      <Hero heb={heb} onBookClick={scrollToCalendar} />
      <StatsStrip heb={heb} />
      <WhoItsFor heb={heb} />
      <WhyInPerson heb={heb} />
      <Approach heb={heb} />
      <WhatsIncluded heb={heb} />
      <Location heb={heb} />
      <TrialCallout heb={heb} onBookClick={scrollToCalendar} />
      <div ref={calendarRef} id="calendar" style={{ scrollMarginTop: 80 }}>
        <CalendarSection heb={heb} />
      </div>
      <Testimonials heb={heb} />
      <FAQ heb={heb} />
      <Footer heb={heb} />
      <Analytics />
    </div>
  );
}

// ─── Header ──────────────────────────────────────────────────────────
function Header({ heb, onBookClick }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return (
    <header style={{
      position: 'sticky', top: 0, zIndex: 50,
      background: scrolled ? `${C.bg}E6` : 'transparent',
      backdropFilter: scrolled ? 'blur(12px)' : 'none',
      WebkitBackdropFilter: scrolled ? 'blur(12px)' : 'none',
      borderBottom: scrolled ? `1px solid ${C.ac}26` : '1px solid transparent',
      transition: 'all 240ms ease',
    }}>
      <div style={{
        maxWidth: 1100, margin: '0 auto',
        padding: '14px 24px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        {/* Logo IS the back affordance — clicking returns to the
            EntryChooser at #/. No separate BACK button. */}
        <a href="#/" title={heb ? 'חזרה לבחירה' : 'Back to home'}
          style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>
          <img src={EXPO_LOGO_NAV} alt="EXPO"
            style={{ height: 28, width: 'auto', transform: 'translateY(-2px)' }} />
        </a>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <LangSwitch />
          <button onClick={onBookClick}
            style={{
              padding: '8px 18px', background: C.ac, color: '#000000',
              border: `1px solid ${C.ac}`, borderRadius: 0,
              fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.18em',
              cursor: 'pointer', textTransform: 'uppercase',
            }}>{heb ? 'הזמן אימון' : 'BOOK SESSION'}</button>
        </div>
      </div>
    </header>
  );
}

function LangSwitch() {
  const [lang] = useLang();
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {['en', 'he'].map(code => {
        const active = lang === code;
        return (
          <button key={code} onClick={() => setLang(code)}
            style={{
              padding: '4px 10px', borderRadius: 0,
              background: active ? C.ac : 'transparent',
              color: active ? '#000000' : C.tm,
              border: `1px solid ${active ? C.ac : C.bd2}`,
              fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
              cursor: 'pointer', textTransform: 'uppercase',
            }}>{code === 'he' ? 'עבר' : 'EN'}</button>
        );
      })}
    </div>
  );
}

// ─── Hero ────────────────────────────────────────────────────────────
function Hero({ heb, onBookClick }) {
  return (
    <section data-fade style={{
      background: `radial-gradient(ellipse at 50% 30%, ${C.ac}1A 0%, transparent 60%), ${C.bg}`,
      borderBottom: `1px solid ${C.ac}26`,
      padding: '88px 24px 72px', textAlign: 'center',
    }}>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        <div style={{
          fontFamily: FN, fontSize: 11, color: C.ac, letterSpacing: '0.32em',
          fontWeight: 700, marginBottom: 18,
        }}>{heb ? 'EXPO · מרכז ביצועים אתלטי' : 'EXPO · ATHLETIC PERFORMANCE CENTER'}</div>

        <h1 style={{
          margin: '0 0 22px', fontFamily: FN,
          fontSize: 'clamp(32px, 5.5vw, 56px)',
          fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.05,
        }}>{heb
          ? 'כוח. ניידות. ריקאברי.'
          : <>Strength. Mobility.<br/>Recovery.</>}</h1>

        <p style={{
          margin: '0 auto 36px', maxWidth: 580, fontSize: 16, color: C.tm,
          lineHeight: 1.7,
        }}>{heb
          ? 'מרכז ביצועים שבנוי סביב כוח מתוכנת, ניידות, וריקאברי משולב. אימון בקבוצות קטנות עם תוכנית אישית, וטיפול חודשי כחלק מהמנוי — לא תוספת.'
          : 'A performance center built around programmed strength, mobility, and integrated recovery. Small-group coaching with your own program — and a monthly massage that is part of the membership, not an add-on.'}</p>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button onClick={onBookClick}
            style={{
              padding: '14px 32px', background: C.ac, color: '#000000',
              border: `1px solid ${C.ac}`, borderRadius: 0,
              fontFamily: FN, fontSize: 12, fontWeight: 700, letterSpacing: '0.2em',
              cursor: 'pointer', textTransform: 'uppercase',
              boxShadow: `0 0 32px ${C.ac}40`,
            }}>{heb ? 'לקבוע אימון' : 'BOOK A SESSION'} {heb ? '←' : '→'}</button>
          <a href={`https://wa.me/${CONTACT.whatsapp}`} target="_blank" rel="noopener"
            style={{
              padding: '14px 32px', background: 'transparent', color: C.tx,
              border: `1px solid ${C.bd2}`, borderRadius: 0, textDecoration: 'none',
              fontFamily: FN, fontSize: 12, fontWeight: 700, letterSpacing: '0.2em',
              textTransform: 'uppercase',
            }}>{heb ? 'שאלה לפני' : 'ASK FIRST'}</a>
        </div>
      </div>
    </section>
  );
}

// ─── Stats strip ─────────────────────────────────────────────────────
function StatsStrip({ heb }) {
  const stats = heb
    ? [
        { n: '500+', l: 'אימונים' },
        { n: '20+', l: 'מתאמנים פעילים' },
        { n: '5★', l: 'דירוג ממוצע' },
        { n: '4–7', l: 'בקבוצה' },
      ]
    : [
        { n: '500+', l: 'Sessions delivered' },
        { n: '20+', l: 'Active clients' },
        { n: '5★', l: 'Average rating' },
        { n: '4–7', l: 'Per coached group' },
      ];
  return (
    <section data-fade className="gym-section" style={{ paddingTop: 32, paddingBottom: 32 }}>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12,
        border: `1px solid ${C.ac}26`, padding: '6px',
      }}>
        {stats.map((s, i) => (
          <div key={i} style={{
            padding: '20px 14px', textAlign: 'center',
            borderInlineEnd: i < stats.length - 1 ? `1px solid ${C.ac}26` : 'none',
          }}>
            <div style={{
              fontFamily: FN, fontSize: 28, fontWeight: 800, color: C.ac,
              letterSpacing: '-0.02em', marginBottom: 4,
            }}>{s.n}</div>
            <div style={{
              fontFamily: FN, fontSize: 10, color: C.tm, letterSpacing: '0.18em',
              fontWeight: 700, textTransform: 'uppercase',
            }}>{s.l}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── Who it's for ────────────────────────────────────────────────────
// Sourced from the founder business plan: this is an athletic
// performance center — not an open gym, not a group fitness studio.
// Naming the audience up front filters bad-fit leads and tells the
// right-fit lead "yes, this is for you."
function WhoItsFor({ heb }) {
  const yes = heb
    ? ['ספורטאים חצי-מקצועיים ומקצועיים', 'מתאמנים רציניים שרוצים תוכנית — לא שיעור', 'מי שחוזר מפציעה ורוצה חזרה נקייה', 'מי שמחפש כוח, יציבות, וניידות שיחזיקו לעשור']
    : ['Semi-pro and competitive athletes', 'Serious trainees who want a program — not a class', 'Coming back from an injury and need a clean return', 'Building strength, stability, and mobility that last a decade'];
  const no = heb
    ? ['חיפוש Open Gym לאימון חופשי', 'אימון קבוצתי בסטייל "סטודיו"', 'תוצאות של "שבועיים, בלי תוכנית"']
    : ['Open-gym walk-in training', 'Studio-style group fitness', '"Quick fix" promises with no programming'];

  return (
    <section data-fade className="gym-section">
      <SectionHeader heb={heb}
        kicker={heb ? 'למי זה' : 'WHO IT IS FOR'}
        title={heb ? 'מי המתאמן שלנו' : 'Who trains here'}
        subtitle={heb
          ? 'מרכז ביצועים. לא חדר כושר חופשי, לא שיעור קבוצתי. זה משנה את ההתאמה.'
          : 'A performance center. Not an open gym, not a group class. That changes who fits.'} />
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 1,
        background: `${C.ac}26`, border: `1px solid ${C.ac}26`, marginTop: 32,
      }}>
        <div style={{ background: C.bg, padding: '26px 22px' }}>
          <div style={{
            fontFamily: FN, fontSize: 11, color: C.ac, letterSpacing: '0.22em',
            fontWeight: 800, marginBottom: 16,
          }}>{heb ? 'כן — אם' : 'YES — IF'}</div>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {yes.map((t, i) => (
              <li key={i} style={{ display: 'flex', gap: 10, fontSize: 14, color: C.tx, lineHeight: 1.55 }}>
                <span style={{ color: C.ac, fontFamily: FN, fontWeight: 800, flexShrink: 0 }}>+</span>
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </div>
        <div style={{ background: C.bg, padding: '26px 22px' }}>
          <div style={{
            fontFamily: FN, fontSize: 11, color: C.tm, letterSpacing: '0.22em',
            fontWeight: 800, marginBottom: 16,
          }}>{heb ? 'לא — אם' : 'NOT — IF'}</div>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {no.map((t, i) => (
              <li key={i} style={{ display: 'flex', gap: 10, fontSize: 14, color: C.tm, lineHeight: 1.55 }}>
                <span style={{ color: C.tm, fontFamily: FN, fontWeight: 800, flexShrink: 0 }}>−</span>
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

// ─── Why here ────────────────────────────────────────────────────────
function WhyInPerson({ heb }) {
  const items = heb
    ? [
        { h: 'עיניים על כל סט', b: 'קבוצה של 4–7 בלבד. אני רואה כל חזרה ומתקן באוויר — לא שיעור שבו אתה מספר.' },
        { h: 'תוכנית, לא אימון', b: 'בלוקים של 4–8 שבועות שנבנים סביב המספרים שלך. השינוי בין שבוע לשבוע מתוכנן, לא אקראי.' },
        { h: 'ריקאברי בתוך המחיר', b: 'טיפול חודשי של 45–60 דקות הוא חלק מהמנוי — לא בונוס מדי פעם. הגוף צריך את זה, והמחיר משקף את זה.' },
      ]
    : [
        { h: 'Coached eyes, every set', b: 'Groups of 4–7 only. I see every rep and correct it mid-set — not a class where you are a number.' },
        { h: 'Programming, not workouts', b: '4–8 week blocks built around your numbers. The week-to-week change is structured, not random.' },
        { h: 'Recovery is in the price', b: 'A monthly 45–60 minute massage is part of your membership — not a sometimes-bonus. The body needs it; the price reflects that.' },
      ];
  return (
    <section data-fade className="gym-section">
      <SectionHeader heb={heb}
        kicker={heb ? 'למה כאן' : 'WHY HERE'}
        title={heb ? 'מה שהמרכז נותן' : 'What the center gives you'} />
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14, marginTop: 32,
      }}>
        {items.map((it, i) => (
          <div key={i} style={{
            background: C.sf, border: `1px solid ${C.ac}40`, padding: '24px 22px',
            position: 'relative',
          }}>
            <div style={{
              position: 'absolute', top: 0, insetInlineStart: 0,
              fontFamily: FN, fontSize: 11, color: C.ac, letterSpacing: '0.2em',
              fontWeight: 800, padding: '6px 12px',
              background: `${C.ac}1A`, borderInlineEnd: `1px solid ${C.ac}40`, borderBottom: `1px solid ${C.ac}40`,
            }}>0{i + 1}</div>
            <h3 style={{
              margin: '28px 0 12px', fontFamily: FN, fontSize: 17, fontWeight: 700,
              letterSpacing: '-0.01em', color: C.tx, lineHeight: 1.25,
            }}>{it.h}</h3>
            <p style={{ margin: 0, fontSize: 13, color: C.tm, lineHeight: 1.65 }}>{it.b}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── Approach / 3 pillars ────────────────────────────────────────────
// Methodology section pulled from the founder business plan: this center
// is built on a three-pillar approach — programmed strength, mobility,
// and recovery — not a single modality. Making the model visible up front
// tells serious trainees we have a real system.
function Approach({ heb }) {
  const pillars = heb
    ? [
        { n: '01', h: 'תוכנית כוח מתוכננת', b: 'בלוקים של 4–8 שבועות. מחזורים שמתעדכנים לפי הביצועים, לא לפי תחושה. כל סט נכתב מראש.' },
        { n: '02', h: 'ניידות וטווחי תנועה', b: 'עבודה ממוקדת על הצוואר, הכתפיים, הירך, והקרסול. לא Stretching אחרי. חלק מהאימון.' },
        { n: '03', h: 'התאוששות מובנית', b: 'סשני התאוששות חודשיים של 45–60 דקות, ואופציה ל-15–20 דקות לפני/אחרי אימון לפי הצורך.' },
      ]
    : [
        { n: '01', h: 'Programmed strength', b: '4–8 week blocks. Cycles adapt to your numbers, not your mood. Every set written ahead.' },
        { n: '02', h: 'Mobility and range', b: 'Targeted work on neck, shoulders, hips, ankles. Not a "stretch at the end" — part of the session.' },
        { n: '03', h: 'Structured recovery', b: 'Monthly 45–60 min recovery sessions, with 15–20 min pre/post-training add-ons when you need them.' },
      ];
  return (
    <section data-fade className="gym-section">
      <SectionHeader heb={heb}
        kicker={heb ? 'איך' : 'HOW WE TRAIN'}
        title={heb ? 'שלושה עמודים' : 'Three pillars'}
        subtitle={heb
          ? 'הגישה לא מסתכמת ב"להרים יותר". כוח, ניידות, והתאוששות עובדים יחד — או שאף אחד מהם לא עובד.'
          : 'The approach is not "lift more." Strength, mobility, and recovery work together — or none of them work.'} />
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14, marginTop: 32,
      }}>
        {pillars.map((p, i) => (
          <div key={i} style={{
            background: C.bg, border: `1px solid ${C.ac}40`,
            padding: '28px 22px', position: 'relative', overflow: 'hidden',
          }}>
            <div style={{
              position: 'absolute', insetInlineEnd: -6, top: -10,
              fontFamily: FN, fontSize: 64, color: `${C.ac}14`, fontWeight: 800,
              letterSpacing: '-0.04em', lineHeight: 1, pointerEvents: 'none',
            }}>{p.n}</div>
            <div style={{
              fontFamily: FN, fontSize: 11, color: C.ac, letterSpacing: '0.22em',
              fontWeight: 800, marginBottom: 14,
            }}>PILLAR {p.n}</div>
            <h3 style={{
              margin: '0 0 10px', fontFamily: FN, fontSize: 17, fontWeight: 700,
              letterSpacing: '-0.01em', color: C.tx, lineHeight: 1.25,
            }}>{p.h}</h3>
            <p style={{ margin: 0, fontSize: 13, color: C.tm, lineHeight: 1.65 }}>{p.b}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── Trial callout ───────────────────────────────────────────────────
// Pre-calendar nudge: the founder business plan defines a paid trial
// (₪200 — assessment + intro session) as the standard on-ramp. Putting
// it directly above the calendar lowers the booking barrier: visitors
// know what they're committing to before they click a slot.
function TrialCallout({ heb, onBookClick }) {
  return (
    <section data-fade className="gym-section" style={{ paddingTop: 24, paddingBottom: 24 }}>
      <div style={{
        background: `linear-gradient(135deg, ${C.ac}1A 0%, transparent 60%), ${C.sf}`,
        border: `1px solid ${C.ac}40`,
        borderInlineStart: `3px solid ${C.ac}`,
        padding: '28px 26px',
        display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 24, alignItems: 'center',
      }}>
        <div>
          <div style={{
            fontFamily: FN, fontSize: 11, color: C.ac, letterSpacing: '0.24em',
            fontWeight: 800, marginBottom: 10,
          }}>{heb ? 'התחלה' : 'TRY IT FIRST'}</div>
          <h3 style={{
            margin: '0 0 8px', fontFamily: FN, fontSize: 22, fontWeight: 800,
            letterSpacing: '-0.01em', color: C.tx, lineHeight: 1.2,
          }}>{heb
            ? 'אבחון תנועה + אימון היכרות'
            : 'Movement assessment + intro session'}</h3>
          <p style={{ margin: 0, fontSize: 14, color: C.tm, lineHeight: 1.65, maxWidth: 540 }}>
            {heb
              ? 'מפגש חד-פעמי בלי התחייבות: 60 דקות של אבחון תנועה ועבודה משותפת. אם הכימיה והכיוון נכונים — ממשיכים. אם לא — קיבלת מפה ברורה של איפה הגוף שלך עומד.'
              : 'A single, no-commitment session: 60 minutes of movement assessment and hands-on work. If the chemistry and direction are right — we keep going. If not — you walk out with a clear map of where your body actually stands.'}
          </p>
        </div>
        <button onClick={onBookClick}
          style={{
            padding: '14px 28px', background: C.ac, color: '#000000',
            border: `1px solid ${C.ac}`, borderRadius: 0,
            fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.2em',
            cursor: 'pointer', textTransform: 'uppercase', whiteSpace: 'nowrap',
            boxShadow: `0 0 28px ${C.ac}33`,
          }}>{heb ? 'לקבוע אבחון' : 'BOOK ASSESSMENT'} {heb ? '←' : '→'}</button>
      </div>
    </section>
  );
}

// ─── What's included ─────────────────────────────────────────────────
function WhatsIncluded({ heb }) {
  const items = heb
    ? [
        { i: '◯', h: 'אבחון תנועה ראשוני', b: 'מיפוי טווחי תנועה, חוזק וחולשות.' },
        { i: '◇', h: 'תוכנית מותאמת', b: 'בלוק של 4–8 שבועות שמתעדכן לפי ההתקדמות.' },
        { i: '◬', h: 'עבודת ניידות', b: 'מובנית בתוך האימון — כתפיים, ירך, קרסול.' },
        { i: '◉', h: 'סשני התאוששות', b: 'חודשי של 45–60 דקות, ולפי הצורך תוספות לפני/אחרי אימון.' },
        { i: '◈', h: 'מעקב באפליקציה', b: 'גישה לאפליקציית EXPO לתיעוד אימונים והודעות.' },
        { i: '✦', h: 'תקשורת ישירה', b: 'וואטסאפ ישיר אליי לשאלות בין אימונים.' },
      ]
    : [
        { i: '◯', h: 'Initial movement assessment', b: 'Map of your range, strengths, and weak links.' },
        { i: '◇', h: 'Tailored programming', b: '4–8 week blocks that adjust to your progress.' },
        { i: '◬', h: 'Mobility work', b: 'Built into the session — shoulders, hips, ankles.' },
        { i: '◉', h: 'Recovery sessions', b: 'Monthly 45–60 min, plus optional pre/post-training add-ons.' },
        { i: '◈', h: 'In-app tracking', b: 'EXPO athlete app — log sessions, message me, see history.' },
        { i: '✦', h: 'Direct line', b: 'My WhatsApp for questions between sessions.' },
      ];
  return (
    <section data-fade className="gym-section">
      <SectionHeader heb={heb}
        kicker={heb ? 'מה כלול' : "WHAT'S INCLUDED"}
        title={heb ? 'הכל ארוז יחד' : 'Everything in the package'} />
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 1,
        background: `${C.ac}26`, border: `1px solid ${C.ac}26`, marginTop: 32,
      }}>
        {items.map((it, i) => (
          <div key={i} style={{
            background: C.bg, padding: '26px 20px', display: 'flex', flexDirection: 'column', gap: 10,
            minHeight: 180,
          }}>
            <div style={{
              fontFamily: FN, fontSize: 24, color: C.ac, fontWeight: 800,
            }}>{it.i}</div>
            <h3 style={{
              margin: 0, fontFamily: FN, fontSize: 15, fontWeight: 700, letterSpacing: '0.02em',
              color: C.tx, lineHeight: 1.3,
            }}>{it.h}</h3>
            <p style={{
              margin: 0, fontSize: 13, color: C.tm, lineHeight: 1.6,
            }}>{it.b}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── Location ────────────────────────────────────────────────────────
function Location({ heb }) {
  return (
    <section data-fade className="gym-section">
      <SectionHeader heb={heb}
        kicker={heb ? 'איפה' : 'WHERE'}
        title={heb ? 'המרכז' : 'The performance center'} />
      <div style={{
        marginTop: 32, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.4fr)',
        gap: 1, border: `1px solid ${C.ac}26`, background: `${C.ac}26`,
      }}>
        {/* Address card */}
        <div style={{ background: C.bg, padding: '32px 28px' }}>
          <div style={{
            fontFamily: FN, fontSize: 10, color: C.tm, letterSpacing: '0.2em',
            fontWeight: 700, marginBottom: 14,
          }}>{heb ? 'כתובת' : 'ADDRESS'}</div>
          <div style={{
            fontFamily: FN, fontSize: 18, color: C.tx, fontWeight: 700,
            lineHeight: 1.4, marginBottom: 20,
          }}>{heb ? 'תל אביב — צפון הישן' : 'Tel Aviv — Old North'}</div>
          <div style={{
            fontFamily: FN, fontSize: 10, color: C.tm, letterSpacing: '0.2em',
            fontWeight: 700, marginBottom: 8,
          }}>{heb ? 'יצירת קשר' : 'CONTACT'}</div>
          <a href={`https://wa.me/${CONTACT.whatsapp}`} target="_blank" rel="noopener"
            style={{
              display: 'inline-block', marginBottom: 8, fontFamily: FN, fontSize: 13,
              color: C.ac, textDecoration: 'none', fontWeight: 700,
            }}>WhatsApp →</a>
          <br/>
          <a href={`https://instagram.com/expo_il`} target="_blank" rel="noopener"
            style={{
              fontFamily: FN, fontSize: 13, color: C.ac, textDecoration: 'none', fontWeight: 700,
            }}>Instagram @expo_il →</a>
        </div>
        {/* Map placeholder — Google Maps embed could go here later */}
        <div style={{
          background: C.bg, position: 'relative', minHeight: 240,
          backgroundImage: `linear-gradient(135deg, ${C.sf2} 0%, ${C.bg} 100%)`,
        }}>
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: C.tm, fontFamily: FN, fontSize: 11, letterSpacing: '0.18em', fontWeight: 700,
            textAlign: 'center', padding: 20,
          }}>
            <div>
              <div style={{ fontSize: 32, color: C.ac, marginBottom: 8 }}>◉</div>
              {heb ? 'מפה מדוייקת לאחר תיאום' : 'EXACT LOCATION SHARED ON BOOKING'}
            </div>
          </div>
          {/* Decorative grid pattern — subtle, brand-consistent */}
          <div style={{
            position: 'absolute', inset: 0,
            backgroundImage: `linear-gradient(${C.ac}14 1px, transparent 1px), linear-gradient(90deg, ${C.ac}14 1px, transparent 1px)`,
            backgroundSize: '40px 40px', pointerEvents: 'none',
          }} />
        </div>
      </div>
    </section>
  );
}

// ─── Calendar section ────────────────────────────────────────────────
// 2026-05-14 — switched from a Supabase-backed booking widget to an
// embedded Google Calendar appointment scheduler. URL is the canonical
// scheduler page Ohad set up; iframe rendering keeps the visitor on
// expo-il while still giving them Google's polished slot picker +
// auto-email confirmations.
function CalendarSection({ heb }) {
  // Append ?gv=true to use the Google embed view (skips the standalone
  // page chrome). Mobile responsive — iframe height adapts to viewport.
  const embedUrl = GCAL_GYM + '?gv=true';
  return (
    <section data-fade className="gym-section">
      <SectionHeader heb={heb}
        kicker={heb ? 'יומן חי' : 'LIVE CALENDAR'}
        title={heb ? 'בחר מועד פנוי' : 'Pick an open slot'}
        subtitle={heb
          ? 'מועדים בזמן אמת. בחר/י, מלא/י פרטים, וקבל/י אישור באימייל מיד.'
          : "Real-time availability. Pick a slot, fill the form, get an email confirmation instantly."} />

      <div style={{
        marginTop: 32,
        background: C.bg,
        border: `1px solid ${C.ac}40`,
        borderInlineStart: `3px solid ${C.ac}`,
        padding: 6,
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Dark-mode treatment only — no crop, no avatar mask. Ohad
            owns the profile picture: he'll set a Google-account photo
            that looks intentional when the invert filter flips it,
            so we don't need to hide it. */}
        <iframe
          src={embedUrl}
          title={heb ? 'יומן זימונים' : 'Booking calendar'}
          loading="lazy"
          style={{
            width: '100%',
            height: 'clamp(620px, 90vh, 820px)',
            border: 'none',
            display: 'block',
            background: '#FFFFFF',
            filter: 'invert(0.92) hue-rotate(180deg) saturate(0.9)',
            WebkitFilter: 'invert(0.92) hue-rotate(180deg) saturate(0.9)',
          }}
        />
      </div>

      <div style={{
        marginTop: 12, textAlign: 'center', fontFamily: FN,
        fontSize: 11, color: C.tm, letterSpacing: '0.16em', fontWeight: 700,
      }}>
        {heb
          ? 'מופעל על ידי Google Calendar · אישור באימייל אוטומטי'
          : 'Powered by Google Calendar · Automatic email confirmation'}
      </div>
    </section>
  );
}

// ─── Testimonials ────────────────────────────────────────────────────
function Testimonials({ heb }) {
  const quotes = heb
    ? [
        { q: 'תוך 8 שבועות עברתי מ-70 ק"ג סקוואט ל-110. תוכנית מסודרת, מעקב צמוד.', n: 'אמיר ש.' },
        { q: 'הגוף שלי לא היה ככה גם בצבא. אוהד יודע למה הוא מכוון.', n: 'דניאל ל.' },
        { q: 'חזרתי מפציעה בכתף שגררה אותי שנה. אצל אוהד התקדמנו בזהירות וזה עבד.', n: 'נטע ר.' },
      ]
    : [
        { q: 'Went from a 70kg squat to 110kg in 8 weeks. Structured programming, tight coaching.', n: 'Amir S.' },
        { q: 'I have not felt this strong since the army. Ohad knows what he is aiming at.', n: 'Daniel L.' },
        { q: 'Came back from a year-long shoulder injury. Progressed carefully and it worked.', n: 'Neta R.' },
      ];
  return (
    <section data-fade className="gym-section">
      <SectionHeader heb={heb}
        kicker={heb ? 'מתאמנים' : 'CLIENTS'}
        title={heb ? 'מה אומרים' : 'What clients say'} />
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14, marginTop: 32,
      }}>
        {quotes.map((q, i) => (
          <div key={i} style={{
            background: C.sf, border: `1px solid ${C.ac}26`, padding: 24,
            display: 'flex', flexDirection: 'column', gap: 18,
          }}>
            <div style={{ fontFamily: FN, fontSize: 32, color: C.ac, lineHeight: 1, fontWeight: 800 }}>"</div>
            <p style={{ margin: 0, fontSize: 14, color: C.tx, lineHeight: 1.65, flex: 1 }}>{q.q}</p>
            <div style={{
              fontFamily: FN, fontSize: 10, color: C.tm, letterSpacing: '0.18em', fontWeight: 700,
              paddingTop: 14, borderTop: `1px solid ${C.ac}26`,
            }}>— {q.n}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── FAQ ─────────────────────────────────────────────────────────────
function FAQ({ heb }) {
  const items = heb
    ? [
        { q: 'אני חדש לחלוטין באימוני כוח. זה מתאים לי?', a: 'בהחלט. רוב המתאמנים מתחילים אצלי בלי רקע קודם. אבחון התנועה הראשון בודק מאיפה להתחיל.' },
        { q: 'יש פציעה ישנה. אפשר להתאמן?', a: 'תלוי בפציעה — אחרי השיחה הראשונה נדע אם זה הכיוון או שצריך הפניה למישהו אחר. אני לא מבטיח דברים שאני לא יכול לעמוד בהם.' },
        { q: 'מה עולה חודש?', a: 'תלוי בקצב (פעם, פעמיים, או שלוש בשבוע). שולח מחירון מסודר אחרי שאלת התשובה הראשונה.' },
        { q: 'איך מבטלים אימון?', a: 'עד 4 שעות לפני. אחרי זה האימון נכנס לחשבון. הכל בוואטסאפ.' },
      ]
    : [
        { q: 'I am totally new to strength training. Is this for me?', a: 'Yes. Most of my clients start with no prior background. The first assessment session figures out where to start.' },
        { q: 'I have an old injury. Can I still train?', a: 'Depends on the injury — after the first call we will know if this is the right path or if I should refer you on. I do not promise things I cannot deliver.' },
        { q: 'What does it cost per month?', a: 'Depends on cadence (1, 2, or 3 sessions per week). I send a clear price sheet after the first reply.' },
        { q: 'Cancellation policy?', a: '4 hours notice. After that the session counts. All over WhatsApp.' },
      ];
  return (
    <section data-fade className="gym-section">
      <SectionHeader heb={heb}
        kicker={heb ? 'שאלות' : 'QUESTIONS'}
        title={heb ? 'שאלות נפוצות' : 'Common questions'} />
      <div style={{ marginTop: 32 }}>
        {items.map((it, i) => (
          <FAQItem key={i} q={it.q} a={it.a} />
        ))}
      </div>
    </section>
  );
}

function FAQItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{
      borderTop: `1px solid ${C.ac}26`,
    }}>
      <button onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', padding: '20px 4px', background: 'transparent', border: 'none',
          textAlign: 'inherit', cursor: 'pointer', display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', gap: 14, color: C.tx,
          fontFamily: FN, fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em',
        }}>
        <span>{q}</span>
        <span style={{
          color: C.ac, fontFamily: FN, fontWeight: 800, fontSize: 20,
          transform: open ? 'rotate(45deg)' : 'rotate(0deg)',
          transition: 'transform 200ms ease', display: 'inline-flex', flexShrink: 0,
        }}>+</span>
      </button>
      {open && (
        <div style={{ padding: '0 4px 20px', fontSize: 14, color: C.tm, lineHeight: 1.7 }}>
          {a}
        </div>
      )}
    </div>
  );
}

// ─── Footer ──────────────────────────────────────────────────────────
function Footer({ heb }) {
  return (
    <footer style={{
      borderTop: `1px solid ${C.ac}26`, padding: '48px 24px 32px',
      background: `linear-gradient(180deg, ${C.bg} 0%, ${C.sf} 100%)`,
    }}>
      <div style={{
        maxWidth: 1100, margin: '0 auto',
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 32,
        paddingBottom: 32, borderBottom: `1px solid ${C.ac}26`,
      }}>
        <div>
          <img src={EXPO_LOGO_NAV} alt="EXPO" style={{ height: 28, width: 'auto', marginBottom: 12 }} />
          <p style={{ fontSize: 12, color: C.tm, lineHeight: 1.6, maxWidth: 260 }}>
            {heb
              ? 'מרכז ביצועים אתלטי — כוח, ניידות וריקאברי, באימון קבוצתי מבוסס תוכנית.'
              : 'EXPO Athletic Performance Center — strength, mobility, and recovery, in programmed small-group coaching.'}
          </p>
        </div>
        <div>
          <div style={{
            fontFamily: FN, fontSize: 10, color: C.tm, letterSpacing: '0.22em', fontWeight: 700, marginBottom: 12,
          }}>{heb ? 'יצירת קשר' : 'CONTACT'}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <a href={`https://wa.me/${CONTACT.whatsapp}`} target="_blank" rel="noopener"
              style={{ color: C.tx, fontSize: 13, textDecoration: 'none' }}>WhatsApp</a>
            <a href="https://instagram.com/expo_il" target="_blank" rel="noopener"
              style={{ color: C.tx, fontSize: 13, textDecoration: 'none' }}>Instagram @expo_il</a>
            <a href={`mailto:${CONTACT.email}`}
              style={{ color: C.tx, fontSize: 13, textDecoration: 'none' }}>{CONTACT.email}</a>
          </div>
        </div>
        <div>
          <div style={{
            fontFamily: FN, fontSize: 10, color: C.tm, letterSpacing: '0.22em', fontWeight: 700, marginBottom: 12,
          }}>{heb ? 'גם בעולם' : 'ALSO ON EXPO'}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <a href="#/online" style={{ color: C.tx, fontSize: 13, textDecoration: 'none' }}>
              {heb ? 'תוכניות אונליין' : 'Online programs'} →
            </a>
            <a href="https://expo-app.co.il" target="_blank" rel="noopener"
              style={{ color: C.tx, fontSize: 13, textDecoration: 'none' }}>
              {heb ? 'אפליקציית EXPO' : 'EXPO athlete app'} →
            </a>
          </div>
        </div>
      </div>
      <div style={{
        maxWidth: 1100, margin: '32px auto 0',
        textAlign: 'center', fontFamily: FN, fontSize: 10, color: C.tm,
        letterSpacing: '0.18em', fontWeight: 700,
      }}>
        EXPO · {new Date().getFullYear()} · {heb ? 'כל הזכויות שמורות' : 'ALL RIGHTS RESERVED'}
      </div>
    </footer>
  );
}

// ─── Shared section header ───────────────────────────────────────────
function SectionHeader({ heb, kicker, title, subtitle }) {
  return (
    <div style={{ textAlign: 'center', maxWidth: 720, margin: '0 auto' }}>
      <div style={{
        fontFamily: FN, fontSize: 11, color: C.ac, letterSpacing: '0.28em',
        fontWeight: 700, marginBottom: 14,
      }}>{kicker}</div>
      <h2 style={{
        margin: 0, fontFamily: FN, fontSize: 'clamp(24px, 3.6vw, 36px)',
        fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.15, color: C.tx,
      }}>{title}</h2>
      {subtitle && (
        <p style={{
          margin: '14px auto 0', fontSize: 14, color: C.tm, lineHeight: 1.65, maxWidth: 540,
        }}>{subtitle}</p>
      )}
    </div>
  );
}
