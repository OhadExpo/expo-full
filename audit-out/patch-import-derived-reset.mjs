// Attendance and rate-change rows are DERIVED and dated by revision windows
// that narrow as more revisions land, so yesterday's row for the same fact can
// sit on a different date than today's. Replace those two kinds wholesale on
// every import instead of upserting beside stale copies. Payments and start
// dates carry the sheet's own dates and stay keyed as they are.
import fs from 'node:fs';
const f = 'scripts/import-revenue-timeline.mjs';
let s = fs.readFileSync(f, 'utf8');
const a = "console.log(`events → ${await upsert('revenue_sheet_event', list, 'source,client_name,event_kind,event_date')} written${DRY ? ' (dry)' : ''}`);";
if (!s.includes(a)) throw new Error('anchor');
s = s.replace(a, `if (!DRY) {
  const { error: delErr } = await s.from('revenue_sheet_event').delete().eq('source', 'roster').in('event_kind', ['session', 'rate_change']);
  if (delErr) { console.log('could not clear derived rows:', delErr.message); process.exit(1); }
}
${a}`);
fs.writeFileSync(f, s);
console.log('patched');
