// videoGaps.js - the library's VIDEO GAPS, ranked by who actually misses them,
// with only SAFE candidates, and the exact program rows an approved video reaches
// (5.10 #559, Ohad: "18 but make it genius"). Pure + framework-free (node-tested
// by scripts/verify-video-gaps.mjs).
//
// Why propagation matters: an athlete can not read the exercise library, so a
// program row shows a video only if the video is ON THE ROW. A row's video key has
// three states (ClientPortal trainerPlanToPortal, planCopy): ABSENT = inherit (the
// athlete gets nothing), '' = the coach chose NO video, a URL = an override. An
// approved library video therefore goes to the ABSENT rows only - never over a ''
// (his decision) and never over an override (his choice).
//
// Candidates obey "blank > wrong": never assigned automatically, never borrowed
// from a related variant. Only (1) an EXACT twin in the library (same meaning
// after the canonical-token pass, no parenthesised modifier, >= 2 tokens) that
// has a video, and (2) a video the coach himself already put on a program row of
// this exercise (by id, or by its exact title).
import { normTitle, canonTokens } from './exerciseMatch.js';

const dayRows = (d) => {
  // the athlete portal's hybrid-day rule: an EMPTY d.exercises never shadows a filled d.ex
  const a = Array.isArray(d && d.exercises) ? d.exercises : null;
  const b = Array.isArray(d && d.ex) ? d.ex : null;
  if (a && a.length) return { list: a, shape: 'exercises' };
  if (b && b.length) return { list: b, shape: 'ex' };
  return { list: a || b || [], shape: a ? 'exercises' : 'ex' };
};
const rowId = (r) => (r && (r.exerciseId || r.eid)) || '';
const rowTitle = (r) => (r && (r.title || r.t || r.name)) || '';
// the row's video key: trainer rows carry videoUrl, compact + warm-up rows carry vid
const videoKeyOf = (r, shape) => (shape === 'exercises' && !('vid' in (r || {})) ? 'videoUrl' : (('videoUrl' in (r || {})) ? 'videoUrl' : 'vid'));
const videoState = (r, key) => (!(key in (r || {})) || r[key] == null ? 'absent' : r[key] === '' ? 'blank' : 'override');

// Every exercise row of every plan (both day shapes + the warm-up), with where it lives.
export function collectPlanRows(plans) {
  const out = [];
  for (const p of plans || []) {
    const data = (p && p.data) || {};
    const days = Array.isArray(data.days) ? data.days : [];
    days.forEach((d, di) => {
      const { list, shape } = dayRows(d);
      list.forEach((r, ri) => {
        if (!r) return;
        const key = videoKeyOf(r, shape);
        out.push({ planId: p.id, traineeId: p.trainee_id || '', active: p.active !== false, where: 'day', di, ri, shape, exerciseId: rowId(r), title: rowTitle(r), key, state: videoState(r, key), url: r[key] || '' });
      });
    });
    const wu = Array.isArray(data.warmup) ? data.warmup : [];
    wu.forEach((r, ri) => {
      if (!r) return;
      const key = 'videoUrl' in r ? 'videoUrl' : 'vid';
      out.push({ planId: p.id, traineeId: p.trainee_id || '', active: p.active !== false, where: 'warmup', di: -1, ri, shape: 'warmup', exerciseId: rowId(r), title: rowTitle(r), key, state: videoState(r, key), url: r[key] || '' });
    });
  }
  return out;
}

const hasModifier = (t) => /\(.+\)/.test(String(t || ''));
const canonKey = (t) => [...canonTokens(t)].sort().join(' ');

// Library exercises with no video, ranked by the athletes who would actually see one.
// recentTitles: titles logged in the last 30 days (a Set of normTitle) - a live signal.
export function rankGaps(library, plans, recentTitles = new Set()) {
  const rows = collectPlanRows(plans);
  const byNorm = new Map();
  for (const ex of library || []) if (ex && ex.id) byNorm.set(normTitle(ex.title), ex.id);
  const stat = new Map();
  for (const r of rows) {
    const id = r.exerciseId || byNorm.get(normTitle(r.title)) || '';
    if (!id) continue;
    const s = stat.get(id) || { rows: 0, missingRows: 0, athletes: new Set(), activeAthletes: new Set() };
    s.rows++;
    if (r.state === 'absent') { s.missingRows++; if (r.traineeId) { s.athletes.add(r.traineeId); if (r.active) s.activeAthletes.add(r.traineeId); } }
    stat.set(id, s);
  }
  const gaps = [];
  for (const ex of library || []) {
    if (!ex || !ex.id || (ex.videoLink && String(ex.videoLink).trim())) continue;
    const s = stat.get(ex.id) || { rows: 0, missingRows: 0, athletes: new Set(), activeAthletes: new Set() };
    const recent = recentTitles.has(normTitle(ex.title));
    // who would SEE the fix first: athletes on active programs, then any row, then logged lately
    const score = s.activeAthletes.size * 100 + s.athletes.size * 10 + s.missingRows + (recent ? 50 : 0);
    gaps.push({ id: ex.id, title: ex.title || '', activeAthletes: s.activeAthletes.size, athletes: s.athletes.size, rows: s.rows, missingRows: s.missingRows, recent, score });
  }
  return gaps.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
}

// SAFE candidates for one gap. Never automatic: each carries its source and why.
export function candidatesFor(gap, library, plans) {
  const out = [];
  const seen = new Set();
  const add = (url, source, why) => { const u = String(url || '').trim(); if (!u || seen.has(u)) return; seen.add(u); out.push({ url: u, source, why }); };
  // 1. the coach's own choice already on a program row of THIS exercise
  const myNorm = normTitle(gap.title);
  for (const r of collectPlanRows(plans)) {
    if (r.state !== 'override') continue;
    if ((r.exerciseId && r.exerciseId === gap.id) || (!r.exerciseId && normTitle(r.title) === myNorm)) add(r.url, 'your-program', 'You already used this video for this exercise in a program');
  }
  // 2. an EXACT twin in the library with a video (same meaning, no modifier, >= 2 tokens)
  const key = canonKey(gap.title);
  if (key && key.split(' ').length >= 2 && !hasModifier(gap.title)) {
    for (const ex of library || []) {
      if (!ex || ex.id === gap.id || !ex.videoLink || hasModifier(ex.title)) continue;
      if (canonKey(ex.title) === key) add(ex.videoLink, 'library-twin', `Same exercise in your library: "${ex.title}"`);
    }
  }
  return out;
}

// The rows an approved video goes to: ABSENT only, by id (or exact title when the row has no id).
export function propagationFor(exId, exTitle, plans) {
  const n = normTitle(exTitle);
  const rows = collectPlanRows(plans).filter((r) => r.state === 'absent' && ((r.exerciseId && r.exerciseId === exId) || (!r.exerciseId && normTitle(r.title) === n)));
  const athletes = new Set(rows.map((r) => r.traineeId).filter(Boolean));
  return { rows, plans: [...new Set(rows.map((r) => r.planId))], athletes: athletes.size };
}

// Apply an approved video to ONE plan's data (a copy). Touches absent rows only.
export function applyVideoToPlanData(data, exId, exTitle, url) {
  const d = JSON.parse(JSON.stringify(data || {}));
  const n = normTitle(exTitle);
  const fits = (r) => r && ((rowId(r) && rowId(r) === exId) || (!rowId(r) && normTitle(rowTitle(r)) === n));
  let changed = 0;
  for (const day of Array.isArray(d.days) ? d.days : []) {
    const { list, shape } = dayRows(day);
    for (const r of list) {
      if (!fits(r)) continue;
      const key = videoKeyOf(r, shape);
      if (videoState(r, key) !== 'absent') continue;
      r[key] = url; changed++;
    }
  }
  for (const r of Array.isArray(d.warmup) ? d.warmup : []) {
    if (!fits(r)) continue;
    const key = 'videoUrl' in r ? 'videoUrl' : 'vid';
    if (videoState(r, key) !== 'absent') continue;
    r[key] = url; changed++;
  }
  return { data: d, changed };
}
