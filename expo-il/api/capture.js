// Athlete-side lead capture with AI conversation summary. Mirror of
// expo-app/api/capture.js — same Supabase target, different default
// source/context tags and a summary prompt scoped to athlete intents
// (which program, equipment, scheduling, etc).

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
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { res.status(400).json({ error: 'Bad JSON' }); return; }
  }
  const email = String(body?.email || '').trim();
  const source = String(body?.source || 'expo-il-chat').slice(0, 60);
  const context = String(body?.context || 'chat_capture').slice(0, 60);
  const messages = Array.isArray(body?.messages) ? body.messages.slice(-30) : [];
  const userAgent = (req.headers['user-agent'] || '').toString().slice(0, 200);

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: 'Invalid email' }); return;
  }

  const [summary, intent] = await Promise.all([
    summarize(messages, process.env.ANTHROPIC_API_KEY),
    extractIntent(messages, process.env.ANTHROPIC_API_KEY),
  ]);

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
