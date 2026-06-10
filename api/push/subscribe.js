// POST /api/push/subscribe — register a Web Push subscription.
//
// Body: { subscription: { endpoint, keys: { p256dh, auth } }, role: 'coach' | 'athlete' }
// Auth: Authorization: Bearer <supabase access token>
//
// Upserts on endpoint (so re-subscribing the same browser doesn't
// create duplicate rows). The Supabase row's user_email is enforced
// by RLS to match the JWT claim — we don't trust the client to set it.

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
