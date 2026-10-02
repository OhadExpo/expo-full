// POST /api/push/subscribe — register a Web Push subscription.
//
// Body: { subscription: { endpoint, keys: { p256dh, auth } }, role: 'coach' | 'athlete' }
// Auth: Authorization: Bearer <supabase access token>
//
// Upserts on endpoint (so re-subscribing the same browser doesn't
// create duplicate rows). The Supabase row's user_email is enforced
// by RLS to match the JWT claim — we don't trust the client to set it.

// EVERY OUTBOUND CALL ENDS BEFORE THIS FUNCTION'S OWN KILL (2.10 #510-B9): a
// hung upstream ran to maxDuration and the caller got Vercel's plaintext 504
// instead of this handler's JSON error. An abort is an error the handler
// already catches. A caller's own signal wins.
const FETCH_TIMEOUT_MS = 10000;
const fetch = (url, opts = {}) => globalThis.fetch(url, { ...opts, signal: opts.signal || AbortSignal.timeout(FETCH_TIMEOUT_MS) });

const SUPA_URL = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const SUPA_PUBLISHABLE_KEY = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST only' });
    return;
  }

  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing Authorization bearer token.' });
    return;
  }
  const accessToken = authHeader.slice('Bearer '.length).trim();

  const body = req.body || {};
  const sub = body.subscription || {};
  const role = body.role;
  if (!sub.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
    res.status(400).json({ error: 'subscription.endpoint + keys are required.' });
    return;
  }
  if (role !== 'coach' && role !== 'athlete') {
    res.status(400).json({ error: 'role must be "coach" or "athlete".' });
    return;
  }

  // Resolve the caller's email from the token (server-side, can't trust client).
  let userEmail;
  try {
    const userR = await fetch(`${SUPA_URL}/auth/v1/user`, {
      headers: {
        'apikey': SUPA_PUBLISHABLE_KEY,
        'Authorization': `Bearer ${accessToken}`,
      },
    });
    if (!userR.ok) {
      res.status(401).json({ error: `auth lookup failed (${userR.status})` });
      return;
    }
    const userJson = await userR.json();
    userEmail = userJson?.email;
    if (!userEmail) {
      res.status(401).json({ error: 'No email on user.' });
      return;
    }
  } catch (e) {
    res.status(500).json({ error: 'Failed to resolve user.' });
    return;
  }
  // THE SANDBOX SEAT HAS NOTHING REAL TO BE TOLD ABOUT (1.10 audit): refused here
  // too, not only in the client - a coach-role row from the partner would sit
  // beside the owner's. Same list as src/authRoles.js PARTNER_EMAILS.
  if (['eladeluz24@gmail.com'].includes(String(userEmail).toLowerCase())) {
    res.status(403).json({ error: 'Notifications are off in the sandbox.' });
    return;
  }

  // ONLY A REAL PUSH SERVICE, AND NOT A THOUSAND OF THEM (2.10 #510 security
  // round 2): the endpoint was stored as given, so an athlete could register any
  // URL - or thousands - and make the server POST blind to them on every push.
  // A browser's endpoint is always https on its vendor's push service.
  const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^android\.googleapis\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)push\.apple\.com$/, /(^|\.)notify\.windows\.com$/];
  let host = '';
  try { const u = new URL(String(sub.endpoint)); if (u.protocol === 'https:') host = u.hostname.toLowerCase(); } catch { /* not a URL */ }
  if (!host || !PUSH_HOSTS.some((re) => re.test(host)) || String(sub.endpoint).length > 1000
      || String(sub.keys.p256dh || '').length > 200 || String(sub.keys.auth || '').length > 100) {
    res.status(400).json({ error: 'Not a browser push subscription.' });
    return;
  }
  try {
    const listR = await fetch(`${SUPA_URL}/rest/v1/push_subscriptions?select=endpoint&user_email=eq.${encodeURIComponent(userEmail)}`, {
      headers: { 'apikey': SUPA_PUBLISHABLE_KEY, 'Authorization': `Bearer ${accessToken}` },
    });
    if (listR.ok) {
      const mine = await listR.json().catch(() => []);
      if (Array.isArray(mine) && mine.length >= 10 && !mine.some((r) => r && r.endpoint === sub.endpoint)) {
        res.status(429).json({ error: 'Too many devices subscribed - remove one first.' });
        return;
      }
    }
  } catch { /* the cap is best effort; the upsert below still runs under RLS */ }

  const row = {
    user_email: userEmail,
    role,
    endpoint: sub.endpoint,
    p256dh: sub.keys.p256dh,
    auth: sub.keys.auth,
    user_agent: String(req.headers['user-agent'] || '').slice(0, 500),
    last_seen_at: new Date().toISOString(),
  };

  // Upsert via PostgREST. on_conflict=endpoint so re-subscribing
  // updates the row instead of erroring on the unique constraint.
  const upsertR = await fetch(
    `${SUPA_URL}/rest/v1/push_subscriptions?on_conflict=endpoint`,
    {
      method: 'POST',
      headers: {
        'apikey': SUPA_PUBLISHABLE_KEY,
        'Authorization': `Bearer ${accessToken}`,
        'content-type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(row),
    }
  );
  if (!upsertR.ok) {
    const text = await upsertR.text().catch(() => '');
    console.error('push/subscribe upsert failed:', upsertR.status, text.slice(0, 300));
    res.status(502).json({ error: `upsert failed (${upsertR.status})` });
    return;
  }

  res.status(200).json({ ok: true });
}
