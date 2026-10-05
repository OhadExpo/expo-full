// setAnalysis.js - the athlete's own read of a set, stored on the form-video
// slot as `analysis` (5.10 #552: "athlete records a set -> reps/tempo/ROM
// back; coach sees the trend"). Pure: no React, no DOM, no MediaPipe - the
// numbers come from poseLab.analyzeClip and this file only decides which of
// them are trustworthy enough to show and to save.
//
// BLANK > WRONG. A 'poor' capture, a clip with no counted reps, or a movement
// the counter has no channel for keeps reps / tempoS / romDeg null and says
// WHY (reason) - it never reports a number off a body it could not see.
// scripts/verify-set-analysis.mjs proves it, and its BREAK=1 mode swaps in a
// summarizer that reports reps on a poor capture and must fail.

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const round1 = (x) => Math.round(x * 10) / 10;
const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
const round2 = (x) => (isNum(x) ? Math.round(x * 100) / 100 : null);
// coefficient of variation; 0 for fewer than 3 values (too few to call a scatter)
const cv = (arr) => { if (!arr || arr.length < 3) return 0; const m = mean(arr); if (!(m > 0)) return 0; return Math.sqrt(mean(arr.map((x) => (x - m) ** 2))) / m; };

// poseLab's capture grade -> the three words the athlete card and the coach
// line use. 'fair' is a usable but rough read.
const GRADE = { good: 'good', fair: 'ok', poor: 'poor' };

// The read stored on the slot. `opts` carries what the caller knows and the
// analysis does not: the exercise title (from the PLAN ROW - athletes cannot
// read the library), the clip's file name (lets the coach side drop a read
// left behind by a replaced clip) and the model the frames came from.
export function summarize(result, opts = {}) {
  if (!result) return null;
  const at = opts.at || new Date().toISOString();
  const base = {
    v: 1, at, model: opts.model || 'lite',
    title: opts.title || null, fileName: opts.fileName || null,
    reps: null, tempoS: null, romDeg: null,
  };
  if (result.ok === false) return { ...base, quality: 'poor', reason: result.reason === 'too-few-frames' ? 'too-few-frames' : 'unreadable' };
  const cq = result.captureQuality || {};
  const quality = GRADE[cq.grade] || 'poor';
  const frames = isNum(result.frameCount) ? result.frameCount : null;
  if (quality === 'poor') return { ...base, quality, reason: 'capture', coverage: isNum(cq.coverage) ? cq.coverage : null, frames };
  // no angle channel for this title = the counter does not know the movement;
  // that is not the athlete's filming, so it gets its own reason
  if (result.counted === false) return { ...base, quality, reason: 'not-counted', frames };
  const reps = isNum(result.repCount) ? Math.round(result.repCount) : 0;
  if (reps < 1) return { ...base, quality: 'poor', reason: 'no-reps', frames };
  // Tempo + ROM come from the JOINT reps. When the count came from the flight
  // phase (jumps), the joint reps are a different set of events - their mean
  // would describe something else, so both stay blank.
  let tempoS = null, romDeg = null;
  if (result.countMethod !== 'flight') {
    const per = ((result.romTempo && result.romTempo.perRep) || []).filter(Boolean);
    const durs = per.map((r) => (r.ecc || 0) + (r.pause || 0) + (r.con || 0))
      .filter((d) => isNum(d) && d > 0.2 && d < 30);   // a rep under 0.2 s or over 30 s is a segmenting artefact
    const roms = per.map((r) => r.rom).filter((x) => isNum(x) && x > 0 && x <= 180);   // an interior joint angle cannot travel past 180
    // THE REPS MUST LOOK LIKE ONE SET (5.10 #552): poseLab's grade says the body
    // was TRACKED, not that every counted "rep" was a rep. A 96 s clip with plate
    // loading and people walking through read "28 reps, good". A real set's reps
    // are alike: when their durations or ranges scatter (coefficient of variation
    // over 0.5 / 0.45, measured with 4+ reps) the count is not trusted - no
    // number, and the athlete is told to film only the set.
    if (reps >= 4 && (cv(durs) > 0.5 || cv(roms) > 0.45)) return { ...base, quality: 'poor', reason: 'inconsistent', frames, spread: { dur: round2(cv(durs)), rom: round2(cv(roms)) } };
    if (durs.length) tempoS = round1(mean(durs));
    if (roms.length) romDeg = Math.round(mean(roms));
  }
  return { ...base, quality, reps, tempoS, romDeg, frames };
}

// A read worth putting a number on (and worth trending).
export function isUsable(a) {
  return !!(a && a.quality !== 'poor' && isNum(a.reps) && a.reps > 0);
}

// The coach's trend: the athlete's reads of the SAME exercise, oldest first,
// the current one last. Uses the last 2-5 usable reads; deltas are current
// minus the read before it (null when either side is blank). null when there
// is nothing to compare.
export function trend(analyses) {
  const ok = (Array.isArray(analyses) ? analyses : []).filter(isUsable).slice(-5);
  if (ok.length < 2) return null;
  const cur = ok[ok.length - 1], prev = ok[ok.length - 2];
  const d = (k, r) => (isNum(cur[k]) && isNum(prev[k]) ? r(cur[k] - prev[k]) : null);
  const series = (k) => ok.map((a) => (isNum(a[k]) ? a[k] : null));
  return {
    n: ok.length,
    since: prev.at || null,
    reps: d('reps', Math.round),
    tempoS: d('tempoS', round1),
    romDeg: d('romDeg', Math.round),
    romSeries: series('romDeg'),
    tempoSeries: series('tempoS'),
  };
}

// A signed delta for display: +8, -0.3, 0. Never "-0".
export function signed(x) {
  if (!isNum(x)) return '';
  if (x === 0 || Object.is(x, -0)) return '0';
  return (x > 0 ? '+' : '−') + String(Math.abs(x));
}
