// ATHLETE CONTEXT (16.10 #826, Ohad: "a full analysis ... using everything we have + notes/weekly focus/comments").
// Everything said around one block, week by week:
//   - his session notes (client_workouts.notes) and check-ins (autoregulation: pain / sleep / energy),
//   - his note on an exercise (form_videos[i].note),
//   - the coach's weekly focus (weekly_focus: `${clientId}|${plan}|${day}|${eid}|W${n}`, written in week n for week n+1),
//   - the coach's video comments (form_videos[i].reviewNotes, author 'trainer'),
// and the one cross-read worth a line: a session where he reported pain and a lift came in under its last top set.
// Pure. It reads only what the athlete can read too (his own client_workouts and weekly_focus rows), so the same result
// feeds the coach's analysis and the athlete's own progress page - never coach-only notes.

import { EX } from './exerciseData';   // the portal mints a focus eid from this static list's keys (e1, e10 ...) and fills it with every dyn_ eid it creates

const PAIN = { high: 3, moderate: 2, mild: 1, none: 0 };
const BAD_SLEEP = new Set(['poor']);
const LOW_ENERGY = new Set(['low']);
const norm = (s) => String(s || '').trim().toLowerCase();
const ms = (d) => { const t = Date.parse(d); return isFinite(t) ? t : 0; };
const num = (x) => { const n = parseFloat(x); return isFinite(n) ? n : null; };
const e1 = (load, reps) => (load > 0 && reps >= 1 && reps <= 12 ? load * (1 + reps / 30) : null);

// the coach's weekly focus for one plan: [{ forWeek, day, eid, text }] - only keys scoped to this athlete (an unscoped
// legacy key can belong to anyone with a block of the same name)
export function parseFocus(focus, clientId, planName) {
  const pid = String(clientId || '').replace(/__\d+$/, '');
  const out = [];
  for (const [k, v] of Object.entries(focus || {})) {
    const text = String(v == null ? '' : v).trim();
    if (!text) continue;
    const parts = String(k).split('|');
    if (parts.length !== 5 || parts[0] !== pid || parts[1] !== planName) continue;
    const m = /^W(\d+)$/.exec(parts[4]);
    if (!m) continue;
    out.push({ forWeek: Number(m[1]) + 1, day: parts[2], eid: parts[3], text });
  }
  return out;
}

// the exercise's name in the plan for a focus key's (day, eid)
const slug = (t) => String(t || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');   // the portal's own dyn_ slug
function exTitleIn(plan, day, eidRaw, exMap) {
  const eid = String(eidRaw || '').replace(/#\d+$/, '');
  const d = (plan.days || []).find((x) => norm(x.name) === norm(day));
  const list = d ? (d.exercises || d.ex || []) : [];
  const hit = list.find((x) => [x.exerciseId, x.eid, x.id, x.id != null ? 'dyn_' + x.id : null, x.exerciseId ? 'dyn_' + x.exerciseId : null, x.title ? 'dyn_' + slug(x.title) : null].some((v) => v != null && v !== '' && String(v) === eid));   // a focus key carries the portal's eid: the library id, else dyn_<row id>
  const lib = exMap && exMap.get ? exMap.get(eid) : null;
  const st = EX && EX[eid] && EX[eid].t && !/^Exercise \d+$/.test(EX[eid].t) ? EX[eid].t : null;
  return (hit && (hit.title || (lib && lib.title))) || (lib && lib.title) || st || null;
}

// upToWeek: the athlete page shows a week's focus only once he is in that week (the portal's 26.6 rule)
export function blockContext({ workouts, clientId, plan, sameBlock, focus, exMap = null, upToWeek = null }) {
  if (!plan) return null;
  const cid = String(clientId || '').replace(/__\d+$/, '');
  const mineAll = (workouts || []).filter((w) => w && String(w.clientId || '').replace(/__\d+$/, '') === cid).sort((a, b) => ms(a.date) - ms(b.date));
  const inBlock = mineAll.filter((w) => sameBlock(w, plan));
  // each lift's top set by date, across every block - 'under its last top set' compares with the session before
  const lastTop = new Map();
  const sessions = [];
  const painDays = [];
  for (const w of mineAll) {
    const isIn = inBlock.includes(w);
    const ar = w.autoregulation || {};
    const pain = PAIN[ar.pain] ?? null;
    const under = [];
    const exNotes = [], comments = [];
    (w.exercises || []).forEach((ex, i) => {
      if (!ex) return;
      // a swapped exercise is the lift he actually did
      const title = String((ex.substitution && ex.substitution.to) || ex.title || '').trim();
      let top = null;
      for (const s of ex.sets || []) {
        if (!s || s.done === false) continue;
        const L = num(s.load), R = num(s.reps);
        const v = e1(L, R);
        if (v != null && (!top || v > top)) top = v;
      }
      const key = norm(title);
      if (top != null) {
        const prev = lastTop.get(key);
        if (prev != null && top < prev * 0.97) under.push(title);
        lastTop.set(key, top);
      }
      if (!isIn) return;
      const fv = (w.form_videos || w.formVideos || [])[i] || null;
      if (fv && fv.note && String(fv.note).trim()) exNotes.push({ title, text: String(fv.note).trim() });
      for (const c of (fv && fv.reviewNotes) || []) {
        if (c && c.author === 'trainer' && String(c.text || '').trim()) comments.push({ title, ts: num(c.ts), text: String(c.text).trim() });
      }
    });
    if (!isIn) continue;
    const flags = [];
    if (pain != null && pain >= 2) flags.push(['pain', ar.pain]);
    if (BAD_SLEEP.has(ar.sleep)) flags.push(['sleep', ar.sleep]);
    if (LOW_ENERGY.has(ar.energy)) flags.push(['energy', ar.energy]);
    const sess = {
      id: w.id, date: w.date, week: Number(w.week) > 0 ? Number(w.week) : null, day: w.dayName || '',
      note: String(w.notes || '').trim(), checkin: ar.pain || ar.sleep || ar.energy ? { pain: ar.pain || null, sleep: ar.sleep || null, energy: ar.energy || null } : null,
      flags, exNotes, comments,
    };
    sessions.push(sess);
    if (pain != null && pain >= 2) painDays.push({ date: w.date, day: sess.day, week: sess.week, pain: ar.pain, under });
  }
  const dayIdx = (day) => { const i = (plan.days || []).findIndex((x) => norm(x.name) === norm(day)); return i < 0 ? 999 : i; };
  const fx = parseFocus(focus, clientId, plan.name).filter((f) => upToWeek == null || f.forWeek <= upToWeek).map((f) => ({ ...f, title: exTitleIn(plan, f.day, f.eid, exMap), dayIdx: dayIdx(f.day) }));
  const weekOf = (s) => s.week;
  const weeks = new Map();
  const slot = (k) => { if (!weeks.has(k)) weeks.set(k, { week: k, focus: [], sessions: [] }); return weeks.get(k); };
  for (const f of fx) slot(f.forWeek).focus.push(f);
  for (const s of sessions) slot(weekOf(s)).sessions.push(s);
  const list = [...weeks.values()].sort((a, b) => (a.week == null) - (b.week == null) || (a.week || 0) - (b.week || 0));
  const counts = {
    notes: sessions.filter((s) => s.note).length,
    exNotes: sessions.reduce((n, s) => n + s.exNotes.length, 0),
    checkins: sessions.filter((s) => s.checkin).length,
    pain: painDays.length,
    focus: fx.length,
    comments: sessions.reduce((n, s) => n + s.comments.length, 0),
  };
  // 'any' = something the card will show (an all-fine check-in shows nothing)
  const any = counts.notes + counts.exNotes + counts.focus + counts.comments + sessions.filter((s) => s.flags.length).length > 0;
  return { weeks: list, painDays, counts, any, sessions: sessions.length };
}
