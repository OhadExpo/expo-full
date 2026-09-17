// The new pipeline owns the roster events end to end: derive emits each
// client's start date (kind start_date, same key shape the old importer used,
// so the rows merge), the importer writes it, and the old importer keeps only
// the finance months when the sync passes ROSTER_EVENTS=0.
import fs from 'node:fs';
const rep = (f, a, b, l) => { let s = fs.readFileSync(f, 'utf8'); const n = s.split(a).length - 1; if (n !== 1) throw new Error(l + ' x' + n); fs.writeFileSync(f, s.replace(a, b)); console.log('ok', l); };

rep('scripts/derive-payments.mjs',
  `  out.spans.push({ sections: c.sections, from_rev: c.first_rev, to_rev: c.last_rev, from: dateOf(c.first_iso), to: dateOf(c.last_iso) });`,
  `  out.spans.push({ sections: c.sections, from_rev: c.first_rev, to_rev: c.last_rev, from: dateOf(c.first_iso), to: dateOf(c.last_iso) });
  // ---- start dates: every distinct value the start cell ever held ----
  out.starts = (f.start || []).filter((r) => /^\\d{4}-\\d{2}-\\d{2}$/.test(r.value)).map((r) => ({ date: r.value, first_seen_rev: r.first_rev, seen_until_rev: r.last_rev }));`, 'derive starts');

rep('scripts/import-revenue-timeline.mjs',
  `  for (const r of c.rates) {`,
  `  for (const st of (c.starts || [])) {
    const rs = c.rates.find((r) => r.field === 'price_session' && r.from_rev <= st.first_seen_rev) || null;
    put({ ...base, event_kind: 'start_date', event_date: st.date, first_seen_rev: st.first_seen_rev, rev_lo: st.first_seen_rev, rev_hi: st.seen_until_rev,
      rate_text: rs ? rs.value : null, rate_amount: parseRateAmount(rs && rs.value), rate_unit: rs ? 'session' : null, amount_method: 'start', confidence: 'high', basis: 'start cell' });
  }
  for (const r of c.rates) {`, 'import starts');

rep('scripts/import-revenue.mjs',
  `if (events.length) console.log(`,
  `// Since 2026-09-13 the roster events come from import-revenue-timeline.mjs
// (every revision, every field); the sync passes ROSTER_EVENTS=0 so this writes
// only the finance months. Run by hand without it, it still writes both.
if (process.env.ROSTER_EVENTS === '0') events.length = 0;
if (events.length) console.log(`, 'old importer switch');

rep('scripts/sync-revenue.mjs',
  `run('node', ['scripts/import-revenue.mjs'], 'import');`,
  `run('node', ['scripts/import-revenue.mjs'], 'import', { ROSTER_EVENTS: '0' });`, 'sync passes switch');
