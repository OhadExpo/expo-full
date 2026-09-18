// verify-clip-preflight.mjs — does the 12-frame preflight agree with what the
// full analysis learns the slow way?
//
// The preflight (src/clipPreflight.js) exists so a framing problem is reported
// in seconds instead of after a five-minute capture. It is only worth shipping
// if its verdict matches the ground truth we already measured:
//
//   clip02  the release is ABOVE the top edge (wrist y = -0.016 to 0.038 at
//           release, measured 2026-08-31, docs/ball-launch-diagnosis) - the
//           preflight MUST flag no-headroom on it.
//
// It also prints the numbers for the whole ten-clip corpus so the thresholds
// can be argued with against real footage rather than guessed at.
//
//   node scripts/verify-clip-preflight.mjs            # the corpus + clip02
//   node scripts/verify-clip-preflight.mjs c01.mp4    # one clip
import P from 'puppeteer-core';

const PORT = process.env.SHOT_PORT || '5199';
const ONE = process.argv[2];
const CLIPS = ONE ? [ONE.startsWith('/') ? ONE : '/testclips/_corpus/' + ONE]
  : ['/testclips/clip02.mp4', ...['c01', 'c02', 'c03', 'c04', 'c05', 'c06', 'c07', 'c08', 'c09', 'c10'].map((c) => `/testclips/_corpus/${c}.mp4`)];

const b = await P.connect({ browserURL: (process.env.CDP || 'http://127.0.0.1:9222'), defaultViewport: null, protocolTimeout: 60 * 60 * 1000 });
const pg = await b.newPage();
await pg.goto(`http://127.0.0.1:${PORT}/shot-harness.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await pg.waitForFunction('window.__ready === true', { timeout: 60000 }).catch(() => {});

const rows = [];
for (const clip of CLIPS) {
  const t0 = Date.now();
  const r = await pg.evaluate(async (c) => {
    const M = await import('/src/clipPreflight.js');
    return M.preflightClip(c, { kind: 'shot' });
  }, clip).catch((e) => ({ error: String(e.message || e).slice(0, 120) }));
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  if (r.error && !r.measured) { console.log(`${clip.padEnd(34)} ERROR ${r.error}`); continue; }
  const m = r.measured;
  rows.push({ clip, r, secs });
  console.log(`${clip.replace('/testclips/', '').padEnd(24)} ${secs.padStart(5)}s  `
    + `body ${String(m.withBody).padStart(2)}/${m.samples}  h=${m.medianBodyHeight}  headY=${m.minHeadY}  `
    + `luma=${m.meanLuma}  ${r.ok ? 'OK ' : 'BLOCK'}  ${r.findings.map((f) => f.key).join(',') || '-'}`);
}

console.log('');
if (!rows.length) { console.log('FAILED: no clip was read - nothing was verified.'); await pg.close(); b.disconnect(); process.exit(1); }

// The one hard assertion. clip02's release is above the frame and that is
// documented, measured ground truth, so a preflight that passes it is not
// measuring anything.
const c02 = rows.find((x) => /clip02/.test(x.clip));
let bad = 0;
if (!c02) { console.log('FAILED: clip02 was not read, so the one ground-truth case went unchecked.'); bad++; }
else if (!c02.r.findings.some((f) => f.key === 'no-headroom')) {
  console.log(`FAILED: clip02's release is above the top edge (measured 2026-08-31) and the preflight did not flag no-headroom. headY=${c02.r.measured.minHeadY} bodyH=${c02.r.measured.medianBodyHeight}`);
  bad++;
} else {
  console.log(`clip02: no-headroom flagged, as it must be (head at ${Math.round(c02.r.measured.minHeadY * 100)}% from the top, body ${Math.round(c02.r.measured.medianBodyHeight * 100)}% of frame).`);
}
// And it must not be a check that fires on everything.
const flagged = rows.filter((x) => x.r.findings.some((f) => f.key === 'no-headroom')).length;
if (flagged === rows.length && rows.length > 2) {
  console.log(`FAILED: no-headroom fired on ALL ${rows.length} clips - a warning that is always on is noise.`);
  bad++;
}
const slow = rows.filter((x) => +x.secs > 25);
if (slow.length) console.log(`NOTE: ${slow.length} clip(s) took over 25s - the point of a preflight is that it is fast.`);
console.log(`${rows.length} clips read, no-headroom on ${flagged}`);
await pg.close();
b.disconnect();
process.exit(bad ? 1 : 0);
