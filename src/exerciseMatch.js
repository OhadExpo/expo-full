// exerciseMatch.js — resolve plan-row exercise references against the library
// for the batch-matching screen. Mirrors scripts/audit-missing-exercises.cjs's
// unresolved detection, plus a ranked near-miss suggester ported from
// scripts/library-nearmiss.cjs. Pure + framework-free (unit-testable).

const CORRUPT_ID = 'ex_rvi8ifq11zsmo8nlmzm';
const MISSING_RX = /חסר תרגיל|superset\s*[—-]|missing exercise|\(unresolved\)/i;

// Normalize a title: lowercase, drop punctuation, collapse whitespace. Keeps
// Hebrew + latin letters and digits so bilingual titles compare cleanly.
export const normTitle = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9֐-׿ ]+/g, ' ').replace(/\s+/g, ' ').trim();
export const tokenSet = (s) => new Set(normTitle(s).split(' ').filter(Boolean));

// Canonical token layer — collapse abbreviation/synonym/plural spelling variants
// so the suggester compares meaning, not spelling. The map is grounded in the
// measured token-diff tally across all real plans (scripts/_measure-matching.cjs,
// 2026-08-21), not guessed. Both sides are canonicalized, so direction is safe.
const SYN = {
  pos: 'position', laying: 'lying', lay: 'lying', lie: 'lying',
  seated: 'sitting', seating: 'sitting',
  hoz: 'horizontal', horiz: 'horizontal', vert: 'vertical',
  w: 'with', wo: 'without',
  db: 'dumbbell', bb: 'barbell', kb: 'kettlebell',
  sa: 'single arm', sl: 'single leg', '1': 'single', one: 'single',
  facepull: 'face pull', pushup: 'push up', pullup: 'pull up',
  chinup: 'chin up', situp: 'sit up', stepup: 'step up',
  ohp: 'overhead press', oh: 'overhead',
  inclined: 'incline', declined: 'decline',
  cophenhagen: 'copenhagen', // library spelling
  banded: 'band', resisted: 'band', // "banded" / "band-resisted" describe the same loading
  med: 'medicine', flye: 'fly', flyes: 'fly',
};
// Plural stem: raises→raise, rows→row… but press/abs stay (short or -ss words).
const stem = (t) => (t.length > 3 && t.endsWith('s') && !t.endsWith('ss') ? t.slice(0, -1) : t);
export const canonTokens = (s) => {
  const out = new Set();
  for (const t of normTitle(s).split(' ')) {
    if (!t) continue;
    for (const piece of String(SYN[t] || t).split(' ')) out.add(stem(piece));
  }
  return out;
};

function libIndex(library) {
  const byId = new Set();
  const byNorm = new Map();
  for (const ex of library || []) {
    if (ex && ex.id) byId.add(ex.id);
    const n = normTitle(ex && (ex.title || ex.t));
    if (n && !byNorm.has(n)) byNorm.set(n, ex);
  }
  return { byId, byNorm };
}

const dayEx = (d) => (Array.isArray(d.exercises) ? d.exercises : (Array.isArray(d.ex) ? d.ex : []));
const dayName = (d, di) => d.name || d.n || `Day ${di + 1}`;

// Scan every plan for unresolved exercise references.
// Returns [{ planId, planName, traineeId, di, ei, dayName, title, libId, reason }].
export function scanUnmatched(plans, library) {
  const { byId, byNorm } = libIndex(library);
  const out = [];
  for (const p of plans || []) {
    const days = (p.data && p.data.days) || p.days || [];
    days.forEach((d, di) => {
      dayEx(d).forEach((ex, ei) => {
        const libId = ex.exerciseId || ex.eid || '';
        const title = (ex.title || ex.t || '').trim();
        const note = (ex.notes || ex.n || '').trim();
        let reason = null;
        if (libId === CORRUPT_ID) reason = 'corrupt-superset-id';
        else if (MISSING_RX.test(title) || MISSING_RX.test(note)) reason = 'missing-title';
        else {
          const idOk = libId && byId.has(libId);
          const titleOk = title && byNorm.has(normTitle(title));
          if (!idOk && !titleOk && (libId || title)) reason = 'unresolved';
        }
        if (reason) out.push({ planId: p.id, planName: p.name, traineeId: p.trainee_id, di, ei, dayName: dayName(d, di), title, libId, reason });
      });
    });
  }
  return out;
}

// Group unmatched rows by normalized title so the coach resolves each unique
// name once. Returns [{ key, title, count, rows }] sorted by frequency.
export function groupUnmatched(rows) {
  const map = new Map();
  for (const r of rows) {
    const key = normTitle(r.title) || `∅:${r.reason}`;
    if (!map.has(key)) map.set(key, { key, title: r.title || '(blank)', reason: r.reason, count: 0, rows: [] });
    const g = map.get(key); g.count++; g.rows.push(r);
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

// Human-readable difference between the plan title and a suggestion, in
// canonical words: "sitting↔standing" (swap), "+jefferson" (suggestion adds),
// "−overhead" (suggestion lacks). This is what lets the coach judge a match
// without diffing two long names by eye.
function diffLabel(planOnly, libOnly) {
  const parts = [];
  if (planOnly.length === 1 && libOnly.length === 1) parts.push(`${planOnly[0]}↔${libOnly[0]}`);
  else {
    for (const w of libOnly) parts.push(`+${w}`);
    for (const w of planOnly) parts.push(`−${w}`);
  }
  const s = parts.join(' ');
  return s.length > 26 ? s.slice(0, 25) + '…' : s;
}

// Rank library suggestions for a title: exact → same words → same after
// abbreviations/synonyms (canonical) → near-miss (1–2 canonical-word diff) →
// jaccard-similar. Returns [{ ex, score, why }].
export function suggestMatches(title, library, limit = 5) {
  const n = normTitle(title);
  if (!n) return [];
  const ts = tokenSet(title);
  const cs = canonTokens(title);
  const scored = [];
  for (const ex of library || []) {
    const en = normTitle(ex.title || ex.t);
    if (!en) continue;
    if (en === n) { scored.push({ ex, score: 100, why: 'exact match' }); continue; }
    const es = tokenSet(ex.title || ex.t);
    let rawInter = 0; ts.forEach((x) => { if (es.has(x)) rawInter++; });
    if (rawInter === ts.size && rawInter === es.size) { scored.push({ ex, score: 98, why: 'same words' }); continue; }
    const ces = canonTokens(ex.title || ex.t);
    let inter = 0; cs.forEach((x) => { if (ces.has(x)) inter++; });
    if (inter === cs.size && inter === ces.size) { scored.push({ ex, score: 96, why: 'same meaning' }); continue; }
    const union = new Set([...cs, ...ces]).size;
    const jac = union ? inter / union : 0;
    const diff = (cs.size - inter) + (ces.size - inter);
    if (diff <= 2 && inter >= Math.max(1, cs.size - 1)) {
      const planOnly = [...cs].filter((x) => !ces.has(x));
      const libOnly = [...ces].filter((x) => !cs.has(x));
      scored.push({ ex, score: 92 - diff * 8, why: diffLabel(planOnly, libOnly) });
    } else if (jac >= 0.5) scored.push({ ex, score: Math.round(40 + jac * 40), why: 'similar' });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}

export const confidenceLabel = (score) => (score >= 96 ? 'high' : score >= 80 ? 'likely' : 'low');

// Apply a confirmed match: return a NEW plans array with the chosen library
// exercise linked (exerciseId + refreshed title/videoLink/cues) on every row
// whose normalized title matches `titleKey`. Pure — caller persists the result.
export function applyMatch(plans, titleKey, ex) {
  return (plans || []).map((p) => {
    const days = (p.data && p.data.days) || p.days || [];
    let touched = false;
    const newDays = days.map((d) => {
      const list = dayEx(d);
      const key = Array.isArray(d.exercises) ? 'exercises' : (Array.isArray(d.ex) ? 'ex' : null);
      if (!key) return d;
      const newList = list.map((e) => {
        const t = (e.title || e.t || '').trim();
        if (normTitle(t) !== titleKey) return e;
        touched = true;
        return { ...e, exerciseId: ex.id, title: ex.title || ex.t || t, videoLink: ex.videoLink || e.videoLink, cues: ex.cues || e.cues };
      });
      return { ...d, [key]: newList };
    });
    if (!touched) return p;
    return { ...p, data: { ...(p.data || {}), days: newDays } };
  });
}
