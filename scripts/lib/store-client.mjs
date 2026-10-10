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
    const get = (k) => (txt.match(new RegExp('^' + k + '\\s*=\\s*(.+)$', 'm')   /* '\s' in a string literal: a plain '\s' was the letter s (5.10) */) || [])[1];
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
// (2.10 #510-R2) The app's store writes are compare-and-swap on updated_at, so a
// script write must STAMP it - one that leaves it unchanged is invisible to them
// and a phone's queued edit lands on top of it. And between the backup read and
// the write, an app save is refused rather than overwritten: the write names the
// version it read, and if the row moved the script stops and says so (re-run it).
export async function writeStore(s, key, value) {
  const { data: cur, error: re } = await s.from('store').select('value, updated_at').eq('key', key).maybeSingle();
  if (re) { console.log('read failed', key, re.message); process.exit(1); }
  const prev = cur ? cur.value : undefined;
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
  fs.mkdirSync('audit-out/sheets', { recursive: true });
  const backup = `audit-out/sheets/backup-${key}-${stamp}.json`;
  fs.writeFileSync(backup, JSON.stringify(prev ?? null));   // a new key has no previous value
  const now = new Date().toISOString();
  let res;
  if (!cur) res = await s.from('store').insert({ key, value, updated_at: now }).select('updated_at');
  else if (cur.updated_at) res = await s.from('store').update({ value, updated_at: now }).eq('key', key).eq('updated_at', cur.updated_at).select('updated_at');
  else res = await s.from('store').update({ value, updated_at: now }).eq('key', key).select('updated_at');
  if (res.error) { console.log('write failed', key, res.error.message); process.exit(1); }
  if (!res.data || !res.data.length) { console.log(`write REFUSED for ${key}: it changed while this script ran (an app save landed). Nothing written - run it again.`); process.exit(1); }
  return backup;
}
