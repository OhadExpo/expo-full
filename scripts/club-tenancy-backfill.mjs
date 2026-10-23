// TEAM VERSION PHASE B, STEP 4 - copy Herzliya's club data into the club tables (#904). Run ONLY with Ohad, after
// supabase/proposed/20261023_club_tenancy.sql is applied and checked (docs/team-version-phase-b.md).
//
//   node scripts/club-tenancy-backfill.mjs            DRY RUN (default): reads the eight store rows, prints what would be
//                                                     written - rows, sizes, a hash per key - and writes NOTHING
//   node scripts/club-tenancy-backfill.mjs --apply    writes club_store + club_medical for club 'bhbc', then reads them
//                                                     back and compares the hashes; the old store rows are not touched
//
// Snapshot first: the dry run writes the full JSON of every key to ~/expo-private-backups/club-backfill-<stamp>/.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ownerClient, readStore } from './lib/store-client.mjs';

const APPLY = process.argv.includes('--apply');
const CLUB = 'bhbc';
// the zone's store keys -> club_store keys (medical goes to its own table)
const MAP = { 'expo-bhbc-loads': 'loads', 'expo-bhbc-fixtures': 'fixtures', 'expo-bhbc-league': 'league', 'expo-bhbc-gamewarmup': 'gamewarmup', 'expo-bhbc-activity': 'activity' };
// jsonb stores object keys in its own order - the hash is of a KEY-SORTED copy, so a faithful read-back compares equal
const canon = (v) => (Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v);
const hash = (v) => createHash('sha256').update(JSON.stringify(canon(v))).digest('hex').slice(0, 16);

const s = await ownerClient();
try {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.join(os.homedir(), 'expo-private-backups', `club-backfill-${stamp}`);
  fs.mkdirSync(dir, { recursive: true });
  const plan = [];
  for (const [storeKey, clubKey] of Object.entries(MAP)) {
    const v = await readStore(s, storeKey);
    fs.writeFileSync(path.join(dir, `${storeKey}.json`), JSON.stringify(v));
    plan.push({ table: 'club_store', key: clubKey, from: storeKey, value: v, size: JSON.stringify(v ?? null).length, hash: hash(v), rows: Array.isArray(v) ? v.length : v && typeof v === 'object' ? Object.keys(v).length : 0 });
  }
  const med = await readStore(s, 'expo-bhbc-medical');
  fs.writeFileSync(path.join(dir, 'expo-bhbc-medical.json'), JSON.stringify(med));
  plan.push({ table: 'club_medical', key: '(value)', from: 'expo-bhbc-medical', value: med, size: JSON.stringify(med ?? null).length, hash: hash(med), rows: med ? Object.keys(med).length : 0 });
  // the roster is EXPO trainees tagged team 'BHBC' - Phase B3 moves it; here it is counted so the plan says so
  const roster = ((await readStore(s, 'expo-trainees')) || []).filter((t) => t && t.team === 'BHBC');
  console.log(`snapshot: ${dir}`);
  for (const p of plan) console.log(`${APPLY ? 'WRITE' : 'would write'}  ${p.table.padEnd(13)} ${String(p.key).padEnd(11)} <- ${p.from.padEnd(22)} ${String(p.rows).padStart(4)} rows  ${String(p.size).padStart(8)} bytes  sha ${p.hash}`);
  console.log(`roster (Phase B3, not moved here): ${roster.length} EXPO trainees tagged BHBC`);
  if (!APPLY) { console.log('DRY RUN - nothing written.'); process.exit(0); }

  for (const p of plan) {
    const row = p.table === 'club_medical' ? { club_id: CLUB, value: p.value ?? {}, updated_by: 'backfill' } : { club_id: CLUB, key: p.key, value: p.value ?? null, updated_by: 'backfill' };
    const { error } = await s.from(p.table).upsert(row);
    if (error) throw new Error(`${p.table}/${p.key}: ${error.message}`);
  }
  // read back and compare
  let bad = 0;
  for (const p of plan) {
    const q = p.table === 'club_medical' ? await s.rpc('club_medical_get', { p_club: CLUB }) : await s.from('club_store').select('value').eq('club_id', CLUB).eq('key', p.key).single();
    const got = p.table === 'club_medical' ? q.data : q.data && q.data.value;
    const ok = !q.error && hash(got) === p.hash;
    if (!ok) bad++;
    console.log(`${ok ? 'ok  ' : 'DIFF'} ${p.table}/${p.key} ${q.error ? q.error.message : `sha ${hash(got)}`}`);
  }
  console.log(bad ? `${bad} key(s) differ - do not switch reads` : 'every key read back identical');
  process.exitCode = bad ? 1 : 0;
} finally {
  await s.auth.signOut({ scope: 'local' });
}
