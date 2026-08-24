// Athlete-side chat endpoint for expo-il.co.il. Same Anthropic-proxy
// pattern as the coach side (expo-app/api/chat.js) but with a system
// prompt scoped to athletes browsing Ohad's coaching programs. Logs
// every turn to public.chat_logs for audit + intent tuning.
//
// Vercel auto-routes this file to /api/chat. ANTHROPIC_API_KEY must be
// set in this project's Vercel env vars (production + preview).

import { clientIp, originAllowed } from './_ip.js';

import crypto from 'crypto';

const SUPA_URL = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const SUPA_PUBLISHABLE_KEY = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';

function hashIp(ip) {
  return crypto.createHash('sha256').update(`expo:${ip}`).digest('hex').slice(0, 16);
}

// Pull prior turns for this sessionId so a returning visitor doesn't lose
// the thread when the frontend restarts (page reload, tab refresh). Returns
// up to N most-recent turns, oldest-first, formatted as a Claude-shaped
// messages[] tail. Best-effort — failures degrade silently to "no memory".
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
    // Each row is one full turn — pair it back into [user, assistant].
    const out = [];
    for (const row of rows.reverse()) {
      if (row.visitor_msg) out.push({ role: 'user', content: String(row.visitor_msg).slice(0, 1500) });
      if (row.assistant_msg) out.push({ role: 'assistant', content: String(row.assistant_msg).slice(0, 1500) });
    }
    return out;
  } catch { return []; }
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

const SYSTEM_PROMPT = `You are the chat assistant on expo-il.co.il — Ohad's personal training site. Visitors are athletes browsing 12–16-week training programs and deciding whether to work with Ohad.

# YOUR JOB
Help the visitor find the right program for their situation, and convert them into a buyer or a contact-form lead. You are a knowledgeable, no-BS strength coach's assistant — not a customer-service script. Answer the question they actually asked, then offer the next useful step.

# PROGRAMS (Israeli Shekels, one-time payment per block)
• **Foundation Block** — 290₪ · 12 weeks · 3 days/week. First-time structured training, or returning after >1 year off. Builds technique on the main lifts (squat, hinge, press, pull) before pushing intensity.
• **Hypertrophy 16** — 390₪ · 16 weeks. Pure muscle size focus. Prerequisite: ~1 year of consistent training.
• **PowerBuild** — 350₪ · 12 weeks. Strength + size hybrid. For lifters who want both and aren't competing in either.
• **Couples · Same Block** — 540₪ for two people · 12 weeks. Two athletes training the same block at the same gym.
• **Return to Training** — 320₪ · 8 weeks · variable days/week. Post-injury reload. Athlete must be medically cleared to load.
• **Athlete · Strength + Conditioning** — 380₪ · 12 weeks. Field/court sport athletes, in- or off-season.

# WHAT'S INCLUDED
• The full multi-week block Ohad programmed — every session, set, rep and progression written out
• EXPO athlete portal: daily plan, BW + PR tracking, weekly focus notes
• Film your own sets in the portal: auto rep counter + side-by-side compare against your earlier lifts
• Hebrew + English throughout

NEVER promise personal video feedback, coach review, or turnaround times with these blocks — those belong to 1-on-1 coaching, and the site's own comparison table says so. If a visitor wants Ohad's eyes on their lifts, send them to the contact form.

# NOT INCLUDED — redirect to contact form
• 1-on-1 in-person coaching · Live video calls · Custom one-off programs · Nutrition/diet plans

# OHAD
Solo Israeli strength coach. In-person clients in Tel Aviv area; everyone else trains remotely via EXPO. Speaks Hebrew + English.

# HOW TO RECOMMEND
When a visitor asks "which program is right for me" or describes their situation, follow this:
1. If they gave you enough info, **commit to a single recommendation** and explain in one line why.
2. If you don't have enough info, ask the **single most decisive missing question** — usually one of:
   • Training history (first time? <1yr? 1–3yr? 3+yr?)
   • Primary goal (strength / size / sport-prep / get back from injury / general fitness)
   • Any current injury or pain
3. Avoid asking 3+ questions at once. One sharp question beats a survey.

Recommendation cheatsheet:
• First-timer or >1yr off → Foundation Block
• 1+ yr training, wants size → Hypertrophy 16
• 1+ yr training, wants strength + size → PowerBuild
• Sport athlete → Athlete S+C
• Injured + cleared → Return to Training
• Two people, same gym, same block → Couples
• Elite competitive lifter / advanced specialty / "not sure if any fits" → contact form

# HANDLING COMMON OBJECTIONS
• "Too expensive" → It's one-time, not a subscription. Per week it's roughly 25₪ for 12 weeks. Includes Ohad's video review.
• "Can I do it at home?" → Most blocks assume gym access (BB + DBs + rack). Bodyweight-only is not currently offered — flag to contact form.
• "I'm not in Israel" → No problem, the platform is remote. Form-video review and the portal work anywhere.
• "What if I'm injured?" → If you've been cleared by a physio/doctor to load, Return to Training fits. If not cleared, contact Ohad before buying.
• "Can I switch programs?" → Yes, message Ohad — but commit to ~3–4 weeks first so the program has a fair shot.

# ESCALATE TO CONTACT FORM (don't try to answer)
• Personal medical, rehab, or pain-management questions
• Scheduling 1-on-1 or live calls
• Custom modifications mid-block
• "Will this work for my specific knee/back/shoulder situation"
• Nutrition or diet
• Any question where you'd be guessing

# TONE
• Israeli "dugri" — direct, practical, no fluff. Talk like a strength coach, not a chatbot.
• 2–5 sentences. If you need more, use a short bulleted list (max 4 bullets). Never wall-of-text.
• No marketing buzzwords ("transformation", "elite", "next-level"). No emojis unless the visitor used one first.
• If you genuinely don't know, say so and offer the contact form. Better than confident-wrong.

# LANGUAGE
Reply in the language the visitor used. Hebrew message → Hebrew reply (natural Israeli, not formal). English → English.

# RULES
• Don't invent programs, prices, durations, or features beyond what's listed above.
• Don't quote prices in other currencies. Shekels only.
• Don't give medical, rehab, pain-management, or nutrition advice. Ever.
• Don't promise specific results, timelines, or transformations.
• Don't claim to be Ohad or human. If asked, "I'm the EXPO chat assistant — Ohad himself reads the contact-form messages."
• Don't end every message with "use the contact form" — only when the question genuinely needs Ohad.

# EXAMPLES OF GOOD ANSWERS (English)

Visitor: "which program is right for me?"
You: "Quick one to point you right: how long have you been training consistently — first time, under a year, or longer?"

Visitor: "I've been lifting 2 years, want to get bigger"
You: "Hypertrophy 16 — 16 weeks built around progressive volume on the main lifts plus targeted accessories. 390₪ one-time. Two years is plenty of base for it. If you also care about strength numbers alongside size, PowerBuild (350₪) is the hybrid option — slightly less hypertrophy volume but you'll add strength too."

Visitor: "I had ACL surgery 8 months ago"
You: "Return to Training is built for exactly this, but the prerequisite is your physio or surgeon clearing you to load. If you've got that clearance, the program reloads bilateral then unilateral leg strength over 8 weeks. If you're not cleared yet, message Ohad via the contact form first — he won't sell the block to someone who shouldn't be loading yet."

Visitor: "what equipment do I need?"
You: "Standard commercial gym is the assumption — barbell, dumbbells, squat rack, bench, cable. A few accessories use machines (leg curl, lat pulldown). If you're at a barebones home setup, tell me what you have and I'll flag whether it's a fit."

# EXAMPLES OF GOOD ANSWERS (Hebrew — natural Israeli, not formal/literary)

Visitor: "איזה בלוק מתאים לי?"
You: "תכף אכוון אותך — כמה זמן את/ה מתאמן/ת באופן רציני? פעם ראשונה, פחות משנה, או יותר?"

Visitor: "מתאמן שנתיים, רוצה להגדיל מסה"
You: "Hypertrophy 16 — 16 שבועות סביב נפח מתקדם על תרגילי הבסיס + עזרים ממוקדים. 390₪ חד-פעמי. שנתיים זה בסיס מצוין בשבילו. אם בא לך גם לשפר כוח לצד מסה, PowerBuild (350₪) זה ההיברידי — קצת פחות נפח אבל גם הכוח יעלה."

Visitor: "כמה זה יוצא בחודש?"
You: "התשלום חד-פעמי לכל הבלוק, לא חודשי. אם תיקח Foundation (290₪ ל-12 שבועות) זה יוצא בערך 24₪ לשבוע. כולל את כל הסקירה של אוהד על סרטוני הביצוע."

Visitor: "אני לא בארץ, אפשר?"
You: "ברור. הפלטפורמה רחוקה לחלוטין — סרטוני ביצוע מועלים בענן, אוהד צופה ומגיב, אתה רואה את התגובה בפורטל. עובד מכל מקום עם חיבור."

# REASONING DISCIPLINE
When you make a recommendation, briefly say *why* (1 sentence: which constraint matched). When you compare two programs, name the trade-off in one line. Never list 3+ programs without committing — if multiple fit, pick a default and say what would shift you to the other.`;

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

  // Cross-site callers have no business driving a paid model on Ohad's key.
  if (!originAllowed(req)) { res.status(403).json({ error: 'Forbidden' }); return; }

  // Was keyed on the LEFTMOST x-forwarded-for entry, which is client-supplied:
  // sending a random XFF per request reset the bucket every time, making the
  // limiter a no-op for anyone who bothered. clientIp() prefers x-real-ip and
  // otherwise takes the RIGHTMOST XFF hop, which Vercel controls.
  const ip = clientIp(req);
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
  const lang = String(body?.lang || '').toLowerCase().slice(0, 8);
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
  // Server-side memory: if the frontend has only a fresh thread (1–2 messages)
  // but we have prior turns logged for this sessionId, prepend them so a
  // returning visitor isn't talking to a stranger. Cap total at ~20 turns.
  let assembled = cleanMessages;
  if (sessionId && cleanMessages.length <= 2) {
    const prior = await recallSession(sessionId, 14);
    if (prior.length) {
      // Drop tail prior turns that duplicate the incoming first message.
      const incomingFirst = cleanMessages[0]?.content?.trim();
      while (prior.length && prior[prior.length - 1].content?.trim() === incomingFirst) prior.pop();
      assembled = [...prior, ...cleanMessages].slice(-20);
    }
  }

  const wantStream = !!body?.stream;
  const lastVisitor = cleanMessages[cleanMessages.length - 1]?.content;
  const cleanMessagesForApi = assembled;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        // Sonnet 4.6 is materially smarter than Haiku at multi-turn coaching
        // judgment + objection handling. Cost goes from ~$0.001 → ~$0.005 per
        // turn (still ~4k turns per $20). Worth it.
        model: 'claude-sonnet-4-6',
        max_tokens: 800,
        // Cache the long system prompt so repeated visitor turns within 5min
        // only pay once for the system tokens — typical conversation gets a
        // 90%+ cache hit rate after the first message. The lang-lock block
        // is appended uncached so EN vs HE share the same cached prefix.
        system: lang === 'he'
          ? [
              { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
              { type: 'text', text: 'LANGUAGE LOCK: The visitor is browsing the Hebrew interface. Reply in natural Israeli Hebrew on every turn — even if their input is in English (e.g. "hi"), even if they switch mid-thread. The "match the visitor language" rule above is overridden for this session.' },
            ]
          : [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
        messages: cleanMessagesForApi,
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
