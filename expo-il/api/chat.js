// Athlete-side chat endpoint for expo-il.co.il. Same Anthropic-proxy
// pattern as the coach side (expo-app/api/chat.js) but with a system
// prompt scoped to athletes browsing Ohad's coaching programs.
//
// Vercel auto-routes this file to /api/chat. ANTHROPIC_API_KEY must be
// set in this project's Vercel env vars (production + preview).

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
      res.status(502).json({ error: 'Chat backend hiccup — try again, or use the contact form.' }); return;
    }
    const data = await r.json();
    const reply = (data?.content || []).map(c => c?.type === 'text' ? c.text : '').join('').trim();
    if (!reply) {
      res.status(502).json({ error: 'Empty reply — try again.' }); return;
    }
    res.status(200).json({ reply });
  } catch (e) {
    console.error('chat handler exception', e);
    res.status(500).json({ error: 'Chat unavailable — try again, or use the contact form.' });
  }
}
