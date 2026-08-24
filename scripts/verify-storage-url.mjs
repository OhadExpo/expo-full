// Regression test for the storage-URL resolver. Pure parsing — no network.
import { parseStoredUrl, isStoredUrl } from '../src/storagePath.js';

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log(`  ✗ ${name}\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`); }
};

console.log('STORAGE URL RESOLVER\n');

const BASE = 'https://gtcbfglttoiyfsnfbhdy.supabase.co/storage/v1';

eq('public form video',
  parseStoredUrl(`${BASE}/object/public/form-videos/tr_amit/1776955731343-form.mp4`),
  { bucket: 'form-videos', path: 'tr_amit/1776955731343-form.mp4' });

eq('already-signed url re-parses',
  parseStoredUrl(`${BASE}/object/sign/form-videos/tr_amit/x.mp4?token=abc.def`),
  { bucket: 'form-videos', path: 'tr_amit/x.mp4' });

eq('nested path survives',
  parseStoredUrl(`${BASE}/object/public/meal-photos/tr_x/2026/08/25/lunch.jpg`),
  { bucket: 'meal-photos', path: 'tr_x/2026/08/25/lunch.jpg' });

eq('percent-encoded path is decoded',
  parseStoredUrl(`${BASE}/object/public/coach-voice/tr_x/a%20b.webm`),
  { bucket: 'coach-voice', path: 'tr_x/a b.webm' });

eq('query string is not part of the path',
  parseStoredUrl(`${BASE}/object/public/form-videos/tr_x/v.mp4?download=1`),
  { bucket: 'form-videos', path: 'tr_x/v.mp4' });

// Anything that is NOT one of our objects must pass through untouched — the
// library is full of YouTube links and blob: URLs.
eq('youtube is not a stored url', parseStoredUrl('https://youtu.be/abc123'), null);
eq('blob is not a stored url', parseStoredUrl('blob:http://localhost:5199/uuid'), null);
eq('empty', parseStoredUrl(''), null);
eq('null', parseStoredUrl(null), null);
eq('isStoredUrl true', isStoredUrl(`${BASE}/object/public/form-videos/a/b.mp4`), true);
eq('isStoredUrl false', isStoredUrl('https://example.com/x.mp4'), false);

console.log(`\nSTORAGE URL RESOLVER: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
