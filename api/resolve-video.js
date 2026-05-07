// Resolve a Google Photos share URL (photos.app.goo.gl/<id> or
// photos.google.com/share/<…>) to a direct, embeddable video stream URL.
// Google blocks iframe embedding of share pages via X-Frame-Options, so we
// fetch the page server-side, scrape the og:video / og:image meta tags, and
// hand the trainee a stable <video src=…> they can actually play.
//
// Cached at the edge for a day so we don't re-scrape Google on every page
// load. The resolved googleusercontent URLs themselves stay valid for weeks.

const ALLOWED = /^https:\/\/(photos\.app\.goo\.gl|photos\.google\.com)\//i;

// Each redirect hop must land on one of these hosts. Anything else (an
// attacker-controlled redirector, an unknown subdomain) breaks the chain
// and we 502. Keeps SSRF surface tight even if Google ever reflects an
// open-redirect through their share infrastructure.
const REDIRECT_HOSTS = /^(photos\.app\.goo\.gl|photos\.google\.com|accounts\.google\.com|[a-z0-9-]+\.googleusercontent\.com|lh3\.googleusercontent\.com)$/i;
const MAX_HOPS = 5;

export default async function handler(req, res) {
  const url = req.query?.url || '';
  if (!ALLOWED.test(url)) {
    res.status(400).json({ error: 'URL must be a Google Photos share link' });
    return;
  }
  try {
    // Manual redirect loop with hop cap + per-hop host allowlist.
    let current = url;
    let r = null;
    for (let hop = 0; hop <= MAX_HOPS; hop++) {
      r = await fetch(current, {
        redirect: 'manual',
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; EXPOBot/1.0; +https://expo-app.co.il)',
          'Accept': 'text/html,application/xhtml+xml',
        },
      });
      if (r.status >= 300 && r.status < 400) {
        const loc = r.headers.get('location');
        if (!loc) break;
        const next = new URL(loc, current);
        if (next.protocol !== 'https:' || !REDIRECT_HOSTS.test(next.hostname)) {
          res.status(502).json({ error: 'Redirect target outside allowlist' });
          return;
        }
        if (hop === MAX_HOPS) {
          res.status(502).json({ error: 'Redirect chain too long' });
          return;
        }
        current = next.toString();
        continue;
      }
      break;
    }
    if (!r || !r.ok) {
      res.status(502).json({ error: `Upstream ${r?.status || 'unreachable'}` });
      return;
    }
    const html = await r.text();
    const meta = (prop) => {
      const re = new RegExp(`<meta[^>]+property=["']${prop}["'][^>]+content=["']([^"']+)["']`, 'i');
      return html.match(re)?.[1] || null;
    };
    const video =
      meta('og:video:secure_url') ||
      meta('og:video') ||
      meta('og:video:url') ||
      // fallback: scan for direct googleusercontent video stream patterns
      html.match(/https:\/\/[a-z0-9-]+\.googleusercontent\.com\/[A-Za-z0-9_-]+=m\d+/)?.[0] ||
      null;
    const poster = meta('og:image:secure_url') || meta('og:image') || null;
    if (!video) {
      res.status(404).json({ error: 'No embeddable video found in share page' });
      return;
    }
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
    res.status(200).json({ url: video, poster });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
}
