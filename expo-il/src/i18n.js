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
  'how.01.t':            { en: 'Pick a program',     he: 'בחר תוכנית' },
  'how.01.d': {
    en: "Browse the catalog above. Each card shows the duration, who it's for, and what's inside.",
    he: 'עיין בקטלוג למעלה. כל כרטיסיה מציגה את משך התוכנית, למי היא מתאימה, ומה בתוכה.',
  },
  'how.02.t':            { en: 'Pay via Bit',         he: 'שלם בביט' },
  'how.02.d.tmpl': {
    // {bit} placeholder is replaced at render time.
    en: 'Tap "Buy" on the program — opens WhatsApp with everything pre-filled. Pay through Bit ({bit}) and send a screenshot of the confirmation.',
    he: 'לחץ "קנה" בתוכנית — נפתח וואטסאפ עם הכל מוכן מראש. שלם בביט ({bit}) ושלח צילום מסך של האישור.',
  },
  'how.03.t':            { en: 'Get your account',    he: 'קבל את החשבון' },
  'how.03.d': {
    en: 'Within a few hours you receive an email with a sign-in link to expo-app.co.il. Your purchased program is already loaded.',
    he: 'תוך כמה שעות תקבל אימייל עם קישור התחברות ל-expo-app.co.il. התוכנית שרכשת כבר טעונה בחשבון.',
  },
  'how.04.t':            { en: 'Train',               he: 'התאמן' },
  'how.04.d': {
    en: 'Log every set on your phone. The program adapts to your bodyweight, RPE, and sessions completed — same engine as my private clients.',
    he: 'רשום כל סט בטלפון. התוכנית מתאימה את עצמה למשקל הגוף שלך, ל-RPE ולמספר האימונים — אותה השיטה כמו של לקוחות אישיים שלי.',
  },

  // ─── Contact ──────────────────────────────────────────────────────
  'contact.badge':       { en: 'CONTACT',        he: 'צור קשר' },
  'contact.h2':          { en: 'Questions before you buy?', he: 'שאלות לפני קנייה?' },
  'contact.body': {
    en: "WhatsApp is the fastest. Tell me what you train for, your equipment, and how many days you can give me — I'll point you at the right program.",
    he: 'וואטסאפ זה הכי מהיר. תספר לי לאיזו מטרה אתה מתאמן, איזה ציוד יש לך וכמה ימים בשבוע אתה יכול להקדיש — ואני אכוון אותך לתוכנית הנכונה.',
  },
  'contact.cta.whatsapp': { en: 'WHATSAPP',      he: 'וואטסאפ' },
  'contact.cta.email':    { en: 'EMAIL',         he: 'אימייל' },
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
