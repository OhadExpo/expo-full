// Worker-side MediaPipe: loads the Pose Landmarker once, runs detectForVideo
// on ImageBitmap frames sent from main thread, returns the world-landmark
// array. Main thread handles angle computation, buffer accumulation, and
// peak detection — cheap enough to stay there. The heavy work (MP inference,
// ~80ms/frame on CPU) happens off main thread so UI and video decode run
// smoothly during auto-count.

let lm = null;
let ready = false;

async function initLandmarker() {
  const { PoseLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision');
  const fileset = await FilesetResolver.forVisionTasks(
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/wasm'
  );
  const modelUrl = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task';
  const opts = (delegate) => ({
    baseOptions: { modelAssetPath: modelUrl, delegate },
    runningMode: 'VIDEO',
    numPoses: 1,
  });
  try { lm = await PoseLandmarker.createFromOptions(fileset, opts('GPU')); }
  catch { lm = await PoseLandmarker.createFromOptions(fileset, opts('CPU')); }
  ready = true;
}

self.addEventListener('message', async (e) => {
  const msg = e.data;
  try {
    if (msg.type === 'init') {
      await initLandmarker();
      self.postMessage({ type: 'ready' });
    } else if (msg.type === 'frame') {
      if (!ready || !lm) { self.postMessage({ type: 'result', id: msg.id, error: 'not ready' }); return; }
      const result = lm.detectForVideo(msg.bitmap, msg.ts);
      // worldLandmarks are 3D metric coords — what we want for angle math.
      // landmarks (2D) is fallback if worldLandmarks not returned.
      const world = result.worldLandmarks?.[0] || null;
      const landmarks = !world ? (result.landmarks?.[0] || null) : null;
      // Clone to plain arrays so they transfer cleanly. world landmarks have
      // {x,y,z,visibility} — we only need x,y,z for angleAt.
      const toArr = (pts) => pts ? pts.map(p => ({ x: p.x, y: p.y, z: p.z })) : null;
      // Clean up the bitmap we just consumed.
      try { msg.bitmap.close(); } catch {}
      self.postMessage({ type: 'result', id: msg.id, world: toArr(world), landmarks: toArr(landmarks) });
    } else if (msg.type === 'close') {
      try { lm?.close(); } catch {}
      lm = null; ready = false;
      self.postMessage({ type: 'closed' });
    }
  } catch (err) {
    self.postMessage({ type: 'result', id: msg?.id, error: err?.message || String(err) });
  }
});
