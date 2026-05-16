// Shared inline video embed. Same 4-way ladder ClientPortal uses, lifted out
// so the coach editor can paste a URL and immediately see what the trainee
// will see — paste-time sanity check for YouTube IDs, direct file URLs,
// Google Photos shares (server-resolved), and lh3.googleusercontent.com.

import React, { useState, useEffect } from 'react';
import { C, FN, ytId } from './theme';

const _gphCache = new Map();

function GooglePhotos({ url }) {
  const [state, setState] = useState(() => _gphCache.get(url) || { phase: 'loading' });
  const [streamFailed, setStreamFailed] = useState(false);
  useEffect(() => {
    setStreamFailed(false);
    if (_gphCache.has(url)) { setState(_gphCache.get(url)); return; }
    let alive = true;
    fetch('/api/resolve-video?url=' + encodeURIComponent(url))
      .then(r => r.json().then(j => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (!alive) return;
        const next = ok && j?.url ? { phase: 'ok', src: j.url, poster: j.poster || null } : { phase: 'err', error: j?.error || 'Cannot resolve' };
        _gphCache.set(url, next);
        setState(next);
      })
      .catch(e => { if (alive) setState({ phase: 'err', error: String(e?.message || e) }); });
    return () => { alive = false; };
  }, [url]);
  const wrap = { borderRadius: 0, overflow: 'hidden', aspectRatio: '16/9', background: '#000', border: `1px solid ${C.cardBd}` };
  if (state.phase === 'loading') return <div style={{ ...wrap, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.tm, fontFamily: FN, fontSize: 11, letterSpacing: '0.18em' }}>LOADING…</div>;
  if (state.phase === 'err' || streamFailed) return <div style={{ ...wrap, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, color: C.tm, fontFamily: FN, fontSize: 11, padding: 12, textAlign: 'center' }}>
    <div>NOT EMBEDDABLE</div>
    <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: C.ac, textDecoration: 'none', letterSpacing: '0.18em' }}>OPEN IN GOOGLE PHOTOS →</a>
  </div>;
  // Google Photos serves dur=0 / 404 on the MP4 stream while a fresh upload is
  // still transcoding (or never finished). Both onError and a zero-duration
  // metadata load mean the trainee would otherwise stare at a black box —
  // fall back to the share-link button instead.
  const handleBadStream = () => setStreamFailed(true);
  const handleMeta = (e) => { if (!(e.currentTarget.duration > 0)) setStreamFailed(true); };
  return <div style={wrap}><video src={state.src} poster={state.poster || undefined} controls playsInline onError={handleBadStream} onLoadedMetadata={handleMeta} style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000' }} /></div>;
}

export default function VideoEmbed({ url }) {
  if (!url) return null;
  const wrap = { borderRadius: 0, overflow: 'hidden', aspectRatio: '16/9', background: '#000', border: `1px solid ${C.cardBd}` };
  const yid = ytId(url);
  if (yid) return <div style={{ ...wrap, background: 'transparent' }}><iframe src={`https://www.youtube.com/embed/${yid}`} style={{ width: '100%', height: '100%', border: 'none' }} allowFullScreen /></div>;
  if (/\.(mp4|webm|mov|m4v)(\?|$)/i.test(url)) return <div style={wrap}><video src={url} controls playsInline style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000' }} /></div>;
  if (/(photos\.app\.goo\.gl|photos\.google\.com)/i.test(url)) return <GooglePhotos url={url} />;
  if (/lh3\.googleusercontent\.com/i.test(url)) return <div style={wrap}><video src={url} controls playsInline style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000' }} /></div>;
  return null;
}
