// Athlete-side lead capture with AI conversation summary. Mirror of
// expo-app/api/capture.js — same Supabase target, different default
// source/context tags and a summary prompt scoped to athlete intents
// (which program, equipment, scheduling, etc).

import { clientIp, originAllowed, rateLimit, capMessages } from './_ip.js';

const SUPA_URL = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const SUPA_PUBLISHABLE_KEY = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';

const SUMMARY_SYSTEM = `You will be given a transcript of a chat between an athlete visiting expo-il.co.il and Ohad's marketing assistant. Output ONE line (max 140 chars, plain text, no quotes, no markdown) summarizing what the VISITOR was asking about — their goals, training level, schedule, equipment situation, or which program they were considering. If they asked nothing meaningful, output: "no specific questions asked".

Examples of good output:
- beginner asking which program for general fitness, trains 3x/week at home
- considering Hypertrophy 16, asking about gym equipment requirements
- post-injury return-to-training, asking about pain management approach
- couple comparing Couples block vs two separate programs`;

async function summarize(messages, apiKey) {
  if (!apiKey) return null;
  const transcript = messages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => `${m.role === 'user' ? 'VISITOR' : 'ASSISTANT'}: ${m.content}`)
    .join('\n\n')
    .slice(0, 6000);
  if (!transcript) return null;
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
        max_tokens: 80,
        system: SUMMARY_SYSTEM,
        messages: [{ role: 'user', content: transcript }],
      }),
    });
    if (!r.ok) return null;
    const data = await r.json();
    const text = (data?.content || []).map(c => c?.type === 'text' ? c.text : '').join('').trim();
    if (!text) return null;
    return text.replace(/\s+/g, ' ').slice(0, 140);
  } catch {
    return null;
  }
}

const INTENT_SYSTEM = `You will be given a transcript of a chat between an athlete visiting expo-il.co.il and the marketing assistant. Extract structured intent fields as a JSON object — nothing else. Output ONLY valid JSON, no markdown, no commentary.

Schema:
{
  "interests": [string, ...],          // 0-4 items, lowercase, short. Examples: "hypertrophy", "powerlifting", "remote coaching", "form review"
  "pain_points": [string, ...],        // 0-3 items, constraints/concerns. Examples: "bad knees", "limited time", "no gym", "post injury"
  "programs_mentioned": [string, ...]  // 0-3 items, exact program slugs if mentioned. Valid values: "foundation-12", "hypertrophy-16", "powerbuild-12", "couples-12", "rehab-return", "athlete-conditioning-12". Empty array if none mentioned.
}

Rules:
- Use empty arrays when nothing is clearly stated. Never invent.
- Each string max 40 chars, lowercase, no quotes inside.
- Total response <= 400 chars.`;

async function extractIntent(messages, apiKey) {
  if (!apiKey) return null;
  const transcript = messages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => `${m.role === 'user' ? 'VISITOR' : 'ASSISTANT'}: ${m.content}`)
    .join('\n\n')
    .slice(0, 6000);
  if (!transcript) return null;
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
        max_tokens: 200,
        system: INTENT_SYSTEM,
        messages: [{ role: 'user', content: transcript }],
      }),
    });
    if (!r.ok) return null;
    const data = await r.json();
    const text = (data?.content || []).map(c => c?.type === 'text' ? c.text : '').join('').trim();
    if (!text) return null;
    let parsed;
    try { parsed = JSON.parse(text); } catch { return null; }
    if (!parsed || typeof parsed !== 'object') return null;
    const cleanArr = (a) => Array.isArray(a)
      ? a.filter(x => typeof x === 'string').map(x => x.toLowerCase().trim().slice(0, 40)).filter(Boolean).slice(0, 4)
      : null;
    return {
      interests: cleanArr(parsed.interests),
      pain_points: cleanArr(parsed.pain_points),
      programs_mentioned: cleanArr(parsed.programs_mentioned),
    };
  } catch {
    return null;
  }
}

async function insertLead({ email, source, context, user_agent, notes, intent }) {
  const tryInsert = async (body) => {
    const res = await fetch(`${SUPA_URL}/rest/v1/leads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPA_PUBLISHABLE_KEY,
        'Authorization': `Bearer ${SUPA_PUBLISHABLE_KEY}`,
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify(body),
    });
    return res;
  };
  const enriched = {
    email, source, context, user_agent, notes,
    ...(intent ? {
      interests: intent.interests || null,
      pain_points: intent.pain_points || null,
      programs_mentioned: intent.programs_mentioned || null,
    } : {}),
  };
  let res = await tryInsert(enriched);
  if (!res.ok && res.status !== 409 && intent) {
    res = await tryInsert({ email, source, context, user_agent, notes });
  }
  if (!res.ok && res.status !== 409 && notes) {
    res = await tryInsert({ email, source, context, user_agent });
  }
  return res;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' }); return;
  }
  // ABUSE GUARDS. This endpoint is unauthenticated and fires TWO paid Anthropic
  // calls per request, so before this it was a direct route to running up
  // Ohad's bill: a plain `curl` loop cost two model calls per hit, unbounded,
  // from any origin, with no cap on transcript size.
  if (!originAllowed(req)) { res.status(403).json({ error: 'Forbidden' }); return; }
  const ip = clientIp(req);
  const rl = rateLimit(`capture:${ip}`, 8, 60_000);   // 8/min per IP
  if (!rl.ok) {
    res.setHeader('Retry-After', String(rl.retryAfter || 60));
    res.status(429).json({ error: 'Too many requests — try again shortly.' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { res.status(400).json({ error: 'Bad JSON' }); return; }
  }
  const email = String(body?.email || '').trim();
  const source = String(body?.source || 'expo-il-chat').slice(0, 60);
  const context = String(body?.context || 'chat_capture').slice(0, 60);
  // capMessages both CAPS the token spend per request and drops malformed
  // entries. Previously `messages.slice(-30)` was passed straight through and
  // the transcript build ran OUTSIDE any try — so `{"messages":[null]}` threw
  // an unhandled TypeError, returned a raw 500, and the lead was never saved.
  const messages = capMessages(body?.messages, { maxMessages: 20, maxChars: 1500 });
  const userAgent = (req.headers['user-agent'] || '').toString().slice(0, 200);

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: 'Invalid email' }); return;
  }

  // Enriching the lead must never cost us the lead itself. If the model calls
  // fail (outage, bad key, rate limit), fall back to nulls and still insert —
  // an email with no summary is worth far more than a 500.
  let summary = null, intent = null;
  try {
    [summary, intent] = await Promise.all([
      summarize(messages, process.env.ANTHROPIC_API_KEY),
      extractIntent(messages, process.env.ANTHROPIC_API_KEY),
    ]);
  } catch (e) {
    console.error('capture enrichment failed (saving lead anyway):', e?.message || e);
  }

  try {
    const supaRes = await insertLead({
      email,
      source,
      context,
      user_agent: userAgent,
      notes: summary,
      intent,
    });
    if (!supaRes.ok && supaRes.status !== 409) {
      const txt = await supaRes.text().catch(() => '');
      console.error('lead insert failed', supaRes.status, txt);
      res.status(502).json({ error: 'Could not save your email — try again, or use the contact form.' });
      return;
    }
    res.status(200).json({ ok: true, summarized: !!summary, tagged: !!intent });
  } catch (e) {
    console.error('capture handler exception', e);
    res.status(500).json({ error: 'Capture unavailable — try again.' });
  }
}
