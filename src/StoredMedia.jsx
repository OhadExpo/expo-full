// <video> and <img> for media that may live in a storage bucket (2.10 #510-S):
// the one way to render one, so no player is left holding a raw public URL the
// day the buckets go private. See useStoredUrl.
import React from 'react';
import { useStoredUrl } from './useStoredUrl';

export function StoredVideo({ src, ...rest }) {
  const url = useStoredUrl(src);
  return <video src={url || undefined} {...rest} />;
}

export function StoredImg({ src, alt = '', ...rest }) {
  const url = useStoredUrl(src);
  return <img src={url || undefined} alt={alt} {...rest} />;
}

// a link to a stored object opens its signed URL (a raw public one 400s once private)
export function StoredLink({ href, children, ...rest }) {
  const url = useStoredUrl(href);
  return <a href={url || undefined} {...rest}>{children}</a>;
}
