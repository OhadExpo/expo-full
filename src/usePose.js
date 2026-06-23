// usePose.js — shared MediaPipe Pose bootstrap for every camera feature
// (MovementLab capture, AR overlay, jump test). One loader, one camera helper,
// so the model URL / WASM CDN / GPU→CPU fallback live in exactly one place.
// Mirrors the bootstrap proven in LiveRepCounter.jsx.

const WASM_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/wasm';
const MODEL_LITE = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task';
const MODEL_FULL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task';

let _filesetPromise = null;

// Create a PoseLandmarker. runningMode 'VIDEO' (live) or 'IMAGE'. quality
// 'lite' (fast, live overlay) or 'full' (more accurate, post-hoc analysis).
export async function createPoseLandmarker({ runningMode = 'VIDEO', quality = 'lite', numPoses = 1 } = {}) {
  const { PoseLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision');
  if (!_filesetPromise) _filesetPromise = FilesetResolver.forVisionTasks(WASM_CDN);
  const fileset = await _filesetPromise;
  const opts = (delegate) => ({
    baseOptions: { modelAssetPath: quality === 'full' ? MODEL_FULL : MODEL_LITE, delegate },
    runningMode,
    // Offline upload analysis can ask for several poses so a CROWD around the
    // athlete (gym, spectators) doesn't make the detector lock onto a bystander —
    // the caller then picks the central/tallest figure (the subject) per frame.
    numPoses,
  });
  try {
    return await PoseLandmarker.createFromOptions(fileset, opts('GPU'));
  } catch {
    return await PoseLandmarker.createFromOptions(fileset, opts('CPU'));
  }
}

// getUserMedia camera. facingMode 'user' (selfie, live overlay) or
// 'environment' (rear, filming someone else on the floor).
export async function getCamera(facingMode = 'user') {
  return navigator.mediaDevices.getUserMedia({
    video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false,
  });
}

export function stopStream(stream) {
  try { stream?.getTracks().forEach(t => t.stop()); } catch {}
}
