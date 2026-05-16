// Vercel Cron — daily "you missed your session" push for athletes.
//
// Schedule: defined in vercel.json under `crons[]`. Vercel sends a
// daily GET to /api/cron/missed-day-nudge with
// `Authorization: Bearer <CRON_SECRET>` so we know the request is
// real and not someone hitting the public URL.
//
// Flow:
//   1. Verify the bearer token matches CRON_SECRET.
//   2. Call secret-gated SECURITY DEFINER RPC `cron_missed_day_targets`
//      which returns athletes who haven't trained in >= N days AND
//      haven't been nudged in the last M days. Each row includes one
//      push subscription (the join unrolls per device).
//   3. Group by user_email so an athlete with 2 devices gets ONE
//      decision but pushes to both.
//   4. For each, encrypt + send via web-push. On 410/404 we delete
//      the dead subscription. On success we log a nudge row so the
//      throttle skips this user on the next run.
//
// CRON_SECRET is shared between Vercel env vars and the Postgres
// RPC body so any leak in either place mutually invalidates the
// other — rotate both together.

import webpush from 'web-push';

const SUPA_URL = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const SUPA_PUBLISHABLE_KEY = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';

export const config = { maxDuration: 60 };

function configured() {
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:ohadyproductions@gmail.com';
  if (!pub || !priv) return null;
  webpush.setVapidDetails(subject, pub, priv);
  return true;
}

async function callRpc(name, args) {
  const r = await fetch(`${SUPA_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      'apikey': SUPA_PUBLISHABLE_KEY,
      'Authorization': `Bearer ${SUPA_PUBLISHABLE_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(args),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error(`rpc ${name} failed (${r.status}): ${t.slice(0, 200)}`);
  }
  return r.json();
}

export default async function handler(req, res) {
  // Vercel cron sends GET. We accept GET + POST for manual triggering.
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ error: 'GET or POST only' });
    return;
  }

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    res.status(500).json({ error: 'CRON_SECRET not configured.' });
    return;
  }
  const auth = req.headers.authorization || '';
  if (auth !== `Bearer ${cronSecret}`) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  if (!configured()) {
    res.status(500).json({ error: 'VAPID keys not configured.' });
    return;
  }

  let rows;
  try {
    rows = await callRpc('cron_missed_day_targets', {
      cron_secret: cronSecret,
      days_threshold: 2,
      throttle_days: 5,
    });
  } catch (e) {
    res.status(502).json({ error: e?.message || 'rpc lookup failed' });
    return;
  }
  if (!Array.isArray(rows)) rows = [];

  // Group rows by user_email — each athlete can have multiple
  // subscriptions (phone + desktop). We send to all but log once.
  const byUser = new Map();
  for (const r of rows) {
    if (!byUser.has(r.user_email)) {
      byUser.set(r.user_email, { name: r.athlete_name, days: r.days_since, subs: [] });
    }
    byUser.get(r.user_email).subs.push({
      id: r.sub_id, endpoint: r.endpoint,
      keys: { p256dh: r.p256dh, auth: r.auth },
    });
  }

  let sent = 0, gone = 0, errors = 0;
  for (const [email, info] of byUser) {
    const first = (info.name || '').split(' ')[0] || 'there';
    const payload = JSON.stringify({
      title: `${first}, you missed your last session`,
      body: `It's been ${info.days} day${info.days === 1 ? '' : 's'} — log a workout when you can.`,
      url: '/athlete',
      tag: `missed-day:${email}`,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
    });
    let anySent = false;
    for (const s of info.subs) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, payload);
        sent++;
        anySent = true;
      } catch (e) {
        const status = e?.statusCode || 0;
        if (status === 404 || status === 410) {
          // Dead subscription — clean up so the next run skips it.
          await callRpc('cron_cleanup_push_subscription', {
            cron_secret: cronSecret, sub_id: s.id,
          }).catch(() => {});
          gone++;
        } else {
          errors++;
        }
      }
    }
    if (anySent) {
      // Log so the throttle (5 days) skips this athlete next time.
      await callRpc('cron_log_nudge', {
        cron_secret: cronSecret,
        to_email: email,
        reason_text: `${info.days} day${info.days === 1 ? '' : 's'} since last session`,
      }).catch(() => {});
    }
  }

  res.status(200).json({
    ok: true,
    athletes: byUser.size,
    devices: rows.length,
    sent, gone, errors,
  });
}
