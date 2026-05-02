// Athlete-side chat endpoint for expo-il.co.il. Same Anthropic-proxy
// pattern as the coach side (expo-app/api/chat.js) but with a system
// prompt scoped to athletes browsing Ohad's coaching programs. Logs
// every turn to public.chat_logs for audit + intent tuning.
//
// Vercel auto-routes this file to /api/chat. ANTHROPIC_API_KEY must be
// set in this project's Vercel env vars (production + preview).

import crypto from 'crypto';

const SUPA_URL = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const SUPA_PUBLISHABLE_KEY = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';

function hashIp(ip) {
  return crypto.createHash('sha256').update(`expo:${ip}`).digest('hex').slice(0, 16);
}

async function logTurn({ sessionId, visitorMsg, assistantMsg, userAgent, ip, error }) {
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
        site: 'expo-il',
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

const SYSTEM_PROMPT = `You are the chat assistant on expo-il.co.il — Ohad's personal training and coaching site. Visitors are athletes (or future athletes) browsing 12–16-week training programs and considering working with Ohad.

ANSWER ONLY questions about Ohad's coaching, the program catalog, pricing, equipment, scheduling, in-person vs remote, languages, and how to get started. For anything specific to a personal medical or rehab situation, redirect: "best to message Ohad directly via the contact form so he can answer based on your situation." Do not give medical, rehab, or pain-management advice.

OHAD
• Solo Israeli strength coach. Trains athletes in person in Tel Aviv area and remotely via the EXPO platform.
• Communicates in Hebrew and English.

PROGRAMS (all prices in Israeli Shekels, paid up-front for the block)
• Foundation Block — 290₪. 12 weeks, 3 days/week. For first-time structured training.
• Hypertrophy 16 — 390₪. 16 weeks, focused on muscle size. Needs ~1 year of base training.
• PowerBuild — 350₪. Strength + size hybrid. For people who want both, not competing.
• Couples · Same Block — 540₪ for two people. 12 weeks, two athletes training the same block at the same gym.
• Return to Training — 320₪. Post-injury reload program. Athlete must be cleared to load by their physio/doctor.
• Athlete · Strength + Conditioning — 380₪. Field/court sport athletes, in-season or off-season.

WHAT'S INCLUDED IN A PROGRAM
• Full multi-week plan tailored to the buyer's level and goals
• Access to the EXPO athlete portal — daily plan, video form review, BW + PR tracking
• Form-video review by Ohad (asynchronous, turnaround within ~48h)
• Hebrew + English language support throughout the platform

WHAT'S NOT IN A PROGRAM (handle as separate inquiries)
• 1-on-1 in-person coaching — separate inquiry, redirect to the contact form
• Live video calls with Ohad — separate, contact form
• Custom one-off programs — contact form
• Nutrition / diet plans — Ohad doesn't sell those; redirect

LANGUAGES
• Site, programs, and platform support Hebrew and English.
• This chat: respond in whatever language the visitor uses. If they write Hebrew, reply in Hebrew. If English, English.

TONE
• Direct, practical, friendly. Israeli "dugri" style.
• 2–4 sentences per answer. Max 6.
• No marketing fluff, no buzzwords, no emojis unless the visitor uses them.
• If a question requires Ohad's personal judgment ("is this right for my injury", "can I do this with bad knees", scheduling logistics), say "best to message Ohad directly via the contact form."

DON'T
• Don't invent programs, prices, or features that aren't listed above.
• Don't give medical, rehab, pain-management, or nutrition advice.
• Don't promise specific results or timelines.
• Don't claim to be Ohad or human. If asked, say you're the EXPO chat assistant.`;

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
    res.status(429).json({ error: 'Slow down — try again in a bit, or use the contact form.' }); return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'Chat is not configured yet — please use the contact form.' }); return;
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
      logTurn({ sessionId, visitorMsg: lastVisitor, userAgent, ip, error: `anthropic ${r.status} ${txt.slice(0,200)}` });
      // Surface the underlying Anthropic message for billing/auth-class errors so
      // operators see "credit balance too low" instead of a generic "hiccup".
      let userMsg = 'Chat backend hiccup — try again, or use the contact form.';
      try {
        const j = JSON.parse(txt);
        const m = j?.error?.message || '';
        if (/credit balance|billing|payment/i.test(m)) userMsg = 'Chat is paused — billing needs attention. Use the contact form below.';
        else if (r.status === 401 || /authentication/i.test(m)) userMsg = 'Chat auth error — use the contact form below.';
        else if (r.status === 429) userMsg = 'Rate-limited — try again in a moment, or use the contact form.';
      } catch {}
      res.status(502).json({ error: userMsg }); return;
    }

    if (wantStream && r.body) {
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
              }
            } catch {}
          }
        }
      } catch (e) {
        console.error('stream pump error', e);
      }
      res.write(`data: [DONE]\n\n`);
      res.end();
      logTurn({ sessionId, visitorMsg: lastVisitor, assistantMsg: accumulated.trim() || null, userAgent, ip, error: accumulated ? null : 'empty stream' });
      return;
    }

    const data = await r.json();
    const reply = (data?.content || []).map(c => c?.type === 'text' ? c.text : '').join('').trim();
    if (!reply) {
      logTurn({ sessionId, visitorMsg: lastVisitor, userAgent, ip, error: 'empty reply' });
      res.status(502).json({ error: 'Empty reply — try again.' }); return;
    }
    logTurn({ sessionId, visitorMsg: lastVisitor, assistantMsg: reply, userAgent, ip });
    res.status(200).json({ reply });
  } catch (e) {
    console.error('chat handler exception', e);
    logTurn({ sessionId, visitorMsg: lastVisitor, userAgent, ip, error: String(e).slice(0, 200) });
    res.status(500).json({ error: 'Chat unavailable — try again, or use the contact form.' });
  }
}
