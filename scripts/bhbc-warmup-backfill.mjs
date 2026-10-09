// THE 5-MINUTE DYNAMIC WARM-UP, ON EVERY PRACTICE WE DID (29.9 #399 / #353).
//
// Ohad, 29.9: "log dynamic warmup sc session for every practice that we did
// (except on the morning of double days, on game days, and on days where we
// already logged a sc session)". 27.9 (#353): "this should be automatic unless
// i log an sc session for that day (log the dynamic warmup as sc session)".
//
// A practice gets a 5-min team S&C row ("Dynamic warm-up") for every athlete
// who was at it, unless:
//   - it has not happened yet (today counts once its start has passed),
//   - it was CANCELLED (#398),
//   - it is the MORNING practice of a day with two practices,
//   - the day is a GAME day (a game or a scrimmage on the calendar),
//   - the day already has a team S&C session for anyone (a logged S&C period
//     replaces the warm-up - his words).
// "Was at it" = the zone's own rule: landed (arrival), not out for the day
// (the coach's availability for that day, never better than the medical
// record), and not marked out of that slot.
//
// Rows are exactly what Log S&C Session writes (buildScRow, owned by the
// practice's start), so the planner shows "S&C ✓ 5′" and a later real S&C log
// for that slot REPLACES the warm-up instead of adding to it.
//
// Idempotent: re-running writes nothing new, so the daemon can run it daily
// (that is #353). DRY by default; --write to write. writeStore snapshots
// expo-bhbc-loads to audit-out/sheets/ first; the rows are read back after.
//
//   node scripts/bhbc-warmup-backfill.mjs            # dry run: the plan
//   node scripts/bhbc-warmup-backfill.mjs --write    # write + read back
//   [--since 2026-08-01] [--today 2026-09-29] [--now 23:59]
import { ownerClient, readStore, writeStore } from './lib/store-client.mjs';
import { rowKind, buildScRow, buildWarmupRow, ownsWarmupRow } from '../src/bhbcSession.js';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const WRITE = process.argv.includes('--write');
const pad = (n) => String(n).padStart(2, '0');
const nowD = new Date();
const TODAY = arg('today', `${nowD.getFullYear()}-${pad(nowD.getMonth() + 1)}-${pad(nowD.getDate())}`);
const NOW = arg('now', `${pad(nowD.getHours())}:${pad(nowD.getMinutes())}`);
const SINCE = arg('since', '2026-08-01');
const MIN = 5;
const NOTE = 'Dynamic warm-up';
// THE WARM-UP IS ITS OWN KIND (9.10 #643, Ohad: "S&C is different than dynamic warmup").
// --kind warmup writes kind:'warmup' rows and drops the old "the day already has S&C" skip
// (that rule existed only because the warm-up WAS an S&C row). The default stays 'sc' - the
// old row shape - until the build that reads kind:'warmup' is live; production's code would
// show a warmup row as 'other'. Either way an athlete who already has a warm-up for the slot
// (either shape: rowKind reads the old rows as warm-ups) is never given a second one.
const KIND = arg('kind', 'sc');
if (KIND !== 'sc' && KIND !== 'warmup') { console.log('--kind must be sc or warmup'); process.exit(1); }
const BY = 'ohadyproductions@gmail.com';

// ---- the zone's availability rule, ported from BhbcView.jsx (medicalAvailOn / availOn)
const MEDICAL_STATUS_AVAIL = { available: 1, limited: 2, 'non-contact': 3, out: 4 };
const localDayOf = (ts) => { if (!ts) return ''; const d = new Date(ts); return Number.isNaN(d.getTime()) ? String(ts).slice(0, 10) : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
function medicalAvailOn(medical, id, date) {
  let worst = 1;
  for (const inj of (((medical || {})[id] || {}).injuries || [])) {
    if (!inj) continue;
    if (inj.onsetDate && date < inj.onsetDate) continue;
    const notes = (inj.progress || []).filter((p) => p && p.date).slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
    if (inj.resolved) {
      const endedOn = (notes.length ? notes[notes.length - 1].date : '') || localDayOf(inj.updatedAt);
      if (endedOn && date > endedOn) continue;
    }
    // the APP's rule (BhbcView medicalAvailOn, 29.9 fix): a RESOLVED record's
    // headline is its clearance, dated at the END - never at the onset, or the
    // whole injury window read Full and an Out player got warm-up rows (AUDIT-470)
    const headlineOn = inj.resolved
      ? (localDayOf(inj.updatedAt) || (notes.length ? notes[notes.length - 1].date : ''))
      : (localDayOf(inj.updatedAt || inj.createdAt) || inj.onsetDate || '');
    const dated = notes.filter((p) => p.status).map((p) => ({ d: p.date, s: p.status }));
    if (inj.status && headlineOn) dated.push({ d: headlineOn, s: inj.resolved ? 'available' : inj.status, headline: true });
    dated.sort((a, b) => String(a.d).localeCompare(String(b.d)) || (a.headline ? 1 : 0) - (b.headline ? 1 : 0));
    const prior = dated.filter((p) => p.d <= date).pop();
    worst = Math.max(worst, MEDICAL_STATUS_AVAIL[(prior && prior.s) || inj.status] || 1);
  }
  return worst;
}
const availOn = (rec, medical, id, date) => Math.max(Number(((rec && rec.availability) || {})[date]) || 1, medicalAvailOn(medical, id, date));

const s = await ownerClient();
const roster = (await readStore(s, 'expo-bhbc-roster')) || [];
const fixtures = (await readStore(s, 'expo-bhbc-fixtures')) || [];
const loads = (await readStore(s, 'expo-bhbc-loads')) || {};
const medical = (await readStore(s, 'expo-bhbc-medical')) || {};
if (!roster.length) { console.log('the roster is empty - refusing to write'); process.exit(1); }
// GHOSTS DO NOT PRACTISE (9.10 #637). The zone leaves a ghost (bhbcGhost on the athlete in
// expo-trainees) out of practices, attendance and the planner; the expo-bhbc-roster copy drops
// that flag, so the first runs gave a ghost (#22) a warm-up row on 13 practices. Read the flag
// from expo-trainees and keep ghosts out. No trainee list = refuse, never guess.
const trainees = (await readStore(s, 'expo-trainees')) || [];
if (!trainees.length) { console.log('expo-trainees is empty - refusing to write'); process.exit(1); }
const GHOST = new Set(trainees.filter((t) => t && t.bhbcGhost).map((t) => t.id));
for (let i = roster.length - 1; i >= 0; i--) if (GHOST.has(roster[i].id)) roster.splice(i, 1);

const happened = (f) => f.date < TODAY || (f.date === TODAY && !!f.start && f.start <= NOW);
const byDate = {};
for (const f of fixtures) if (f && f.date && f.date >= SINCE && f.date <= TODAY) (byDate[f.date] = byDate[f.date] || []).push(f);

const skipped = { cancelled: [], doubleMorning: [], gameDay: [], hasSc: [], notYet: [] };
const plan = [];
for (const date of Object.keys(byDate).sort()) {
  const day = byDate[date];
  const practices = day.filter((f) => f.type === 'practice').sort((a, b) => String(a.start || '').localeCompare(String(b.start || '')));
  if (!practices.length) continue;
  const live = practices.filter((f) => !f.cancelled);
  for (const f of practices.filter((x) => x.cancelled)) skipped.cancelled.push(`${date} ${f.start}`);
  if (day.some((f) => (f.type === 'game' || f.type === 'scrimmage') && !f.cancelled)) { skipped.gameDay.push(`${date} (${live.map((f) => f.start).join(', ')})`); continue; }
  const anySc = roster.some((a) => (((loads[a.id] || {}).sessions || {})[date] || []).some((r) => r && r.team && rowKind(r) === 'sc'));
  if (anySc && KIND === 'sc') { skipped.hasSc.push(date); continue; }
  // the morning of a double day: two (live) practices, the earlier one is out
  const targets = live.length >= 2 ? live.slice(1) : live;
  if (live.length >= 2) skipped.doubleMorning.push(`${date} ${live[0].start}`);
  for (const f of targets) {
    if (!happened(f)) { skipped.notYet.push(`${date} ${f.start}`); continue; }
    const slotKey = `${date}|${f.start || ''}`;
    const who = roster.filter((a) => {
      const rec = loads[a.id] || {};
      if (a.arrival && date < a.arrival) return false;
      if (availOn(rec, medical, a.id, date) >= 4) return false;
      if ((rec.attendance || {})[slotKey] === 'out') return false;
      // already has this practice's warm-up, in either shape - never a second one
      if ((((rec.sessions || {})[date]) || []).some((r) => ownsWarmupRow(r, f.start || ''))) return false;
      return true;
    });
    if (who.length) plan.push({ date, start: f.start || '', ids: who.map((a) => a.id), names: who.map((a) => a.name) });
  }
}

console.log(`window ${SINCE} .. ${TODAY} ${NOW}`);
console.log(`\n${plan.length} practice(s) get a ${MIN}-min "${NOTE}" S&C, ${plan.reduce((n, p) => n + p.ids.length, 0)} rows:`);
for (const p of plan) console.log(`  ${p.date} ${p.start}  -> ${p.ids.length} athlete(s)`);
for (const [k, v] of Object.entries(skipped)) if (v.length) console.log(`skipped (${k}): ${v.join(' · ')}`);
if (!plan.length) { console.log('\nnothing to write.'); process.exit(0); }
if (!WRITE) { console.log('\nDRY RUN - nothing written. Add --write to write.'); process.exit(0); }

const next = JSON.parse(JSON.stringify(loads));
for (const p of plan) {
  for (const id of p.ids) {
    const rec = next[id] || (next[id] = { loads: {}, sessions: {} });
    rec.sessions = rec.sessions || {};
    rec.sessions[p.date] = [...(rec.sessions[p.date] || []), (KIND === 'warmup' ? buildWarmupRow({ start: p.start, by: BY }) : buildScRow({ min: MIN, start: p.start, teamNote: NOTE, by: BY }))];
  }
}
await writeStore(s, 'expo-bhbc-loads', next);
const after = (await readStore(s, 'expo-bhbc-loads')) || {};
let want = 0, ok = 0;
for (const p of plan) for (const id of p.ids) {
  want++;
  if ((((after[id] || {}).sessions || {})[p.date] || []).some((r) => r && r.kind === 'sc' && r.start === p.start && r.teamNote === NOTE)) ok++;
}
console.log(`\n${ok}/${want} rows read back from the database.`);
process.exit(ok === want ? 0 : 1);
