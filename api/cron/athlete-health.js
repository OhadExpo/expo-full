// Vercel Cron — synthetic ATHLETE LOGIN health check ("canary").
//
// Why this exists: on 2026-06-06 an RLS lock secured the `store` table but
// silently broke the athlete LOGIN gate (it still read the full trainees list
// athletes can no longer see). It went unnoticed for ~2 days until a real
// client (Omer) was locked out — because the change was only ever tested from
// the owner's seat, never from a fresh athlete's. This canary logs in AS an
// athlete every run and verifies the whole read path, so any future regression
// pages the coach within minutes instead of costing a client.
//
// Flow (all as the canary athlete, RLS-enforced — exactly what a real client hits):
//   1. Sign in (password grant) as the canary athlete.
//   2. rpc('my_trainee')  → must resolve the athlete's own record (the gate).
//   3. GET /plans         → must read (per-athlete RLS on the plans table).
//   4. GET store=expo-exercises → must read (library needed to render programs).
// Any failure → web-push the coach(es) via the secret-gated health_owner_subs RPC.
//
// Auth: Vercel cron sends `Authorization: Bearer <CRON_SECRET>`. We also accept
// `Bearer <HEALTH_SECRET>` so the check can be triggered manually for testing.

import webpush from 'web-push';

const SUPA_URL = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const SUPA_PUBLISHABLE_KEY = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';
const CANARY_EMAIL = 'diego@diegoday.com'; // test fixture trainee — see CLAUDE.md

export const config = { maxDuration: 60 };

function vapidReady() {
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:ohadyproductions@gmail.com';
  if (!pub || !priv) return false;
  webpush.setVapidDetails(subject, pub, priv);
  return true;
}

async function pageCoaches(failure) {
  const healthSecret = process.env.HEALTH_SECRET;
  if (!healthSecret || !vapidReady()) return { paged: 0, note: 'no VAPID/secret' };
  let subs = [];
  try {
    const r = await fetch(`${SUPA_URL}/rest/v1/rpc/health_owner_subs`, {
      method: 'POST',
      headers: { apikey: SUPA_PUBLISHABLE_KEY, Authorization: `Bearer ${SUPA_PUBLISHABLE_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ p_secret: healthSecret }),
    });
    if (r.ok) subs = await r.json();
  } catch (_) { /* ignore */ }
  if (!Array.isArray(subs)) subs = [];
  const payload = JSON.stringify({
    title: '⚠️ Athlete login is BROKEN',
    body: `Synthetic athlete check failed: ${failure}. New clients can't log in — check now.`,
    url: '/coach/dashboard',
    tag: 'athlete-health',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    requireInteraction: true,
  });
  let paged = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
      paged++;
    } catch (_) { /* dead sub — ignore here */ }
  }
  return { paged };
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ error: 'GET or POST only' });
    return;
  }
  const auth = req.headers.authorization || '';
  const okAuth =
    (process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`) ||
    (process.env.HEALTH_SECRET && auth === `Bearer ${process.env.HEALTH_SECRET}`);
  if (!okAuth) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const password = process.env.CANARY_PASSWORD;
  if (!password) {
    res.status(500).json({ error: 'CANARY_PASSWORD not configured.' });
    return;
  }

  let failure = null;
  const checks = {};
  try {
    // 1. Sign in as the canary athlete.
    const signIn = await fetch(`${SUPA_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: SUPA_PUBLISHABLE_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ email: CANARY_EMAIL, password }),
    });
    if (!signIn.ok) throw new Error(`sign-in HTTP ${signIn.status}`);
    const token = (await signIn.json())?.access_token;
    if (!token) throw new Error('sign-in returned no access_token');
    checks.signIn = 'ok';
    const ah = { apikey: SUPA_PUBLISHABLE_KEY, Authorization: `Bearer ${token}`, 'content-type': 'application/json' };

    // 2. my_trainee() — the gate. Must resolve the athlete's own record.
    const mt = await fetch(`${SUPA_URL}/rest/v1/rpc/my_trainee`, { method: 'POST', headers: ah, body: '{}' });
    if (!mt.ok) throw new Error(`my_trainee HTTP ${mt.status}`);
    const trainee = await mt.json();
    if (!trainee || !trainee.id) throw new Error('my_trainee returned no match — login gate would deny this athlete');
    checks.myTrainee = trainee.id;

    // 3. plans — per-athlete RLS on the normalized table.
    const plans = await fetch(`${SUPA_URL}/rest/v1/plans?select=id&limit=1`, { headers: ah });
    if (!plans.ok) throw new Error(`plans read HTTP ${plans.status}`);
    checks.plans = 'ok';

    // 4. exercise library — needed to render program exercise names/videos.
    const ex = await fetch(`${SUPA_URL}/rest/v1/store?key=eq.expo-exercises&select=key&limit=1`, { headers: ah });
    if (!ex.ok) throw new Error(`exercises read HTTP ${ex.status}`);
    const exRows = await ex.json();
    if (!Array.isArray(exRows) || exRows.length === 0) throw new Error('exercise library not readable by athlete');
    checks.exercises = 'ok';

    // 5. bodyweight — per-athlete RLS on the bw_logs table (read must not error).
    const bw = await fetch(`${SUPA_URL}/rest/v1/bw_logs?select=id&limit=1`, { headers: ah });
    if (!bw.ok) throw new Error(`bw_logs read HTTP ${bw.status}`);
    checks.bodyweight = 'ok';
  } catch (e) {
    failure = e?.message || 'unknown failure';
  }

  if (failure) {
    const alert = await pageCoaches(failure);
    res.status(200).json({ ok: false, failure, checks, alert });
    return;
  }
  res.status(200).json({ ok: true, checks });
}
