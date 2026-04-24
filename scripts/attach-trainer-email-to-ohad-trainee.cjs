// Attach ohadyproductions@gmail.com as a second email on the Ohad trainee row
// (tr_ylc4i7edmnxqyj3j) so resolveRole returns role='both' when Ohad signs in
// with his trainer email — gives him access to both portals via the picker.
const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co', 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');

const TRAINEE_ID = 'tr_ylc4i7edmnxqyj3j';
const NEW_EMAIL = 'ohadyproductions@gmail.com';

(async () => {
  const { error: authErr } = await s.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });
  if (authErr) { console.error('auth:', authErr); process.exit(1); }

  const { data, error } = await s.from('store').select('value').eq('key', 'expo-trainees').maybeSingle();
  if (error) { console.error(error); process.exit(1); }
  const trainees = data?.value || [];

  const idx = trainees.findIndex(t => t.id === TRAINEE_ID);
  if (idx < 0) { console.error('Trainee not found:', TRAINEE_ID); process.exit(1); }

  const before = trainees[idx];
  const beforeEmail = before.email;
  const arr = Array.isArray(beforeEmail) ? beforeEmail.slice() : (beforeEmail ? [beforeEmail] : []);
  const lower = NEW_EMAIL.toLowerCase();
  if (arr.some(e => (e || '').toLowerCase() === lower)) {
    console.log('Already wired. No change.');
    process.exit(0);
  }
  arr.push(NEW_EMAIL);
  trainees[idx] = { ...before, email: arr };

  const { error: upErr } = await s.from('store').update({ value: trainees }).eq('key', 'expo-trainees');
  if (upErr) { console.error('update:', upErr); process.exit(1); }

  console.log('Updated trainee', TRAINEE_ID);
  console.log('  before email:', JSON.stringify(beforeEmail));
  console.log('  after  email:', JSON.stringify(arr));
})();
