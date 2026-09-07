// Shared inline video embed. Same 4-way ladder ClientPortal uses, lifted out
// so the coach editor can paste a URL and immediately see what the trainee
// will see — paste-time sanity check for YouTube IDs, direct file URLs,
// Google Photos shares (server-resolved), and lh3.googleusercontent.com.

import React, { useState, useEffect } from 'react';
import { C, FN, ytId, ytIsShort } from './theme';

// Reject anything that isn't an http(s) URL (javascript:/data:/vbscript: etc.)
// before it ever reaches an href/src. Video/link fields are coach-controlled
// today, so this is defence-in-depth, not a live hole. (security audit) Shared.
export const safeUrl = (u) => (typeof u === 'string' && /^https?:\/\//i.test(u)) ? u : null;

// True only when VideoEmbed will actually render a player for this URL (one of
// the 4 recognized kinds below). Callers gate optional "show a demo" affordances
// on this so they never surface a button that opens a blank pane — matches the
// render ladder in VideoEmbed() exactly. Keep in sync with it.
export const canEmbed = (u) => {
  const url = safeUrl(u);
  if (!url) return false;
  return !!ytId(url)
    || /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url)
    || /(photos\.app\.goo\.gl|photos\.google\.com)/i.test(url)
    || /lh3\.googleusercontent\.com/i.test(url);
};

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
        // Cache SUCCESSES only. Caching an error poisoned the URL: a single
        // transient /api/resolve-video failure (cold start / timeout / 429) was
        // served from cache on every later render, so the video showed
        // "NOT EMBEDDABLE" forever until a hard reload — re-pasting never retried.
        if (next.phase === 'ok') _gphCache.set(url, next);
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

// Tap-to-play YouTube. A bare <iframe src="youtube.com/embed/..."> pulls the
// whole YouTube player (~1MB of script over ~20 requests) the moment it mounts,
// before anything is on screen - and the athlete portal mounts one per exercise
// opened. Ohad, 2026-09-07: "yuvi's videos take a while to load"; Yuval's block
// is YouTube links end to end. Until tapped this is one poster frame (~20KB);
// the tap mounts the real player with autoplay. The first pointer over the
// facade pre-connects to YouTube's hosts so the player's own fetches start on
// a warm connection.
let _ytPreconnected = false;
const preconnectYouTube = () => {
  if (_ytPreconnected || typeof document === 'undefined') return;
  _ytPreconnected = true;
  for (const href of ['https://www.youtube.com', 'https://www.google.com', 'https://i.ytimg.com', 'https://static.doubleclick.net']) {
    const l = document.createElement('link'); l.rel = 'preconnect'; l.href = href; document.head.appendChild(l);
  }
};
export function YouTubeLite({ id, short = false }) {
  const [play, setPlay] = useState(false);
  useEffect(() => { setPlay(false); }, [id]);
  if (play) {
    return <iframe title="video" src={`https://www.youtube.com/embed/${id}?autoplay=1&playsinline=1&rel=0`}
      allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen
      style={{ width: '100%', height: '100%', border: 'none', display: 'block' }} />;
  }
  return (
    <button type="button" onClick={() => setPlay(true)} onPointerEnter={preconnectYouTube} onTouchStart={preconnectYouTube} aria-label="Play video"
      style={{ position: 'relative', width: '100%', height: '100%', padding: 0, border: 'none', background: '#000', cursor: 'pointer', display: 'block' }}>
      <img src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`} alt="" loading="lazy" decoding="async"
        style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: short ? 'center 40%' : 'center', display: 'block', opacity: 0.85 }} />
      <span aria-hidden="true" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ width: 56, height: 56, background: 'rgba(10,10,11,0.78)', border: `1px solid ${C.ac}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill={C.ac}><path d="M8 5v14l11-7z" /></svg>
        </span>
      </span>
    </button>
  );
}

export default function VideoEmbed({ url }) {
  if (!safeUrl(url)) return null;   // drop non-http(s) before any href/src render
  const wrap = { borderRadius: 0, overflow: 'hidden', aspectRatio: '16/9', background: '#000', border: `1px solid ${C.cardBd}` };
  const yid = ytId(url);
  if (yid) {
    // Shorts are vertical — give them a portrait 9:16 frame (capped width, centered)
    // so they fill it instead of sitting pillarboxed inside a 16:9 box.
    const frame = ytIsShort(url)
      ? { aspectRatio: '9/16', maxWidth: 300, marginLeft: 'auto', marginRight: 'auto', borderRadius: 0, overflow: 'hidden', background: '#000', border: `1px solid ${C.cardBd}` }
      : { ...wrap, background: 'transparent' };
    return <div style={frame}><YouTubeLite id={yid} short={ytIsShort(url)} /></div>;
  }
  if (/\.(mp4|webm|mov|m4v)(\?|$)/i.test(url)) return <div style={wrap}><video src={url} controls playsInline style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000' }} /></div>;
  if (/(photos\.app\.goo\.gl|photos\.google\.com)/i.test(url)) return <GooglePhotos url={url} />;
  if (/lh3\.googleusercontent\.com/i.test(url)) return <div style={wrap}><video src={url} controls playsInline style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000' }} /></div>;
  return null;
}
