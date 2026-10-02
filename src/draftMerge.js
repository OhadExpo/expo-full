// A RESUMED WORKOUT DRAFT FOLLOWS ITS EXERCISES, NOT ITS POSITIONS (2.10 #510-B3).
//
// The logger's draft records the day's exercise ids (exOrder). When the coach
// reshaped the day while a session was open - one set added, one exercise
// swapped - the resume threw the WHOLE draft away (every logged set, silently)
// and the 200ms autosave then overwrote it. These are the pure pieces of the
// fix; ClientPortal's StepLogger uses them and scripts/verify-draft-merge.mjs
// holds them.

// Each current exercise takes the previous list's entry for the same id - the
// k-th occurrence for an exercise listed twice. One the draft never had is
// undefined.
export function alignByEid(prevOrder, prevList, curEids) {
  const pool = new Map();
  (prevOrder || []).forEach((eid, i) => { const k = String(eid); if (!pool.has(k)) pool.set(k, []); pool.get(k).push(prevList ? prevList[i] : undefined); });
  return (curEids || []).map((eid) => { const q = pool.get(String(eid)); return q && q.length ? q.shift() : undefined; });
}

// a row the athlete actually touched (a prefilled, untouched top set is not)
export const setRowUsed = (r) => !!r && !r.prefill && (!!r.done || String(r.reps ?? '') !== '' || String(r.load ?? '') !== '' || String(r.rpe ?? '') !== '');

// One exercise's draft rows at the day's new set count: padded with blank rows,
// never cut below a row he already used. null when the draft had no rows.
export function fitRows(rows, count) {
  if (!Array.isArray(rows)) return null;
  let keep = count;
  for (let k = rows.length - 1; k >= count; k--) if (setRowUsed(rows[k])) { keep = k + 1; break; }
  return Array.from({ length: keep }, (_, si) => (rows[si] ? { ...rows[si] } : { reps: '', load: '', rpe: '', done: false }));
}
