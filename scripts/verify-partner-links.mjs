// verify-partner-links.mjs - the link pages work INSIDE Elad's sandbox, and nowhere else (#489, 1.10).
//
// A program share / intake link he creates lives in his sbx_ tables; the public
// pages resolve it through RPCs that supabase.js maps to sbx_ twins (security
// invoker - the sbx_ tables' rule is the gate). Real seats, supabase-js:
//   - as HIM: a share link he creates opens his copy of the program; an intake
//     link he creates verifies;
//   - as an ATHLETE and as a signed-out visitor: the sbx_ twins give nothing;
//   - none of the real link RPCs resolve a sandbox token.
//   - THE PAGE (1.10 audit C: the RPCs were tested, never the page): a signed-out
//     visitor opening his share link, as the app copies it (sbx=1), is told the link
//     lives in a sandbox - not a bare "not found" that reads as a broken product.
//     Needs BASE (a built app); skipped, and said so, without it.
// The probe rows are removed. Local sign-out.
//
//   CDP=http://[::1]:9444 BASE=http://127.0.0.1:5277 node scripts/verify-partner-links.mjs
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import P from 'puppeteer-core';

const src = fs.readFileSync('src/supabase.js', 'utf8');
const mk = () => createClient(src.match(/SUPA_URL = '([^']+)'/)[1], src.match(/SUPA_PUBLISHABLE_KEY = '([^']+)'/)[1], { auth: { persistSession: false } });
let pass = 0, fail = 0;
const ok = (c, w) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + w); };
const seat = async (email) => { const c = mk(); const { error } = await c.auth.signInWithPassword({ email, password: '1234' }); if (error) throw new Error(email + ': ' + error.message); return c; };
const e = await seat('eladeluz24@gmail.com'), d = await seat('diego@diegoday.com'), anon = mk();
const tok = 'probe' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
try {
  const { data: pl } = await e.from('sbx_plans').select('id').limit(1);
  const planId = pl && pl[0] && pl[0].id;
  ok(!!planId, 'he has a program to share');
  const { error: ie } = await e.from('sbx_program_shares').insert({ plan_id: planId, token: tok, created_by: 'probe' });
  ok(!ie, 'he creates a share link in his copy' + (ie ? ' - ' + ie.message : ''));
  const { data: sp, error: se } = await e.rpc('sbx_get_shared_program', { p_token: tok });
  ok(!se && sp && (Array.isArray(sp) ? sp.length : Object.keys(sp).length), 'his link opens (sbx_get_shared_program)' + (se ? ' - ' + se.message : ''));
  const { data: rp } = await e.rpc('get_shared_program', { p_token: tok });
  ok(!rp || (Array.isArray(rp) && !rp.length), 'the REAL share RPC does not know his token');
  const { data: dp, error: de } = await d.rpc('sbx_get_shared_program', { p_token: tok });
  ok(!!de || !dp || (Array.isArray(dp) && !dp.length), 'an athlete gets nothing from the sandbox twin');
  const { error: ae } = await anon.rpc('sbx_get_shared_program', { p_token: tok });
  ok(ae?.code === '42501', 'a signed-out visitor cannot call the sandbox twin' + (ae ? ' (' + ae.code + ')' : ' - IT ANSWERED'));
  if (process.env.BASE) {
    const b = await P.connect({ browserURL: process.env.CDP || 'http://[::1]:9444', defaultViewport: null, protocolTimeout: 300000 });
    const ctx = await b.createBrowserContext();
    try {
      const pg = await ctx.newPage(); await pg.setViewport({ width: 390, height: 844 });
      for (const [lang, word] of [['en', /sandbox copy/i], ['he', /סביבת ניסוי/]]) {
        await pg.evaluateOnNewDocument((l) => { try { localStorage.setItem('expo-lang', l); } catch (x) {} }, lang);
        await pg.goto(`${process.env.BASE}/p/${tok}?sbx=1`, { waitUntil: 'domcontentloaded' });
        let txt = ''; for (let k = 0; k < 20; k++) { await new Promise((r) => setTimeout(r, 500)); txt = await pg.evaluate(() => document.body.innerText); if (!/LOADING/.test(txt) && txt.length > 20) break; }
        ok(word.test(txt), `a visitor opening his share link sees why it does not open (${lang}): "${(txt.match(word) ? txt.split('\n').find((l) => word.test(l)) : txt.replace(/\s+/g, ' ').slice(0, 60)) || ''}"`);
      }
    } finally { await ctx.close(); b.disconnect(); }
  } else console.log('  - page check SKIPPED: no BASE');
  const itok = 'probei' + Date.now().toString(36);
  const { error: ii } = await e.from('sbx_intake_tokens').insert({ token: itok, form_type: 'initial', locale: 'he', label: 'probe' });
  ok(!ii, 'he creates an intake link in his copy' + (ii ? ' - ' + ii.message : ''));
  const { data: vi, error: ve } = await e.rpc('sbx_verify_intake_token', { p_token: itok });
  ok(!ve && vi && (Array.isArray(vi) ? vi.length : true), 'his intake link verifies' + (ve ? ' - ' + ve.message : ''));
  const { data: rv } = await anon.rpc('verify_intake_token', { p_token: itok });
  ok(!rv || (Array.isArray(rv) && !rv.length), 'the REAL intake RPC does not know his token');
  await e.from('sbx_intake_tokens').delete().eq('token', itok);
} catch (x) { fail++; console.log('FAIL: ' + x.message); }
finally {
  try { await e.from('sbx_program_shares').delete().eq('token', tok); } catch { /* noop */ }
  for (const c of [e, d]) await c.auth.signOut({ scope: 'local' });
}
console.log(`PARTNER LINKS: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
