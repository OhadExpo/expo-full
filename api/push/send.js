// POST /api/push/send — server-side send entrypoint.
//
// Used by INTERNAL triggers (CoachMessages.send, workout completion).
// Looks up all subscriptions for the target user email, encrypts the
// payload for each device, fires push requests via the web-push lib.
//
// Auth: Authorization: Bearer <supabase access token> from the caller
// (we trust the JWT to identify *who is sending*, not who receives).
// The target user is specified in the request body so a coach can
// push to an athlete and vice versa.
//
// To call this internally without exposing it publicly we just gate on
// a valid Supabase session — anyone can in theory hit it, but they
// could only push to people whose email they know AND the message
// content is what they send. Acceptable risk for solo-coach scale;
// when multi-tenant kicks in we'll add a coach_email match check.
//
// Failed sends with a 410/404 from the push service mean the
// subscription is stale (browser uninstalled the SW, user revoked
// permission) — we delete those rows so they don't keep failing.

import webpush from 'web-push';

const SUPA_URL = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const SUPA_PUBLISHABLE_KEY = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';

export const config = { maxDuration: 15 };

function configured() {
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:ohadyproductions@gmail.com';
  if (!pub || !priv) return null;
  webpush.setVapidDetails(subject, pub, priv);
  return true;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST only' });
    return;
  }
  if (!configured()) {
    res.status(500).json({ error: 'VAPID keys not configured on the server.' });
    return;
  }

  // Caller must hold a Supabase session — same gate as the rest of
  // the authenticated API surface.
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing Authorization bearer token.' });
    return;
  }
  const callerToken = authHeader.slice('Bearer '.length).trim();

  const body = req.body || {};
  const toEmail = String(body.toEmail || '').trim().toLowerCase();
  const title   = String(body.title || 'EXPO').slice(0, 80);
  const text    = String(body.body  || '').slice(0, 200);
  const url     = String(body.url   || '/').slice(0, 200);
  const tag     = String(body.tag   || '').slice(0, 100) || undefined;

  if (!toEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(toEmail)) {
    res.status(400).json({ error: 'toEmail required (valid email).' });
    return;
  }

  // Fetch subscriptions for the target user using the CALLER's token —
  // RLS will deny the read unless the caller IS the target. Since coach
  // and athlete are different users this won't work directly. Use the
  // PostgREST endpoint with the publishable (anon) key + a bypass: this
  // endpoint exposes a SECURITY DEFINER lookup. For solo-coach scale we
  // fall back to the publishable key + a `user_email=eq.` filter, which
  // works because push_subscriptions RLS only restricts to "your own
  // rows" for authenticated reads — anon reads still need a policy. So
  // we add a service-side read via a SECURITY DEFINER RPC, OR (simpler
  // for now) — gate by checking the caller's email against an allowed
  // sender list. Single-coach: only ohadyproductions@gmail.com is the
  // sender; the athlete app calls /api/push/send to push to the coach.
  // ---
  // Implementation note: rather than introduce a new RPC, we look up
  // the caller's email and require it to be either (a) the target
  // (self-push, e.g. test) or (b) match a known coach for the target.
  // For solo-coach we trust any authenticated caller — the data flow
  // already restricts who can hit /api/push/send to authed users.

  let callerEmail;
  try {
    const userR = await fetch(`${SUPA_URL}/auth/v1/user`, {
      headers: {
        'apikey': SUPA_PUBLISHABLE_KEY,
        'Authorization': `Bearer ${callerToken}`,
      },
    });
    if (!userR.ok) {
      res.status(401).json({ error: 'auth lookup failed' });
      return;
    }
    callerEmail = (await userR.json())?.email?.toLowerCase();
  } catch {
    res.status(500).json({ error: 'auth lookup error' });
    return;
  }
  if (!callerEmail) {
    res.status(401).json({ error: 'no caller identity' });
    return;
  }

  // Sender authorization. Legitimate flows are exactly:
  //   coach → athlete (CoachMessages / review), athlete → coach
  //   (message-to-coach, workout-complete), and self (device test).
  // Anything else lets one athlete push attacker-controlled
  // notifications (title/body/url) to another athlete's devices.
  const OWNER_EMAIL = 'ohadyproductions@gmail.com';
  if (callerEmail !== OWNER_EMAIL && toEmail !== OWNER_EMAIL && toEmail !== callerEmail) {
    res.status(403).json({ error: 'Not allowed to push to this target.' });
    return;
  }

  // Resolve target's subscriptions via SECURITY DEFINER RPC. Avoids
  // needing a service-role key in env — the function is gated to
  // authenticated callers and has the same trust boundary as the
  // existing coach_messages insert path.
  const subsR = await fetch(
    `${SUPA_URL}/rest/v1/rpc/lookup_push_subscriptions`,
    {
      method: 'POST',
      headers: {
        'apikey': SUPA_PUBLISHABLE_KEY,
        'Authorization': `Bearer ${callerToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ target_email: toEmail }),
    }
  );
  if (!subsR.ok) {
    const t = await subsR.text().catch(() => '');
    console.error('push/send subs lookup failed:', subsR.status, t.slice(0, 300));
    res.status(502).json({ error: `subs lookup failed (${subsR.status})` });
    return;
  }
  const subs = await subsR.json();
  if (!Array.isArray(subs) || subs.length === 0) {
    res.status(200).json({ ok: true, sent: 0, note: 'no subscriptions for this user' });
    return;
  }

  const payload = JSON.stringify({
    title, body: text, url, tag,
    icon: '/icon-192.png', badge: '/icon-192.png',
  });

  const results = await Promise.allSettled(subs.map(async (s) => {
    const pushSub = { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } };
    try {
      await webpush.sendNotification(pushSub, payload);
      return { id: s.id, ok: true };
    } catch (e) {
      const status = e?.statusCode || 0;
      // 404/410 = subscription is dead (user removed PWA or revoked).
      if (status === 404 || status === 410) {
        // Best-effort cleanup via the SECURITY DEFINER RPC; ignore failures.
        await fetch(
          `${SUPA_URL}/rest/v1/rpc/cleanup_push_subscription`,
          {
            method: 'POST',
            headers: {
              'apikey': SUPA_PUBLISHABLE_KEY,
              'Authorization': `Bearer ${callerToken}`,
              'content-type': 'application/json',
            },
            body: JSON.stringify({ sub_id: s.id }),
          }
        ).catch(() => {});
        return { id: s.id, gone: true };
      }
      return { id: s.id, error: e?.message || String(e), status };
    }
  }));

  const sent  = results.filter(r => r.value?.ok).length;
  const gone  = results.filter(r => r.value?.gone).length;
  const errs  = results.filter(r => r.value?.error).length;
  res.status(200).json({ ok: true, sent, gone, errors: errs, total: subs.length });
}
