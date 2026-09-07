// AN ATHLETE WHOSE IDENTITY LOOKUP CANNOT REACH THE SERVER.
//
// Athletes resolve their own record through the my_trainee() RPC, because RLS
// stops them reading the trainees store. When that call fails there was no
// fallback, so a reload on a dead network replaced the programme with
// "Couldn't Verify Account" - measured against production, 152 characters and
// no workout.
//
// The offline gate cannot check this locally (a service worker needs a secure
// context, and neither local origin gives one that also registers). This does,
// by blocking ONLY that one RPC: the app still loads over the network, the
// lookup still fails, and the fallback is exercised exactly as it would be in a
// basement.
//
// Three states, and all three matter:
//   FIRST RUN  - nothing cached, lookup blocked  -> must still refuse
//   WARMED     - one good load, then blocked      -> must show the programme
//   OTHER USER - cache belongs to another email   -> must refuse
//
//   node scripts/verify-identity-cache.mjs [email]
import P from 'puppeteer-core';
import { setWidth } from './lib/viewport.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:4173';
const EMAIL = process.argv[2] || 'diego@diegoday.com';
const PW = process.env.ATHLETE_PW || '1234';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const problems = [];

const b = await P.connect({ browserURL: (process.env.CDP || 'http://127.0.0.1:9222'), defaultViewport: null, protocolTimeout: 300000 });
const pg = await b.newPage();

let blockRpc = false;
await pg.setRequestInterception(true);
pg.on('request', (r) => {
  if (blockRpc && /\/rest\/v1\/rpc\/my_trainee/.test(r.url())) { r.abort('failed').catch(() => {}); return; }
  r.continue().catch(() => {});
});

const signIn = async () => {
  await pg.goto(BASE + '/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await wait(3000);
  await pg.evaluate(({ email, pw }) => {
    const ins = [...document.querySelectorAll('input')];
    const e = ins.find((i) => /email/i.test(i.type + i.placeholder + i.name));
    const p = ins.find((i) => i.type === 'password');
    const set = (el, v) => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    if (e) set(e, email); if (p) set(p, pw);
  }, { email: EMAIL, pw: PW });
  await wait(400);
  await pg.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((x) => /^\s*(sign\s*in|כניסה)\s*$/i.test(x.textContent || ''));
    if (btn) btn.click();
  });
  await wait(9000);
};

const portal = async () => {
  await pg.goto(BASE + '/athlete', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await wait(12000);
  return pg.evaluate(() => {
    const t = (document.body.innerText || '').replace(/\s+/g, ' ').trim();
    return { blocked: /couldn'?t verify|not registered|access denied/i.test(t),
             programme: /block|program|warm-?up/i.test(t), len: t.length, head: t.slice(0, 70) };
  });
};

try {
  await setWidth(pg, 390, 844);

  // 1. COLD: no cache, lookup blocked. Must still refuse.
  await pg.goto(BASE + '/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await pg.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch (e) {} });
  await signIn();
  // Signing in already loads the app once, which runs the RPC successfully and
  // WARMS the cache - so clearing storage before sign-in does not give a cold
  // state. Drop just the cache key (not the Supabase session) with the RPC
  // already blocked.
  blockRpc = true;
  await pg.evaluate(() => { try { localStorage.removeItem('expo-self-trainee'); } catch (e) { /* ignore */ } });
  let r = await portal();
  console.log(`cold   : blocked=${r.blocked} programme=${r.programme}  "${r.head.slice(0, 46)}"`);
  if (!r.blocked) problems.push('cold: an athlete with nothing cached got in while the lookup was failing');

  // 2. WARM: one good load, then block. Must show the programme.
  blockRpc = false;
  r = await portal();
  if (!r.programme) { console.log('FAILED: could not warm the cache - the portal did not load online'); process.exit(1); }
  blockRpc = true;
  r = await portal();
  console.log(`warmed : blocked=${r.blocked} programme=${r.programme}  "${r.head.slice(0, 46)}"`);
  if (r.blocked || !r.programme) problems.push(`warmed: the cached athlete was still locked out (${r.len} chars)`);

  // 3. OTHER USER: the cache belongs to somebody else. Must refuse.
  await pg.evaluate(() => {
    try {
      localStorage.setItem('expo-self-trainee', JSON.stringify({ email: 'someone.else@example.com', trainee: { id: 'tr_x', name: 'Someone Else' } }));
    } catch (e) { /* ignore */ }
  });
  r = await portal();
  console.log(`other  : blocked=${r.blocked} programme=${r.programme}  "${r.head.slice(0, 46)}"`);
  if (!r.blocked) problems.push("other user: a cache belonging to a different email was accepted");
} catch (e) {
  problems.push('threw: ' + String(e.message || e).slice(0, 120));
} finally {
  await pg.setRequestInterception(false).catch(() => {});
  await pg.close().catch(() => {});
  b.disconnect();
}

console.log('');
for (const p of [...new Set(problems)]) console.log('FAIL  ' + p);
console.log(problems.length ? `\n${problems.length} problem(s)` : '\n0 - refuses cold, works warmed, refuses another user');
process.exit(problems.length ? 1 : 0);
