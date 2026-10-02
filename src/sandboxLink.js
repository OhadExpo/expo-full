// A LINK MADE IN THE SANDBOX SAYS SO (1.10 audit C).
//
// Share, intake and contract links made in the partner's seat live in his
// sandbox copy, so they resolve only while that seat is signed in (supabase.js
// sends the public RPCs to their sbx_ twins; a visitor's call reaches the real
// RPC, which does not know the token). Opened anywhere else, the page used to
// read "not found" - a dead end that looks like a broken product. The link
// carries sbx=1 and the public page explains instead.
import { isSandboxSeat } from './supabase';
import { tr, readLang } from './i18n';

export const sandboxLink = (url) => (isSandboxSeat() ? `${url}${url.includes('?') ? '&' : '?'}sbx=1` : url);

export const sandboxLinkNote = (lang = readLang()) => {
  try {
    if (!new URLSearchParams(window.location.search).has('sbx')) return null;
  } catch { return null; }
  return tr(lang, 'This link was made in a sandbox copy, so it opens only while the account that made it is signed in.');
};
