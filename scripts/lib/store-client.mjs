// One signed-in Supabase client for the maintenance scripts.
//
// The owner's credentials are NOT written here. They come from the environment
// (EXPO_OWNER_EMAIL / EXPO_OWNER_PW) or from `.env.owner.local`, which is
// gitignored — older scripts in this folder still carry the literals inline and
// should be moved over as they are touched.
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const SUPA_URL = process.env.EXPO_SUPABASE_URL || 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const SUPA_KEY = process.env.EXPO_SUPABASE_KEY || 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';

function fromFile() {
  try {
    const txt = fs.readFileSync('.env.owner.local', 'utf8');
    const get = (k) => (txt.match(new RegExp('^' + k + '\s*=\s*(.+)$', 'm')) || [])[1];
    return { email: (get('EXPO_OWNER_EMAIL') || '').trim(), pw: (get('EXPO_OWNER_PW') || '').trim() };
  } catch { return {}; }
}

export async function ownerClient() {
  const f = fromFile();
  const email = process.env.EXPO_OWNER_EMAIL || f.email;
  const pw = process.env.EXPO_OWNER_PW || f.pw;
  if (!email || !pw) { console.log('no owner credentials: set EXPO_OWNER_EMAIL / EXPO_OWNER_PW, or create .env.owner.local'); process.exit(2); }
  const s = createClient(SUPA_URL, SUPA_KEY, { auth: { persistSession: false } });
  const { error } = await s.auth.signInWithPassword({ email, password: pw });
  if (error) { console.log('AUTH FAILED', error.message); process.exit(1); }
  return s;
}

export async function readStore(s, key) {
  const { data, error } = await s.from('store').select('value').eq('key', key).maybeSingle();
  if (error) { console.log('read failed', key, error.message); process.exit(1); }
  return data?.value;
}

// Every write snapshots what it is about to replace, named by the second.
export async function writeStore(s, key, value) {
  const prev = await readStore(s, key);
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
  fs.mkdirSync('audit-out/sheets', { recursive: true });
  const backup = `audit-out/sheets/backup-${key}-${stamp}.json`;
  fs.writeFileSync(backup, JSON.stringify(prev));
  const { error } = await s.from('store').upsert({ key, value }, { onConflict: 'key' });
  if (error) { console.log('write failed', key, error.message); process.exit(1); }
  return backup;
}
