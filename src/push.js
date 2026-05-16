// Client-side helpers for Web Push subscribe / unsubscribe / send.
//
// VAPID public key is shipped as VITE_VAPID_PUBLIC_KEY (Vite inlines
// VITE_-prefixed env vars at build time). It's safe to expose — the
// public key is meant to identify our app to push services. Private
// key stays on the server only.
//
// iOS gotcha: Web Push on iOS works only when the PWA is installed to
// home screen (display-mode: standalone). Regular Safari tabs cannot
// subscribe. isPwaInstalled() detects this so the UI can show an
// "Add to Home Screen first" hint instead of a confusing failure.

import { supabase } from './supabase';

// Public key is fine to embed — it's meant to identify our app to push
// services and ships to every client anyway. Env var takes precedence
// if set so future rotation doesn't need a code change.
const VAPID_PUBLIC = import.meta.env.VITE_VAPID_PUBLIC_KEY
  || 'BDnmswzixJ2FMW_y79Kn4e_FS1IWhqhulSAEHtXFJav-piekmEQMEOz9AZ8NU0AWwEajkwb_SYdtfH2hObyuYIk';

// VAPID-encoded base64url → Uint8Array for pushManager.subscribe().
function urlBase64ToUint8(b64) {
  const padding = '='.repeat((4 - (b64.length % 4)) % 4);
  const base64 = (b64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function isPushSupported() {
  return typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window
    && !!VAPID_PUBLIC;
}

// True when the PWA is launched standalone (Add to Home Screen on iOS,
// installed PWA on Android/desktop). iOS REQUIRES this for push.
export function isPwaInstalled() {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return true;
  if (navigator.standalone === true) return true; // iOS-specific
  return false;
}

export function isIOS() {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

export async function getPushPermission() {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission; // 'default' | 'granted' | 'denied'
}

export async function getCurrentSubscription() {
  if (!isPushSupported()) return null;
  try {
    const reg = await navigator.serviceWorker.ready;
    return await reg.pushManager.getSubscription();
  } catch { return null; }
}

// Subscribe + persist on the server. Returns the subscription object
// on success. Throws with a user-friendly message on failure.
export async function enablePush(role) {
  if (!isPushSupported()) throw new Error('Push notifications are not supported in this browser.');
  if (isIOS() && !isPwaInstalled()) {
    throw new Error('On iPhone/iPad, add EXPO to your home screen first, then enable notifications from the installed app.');
  }
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Notification permission denied.');

  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8(VAPID_PUBLIC),
    });
  }

  const { data: session } = await supabase.auth.getSession();
  const token = session?.session?.access_token;
  if (!token) throw new Error('Sign in first to enable notifications.');

  const r = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ subscription: sub.toJSON(), role }),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error(`Server rejected subscription (${r.status}). ${t.slice(0, 120)}`);
  }
  return sub;
}

export async function disablePush() {
  if (!isPushSupported()) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    await sub.unsubscribe();
    // The server-side row stays until the push service marks it 410 on
    // next send — cheaper than maintaining a delete endpoint right now.
  } catch {}
}

// Best-effort fire-and-forget send. Used by triggers (CoachMessages send,
// workout completion). Caller passes the recipient email + payload.
export async function sendPush({ toEmail, title, body, url, tag }) {
  if (!toEmail) return;
  try {
    const { data: session } = await supabase.auth.getSession();
    const token = session?.session?.access_token;
    if (!token) return;
    await fetch('/api/push/send', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ toEmail, title, body, url, tag }),
    });
  } catch {
    // Push is non-essential — never block the calling flow on a push failure.
  }
}
