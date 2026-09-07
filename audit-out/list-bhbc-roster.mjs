// Read-only: print the club roster names, so a lift is logged onto the right athlete.
import { createClient } from '@supabase/supabase-js';
const s = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co', 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv', { auth: { persistSession: false } });
const auth = await s.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: process.env.OWNER_PW || '1234' });
if (auth.error) { console.log('sign-in failed: ' + auth.error.message); process.exit(1); }
const roster = (await s.from('store').select('value').eq('key', 'expo-bhbc-roster').maybeSingle()).data?.value || [];
for (const p of roster) console.log(`${p.id}\t#${p.jersey}\t${p.name}\t${p.pos || ''}\t${p.status || ''}`);
console.log(roster.length + ' on the roster');
