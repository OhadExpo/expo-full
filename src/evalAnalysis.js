// THE EVALUATION'S ANALYSIS (16.10 #837, Ohad: "after saved, I need an output as an analysis of everything I've found
// wrong or lacking"). Pure: one saved evaluation (+ the one before it, when there is one) -> what needs work, what to
// watch, what is on target, what was not tested. Every reading comes from a value the coach entered against the
// protocol's own goal, the athlete's other side, or a published adult range-of-motion reference - nothing is inferred
// beyond that, and an empty field is 'not tested', never a judgement.
import { EVAL_SCHEMA, romKey } from './evaluationSchema.js';

// ADULT PASSIVE RANGE-OF-MOTION REFERENCE, degrees (American Academy of Orthopaedic Surgeons, 1965; as tabulated in
// Norkin & White, Measurement of Joint Motion). Only the motions with a published single-number reference; the
// scapula, shoulder adduction, knee over-extension and knee rotation have none, so they are recorded, never judged. Age-normative tables differ - this is the
// adult reference, said as such on the screen.
export const ROM_REF = {
  neck_flexion: 45, neck_extension: 45, neck_lateral_flexion: 45, neck_rotation: 60,
  shoulder_flexion: 180, shoulder_extension: 60, shoulder_abduction: 180, shoulder_internal_rotation: 70, shoulder_external_rotation: 90,
  hip_flexion: 120, hip_extension: 30, hip_abduction: 45, hip_adduction: 30, hip_internal_rotation: 45, hip_external_rotation: 45,
  knee_flexion: 135,
  foot_ankle_dorsalflexion: 20, foot_ankle_plantarflexion: 50, foot_ankle_inversion: 35, foot_ankle_eversion: 15,
};

const num = (v) => { if (v == null || v === '') return null; const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : null; };
const isScore = (v) => v === 1 || v === 2 || v === 3;
const filled = (v) => v != null && v !== '' && !(typeof v === 'object' && !Object.values(v).some(filled));
// a goal with a number of seconds ('30 sec E', '15 sec E', '30 sec'): the target per side
const goalSec = (goal) => { const m = /(\d+(?:\.\d+)?)\s*sec/i.exec(String(goal || '')); return m ? parseFloat(m[1]) : null; };
// the measure a sided test is compared on (higher = better for each)
const SIDE_MEASURE = { iso_sl_stand: null, iso_hand_grip: null, iso_sa_pushup: null, sl_jump: null, sl_pogo: 'rsi' };

/**
 * onTarget = a value a rule was checked against and met; recorded = a value with no goal / reference / other side to read it by
 * @returns {{ needsWork: Item[], watch: Item[], onTarget: number, recorded: number, outside: {test:string,label:string,value:any}[], notTested: {section:string, tests:string[]}[], romNotTested: number,
 *   notes: {test:string, label:string, text:string}[], freeNotes: string|null, counts: object }}
 * Item = { key, section, test, label, side?, kind: 'score'|'goal'|'asym'|'rom'|'change', level: 'high'|'mid', reading: object, watch?: string[] }
 */
export function analyzeEvaluation(ev, prev = null) {
  const scores = { ...((ev && ev.scores) || {}) };
  const notesMap = scores.__notes || {};
  delete scores.__notes;
  const rom = (ev && ev.rom) || {};
  const pScores = (prev && prev.scores) || {};
  const needsWork = [], watch = [];
  let onTarget = 0, recorded = 0;
  const outside = [];
  const notTested = [];
  const push = (it) => (it.level === 'high' ? needsWork : watch).push(it);
  for (const s of EVAL_SCHEMA.sections) {
    const missing = [];
    for (const t of s.tests) {
      const v = scores[t.id];
      if (!filled(v)) { missing.push(t.label); continue; }
      let flagged = false, checked = false;
      // MOVEMENTS: a 1 is weak, a 2 moderate; a side scored lower than the other is an asymmetry
      if (s.id === 'movements') {
        const sides = Array.isArray(t.sides) ? t.sides : [null];
        const got = sides.map((sd) => [sd, sd ? (v && typeof v === 'object' ? v[sd] : null) : v]).filter(([, x]) => isScore(x));
        // a side under 3 is the finding; the other side's score rides on it (one line, not a score line + a gap line)
        for (const [sd, x] of got) if (x < 3) { const other = got.find(([o]) => o !== sd); push({ key: `${t.id}:${sd || ''}`, section: s.id, test: t.id, label: t.label, side: sd, kind: 'score', level: x === 1 ? 'high' : 'mid', reading: { score: x, other: other ? other[1] : null }, watch: t.params || [] }); flagged = true; }
        if (!got.length) { outside.push({ test: t.id, label: t.label, value: v }); continue; }
        // a side off the 1-3 scale beside a scored one is listed, never dropped
        const off = sides.filter((sd) => sd && v && typeof v === 'object' && filled(v[sd]) && !isScore(v[sd]));
        if (off.length) outside.push({ test: t.id, label: t.label, value: Object.fromEntries(off.map((sd) => [sd, v[sd]])) });
        if (!flagged) onTarget++;
        continue;
      }
      // A GOAL IN SECONDS (the isometric holds): under it is a miss, under 80% of it needs work
      const g = goalSec(t.goal);
      if (g != null) {
        const sides = Array.isArray(t.sides) ? t.sides : [null];
        for (const sd of sides) {
          const x = num(sd ? (v && typeof v === 'object' ? v[sd] : null) : v);
          if (x == null) continue;
          checked = true;
          if (x < g) { push({ key: `${t.id}:${sd || ''}:goal`, section: s.id, test: t.id, label: t.label, side: sd, kind: 'goal', level: x < g * 0.8 ? 'high' : 'mid', reading: { value: x, goal: g, unit: 'sec', pct: Math.round((x / g) * 100) } }); flagged = true; }
        }
      }
      // A SIDED MEASURED TEST: the weaker side under 90% of the stronger (the limb-symmetry index) is an asymmetry, under 85% needs work
      if (Array.isArray(t.sides) && t.id in SIDE_MEASURE && v && typeof v === 'object') {
        const part = SIDE_MEASURE[t.id];
        const L = num(part ? (v.L && v.L[part]) : v.L), R = num(part ? (v.R && v.R[part]) : v.R);
        // a test with a goal is read against the goal on each side (a met goal on both is met; a missed one is one
        // finding, not also a gap line) - the gap between the sides reads the tests without one
        if (g == null && L != null && R != null && Math.max(L, R) > 0) {
          checked = true;
          const lsi = Math.min(L, R) / Math.max(L, R);
          if (lsi < 0.9) { push({ key: `${t.id}:asym`, section: s.id, test: t.id, label: t.label, kind: 'asym', level: lsi < 0.85 ? 'high' : 'mid', reading: { L, R, weak: L < R ? 'L' : 'R', gapPct: Math.round((1 - lsi) * 100), unit: part || t.unit } }); flagged = true; }
        }
      }
      // CHANGE SINCE THE LAST EVALUATION: a plain number that dropped 10%+ (a jump, a hold, a grip)
      const pv = pScores[t.id];
      if (prev && !Array.isArray(t.composite)) {
        const sides = Array.isArray(t.sides) ? t.sides : [null];
        for (const sd of sides) {
          const x = num(sd ? (v && typeof v === 'object' ? v[sd] : null) : v);
          const y = num(sd ? (pv && typeof pv === 'object' ? pv[sd] : null) : pv);
          if (x != null && y != null && y > 0 && x < y * 0.9) { watch.push({ key: `${t.id}:${sd || ''}:chg`, section: s.id, test: t.id, label: t.label, side: sd, kind: 'change', level: 'mid', reading: { value: x, before: y, pct: Math.round((x / y - 1) * 100), unit: t.unit } }); flagged = true; }
        }
      }
      if (!flagged) { if (checked) onTarget++; else recorded++; }
    }
    if (missing.length) notTested.push({ section: s.id, title: s.title, tests: missing });
  }
  // RANGE OF MOTION against the adult reference: under 80% watch, under 60% needs work
  let romNotTested = 0, romOk = 0;
  for (const j of EVAL_SCHEMA.rom.joints) for (const ax of j.axes) {
    const k = romKey(j.id, ax);
    const x = num(rom[k]);
    if (x == null) { romNotTested++; continue; }
    const ref = ROM_REF[k];
    if (ref == null) { recorded++; continue; }
    if (x < ref * 0.8) push({ key: `rom:${k}`, section: 'rom', joint: j.id, axis: ax, label: `${j.label} · ${ax}`, kind: 'rom', level: x < ref * 0.6 ? 'high' : 'mid', reading: { value: x, ref, pct: Math.round((x / ref) * 100) } });
    else romOk++;
  }
  const order = { high: 0, mid: 1 };
  const bySection = (a, b) => order[a.level] - order[b.level];
  needsWork.sort(bySection); watch.sort(bySection);
  const notes = Object.entries(notesMap).filter(([, t]) => t && String(t).trim()).map(([id, text]) => {
    const t = EVAL_SCHEMA.sections.flatMap((s) => s.tests).find((x) => x.id === id);
    return { test: id, label: t ? t.label : id, text: String(text).trim() };
  });
  const testsTotal = EVAL_SCHEMA.sections.reduce((a, s) => a + s.tests.length, 0);
  const tested = testsTotal - notTested.reduce((a, x) => a + x.tests.length, 0);
  return {
    needsWork, watch, onTarget: onTarget + romOk, recorded, outside, notTested, romNotTested, notes,
    freeNotes: ev && ev.notes ? String(ev.notes).trim() || null : null,
    counts: { tests: testsTotal, tested, rom: EVAL_SCHEMA.rom.joints.reduce((a, j) => a + j.axes.length, 0), romTested: EVAL_SCHEMA.rom.joints.reduce((a, j) => a + j.axes.length, 0) - romNotTested },
  };
}
