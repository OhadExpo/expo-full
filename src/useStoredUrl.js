// useStoredUrl - a stored Supabase Storage URL, resolved to one that loads now
// (2.10 #510-S). The raw `/object/public/` URL renders first and the signed one
// replaces it when it arrives; anything that is not a stored object (YouTube,
// blob:, data:) passes through untouched. While the buckets are public this is
// a no-op; it is what keeps media loading once they are private.
import { useEffect, useState } from 'react';
import { resolveStoredUrl, isStoredUrl } from './storageUrl';

export function useStoredUrl(url) {
  const [out, setOut] = useState(url);
  useEffect(() => {
    let alive = true;
    setOut(url);
    if (url && isStoredUrl(url)) resolveStoredUrl(url).then((u) => { if (alive && u) setOut(u); }).catch(() => {});
    return () => { alive = false; };
  }, [url]);
  return out;
}
