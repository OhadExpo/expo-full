// The pose model in a worker (14.10 #775): see public/pose-worker.js. One frame in flight at a time; the caller keeps
// its own loop and simply skips a frame while the worker is busy, so the page never waits on the model.
export async function createWorkerLandmarker({ model, numPoses = 1, timeoutMs = 25000 } = {}) {
  if (typeof Worker === 'undefined' || typeof createImageBitmap === 'undefined' || typeof OffscreenCanvas === 'undefined') return null;
  let worker;
  try { worker = new Worker('/pose-worker.js'); } catch { return null; }
  const ready = await new Promise((resolve) => {
    const to = setTimeout(() => resolve(null), timeoutMs);
    worker.onmessage = (e) => { if (e.data && e.data.type === 'ready') { clearTimeout(to); resolve(e.data); } else if (e.data && e.data.type === 'error') { clearTimeout(to); resolve(null); } };
    worker.onerror = () => { clearTimeout(to); resolve(null); };
    worker.postMessage({ type: 'init', model, numPoses });
  });
  if (!ready) { try { worker.terminate(); } catch { /* noop */ } return null; }
  let id = 0, pending = null;
  worker.onmessage = (e) => { const d = e.data || {}; if (d.type === 'result' && pending && pending.id === d.id) { const p = pending; pending = null; p.resolve(d); } };
  return {
    isWorker: true,
    delegate: ready.delegate,
    get busy() { return !!pending; },
    // read one frame of a <video>: resolves { result, ms } (result = { landmarks, worldLandmarks } or null)
    async detect(video, ts) {
      if (pending) return null;
      const my = ++id;
      const p = new Promise((resolve) => { pending = { id: my, resolve }; });
      let bmp;
      // a small copy: the model reads 256 px anyway, and a full 1080x1920 frame cost more to copy than to read
      const vw = video.videoWidth || 0, vh = video.videoHeight || 0, W = 384;
      try { bmp = vw > W ? await createImageBitmap(video, { resizeWidth: W, resizeHeight: Math.max(1, Math.round(vh * W / vw)), resizeQuality: 'medium' }) : await createImageBitmap(video); } catch { pending = null; return null; }
      worker.postMessage({ type: 'detect', id: my, ts, bitmap: bmp }, [bmp]);
      return p;
    },
    close() { try { worker.postMessage({ type: 'close' }); worker.terminate(); } catch { /* noop */ } },
  };
}
