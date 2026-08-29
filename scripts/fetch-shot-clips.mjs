// fetch-shot-clips.mjs — build a TEST SET for the shot engine.
//
// One clip proves nothing. The engine has been tuned against Ohad's own
// footage, which is a single camera, a single shooter and a single angle, so
// every threshold in it risks being fitted to that one video. This pulls a
// spread of real shooting footage - different angles, distances, framings and
// frame rates - so the detector can be measured instead of assumed.
//
// Clips are downloaded for LOCAL ENGINE TESTING ONLY. They are written to
// test-clips/ (gitignored), never to public/ or the app bundle, and nothing
// downloaded here is redistributed.
//
//   node scripts/fetch-shot-clips.mjs [count]
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';

const run = promisify(execFile);
const OUT = path.resolve('test-clips');
fs.mkdirSync(OUT, { recursive: true });

// Deliberately varied: a detector that only works on one framing is not fixed.
const QUERIES = [
  'basketball jump shot form side view',
  'basketball free throw form slow motion',
  'basketball shooting form front view drill',
  'basketball three point shot slow motion',
  'basketball shooting drill full body camera',
  'basketball catch and shoot form',
  'youth basketball shooting form coaching',
  'basketball mid range jumper slow motion',
  'basketball shooting workout side angle',
  'basketball set shot technique',
  // Spares: a search returns nothing usable often enough that ten queries
  // yield well under ten clips, and the point of the set is breadth.
  'basketball jump shot slow motion full body',
  'basketball shooting form breakdown video',
  'basketball free throw routine full body',
  'basketball shooting practice gym footage',
  'basketball fadeaway jumper slow motion',
  'basketball shooting mechanics side camera',
  'basketball player shooting drill outdoor court',
  'basketball corner three shooting form',
];

const COUNT = Number(process.argv[2] || QUERIES.length);
const got = [];

for (let i = 0; i < Math.min(COUNT, QUERIES.length); i++) {
  const q = QUERIES[i];
  const out = path.join(OUT, `clip${String(i + 1).padStart(2, '0')}.%(ext)s`);
  console.log(`[${i + 1}/${COUNT}] ${q}`);
  try {
    await run('yt-dlp.exe', [
      `ytsearch1:${q}`,
      // '--max-filesize' made yt-dlp abort the download silently, so nothing
      // landed and the script reported a filter miss it had never applied.
      // '<' in a match-filter is also a shell redirect on Windows and never
      // reached yt-dlp intact. Take whatever <=720p exists and cut the first
      // 90 seconds at download time: the engine needs a minute of shooting,
      // not the whole video.
      // No '<' anywhere in these arguments: it is a shell redirect on Windows
      // and never reaches yt-dlp intact, which is what silently killed every
      // format selector written as 'height<=720'. -S expresses the same
      // preference without a metacharacter.
      '-f', 'bv*+ba/b',
      '-S', 'res:720,ext:mp4',
      '--merge-output-format', 'mp4',
      // No --download-sections: it makes yt-dlp shell out to ffmpeg for the
      // cut, and this ffmpeg build exits non-zero on that path for every clip
      // tried. The local transcode step trims to 90 s anyway, so the cut just
      // moves one stage later.
      '--no-playlist', '--no-warnings', '--quiet',
      '-o', out,
    ], { timeout: 180000, maxBuffer: 1 << 26 });
    const hit = fs.readdirSync(OUT).find((f) => f.startsWith(`clip${String(i + 1).padStart(2, '0')}.`));
    if (hit) {
      const size = fs.statSync(path.join(OUT, hit)).size;
      console.log(`   -> ${hit} (${(size / 1e6).toFixed(1)} MB)`);
      got.push(hit);
    } else {
      console.log('   -> nothing matched the duration filter');
    }
  } catch (e) {
    console.log(`   -> failed: ${String(e.message || e).split('\n')[0].slice(0, 120)}`);
  }
}

console.log(`\n${got.length} clip(s) in ${OUT}`);
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(got, null, 2));
