// videoGapsApply.js - the pure half of the Videos screen (5.10 #559): what an
// APPROVE will change (the dry run), the library setter it uses, the link it
// accepts, the dead-link list and the undo verdict. Framework-free so
// scripts/verify-video-gaps-apply.mjs tests the exact functions the screen runs.
//
// Why a separate file from videoGaps.js: that one decides WHAT is missing and
// what is a safe candidate; this one decides HOW a click is allowed to write.
// The two failure modes it exists for are both real history here:
//   - a whole-array library write while the library was still loading wiped
//     1,326 exercises (27.8) - so the setter is a by-id map that returns the SAME
//     array when it has nothing to do, and never writes into an empty library;
//   - a second editor's save landing between our read and our write (the plans
//     table is compare-and-swap since 2.10) - so undo restores a program only if
//     it is still exactly the version we wrote.
import { collectPlanRows } from './videoGaps.js';
import { normTitle } from './exerciseMatch.js';
import { blockNum, sortProgramsChrono } from './traineeUtils.js';

// WHICH PROGRAMS AN ATHLETE SEES TODAY. plans.active is true on every one of
// the 250 rows (measured 5.10), so "on an active program" counted every block
// ever written. The athlete portal's default rule (ClientPortal visPlans) is:
// the LATEST numbered block per athlete (sortProgramsChrono) + every program with
// no block number (routines, comebacks). This marks exactly those `active`, so
// videoGaps.rankGaps ranks by the athletes who would actually see the video.
// The coach's per-program portal toggles (portalVis) are not applied here.
export function markCurrent(plans) {
  const byTrainee = new Map();
  for (const p of plans || []) {
    if (!p) continue;
    const k = p.trainee_id || '';
    if (!byTrainee.has(k)) byTrainee.set(k, []);
    byTrainee.get(k).push(p);
  }
  const latest = new Set();
  for (const list of byTrainee.values()) {
    const sorted = list.map((p) => ({ name: p.name, createdAt: p.created_at, p })).sort(sortProgramsChrono);
    const top = sorted.find((x) => blockNum(x.name) !== -Infinity);
    if (top) latest.add(top.p.id);
  }
  return (plans || []).map((p) => (p ? { ...p, active: blockNum(p.name) === -Infinity || latest.has(p.id) } : p));
}

// The keys savePlan round-trips in plans.data. A program carrying anything else
// would lose it on a save from here, so it is refused instead (measured 5.10 on
// prod: 250 plans, these four keys only - the guard is for tomorrow's key).
export const PLAN_DATA_KEYS = ['days', 'warmup', 'weeks', 'isTemplatePurchase', 'kind'];
export const unknownDataKeys = (data) => Object.keys(data || {}).filter((k) => !PLAN_DATA_KEYS.includes(k));

// A pasted link. YouTube and Vimeo must name a video; any other https link is
// accepted as-is (a storage clip, a coach's own host). http, javascript: and
// anything with whitespace are refused - blank > wrong.
export function checkLink(raw) {
  const s = String(raw == null ? '' : raw).trim();
  if (!s) return { ok: false, why: 'empty' };
  if (/\s/.test(s)) return { ok: false, why: 'spaces' };
  let u;
  try { u = new URL(s); } catch { return { ok: false, why: 'not-a-link' }; }
  if (u.protocol !== 'https:') return { ok: false, why: 'not-https' };
  if (!u.hostname || !u.hostname.includes('.')) return { ok: false, why: 'not-a-link' };
  const host = u.hostname.toLowerCase().replace(/^www\.|^m\./, '');
  if (host === 'youtube.com' || host === 'youtu.be' || host.endsWith('.youtube.com')) {
    const m = s.match(/(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/i);
    return m ? { ok: true, kind: 'youtube', id: m[1], url: s } : { ok: false, why: 'youtube-no-id' };
  }
  if (host === 'vimeo.com' || host.endsWith('.vimeo.com')) {
    const m = s.match(/vimeo\.com\/(?:video\/)?(\d{6,12})/i);
    return m ? { ok: true, kind: 'vimeo', id: m[1], url: s } : { ok: false, why: 'vimeo-no-id' };
  }
  return { ok: true, kind: 'https', url: s };
}

// Athletes who miss at least one video: an ACTIVE program row with no video key
// whose exercise has no library video either. The header's "M athletes" number.
export function missingAthletes(library, plans) {
  const byNorm = new Map();
  const noVideo = new Set();
  for (const ex of library || []) {
    if (!ex || !ex.id) continue;
    byNorm.set(normTitle(ex.title), ex.id);
    if (!(ex.videoLink && String(ex.videoLink).trim())) noVideo.add(ex.id);
  }
  const out = new Set();
  for (const r of collectPlanRows(plans)) {
    if (r.state !== 'absent' || !r.active || !r.traineeId) continue;
    const id = r.exerciseId || byNorm.get(normTitle(r.title)) || '';
    if (id && noVideo.has(id)) out.add(r.traineeId);
  }
  return out;
}

const fitsExercise = (r, exId, n) => (r.exerciseId && r.exerciseId === exId) || (!r.exerciseId && normTitle(r.title) === n);

// THE DRY RUN: exactly what one approve writes. Same row rule as videoGaps'
// propagationFor/applyVideoToPlanData (absent rows only, by id, or by exact
// title when the row has no id), grouped per program for the panel.
export function dryRun({ exId, exTitle, from = '', url }, plans, trainees = []) {
  const n = normTitle(exTitle);
  const names = new Map((trainees || []).map((t) => [t && t.id, (t && (t.name || t.nameLocal)) || '']));
  const byPlan = new Map((plans || []).map((p) => [p.id, p]));
  const groups = new Map();
  let leftAlone = 0;
  for (const r of collectPlanRows(plans)) {
    if (!fitsExercise(r, exId, n)) continue;
    if (r.state !== 'absent') { leftAlone++; continue; }
    const p = byPlan.get(r.planId) || {};
    const g = groups.get(r.planId) || { planId: r.planId, traineeId: r.traineeId, athlete: names.get(r.traineeId) || '', block: p.name || '', active: r.active, places: [], rows: 0 };
    const day = r.where === 'warmup' ? null : ((p.data && Array.isArray(p.data.days) && p.data.days[r.di]) || {});
    g.places.push(r.where === 'warmup' ? { where: 'warmup' } : { where: 'day', di: r.di, dayName: (day && (day.name || day.n)) || '' });
    g.rows++;
    groups.set(r.planId, g);
  }
  const list = [...groups.values()].sort((a, b) => (b.active - a.active) || a.athlete.localeCompare(b.athlete) || a.block.localeCompare(b.block));
  return {
    library: { id: exId, title: exTitle, from: String(from || ''), to: url },
    plans: list,
    rowCount: list.reduce((a, g) => a + g.rows, 0),
    athleteCount: new Set(list.map((g) => g.traineeId).filter(Boolean)).size,
    leftAlone,
  };
}

// The functional library setter. Writes ONE exercise's videoLink by id, and only
// if that exercise still holds the value the coach saw (expectedFrom: '' for a
// gap, the dead link for a replacement). Nothing to do = the SAME array back, so
// useSupaStore's same-reference rule turns it into no network write at all.
export function setLibraryVideo(prev, exId, expectedFrom, url) {
  if (!Array.isArray(prev) || prev.length === 0) return prev;
  const want = String(expectedFrom || '').trim();
  let hit = false;
  const next = prev.map((e) => {
    if (!e || e.id !== exId) return e;
    if (String(e.videoLink || '').trim() !== want) return e;
    hit = true;
    return { ...e, videoLink: url };
  });
  return hit ? next : prev;
}

// Undo a program only if nobody saved it after us.
export function undoVerdict(writtenAt, currentRow) {
  if (!currentRow) return 'gone';
  if (!writtenAt || currentRow.updated_at !== writtenAt) return 'changed';
  return 'ok';
}

export const chunk = (arr, n) => { const out = []; for (let i = 0; i < (arr || []).length; i += n) out.push(arr.slice(i, i + n)); return out; };

// The library links the health check can judge (YouTube / Vimeo), deduplicated.
export function linksToCheck(library) {
  const out = new Set();
  for (const ex of library || []) {
    const c = ex && ex.videoLink ? checkLink(ex.videoLink) : null;
    if (c && c.ok && (c.kind === 'youtube' || c.kind === 'vimeo')) out.add(String(ex.videoLink).trim());
  }
  return [...out];
}

// The library rows whose link came back dead or blocked from embedding - dead
// first. 'unknown' (the check itself failed) is never reported as dead.
export function deadRows(library, results) {
  const st = new Map((results || []).map((r) => [String(r.url || '').trim(), r.state]));
  const out = [];
  for (const ex of library || []) {
    if (!ex || !ex.id || !ex.videoLink) continue;
    const s = st.get(String(ex.videoLink).trim());
    if (s === 'dead' || s === 'no-embed') out.push({ id: ex.id, title: ex.title || '', url: String(ex.videoLink).trim(), state: s });
  }
  return out.sort((a, b) => (a.state === b.state ? a.title.localeCompare(b.title) : a.state === 'dead' ? -1 : 1));
}
