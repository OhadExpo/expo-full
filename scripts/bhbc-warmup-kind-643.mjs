// #643 AFTER THE DEPLOY: the stored warm-ups become kind 'warmup'. Since 1010f the app reads the
// old shape (kind 'sc', team, 5 min, note 'Dynamic warm-up') as a warm-up already, so this is
// housekeeping that makes the data say what it is - run ONLY once a build that knows kind 'warmup'
// is live (production before it shows a 'warmup' row as 'other').
//
//   node scripts/bhbc-warmup-kind-643.mjs           # dry run: how many rows would change
//   node scripts/bhbc-warmup-kind-643.mjs --write   # snapshot -> CAS write -> read back
import fs from 'node:fs';
import os from 'node:os';
import { ownerClient } from './lib/store-client.mjs';
import { rowKind, WARMUP_NOTE } from '../src/bhbcSession.js';

const WRITE = process.argv.includes('--write');
const s = await ownerClient();
try {
  const { data: cur, error } = await s.from('store').select('value, updated_at').eq('key', 'expo-bhbc-loads').single();
  if (error) throw error;
  const next = JSON.parse(JSON.stringify(cur.value));
  let n = 0, already = 0;
  for (const rec of Object.values(next)) for (const list of Object.values((rec && rec.sessions) || {})) {
    for (let i = 0; i < (list || []).length; i++) {
      const r = list[i];
      if (rowKind(r) !== 'warmup') continue;
      if (r.kind === 'warmup') { already++; continue; }
      list[i] = { ...r, kind: 'warmup', type: 'Warm-up', note: r.note || WARMUP_NOTE, teamNote: r.teamNote || WARMUP_NOTE };
      n++;
    }
  }
  console.log(`warm-up rows: ${n} in the old shape -> kind 'warmup', ${already} already converted`);
  if (!n) { console.log('nothing to write'); process.exitCode = 0; }
  else if (!WRITE) { console.log('DRY RUN - add --write'); }
  else {
    const snap = `${os.homedir()}/expo-private-backups/snapshots/expo-bhbc-loads-before-643-kind-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    fs.writeFileSync(snap, JSON.stringify(cur.value));
    const { data: upd, error: e2 } = await s.from('store').update({ value: next, updated_at: new Date().toISOString() }).eq('key', 'expo-bhbc-loads').eq('updated_at', cur.updated_at).select('updated_at');
    if (e2) throw e2;
    if (!upd || upd.length !== 1) throw new Error('compare-and-swap lost - re-run');
    const back = (await s.from('store').select('value').eq('key', 'expo-bhbc-loads').single()).data.value;
    let left = 0, wk = 0;
    for (const rec of Object.values(back)) for (const list of Object.values((rec && rec.sessions) || {})) for (const r of list || []) { if (rowKind(r) === 'warmup') { if (r.kind === 'warmup') wk++; else left++; } }
    console.log(`written; read back: ${wk} kind 'warmup', ${left} old-shape left; snapshot ${snap.split('/').pop()}`);
  }
} finally { await s.auth.signOut({ scope: 'local' }); }
