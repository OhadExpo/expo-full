// WHY THE DASHBOARD REVENUE DOES NOT MATCH HIS SHEET.
//
// "dashboard revenue still not updated". The dashboard's Estimated Monthly is
// literally sum(t.monthly) over ACTIVE trainees in store['expo-trainees'] — the
// arithmetic is right. So the question is not the sum, it is whether those
// per-athlete numbers still agree with the sheet he actually maintains.
//
// This compares them and writes NOTHING. It cannot responsibly write: the
// sheet's money cells are free text ("250/200 ש"ח" = two prices for personal
// and couple sessions; "עד בלוק #17" = prepaid through a block), and turning
// those into one monthly figure needs rules only he can give.
//
//   node scripts/reconcile-revenue.mjs
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const CSV = 'audit-out/sheet/revenue-1803423381.csv';
const SUPA_URL = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const SUPA_KEY = process.env.EXPO_ANON_KEY || 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';
const EMAIL = process.env.EXPO_EMAIL || 'ohadyproductions@gmail.com';
const PW = process.env.EXPO_PW || '1234';

const splitCsvLine = (line) => {
  const out = []; let cur = ''; let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; continue; }
    if (c === ',' && !q) { out.push(cur); cur = ''; continue; }
    cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
};

// MATCHING THE TWO SYSTEMS IS THE WHOLE JOB, and a bad match produces a
// confident lie - the first version reported "דיאגו דיי · NOT IN THE APP AT
// ALL" while the app holds him as "Diego Day", and split מיה וחילק / מיה
// וחיליק into two people. Three passes, in order:
//   1. squashed exact (drops spaces, quotes, doubled yods)
//   2. an explicit alias for names written in a different SCRIPT, which no
//      string distance can bridge
//   3. edit distance <= 2, which catches one dropped or swapped letter
const norm = (s) => String(s || '').replace(/[\s"'׳״.]/g, '').replace(/י+/g, 'י').trim();

const ALIAS = new Map([['דיאגו דיי', 'diegoday'], ['Diego Day', 'diegoday']]
  .map(([k, v]) => [norm(k).toLowerCase(), v]));
const alias = (s) => ALIAS.get(norm(s).toLowerCase()) || null;

const dist = (a, b) => {
  if (Math.abs(a.length - b.length) > 2) return 99;
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return dp[a.length][b.length];
};

// Find the sheet row for an app trainee (or vice versa) across all three passes.
const findIn = (map, name) => {
  const k = norm(name);
  if (map.has(k)) return map.get(k);
  const a = alias(name);
  if (a) { for (const [kk, v] of map) if (alias(v.name || kk) === a) return v; }
  for (const [kk, v] of map) if (dist(k, kk) <= 2) return v;
  return null;
};

if (!fs.existsSync(CSV)) {
  console.log('No sheet snapshot at ' + CSV + '. Run: node scripts/sync-revenue-sheet.mjs');
  process.exit(1);
}
const rows = fs.readFileSync(CSV, 'utf8').split(/\r?\n/).map(splitCsvLine);

// Walk the two sections, keeping which one each athlete came from - that IS the
// billing model the sheet asserts.
const sheet = new Map();
let section = null, header = null;
for (const r of rows) {
  const joined = r.join('').trim();
  if (!joined) continue;
  const title = r.find((c) => /מתאמני/.test(c));
  if (title) { section = title.trim(); header = null; continue; }
  if (r.some((c) => /שם מלא/.test(c))) { header = r.slice(1); continue; }
  if (/עודכן לאחרונה/.test(joined) || !section) continue;
  const cells = r.slice(1);
  const name = cells[1];
  if (!name || !cells[0]) continue;
  const priceIdx = (header || []).findIndex((c) => /מחיר/.test(c));
  const priceCell = priceIdx >= 0 ? cells[priceIdx] : cells[cells.length - 1];
  sheet.set(norm(name), { name, section, lastPaid: cells[2] || '', price: priceCell || '' });
}

const sb = createClient(SUPA_URL, SUPA_KEY);
const { error: authErr } = await sb.auth.signInWithPassword({ email: EMAIL, password: PW });
if (authErr) { console.log('sign-in failed: ' + authErr.message); process.exit(1); }
const { data, error } = await sb.from('store').select('value').eq('key', 'expo-trainees').single();
if (error) { console.log('store read failed: ' + error.message); process.exit(1); }
const trainees = Array.isArray(data.value) ? data.value : [];

const active = trainees.filter((t) => t && t.status === 'Active');
const mrr = active.reduce((a, t) => a + (parseFloat(t.monthly) || 0), 0);

console.log('DASHBOARD "ESTIMATED MONTHLY" = ' + mrr.toLocaleString() + '  (sum of monthly over ' + active.length + ' active)');
console.log('It is built ONLY from these, in descending order:\n');
for (const t of active.filter((x) => (parseFloat(x.monthly) || 0) > 0).sort((a, b) => (parseFloat(b.monthly) || 0) - (parseFloat(a.monthly) || 0))) {
  const s = findIn(sheet, t.name);
  const monthly = parseFloat(t.monthly) || 0;
  const where = s ? s.section : 'NOT IN THE SHEET';
  const says = s ? (s.price || '(blank)') : '';
  // The sheet's own section says how the athlete is billed. An athlete the
  // sheet files under per-session but the app carries a monthly figure for is
  // the divergence worth his eye.
  const flag = !s ? 'NOT IN SHEET'
    : /חד/.test(s.section) ? 'sheet says PER SESSION (' + says + ')'
      : 'sheet says MONTHLY (' + says + ')';
  console.log('  ₪' + String(monthly).padEnd(6) + t.name.padEnd(20) + ' · app perSession ' + String(t.perSession ?? '—').padEnd(6) + ' · ' + flag);
}

console.log('\nIn the sheet but contributing NOTHING to the dashboard figure:');
for (const [k, s] of sheet) {
  const t = trainees.find((x) => norm(x.name) === k)
    || trainees.find((x) => alias(x.name) && alias(x.name) === alias(s.name))
    || trainees.find((x) => dist(norm(x.name), k) <= 2);
  if (!t) { console.log('  ' + s.name.padEnd(20) + ' · ' + s.section + ' · ' + s.price + '  — NOT IN THE APP AT ALL'); continue; }
  const monthly = parseFloat(t.monthly) || 0;
  if (monthly > 0 && t.status === 'Active') continue;
  console.log('  ' + s.name.padEnd(20) + ' · ' + s.section + ' · ' + (s.price || '(blank)') + '  — app: ' + t.status + ', monthly ' + (t.monthly ?? '—'));
}

// Values that cannot be right whatever the rule is.
console.log('\nImplausible values in the app:');
let odd = 0;
for (const t of active) {
  const m = parseFloat(t.monthly) || 0;
  const ps = parseFloat(t.perSession) || 0;
  if (m > 0 && m < 200) { odd++; console.log('  ' + t.name + ' · monthly ' + t.monthly + ' — below any single session price in the sheet'); }
  if (ps > 0 && ps < 50) { odd++; console.log('  ' + t.name + ' · perSession ' + t.perSession + ' — an order of magnitude under his cheapest rate'); }
}
if (!odd) console.log('  none');

console.log('\nNothing was written. The sheet cannot settle the ambiguous rows on its own:');
console.log('  couples carry TWO prices ("250/200") with no rule for which applies;');
console.log('  some rows are prepaid through a block, with no monthly value at all.');
