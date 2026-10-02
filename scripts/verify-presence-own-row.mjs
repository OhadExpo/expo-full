// verify-presence-own-row.mjs - an athlete writes ONLY his own presence row (#479, 1.10).
//
// The old policy let any signed-in account write any expo-presence-* row, so one
// athlete could fake another's online dot. Real seats, supabase-js, no browser:
// the athlete's own heartbeat (exactly what ClientPortal sends) still saves;
// another athlete's row is refused and unchanged; reads are as before.
//   node scripts/verify-presence-own-row.mjs
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
const src = fs.readFileSync('src/supabase.js', 'utf8');
const mk = () => createClient(src.match(/SUPA_URL = '([^']+)'/)[1], src.match(/SUPA_PUBLISHABLE_KEY = '([^']+)'/)[1], { auth: { persistSession: false } });
let pass = 0, fail = 0; const ok = (c, w) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + w); };
const seat = async (email) => { const c = mk(); const { error } = await c.auth.signInWithPassword({ email, password: '1234' }); if (error) throw new Error(email + ': ' + error.message); return c; };
const d = await seat('diego@diegoday.com'), e = await seat('eladeluz24@gmail.com'), o = await seat('ohadyproductions@gmail.com');
try {
  const before = (await o.from('store').select('key,value').eq('key', 'expo-presence-tr_amit')).data;
  // exactly what the athlete portal sends
  const { error: own } = await d.from('store').upsert({ key: 'expo-presence-tr_diego', value: { ts: Date.now(), clientId: 'tr_diego' } });
  ok(!own, 'athlete: his own heartbeat saves' + (own ? ' - ' + own.message : ''));
  const { error: other } = await d.from('store').upsert({ key: 'expo-presence-tr_amit', value: { ts: 1, clientId: 'tr_amit' } });
  ok(!!other, 'athlete: writing ANOTHER athlete\'s presence is refused' + (other ? ' (' + other.code + ')' : ' - IT WROTE'));
  const { data: upd } = await d.from('store').update({ value: { ts: 2 } }).eq('key', 'expo-presence-tr_amit').select('key');
  ok((upd || []).length === 0, 'athlete: updating another\'s presence changes 0 rows');
  const { error: el } = await e.from('store').upsert({ key: 'expo-presence-tr_amit', value: { ts: 3 } });
  ok(!!el, 'partner: refused too');
  const { data: rd } = await d.from('store').select('key').like('key', 'expo-presence-%');
  ok((rd || []).length > 1, `athlete: reads unchanged (${(rd || []).length} presence rows visible, as before)`);
  const after = (await o.from('store').select('key,value').eq('key', 'expo-presence-tr_amit')).data;
  ok(JSON.stringify(after) === JSON.stringify(before), 'another athlete\'s row is exactly as it was');
  const { data: od } = await o.from('store').select('key').like('key', 'expo-presence-%');
  ok((od || []).length >= 14, `owner: sees all presence rows (${(od || []).length})`);
} finally { for (const c of [d, e, o]) await c.auth.signOut({ scope: 'local' }); }
console.log(`PRESENCE #479: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
