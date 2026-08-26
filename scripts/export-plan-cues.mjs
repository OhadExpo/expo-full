// Exports Ohad's own Hebrew cue text from his plan rows, for measuring his voice.
//
// This is the ground truth the `hebrew-voice` skill is built on: the Hebrew HE
// wrote, against which mine is judged. It is his private coaching material, so
// it is never committed and never sent to an external service — only strings
// that already ship publicly in the client bundle may go to a judge model.
//
//   EXPO_PW=... node scripts/export-plan-cues.mjs > cues.json
//   node scripts/hebrew-corpus.mjs --corpus cues.json
//
// No credential lives in this file. The password comes from the environment.
import { createClient } from '@supabase/supabase-js';

const URL = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const ANON = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';
const HEB = /[֐-׿]/;

const pw = process.env.EXPO_PW;
if (!pw) {
  console.error('Set EXPO_PW to the owner password. Nothing was exported.');
  process.exit(1);
}

const sb = createClient(URL, ANON);
const { error } = await sb.auth.signInWithPassword({
  email: process.env.EXPO_EMAIL || 'ohadyproductions@gmail.com',
  password: pw,
});
if (error) {
  console.error('sign-in failed:', error.message);
  process.exit(1);
}

const { data, error: e2 } = await sb.from('plans').select('data').limit(2000);
if (e2) {
  console.error('plans read failed:', e2.message);
  process.exit(1);
}

// Cue text hides at several depths and under several keys across the two plan
// shapes. Sweep every string rather than guess the path.
const out = new Set();
const sweep = (v) => {
  if (typeof v === 'string') { const t = v.trim(); if (t && HEB.test(t)) out.add(t); return; }
  if (Array.isArray(v)) { v.forEach(sweep); return; }
  if (v && typeof v === 'object') { for (const k of Object.keys(v)) sweep(v[k]); }
};
data.forEach((row) => sweep(row.data));
await sb.auth.signOut().catch(() => {});

console.error(`exported ${out.size} distinct Hebrew lines from ${data.length} plans`);
process.stdout.write(JSON.stringify([...out], null, 1));
