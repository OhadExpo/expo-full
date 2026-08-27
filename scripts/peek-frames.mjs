// Seek a clip to given timestamps and save those frames, so a tracking failure
// can be LOOKED AT instead of inferred. Read-only.
//
//   node scripts/peek-frames.mjs "/clip.mp4" ./out 14083 14283 14383
//
// The clip path is served by the dev server (so it starts with /), which means
// Git Bash will rewrite it - prefix the command with MSYS_NO_PATHCONV=1.
//
// This is what root-caused shot 4 on 2026-08-27 after three inferred
// hypotheses were all wrong: the frames showed TWO balls in the air, the
// previous shot still at apex while the next was being held. No amount of
// reading the tracker would have shown that.
import puppeteer from 'puppeteer-core';
const [url, outDir, ...times] = process.argv.slice(2);
const b = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: { width: 1200, height: 900 }, protocolTimeout: 300000 });
const p = await b.newPage();
await p.goto('http://localhost:5212/shot-harness.html', { waitUntil: 'domcontentloaded' });
await new Promise((r) => setTimeout(r, 2500));
const shots = await p.evaluate(async (u, ts) => {
  const v = document.createElement('video');
  v.src = u; v.muted = true; v.playsInline = true; v.preload = 'auto';
  await new Promise((res) => { v.onloadeddata = res; v.onerror = res; setTimeout(res, 8000); });
  const c = document.createElement('canvas');
  const W = 540, H = Math.round(W * v.videoHeight / v.videoWidth);
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const out = [];
  for (const t of ts) {
    await new Promise((res) => { v.onseeked = res; v.currentTime = t / 1000; setTimeout(res, 1500); });
    ctx.drawImage(v, 0, 0, W, H);
    out.push({ t, data: c.toDataURL('image/jpeg', 0.85) });
  }
  return { w: W, h: H, out };
}, url, times.map(Number));
const fs = await import('node:fs');
fs.mkdirSync(outDir, { recursive: true });
for (const s of shots.out) {
  fs.writeFileSync(`${outDir}/f_${s.t}.jpg`, Buffer.from(s.data.split(',')[1], 'base64'));
}
console.log(`saved ${shots.out.length} frames at ${shots.w}x${shots.h} to ${outDir}`);
await p.close();
await b.disconnect();
