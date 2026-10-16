// THE SHOOTAROUND, LOGGED FOR EVERY AVAILABLE PLAYER (16.10 #822, Ohad: "Automatically log the shoot around days,
// retroactively and future for each available player").
//
// A shootaround on the calendar (expo-bhbc-fixtures type 'shootaround') gets a court row - the shootaround's own
// minutes, owned by its start - for every athlete who was available for it, the zone's own rule (the same one the
// warm-up backfill uses): landed (arrival), not before the first day anything was logged for him when there is no
// arrival date, not out for the day (the coach's availability, never better than the medical record), not marked
// out of that slot, not a ghost. Skipped: a cancelled shootaround, one that has not happened yet (today counts once
// its start has passed), and an athlete who already has a court row for that slot.
//
// The row reads as a court session everywhere (rowKind: type 'Shootaround' -> 'practice'), so a game day's morning
// shootaround - which the attendance grid shows as the game - counts as court time in his load and his history.
//
// Idempotent: a re-run writes nothing new, so the daemon can run it (the future ones get logged as they happen).
// DRY by default; --write writes (writeStore snapshots expo-bhbc-loads first) and reads the rows back.
//   node scripts/bhbc-shootaround-backfill.mjs            # dry run
//   node scripts/bhbc-shootaround-backfill.mjs --write    [--since 2026-08-01] [--today 2026-10-17] [--now 23:59]
import { ownerClient, readStore, writeStore } from './lib/store-client.mjs';
import { rowKind } from '../src/bhbcSession.js';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const WRITE = process.argv.includes('--write');
const pad = (n) => String(n).padStart(2, '0');
const nowD = new Date();
const TODAY = arg('today', `${nowD.getFullYear()}-${pad(nowD.getMonth() + 1)}-${pad(nowD.getDate())}`);
const NOW = arg('now', `${pad(nowD.getHours())}:${pad(nowD.getMinutes())}`);
const SINCE = arg('since', '2026-08-01');
const BY = 'ohadyproductions@gmail.com';
const SOURCE = 'auto-shootaround';

// the zone's availability rule (ported from BhbcView.jsx medicalAvailOn / availOn, as in bhbc-warmup-backfill.mjs)
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
const trainees = (await readStore(s, 'expo-trainees')) || [];
if (!roster.length || !trainees.length) { console.log('the roster / trainee list is empty - refusing to write'); process.exit(1); }
const GHOST = new Set(trainees.filter((t) => t && t.bhbcGhost).map((t) => t.id));
const squad = roster.filter((a) => a && !GHOST.has(a.id));
const firstSeen = (id) => { const rec = loads[id] || {}; const d = [...Object.keys(rec.sessions || {}), ...Object.keys(rec.attendance || {}).map((k) => k.slice(0, 10))].filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x)).sort(); return d[0] || null; };
const happened = (f) => f.date < TODAY || (f.date === TODAY && !!f.start && f.start <= NOW);
const minsOf = (f) => { const m = Number(f.minutes); if (m > 0) return m; if (f.start && f.end) { const [a, b] = [f.start, f.end].map((t) => { const [h, mm] = t.split(':').map(Number); return h * 60 + mm; }); if (b > a) return b - a; } return 60; };
const ownsCourtRow = (r, start) => !!r && rowKind(r) === 'practice' && String(r.start || '') === String(start || '');

const plan = []; const skipped = { cancelled: [], notYet: [] };
for (const f of fixtures.filter((x) => x && x.type === 'shootaround' && x.date >= SINCE && x.date <= TODAY).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))) {
  if (f.cancelled) { skipped.cancelled.push(`${f.date} ${f.start}`); continue; }
  if (!happened(f)) { skipped.notYet.push(`${f.date} ${f.start}`); continue; }
  const slotKey = `${f.date}|${f.start || ''}`;
  const who = squad.filter((a) => {
    const rec = loads[a.id] || {};
    if (a.arrival && f.date < a.arrival) return false;
    if (!a.arrival) { const first = firstSeen(a.id); if (!first || f.date < first) return false; }
    if (availOn(rec, medical, a.id, f.date) >= 4) return false;
    if ((rec.attendance || {})[slotKey] === 'out') return false;
    if ((((rec.sessions || {})[f.date]) || []).some((r) => ownsCourtRow(r, f.start || ''))) return false;
    return true;
  });
  if (who.length) plan.push({ date: f.date, start: f.start || '', min: minsOf(f), ids: who.map((a) => a.id), names: who.map((a) => a.name) });
}
console.log(`window ${SINCE} .. ${TODAY} ${NOW}`);
console.log(`${plan.length} shootaround(s) to log, ${plan.reduce((n, p) => n + p.ids.length, 0)} rows:`);
for (const p of plan) console.log(`  ${p.date} ${p.start} ${p.min}'  -> ${p.ids.length} athlete(s)`);
for (const [k, v] of Object.entries(skipped)) if (v.length) console.log(`skipped (${k}): ${v.join(' · ')}`);
if (!plan.length) { console.log('nothing to write.'); process.exit(0); }
if (!WRITE) { console.log('DRY RUN - nothing written. Add --write to write.'); process.exit(0); }

const next = JSON.parse(JSON.stringify(loads));
for (const p of plan) for (const id of p.ids) {
  const rec = next[id] || (next[id] = { loads: {}, sessions: {} });
  rec.sessions = rec.sessions || {};
  rec.sessions[p.date] = [...(rec.sessions[p.date] || []), { type: 'Shootaround', min: p.min, start: p.start, team: true, by: BY, source: SOURCE }];
}
await writeStore(s, 'expo-bhbc-loads', next);
const after = (await readStore(s, 'expo-bhbc-loads')) || {};
let want = 0, ok = 0;
for (const p of plan) for (const id of p.ids) { want++; if ((((after[id] || {}).sessions || {})[p.date] || []).some((r) => r && r.source === SOURCE && ownsCourtRow(r, p.start))) ok++; }
console.log(`${ok}/${want} rows read back from the database.`);
await s.auth.signOut({ scope: 'local' });
process.exit(ok === want ? 0 : 1);
