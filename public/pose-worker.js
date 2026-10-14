/* THE POSE MODEL OFF THE MAIN THREAD (14.10 #775, Ohad: "both the numbers and the lines are very glitchy and laggy. I
 * wanted a 60fps feel"). On a phone a pose read takes 40-100 ms; on the main thread it froze the video AND the overlay's
 * draw loop for that long, every frame. Here it runs beside the page: the page sends a frame (an ImageBitmap), keeps
 * playing and drawing at the screen's rate, and gets the reading back when it is ready.
 *
 * A CLASSIC worker on purpose: MediaPipe's loader uses importScripts, which a module worker does not have. The CommonJS
 * bundle is loaded behind a tiny module shim. Same version + CDN path as the page's own copy (CSP script-src).
 */
/* eslint-disable */
var module = { exports: {} };
var exports = module.exports;
var TV = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34';
importScripts('/vendor/mediapipe-vision-0.10.34.js');   // a same-origin copy: the CDN serves .cjs as application/node, which importScripts refuses
var api = module.exports;
var lm = null;
self.onmessage = async function (e) {
  var m = e.data || {};
  if (m.type === 'init') {
    try {
      var fs = await api.FilesetResolver.forVisionTasks(TV + '/wasm');
      var opts = function (d) { return { baseOptions: { modelAssetPath: m.model, delegate: d }, runningMode: 'VIDEO', numPoses: m.numPoses || 1 }; };
      var delegate = 'GPU';
      try { lm = await api.PoseLandmarker.createFromOptions(fs, opts('GPU')); } catch (err) { delegate = 'CPU'; lm = await api.PoseLandmarker.createFromOptions(fs, opts('CPU')); }
      self.postMessage({ type: 'ready', delegate: delegate });
    } catch (err) {
      self.postMessage({ type: 'error', error: String((err && err.message) || err) });
    }
    return;
  }
  if (m.type === 'detect') {
    var t0 = performance.now(), r = null, error = null;
    try { if (lm) r = lm.detectForVideo(m.bitmap, m.ts); } catch (err) { error = String((err && err.message) || err); }
    try { m.bitmap.close(); } catch (err) { /* noop */ }
    self.postMessage({ type: 'result', id: m.id, ms: performance.now() - t0, error: error, result: r ? { landmarks: r.landmarks || [], worldLandmarks: r.worldLandmarks || [] } : null });
    return;
  }
  if (m.type === 'close') { try { if (lm) lm.close(); } catch (err) { /* noop */ } lm = null; }
};
