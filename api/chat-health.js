// Lightweight health probe for the marketing chat. The widget hits this
// on first open and downgrades gracefully if the API key isn't configured
// — better than letting visitors type into a dead endpoint.

export default function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  res.status(200).json({
    ok: !!process.env.ANTHROPIC_API_KEY,
  });
}
