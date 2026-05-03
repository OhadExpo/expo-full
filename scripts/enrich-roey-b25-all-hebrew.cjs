// Patch the library so EVERY exercise referenced by Roey Block #25 (Day A/B/C)
// has both a videoLink and Hebrew cues. Uses library fallback videos where a
// related variant exists; otherwise a public reference URL.
const { createClient } = require('@supabase/supabase-js');
const SB = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const KEY = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';

// Each entry: cues (Hebrew) and optional videoLink (only set if missing/blank).
const PATCHES = {
  // ── Day A — Morning Routine ──
  'ex_roeb25m_rdl_baby_sq': {
    cues: 'RDL ירידה איטית עם שכמות סגורות וגב ניטרלי, ואז להמשיך ישר לסקוואט עמוק עם עקבים על הרצפה וחזה זקוף. רצף - מעבר נשלט בין שתי התנוחות.',
  },
  'ex_oxp5e58csgqmo7afloe': {
    cues: 'סקוואט עמוק, נמוך ככל שאפשר. מהתחתית, החלף ברך אחת לרצפה כל פעם. פלג גוף עליון נשאר זקוף, אגן יציב, אין תזוזה לצדדים.',
  },
  'ex_roeb25m_sa_crab_raise': {
    cues: 'שב על הרצפה, יד אחת מתחת לכתף, יד שנייה על הבטן. עקבים בלבד על הרצפה. הרם את האגן עד קו ישר מהברך עד הכתפיים, כמו היפ-טראסט. יד אחת בכל פעם.',
  },
  'ex_roeb25m_prone_def_sa_y': {
    cues: 'שכב על הבטן על ספסל מוגבה. יד אחת מורדת מתחת לקו הגוף לפני שמרימים. הרם בצורת Y, אגודל לתקרה. עבוד דרך הדפיציט עד שאתה ב-Y מלא.',
  },
  'ex_roeb25m_iso_prone_t': {
    cues: 'שכב על הבטן, ידיים פרוסות לצדדים בצורת T. אגודלים לתקרה. סחוט שכמות (טרפז אמצעי+תחתון), הרם ידיים 1-2 ס"מ מהרצפה והחזק. סטטי - בלי חזרות.',
  },
  'ex_roeb25m_supine_def_er': {
    cues: 'שכב על הגב על משטח מוגבה כדי שהידיים יוכלו לרדת מתחת לקו הגוף. ברכיים מעל הפופיק. המרפקים הם הציר ולא זזים. שורש כף היד והמרפקים מגיעים אל הרצפה ומתחת.',
  },
  'ex_roeb25m_sa_bear_scap': {
    cues: 'עמידת דוב: ברכיים באוויר, שוקיים מקבילות לרצפה, מרפקים נעולים. העבר משקל ליד עובדת אחת. (1) סחוט שכם > השכם יורד. (2) דחוף שכם > השכם עולה. אגן יציב לאורך הסט.',
  },
  'ex_roeb25m_wall_ball_slide': {
    cues: 'עמוד כ-10 ס"מ מהקיר, ברכיים רכות. כדור קטן בין המצח/עורף לקיר. דחוף עם הראש כ-50% לחץ, סנטר פנימה קלות, החלק את הסנטר אל החזה ובחזרה - בלי לאבד את הלחיצה בכדור.',
  },

  // ── Day B (the workout that was Day A) ──
  'ex_cu9m58g6moosndn8': {
    cues: 'רגליים רחבות מהאגן. הרם את הכדור מעל הראש, סובב את הירך האחורית, ואז סלאם בכוח לרצפה כ-30-50 ס"מ מחוץ לרגל הקדמית. החלף צדדים.',
  },
  'ex_jba6g9hgk7kmo7afevm': {
    cues: 'אותה תנועה כמו ה-slam, רק שעוצרים את הסלאם ברגע האחרון - הכדור לא נוגע ברצפה. עבודה על שליטה בעצירה ועל הרגע האקסצנטרי.',
  },
  'ex_bwsxl6v1moosndn8': {
    cues: 'DB ביד אחת, יד שנייה נשענת על מעקה/קיר ליציבות. רגל חופשית מתקפלת אחורה. ברך עוקבת אחרי הבוהן, רד עד שהברך האחורית כמעט נוגעת ברצפה.',
    videoLink: 'https://www.youtube.com/watch?v=4qMLnvW9rq8',
  },
  'ex_gmn4zkn0acmo7afevm': {
    cues: 'בנץ\' פרס עם רגליים על הספסל (לא על הרצפה). מנטרל את ה-leg drive - עבודה נקייה של החזה והשכמות. ירידה איטית, נגיעה רכה בחזה.',
  },
  'e61': {
    cues: 'אחיזה עם יד אחת. שב יציב, גב לא נופל אחורה. משוך את המרפק למטה ולפנים, סחוט שכם בקצה התחתון. החזרה איטית עד מתיחה מלאה.',
  },
  'ex_d8yxfmm21mhmo7afevn': {
    cues: 'כריעה זקופה (לא חצי). אגן נעול, ישבן סחוט. דחוף ישר מעל הראש, מרפקים נכנסים פנימה מתחת לכף היד. בלי קימור גב.',
  },
  'ex_uqsx6l5qmoosndn8': {
    cues: 'כריעה זקופה מול הספסל, יד נגדית נשענת עליו ישר ויציב. גב ארוך, סחוט שכם והבא את המרפק לכיוון האגן. בלי לסובב את האגן.',
  },
  'ex_ticwpojtmoosndn8': {
    cues: 'שכב פנים-ברכים על ספסל בשיפוע, ידיים ב-Y. התחל בסופינציה (כפות ידיים למעלה), סובב לפרונציה (כפות ידיים למטה) בקצה העליון, חזרה בדרך למטה.',
    videoLink: 'https://www.youtube.com/shorts/UqTdjV17_ss',
  },
  'ex_yddua2c2moosndn8': {
    cues: 'שכב על ספסל בשיפוע, ראש למעלה. אחוז במשענת מעל הראש. הצמד גב תחתון לספסל, הרם רגליים לעמידה אנכית, רד באיטיות בשליטה.',
  },

  // ── Day C (the workout that was Day B) ──
  'ex_34r9xg3amnxqyj3e': {
    cues: 'מתחיל מ-FFESS (רגל קדמית מוגבהת), עולה לעמידה זקופה, יורד ללאנג\' רגיל, וקפיצה אחת מהלאנג\'. נחיתה רכה. שלוש תנוחות > קפיצה אחת.',
    videoLink: 'https://www.youtube.com/shorts/NE2Ctrd2fsY',
  },
  'e37': {
    cues: 'מ-FFESS ישר ללאנג\' רגיל ואז קפיצה - בלי עמידה זקופה באמצע. רצף מהיר, נחיתה רכה. עבודה על הספרינג של הקרסול והברך.',
    videoLink: 'https://www.youtube.com/shorts/NE2Ctrd2fsY',
  },
  'ex_aiqevttcg7umobz1x89': {
    cues: 'עמוד על באמפר/מדרגה, אחיזה בידיות הנמוכות של הטראפ-בר. גב נשאר ניטרלי, ישבן אחורה, ירידה איטית עד שאתה מרגיש מתח מלא בהמסטרינג. בלי לעגל את הגב.',
  },
  'e222': {
    cues: 'שכב פנים על ספסל בשיפוע. אחיזה רחבה פרונציה (כפות ידיים למטה). הבא את ה-DBs לחזה והחזק - סחוט שכמות, אל תזוז. ISO = סטטי בקצה העליון.',
  },
  'ex_d4vfns0625pmo7afevm': {
    cues: 'שב על המכונה, אחוז בחבל. משוך את החבל לכיוון המצח, מרפקים גבוהים מהשורש כף יד. סחוט שכמות בקצה. החזרה איטית עם שליטה.',
  },
  'e221': {
    cues: 'הורד את המוט עד 2-3 ס"מ מהחזה והחזק שם. סחוט שכמות, מתח כל הגוף. ISO = סטטי בנקודה הקשה ביותר. בלי לאבד מתיחה.',
  },
  'ex_7x4piwm6opmmo91d9mm': {
    cues: 'שב יציב, גב צמוד למשענת, רגליים יציבות על הרצפה. דחוף קדימה בלי לנעול את המרפקים בקצה. החזרה איטית - עבודה אקסצנטרית.',
  },
  'ex_qbfmd4ugmoosndn9': {
    cues: 'DB ביד אחת מעל הראש (נעול), הרגל ההפוכה (קונטרלטרלית) מובילה כל צעד. צלעות מעל האגן, מרפק נעול לאורך כל ההליכה. החלף צדדים תוך כדי תנועה.',
  },
  'ex_qlu45eypmoosndn9': {
    cues: 'תנוחת הולו (גב תחתון מוצמד לרצפה, כתפיים ועקבים באוויר). ברכיים כפופות, כפות רגליים יחד. פתח וסגור ברכיים כמו צדפה תוך שמירה על תנוחת הולו לאורך הסט.',
    videoLink: 'https://www.youtube.com/watch?v=zKqcL6HSTE4',
  },
};

(async () => {
  const s = createClient(SB, KEY);
  await s.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });

  const { data: row, error } = await s.from('store').select('value').eq('key', 'expo-exercises').maybeSingle();
  if (error) throw error;
  const lib = Array.isArray(row?.value) ? row.value : [];

  let cueWrites = 0, videoWrites = 0, missing = 0;
  const updated = lib.map(e => {
    const p = PATCHES[e.id];
    if (!p) return e;
    const next = { ...e };
    if (p.cues) { next.cues = p.cues; cueWrites++; }
    if (p.videoLink && !(e.videoLink || e.videoUrl)) { next.videoLink = p.videoLink; videoWrites++; }
    return next;
  });

  // Detect any patch keys that did NOT match a library row
  const haveIds = new Set(lib.map(e => e.id));
  for (const id of Object.keys(PATCHES)) if (!haveIds.has(id)) { console.log('⚠ patch key not in library:', id); missing++; }

  console.log(`cue writes: ${cueWrites}   new video writes: ${videoWrites}   missing keys: ${missing}`);
  const { error: uerr } = await s.from('store').upsert({ key: 'expo-exercises', value: updated });
  if (uerr) throw uerr;
  console.log('✓ library updated');
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
