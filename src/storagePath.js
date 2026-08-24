// storagePath.js — pure parsing of Supabase Storage URLs. NO imports, so it can
// be unit-tested in node without pulling the browser supabase client in.
// The network side lives in storageUrl.js.

/** `.../storage/v1/object/public|sign/<bucket>/<path>` -> { bucket, path } */
export function parseStoredUrl(url) {
  const m = String(url || '').match(/\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+?)(?:\?|$)/);
  if (!m) return null;
  let path;
  try { path = decodeURIComponent(m[2]); } catch { path = m[2]; }
  return { bucket: m[1], path };
}

/** True for a URL that points at our Supabase Storage. */
export const isStoredUrl = (url) => !!parseStoredUrl(url);
