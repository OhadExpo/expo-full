// Vercel Cron — synthetic ATHLETE health check ("canary") v2.
//
// HISTORY (why each layer exists):
//   * 2026-06-06 — an RLS lock on `store` silently broke the athlete LOGIN
//     gate. Unnoticed ~2 days until a real client (Omer) was locked out.
//     → v1: log in AS an athlete, walk the core read path, page on failure.
//   * 2026-06-12 — a dropped EXECUTE grant on current_trainee_id() broke
//     every athlete VIDEO UPLOAD while v1 stayed green (it never exercised
//     the function or storage). A client found it mid-workout, again.
//     → v2 (this file): walk EVERY portal read path, write probes for the
//       paths athletes actually write (presence heartbeat, video upload in
//       the exact x-upsert shape the app sends), and — the real net — an
//       RLS DRIFT WATCH: hash the full prod policy/grant manifest against
//       the baseline committed in scripts/rls-baseline.json. ANY divergence
//       pages, including paths no synthetic check walks.
//
// Schedule: pg_cron (Supabase) hits this every 10 min with HEALTH_SECRET;
// vercel.json also runs it daily with CRON_SECRET as a dead-man's backup
// in case the pg_cron job itself dies.
//
// Intentional RLS changes: re-run `node scripts/regen-rls-baseline.cjs`
// and commit the new baseline IN THE SAME change, or the canary pages.

import webpush from 'web-push';
import { createHash } from 'node:crypto';
import baseline from '../../scripts/rls-baseline.json' with { type: 'json' };

const SUPA_URL = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const SUPA_PUBLISHABLE_KEY = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';
const CANARY_EMAIL = 'diego@diegoday.com'; // test fixture trainee — see CLAUDE.md
const CANARY_TRAINEE_ID = 'tr_diego';

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
    title: '⚠️ Athlete experience is BROKEN',
    body: `Synthetic athlete check failed: ${failure}. Clients are hitting this right now — check immediately.`,
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

// Stable stringify so the manifest hash is deterministic regardless of
// property order (jsonb is already canonical, but don't depend on it).
function stableStringify(v) {
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
  if (v && typeof v === 'object') {
    return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + stableStringify(v[k])).join(',') + '}';
  }
  return JSON.stringify(v);
}

// Human-readable first divergences so the push notification says WHAT moved,
// not just "something changed".
function diffManifest(base, live) {
  const out = [];
  const index = (arr, keyFn) => new Map((arr || []).map(e => [keyFn(e), stableStringify(e)]));
  const compare = (label, baseArr, liveArr, keyFn) => {
    const b = index(baseArr, keyFn), l = index(liveArr, keyFn);
    for (const k of b.keys()) {
      if (!l.has(k)) out.push(`${label} REMOVED: ${k}`);
      else if (l.get(k) !== b.get(k)) out.push(`${label} CHANGED: ${k}`);
    }
    for (const k of l.keys()) if (!b.has(k)) out.push(`${label} ADDED: ${k}`);
  };
  compare('policy', base.policies, live.policies, e => `${e.s}.${e.t}.${e.p}`);
  compare('function', base.functions, live.functions, e => e.f);
  compare('rls', base.rls, live.rls, e => e.t);
  return out;
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

    // 2. my_trainee() — the login gate.
    const mt = await fetch(`${SUPA_URL}/rest/v1/rpc/my_trainee`, { method: 'POST', headers: ah, body: '{}' });
    if (!mt.ok) throw new Error(`my_trainee HTTP ${mt.status}`);
    const trainee = await mt.json();
    if (!trainee || !trainee.id) throw new Error('my_trainee returned no match — login gate would deny this athlete');
    checks.myTrainee = trainee.id;

    // 3. current_trainee_id() — identity resolver behind storage policies
    // (the function whose dropped grant caused the 2026-06-12 upload outage).
    const ct = await fetch(`${SUPA_URL}/rest/v1/rpc/current_trainee_id`, { method: 'POST', headers: ah, body: '{}' });
    if (!ct.ok) throw new Error(`current_trainee_id HTTP ${ct.status} — athlete video uploads would fail`);
    const ctId = await ct.json();
    if (ctId !== CANARY_TRAINEE_ID) throw new Error(`current_trainee_id resolved "${ctId}" instead of ${CANARY_TRAINEE_ID}`);
    checks.identityResolver = 'ok';

    // 4. Reads that must return ROWS (RLS returns empty, not errors — a 200
    // with zero rows is exactly how the 2026-06-06 incident looked).
    const mustHaveRows = [
      ['plans', `${SUPA_URL}/rest/v1/plans?select=id&limit=1`],
      ['exercises', `${SUPA_URL}/rest/v1/store?key=eq.expo-exercises&select=key&limit=1`],
    ];
    for (const [name, url] of mustHaveRows) {
      const r = await fetch(url, { headers: ah });
      if (!r.ok) throw new Error(`${name} read HTTP ${r.status}`);
      const rows = await r.json();
      if (!Array.isArray(rows) || rows.length === 0) throw new Error(`${name} not readable by athlete (0 rows under RLS)`);
      checks[name] = 'ok';
    }

    // 5. Reads that must not ERROR (may legitimately be empty for the fixture).
    const mustNotError = [
      ['workouts', `${SUPA_URL}/rest/v1/client_workouts?select=id&limit=1`],
      ['bodyweight', `${SUPA_URL}/rest/v1/bw_logs?select=id&limit=1`],
      ['weeklyFocus', `${SUPA_URL}/rest/v1/weekly_focus?select=client_id&limit=1`],
      ['meals', `${SUPA_URL}/rest/v1/athlete_meals?select=id&limit=1`],
      ['messages', `${SUPA_URL}/rest/v1/coach_messages?select=id&limit=1`],
      ['challenges', `${SUPA_URL}/rest/v1/challenges?select=id&limit=1`],
    ];
    for (const [name, url] of mustNotError) {
      const r = await fetch(url, { headers: ah });
      if (!r.ok) throw new Error(`${name} read HTTP ${r.status}`);
      checks[name] = 'ok';
    }

    // 6. Presence heartbeat — the one store WRITE every athlete session does.
    const pres = await fetch(`${SUPA_URL}/rest/v1/store?on_conflict=key`, {
      method: 'POST',
      headers: { ...ah, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ key: `expo-presence-${CANARY_TRAINEE_ID}`, value: { clientId: CANARY_TRAINEE_ID, at: new Date().toISOString(), canary: true } }),
    });
    if (!pres.ok) throw new Error(`presence heartbeat HTTP ${pres.status}`);
    checks.presence = 'ok';

    // 7. Video upload — EXACT shape ClientPortal sends (POST + x-upsert) to a
    // fixed probe path. Run N is an insert, run N+1 onward exercises the
    // ON CONFLICT DO UPDATE arm (form_videos_update_own policy) — the precise
    // statement that died on 2026-06-12.
    const up = await fetch(`${SUPA_URL}/storage/v1/object/form-videos/${CANARY_TRAINEE_ID}/canary-upload-probe.txt`, {
      method: 'POST',
      headers: { ...ah, 'content-type': 'text/plain', 'x-upsert': 'true' },
      body: 'canary',
    });
    if (!up.ok) {
      let detail = '';
      try { detail = (await up.json())?.message || ''; } catch (_) { /* ignore */ }
      throw new Error(`video upload HTTP ${up.status}${detail ? ` — ${detail}` : ''}`);
    }
    checks.videoUpload = 'ok';

    // 8. STORAGE CAP WATCH — form-videos accumulates and never self-deletes;
    // the free-plan project cap is 1GB. Hitting it 413s EVERY upload for EVERY
    // athlete (a worse Ron incident). Page at 88% so there's runway to prune
    // old clips or upgrade before the wall. ~672MB / 1GB as of 2026-06-12.
    const STORAGE_CAP_BYTES = 1024 * 1024 * 1024;
    const STORAGE_WARN_FRAC = 0.88;
    const su = await fetch(`${SUPA_URL}/rest/v1/rpc/health_storage_usage`, {
      method: 'POST', headers: ah, body: JSON.stringify({ p_secret: process.env.HEALTH_SECRET }),
    });
    if (su.ok) {
      const usage = await su.json();
      const bytes = Number(usage?.bytes || 0);
      checks.storagePct = `${Math.round((bytes / STORAGE_CAP_BYTES) * 100)}%`;
      if (bytes > STORAGE_CAP_BYTES * STORAGE_WARN_FRAC) {
        throw new Error(`form-videos storage at ${checks.storagePct} of 1GB cap (${Math.round(bytes / 1e6)}MB) — prune old clips or upgrade before uploads start failing project-wide`);
      }
    } // soft-fail: if the probe errors, the drift check below still runs

    // 9. RLS DRIFT WATCH — full policy/grant manifest vs committed baseline.
    const mf = await fetch(`${SUPA_URL}/rest/v1/rpc/health_rls_manifest`, {
      method: 'POST', headers: ah, body: JSON.stringify({ p_secret: process.env.HEALTH_SECRET }),
    });
    if (!mf.ok) throw new Error(`rls manifest HTTP ${mf.status}`);
    const manifest = await mf.json();
    if (!manifest) throw new Error('rls manifest returned null (secret mismatch — rotate together!)');
    const liveHash = createHash('sha256').update(stableStringify(manifest)).digest('hex');
    if (liveHash !== baseline.hash) {
      const diffs = diffManifest(baseline.manifest, manifest);
      throw new Error(`RLS DRIFT detected (${diffs.length} changes): ${diffs.slice(0, 6).join(' | ')}${diffs.length > 6 ? ' | …' : ''}`);
    }
    checks.rlsDrift = 'none';
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
