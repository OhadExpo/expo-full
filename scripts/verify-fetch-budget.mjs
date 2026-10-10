// verify-fetch-budget.mjs - a request's time budget grows with its body (5.10 #560
// review B1 + 1005d #1). Pure. BREAK=1 drops the FormData branch - must FAIL.
import { fetchBudgetFor as real, bodyBytes } from '../src/fetchBudget.js';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m); } };
const fetchBudgetFor = process.env.BREAK
  ? (url, init) => real(url, init && init.body instanceof FormData ? { ...init, body: null } : init)
  : real;
const U = 'https://x.supabase.co/storage/v1/object/form-videos/a/b.mp4';
const big = new Blob([new Uint8Array(34 * 1024 * 1024)]);
const fd = new FormData(); fd.append('cacheControl', '3600'); fd.append('', big);
ok(fetchBudgetFor(U, { method: 'POST', body: big }) > 1000 * 1000, `a 34 MB Blob upload gets > 1000 s (${fetchBudgetFor(U, { method: 'POST', body: big })} ms)`);
ok(fetchBudgetFor(U, { method: 'POST', body: fd }) > 1000 * 1000, `the SAME clip inside a FormData (how storage-js sends it) gets > 1000 s too (${fetchBudgetFor(U, { method: 'POST', body: fd })} ms)`);
ok(fetchBudgetFor(U, { method: 'POST', body: new Blob(['x']) }) === 60000, 'a tiny upload keeps the 60 s floor');
ok(fetchBudgetFor('https://x.supabase.co/rest/v1/plans?select=*', { method: 'GET' }) === 20000, 'a read: 20 s');
const json = JSON.stringify({ v: 'א'.repeat(400000) });
ok(fetchBudgetFor('https://x.supabase.co/rest/v1/store', { method: 'POST', body: json }) > 10000, `a 400k-char Hebrew store write gets more than the 10 s floor (${fetchBudgetFor('https://x.supabase.co/rest/v1/store', { method: 'POST', body: json })} ms)`);
ok(fetchBudgetFor('https://x.supabase.co/rest/v1/store', { method: 'POST', body: '{}' }) === 10000, 'a small write: 10 s');
ok(bodyBytes(null) === 0 && bodyBytes(new ArrayBuffer(10)) === 10, 'no body = 0, an ArrayBuffer = its bytes');
console.log(`FETCH BUDGET: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
