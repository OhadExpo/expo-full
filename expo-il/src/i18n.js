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
  'nav.contact':         { en: 'CONTACT',        he: 'דבר איתי' },

  // ─── Hero ─────────────────────────────────────────────────────────
  'hero.badge':          { en: 'PROGRAMMED TRAINING', he: 'אימון לפי תוכנית' },
  'hero.h1.line1':       { en: 'Programs that',  he: 'תוכניות' },
  'hero.h1.line2':       { en: 'actually work',  he: 'שעובדות' },
  'hero.subhead': {
    en: 'Block-periodised templates for hypertrophy, strength, rehab, and time-poor schedules. Same engine I use with private clients — now available as standalone purchases you can run yourself.',
    he: 'תבניות מחולקות לבלוקים. היפרטרופיה, כוח, שיקום, ולמי שאין זמן. אותה שיטה שאני עובד איתה עם לקוחות אישיים — עכשיו אתה מקבל אותה לבד.',
  },
  'hero.cta.browse':     { en: 'BROWSE PROGRAMS ↓', he: 'תוכניות ↓' },
  'hero.cta.how':        { en: 'HOW IT WORKS',      he: 'איך זה עובד' },

  // Hero social-proof strip — three quick credibility numbers under the subhead.
  // Numbers seeded from the coach app (CLAUDE.md). Update when reality moves.
  'hero.stat1.n':        { en: '20+',                he: '20+' },
  'hero.stat1.l':        { en: 'private clients trained', he: 'לקוחות אישיים' },
  'hero.stat2.n':        { en: '90+',                he: '90+' },
  'hero.stat2.l':        { en: 'programs delivered', he: 'תוכניות שכתבתי' },
  'hero.stat3.n':        { en: '500+',               he: '500+' },
  'hero.stat3.l':        { en: 'exercises in the library', he: 'תרגילים בספריה' },

  // ─── Catalog ──────────────────────────────────────────────────────
  'catalog.badge':       { en: 'CATALOG',        he: 'קטלוג' },
  'catalog.h2':          { en: 'Pick the block that matches where you are.', he: 'תבחר את הבלוק שמתאים לך עכשיו.' },
  'catalog.body': {
    en: 'Every program ships as a 4-week block (or longer) inside the EXPO portal — log sets on your phone, watch your bodyweight trend, and follow the same auto-regulation rules I use with private clients.',
    he: 'כל תוכנית היא בלוק של 4 שבועות ומעלה. בתוך פורטל EXPO. מתעד סטים בטלפון, רואה את משקל הגוף לאורך זמן, ועובד לפי אותה אוטו-רגולציה שאני עובד עם לקוחות אישיים.',
  },
  'catalog.chip.all':    { en: 'ALL',            he: 'הכל' },
  'catalog.empty':       { en: 'NO PROGRAMS IN THIS CATEGORY', he: 'אין תוכניות בקטגוריה הזאת' },

  // ─── Card ─────────────────────────────────────────────────────────
  'card.price':          { en: 'PRICE',          he: 'מחיר' },
  'card.view':           { en: 'VIEW',           he: 'הצצה' },
  'card.buy':            { en: 'BUY →',          he: '← קנייה' },
  'card.currency.NIS':   { en: 'NIS',            he: '₪' },

  // ─── How it works ─────────────────────────────────────────────────
  'how.badge':           { en: 'HOW IT WORKS',   he: 'איך זה עובד' },
  'how.h2':              { en: 'From buy to first set in under a day.', he: 'מהקנייה לסט הראשון. תוך יום.' },
  'how.intro': {
    en: 'No subscriptions, no contracts, no hidden upsells. You buy the block once, you keep it forever inside the EXPO portal.',
    he: 'בלי מנויים. בלי חוזים. בלי הפתעות. קונה פעם אחת — נשאר שלך בפורטל לתמיד.',
  },
  'how.01.t':            { en: 'Pick a program',     he: 'תבחר תוכנית' },
  'how.01.d': {
    en: "Browse the catalog above. Each card shows the duration, who it's for, and what's inside. Tap VIEW to see a full sample week before you commit.",
    he: 'תעבור על הקטלוג למעלה. בכל כרטיס יש משך, למי זה מיועד, ומה בפנים. לחץ על "הצצה" לראות שבוע מלא לפני שאתה קונה.',
  },
  'how.02.t':            { en: 'Pay via Bit',         he: 'תשלם בביט' },
  'how.02.d.tmpl': {
    // {bit} placeholder is replaced at render time.
    en: 'Tap BUY on the program — opens WhatsApp with everything pre-filled. Pay through Bit ({bit}) and send a screenshot of the confirmation. One-time payment, full receipt issued.',
    he: 'לחץ "קנייה" — נפתח וואטסאפ עם הכל מוכן. תשלם בביט ({bit}), תשלח צילום מסך. תשלום חד-פעמי. חשבונית מלאה.',
  },
  'how.03.t':            { en: 'Get your account',    he: 'תקבל את החשבון' },
  'how.03.d': {
    en: 'Within a few hours you receive an email with a sign-in link to expo-app.co.il. Your purchased program is already loaded onto a private account — no install needed, runs in any browser.',
    he: 'תוך כמה שעות מגיע אימייל עם קישור התחברות ל-expo-app.co.il. התוכנית כבר טעונה לחשבון פרטי שלך. בלי התקנה. רץ בכל דפדפן.',
  },
  'how.04.t':            { en: 'Train',               he: 'תתאמן' },
  'how.04.d': {
    en: 'Log every set on your phone. The program tracks your bodyweight trend, session RPE, and pain check-ins, and surfaces a weekly focus — same engine as my private clients, no coach DMs in the way.',
    he: 'תרשום כל סט בטלפון. התוכנית עוקבת אחרי משקל הגוף, RPE של כל אימון, ודיווחי כאב — ומציגה פוקוס שבועי. אותה שיטה כמו של לקוחות אישיים שלי. בלי לחכות להודעות.',
  },

  // ─── How it works — FAQ block ─────────────────────────────────────
  'how.faq.h':           { en: 'COMMON QUESTIONS', he: 'שאלות נפוצות' },
  'how.faq.q1':          { en: 'What if the program is too hard or too easy?', he: 'התוכנית קשה או קלה מדי. מה עכשיו?' },
  'how.faq.a1': {
    en: 'Each block has built-in regression and progression rules — load drops or climbs based on the RPE you log. If you still need a manual tweak, message me on WhatsApp and I will adjust it for you.',
    he: 'בכל בלוק יש כללי ירידה ועלייה מובנים. העומס מתאים את עצמו ל-RPE שאתה מתעד. אם בכל זאת צריך התאמה ידנית — תכתוב לי בוואטסאפ ואני אסדר.',
  },
  'how.faq.q2':          { en: 'Do I need a gym?', he: 'צריך חדר כושר?' },
  'how.faq.a2': {
    en: "Depends on the program — every card lists the exact equipment (HOME, FULL GYM, MINIMAL). Filter the catalog by tag to see only what fits your setup.",
    he: 'תלוי בתוכנית. בכל כרטיס יש את הציוד המדויק. תסנן את הקטלוג לפי תגית כדי לראות רק מה שמתאים לסטאפ שלך.',
  },
  'how.faq.q3':          { en: 'Can I get a refund?', he: 'יש החזר?' },
  'how.faq.a3': {
    en: 'If the program is not what you expected within the first 7 days and you have logged at most one session, full refund — no friction. After that, the block is yours to keep.',
    he: 'אם תוך 7 ימים גילית שזה לא בשבילך ולא רשמת יותר מאימון אחד — החזר מלא, בלי שאלות. אחרי זה הבלוק שלך לתמיד.',
  },
  'how.faq.q4':          { en: 'Will my data carry over if I buy another program?', he: 'הנתונים שלי נשמרים אם אקנה תוכנית נוספת?' },
  'how.faq.a4': {
    en: "Yes — the portal is a single account. Everything you've logged (weights, RPE, bodyweight) stays. New programs slot in alongside the previous block's history.",
    he: 'כן. הפורטל זה חשבון אחד. כל מה שתיעדת — משקלים, RPE, משקל גוף — נשאר. תוכניות חדשות נכנסות לצד ההיסטוריה של הבלוק הקודם.',
  },

  // ─── What's inside the portal ─────────────────────────────────────
  'inside.badge':        { en: 'INSIDE THE PORTAL', he: 'בתוך הפורטל' },
  'inside.h2':           { en: 'Your phone counts the reps. You focus on the lift.', he: 'הטלפון סופר חזרות. אתה מתרכז במשקל.' },
  'inside.body': {
    en: 'Film any set with your phone. The portal runs pose detection on the clip, counts the reps automatically, and lets you compare the new attempt with your last set at the same weight — same engine I use with private clients, no manual stopwatch.',
    he: 'תצלם כל סט בטלפון. הפורטל מריץ Pose Detection על הקליפ, סופר חזרות אוטומטית, ומאפשר להשוות בין הסט החדש לסט הקודם באותו משקל. אותה שיטה כמו של לקוחות אישיים. בלי סטופר.',
  },

  // Phone 1 — pose landmarker
  'inside.pose.tag':     { en: 'POSE',              he: 'תנוחה' },
  'inside.pose.h':       { en: 'Pose detection',    he: 'זיהוי תנוחה' },
  'inside.pose.d': {
    en: 'MediaPipe Pose Landmarker tracks 33 joints in real time on any phone. Knee angle, hip depth, bar path — visible the moment you finish the set.',
    he: 'MediaPipe Pose Landmarker עוקב אחרי 33 מפרקים בזמן אמת. בכל טלפון. זווית ברך, עומק ירך, מסלול מוט — הכל מופיע ברגע שסיימת את הסט.',
  },
  'inside.pose.angle':   { en: 'KNEE 87°',          he: 'ברך °87' },
  'inside.pose.depth':   { en: 'DEPTH 92%',         he: '92% עומק' },
  'inside.pose.foot':    { en: '33 LANDMARKS · LITE MODEL', he: '33 נקודות · מודל LITE' },

  // Phone 2 — rep counter
  'inside.rep.tag':      { en: 'REP COUNT',         he: 'ספירת חזרות' },
  'inside.rep.h':        { en: 'Auto rep counter',  he: 'ספירת חזרות אוטומטית' },
  'inside.rep.d': {
    en: 'Detects troughs in the bar path, not peaks — so a paused or grindy rep still counts. Runs at 1× playback the moment the upload finishes.',
    he: 'מזהה את הירידות במסלול המוט, לא את העליות. ככה גם חזרה כבדה או עם עצירה נספרת. רץ ב-1x ברגע שהקליפ עלה.',
  },
  'inside.rep.big':      { en: '8 / 8',             he: '8 / 8' },
  'inside.rep.label':    { en: 'REPS',              he: 'חזרות' },
  'inside.rep.foot':     { en: 'AUTO · TROUGHS DETECTED', he: 'אוטומטי · ירידות זוהו' },

  // Phone 3 — side-by-side compare
  'inside.cmp.tag':      { en: 'COMPARE',           he: 'השוואה' },
  'inside.cmp.h':        { en: 'Side-by-side check',he: 'השוואה צד לצד' },
  'inside.cmp.d': {
    en: 'Every clip slots into your library by exercise + weight. Two taps to see today against your last attempt at the same load — ROM, tempo, depth, all visible.',
    he: 'כל קליפ נכנס לספריה לפי תרגיל ומשקל. שתי לחיצות וזה מראה לך את היום מול הסט הקודם באותו עומס. ROM, טמפו, עומק — הכל גלוי.',
  },
  'inside.cmp.last.t':   { en: 'LAST · 90 KG',      he: 'קודם · 90 ק״ג' },
  'inside.cmp.last.s':   { en: '4 reps · grindy #4',he: '4 חזרות · #4 כבדה' },
  'inside.cmp.now.t':    { en: 'TODAY · 95 KG',     he: 'היום · 95 ק״ג' },
  'inside.cmp.now.s':    { en: '5 reps · all clean',he: '5 חזרות · כולן נקיות' },
  'inside.cmp.foot':     { en: 'ROM +6° · TEMPO MATCH', he: 'ROM +6° · טמפו תואם' },

  // Footer line
  'inside.note': {
    en: 'All three are included in every program — no separate add-on, no extra charge.',
    he: 'שלושתם נכללים בכל תוכנית. בלי תוסף, בלי תשלום נוסף.',
  },

  // ─── About the coach ──────────────────────────────────────────────
  'about.badge':         { en: 'WHO WRITES THESE', he: 'מי כותב את התוכניות' },
  'about.h2':            { en: "I'm Ohad. I've been programming this exact engine for years.", he: 'אני אוהד. שנים שאני בונה את השיטה הזאת.' },
  'about.p1': {
    en: "Athletic Performance Coach at Bnei Herzliya. Spent four years playing American football in the NCAA — CMU, then a couple of college teams in Israel (OUI, TAU). Trained as an athlete first, then started programming for athletes who needed someone who'd done the work.",
    he: 'מאמן יכולות אתלטיות בבני הרצליה. ארבע שנים שיחקתי פוטבול אמריקאי ב-NCAA, ב-CMU. אחרי זה כמה עונות בקבוצות קולג\' בארץ — OUI ו-TAU. התאמנתי בעצמי קודם, אחרי זה התחלתי לכתוב תוכניות לאתלטים שצריכים מישהו שעבר את זה.',
  },
  'about.p2': {
    en: 'Today I work with private clients out of Herzliya — block-periodised training, progress logged on the phone, video reviewed every week. The portal you see here is the same one they use. I built it myself so I could stop juggling spreadsheets.',
    he: 'היום אני עובד עם לקוחות פרטיים מהרצליה. תוכנית מבוססת בלוקים, מתעדים בטלפון, סרטונים נבדקים כל שבוע. הפורטל שאתה רואה פה הוא בדיוק אותו פורטל שהם משתמשים בו. בניתי אותו לבד כדי להפסיק לעבוד עם אקסלים.',
  },
  'about.p3': {
    en: "EXPO templates exist because I can't take more 1:1 clients than my schedule allows, but the programming is good enough to deliver as standalone product. Same blocks, same auto-regulation, no waitlist.",
    he: 'תבניות EXPO קיימות כי אני לא יכול לקחת יותר לקוחות אישיים מכמה שהיום נותן לי. אבל התוכניות עצמן מספיק טובות בשביל למסור אותן כמוצר עצמאי. אותם בלוקים, אותה אוטו-רגולציה, בלי רשימת המתנה.',
  },
  'about.cred1':         { en: 'Athletic Performance Coach',  he: 'מאמן יכולות אתלטיות' },
  'about.cred1.s':       { en: '@ Bnei Herzliya',             he: '@ בני הרצליה' },
  'about.cred2':         { en: 'NCAA football',               he: 'פוטבול NCAA' },
  'about.cred2.s':       { en: '4 yrs · CMU, OUI, TAU',       he: '4 שנים · CMU, OUI, TAU' },
  'about.cred3':         { en: 'Built the EXPO portal',       he: 'בניתי את פורטל EXPO' },
  'about.cred3.s':       { en: 'and use it daily',            he: 'ומשתמש בו כל יום' },
  'about.photo.note': {
    en: 'Photo coming soon',
    he: 'תמונה בקרוב',
  },

  // ─── Why templates (price anchor) ─────────────────────────────────
  'why.badge':           { en: 'WHY TEMPLATES',   he: 'למה תבניות' },
  'why.h2':              { en: 'Programmed, without paying for a private coach.', he: 'אימון לפי תוכנית, בלי המחיר של מאמן אישי.' },
  'why.body': {
    en: "Most lifters end up in one of three buckets. Templates are the middle option — almost everything a private client gets, at a fraction of the price, with you as the operator.",
    he: 'רוב המתאמנים מתחלקים לשלוש קטגוריות. תבניות הן האמצע — מקבל כמעט הכל מה שלקוח אישי מקבל, חלק קטן מהמחיר, רק שאתה זה שמפעיל.',
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
  'why.col3.programmed': { en: 'Yes — bespoke block',  he: 'כן — בלוק אישי' },

  // Auto-regulation row
  'why.row.autoreg':     { en: 'AUTO-REGULATION',      he: 'אוטו-רגולציה' },
  'why.col1.autoreg':    { en: 'No',                   he: 'לא' },
  'why.col2.autoreg':    { en: 'Built-in (RPE-driven)', he: 'מובנה — לפי RPE' },
  'why.col3.autoreg':    { en: 'Coach-driven',         he: 'מאמן מסדר ידנית' },

  // Form review row
  'why.row.form':        { en: 'FORM REVIEW',          he: 'בדיקת ביצוע' },
  'why.col1.form':       { en: 'Mirror only',          he: 'מראה בלבד' },
  'why.col2.form':       { en: 'Auto rep counter + side-by-side compare', he: 'ספירת חזרות אוטומטית + השוואת סרטונים' },
  'why.col3.form':       { en: 'Personal video feedback', he: 'משוב אישי על סרטון' },

  // Setup time row
  'why.row.setup':       { en: 'TIME TO FIRST SET',    he: 'זמן עד הסט הראשון' },
  'why.col1.setup':      { en: 'Now (you guess)',      he: 'עכשיו (אתה מנחש)' },
  'why.col2.setup':      { en: 'Same day',             he: 'אותו יום' },
  'why.col3.setup':      { en: '1–2 weeks setup',      he: '1–2 שבועות עד שמתחילים' },

  // CTA
  'why.cta':             { en: 'BROWSE PROGRAMS ↓',    he: 'תוכניות ↓' },
  'why.note': {
    en: "Templates aren't a private coach — when your case is rehab-after-injury or sport-specific, the right answer is still 1:1. For everything else, programmed is enough.",
    he: 'תבניות הן לא תחליף למאמן אישי. אם אתה בשיקום אחרי פציעה, או צריך משהו ספציפי לענף — אתה רוצה 1:1. לכל השאר, אימון לפי תוכנית מספיק.',
  },

  // ─── Sticky bottom CTA (mobile) ───────────────────────────────────
  'cta.sticky.label':    { en: 'Not sure which program?', he: 'לא בטוח איזו תוכנית?' },
  'cta.sticky.btn':      { en: 'WHATSAPP →',              he: '← וואטסאפ' },

  // ─── Contact ──────────────────────────────────────────────────────
  'contact.badge':       { en: 'CONTACT',        he: 'דבר איתי' },
  'contact.h2':          { en: 'Questions before you buy?', he: 'שאלות לפני שאתה קונה?' },
  'contact.body': {
    en: "WhatsApp is the fastest — replies inside the same day, usually within a couple of hours. Tell me what you train for, your equipment, and how many days a week you can give me, and I'll point you at the right program.",
    he: 'וואטסאפ הכי מהיר. אני עונה באותו יום, בדרך כלל תוך כמה שעות. תספר לי לאיזו מטרה אתה מתאמן, איזה ציוד יש לך, וכמה ימים בשבוע אתה יכול — ואני אכוון אותך לתוכנית הנכונה.',
  },
  'contact.hours':       { en: 'Reply window: Sun–Thu 09:00–20:00 (Israel time). Friday/Saturday — slower but I read everything.', he: 'שעות מענה: א׳–ה׳, 09:00–20:00. שישי-שבת איטי יותר אבל אני קורא הכל.' },
  'contact.cta.whatsapp': { en: 'WHATSAPP',      he: 'וואטסאפ' },
  'contact.cta.email':    { en: 'EMAIL',         he: 'אימייל' },
  'contact.cta.instagram': { en: 'INSTAGRAM',    he: 'אינסטגרם' },
  'contact.wa.prefill':   { en: 'Hi Ohad, I have a question about the programs', he: 'היי אוהד, יש לי שאלה על התוכניות' },

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
    he: 'ככה נראה מיקרו-מחזור שלם. הבלוק המלא מטפס ומגוון את התבניות האלה לאורך {weeks} שבועות.',
  },
  'detail.sample.empty':      { en: 'SAMPLE WEEK COMING SOON', he: 'שבוע לדוגמה בקרוב' },
  'detail.day.label.tmpl':    { en: 'DAY {x}',          he: 'יום {x}' },
  'detail.tempo.tmpl':        { en: 'tempo {tempo}',    he: 'טמפו {tempo}' },
  'detail.price':             { en: 'PRICE',            he: 'מחיר' },
  'detail.price.note':        { en: 'One-time payment · lifetime access in the EXPO portal', he: 'תשלום חד-פעמי · גישה לכל החיים בפורטל' },
  'detail.cta.buy':           { en: 'BUY VIA WHATSAPP →', he: '← קנייה בוואטסאפ' },

  // ─── Per-route document title ─────────────────────────────────────
  'doc.title.home':      { en: 'EXPO · Programmed Training', he: 'EXPO · אימון לפי תוכנית' },
  'doc.title.detail.tmpl': {
    en: '{title} · EXPO',
    he: '{title} · EXPO',
  },
  'doc.title.notfound':  { en: 'Program not found · EXPO', he: 'התוכנית לא נמצאה · EXPO' },

  // ─── Not found ────────────────────────────────────────────────────
  'notfound.badge':      { en: '404',                he: '404' },
  'notfound.h2':         { en: "That program doesn't exist (yet).", he: 'התוכנית הזאת לא קיימת. עדיין.' },
  'notfound.body': {
    en: "The link you followed points at a program that was renamed or hasn't been published yet. Head back to the catalog to see what's available right now.",
    he: 'הקישור שלחצת מוביל לתוכנית ששינתה שם או שעוד לא פורסמה. חזור לקטלוג ותראה מה זמין כרגע.',
  },
  'notfound.cta':        { en: '← BACK TO CATALOG',  he: 'חזור לקטלוג →' },

  // ─── Buy on WhatsApp prefill (program-specific) ───────────────────
  'wa.buy.tmpl': {
    en: 'Hi Ohad, I want to buy "{title}" ({id}). What are the next steps?',
    he: 'היי אוהד, אני רוצה את "{title}" ({id}). מה הצעד הבא?',
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
