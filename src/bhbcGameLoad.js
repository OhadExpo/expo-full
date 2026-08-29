// bhbcGameLoad.js — minutes played in a GAME become training load.
//
// Minutes on court are the single biggest load a basketball player takes, and
// until now the BHBC load model could not see them at all: the board counted
// practices and gym sessions, and a 32-minute game and a DNP looked identical.
// Every ACWR number in the zone was computed on a partial week.
//
// The write REPLACES rather than accumulates. logSession() adds to the day's
// total, which is right for "I ran another session" and wrong for "I am
// correcting the minutes I typed" — saving the same game twice would have
// silently doubled a player's week. That is the exact shape of the phantom-load
// bug this zone already had once, so it does not get a second chance here.
//
// Pure: no React, no store, no clock. See scripts/verify-game-load.mjs.

// .js on purpose: this module is imported directly by node in the verify
// suite, and node will not resolve an extensionless specifier the way Vite does.
import { sessionLoad } from './acwrEngine.js';

export const GAME = 'Game';

/** The load a game already contributed to one athlete on one date. */
export function priorGameLoad(rec, date) {
  const same = (rec && rec.sessions && rec.sessions[date]) || [];
  return same.reduce((a, s) => a + (s && s.type === GAME ? (Number(s.load) || 0) : 0), 0);
}

/**
 * Write one game's minutes across the squad.
 *
 * @param prev     { [athleteId]: { loads: {date: number}, sessions: {date: [...]}} }
 * @param date     ISO date of the game
 * @param rpe      one RPE for the game (Foster sRPE is rpe x minutes)
 * @param minutes  { [athleteId]: number }  — 0 or missing means he did not play
 * @param emptyRec factory for a blank athlete record, so this module does not
 *                 need to know the store's shape
 */
export function applyGameMinutes(prev, { date, rpe, minutes = {}, emptyRec = () => ({ loads: {}, sessions: {}, readiness: {} }) }) {
  if (!date) return prev;
  const next = { ...(prev || {}) };
  for (const [athleteId, raw] of Object.entries(minutes)) {
    const mins = Math.max(0, Number(raw) || 0);
    const src = next[athleteId] || emptyRec();
    const rec = { ...src, loads: { ...(src.loads || {}) }, sessions: { ...(src.sessions || {}) } };

    const prior = priorGameLoad(rec, date);
    const kept = (rec.sessions[date] || []).filter((s) => !(s && s.type === GAME));
    // Whatever else happened that day survives untouched: a game does not erase
    // the morning's lift.
    const base = Math.max(0, (Number(rec.loads[date]) || 0) - prior);
    const load = mins > 0 ? sessionLoad(mins, rpe) : 0;

    if (load > 0) {
      rec.loads[date] = base + load;
      rec.sessions[date] = [...kept, { type: GAME, min: mins, rpe: Number(rpe) || 0, load }];
    } else {
      if (base > 0) rec.loads[date] = base; else delete rec.loads[date];
      if (kept.length) rec.sessions[date] = kept; else delete rec.sessions[date];
    }
    next[athleteId] = rec;
  }
  return next;
}

/** Minutes already recorded for a game, so the editor opens on what was saved. */
export function gameMinutesOf(loadsByAthlete, date) {
  const out = {};
  for (const [id, rec] of Object.entries(loadsByAthlete || {})) {
    const same = (rec && rec.sessions && rec.sessions[date]) || [];
    const g = same.find((s) => s && s.type === GAME);
    if (g) out[id] = Number(g.min) || 0;
  }
  return out;
}

/** The RPE saved with a game, if any — so re-opening does not lose it. */
export function gameRpeOf(loadsByAthlete, date) {
  for (const rec of Object.values(loadsByAthlete || {})) {
    const same = (rec && rec.sessions && rec.sessions[date]) || [];
    const g = same.find((s) => s && s.type === GAME && s.rpe);
    if (g) return Number(g.rpe) || null;
  }
  return null;
}
