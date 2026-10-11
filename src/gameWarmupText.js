// THE GAME WARM-UP, WRITTEN FOR THE COURT (11.10 #658, Ohad: "the game warm-up doesnt needs to be
// translated exactly as the notes i gave it in hebrew. make it better"). His sheet stays the source
// (bhbc-gamewarmup-sync.mjs, every 20 min); its English was a word-for-word translation of his notes.
// This is the coach's version of the same drills: clear names, cues a player can act on, one way of
// writing the volume - in English (most of the squad) and Hebrew (cues; drill names stay English, as
// exercise names do everywhere in the app).
//
// SAFE AGAINST HIS EDITS: every line names the sheet text it was written for (`was`). When he changes
// that line in the sheet, the view shows HIS new words, not this rewrite, until it is re-worded.
export const GW_DRILLS = {
  1: { was: 'A-Skip', en: { name: 'A-Skip', cue: 'Two skips, then switch legs.' }, he: { cue: 'שני סקיפים, ואז החלפת רגל.' } },
  2: { was: 'Walking Lunge w Trunk Rotation', en: { name: 'Walking Lunge + Rotation', cue: 'Lunge, turn the chest over the front knee, then reach tall.' }, he: { cue: 'לאנג׳, סיבוב של החזה מעל הברך הקדמית, ואז מתיחה למעלה.' } },
  3: { was: 'A-Skip w Trunk Rotation', en: { name: 'A-Skip + Rotation', cue: 'Turn the chest away from the knee that drives up.' }, he: { cue: 'החזה מסתובב לצד הנגדי לברך שעולה.' } },
  4: { was: 'Knee to Chest (Hugging) Strech to QUAD Strech', en: { name: 'Knee Hug to Quad Stretch', cue: 'Hug the knee to the chest (glute), then grab the foot behind you (hip flexor and quad).' }, he: { cue: 'חיבוק ברך לחזה (ישבן), ואז אחיזת כף הרגל מאחור (מכופף ירך וארבע ראשי).' } },
  5: { was: 'Karaoke Skip', en: { name: 'Carioca', cue: 'Start with low knees, build to high knees.' }, he: { cue: 'ברכיים נמוכות בהתחלה, ובהדרגה ברכיים גבוהות.' } },
  6: { was: 'Pigeon Stretch', en: { name: 'Walking Pigeon Stretch', cue: 'Pull the foot up across to the opposite knee - glute stretch. Alternate legs.' }, he: { cue: 'כף הרגל עולה לברך הנגדית - מתיחת ישבן. לסירוגין.' } },
  7: { was: '2 Lateral Shuffle > Front Foot Switch', en: { name: 'Shuffle x2, Front-Foot Pivot', cue: 'Two shuffles, then change direction pivoting on the front foot.' }, he: { cue: 'שני צעדי צד, ואז החלפת כיוון עם הרגל הקדמית כציר.' } },
  8: { was: '2 Lateral Shuffle > Rear Foot Switch', en: { name: 'Shuffle x2, Rear-Foot Pivot', cue: 'Two shuffles, then change direction pivoting on the rear foot.' }, he: { cue: 'שני צעדי צד, ואז החלפת כיוון עם הרגל האחורית כציר.' } },
  9: { was: 'Walking Hamstring Glides', en: { name: 'Walking Hamstring Sweeps', cue: 'Toes up, knee straight - feel it in the hamstring.' }, he: { cue: 'קצות האצבעות למעלה, ברך ישרה - מתיחה בהמסטרינג.' } },
  10: { was: 'Lateral A-Skip to Lateral Shuffle to Sprint', en: { name: 'Lateral Skip, Shuffle, Sprint', cue: 'Skip sideways, into a shuffle, then sprint out.' }, he: { cue: 'סקיפ לצד, צעדי צד, ואז ספרינט.' } },
  11: { was: 'Ankle Rockers', en: { name: 'Ankle Rockers', cue: 'Knees bent, roll onto one edge of the foot.' }, he: { cue: 'ברכיים כפופות, גלגול לצד אחד של כף הרגל.' } },
  12: { was: '2 Lateral Shuffles > 1 Lateral Shuffle Back', en: { name: 'Shuffle 2 Up, 1 Back', cue: 'Two shuffles forward, one back.' }, he: { cue: 'שני צעדי צד קדימה, אחד אחורה.' } },
  13: { was: 'SLDL to Leg Swing', en: { name: 'Single-Leg RDL to Leg Swing', cue: 'Hinge on one leg and touch the floor, swing the leg through, touch the foot.' }, he: { cue: 'דדליפט על רגל אחת עם נגיעה ברצפה, הנפת רגל קדימה, ונגיעה בכף הרגל.' } },
  14: { was: 'Triple Lunge Switch to Sprint', en: { name: 'Triple Split Switch to Sprint', cue: 'Three fast, low split switches, then sprint.' }, he: { cue: 'שלוש החלפות לאנג׳ מהירות ונמוכות, ואז ספרינט.' } },
  15: { was: 'Two-Feet Tap to Vertical Jump to SL Landing', en: { name: 'Fast Taps, Jump, Single-Leg Landing', cue: 'Quick taps on both feet, jump, land on one foot and stick it.' }, he: { cue: 'תופים מהירים על שתי הרגליים, קפיצה לגובה, ונחיתה יציבה על רגל אחת.' } },
  16: { was: 'Fast-Feet to 180° Rotation to Sprint', en: { name: 'Fast Feet, Half Turn, Sprint', cue: 'Fast feet with your back to the court, turn around, sprint.' }, he: { cue: 'רגליים מהירות עם הגב למגרש, חצי סיבוב, ספרינט.' } },
  17: { was: 'Reactionary Forward to Reverse Sprint', en: { name: 'Reactive Sprint and Turn Back', cue: 'Sprint, stop dead, sprint back - on the coach\'s call.' }, he: { cue: 'ספרינט, עצירה מלאה, ספרינט חזרה - לפי הקריאה של המאמן.' } },
  18: { was: 'Lay-Ups', en: { name: 'Lay-Ups', cue: 'Line 1 finishes the lay-up, line 2 rebounds.' }, he: { cue: 'שורה ראשונה עולה ללייאפ, שורה שנייה בריבאונד.' } },
  19: { was: '2-Man Drill: Handoff to Shoot, Handoff to Pass, Backdoor', en: { name: '2-Man Handoffs', cue: 'Handoff into a shot, handoff into a pass, then the backdoor cut.' }, he: { cue: 'הנד-אוף לזריקה, הנד-אוף למסירה, ואז חיתוך באקדור.' } },
};
export const GW_SECTIONS = {
  Sidelines: { en: 'Along the sideline', he: 'לאורך קו הצד' },
  Baseline: { en: 'From the baseline', he: 'מקו הבסיס' },
  '2 Lines Facing the Basket': { en: 'Two lines facing the basket', he: 'שתי שורות מול הסל' },
  'Baseline + Top': { en: 'Baseline and top of the key', he: 'קו הבסיס וראש הקשת' },
};
// the volume, one way of writing it ('1 Way' = one length of the court)
export const GW_DOSE = {
  '1 Way': { en: '1 length', he: 'אורך אחד' },
  '2 Way': { en: 'There & back', he: 'הלוך וחזור' },
  '6 E': { en: '6 each side', he: '6 לכל צד' },
  '3 E': { en: '3 each leg', he: '3 לכל רגל' },
  '2.5 MIN E': { en: '2.5 min each side', he: '2.5 דק׳ לכל צד' },
};
const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
// the line as the view shows it: the coach's version when the sheet still holds the text it was
// written for, else his sheet's own words
export function gwDrill(d, lang) {
  const o = d && GW_DRILLS[d.n];
  const mine = o && norm(o.was) === norm(d.name);
  const dose = GW_DOSE[String(d && d.dose || '').trim()];
  return {
    name: mine ? o.en.name : d.name,
    cue: mine ? (lang === 'he' ? o.he.cue : o.en.cue) : d.cue,
    dose: dose ? (lang === 'he' ? dose.he : dose.en) : d.dose,
    he: mine && lang === 'he',
  };
}
export function gwSection(name, lang) {
  const o = GW_SECTIONS[String(name || '').replace(/^Warm-Up\s+/i, '').trim()];
  return o ? (lang === 'he' ? o.he : o.en) : name;
}
