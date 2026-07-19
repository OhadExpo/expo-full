// Trusted client IP + shared abuse guards for the expo-il endpoints.
//
// Mirrors api/_ip.js on the app side. Vercel sets `x-real-ip` to the true
// client IP and appends it as the RIGHTMOST x-forwarded-for entry. The LEFTMOST
// XFF value is client-supplied and trivially spoofable — keying a limiter on it
// lets an attacker send a random header per request and reset their own bucket.
// Files prefixed with `_` are not treated as routes by Vercel.
export function clientIp(req) {
  const real = req.headers['x-real-ip'];
  if (real) return String(real).split(',')[0].trim();
  const xff = String(req.headers['x-forwarded-for'] || '');
  const parts = xff.split(',').map(s => s.trim()).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : 'unknown';
}

// Reject cross-site callers. These endpoints exist only for the expo-il front
// end, so a request whose Origin is some other site is abuse, not a visitor.
// NOTE: this stops browser-based abuse and casual scripted use; it does NOT
// stop curl, which can send any Origin it likes. It is a cheap layer, not the
// control of record — see the limiter note below.
const ALLOWED_HOSTS = [
  'expo-il.co.il',
  'www.expo-il.co.il',
  'localhost',
  '127.0.0.1',
];
export function originAllowed(req) {
  const raw = req.headers.origin || req.headers.referer || '';
  if (!raw) return true;            // same-origin fetches often omit Origin
  try {
    const h = new URL(String(raw)).hostname;
    return ALLOWED_HOSTS.includes(h) || h.endsWith('.vercel.app');
  } catch { return false; }
}

// In-process fixed-window limiter.
//
// HONEST LIMITATION: this is a per-lambda-instance Map. Vercel runs many
// concurrent instances and recycles them, so the real ceiling is
// (limit x instances), and a cold start resets it. It stops naive loops from a
// single client; it does NOT bound a distributed or parallel attack. Bounding
// that properly needs shared state (Vercel KV / Upstash / a Postgres counter) —
// a platform decision for Ohad. The hard cost ceiling that DOES hold per
// request is the input clamp in capMessages() below.
const buckets = new Map();
export function rateLimit(key, limit, windowMs) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now - b.start >= windowMs) {
    buckets.set(key, { start: now, n: 1 });
    return { ok: true, remaining: limit - 1 };
  }
  if (b.n >= limit) return { ok: false, retryAfter: Math.ceil((b.start + windowMs - now) / 1000) };
  b.n++;
  return { ok: true, remaining: limit - b.n };
}

// Clamp a transcript to a bounded shape BEFORE it reaches a paid model. This is
// the guard that actually caps spend per request: without it a caller could
// post megabytes and be billed for every token. Also drops malformed entries,
// which previously threw before the handler's try block and 500'd.
export function capMessages(raw, { maxMessages = 20, maxChars = 1500 } = {}) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(m => m && typeof m === 'object' && (m.role === 'user' || m.role === 'assistant'))
    .slice(-maxMessages)
    .map(m => ({ role: m.role, content: String(m.content ?? '').slice(0, maxChars) }))
    .filter(m => m.content.length > 0);
}
