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
