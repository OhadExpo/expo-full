// Tiny i18n helper for the EXPO landing page.
//
// Two locales: 'he' (default — Israeli market) and 'en'. The user's choice is
// stored in localStorage under 'expo-il-lang' and applied to
// `document.documentElement.lang` + `dir` so the whole page flips direction
// in one place.
//
// Adding a string: drop a new key under STRINGS with both languages.
// Using a string from a component: const t = useT(); ...{t('hero.h1.line1')}.
// If a key is missing in 'he' it transparently falls back to 'en'.

import { useEffect, useState } from 'react';

export const LANGS = ['he', 'en'];
const STORAGE_KEY = 'expo-il-lang';
const DEFAULT = 'he';

const STRINGS = {
  // ─── Nav ──────────────────────────────────────────────────────────
  'nav.programs':        { en: 'PROGRAMS',       he: 'תוכניות' },
  'nav.how':             { en: 'HOW IT WORKS',   he: 'איך זה עובד' },
  'nav.contact':         { en: 'CONTACT',        he: 'צור קשר' },

  // ─── Hero ─────────────────────────────────────────────────────────
  'hero.badge':          { en: 'PROGRAMMED TRAINING', he: 'אימון מבוסס תוכנית' },
  'hero.h1.line1':       { en: 'Programs that',  he: 'תוכניות אימון' },
  'hero.h1.line2':       { en: 'actually work',  he: 'שעובדות בפועל' },
  'hero.subhead': {
    en: 'Block-periodised templates for hypertrophy, strength, rehab, and time-poor schedules. Same engine I use with private clients — now available as standalone purchases you can run yourself.',
    he: 'תבניות אימון מבוססות בלוקים להיפרטרופיה, כוח, שיקום ולמי שיש לו זמן מוגבל. אותה השיטה שאני עובד איתה עם לקוחות אישיים — זמינה עכשיו לרכישה עצמאית.',
  },
  'hero.cta.browse':     { en: 'BROWSE PROGRAMS ↓', he: 'עיין בתוכניות ↓' },
  'hero.cta.how':        { en: 'HOW IT WORKS',      he: 'איך זה עובד' },

  // Hero social-proof strip — three quick credibility numbers under the subhead.
  // Numbers seeded from the coach app (CLAUDE.md). Update when reality moves.
  'hero.stat1.n':        { en: '20+',                he: '20+' },
  'hero.stat1.l':        { en: 'private clients trained', he: 'לקוחות אישיים' },
  'hero.stat2.n':        { en: '90+',                he: '90+' },
  'hero.stat2.l':        { en: 'programs delivered', he: 'תוכניות שנמסרו' },
  'hero.stat3.n':        { en: '500+',               he: '500+' },
  'hero.stat3.l':        { en: 'exercises in the library', he: 'תרגילים בספרייה' },

  // ─── Catalog ──────────────────────────────────────────────────────
  'catalog.badge':       { en: 'CATALOG',        he: 'קטלוג' },
  'catalog.h2':          { en: 'Pick the block that matches where you are.', he: 'בחר את הבלוק המתאים לאיפה שאתה היום.' },
  'catalog.body': {
    en: 'Every program ships as a 4-week block (or longer) inside the EXPO portal — log sets on your phone, watch your bodyweight trend, and follow the same auto-regulation rules I use with private clients.',
    he: 'כל תוכנית מגיעה כבלוק של 4 שבועות (או יותר) בתוך הפורטל של EXPO — רישום סטים בטלפון, מעקב משקל גוף, ואותם כללי אוטו-רגולציה שאני משתמש בהם עם לקוחות אישיים.',
  },
  'catalog.chip.all':    { en: 'ALL',            he: 'הכל' },
  'catalog.empty':       { en: 'NO PROGRAMS IN THIS CATEGORY', he: 'אין תוכניות בקטגוריה זו' },

  // ─── Card ─────────────────────────────────────────────────────────
  'card.price':          { en: 'PRICE',          he: 'מחיר' },
  'card.view':           { en: 'VIEW',           he: 'צפייה' },
  'card.buy':            { en: 'BUY →',          he: '← קנה' },
  'card.currency.NIS':   { en: 'NIS',            he: '₪' },

  // ─── How it works ─────────────────────────────────────────────────
  'how.badge':           { en: 'HOW IT WORKS',   he: 'איך זה עובד' },
  'how.h2':              { en: 'From buy to first set in under a day.', he: 'מהקנייה לסט הראשון בפחות מיום.' },
  'how.intro': {
    en: 'No subscriptions, no contracts, no hidden upsells. You buy the block once, you keep it forever inside the EXPO portal.',
    he: 'בלי מנויים, בלי חוזים, בלי מכירות נוספות מוסתרות. קונים את הבלוק פעם אחת ושומרים אותו לתמיד בפורטל EXPO.',
  },
  'how.01.t':            { en: 'Pick a program',     he: 'בחר תוכנית' },
  'how.01.d': {
    en: "Browse the catalog above. Each card shows the duration, who it's for, and what's inside. Tap VIEW to see a full sample week before you commit.",
    he: 'עיין בקטלוג למעלה. כל כרטיסיה מציגה את משך התוכנית, למי היא מתאימה, ומה בתוכה. לחץ "צפייה" כדי לראות שבוע לדוגמה מלא לפני שאתה מתחייב.',
  },
  'how.02.t':            { en: 'Pay via Bit',         he: 'שלם בביט' },
  'how.02.d.tmpl': {
    // {bit} placeholder is replaced at render time.
    en: 'Tap BUY on the program — opens WhatsApp with everything pre-filled. Pay through Bit ({bit}) and send a screenshot of the confirmation. One-time payment, full receipt issued.',
    he: 'לחץ "קנה" בתוכנית — נפתח וואטסאפ עם הכל מוכן מראש. שלם בביט ({bit}) ושלח צילום מסך של האישור. תשלום חד-פעמי, חשבונית מלאה מונפקת.',
  },
  'how.03.t':            { en: 'Get your account',    he: 'קבל את החשבון' },
  'how.03.d': {
    en: 'Within a few hours you receive an email with a sign-in link to expo-app.co.il. Your purchased program is already loaded onto a private account — no install needed, runs in any browser.',
    he: 'תוך כמה שעות תקבל אימייל עם קישור התחברות ל-expo-app.co.il. התוכנית שרכשת כבר טעונה בחשבון פרטי — בלי התקנה, רץ בכל דפדפן.',
  },
  'how.04.t':            { en: 'Train',               he: 'התאמן' },
  'how.04.d': {
    en: 'Log every set on your phone. The program tracks your bodyweight trend, session RPE, and pain check-ins, and surfaces a weekly focus — same engine as my private clients, no coach DMs in the way.',
    he: 'רשום כל סט בטלפון. התוכנית עוקבת אחרי מגמת משקל הגוף שלך, RPE אימוני, ודיווחי כאב, ומציגה פוקוס שבועי — אותה השיטה כמו של לקוחות אישיים שלי, בלי לחכות להודעות ממאמן.',
  },

  // ─── How it works — FAQ block ─────────────────────────────────────
  'how.faq.h':           { en: 'COMMON QUESTIONS', he: 'שאלות נפוצות' },
  'how.faq.q1':          { en: 'What if the program is too hard or too easy?', he: 'מה קורה אם התוכנית קשה או קלה מדי?' },
  'how.faq.a1': {
    en: 'Each block has built-in regression and progression rules — load drops or climbs based on the RPE you log. If you still need a manual tweak, message me on WhatsApp and I will adjust it for you.',
    he: 'בכל בלוק יש כללי רגרסיה והתקדמות מובנים — העומס יורד או עולה לפי ה-RPE שאתה מתעד. אם עדיין צריך התאמה ידנית, שלח לי הודעה בוואטסאפ ואסדר.',
  },
  'how.faq.q2':          { en: 'Do I need a gym?', he: 'האם אני צריך חדר כושר?' },
  'how.faq.a2': {
    en: "Depends on the program — every card lists the exact equipment (HOME, FULL GYM, MINIMAL). Filter the catalog by tag to see only what fits your setup.",
    he: 'תלוי בתוכנית — כל כרטיסיה מפרטת את הציוד המדויק (בית, חדר כושר מלא, מינימלי). סנן את הקטלוג לפי תגית כדי לראות רק את מה שמתאים לך.',
  },
  'how.faq.q3':          { en: 'Can I get a refund?', he: 'האם אפשר לקבל החזר?' },
  'how.faq.a3': {
    en: 'If the program is not what you expected within the first 7 days and you have logged at most one session, full refund — no friction. After that, the block is yours to keep.',
    he: 'אם התוכנית לא מה שציפית ב-7 הימים הראשונים ורשמת לכל היותר אימון אחד — החזר מלא, בלי שאלות. אחרי זה, הבלוק שלך לתמיד.',
  },
  'how.faq.q4':          { en: 'Will my data carry over if I buy another program?', he: 'האם הנתונים שלי יישמרו אם אקנה תוכנית נוספת?' },
  'how.faq.a4': {
    en: "Yes — the portal is a single account. Everything you've logged (weights, RPE, bodyweight) stays. New programs slot in alongside the previous block's history.",
    he: 'כן — הפורטל הוא חשבון אחד. כל מה שתיעדת (משקלים, RPE, משקל גוף) נשמר. תוכניות חדשות נוספות לצד ההיסטוריה של הבלוק הקודם.',
  },

  // ─── What's inside the portal ─────────────────────────────────────
  'inside.badge':        { en: 'INSIDE THE PORTAL', he: 'בתוך הפורטל' },
  'inside.h2':           { en: 'Your phone counts the reps. You focus on the lift.', he: 'הטלפון סופר את החזרות. אתה מתרכז במשקל.' },
  'inside.body': {
    en: 'Film any set with your phone. The portal runs pose detection on the clip, counts the reps automatically, and lets you compare the new attempt with your last set at the same weight — same engine I use with private clients, no manual stopwatch.',
    he: 'צלם כל סט בטלפון. הפורטל מריץ זיהוי תנוחה על הקליפ, סופר חזרות אוטומטית, ומאפשר להשוות את הניסיון החדש לסט הקודם באותו משקל — אותה השיטה שאני משתמש בה עם לקוחות אישיים, בלי סטופר ידני.',
  },

  // Phone 1 — pose landmarker
  'inside.pose.tag':     { en: 'POSE',              he: 'תנוחה' },
  'inside.pose.h':       { en: 'Pose detection',    he: 'זיהוי תנוחה' },
  'inside.pose.d': {
    en: 'MediaPipe Pose Landmarker tracks 33 joints in real time on any phone. Knee angle, hip depth, bar path — visible the moment you finish the set.',
    he: 'MediaPipe Pose Landmarker עוקב אחר 33 מפרקים בזמן אמת בכל טלפון. זווית ברך, עומק ירך, מסלול מוט — נראים ברגע שסיימת את הסט.',
  },
  'inside.pose.angle':   { en: 'KNEE 87°',          he: 'ברך °87' },
  'inside.pose.depth':   { en: 'DEPTH 92%',         he: '92% עומק' },
  'inside.pose.foot':    { en: '33 LANDMARKS · LITE MODEL', he: '33 נקודות · מודל LITE' },

  // Phone 2 — rep counter
  'inside.rep.tag':      { en: 'REP COUNT',         he: 'ספירת חזרות' },
  'inside.rep.h':        { en: 'Auto rep counter',  he: 'מונה חזרות אוטומטי' },
  'inside.rep.d': {
    en: 'Detects troughs in the bar path, not peaks — so a paused or grindy rep still counts. Runs at 1× playback the moment the upload finishes.',
    he: 'מזהה נקודות שפל במסלול המוט, לא שיאים — כך שחזרה עם עצירה או "כבדה" עדיין נספרת. רץ במהירות 1x ברגע שההעלאה מסתיימת.',
  },
  'inside.rep.big':      { en: '8 / 8',             he: '8 / 8' },
  'inside.rep.label':    { en: 'REPS',              he: 'חזרות' },
  'inside.rep.foot':     { en: 'AUTO · TROUGHS DETECTED', he: 'אוטומטי · שפלים זוהו' },

  // Phone 3 — side-by-side compare
  'inside.cmp.tag':      { en: 'COMPARE',           he: 'השוואה' },
  'inside.cmp.h':        { en: 'Side-by-side check',he: 'השוואה זה לצד זה' },
  'inside.cmp.d': {
    en: 'Every clip slots into your library by exercise + weight. Two taps to see today against your last attempt at the same load — ROM, tempo, depth, all visible.',
    he: 'כל קליפ נכנס לספרייה לפי תרגיל + משקל. שתי לחיצות כדי לראות את היום מול הניסיון הקודם באותו עומס — ROM, טמפו, עומק, הכל גלוי.',
  },
  'inside.cmp.last.t':   { en: 'LAST · 90 KG',      he: 'קודם · 90 ק״ג' },
  'inside.cmp.last.s':   { en: '4 reps · grindy #4',he: '4 חזרות · #4 כבדה' },
  'inside.cmp.now.t':    { en: 'TODAY · 95 KG',     he: 'היום · 95 ק״ג' },
  'inside.cmp.now.s':    { en: '5 reps · all clean',he: '5 חזרות · כולן נקיות' },
  'inside.cmp.foot':     { en: 'ROM +6° · TEMPO MATCH', he: 'ROM +6° · התאמת טמפו' },

  // Footer line
  'inside.note': {
    en: 'All three are included in every program — no separate add-on, no extra charge.',
    he: 'שלושתם כלולים בכל תוכנית — בלי תוספת נפרדת, בלי תשלום נוסף.',
  },

  // ─── Why templates (price anchor) ─────────────────────────────────
  'why.badge':           { en: 'WHY TEMPLATES',   he: 'למה תבניות' },
  'why.h2':              { en: 'Programmed, without paying for a private coach.', he: 'מבוסס תוכנית, בלי לשלם על מאמן אישי.' },
  'why.body': {
    en: "Most lifters end up in one of three buckets. Templates are the middle option — almost everything a private client gets, at a fraction of the price, with you as the operator.",
    he: 'רוב המתאמנים נופלים לאחת משלוש קטגוריות. תבניות הן האפשרות האמצעית — כמעט כל מה שלקוח אישי מקבל, בחלק קטן מהמחיר, כשאתה המפעיל.',
  },

  // Column headers
  'why.col1.t':          { en: 'Self-coached',         he: 'מתאמן עצמאי' },
  'why.col2.t':          { en: 'EXPO templates',       he: 'תבניות EXPO' },
  'why.col3.t':          { en: 'Private coaching',     he: 'מאמן אישי' },

  // Cost row
  'why.row.cost':        { en: 'COST',                 he: 'עלות' },
  'why.col1.cost':       { en: '0 NIS',                he: '0 ₪' },
  'why.col2.cost':       { en: '290–490 NIS one-time', he: '290–490 ₪ חד-פעמי' },
  'why.col3.cost':       { en: '1,500+ NIS / month',   he: '1,500+ ₪ לחודש' },

  // Programmed row
  'why.row.programmed':  { en: 'BLOCK PROGRAMMED',     he: 'מבוסס בלוקים' },
  'why.col1.programmed': { en: 'No — random sessions', he: 'לא — אימונים אקראיים' },
  'why.col2.programmed': { en: 'Yes — full block',     he: 'כן — בלוק מלא' },
  'why.col3.programmed': { en: 'Yes — bespoke block',  he: 'כן — בלוק מותאם' },

  // Auto-regulation row
  'why.row.autoreg':     { en: 'AUTO-REGULATION',      he: 'אוטו-רגולציה' },
  'why.col1.autoreg':    { en: 'No',                   he: 'לא' },
  'why.col2.autoreg':    { en: 'Built-in (RPE-driven)', he: 'מובנה (מבוסס RPE)' },
  'why.col3.autoreg':    { en: 'Coach-driven',         he: 'מונע על ידי מאמן' },

  // Form review row
  'why.row.form':        { en: 'FORM REVIEW',          he: 'בדיקת ביצוע' },
  'why.col1.form':       { en: 'Mirror only',          he: 'מראה בלבד' },
  'why.col2.form':       { en: 'Auto rep counter + side-by-side compare', he: 'ספירת חזרות אוטומטית + השוואת סרטונים' },
  'why.col3.form':       { en: 'Personal video feedback', he: 'משוב אישי על סרטון' },

  // Setup time row
  'why.row.setup':       { en: 'TIME TO FIRST SET',    he: 'זמן עד הסט הראשון' },
  'why.col1.setup':      { en: 'Now (you guess)',      he: 'עכשיו (אתה מנחש)' },
  'why.col2.setup':      { en: 'Same day',             he: 'אותו יום' },
  'why.col3.setup':      { en: '1–2 weeks setup',      he: '1–2 שבועות הקמה' },

  // CTA
  'why.cta':             { en: 'BROWSE PROGRAMS ↓',    he: 'עיין בתוכניות ↓' },
  'why.note': {
    en: "Templates aren't a private coach — when your case is rehab-after-injury or sport-specific, the right answer is still 1:1. For everything else, programmed is enough.",
    he: 'תבניות הן לא מאמן אישי — כשהמקרה שלך הוא שיקום-אחרי-פציעה או ספציפי-לענף, התשובה הנכונה היא עדיין 1:1. לכל השאר, מבוסס-תוכנית מספיק.',
  },

  // ─── Sticky bottom CTA (mobile) ───────────────────────────────────
  'cta.sticky.label':    { en: 'Not sure which program?', he: 'לא בטוח איזו תוכנית?' },
  'cta.sticky.btn':      { en: 'WHATSAPP →',              he: '← וואטסאפ' },

  // ─── Contact ──────────────────────────────────────────────────────
  'contact.badge':       { en: 'CONTACT',        he: 'צור קשר' },
  'contact.h2':          { en: 'Questions before you buy?', he: 'שאלות לפני קנייה?' },
  'contact.body': {
    en: "WhatsApp is the fastest — replies inside the same day, usually within a couple of hours. Tell me what you train for, your equipment, and how many days a week you can give me, and I'll point you at the right program.",
    he: 'וואטסאפ זה הכי מהיר — מקבל מענה באותו יום, בדרך כלל תוך כמה שעות. תספר לי לאיזו מטרה אתה מתאמן, איזה ציוד יש לך וכמה ימים בשבוע אתה יכול להקדיש, ואני אכוון אותך לתוכנית הנכונה.',
  },
  'contact.hours':       { en: 'Reply window: Sun–Thu 09:00–20:00 (Israel time). Friday/Saturday — slower but I read everything.', he: 'שעות מענה: א׳–ה׳ 09:00–20:00 (שעון ישראל). שישי/שבת — איטי יותר אבל אני קורא הכל.' },
  'contact.cta.whatsapp': { en: 'WHATSAPP',      he: 'וואטסאפ' },
  'contact.cta.email':    { en: 'EMAIL',         he: 'אימייל' },
  'contact.cta.instagram': { en: 'INSTAGRAM',    he: 'אינסטגרם' },
  'contact.wa.prefill':   { en: 'Hi Ohad, I have a question about the programs', he: 'שלום אוהד, יש לי שאלה לגבי התוכניות' },

  // ─── Footer ───────────────────────────────────────────────────────
  'footer.copy.tmpl':     { en: '© {year} EXPO · Ohad Yossifoff', he: '© {year} EXPO · אוהד יוסיפוף' },
  'footer.portal':        { en: 'PORTAL ↗',     he: 'פורטל ↗' },
  'footer.instagram':     { en: 'INSTAGRAM ↗',  he: 'אינסטגרם ↗' },

  // ─── Detail page ──────────────────────────────────────────────────
  'detail.back':              { en: '← ALL PROGRAMS',   he: 'כל התוכניות →' },
  'detail.section.different': { en: "WHAT'S DIFFERENT", he: 'מה שונה' },
  'detail.section.sample':    { en: 'SAMPLE WEEK',      he: 'שבוע לדוגמה' },
  'detail.sample.body.tmpl': {
    en: 'A look at one full microcycle. The full block escalates and varies these patterns across {weeks} weeks.',
    he: 'הצצה למיקרו-מחזור שלם. הבלוק המלא מסלים ומגוון את התבניות האלו לאורך {weeks} שבועות.',
  },
  'detail.sample.empty':      { en: 'SAMPLE WEEK COMING SOON', he: 'שבוע לדוגמה בקרוב' },
  'detail.day.label.tmpl':    { en: 'DAY {x}',          he: 'יום {x}' },
  'detail.tempo.tmpl':        { en: 'tempo {tempo}',    he: 'טמפו {tempo}' },
  'detail.price':             { en: 'PRICE',            he: 'מחיר' },
  'detail.price.note':        { en: 'One-time payment · lifetime access in the EXPO portal', he: 'תשלום חד-פעמי · גישה לכל החיים בפורטל EXPO' },
  'detail.cta.buy':           { en: 'BUY VIA WHATSAPP →', he: '← קנה דרך וואטסאפ' },

  // ─── Per-route document title ─────────────────────────────────────
  'doc.title.home':      { en: 'EXPO · Programmed Training', he: 'EXPO · אימון מבוסס תוכנית' },
  'doc.title.detail.tmpl': {
    en: '{title} · EXPO',
    he: '{title} · EXPO',
  },
  'doc.title.notfound':  { en: 'Program not found · EXPO', he: 'התוכנית לא נמצאה · EXPO' },

  // ─── Not found ────────────────────────────────────────────────────
  'notfound.badge':      { en: '404',                he: '404' },
  'notfound.h2':         { en: "That program doesn't exist (yet).", he: 'התוכנית הזו לא קיימת (עדיין).' },
  'notfound.body': {
    en: "The link you followed points at a program that was renamed or hasn't been published yet. Head back to the catalog to see what's available right now.",
    he: 'הקישור שעקבת אחריו מוביל לתוכנית ששונה שמה או טרם פורסמה. חזור לקטלוג כדי לראות מה זמין כרגע.',
  },
  'notfound.cta':        { en: '← BACK TO CATALOG',  he: 'חזור לקטלוג →' },

  // ─── Buy on WhatsApp prefill (program-specific) ───────────────────
  'wa.buy.tmpl': {
    en: 'Hi Ohad, I want to buy "{title}" ({id}). What are the next steps?',
    he: 'שלום אוהד, אני מעוניין בתוכנית "{title}" ({id}). מה הצעדים הבאים?',
  },
};

function format(template, vars) {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));
}

function applyDocLang(lang) {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'he' ? 'rtl' : 'ltr';
}

const listeners = new Set();
let current = (() => {
  if (typeof localStorage === 'undefined') return DEFAULT;
  const v = localStorage.getItem(STORAGE_KEY);
  return LANGS.includes(v) ? v : DEFAULT;
})();
applyDocLang(current);

export function setLang(next) {
  if (!LANGS.includes(next) || next === current) return;
  current = next;
  try { localStorage.setItem(STORAGE_KEY, next); } catch {}
  applyDocLang(next);
  for (const l of listeners) {
    try { l(next); } catch {}
  }
}

export function getLang() { return current; }

export function useLang() {
  const [, force] = useState(0);
  useEffect(() => {
    const fn = () => force(x => x + 1);
    listeners.add(fn);
    return () => listeners.delete(fn);
  }, []);
  return [current, setLang];
}

export function useT() {
  const [lang] = useLang();
  return (key, vars) => {
    const entry = STRINGS[key];
    if (!entry) return key;
    const raw = entry[lang] ?? entry.en ?? key;
    return format(raw, vars);
  };
}
