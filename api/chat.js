// Marketing chat endpoint for /coaches. Proxies the visitor's message to
// Anthropic so the API key never reaches the browser. Strictly Q&A about
// EXPO — system prompt redirects everything else back to "email Ohad".
// Each turn is also fire-and-forget logged to public.chat_logs so Ohad
// can audit what visitors are actually asking and tune the prompt.
//
// Vercel auto-routes this file to /api/chat. ANTHROPIC_API_KEY must be set
// in Vercel env vars (production + preview).

import crypto from 'crypto';

const SUPA_URL = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const SUPA_PUBLISHABLE_KEY = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';

function hashIp(ip) {
  return crypto.createHash('sha256').update(`expo:${ip}`).digest('hex').slice(0, 16);
}

async function logTurn({ site, sessionId, visitorMsg, assistantMsg, userAgent, ip, error }) {
  // Fire-and-forget — never block the visitor on logging.
  try {
    await fetch(`${SUPA_URL}/rest/v1/chat_logs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPA_PUBLISHABLE_KEY,
        'Authorization': `Bearer ${SUPA_PUBLISHABLE_KEY}`,
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        site,
        session_id: sessionId || null,
        visitor_msg: (visitorMsg || '').slice(0, 2000),
        assistant_msg: assistantMsg ? assistantMsg.slice(0, 2000) : null,
        user_agent: (userAgent || '').slice(0, 200),
        ip_hash: ip ? hashIp(ip) : null,
        error: error ? error.slice(0, 200) : null,
      }),
    });
  } catch {}
}

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
  const sessionId = String(body?.sessionId || '').slice(0, 64) || null;
  const userAgent = (req.headers['user-agent'] || '').toString();
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

  const wantStream = !!body?.stream;
  const lastVisitor = cleanMessages[cleanMessages.length - 1]?.content;

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
        stream: wantStream,
      }),
    });
    if (!r.ok) {
      const txt = await r.text().catch(() => '');
      console.error('Anthropic error', r.status, txt);
      logTurn({ site: 'expo-app', sessionId, visitorMsg: lastVisitor, userAgent, ip, error: `anthropic ${r.status} ${txt.slice(0,200)}` });
      let userMsg = 'Chat backend hiccup — try again, or email Ohad.';
      try {
        const j = JSON.parse(txt);
        const m = j?.error?.message || '';
        if (/credit balance|billing|payment/i.test(m)) userMsg = 'Chat is paused — billing needs attention. Email Ohad directly.';
        else if (r.status === 401 || /authentication/i.test(m)) userMsg = 'Chat auth error — email Ohad directly.';
        else if (r.status === 429) userMsg = 'Rate-limited — try again in a moment, or email Ohad.';
      } catch {}
      res.status(502).json({ error: userMsg }); return;
    }

    if (wantStream && r.body) {
      // Pipe Anthropic SSE through, extracting text deltas into a simpler
      // `data: <chunk>\n\n` stream the frontend can consume without an
      // SSE parsing library. Accumulate the full reply for logging.
      res.setHeader('content-type', 'text/event-stream; charset=utf-8');
      res.setHeader('cache-control', 'no-cache, no-transform');
      res.setHeader('connection', 'keep-alive');
      res.setHeader('x-accel-buffering', 'no');
      res.flushHeaders?.();
      let accumulated = '';
      let buf = '';
      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split(/\n/);
          buf = lines.pop() || '';
          for (const raw of lines) {
            const line = raw.trim();
            if (!line.startsWith('data:')) continue;
            const payload = line.slice(5).trim();
            if (!payload) continue;
            try {
              const ev = JSON.parse(payload);
              if (ev?.type === 'content_block_delta' && ev.delta?.type === 'text_delta' && typeof ev.delta.text === 'string') {
                accumulated += ev.delta.text;
                res.write(`data: ${JSON.stringify({ t: ev.delta.text })}\n\n`);
              } else if (ev?.type === 'message_stop') {
                // sent below as DONE
              }
            } catch {}
          }
        }
      } catch (e) {
        console.error('stream pump error', e);
      }
      res.write(`data: [DONE]\n\n`);
      res.end();
      logTurn({ site: 'expo-app', sessionId, visitorMsg: lastVisitor, assistantMsg: accumulated.trim() || null, userAgent, ip, error: accumulated ? null : 'empty stream' });
      return;
    }

    const data = await r.json();
    const reply = (data?.content || []).map(c => c?.type === 'text' ? c.text : '').join('').trim();
    if (!reply) {
      logTurn({ site: 'expo-app', sessionId, visitorMsg: lastVisitor, userAgent, ip, error: 'empty reply' });
      res.status(502).json({ error: 'Empty reply — try again.' }); return;
    }
    logTurn({ site: 'expo-app', sessionId, visitorMsg: lastVisitor, assistantMsg: reply, userAgent, ip });
    res.status(200).json({ reply });
  } catch (e) {
    console.error('chat handler exception', e);
    logTurn({ site: 'expo-app', sessionId, visitorMsg: lastVisitor, userAgent, ip, error: String(e).slice(0, 200) });
    res.status(500).json({ error: 'Chat unavailable — try again, or email Ohad.' });
  }
}
