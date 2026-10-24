// THE VIDEO TRIMMER (#970, Ohad 24.10: "When an athlete uploads a video, allows him to cut it (where it starts and where
// it ends) make it smooth like Whatsapp" + "planned perfectly like the Whatsapp video but where you can scroll through the
// cut video, like Google photos trimming option" + "Build the smartest possible trimmer you can").
//
// Opens on every clip an athlete records or picks, before anything uploads. WhatsApp's layout: the clip plays looped
// inside the cut, a filmstrip under it with a handle at each end and the cut-off parts dimmed, the cut's length on top.
// Google Photos' scrub: a white playhead inside the cut that the finger drags frame by frame.
// NO AUTOMATIC CUT, ON PURPOSE (measured 24.10 on the 22 hand-labelled set clips, pose-lab/smartcut_eval.py): a cut
// picked from frame-to-frame movement cut INTO the labelled set on 22 of 22 clips (the phone being picked up is the
// loudest movement), and the best camera-aware variant still on 4 of 22. A default that eats reps is worse than none.
// It comes back only when a method cuts no set on all 22.
//
// Smoothness rules: one seek in flight at a time (a drag never queues a backlog of seeks); fast keyframe seeks while a
// handle moves, one exact seek when it lands; the playhead is moved by style, not by React state, at 60fps.
// #1025 (Ohad: "Scrolling through the video should be way smoother"): a finger no longer waits for a seek at all. The
// worker decodes the clip once at small size (src/trimThumbs.worker.js) and a drag draws the nearest of those frames on
// a canvas over the video the moment the finger moves; the video seeks once, where the finger lets go, and the canvas
// steps aside when that exact frame is on screen. Until the frames exist, the old fast seeks carry the drag.
// The sheet has its own URL (the page's path + /trim): Back cancels it. A reload cannot bring the chosen file back, so a reload of
// that URL lands on the page (ClientPortal drops the tail).
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { C, FN, FB } from './theme';
import { reportIssue } from './consoleBuffer';

const MIN_LEN = 1;          // seconds: the shortest cut
const HANDLE = 16;          // px: the handle's drawn width
const HIT = 24;             // px: extra grab margin around a handle (a thumb, not a cursor)
const STRIP_H = 56;         // px: the filmstrip's height
const SCRUB_LONG = 640;     // px: the scrub frames' long side (a phone shows the clip ~390 x 690 CSS px: sharp enough mid-drag)

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const mmss = (s) => { s = Math.round(Math.max(0, s || 0)); const m = Math.floor(s / 60); return `${m}:${String(s - m * 60).padStart(2, '0')}`; };   // the cut's length: rounded (6.9 s reads 0:07)
const mmssT = (s) => { s = Math.max(0, s || 0); const m = Math.floor(s / 60); const r = s - m * 60; return `${m}:${String(Math.floor(r)).padStart(2, '0')}.${Math.floor((r * 10) % 10)}`; };
const buzz = (ms) => { try { if (navigator.vibrate) navigator.vibrate(ms); } catch { /* not on iOS */ } };

export default function VideoTrimSheet({ file, he = false, tt = (s) => s, onCancel, onDone }) {
  const url = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => () => { try { URL.revokeObjectURL(url); } catch { /* */ } }, [url]);
  const vidRef = useRef(null), stripRef = useRef(null), headRef = useRef(null), scrubRef = useRef(null);
  const [dur, setDur] = useState(0);
  const [cut, setCut] = useState({ start: 0, end: 0 });
  const cutRef = useRef(cut); cutRef.current = cut;
  const [stripW, setStripW] = useState(0);
  const stripWRef = useRef(0); stripWRef.current = stripW;
  const [thumbs, setThumbs] = useState([]);
  const [playing, setPlaying] = useState(false);
  const [dragging, setDragging] = useState(null);      // 'start' | 'end' | 'scrub' | 'move' | null
  const [failed, setFailed] = useState(false);
  const whyRef = useRef('');
  const closing = useRef(false);

  // ---- its own URL: the page + /trim, Back = cancel ----
  const pushedRef = useRef(false);
  useEffect(() => {
    const here = window.location.pathname.replace(/\/+$/, '');
    if (!/\/trim$/.test(here)) { window.history.pushState({ urlOpened: here + '/trim' }, '', here + '/trim' + window.location.search); pushedRef.current = true; }
    const onPop = () => { if (!/\/trim\/?$/.test(window.location.pathname) && !closing.current) { closing.current = true; onCancel(); } };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  const close = useCallback((fn) => {
    if (closing.current) return; closing.current = true;
    const v = vidRef.current; if (v) { try { v.pause(); } catch { /* */ } }
    if (pushedRef.current && /\/trim\/?$/.test(window.location.pathname)) window.history.back();
    fn();
  }, []);

  // ---- the preview ----
  const seekRef = useRef({ busy: false, want: null, exact: true });
  const doSeek = useCallback(() => {
    const v = vidRef.current, s = seekRef.current;
    if (!v || s.want == null) { s.busy = false; return; }
    const t = s.want; s.want = null; s.busy = true;
    try { if (!s.exact && typeof v.fastSeek === 'function') v.fastSeek(t); else v.currentTime = t; } catch { s.busy = false; }
  }, []);
  const seek = useCallback((t, exact = true) => { const s = seekRef.current; s.want = t; s.exact = exact; if (!s.busy) doSeek(); }, [doSeek]);
  // the scrub frames (#1025): JPEGs from the worker, a few decoded at a time, the newest wish drawn (never a backlog)
  const proxyRef = useRef({ n: 0, blobs: [], cache: new Map(), want: -1, shown: -1, busy: false, hideOnSeek: false });
  const drawProxy = useCallback(async () => {
    const P = proxyRef.current, cv = scrubRef.current;
    if (P.busy || !cv) return;
    P.busy = true;
    while (P.want >= 0 && P.want !== P.shown) {
      const k = P.want;
      let bmp = P.cache.get(k);
      if (bmp) P.cache.delete(k);
      else { try { bmp = await createImageBitmap(P.blobs[k]); } catch { break; } }
      P.cache.set(k, bmp);
      if (P.cache.size > 24) { const [ok, ob] = P.cache.entries().next().value; P.cache.delete(ok); try { ob.close(); } catch { /* */ } }
      if (P.want < 0) break;   // the exact frame arrived while this one decoded
      if (cv.width !== bmp.width || cv.height !== bmp.height) { cv.width = bmp.width; cv.height = bmp.height; }
      cv.getContext('2d').drawImage(bmp, 0, 0);
      P.shown = k; cv.style.visibility = 'visible'; cv.dataset.f = k;   // data-f: which frame (the smoothness probe reads it)
    }
    P.busy = false;
  }, []);
  // the nearest frame to t, if the worker has made it (or one within two frames of it); false = seek the video instead
  const showProxy = useCallback((t, d) => {
    const P = proxyRef.current;
    if (!P.n || !(d > 0)) return false;
    const i = clamp(Math.floor((t / d) * P.n), 0, P.n - 1);
    let k = -1;
    for (let j = 0; j <= 2 && k < 0; j++) { if (P.blobs[i - j]) k = i - j; else if (P.blobs[i + j]) k = i + j; }
    if (k < 0) return false;
    P.want = k; P.hideOnSeek = false; drawProxy();
    return true;
  }, [drawProxy]);
  const hideProxy = useCallback(() => {
    const P = proxyRef.current, cv = scrubRef.current;
    P.want = -1; P.shown = -1; P.hideOnSeek = false;
    if (cv) cv.style.visibility = 'hidden';
  }, []);
  useEffect(() => {
    const v = vidRef.current; if (!v) return undefined;
    const onSeeked = () => {
      seekRef.current.busy = false;
      if (seekRef.current.want != null) { doSeek(); return; }
      if (proxyRef.current.hideOnSeek) {
        // Safari says 'seeked' before the frame is drawn: wait for the frame (or 150 ms)
        let gone = false; const go = () => { if (gone || !proxyRef.current.hideOnSeek) return; gone = true; hideProxy(); };
        if (typeof v.requestVideoFrameCallback === 'function') v.requestVideoFrameCallback(go);
        setTimeout(go, 150);
      }
    };
    const onMeta = () => {
      const d = v.duration;
      if (!Number.isFinite(d) || d <= 0) { whyRef.current = `duration ${d}`; setFailed(true); return; }
      setDur(d); setCut({ start: 0, end: d });
      v.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    };
    const onErr = () => { whyRef.current = `video error ${(v.error && v.error.code) || ''}`; setFailed(true); };
    v.addEventListener('seeked', onSeeked); v.addEventListener('loadedmetadata', onMeta); v.addEventListener('error', onErr);
    // #974: on a phone the clip's metadata can arrive BEFORE this listener is attached (the effect runs after paint) -
    // the event was missed and the sheet stayed invisible. Read it now if it is already there.
    if (v.readyState >= 1) onMeta();
    // and a sheet that cannot read its clip in 6 s gives the clip back uncut instead of hanging invisible
    const watchdog = setTimeout(() => { if (!(v.duration > 0)) { whyRef.current = `no metadata in 6 s (readyState ${v.readyState})`; setFailed(true); } }, 6000);
    return () => { clearTimeout(watchdog); v.removeEventListener('seeked', onSeeked); v.removeEventListener('loadedmetadata', onMeta); v.removeEventListener('error', onErr); };
  }, [doSeek, hideProxy]);
  // a clip that cannot be read here (a codec this browser lacks) uploads uncut - never blocks the athlete
  useEffect(() => {
    if (!failed) return;
    reportIssue(`TRIM · could not open the clip (${whyRef.current || 'unknown'}) · ${file.type || 'no type'} · ${Math.round(file.size / 1e5) / 10} MB`, 'trim');
    close(() => onDone({ start: 0, end: null, duration: null, trimmed: false, unreadable: true }));
  }, [failed]);   // eslint-disable-line react-hooks/exhaustive-deps

  // the loop and the playhead, by style at 60fps (no React state per frame)
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const v = vidRef.current, h = headRef.current, c = cutRef.current;
      if (v && dur > 0) {
        if (!v.paused && (v.currentTime >= c.end - 0.04 || v.currentTime < c.start - 0.25)) { v.currentTime = c.start; }
        const g = grab.current;
        const at = g && g.t != null ? g.t : v.currentTime;   // a drag: where the finger is, not where the video has got to
        if (h && stripW) h.style.transform = `translateX(${(at / dur) * stripW}px)`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [dur, stripW]);

  // ---- the strip's width ----
  useEffect(() => {
    const el = stripRef.current; if (!el) return undefined;
    const ro = new ResizeObserver(() => setStripW(el.clientWidth));
    ro.observe(el); setStripW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // ---- the filmstrip + the movement read, from a second, hidden video ----
  useEffect(() => {
    if (!(dur > 0) || !stripWRef.current) return undefined;
    const width = stripWRef.current;
    let dead = false;
    const v = document.createElement('video');
    v.muted = true; v.playsInline = true; v.preload = 'auto';   // its src only if the worker fails (#985: a second decode of a 4K clip fought the drag)
    v.setAttribute('playsinline', ''); v.setAttribute('muted', '');
    // Safari says 'seeked' before the frame can be drawn (WebKit 153588 / 194986): wait for the frame itself (or 150 ms)
    const frame = () => new Promise((res) => { if (typeof v.requestVideoFrameCallback === 'function') { v.requestVideoFrameCallback(() => res()); setTimeout(res, 150); } else res(); });
    const seekTo = (t) => new Promise((res) => { let done = false; const on = () => { if (done) return; done = true; v.removeEventListener('seeked', on); frame().then(res); }; v.addEventListener('seeked', on); v.currentTime = t; setTimeout(on, 1500); });
    // THE FILMSTRIP FROM KEYFRAMES FIRST (24.10 #985, Ohad: "make sure the trimming works perfectly and is the smoothest
    // you can make it"). Measured on 6 real clips: seeking the hidden <video> through a 4K clip took 6.7 s for the strip
    // (HEVC 2.3 s) and fought the drag for the decoder. WebCodecs through Mediabunny (already loaded for the cut) decodes
    // only the keyframe nearest each thumbnail, straight to thumbnail size, rotation applied - one small decode per
    // thumbnail at any resolution. Sparse keyframes -> exact times in one forward pass. Any failure -> the <video> way.
    // ...and in a Web Worker (src/trimThumbs.worker.js): on the main thread the decode stalled a 4K sheet 11 times for
    // ~115 ms, which a finger on a handle would feel. Each thumbnail arrives as a small JPEG the moment it exists.
    const urls = [];
    let worker = null;
    const viaKeyframes = () => new Promise((resolve, reject) => {
      if (typeof Worker !== 'function') { reject(new Error('no Worker')); return; }
      try { worker = new Worker(new URL('./trimThumbs.worker.js', import.meta.url), { type: 'module' }); } catch (e) { reject(e); return; }
      let list = [];
      const stall = setTimeout(() => reject(new Error('worker silent')), 8000);   // nothing in 8 s: the <video> way
      worker.onmessage = (ev) => {
        const m = ev.data || {};
        if (dead) { resolve(); return; }
        clearTimeout(stall);
        if (m.n) { list = new Array(m.n).fill(null); setThumbs([...list]); }
        else if (m.blob && m.pi == null) { const u = URL.createObjectURL(m.blob); urls.push(u); list[m.i] = u; setThumbs([...list]); }
        else if (m.done) resolve();
        else if (m.error) reject(new Error(m.error));
        else if (m.pn) { const P = proxyRef.current; P.n = m.pn; P.blobs = new Array(m.pn).fill(null); }
        if (m.pi != null && m.blob) { const P = proxyRef.current, cv = scrubRef.current; P.blobs[m.pi] = m.blob; if (cv) { cv.dataset.n = P.n; cv.dataset.have = (Number(cv.dataset.have) || 0) + 1; } }
      };
      worker.onerror = (ev) => { clearTimeout(stall); reject(new Error((ev && ev.message) || 'worker error')); };
      worker.postMessage({ file, dur, width, stripH: STRIP_H, dpr: Math.min(2, window.devicePixelRatio || 1), long: SCRUB_LONG });
    });
    const run = async () => {
      try { await viaKeyframes(); return; } catch { if (dead) return; try { worker && worker.terminate(); } catch { /* */ } worker = null; /* the <video> way below */ }
      v.src = url;
      await new Promise((res) => { if (v.readyState >= 2) res(); else { v.addEventListener('loadeddata', res, { once: true }); setTimeout(res, 3000); } });
      try { await v.play(); v.pause(); } catch { /* iOS draws black frames until a video has played once */ }
      const aspect = (v.videoWidth || 9) / (v.videoHeight || 16);
      const tw = Math.max(24, Math.round(STRIP_H * aspect));
      const n = Math.max(4, Math.ceil(width / tw));
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const cv = document.createElement('canvas'); cv.width = Math.round(tw * dpr); cv.height = Math.round(STRIP_H * dpr);
      const cx = cv.getContext('2d');
      const list = new Array(n).fill(null);
      for (let i = 0; i < n && !dead; i++) {
        await seekTo(((i + 0.5) / n) * dur);
        try { cx.drawImage(v, 0, 0, cv.width, cv.height); list[i] = cv.toDataURL('image/jpeg', 0.6); } catch { /* */ }
        setThumbs([...list]);
      }
    };
    run();
    return () => {
      dead = true;
      const P = proxyRef.current; P.n = 0; P.blobs = []; P.cache.forEach((b) => { try { b.close(); } catch { /* */ } }); P.cache.clear();
      try { worker && worker.terminate(); } catch { /* */ } urls.forEach((u) => { try { URL.revokeObjectURL(u); } catch { /* */ } }); try { v.removeAttribute('src'); v.load(); } catch { /* */ } };
  }, [dur, stripW > 0, url]);   // eslint-disable-line react-hooks/exhaustive-deps

  // ---- the strip's gestures ----
  const xOf = (t) => (dur > 0 ? (t / dur) * stripW : 0);
  const tOf = (x) => clamp((x / Math.max(1, stripW)) * dur, 0, dur);
  const grab = useRef(null);
  const onDown = (e) => {
    if (!(dur > 0)) return;
    const r = stripRef.current.getBoundingClientRect();
    const x = e.clientX - r.left;
    const c = cutRef.current;
    const xs = xOf(c.start), xe = xOf(c.end);
    const INNER = 6;
    const onS = x >= xs - HANDLE - HIT && x <= xs + INNER, onE = x >= xe - INNER && x <= xe + HANDLE + HIT;
    let what, off = 0;
    if (onS || onE) { what = onS && onE ? (Math.abs(x - (xs - HANDLE / 2)) <= Math.abs(x - (xe + HANDLE / 2)) ? 'start' : 'end') : onS ? 'start' : 'end'; off = what === 'start' ? xs - x : xe - x; }   // held where it was grabbed
    else if (x > xs && x < xe) what = 'scrub';
    else what = x < xs ? 'start' : 'end';               // outside the cut: that end jumps to the finger
    grab.current = { what, off, id: e.pointerId };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* */ }
    const v = vidRef.current; if (v) v.pause();
    setPlaying(false); setDragging(what);
    if (what === 'start' || what === 'end') buzz(8);
    onMove(e);
  };
  const onMove = (e) => {
    const g = grab.current; if (!g || e.pointerId !== g.id) return;
    const r = stripRef.current.getBoundingClientRect();
    const x = e.clientX - r.left;
    const c = cutRef.current;
    if (g.what === 'start') {
      const want = tOf(x + g.off);
      const s = clamp(want, 0, c.end - MIN_LEN);
      if (want > c.end - MIN_LEN && c.start < c.end - MIN_LEN - 0.01) buzz(12);
      setCut({ start: s, end: c.end }); g.t = s; if (!showProxy(s, dur)) seek(s, false);
    } else if (g.what === 'end') {
      const want = tOf(x + g.off);
      const en = clamp(want, c.start + MIN_LEN, dur);
      if (want < c.start + MIN_LEN && c.end > c.start + MIN_LEN + 0.01) buzz(12);
      setCut({ start: c.start, end: en }); g.t = en; if (!showProxy(en, dur)) seek(en, false);
    } else {
      // GOOGLE PHOTOS' SCRUB: the playhead follows the finger inside the cut, the picture follows the playhead
      const t = clamp(tOf(x), c.start, c.end);
      g.t = t;
      if (!showProxy(t, dur)) seek(t, false);
      const h = headRef.current; if (h) h.style.transform = `translateX(${xOf(t)}px)`;
    }
  };
  const onUp = (e) => {
    const g = grab.current; if (!g || e.pointerId !== g.id) return;
    grab.current = null; setDragging(null);
    const v = vidRef.current; if (!v) return;
    const c = cutRef.current;
    proxyRef.current.hideOnSeek = proxyRef.current.shown >= 0;   // the canvas steps aside when the exact frame is painted
    if (g.what === 'scrub') { seek(clamp(g.t != null ? g.t : v.currentTime, c.start, c.end), true); return; }   // stays on the frame he chose
    seek(c.start, true);
    v.play().then(() => setPlaying(true)).catch(() => {});
  };

  const togglePlay = () => {
    const v = vidRef.current; if (!v) return;
    if (v.paused) { const c = cutRef.current; if (v.currentTime < c.start || v.currentTime >= c.end - 0.05) v.currentTime = c.start; v.play().then(() => setPlaying(true)).catch(() => {}); }
    else { v.pause(); setPlaying(false); }
  };
  const trimmedNow = dur > 0 && (cut.start > 0.05 || cut.end < dur - 0.05);
  const reset = () => {
    if (!trimmedNow) return;
    const v = vidRef.current; hideProxy();
    setCut({ start: 0, end: dur }); seek(0, true);
    if (v) v.play().then(() => setPlaying(true)).catch(() => {});
  };
  const done = () => {
    const c = cutRef.current;
    const trimmed = dur > 0 && (c.start > 0.05 || c.end < dur - 0.05);
    close(() => onDone({ start: trimmed ? c.start : 0, end: trimmed ? c.end : dur, duration: dur, trimmed }));
  };
  // keyboard: the focused handle moves by a tenth (shift: a second)
  const onKey = (which) => (e) => {
    const step = e.shiftKey ? 1 : 0.1;
    const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!dir) return; e.preventDefault();
    const c = cutRef.current;
    if (which === 'start') { const s = clamp(c.start + dir * step, 0, c.end - MIN_LEN); setCut({ ...c, start: s }); seek(s); }
    else { const en = clamp(c.end + dir * step, c.start + MIN_LEN, dur); setCut({ ...c, end: en }); seek(en); }
   
  };

  const len = Math.max(0, cut.end - cut.start);
  const xs = xOf(cut.start), xe = xOf(cut.end);
  const ink = '#FFFFFF', dim = 'rgba(255,255,255,0.62)';
  const TOP = 36;
  const round = { width: TOP, height: TOP, padding: 0, border: 'none', borderRadius: '50%', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' };
  const btn = { height: 36, minWidth: 0, padding: '0 12px', border: 'none', borderRadius: 0, fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: he ? 0 : '0.1em', textTransform: 'uppercase', whiteSpace: 'nowrap', cursor: 'pointer' };

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={tt('Trim video')} data-trim-sheet dir={he ? 'rtl' : 'ltr'}
      style={{ position: 'fixed', inset: 0, zIndex: 1200, background: '#000', color: ink, display: 'flex', flexDirection: 'column', fontFamily: FB,
        paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)', touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none',
        opacity: dur > 0 ? 1 : 0, transition: 'opacity 160ms ease' /* shown once the clip reads: a file this browser cannot read never flashes the sheet */ }}>
      {/* the top (#1025): close, the cut (its length + where it starts and ends), reset - one row, one 36px height */}
      <div style={{ display: 'grid', gridTemplateColumns: `${TOP}px minmax(0, 1fr) ${TOP}px`, alignItems: 'center', height: 60, padding: '0 16px', gap: 12 }}>
        <button type="button" data-trim-cancel aria-label={tt('Cancel')} onClick={() => close(onCancel)} style={round}>
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" stroke="#fff" strokeWidth="2" strokeLinecap="round" /></svg>
        </button>
        <div style={{ justifySelf: 'center', display: 'flex', alignItems: 'center', height: TOP, maxWidth: '100%', padding: '0 14px', gap: 10, borderRadius: 18, background: 'rgba(255,255,255,0.1)', boxSizing: 'border-box', fontFamily: FN, fontWeight: 700, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', overflow: 'hidden' }} dir="ltr">
          <span data-trim-len style={{ fontSize: 15, letterSpacing: '0.02em' }}>{mmss(len)}</span>
          <span aria-hidden="true" style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.28)', flex: 'none' }} />
          <span data-trim-range style={{ fontSize: 11, letterSpacing: '0.04em', color: dim }}>{mmssT(cut.start)} – {mmssT(cut.end)}</span>
        </div>
        <button type="button" data-trim-reset aria-label={tt('Reset the cut')} title={tt('Reset the cut')} onClick={reset} disabled={!trimmedNow}
          style={{ ...round, opacity: trimmedNow ? 1 : 0.3, cursor: trimmedNow ? 'pointer' : 'default', transition: 'opacity 160ms ease' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ transform: he ? 'scaleX(-1)' : 'none' }}><path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4.5h4.5" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      </div>

      {/* the clip: a tap plays / pauses */}
      <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={togglePlay}>
        <video ref={vidRef} src={url} muted playsInline preload="auto" data-trim-video
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', display: 'block', background: '#000' }} />
        <canvas ref={scrubRef} data-trim-scrub aria-hidden="true"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', visibility: 'hidden', pointerEvents: 'none' }} />
        {!playing && !dragging && dur > 0 && (
          <button type="button" aria-label={tt('Play')} onClick={(e) => { e.stopPropagation(); togglePlay(); }}
            style={{ position: 'absolute', width: 64, height: 64, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" fill="#fff" /></svg>
          </button>
        )}
      </div>

      {/* the filmstrip: thumbnails, the cut's frame, two handles, the playhead */}
      <div style={{ padding: '14px 16px 10px', maxWidth: 720, width: '100%', boxSizing: 'border-box', margin: '0 auto' }} dir="ltr">
        <div style={{ padding: `0 ${HANDLE}px` }}>
          <div ref={stripRef} data-trim-strip onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
            style={{ position: 'relative', height: STRIP_H, background: '#1a1a1a', cursor: dragging ? 'grabbing' : 'pointer', touchAction: 'none' }}>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', overflow: 'hidden', pointerEvents: 'none' }}>
              {thumbs.map((src, i) => <div key={i} style={{ flex: '1 1 0', minWidth: 0, height: '100%', backgroundColor: '#222', backgroundImage: src ? `url(${src})` : 'none', backgroundSize: 'cover', backgroundPosition: 'center' }} />)}
            </div>
            {/* the cut-off parts, dimmed */}
            <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: xs, background: 'rgba(0,0,0,0.62)', pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', top: 0, bottom: 0, left: xe, right: 0, background: 'rgba(0,0,0,0.62)', pointerEvents: 'none' }} />
            {/* the frame: cyan top and bottom between the handles */}
            <div style={{ position: 'absolute', top: -2, bottom: -2, left: xs, width: Math.max(0, xe - xs), borderTop: `3px solid ${C.ac}`, borderBottom: `3px solid ${C.ac}`, boxSizing: 'border-box', pointerEvents: 'none' }} />
            {/* the handles: outside the cut's edges, a grip in each */}
            {['start', 'end'].map((w) => (
              <div key={w} role="slider" tabIndex={0} data-trim-handle={w} aria-label={tt(w === 'start' ? 'Start of the clip' : 'End of the clip')}
                aria-valuemin={0} aria-valuemax={Math.round(dur * 10) / 10} aria-valuenow={Math.round((w === 'start' ? cut.start : cut.end) * 10) / 10} aria-valuetext={mmssT(w === 'start' ? cut.start : cut.end)}
                onKeyDown={onKey(w)}
                style={{ position: 'absolute', top: -2, bottom: -2, left: w === 'start' ? xs - HANDLE : xe, width: HANDLE, background: C.ac, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2,
                  borderRadius: w === 'start' ? '6px 0 0 6px' : '0 6px 6px 0', outline: 'none', boxShadow: dragging === w ? `0 0 0 3px rgba(57,189,255,0.35)` : 'none', transition: 'box-shadow 120ms ease' }}>
                <span style={{ width: 2, height: 18, borderRadius: 1, background: 'rgba(0,0,0,0.55)' }} />
                {/* the handle's time, above it while it moves (the readout on top says it too, but the eye is here) */}
                {dragging === w && (
                  <span style={{ position: 'absolute', bottom: '100%', marginBottom: 8, left: '50%', transform: 'translateX(-50%)', background: '#fff', color: '#000', fontFamily: FN, fontSize: 11, fontWeight: 700, padding: '4px 7px', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{mmssT(w === 'start' ? cut.start : cut.end)}</span>
                )}
              </div>
            ))}
            {/* the playhead: a white line, moved by style */}
            <div ref={headRef} data-trim-playhead style={{ position: 'absolute', top: -6, bottom: -6, left: -1.5, width: 3, borderRadius: 2, background: '#fff', boxShadow: '0 0 0 1px rgba(0,0,0,0.5)', pointerEvents: 'none', opacity: dur > 0 ? 1 : 0 }} />
          </div>
        </div>
        <div style={{ textAlign: 'center', fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: he ? 0 : '0.08em', textTransform: 'uppercase', color: dim, marginTop: 12, minHeight: 14 }} dir={he ? 'rtl' : 'ltr'}>
          {tt('Drag the edges to cut')}
        </div>
      </div>

      {/* the action */}
      <div style={{ padding: '6px 16px 16px', maxWidth: 720, width: '100%', boxSizing: 'border-box', margin: '0 auto', display: 'grid', gap: 10 }}>
        <button type="button" data-trim-done onClick={done} disabled={!(dur > 0)}
          style={{ ...btn, height: 44, fontSize: 12, background: C.ac, color: C.acOnSurface || '#000', opacity: dur > 0 ? 1 : 0.5 }}>{tt('Upload')}</button>
      </div>
    </div>,
    document.body,
  );
}
