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
// The sheet has its own URL (the page's path + /trim): Back cancels it. A reload cannot bring the chosen file back, so a reload of
// that URL lands on the page (ClientPortal drops the tail).
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { C, FN, FB } from './theme';

const MIN_LEN = 1;          // seconds: the shortest cut
const HANDLE = 16;          // px: the handle's drawn width
const HIT = 24;             // px: extra grab margin around a handle (a thumb, not a cursor)
const STRIP_H = 56;         // px: the filmstrip's height

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const mmss = (s) => { s = Math.round(Math.max(0, s || 0)); const m = Math.floor(s / 60); return `${m}:${String(s - m * 60).padStart(2, '0')}`; };   // the cut's length: rounded (6.9 s reads 0:07)
const mmssT = (s) => { s = Math.max(0, s || 0); const m = Math.floor(s / 60); const r = s - m * 60; return `${m}:${String(Math.floor(r)).padStart(2, '0')}.${Math.floor((r * 10) % 10)}`; };
const buzz = (ms) => { try { if (navigator.vibrate) navigator.vibrate(ms); } catch { /* not on iOS */ } };

export default function VideoTrimSheet({ file, he = false, tt = (s) => s, onCancel, onDone }) {
  const url = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => () => { try { URL.revokeObjectURL(url); } catch { /* */ } }, [url]);
  const vidRef = useRef(null), stripRef = useRef(null), headRef = useRef(null);
  const [dur, setDur] = useState(0);
  const [cut, setCut] = useState({ start: 0, end: 0 });
  const cutRef = useRef(cut); cutRef.current = cut;
  const [stripW, setStripW] = useState(0);
  const stripWRef = useRef(0); stripWRef.current = stripW;
  const [thumbs, setThumbs] = useState([]);
  const [playing, setPlaying] = useState(false);
  const [dragging, setDragging] = useState(null);      // 'start' | 'end' | 'scrub' | 'move' | null
  const [failed, setFailed] = useState(false);
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
  useEffect(() => {
    const v = vidRef.current; if (!v) return undefined;
    const onSeeked = () => { seekRef.current.busy = false; if (seekRef.current.want != null) doSeek(); };
    const onMeta = () => {
      const d = v.duration;
      if (!Number.isFinite(d) || d <= 0) { setFailed(true); return; }
      setDur(d); setCut({ start: 0, end: d });
      v.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    };
    const onErr = () => setFailed(true);
    v.addEventListener('seeked', onSeeked); v.addEventListener('loadedmetadata', onMeta); v.addEventListener('error', onErr);
    return () => { v.removeEventListener('seeked', onSeeked); v.removeEventListener('loadedmetadata', onMeta); v.removeEventListener('error', onErr); };
  }, [doSeek]);
  // a clip that cannot be read here (a codec this browser lacks) uploads uncut - never blocks the athlete
  useEffect(() => { if (failed) close(() => onDone({ start: 0, end: null, duration: null, trimmed: false, unreadable: true })); }, [failed]);   // eslint-disable-line react-hooks/exhaustive-deps

  // the loop and the playhead, by style at 60fps (no React state per frame)
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const v = vidRef.current, h = headRef.current, c = cutRef.current;
      if (v && dur > 0) {
        if (!v.paused && (v.currentTime >= c.end - 0.04 || v.currentTime < c.start - 0.25)) { v.currentTime = c.start; }
        if (h && stripW) h.style.transform = `translateX(${(v.currentTime / dur) * stripW}px)`;
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
    v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = url;
    v.setAttribute('playsinline', ''); v.setAttribute('muted', '');
    // Safari says 'seeked' before the frame can be drawn (WebKit 153588 / 194986): wait for the frame itself (or 150 ms)
    const frame = () => new Promise((res) => { if (typeof v.requestVideoFrameCallback === 'function') { v.requestVideoFrameCallback(() => res()); setTimeout(res, 150); } else res(); });
    const seekTo = (t) => new Promise((res) => { let done = false; const on = () => { if (done) return; done = true; v.removeEventListener('seeked', on); frame().then(res); }; v.addEventListener('seeked', on); v.currentTime = t; setTimeout(on, 1500); });
    const run = async () => {
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
    return () => { dead = true; try { v.removeAttribute('src'); v.load(); } catch { /* */ } };
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
      setCut({ start: s, end: c.end }); seek(s, false);
    } else if (g.what === 'end') {
      const want = tOf(x + g.off);
      const en = clamp(want, c.start + MIN_LEN, dur);
      if (want < c.start + MIN_LEN && c.end > c.start + MIN_LEN + 0.01) buzz(12);
      setCut({ start: c.start, end: en }); seek(en, false);
    } else {
      // GOOGLE PHOTOS' SCRUB: the playhead follows the finger inside the cut, the picture follows the playhead
      const t = clamp(tOf(x), c.start, c.end);
      seek(t, false);
      const h = headRef.current; if (h) h.style.transform = `translateX(${xOf(t)}px)`;
    }
  };
  const onUp = (e) => {
    const g = grab.current; if (!g || e.pointerId !== g.id) return;
    grab.current = null; setDragging(null);
    const v = vidRef.current; if (!v) return;
    const c = cutRef.current;
    if (g.what === 'scrub') { seek(clamp(v.currentTime, c.start, c.end), true); return; }   // stays on the frame he chose
    seek(c.start, true);
    v.play().then(() => setPlaying(true)).catch(() => {});
  };

  const togglePlay = () => {
    const v = vidRef.current; if (!v) return;
    if (v.paused) { const c = cutRef.current; if (v.currentTime < c.start || v.currentTime >= c.end - 0.05) v.currentTime = c.start; v.play().then(() => setPlaying(true)).catch(() => {}); }
    else { v.pause(); setPlaying(false); }
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
  const btn = { height: 36, minWidth: 0, padding: '0 12px', border: 'none', borderRadius: 0, fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: he ? 0 : '0.1em', textTransform: 'uppercase', whiteSpace: 'nowrap', cursor: 'pointer' };

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={tt('Trim video')} data-trim-sheet dir={he ? 'rtl' : 'ltr'}
      style={{ position: 'fixed', inset: 0, zIndex: 1200, background: '#000', color: ink, display: 'flex', flexDirection: 'column', fontFamily: FB,
        paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)', touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none',
        opacity: dur > 0 ? 1 : 0, transition: 'opacity 160ms ease' /* shown once the clip reads: a file this browser cannot read never flashes the sheet */ }}>
      {/* the top: cancel, the cut's length, its range */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', minHeight: 56, padding: '0 16px', gap: 12 }}>
        <button type="button" data-trim-cancel onClick={() => close(onCancel)} style={{ ...btn, justifySelf: 'start', background: 'transparent', color: ink, border: '1px solid rgba(255,255,255,0.35)' }}>{tt('Cancel')}</button>
        <div style={{ textAlign: 'center', lineHeight: 1.15 }} dir="ltr">
          <div data-trim-len style={{ fontFamily: FN, fontSize: 18, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{mmss(len)}</div>
          <div data-trim-range style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', color: dim, fontVariantNumeric: 'tabular-nums' }}>{mmssT(cut.start)} – {mmssT(cut.end)}</div>
        </div>
        <span />
      </div>

      {/* the clip: a tap plays / pauses */}
      <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={togglePlay}>
        <video ref={vidRef} src={url} muted playsInline preload="auto" data-trim-video
          style={{ maxWidth: '100%', maxHeight: '100%', width: 'auto', height: 'auto', display: 'block', background: '#000' }} />
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
