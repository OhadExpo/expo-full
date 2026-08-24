// storageUrl.js — resolve a stored Supabase Storage object to a URL the browser
// can actually load, WITHOUT depending on the bucket being world-readable.
//
// The 2026-07-19 security audit left this open: all four buckets are
// `public: true`, so an object read needs no auth at all. Proven again on
// 2026-08-25 — an unauthenticated HEAD against two real athletes' form-video
// URLs returned 200 with the full content-length. Anyone holding a URL can
// fetch an athlete's training video, meal photo, voice note or signed contract,
// and coach-voice paths (`traineeId/timestamp.ext`) carry no random component,
// so they are guessable.
//
// Flipping the buckets private is Ohad's call — it is outward-facing and would
// break every already-stored `/object/public/` URL the instant it happens. This
// module makes the app work EITHER WAY, so the flip becomes a one-line,
// reversible change instead of a migration:
//
//   • createSignedUrl works on a PUBLIC bucket too, so wiring this in changes
//     nothing today.
//   • The moment a bucket goes private, the same call is what keeps the media
//     loading — for a viewer whose session is allowed to read it, and only them.
//   • Every failure path falls back to the original URL, so a signing hiccup can
//     never blank a video that would otherwise have played.
//
// See scripts/migrations/2026-08-25-storage-private-buckets.sql for the flip.

import { supabase } from './supabase';
import { parseStoredUrl, isStoredUrl } from './storagePath';

export { parseStoredUrl, isStoredUrl };

// 8 hours: comfortably longer than any review session, short enough that a
// leaked link dies on its own.
const DEFAULT_TTL = 60 * 60 * 8;

// url -> { url, at } — signing on every render would be a network call per frame
// of a re-rendering list.
const cache = new Map();
const CACHE_MS = (DEFAULT_TTL - 300) * 1000;


/**
 * Resolve a stored URL to something loadable now.
 * Returns the ORIGINAL url unchanged for anything that isn't a storage object,
 * and on any signing failure — never returns null.
 */
export async function resolveStoredUrl(url, { expiresIn = DEFAULT_TTL } = {}) {
  const parsed = parseStoredUrl(url);
  if (!parsed) return url;

  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.url;

  try {
    const { data, error } = await supabase.storage.from(parsed.bucket).createSignedUrl(parsed.path, expiresIn);
    if (error || !data || !data.signedUrl) return url;
    cache.set(url, { url: data.signedUrl, at: Date.now() });
    return data.signedUrl;
  } catch {
    return url;                       // offline, no session, bucket gone — play what we have
  }
}

/** Drop a cached signature (e.g. after a 403) so the next read re-signs. */
export function forgetStoredUrl(url) { cache.delete(url); }
