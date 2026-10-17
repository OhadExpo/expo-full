// #873 gate: a renamed DAY keeps its logs - by id, in the database (scripts/migrations/2026-10-17-workout-day-id.sql).
// Runs against the SANDBOX twins (sbx_plans / sbx_client_workouts: fake data, Elad's seat) from the owner's signed-in
// seat, so RLS is the real one. Every scenario the reverted name carry (f2685b8b) got wrong is replayed here:
//   stamp      a plan stored without day ids gets ids on insert, and keeps them on the next write
//   rename     A -> 'A2'                                         logs of A follow
//   swap       A <-> B in two saves through a shared name         each log stays with ITS day
//   stale      a save from a device that never saw the rename     the logs follow THAT save (last write wins, by id)
//   oneweek    two days named the same (onlyWeek 1 / 2)          renaming one moves only its own logs
//   blank      a day renamed to ''                                logs keep their last real name
//   late       a phone writes a log with the old name + day id    it lands on the current name
//   noid       a log with no day_id                               never touched (today's name behaviour)
// node scripts/verify-day-id-carry.mjs   (exit 1 on any failure; every test row is removed at the end)
import { ownerClient } from './lib/store-client.mjs';

const s = await ownerClient();
const P = 'plan_verify_dayid_' + Date.now();
const fails = []; const ok = (cond, msg) => { if (!cond) fails.push(msg); console.log((cond ? 'PASS ' : 'FAIL ') + msg); };
const days = async () => ((await s.from('sbx_plans').select('data').eq('id', P).single()).data.data.days);
const save = async (ds) => { const { error } = await s.from('sbx_plans').update({ data: { days: ds }, updated_at: new Date().toISOString() }).eq('id', P); if (error) throw error; };
const logName = async (id) => (await s.from('sbx_client_workouts').select('day_name').eq('id', id).single()).data.day_name;
const logs = [];
const log = async (name, dayId, week = 1) => {
  const id = `${P}_w${logs.length}`; logs.push(id);
  const row = { id, client_id: 'sbx_verify', plan_id: P, plan_name: 'Verify', day_name: name, week, exercises: [] };
  if (dayId) row.day_id = dayId;
  const { error } = await s.from('sbx_client_workouts').insert(row); if (error) throw error; return id;
};
try {
  // stamp
  { const { error } = await s.from('sbx_plans').insert({ id: P, name: 'Verify', trainee_id: 'sbx_verify', active: false, data: { days: [{ name: 'Day A', exercises: [] }, { name: 'Day B', exercises: [] }, { name: 'Day C', exercises: [] }, { name: 'Run', onlyWeek: 1, exercises: [] }, { name: 'Run', onlyWeek: 2, exercises: [] }] } }); if (error) throw error; }
  let d = await days();
  ok(d.every((x) => typeof x.id === 'string' && x.id.length > 4) && new Set(d.map((x) => x.id)).size === d.length, 'stamp: every stored day got its own id on insert');
  const [A, B, C, R1, R2] = d.map((x) => x.id);
  await save(d); ok(JSON.stringify((await days()).map((x) => x.id)) === JSON.stringify([A, B, C, R1, R2]), 'stamp: a re-save keeps the same ids');

  const wA = await log('Day A', A), wB = await log('Day B', B), wC = await log('Day C', C), wR1 = await log('Run', R1, 1), wR2 = await log('Run', R2, 2), wNo = await log('Day A', null);
  const ren = (map) => (d = d.map((x) => (x.id in map ? { ...x, name: map[x.id] } : x)));

  // rename
  ren({ [A]: 'Day A2' }); await save(d);
  ok(await logName(wA) === 'Day A2', 'rename: the log of A follows A -> Day A2');
  ok(await logName(wNo) === 'Day A', 'noid: a log with no day id is never touched');

  // swap through a shared name: save 1 B -> 'Day A2' (two days share it), save 2 A -> 'Day B'
  ren({ [B]: 'Day A2' }); await save(d);
  ok(await logName(wA) === 'Day A2' && await logName(wB) === 'Day A2', 'swap mid-way: both logs read their own day (both days are named Day A2 for now)');
  ren({ [A]: 'Day B' }); await save(d);
  ok(await logName(wA) === 'Day B' && await logName(wB) === 'Day A2', 'swap done: each log stays with ITS day (A is now Day B, B is Day A2)');

  // stale device: an older copy of the plan (before the swap) is saved over it
  const stale = d.map((x) => (x.id === A ? { ...x, name: 'Day A2' } : x.id === B ? { ...x, name: 'Day B' } : x));
  await save(stale);
  ok(await logName(wA) === 'Day A2' && await logName(wB) === 'Day B', 'stale save: logs follow the version actually stored, by id - no cross-over');
  d = stale;

  // one-week days with one name
  ren({ [R2]: 'Run long' }); await save(d);
  ok(await logName(wR1) === 'Run' && await logName(wR2) === 'Run long', 'oneweek: renaming the week-2 Run moves only the week-2 log');

  // blank
  ren({ [C]: '' }); await save(d);
  ok(await logName(wC) === 'Day C', 'blank: a day renamed to empty leaves its log on its last real name');
  ren({ [C]: 'Day C' }); await save(d);

  // late write from a phone that still had the old name
  const wLate = await log('Day A', A);
  ok(await logName(wLate) === 'Day A2', 'late: a log written with the OLD name and the day id lands on the current name');
  { const { error } = await s.from('sbx_client_workouts').update({ day_name: 'Day A' }).eq('id', wLate); if (error) throw error; }
  ok(await logName(wLate) === 'Day A2', 'late re-save: an update that sends the old name is corrected too');

  // upsert (every real write is INSERT ... ON CONFLICT): a re-save with the old name and NO day_id keeps the stored id
  { const { error } = await s.from('sbx_client_workouts').upsert({ id: wLate, client_id: 'sbx_verify', plan_id: P, plan_name: 'Verify', day_name: 'Day A', week: 1, exercises: [] }); if (error) throw error; }
  { const r = (await s.from('sbx_client_workouts').select('day_name,day_id').eq('id', wLate).single()).data; ok(r.day_id === A && r.day_name === 'Day A2', 'upsert without day_id: the stored day id stays and the name is set right'); }
  { const { error } = await s.from('sbx_client_workouts').upsert({ id: wLate, client_id: 'sbx_verify', plan_id: P, plan_name: 'Verify', day_name: 'Day A', day_id: A, week: 1, exercises: [] }); if (error) throw error; }
  ok(await logName(wLate) === 'Day A2', 'upsert with day_id and the old name: lands on the current name');

  // another athlete's log on this plan id (a plan re-assigned): never renamed by this plan's saves
  const wOther = `${P}_w${logs.length}`; logs.push(wOther);
  { const { error } = await s.from('sbx_client_workouts').insert({ id: wOther, client_id: 'sbx_verify_other', plan_id: P, plan_name: 'Verify', day_name: 'Old', week: 1, exercises: [] }); if (error) throw error; }
  { const { error } = await s.from('sbx_client_workouts').update({ day_id: B }).eq('id', wOther); if (error) throw error; }
  const otherBefore = await logName(wOther);
  ren({ [B]: 'Day B2' }); await save(d);
  ok(await logName(wB) === 'Day B2' && await logName(wOther) === otherBefore, "re-assigned plan: a save renames this athlete's logs only");

  // two days with one id (a copied day) - the copy placed ABOVE the original, and the editor (which never learns the
  // ids stamped by the database) sends the duplicate again on every save: the original keeps the id, the copy gets
  // its own once and keeps THAT (re-review N1)
  {
    const ed = [{ ...d.find((x) => x.id === A), name: 'Day A copy' }, ...d];
    await save(ed); const s1 = await days();
    await save(ed); const s2 = await days();
    const copy1 = s1.find((x) => x.name === 'Day A copy'), copy2 = s2.find((x) => x.name === 'Day A copy');
    ok(s1.filter((x) => x.id === A).length === 1 && s1.find((x) => x.id === A).name !== 'Day A copy' && copy1.id !== A, 'duplicate id: the original keeps it, the copy (placed first) gets its own');
    ok(copy2.id === copy1.id, 'duplicate id re-sent on the next save: the copy keeps the SAME id, not a fresh one');
    ok(await logName(wA) === 'Day A2', 'duplicate id: the logs stay on the original');
    await save(d);
  }

  // a writer that drops every id (a restore, a re-import): each day gets back the id of the one old day with its name
  await save(d.map(({ id, ...rest }) => rest)); const back = await days();
  ok(JSON.stringify(back.map((x) => x.id)) === JSON.stringify(d.map((x) => x.id)), 'ids dropped by a writer: every day gets its old id back (name + week)');
  ren({ [A]: 'Day A3' }); await save(d);
  ok(await logName(wA) === 'Day A3', 'after the ids came back: a rename still carries');

  // a day removed from the plan: its logs keep their last name
  d = d.filter((x) => x.id !== C); await save(d);
  ok(await logName(wC) === 'Day C', 'removed day: its log keeps its last name');
} catch (e) {
  fails.push('threw: ' + (e.message || e)); console.log('THREW', e.message || e);
} finally {
  const r1 = await s.from('sbx_client_workouts').delete().like('id', P + '_w%');
  const r2 = await s.from('sbx_plans').delete().eq('id', P);
  console.log('cleanup', !r1.error && !r2.error ? 'ok' : (r1.error || r2.error).message);
  await s.auth.signOut({ scope: 'local' });
}
console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASS');
process.exit(fails.length ? 1 : 0);
