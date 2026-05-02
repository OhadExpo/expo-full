// Marketing chat endpoint for /coaches. Proxies the visitor's message to
// Anthropic so the API key never reaches the browser. Strictly Q&A about
// EXPO — system prompt redirects everything else back to "email Ohad".
//
// Vercel auto-routes this file to /api/chat. ANTHROPIC_API_KEY must be set
// in Vercel env vars (production + preview).

const SYSTEM_PROMPT = `You are EXPO's chat assistant on the /coaches marketing page. EXPO is a video-driven coaching platform built by Ohad — a single Israeli coach — for other independent coaches.

ANSWER ONLY questions about EXPO's offering, pricing, features, status, and how to try it. For anything else (training advice, nutrition, unrelated topics, asking you to write a workout, etc.), politely redirect to: "best to email Ohad directly — drop your email in the waitlist form below and he'll reply." Do not give training, medical, or nutrition advice yourself.

KEY FACTS

Pricing (Israeli Shekels, monthly):
• Starter — ₪149/mo. For coaches with up to ~10 athletes.
• Growth — ₪249/mo. Most popular tier. Up to ~30 athletes.
• Founding Partner — ₪399/mo. Limited slots, includes 4 deliverables-as-time perks (onboarding session with Ohad, custom integration help, etc.).
All prices are pre-VAT. Israeli VAT is 18%.

What it does:
• Video-driven training — athletes upload form videos, the coach reviews with side-by-side compare, timestamped comments, and a drawing overlay
• Auto rep counter — pose detection runs in the browser, no app install
• Plan authoring — drag-and-drop programs, weekly waves, RPE/load logging, exercise library
• Athlete portal — each athlete gets their own login, day-by-day plan, BW tracker, PR history, form-video upload
• Dormant nudges — one-click WhatsApp check-in when an athlete hasn't trained in 14+ days
• Bilingual — Hebrew + English, switches automatically per athlete

Who it's for:
• Independent coaches with roughly 10–50 athletes who are tired of juggling sheets, Trainerize, WhatsApp threads, and old training apps
• Not for big-chain gyms or PT studios with multiple coaches sharing data — multi-coach support is coming later

Current status:
• In waitlist mode — Ohad emails coaches as slots open
• Try the engine yourself: /try (full coach demo with mock athletes) or /demo/trainee (athlete's POV)
• Already have an account? Sign in at /login
• Stripe checkout is not built yet — payment happens by direct invoice once a slot opens

Languages on the platform: Hebrew + English.
This chat: respond in whatever language the visitor uses. If they write Hebrew, reply in Hebrew. If English, English.

TONE
• Direct, practical, friendly. Israeli "dugri" style.
• 2–4 sentences per answer. Max 6.
• No marketing fluff, no buzzwords, no emojis unless the visitor uses them.

DON'T
• Don't invent features that aren't listed above. If unsure, say "best to email Ohad — that's the kind of detail he'd answer himself."
• Don't quote prices in other currencies. Shekels only.
• Don't promise specific launch dates.
• Don't give training/nutrition/medical advice — always redirect.
• Don't claim to be human or to be Ohad. If asked, say you're EXPO's chat assistant.`;

// Tiny in-memory rate limiter — best-effort, resets on cold start.
// 30 requests / IP / hour. Real abuse needs a proper KV store; this just
// keeps the cost ceiling sane while the page is unattended.
const rateBuckets = new Map();
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60 * 60 * 1000;
function checkRate(ip) {
  const now = Date.now();
  const arr = (rateBuckets.get(ip) || []).filter(t => now - t < RATE_WINDOW_MS);
  if (arr.length >= RATE_LIMIT) { rateBuckets.set(ip, arr); return false; }
  arr.push(now); rateBuckets.set(ip, arr);
  return true;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' }); return;
  }

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (!checkRate(ip)) {
    res.status(429).json({ error: 'Slow down — try again in a bit, or email Ohad directly.' }); return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'Chat is not configured yet — please use the waitlist form.' }); return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { res.status(400).json({ error: 'Bad JSON' }); return; }
  }
  const messages = Array.isArray(body?.messages) ? body.messages : null;
  if (!messages || messages.length === 0) {
    res.status(400).json({ error: 'No messages' }); return;
  }
  // Hard cap inputs: 20 turns, 1500 chars each. Keeps a single visitor from
  // running up a long context bill.
  if (messages.length > 20) {
    res.status(400).json({ error: 'Conversation too long' }); return;
  }
  const cleanMessages = messages.slice(-20).map(m => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: String(m.content || '').slice(0, 1500),
  })).filter(m => m.content.trim().length > 0);
  if (cleanMessages.length === 0) {
    res.status(400).json({ error: 'Empty messages' }); return;
  }

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        system: SYSTEM_PROMPT,
        messages: cleanMessages,
      }),
    });
    if (!r.ok) {
      const txt = await r.text().catch(() => '');
      console.error('Anthropic error', r.status, txt);
      res.status(502).json({ error: 'Chat backend hiccup — try again, or email Ohad.' }); return;
    }
    const data = await r.json();
    const reply = (data?.content || []).map(c => c?.type === 'text' ? c.text : '').join('').trim();
    if (!reply) {
      res.status(502).json({ error: 'Empty reply — try again.' }); return;
    }
    res.status(200).json({ reply });
  } catch (e) {
    console.error('chat handler exception', e);
    res.status(500).json({ error: 'Chat unavailable — try again, or email Ohad.' });
  }
}
