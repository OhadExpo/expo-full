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
import founderOhad from './assets/founder-ohad.jpg';
import founderYuval from './assets/founder-yuval.jpg';

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
    // textAlign: 'start' overrides the App-root default of 'center'
    // (App.jsx:2991 globally centers expo-il content for the catalog
    // home). Gym is a self-contained brand page where sections that
    // want centering (Hero, SectionHeader, copyright) opt in explicitly,
    // so inheriting center wrecks the footer's 3-column link grid +
    // the FAQ + cards. Forcing start here restores natural reading flow.
    <div dir={heb ? 'rtl' : 'ltr'} style={{
      background: C.bg, color: C.tx, minHeight: '100vh', fontFamily: FB,
      textAlign: 'start',
    }}>
      <style>{`
        .gym-section { padding: 64px 24px; max-width: 1100px; margin: 0 auto; }
        .gym-2col { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr); gap: 1px; }
        .gym-trial { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 24px; align-items: center; }
        @media (max-width: 720px) {
          .gym-section { padding: 44px 18px; }
          .gym-2col { grid-template-columns: 1fr; }
          .gym-trial { grid-template-columns: 1fr; gap: 18px; }
        }
      `}</style>

      <Header heb={heb} onBookClick={scrollToCalendar} />
      <Hero heb={heb} onBookClick={scrollToCalendar} />
      <StatsStrip heb={heb} />
      <WhoItsFor heb={heb} />
      <WhyInPerson heb={heb} />
      <Approach heb={heb} />
      <WhatsIncluded heb={heb} />
      <HowItWorks heb={heb} />
      <WhyNotJust heb={heb} />
      <Team heb={heb} />
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
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <LangSwitch heb={heb} />
          <button onClick={onBookClick}
            style={{
              height: 32, padding: '0 18px',
              background: C.ac, color: '#000000',
              border: `1px solid ${C.ac}`, borderRadius: 0,
              fontFamily: FN, fontSize: heb ? 13 : 11,
              fontWeight: 700, letterSpacing: heb ? '0.04em' : '0.18em',
              cursor: 'pointer', textTransform: 'uppercase',
              display: 'inline-flex', alignItems: 'center',
            }}>{heb ? 'הזמן אימון' : 'BOOK SESSION'}</button>
        </div>
      </div>
    </header>
  );
}

// Lang toggle. Pills sit in one inline-flex row, share a single
// horizontal hairline (no per-pill borders so the group reads as one
// segmented control), and match the BOOK button's 32px box height so
// the whole header row aligns to a single baseline in both languages.
function LangSwitch({ heb }) {
  const [lang] = useLang();
  return (
    <div style={{
      display: 'inline-flex', height: 32,
      border: `1px solid ${C.bd2}`, borderRadius: 0,
    }}>
      {['en', 'he'].map((code, i) => {
        const active = lang === code;
        return (
          <button key={code} onClick={() => setLang(code)}
            style={{
              height: '100%', padding: '0 14px',
              background: active ? C.ac : 'transparent',
              color: active ? '#000000' : C.tm,
              border: 'none',
              borderInlineStart: i === 0 ? 'none' : `1px solid ${C.bd2}`,
              fontFamily: FN,
              fontSize: code === 'he' && heb ? 13 : 10,
              fontWeight: 700, letterSpacing: '0.12em',
              cursor: 'pointer', textTransform: 'uppercase',
              display: 'inline-flex', alignItems: 'center',
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
          ? 'מרכז ביצועים שבנוי סביב כוח מתוכנת, ניידות וריקאברי. אימון בקבוצות קטנות עם תוכנית אישית — ועיסוי ספורט חודשי שמובנה במנוי, לא תוספת בתשלום.'
          : 'A performance center built around programmed strength, mobility, and recovery. Small-group coaching with your own program — and a monthly sports massage built into the membership, not a paid add-on.'}</p>

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
        { h: 'עיניים על כל סט', b: 'קבוצה של 4–7 בלבד. אנחנו רואים כל חזרה ומתקנים באוויר — לא שיעור שבו אתה מספר.' },
        { h: 'תוכנית, לא אימון', b: 'בלוקים של 4–8 שבועות שנבנים סביב המספרים שלך. השינוי בין שבוע לשבוע מתוכנן, לא אקראי.' },
        { h: 'עיסוי, לא בונוס', b: 'עיסוי ספורט של 45–60 דקות בכל חודש עם מטפל ייעודי, מובנה במנוי. פחות כאבי שריר, טווחי תנועה פתוחים, וגוף שמחזיק את העומס לאורך זמן.' },
      ]
    : [
        { h: 'Coached eyes, every set', b: 'Groups of 4–7 only. We see every rep and correct it mid-set — not a class where you are a number.' },
        { h: 'Programming, not workouts', b: '4–8 week blocks built around your numbers. The week-to-week change is structured, not random.' },
        { h: 'Massage, not a bonus', b: 'A 45–60 minute sports massage every month with a dedicated therapist, built into the membership. Less soreness, freer range of motion, and a body that holds up to the load over time.' },
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
        { n: '03', h: 'עיסוי ספורט מובנה', b: 'עיסוי חודשי של 45–60 דקות עם מטפל ייעודי, ועיסוי קצר של 15–20 דקות לפני/אחרי אימון לפי הצורך. פחות כאב, פחות פציעות, יותר רציפות.' },
      ]
    : [
        { n: '01', h: 'Programmed strength', b: '4–8 week blocks. Cycles adapt to your numbers, not your mood. Every set written ahead.' },
        { n: '02', h: 'Mobility and range', b: 'Targeted work on neck, shoulders, hips, ankles. Not a "stretch at the end" — part of the session.' },
        { n: '03', h: 'Built-in sports massage', b: 'A monthly 45–60 min massage with a dedicated therapist, plus 15–20 min pre/post-training work when you need it. Less soreness, fewer injuries, more consistency.' },
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

// ─── How it works ────────────────────────────────────────────────────
// Reframes the offer as a pathway rather than a list of services — the
// pattern premium coaching pages convert on. Pulled from the founder
// customer-journey: assessment → tailored block → integrated recovery →
// measure & adjust. Sets expectations and makes the process feel real.
function HowItWorks({ heb }) {
  const steps = heb
    ? [
        { n: '01', h: 'אבחון תנועה', b: 'מפגש פתיחה: שיחת מטרות, אבחון תנועה, ואימון היכרות. יוצאים עם תמונה ברורה של איפה הגוף עומד.' },
        { n: '02', h: 'תוכנית בבלוק', b: 'בלוק של 4–8 שבועות שנבנה סביב המטרה והמספרים שלך, באימון בקבוצה קטנה של 4–7.' },
        { n: '03', h: 'עיסוי וריקאברי', b: 'עיסוי ספורט חודשי וניהול עומסים, מובנים בתוך התוכנית — כדי שתתאמן ברצף בלי לשבור את הגוף.' },
        { n: '04', h: 'מדידה ועדכון', b: 'בסוף הבלוק מודדים שוב, רואים מה זז, ובונים את הבלוק הבא. התקדמות שמודדים, לא תחושה.' },
      ]
    : [
        { n: '01', h: 'Movement assessment', b: 'An opening session: goals, a movement screen, and an intro workout. You leave with a clear picture of where your body stands.' },
        { n: '02', h: 'Your training block', b: 'A 4–8 week block built around your goal and your numbers, coached in a small group of 4–7.' },
        { n: '03', h: 'Massage & recovery', b: 'A monthly sports massage and load management, built into the plan — so you train consistently without breaking the body down.' },
        { n: '04', h: 'Measure & adjust', b: 'At the end of the block we re-measure, see what moved, and build the next one. Progress you measure, not guess.' },
      ];
  return (
    <section data-fade className="gym-section">
      <SectionHeader heb={heb}
        kicker={heb ? 'איך זה עובד' : 'HOW IT WORKS'}
        title={heb ? 'הדרך, בארבעה שלבים' : 'The path, in four steps'}
        subtitle={heb
          ? 'לא כניסה לחדר כושר — תהליך. ככה זה נראה מהמפגש הראשון והלאה.'
          : 'Not a gym check-in — a process. Here is what it looks like from the first session on.'} />
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 14, marginTop: 32,
      }}>
        {steps.map((s, i) => (
          <div key={i} style={{
            background: C.bg, border: `1px solid ${C.ac}26`, padding: '24px 20px',
            position: 'relative', display: 'flex', flexDirection: 'column', gap: 10,
          }}>
            <div style={{
              fontFamily: FN, fontSize: 12, color: C.ac, letterSpacing: '0.2em', fontWeight: 800,
            }}>{heb ? 'שלב ' : 'STEP '}{s.n}</div>
            <h3 style={{
              margin: 0, fontFamily: FN, fontSize: 16, fontWeight: 700, letterSpacing: '-0.01em',
              color: C.tx, lineHeight: 1.3,
            }}>{s.h}</h3>
            <p style={{ margin: 0, fontSize: 13, color: C.tm, lineHeight: 1.6 }}>{s.b}</p>
            {/* connector arrow between steps (hidden on the last) */}
            {i < steps.length - 1 && (
              <div aria-hidden style={{
                position: 'absolute', insetInlineEnd: -9, top: '50%', transform: 'translateY(-50%)',
                color: `${C.ac}66`, fontFamily: FN, fontSize: 16, fontWeight: 800, zIndex: 1,
              }}>{heb ? '←' : '→'}</div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── Why not just… (differentiation) ─────────────────────────────────
// The sharpest unused asset from the founder differentiation doc: why a
// paying athlete picks EXPO over the alternatives they actually weigh —
// a gym, a private trainer, a sports physio, a standalone masseur.
// Outcome-led, not feature-led (athletes buy transformation, not square
// footage). Recovery-as-medical-claim is deliberately avoided: we say
// "bridge to ready-to-perform" and "manage load," never "fix."
function WhyNotJust({ heb }) {
  const rows = heb
    ? [
        { alt: 'חדר כושר', their: 'ציוד ושעות פתוחות — אתה מול המכונות לבד, בלי לדעת אם אתה מתקדם.', ours: 'אבחון, תוכנית אישית, ועיניים על כל סט. יודעים בדיוק מה עובד.' },
        { alt: 'מאמן אישי', their: 'יחס צמוד, אבל יקר — ובלי מעטפת ריקאברי.', ours: 'אותו ליווי מדויק בקבוצה קטנה, עם עיסוי חודשי מובנה, בעלות נמוכה יותר.' },
        { alt: 'פיזיותרפיה', their: 'מטפלת בכאב, ונעצרת כשהוא נעלם.', ours: 'גשר מ"כבר לא כואב" ל"מוכן לבצע". מודדים התקדמות אתלטית, לא רק כאב.' },
        { alt: 'מעסה ספורט', their: 'עיסוי נעים, מנותק מהאימון.', ours: 'עיסוי שהוא חלק מתוכנית כוח וממדידה — לא טיפול שעומד בפני עצמו.' },
      ]
    : [
        { alt: 'a gym', their: 'Equipment and open hours — you face the machines alone, with no idea if you are progressing.', ours: 'Assessment, your own program, and eyes on every set. We know exactly what is working.' },
        { alt: 'a personal trainer', their: 'Close attention, but expensive — and no recovery wrapped in.', ours: 'The same precise coaching in a small group, with a monthly massage built in, for less.' },
        { alt: 'sports physio', their: 'Treats the pain, and stops when it is gone.', ours: 'A bridge from "no longer hurts" to "ready to perform." We track athletic progress, not just pain.' },
        { alt: 'a masseur', their: 'A nice massage, disconnected from your training.', ours: 'Massage that is part of a strength program and measured progress — not a standalone treatment.' },
      ];
  return (
    <section data-fade className="gym-section">
      <SectionHeader heb={heb}
        kicker={heb ? 'במה זה שונה' : 'WHY EXPO'}
        title={heb ? 'למה כאן, ולא…' : 'Why here, not…'}
        subtitle={heb
          ? 'רוב האנשים מתלבטים בין כמה אפשרויות. זה ההבדל, בלי לסבך.'
          : 'Most people weigh a few options. Here is the difference, plainly.'} />
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(258px, 1fr))', gap: 14, marginTop: 32,
      }}>
        {rows.map((r, i) => (
          <div key={i} style={{
            background: C.sf, border: `1px solid ${C.ac}26`, padding: '22px 20px',
            display: 'flex', flexDirection: 'column', gap: 12,
          }}>
            <div style={{
              fontFamily: FN, fontSize: 11, color: C.tm, letterSpacing: '0.16em', fontWeight: 800,
              textTransform: 'uppercase',
            }}>{heb ? 'במקום ' : 'INSTEAD OF '}{r.alt}</div>
            <div style={{ display: 'flex', gap: 8, fontSize: 13, color: C.tm, lineHeight: 1.6 }}>
              <span style={{ color: C.tm, flexShrink: 0, fontWeight: 800 }}>−</span><span>{r.their}</span>
            </div>
            <div style={{
              display: 'flex', gap: 8, fontSize: 13.5, color: C.tx, lineHeight: 1.6,
              borderTop: `1px solid ${C.ac}26`, paddingTop: 12,
            }}>
              <span style={{ color: C.ac, flexShrink: 0, fontWeight: 800 }}>+</span><span>{r.ours}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── Team / founders ─────────────────────────────────────────────────
// The center is two founders: Ohad runs coaching, Yuval runs recovery.
// The whole page speaks as a team ("we") and this section names both.
// Yuval's bio is held to founder-doc-confirmed facts (sports-massage
// therapist, owns all treatment + recovery) — no invented certifications;
// Ohad to supply real credentials to enrich it. The origin line (met on a
// football field) is from the legal-meeting transcript.
function Team({ heb }) {
  const people = heb
    ? [
        { initials: 'א', name: 'אוהד', role: 'אימון · כוח ואתלטיקה', bio: 'מאמן כוח ואתלטיקה, ובין השאר מאמן הכושר של קבוצת בני הרצליה בכדורסל. בונה את התוכניות, מנהל את רצפת האימון, ומאמן כל קבוצה בעצמו — כל סט נכתב מראש ומתעדכן לפי המספרים שלך.' },
        { initials: 'י', name: 'יובל ברקוביץ׳', role: 'ריקאברי · עיסוי ספורט ורפואי', bio: 'מטפל בעיסוי ספורט ורפואי, מוסמך מכון וינגייט, עם התמחות בשחרור ובפתיחת טווחי תנועה. אחראי על כל הריקאברי במרכז — העיסוי החודשי, העבודה לפני ואחרי אימון, וניהול העומסים.' },
      ]
    : [
        { initials: 'O', name: 'Ohad', role: 'Coaching · strength & athletics', bio: 'A strength and athletics coach — and the fitness coach for Bnei Herzliya basketball. He builds the programs, runs the floor, and coaches every group himself; every set is written ahead and adjusts to your numbers.' },
        { initials: 'Y', name: 'Yuval Berkovitch', role: 'Recovery · sports & medical massage', bio: 'A Wingate-certified sports- and medical-massage therapist specializing in release and range-of-motion work. He owns all recovery at the center — the monthly massage, pre/post-training work, and load management.' },
      ];
  return (
    <section data-fade className="gym-section">
      <SectionHeader heb={heb}
        kicker={heb ? 'מי אנחנו' : 'WHO WE ARE'}
        title={heb ? 'שני אנשים, שני תחומים' : 'Two people, two crafts'}
        subtitle={heb
          ? 'אימון וריקאברי תחת קורת גג אחת — כל אחד עושה את מה שהוא הכי טוב בו.'
          : 'Coaching and recovery under one roof — each of us doing the one thing we do best.'} />
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14, marginTop: 32,
      }}>
        {people.map((p, i) => (
          <div key={i} style={{
            background: C.sf, border: `1px solid ${C.ac}40`, padding: '28px 24px',
            display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 6,
          }}>
            <img src={i === 0 ? founderOhad : founderYuval} alt={p.name} loading="lazy"
              style={{
                width: '100%', maxWidth: 200, aspectRatio: '1 / 1', objectFit: 'cover',
                borderRadius: 16, border: `1px solid ${C.ac}66`, marginBottom: 12,
              }} />
            <div style={{ fontFamily: FN, fontSize: 18, fontWeight: 800, color: C.tx, lineHeight: 1.2 }}>{p.name}</div>
            <div style={{
              fontFamily: FN, fontSize: 10.5, color: C.ac, letterSpacing: '0.12em',
              fontWeight: 700, textTransform: 'uppercase', marginTop: 2,
            }}>{p.role}</div>
            <p style={{ margin: '12px 0 0', fontSize: 13.5, color: C.tm, lineHeight: 1.65, textAlign: 'start' }}>{p.bio}</p>
          </div>
        ))}
      </div>
      <p style={{
        textAlign: 'center', margin: '24px auto 0', maxWidth: 560,
        fontSize: 13, color: C.td, lineHeight: 1.65, fontStyle: 'italic',
      }}>
        {heb
          ? 'נפגשנו לפני שנים על מגרש פוטבול אמריקאי. את המרכז בנינו סביב מה שחיפשנו בעצמנו ולא מצאנו.'
          : 'We met years ago on an American-football field. We built the center around what we kept looking for ourselves and never found.'}
      </p>
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
      <div className="gym-trial" style={{
        background: `linear-gradient(135deg, ${C.ac}1A 0%, transparent 60%), ${C.sf}`,
        border: `1px solid ${C.ac}40`,
        borderInlineStart: `3px solid ${C.ac}`,
        padding: '28px 26px',
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
        { i: '◉', h: 'עיסוי ספורט', b: 'עיסוי חודשי של 45–60 דקות עם מטפל ייעודי, ותוספות קצרות לפני/אחרי אימון לפי הצורך.' },
        { i: '◈', h: 'מעקב באפליקציה', b: 'גישה לאפליקציית EXPO לתיעוד אימונים והודעות.' },
        { i: '✦', h: 'תקשורת ישירה', b: 'וואטסאפ ישיר אלינו לשאלות בין אימונים.' },
      ]
    : [
        { i: '◯', h: 'Initial movement assessment', b: 'Map of your range, strengths, and weak links.' },
        { i: '◇', h: 'Tailored programming', b: '4–8 week blocks that adjust to your progress.' },
        { i: '◬', h: 'Mobility work', b: 'Built into the session — shoulders, hips, ankles.' },
        { i: '◉', h: 'Sports massage', b: 'Monthly 45–60 min with a dedicated therapist, plus short pre/post-training work as needed.' },
        { i: '◈', h: 'In-app tracking', b: 'EXPO athlete app — log sessions, message me, see history.' },
        { i: '✦', h: 'Direct line', b: 'Our WhatsApp for questions between sessions.' },
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
      <div className="gym-2col" style={{
        marginTop: 32, border: `1px solid ${C.ac}26`, background: `${C.ac}26`,
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
        { q: 'חזרתי מפציעה בכתף שגררה אותי שנה. אוהד בנה את החזרה בזהירות, והעיסוי החודשי של יובל החזיק את הכתף לאורך הדרך.', n: 'נטע ר.' },
      ]
    : [
        { q: 'Went from a 70kg squat to 110kg in 8 weeks. Structured programming, tight coaching.', n: 'Amir S.' },
        { q: 'I have not felt this strong since the army. Ohad knows what he is aiming at.', n: 'Daniel L.' },
        { q: 'Came back from a year-long shoulder injury. Ohad built the return carefully, and Yuval’s monthly massage kept the shoulder going the whole way.', n: 'Neta R.' },
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
        { q: 'אני חדש לחלוטין באימוני כוח. זה מתאים לי?', a: 'בהחלט. רוב המתאמנים מתחילים אצלנו בלי רקע קודם. אבחון התנועה הראשון בודק מאיפה להתחיל.' },
        { q: 'יש פציעה ישנה. אפשר להתאמן?', a: 'תלוי בפציעה — אחרי השיחה הראשונה נדע אם זה הכיוון, ואם צריך נפנה אותך למישהו מתאים יותר. אנחנו לא מבטיחים דברים שאנחנו לא יכולים לעמוד בהם.' },
        { q: 'מי נותן את העיסוי?', a: 'יובל, המטפל בעיסוי ספורט ורפואי של המרכז, מוסמך מכון וינגייט. אוהד מאמן, יובל מטפל — שניהם מלווים אותך לאורך התהליך.' },
        { q: 'העיסוי באמת כלול, או שזו תוספת בתשלום?', a: 'כלול. כל מנוי כולל עיסוי ספורט חודשי של 45–60 דקות עם מטפל ייעודי — לא בונוס שמופיע פעם בכמה חודשים. אפשר להוסיף עיסוי קצר לפני או אחרי אימון לפי הצורך.' },
        { q: 'מה עולה חודש?', a: 'תלוי בקצב (פעם, פעמיים, או שלוש בשבוע). שולחים מחירון מסודר אחרי הפנייה הראשונה.' },
        { q: 'איך מבטלים אימון?', a: 'עד 4 שעות לפני. אחרי זה האימון נכנס לחשבון. הכל בוואטסאפ.' },
      ]
    : [
        { q: 'I am totally new to strength training. Is this for me?', a: 'Yes. Most of our clients start with no prior background. The first assessment session figures out where to start.' },
        { q: 'I have an old injury. Can I still train?', a: 'Depends on the injury — after the first call we will know if this is the right path, and if needed we will refer you to someone better suited. We do not promise things we cannot deliver.' },
        { q: 'Who gives the massage?', a: 'Yuval, the center’s Wingate-certified sports- and medical-massage therapist. Ohad coaches, Yuval treats — both of us are with you through the process.' },
        { q: 'Is the massage really included, or is it a paid add-on?', a: 'Included. Every membership comes with a monthly 45–60 minute sports massage from a dedicated therapist — not an occasional perk. Short pre- or post-training work can be added when you need it.' },
        { q: 'What does it cost per month?', a: 'Depends on cadence (1, 2, or 3 sessions per week). We send a clear price sheet after your first message.' },
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
