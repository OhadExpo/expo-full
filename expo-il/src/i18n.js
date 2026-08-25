// Tiny i18n helper for the EXPO landing page.
//
// Two locales: 'he' (default — Israeli market) and 'en'. Resolution order:
//   1. URL path: /he*  → he, /en*  → en  (explicit, share-friendly, wins)
//   2. localStorage  ('expo-il-lang')      (returning visitor's choice)
//   3. DEFAULT ('he')
// The URL is the single source of truth when present, so a shared /he link
// lands in Hebrew even for a visitor who previously toggled to English.
//
// Adding a string: drop a new key under STRINGS with both languages.
// Using a string from a component: const t = useT(); ...{t('hero.h1.line1')}.
// If a key is missing in 'he' it transparently falls back to 'en'.

import { useEffect, useState } from 'react';

export const LANGS = ['he', 'en'];
const STORAGE_KEY = 'expo-il-lang';
const DEFAULT = 'he';

// Returns 'he' / 'en' if the path explicitly pins a language, otherwise null
// so the caller can fall through to localStorage / DEFAULT.
function langFromPath(path) {
  const p = path || '/';
  if (/^\/he(\/|$)/.test(p)) return 'he';
  if (/^\/en(\/|$)/.test(p)) return 'en';
  return null;
}

const STRINGS = {
  // ─── Nav ──────────────────────────────────────────────────────────
  'nav.programs':        { en: 'PROGRAMS',       he: 'תוכניות' },
  'nav.about':           { en: 'ABOUT',          he: 'מי אני' },
  'nav.how':             { en: 'HOW IT WORKS',   he: 'איך זה עובד' },
  'nav.faq':             { en: 'FAQ',            he: 'שאלות' },
  'nav.contact':         { en: 'CONTACT',        he: 'דבר איתי' },
  'nav.quiz':            { en: 'FIND MY PROGRAM', he: 'מצא לי תוכנית' },

  // ─── Hero ─────────────────────────────────────────────────────────
  'hero.badge':          { en: 'PROGRAMMED TRAINING', he: 'אימון לפי תוכנית' },
  'hero.h1.line1':       { en: 'Programs that',  he: 'תוכניות' },
  'hero.h1.line2':       { en: 'actually work',  he: 'שעובדות' },
  'hero.subhead': {
    en: 'Block-periodised templates for hypertrophy, strength, rehab, and time-poor schedules. Same engine I use with the athletes I coach — now available as standalone purchases you can run yourself.',
    he: 'תבניות מחולקות לבלוקים. היפרטרופיה, כוח, שיקום, ולמי שאין זמן. אותה שיטה שאני עובד איתה עם הספורטאים שאני מאמן — עכשיו אתה מקבל אותה לבד.',
  },
  'hero.cta.browse':     { en: 'BROWSE PROGRAMS ↓', he: 'תוכניות ↓' },
  'hero.cta.how':        { en: 'HOW IT WORKS',      he: 'איך זה עובד' },
  'hero.cta.quiz':       { en: 'FIND MY PROGRAM',   he: 'מצא לי תוכנית' },
  'hero.cta.try':        { en: 'TRY THE PLATFORM',  he: 'נסה את המנוע' },

  // Hero social-proof strip — three quick credibility numbers under the subhead.
  // Numbers seeded from the coach app (CLAUDE.md). Update when reality moves.
  'hero.stat1.n':        { en: '20+',                he: '20+' },
  'hero.stat1.l':        { en: 'Athletes coached', he: 'ספורטאים מאומנים' },
  'hero.stat2.n':        { en: '90+',                he: '90+' },
  'hero.stat2.l':        { en: 'programs delivered', he: 'תוכניות שכתבתי' },
  'hero.stat3.n':        { en: '500+',               he: '500+' },
  'hero.stat3.l':        { en: 'exercises in the library', he: 'תרגילים בספריה' },

  // ─── Catalog ──────────────────────────────────────────────────────
  'catalog.badge':       { en: 'CATALOG',        he: 'קטלוג' },
  'catalog.h2':          { en: 'Pick the block that matches where you are.', he: 'תבחר את הבלוק שמתאים לך עכשיו.' },
  'catalog.body': {
    en: 'Every program ships as a 4-week block (or longer) inside the EXPO portal — log sets on your phone, watch your bodyweight trend, and follow the same auto-regulation rules I use with the athletes I coach.',
    he: 'כל תוכנית היא בלוק של 4 שבועות ומעלה. בתוך פורטל EXPO. מתעד סטים בטלפון, רואה את משקל הגוף לאורך זמן, ועובד לפי אותה אוטו-רגולציה שאני עובד עם הספורטאים שאני מאמן.',
  },
  'catalog.chip.all':    { en: 'ALL',            he: 'הכל' },
  'catalog.empty':       { en: 'NO PROGRAMS IN THIS CATEGORY', he: 'אין תוכניות בקטגוריה הזאת' },

  // ─── Card ─────────────────────────────────────────────────────────
  'card.price':          { en: 'PRICE',          he: 'מחיר' },
  'card.view':           { en: 'VIEW',           he: 'הצצה' },
  'card.buy':            { en: 'BUY →',          he: 'קנייה ←' },
  'card.currency.NIS':   { en: 'NIS',            he: '₪' },
  'card.share':          { en: 'Share program',  he: 'שתף תוכנית' },
  'card.share.copied':   { en: 'LINK COPIED',    he: 'הקישור הועתק' },
  'card.share.text.tmpl': {
    en: 'Check out {title} by EXPO',
    he: 'תראה את {title} של EXPO',
  },

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
    en: 'Log every set on your phone. The program tracks your bodyweight trend, session RPE, and pain check-ins, and surfaces a weekly focus — same engine I run with the athletes I coach, no coach DMs in the way.',
    he: 'תרשום כל סט בטלפון. התוכנית עוקבת אחרי משקל הגוף, RPE של כל אימון, ודיווחי כאב — ומציגה פוקוס שבועי. אותה שיטה שאני עובד איתה עם הספורטאים שאני מאמן. בלי לחכות לתשובה ממאמן.',
  },

  // (Old in-line how.faq.* keys removed — FAQ now lives in its own section,
  // see faq.* keys further down.)

  // ─── What's inside the portal ─────────────────────────────────────
  'inside.badge':        { en: 'INSIDE THE PORTAL', he: 'בתוך הפורטל' },
  'inside.h2':           { en: 'Your phone counts the reps. You focus on the lift.', he: 'הטלפון סופר חזרות. אתה מתרכז במשקל.' },
  'inside.body': {
    en: 'Film any set with your phone. The portal runs pose detection on the clip, counts the reps automatically, and lets you compare the new attempt with your last set at the same weight — same engine I use with the athletes I coach, no manual stopwatch.',
    he: 'תצלם כל סט בטלפון. הפורטל מריץ Pose Detection על הקליפ, סופר חזרות אוטומטית, ונותן להשוות בין הסט החדש לסט הקודם באותו משקל. אותה שיטה שאני עובד איתה עם הספורטאים שאני מאמן. בלי לספור עם סטופר.',
  },

  // Phone 1 — pose landmarker
  'inside.pose.tag':     { en: 'POSE',              he: 'תנוחה' },
  'inside.pose.h':       { en: 'Pose detection',    he: 'זיהוי תנוחה' },
  'inside.pose.d': {
    en: 'MediaPipe Pose Landmarker tracks 33 joints in real time on any phone. Knee angle, hip depth, bar path — visible the moment you finish the set.',
    he: 'MediaPipe Pose Landmarker עוקב אחרי 33 מפרקים בזמן אמת. בכל טלפון. זווית ברך, עומק ירך, מסלול מוט — הכל מופיע ברגע שסיימת את הסט.',
  },
  'inside.pose.angle':   { en: 'KNEE 87°',          he: 'ברך °87' },
  'inside.pose.depth':   { en: 'DEPTH 92%',         he: 'עומק 92%' },
  'inside.pose.foot':    { en: '33 LANDMARKS · LITE MODEL', he: '33 נקודות · מודל LITE' },

  // Phone 4 — jump-shot analyzer. Numbers here must match the real engine:
  // buildCheckpoints() in src/shotAnalysis.js returns exactly 10.
  'inside.shot.tag':     { en: 'SHOT',              he: 'זריקה' },
  'inside.shot.h':       { en: 'Jump-shot analyzer', he: 'ניתוח זריקה' },
  'inside.shot.d': {
    en: 'Film a jump shot and get it back split into dip, set point, release and follow-through — ten checkpoints scored against coaching bands, each one with the fix. Film a set and it reads the reps together, says whether the release actually repeats, and names the one to watch.',
    he: 'תצלם זריקה ותקבל אותה מפורקת לדיפ, נקודת סט, שחרור וליווי — עשר נקודות בדיקה מול טווחי אימון, וכל אחת עם התיקון שלה. תצלם סדרה והוא יקרא את כל החזרות יחד, יגיד לך אם השחרור באמת חוזר על עצמו, ויצביע על החזרה ששווה לבדוק.',
  },
  'inside.shot.foot':    { en: '10 CHECKPOINTS · PHASE BY PHASE', he: '10 נקודות בדיקה · שלב אחר שלב' },

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
  // Counts the cards in WhatsInside — keep it in step when a card is added.
  'inside.note': {
    en: 'All four are included in every program — no separate add-on, no extra charge.',
    he: 'כולם נכללים בכל תוכנית. בלי תוסף, בלי תשלום נוסף.',
  },

  // CTA from WhatsInside section to the public sandbox at expo-app.co.il/demo/trainee.
  // Clicking opens the live engine — pose detection + rep counter on the visitor's
  // own clip — without account, login, or any backend touch.
  'inside.tryCta': {
    en: 'See your own set analysed live →',
    he: 'תראה את הסט שלך נבדק חי ←',
  },

  // ─── About the coach ──────────────────────────────────────────────
  'about.badge':         { en: 'WHO WRITES THESE', he: 'מי אני' },
  'about.h2':            { en: "I'm Ohad. I've been programming this exact engine for years.", he: 'אני אוהד. שנים שאני בונה את השיטה הזאת.' },
  'about.p1': {
    en: "Athletic Performance Coach at Bnei Herzliya. Spent four years playing American football in the NCAA — CMU, then a couple of college teams in Israel (OUI, TAU). Trained as an athlete first, then started programming for athletes who needed someone who'd done the work.",
    he: 'מאמן יכולות אתלטיות בבני הרצליה. שיחקתי פוטבול ב-NCAA ב-CMU, ואחרי זה עוד כמה עונות בקבוצות קולג׳ בארץ — OUI, TAU. הייתי ספורטאי לפני שהייתי מאמן. אחרי זה התחלתי לכתוב תוכניות לאתלטים שצריכים מישהו שעבר את הדרך בעצמו.',
  },
  'about.p2': {
    en: 'Today I work with the athletes I coach out of Herzliya — block-periodised training, progress logged on the phone, video reviewed every week. The portal you see here is the same one they use. I built it myself so I could stop juggling spreadsheets.',
    he: 'היום אני עובד עם הספורטאים שאני מאמן בהרצליה. תוכנית בבלוקים. תיעוד בטלפון. סרטונים נבדקים כל שבוע. הפורטל שאתה רואה פה הוא בדיוק זה שהם עובדים איתו. בניתי אותו לבד כדי להפסיק עם אקסלים.',
  },
  'about.p3': {
    en: "EXPO templates exist because I can't take more 1:1 athletes than my schedule allows, but the programming is good enough to deliver as standalone product. Same blocks, same auto-regulation, no waitlist.",
    he: 'תבניות EXPO קיימות כי היום שלי כבר לא נותן לי לקחת עוד ספורטאים לליווי צמוד. אבל התוכניות עצמן טובות מספיק כדי לעמוד כמוצר עצמאי. אותם בלוקים. אותה אוטו-רגולציה. בלי רשימת המתנה.',
  },

  // Existing 3-credential strip
  'about.cred1':         { en: 'Athletic Performance Coach',  he: 'מאמן יכולות אתלטיות' },
  'about.cred1.s':       { en: '@ Bnei Herzliya',             he: '@ בני הרצליה' },
  'about.cred2':         { en: 'NCAA football',               he: 'פוטבול NCAA' },
  'about.cred2.s':       { en: '4 yrs · CMU, OUI, TAU',       he: '4 שנים · CMU, OUI, TAU' },
  'about.cred3':         { en: 'Built the EXPO portal',       he: 'בניתי את פורטל EXPO' },
  'about.cred3.s':       { en: 'and use it daily',            he: 'משתמש בו כל יום' },

  // Three deeper credibility tiles below the credentials strip
  'about.values.h':      { en: 'WHAT I VALUE',                he: 'מה חשוב לי' },
  'about.values.t1':     { en: 'Auto-regulation over heroics', he: 'אוטו-רגולציה לפני גבורה' },
  'about.values.d1': {
    en: 'Loads adjust to the RPE you log, not the number on a spreadsheet. The block respects what your body actually has on the day.',
    he: 'העומס מתאים את עצמו ל-RPE שאתה מתעד, לא למספר בגיליון. הבלוק מכבד את מה שיש לך באמת באותו יום.',
  },
  'about.values.t2':     { en: 'Movement first, load second', he: 'תנועה לפני עומס' },
  'about.values.d2': {
    en: 'Tempo and ROM cues come before percentage charts. If the rep looks ugly, the weight comes off — no negotiation.',
    he: 'טמפו וטווח תנועה באים לפני אחוזים. אם החזרה לא נראית טוב, המשקל יורד — בלי משא ומתן.',
  },
  'about.values.t3':     { en: 'Build for the long run',      he: 'בונים לטווח הארוך' },
  'about.values.d3': {
    en: 'Pain check-ins, deload weeks, and reassess windows are baked into every block. You don\'t get strong by training through dysfunction.',
    he: 'דיווחי כאב, שבועות דלואד והערכה מחדש מובנים בכל בלוק. לא מתחזקים מאימון דרך כאב או תפקוד לקוי.',
  },

  'about.photo.note': {
    en: 'Photo coming soon',
    he: 'תמונה בקרוב',
  },

  // ─── Why templates (price anchor) ─────────────────────────────────
  'why.badge':           { en: 'WHY TEMPLATES',   he: 'למה תבניות' },
  'why.h2':              { en: 'Programmed, without a weekly show-up.', he: 'אימון לפי תוכנית, בלי להגיע שבוע-שבוע.' },
  'why.body': {
    en: "Most lifters end up in one of three buckets. Templates are the middle option — almost everything a private athlete gets, at a fraction of the price, with you as the operator.",
    he: 'רוב המתאמנים נופלים באחת משלוש קטגוריות. תבניות הן האמצע — אתה מקבל כמעט הכל שספורטאי אישי מקבל, בשבריר מהמחיר, רק שאתה מפעיל את התוכנית בעצמך.',
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
  'cta.sticky.btn':      { en: 'WHATSAPP →',              he: 'וואטסאפ ←' },

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
  'footer.copy.tmpl':     { en: '© {year} EXPO · Ohad Yossifoff · All rights reserved', he: '© {year} EXPO · אוהד יוסיפוף · כל הזכויות שמורות' },
  'footer.portal':        { en: 'PORTAL ↗',     he: 'פורטל ↗' },
  'footer.gym':           { en: 'PERFORMANCE CENTER →', he: 'בית הספורטאי ←' },
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
  'detail.cta.buy':           { en: 'BUY VIA WHATSAPP →', he: 'קנייה בוואטסאפ ←' },

  // ─── Per-route document title ─────────────────────────────────────
  'doc.title.home':      { en: 'EXPO · Online Training', he: 'EXPO · אימון אונליין' },
  'doc.title.detail.tmpl': {
    en: '{title} · EXPO',
    he: '{title} · EXPO',
  },
  'doc.title.notfound':  { en: 'Program not found · EXPO', he: 'התוכנית לא נמצאה · EXPO' },
  'doc.title.gym':       { en: 'EXPO · Athletic Performance Center', he: 'EXPO · מרכז ביצועים אתלטי' },
  'doc.title.chooser':   { en: 'EXPO · Choose your path',            he: 'EXPO · בחר/י את הדרך' },

  // ─── Not found ────────────────────────────────────────────────────
  'notfound.badge':      { en: '404',                he: '404' },
  'notfound.h2':         { en: "That program doesn't exist (yet).", he: 'התוכנית הזאת לא קיימת. עדיין.' },
  'notfound.body': {
    en: "The link you followed points at a program that was renamed or hasn't been published yet. Head back to the catalog to see what's available right now.",
    he: 'הקישור שלחצת מוביל לתוכנית ששינתה שם או שעוד לא פורסמה. תחזור לקטלוג ותראה מה זמין עכשיו.',
  },
  'notfound.cta':        { en: '← BACK',  he: 'חזרה →' },

  // ─── Buy on WhatsApp prefill (program-specific) ───────────────────
  'wa.buy.tmpl': {
    en: 'Hi Ohad, I want to buy "{title}" ({id}). What are the next steps?',
    he: 'היי אוהד, אני רוצה את "{title}" ({id}). מה הצעד הבא?',
  },

  // ─── Lead capture (hero + footer email forms) ─────────────────────
  'lead.label':       { en: 'NOT READY YET? LEAVE YOUR EMAIL.', he: 'עוד לא בטוח? תשאיר אימייל.' },
  'lead.placeholder': { en: 'Your@Email.com', he: 'Your@Email.com' },
  'lead.cta':         { en: 'NOTIFY ME', he: 'עדכן אותי' },
  'lead.sending':     { en: 'SENDING…', he: 'שולח…' },
  'lead.thanks':      { en: '✓ THANKS — I\'LL BE IN TOUCH.', he: '✓ קיבלתי. אדבר איתך בקרוב.' },
  'lead.err.invalid': { en: 'That email looks off — try again.', he: 'האימייל לא נראה תקין. תנסה שוב.' },
  'lead.err.generic': { en: 'Save failed. Try again or DM me on WhatsApp.', he: 'לא נשמר. תנסה שוב או שלח וואטסאפ.' },

  // ─── Testimonials ─────────────────────────────────────────────────
  'testi.badge':      { en: 'ATHLETE VOICES',  he: 'מהספורטאים' },
  'testi.h2':         { en: 'What people say after a block', he: 'מה אומרים אחרי בלוק' },
  'testi.empty':      { en: 'Quotes coming soon — placeholder slots until I clear photo + permission with each athlete.', he: 'ציטוטים בקרוב. שומר מקום עד שאסגור צילום והרשאה עם כל ספורטאי.' },

  // ─── Israeli trust signals strip ──────────────────────────────────
  'trust.badge':      { en: 'WHY IT IS SAFE TO BUY', he: 'למה זה בטוח לקנות' },
  'trust.bit.t':      { en: 'Pay via Bit',           he: 'תשלום בביט' },
  'trust.bit.s':      { en: 'Israeli mobile payment, no card details exchanged', he: 'תשלום ישראלי בנייד, בלי פרטי כרטיס אשראי' },
  'trust.invoice.t':  { en: 'Digital tax invoice',   he: 'חשבונית מס דיגיטלית' },
  'trust.invoice.s':  { en: 'Issued via Green Invoice the same day. עוסק מורשה.', he: 'נשלחת דרך חשבונית ירוקה באותו יום. עוסק מורשה.' },
  'trust.vat.t':      { en: 'VAT included',          he: 'כולל מע״מ' },
  'trust.vat.s':      { en: 'Every price on the catalog already includes 18% VAT — no surprises at checkout.', he: 'כל מחיר בקטלוג כבר כולל 18% מע״מ. בלי הפתעות.' },
  'trust.refund.t':   { en: '7-day refund',          he: 'החזר תוך 7 ימים' },
  'trust.refund.s':   { en: 'If it is not what you expected and you logged at most one session, full refund — no friction.', he: 'אם זה לא מה שציפית ולא רשמת יותר מאימון אחד — החזר מלא, בלי שאלות.' },
  'trust.he.t':       { en: 'Hebrew support',        he: 'תמיכה בעברית' },
  'trust.he.s':       { en: 'WhatsApp answered in Hebrew, same day, by me.', he: 'וואטסאפ בעברית, אותו יום, ממני אישית.' },

  // ─── FAQ section (8 questions, dedicated) ─────────────────────────
  'faq.badge':        { en: 'QUESTIONS BEFORE BUYING', he: 'שאלות לפני שקונים' },
  'faq.h2':           { en: "Eight questions I get on WhatsApp every week.", he: 'שמונה שאלות שאני מקבל בוואטסאפ כל שבוע.' },
  'faq.body': {
    en: "If yours is not here, message me on WhatsApp — I answer in the same day, in Hebrew or English.",
    he: 'אם השאלה שלך לא פה, תכתוב לי בוואטסאפ. אני עונה באותו יום, בעברית או באנגלית.',
  },
  'faq.q1':           { en: 'Can I get a refund if it is not for me?', he: 'יש החזר אם זה לא בשבילי?' },
  'faq.a1': {
    en: 'Yes. Within the first 7 days and at most one logged session, full refund — no questions, no friction. After that the block stays yours forever in the portal.',
    he: 'כן. תוך 7 ימים ועד אימון אחד שתיעדת — החזר מלא, בלי שאלות. אחרי זה הבלוק שלך לתמיד בפורטל.',
  },
  'faq.q2':           { en: 'Do I need a gym, or can I run this at home?', he: 'צריך חדר כושר או שאפשר בבית?' },
  'faq.a2': {
    en: 'Depends on the program — every card lists the equipment (HOME, FULL GYM, MINIMAL). Filter the catalog by tag or use the quiz to see only what fits your setup.',
    he: 'תלוי בתוכנית. בכל כרטיס יש את הציוד המדויק. תסנן בקטלוג לפי תגית או תעבור על הקווויז ותראה רק מה שמתאים לסטאפ שלך.',
  },
  'faq.q3':           { en: "I'm a complete beginner. Will this be over my head?", he: 'אני מתחיל לגמרי. זה יהיה גבוה מדי בשבילי?' },
  'faq.a3': {
    en: 'Foundation Block is built exactly for that. Three days a week, dumbbells + barbell, no machines required. Tempo and ROM cues come before any heavy load — you learn the seven primary patterns first, weight comes after.',
    he: 'בלוק היסודות מיועד בדיוק לזה. שלושה ימים בשבוע, מוט ומשקלות, בלי מכונות. דגש על טמפו ועל טווח תנועה לפני העומס — לומדים את שבעת תבניות התנועה קודם, המשקל בא אחרי.',
  },
  'faq.q4':           { en: 'I am rehabbing an injury. Is the Rehab block right for me?', he: 'אני בשיקום אחרי פציעה. הבלוק שיקום מתאים לי?' },
  'faq.a4': {
    en: 'Only if your physiotherapist or doctor cleared you to load. The block uses a per-exercise pain gate (0–3 OK, 4–5 modify, 6+ stop) and load-management hierarchy: ROM → Tempo → Intensity → Volume → Frequency. If you are still in active rehab without clearance, do not buy — message me first.',
    he: 'רק אם הפיזיותרפיסט או הרופא אישרו לך לעמוס. הבלוק עובד עם שער כאב לכל תרגיל (0–3 בסדר, 4–5 התאם, 6+ עצור) והיררכיית עומס: טווח → טמפו → עוצמה → נפח → תדירות. אם אתה עוד בשיקום פעיל בלי אישור — אל תקנה, תכתוב לי קודם.',
  },
  'faq.q5':           { en: 'Can I customise the block once I get it?', he: 'אפשר להתאים את הבלוק אחרי שאני מקבל?' },
  'faq.a5': {
    en: "Inside the portal you swap any exercise for an alternative from the EXPO library (500+ exercises with the same movement pattern). For deeper changes — different days per week, different priorities — message me on WhatsApp and I will adjust manually. That is included in the one-time price.",
    he: 'בתוך הפורטל אתה מחליף כל תרגיל באלטרנטיבה מספריית EXPO (500+ תרגילים עם אותה תבנית תנועה). לשינויים יותר עמוקים — מספר ימים בשבוע, סדר עדיפויות — תכתוב לי בוואטסאפ ואני אסדר ידנית. זה כלול במחיר החד-פעמי.',
  },
  'faq.q6':           { en: 'How do I get the program after I pay?', he: 'איך אני מקבל את התוכנית אחרי התשלום?' },
  'faq.a6': {
    en: "Within a few hours of receiving your Bit confirmation you get an email with a sign-in link to expo-app.co.il. Your purchased program is already loaded onto a private account. No app to install, no subscription — runs in any browser, on phone or laptop.",
    he: 'תוך כמה שעות מקבלת אישור הביט מגיע אימייל עם קישור התחברות ל-expo-app.co.il. התוכנית כבר טעונה לחשבון פרטי שלך. בלי אפליקציה להתקין, בלי מנוי — רץ בכל דפדפן, בטלפון או במחשב.',
  },
  'faq.q7':           { en: 'How is this different from a free workout app?', he: 'מה ההבדל בין זה לבין אפליקציה חינמית?' },
  'faq.a7': {
    en: "Free apps give you a list of exercises. They do not auto-regulate against your RPE, they do not run pose detection on your video, they do not count reps from the bar path, and there is no real coach answering your WhatsApp. EXPO templates are the same engine the athletes I coach run — programmed by me, not generated.",
    he: 'אפליקציות חינמיות נותנות לך רשימת תרגילים. הן לא מתאימות עומס ל-RPE שלך, לא מריצות זיהוי תנוחה על הסרטון, לא סופרות חזרות לפי מסלול המוט, ואין מאמן אמיתי שעונה בוואטסאפ. תבניות EXPO הן אותה שיטה שעובדים איתה הספורטאים שאני מאמן — אני כותב, לא AI.',
  },
  'faq.q8':           { en: 'Can I message you for support after I buy?', he: 'אפשר לדבר איתך לתמיכה אחרי הקנייה?' },
  'faq.a8': {
    en: 'Yes — WhatsApp is open. I am not a 24/7 hotline, but I read everything and reply same-day Sun–Thu, slower on Fri/Sat. The portal answers most things on its own (load progressions, exercise swaps, pain gating), so messaging is for the harder cases — and that is included in the one-time price.',
    he: 'כן. וואטסאפ פתוח. אני לא קו חם 24/7, אבל אני קורא הכל ועונה באותו יום א׳–ה׳, איטי יותר בשישי-שבת. הפורטל פותר את רוב הדברים לבד (עליות עומס, החלפת תרגילים, ניטור כאב), אז הודעות זה למקרים יותר מורכבים — וזה כלול במחיר החד-פעמי.',
  },

  // ─── Quiz (routing questionnaire) ─────────────────────────────────
  'quiz.badge':       { en: 'NOT SURE WHICH BLOCK?', he: 'לא בטוח איזה בלוק?' },
  'quiz.h2':          { en: 'Six questions. Get matched.', he: 'שש שאלות. תקבל התאמה.' },
  'quiz.body': {
    en: "I built this from the same intake form I use with the athletes I coach — just shorter. Takes about a minute. The full assessment lives behind it for when you are ready.",
    he: 'בניתי את זה מאותו טופס היכרות שאני עובד איתו עם הספורטאים שאני מאמן — רק קצר יותר. דקה. ההערכה המלאה מחכה מאחורה לכשתרצה.',
  },
  'quiz.cta':         { en: 'START QUIZ →',          he: 'תתחיל קוויז ←' },
  'quiz.modal.title': { en: 'Find your program',     he: 'תמצא לך תוכנית' },
  'quiz.modal.close': { en: 'Close',                 he: 'סגירה' },
  'quiz.step.tmpl':   { en: 'STEP {n} OF {total}',   he: 'שלב {n} מתוך {total}' },
  'quiz.next':        { en: 'NEXT →',                he: 'הבא ←' },
  'quiz.back':        { en: '← BACK',                he: 'חזרה →' },
  'quiz.see':         { en: 'SEE MY MATCHES →',      he: 'תראה התאמות ←' },
  'quiz.restart':     { en: '↺ RESTART',             he: '↺ התחלה מחדש' },

  // Q1 — couple
  'quiz.q1':          { en: 'Are you buying for one person or for two?', he: 'אתה קונה ליחיד או לשניים?' },
  'quiz.q1.solo':     { en: 'Just me',               he: 'רק אני' },
  'quiz.q1.couple':   { en: 'Two of us, same gym',   he: 'שניים, אותו חדר כושר' },

  // Q2 — first-timer
  'quiz.q2':          { en: 'Have you trained in a gym before?', he: 'התאמנת בעבר בחדר כושר?' },
  'quiz.q2.never':    { en: 'No — total beginner',   he: 'לא, מתחיל לגמרי' },
  'quiz.q2.before':   { en: 'Yes — I have a base',   he: 'כן, יש לי בסיס' },

  // Q3 — experience length (only if Q2=before)
  'quiz.q3':          { en: 'How long was your longest continuous training stretch?', he: 'מה התקופה הכי ארוכה ברצף שהתאמנת?' },
  'quiz.q3.lt6':      { en: 'Less than 6 months',    he: 'פחות מ-6 חודשים' },
  'quiz.q3.6to12':    { en: '6 to 12 months',        he: '6 עד 12 חודשים' },
  'quiz.q3.1to3':     { en: '1 to 3 years',          he: '1 עד 3 שנים' },
  'quiz.q3.gt3':      { en: '3+ years',              he: '3+ שנים' },

  // Q4 — current physical state
  'quiz.q4':          { en: 'What is your body telling you right now?', he: 'מה הגוף שלך אומר לך עכשיו?' },
  'quiz.q4.fine':     { en: 'I feel great',          he: 'מרגיש מצוין' },
  'quiz.q4.minor':    { en: 'A few minor pains',     he: 'כאבים נקודתיים קלים' },
  'quiz.q4.rom':      { en: 'Limited range of motion', he: 'טווח תנועה מוגבל' },
  'quiz.q4.rehab':    { en: 'Returning from injury (cleared by physio)', he: 'חוזר מפציעה (אישור פיזיותרפיסט)' },

  // Q5 — primary goal
  'quiz.q5':          { en: 'Primary goal for the next block?', he: 'מטרה ראשית לבלוק הקרוב?' },
  'quiz.q5.lose':     { en: 'Lose weight / lean out', he: 'חיטוב / הרזיה' },
  'quiz.q5.muscle':   { en: 'Build muscle (hypertrophy)', he: 'מסת שריר (היפרטרופיה)' },
  'quiz.q5.strength': { en: 'Get stronger',          he: 'להיות יותר חזק' },
  'quiz.q5.health':   { en: 'General health & consistency', he: 'בריאות כללית והתמדה' },
  'quiz.q5.sport':    { en: 'A specific sport',      he: 'ענף ספורט מסוים' },

  // Q6 — frequency
  'quiz.q6':          { en: 'How many days a week can you actually train?', he: 'כמה ימים בשבוע אתה באמת יכול להתאמן?' },
  'quiz.q6.2':        { en: '2 days',                he: 'יומיים' },
  'quiz.q6.3':        { en: '3 days',                he: '3 ימים' },
  'quiz.q6.4':        { en: '4 days',                he: '4 ימים' },
  'quiz.q6.5':        { en: '5+ days',               he: '5+ ימים' },

  // Result screen
  'quiz.r.h':         { en: 'Your match',            he: 'ההתאמה שלך' },
  'quiz.r.body': {
    en: "Based on your answers — closest fit first. Each is a real product you can buy now. If none reads right, hit RESTART or message me on WhatsApp and I'll point you manually.",
    he: 'על פי התשובות שלך — ההתאמה הכי קרובה קודם. כל אחת היא מוצר אמיתי שאפשר לקנות עכשיו. אם אף אחת לא נשמעת לך — תלחץ "התחל מחדש" או תכתוב לי בוואטסאפ ואני אכוון אותך ידנית.',
  },
  'quiz.r.empty': {
    en: "Nothing matches your filters cleanly — your case looks specific. Message me on WhatsApp and I'll match you to the right block manually (or build a custom one).",
    he: 'אין התאמה נקייה לפי הסינון שלך — נראה שהמקרה שלך ספציפי. תכתוב לי בוואטסאפ ואני אכוון אותך ידנית לבלוק הנכון (או אבנה מותאם).',
  },
  'quiz.r.fit.high':   { en: 'BEST MATCH',           he: 'ההתאמה הכי טובה' },
  'quiz.r.fit.med':    { en: 'ALSO WORKS',           he: 'גם מתאים' },
  'quiz.r.full.h':     { en: 'Want me to look at this personally?', he: 'רוצה שאני אסתכל על זה אישית?' },
  'quiz.r.full.body': {
    en: 'The full intake form is the same one I use with the athletes I coach — body history, sleep, stress, training history, goals. Fills in 6 minutes. After you submit it I will reply with a personalised recommendation.',
    he: 'טופס ההיכרות המלא הוא אותו אחד שאני עובד איתו עם הספורטאים שאני מאמן — היסטוריה גופנית, שינה, לחץ, ניסיון אימוני, מטרות. ממלאים תוך 6 דקות. אחרי שאתה שולח אני חוזר עם המלצה אישית.',
  },
  'quiz.r.full.cta':   { en: 'OPEN FULL ASSESSMENT →', he: 'תפתח את הטופס המלא ←' },
  'quiz.r.wa.cta':     { en: 'OR ASK ON WHATSAPP →', he: 'או תכתוב בוואטסאפ ←' },

  // ─── Exit-intent / scroll-50% modal ───────────────────────────────
  'exit.title':       { en: 'Before you go —',      he: 'לפני שאתה הולך —' },
  'exit.body': {
    en: "Leave your email and I will send you one free sample week from the Foundation Block. No spam, no sales sequence — one email, one workout, see if the format works for you.",
    he: 'תשאיר אימייל ואני אשלח לך שבוע אחד חינם מתוך בלוק היסודות. בלי ספאם, בלי משפך מכירות — מייל אחד, אימון אחד, תראה אם הפורמט עובד לך.',
  },
  'exit.dismiss':     { en: 'NO THANKS',            he: 'לא, תודה' },
  'exit.close':       { en: 'Close',                he: 'סגירה' },

  // ─── Interactive demo modals (clickable PhoneFrame) ───────────────
  'demo.tap':         { en: '↗ TAP TO TRY',         he: '↗ לחיצה לניסוי' },
  'demo.close':       { en: 'Close demo',           he: 'סגירת הדגמה' },
  'demo.pose.h':      { en: 'Pose detection · interactive', he: 'זיהוי תנוחה · אינטראקטיבי' },
  'demo.pose.body': {
    en: 'Drag the slider to scrub through the squat — knee + hip angles update in real time, same as the portal does on a real clip.',
    he: 'תגרור את הסליידר כדי לעבור לאורך הסקוואט — זוויות הברך והירך מתעדכנות בזמן אמת, בדיוק כמו שהפורטל עושה על קליפ אמיתי.',
  },
  'demo.pose.scrub':  { en: 'SQUAT PHASE',          he: 'שלב הסקוואט' },
  'demo.shot.h':      { en: 'Jump shot · interactive', he: 'זריקה · אינטראקטיבי' },
  'demo.shot.body': {
    en: 'Drag through the shot — the phase, the elbow angle and the ball all move together, the same way the analyzer walks a real clip frame by frame.',
    he: 'תגרור לאורך הזריקה — השלב, זווית המרפק והכדור זזים ביחד, בדיוק כמו שהניתוח עובר על קליפ אמיתי פריים אחרי פריים.',
  },
  'demo.shot.scrub':  { en: 'SHOT PHASE',           he: 'שלב הזריקה' },
  'demo.rep.h':       { en: 'Rep counter · interactive', he: 'ספירת חזרות · אינטראקטיבי' },
  'demo.rep.body': {
    en: "Tap the bar to add a rep. The path lights a trough at each tap — that's exactly how the portal counts off your real video.",
    he: 'תלחץ על הסרגל להוסיף חזרה. המסלול מאיר ירידה בכל לחיצה — בדיוק ככה הפורטל סופר על הסרטון האמיתי שלך.',
  },
  'demo.rep.reset':   { en: '↺ RESET',              he: '↺ אפס' },
  'demo.cmp.h':       { en: 'Side-by-side · interactive', he: 'השוואה צד-לצד · אינטראקטיבי' },
  'demo.cmp.body': {
    en: 'Tap a tile to focus it — same UI as the portal when you compare today against your last attempt at the same load.',
    he: 'לחץ על אריח כדי להתמקד בו — אותה ממשק כמו בפורטל כשמשווים את היום מול הסט הקודם באותו עומס.',
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
  // URL pin wins; otherwise fall back to localStorage; otherwise DEFAULT.
  if (typeof window !== 'undefined') {
    const fromPath = langFromPath(window.location.pathname);
    if (fromPath) return fromPath;
  }
  if (typeof localStorage === 'undefined') return DEFAULT;
  const v = localStorage.getItem(STORAGE_KEY);
  return LANGS.includes(v) ? v : DEFAULT;
})();
applyDocLang(current);

// Keep lang in sync with browser back/forward between /, /he, /en.
if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    const fromPath = langFromPath(window.location.pathname);
    const next = fromPath || (() => {
      try { const v = localStorage.getItem(STORAGE_KEY); return LANGS.includes(v) ? v : DEFAULT; }
      catch { return DEFAULT; }
    })();
    if (next === current) return;
    current = next;
    applyDocLang(next);
    for (const l of listeners) { try { l(next); } catch {} }
  });
}

export function setLang(next) {
  if (!LANGS.includes(next) || next === current) return;
  current = next;
  try { localStorage.setItem(STORAGE_KEY, next); } catch {}
  applyDocLang(next);
  // Sync the URL so /he and /en mirror the chosen language. We always pin
  // an explicit path so the resulting URL is share-friendly. Hash + query
  // are preserved so the current view (catalog vs program detail) survives.
  if (typeof window !== 'undefined') {
    const hash = window.location.hash || '';
    const search = window.location.search || '';
    const newPath = next === 'he' ? '/he' : '/en';
    if (window.location.pathname !== newPath) {
      window.history.pushState(null, '', newPath + search + hash);
    }
  }
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
