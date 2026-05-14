// F-14 — AI meal photo → macros endpoint.
//
// Flow:
//   1. Athlete uploads photo to Supabase storage bucket `meal-photos` (signed URL).
//   2. Frontend POSTs { photoUrl, hint? } to /api/meal-macros.
//   3. We call Claude Haiku with vision → JSON parse → return.
//
// Cost: Haiku vision ~$0.003 per image. Solo-coach scale (~20 clients ×
// 3 meals/day max) = ~$0.20/day worst case; in practice well under.
//
// Privacy: we never store the image inside Anthropic's API — only send
// the URL and trash it from our side after returning the macros.

import Anthropic from '@anthropic-ai/sdk';

export const config = {
  maxDuration: 30,
  api: { bodyParser: { sizeLimit: '128kb' } },
};

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
  const body = req.body || {};
  const photoUrl = String(body.photoUrl || '').trim();
  const hint = String(body.hint || '').trim().slice(0, 200);
  if (!photoUrl || !/^https?:\/\//i.test(photoUrl)) {
    res.status(400).json({ error: 'photoUrl is required and must be http(s).' });
    return;
  }

  const client = new Anthropic({ apiKey });
  try {
    const messageContent = [
      { type: 'image', source: { type: 'url', url: photoUrl } },
    ];
    if (hint) {
      messageContent.push({ type: 'text', text: `Hint from athlete: ${hint}` });
    } else {
      messageContent.push({ type: 'text', text: 'Estimate the macros for this meal.' });
    }
    const out = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      system: SYSTEM,
      messages: [{ role: 'user', content: messageContent }],
    });
    const text = (out?.content?.[0]?.text || '').trim();
    let parsed = null;
    try {
      // Strip any code-fence wrapper before parsing.
      const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
      parsed = JSON.parse(cleaned);
    } catch (e) {
      res.status(502).json({ error: 'AI returned non-JSON.', raw: text.slice(0, 400) });
      return;
    }
    // Light sanity defaulting — never trust the model wholesale.
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
