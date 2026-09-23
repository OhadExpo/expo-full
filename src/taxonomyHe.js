// THE EXERCISE TAXONOMY, NAMED IN HEBREW.
//
// The exercise library's six attribute columns — category, resistance, body
// position, movement type, movement pattern, laterality — are CLOSED lists.
// They are fixed in CLAUDE.md and every row in the library uses one of these
// values verbatim, so translating them is a pure DISPLAY concern: nothing in
// the database changes, no migration, no risk to the 1,470 stored exercises.
//
// Why it matters: photographed on the Hebrew demo the night before Ohad's
// first client demo, the exercise tab carried 59 English strings on an
// otherwise Hebrew screen — the largest single block left anywhere in the
// product.
//
// WHAT IS DELIBERATELY NOT HERE:
//   - exercise NAMES. His rule: they stay English unless a widely-used Hebrew
//     term exists, and the plan row's own title is the source of truth.
//   - the anatomy columns (primaryJoints, jointMovements, primaryMuscles,
//     secondaryMuscles). "Pectoralis Major", "Shoulder Horizontal Adduction"
//     are free text, not a closed list, and Israeli S&C coaches use the
//     clinical English. Inventing Hebrew for an open set is how you ship
//     wrong Hebrew.
//
// Applied at the render site in BOTH src/ExercisesView.jsx (the real app) and
// src/CoachDemo.jsx (its demo clone), so the two stay in parity.

const TAXO_HE = {
  // Category
  Chest: 'חזה', Back: 'גב', Shoulders: 'כתפיים', Arms: 'ידיים', Core: 'ליבה',
  Legs: 'רגליים', Glutes: 'ישבן', 'Full Body': 'כל הגוף', Olympic: 'אולימפי',
  Cardio: 'אירובי',

  // Resistance type
  Barbell: 'מוט', Dumbbell: 'משקולות יד', Bodyweight: 'משקל גוף',
  Machine: 'מכונה', Cable: 'כבל', Band: 'גומייה', Kettlebell: 'קטלבל',
  'Medicine Ball': 'כדור כוח', Landmine: 'לנדמיין', 'TRX/Suspension': 'TRX',

  // Body position
  Standing: 'עמידה', Seated: 'ישיבה', Supine: 'שכיבה על הגב',
  Prone: 'שכיבה על הבטן', Kneeling: 'כריעה', 'Half-Kneeling': 'כריעה על ברך',
  Quadruped: 'עמידת שש', 'Side-Lying': 'שכיבה על הצד', Hanging: 'תלייה',

  // Movement type
  Push: 'דחיפה', Pull: 'משיכה', Row: 'חתירה', Curl: 'כפיפה', Extend: 'יישור',
  Squat: 'סקוואט', Hinge: 'הינג׳', Lunge: 'לאנג׳', Rotation: 'סיבוב',
  'Anti-Rotation': 'אנטי-סיבוב', Carry: 'נשיאה', 'Lateral Raise': 'הרמה לצדדים',
  'Front Raise': 'הרמה קדימה', Pullover: 'פולאובר', Throw: 'זריקה',
  Slam: 'סלאם', Toss: 'מסירה', Jump: 'קפיצה', Isometric: 'איזומטרי',
  'Olympic Lift': 'הרמה אולימפית',

  // Movement pattern
  'Horizontal Push': 'דחיפה אופקית', 'Horizontal Pull': 'משיכה אופקית',
  'Vertical Push': 'דחיפה אנכית', 'Vertical Pull': 'משיכה אנכית',
  'Hip Hinge': 'הינג׳ ירך', 'Carry/Loaded Locomotion': 'נשיאה',
  'Rotation/Anti-Rotation': 'סיבוב ואנטי-סיבוב', Isolation: 'בידוד',

  // Laterality
  Bilateral: 'דו-צדדי', Unilateral: 'חד-צדדי', Alternating: 'לסירוגין',

  // The shared tail of every one of those lists.
  Other: 'אחר',
};

// A cell can hold several values ("Barbell, Dumbbell"), so translate each part
// and leave anything not in the closed list exactly as it was. A value this
// map does not know is data, and data is never guessed at.
export function taxoHe(value, lang) {
  if (lang !== 'he' || value == null) return value;
  const s = String(value);
  if (!s) return s;
  if (TAXO_HE[s]) return TAXO_HE[s];
  if (!s.includes(',')) return s;
  return s.split(',').map((part) => {
    const t = part.trim();
    return TAXO_HE[t] || t;
  }).join(', ');
}

export default taxoHe;
