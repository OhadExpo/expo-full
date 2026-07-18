// Bug-report sink — the "Report a Bug" buttons in the coach + athlete
// portal headers POST here. Writes to public.bug_reports via PostgREST
// (anon INSERT is allowed by RLS so even a broken-auth bug can be
// reported) and mirrors the report to Vercel function logs so it shows
// up next to ErrorBoundary crash captures.

import { clientIp } from './_ip.js';

export const config = {
  maxDuration: 5,
  api: { bodyParser: { sizeLimit: '64kb' } },
};

const SUPA_URL = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const SUPA_PUBLISHABLE_KEY = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';

// In-process rate limit — 10 reports per IP per hour. The same caveat as
// /api/log-error: cold-start resets the bucket but stops casual spam.
const buckets = new Map();
const LIMIT = 10;
const WINDOW_MS = 60 * 60 * 1000;
function withinBudget(ip) {
  const now = Date.now();
  const arr = (buckets.get(ip) || []).filter(t => now - t < WINDOW_MS);
  if (arr.length >= LIMIT) { buckets.set(ip, arr); return false; }
  arr.push(now); buckets.set(ip, arr);
  return true;
}

function trunc(v, n) {
  if (typeof v !== 'string') return '';
  return v.length > n ? v.slice(0, n) + '…' : v;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const ip = clientIp(req); // trusted IP (x-real-ip / rightmost XFF); leftmost XFF is client-spoofable
  if (!withinBudget(ip)) {
    res.status(429).json({ error: 'Too many reports from this IP. Wait a few minutes and try again.' });
    return;
  }
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = null; }
  }
  if (!body || typeof body !== 'object') {
    res.status(400).json({ error: 'Bad payload' });
    return;
  }
  const description = trunc(String(body.description || '').trim(), 4000);
  if (!description) {
    res.status(400).json({ error: 'Description required.' });
    return;
  }
  const reporter_email = trunc(String(body.reporterEmail || '').trim().toLowerCase(), 240);
  const role = ['coach', 'athlete', 'anon'].includes(body.role) ? body.role : 'anon';
  const url = trunc(String(body.url || ''), 800);
  // Context bundle — already structured client-side. Cap each subfield
  // before persisting so a malformed client can't bloat the row.
  const c = body.context && typeof body.context === 'object' ? body.context : {};
  const context = {
    ua: trunc(String(c.ua || ''), 320),
    viewport: c.viewport && typeof c.viewport === 'object'
      ? { w: Number(c.viewport.w) || 0, h: Number(c.viewport.h) || 0 }
      : null,
    locale: trunc(String(c.locale || ''), 16),
    theme: trunc(String(c.theme || ''), 16),
    bundle: trunc(String(c.bundle || ''), 80),
    consoleErrors: Array.isArray(c.consoleErrors)
      ? c.consoleErrors.slice(-10).map(e => ({
          at: trunc(String(e?.at || ''), 40),
          message: trunc(String(e?.message || ''), 400),
          source: trunc(String(e?.source || ''), 240),
        }))
      : [],
    storageKeys: Array.isArray(c.storageKeys)
      ? c.storageKeys.slice(0, 40).map(k => trunc(String(k || ''), 80))
      : [],
  };

  const row = {
    reporter_email: reporter_email || null,
    role,
    url,
    description,
    context,
  };

  try {
    const r = await fetch(`${SUPA_URL}/rest/v1/bug_reports`, {
      method: 'POST',
      headers: {
        'apikey': SUPA_PUBLISHABLE_KEY,
        'Authorization': `Bearer ${SUPA_PUBLISHABLE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify(row),
    });
    if (!r.ok) {
      const txt = await r.text().catch(() => '');
      console.error('[bug-report insert failed]', r.status, txt);
      res.status(502).json({ error: 'Could not persist report. Try again.' });
      return;
    }
  } catch (e) {
    console.error('[bug-report fetch threw]', e?.message || e);
    res.status(502).json({ error: 'Network error persisting report.' });
    return;
  }

  // Mirror to console so the report appears in Vercel logs alongside
  // ErrorBoundary crash captures — a one-stop place to scan when
  // triaging.
  console.error('[expo bug report]', JSON.stringify({
    ip, reporter_email, role, url,
    description: trunc(description, 400),
    consoleErrors: context.consoleErrors.length,
  }));

  res.status(204).end();
}
