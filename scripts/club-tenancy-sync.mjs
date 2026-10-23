// TEAM VERSION PHASE B, STEP 5 - KEEP THE CLUB TABLES IN STEP WITH THE STORE until the switch (#904, 23.10).
// The runbook's first step 5 ("read the club tables first, writes still to the old key") would have shown Herzliya
// stale data from the first write after the backfill. Instead the store stays the only thing the app reads and writes,
// and this copies every changed key into club_store / club_medical (the daemon runs it every 20 minutes), so the club
// tables are never more than one round behind. The switch (reads + writes together) then starts from a final sync.
//   node scripts/club-tenancy-sync.mjs           copy the keys that changed since the last sync (state file below)
//   node scripts/club-tenancy-sync.mjs --verify  also read every club key back and compare it with the store
// Medical goes through club_medical_put (owner / head / pt only; the table has no select policy). Nothing here reads
// club_medical per round - every read is logged, and a log that fills with a robot's reads stops meaning anything.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ownerClient, readStore } from './lib/store-client.mjs';

const VERIFY = process.argv.includes('--verify');
const CLUB = 'bhbc';
const MAP = { 'expo-bhbc-loads': 'loads', 'expo-bhbc-fixtures': 'fixtures', 'expo-bhbc-league': 'league', 'expo-bhbc-gamewarmup': 'gamewarmup', 'expo-bhbc-activity': 'activity' };
const canon = (v) => (Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v);
const hash = (v) => createHash('sha256').update(JSON.stringify(canon(v))).digest('hex').slice(0, 16);
const STATE = path.join(os.homedir(), 'expo-private-backups', 'club-sync-state.json');
const state = (() => { try { return JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch { return {}; } })();

const s = await ownerClient();
const changed = [];
let bad = 0;
try {
  for (const [storeKey, clubKey] of Object.entries(MAP)) {
    const v = await readStore(s, storeKey);
    const h = hash(v);
    if (state[storeKey] !== h) {
      const { error } = await s.from('club_store').upsert({ club_id: CLUB, key: clubKey, value: v ?? null, updated_by: 'sync' });
      if (error) { console.log(`club sync: ${clubKey} FAILED ${error.message}`); bad++; continue; }
      state[storeKey] = h; changed.push(clubKey);
    }
    if (VERIFY) {
      const q = await s.from('club_store').select('value').eq('club_id', CLUB).eq('key', clubKey).single();
      const ok = !q.error && hash(q.data && q.data.value) === h;
      if (!ok) bad++;
      console.log(`${ok ? 'ok  ' : 'DIFF'} club_store/${clubKey}`);
    }
  }
  const med = await readStore(s, 'expo-bhbc-medical');
  const mh = hash(med);
  if (state['expo-bhbc-medical'] !== mh) {
    const { error } = await s.rpc('club_medical_put', { p_club: CLUB, p_value: med ?? {} });
    if (error) { console.log(`club sync: medical FAILED ${error.message}`); bad++; } else { state['expo-bhbc-medical'] = mh; changed.push('medical'); }
  }
  if (VERIFY) {
    const q = await s.rpc('club_medical_get', { p_club: CLUB });
    const ok = !q.error && hash(q.data) === mh;
    if (!ok) bad++;
    console.log(`${ok ? 'ok  ' : 'DIFF'} club_medical`);
  }
  state.at = new Date().toISOString();
  fs.writeFileSync(STATE, JSON.stringify(state, null, 1));
  if (changed.length || bad) console.log(`club sync: ${changed.length ? 'copied ' + changed.join(', ') : 'nothing changed'}${bad ? ` - ${bad} problem(s)` : ''}`);
  else if (VERIFY) console.log('club sync: every key in step');
} finally {
  await s.auth.signOut({ scope: 'local' });
}
process.exitCode = bad ? 1 : 0;
