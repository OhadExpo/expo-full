// Health probe for the athlete-side chat. Mirror of the coach-side
// endpoint at expo-app/api/chat-health.js.

export default function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  res.status(200).json({
    ok: !!process.env.ANTHROPIC_API_KEY,
  });
}
