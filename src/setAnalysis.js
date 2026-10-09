// setAnalysis.js - the athlete's own read of a set, stored on the form-video
// slot as `analysis` (5.10 #552: "athlete records a set -> reps/tempo/ROM
// back; coach sees the trend"). Pure: no React, no DOM, no MediaPipe - the
// numbers come from poseLab.analyzeClip and this file only decides which of
// them are trustworthy enough to show and to save.
//
// BLANK > WRONG. A 'poor' capture, a clip with no counted reps, or a movement
// the counter has no channel for keeps reps / tempoS / romDeg null and says
// WHY (reason) - it never reports a number off a body it could not see.
// scripts/verify-set-analysis.mjs proves it on built results, and
// scripts/verify-set-count-accuracy.mjs on real, hand-counted set clips (9.10).

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const round1 = (x) => Math.round(x * 10) / 10;
const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
const round2 = (x) => (isNum(x) ? Math.round(x * 100) / 100 : null);
const median = (arr) => { const s = arr.filter(isNum).sort((a, b) => a - b); if (!s.length) return null; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
// coefficient of variation; 0 for fewer than 3 values (too few to call a scatter)
const cv = (arr) => { if (!arr || arr.length < 3) return 0; const m = mean(arr); if (!(m > 0)) return 0; return Math.sqrt(mean(arr.map((x) => (x - m) ** 2))) / m; };

// poseLab's capture grade -> the three words the athlete card and the coach
// line use. 'fair' is a usable but rough read.
const GRADE = { good: 'good', fair: 'ok', poor: 'poor' };

// WHAT A SET LOOKS LIKE (9.10 #552, measured on hand-counted real clips -
// scripts/verify-set-count-accuracy.mjs). analyzeClip counts every dip of the
// joint angle across the WHOLE clip; an athlete's clip is never only the set:
// walking to the bar, the walk-out, the bent-over setup, pulling the bar off the
// floor, the re-rack, setting the bar down, walking back to the phone. On the
// first real clips that motion was most of the error (a 6-rep squat read 11, an
// 8-rep RDL 11, a 3-rep push-up 4). The set itself is the one stretch where the
// reps are ALIKE - about the same depth, at about the same spacing. So:
//   - reps at the EDGES of the clip that are not alike (depth outside 0.6-1.6x
//     the set's median, or a gap to the next rep outside 0.5-1.8x the median
//     gap) are trimmed - that is the setup and the re-rack;
//   - a rep in the MIDDLE that is not alike means the count itself is not
//     trustworthy (a rep was missed, or noise made one) - no number;
//   - fewer than 3 alike reps is not a set we can vouch for - no number;
//   - the joint angle must be clean against the rep's own range: the median
//     per-sample jitter of the angle over the counted reps (poseLab.repJitter:
//     how far each sample sits off the line through its neighbours) times
//     SET_RULES.minSnr must not exceed the median rep range. A jittery angle
//     (the lite model guessing an occluded joint) both invents and swallows
//     reps. Measured 9.10 (median rep range / median jitter, after trimming):
//     the three clips counted right read 68, 37 and 32; the four whose count
//     (or counted reps) were wrong read 11, 12, 12 and 18 - so 25. 14 clips:
//     a measured line, not a law - verify-set-count-accuracy re-measures it.
export const SET_RULES = { romLo: 0.6, romHi: 1.6, gapLo: 0.5, gapHi: 1.8, minReps: 3, minSnr: 25 };

// Travelling sets (walking lunges): the athlete walks away from and back to
// the phone, so half the set is a few pixels tall. 3 of 3 such real clips could
// not be counted even by eye (9.10) - the counter says it can't count them.
const TRAVELLING = /\bwalking\b/i;

// events: [{ t (ms, the rep's bottom), rom (deg, or null) }]. Returns the reps
// that make the set ({ reps, trimmed }) or { reps: null, reason }.
export function isolateSet(events, rules = SET_RULES) {
  if (!Array.isArray(events) || !events.length) return { reps: null, reason: 'no-reps', trimmed: 0 };
  // a rep poseLab could not measure (null) is a hole in the record - its
  // spacing and depth are unknown, so nothing around it can be vouched for
  if (events.some((e) => !e || !isNum(e.t))) return { reps: null, reason: 'inconsistent', trimmed: 0 };
  let reps = [...events].sort((a, b) => a.t - b.t);
  const useRom = reps.every((e) => isNum(e.rom));
  let trimmed = 0;
  while (reps.length >= rules.minReps) {
    const refRom = useRom ? median(reps.map((e) => e.rom)) : null;
    const gaps = reps.slice(1).map((e, i) => e.t - reps[i].t);
    // the reference spacing is the median of ALL gaps: in a short set an
    // interior-only median let a missing rep's double gap set the reference
    // (6 reps with the 4th lost read as 5)
    const refGap = median(gaps);
    const romOut = (e) => useRom && (e.rom < rules.romLo * refRom || e.rom > rules.romHi * refRom);
    const gapOut = (g) => g > rules.gapHi * refGap || g < rules.gapLo * refGap;
    // A rep of normal depth whose gap to its neighbour is about TWO normal gaps
    // is a real rep with one missed in between - not setup. Trimming it read
    // 4 for a set of 6 when the segmenter lost the 2nd rep (9.10 review): a
    // wrong number. No number instead. Walk-ins and re-racks sit far beyond 2.4x.
    // From 4 reps on the table (a set of 5 with its 2nd rep lost read 3). It
    // also blanks real clip c05 (3 push-ups after an alike pick-up at a double
    // gap): from the record alone that is the SAME shape as a lost rep, and a
    // blank beats a number that may be wrong (offline re-score 9.10: 2/14
    // exact, 0 wrong; was 3/14 with a hole the review proved).
    // "Like the others" is tighter than the trim window: a deep pick-up bend
    // (1.5x the set's depth) is setup and still trims; a lost rep's neighbour
    // has the set's own depth.
    const alike = (e) => !useRom || (e.rom >= 0.8 * refRom && e.rom <= 1.25 * refRom);
    const missedNext = (g, e) => reps.length >= 4 && alike(e) && g >= 1.7 * refGap && g <= 2.4 * refGap;
    if (romOut(reps[0]) || gapOut(gaps[0])) {
      if (missedNext(gaps[0], reps[0])) return { reps: null, reason: 'inconsistent', trimmed };
      reps = reps.slice(1); trimmed++; continue;
    }
    if (romOut(reps[reps.length - 1]) || gapOut(gaps[gaps.length - 1])) {
      if (missedNext(gaps[gaps.length - 1], reps[reps.length - 1])) return { reps: null, reason: 'inconsistent', trimmed };
      reps = reps.slice(0, -1); trimmed++; continue;
    }
    if (reps.some(romOut) || gaps.some(gapOut)) return { reps: null, reason: 'inconsistent', trimmed };
    // A short set's median sits between a double gap and a normal one, so a lost
    // rep passes the window (0,2,3 read 3 for a set of 4 - 9.10 review). Up to 4
    // reps, one gap about twice the shortest is a lost rep: no number.
    if (reps.length <= 4) {
      const gMin = Math.min(...gaps);
      if (gMin > 0 && gaps.some((g) => g >= 1.7 * gMin && g <= 2.4 * gMin)) return { reps: null, reason: 'inconsistent', trimmed };
    }
    return { reps, trimmed };
  }
  return { reps: null, reason: trimmed ? 'inconsistent' : 'no-reps', trimmed };
}

// The reps the athlete's number is made of, from an analyzeClip result:
// { reps: [{t, rom, dur, jitter}], trimmed } or { reps: null, reason }.
// Exported so scripts/verify-set-count-accuracy.mjs can check WHICH reps were
// counted, not only how many.
export function readSet(result, rules = SET_RULES) {
  if (!result || result.ok === false) return { reps: null, reason: 'unreadable' };
  if (result.counted === false) return { reps: null, reason: 'not-counted' };
  // JUMPS ARE NOT COUNTED HERE (9.10): every jump bends the knee twice (the
  // dip before take-off and the landing), so the joint channel reads ~2x; the
  // flight channel (ankle height) read 7 for 6 squat-pogo jumps and 14 for 6
  // squat jumps on the first real clips, its "flights" landing on camera
  // handling and walking. No number until a jump count is proven.
  if (result.ballistic || result.countMethod === 'flight') return { reps: null, reason: 'not-counted' };
  const per = (result.romTempo && result.romTempo.perRep) || [];
  const events = per.map((p) => (p && isNum(p.bottomT) ? {
    t: p.bottomT, rom: isNum(p.rom) ? p.rom : null,
    dur: (p.ecc || 0) + (p.pause || 0) + (p.con || 0), jitter: isNum(p.jitter) ? p.jitter : null,
  } : null));
  const iso = isolateSet(events, rules);
  if (!iso.reps) return iso;
  const romMed = median(iso.reps.map((e) => e.rom));
  const jit = median(iso.reps.map((e) => e.jitter));
  if (!isNum(jit) || !isNum(romMed) || jit * rules.minSnr > romMed) return { reps: null, reason: 'capture', trimmed: iso.trimmed, snr: isNum(jit) && jit > 0 && isNum(romMed) ? Math.round(romMed / jit) : null };
  return iso;
}

// The read stored on the slot. `opts` carries what the caller knows and the
// analysis does not: the exercise title (from the PLAN ROW - athletes cannot
// read the library), the clip's file name (lets the coach side drop a read
// left behind by a replaced clip) and the model the frames came from.
export function summarize(result, opts = {}) {
  if (!result) return null;
  const at = opts.at || new Date().toISOString();
  const base = {
    v: 2, at, model: opts.model || 'lite',
    title: opts.title || null, fileName: opts.fileName || null,
    reps: null, tempoS: null, romDeg: null,
  };
  if (result.ok === false) return { ...base, quality: 'poor', reason: result.reason === 'too-few-frames' ? 'too-few-frames' : 'unreadable' };
  const cq = result.captureQuality || {};
  const quality = GRADE[cq.grade] || 'poor';
  const frames = isNum(result.frameCount) ? result.frameCount : null;
  if (quality === 'poor') return { ...base, quality, reason: 'capture', coverage: isNum(cq.coverage) ? cq.coverage : null, frames };
  // no angle channel for this title (or a jump) = the counter does not know
  // the movement; that is not the athlete's filming, so it gets its own reason
  if (result.counted === false || TRAVELLING.test(opts.title || '')) return { ...base, quality, reason: 'not-counted', frames };
  const set = readSet(result);
  if (!set.reps) {
    const reason = set.reason === 'not-counted' ? 'not-counted' : set.reason === 'capture' ? 'capture' : set.reason === 'inconsistent' ? 'inconsistent' : 'no-reps';
    return { ...base, quality: reason === 'not-counted' ? quality : 'poor', reason, frames, ...(isNum(set.snr) ? { snr: set.snr } : null) };
  }
  const reps = set.reps.length;
  // Tempo + ROM come from the counted reps only (the set, not the setup).
  const durs = set.reps.map((e) => e.dur).filter((d) => isNum(d) && d > 0.2 && d < 30);   // a rep under 0.2 s or over 30 s is a segmenting artefact
  const roms = set.reps.map((e) => e.rom).filter((x) => isNum(x) && x > 0 && x <= 180);   // an interior joint angle cannot travel past 180
  // THE REPS MUST LOOK LIKE ONE SET (5.10): when the counted reps' durations
  // or ranges still scatter (coefficient of variation over 0.5 / 0.45, with 4+
  // reps) the count is not trusted.
  if (reps >= 4 && (cv(durs) > 0.5 || cv(roms) > 0.45)) return { ...base, quality: 'poor', reason: 'inconsistent', frames, spread: { dur: round2(cv(durs)), rom: round2(cv(roms)) } };
  const tempoS = durs.length ? round1(mean(durs)) : null;
  const romDeg = roms.length ? Math.round(mean(roms)) : null;
  return { ...base, quality, reps, tempoS, romDeg, frames };
}

// How many frames the athlete's read samples from a clip of `secs` seconds:
// ~12 a second (a rep is never shorter than ~0.7 s, so 8+ samples per rep), at
// least 120, at most 900; 600 when the length is unknown. One function so the
// portal button and scripts/verify-set-count-accuracy.mjs sample the same way.
export function setFrameBudget(secs) {
  return isNum(secs) && secs > 0 ? Math.min(900, Math.max(120, Math.ceil(secs * 12))) : 600;
}
// A read worth putting a number on (and worth trending).
export function isUsable(a) {
  // v2+ only: v1 reads came from the whole-clip counter that was wrong on 14 of
  // 28 real runs (9.10) - they must not feed the coach's trend
  return !!(a && (a.v || 1) >= 2 && a.quality !== 'poor' && isNum(a.reps) && a.reps > 0);
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
