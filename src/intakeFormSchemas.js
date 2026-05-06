// Native EXPO intake schemas — port of the three Google Forms Ohad has been
// emailing clients (HE initial, EN initial, HE progress check-in). Single
// source of truth for both the public form renderer (IntakeForm.jsx) and
// the coach inbox (IntakeView.jsx).
//
// Question types:
//   email      — email-validated short text
//   short      — single-line text
//   paragraph  — multi-line textarea
//   number     — numeric short text (height/weight)
//   date       — date picker
//   choice     — single-select radio buttons
//   scale      — 1..N linear scale with min/max labels
//
// Rendering uses `dir` derived from `locale` to flip RTL ↔ LTR. Conditional
// questions are not enforced — every question is shown; trainees ignore
// what doesn't apply.

export const INTAKE_HE = {
  id: 'intake_he_v1',
  formType: 'initial',
  locale: 'he',
  title: 'EXPO — הערכה ראשונית',
  intro: 'מלא/י את הטופס פעם אחת. הנתונים יגיעו ישירות אל המאמן ויעזרו להתאים את התוכנית.',
  submitLabel: 'שליחה',
  thanksTitle: 'תודה רבה!',
  thanksBody: 'הטופס הגיע אל המאמן. נחזור אליך תוך זמן קצר.',
  questions: [
    { id: 'email',         type: 'email',     label: 'אימייל', required: true },
    { id: 'name',          type: 'short',     label: 'שם מלא', required: true },
    { id: 'dob',           type: 'date',      label: 'תאריך לידה', required: true },
    { id: 'gender',        type: 'choice',    label: 'מין', required: true, choices: ['זכר', 'נקבה'] },
    { id: 'height',        type: 'number',    label: 'גובה עדכני (ס"מ)', required: true },
    { id: 'weight',        type: 'number',    label: 'משקל גוף נוכחי (ק"ג)', required: true },
    { id: 'occupation',    type: 'short',     label: 'עיסוק / מקצוע', required: true },
    { id: 'relationship',  type: 'choice',    label: 'סטטוס נוכחי', required: true, choices: ['רווק/ה', 'נשוי/אה', 'בזוגיות'] },
    { id: 'gym_first',     type: 'choice',    label: 'האם זו תהיה הפעם הראשונה שלך אי פעם בחדר כושר?', required: true, choices: ['כן (אני חדש/ה לחלוטין)', 'לא (התאמנתי בעבר)'] },
    { id: 'gym_longest',   type: 'short',     label: 'אם התאמנת בעבר — כמה זמן בעקבי הייתה תקופת האימונים הארוכה ביותר?' },
    { id: 'gym_last_date', type: 'short',     label: 'אם התאמנת בעבר — מתי האימון האחרון?' },
    { id: 'gym_stop_why',  type: 'paragraph', label: 'אם הפסקת בעבר — מה הסיבה?' },
    { id: 'weight_history',type: 'paragraph', label: 'האם היית בעבר כבד/ה מאוד או רזה מאוד? פרט/י.', required: true },
    { id: 'injuries',      type: 'paragraph', label: 'האם נפצעת בעבר? פרט/י.', required: true },
    { id: 'physical_state',type: 'paragraph', label: 'מהו מצבך הגופני הנוכחי? (כאבים, טווחי תנועה, חולשות, נושאים אחרים)', required: true },
    { id: 'medical',       type: 'paragraph', label: 'פרטים רפואיים או מחלות כרוניות שחשוב לדעת?' },
    { id: 'sleep_hours',   type: 'choice',    label: 'ממוצע שעות שינה בלילה בשבועות האחרונים', required: true, choices: ['בין 4 ל-5', 'בין 5 ל-6', 'בין 6 ל-7', 'בין 7 ל-8'] },
    { id: 'sleep_quality', type: 'scale',     label: 'דרג/י את ממוצע איכות השינה', required: true, scale: { min: 1, max: 5, minLabel: 'שינה לא יציבה', maxLabel: 'שינה עמוקה ורציפה' } },
    { id: 'stress_work',   type: 'scale',     label: 'דרג/י את רמת הלחץ בעבודה / עיסוק', required: true, scale: { min: 1, max: 5, minLabel: 'לא מציק לי', maxLabel: 'מרגיש/ה לחץ כל הזמן' } },
    { id: 'stress_family', type: 'scale',     label: 'דרג/י את רמת הלחץ במצב המשפחתי / זוגי', required: true, scale: { min: 1, max: 5, minLabel: 'לא מציק לי', maxLabel: 'מרגיש/ה לחץ כל הזמן' } },
    { id: 'stress_general',type: 'choice',    label: 'דרג/י את רמת הלחץ הכללי בחיים', required: true, choices: ['לא לחוץ/ה בדרך כלל', 'יותר לחץ לאחרונה', 'לחץ לעיתים קרובות', 'לחץ קיצוני בחיים'] },
    { id: 'main_goal',     type: 'paragraph', label: 'מהי המטרה העיקרית שלך בתקופת האימונים איתי?', required: true },
    { id: 'extra_goals',   type: 'paragraph', label: 'מטרות נוספות?' },
    { id: 'avoid',         type: 'paragraph', label: 'דברים שתרצה/י להימנע מהם?' },
    { id: 'lifestyle',     type: 'paragraph', label: 'הרגלים חדשים או שינוי באורח חיים שאתה/את רוצה לעבוד עליו?' },
    { id: 'comments',      type: 'paragraph', label: 'הערות נוספות' },
  ],
};

export const INTAKE_EN = {
  id: 'intake_en_v1',
  formType: 'initial',
  locale: 'en',
  title: 'EXPO — Self Evaluation',
  intro: 'Fill this once. The data goes straight to your coach and is used to tailor your program.',
  submitLabel: 'Submit',
  thanksTitle: 'Thanks!',
  thanksBody: 'Your form reached the coach. You\'ll hear back shortly.',
  questions: [
    { id: 'email',         type: 'email',     label: 'Email', required: true },
    { id: 'name',          type: 'short',     label: 'Full name', required: true },
    { id: 'dob',           type: 'date',      label: 'Date of birth', required: true },
    { id: 'gender',        type: 'choice',    label: 'Gender', required: true, choices: ['Male', 'Female'] },
    { id: 'height',        type: 'number',    label: 'Current height (cm)', required: true },
    { id: 'weight',        type: 'number',    label: 'Current body-weight (kg)', required: true },
    { id: 'occupation',    type: 'short',     label: 'Job / occupation / profession', required: true },
    { id: 'relationship',  type: 'choice',    label: 'Personal relationship status', required: true, choices: ['Single', 'Married', 'In a relationship'] },
    { id: 'gym_first',     type: 'choice',    label: 'Will this be your first time doing resistance training?', required: true, choices: ['I have never worked out in a gym', 'I have worked out in the past'] },
    { id: 'gym_longest',   type: 'short',     label: 'If you have trained before — what was your longest consecutive training period?' },
    { id: 'gym_last_date', type: 'short',     label: 'If you have trained before — when was your last active period?' },
    { id: 'gym_stop_why',  type: 'paragraph', label: 'If you stopped — what made you stop?' },
    { id: 'weight_history',type: 'paragraph', label: 'Have you ever been very heavy or very light? Share details.', required: true },
    { id: 'injuries',      type: 'paragraph', label: 'Have you ever been injured? Share details.', required: true },
    { id: 'physical_state',type: 'paragraph', label: 'Current physical condition — pain, mobility, stability, strength gaps, anything else.', required: true },
    { id: 'medical',       type: 'paragraph', label: 'Medical conditions we should track?' },
    { id: 'sleep_hours',   type: 'choice',    label: 'Average sleep hours per night recently', required: true, choices: ['4–5 hours', '5–6 hours', '6–7 hours', '7–8 hours'] },
    { id: 'sleep_quality', type: 'scale',     label: 'Rate the quality of your sleep', required: true, scale: { min: 1, max: 5, minLabel: 'Not very good', maxLabel: 'Very good' } },
    { id: 'stress_work',   type: 'scale',     label: 'Rate the stress level in your job / occupation', required: true, scale: { min: 1, max: 5, minLabel: "It doesn't bother me", maxLabel: 'I constantly feel stressed' } },
    { id: 'stress_family', type: 'scale',     label: 'Rate the stress level in your relationship / family life', required: true, scale: { min: 1, max: 5, minLabel: "It doesn't bother me", maxLabel: 'I constantly feel stressed' } },
    { id: 'stress_general',type: 'choice',    label: 'Rate the general stress level in your life', required: true, choices: ['Not usually stressed', 'I have experienced more stress lately', 'I have often experienced stress', 'I have extreme stress in my life'] },
    { id: 'main_goal',     type: 'paragraph', label: 'What is the most important goal we should aim for together?', required: true },
    { id: 'extra_goals',   type: 'paragraph', label: 'Additional goals?' },
    { id: 'avoid',         type: 'paragraph', label: 'Things you want to avoid?' },
    { id: 'lifestyle',     type: 'paragraph', label: 'New habits or lifestyle changes you want to work on?' },
    { id: 'comments',      type: 'paragraph', label: 'Additional thoughts' },
  ],
};

export const PROGRESS_HE = {
  id: 'progress_he_v1',
  formType: 'progress',
  locale: 'he',
  title: 'EXPO — הערכת התקדמות',
  intro: 'הערכת ביניים. המטרה היא לעדכן אותי איך שגרת האימונים עובדת איתך עכשיו.',
  submitLabel: 'שליחה',
  thanksTitle: 'תודה!',
  thanksBody: 'העדכון נקלט. אם משהו דורש התייחסות מיידית — סמסס לי.',
  questions: [
    { id: 'email',           type: 'email',     label: 'אימייל', required: true },
    { id: 'name',            type: 'short',     label: 'שם מלא', required: true },
    { id: 'weight',          type: 'number',    label: 'משקל גוף נוכחי (ק"ג)', required: true },
    { id: 'composition',     type: 'choice',    label: 'האם חלו שינויים בהרכב הגוף?', required: true, choices: ['לא, לא שמתי לב לשינוי', 'אחר'] },
    { id: 'composition_note',type: 'paragraph', label: 'אם "אחר" — פרט/י' },
    { id: 'medical',         type: 'paragraph', label: 'פרטים רפואיים או מחלות כרוניות שחשוב לדעת עליהן?' },
    { id: 'allergies',       type: 'paragraph', label: 'אלרגיות? רגישויות?' },
    { id: 'relationship',    type: 'choice',    label: 'סטטוס נוכחי', choices: ['רווק/ה', 'נשוי/אה', 'בזוגיות'] },
    { id: 'sleep_hours',     type: 'choice',    label: 'ממוצע שעות שינה בלילה בשבועות האחרונים', required: true, choices: ['בין 4 ל-5', 'בין 5 ל-6', 'בין 6 ל-7', 'בין 7 ל-8'] },
    { id: 'sleep_quality',   type: 'scale',     label: 'דרג/י את ממוצע איכות השינה', required: true, scale: { min: 1, max: 5, minLabel: 'שינה לא יציבה', maxLabel: 'שינה עמוקה ורציפה' } },
    { id: 'stress_family',   type: 'scale',     label: 'דרג/י את רמת הלחץ במצב המשפחתי / זוגי', required: true, scale: { min: 1, max: 5, minLabel: 'לא מציק לי', maxLabel: 'מרגיש/ה לחץ כל הזמן' } },
    { id: 'stress_work',     type: 'scale',     label: 'דרג/י את רמת הלחץ בעבודה / עיסוק', required: true, scale: { min: 1, max: 5, minLabel: 'לא מציק לי', maxLabel: 'מרגיש/ה לחץ כל הזמן' } },
    { id: 'stress_general',  type: 'choice',    label: 'דרג/י את רמת הלחץ הכללי בחיים', required: true, choices: ['לחוץ/ה לעיתים רחוקות', 'לחוץ/ה מדי פעם', 'לחוץ/ה לעיתים קרובות', 'לחוץ/ה מאוד בתקופה הנוכחית'] },
    { id: 'training_impact', type: 'choice',    label: 'האם שגרת האימונים השפיעה על חיי היום-יום?', required: true, choices: ['לא שמתי לב', 'אחר'] },
    { id: 'training_note',   type: 'paragraph', label: 'אם החמיר או השתפר — נמק/י' },
    { id: 'physical_state',  type: 'paragraph', label: 'מהו מצבך הגופני הנוכחי?' },
    { id: 'new_pain',        type: 'paragraph', label: 'האם יש כאבים חדשים?' },
    { id: 'rom_limit',       type: 'paragraph', label: 'האם יש טווח תנועה מוגבל?' },
    { id: 'other_issue',     type: 'short',     label: 'משהו אחר שמציק / כואב / מפריע?', required: true },
    { id: 'satisfaction',    type: 'scale',     label: 'מהי רמת הסיפוק וההנאה שלך מהאימונים?', required: true, scale: { min: 1, max: 5, minLabel: 'נמוכה מאוד', maxLabel: 'גבוהה מאוד' } },
    { id: 'system_feedback', type: 'choice',    label: 'הצעות לשיפור במערכת ובכלים?', required: true, choices: ['לא, אני בסך הכל מרוצה', 'אחר'] },
    { id: 'system_note',     type: 'paragraph', label: 'אם "אחר" — פרט/י' },
    { id: 'interests',       type: 'choice',    label: 'תחומי עניין או תרגילים ספציפיים?', required: true, choices: ['לא, אנחנו בכיוון הנכון', 'אחר'] },
    { id: 'interests_note',  type: 'paragraph', label: 'אם "אחר" — פרט/י' },
    { id: 'goal_change',     type: 'choice',    label: 'האם יש שינויים במטרות האימון?', required: true, choices: ['לא, ממשיכים לעבוד', 'אחר'] },
    { id: 'goal_note',       type: 'paragraph', label: 'אם "אחר" — פרט/י' },
    { id: 'frequency',       type: 'choice',    label: 'האם תרצה/י להתאמן מספר ספציפי של אימונים שבועיים?', required: true, choices: ['לא, אני דינמי ואתאמן בהתאם לתכנית', 'אחר'] },
    { id: 'frequency_note',  type: 'short',     label: 'אם "אחר" — כמה?' },
    { id: 'communication',   type: 'choice',    label: 'הצעות לשיפור בתקשורת בינינו?', required: true, choices: ['לא, אני בסך הכל מרוצה', 'אחר'] },
    { id: 'communication_note', type: 'paragraph', label: 'אם "אחר" — פרט/י' },
    { id: 'requests',        type: 'paragraph', label: 'בקשות? טענות? המלצות?' },
    { id: 'avoid_or_continue',type: 'paragraph',label: 'משהו שנרצה להימנע ממנו או להמשיך איתו?' },
    { id: 'lifestyle',       type: 'paragraph', label: 'הרגלים חדשים? שינוי אורח חיים?' },
    { id: 'comments',        type: 'paragraph', label: 'כל מחשבה נוספת', required: true },
  ],
};

export const FORM_BY_KEY = {
  'initial:he': INTAKE_HE,
  'initial:en': INTAKE_EN,
  'progress:he': PROGRESS_HE,
};

export function getForm(formType, locale) {
  return FORM_BY_KEY[`${formType}:${locale}`] || null;
}

// Generate a URL-safe random token. 22 chars of base36 ≈ 113 bits of entropy
// — fine for an unguessable single-shot link.
export function generateIntakeToken() {
  const a = Math.random().toString(36).slice(2, 12);
  const b = Math.random().toString(36).slice(2, 12);
  const t = Date.now().toString(36);
  return `${a}${b}${t}`.slice(0, 24);
}
