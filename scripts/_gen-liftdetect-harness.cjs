// Generates public/_liftdetect-validate.html — a real-footage validation rig
// for #19's MOTION signal.
//
// Why generated rather than hand-written: it inlines the ACTUAL source of
// src/repCounter.js and src/liftDetect.js (imports/exports stripped), so the
// thing we validate is byte-for-byte the logic that ships. A hand-copied
// algorithm would drift and prove nothing.
//
// Run:  node scripts/_gen-liftdetect-harness.cjs
// Open: http://localhost:5173/_liftdetect-validate.html
// DELETE the html afterwards — it is a dev rig, not a shipped page.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const strip = (f) => fs.readFileSync(path.join(root, 'src', f), 'utf8')
  .replace(/^import[^;]+;/gm, '')
  .replace(/^export\s+/gm, '');

const repCounter = strip('repCounter.js');
const liftDetect = strip('liftDetect.js');

const html = `<!doctype html>
<meta charset="utf-8">
<title>#19 lift-detect validation (real footage)</title>
<style>
  body{background:#0a0a0b;color:#e8e8ea;font:13px/1.5 ui-monospace,Menlo,Consolas,monospace;padding:20px}
  h1{font-size:15px;letter-spacing:.14em;color:#39BDFF;text-transform:uppercase}
  video{max-width:320px;display:block;margin:10px 0;border:1px solid #333}
  pre{background:#111;border:1px solid #2a2a2e;padding:12px;white-space:pre-wrap}
  .ok{color:#4ade80}.warn{color:#fbbf24}.bad{color:#f87171}
  button{background:transparent;border:1px solid #39BDFF;color:#39BDFF;padding:6px 12px;cursor:pointer;font:inherit}
  input{background:#111;border:1px solid #333;color:#e8e8ea;padding:5px;font:inherit;width:280px}
</style>
<h1>#19 — MOTION signal on real footage</h1>
<div>
  clip <input id="src" value="/_realtest.mp4">
  title <input id="title" value="" placeholder="(optional, for fusion test)">
  <button id="go">RUN</button>
</div>
<video id="v" muted playsinline controls></video>
<pre id="out">idle</pre>
<script type="module">
${repCounter}
${liftDetect}

const out = document.getElementById('out');
const log = (s, cls) => { out.innerHTML += (cls ? \`<span class="\${cls}">\${s}</span>\` : s) + '\\n'; };

document.getElementById('go').onclick = async () => {
  out.innerHTML = '';
  const v = document.getElementById('v');
  v.src = document.getElementById('src').value;
  const title = document.getElementById('title').value;

  log('loading MediaPipe…');
  const { PoseLandmarker, FilesetResolver } = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/vision_bundle.mjs');
  const fileset = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/wasm');
  const modelUrl = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task';
  let lm;
  try {
    lm = await PoseLandmarker.createFromOptions(fileset, { baseOptions:{ modelAssetPath: modelUrl, delegate:'GPU' }, runningMode:'VIDEO', numPoses:1 });
  } catch {
    lm = await PoseLandmarker.createFromOptions(fileset, { baseOptions:{ modelAssetPath: modelUrl, delegate:'CPU' }, runningMode:'VIDEO', numPoses:1 });
  }
  log('model ready — playing clip and sampling landmarks…');

  await new Promise(r => { if (v.readyState >= 2) r(); else v.onloadeddata = r; });

  // Same bucketing WorkoutReview uses: index = round(videoTime * 30).
  const BUCKET_FPS = 30;
  const bufs = {};
  let frames = 0, detected = 0;

  await new Promise((resolve) => {
    const step = () => {
      if (v.paused || v.ended) return resolve();
      frames++;
      try {
        const res = lm.detectForVideo(v, performance.now());
        const wl = res?.worldLandmarks?.[0];
        if (wl) {
          detected++;
          const b = Math.round(v.currentTime * BUCKET_FPS);
          for (const d of ANGLE_DEFS) {
            const val = angleAt(wl, d.a, d.b, d.c);
            if (!bufs[d.name]) bufs[d.name] = [];
            bufs[d.name][b] = (val != null) ? val : NaN;
          }
        }
      } catch (e) { /* skip bad frame */ }
      if (typeof v.requestVideoFrameCallback === 'function') v.requestVideoFrameCallback(step);
      else requestAnimationFrame(step);
    };
    v.onended = resolve;
    v.play().then(() => { if (typeof v.requestVideoFrameCallback === 'function') v.requestVideoFrameCallback(step); else requestAnimationFrame(step); });
  });

  log(\`frames processed: \${frames}, with a detected pose: \${detected} (\${(detected/Math.max(1,frames)*100).toFixed(0)}%)\`,
      detected/Math.max(1,frames) > 0.6 ? 'ok' : 'warn');

  const pose = channelFromPose(bufs);
  log('\\nper-channel motion scores:');
  if (pose?.scores) {
    for (const [k, s] of Object.entries(pose.scores).sort((a,b)=>b[1].score-a[1].score)) {
      log(\`  \${k.padEnd(6)} ROM \${s.rom.toFixed(1).padStart(6)}°   rhythm \${(s.rhythm*100).toFixed(0).padStart(3)}%   score \${s.score.toFixed(1)}\`);
    }
  }
  log(\`\\nMOTION verdict: \${pose ? pose.kind.toUpperCase() : '(none)'}  confidence \${pose ? (pose.confidence*100).toFixed(0)+'%' : '-'}\`, 'ok');
  log(\`why: \${pose ? pose.why : '-'}\`);

  if (title) {
    const fused = detectLift({ title, seriesByName: bufs });
    log(\`\\nFUSION with title "\${title}":\`);
    log(\`  kind=\${fused.kind}  source=\${fused.source}  confidence=\${(fused.confidence*100).toFixed(0)}%  disagreement=\${fused.disagreement}\`, fused.disagreement ? 'warn' : 'ok');
    log(\`  why: \${fused.why}\`);
  }
  log('\\ndone.');
};
</script>
`;

fs.writeFileSync(path.join(root, 'public', '_liftdetect-validate.html'), html);
console.log('wrote public/_liftdetect-validate.html');
console.log('open http://localhost:5173/_liftdetect-validate.html');
