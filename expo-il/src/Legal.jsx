// PRIVACY, TERMS AND THE ACCESSIBILITY STATEMENT.
//
// From Ohad's checklist, 21.9: מדיניות פרטיות, דף מדיניות ותנאים, תוסיף פיצ'ר
// נגישות. None of the three existed — the site had exactly three routes
// (#/gym, #/online, #/programs) and no legal page at all.
//
// WRITTEN FROM AN AUDIT OF WHAT THE SITE ACTUALLY DOES, not from a template.
// Every claim below was read out of the code first:
//
//   collected   an email address, plus `source`, `context` (which form it came
//               from) and the first 200 characters of the user-agent string.
//               That is the whole of it - src/App.jsx LeadCapture.
//   why the UA  it is not decoration and it is not dead: WaitlistView.jsx
//               scores a lead higher when a real user-agent is present, as bot
//               detection. So it is disclosed here rather than removed.
//   where       Supabase (Postgres, EU/US region per project config), written
//               straight from the browser to /rest/v1/leads under an anon RLS
//               policy that grants INSERT only.
//   browser     localStorage holds the chosen language; sessionStorage holds a
//               chunk-reload guard and an "exit prompt already seen" flag.
//               Nothing else. No advertising or tracking cookie is set.
//   analytics   Vercel Analytics, which is cookieless.
//   embeds      Google Calendar, and ONLY after the visitor clicks to load it
//               (see ConsentFrame.jsx).
//
// THE WORDING IS NOT LEGAL ADVICE and Ohad should have it read before this
// deploys. What it is, is accurate: it does not promise anything the code does
// not do, which is the failure mode of a downloaded template.
import React from 'react';
import { C, FN, FB } from './theme';
import { useT, useLang } from './i18n';

const UPDATED = '2026-09-21';

const H1 = ({ children }) => (
  <h1 style={{ fontFamily: FN, fontSize: 'clamp(26px, 4vw, 38px)', fontWeight: 800,
    letterSpacing: '-0.02em', margin: '0 0 8px', color: C.tx }}>{children}</h1>
);
const H2 = ({ children }) => (
  <h2 style={{ fontFamily: FN, fontSize: 13, fontWeight: 800, letterSpacing: '0.16em',
    textTransform: 'uppercase', color: C.ac, margin: '34px 0 10px' }}>{children}</h2>
);
const P = ({ children }) => (
  <p style={{ margin: '0 0 12px', fontSize: 15, lineHeight: 1.75, color: C.tm }}>{children}</p>
);
const LI = ({ children }) => (
  <li style={{ margin: '0 0 8px', fontSize: 15, lineHeight: 1.7, color: C.tm }}>{children}</li>
);

function Shell({ title, children }) {
  const [lang] = useLang();
  const heb = lang === 'he';
  return (
    <div dir={heb ? 'rtl' : 'ltr'} style={{ background: C.bg, color: C.tx, minHeight: '100vh', fontFamily: FB }}>
      <main style={{ maxWidth: 760, margin: '0 auto', padding: '40px 20px 90px' }}>
        <a href="#/" style={{ fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.16em',
          textTransform: 'uppercase', color: C.ac, textDecoration: 'none', display: 'inline-block', marginBottom: 22 }}>
          {heb ? '→ חזרה לאתר' : '← Back to the site'}
        </a>
        <H1>{title}</H1>
        <div style={{ fontFamily: FN, fontSize: 11, color: C.td, letterSpacing: '0.12em', marginBottom: 6 }}>
          {heb ? `עודכן ${UPDATED}` : `Updated ${UPDATED}`}
        </div>
        {children}
      </main>
    </div>
  );
}

export function Privacy() {
  const [lang] = useLang();
  const heb = lang === 'he';
  return (
    <Shell title={heb ? 'מדיניות פרטיות' : 'Privacy policy'}>
      <H2>{heb ? 'מה נאסף' : 'What is collected'}</H2>
      <P>{heb
        ? 'אם השארת אימייל באחד הטפסים באתר, נשמרים: כתובת האימייל, מאיזה טופס הגעת, ו־200 התווים הראשונים של מזהה הדפדפן שלך (user agent). זה הכול. אין טופס אחר באתר שאוסף פרטים.'
        : 'If you leave your email in a form on this site, what is stored is: the email address, which form it came from, and the first 200 characters of your browser’s user-agent string. That is all of it. No other form on this site collects anything.'}</P>
      <P>{heb
        ? 'מזהה הדפדפן נשמר כדי להבדיל בין פנייה אמיתית לבין הרשמה אוטומטית של בוט — לא לפרסום ולא לפרופיילינג.'
        : 'The user-agent is kept to tell a real enquiry from an automated bot signup. It is not used for advertising and not used to build a profile of you.'}</P>

      <H2>{heb ? 'איפה זה נשמר' : 'Where it is kept'}</H2>
      <P>{heb
        ? 'בבסיס נתונים אצל Supabase. האתר עצמו מתארח ב־Vercel. לא נמכר ולא מועבר מידע לצד שלישי לצורכי שיווק.'
        : 'In a database hosted by Supabase. The site itself is hosted by Vercel. Nothing is sold, and nothing is passed to a third party for marketing.'}</P>

      <H2>{heb ? 'עוגיות ואחסון בדפדפן' : 'Cookies and browser storage'}</H2>
      <P>{heb
        ? 'האתר לא מציב עוגיות פרסום או מעקב. מה שכן נשמר בדפדפן שלך: השפה שבחרת, ושני סימונים טכניים לאורך הביקור (טעינה מחדש אחרי עדכון גרסה, והאם כבר הוצגה לך הודעת יציאה).'
        : 'The site sets no advertising or tracking cookies. What is kept in your browser is: the language you chose, and two technical flags for the length of your visit (a reload guard after a version update, and whether the exit prompt has already been shown).'}</P>
      <P>{heb
        ? 'מדידת תנועה נעשית ב־Vercel Analytics, שאינה משתמשת בעוגיות.'
        : 'Traffic measurement uses Vercel Analytics, which does not use cookies.'}</P>
      <P>{heb
        ? 'יומן הפגישות של Google נטען רק אחרי שאתה לוחץ להציג אותו. עד הלחיצה הזאת לא נשלחת אף בקשה ל־Google ולא נשמרות עוגיות שלהם.'
        : 'The Google Calendar booking view loads only after you click to show it. Until that click, no request is made to Google and none of their cookies are set.'}</P>

      <H2>{heb ? 'מה אפשר לבקש' : 'What you can ask for'}</H2>
      <ul style={{ margin: '0 0 12px', paddingInlineStart: 20 }}>
        <LI>{heb ? 'לראות מה נשמר עליך' : 'To see what is held about you'}</LI>
        <LI>{heb ? 'לתקן פרט שגוי' : 'To correct something that is wrong'}</LI>
        <LI>{heb ? 'למחוק את הפנייה שלך' : 'To have your enquiry deleted'}</LI>
      </ul>
      <P>{heb
        ? 'בקשה כזאת מטופלת בוואטסאפ או במייל, ואין צורך לנמק אותה.'
        : 'Ask over WhatsApp or by email. You do not need to give a reason.'}</P>
    </Shell>
  );
}

export function Terms() {
  const [lang] = useLang();
  const heb = lang === 'he';
  return (
    <Shell title={heb ? 'תנאי שימוש' : 'Terms of use'}>
      <H2>{heb ? 'מה האתר הזה' : 'What this site is'}</H2>
      <P>{heb
        ? 'אתר תדמית של EXPO — אימון כוח בקבוצות קטנות במרכז בתל אביב, ותוכניות אימון אונליין. האתר עצמו לא מבצע מכירה ולא גובה תשלום; קביעת אימון או רכישת תוכנית נעשית בשיחה ישירה.'
        : 'A site for EXPO — small-group strength coaching at the centre in Tel Aviv, and online training programs. The site itself does not sell anything and takes no payment; booking a session or buying a program happens in a direct conversation.'}</P>

      <H2>{heb ? 'תוכן אימון — לא ייעוץ רפואי' : 'Training content is not medical advice'}</H2>
      <P>{heb
        ? 'כל מה שכתוב כאן הוא מידע על אימון. זה לא אבחון, לא ייעוץ רפואי ולא תחליף לבדיקה אצל איש מקצוע. אם יש לך כאב, פציעה או מצב רפואי — תתייעץ עם רופא או פיזיותרפיסט לפני שאתה מתחיל להתאמן.'
        : 'Everything here is training information. It is not a diagnosis, not medical advice, and not a substitute for seeing a professional. If you have pain, an injury or a medical condition, speak to a doctor or physiotherapist before you start training.'}</P>

      <H2>{heb ? 'ביטולים והחזרים' : 'Cancellations and refunds'}</H2>
      <P>{heb
        ? 'התנאים של כל שירות נקבעים מולך ישירות לפני התשלום, וחלים עליהם דיני הגנת הצרכן בישראל. לביטול או להחזר — פשוט תפנה, ותקבל תשובה.'
        : 'The terms for each service are agreed with you directly before any payment, and Israeli consumer protection law applies to them. To cancel or ask for a refund, just get in touch and you will get an answer.'}</P>

      <H2>{heb ? 'תוכן האתר' : 'The content on this site'}</H2>
      <P>{heb
        ? 'הטקסטים, התוכניות והתמונות באתר שייכים ל־EXPO. אפשר לקרוא, לשתף קישור ולצטט — אבל לא להעתיק תוכנית ולמכור אותה.'
        : 'The text, programs and images on this site belong to EXPO. You are welcome to read, link and quote — but not to copy a program and sell it.'}</P>

      <H2>{heb ? 'יצירת קשר' : 'Contact'}</H2>
      <P>{heb ? 'בוואטסאפ, מהקישור שבתחתית כל עמוד.' : 'On WhatsApp, from the link at the bottom of every page.'}</P>
    </Shell>
  );
}

export function Accessibility() {
  const [lang] = useLang();
  const heb = lang === 'he';
  return (
    <Shell title={heb ? 'הצהרת נגישות' : 'Accessibility statement'}>
      <P>{heb
        ? 'האתר נבנה כדי להיות שמיש גם עם מקלדת בלבד, גם עם קורא מסך, וגם בהגדלת טקסט.'
        : 'This site is built to be usable with a keyboard alone, with a screen reader, and with enlarged text.'}</P>

      <H2>{heb ? 'מה נעשה בפועל' : 'What has actually been done'}</H2>
      <ul style={{ margin: '0 0 12px', paddingInlineStart: 20 }}>
        <LI>{heb
          ? 'ניווט מלא במקלדת, עם קישור דילוג לתוכן בראש כל עמוד.'
          : 'Full keyboard navigation, with a skip-to-content link at the top of every page.'}</LI>
        <LI>{heb
          ? 'מבנה כותרות תקין וטקסט חלופי לתמונות, כדי שקורא מסך יוכל לעבור על העמוד.'
          : 'A correct heading structure and alternative text on images, so a screen reader can work through the page.'}</LI>
        <LI>{heb
          ? 'יחסי ניגודיות שנבדקו מול התקן, ולא רק "נראה בסדר".'
          : 'Contrast ratios checked against the standard rather than judged by eye.'}</LI>
        {/* Precisely what the CSS does, no more: buttons get a floor on both
            axes, links get one on height. Claiming "both directions" for links
            would have been a sentence this page cannot cash. */}
        <LI>{heb
          ? 'בטלפון, כל כפתור הוא לפחות 36 פיקסלים לגובה ולרוחב, וכל קישור לפחות 36 פיקסלים לגובה.'
          : 'On a phone, every button is at least 36px tall and 36px wide, and every link is at least 36px tall.'}</LI>
        <LI>{heb
          ? 'האתר עובד בהגדלה ובמסכים צרים בלי גלילה לצדדים.'
          : 'The site works zoomed in and on narrow screens without sideways scrolling.'}</LI>
      </ul>

      <H2>{heb ? 'מה עדיין לא מושלם' : 'What is not perfect yet'}</H2>
      <P>{heb
        ? 'יומן הפגישות מוטמע מ־Google ואינו בשליטתנו. אם הוא לא נוח לך — אפשר לקבוע אימון בוואטסאפ, מאותו עמוד, בלי להשתמש ביומן בכלל.'
        : 'The booking calendar is embedded from Google and is outside our control. If it does not work well for you, you can book over WhatsApp from the same page without using the calendar at all.'}</P>

      <H2>{heb ? 'נתקלת בבעיה?' : 'Found a problem?'}</H2>
      <P>{heb
        ? 'תכתוב לי בוואטסאפ מהקישור שבתחתית העמוד ותגיד מה לא עבד — אני מתקן ומעדכן אותך.'
        : 'Message me on WhatsApp from the link at the bottom of the page and say what did not work. I will fix it and come back to you.'}</P>
    </Shell>
  );
}
