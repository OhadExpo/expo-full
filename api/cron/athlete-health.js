// Vercel Cron — synthetic ATHLETE health check ("canary") v2.
//
// HISTORY (why each layer exists):
//   * 2026-06-06 — an RLS lock on `store` silently broke the athlete LOGIN
//     gate. Unnoticed ~2 days until a real client was locked out.
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

// EVERY OUTBOUND CALL ENDS BEFORE THIS FUNCTION'S OWN KILL (2.10 #510-B9): a
// hung upstream ran to maxDuration and the caller got Vercel's plaintext 504
// instead of this handler's JSON error. An abort is an error the handler
// already catches. A caller's own signal wins.
const FETCH_TIMEOUT_MS = 55000;
const fetch = (url, opts = {}) => globalThis.fetch(url, { ...opts, signal: opts.signal || AbortSignal.timeout(FETCH_TIMEOUT_MS) });

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

async function pageCoaches(failure, blind = false) {
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
  // BLIND = the canary could not log in but Supabase Auth itself is answering:
  // athletes are probably fine, yet NOTHING behind the login is being checked
  // until the fixture password is fixed. Different words, same urgency.
  // A DRIFT is not an outage (#963, 23.10: a function added by a migration paged 'Athlete experience is BROKEN - clients
  // are hitting this right now'; nothing was broken). It still pages - an unexplained rule change can be a hole - but
  // says what it is.
  const drift = /^RLS DRIFT/.test(String(failure || ''));
  const payload = JSON.stringify(drift ? {
    title: '⚠️ Database rules changed',
    body: `${failure}. Nothing here is known to be broken: a security rule or function changed without its baseline. If no release was made just now, check it.`,
    url: '/coach/dashboard',
    tag: 'athlete-health-drift',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    requireInteraction: true,
  } : blind ? {
    title: '⚠️ Athlete monitor is BLIND',
    body: `The test athlete cannot log in (${failure}). Supabase Auth is up, so athletes are probably fine — but no athlete path is being checked until this is fixed.`,
    url: '/coach/dashboard',
    tag: 'athlete-health',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    requireInteraction: true,
  } : {
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
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { timeout: 5000 });
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

// EVERY ALERT ALSO REACHES CLAUDE (#909, Ohad 23.10: "make some sort of autonomous check everytime a message like
// this pops up... So I will stop needing to screenshot and send you the errors"). The push above goes to his phone
// only; nothing kept a copy, so a session never saw it. The failure is filed into bug_reports like an auto-captured
// app error - the daemon's bugs-to-queue step puts it on the live queue with the rest, grouped by this fingerprint
// (numbers stripped, so a check failing every 10 minutes is ONE queue line counted xN, not a line per run).
async function fileHealthReport(failure, blind) {
  try {
    const fp = `health: ${String(failure).replace(/\d+/g, '#').slice(0, 160)}`;
    const r = await fetch(`${SUPA_URL}/rest/v1/bug_reports`, {
      method: 'POST',
      headers: { apikey: SUPA_PUBLISHABLE_KEY, Authorization: `Bearer ${SUPA_PUBLISHABLE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({
        role: 'anon',
        url: 'https://expo-app.co.il/api/cron/athlete-health',
        description: `HEALTH · ${blind ? 'BLIND · ' : ''}${String(failure).slice(0, 400)}`,
        context: { auto: true, fingerprint: fp, source: 'athlete-health cron', release: process.env.VERCEL_GIT_COMMIT_SHA || '' },
      }),
      signal: AbortSignal.timeout(4000),
    });
    return r.ok ? 'filed' : `file failed HTTP ${r.status}`;
  } catch (e) {
    return `file failed ${e?.message || e}`;
  }
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
  // the once-a-day Vercel run (CRON_SECRET) is the one that can see the 10-minute runs being refused (step 10)
  const dailyRun = !!process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`;
  // The fixture's password is the system default every verify script signs in
  // with ('1234'). CANARY_PASSWORD drifted from it (21.10) and the monitor went
  // blind for two days over a Vercel setting. The env var is tried first; when
  // Auth rejects it the shared fixture default is tried, so a stale variable
  // costs a note in the JSON, not the whole athlete check.
  const FIXTURE_DEFAULT_PW = '1234';
  const candidates = [...new Set([process.env.CANARY_PASSWORD, FIXTURE_DEFAULT_PW].filter(Boolean))];

  let failure = null;
  let blind = false;
  const checks = {};
  try {
    // 1. Sign in as the canary athlete.
    const trySignIn = (password) => fetch(`${SUPA_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: SUPA_PUBLISHABLE_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ email: CANARY_EMAIL, password }),
    });
    let signIn = null, code = '';
    for (const [i, pw] of candidates.entries()) {
      signIn = await trySignIn(pw);
      if (signIn.ok) { if (i > 0) checks.canaryPasswordEnv = 'stale - signed in with the fixture default; set CANARY_PASSWORD=1234 in Vercel'; break; }
      code = '';
      try { const b = await signIn.json(); code = b?.error_code || b?.msg || ''; } catch (_) { /* ignore */ }
      if (code !== 'invalid_credentials') break;   // Auth itself is failing - no point trying another password
    }
    if (!signIn.ok) {
      // invalid_credentials on EVERY candidate = the fixture's own password moved
      // (not proof athletes are locked out). Name the code so the page says which.
      const hint = code === 'invalid_credentials' ? ' — fixture password matches neither CANARY_PASSWORD nor the default; reset diego in Supabase Auth' : '';
      if (code === 'invalid_credentials') {
        try { blind = (await fetch(`${SUPA_URL}/auth/v1/health`, { headers: { apikey: SUPA_PUBLISHABLE_KEY } })).ok; } catch (_) { /* stays BROKEN */ }
      }
      throw new Error(`sign-in HTTP ${signIn.status}${code ? ` ${code}` : ''}${hint}`);
    }
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

    // 8. STORAGE CAP WATCH — form-videos accumulates and never self-deletes.
    // The project is on Supabase PRO since 2026-08-14 (100GB storage included);
    // the old 1GB here was the free-plan cap and paged a false "BROKEN" at
    // 1.9GB on 2026-10-23 (#908). Page at 88% so there's runway to prune or
    // raise the plan. ~1.9GB / 100GB, growing ~0.25GB a month, as of 2026-10-23.
    const STORAGE_CAP_GB = 100;
    const STORAGE_CAP_BYTES = STORAGE_CAP_GB * 1024 * 1024 * 1024;
    const STORAGE_WARN_FRAC = 0.88;
    const su = await fetch(`${SUPA_URL}/rest/v1/rpc/health_storage_usage`, {
      method: 'POST', headers: ah, body: JSON.stringify({ p_secret: process.env.HEALTH_SECRET }),
    });
    if (su.ok) {
      const usage = await su.json();
      const bytes = Number(usage?.bytes || 0);
      checks.storagePct = `${Math.round((bytes / STORAGE_CAP_BYTES) * 100)}%`;
      if (bytes > STORAGE_CAP_BYTES * STORAGE_WARN_FRAC) {
        throw new Error(`form-videos storage at ${checks.storagePct} of ${STORAGE_CAP_GB}GB cap (${Math.round(bytes / 1e6)}MB) — prune old clips or upgrade before uploads start failing project-wide`);
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

    // 10. THE 10-MINUTE RUNS THEMSELVES (#932, 23.10): pg_cron kept sending an old token after the secret was rotated,
    // every run came back 401 and nothing said so - only this daily run was checking anything. The daily run reads the
    // last 3 hours of pg_net responses; refusals and not one success = the every-10-minutes watch is locked out.
    if (dailyRun) {
      const cr = await fetch(`${SUPA_URL}/rest/v1/rpc/health_cron_refusals`, {
        method: 'POST', headers: ah, body: JSON.stringify({ p_secret: process.env.HEALTH_SECRET }),
      });
      const c = cr.ok ? await cr.json() : null;
      if (c) {
        checks.cronRuns = `${c.ok} ok / ${c.refused} refused in 3h`;
        if (Number(c.refused) >= 3 && Number(c.ok) === 0) {
          throw new Error(`the 10-minute health check is being refused (${c.refused}x 401 in 3h, last success ${c.last_ok || 'never in the log'}) - pg_cron's token no longer matches HEALTH_SECRET`);
        }
      }
    }
  } catch (e) {
    failure = e?.message || 'unknown failure';
  }

  if (failure) {
    // both at once, so a run near its time limit still files the report (#933 review: filing came after paging and
    // was the part an outage-length run lost)
    const [pa, fi] = await Promise.allSettled([pageCoaches(failure, blind), fileHealthReport(failure, blind)]);
    const alert = pa.status === 'fulfilled' ? pa.value : `page failed: ${pa.reason?.message || pa.reason}`;
    const filed = fi.status === 'fulfilled' ? fi.value : `file failed: ${fi.reason?.message || fi.reason}`;
    res.status(200).json({ ok: false, blind, failure, checks, alert, filed });
    return;
  }
  res.status(200).json({ ok: true, checks });
}
