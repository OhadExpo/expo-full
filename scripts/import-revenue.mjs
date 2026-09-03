// PUT THE SHEET REVENUE INTO EXPO.
//
// Ohad: "i want everything available to retrack to be logged in expo" and
// "make sure it gets updated (the revenue on expo) twice a day forever".
//
// Reads the two parsed files and upserts them into revenue_sheet_event and
// revenue_month_total. Both tables are OWNER-ONLY. This deliberately does not
// write to bit_payment_requests: that table is athlete-readable, so importing
// reconstructed history into it would make rows appear in athletes' portals,
// and nothing here may touch what an athlete or a BHBC physio sees.
//
// Idempotent. Both tables have a natural unique key, so running twice - or
// twice a day forever - adds nothing and changes nothing.
//
//   node scripts/import-revenue.mjs [--dry]
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';

const DRY = process.argv.includes('--dry');
const HIST = 'audit-out/sheets/history.json';
const FIN = 'audit-out/sheets/finance.json';
const SHEET_ID = '18TdfofxAOd1d_EkOjbhYOBjWflqlfkAzY8sI52xJnOc';

const s = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co',
  'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv', { auth: { persistSession: false } });
const { error: authErr } = await s.auth.signInWithPassword({
  email: 'ohadyproductions@gmail.com', password: '1234' });
if (authErr) { console.log('AUTH FAILED:', authErr.message); process.exit(1); }

// ---------------------------------------------------------------- names ----
// Sheet names and EXPO names agree for most clients but not all, and a wrong
// link is worse than none: it would file one client's payments under another.
// So exact match first, then a spelling-tolerant match, then nothing.
const ALIAS = {
  // Written in English in EXPO, Hebrew in the sheet.
  'דיאגו דיי': 'Diego Day',
};
const strip = (x) => String(x || '').replace(/[֑-ׇ"'`.,\-]/g, '').replace(/\s+/g, ' ').trim();
function lev(a, b) {
  const m = a.length, n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

const { data: trRow } = await s.from('store').select('value').eq('key', 'expo-trainees').maybeSingle();
const trainees = (trRow?.value || []).filter(Boolean);
console.log(`trainees in EXPO: ${trainees.length}`);

// A couple's name gets re-ordered over the years - the same clients appear as
// "חיליק ומיה יניב" in 2024 and "מיה וחילק יניב" in 2026 - which no edit
// distance forgives. Sorting the words makes the two the same key.
const tokens = (x) => strip(x).replace(/(^|\s)ו/g, '$1').split(/\s+/).filter(Boolean).sort().join(' ');

function resolve(name) {
  const want = strip(ALIAS[name] || name);
  let exact = trainees.find((t) => strip(t.name) === want);
  if (exact) return { id: exact.id, how: 'exact' };
  const wt = tokens(ALIAS[name] || name);
  const reordered = trainees.find((t) => tokens(t.name) === wt);
  if (reordered) return { id: reordered.id, how: 'reordered' };
  // ONE character of spelling drift ("מיה וחילק" / "מיה וחיליק") is a match.
  // Two was tried and rejected: it linked "אעווד" - a fragment left by a
  // mid-edit revision, not a person - to a real trainee. Filing one client's
  // payments under another is the worst thing this script could do, so the
  // tolerance is one character and only on a name long enough for one
  // character to be a typo rather than the whole difference.
  let best = null;
  for (const t of trainees) {
    const d = lev(want, strip(t.name));
    if (d <= 1 && want.length >= 8 && (!best || d < best.d)) best = { d, t };
  }
  return best ? { id: best.t.id, how: `fuzzy(${best.d})` } : { id: null, how: 'unmatched' };
}

// ------------------------------------------------------------- roster ------
const events = [];
const nameReport = [];
if (fs.existsSync(HIST)) {
  const people = JSON.parse(fs.readFileSync(HIST, 'utf8'));
  for (const p of people) {
    // A revision caught mid-edit leaves half-typed names with no dates on
    // them. They carry nothing and can only mislead a name match.
    if (!p.payment_dates.length && !p.card_starts.length && !p.start_dates.length) continue;
    const r = resolve(p.name);
    nameReport.push({ name: p.name, ...r, dates: p.payment_dates.length + p.card_starts.length });
    const rateText = (p.prices_session[0] || p.prices_month[0] || '') || null;
    // A single clean number is a rate; a couple's "250/175" is two rates and
    // stays as text rather than being guessed at.
    const m = rateText && String(rateText).match(/^\s*(\d+(?:\.\d+)?)\s*(?:ש"ח|₪)?\s*$/);
    const rateAmount = m ? Number(m[1]) : null;
    const rateUnit = p.prices_month.length ? 'month' : (p.prices_session.length ? 'session' : null);
    const push = (kind, list) => {
      for (const d of list) {
        events.push({
          source: 'roster', sheet_id: SHEET_ID, client_name: p.name, trainee_id: r.id,
          section: p.sections[0] || null, event_kind: kind, event_date: d.date,
          rate_text: rateText, rate_amount: rateAmount, rate_unit: rateUnit,
          sessions_text: p.sessions_seen[0] || null, first_seen_rev: d.first_seen_rev,
        });
      }
    };
    push('payment_date', p.payment_dates);
    push('card_start', p.card_starts);
    for (const d of p.start_dates) {
      events.push({ source: 'roster', sheet_id: SHEET_ID, client_name: p.name, trainee_id: r.id,
        section: p.sections[0] || null, event_kind: 'start_date', event_date: d,
        rate_text: rateText, rate_amount: rateAmount, rate_unit: rateUnit,
        sessions_text: null, first_seen_rev: p.first_rev });
    }
  }
}
console.log(`roster events: ${events.length} from ${nameReport.length} people`);
const linked = nameReport.filter((n) => n.id).length;
console.log(`  linked to an EXPO trainee: ${linked}  |  historical / unmatched: ${nameReport.length - linked}`);
for (const n of nameReport.filter((x) => x.how !== 'exact').slice(0, 40)) {
  console.log(`   ${n.how.padEnd(12)} ${n.name}  (${n.dates} dated values)`);
}

// ------------------------------------------------------------ finance ------
const months = fs.existsSync(FIN) ? JSON.parse(fs.readFileSync(FIN, 'utf8')) : [];
console.log(`month totals: ${months.length}`);

if (DRY) { console.log('\n--dry: nothing written'); process.exit(0); }

// ------------------------------------------------------------- write -------
async function upsert(table, rows, conflict) {
  let n = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const { error } = await s.from(table).upsert(chunk, { onConflict: conflict, ignoreDuplicates: false });
    if (error) { console.log(`WRITE FAILED on ${table}: ${error.message}`); process.exit(1); }
    n += chunk.length;
  }
  return n;
}
if (events.length) console.log(`wrote ${await upsert('revenue_sheet_event', events, 'source,client_name,event_kind,event_date')} roster events`);
if (months.length) console.log(`wrote ${await upsert('revenue_month_total', months, 'month,channel')} month totals`);

// ------------------------------------------------------------ verify -------
// Read back rather than trusting the write.
const { count: ec } = await s.from('revenue_sheet_event').select('*', { count: 'exact', head: true });
const { count: mc } = await s.from('revenue_month_total').select('*', { count: 'exact', head: true });
console.log(`\nread back: revenue_sheet_event=${ec}  revenue_month_total=${mc}`);
const { data: recent } = await s.from('revenue_sheet_event')
  .select('client_name,event_kind,event_date,rate_text').eq('event_kind', 'payment_date')
  .order('event_date', { ascending: false }).limit(8);
for (const r of recent || []) console.log(`   ${r.event_date}  ${String(r.client_name).padEnd(18)} ${r.rate_text || ''}`);
