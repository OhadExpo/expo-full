// F-14 — AI meal photo → macros endpoint.
//
// Flow:
//   1. Athlete uploads photo to Supabase storage bucket `meal-photos`.
//   2. Frontend POSTs { photoUrl, hint? } to /api/meal-macros.
//   3. We call Claude Haiku with vision via raw fetch → JSON parse → return.
//
// Cost: Haiku vision ~$0.003 per image. Solo-coach scale (~20 clients ×
// 3 meals/day max) = ~$0.20/day worst case; in practice well under.
//
// Privacy: we never store the image inside Anthropic's API — only send
// the URL and trash it from our side after returning the macros.
//
// NOTE: raw fetch, not the `@anthropic-ai/sdk` package. The SDK is not
// declared in package.json — importing it crashes the function on
// cold-start with FUNCTION_INVOCATION_FAILED. Mirrors api/chat.js +
// api/capture.js which already proxy Anthropic this way.

export const config = {
  maxDuration: 30,
};

const SUPA_URL = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const SUPA_PUBLISHABLE_KEY = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';

// Tiny in-memory rate limiter — best-effort, resets on cold start.
// Same pattern as api/chat.js. 20 analyses/hour/IP is far above any real
// athlete's meal cadence but stops a cost-burn loop.
const rateBuckets = new Map();
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60 * 60 * 1000;
function allowRate(ip) {
  const now = Date.now();
  const arr = (rateBuckets.get(ip) || []).filter(t => now - t < RATE_WINDOW_MS);
  if (arr.length >= RATE_LIMIT) { rateBuckets.set(ip, arr); return false; }
  arr.push(now); rateBuckets.set(ip, arr);
  return true;
}

const SYSTEM = `You are a precise nutrition estimator. The user will show you a meal photo. Estimate the macronutrient profile of what's visible.

OUTPUT FORMAT — return ONLY valid JSON with this exact shape, no preamble:
{
  "items": [{ "name": "string", "portion": "string", "kcal": number }],
  "kcal": number,
  "protein_g": number,
  "carb_g": number,
  "fat_g": number,
  "confidence": "high" | "medium" | "low",
  "notes": "string (optional, ≤80 chars — e.g. 'oil amount unclear, assumed 1 tbsp')"
}

Rules:
- Estimate based on what you can see. Use standard portion conventions.
- If something is ambiguous (a sauce, oil content), pick a reasonable middle estimate and note it in "notes".
- If you cannot see food clearly, return confidence "low" and your best guess anyway.
- Numbers are grams (g) for macros and kcal for calories. No units in the JSON values.
- Do not refuse. Do not lecture. Just return the JSON.`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST only' });
    return;
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'Server not configured — ANTHROPIC_API_KEY missing.' });
    return;
  }
  // Paid endpoint: require a Supabase session, like /api/push and
  // /api/smart-import. Without this anyone with the URL can burn the
  // Anthropic key in a loop.
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing Authorization bearer token.' });
    return;
  }
  try {
    const userR = await fetch(`${SUPA_URL}/auth/v1/user`, {
      headers: {
        'apikey': SUPA_PUBLISHABLE_KEY,
        'Authorization': `Bearer ${authHeader.slice('Bearer '.length).trim()}`,
      },
    });
    if (!userR.ok) {
      res.status(401).json({ error: 'auth lookup failed' });
      return;
    }
  } catch {
    res.status(500).json({ error: 'auth lookup error' });
    return;
  }

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (!allowRate(ip)) {
    res.status(429).json({ error: 'Rate limit — try again later.' });
    return;
  }

  const body = req.body || {};
  const photoUrl = String(body.photoUrl || '').trim();
  const hint = String(body.hint || '').trim().slice(0, 200);
  if (!photoUrl || !/^https?:\/\//i.test(photoUrl)) {
    res.status(400).json({ error: 'photoUrl is required and must be http(s).' });
    return;
  }
  // Meal photos only ever live in our own storage bucket — refuse to act
  // as a generic vision proxy for arbitrary URLs.
  if (!photoUrl.startsWith(`${SUPA_URL}/storage/v1/object/`)) {
    res.status(400).json({ error: 'photoUrl must be an EXPO storage URL.' });
    return;
  }

  try {
    const messageContent = [
      { type: 'image', source: { type: 'url', url: photoUrl } },
      { type: 'text', text: hint ? `Hint from athlete: ${hint}` : 'Estimate the macros for this meal.' },
    ];
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 600,
        system: SYSTEM,
        messages: [{ role: 'user', content: messageContent }],
      }),
    });
    if (!r.ok) {
      const errBody = await r.text().catch(() => '');
      console.error('meal-macros Anthropic error:', r.status, errBody.slice(0, 400));
      res.status(502).json({ error: `Anthropic ${r.status}` });
      return;
    }
    const data = await r.json();
    const text = (data?.content || [])
      .map(c => (c?.type === 'text' ? c.text : ''))
      .join('')
      .trim();
    let parsed = null;
    try {
      // Strip any code-fence wrapper before parsing.
      const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
      parsed = JSON.parse(cleaned);
    } catch {
      res.status(502).json({ error: 'AI returned non-JSON.', raw: text.slice(0, 400) });
      return;
    }
    const macros = {
      items: Array.isArray(parsed.items) ? parsed.items.slice(0, 12) : [],
      kcal: Math.round(Number(parsed.kcal) || 0),
      protein_g: Math.round(Number(parsed.protein_g) || 0),
      carb_g: Math.round(Number(parsed.carb_g) || 0),
      fat_g: Math.round(Number(parsed.fat_g) || 0),
      confidence: ['high', 'medium', 'low'].includes(parsed.confidence) ? parsed.confidence : 'medium',
      notes: typeof parsed.notes === 'string' ? parsed.notes.slice(0, 200) : '',
    };
    res.status(200).json({ ok: true, macros });
  } catch (e) {
    console.error('meal-macros error:', e?.message || e);
    res.status(500).json({ error: e?.message || 'AI call failed.' });
  }
}
