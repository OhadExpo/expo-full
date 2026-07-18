// Receives client-side render errors from ErrorBoundary so the crash
// shows up in Vercel function logs alongside server-side errors. No
// persistent storage — just a structured console.error that the Vercel
// runtime captures. Tightly rate-limited per IP so a malicious client
// can't fill the log stream.

import { clientIp } from './_ip.js';

export const config = {
  maxDuration: 5,
  api: { bodyParser: { sizeLimit: '32kb' } },
};

const buckets = new Map();
const LIMIT = 30;
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
    res.status(429).json({ error: 'Too many client errors from this IP.' });
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
  console.error('[expo client crash]', JSON.stringify({
    ip,
    ts: trunc(String(body.ts || ''), 40),
    url: trunc(String(body.url || ''), 300),
    ua: trunc(String(body.ua || ''), 240),
    message: trunc(String(body.message || ''), 600),
    stack: trunc(String(body.stack || ''), 3000),
    componentStack: trunc(String(body.componentStack || ''), 3000),
  }));
  res.status(204).end();
}
