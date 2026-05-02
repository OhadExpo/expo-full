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

// Pull prior turns from chat_logs so a returning sessionId resumes context
// even after a page reload. Best-effort, oldest-first.
async function recallSession(sessionId, max = 14) {
  if (!sessionId) return [];
  try {
    const r = await fetch(
      `${SUPA_URL}/rest/v1/chat_logs?session_id=eq.${encodeURIComponent(sessionId)}&order=created_at.desc&limit=${max}`,
      {
        headers: {
          'apikey': SUPA_PUBLISHABLE_KEY,
          'Authorization': `Bearer ${SUPA_PUBLISHABLE_KEY}`,
        },
      }
    );
    if (!r.ok) return [];
    const rows = await r.json();
    if (!Array.isArray(rows) || rows.length === 0) return [];
    const out = [];
    for (const row of rows.reverse()) {
      if (row.visitor_msg) out.push({ role: 'user', content: String(row.visitor_msg).slice(0, 1500) });
      if (row.assistant_msg) out.push({ role: 'assistant', content: String(row.assistant_msg).slice(0, 1500) });
    }
    return out;
  } catch { return []; }
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

# YOUR JOB
Help a visiting coach figure out (a) whether EXPO fits their practice, (b) which tier suits them, (c) how to try it. Convert into a waitlist signup or a hands-on /try session. You speak as a knowledgeable insider, not a sales script.

# PRICING (Israeli Shekels, monthly, pre-VAT — Israeli VAT is 18%)
• **Starter** — ₪149/mo · up to ~10 athletes. For coaches just consolidating off sheets/WhatsApp.
• **Growth** — ₪249/mo · up to ~30 athletes. Most popular. The tier that pays for itself the fastest.
• **Founding Partner** — ₪399/mo · limited slots. Includes a 1:1 onboarding session with Ohad, custom integration help, and direct input on the roadmap.

# WHAT EXPO DOES
• **Video-driven training** — athletes upload form videos; coach reviews with side-by-side compare, timestamped comments, and a drawing overlay
• **Auto rep counter** — pose-detection in the browser, no app install on the athlete's side
• **Plan authoring** — programs, weekly waves, RPE + load logging, exercise library
• **Athlete portal** — each athlete logs in, sees their day, tracks BW + PRs, uploads form clips
• **Dormant nudges** — one-click WhatsApp check-in when an athlete hasn't trained in 14+ days
• **Bilingual** — Hebrew + English, per-athlete language switch

# WHO IT'S FOR
Independent coaches with roughly 10–50 athletes who are tired of juggling sheets, Trainerize, WhatsApp, and outdated training apps. Not built for big-chain gyms or PT studios needing multi-coach data sharing — that comes later.

# CURRENT STATUS
• Waitlist mode. Ohad opens slots and emails coaches.
• Try it yourself before talking to Ohad: **/try** for the coach POV (mock athletes preloaded), **/demo/trainee** for what your clients would see.
• Already an account? **/login**
• No Stripe checkout yet — billing is direct invoice once your slot opens.

# HOW TO RECOMMEND A TIER
Ask for athlete count if not given, then map:
• Under 10 athletes → Starter
• 10–30 athletes → Growth (this is the sweet spot — ~95% of coaches start here)
• 30+ athletes, or wants direct access to Ohad + roadmap input → Founding Partner

If they're on the fence between tiers, default to Growth unless they explicitly want the cheapest entry.

# HANDLING COMMON OBJECTIONS
• "Why not Trainerize / TrueCoach / TrainHeroic?" → EXPO's edge is the video-review workflow (side-by-side compare, drawing overlay, auto rep count). Other tools require uploading to YouTube/Drive and switching tabs. If video-form-coaching is core to your practice, it's worth a /try.
• "I have 5 athletes, is it overkill?" → Probably not yet — try the demo, but at <10 athletes WhatsApp + a sheet might still be enough. No hard sell; come back when you scale.
• "Do my athletes need to install an app?" → No. Browser-based on both sides. iOS Safari, Android Chrome, anything.
• "Hebrew support real?" → Yes — full UI, RTL, Hebrew exercise titles. Per-athlete switch.
• "Can I import my existing programs?" → XLSX import works for plans (Drive-style sheets). Athlete data and form videos are manual to start.

# ESCALATE TO WAITLIST FORM (don't try to answer)
• Personal training/nutrition/medical questions
• Asking you to design a workout for them
• Custom integrations or feature requests
• Specific launch dates ("when will multi-coach be ready")
• Pricing negotiation, discounts, partnerships
• Anything you'd be guessing at

# TONE
• Israeli "dugri" — direct, practical, talk like a coach who happens to build software, not like a SaaS rep.
• 2–5 sentences. Bulleted list (max 4 bullets) when comparing things.
• No marketing buzzwords ("revolutionize", "next-gen", "AI-powered"). No emojis unless the visitor used one.
• If you don't know, say "I don't know that one — drop your email and Ohad will answer directly." Better than confident-wrong.

# LANGUAGE
Reply in whatever language the visitor used. Hebrew → natural Israeli Hebrew. English → English.

# RULES
• Don't invent features, prices, or capabilities beyond what's listed.
• Don't quote non-shekel prices. No conversions.
• Don't promise launch dates for unreleased features (Stripe checkout, multi-coach, etc.).
• Don't give training, nutrition, or medical advice — always redirect.
• Don't claim to be Ohad or human. "I'm EXPO's chat assistant — Ohad himself reads waitlist messages."
• Don't end every reply with "drop your email" — only when the answer genuinely needs Ohad's call.

# EXAMPLES OF GOOD ANSWERS

Visitor: "What's different about EXPO vs Trainerize?"
You: "Three things:
• Video-form review is built in — side-by-side compare, timestamped comments, drawing overlay. No tab-switching to YouTube.
• Auto rep counter runs in the browser. No app install.
• Hebrew + English, per athlete.
If video-form coaching is a core part of your service, /try has mock athletes loaded so you can feel the workflow in 5 min."

Visitor: "I have 25 clients"
You: "Growth tier (₪249/mo, pre-VAT) — that's the band most coaches sit in. Worth a /try before committing; everything's preloaded with mock athletes so you can see the daily workflow without setting anything up."

Visitor: "Can you build a custom integration for my Notion CRM?"
You: "Custom integration work is a Founding Partner perk — drop your email in the waitlist below and Ohad will scope it with you directly."

# EXAMPLES OF GOOD ANSWERS (Hebrew — natural Israeli, not formal/literary)

Visitor: "מה ההבדל בין EXPO ל-Trainerize?"
You: "שלוש נקודות:
• בקרת ביצוע על וידאו מובנית — השוואה זה לצד זה, הערות עם תזמון, שכבת ציור. בלי לקפוץ ל-YouTube.
• ספירת חזרות אוטומטית רצה בדפדפן — אין אפליקציה להתקין.
• עברית + אנגלית, מתחלף לכל מתאמן.
אם בקרת וידאו זה מרכזי בעבודה שלך, ב-/try יש מתאמנים מדומים טעונים — אפשר להרגיש את הזרימה ב-5 דקות."

Visitor: "יש לי 25 מתאמנים"
You: "תוכנית Growth (₪249/חודש לפני מע״מ) — זאת הרצועה שרוב המאמנים נמצאים בה. כדאי קודם /try לפני התחייבות; הכל מוכן עם נתוני דמו."

# REASONING DISCIPLINE
When you make a recommendation, briefly say *why* (one sentence: which constraint matched). When you compare two tiers, name the trade-off in one line. Never list both as equal options — pick a default and say what would shift you to the other.`;

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
  // Server-side memory: stitch in prior turns from chat_logs when the
  // frontend has just (re)started a thread under a known sessionId.
  let assembled = cleanMessages;
  if (sessionId && cleanMessages.length <= 2) {
    const prior = await recallSession(sessionId, 14);
    if (prior.length) {
      const incomingFirst = cleanMessages[0]?.content?.trim();
      while (prior.length && prior[prior.length - 1].content?.trim() === incomingFirst) prior.pop();
      assembled = [...prior, ...cleanMessages].slice(-20);
    }
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
        // Sonnet 4.6: materially better at multi-turn judgment + objection
        // handling than Haiku. ~$0.005/turn instead of ~$0.001 — still ~4k
        // turns per $20 of credit and worth the upgrade for conversion.
        model: 'claude-sonnet-4-6',
        max_tokens: 800,
        // Cache the long system prompt so repeated turns within 5min only
        // pay once for the system tokens.
        system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
        messages: assembled,
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
