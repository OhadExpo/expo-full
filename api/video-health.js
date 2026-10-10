// Is a library video still alive? (5.10 #559, the library video-gap screen's
// dead-link sweep.) Takes up to 50 YouTube / Vimeo links and answers, per link:
//   ok        - the video exists and embeds
//   no-embed  - it exists, but its owner turned embedding off (YouTube 401):
//               the athlete's player will not show it - not dead, but not usable
//   dead      - removed, private or never existed (404 / 400 / 403)
//   unknown   - the check itself failed (timeout, 5xx): never reported as dead
//   unsupported - not a YouTube / Vimeo link (storage clips are checked elsewhere)
//
// No key and no scraping: the public oEmbed endpoints. No SSRF surface - this
// function never fetches a caller's URL; it extracts the VIDEO ID and builds the
// oEmbed request to a fixed host itself.

const FETCH_TIMEOUT_MS = 8000;
const fetch = (url, opts = {}) => globalThis.fetch(url, { ...opts, signal: opts.signal || AbortSignal.timeout(FETCH_TIMEOUT_MS) });
const MAX_URLS = 50;

export function videoKey(raw) {
  const u = String(raw || '').trim();
  let m = u.match(/(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/i);
  if (m) return { kind: 'youtube', id: m[1] };
  m = u.match(/vimeo\.com\/(?:video\/)?(\d{6,12})/i);
  if (m) return { kind: 'vimeo', id: m[1] };
  return null;
}

async function check(raw) {
  const k = videoKey(raw);
  if (!k) return { url: raw, state: 'unsupported' };
  const o = k.kind === 'youtube'
    ? `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${k.id}`)}`
    : `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(`https://vimeo.com/${k.id}`)}`;
  try {
    const r = await fetch(o, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; EXPOBot/1.0; +https://expo-app.co.il)' } });
    if (r.ok) { let title = ''; try { title = (await r.json()).title || ''; } catch { /* a 200 with no body is still alive */ } return { url: raw, state: 'ok', title }; }
    if (r.status === 401) return { url: raw, state: 'no-embed' };
    if (r.status === 404 || r.status === 400 || r.status === 403) return { url: raw, state: 'dead', status: r.status };
    return { url: raw, state: 'unknown', status: r.status };
  } catch (e) {
    return { url: raw, state: 'unknown', error: String((e && e.name) || 'error') };
  }
}

export default async function handler(req, res) {
  let urls = [];
  if (req.method === 'POST') {
    const body = typeof req.body === 'string' ? (() => { try { return JSON.parse(req.body); } catch { return {}; } })() : (req.body || {});
    urls = Array.isArray(body.urls) ? body.urls : [];
  } else {
    urls = String(req.query?.urls || req.query?.url || '').split(',').filter(Boolean);
  }
  urls = [...new Set(urls.map((u) => String(u).trim()).filter(Boolean))];
  if (!urls.length) { res.status(400).json({ error: 'urls required' }); return; }
  if (urls.length > MAX_URLS) { res.status(400).json({ error: `at most ${MAX_URLS} urls per call` }); return; }
  // a handful at a time: polite to the oEmbed hosts, inside the function's time
  const out = [];
  for (let i = 0; i < urls.length; i += 8) out.push(...await Promise.all(urls.slice(i, i + 8).map(check)));
  res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=3600');
  res.status(200).json({ results: out });
}
