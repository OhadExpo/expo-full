// THE QUOTA EVICTOR MUST NOT DELETE THE ONLY COPY OF SOMETHING HE MADE.
//
// supabase.js frees space for the auth token by deleting `expo-` keys, biggest
// first. That is right for a server snapshot, which can always be refetched,
// and wrong for the keys that are the sole copy of the coach's own work: saved
// shot analyses, sensor readings, the Bar-Speed Vault, notes on a lead — and
// above all the OFFLINE QUEUE, which holds writes that have not reached the
// server yet. Evicting that one does not lose a cache, it loses what somebody
// typed.
//
// This pins the list and proves the filter honours it.
//   node scripts/verify-never-evict.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(ROOT, 'src', 'supabase.js'), 'utf8');

const MUST_PROTECT = ['expo-shot-analyses', 'expo-sensor-readings', 'expo-pose-metrics', 'expo-offline-queue', 'expo-lead-notes'];
const fails = [];

for (const k of MUST_PROTECT) {
  if (!src.includes(`'${k}'`)) fails.push(`${k} is not in NEVER_EVICT`);
}
if (!/NEVER_EVICT\.has\(k\)/.test(src)) fails.push('the evictor does not consult NEVER_EVICT');
if (!/SNAPSHOT_PREFIXES\.some/.test(src)) fails.push('the evictor no longer filters by prefix — re-read this file');

// The filter must EXCLUDE protected keys, not merely mention them.
const filterLine = (src.split('\n').find((l) => l.includes('SNAPSHOT_PREFIXES.some')) || '');
if (!/!NEVER_EVICT\.has\(k\)/.test(filterLine)) fails.push('NEVER_EVICT is not negated in the eviction filter');

for (const k of MUST_PROTECT) console.log(`  ${fails.some((f) => f.startsWith(k)) ? 'FAIL' : 'PASS'}  ${k}`);
console.log(fails.length ? `\n${fails.length} problem(s):\n  ${fails.join('\n  ')}` : '\nthe evictor cannot touch the only copy of his work');
process.exit(fails.length ? 1 : 0);
