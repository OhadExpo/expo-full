// fetchBudget.js - how long ONE Supabase request may take (5.10 #560, reviews of
// 1005a/1005d). Pure, so node can test it (scripts/verify-fetch-budget.mjs).
const FETCH_TIMEOUT_READ_MS = 20000;
const FETCH_TIMEOUT_WRITE_MS = 10000;
const FETCH_TIMEOUT_UPLOAD_MS = 60000;
// A BUDGET THAT GROWS WITH THE BODY (5.10 review B1/S2): a flat 60 s cut every
// 34 MB clip on weak gym LTE (it needs ~4.5 Mbps to finish in 60 s) and the
// queue retried it forever, each try cut at 60 s again; a flat 10 s did the same
// to a 1-2 MB store write on a 3G uplink. Now the budget is the flat floor OR
// the time the body needs at 25 KB/s (~200 kbps, a poor uplink), whichever is
// longer - a slow upload that is moving finishes, a dead socket still ends.
const UPLINK_FLOOR_BPS = 25 * 1024;
export const bodyBytes = (b) => {
  if (!b) return 0;
  // storage-js wraps EVERY Blob upload in a FormData (5.10 review 1005d #1):
  // counted as 0, a queued 34 MB clip got the flat 60 s again
  if (typeof FormData !== 'undefined' && b instanceof FormData) {
    let n = 0;
    for (const [, v] of b.entries()) n += typeof v === 'string' ? v.length * 2 : (v && v.size) || 0;
    return n;
  }
  if (typeof b === 'string') return b.length * 2;   // UTF-16 units -> a UTF-8 upper bound for Hebrew
  if (typeof b.size === 'number') return b.size;          // Blob / File
  if (typeof b.byteLength === 'number') return b.byteLength;  // ArrayBuffer / typed array
  return 0;
};
export const fetchBudgetFor = (url, init) => {
  const method = String((init && init.method) || 'GET').toUpperCase();
  const need = Math.ceil((bodyBytes(init && init.body) / UPLINK_FLOOR_BPS) * 1000);
  if (/\/storage\/v1\/(object|upload)\//.test(url) && method !== 'GET' && method !== 'HEAD') return Math.max(FETCH_TIMEOUT_UPLOAD_MS, need);
  if (/\/rest\/v1\//.test(url) && (method === 'GET' || method === 'HEAD')) return FETCH_TIMEOUT_READ_MS;
  return Math.max(FETCH_TIMEOUT_WRITE_MS, need);
};
