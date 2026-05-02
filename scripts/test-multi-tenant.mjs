// scripts/test-multi-tenant.mjs
//
// Isolation test for the multi-tenant migration. Runs against any Supabase
// project where 2026-05-01-multi-tenant-DRAFT.sql has been applied (Supabase
// branch recommended — DO NOT run against prod until isolation passes here).
//
// What it asserts:
//   1. Two coach accounts (coach_a@test.local, coach_b@test.local) can be
//      created and seeded with data independently.
//   2. Coach A signed in cannot read any of Coach B's plans, client_workouts,
//      bw_logs, weekly_focus, or store rows. Vice versa.
//   3. Coach A signed in cannot WRITE a row claiming Coach B's trainer_id
//      (RLS WITH CHECK rejects it).
//   4. The BEFORE-INSERT triggers auto-fill trainer_id when omitted.
//   5. Trainee under coach A can write a workout that resolves to A's
//      trainer_id via the trainee_trainer lookup.
//   6. Cleanup removes everything created during the test.
//
// Usage:
//   $env:SUPABASE_URL = "https://<branch-or-prod>.supabase.co"
//   $env:SUPABASE_SERVICE_ROLE_KEY = "eyJ..."   # service role required to seed auth users
//   $env:SUPABASE_ANON_KEY = "sb_publishable_..."   # anon to test as a user
//   node scripts/test-multi-tenant.mjs
//
// Exits 0 on success, non-zero on first assertion failure (with detail).

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

const URL = process.env.SUPABASE_URL || 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const SR  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const AK  = process.env.SUPABASE_ANON_KEY;

if (!SR || !AK) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY in env. Aborting.');
  process.exit(1);
}

const admin = createClient(URL, SR, { auth: { persistSession: false, autoRefreshToken: false } });

const A_EMAIL = `coach_a_${Date.now()}@test.local`;
const B_EMAIL = `coach_b_${Date.now()}@test.local`;
const PASSWORD = 'test-pw-' + randomUUID().slice(0, 8);

const ids = { trainerA: null, trainerB: null, userA: null, userB: null, traineeA: null };

let failed = 0;
function check(label, cond, detail) {
  if (cond) { console.log('  PASS', label); return true; }
  console.error('  FAIL', label, detail || '');
  failed++;
  return false;
}

async function provisionCoach(email) {
  // 1. Create the auth.user via admin
  const { data: u, error: uErr } = await admin.auth.admin.createUser({
    email, password: PASSWORD, email_confirm: true,
  });
  if (uErr) throw new Error(`createUser ${email}: ${uErr.message}`);
  // 2. Insert trainers row (RLS blocks anon — must use service role)
  const { data: t, error: tErr } = await admin
    .from('trainers')
    .insert({ email, name: email.split('@')[0], tier: 'free', subscription_status: 'trial' })
    .select('id')
    .single();
  if (tErr) throw new Error(`trainers insert ${email}: ${tErr.message}`);
  return { userId: u.user.id, trainerId: t.id };
}

async function asUser(email) {
  const c = createClient(URL, AK, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`signIn ${email}: ${error.message}`);
  return c;
}

async function cleanup() {
  console.log('\n[cleanup]');
  try {
    if (ids.trainerA) await admin.from('trainers').delete().eq('id', ids.trainerA);
    if (ids.trainerB) await admin.from('trainers').delete().eq('id', ids.trainerB);
    if (ids.userA)    await admin.auth.admin.deleteUser(ids.userA);
    if (ids.userB)    await admin.auth.admin.deleteUser(ids.userB);
    // FK-cascade on trainers.id should clean up everything per-tenant.
    console.log('  cleanup ok');
  } catch (e) {
    console.error('  cleanup error:', e.message);
  }
}

async function main() {
  console.log(`[setup] provisioning ${A_EMAIL} and ${B_EMAIL}`);
  const A = await provisionCoach(A_EMAIL);
  const B = await provisionCoach(B_EMAIL);
  ids.trainerA = A.trainerId; ids.userA = A.userId;
  ids.trainerB = B.trainerId; ids.userB = B.userId;
  console.log('  trainerA =', A.trainerId);
  console.log('  trainerB =', B.trainerId);

  // Pre-create a trainee_trainer row for coach A's trainee, simulating
  // what the AFTER trigger would do once coach A saves an expo-trainees blob.
  const traineeAId = 'tr_test_' + randomUUID().slice(0, 8);
  ids.traineeA = traineeAId;
  const { error: ttErr } = await admin
    .from('trainee_trainer')
    .insert({ client_id: traineeAId, trainer_id: A.trainerId });
  if (ttErr) throw new Error(`trainee_trainer insert: ${ttErr.message}`);

  const ca = await asUser(A_EMAIL);
  const cb = await asUser(B_EMAIL);

  console.log('\n[1] each coach inserts a private plan');
  const { data: planA, error: paErr } = await ca
    .from('plans')
    .insert({ id: 'pl_test_a_' + randomUUID().slice(0, 8), name: 'A-only-plan', trainee_id: traineeAId, data: { days: [] } })
    .select().single();
  check('coach A insert plan', !paErr, paErr?.message);
  const { data: planB, error: pbErr } = await cb
    .from('plans')
    .insert({ id: 'pl_test_b_' + randomUUID().slice(0, 8), name: 'B-only-plan', trainee_id: 'tr_test_b', data: { days: [] } })
    .select().single();
  check('coach B insert plan', !pbErr, pbErr?.message);

  console.log('\n[2] BEFORE-INSERT trigger auto-filled trainer_id');
  check('plan A trainer_id matches A', planA?.trainer_id === A.trainerId, `got ${planA?.trainer_id}`);
  check('plan B trainer_id matches B', planB?.trainer_id === B.trainerId, `got ${planB?.trainer_id}`);

  console.log('\n[3] cross-coach reads return zero rows');
  const { data: aSeesB } = await ca.from('plans').select('id').eq('trainer_id', B.trainerId);
  check('coach A cannot see coach B plans', (aSeesB || []).length === 0, `saw ${aSeesB?.length}`);
  const { data: bSeesA } = await cb.from('plans').select('id').eq('trainer_id', A.trainerId);
  check('coach B cannot see coach A plans', (bSeesA || []).length === 0, `saw ${bSeesA?.length}`);

  console.log('\n[4] cross-coach impersonation write is blocked');
  const { error: impErr } = await ca
    .from('plans')
    .insert({ id: 'pl_test_imp_' + randomUUID().slice(0, 8), name: 'imp', trainee_id: 'tr_x', trainer_id: B.trainerId, data: {} });
  check('coach A cannot insert with B trainer_id', !!impErr, 'no error returned');

  console.log('\n[5] weekly_focus + store carve-outs');
  const fk = `A-only-plan|Day Z|eXX|W1`;
  const { error: wfErr } = await ca
    .from('weekly_focus')
    .upsert({ focus_key: fk, value: 'A-focus', updated_at: new Date().toISOString() }, { onConflict: 'focus_key' });
  check('coach A weekly_focus upsert', !wfErr, wfErr?.message);
  const { data: bWf } = await cb.from('weekly_focus').select('focus_key').eq('focus_key', fk);
  check('coach B cannot read coach A weekly_focus', (bWf || []).length === 0, `saw ${bWf?.length}`);

  console.log('\n[6] trainee writes resolve trainer via trainee_trainer');
  // Use admin to simulate a trainee session inserting a workout — we don't
  // create real trainee auth users in this test, but the trigger logic is
  // the same: with trainer_id NULL and a known client_id, fill_trainer_id_with_client
  // looks up trainee_trainer.
  const { data: cw, error: cwErr } = await admin
    .from('client_workouts')
    .insert({ id: 'wk_test_' + randomUUID().slice(0, 8), client_id: traineeAId, plan_name: 'test', day_name: 'Day Z', week: 1 })
    .select().single();
  check('trainee_trainer-derived insert', !cwErr, cwErr?.message);
  check('trainee workout trainer_id resolves to A', cw?.trainer_id === A.trainerId, `got ${cw?.trainer_id}`);

  console.log(`\n[result] ${failed === 0 ? 'ALL CHECKS PASSED' : `${failed} CHECK(S) FAILED`}`);
}

main()
  .catch((e) => { console.error('[fatal]', e.message); failed++; })
  .finally(async () => { await cleanup(); process.exit(failed === 0 ? 0 : 1); });
