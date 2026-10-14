// DEV HARNESS (#690): a saved capture (public/_anat_capture.json, gitignored - athlete data never ships) played straight
// into the real Replay3D, so a rig change is LOOKED at in seconds instead of a 5-minute MediaPipe read.
// ?clip=_anat_capture.json  ?ex=<logged exercise title>  ?w=390  ?lang=he  ?live=1 (the capture fed in at real speed, as a camera would, to LiveAnatomy)
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import Replay3D from './Replay3D';
import LiveAnatomy from './LiveAnatomy';
import ARFormOverlay from './ARFormOverlay';
import LiveRepCounter from './LiveRepCounter';
import { LangCtx } from './i18n';

const q = new URLSearchParams(location.search);
const toObj = (a) => (a ? a.map((p) => (p ? { x: p[0], y: p[1], z: p[2], visibility: p[3] } : null)) : null);
// ?ar=1: the real Live Coach on this browser's camera (a fake-camera Chrome plays a clip as the camera)
const ArLab = () => <LangCtx.Provider value={q.get('lang') || 'en'}><ARFormOverlay exerciseTitle={q.get('ex') || 'Squat'} onClose={() => {}} /></LangCtx.Provider>;
const RcLab = () => <LangCtx.Provider value={q.get('lang') || 'en'}><LiveRepCounter exerciseTitle={q.get('ex') || 'Squat'} onClose={() => {}} /></LangCtx.Provider>;
function Lab() {
  const [frames, setFrames] = useState(null);
  useEffect(() => {
    fetch('/' + (q.get('clip') || '_anat_capture.json')).then((r) => r.json()).then((o) => {
      const out = []; let next = -Infinity; const step = +(q.get('step') || 100);
      for (const f of o.frames) { if (!f.w || f.t < next) continue; out.push({ t: f.t, landmarks: toObj(f.l), worldLandmarks: toObj(f.w) }); next = f.t + step; }
      out.dims = o.dims; setFrames(out); window.__labFrames = out.length; window.__labRaw = out;
    });
  }, []);
  if (!frames) return <div style={{ color: '#fff', padding: 20 }}>…</div>;
  if (q.get('live')) return <LiveFeed frames={frames} />;
  return (
    <LangCtx.Provider value={q.get('lang') || 'en'}>
      <div dir={q.get('lang') === 'he' ? 'rtl' : 'ltr'} style={{ width: +(q.get('w') || 720), padding: 12 }} data-theme="dark"><Replay3D frames={frames} exerciseTitle={q.get('ex') || ''} /></div>
    </LangCtx.Provider>
  );
}
// the recorded readings replayed on the live clock: each one 'arrives' when its time comes
function LiveFeed({ frames }) {
  const [buf] = useState(() => []);
  useEffect(() => {
    const start = performance.now(), t0 = frames[0].t; let k = 0;
    const id = setInterval(() => { const el = performance.now() - start; while (k < frames.length && frames[k].t - t0 <= el) { const f = frames[k++]; buf.push({ ...f, t: start + (f.t - t0) }); } }, 33);
    return () => clearInterval(id);
  }, [frames, buf]);
  return (
    <LangCtx.Provider value={q.get('lang') || 'en'}>
      <div style={{ width: +(q.get('w') || 720), padding: 12 }} data-theme="dark"><LiveAnatomy getFrames={() => buf} dims={frames.dims} /></div>
    </LangCtx.Provider>
  );
}
createRoot(document.getElementById('root')).render(q.get('ar') ? <ArLab /> : q.get('rc') ? <RcLab /> : <Lab />);
