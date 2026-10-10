// Auto-task bodies, in Hebrew, at RENDER time.
//
// The rules in autoTasks.js write their bodies as English text into
// coach_notes.body ("Call ⁨Amit⁩ — skipped W3 of ⁨Block #19⁩"), and the
// idempotency keys of those rules depend on that text staying as it is. So the
// stored row is never touched: when the app is in Hebrew, the ten templates
// are recognised here and re-said in Hebrew, names and numbers carried across.
// Anything that is not one of the templates - a task the coach typed - comes
// back untouched. (The coverage sweep of 2026-09-07 counted these bodies as
// the last English on the dashboard and the tasks page.)
//
// Names arrive wrapped in the bidi isolates autoTasks.bidi() adds (U+2068 …
// U+2069); they are kept, so a Latin name sits right inside a Hebrew sentence.

const N = '(⁨[^⁩]*⁩|[^·—]+?)'; // a bidi-wrapped name, or a bare one

const days = (d) => (Number(d) === 1 ? 'יום אחד' : `${d} ימים`);
// A HEBREW PREFIX ON A LATIN NAME TAKES A HYPHEN (9.10 audit #612: 'להתקשר לYOAV SHAMRI'):
// ל / מ / ב glue straight onto a Hebrew word but are joined to a foreign one with '-'.
const pre = (p, name) => (/^\u2068?[A-Za-z0-9]/.test(name || '') ? `${p}-${name}` : `${p}${name}`);
// A PLAN NAMED 'Block #N' IS SAID IN HEBREW (the sentence read 'ב-BLOCK #4')
const block = (name) => String(name || '').replace(/Block #(\d+)/g, 'בלוק #$1');

// The merged outreach card lists its reasons by AUTO_KIND_LABEL; those codes were showing
// in Hebrew on the dashboard ('2 reasons: • WEEK SKIPPED • PAYMENT OVERDUE', 17.9).
const KIND_HE = { 'WEEK SKIPPED': 'דילג על שבוע', 'PAYMENT OVERDUE': 'תשלום באיחור', 'AT RISK': 'בסיכון',
  'NEEDS OUTREACH': 'צריך ליצור קשר', 'BLOCK ENDING': 'בלוק נגמר', 'VIDEO PENDING': 'סרטון לבדיקה',
  'NEW INTAKE': 'שאלון חדש', 'EVAL DUE': 'צריך הערכה', 'NEW LEAD': 'ליד חדש', 'PLAN DUE': 'צריך תוכנית' };
const reasonsHe = (block) => block.split(String.fromCharCode(10)).map((l) => l.replace(/^\s*•\s*/, '')).filter(Boolean)
  .map((r) => '• ' + (KIND_HE[r.trim()] || r.trim())).join(String.fromCharCode(10));
const RULES = [
  [new RegExp(`^Build ${N} for ${N}$`), (m) => `לבנות ${block(m[1])} ${pre('ל', m[2])}`],
  [new RegExp(`^Call ${N} — skipped W(\\d+) of ${N}$`), (m) => `להתקשר ${pre('ל', m[1])} — דילג על שבוע ${m[2]} ${pre('ב', block(m[3]))}`],
  // the merged outreach card (27.9): "Reach out to X — week skipped · at risk"
  [new RegExp(`^Reach out to ${N} — ([a-z ]+(?: · [a-z ]+)*)$`),
    (m) => `ליצור קשר עם ${m[1]} — ` + m[2].split(' · ').map((r) => KIND_HE[r.trim().toUpperCase()] || r).join(' · ')],
  [new RegExp(`^Reach out to ${N} — (.+?), (.+)$`), (m) => `ליצור קשר עם ${m[1]} — ${quiet(m[2])}, ${quiet(m[3])}`],
  [new RegExp(`^Reach out to ${N} · (\\d+) reasons:\\n([\\s\\S]+)$`),
    (m) => `ליצור קשר עם ${m[1]} · ${m[2] === '2' ? 'שתי סיבות' : `${m[2]} סיבות`}:` + String.fromCharCode(10) + reasonsHe(m[3])],
  [/^Review (\d+) form videos? from (.+)$/, (m) => `לבדוק ${Number(m[1]) === 1 ? 'סרטון טכניקה אחד' : `${m[1]} סרטוני טכניקה`} של ${m[2]}`],
  [/^Onboard (.+)$/, (m) => `קליטה: ${m[1]}`],
  [new RegExp(`^Chase payment from ${N} · never paid(?: · (\\d+)d since signup)?(?: · ₪(\\d+)\\/mo)?$`),
    (m) => `לגבות תשלום ${pre('מ', m[1])} · עוד לא שילם${m[2] ? ` · ${days(m[2])} מההרשמה` : ''}${m[3] ? ` · ₪${m[3]} לחודש` : ''}`],
  [new RegExp(`^Chase payment from ${N} · last paid (\\d+)d ago(?: · ₪(\\d+) due)?$`),
    (m) => `לגבות תשלום ${pre('מ', m[1])} · שילם לאחרונה לפני ${days(m[2])}${m[3] ? ` · ₪${m[3]} לתשלום` : ''}`],
  [new RegExp(`^Run athletic eval on ${N} · first-session baseline$`), (m) => `לעשות הערכה אתלטית ${pre('ל', m[1])} · מדידת בסיס באימון הראשון`],
  [new RegExp(`^Call back ${N} · (\\d+)d since signup(?: via (.+?))?(?: — (.+))?$`),
    (m) => `לחזור ${pre('ל', m[1])} · ${days(m[2])} מההרשמה${m[3] ? ` · דרך ${m[3]}` : ''}${m[4] ? ` — ${m[4]}` : ''}`],
  [new RegExp(`^Build first training program for ${N} · eval is done$`), (m) => `לבנות תוכנית ראשונה ${pre('ל', m[1])} · ההערכה כבר נעשתה`],
];

// The two "quiet" fragments of the reach-out rule.
function quiet(s) {
  const t = String(s).trim();
  if (t === 'never trained') return 'עוד לא התאמן';          // rows stored before 9.10
  if (t === 'no workouts logged') return 'לא נרשמו אימונים';  // native-checked 9.10
  if (t === 'never contacted') return 'עוד לא היה קשר';
  let m = t.match(/^(\d+)d no workout$/); if (m) return `${days(m[1])} בלי אימון`;
  m = t.match(/^(\d+)d no contact$/); if (m) return `${days(m[1])} בלי קשר`;
  return t;
}

/** The Hebrew reading of an auto-task body, or the body itself when it is not one. */
export function localiseAutoBody(core) {
  const s = String(core || '').trim();
  if (!s) return s;
  for (const [re, say] of RULES) {
    const m = s.match(re);
    if (m) return say(m);
  }
  return s;
}
