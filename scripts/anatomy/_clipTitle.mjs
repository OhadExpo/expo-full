// The logged exercise of a corpus capture, for the gates (14.10 #753): the replay builds a single-leg / split stance
// differently (rig.js asymStance), so a gate must build each clip with the title the app would pass. The titles live
// in the PRIVATE corpus map (~/expo-private-backups/set-clips/_map.json) - read at run time, never committed here.
// clipTitle('c31.mp4-run1.json') -> 'BW Hand-Supported Shrimp Squat' ('' when unknown; ANAT_NO_TITLE=1 = none).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let MAP = null;
export function clipTitle(file) {
  if (process.env.ANAT_NO_TITLE === '1') return '';
  if (MAP === null) {
    MAP = new Map();
    try {
      const raw = fs.readFileSync(path.join(os.homedir(), 'expo-private-backups', 'set-clips', '_map.json'), 'utf8').replace(/\bNaN\b/g, 'null');
      for (const x of JSON.parse(raw)) if (x && x.file) MAP.set(String(x.file).replace(/\.[a-z0-9]+$/i, ''), x.title || '');
    } catch { /* no corpus map: titles unknown */ }
  }
  const key = path.basename(String(file || '')).replace(/\.(mp4|webm|mov)[^/\\]*$/i, '').replace(/\.json$/i, '');
  return MAP.get(key) || '';
}
