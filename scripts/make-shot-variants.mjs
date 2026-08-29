// make-shot-variants.mjs — a robustness suite with KNOWN GROUND TRUTH.
//
// Random clips off the internet cannot test a detector: you do not know how
// many shots are in them, so a wrong answer is indistinguishable from a right
// one. Of ten clips pulled by search on 2026-08-30, three were usable footage
// at all — the rest were coaching talking-heads, a casual outdoor scene, and a
// chest-up framing with no knees in shot.
//
// So: take the ONE clip whose answer is known (Ohad's, 17 shots) and vary the
// things a phone actually varies — frame rate, resolution, exposure, framing,
// which way the shooter faces. Every variant must still return 17. Anything
// that does not is a threshold fitted to the original encode rather than to
// shooting.
//
//   node scripts/make-shot-variants.mjs [source.mp4]
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';

const run = promisify(execFile);
const SRC = process.argv[2] || 'public/lv_0_20240407105341.mp4';
const OUT = 'public/testclips';
fs.mkdirSync(OUT, { recursive: true });

// Always: yuv420p, +faststart, dense keyframes. Without faststart the browser
// cannot seek until the whole file is fetched and the pose pass finds nobody at
// all — a container problem that reports as "I could not find a person".
const BASE = ['-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p',
  '-movflags', '+faststart', '-g', '15', '-keyint_min', '15', '-sc_threshold', '0', '-an'];

const VARIANTS = [
  // the reference: same as shots17b
  { name: 'v_ref', vf: 'scale=-2:1280', extra: ['-crf', '25'] },
  // half the frame rate: phones record 30 as often as 60
  { name: 'v_30fps', vf: 'scale=-2:1280,fps=30', extra: ['-crf', '25'] },
  { name: 'v_24fps', vf: 'scale=-2:1280,fps=24', extra: ['-crf', '25'] },
  // smaller: an older phone, or a clip already compressed by a messaging app
  { name: 'v_480', vf: 'scale=-2:854', extra: ['-crf', '28'] },
  // a gym at night, and a court at noon
  { name: 'v_dark', vf: 'scale=-2:1280,eq=brightness=-0.12:contrast=1.05', extra: ['-crf', '25'] },
  { name: 'v_bright', vf: 'scale=-2:1280,eq=brightness=0.10:contrast=0.95', extra: ['-crf', '25'] },
  // filmed from the other side: a left-handed-looking shooter who is not one
  { name: 'v_mirror', vf: 'scale=-2:1280,hflip', extra: ['-crf', '25'] },
  // stood further back, so the shooter is smaller in frame
  { name: 'v_wide', vf: 'scale=-2:1280,pad=iw*1.35:ih:(ow-iw)/2:0:black', extra: ['-crf', '25'] },
  // heavier compression, the state most shared clips arrive in
  { name: 'v_lowq', vf: 'scale=-2:1280', extra: ['-crf', '34'] },
];

if (!fs.existsSync(SRC)) { console.log(`source not found: ${SRC}`); process.exit(2); }
console.log(`source: ${SRC}`);

for (const v of VARIANTS) {
  const out = path.join(OUT, `${v.name}.mp4`);
  process.stdout.write(`${v.name.padEnd(11)} `);
  try {
    await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', SRC, '-vf', v.vf, ...BASE, ...v.extra, out],
      { timeout: 900000, maxBuffer: 1 << 26 });
    const mb = fs.statSync(out).size / 1e6;
    console.log(`${mb.toFixed(1)} MB`);
  } catch (e) {
    console.log(`FAILED ${String(e.message || e).split('\n')[0].slice(0, 80)}`);
  }
}

console.log('\nEvery one of these must return 17. Run:');
console.log(`  MSYS_NO_PATHCONV=1 node scripts/shot-suite.mjs <port> ${VARIANTS.map((v) => '/testclips/' + v.name + '.mp4').join(' ')}`);
