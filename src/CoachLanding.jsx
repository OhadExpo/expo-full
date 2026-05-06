// Coach-acquisition marketing landing at expo-app.co.il/ (unauthed visitors).
// Authed visitors at / continue to AuthedApp's role-picker / portal flow.
//
// Pitch: a working coach's video-driven training platform — pose detection,
// auto rep counter, side-by-side compare, dormant-WhatsApp nudges, plan
// authoring, client portals. Same engine the visitor can try on /try.
// CTAs: try the demo (/try), join waitlist (Supabase `leads` row with
// source='coach_waitlist'), sign in (/login for existing users).
//
// No checkout, no signup, no multi-tenancy yet — this is a waitlist page.
// Stripe + the trainers table get built once the waitlist proves demand.
import React, { useState, useEffect } from 'react';
import { track } from '@vercel/analytics';
import { C, FN, FB, FH } from './theme';
import { EXPOMark } from './expoMark';
import CoachChat from './CoachChat';

// Vercel Analytics is no-op until it's enabled in the project dashboard, so
// these track() calls are safe to ship before the dashboard is configured.
// Once enabled, they form the funnel:
//   coach_landing_view   → page hit (denominator)
//   coach_demo_open      → clicked any demo CTA
//   coach_waitlist_view  → scrolled to / opened waitlist
//   coach_waitlist_submit → form completed
// Chat events fire from CoachChat.jsx (open + message_sent).
function trackFunnel(event, payload) {
  try { track(event, payload || {}); } catch {}
}

const SUPA_URL = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const SUPA_PUBLISHABLE_KEY = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';

// Inline i18n. The page is mounted at /demo (English default) and /demo/he
// (Hebrew). Translations are natural Israeli "dugri" — direct, practical,
// no marketing fluff or formal/literary phrasing. Add a key under both
// languages or `t()` returns the key string back.
const STRINGS = {
  // Header
  'header.badge':        { en: 'FOR COACHES',          he: 'למאמנים' },
  'header.demo':         { en: 'SEE THE DEMO',         he: 'תראה הדגמה' },
  'header.signin':       { en: 'SIGN IN →',            he: 'התחברות ←' },

  // Hero
  'hero.badge':          { en: 'COACHING PLATFORM',    he: 'פלטפורמת אימון' },
  'hero.h1':             { en: 'Run your roster on the same engine your clients film with.', he: 'תריץ את כל הרוסטר שלך על אותו מנוע שהמתאמנים מצלמים בו.' },
  'hero.body': {
    en: 'Pose detection, auto rep counter, side-by-side video review, plan authoring, client portals, and a dormant-client WhatsApp nudge — built by a working coach, running live on real clients.',
    he: 'זיהוי תנוחה, ספירת חזרות אוטומטית, השוואת וידאו צד-לצד, בניית תוכניות, פורטל אישי לכל מתאמן, ותזכורת וואטסאפ למתאמנים ששקטו — מאמן פעיל בונה את זה, רץ חי על מתאמנים אמיתיים.',
  },
  'hero.cta.coach':      { en: 'SEE COACH VIEW →',     he: 'הצד של המאמן ←' },
  'hero.cta.athlete':    { en: 'SEE ATHLETE VIEW →',   he: 'הצד של המתאמן ←' },
  'hero.cta.waitlist':   { en: 'OR JOIN WAITLIST',     he: 'או הצטרף לרשימה' },
  'hero.smallprint':     { en: 'NO CARD · NO SIGNUP · DEMO RUNS ON YOUR OWN CLIP', he: 'בלי כרטיס · בלי הרשמה · ההדגמה רצה על הקליפ שלך' },

  // Live demo
  'demo.badge':          { en: 'LIVE · NOT A SCREENSHOT', he: 'חי · לא צילום מסך' },
  'demo.h2':             { en: 'Upload a clip. Watch the engine work.', he: 'תעלה קליפ. תראה את המנוע עובד.' },
  'demo.body': {
    en: 'The full engine, running below — same code your clients film with. For the deeper tour (dashboard, plan editor, review tool), open the full coach demo in a new tab.',
    he: 'המנוע המלא רץ למטה — אותו קוד שהמתאמנים שלך מצלמים בו. לסיור המלא (דשבורד, עורך תוכניות, כלי בקרה) — תפתח את הדגמת המאמן.',
  },
  'demo.embed.loading':  { en: 'LOADING ENGINE…',      he: 'טוען מנוע…' },
  'demo.embed.modelfoot':{ en: 'POSE MODEL · ~6MB · FIRST LOAD ONLY', he: 'מודל תנוחה · ~6MB · רק בטעינה ראשונה' },
  'demo.embed.openCoach':{ en: 'OPEN THE FULL COACH DEMO →', he: 'הדגמת מאמן מלאה ←' },
  'demo.embed.openAthlete':{ en: 'OPEN THE ATHLETE VIEW →', he: 'הצד של המתאמן ←' },

  // Features
  'features.badge':      { en: 'WHAT YOU GET',         he: 'מה אתה מקבל' },
  'features.h2':         { en: 'The whole stack — not just video review.', he: 'הכל בפנים — לא רק בקרת וידאו.' },
  'feat.video.tag':      { en: 'VIDEO ENGINE',         he: 'מנוע וידאו' },
  'feat.video.title':    { en: 'Pose + auto rep counter', he: 'זיהוי תנוחה + ספירת חזרות' },
  'feat.video.body': {
    en: 'MediaPipe pose landmarks render live. Reps count from joint-angle troughs — squat / hinge / press / pull are auto-routed to the right channel. Compare two clips side-by-side.',
    he: 'MediaPipe מזהה נקודות תנוחה בזמן אמת. חזרות נספרות לפי ירידות בזווית המפרק — סקוואט / הינג׳ / פרס / פול מנותבים אוטומטית לערוץ הנכון. אפשר להשוות שני קליפים צד-לצד.',
  },
  'feat.prog.tag':       { en: 'PROGRAMMING',          he: 'תכנון אימונים' },
  'feat.prog.title':     { en: 'Block-based plan authoring', he: 'בניית תוכניות בבלוקים' },
  'feat.prog.body': {
    en: 'Build phases of training as named blocks. Day-by-day exercise lists with sets, reps, tempo, video links, supersets, week-by-week wave logs. Bulk import from xlsx.',
    he: 'בונה שלבי אימון כבלוקים. רשימת תרגילים לכל יום עם סטים, חזרות, טמפו, וידאו, סופרסטים, ומעקב גלים שבועי. מייבא הכל מ-xlsx בלחיצה.',
  },
  'feat.portal.tag':     { en: 'ATHLETE PORTAL',       he: 'פורטל מתאמנים' },
  'feat.portal.title':   { en: 'Branded portal per athlete', he: 'פורטל אישי לכל מתאמן' },
  'feat.portal.body': {
    en: 'Each client logs in to a workout view with their plan, video reviews, and feedback. Couples share a couple-card. Bodyweight + session logging built in.',
    he: 'כל מתאמן מתחבר לתצוגה אישית עם התוכנית שלו, בקרות וידאו, ופידבק. זוגות חולקים כרטיס משותף. מעקב משקל גוף ואימונים מובנה במערכת.',
  },
  'feat.ops.tag':        { en: 'OPS',                  he: 'תפעול' },
  'feat.ops.title':      { en: 'Dormant nudges via WhatsApp', he: 'תזכורות וואטסאפ למתאמנים ששקטו' },
  'feat.ops.body': {
    en: "Dashboard surfaces clients who haven't trained in N days. One-tap opens WhatsApp with a prefilled Hebrew/English check-in — phone numbers stay in the trainee record.",
    he: 'הדשבורד מציג את המתאמנים שלא התאמנו כמה ימים. לחיצה אחת פותחת וואטסאפ עם הודעה מוכנה בעברית או באנגלית — מספרי הטלפון נשארים בכרטיס המתאמן.',
  },
  'feat.review.tag':     { en: 'REVIEW',               he: 'בקרה' },
  'feat.review.title':   { en: 'Per-rep video review', he: 'בקרת וידאו לכל חזרה' },
  'feat.review.body': {
    en: 'Pause on any frame, draw on the video, leave timestamped voice + text comments. The athlete sees the review from the same portal — no email back-and-forth.',
    he: 'עצירה בכל פריים, ציור על הווידאו, הערות קוליות וטקסט עם תזמון. המתאמן רואה את הבקרה מאותו פורטל — בלי תכתובת מיילים.',
  },
  'feat.export.tag':     { en: 'NO LOCK-IN',           he: 'בלי נעילה' },
  'feat.export.title':   { en: 'Your data, your rules', he: 'הנתונים שלך — אתה מחליט' },
  'feat.export.body': {
    en: 'Export every plan, exercise, and workout log to xlsx anytime. Bring your existing exercise library — xlsx, sheets, or whatever export your previous app gave you, bulk import is part of onboarding.',
    he: 'אפשר לייצא כל תוכנית, תרגיל, ולוג אימון ל-xlsx בכל רגע. תביא איתך את ספריית התרגילים הקיימת — xlsx, גוגל שיטס, או כל פורמט שהאפליקציה הקודמת ייצאה — אנחנו מייבאים את הכל בהצטרפות.',
  },

  // About
  'about.badge':         { en: 'WHO BUILDS IT',        he: 'מי בונה את זה' },
  'about.h2':            { en: 'Built by a working coach for working coaches.', he: 'מאמן פעיל בונה את זה למאמנים פעילים.' },
  'about.body': {
    en: "I'm Ohad. I run my own roster on this exact platform — every line of it exists because I needed it on a Tuesday morning between sessions. Nothing in here is theoretical. If a feature doesn't survive contact with real clients, it gets cut.",
    he: 'אני אוהד. אני מנהל את הרוסטר שלי על אותה פלטפורמה בדיוק — כל שורת קוד כאן קיימת כי הייתי צריך אותה ביום שלישי בבוקר בין אימונים. שום דבר פה לא תיאורטי. פיצ׳ר שלא עובד מול מתאמנים אמיתיים — יוצא.',
  },

  // Pricing
  'pricing.badge':       { en: 'FOUNDING-COACH PRICING', he: 'מחיר מאמן מייסד' },
  'pricing.h2':          { en: 'Pick the slot count that fits your roster.', he: 'תבחר את הכמות שמתאימה לרוסטר שלך.' },
  'pricing.body': {
    en: 'Per-coach, flat monthly — no per-client fees, no transaction cuts. Numbers below are indicative; founding-coach pricing gets locked one tier lower on a 20-minute intake call before your account opens.',
    he: 'מחיר חודשי לכל מאמן — בלי עמלה על מתאמן, בלי אחוזים מעסקאות. המספרים למטה אינדיקטיביים; מחיר מאמן מייסד נסגר רמה אחת נמוכה יותר בשיחת היכרות של 20 דקות, לפני שפותחים לך חשבון.',
  },
  'pricing.note':        { en: "NO CARD NOW · WAITLIST ONLY · I'LL REACH OUT TO LOCK PRICING", he: 'בלי כרטיס עכשיו · רק רשימת המתנה · אני אחזור אליך לסגור מחיר' },
  'pricing.popular':     { en: 'MOST POPULAR',         he: 'הכי פופולרי' },

  'tier.starter.name':   { en: 'STARTER',              he: 'מתחיל' },
  'tier.starter.slots':  { en: 'Up to 10 active clients', he: 'עד 10 מתאמנים פעילים' },
  'tier.starter.f1':     { en: 'Full video review engine', he: 'מנוע בקרת וידאו מלא' },
  'tier.starter.f2':     { en: 'Plan authoring + xlsx import', he: 'בניית תוכניות + ייבוא מ-xlsx' },
  'tier.starter.f3':     { en: 'Athlete portals + couple cards', he: 'פורטל מתאמנים + כרטיסי זוגות' },
  'tier.starter.f4':     { en: 'Dormant-WhatsApp nudges', he: 'תזכורות וואטסאפ למתאמנים ששקטו' },

  'tier.growth.name':    { en: 'GROWTH',               he: 'צמיחה' },
  'tier.growth.slots':   { en: 'Up to 30 active clients', he: 'עד 30 מתאמנים פעילים' },
  'tier.growth.f1':      { en: 'Everything in Starter', he: 'כל מה שיש במתחיל' },
  'tier.growth.f2':      { en: 'Bulk plan duplication across clients', he: 'שכפול תוכניות בין מתאמנים בלחיצה' },
  'tier.growth.f3':      { en: 'Bodyweight + session payment tracking', he: 'מעקב משקל גוף + תשלומי אימונים' },
  'tier.growth.f4':      { en: 'Priority email support', he: 'תמיכת מייל עם עדיפות' },

  'tier.founding.name':  { en: 'FOUNDING PARTNER',     he: 'שותף מייסד' },
  'tier.founding.slots': { en: 'Unlimited clients · roadmap influence', he: 'מתאמנים בלי הגבלה · השפעה על מפת הדרכים' },
  'tier.founding.f1':    { en: 'Everything in Growth', he: 'כל מה שיש בצמיחה' },
  'tier.founding.f2':    { en: 'Direct line for product requests + roadmap input', he: 'קו ישיר לבקשות מוצר + השפעה על מפת הדרכים' },
  'tier.founding.f3':    { en: 'Quarterly product strategy call', he: 'שיחת אסטרטגיה רבעונית' },
  'tier.founding.f4':    { en: 'First access to features as they ship', he: 'גישה ראשונה לפיצ׳רים ברגע שעולים' },

  'tier.cta.waitlist':   { en: 'JOIN WAITLIST',        he: 'הצטרפות לרשימה' },
  'tier.priceSub':       { en: '/ MONTH',              he: '/ חודש' },

  // Waitlist CTA
  'wl.badge':            { en: 'FOUNDING COACH WAITLIST', he: 'רשימת מאמנים מייסדים' },
  'wl.h2':               { en: 'Get early access at founding-coach pricing.', he: 'גישה מוקדמת במחיר מאמן מייסד.' },
  'wl.body': {
    en: "Multi-coach access opens slot-by-slot. Drop your email — I'll reach out personally when it's your turn. No card. No commitment.",
    he: 'הגישה למאמנים נפתחת מקום אחר מקום. השאר אימייל — אני אחזור אליך אישית כשיגיע התור שלך. בלי כרטיס. בלי מחויבות.',
  },
  'wl.placeholder':      { en: 'your@email.com',       he: 'your@email.com' },
  'wl.cta':              { en: 'JOIN WAITLIST',        he: 'הצטרפות' },
  'wl.err.email':        { en: 'Enter a valid email',  he: 'תכניס מייל תקין' },
  'wl.err.network':      { en: 'Something went wrong. Try again in a minute.', he: 'משהו השתבש. תנסה שוב עוד רגע.' },
  'wl.done':             { en: "✓ YOU'RE ON THE LIST. I'LL EMAIL YOU AS COACH SLOTS OPEN.", he: '✓ אתה ברשימה. אני אשלח לך מייל ברגע שייפתח מקום מאמן.' },

  // Sticky mobile + footer
  'sticky.engine':       { en: 'TRY THE ENGINE',       he: 'תנסה את המנוע' },
  'sticky.waitlist':     { en: 'WAITLIST →',           he: 'לרשימה ←' },
  'footer.line':         { en: '· COACHING PLATFORM · BUILT IN TEL AVIV · © {year} ALL RIGHTS RESERVED', he: '· פלטפורמת אימון · נבנה בתל אביב · © {year} כל הזכויות שמורות' },
  'footer.demo':         { en: 'DEMO',                 he: 'הדגמה' },
  'footer.signin':       { en: 'SIGN IN',              he: 'התחברות' },

  // <title>
  'doc.title':           { en: 'EXPO · Coaching Platform', he: 'EXPO · פלטפורמת אימון' },
};

function makeT(lang) {
  return (key, vars) => {
    const e = STRINGS[key];
    let s = e?.[lang] ?? e?.en ?? key;
    if (vars) s = s.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));
    return s;
  };
}

const baseBtn = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  padding: '12px 22px', borderRadius: 0, border: 'none',
  fontFamily: FN, fontSize: 11, fontWeight: 700,
  cursor: 'pointer', letterSpacing: '0.18em', textTransform: 'uppercase', transition: 'all 0.15s',
  textDecoration: 'none',
};

function WaitlistForm({ t }) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState('idle'); // idle | sending | done | error
  const [err, setErr] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    if (state === 'sending' || state === 'done') return;
    const trimmed = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setState('error'); setErr(t('wl.err.email')); return;
    }
    setState('sending'); setErr('');
    try {
      const res = await fetch(`${SUPA_URL}/rest/v1/leads`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPA_PUBLISHABLE_KEY,
          'Authorization': `Bearer ${SUPA_PUBLISHABLE_KEY}`,
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({
          email: trimmed,
          source: 'expo-app',
          context: 'coach_waitlist',
          user_agent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 200) : null,
        }),
      });
      // 409 = duplicate (already on the waitlist) — treat as success so the
      // visitor sees confirmation instead of a confusing error.
      if (!res.ok && res.status !== 409) {
        const txt = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}${txt ? ': ' + txt.slice(0, 80) : ''}`);
      }
      setState('done');
      trackFunnel('coach_waitlist_submit', { duplicate: res.status === 409 });
    } catch (e2) {
      console.error('Waitlist submit failed:', e2);
      setState('error'); setErr(t('wl.err.network'));
    }
  };
  if (state === 'done') {
    return (
      <div style={{
        fontFamily: FN, color: C.gn, fontSize: 13, letterSpacing: '0.18em', fontWeight: 700,
        padding: '14px 20px', border: `1px solid ${C.gn}40`, borderRadius: 0,
        textAlign: 'center', maxWidth: 460, margin: '0 auto',
      }}>
        {t('wl.done')}
      </div>
    );
  }
  return (
    <form onSubmit={submit} style={{
      display: 'flex', flexDirection: 'column', gap: 8,
      maxWidth: 460, margin: '0 auto', width: '100%',
    }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input type="email" autoComplete="email" value={email}
          onChange={e => { setEmail(e.target.value); if (state === 'error') setState('idle'); }}
          placeholder={t('wl.placeholder')}
          style={{
            background: 'transparent', border: `0.25px solid ${C.ac}4D`,
            borderRadius: 0, padding: '12px 14px', color: C.tx,
            fontFamily: FB, fontSize: 14, outline: 'none',
            flex: '1 1 220px', minWidth: 0,
          }} />
        <button type="submit" disabled={state === 'sending'} style={{
          ...baseBtn,
          background: state === 'sending' ? C.bd : C.ac,
          color: state === 'sending' ? C.tm : '#000',
          padding: '12px 20px',
        }}>{state === 'sending' ? '…' : t('wl.cta')}</button>
      </div>
      {state === 'error' && (
        <div style={{
          fontFamily: FN, color: C.rd, fontSize: 11, letterSpacing: '0.18em', textAlign: 'center',
        }}>{err}</div>
      )}
    </form>
  );
}

// Single embedded engine on the marketing page. The visitor uploads a clip,
// sees pose detection + rep count instantly. For the deep dives — the full
// coach surface (dashboard, trainees, plans, review) and the trainee POV
// engine — they click out to /try or /demo via the buttons under the embed.
// embed=1 strips TrySandbox's own header/footer so the engine slots cleanly
// inside the marketing page.
function DemoEmbed({ t }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div>
      <div className="cl-embed" style={{
        background: 'transparent', border: `0.25px solid ${C.ac}4D`, borderRadius: 0,
        overflow: 'hidden', maxWidth: 1180, margin: '0 auto', position: 'relative',
        boxShadow: `0 0 0 1px ${C.bd}, 0 30px 60px -20px rgba(0,0,0,0.6)`,
      }}>
        <style>{`
          .cl-embed { min-height: 720px; }
          .cl-embed iframe { height: 720px; }
          @media (max-width: 720px) { .cl-embed { min-height: 560px; } .cl-embed iframe { height: 560px; } }
          @media (max-width: 480px) { .cl-embed { min-height: 480px; } .cl-embed iframe { height: 480px; } }
          @keyframes cl-spin { to { transform: rotate(360deg); } }
        `}</style>
        {!loaded && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 14,
            background: C.bg,
            color: C.tm, fontFamily: FN, fontSize: 9, letterSpacing: '0.18em', fontWeight: 700,
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: '50%',
              border: `2px solid ${C.ac}4D`, borderTopColor: C.ac,
              animation: 'cl-spin 0.9s linear infinite',
            }} />
            <div>{t('demo.embed.loading')}</div>
            <div style={{ fontSize: 9, color: C.td, letterSpacing: '0.18em' }}>{t('demo.embed.modelfoot')}</div>
          </div>
        )}
        <iframe src="/demo/athlete?embed=1" title="EXPO live engine"
          onLoad={() => setLoaded(true)}
          style={{
            display: 'block', width: '100%', border: 'none', position: 'relative', zIndex: 1,
            opacity: loaded ? 1 : 0, transition: 'opacity 0.3s',
          }} />
      </div>
      <div style={{
        textAlign: 'center', marginTop: 16,
        display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap',
      }}>
        <a href="/demo/coach" target="_blank" rel="noopener" style={{
          ...baseBtn, background: C.ac, color: '#000', padding: '11px 22px', fontSize: 12,
        }}>{t('demo.embed.openCoach')}</a>
        <a href="/demo/athlete" target="_blank" rel="noopener" style={{
          ...baseBtn, background: 'transparent', color: C.tx,
          border: `1px solid ${C.bd2}`, padding: '11px 22px', fontSize: 12,
        }}>{t('demo.embed.openAthlete')}</a>
      </div>
    </div>
  );
}

function PricingTier({ name, slots, popular, features, cta, price, priceSub, popularLabel, isHe }) {
  return (
    <div style={{
      background: 'transparent',
      border: popular ? `1px solid ${C.ac}` : `0.25px solid ${C.ac}4D`,
      borderRadius: 0, padding: '24px 20px', textAlign: isHe ? 'right' : 'left',
      position: 'relative', display: 'flex', flexDirection: 'column', minHeight: 360,
    }}>
      {popular && (
        <div style={{
          position: 'absolute', top: -10, [isHe ? 'left' : 'right']: 14,
          fontFamily: FN, fontSize: 9, color: C.ac, background: 'transparent',
          letterSpacing: '0.18em', fontWeight: 700, padding: '3px 8px', borderRadius: 0,
          border: `1px solid ${C.ac}`,
        }}>{popularLabel}</div>
      )}
      <div style={{
        fontFamily: FN, color: C.ac, fontSize: 11, letterSpacing: '0.18em', fontWeight: 700,
        marginBottom: 10,
      }}>{name}</div>
      {price && (
        <div style={{
          display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 6,
        }}>
          <span style={{
            fontFamily: FB, fontSize: 30, fontWeight: 700, color: C.tx, letterSpacing: -0.6,
          }}>{price}</span>
          {priceSub && (
            <span style={{
              fontFamily: FN, fontSize: 11, color: C.tm, letterSpacing: '0.18em',
            }}>{priceSub}</span>
          )}
        </div>
      )}
      <div style={{
        fontFamily: FB, fontSize: 14, fontWeight: 600, color: C.tm, opacity: 0.85,
        marginBottom: 6,
      }}>{slots}</div>
      <ul style={{
        listStyle: 'none', padding: 0, margin: '14px 0 18px',
        fontFamily: FB, fontSize: 13.5, lineHeight: 1.65, color: C.tx, opacity: 0.85,
      }}>
        {features.map((f, i) => (
          <li key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 4 }}>
            <span style={{ color: C.ac, flex: '0 0 auto' }}>✓</span><span>{f}</span>
          </li>
        ))}
      </ul>
      <div style={{ marginTop: 'auto' }}>
        <a href="#waitlist" style={{
          ...baseBtn, width: '100%',
          background: popular ? C.ac : 'transparent',
          color: popular ? '#000' : C.tx,
          border: popular ? 'none' : `1px solid ${C.bd2}`,
          padding: '11px 16px', fontSize: 12,
        }}>{cta}</a>
      </div>
    </div>
  );
}

function FeatureCard({ tag, title, body, isHe }) {
  return (
    <div style={{
      background: 'transparent', border: `0.25px solid ${C.ac}4D`, borderRadius: 0,
      padding: 22, textAlign: isHe ? 'right' : 'left',
    }}>
      <div style={{
        fontFamily: FN, color: C.ac, fontSize: 10, letterSpacing: '0.18em', fontWeight: 700,
        marginBottom: 10,
      }}>{tag}</div>
      <h3 style={{
        fontFamily: FB, fontSize: 17, fontWeight: 700, margin: '0 0 8px',
        letterSpacing: -0.2, color: C.tx,
      }}>{title}</h3>
      <p style={{
        fontFamily: FB, color: C.tx, opacity: 0.78, fontSize: 13.5, lineHeight: 1.55, margin: 0,
      }}>{body}</p>
    </div>
  );
}

export default function CoachLanding({ lang = 'en' }) {
  const isHe = lang === 'he';
  const t = makeT(lang);
  // Fire the page-view funnel event once per mount. lang is in the payload
  // so we can split conversion rates by locale (en vs he).
  useEffect(() => { trackFunnel('coach_landing_view', { lang }); }, []); // eslint-disable-line
  // Single delegated click listener for every /demo/* link on the page so
  // we don't have to chase each <a> tag individually. Captures the href
  // suffix as `target` so we can split coach-vs-trainee demo opens later.
  useEffect(() => {
    const onClick = (e) => {
      let el = e.target;
      while (el && el !== document.body && el.tagName !== 'A') el = el.parentElement;
      if (!el || el.tagName !== 'A') return;
      const href = el.getAttribute('href') || '';
      if (href.startsWith('/demo/')) {
        trackFunnel('coach_demo_open', { target: href.replace('/demo/', '') });
      } else if (href === '#waitlist') {
        trackFunnel('coach_waitlist_view', {});
      }
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);
  // Sync <html lang>, <html dir>, and document.title with the active locale.
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = isHe ? 'rtl' : 'ltr';
    document.title = t('doc.title');
    return () => {
      // Reset on unmount so other routes (e.g. coach app) don't inherit RTL.
      document.documentElement.dir = 'ltr';
    };
  }, [lang, isHe, t]);
  return (
    <div dir={isHe ? 'rtl' : 'ltr'} style={{
      background: C.bg, color: C.tx, minHeight: '100vh', fontFamily: isHe ? FH : FB,
      display: 'flex', flexDirection: 'column',
    }}>
      <style>{`
        @keyframes fade-up { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: translateY(0) } }
        a:focus-visible, button:focus-visible {
          outline: 2px solid ${C.ac}; outline-offset: 2px; border-radius: 4px;
        }
        /* Sticky bottom CTA bar — only on phones/small tablets where the
           hero buttons scroll out of view. Desktop already shows them in
           the header + hero, so the sticky bar would be redundant noise. */
        .cl-sticky-cta { display: none; }
        @media (max-width: 720px) {
          .cl-sticky-cta { display: flex; }
          /* Reserve room at the bottom of the page so the sticky bar
             doesn't cover the footer or last form. */
          main { padding-bottom: 76px; }
          /* Header items that overcrowd the row on narrow screens. The
             "FOR COACHES" badge is implied by being on /demo, and the
             header "SEE THE DEMO" link is redundant with the hero CTAs
             below + the sticky bottom bar. Hidden under 720px so the
             remaining items (logo + lang toggle + SIGN IN) breathe. */
          .cl-header-badge,
          .cl-header-demo-btn { display: none; }
        }
      `}</style>

      {/* Header */}
      <header style={{
        background: C.bg, borderBottom: `0.25px solid ${C.ac}4D`,
        position: 'sticky', top: 0, zIndex: 50,
      }}>
        <div style={{
          maxWidth: 1180, margin: '0 auto', padding: '0 16px',
          display: 'flex', alignItems: 'center', height: 60, gap: 14,
        }}>
          <a href="/" style={{ display: 'flex', alignItems: 'center', flex: '0 0 auto', textDecoration: 'none' }}>
            <EXPOMark height={36} style={{ marginBottom: 0 }} />
          </a>
          <span className="cl-header-badge" style={{
            fontFamily: FN, fontSize: 10, color: C.ac, letterSpacing: '0.18em', fontWeight: 700,
            padding: '4px 8px', background: 'transparent', borderRadius: 0,
            border: `1px solid ${C.ac}`, whiteSpace: 'nowrap',
          }}>{t('header.badge')}</span>
          <div style={{ flex: 1 }} />
          <a href={isHe ? '/demo' : '/demo/he'} style={{
            ...baseBtn, background: 'transparent', color: C.tm,
            border: `1px solid ${C.bd}`, padding: '8px 10px', fontSize: 10,
            letterSpacing: '0.18em', fontWeight: 700,
          }}>{isHe ? 'EN' : 'עב'}</a>
          <a href="/demo/coach" className="cl-header-demo-btn" style={{
            ...baseBtn, background: 'transparent', color: C.tx,
            border: `1px solid ${C.bd2}`, padding: '8px 14px', fontSize: 11,
          }}>{t('header.demo')}</a>
          <a href="/login" style={{
            ...baseBtn, background: 'transparent', color: C.tm,
            padding: '8px 14px', fontSize: 11,
          }}>{t('header.signin')}</a>
        </div>
      </header>

      <main style={{ flex: 1 }}>
        {/* Hero */}
        <section style={{
          maxWidth: 920, margin: '0 auto', padding: '64px 20px 40px', textAlign: 'center',
        }}>
          {/* EXPO icon (caret-X mark, not the wordmark) above "COACHING
              PLATFORM" — both center-aligned. gap and marginBottom kept
              equal at 14px so icon → badge → h1 reads as three evenly-
              spaced rows. */}
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
            fontFamily: FN, color: C.ac, fontSize: 11, letterSpacing: '0.18em', fontWeight: 700,
            marginBottom: 14,
          }}>
            <img src="/icon-512.png" alt="EXPO" width="80" height="80" style={{ display: 'block' }} />
            <span>{t('hero.badge')}</span>
          </div>
          <h1 style={{
            fontFamily: FB, fontSize: 'clamp(30px, 5vw, 50px)', fontWeight: 700,
            margin: '0 0 16px', letterSpacing: -0.6, lineHeight: 1.08,
          }}>{t('hero.h1')}</h1>
          <p style={{
            fontFamily: FB, color: C.tx, opacity: 0.85, fontSize: 16, lineHeight: 1.55,
            maxWidth: 680, margin: '0 auto 32px',
          }}>
            {t('hero.body')}
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 14 }}>
            <a href="/demo/coach" style={{
              ...baseBtn, background: C.ac, color: '#000', padding: '13px 26px', fontSize: 13,
            }}>{t('hero.cta.coach')}</a>
            <a href="/demo/athlete" style={{
              ...baseBtn, background: 'transparent', color: C.tx,
              border: `1px solid ${C.bd2}`, padding: '13px 26px', fontSize: 13,
            }}>{t('hero.cta.athlete')}</a>
            <a href="#waitlist" style={{
              ...baseBtn, background: 'transparent', color: C.tm,
              padding: '13px 18px', fontSize: 13,
            }}>{t('hero.cta.waitlist')}</a>
          </div>
          <div style={{
            fontFamily: FN, fontSize: 10, color: C.td, letterSpacing: '0.18em', fontWeight: 700,
          }}>{t('hero.smallprint')}</div>
        </section>

        {/* Live demo — two-tab embed of /try (coach POV) and /demo (trainee POV) */}
        <section style={{
          maxWidth: 1180, margin: '0 auto', padding: '8px 16px 40px',
        }}>
          <div style={{
            fontFamily: FN, color: C.ac, fontSize: 11, letterSpacing: '0.18em', fontWeight: 700,
            marginBottom: 14, textAlign: 'center',
          }}>{t('demo.badge')}</div>
          <h2 style={{
            fontFamily: FB, fontSize: 'clamp(22px, 3.5vw, 30px)', fontWeight: 700,
            margin: '0 0 14px', letterSpacing: -0.3, textAlign: 'center',
          }}>{t('demo.h2')}</h2>
          <p style={{
            fontFamily: FB, color: C.tx, opacity: 0.78, fontSize: 14.5, lineHeight: 1.55,
            maxWidth: 680, margin: '0 auto 22px', textAlign: 'center',
          }}>
            {t('demo.body')}
          </p>
          <DemoEmbed t={t} />
        </section>

        {/* What you get */}
        <section style={{
          maxWidth: 1180, margin: '0 auto', padding: '60px 16px 20px',
        }}>
          <div style={{
            fontFamily: FN, color: C.ac, fontSize: 11, letterSpacing: '0.18em', fontWeight: 700,
            marginBottom: 12, textAlign: 'center',
          }}>{t('features.badge')}</div>
          <h2 style={{
            fontFamily: FB, fontSize: 'clamp(22px, 3.5vw, 30px)', fontWeight: 700,
            margin: '0 0 28px', letterSpacing: -0.3, textAlign: 'center',
          }}>{t('features.h2')}</h2>
          <div style={{
            display: 'grid', gap: 14,
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))',
          }}>
            <FeatureCard isHe={isHe} tag={t('feat.video.tag')} title={t('feat.video.title')} body={t('feat.video.body')} />
            <FeatureCard isHe={isHe} tag={t('feat.prog.tag')} title={t('feat.prog.title')} body={t('feat.prog.body')} />
            <FeatureCard isHe={isHe} tag={t('feat.portal.tag')} title={t('feat.portal.title')} body={t('feat.portal.body')} />
            <FeatureCard isHe={isHe} tag={t('feat.ops.tag')} title={t('feat.ops.title')} body={t('feat.ops.body')} />
            <FeatureCard isHe={isHe} tag={t('feat.review.tag')} title={t('feat.review.title')} body={t('feat.review.body')} />
            <FeatureCard isHe={isHe} tag={t('feat.export.tag')} title={t('feat.export.title')} body={t('feat.export.body')} />
          </div>
        </section>

        {/* Why I'm building this */}
        <section style={{
          maxWidth: 920, margin: '0 auto', padding: '60px 16px 30px', textAlign: 'center',
        }}>
          <div style={{
            fontFamily: FN, color: C.ac, fontSize: 11, letterSpacing: '0.18em', fontWeight: 700,
            marginBottom: 12,
          }}>{t('about.badge')}</div>
          <h2 style={{
            fontFamily: FB, fontSize: 'clamp(22px, 3.5vw, 28px)', fontWeight: 700,
            margin: '0 0 14px', letterSpacing: -0.3,
          }}>{t('about.h2')}</h2>
          <p style={{
            fontFamily: FB, color: C.tx, opacity: 0.85, fontSize: 15, lineHeight: 1.6,
            maxWidth: 660, margin: '0 auto',
          }}>
            {t('about.body')}
          </p>
        </section>

        {/* Pricing tiers — placeholder slots, exact prices set on a founding-coach call */}
        <section id="pricing" style={{
          maxWidth: 1180, margin: '0 auto', padding: '60px 16px 20px',
        }}>
          <div style={{
            fontFamily: FN, color: C.ac, fontSize: 11, letterSpacing: '0.18em', fontWeight: 700,
            marginBottom: 12, textAlign: 'center',
          }}>{t('pricing.badge')}</div>
          <h2 style={{
            fontFamily: FB, fontSize: 'clamp(22px, 3.5vw, 30px)', fontWeight: 700,
            margin: '0 0 14px', letterSpacing: -0.3, textAlign: 'center',
          }}>{t('pricing.h2')}</h2>
          <p style={{
            fontFamily: FB, color: C.tx, opacity: 0.78, fontSize: 14.5, lineHeight: 1.6,
            maxWidth: 620, margin: '0 auto 32px', textAlign: 'center',
          }}>
            {t('pricing.body')}
          </p>
          <div style={{
            display: 'grid', gap: 14,
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))',
          }}>
            <PricingTier
              isHe={isHe}
              popularLabel={t('pricing.popular')}
              name={t('tier.starter.name')}
              price="₪149"
              priceSub={t('tier.priceSub')}
              slots={t('tier.starter.slots')}
              cta={t('tier.cta.waitlist')}
              features={[
                t('tier.starter.f1'),
                t('tier.starter.f2'),
                t('tier.starter.f3'),
                t('tier.starter.f4'),
              ]}
            />
            <PricingTier
              isHe={isHe}
              popularLabel={t('pricing.popular')}
              name={t('tier.growth.name')}
              price="₪249"
              priceSub={t('tier.priceSub')}
              slots={t('tier.growth.slots')}
              popular
              cta={t('tier.cta.waitlist')}
              features={[
                t('tier.growth.f1'),
                t('tier.growth.f2'),
                t('tier.growth.f3'),
                t('tier.growth.f4'),
              ]}
            />
            <PricingTier
              isHe={isHe}
              popularLabel={t('pricing.popular')}
              name={t('tier.founding.name')}
              price="₪399"
              priceSub={t('tier.priceSub')}
              slots={t('tier.founding.slots')}
              cta={t('tier.cta.waitlist')}
              features={[
                t('tier.founding.f1'),
                t('tier.founding.f2'),
                t('tier.founding.f3'),
                t('tier.founding.f4'),
              ]}
            />
          </div>
          <div style={{
            marginTop: 18, textAlign: 'center',
            fontFamily: FN, fontSize: 10, color: C.td, letterSpacing: '0.18em',
          }}>{t('pricing.note')}</div>
        </section>

        {/* Waitlist CTA */}
        <section id="waitlist" style={{
          maxWidth: 720, margin: '0 auto', padding: '40px 16px 80px', textAlign: 'center',
        }}>
          <div style={{
            background: 'transparent',
            border: `1px solid ${C.ac}`, borderRadius: 0,
            padding: '36px 24px',
          }}>
            <div style={{
              fontFamily: FN, color: C.ac, fontSize: 11, letterSpacing: '0.18em', fontWeight: 700,
              marginBottom: 10,
            }}>{t('wl.badge')}</div>
            <h2 style={{
              fontFamily: FB, fontSize: 'clamp(22px, 3.4vw, 28px)', fontWeight: 700,
              margin: '0 0 12px', letterSpacing: -0.3,
            }}>{t('wl.h2')}</h2>
            <p style={{
              fontFamily: FB, color: C.tx, opacity: 0.78, fontSize: 14.5, lineHeight: 1.6,
              maxWidth: 540, margin: '0 auto 22px',
            }}>
              {t('wl.body')}
            </p>
            <WaitlistForm t={t} />
          </div>
        </section>
      </main>

      {/* Sticky mobile-only CTA bar — see <style> block at top of component. */}
      <div className="cl-sticky-cta" style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 60,
        background: C.bg, borderTop: `0.25px solid ${C.ac}4D`,
        padding: '10px 12px', gap: 8, alignItems: 'stretch',
        boxShadow: '0 -8px 24px rgba(0,0,0,0.4)',
      }}>
        <a href="/demo/coach" style={{
          ...baseBtn, flex: 1, background: 'transparent', color: C.tx,
          border: `1px solid ${C.bd2}`, padding: '12px 14px', fontSize: 12,
        }}>{t('sticky.engine')}</a>
        <a href="#waitlist" style={{
          ...baseBtn, flex: 1, background: C.ac, color: '#000',
          padding: '12px 14px', fontSize: 12,
        }}>{t('sticky.waitlist')}</a>
      </div>

      <footer style={{
        borderTop: `0.25px solid ${C.ac}4D`, padding: '20px 16px',
        maxWidth: 1180, margin: '0 auto', width: '100%',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        gap: 12, flexWrap: 'wrap',
      }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          fontFamily: FN, fontSize: 10, color: C.td, letterSpacing: '0.18em',
        }}>
          <EXPOMark height={14} style={{ opacity: 0.55 }} />
          <span>{t('footer.line', { year: new Date().getFullYear() })}</span>
        </span>
        <span style={{ fontFamily: FN, fontSize: 10, color: C.td, letterSpacing: 1 }}>
          <a href="/demo/coach" style={{ color: C.td, textDecoration: 'none' }}>{t('footer.demo')}</a>
          <span style={{ margin: '0 8px' }}>·</span>
          <a href="/login" style={{ color: C.td, textDecoration: 'none' }}>{t('footer.signin')}</a>
        </span>
      </footer>

      <CoachChat />
    </div>
  );
}
