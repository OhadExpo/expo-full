// bhbc-provision-coaches.mjs — create / repair the BHBC coach sign-ins.
//
// The BHBC zone gates on an email allowlist (src/auth.jsx BHBC_COACH_EMAILS),
// but an allowlisted email still needs a real Supabase auth user before anyone
// can sign in. This script provisions those users, idempotently, and then
// VERIFIES each one by actually signing in with the anon client — the same
// path the coach's browser takes.
//
//   node scripts/bhbc-provision-coaches.mjs            # verify only
//   node scripts/bhbc-provision-coaches.mjs --create   # create/repair, then verify
//
// Needs SUPABASE_SERVICE_ROLE_KEY in the environment for --create:
//   SUPABASE_SERVICE_ROLE_KEY=... node scripts/bhbc-provision-coaches.mjs --create
// (Verify-only needs no key.)
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SUPA_URL = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const ANON_KEY = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';
const PASSWORD = process.env.BHBC_COACH_PASSWORD || '1234';
const CREATE = process.argv.includes('--create');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Single source of truth: read the allowlist straight out of src/auth.jsx so
// this script can never drift from what the app actually lets in.
function coachEmails() {
  const src = readFileSync(join(HERE, '..', 'src', 'auth.jsx'), 'utf8');
  const m = /export const BHBC_COACH_EMAILS\s*=\s*\[([^\]]*)\]/.exec(src);
  if (!m) throw new Error('BHBC_COACH_EMAILS not found in src/auth.jsx');
  return [...m[1].matchAll(/['"]([^'"]+)['"]/g)].map((x) => x[1].toLowerCase());
}
function ptEmails() {
  const src = readFileSync(join(HERE, '..', 'src', 'auth.jsx'), 'utf8');
  const m = /export const PT_EMAILS\s*=\s*\[([^\]]*)\]/.exec(src);
  return m ? [...m[1].matchAll(/['"]([^'"]+)['"]/g)].map((x) => x[1].toLowerCase()) : [];
}

const STORE_KEYS = ['expo-bhbc-roster', 'expo-bhbc-loads', 'expo-bhbc-fixtures', 'expo-bhbc-league', 'expo-bhbc-medical'];

async function verify(email) {
  const sb = createClient(SUPA_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await sb.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) return { ok: false, reason: error.message };
  const { data: rows, error: rerr } = await sb.from('store').select('key').in('key', STORE_KEYS);
  const keys = rerr ? [] : (rows || []).map((r) => r.key.replace('expo-bhbc-', '')).sort();
  await sb.auth.signOut();
  return { ok: true, uid: data?.user?.id, confirmed: !!data?.user?.email_confirmed_at, keys, readError: rerr?.message || null };
}

async function main() {
  const emails = coachEmails();
  const pts = ptEmails();
  console.log(`BHBC coach sign-ins · ${emails.length} allowlisted · password "${PASSWORD}"`);

  if (CREATE) {
    if (!SERVICE_KEY) {
      console.error('\n  --create needs SUPABASE_SERVICE_ROLE_KEY in the environment.');
      console.error('  Settings → API → service_role key, then:');
      console.error('    SUPABASE_SERVICE_ROLE_KEY=... node scripts/bhbc-provision-coaches.mjs --create\n');
      process.exitCode = 2; return;
    }
    const admin = createClient(SUPA_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    for (const email of emails) {
      // Already there? Just make sure the password + confirmation are right.
      const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const existing = (list?.users || []).find((u) => (u.email || '').toLowerCase() === email);
      if (existing) {
        const { error } = await admin.auth.admin.updateUserById(existing.id, { password: PASSWORD, email_confirm: true });
        console.log(`  repair  ${email.padEnd(26)} ${error ? 'FAILED ' + error.message : 'password reset + confirmed'}`);
      } else {
        const { error } = await admin.auth.admin.createUser({
          email, password: PASSWORD, email_confirm: true,
          user_metadata: { role: 'bhbc_coach', is_pt: pts.includes(email) },
        });
        console.log(`  create  ${email.padEnd(26)} ${error ? 'FAILED ' + error.message : 'created'}`);
      }
    }
    console.log('');
  }

  let bad = 0;
  for (const email of emails) {
    const r = await verify(email);
    if (!r.ok) { bad++; console.log(`  ✕ ${email.padEnd(26)} CANNOT SIGN IN — ${r.reason}`); continue; }
    const role = pts.includes(email) ? 'coach+PT' : 'coach';
    const readable = r.keys.length ? r.keys.join(',') : 'NONE (RLS: run scripts/migrations/2026-08-18-bhbc-coach-rls.sql)';
    console.log(`  ✓ ${email.padEnd(26)} signs in · ${role} · reads: ${readable}${r.readError ? ' · ' + r.readError : ''}`);
  }
  if (bad) {
    console.log(`\n  ${bad}/${emails.length} cannot sign in. Run with --create (needs the service-role key) to provision them.`);
    process.exitCode = 1;
  } else {
    console.log(`\n  All ${emails.length} coach sign-ins work. They land on /bhbc → the Bnei Herzliya zone.`);
  }
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
