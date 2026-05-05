// Resolve a Google Photos share URL (photos.app.goo.gl/<id> or
// photos.google.com/share/<…>) to a direct, embeddable video stream URL.
// Google blocks iframe embedding of share pages via X-Frame-Options, so we
// fetch the page server-side, scrape the og:video / og:image meta tags, and
// hand the trainee a stable <video src=…> they can actually play.
//
// Cached at the edge for a day so we don't re-scrape Google on every page
// load. The resolved googleusercontent URLs themselves stay valid for weeks.

const ALLOWED = /^https:\/\/(photos\.app\.goo\.gl|photos\.google\.com)\//i;

export default async function handler(req, res) {
  const url = req.query?.url || '';
  if (!ALLOWED.test(url)) {
    res.status(400).json({ error: 'URL must be a Google Photos share link' });
    return;
  }
  try {
    const r = await fetch(url, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; EXPOBot/1.0; +https://expo-app.co.il)',
        'Accept': 'text/html,application/xhtml+xml',
      },
    });
    if (!r.ok) {
      res.status(502).json({ error: `Upstream ${r.status}` });
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
