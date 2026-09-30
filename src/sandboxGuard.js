// THE SANDBOX SEAT NEVER REACHES A REAL PERSON (#476, 30.9).
//
// The partner's seat is his own copy of EXPO: he can press everything. But the
// athletes behind the copied rows are real, and a WhatsApp / mail / call / SMS
// button would reach them from his phone. Every such door goes through one of
// two things - window.open or a link click - so both are checked here, once,
// for the whole app. Outside the sandbox this does nothing at all.
import { isSandboxSeat } from './supabase';
import { toast } from './ui';
import { tr, readLang } from './i18n';

const OUTWARD = /^(mailto:|tel:|sms:)|^https?:\/\/(wa\.me|api\.whatsapp\.com|web\.whatsapp\.com|chat\.whatsapp\.com|www\.whatsapp\.com)\b/i;
export const isOutwardUrl = (url) => OUTWARD.test(String(url || '').trim());

const say = () => toast(tr(readLang(), 'SANDBOX · this would contact a real athlete, so it stays here'), 'info');

let installed = false;
export function installSandboxGuard() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  const realOpen = window.open.bind(window);
  window.open = (url, ...rest) => {
    if (isSandboxSeat() && isOutwardUrl(url)) { say(); return null; }
    return realOpen(url, ...rest);
  };
  // capture phase: runs before any handler on the link itself
  // left click, middle click (auxclick) and the context menu's "open in new tab"
  // (contextmenu is blocked on those links only) - 1.10 audit S3
  const stop = (e) => {
    if (!isSandboxSeat()) return;
    const a = e.target && e.target.closest && e.target.closest('a[href]');
    if (a && isOutwardUrl(a.getAttribute('href'))) { e.preventDefault(); e.stopPropagation(); if (e.type !== 'contextmenu') say(); }
  };
  document.addEventListener('click', stop, true);
  document.addEventListener('auxclick', stop, true);
  document.addEventListener('contextmenu', stop, true);
}
