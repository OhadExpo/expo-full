// verify-partner-sandbox.mjs - Elad's seat is a SANDBOX: his own copy, never the real data.
//
// Ohad, 30.9 (#476): "elad copy needs to be perfect by tonight. a perfect clone
// ... so he can review everything" / "fake money but everything ... the ability
// to actually touch or change it (sandbox) - his own version".
//
// Signs in AS the partner (pure node, supabase-js, no browser) and proves:
//   1. the REAL tables return nothing to him and refuse his writes;
//   2. his sbx_ copies hold the data and take his writes (a probe row, removed);
//   3. he is neither staff nor trainer in the database;
//   4. the money he sees is not the real money (owner seat compares).
// Ends every session with signOut({ scope: 'local' }) - a bare signOut is global.
//
//   node scripts/verify-partner-sandbox.mjs
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';

const src = fs.readFileSync('src/supabase.js', 'utf8');
const URL_ = src.match(/SUPA_URL = '([^']+)'/)[1];
const KEY = src.match(/SUPA_PUBLISHABLE_KEY = '([^']+)'/)[1];
const PARTNER = process.env.PARTNER || 'eladeluz24@gmail.com';
const OWNER = process.env.OWNER || 'ohadyproductions@gmail.com';
const PW = process.env.PW || '1234';
const mk = () => createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });

let pass = 0, fail = 0;
const ok = (cond, what) => { if (cond) { pass++; console.log('  ✓ ' + what); } else { fail++; console.log('  ✗ ' + what); } };

const REAL = ['store', 'plans', 'client_workouts', 'coach_notes', 'bw_logs', 'weekly_focus', 'revenue_month_total', 'bit_payment_requests', 'trainee_evaluations', 'coach_messages'];

const p = mk();
const { error: se } = await p.auth.signInWithPassword({ email: PARTNER, password: PW });
if (se) { console.log('FAIL: partner could not sign in - ' + se.message); process.exit(1); }
const o = mk();
const { error: oe } = await o.auth.signInWithPassword({ email: OWNER, password: PW });
if (oe) { console.log('FAIL: owner could not sign in - ' + oe.message); await p.auth.signOut({ scope: 'local' }); process.exit(1); }
try {
  console.log('1. the REAL tables are closed to him');
  // store: every signed-in account (every athlete too) reads the exercise
  // library, the portal visibility row and presence rows - those three, and
  // nothing else, is the floor; anything more would be a leak to HIM
  const EVERYONE_READS = (k) => k === 'expo-exercises' || k === 'expo-portal-vis' || /^expo-presence/.test(k);
  for (const t of REAL) {
    const { data, error } = await p.from(t).select(t === 'store' ? 'key' : '*').limit(t === 'store' ? 100 : 5);
    const rows = (data || []).filter((r) => t !== 'store' || !EVERYONE_READS(r.key));
    ok(!error && Array.isArray(data) && rows.length === 0, `real ${t}: reads 0 rows${t === 'store' ? ' beyond what every account reads' : ''}${rows.length ? ' - LEAK: ' + rows.map((r) => r.key || r.id).slice(0, 5).join(',') : ''}${error ? ' (error ' + error.code + ')' : ''}`);
  }
  {
    const { error } = await p.from('store').upsert({ key: 'expo-partner-probe', value: [] });
    ok(!!error, `real store: his write is refused${error ? ' (' + error.code + ')' : ' - IT WROTE'}`);
    if (!error) await o.from('store').delete().eq('key', 'expo-partner-probe');
    const { data: pl } = await o.from('plans').select('id').limit(1);
    if (pl && pl[0]) {
      const { data: upd, error: ue } = await p.from('plans').update({ name: 'PARTNER PROBE' }).eq('id', pl[0].id).select('id');
      ok(!ue ? (upd || []).length === 0 : true, 'real plans: his update changes 0 rows');
    }
  }
  console.log('2. his sandbox holds the data and takes his writes');
  for (const t of REAL) {
    const [{ count: mine }, { count: real }] = await Promise.all([
      p.from('sbx_' + t).select('*', { count: 'exact', head: true }),
      o.from(t).select('*', { count: 'exact', head: true }),
    ]);
    ok(mine != null && mine > 0 || real === 0, `sbx_${t}: ${mine} rows (real: ${real})`);
  }
  {
    const { error: we } = await p.from('sbx_store').upsert({ key: 'expo-partner-probe', value: [1] });
    ok(!we, 'sbx_store: his write lands' + (we ? ' - ' + we.message : ''));
    const { data: back } = await p.from('sbx_store').select('value').eq('key', 'expo-partner-probe');
    ok(back && back[0] && JSON.stringify(back[0].value) === '[1]', 'sbx_store: he reads his own write back');
    const { data: realSide } = await o.from('store').select('key').eq('key', 'expo-partner-probe');
    ok((realSide || []).length === 0, 'the real store never saw it');
    await p.from('sbx_store').delete().eq('key', 'expo-partner-probe');
  }
  console.log('3. no staff / trainer powers in the database');
  {
    const { data: pi } = await p.from('sbx_plan_index').select('id').limit(1);
    ok(Array.isArray(pi) && pi.length === 1, 'sbx_plan_index answers him');
    const { error: pe } = await p.rpc('purge_trainee_data', { p_trainee_id: 'nobody_probe' });
    ok(!!pe, 'the REAL purge refuses him' + (pe ? ' (' + (pe.message || '').slice(0, 30) + ')' : ' - IT RAN'));
    // his DELETE-ATHLETE runs the sandbox purge (supabase.js maps it); on a
    // nobody id it deletes nothing and reports every sandbox table it looked in
    const { data: sp, error: spe } = await p.rpc('sbx_purge_trainee_data', { p_trainee_id: 'nobody_probe' });
    ok(!spe && sp && Object.keys(sp).length >= 15 && Object.values(sp).every((n) => n === 0), 'his delete-athlete runs on his copy (' + (spe ? spe.message : Object.keys(sp || {}).length + ' tables, 0 rows') + ')');
    const { error: re } = await p.rpc('sbx_reset');
    ok(!!re, 'he cannot re-copy/wipe the sandbox himself' + (re ? '' : ' - IT RAN'));
    // the multiplier is the only thing between a fake price and the real one
    const { error: fe } = await p.rpc('sbx_fake', { n: 100, seed: 'tr_diego' });
    const { error: fe2 } = await p.rpc('sbx_factor', { seed: 'tr_diego' });
    ok(!!fe && !!fe2, 'he cannot call the faking functions (the multiplier stays secret)' + (fe && fe2 ? '' : ' - ONE ANSWERED'));
  }
  console.log('4. the money is fake');
  {
    const [{ data: mine }, { data: real }] = await Promise.all([
      p.from('sbx_revenue_month_total').select('id,amount'), o.from('revenue_month_total').select('id,amount')]);
    const r = new Map((real || []).map((x) => [x.id, Number(x.amount)]));
    const nz = (mine || []).filter((x) => r.get(x.id));
    ok(nz.length > 0 && nz.every((x) => Number(x.amount) !== r.get(x.id)), `revenue totals: ${nz.length} compared, 0 real amounts in his copy`);
    // every other money field he can see, compared row by row with the real one
    // MONEY numbers only, by the database's own rule: an integer >= 20 that is
    // not a block number (#28) and not part of a date (26.12) - or a value that
    // is only a number. Everything else (dates, blocks, counts) must stay REAL.
    const moneyIn = (v) => {
      const s = String(v == null ? '' : v);
      if (/^\s*[0-9][0-9,]*(\.[0-9]+)?\s*$/.test(s)) return [Number(s.replace(/,/g, ''))].filter((n) => n !== 0);
      const out = [];
      for (const m of s.matchAll(/[0-9][0-9,]*[0-9]|[0-9]/g)) {
        const prev = s[m.index - 1] || '', nxt = s[m.index + m[0].length] || '', nxt2 = s[m.index + m[0].length + 1] || '';
        const n = Number(m[0].replace(/,/g, ''));
        if (prev !== '#' && prev !== '.' && !(nxt === '.' && /[0-9]/.test(nxt2)) && n >= 20) out.push(n);
      }
      return out;
    };
    const nonMoney = (v) => /^\s*[0-9][0-9,]*(\.[0-9]+)?\s*$/.test(String(v == null ? '' : v)) ? 'N' : String(v == null ? '' : v).replace(/[0-9][0-9,]*[0-9]|[0-9]/g, (d, i, s) => (moneyIn(s).length && moneyIn(d).length && Number(d.replace(/,/g, '')) >= 20 && s[i - 1] !== '#' && s[i - 1] !== '.' && !(s[i + d.length] === '.' && /[0-9]/.test(s[i + d.length + 1] || ''))) ? 'N' : d);
    const same = async (table, key, cols) => {
      const [{ data: m }, { data: rr }] = await Promise.all([p.from('sbx_' + table).select([key, ...cols].join(',')), o.from(table).select([key, ...cols].join(','))]);
      const byId = new Map((rr || []).map((x) => [x[key], x]));
      let compared = 0, leaked = 0, bent = 0;
      for (const x of m || []) { const y = byId.get(x[key]); if (!y) continue; for (const c of cols) {
        const real = moneyIn(y[c]), fake = moneyIn(x[c]);
        real.forEach((n, i) => { compared++; if (fake[i] === n) leaked++; });
        // the words around the money are the same facts (dates, blocks, counts untouched)
        if (typeof y[c] === 'string' && nonMoney(y[c]) !== nonMoney(x[c])) { bent++; if (!same.example) same.example = `${table}.${c}: "${y[c]}" -> "${x[c]}"`; }
      } }
      return { compared, leaked, bent };
    };
    for (const [t, k, cols] of [['revenue_owed', 'id', ['amount', 'price_text']], ['revenue_sheet_event', 'id', ['rate_amount', 'amount_est', 'rate_text']],
      ['bit_payment_requests', 'id', ['amount', 'paid_amount']], ['invoices', 'id', ['amount']], ['subscriptions', 'id', ['amount']], ['coaching_contracts', 'id', ['monthly_rate']]]) {
      const { compared, leaked, bent } = await same(t, k, cols);
      ok(leaked === 0 && bent === 0, `${t}: ${compared} money values compared, ${leaked} real ones in his copy, ${bent} texts whose non-money facts changed`);
      if (bent && same.example) { console.log('      e.g. ' + same.example); same.example = null; }
    }
    {
      const [{ data: ms }, { data: rs }] = await Promise.all([p.from('sbx_store').select('value').eq('key', 'expo-trainees'), o.from('store').select('value').eq('key', 'expo-trainees')]);
      const real = new Map(((rs && rs[0] && rs[0].value) || []).map((t) => [t.id, t]));
      let compared = 0, leaked = 0;
      for (const t of (ms && ms[0] && ms[0].value) || []) { const r0 = real.get(t.id); if (!r0) continue;
        for (const c of ['monthly', 'monthlyPrice', 'packagePrice', 'perSession', 'sessionPrice']) { const v = r0[c]; if (v == null || !/[1-9]/.test(String(v))) continue; compared++; if (String(t[c]) === String(v)) leaked++; } }
      ok(compared > 0 && leaked === 0, `athlete prices: ${compared} compared, ${leaked} real ones in his copy`);
    }
    // ONE multiplier per athlete across all their money (1050-next-to-810 in one
    // row, and a "33" that became "34", came from faking each value on its own)
    {
      const ratios = new Map();   // athlete -> Set of fake/real ratios
      const add = (who, real, fake) => { if (!who || real == null || fake == null || Number(real) === 0) return; const k = Math.round((Number(fake) / Number(real)) * 100) / 100; if (!ratios.has(who)) ratios.set(who, new Set()); ratios.get(who).add(k); };
      const [{ data: ms }, { data: rs }] = await Promise.all([p.from('sbx_revenue_sheet_event').select('id,trainee_id,client_name,rate_amount,amount_est'), o.from('revenue_sheet_event').select('id,trainee_id,client_name,rate_amount,amount_est')]);
      const rmap = new Map((rs || []).map((x) => [x.id, x]));
      for (const x of ms || []) { const y = rmap.get(x.id); if (!y) continue; const who = y.trainee_id || y.client_name; if (Number(y.rate_amount) >= 20) add(who, y.rate_amount, x.rate_amount); if (Number(y.amount_est) >= 20) add(who, y.amount_est, x.amount_est); }
      const [{ data: mo }, { data: ro }] = await Promise.all([p.from('sbx_revenue_owed').select('id,trainee_id,client_name,amount'), o.from('revenue_owed').select('id,trainee_id,client_name,amount')]);
      const omap = new Map((ro || []).map((x) => [x.id, x]));
      for (const x of mo || []) { const y = omap.get(x.id); if (y && Number(y.amount) >= 20) add(y.trainee_id || y.client_name, y.amount, x.amount); }
      const split = [...ratios].filter(([, s]) => s.size > 1);
      ok(ratios.size > 0 && split.length === 0, `one multiplier per athlete: ${ratios.size} athletes checked, ${split.length} with money scaled inconsistently${split.length ? ' e.g. ' + split[0][0] + ' ' + [...split[0][1]].join('/') : ''}`);
    }
  }
} finally {
  await p.auth.signOut({ scope: 'local' });
  await o.auth.signOut({ scope: 'local' });
}
console.log(`\nPARTNER SANDBOX: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
