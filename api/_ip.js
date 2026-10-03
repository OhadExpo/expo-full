// Trusted client IP for rate-limiting.
//
// Vercel sets `x-real-ip` to the true client IP and appends that IP as the
// RIGHTMOST entry of `x-forwarded-for`. The LEFTMOST x-forwarded-for value is
// client-supplied and trivially spoofable — an attacker sets a random one per
// request to bypass any limiter keyed on it. So prefer x-real-ip, else the
// rightmost XFF entry. Files prefixed with `_` are not treated as routes by
// Vercel, so this is a shared helper, not an endpoint.
export function clientIp(req) {
  const real = req.headers['x-real-ip'];
  if (real) return String(real).split(',')[0].trim();
  const xff = String(req.headers['x-forwarded-for'] || '');
  const parts = xff.split(',').map(s => s.trim()).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : 'unknown';
}

// Reject cross-site callers of the app's paid endpoints (3.10 #524 audit: the
// app-side /api/chat and /api/capture had no Origin check at all). Same rule as
// expo-il/api/_ip.js: a cheap layer that stops browser abuse, not curl - the
// control of record is budgetOk() below.
const APP_HOSTS = ['expo-app.co.il', 'www.expo-app.co.il', 'localhost', '127.0.0.1'];
export function originAllowed(req) {
  const raw = req.headers.origin || req.headers.referer || '';
  if (!raw) return true;
  try {
    const h = new URL(String(raw)).hostname;
    return APP_HOSTS.includes(h) || h === 'expo-full.vercel.app' || h.endsWith('-ohadyproductions-4644s-projects.vercel.app');
  } catch { return false; }
}

// Clamp a transcript BEFORE it reaches a paid model; drops malformed entries
// (a null message used to throw outside the handler's try and 500).
export function capMessages(raw, { maxMessages = 20, maxChars = 1500 } = {}) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((m) => m && typeof m === 'object' && (m.role === 'user' || m.role === 'assistant'))
    .slice(-maxMessages)
    .map((m) => ({ role: m.role, content: String(m.content ?? '').slice(0, maxChars) }))
    .filter((m) => m.content.length > 0);
}
// ONE CEILING SHARED BY EVERY INSTANCE (3.10 #524 audit). The per-instance
// counters above reset on each cold start, so spend on the paid model had no
// bound. public.api_budget_take(bucket) counts per Israel day in Postgres; the
// limits live in that function, not here, so a caller cannot raise them.
// Fails OPEN on a database hiccup (the per-instance limiter still holds) -
// a visitor is never refused because the counter could not be reached.
export async function budgetOk(bucket) {
  try {
    const r = await globalThis.fetch('https://gtcbfglttoiyfsnfbhdy.supabase.co/rest/v1/rpc/api_budget_take', {
      method: 'POST',
      headers: { apikey: 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv', Authorization: 'Bearer sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv', 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_bucket: bucket }),
      signal: AbortSignal.timeout(2500),
    });
    if (!r.ok) return true;
    return (await r.json()) !== false;
  } catch { return true; }
}
