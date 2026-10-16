// A WORKOUT STARTED AND NOT FINISHED (16.10 #815, Ohad: "make sure people save the workout ... show the workout is not
// complete meaning incomplete but started" + "everything needs to be [auto] saved on every single screen").
//
// The logger already keeps its draft in localStorage on every change (StepLogger's sessionKey) and only drops it once
// Complete is safe. That copy lives on ONE phone: a second device, a cleared browser or a reinstall lost it, and nobody
// but that phone knew a workout was half-done. This mirrors the same draft to workout_drafts (one row per started
// workout) so:
//   - the athlete's day card says STARTED with the sets done, on any device, and RESUME restores it;
//   - the coach sees who started a workout and did not finish it;
//   - the daemon can nudge an abandoned one once.
// It is NEVER written into client_workouts: every reader there treats a row as a finished workout.
//
// What keeps it honest (16.10 review):
//   - only a REAL edit made in this session is sent (opening a day, browsing its steps or re-opening a finished log is
//     not), and never while correcting a saved workout;
//   - which copy is newer is the payload's editedAt (the time of the last real edit), never the time it was saved;
//   - saving a workout deletes its draft IN THE DATABASE (trigger on client_workouts), so a workout finished offline or
//     on another device can not leave a 'half-way' row behind; the client's own delete is retried until it lands;
//   - the server stamps updated_at itself, so a device clock hours off can not cause or block a nudge, and by_email
//     (who the nudge goes to) from the signed-in token - a phone can not name another person;
//   - a copy from another device never replaces one on this phone that has more ticked sets, and what it replaces is
//     kept under <id>.replaced.
// Only the athlete's own seat writes (the caller passes demoMode: the demo and a coach's preview never write).
import { useEffect, useState } from 'react';
import { supabase } from './supabase';

export const draftKeyOf = (clientId, planName, dayName, dayIdx, week) => `expo-stepLogger-${clientId}-${planName}-${dayName}-d${dayIdx}-w${week}`;

// sets done / sets prescribed, and whether anything was entered at all (a typed or ticked set, a note, a ticked warm-up)
export function draftProgress(draft) {
  const all = (draft && Array.isArray(draft.allSets)) ? draft.allSets : [];
  let done = 0, total = 0, typed = false;
  for (const rows of all) for (const s of (rows || [])) {
    total++;
    if (s && s.done) done++;
    if (s && !s.prefill && (String(s.reps || '').trim() || String(s.load || '').trim() || String(s.rpe || '').trim())) typed = true;
  }
  const notes = !!(draft && String(draft.notes || '').trim());
  const wu = draft && Array.isArray(draft.wuDone) ? draft.wuDone.some(Boolean) : false;
  return { done, total, started: done > 0 || typed || notes || wu };
}

const DROPS_KEY = 'expo-draft-drops';   // deletes that have not landed yet (offline at the finish): [{ id, at }]
const readDrops = () => { try { const a = JSON.parse(localStorage.getItem(DROPS_KEY) || '[]'); return Array.isArray(a) ? a.filter((x) => x && x.id) : []; } catch { return []; } };
const writeDrops = (a) => { try { if (a.length) localStorage.setItem(DROPS_KEY, JSON.stringify(a.slice(-50))); else localStorage.removeItem(DROPS_KEY); } catch { /* */ } };
// at = when the workout was finished: a draft edited after that (the same daily routine started again on another
// device) is a new workout and stays
async function deleteNow(id, at = null) {
  let q = supabase.from('workout_drafts').delete().eq('id', id);
  if (at) q = q.or(`edited_at.is.null,edited_at.lte."${new Date(at).toISOString()}"`);
  const { error } = await q;
  return !error;
}
// a delete that failed earlier is tried again (on the next draft write, and when the portal opens)
let retrying = false;
export async function retryDrops() {
  if (retrying) return; retrying = true;
  try {
    const left = [];
    for (const d of readDrops()) if (!(await deleteNow(d.id, d.at))) left.push(d);
    writeDrops(left);
  } finally { retrying = false; }
}

const timers = new Map();      // id -> { t, run }
const lastSent = new Map();
const droppedAt = new Map();   // id -> when it was finished (an upsert that was already on its way is undone)

async function send(id, meta, draft) {
  const body = JSON.stringify(draft);
  if (lastSent.get(id) === body) return;
  const prog = draftProgress(draft);
  const t0 = Date.now();
  const { error } = await supabase.from('workout_drafts').upsert({
    id, client_id: meta.clientId, plan_name: meta.planName, day_name: meta.dayName, week: meta.week,
    payload: draft, done_sets: prog.done, total_sets: prog.total,
    edited_at: draft.editedAt ? new Date(draft.editedAt).toISOString() : null,
  }, { onConflict: 'id' });
  if (error) return;
  lastSent.set(id, body);
  // finished while this write was in flight: the finish wins
  const dropped = droppedAt.get(id) || 0;
  if (dropped >= t0) deleteNow(id, dropped);
}

// debounced (2 s after the last change); flushed at once when the app goes to the background
export function pushDraft(id, meta, draft) {
  if (!draftProgress(draft).started) return;
  const prev = timers.get(id);
  if (prev) clearTimeout(prev.t);
  const run = () => { timers.delete(id); send(id, meta, draft); };
  timers.set(id, { t: setTimeout(run, 2000), run });
  if (readDrops().length) retryDrops();
}
const flushAll = () => { for (const { t, run } of [...timers.values()]) { clearTimeout(t); run(); } };
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushAll(); });
  window.addEventListener('pagehide', flushAll);
}

// the workout was finished: the server copy goes with the local one (and is retried if this phone is offline)
export async function dropDraft(id) {
  const p = timers.get(id);
  if (p) { clearTimeout(p.t); timers.delete(id); }
  const at = Date.now();
  lastSent.delete(id); droppedAt.set(id, at);
  let ok = false;
  try { ok = await deleteNow(id, at); } catch { ok = false; }
  if (!ok) writeDrops([...readDrops().filter((x) => x.id !== id), { id, at }]);
}

// the athlete's started workouts (no payload - the card only needs the counts)
export function useServerDrafts(clientId, enabled) {
  const [rows, setRows] = useState({});
  useEffect(() => {
    if (!enabled || !clientId) { setRows({}); return undefined; }
    let cancelled = false;
    const load = async () => {
      await retryDrops();
      const { data, error } = await supabase.from('workout_drafts').select('id,done_sets,total_sets,edited_at').eq('client_id', clientId);
      if (cancelled || error || !Array.isArray(data)) return;
      setRows(Object.fromEntries(data.map((r) => [r.id, r])));
    };
    load();
    // the portal stays open for days: coming back to it reads the list again (another device may have gone on)
    const onVis = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { cancelled = true; document.removeEventListener('visibilitychange', onVis); };
  }, [clientId, enabled]);
  return rows;
}

// this phone's copy, read for the day card (no server round trip)
export function localDraft(id) {
  try { const raw = localStorage.getItem(id); return raw ? JSON.parse(raw) : null; } catch { return null; }
}

// right before the logger opens: the freshest server copy, and if its last real edit is newer than this phone's, it
// replaces this phone's (another device went on with the workout). Never waits more than 1.5 s - a slow gym
// connection opens this phone's copy rather than a blank screen.
export async function seedLocalFromServer(id) {
  try {
    const q = supabase.from('workout_drafts').select('payload').eq('id', id).maybeSingle();
    const res = await Promise.race([q, new Promise((r) => setTimeout(() => r(null), 1500))]);
    const remote = res && !res.error && res.data ? res.data.payload : null;
    if (!remote || !remote.editedAt) return false;
    const local = localDraft(id);
    if (local && Number(local.editedAt || 0) >= Number(remote.editedAt)) return false;
    // more ticked sets here than there: this phone's copy stays (a stale device's late edit must not erase sets)
    if (local && draftProgress(local).done > draftProgress(remote).done) return false;
    if (local) localStorage.setItem(id + '.replaced', JSON.stringify(local));
    localStorage.setItem(id, JSON.stringify(remote));
    return true;
  } catch { return false; }
}
